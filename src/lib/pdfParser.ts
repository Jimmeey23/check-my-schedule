import * as pdfjsLib from 'pdfjs-dist';
import type { WeekSchedule, DaySchedule, ScheduleClass, PdfClassData } from '@/types/schedule';
import { classNameMappings, knownTeachers } from './normalizationMaps';
import { normalizeClassName, normalizeTrainer, normalizeTime, normalizeLocation, getClassLevel } from './normalizers';

type MappingEntry = {
  key: string;
  value: string;
  compactKey: string;
};

type TeacherEntry = {
  teacher: string;
  compactTeacher: string;
  compactFirstName: string;
};

const CLASS_MAPPING_ENTRIES: MappingEntry[] = Object.entries(classNameMappings)
  .map(([key, value]) => ({
    key,
    value,
    compactKey: compactText(key),
  }))
  .sort((a, b) => b.compactKey.length - a.compactKey.length);

const TEACHER_ENTRIES: TeacherEntry[] = knownTeachers.map(teacher => ({
  teacher,
  compactTeacher: compactText(teacher),
  compactFirstName: compactText(teacher.split(' ')[0] || ''),
}));

const THEME_MARKER_REGEX = /[⚡✨⭐🔥💥🎵🎶]\uFE0F?\s*/u;
const KNOWN_THEME_PATTERNS: Array<{ pattern: RegExp; value: string }> = [
  { pattern: /\bRAVE\s+RIDE\b/i, value: 'Rave Ride' },
  { pattern: /\bBOOGIE\s+RIDE\s+FT\.?\s+MJ\b/i, value: 'Boogie Ride ft MJ' },
  { pattern: /\bLENGTH\s*(?:&|AND)\s*STRENGTH\b/i, value: 'Length & Strength' },
  { pattern: /\bISO\s+CHALLENGE\b/i, value: 'ISO Challenge' },
  { pattern: /\bWEAR\s+BLUE\b/i, value: 'Wear Blue' },
  { pattern: /\bGLUTE\s+CAMP\b/i, value: 'Glute Camp' },
  { pattern: /\bTAYLOR\s+SWIFT\s+VS\s+SOMBER\b/i, value: 'Taylor Swift vs Somber' },
  { pattern: /\bDANCE\s+RECOVERY\b/i, value: 'Dance Recovery' },
  { pattern: /\bSEAN\s+PAUL\s+(?:&|AND)\s+FRIENDS\b/i, value: 'Sean Paul & Friends' },
];

// Set up worker from CDN
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

function compactText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function normalizeExtractedText(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\s+([),.;:!?%\]])/g, '$1')
    .replace(/(\(|\[|-)\s+/g, '$1')
    .trim();
}

function formatThemeText(text: string): string {
  const trimmed = normalizeExtractedText(
    text
      .replace(/[⚡✨⭐🔥💥🎵🎶]\uFE0F?/gu, ' ')
      .replace(/^[\s([{\],;:|–—-]+/, '')
      .replace(/[\s)\]}]+$/, '')
      .trim()
  );
  if (!trimmed) return '';

  for (const { pattern, value } of KNOWN_THEME_PATTERNS) {
    if (pattern.test(trimmed)) return value;
  }

  if (/[a-z]/.test(trimmed)) return trimmed;

  return trimmed
    .toLowerCase()
    .replace(/\bvs\b/g, 'vs')
    .replace(/\b[a-z]/g, char => char.toUpperCase());
}

function findKnownTheme(text: string): string | null {
  const cleaned = normalizeExtractedText(text);
  if (!cleaned) return null;

  for (const { pattern, value } of KNOWN_THEME_PATTERNS) {
    if (pattern.test(cleaned)) return value;
  }

  return null;
}

function extractTrailingTextAfterTrainer(text: string, trainer: string | null | undefined): string {
  if (!trainer) return '';

  const cleaned = normalizeExtractedText(text);
  const normalizedTrainer = normalizeTrainer(trainer);
  const variants = Array.from(
    new Set(
      [
        trainer,
        normalizedTrainer,
        normalizedTrainer.split(' ')[0] || '',
      ]
        .map(value => normalizeExtractedText(value))
        .filter(Boolean)
    )
  );

  const lower = cleaned.toLowerCase();
  let bestTrailing = '';

  for (const variant of variants) {
    const variantLower = variant.toLowerCase();
    const matchIndex = lower.lastIndexOf(variantLower);
    if (matchIndex < 0) continue;

    const trailing = normalizeExtractedText(cleaned.slice(matchIndex + variant.length));
    if (trailing.length > bestTrailing.length) {
      bestTrailing = trailing;
    }
  }

  return bestTrailing;
}

function isBracketedThemeText(text: string): boolean {
  const cleaned = normalizeExtractedText(text);
  return /^\(\s*[^)]+\s*\)$/.test(cleaned) || /^\[\s*[^\]]+\s*\]$/.test(cleaned);
}

function looksLikeTheme(text: string): boolean {
  const cleaned = formatThemeText(text);
  if (!cleaned) return false;
  if (!/[A-Za-z]/.test(cleaned)) return false;
  if (matchClassName(cleaned) || matchTrainer(cleaned)) return false;

  const words = cleaned.split(/\s+/).filter(Boolean);
  return words.length >= 2 || KNOWN_THEME_PATTERNS.some(({ value }) => value === cleaned);
}

function extractTheme(text: string, trainer: string | null | undefined): string | null {
  const cleaned = normalizeExtractedText(text);
  if (!cleaned) return null;

  const markerIndex = cleaned.search(THEME_MARKER_REGEX);
  if (markerIndex >= 0) {
    const themeAfterMarker = formatThemeText(cleaned.slice(markerIndex));
    return themeAfterMarker || null;
  }

  const knownTheme = !matchClassName(cleaned) && !matchTrainer(cleaned) ? findKnownTheme(cleaned) : null;
  if (knownTheme) return knownTheme;

  const trailingAfterTrainer = extractTrailingTextAfterTrainer(cleaned, trainer);
  if (isBracketedThemeText(trailingAfterTrainer) && looksLikeTheme(trailingAfterTrainer)) {
    return formatThemeText(trailingAfterTrainer);
  }

  return null;
}

function looksLikeThemeFragment(text: string): boolean {
  const cleaned = normalizeExtractedText(text);
  if (!cleaned) return false;
  if (TIME_PATTERN.test(cleaned) || INLINE_TIME_PATTERN.test(cleaned)) return false;
  if (DAY_PATTERNS.some(pattern => pattern.regex.test(cleaned) && cleaned.length < 30)) return false;
  if (matchClassName(cleaned) || matchTrainer(cleaned)) return false;
  if (THEME_MARKER_REGEX.test(cleaned)) return true;
  if (/^[()\s]+$/.test(cleaned)) return false;
  if (findKnownTheme(cleaned)) return true;
  return /^[([]?[A-Za-z&\s]+[)]?$/.test(cleaned) && cleaned.length <= 40;
}

function mergeThemeParts(...parts: Array<string | null | undefined>): string | null {
  const merged = parts
    .map(part => normalizeExtractedText(part || ''))
    .filter(Boolean)
    .join(' ');

  const formatted = formatThemeText(merged);
  return formatted || null;
}

function parseClassLine(
  line: string,
  continuationLine?: string
): Pick<ScheduleClass, 'time' | 'className' | 'trainer' | 'level' | 'theme'> | null {
  const inlineTime = line.match(TIME_PATTERN) || line.match(INLINE_TIME_PATTERN);
  if (!inlineTime) return null;

  const time = inlineTime[0].trim();
  const timeIndex = line.indexOf(inlineTime[0]);
  const rest = normalizeExtractedText(line.slice(timeIndex + inlineTime[0].length).trim());
  const combinedRest = continuationLine ? `${rest} ${normalizeExtractedText(continuationLine)}` : rest;

  let className: string | null = null;
  let trainer: string | null = null;

  const parts = rest.split(/\s{2,}|\t|[-–|]/);
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    if (!className) {
      className = matchClassName(trimmed);
      if (className) continue;
    }
    if (!trainer) {
      trainer = matchTrainer(trimmed);
      if (trainer) continue;
    }
  }

  className = chooseMoreSpecificClassName(className, matchClassName(rest));
  className = chooseMoreSpecificClassName(className, matchClassName(combinedRest));

  if (!className) {
    const words = rest.split(/\s+/);
    for (let w = 0; w < words.length && !className; w++) {
      for (let len = Math.min(5, words.length - w); len > 0; len--) {
        const candidate = words.slice(w, w + len).join(' ');
        className = matchClassName(candidate);
        if (className) break;
      }
    }
  }

  if (!className && continuationLine) {
    const words = combinedRest.split(/\s+/);
    for (let w = 0; w < words.length && !className; w++) {
      for (let len = Math.min(8, words.length - w); len > 0; len--) {
        const candidate = words.slice(w, w + len).join(' ');
        className = matchClassName(candidate);
        if (className) break;
      }
    }
  }

  if (!trainer) {
    const words = combinedRest.split(/\s+/);
    for (const word of words) {
      trainer = matchTrainer(word);
      if (trainer) break;
    }
  }

  if (!trainer && continuationLine) {
    trainer = matchTrainer(continuationLine);
  }

  if (!time || (!className && !trainer)) return null;

  const directTheme = extractTheme(rest, trainer);
  const continuationSuppliesRowDetail = Boolean(
    continuationLine && (
      (!matchTrainer(rest) && matchTrainer(continuationLine)) ||
      (!matchClassName(rest) && matchClassName(continuationLine))
    )
  );
  const continuationTheme = !directTheme && continuationSuppliesRowDetail
    ? extractTheme(combinedRest, trainer)
    : null;
  const normalizedName = className || rest;

  return {
    time,
    className: className || rest,
    trainer: trainer || 'TBD',
    level: getClassLevel(normalizedName),
    theme: directTheme || continuationTheme || undefined,
  };
}

function isPotentialContinuationLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (DAY_PATTERNS.some(p => p.regex.test(trimmed) && trimmed.length < 30)) return false;
  if (/^\d{1,2}([:.]\d{2})?\s*(AM|PM)/i.test(trimmed)) return false;
  return true;
}

function chooseMoreSpecificClassName(current: string | null, candidate: string | null): string | null {
  if (!candidate) return current;
  if (!current) return candidate;
  if (current === candidate) return current;

  const currentIsGenericStrength = current === 'Studio Strength Lab';
  const candidateIsSpecificStrength = /^Studio Strength Lab \(.+\)$/.test(candidate);
  if (currentIsGenericStrength && candidateIsSpecificStrength) return candidate;

  const currentIsGenericCycle = current === 'Studio PowerCycle';
  const candidateIsSpecificCycle = candidate === 'Studio PowerCycle Express';
  if (currentIsGenericCycle && candidateIsSpecificCycle) return candidate;

  return candidate.length > current.length ? candidate : current;
}

function shouldInsertSpace(previousText: string, nextText: string, gap: number, unitWidth: number): boolean {
  if (!previousText) return false;

  const prevChar = previousText.slice(-1);
  const nextChar = nextText.charAt(0);

  if (gap <= Math.max(0.8, unitWidth * 0.35)) return false;
  if (/^[),.;:!?%\]]$/.test(nextChar)) return false;
  if (/^(?:\(|\/|\[)$/.test(prevChar)) return false;

  return true;
}

function joinLineItems(items: TextItem[]): string {
  const sorted = [...items].sort((a, b) => a.x - b.x);
  let currentLine = '';
  let previousItem: TextItem | null = null;

  for (const item of sorted) {
    const text = item.str.trim();
    if (!text) continue;

    if (!previousItem) {
      currentLine = text;
      previousItem = item;
      continue;
    }

    const previousText = previousItem.str.trim();
    const gap = item.x - (previousItem.x + previousItem.width);
    const previousUnitWidth = previousItem.width / Math.max(previousText.length, 1);
    const currentUnitWidth = item.width / Math.max(text.length, 1);
    const unitWidth = Math.max(1.5, Math.min(8, Math.max(previousUnitWidth, currentUnitWidth)));

    currentLine += shouldInsertSpace(currentLine, text, gap, unitWidth) ? ` ${text}` : text;
    previousItem = item;
  }

  return normalizeExtractedText(currentLine);
}

/**
 * Check if a class name is valid (not a person name or invalid entry)
 */
function isValidClassName(className: string): boolean {
  if (!className || className.trim() === '') return false;
  
  const trimmed = className.trim().toLowerCase();
  
  const validClassPatterns = [
    'recovery', 'fit', 'hiit', 'barre', 'mat', 'cycle', 'sweat', 'foundations',
    'studio', 'express', 'hosted', 'cardio', 'strength', 'amped', 'power', 'blaze'
  ];
  
  // Check if contains any valid class patterns
  for (const pattern of validClassPatterns) {
    if (trimmed.includes(pattern)) {
      return true;
    }
  }
  
  const invalidNames = [
    'smita', 'parekh', 'anandita', 'taarika', 'sakshi', 'anand', 'anandi', 
    'host', 'cover', 'replacement'
  ];
  
  // Check if it's an invalid name
  for (const invalid of invalidNames) {
    if (trimmed.includes(invalid)) {
      return false;
    }
  }
  
  return trimmed.length > 2; // Must be at least 3 characters
}

interface TextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PositionedLine {
  text: string;
  items: TextItem[];
  x: number;
  y: number;
  width: number;
  height: number;
  pageIndex: number;
}

interface TextCluster {
  text: string;
  items: TextItem[];
  x: number;
  y: number;
  width: number;
  height: number;
}

interface RenderedPageSample {
  width: number;
  height: number;
  imageData: ImageData;
}

interface RGBColor {
  r: number;
  g: number;
  b: number;
}

interface ThemeLegendEntry {
  theme: string;
  color: RGBColor;
}

export interface PdfTemplateRect {
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PdfTemplateRow {
  day: string;
  pageIndex: number;
  rowIndex: number;
  sourceTime: string;
  sourceClassName: string;
  sourceTrainer: string;
  timeRect: PdfTemplateRect;
  classRect: PdfTemplateRect;
  trainerRect: PdfTemplateRect | null;
}

export interface PdfTemplateLayout {
  pageCount: number;
  rowsByDay: Record<string, PdfTemplateRow[]>;
}

const DAYS_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAY_PATTERNS = DAYS_ORDER.map(d => ({
  day: d,
  regex: new RegExp(`\\b${d}\\b`, 'i'),
}));
const TIME_PATTERN = /^(\d{1,2}[:.]\d{2}\s*(AM|PM)|\d{1,2}\s*(AM|PM))/i;
const INLINE_TIME_PATTERN = /(\d{1,2}[:.]\d{2}\s*(AM|PM)|\d{1,2}\s*(AM|PM))/i;

// =====================================================================
// TEXT EXTRACTION
// =====================================================================

async function extractTextItemsFromArrayBuffer(arrayBuffer: ArrayBuffer): Promise<TextItem[][]> {
  const pdf = await pdfjsLib.getDocument({ data: Uint8Array.from(new Uint8Array(arrayBuffer)) }).promise;
  const allPages: TextItem[][] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const rawItems = textContent.items as Array<{
      str?: string;
      transform?: number[];
      width?: number;
      height?: number;
    }>;

    const items: TextItem[] = rawItems
      .filter(
        (item): item is { str: string; transform: number[]; width?: number; height?: number } =>
          typeof item.str === 'string' &&
          item.str.trim().length > 0 &&
          Array.isArray(item.transform) &&
          item.transform.length >= 6
      )
      .map(item => ({
        str: item.str,
        x: Math.round(item.transform[4] * 100) / 100,
        y: Math.round(item.transform[5] * 100) / 100,
        width: item.width || 0,
        height: item.height || 0,
      }));
    allPages.push(items);
  }

  return allPages;
}

async function extractTextItems(file: File): Promise<TextItem[][]> {
  return extractTextItemsFromArrayBuffer(await file.arrayBuffer());
}

// =====================================================================
// LINE GROUPING
// =====================================================================

function groupIntoLines(items: TextItem[], yTolerance = 3): string[] {
  if (items.length === 0) return [];

  const sorted = [...items].sort((a, b) => {
    const yDiff = b.y - a.y;
    if (Math.abs(yDiff) > yTolerance) return yDiff;
    return a.x - b.x;
  });

  const lines: TextItem[][] = [];
  let currentY = sorted[0].y;
  let currentLine: TextItem[] = [];

  for (const item of sorted) {
    if (Math.abs(item.y - currentY) > yTolerance) {
      if (currentLine.length > 0) lines.push([...currentLine]);
      currentLine = [];
      currentY = item.y;
    }
    currentLine.push(item);
  }
  if (currentLine.length > 0) lines.push([...currentLine]);

  return lines.map(joinLineItems).filter(Boolean);
}

function groupIntoPositionedLines(items: TextItem[], pageIndex: number, yTolerance = 3): PositionedLine[] {
  if (items.length === 0) return [];

  const sorted = [...items].sort((a, b) => {
    const yDiff = b.y - a.y;
    if (Math.abs(yDiff) > yTolerance) return yDiff;
    return a.x - b.x;
  });

  const groups: TextItem[][] = [];
  let currentY = sorted[0].y;
  let currentLine: TextItem[] = [];

  for (const item of sorted) {
    if (Math.abs(item.y - currentY) > yTolerance) {
      if (currentLine.length > 0) groups.push([...currentLine]);
      currentLine = [];
      currentY = item.y;
    }
    currentLine.push(item);
  }

  if (currentLine.length > 0) groups.push([...currentLine]);

  return groups
    .map(lineItems => {
      const sortedItems = [...lineItems].sort((a, b) => a.x - b.x);
      const text = joinLineItems(sortedItems);
      if (!text) return null;

      const minX = Math.min(...sortedItems.map(item => item.x));
      const maxX = Math.max(...sortedItems.map(item => item.x + item.width));
      const maxHeight = Math.max(...sortedItems.map(item => item.height || 0), 10);

      return {
        text,
        items: sortedItems,
        x: minX,
        y: sortedItems[0].y,
        width: Math.max(maxX - minX, 1),
        height: maxHeight,
        pageIndex,
      } satisfies PositionedLine;
    })
    .filter((line): line is PositionedLine => Boolean(line));
}

function clusterLineItems(items: TextItem[]): TextCluster[] {
  if (items.length === 0) return [];

  const sorted = [...items].sort((a, b) => a.x - b.x);
  const clusters: TextItem[][] = [];
  let currentCluster: TextItem[] = [sorted[0]];

  for (let index = 1; index < sorted.length; index++) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    const previousText = previous.str.trim();
    const currentText = current.str.trim();
    const previousUnitWidth = previous.width / Math.max(previousText.length, 1);
    const currentUnitWidth = current.width / Math.max(currentText.length, 1);
    const gap = current.x - (previous.x + previous.width);
    const threshold = Math.max(6, Math.max(previousUnitWidth, currentUnitWidth) * 1.2);

    if (gap > threshold) {
      clusters.push(currentCluster);
      currentCluster = [current];
    } else {
      currentCluster.push(current);
    }
  }

  clusters.push(currentCluster);

  return clusters.map(clusterItems => {
    const text = joinLineItems(clusterItems);
    const minX = Math.min(...clusterItems.map(item => item.x));
    const maxX = Math.max(...clusterItems.map(item => item.x + item.width));
    const minY = Math.min(...clusterItems.map(item => item.y));
    const maxY = Math.max(...clusterItems.map(item => item.y + item.height));

    return {
      text,
      items: clusterItems,
      x: minX,
      y: minY,
      width: Math.max(maxX - minX, 1),
      height: Math.max(maxY - minY, 1),
    } satisfies TextCluster;
  });
}

function rectFromItems(items: TextItem[], pageIndex: number, padding = 1): PdfTemplateRect | null {
  if (items.length === 0) return null;

  const minX = Math.min(...items.map(item => item.x));
  const maxX = Math.max(...items.map(item => item.x + item.width));
  const minY = Math.min(...items.map(item => item.y));
  const maxY = Math.max(...items.map(item => item.y + item.height));

  return {
    pageIndex,
    x: Math.max(minX - padding, 0),
    y: Math.max(minY - padding, 0),
    width: Math.max(maxX - minX + padding * 2, 1),
    height: Math.max(maxY - minY + padding * 2, 1),
  };
}

function rectFromClusters(clusters: TextCluster[], pageIndex: number, padding = 1): PdfTemplateRect | null {
  return rectFromItems(clusters.flatMap(cluster => cluster.items), pageIndex, padding);
}

function findClusterIndex(clusters: TextCluster[], predicate: (cluster: TextCluster) => boolean): number {
  return clusters.findIndex(cluster => predicate(cluster));
}

function findTimeInLine(text: string): RegExpMatchArray | null {
  return text.match(TIME_PATTERN) || text.match(INLINE_TIME_PATTERN);
}

function splitRectHorizontally(rect: PdfTemplateRect, ratio: number): [PdfTemplateRect, PdfTemplateRect] {
  const leftWidth = Math.max(Math.floor(rect.width * ratio), 1);
  const rightWidth = Math.max(rect.width - leftWidth, 1);

  return [
    { ...rect, width: leftWidth },
    { ...rect, x: rect.x + leftWidth, width: rightWidth },
  ];
}

function buildTemplateRowFromLine(
  day: string,
  rowIndex: number,
  line: PositionedLine,
  continuationLine?: PositionedLine
): PdfTemplateRow | null {
  const timeMatch = findTimeInLine(line.text);
  if (!timeMatch) return null;

  const time = timeMatch[0].trim();
  const timeIndex = line.text.indexOf(timeMatch[0]);
  const rest = normalizeExtractedText(line.text.slice(timeIndex + timeMatch[0].length).trim());
  const continuationText = continuationLine ? normalizeExtractedText(continuationLine.text) : '';
  const combinedRest = continuationText ? `${rest} ${continuationText}` : rest;
  const className = chooseMoreSpecificClassName(matchClassName(rest), matchClassName(combinedRest)) || rest;
  const trainer = matchTrainer(combinedRest) || matchTrainer(rest) || '';

  if (!className && !trainer) return null;

  const clusters = clusterLineItems(line.items);
  if (clusters.length === 0) return null;

  const timeClusterIndex = Math.max(0, findClusterIndex(clusters, cluster => TIME_PATTERN.test(cluster.text)));
  const trainerClusterIndex = findClusterIndex(clusters, cluster => Boolean(matchTrainer(cluster.text)));
  const classClusterIndex = findClusterIndex(clusters, cluster => Boolean(matchClassName(cluster.text)));

  const timeRect = rectFromClusters([clusters[timeClusterIndex] ?? clusters[0]], line.pageIndex, 2);
  if (!timeRect) return null;

  let classClusters = clusters.slice(Math.min(timeClusterIndex + 1, clusters.length));
  let trainerRect: PdfTemplateRect | null = null;

  if (trainerClusterIndex >= 0) {
    trainerRect = rectFromClusters([clusters[trainerClusterIndex]], line.pageIndex, 2);
    const classEnd = trainerClusterIndex > timeClusterIndex ? trainerClusterIndex : clusters.length;
    classClusters = clusters.slice(Math.min(timeClusterIndex + 1, classEnd));
  }

  if (classClusterIndex >= 0 && classClusterIndex > timeClusterIndex && (trainerClusterIndex < 0 || classClusterIndex < trainerClusterIndex)) {
    const fallbackEnd = trainerClusterIndex > classClusterIndex ? trainerClusterIndex : clusters.length;
    classClusters = clusters.slice(classClusterIndex, fallbackEnd);
  }

  if (continuationLine) {
    const continuationClusters = clusterLineItems(continuationLine.items).filter(cluster => cluster.text.trim().length > 0);
    classClusters = [...classClusters, ...continuationClusters];
  }

  let classRect = rectFromClusters(classClusters, line.pageIndex, 2);
  if (!classRect) {
    const remainingRect = rectFromItems(line.items.filter(item => item.x >= timeRect.x + timeRect.width - 2), line.pageIndex, 2);
    if (remainingRect) {
      if (trainerRect) {
        const maxWidth = Math.max(trainerRect.x - remainingRect.x - 4, Math.floor(remainingRect.width * 0.65));
        classRect = { ...remainingRect, width: Math.max(maxWidth, 1) };
      } else {
        const [nextClassRect, nextTrainerRect] = splitRectHorizontally(remainingRect, 0.7);
        classRect = nextClassRect;
        trainerRect = nextTrainerRect;
      }
    }
  }

  if (!trainerRect && classRect) {
    const [nextClassRect, nextTrainerRect] = splitRectHorizontally(classRect, 0.72);
    classRect = nextClassRect;
    trainerRect = nextTrainerRect;
  }

  if (!classRect) return null;

  return {
    day,
    pageIndex: line.pageIndex,
    rowIndex,
    sourceTime: time,
    sourceClassName: className,
    sourceTrainer: trainer,
    timeRect,
    classRect,
    trainerRect,
  };
}

function extractTemplateRowsFromDayLines(lines: PositionedLine[], day: string): PdfTemplateRow[] {
  const rows: PdfTemplateRow[] = [];

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const trimmed = line.text.trim();
    if (!trimmed) continue;
    if (DAY_PATTERNS.some(pattern => pattern.regex.test(trimmed) && trimmed.length < 30)) continue;
    if (!findTimeInLine(trimmed)) continue;

    const continuationLine = isPotentialContinuationLine(lines[index + 1]?.text || '') ? lines[index + 1] : undefined;
    const row = buildTemplateRowFromLine(day, rows.length, line, continuationLine);

    if (row) {
      rows.push(row);
      if (continuationLine) index += 1;
    }
  }

  return rows;
}

function appendTemplateRows(target: Record<string, PdfTemplateRow[]>, rows: PdfTemplateRow[]) {
  for (const row of rows) {
    if (!target[row.day]) target[row.day] = [];
    target[row.day].push({
      ...row,
      rowIndex: target[row.day].length,
    });
  }
}

function extractTemplateRowsFromColumnarPage(items: TextItem[], pageIndex: number): PdfTemplateRow[] {
  const headers = findDayHeaders(items);
  if (headers.length < 2) return [];

  const headerRows = groupHeadersByRow(headers);
  if (!headerRows.some(row => row.length >= 2)) return [];

  const pageMinY = Math.min(...items.map(item => item.y));
  const regions = buildDayRegions(headerRows, pageMinY);
  const regionItems = assignItemsToRegions(items, regions);
  const rows: PdfTemplateRow[] = [];

  for (const region of regions) {
    const dayItems = regionItems.get(region.day) || [];
    if (!dayItems.length) continue;

    const dayLines = groupIntoPositionedLines(dayItems, pageIndex);
    rows.push(...extractTemplateRowsFromDayLines(dayLines, region.day));
  }

  return rows;
}

function extractTemplateRowsFromLinearPage(items: TextItem[], pageIndex: number): PdfTemplateRow[] {
  const lines = groupIntoPositionedLines(items, pageIndex);
  const rows: PdfTemplateRow[] = [];
  let currentDay: string | null = null;
  let currentLines: PositionedLine[] = [];

  for (const line of lines) {
    let foundDay: string | null = null;
    for (const { day, regex } of DAY_PATTERNS) {
      if (regex.test(line.text) && line.text.trim().length < 30) {
        foundDay = day;
        break;
      }
    }

    if (foundDay) {
      if (currentDay && currentLines.length > 0) {
        rows.push(...extractTemplateRowsFromDayLines(currentLines, currentDay));
      }
      currentDay = foundDay;
      currentLines = [];
    } else if (currentDay) {
      currentLines.push(line);
    }
  }

  if (currentDay && currentLines.length > 0) {
    rows.push(...extractTemplateRowsFromDayLines(currentLines, currentDay));
  }

  return rows;
}

function buildTemplateLayoutFromPages(pages: TextItem[][]): PdfTemplateLayout {
  const rowsByDay: Record<string, PdfTemplateRow[]> = {};

  pages.forEach((pageItems, pageIndex) => {
    const columnarRows = extractTemplateRowsFromColumnarPage(pageItems, pageIndex);
    if (columnarRows.length > 0) {
      appendTemplateRows(rowsByDay, columnarRows);
      return;
    }

    appendTemplateRows(rowsByDay, extractTemplateRowsFromLinearPage(pageItems, pageIndex));
  });

  for (const day of Object.keys(rowsByDay)) {
    rowsByDay[day].sort((a, b) => {
      if (a.pageIndex !== b.pageIndex) return a.pageIndex - b.pageIndex;
      return b.timeRect.y - a.timeRect.y;
    });
    rowsByDay[day] = rowsByDay[day].map((row, index) => ({ ...row, rowIndex: index }));
  }

  return {
    pageCount: pages.length,
    rowsByDay,
  };
}

export async function extractPdfTemplateLayout(file: File): Promise<PdfTemplateLayout> {
  return buildTemplateLayoutFromPages(await extractTextItems(file));
}

export async function extractPdfTemplateLayoutFromArrayBuffer(arrayBuffer: ArrayBuffer): Promise<PdfTemplateLayout> {
  return buildTemplateLayoutFromPages(await extractTextItemsFromArrayBuffer(arrayBuffer));
}

export async function extractPdfTemplateLayoutFromUrl(url: string): Promise<PdfTemplateLayout> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load original PDF template (${response.status})`);
  }

  return extractPdfTemplateLayoutFromArrayBuffer(await response.arrayBuffer());
}

// =====================================================================
// DETECTION HELPERS
// =====================================================================

function detectLocation(items: TextItem[]): string {
  const allText = items.map(i => i.str).join(' ').toUpperCase();

  const locationKeywords: Record<string, string> = {
    'KEMPS': 'Kwality House, Kemps Corner',
    'KWALITY': 'Kwality House, Kemps Corner',
    'BANDRA': 'Supreme HQ, Bandra',
    'SUPREME': 'Supreme HQ, Bandra',
    'KENKERE': 'Kenkere House',
    'ANNEX': 'Kenkere House',
    'WILLINGDON': 'South United Football Club',
    'SOUTH UNITED': 'South United Football Club',
    'WELLINGDON': 'The Wellingdon Club',
    'COURTSIDE': 'Courtside',
    'COPPER': 'The Studio by Copper + Cloves',
    'WEWORK GALAXY': 'WeWork Galaxy',
    'WEWORK PRESTIGE': 'WeWork Prestige Central',
    'OUTDOOR': 'Physique Outdoor Pop-up',
  };

  for (const [keyword, location] of Object.entries(locationKeywords)) {
    if (allText.includes(keyword)) return location;
  }

  return 'Unknown Location';
}

function detectDateRange(lines: string[]): { weekStart: string; weekEnd: string } {
  const text = lines.slice(0, 15).join(' ');

  const rangeMatch = text.match(/(\d{1,2}\s+\w+\s+\d{4})\s*[-–to]+\s*(\d{1,2}\s+\w+\s+\d{4})/i);
  if (rangeMatch) return { weekStart: rangeMatch[1], weekEnd: rangeMatch[2] };

  const altMatch = text.match(/(\w+\s+\d{1,2})\s*[-–to]+\s*(\w+\s+\d{1,2}),?\s*(\d{4})/i);
  if (altMatch) return { weekStart: `${altMatch[1]} ${altMatch[3]}`, weekEnd: `${altMatch[2]} ${altMatch[3]}` };

  return { weekStart: '', weekEnd: '' };
}

// =====================================================================
// CLASS MATCHING HELPERS
// =====================================================================

function matchClassName(text: string): string | null {
  const cleaned = normalizeExtractedText(text);
  if (!cleaned) return null;

  const normalized = normalizeClassName(cleaned);
  if (normalized.startsWith('Studio ')) return normalized;

  const upper = cleaned.toUpperCase();
  const compact = compactText(cleaned);

  for (const entry of CLASS_MAPPING_ENTRIES) {
    const keyUpper = entry.key.toUpperCase();
    const isShortAlias = entry.compactKey.length <= 2;
    const matches = isShortAlias
      ? upper === keyUpper || compact === entry.compactKey
      : upper.includes(keyUpper) || compact.includes(entry.compactKey);

    if (matches) {
      return entry.value;
    }
  }

  return null;
}

function matchTrainer(text: string): string | null {
  const cleaned = normalizeExtractedText(text);
  if (!cleaned) return null;

  const normalized = normalizeTrainer(cleaned);
  if (knownTeachers.includes(normalized)) return normalized;

  const lower = cleaned.toLowerCase();
  const compact = compactText(cleaned);

  for (const entry of TEACHER_ENTRIES) {
    const firstName = entry.teacher.split(' ')[0];
    if (
      firstName.length >= 3 &&
      (lower.includes(firstName.toLowerCase()) ||
        compact.includes(entry.compactFirstName) ||
        entry.compactTeacher.startsWith(compact))
    ) {
      return entry.teacher;
    }
  }

  return null;
}

// =====================================================================
// CLASS EXTRACTION FROM LINES
// =====================================================================

function parseDayClasses(lines: string[], dayIndex: number): ScheduleClass[] {
  const classes: ScheduleClass[] = [];
  let classCounter = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Skip day headers
    if (DAY_PATTERNS.some(p => p.regex.test(line) && line.length < 30)) continue;

    if (!findTimeInLine(line)) continue;

    const rawContinuation = isPotentialContinuationLine(lines[i + 1] || '') ? normalizeExtractedText(lines[i + 1]) : '';
    const previewWithoutContinuation = parseClassLine(line);
    const shouldConsumeContinuation = Boolean(
      rawContinuation && (
        !previewWithoutContinuation ||
        previewWithoutContinuation.trainer === 'TBD' ||
        !previewWithoutContinuation.className
      )
    );

    const parsed = parseClassLine(
      line,
      shouldConsumeContinuation ? rawContinuation : undefined
    );

    if (parsed) {
      classes.push({
        id: `pdf-${dayIndex}-${classCounter++}`,
        ...parsed,
      });
      if (shouldConsumeContinuation) {
        i += 1;
      }
    }
  }

  return classes;
}

function isDayHeaderText(text: string): boolean {
  const trimmed = text.trim();
  return DAY_PATTERNS.some(pattern => pattern.regex.test(trimmed) && trimmed.length < 30);
}

function containsDayHeaderText(text: string): boolean {
  const trimmed = normalizeExtractedText(text);
  if (!trimmed) return false;
  return DAY_PATTERNS.some(pattern => pattern.regex.test(trimmed));
}

function parseDayClassesFromPositionedItems(items: TextItem[], dayIndex: number): ScheduleClass[] {
  const scheduleItems = items.filter(item => {
    const text = item.str.trim();
    return text && !isDayHeaderText(text);
  });

  const timeAnchors = scheduleItems
    .filter(item => TIME_PATTERN.test(item.str.trim()))
    .sort((a, b) => b.y - a.y || a.x - b.x);

  const classes: ScheduleClass[] = [];
  let classCounter = 0;

  for (const anchor of timeAnchors) {
    const anchorText = anchor.str.trim();
    const rowTolerance = Math.max(6, Math.min(9, (anchor.height || 10) * 0.8));
    const rowItems = scheduleItems
      .filter(item => Math.abs(item.y - anchor.y) <= rowTolerance)
      .sort((a, b) => a.x - b.x);
    const line = joinLineItems(rowItems);
    const parsed = parseClassLine(line);

    if (!parsed) continue;

    classes.push({
      id: `pdf-${dayIndex}-${classCounter++}`,
      ...parsed,
      time: anchorText,
    });
  }

  return classes;
}

function scoreParsedClasses(classes: ScheduleClass[]): number {
  return classes.reduce((score, scheduleClass) => {
    const hasSpecificStrengthVariant = /^Studio Strength Lab \(.+\)$/.test(scheduleClass.className);
    return score +
      10 +
      (scheduleClass.className ? 3 : 0) +
      (hasSpecificStrengthVariant ? 3 : 0) +
      (scheduleClass.trainer && scheduleClass.trainer !== 'TBD' ? 3 : 0) +
      (scheduleClass.theme ? 1 : 0);
  }, 0);
}

function chooseBestParsedClasses(positionedClasses: ScheduleClass[], lineClasses: ScheduleClass[]): ScheduleClass[] {
  if (positionedClasses.length > lineClasses.length) return positionedClasses;
  if (lineClasses.length > positionedClasses.length) return lineClasses;

  return scoreParsedClasses(positionedClasses) >= scoreParsedClasses(lineClasses)
    ? positionedClasses
    : lineClasses;
}

// =====================================================================
// COLUMNAR LAYOUT DETECTION AND PARSING
// =====================================================================

interface DayHeader {
  day: string;
  x: number;
  y: number;
  width: number;
}

interface DayRegion {
  day: string;
  xMin: number;
  xMax: number;
  yMin: number; // bottom boundary (lower Y in PDF coords)
  yMax: number; // top boundary (header Y)
}

/**
 * Find all day headers in a page's text items
 */
function findDayHeaders(items: TextItem[]): DayHeader[] {
  const headers: DayHeader[] = [];

  for (const item of items) {
    const text = item.str.trim();
    for (const { day, regex } of DAY_PATTERNS) {
      if (regex.test(text) && text.length < 30) {
        headers.push({ day, x: item.x, y: item.y, width: item.width || 50 });
        break;
      }
    }
  }

  return headers;
}

/**
 * Group day headers into horizontal rows (headers at similar Y positions)
 */
function groupHeadersByRow(headers: DayHeader[]): DayHeader[][] {
  if (headers.length === 0) return [];

  // Sort by Y descending (top of page first in PDF coords)
  const sorted = [...headers].sort((a, b) => b.y - a.y);
  const rows: DayHeader[][] = [];
  let currentRow: DayHeader[] = [sorted[0]];
  let currentY = sorted[0].y;

  for (let i = 1; i < sorted.length; i++) {
    if (Math.abs(sorted[i].y - currentY) < 15) {
      // Same row
      currentRow.push(sorted[i]);
    } else {
      // New row
      rows.push(currentRow.sort((a, b) => a.x - b.x)); // sort row left to right
      currentRow = [sorted[i]];
      currentY = sorted[i].y;
    }
  }
  rows.push(currentRow.sort((a, b) => a.x - b.x));

  return rows;
}

/**
 * Build regions: each day gets a rectangular zone (x range × y range)
 * where its class data lives.
 */
function buildDayRegions(headerRows: DayHeader[][], pageMinY: number): DayRegion[] {
  const regions: DayRegion[] = [];

  for (let rowIdx = 0; rowIdx < headerRows.length; rowIdx++) {
    const row = headerRows[rowIdx];
    const headerY = row[0].y; // Y of this row's headers

    // Y bottom boundary: either next row's header Y, or the page bottom
    let yBottom: number;
    if (rowIdx + 1 < headerRows.length) {
      // Stop just above the next row's header Y (with some margin)
      yBottom = headerRows[rowIdx + 1][0].y + 15;
    } else {
      yBottom = pageMinY - 10;
    }

    // Build X boundaries for each day in this row
    for (let colIdx = 0; colIdx < row.length; colIdx++) {
      const header = row[colIdx];
      const xMin = header.x - 5;
      const xMax = colIdx + 1 < row.length
        ? row[colIdx + 1].x - 5
        : Infinity; // last column extends to right edge

      regions.push({
        day: header.day,
        xMin,
        xMax,
        yMin: yBottom,
        yMax: headerY + 5, // slightly above header
      });
    }
  }

  return regions;
}

/**
 * Assign text items to their correct day region
 */
function assignItemsToRegions(items: TextItem[], regions: DayRegion[]): Map<string, TextItem[]> {
  const result = new Map<string, TextItem[]>();
  for (const r of regions) {
    if (!result.has(r.day)) result.set(r.day, []);
  }

  // Items below the topmost header
  const topY = Math.max(...regions.map(r => r.yMax));

  for (const item of items) {
    // Skip items above all headers (title/location text)
    if (item.y > topY) continue;

    // Find the best matching region
    let bestRegion: DayRegion | null = null;
    let bestScore = -1;

    for (const region of regions) {
      // Check Y range
      if (item.y > region.yMax || item.y < region.yMin) continue;

      // Check X range
      if (item.x >= region.xMin && item.x < region.xMax) {
        // Perfect X match, prioritize
        const score = 100;
        if (score > bestScore) {
          bestScore = score;
          bestRegion = region;
        }
      } else {
        // Check if item center falls in range
        const center = item.x + (item.width || 0) / 2;
        if (center >= region.xMin && center < region.xMax) {
          const score = 50;
          if (score > bestScore) {
            bestScore = score;
            bestRegion = region;
          }
        }
      }
    }

    if (bestRegion) {
      result.get(bestRegion.day)!.push(item);
    }
  }

  return result;
}

/**
 * Detect and parse columnar layout for a single page
 */
function parsePageColumnar(items: TextItem[]): { days: DaySchedule[]; isColumnar: boolean } {
  const headers = findDayHeaders(items);

  if (headers.length < 2) {
    return { days: [], isColumnar: false };
  }

  const headerRows = groupHeadersByRow(headers);

  // Check if we have a proper columnar layout
  // At least one row must have 2+ days side by side
  const hasColumnarRow = headerRows.some(row => row.length >= 2);
  if (!hasColumnarRow) {
    return { days: [], isColumnar: false };
  }

  // Find page Y bounds
  const pageMinY = Math.min(...items.map(i => i.y));

  const regions = buildDayRegions(headerRows, pageMinY);

  console.log('[PDF Parser] Columnar layout detected:');
  console.log(`  ${headerRows.length} row(s) of day headers`);
  headerRows.forEach((row, i) => {
    console.log(`  Row ${i + 1}: ${row.map(h => `${h.day} (x=${Math.round(h.x)}, y=${Math.round(h.y)})`).join(', ')}`);
  });

  const regionItems = assignItemsToRegions(items, regions);
  const daySchedules: DaySchedule[] = [];

  for (const region of regions) {
    const dayItems = regionItems.get(region.day) || [];
    if (dayItems.length === 0) continue;

    const dayIdx = DAYS_ORDER.indexOf(region.day);
    const positionedClasses = parseDayClassesFromPositionedItems(dayItems, dayIdx);
    const lines = groupIntoLines(dayItems);
    const lineClasses = parseDayClasses(lines, dayIdx);
    const classes = chooseBestParsedClasses(positionedClasses, lineClasses);

    if (classes.length > 0) {
      // Check if this day already exists (from another region/row)
      const existing = daySchedules.find(d => d.day === region.day);
      if (existing) {
        existing.classes.push(...classes);
      } else {
        daySchedules.push({ day: region.day, classes });
      }
    }
  }

  console.log(`[PDF Parser] Parsed ${daySchedules.length} days:`);
  daySchedules.forEach(d => console.log(`  ${d.day}: ${d.classes.length} classes`));

  return { days: daySchedules, isColumnar: true };
}

// =====================================================================
// LINEAR LAYOUT PARSING (fallback)
// =====================================================================

function parseScheduleFromLines(lines: string[]): DaySchedule[] {
  const daySchedules: DaySchedule[] = [];
  let currentDay: string | null = null;
  let currentLines: string[] = [];

  for (const line of lines) {
    let foundDay: string | null = null;
    for (const { day, regex } of DAY_PATTERNS) {
      if (regex.test(line) && line.trim().length < 30) {
        foundDay = day;
        break;
      }
    }

    if (foundDay) {
      if (currentDay && currentLines.length > 0) {
        const dayIdx = DAYS_ORDER.indexOf(currentDay);
        const classes = parseDayClasses(currentLines, dayIdx);
        if (classes.length > 0) {
          daySchedules.push({ day: currentDay, classes });
        }
      }
      currentDay = foundDay;
      currentLines = [];
    } else if (currentDay) {
      currentLines.push(line);
    }
  }

  if (currentDay && currentLines.length > 0) {
    const dayIdx = DAYS_ORDER.indexOf(currentDay);
    const classes = parseDayClasses(currentLines, dayIdx);
    if (classes.length > 0) {
      daySchedules.push({ day: currentDay, classes });
    }
  }

  for (const day of daySchedules) {
    day.classes.sort((a, b) => normalizeTime(a.time).localeCompare(normalizeTime(b.time)));
  }

  return daySchedules;
}

function createSamplingCanvas(width: number, height: number): HTMLCanvasElement | OffscreenCanvas | null {
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(width, height);
  }

  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }

  return null;
}

async function renderPdfPages(arrayBuffer: ArrayBuffer): Promise<RenderedPageSample[]> {
  const pdf = await pdfjsLib.getDocument({ data: Uint8Array.from(new Uint8Array(arrayBuffer)) }).promise;
  const pages: RenderedPageSample[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const logicalViewport = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = createSamplingCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    if (!canvas) return [];

    const context = canvas.getContext('2d', { willReadFrequently: true } as CanvasRenderingContext2DSettings);
    if (!context) return [];

    await page.render({ canvasContext: context as CanvasRenderingContext2D, viewport }).promise;
    pages.push({
      width: logicalViewport.width,
      height: logicalViewport.height,
      imageData: (context as CanvasRenderingContext2D).getImageData(0, 0, canvas.width, canvas.height),
    });
  }

  return pages;
}

function getPixelColor(imageData: ImageData, x: number, y: number): RGBColor | null {
  if (x < 0 || y < 0 || x >= imageData.width || y >= imageData.height) return null;
  const index = (Math.floor(y) * imageData.width + Math.floor(x)) * 4;
  const alpha = imageData.data[index + 3];
  if (alpha < 10) return null;

  return {
    r: imageData.data[index],
    g: imageData.data[index + 1],
    b: imageData.data[index + 2],
  };
}

function isNearWhite(color: RGBColor): boolean {
  return color.r > 230 && color.g > 230 && color.b > 230;
}

function isNearBlack(color: RGBColor): boolean {
  return color.r < 55 && color.g < 55 && color.b < 55;
}

function colorDistance(a: RGBColor, b: RGBColor): number {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

function mergeRects(...rects: Array<PdfTemplateRect | null | undefined>): PdfTemplateRect | null {
  const validRects = rects.filter((rect): rect is PdfTemplateRect => Boolean(rect));
  if (validRects.length === 0) return null;

  const minX = Math.min(...validRects.map(rect => rect.x));
  const minY = Math.min(...validRects.map(rect => rect.y));
  const maxX = Math.max(...validRects.map(rect => rect.x + rect.width));
  const maxY = Math.max(...validRects.map(rect => rect.y + rect.height));

  return {
    pageIndex: validRects[0].pageIndex,
    x: minX,
    y: minY,
    width: Math.max(maxX - minX, 1),
    height: Math.max(maxY - minY, 1),
  };
}

function dominantColorInRect(sample: RenderedPageSample, rect: PdfTemplateRect): RGBColor | null {
  const xScale = sample.imageData.width / sample.width;
  const yScale = sample.imageData.height / sample.height;
  const xStart = Math.max(Math.floor(rect.x * xScale), 0);
  const xEnd = Math.min(Math.ceil((rect.x + rect.width) * xScale), sample.imageData.width - 1);
  const top = Math.max(Math.floor((sample.height - (rect.y + rect.height)) * yScale), 0);
  const bottom = Math.min(Math.ceil((sample.height - rect.y) * yScale), sample.imageData.height - 1);
  const stepX = Math.max(1, Math.floor((xEnd - xStart) / 20));
  const stepY = Math.max(1, Math.floor((bottom - top) / 6));
  const buckets = new Map<string, { color: RGBColor; count: number }>();

  for (let y = top; y <= bottom; y += stepY) {
    for (let x = xStart; x <= xEnd; x += stepX) {
      const color = getPixelColor(sample.imageData, x, y);
      if (!color || isNearWhite(color) || isNearBlack(color)) continue;

      const key = `${Math.round(color.r / 8) * 8}-${Math.round(color.g / 8) * 8}-${Math.round(color.b / 8) * 8}`;
      const bucket = buckets.get(key);
      if (bucket) {
        bucket.count += 1;
      } else {
        buckets.set(key, { color, count: 1 });
      }
    }
  }

  const best = [...buckets.values()].sort((a, b) => b.count - a.count)[0];
  return best?.count >= 3 ? best.color : null;
}

function buildRowThemeMarkerRect(row: PdfTemplateRow): PdfTemplateRect | null {
  const rowRect = mergeRects(row.timeRect, row.classRect, row.trainerRect) || row.classRect;
  const markerRight = Math.max(row.timeRect.x - 4, 0);
  const markerX = Math.max(row.timeRect.x - 30, 0);
  const markerWidth = markerRight - markerX;
  if (markerWidth < 4) return null;

  return {
    pageIndex: row.pageIndex,
    x: markerX,
    y: Math.max(rowRect.y - 4, 0),
    width: markerWidth,
    height: Math.max(rowRect.height + 8, 14),
  };
}

function countMatchingPixels(sample: RenderedPageSample, rect: PdfTemplateRect, target: RGBColor, tolerance = 42): number {
  const xScale = sample.imageData.width / sample.width;
  const yScale = sample.imageData.height / sample.height;
  const xStart = Math.max(Math.floor(rect.x * xScale), 0);
  const xEnd = Math.min(Math.ceil((rect.x + rect.width) * xScale), sample.imageData.width - 1);
  const top = Math.max(Math.floor((sample.height - (rect.y + rect.height)) * yScale), 0);
  const bottom = Math.min(Math.ceil((sample.height - rect.y) * yScale), sample.imageData.height - 1);
  const stepX = Math.max(1, Math.floor((xEnd - xStart) / 60));
  const stepY = Math.max(1, Math.floor((bottom - top) / 8));

  let matches = 0;

  for (let y = top; y <= bottom; y += stepY) {
    for (let x = xStart; x <= xEnd; x += stepX) {
      const color = getPixelColor(sample.imageData, x, y);
      if (!color || isNearWhite(color) || isNearBlack(color)) continue;
      if (colorDistance(color, target) <= tolerance) {
        matches += 1;
      }
    }
  }

  return matches;
}

function looksLikeLegendThemeText(text: string): boolean {
  const cleaned = formatThemeText(text);
  if (!cleaned) return false;
  if (containsDayHeaderText(cleaned)) return false;
  if (TIME_PATTERN.test(cleaned) || INLINE_TIME_PATTERN.test(cleaned)) return false;
  if (matchClassName(cleaned) || matchTrainer(cleaned)) return false;
  if (THEME_MARKER_REGEX.test(cleaned)) return true;
  if (findKnownTheme(cleaned)) return true;

  const words = cleaned.split(/\s+/).filter(Boolean);
  return words.length >= 2 && words.length <= 8 && /^[A-Za-z&'\s]+$/.test(cleaned);
}

function detectThemeLegendEntries(lines: PositionedLine[], pageIndex: number, sample: RenderedPageSample): ThemeLegendEntry[] {
  return lines
    .filter(line => line.pageIndex === pageIndex)
    .filter(line => line.y < sample.height * 0.45)
    .map(line => {
      const theme = formatThemeText(line.text);
      if (!looksLikeLegendThemeText(theme)) return null;

      const legendRect: PdfTemplateRect = {
        pageIndex,
        x: Math.max(line.x - 80, 0),
        y: line.y,
        width: Math.min(70, line.x),
        height: Math.max(line.height, 12),
      };
      const color = dominantColorInRect(sample, legendRect);
      if (!color) return null;

      return { theme, color } satisfies ThemeLegendEntry;
    })
    .filter((entry): entry is ThemeLegendEntry => Boolean(entry));
}

function findThemeByColor(color: RGBColor | null, legendEntries: ThemeLegendEntry[]): string | null {
  if (!color || legendEntries.length === 0) return null;

  const best = legendEntries
    .map(entry => ({ entry, distance: colorDistance(color, entry.color) }))
    .sort((a, b) => a.distance - b.distance)[0];

  return best && best.distance <= 50 ? best.entry.theme : null;
}

function findThemeByRowHighlight(sample: RenderedPageSample, row: PdfTemplateRow, legendEntries: ThemeLegendEntry[]): string | null {
  if (legendEntries.length === 0) return null;

  const rowRect = buildRowThemeMarkerRect(row);
  if (!rowRect) return null;

  const best = legendEntries
    .map(entry => ({
      entry,
      score: countMatchingPixels(sample, rowRect, entry.color),
    }))
    .sort((a, b) => b.score - a.score)[0];

  return best && best.score >= 3 ? best.entry.theme : null;
}

function comparableTime(value: string | null | undefined): string {
  return normalizeTime(value || '') || normalizeExtractedText(value || '').toUpperCase();
}

function comparableClassName(value: string | null | undefined): string {
  const normalized = normalizeClassName(value || '');
  return compactText(normalized || value || '');
}

function comparableTrainer(value: string | null | undefined): string {
  const normalized = normalizeTrainer(value || '');
  return compactText(normalized || value || '');
}

function scoreThemeRowMatch(scheduleClass: ScheduleClass, row: PdfTemplateRow, classIndex: number, rowIndex: number): number {
  let score = 0;

  const classTime = comparableTime(scheduleClass.time);
  const rowTime = comparableTime(row.sourceTime);
  if (classTime && rowTime) {
    if (classTime === rowTime) {
      score += 10;
    } else {
      return -1;
    }
  }

  const className = comparableClassName(scheduleClass.className);
  const rowClassName = comparableClassName(row.sourceClassName);
  if (className && rowClassName) {
    if (className === rowClassName) {
      score += 8;
    } else if (className.includes(rowClassName) || rowClassName.includes(className)) {
      score += 5;
    }
  }

  const trainer = comparableTrainer(scheduleClass.trainer);
  const rowTrainer = comparableTrainer(row.sourceTrainer);
  if (trainer && rowTrainer) {
    if (trainer === rowTrainer) {
      score += 6;
    } else if (trainer && rowTrainer && (trainer.includes(rowTrainer) || rowTrainer.includes(trainer))) {
      score += 3;
    }
  }

  score += Math.max(0, 3 - Math.abs(classIndex - rowIndex));
  return score;
}

function applyRecoveredThemesToDayClasses(
  classes: ScheduleClass[],
  rows: PdfTemplateRow[],
  rowThemes: string[]
): void {
  if (classes.length === 0 || rows.length === 0 || rowThemes.length === 0) return;

  const unusedRows = new Set<number>();
  rowThemes.forEach((theme, index) => {
    if (theme) unusedRows.add(index);
  });

  for (let classIndex = 0; classIndex < classes.length; classIndex++) {
    const scheduleClass = classes[classIndex];
    let bestRowIndex = -1;
    let bestScore = -1;

    for (const rowIndex of unusedRows) {
      const theme = rowThemes[rowIndex];
      if (!theme) continue;

      const score = scoreThemeRowMatch(scheduleClass, rows[rowIndex], classIndex, rowIndex);
      if (score > bestScore) {
        bestScore = score;
        bestRowIndex = rowIndex;
      }
    }

    if (bestRowIndex >= 0 && bestScore >= 10) {
      const theme = rowThemes[bestRowIndex];
      scheduleClass.theme = scheduleClass.theme
        ? mergeThemeParts(scheduleClass.theme, theme) || scheduleClass.theme
        : theme;
      unusedRows.delete(bestRowIndex);
    }
  }

  // Do not assign leftover legend colors by row index. On layouts where the legend
  // sits beside a day column, index-based fallback can attach legend entries to
  // unrelated Sunday rows.
}

async function buildColorThemeMap(arrayBuffer: ArrayBuffer, layout: PdfTemplateLayout, pages: TextItem[][]): Promise<Record<string, string[]>> {
  const renderedPages = await renderPdfPages(arrayBuffer);
  if (renderedPages.length === 0) return {};

  const legendByPage = renderedPages.map((sample, pageIndex) => {
    const pageLines = groupIntoPositionedLines(pages[pageIndex] || [], pageIndex);
    return detectThemeLegendEntries(pageLines, pageIndex, sample);
  });
  const allLegendEntries = legendByPage.flat();

  const themesByDay: Record<string, string[]> = {};

  for (const [day, rows] of Object.entries(layout.rowsByDay)) {
    themesByDay[day] = rows.map(row => {
      const sample = renderedPages[row.pageIndex];
      const legendEntries = (legendByPage[row.pageIndex] || []).length > 0
        ? legendByPage[row.pageIndex]
        : allLegendEntries;
      if (!sample || legendEntries.length === 0) return '';

      const stripTheme = findThemeByRowHighlight(sample, row, legendEntries);
      return stripTheme || '';
    });
  }

  return themesByDay;
}

// =====================================================================
// MAIN ENTRY POINT
// =====================================================================

export async function parsePDF(file: File): Promise<WeekSchedule> {
  const arrayBuffer = await file.arrayBuffer();
  const pages = await extractTextItemsFromArrayBuffer(arrayBuffer);

  // Flatten all items and lines for metadata detection
  const allItems: TextItem[] = pages.flat();
  const allLines: string[] = [];
  for (const pageItems of pages) {
    allLines.push(...groupIntoLines(pageItems));
  }

  const location = detectLocation(allItems);
  const { weekStart, weekEnd } = detectDateRange(allLines);

  // Try columnar parsing page by page
  let days: DaySchedule[] = [];
  let usedColumnar = false;

  for (const pageItems of pages) {
    const { days: pageDays, isColumnar } = parsePageColumnar(pageItems);
    if (isColumnar && pageDays.length > 0) {
      for (const newDay of pageDays) {
        const existing = days.find(d => d.day === newDay.day);
        if (existing) {
          existing.classes.push(...newDay.classes);
        } else {
          days.push(newDay);
        }
      }
      usedColumnar = true;
    }
  }

  // Fallback to linear if columnar didn't work well
  if (!usedColumnar || days.length < 2) {
    console.log('[PDF Parser] Using linear layout parsing');
    const linearDays = parseScheduleFromLines(allLines);
    if (linearDays.length > days.length) {
      days = linearDays;
    }
  }

  // Sort days and classes
  days.sort((a, b) => DAYS_ORDER.indexOf(a.day) - DAYS_ORDER.indexOf(b.day));
  for (const day of days) {
    day.classes.sort((a, b) => normalizeTime(a.time).localeCompare(normalizeTime(b.time)));
  }

  // Set location on all classes
  for (const day of days) {
    for (const cls of day.classes) {
      cls.location = location;
    }
  }

  try {
    const templateLayout = buildTemplateLayoutFromPages(pages);
    const themesByDay = await buildColorThemeMap(arrayBuffer, templateLayout, pages);

    for (const day of days) {
      applyRecoveredThemesToDayClasses(
        day.classes,
        templateLayout.rowsByDay[day.day] || [],
        themesByDay[day.day] || []
      );
    }
  } catch (error) {
    console.warn('[PDF Parser] Theme legend recovery skipped', error);
  }

  return {
    id: crypto.randomUUID(),
    weekStart,
    weekEnd,
    location,
    days,
    levels: {
      beginner: ['Studio Barre 57', 'Studio PowerCycle'],
      intermediate: ['Studio Cardio Barre', 'Studio Mat 57', 'Studio FIT', 'Studio Back Body Blaze', 'Studio Strength Lab'],
      advanced: ['Studio HIIT', 'Studio Amped Up!'],
    },
  };
}

/**
 * Convert a parsed schedule into normalized PdfClassData rows.
 */
export function scheduleToPdfClassData(schedule: WeekSchedule): PdfClassData[] {
  const result: PdfClassData[] = [];

  for (const daySchedule of schedule.days) {
    for (const cls of daySchedule.classes) {
      const normalizedTrainer = normalizeTrainer(cls.trainer);
      const normalizedClass = normalizeClassName(cls.className);
      const normalizedLocation = normalizeLocation(schedule.location);

      // Only include valid classes
      if (isValidClassName(normalizedClass)) {
        const uniqueKey = `${daySchedule.day}-${normalizeTime(cls.time)}-${normalizedClass}-${normalizedTrainer}`;

        result.push({
          day: daySchedule.day,
          time: normalizeTime(cls.time),
          className: normalizedClass,
          trainer: normalizedTrainer,
          location: normalizedLocation,
          theme: cls.theme,
          uniqueKey: uniqueKey,
        });
      }
    }
  }

  return result;
}

/**
 * Parse PDF and return PdfClassData array with normalized data.
 * Accepts an already parsed schedule to avoid re-parsing the PDF when possible.
 */
export async function parsePDFToClassData(file: File, parsedSchedule?: WeekSchedule): Promise<PdfClassData[]> {
  const schedule = parsedSchedule ?? await parsePDF(file);
  return scheduleToPdfClassData(schedule);
}

export const __pdfParserTestUtils = {
  groupIntoLines,
  parseDayClasses,
  parseDayClassesFromPositionedItems,
  parsePageColumnar,
  matchClassName,
  matchTrainer,
  extractTheme,
  mergeThemeParts,
  detectThemeLegendEntries,
  countMatchingPixels,
  findThemeByRowHighlight,
  applyRecoveredThemesToDayClasses,
};
