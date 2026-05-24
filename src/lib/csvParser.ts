import type { WeekSchedule, DaySchedule, ScheduleClass, ClassData, ClassLevel } from '@/types/schedule';
import { normalizeTime, normalizeTrainer, normalizeLocation, normalizeClassName, normalizeDay, isRecognizedClassName } from './normalizers';
import { isGridStyleCSV, parseGridCSV } from './gridCsvParser';
import { knownTeachers } from './normalizationMaps';

// List of excluded trainer names
const EXCLUDED_TRAINERS = [
  'Smita Parekh',
  'Hosted',
  'Nandini',
  'Namrata',
  'Neeta',
  'Megha',
  'Mansee',
  'Anandita',
  'Kajal',
  'Taarika',
  'Pooja',
];

const DAY_NAME_REGEX_MAP: Array<{ day: string; regex: RegExp }> = [
  { day: 'Monday', regex: /\bmon(day)?\b/i },
  { day: 'Tuesday', regex: /\btue(s|sday)?\b/i },
  { day: 'Wednesday', regex: /\bwed(nesday)?\b/i },
  { day: 'Thursday', regex: /\bthu(r|rs|rsday)?\b/i },
  { day: 'Friday', regex: /\bfri(day)?\b/i },
  { day: 'Saturday', regex: /\bsat(urday)?\b/i },
  { day: 'Sunday', regex: /\bsun(day)?\b/i },
];

const CLASS_KEYWORDS = [
  'barre', 'mat', 'cycle', 'power', 'fit', 'strength', 'lab', 'cardio', 'recovery',
  'hiit', 'foundation', 'sweat', 'hosted', 'pre/post', 'prenatal', 'tabata', 'isometric', 'amped',
];

const HOSTED_CLASS_NAME_REGEX = /\bhosted\b/i;

const HEADER_ALIASES = {
  day: ['day', 'weekday', 'day of week', 'dow'],
  date: ['date', 'class date', 'session date'],
  time: ['time', 'start time', 'class time', 'slot'],
  className: ['class', 'class name', 'session', 'workout', 'format', 'type'],
  trainer: ['trainer', 'instructor', 'teacher', 'coach', 'trainer1', 'trainer 1'],
  location: ['location', 'studio', 'room', 'venue', 'place'],
  cover: ['cover', 'substitute', 'sub', 'replacement', 'cover trainer', 'sub trainer'],
  notes: ['notes', 'note', 'comment', 'comments'],
  theme: ['theme', 'focus'],
};

/**
 * Check if a class should be excluded based on trainer and cover fields
 */
export function shouldExcludeClass(rawTrainer: string, rawCover: string): boolean {
  const trainer1 = rawTrainer?.trim() || '';
  const cover = rawCover?.trim() || '';

  // Exclude if both trainer1 and cover are empty
  if (!trainer1 && !cover) {
    return true;
  }

  // Check if either trainer1 or cover matches excluded names
  const trainerToCheck = (cover || trainer1).trim();
  const shouldExclude = EXCLUDED_TRAINERS.some(excludedName =>
    trainerToCheck.toLowerCase().includes(excludedName.toLowerCase().trim())
  );

  if (shouldExclude) {
    console.log(`[CSV Parser] Excluding class with trainer: "${trainerToCheck}"`);
  }

  return shouldExclude;
}

export function shouldExcludeClassName(rawClassName: string): boolean {
  const className = rawClassName?.trim() || '';
  if (!className) return false;

  const shouldExclude = HOSTED_CLASS_NAME_REGEX.test(className);
  if (shouldExclude) {
    console.log(`[CSV Parser] Excluding hosted class: "${className}"`);
  }

  return shouldExclude;
}

interface CSVRow {
  [key: string]: string;
}

interface ColumnDetection {
  day?: string;
  date?: string;
  time: string;
  className: string;
  trainer: string;
  location?: string;
  cover?: string;
  notes?: string;
  theme?: string;
  coverByDay: Partial<Record<string, string>>;
}

interface ParsedCSV {
  rows: CSVRow[];
  headers: string[];
  columns: ColumnDetection | null;
  headerRowIndex: number;
}

interface NormalizedRowData {
  day: string;
  time: string;
  timeRaw: string;
  className: string;
  trainer: string;
  trainerRaw: string;
  cover: string;
  location: string;
  notes: string;
  theme?: string;
}

function normalizeHeaderKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseCSVTable(csvString: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  const source = csvString.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (let i = 0; i < source.length; i++) {
    const char = source[i];

    if (char === '"') {
      if (inQuotes && source[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(field.trim());
      field = '';
      continue;
    }

    if (char === '\n' && !inQuotes) {
      row.push(field.trim());
      rows.push(row);
      row = [];
      field = '';
      continue;
    }

    field += char;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field.trim());
    rows.push(row);
  }

  return rows.filter(r => r.some(cell => cell.trim() !== ''));
}

function headerMatchScore(header: string, aliases: string[]): number {
  const normalized = normalizeHeaderKey(header);
  if (!normalized) return 0;

  let bestScore = 0;
  for (const alias of aliases) {
    const normalizedAlias = normalizeHeaderKey(alias);
    if (normalized === normalizedAlias) {
      bestScore = Math.max(bestScore, 10);
    } else if (normalized.includes(normalizedAlias)) {
      bestScore = Math.max(bestScore, 7);
    } else if (normalizedAlias.includes(normalized)) {
      bestScore = Math.max(bestScore, 4);
    }
  }

  return bestScore;
}

function resolveDayFromText(rawDay: string): string {
  const trimmed = rawDay?.trim() || '';
  if (!trimmed) return '';

  for (const { day, regex } of DAY_NAME_REGEX_MAP) {
    if (regex.test(trimmed)) return day;
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][parsed.getDay()];
    return dayName;
  }

  return normalizeDay(trimmed);
}

function detectColumns(headers: string[]): ColumnDetection | null {
  const entries = headers.map((header, index) => ({
    original: header,
    key: normalizeHeaderKey(header),
    index,
  }));

  const findBest = (aliases: string[], exclude: Set<number>): { key: string; index: number; score: number } | null => {
    let best: { key: string; index: number; score: number } | null = null;
    for (const entry of entries) {
      if (!entry.key || exclude.has(entry.index)) continue;
      const score = headerMatchScore(entry.original, aliases);
      if (score === 0) continue;
      if (!best || score > best.score) {
        best = { key: entry.key, index: entry.index, score };
      }
    }
    return best;
  };

  const used = new Set<number>();
  const day = findBest(HEADER_ALIASES.day, used);
  if (day) used.add(day.index);

  const date = findBest(HEADER_ALIASES.date, used);
  if (date) used.add(date.index);

  const time = findBest(HEADER_ALIASES.time, used);
  if (!time) return null;
  used.add(time.index);

  const className = findBest(HEADER_ALIASES.className, used);
  if (!className) return null;
  used.add(className.index);

  const trainer = findBest(HEADER_ALIASES.trainer, used);
  if (!trainer) return null;
  used.add(trainer.index);

  const location = findBest(HEADER_ALIASES.location, used);
  if (location) used.add(location.index);

  const cover = findBest(HEADER_ALIASES.cover, used);
  if (cover) used.add(cover.index);

  const notes = findBest(HEADER_ALIASES.notes, used);
  if (notes) used.add(notes.index);

  const theme = findBest(HEADER_ALIASES.theme, used);

  const coverByDay: Partial<Record<string, string>> = {};
  for (const entry of entries) {
    const isCoverField = headerMatchScore(entry.original, HEADER_ALIASES.cover) > 0;
    if (!isCoverField) continue;

    const resolvedDay = resolveDayFromText(entry.original);
    if (resolvedDay && DAYS_IN_ORDER.includes(resolvedDay)) {
      coverByDay[resolvedDay] = entry.key;
    }
  }

  if (!day && !date) {
    return null;
  }

  return {
    day: day?.key,
    date: date?.key,
    time: time.key,
    className: className.key,
    trainer: trainer.key,
    location: location?.key,
    cover: cover?.key,
    notes: notes?.key,
    theme: theme?.key,
    coverByDay,
  };
}

function detectionScore(columns: ColumnDetection | null): number {
  if (!columns) return -1;
  let score = 0;
  if (columns.day || columns.date) score += 3;
  if (columns.time) score += 3;
  if (columns.className) score += 3;
  if (columns.trainer) score += 3;
  if (columns.location) score += 1;
  if (columns.cover) score += 1;
  if (columns.notes) score += 1;
  if (columns.theme) score += 1;
  score += Object.keys(columns.coverByDay).length;
  return score;
}

/**
 * Parse CSV string into rows using auto-detected header row.
 */
function parseCSVString(csvString: string): ParsedCSV {
  const table = parseCSVTable(csvString);
  if (table.length === 0) {
    return { rows: [], headers: [], columns: null, headerRowIndex: 0 };
  }

  let bestHeaderRowIndex = 0;
  let bestColumns: ColumnDetection | null = detectColumns(table[0] || []);
  let bestScore = detectionScore(bestColumns);

  const maxScanRows = Math.min(table.length, 12);
  for (let rowIdx = 0; rowIdx < maxScanRows; rowIdx++) {
    const row = table[rowIdx];
    const nonEmptyCells = row.filter(cell => cell.trim()).length;
    if (nonEmptyCells < 3) continue;

    const columns = detectColumns(row);
    const score = detectionScore(columns);
    if (score > bestScore) {
      bestScore = score;
      bestColumns = columns;
      bestHeaderRowIndex = rowIdx;
    }
  }

  const headers = table[bestHeaderRowIndex] || [];
  const normalizedHeaders = headers.map((header, index) => {
    const normalized = normalizeHeaderKey(header);
    return normalized || `col_${index}`;
  });

  const rows: CSVRow[] = [];
  for (let rowIdx = bestHeaderRowIndex + 1; rowIdx < table.length; rowIdx++) {
    const rawValues = table[rowIdx];
    if (!rawValues || rawValues.every(value => !value.trim())) continue;

    const row: CSVRow = {};
    normalizedHeaders.forEach((headerKey, colIndex) => {
      row[headerKey] = rawValues[colIndex]?.trim() || '';
    });
    rows.push(row);
  }

  return {
    rows,
    headers,
    columns: bestColumns,
    headerRowIndex: bestHeaderRowIndex,
  };
}

function resolveCoverForDay(row: CSVRow, columns: ColumnDetection, day: string): string {
  const daySpecificKey = columns.coverByDay[day];
  const daySpecificValue = daySpecificKey ? row[daySpecificKey]?.trim() || '' : '';
  const genericCover = columns.cover ? row[columns.cover]?.trim() || '' : '';
  return daySpecificValue || genericCover;
}

function isKnownTrainerName(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return false;

  if (EXCLUDED_TRAINERS.some(name => name.toLowerCase() === normalized)) {
    return true;
  }

  return knownTeachers.some(name => name.toLowerCase() === normalized);
}

function isLikelyValidClassName(rawClassName: string, normalizedClassName: string): boolean {
  const raw = rawClassName.trim().toLowerCase();
  const normalized = normalizedClassName.trim().toLowerCase();
  if (!raw || !normalized) return false;

  if (!isRecognizedClassName(rawClassName, normalizedClassName)) return false;

  if (normalized.startsWith('studio ')) return true;
  if (CLASS_KEYWORDS.some(keyword => raw.includes(keyword) || normalized.includes(keyword))) return true;
  if (isKnownTrainerName(raw)) return false;

  return isRecognizedClassName(rawClassName, normalizedClassName);
}

function normalizeRow(row: CSVRow, columns: ColumnDetection): NormalizedRowData | null {
  const daySource = (columns.day && row[columns.day]) || (columns.date && row[columns.date]) || '';
  const day = resolveDayFromText(daySource);
  const timeRaw = row[columns.time] || '';
  const time = normalizeTime(timeRaw);
  const classNameRaw = row[columns.className] || '';
  const trainerRaw = row[columns.trainer] || '';
  const locationRaw = columns.location ? row[columns.location] || '' : '';
  const notes = columns.notes ? row[columns.notes] || '' : '';
  const theme = columns.theme ? row[columns.theme] || '' : '';

  if (!day || !time || !classNameRaw) return null;
  if (shouldExcludeClassName(classNameRaw)) return null;

  const coverRaw = resolveCoverForDay(row, columns, day);
  if (shouldExcludeClass(trainerRaw, coverRaw)) return null;

  const trainerEffectiveRaw = coverRaw || trainerRaw;
  const trainer = normalizeTrainer(trainerEffectiveRaw);
  const cover = normalizeTrainer(coverRaw || '');
  const className = normalizeClassName(classNameRaw);
  const location = normalizeLocation(locationRaw) || '';

  if (!trainer || !className) return null;
  if (!isLikelyValidClassName(classNameRaw, className)) return null;

  return {
    day,
    time,
    timeRaw,
    className,
    trainer,
    trainerRaw: trainerRaw.trim(),
    cover,
    location,
    notes,
    theme: theme || undefined,
  };
}

/**
 * Determine class level from class name
 */
function determineLevel(className: string, levels: WeekSchedule['levels']): ClassLevel | undefined {
  const normalized = normalizeClassName(className);
  const baseClass = normalized.replace(/\s*\(.*?\)\s*/g, '').trim();

  if (levels.beginner.some(c => normalizeClassName(c) === baseClass)) return 'beginner';
  if (levels.intermediate.some(c => normalizeClassName(c) === baseClass)) return 'intermediate';
  if (levels.advanced.some(c => normalizeClassName(c) === baseClass)) return 'advanced';

  return undefined;
}

const DAYS_IN_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/**
 * Parse CSV data into WeekSchedule format
 */
export function parseCSVToSchedule(csvString: string): WeekSchedule | null {
  try {
    if (isGridStyleCSV(csvString)) {
      const gridResult = parseGridCSV(csvString);
      if (gridResult) return gridResult;
    }

    const parsed = parseCSVString(csvString);
    if (parsed.rows.length === 0 || !parsed.columns) return null;

    const levels: WeekSchedule['levels'] = {
      beginner: ['BARRE 57', 'powerCycle'],
      intermediate: ['CARDIO BARRE', 'MAT 57', 'CARDIO BARRE PLUS', 'FIT', 'BACK BODY BLAZE', 'STRENGTH LAB'],
      advanced: ['HIIT', 'AMPED UP'],
    };

    const dayMap = new Map<string, ScheduleClass[]>();

    parsed.rows.forEach((row, index) => {
      const normalized = normalizeRow(row, parsed.columns!);
      if (!normalized) return;

      if (!dayMap.has(normalized.day)) {
        dayMap.set(normalized.day, []);
      }

      dayMap.get(normalized.day)!.push({
        id: `csv-${index}`,
        time: normalized.time,
        className: normalized.className,
        trainer: normalized.trainer,
        location: normalized.location || undefined,
        theme: normalized.theme,
        level: determineLevel(normalized.className, levels),
      });
    });

    const days: DaySchedule[] = [];
    for (const day of DAYS_IN_ORDER) {
      const classes = dayMap.get(day);
      if (!classes || classes.length === 0) continue;

      classes.sort((a, b) => a.time.localeCompare(b.time));
      days.push({ day, classes });
    }

    if (days.length === 0) return null;

    return {
      id: crypto.randomUUID(),
      weekStart: '',
      weekEnd: '',
      location: 'CSV Import',
      days,
      levels,
    };
  } catch (error) {
    console.error('Error parsing CSV:', error);
    return null;
  }
}

function buildRawClassData(row: NormalizedRowData, index: number): ClassData {
  return {
    day: row.day,
    timeRaw: row.timeRaw || row.time,
    timeDate: null,
    time: row.time,
    location: row.location || '',
    className: row.className,
    trainer1: row.trainer,
    cover: row.cover,
    notes: row.notes || '',
    theme: row.theme,
    uniqueKey: `${row.day}-${row.time}-${row.className}-${row.trainer}-${index}`,
  };
}

/**
 * Read CSV file and parse to schedule
 */
export async function readCSVFile(file: File): Promise<{ schedule: WeekSchedule | null; rawData: ClassData[] }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      const csvString = e.target?.result as string;
      if (!csvString) {
        resolve({ schedule: null, rawData: [] });
        return;
      }

      if (isGridStyleCSV(csvString)) {
        const schedule = parseGridCSV(csvString);
        const rawData: ClassData[] = [];

        if (schedule) {
          let rowIndex = 0;
          schedule.days.forEach(day => {
            day.classes.forEach(cls => {
              rawData.push({
                day: day.day,
                timeRaw: cls.time,
                timeDate: null,
                time: cls.time,
                location: cls.location || '',
                className: cls.className,
                trainer1: cls.trainer,
                cover: '',
                notes: '',
                theme: cls.theme,
                uniqueKey: `${day.day}-${cls.time}-${cls.className}-${cls.trainer}-${rowIndex++}`,
              });
            });
          });
        }

        resolve({ schedule, rawData });
        return;
      }

      const parsed = parseCSVString(csvString);
      const schedule = parseCSVToSchedule(csvString);
      const rawData: ClassData[] = [];

      if (parsed.columns) {
        parsed.rows.forEach((row, index) => {
          const normalized = normalizeRow(row, parsed.columns!);
          if (!normalized) return;
          rawData.push(buildRawClassData(normalized, index));
        });
      }

      resolve({ schedule, rawData });
    };

    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };

    reader.readAsText(file);
  });
}
