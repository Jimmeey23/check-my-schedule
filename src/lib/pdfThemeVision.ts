import * as pdfjsLib from 'pdfjs-dist';
import type { ClassData, PdfClassData, WeekSchedule } from '@/types/schedule';
import { normalizeClassName, normalizeThemeName, normalizeTime, normalizeTrainer } from './normalizers';

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

const MIN_THEME_CONFIDENCE = 0.75;
const DAY_NAME_PATTERN = /\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i;
type NormalizedThemeCandidate = {
  normalized: string;
  label: string;
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

export function collectThemeCandidates(csvData: { [day: string]: ClassData[] } | null | undefined): string[] {
  if (!csvData) return [];

  return Array.from(new Set(
    Object.values(csvData)
      .flat()
      .map(row => row.theme?.trim() || '')
      .filter(Boolean)
  ));
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

  const containedCandidates = candidates
    .filter(candidate => candidate.normalized && normalizedTheme.includes(candidate.normalized))
    .sort((a, b) => b.normalized.length - a.normalized.length);

  return containedCandidates[0]?.label ?? null;
}

export function mergeVisionThemesIntoPdfData(
  pdfData: PdfClassData[],
  matches: PdfThemeVisionMatch[],
  options: { minConfidence?: number; themeCandidates?: string[] } = {}
): PdfClassData[] {
  const minConfidence = options.minConfidence ?? MIN_THEME_CONFIDENCE;
  const normalizedCandidates = (options.themeCandidates ?? [])
      .map(candidate => candidate.trim())
      .filter(Boolean)
      .map(candidate => ({ normalized: normalizeThemeName(candidate), label: candidate }))
      .filter(candidate => candidate.normalized);
  const exactMatches = new Map<string, PdfThemeVisionMatch>();

  for (const match of matches) {
    if (!match.theme?.trim() || match.confidence < minConfidence) continue;

    const candidateTheme = canonicalizeThemeWithCandidates(match.theme, normalizedCandidates);
    if (!candidateTheme) continue;

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
    const currentExact = exactMatches.get(exactKey);

    if (!currentExact || match.confidence > currentExact.confidence) {
      exactMatches.set(exactKey, { ...match, theme: candidateTheme });
    }
  }

  return pdfData.map(row => {
    const existingTheme = canonicalizeThemeWithCandidates(row.theme, normalizedCandidates);
    if (existingTheme) return { ...row, theme: existingTheme };
    if (row.theme?.trim()) return { ...row, theme: undefined };

    const exactMatch = exactMatches.get(rowKey(row));
    if (exactMatch) {
      return { ...row, theme: exactMatch.theme.trim() };
    }

    return row;
  });
}

export function applyPdfDataThemesToSchedule(schedule: WeekSchedule, pdfData: PdfClassData[]): WeekSchedule {
  const themeByKey = new Map(
    pdfData
      .filter(row => row.theme?.trim())
      .map(row => [rowKey(row), row.theme?.trim() || ''])
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
        const theme = themeByKey.get(key);
        return theme ? { ...scheduleClass, theme } : scheduleClass;
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
