import type { WeekSchedule, DaySchedule, ScheduleClass, ClassLevel } from '@/types/schedule';
import { normalizeTime, normalizeTrainer, normalizeLocation, normalizeClassName, isRecognizedClassName } from './normalizers';
import { shouldExcludeClass, shouldExcludeClassName } from './csvParser';

/**
 * Grid CSV parser for spreadsheet-like schedules where day data is spread across columns.
 * The parser intentionally avoids fixed column indexes and instead infers:
 * - which row contains day labels
 * - which row contains per-day subheaders (class/trainer/cover/location/theme)
 * - where the time column is
 */

interface DayBlock {
  day: string;
  date?: string;
  startCol: number;
  endCol: number;
  classCol?: number;
  trainerCol?: number;
  trainer2Col?: number;
  coverCol?: number;
  locationCol?: number;
  themeCol?: number;
}

interface GridLayout {
  dayBlocks: DayBlock[];
  dayRowIndex: number;
  headerRowIndex: number;
  timeCol: number;
}

const DAYS_IN_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const DAY_PATTERNS: Array<{ day: string; regex: RegExp }> = [
  { day: 'Monday', regex: /\bmon(day)?\b/i },
  { day: 'Tuesday', regex: /\btue(s|sday)?\b/i },
  { day: 'Wednesday', regex: /\bwed(nesday)?\b/i },
  { day: 'Thursday', regex: /\bthu(r|rs|rsday)?\b/i },
  { day: 'Friday', regex: /\bfri(day)?\b/i },
  { day: 'Saturday', regex: /\bsat(urday)?\b/i },
  { day: 'Sunday', regex: /\bsun(day)?\b/i },
];

const HEADER_TOKENS = {
  className: ['class', 'session', 'workout', 'format', 'type'],
  trainer: ['trainer', 'instructor', 'teacher', 'coach', 'trainer1', 'trainer 1'],
  trainer2: ['trainer2', 'trainer 2', 'assistant', 'alt trainer'],
  cover: ['cover', 'substitute', 'sub', 'replacement', 'cover trainer', 'sub trainer'],
  location: ['location', 'studio', 'room', 'venue', 'place'],
  theme: ['theme', 'focus', 'notes', 'note'],
  time: ['time', 'start time', 'class time'],
};

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  result.push(current.trim());
  return result;
}

function parseToGrid(csvString: string): string[][] {
  return csvString
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map(line => parseCSVLine(line))
    .filter(row => row.some(cell => cell.trim() !== ''));
}

function toTokenText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveDayName(value: string): string | null {
  const text = toTokenText(value);
  if (!text) return null;

  for (const { day, regex } of DAY_PATTERNS) {
    if (regex.test(text)) return day;
  }

  return null;
}

function isStandaloneDayCell(value: string): boolean {
  const text = toTokenText(value);
  if (!text) return false;

  const blockedTokens = ['cover', 'class', 'trainer', 'instructor', 'location', 'theme', 'time'];
  if (blockedTokens.some(token => text.includes(token))) return false;

  const tokenCount = text.split(' ').filter(Boolean).length;
  return tokenCount <= 2;
}

function isHeaderMatch(value: string, tokens: string[]): boolean {
  const text = toTokenText(value);
  if (!text) return false;
  return tokens.some(token => text === token || text.includes(token));
}

function detectDayRowIndex(grid: string[][]): number {
  let bestIndex = -1;
  let bestCount = 0;
  const maxScanRows = Math.min(grid.length, 10);

  for (let rowIdx = 0; rowIdx < maxScanRows; rowIdx++) {
    const row = grid[rowIdx];
    const dayHits = row
      .map(cell => (isStandaloneDayCell(cell) ? resolveDayName(cell) : null))
      .filter(Boolean);

    const uniqueDayHits = new Set(dayHits);
    if (uniqueDayHits.size > bestCount) {
      bestCount = uniqueDayHits.size;
      bestIndex = rowIdx;
    }
  }

  return bestCount >= 2 ? bestIndex : -1;
}

function detectHeaderRowIndex(grid: string[][], dayRowIndex: number): number {
  const candidateStart = Math.max(dayRowIndex + 1, 0);
  const candidateEnd = Math.min(grid.length - 1, dayRowIndex + 4);

  let bestIndex = candidateStart;
  let bestScore = -1;

  for (let rowIdx = candidateStart; rowIdx <= candidateEnd; rowIdx++) {
    const row = grid[rowIdx];
    let score = 0;

    for (const cell of row) {
      if (isHeaderMatch(cell, HEADER_TOKENS.className)) score += 3;
      if (isHeaderMatch(cell, HEADER_TOKENS.trainer)) score += 2;
      if (isHeaderMatch(cell, HEADER_TOKENS.cover)) score += 2;
      if (isHeaderMatch(cell, HEADER_TOKENS.location)) score += 1;
      if (isHeaderMatch(cell, HEADER_TOKENS.theme)) score += 1;
    }

    if (score > bestScore) {
      bestScore = score;
      bestIndex = rowIdx;
    }
  }

  return bestIndex;
}

function detectTimeColumn(grid: string[][], headerRowIndex: number, dayBlocks: DayBlock[]): number {
  const headerRow = grid[headerRowIndex] || [];
  const firstDayStart = Math.min(...dayBlocks.map(block => block.startCol));

  for (let col = 0; col < Math.max(1, firstDayStart); col++) {
    if (isHeaderMatch(headerRow[col] || '', HEADER_TOKENS.time)) {
      return col;
    }
  }

  const maxCol = Math.max(...grid.map(row => row.length), 0);
  let bestCol = 0;
  let bestTimeHits = -1;

  for (let col = 0; col < maxCol; col++) {
    let timeHits = 0;
    for (let rowIdx = headerRowIndex + 1; rowIdx < Math.min(grid.length, headerRowIndex + 24); rowIdx++) {
      const cell = grid[rowIdx]?.[col]?.trim() || '';
      if (!cell) continue;
      if (normalizeTime(cell)) timeHits++;
    }

    if (timeHits > bestTimeHits) {
      bestTimeHits = timeHits;
      bestCol = col;
    }
  }

  return bestCol;
}

function detectDayBlocks(grid: string[][], dayRowIndex: number, headerRowIndex: number): DayBlock[] {
  const dayRow = grid[dayRowIndex] || [];
  const headerRow = grid[headerRowIndex] || [];
  const dateRow = dayRowIndex > 0 ? grid[dayRowIndex - 1] || [] : [];

  const dayStarts: Array<{ day: string; col: number }> = [];

  for (let col = 0; col < dayRow.length; col++) {
    const cell = dayRow[col] || '';
    const day = isStandaloneDayCell(cell) ? resolveDayName(cell) : null;
    if (!day) continue;

    const alreadyRecorded = dayStarts.some(existing => existing.day === day && Math.abs(existing.col - col) <= 1);
    if (!alreadyRecorded) {
      dayStarts.push({ day, col });
    }
  }

  dayStarts.sort((a, b) => a.col - b.col);

  const blocks: DayBlock[] = [];

  for (let i = 0; i < dayStarts.length; i++) {
    const current = dayStarts[i];
    const next = dayStarts[i + 1];
    const startCol = current.col;
    const endCol = next ? next.col - 1 : Math.max(headerRow.length - 1, startCol);

    const block: DayBlock = {
      day: current.day,
      date: dateRow[startCol]?.trim() || undefined,
      startCol,
      endCol,
    };

    for (let col = startCol; col <= endCol; col++) {
      const headerText = headerRow[col] || '';
      if (!block.classCol && isHeaderMatch(headerText, HEADER_TOKENS.className)) block.classCol = col;
      if (!block.trainerCol && isHeaderMatch(headerText, HEADER_TOKENS.trainer)) block.trainerCol = col;
      if (!block.trainer2Col && isHeaderMatch(headerText, HEADER_TOKENS.trainer2)) block.trainer2Col = col;
      if (!block.coverCol && isHeaderMatch(headerText, HEADER_TOKENS.cover)) block.coverCol = col;
      if (!block.locationCol && isHeaderMatch(headerText, HEADER_TOKENS.location)) block.locationCol = col;
      if (!block.themeCol && isHeaderMatch(headerText, HEADER_TOKENS.theme)) block.themeCol = col;
    }

    // Fallbacks for layouts without clear subheaders
    if (block.classCol === undefined && startCol <= endCol) {
      block.classCol = Math.min(startCol + 1, endCol);
    }
    if (block.trainerCol === undefined && startCol <= endCol) {
      block.trainerCol = Math.min(startCol + 2, endCol);
    }
    if (block.coverCol === undefined && startCol <= endCol) {
      block.coverCol = Math.min(startCol + 4, endCol);
    }
    if (block.locationCol === undefined && startCol <= endCol) {
      block.locationCol = startCol;
    }

    blocks.push(block);
  }

  return blocks;
}

function inferGridLayout(grid: string[][]): GridLayout | null {
  if (grid.length < 4) return null;

  const dayRowIndex = detectDayRowIndex(grid);
  if (dayRowIndex === -1) return null;

  const headerRowIndex = detectHeaderRowIndex(grid, dayRowIndex);
  const dayBlocks = detectDayBlocks(grid, dayRowIndex, headerRowIndex);
  if (dayBlocks.length < 2) return null;

  const timeCol = detectTimeColumn(grid, headerRowIndex, dayBlocks);

  return {
    dayBlocks,
    dayRowIndex,
    headerRowIndex,
    timeCol,
  };
}

/**
 * Default class levels
 */
const DEFAULT_LEVELS: WeekSchedule['levels'] = {
  beginner: ['BARRE 57', 'POWERCYCLE', 'BARRE57', 'CYCLE'],
  intermediate: ['CARDIO BARRE', 'MAT 57', 'CARDIO BARRE PLUS', 'FIT', 'BACK BODY BLAZE', 'STRENGTH LAB', 'BBB', 'CARDIO B', 'MAT57'],
  advanced: ['HIIT', 'AMPED UP'],
};

function determineLevel(className: string): ClassLevel | undefined {
  const normalized = normalizeClassName(className);
  const base = normalized.replace(/\s*\(.*?\)\s*/g, '').replace(/\s*EXP\s*$/i, '').trim();

  if (DEFAULT_LEVELS.beginner.some(c => normalizeClassName(c) === base)) return 'beginner';
  if (DEFAULT_LEVELS.intermediate.some(c => normalizeClassName(c) === base)) return 'intermediate';
  if (DEFAULT_LEVELS.advanced.some(c => normalizeClassName(c) === base)) return 'advanced';
  return undefined;
}

/**
 * Check if this CSV looks like a grid-style schedule.
 */
export function isGridStyleCSV(csvString: string): boolean {
  const grid = parseToGrid(csvString);
  if (grid.length < 4) return false;

  const layout = inferGridLayout(grid);
  if (!layout) return false;

  let timeHits = 0;
  for (let rowIdx = layout.headerRowIndex + 1; rowIdx < Math.min(grid.length, layout.headerRowIndex + 20); rowIdx++) {
    const rawTime = grid[rowIdx]?.[layout.timeCol] || '';
    if (normalizeTime(rawTime)) {
      timeHits++;
    }
  }

  return timeHits >= 1;
}

/**
 * Parse grid-style CSV into WeekSchedule
 */
export function parseGridCSV(csvString: string): WeekSchedule | null {
  try {
    const grid = parseToGrid(csvString);
    if (grid.length < 4) return null;

    const layout = inferGridLayout(grid);
    if (!layout || layout.dayBlocks.length === 0) return null;

    const daySchedules: Map<string, ScheduleClass[]> = new Map();
    let classIndex = 0;

    for (let rowIdx = layout.headerRowIndex + 1; rowIdx < grid.length; rowIdx++) {
      const row = grid[rowIdx] || [];
      const rawTime = row[layout.timeCol]?.trim() || '';
      if (!rawTime) continue;

      const time = normalizeTime(rawTime);
      if (!time) continue;

      for (const block of layout.dayBlocks) {
        const rawClassName = block.classCol !== undefined ? (row[block.classCol] || '').trim() : '';
        const rawTrainer1 = block.trainerCol !== undefined ? (row[block.trainerCol] || '').trim() : '';
        const rawTrainer2 = block.trainer2Col !== undefined ? (row[block.trainer2Col] || '').trim() : '';
        const rawCover = block.coverCol !== undefined ? (row[block.coverCol] || '').trim() : '';
        const rawLocation = block.locationCol !== undefined ? (row[block.locationCol] || '').trim() : '';
        const rawTheme = block.themeCol !== undefined ? (row[block.themeCol] || '').trim() : '';

        if (!rawClassName && !rawTrainer1 && !rawCover && !rawTrainer2) continue;
        if (shouldExcludeClassName(rawClassName)) continue;

        if (shouldExcludeClass(rawTrainer1 || rawTrainer2, rawCover)) {
          continue;
        }

        const className = normalizeClassName(rawClassName || 'Unknown');
        if (!isRecognizedClassName(rawClassName, className)) {
          continue;
        }

        const location = rawLocation ? normalizeLocation(rawLocation) : undefined;
        const trainerPrimary = normalizeTrainer(rawTrainer1 || rawTrainer2);
        const coverTrainer = rawCover ? normalizeTrainer(rawCover) : '';
        const effectiveTrainer = coverTrainer || trainerPrimary;

        if (!effectiveTrainer) continue;

        if (!daySchedules.has(block.day)) {
          daySchedules.set(block.day, []);
        }

        daySchedules.get(block.day)!.push({
          id: `grid-${classIndex++}`,
          time,
          className,
          trainer: effectiveTrainer,
          location: location || undefined,
          level: determineLevel(className),
          theme: rawTheme || undefined,
        });
      }
    }

    const days: DaySchedule[] = [];
    for (const dayName of DAYS_IN_ORDER) {
      const classes = daySchedules.get(dayName);
      if (!classes || classes.length === 0) continue;

      const block = layout.dayBlocks.find(item => item.day === dayName);

      classes.sort((a, b) => a.time.localeCompare(b.time));
      days.push({
        day: dayName,
        date: block?.date,
        classes,
      });
    }

    if (days.length === 0) return null;

    const weekStart = days[0]?.date || '';
    const weekEnd = days[days.length - 1]?.date || '';

    return {
      id: crypto.randomUUID(),
      weekStart,
      weekEnd,
      location: 'CSV Import',
      days,
      levels: DEFAULT_LEVELS,
    };
  } catch (error) {
    console.error('Error parsing grid CSV:', error);
    return null;
  }
}
