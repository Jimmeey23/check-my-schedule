import * as pdfjsLib from 'pdfjs-dist';
import type { ClassData, PdfClassData, WeekSchedule } from '@/types/schedule';
import { normalizeClassName, normalizeLocation, normalizeThemeName, normalizeTime, normalizeTrainer } from './normalizers';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

export interface PdfThemePageImage {
  pageIndex: number;
  width: number;
  height: number;
  imageDataUrl: string;
}

export interface PdfThemeVisionMatch {
  day: string;
  time: string;
  className: string;
  trainer: string;
  theme: string;
  confidence: number;
}

export interface PdfThemeVisionTargetRow extends PdfClassData {
  themeCandidates?: string[];
}

const MIN_THEME_CONFIDENCE = 0.75;
const DAY_NAME_PATTERN = /\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i;
type NormalizedThemeCandidate = {
  normalized: string;
  label: string;
};

type CanonicalThemeMatch = PdfThemeVisionMatch & {
  theme: string;
};

type ThemeMergeDecision = {
  row: string;
  exactKey: string;
  partialKey: string;
  action: 'kept-existing' | 'cleared-existing' | 'applied-exact' | 'applied-partial' | 'rejected' | 'unchanged';
  reason: string;
  existingTheme?: string;
  appliedTheme?: string;
  exactMatch?: string;
  partialMatches?: string[];
  pdfPartialCount?: number;
  csvPartialCount?: number;
};

type PdfThemeVisionMergeOptions = {
  minConfidence?: number;
  themeCandidates?: string[];
  csvData?: { [day: string]: ClassData[] } | null;
  debug?: boolean;
  debugLabel?: string;
};

type ThemeCandidateIndex = {
  hasCsvData: boolean;
  csvRows: ClassData[];
  themedCsvRows: ClassData[];
  csvRowKeyCounts: Map<string, number>;
  csvPartialKeyCounts: Map<string, number>;
  pdfPartialKeyCounts: Map<string, number>;
  candidatesByRowKey: Map<string, NormalizedThemeCandidate[]>;
  candidatesByPartialKey: Map<string, NormalizedThemeCandidate[]>;
};

function createCanvas(width: number, height: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function rowKey(row: Pick<PdfClassData, 'day' | 'time' | 'className' | 'trainer'>): string {
  return [
    row.day.trim().toLowerCase(),
    normalizeTime(row.time),
    normalizeClassName(row.className),
    normalizeTrainer(row.trainer),
  ].join('|');
}

function partialRowKey(row: Pick<PdfClassData, 'day' | 'time' | 'className'>): string {
  return [
    row.day.trim().toLowerCase(),
    normalizeTime(row.time),
    normalizeClassName(row.className),
  ].join('|');
}

function locationKey(location: string | undefined): string {
  const rawLocation = location?.trim() || '';
  return normalizeLocation(rawLocation) || rawLocation.toLowerCase();
}

function scopedRowKey(row: Pick<PdfClassData, 'day' | 'time' | 'className' | 'trainer' | 'location'>): string {
  return [
    locationKey(row.location),
    rowKey(row),
  ].join('|');
}

function scopedPartialRowKey(row: Pick<PdfClassData, 'day' | 'time' | 'className' | 'location'>): string {
  return [
    locationKey(row.location),
    partialRowKey(row),
  ].join('|');
}

function csvRowKey(row: ClassData): string {
  const effectiveTrainer = row.cover?.trim() || row.trainer1 || '';
  return rowKey({
    day: row.day,
    time: row.time || row.timeRaw,
    className: row.className,
    trainer: effectiveTrainer,
  });
}

function csvScopedRowKey(row: ClassData): string {
  const effectiveTrainer = row.cover?.trim() || row.trainer1 || '';
  return scopedRowKey({
    day: row.day,
    time: row.time || row.timeRaw,
    className: row.className,
    trainer: effectiveTrainer,
    location: row.location,
  });
}

function csvScopedPartialRowKey(row: ClassData): string {
  return scopedPartialRowKey({
    day: row.day,
    time: row.time || row.timeRaw,
    className: row.className,
    location: row.location,
  });
}

function incrementCount(counts: Map<string, number>, key: string) {
  if (!key) return;
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

function normalizeThemeCandidates(themeCandidates: string[]): NormalizedThemeCandidate[] {
  const candidatesByTheme = new Map<string, NormalizedThemeCandidate>();

  for (const candidate of themeCandidates) {
    const label = candidate.trim();
    const normalized = normalizeThemeName(label);
    if (!label || !normalized || candidatesByTheme.has(normalized)) continue;

    candidatesByTheme.set(normalized, { normalized, label });
  }

  return [...candidatesByTheme.values()];
}

function addThemeCandidate(
  candidatesByKey: Map<string, NormalizedThemeCandidate[]>,
  key: string,
  theme: string | undefined
) {
  const label = theme?.trim() || '';
  const normalized = normalizeThemeName(label);
  if (!key || !label || !normalized) return;

  const candidates = candidatesByKey.get(key) ?? [];
  if (candidates.some(candidate => candidate.normalized === normalized)) return;

  candidatesByKey.set(key, [...candidates, { normalized, label }]);
}

function buildThemeCandidateIndex(
  pdfData: PdfClassData[],
  csvData: { [day: string]: ClassData[] } | null | undefined
): ThemeCandidateIndex {
  const hasCsvData = csvData !== undefined && csvData !== null;
  const csvRows = Object.values(csvData ?? {}).flat();
  const themedCsvRows = csvRows.filter(row => row.theme?.trim());
  const csvRowKeyCounts = new Map<string, number>();
  const csvPartialKeyCounts = new Map<string, number>();
  const pdfPartialKeyCounts = new Map<string, number>();
  const candidatesByRowKey = new Map<string, NormalizedThemeCandidate[]>();
  const candidatesByPartialKey = new Map<string, NormalizedThemeCandidate[]>();

  themedCsvRows.forEach(row => {
    const exactKey = csvScopedRowKey(row);
    const partialKey = csvScopedPartialRowKey(row);

    incrementCount(csvRowKeyCounts, exactKey);
    incrementCount(csvPartialKeyCounts, partialKey);
    addThemeCandidate(candidatesByRowKey, exactKey, row.theme);
    addThemeCandidate(candidatesByPartialKey, partialKey, row.theme);
  });

  pdfData.forEach(row => incrementCount(pdfPartialKeyCounts, scopedPartialRowKey(row)));

  return {
    hasCsvData,
    csvRows,
    themedCsvRows,
    csvRowKeyCounts,
    csvPartialKeyCounts,
    pdfPartialKeyCounts,
    candidatesByRowKey,
    candidatesByPartialKey,
  };
}

function getRowThemeCandidates(row: PdfClassData, index: ThemeCandidateIndex): NormalizedThemeCandidate[] {
  if (!index.hasCsvData) return [];

  const exactKey = scopedRowKey(row);
  if ((index.csvRowKeyCounts.get(exactKey) ?? 0) === 1) {
    return index.candidatesByRowKey.get(exactKey) ?? [];
  }

  const partialKey = scopedPartialRowKey(row);
  if ((index.csvPartialKeyCounts.get(partialKey) ?? 0) === 1
    && (index.pdfPartialKeyCounts.get(partialKey) ?? 0) === 1) {
    return index.candidatesByPartialKey.get(partialKey) ?? [];
  }

  return [];
}

function isThemedCsvTarget(row: PdfClassData, index: ThemeCandidateIndex): boolean {
  if (!index.hasCsvData) return true;

  return getRowThemeCandidates(row, index).length > 0;
}

function canonicalizeThemeForRestriction(
  theme: string | undefined,
  candidateRestriction: NormalizedThemeCandidate[] | null
): string | null {
  if (candidateRestriction === null) return canonicalizeThemeWithCandidates(theme, []);
  if (candidateRestriction.length === 0) return null;

  return canonicalizeThemeWithCandidates(theme, candidateRestriction);
}

function chooseUnambiguousThemeMatch(
  matches: CanonicalThemeMatch[] | undefined,
  candidateRestriction: NormalizedThemeCandidate[] | null = null
): CanonicalThemeMatch | null {
  if (!matches || matches.length === 0) return null;

  const claimedThemes = new Set(
    matches
      .map(match => normalizeThemeName(match.theme))
      .filter(Boolean)
  );
  if (claimedThemes.size > 1) return null;

  const byTheme = new Map<string, CanonicalThemeMatch>();
  for (const match of matches) {
    const theme = canonicalizeThemeForRestriction(match.theme, candidateRestriction);
    const normalizedTheme = normalizeThemeName(theme || '');
    if (!normalizedTheme) continue;

    const current = byTheme.get(normalizedTheme);
    if (!current || match.confidence > current.confidence) {
      byTheme.set(normalizedTheme, { ...match, theme: theme || match.theme });
    }
  }

  return byTheme.size === 1 ? [...byTheme.values()][0] : null;
}

function describePdfRow(row: Pick<PdfClassData, 'day' | 'time' | 'className' | 'trainer' | 'theme'>): string {
  return `${row.day || '—'} ${row.time || '—'} | ${row.className || '—'} | ${row.trainer || '—'} | theme=${row.theme || '—'}`;
}

function describeMatch(match: Pick<PdfThemeVisionMatch, 'day' | 'time' | 'className' | 'trainer' | 'theme' | 'confidence'>): string {
  return `${match.day || '—'} ${match.time || '—'} | ${match.className || '—'} | ${match.trainer || '—'} | theme=${match.theme || '—'} | confidence=${match.confidence}`;
}

function logPdfThemeMergeDiagnostics(args: {
  label?: string;
  pdfData: PdfClassData[];
  matches: PdfThemeVisionMatch[];
  acceptedMatches: CanonicalThemeMatch[];
  rejectedMatches: Array<{ match: PdfThemeVisionMatch; reason: string }>;
  normalizedCandidates: NormalizedThemeCandidate[];
  csvRowCount: number;
  decisions: ThemeMergeDecision[];
}) {
  const groupTitle = `[PDF Theme Vision Merge] ${args.label || 'merge diagnostics'}`;
  const logSummary = () => {
    console.info('summary', {
      pdfRows: args.pdfData.length,
      pdfRowsWithThemeBeforeMerge: args.pdfData.filter(row => row.theme?.trim()).length,
      matchesReturned: args.matches.length,
      matchesAcceptedForMerge: args.acceptedMatches.length,
      matchesRejectedBeforeMerge: args.rejectedMatches.length,
      csvRowsAvailable: args.csvRowCount,
      themeCandidates: args.normalizedCandidates.map(candidate => candidate.label),
    });

    if (args.matches.length > 0) {
      console.table(args.matches.map(match => ({
        day: match.day,
        time: match.time,
        className: match.className,
        trainer: match.trainer || '—',
        theme: match.theme,
        confidence: match.confidence,
        exactKey: rowKey({
          day: match.day,
          time: match.time,
          className: match.className,
          trainer: match.trainer,
        }),
        partialKey: partialRowKey(match),
      })));
    }

    if (args.rejectedMatches.length > 0) {
      console.warn('matches rejected before row merge', args.rejectedMatches.map(item => ({
        match: describeMatch(item.match),
        reason: item.reason,
      })));
    }

    console.table(args.decisions);
  };

  if (typeof console.groupCollapsed === 'function') {
    console.groupCollapsed(groupTitle);
    logSummary();
    console.groupEnd();
    return;
  }

  console.info(groupTitle);
  logSummary();
}

export function collectThemeCandidates(csvData: { [day: string]: ClassData[] } | null | undefined): string[] {
  if (!csvData) return [];

  return normalizeThemeCandidates(
    Object.values(csvData)
      .flat()
      .map(row => row.theme?.trim() || '')
      .filter(Boolean)
  ).map(candidate => candidate.label);
}

export function collectThemeVisionTargetRows(
  pdfData: PdfClassData[],
  csvData: { [day: string]: ClassData[] } | null | undefined
): PdfThemeVisionTargetRow[] {
  if (!csvData) return pdfData;

  const candidateIndex = buildThemeCandidateIndex(pdfData, csvData);

  if (candidateIndex.themedCsvRows.length === 0) return [];

  return pdfData.flatMap(row => {
    const themeCandidates = getRowThemeCandidates(row, candidateIndex).map(candidate => candidate.label);
    if (themeCandidates.length === 0) return [];

    return [{ ...row, themeCandidates }];
  });
}

function canonicalizeThemeWithCandidates(
  theme: string | undefined,
  candidates: NormalizedThemeCandidate[]
): string | null {
  const rawTheme = theme?.trim() || '';
  if (!rawTheme) return null;
  if (DAY_NAME_PATTERN.test(rawTheme)) return null;

  const normalizedTheme = normalizeThemeName(rawTheme);
  if (!normalizedTheme) return null;

  if (candidates.length === 0) return rawTheme;

  const exactCandidate = candidates.find(candidate => candidate.normalized === normalizedTheme);
  if (exactCandidate) return exactCandidate.label;

  return null;
}

export function mergeVisionThemesIntoPdfData(
  pdfData: PdfClassData[],
  matches: PdfThemeVisionMatch[],
  options: PdfThemeVisionMergeOptions = {}
): PdfClassData[] {
  const minConfidence = options.minConfidence ?? MIN_THEME_CONFIDENCE;
  const normalizedCandidates = normalizeThemeCandidates(options.themeCandidates ?? []);
  const candidateIndex = buildThemeCandidateIndex(pdfData, options.csvData);
  const globalCandidateRestriction = normalizedCandidates.length > 0 ? normalizedCandidates : null;

  const exactMatches = new Map<string, CanonicalThemeMatch[]>();
  const partialMatches = new Map<string, CanonicalThemeMatch[]>();
  const acceptedMatches: CanonicalThemeMatch[] = [];
  const rejectedMatches: Array<{ match: PdfThemeVisionMatch; reason: string }> = [];

  for (const match of matches) {
    if (!match.theme?.trim()) {
      rejectedMatches.push({ match, reason: 'empty theme' });
      continue;
    }
    if (match.confidence < minConfidence) {
      rejectedMatches.push({ match, reason: `confidence ${match.confidence} is below ${minConfidence}` });
      continue;
    }

    const candidateTheme = canonicalizeThemeForRestriction(match.theme, globalCandidateRestriction);
    if (!candidateTheme) {
      rejectedMatches.push({
        match,
        reason: normalizedCandidates.length > 0
          ? 'theme did not exactly match any CSV theme candidate'
          : 'theme was blank or looked like a day header after normalization',
      });
      continue;
    }

    const asRow: PdfClassData = {
      day: match.day,
      time: match.time,
      className: match.className,
      trainer: match.trainer,
      location: '',
      theme: candidateTheme,
      uniqueKey: '',
    };
    const exactKey = rowKey(asRow);
    const partialKey = partialRowKey(asRow);
    const canonicalMatch: CanonicalThemeMatch = { ...match, theme: candidateTheme };

    acceptedMatches.push(canonicalMatch);
    exactMatches.set(exactKey, [
      ...(exactMatches.get(exactKey) || []),
      canonicalMatch,
    ]);
    partialMatches.set(partialKey, [
      ...(partialMatches.get(partialKey) || []),
      canonicalMatch,
    ]);
  }

  const decisions: ThemeMergeDecision[] = [];
  const enrichedData = pdfData.map(row => {
    const exactKey = rowKey(row);
    const rowPartialKey = partialRowKey(row);
    const decisionBase = {
      row: describePdfRow(row),
      exactKey,
      partialKey: rowPartialKey,
    };
    const rowThemeCandidates = getRowThemeCandidates(row, candidateIndex);
    const rowCandidateRestriction = candidateIndex.hasCsvData
      ? rowThemeCandidates
      : globalCandidateRestriction;
    const themedCsvTarget = isThemedCsvTarget(row, candidateIndex);
    const hasExistingRawTheme = Boolean(row.theme?.trim());
    const canVisualOverrideExistingTheme = !hasExistingRawTheme || normalizedCandidates.length > 0 || candidateIndex.hasCsvData;

    const exactMatchOptions = exactMatches.get(exactKey);
    const exactMatch = chooseUnambiguousThemeMatch(exactMatchOptions, rowCandidateRestriction);
    if (exactMatchOptions?.length && !exactMatch) {
      decisions.push({
        ...decisionBase,
        action: 'rejected',
        reason: candidateIndex.hasCsvData
          ? 'exact visual matches existed, but none resolved to one row-specific CSV theme candidate'
          : 'exact visual matches existed, but they did not resolve to one unambiguous normalized theme',
        partialMatches: exactMatchOptions.map(describeMatch),
      });
    }

    if (exactMatch && !themedCsvTarget) {
      decisions.push({
        ...decisionBase,
        action: 'rejected',
        reason: 'exact visual match exists, but this row has no themed CSV counterpart',
        exactMatch: describeMatch(exactMatch),
      });
    }

    if (exactMatch && themedCsvTarget && canVisualOverrideExistingTheme) {
      decisions.push({
        ...decisionBase,
        action: 'applied-exact',
        reason: row.theme?.trim()
          ? 'visual match exactly matched day, time, class, and trainer, overriding parsed PDF theme'
          : 'visual match exactly matched day, time, class, and trainer',
        existingTheme: row.theme,
        appliedTheme: exactMatch.theme.trim(),
        exactMatch: describeMatch(exactMatch),
      });
      return { ...row, theme: exactMatch.theme.trim() };
    }

    const scopedPartialKey = scopedPartialRowKey(row);
    const pdfPartialCount = candidateIndex.pdfPartialKeyCounts.get(scopedPartialKey) ?? 0;
    const csvPartialCount = candidateIndex.csvPartialKeyCounts.get(scopedPartialKey) ?? 0;
    const availablePartialMatches = partialMatches.get(rowPartialKey);
    const partialMatchDescriptions = availablePartialMatches?.map(describeMatch);
    const partialMatch = chooseUnambiguousThemeMatch(availablePartialMatches, rowCandidateRestriction);
    const canApplyPartialMatch = pdfPartialCount === 1 && (!candidateIndex.hasCsvData || csvPartialCount === 1);

    if (partialMatch && themedCsvTarget && canApplyPartialMatch && canVisualOverrideExistingTheme) {
      decisions.push({
        ...decisionBase,
        action: 'applied-partial',
        reason: row.theme?.trim()
          ? 'visual match omitted or differed on trainer, but day/time/class was unique in PDF and CSV, overriding parsed PDF theme'
          : 'visual match omitted or differed on trainer, but day/time/class was unique in PDF and CSV',
        existingTheme: row.theme,
        appliedTheme: partialMatch.theme.trim(),
        partialMatches: partialMatchDescriptions,
        pdfPartialCount,
        csvPartialCount,
      });
      return { ...row, theme: partialMatch.theme.trim() };
    }

    if (partialMatch && !themedCsvTarget) {
      decisions.push({
        ...decisionBase,
        action: 'rejected',
        reason: 'partial visual match exists, but this row has no themed CSV counterpart',
        partialMatches: partialMatchDescriptions,
        pdfPartialCount,
        csvPartialCount,
      });
    }

    const existingTheme = canonicalizeThemeForRestriction(row.theme, rowCandidateRestriction);
    if (existingTheme) {
      if (!themedCsvTarget) {
        decisions.push({
          ...decisionBase,
          action: 'cleared-existing',
          reason: 'existing parsed PDF theme matched a candidate, but this row has no themed CSV counterpart',
          existingTheme: row.theme,
        });
        return { ...row, theme: undefined };
      }

      decisions.push({
        ...decisionBase,
        action: 'kept-existing',
        reason: 'existing parsed PDF theme matched a CSV candidate and no visual match overrode it',
        existingTheme: row.theme,
        appliedTheme: existingTheme,
      });
      return { ...row, theme: existingTheme };
    }
    if (row.theme?.trim()) {
      decisions.push({
        ...decisionBase,
        action: 'cleared-existing',
        reason: 'existing parsed PDF theme did not match CSV candidates, so it was treated as polluted parser text',
        existingTheme: row.theme,
      });
      return { ...row, theme: undefined };
    }

    if (pdfPartialCount !== 1) {
      decisions.push({
        ...decisionBase,
        action: 'rejected',
        reason: `partial fallback blocked because ${pdfPartialCount} PDF rows share this day/time/class key`,
        partialMatches: partialMatchDescriptions,
        pdfPartialCount,
        csvPartialCount,
      });
      return row;
    }
    if (candidateIndex.hasCsvData && csvPartialCount !== 1) {
      decisions.push({
        ...decisionBase,
        action: 'rejected',
        reason: `partial fallback blocked because ${csvPartialCount} CSV rows share this day/time/class key`,
        partialMatches: partialMatchDescriptions,
        pdfPartialCount,
        csvPartialCount,
      });
      return row;
    }

    decisions.push({
      ...decisionBase,
      action: 'unchanged',
      reason: availablePartialMatches?.length
        ? 'partial visual matches existed, but they did not resolve to one unambiguous normalized theme'
        : 'no accepted visual match for this PDF row',
      partialMatches: partialMatchDescriptions,
      pdfPartialCount,
      csvPartialCount,
    });
    return row;
  });

  if (options.debug) {
    logPdfThemeMergeDiagnostics({
      label: options.debugLabel,
      pdfData,
      matches,
      acceptedMatches,
      rejectedMatches,
      normalizedCandidates,
      csvRowCount: candidateIndex.csvRows.length,
      decisions,
    });
  }

  return enrichedData;
}

export function applyPdfDataThemesToSchedule(schedule: WeekSchedule, pdfData: PdfClassData[]): WeekSchedule {
  const themeByKey = new Map(
    pdfData.map(row => [rowKey(row), row.theme?.trim() || ''])
  );

  return {
    ...schedule,
    days: schedule.days.map(day => ({
      ...day,
      classes: day.classes.map(scheduleClass => {
        const key = rowKey({
          day: day.day,
          time: scheduleClass.time,
          className: scheduleClass.className,
          trainer: scheduleClass.trainer,
        });
        if (!themeByKey.has(key)) return scheduleClass;

        const theme = themeByKey.get(key);
        if (theme) return { ...scheduleClass, theme };

        return { ...scheduleClass, theme: undefined };
      }),
    })),
  };
}

export async function renderPdfPagesForThemeVision(file: File): Promise<PdfThemePageImage[]> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: Uint8Array.from(new Uint8Array(arrayBuffer)) }).promise;
  const images: PdfThemePageImage[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(1.7, 1400 / Math.max(baseViewport.width, 1));
    const viewport = page.getViewport({ scale });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    if (!canvas) return [];

    const context = canvas.getContext('2d');
    if (!context) return [];

    await page.render({ canvasContext: context, viewport }).promise;

    images.push({
      pageIndex: pageNumber - 1,
      width: canvas.width,
      height: canvas.height,
      imageDataUrl: canvas.toDataURL('image/jpeg', 0.72),
    });
  }

  return images;
}
