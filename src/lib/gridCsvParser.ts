import type { WeekSchedule, DaySchedule, ScheduleClass, ClassLevel } from '@/types/schedule';
import { normalizeTimeString, normalizeTrainerName, normalizeLocationName, normalizeClassName } from './normalizers-new';

/**
 * Parse a grid-style schedule CSV where:
 * - Row 1: empty/title
 * - Row 2: dates per day block
 * - Row 3: day names
 * - Row 4+: time slots with class data
 * - Each day = 5 columns: Location, Class, Trainer1, Trainer2, Cover
 * - Column A = time
 */

interface DayBlock {
  day: string;
  date: string;
  startCol: number; // 0-indexed column for Location
}

const DAYS_IN_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/**
 * Parse CSV line handling quotes
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Parse the full CSV into a 2D array
 */
function parseToGrid(csvString: string): string[][] {
  return csvString.trim().split('\n').map(line => parseCSVLine(line));
}

/**
 * Detect day blocks by scanning the date row and day name row
 */
function detectDayBlocks(grid: string[][]): DayBlock[] {
  if (grid.length < 3) return [];

  const dateRow = grid[1]; // Row 2 (0-indexed: 1)
  const dayRow = grid[2];  // Row 3 (0-indexed: 2)
  const blocks: DayBlock[] = [];

  // Strategy 1: Find date cells (non-empty cells in row 2, skipping col A)
  for (let col = 1; col < dateRow.length; col++) {
    const cell = dateRow[col];
    if (cell && cell.trim()) {
      // Check if it looks like a date
      const isDate = /\d{1,2}\s+\w+\s+\d{4}/.test(cell.trim()) || 
                     /\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}/.test(cell.trim());
      if (isDate) {
        // Find matching day name from row 3
        let dayName = '';
        // Check same column or nearby columns in day row
        for (let dc = col; dc < Math.min(col + 5, dayRow.length); dc++) {
          const candidate = dayRow[dc]?.trim();
          if (candidate && DAYS_IN_ORDER.some(d => d.toLowerCase() === candidate.toLowerCase())) {
            dayName = DAYS_IN_ORDER.find(d => d.toLowerCase() === candidate.toLowerCase()) || '';
            break;
          }
        }

        // If no day name found, infer from position
        if (!dayName && blocks.length < 7) {
          dayName = DAYS_IN_ORDER[blocks.length];
        }

        blocks.push({
          day: dayName,
          date: cell.trim(),
          startCol: col,
        });
      }
    }
  }

  // Strategy 2 fallback: scan day name row directly
  if (blocks.length === 0) {
    for (let col = 1; col < dayRow.length; col++) {
      const cell = dayRow[col]?.trim().toLowerCase();
      const matchedDay = DAYS_IN_ORDER.find(d => d.toLowerCase() === cell);
      if (matchedDay) {
        blocks.push({
          day: matchedDay,
          date: dateRow[col]?.trim() || '',
          startCol: col,
        });
      }
    }
  }

  return blocks;
}

/**
 * Parse a date string like "9 Feb 2026" into components
 */
function parseDateString(dateStr: string): { day: number; month: string; year: number } | null {
  const match = dateStr.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
  if (!match) return null;
  return { day: parseInt(match[1]), month: match[2], year: parseInt(match[3]) };
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
 * Check if this CSV looks like a grid-style schedule
 */
export function isGridStyleCSV(csvString: string): boolean {
  const grid = parseToGrid(csvString);
  if (grid.length < 4) return false;

  const blocks = detectDayBlocks(grid);
  if (blocks.length < 2) return false;

  // Check if column A has time-like values starting from row 4
  let timeCount = 0;
  for (let row = 3; row < Math.min(grid.length, 15); row++) {
    const cell = grid[row]?.[0]?.trim();
    // Check for time patterns including comma-separated times like "7,15 PM"
    // Also check if normalizeTimeString can parse it
    if (cell) {
      const hasTimePattern = /\d{1,2}[:.,:;]\d{2}/.test(cell) || /\d{1,2}\s*(AM|PM)/i.test(cell);
      const normalizedTime = hasTimePattern ? normalizeTimeString(cell) : '';
      if (normalizedTime) timeCount++;
    }
  }

  return timeCount >= 3;
}

/**
 * Parse grid-style CSV into WeekSchedule
 */
export function parseGridCSV(csvString: string): WeekSchedule | null {
  try {
    const grid = parseToGrid(csvString);
    if (grid.length < 4) return null;

    const dayBlocks = detectDayBlocks(grid);
    if (dayBlocks.length === 0) return null;

    const daySchedules: Map<string, ScheduleClass[]> = new Map();
    let classIndex = 0;

    // Iterate through data rows (row 4+, 0-indexed: 3+)
    for (let rowIdx = 3; rowIdx < grid.length; rowIdx++) {
      const row = grid[rowIdx];
      const rawTime = row[0]?.trim();

      // Skip rows without a time value
      if (!rawTime) continue;
      
      // Normalize time to handle special characters like commas
      const time = normalizeTimeString(rawTime);
      
      // Skip if normalization failed
      if (!time) continue;

      // For each day block, extract class data
      for (const block of dayBlocks) {
        const col = block.startCol;
        const rawLocation = row[col]?.trim() || '';
        const rawClassName = row[col + 1]?.trim() || '';
        const rawTrainer1 = row[col + 2]?.trim() || '';
        const rawTrainer2 = row[col + 3]?.trim() || '';
        const rawCover = row[col + 4]?.trim() || '';

        // Skip if no class data
        if (!rawClassName && !rawTrainer1) continue;

        // Apply normalization
        const location = rawLocation ? normalizeLocationName(rawLocation) : undefined;
        const className = normalizeClassName(rawClassName);
        const trainer1 = normalizeTrainerName(rawTrainer1);
        const cover = rawCover ? normalizeTrainerName(rawCover) : '';
        
        // Apply cover logic: if cover is present, use cover as the trainer
        const effectiveTrainer = cover || trainer1;

        if (!daySchedules.has(block.day)) {
          daySchedules.set(block.day, []);
        }

        daySchedules.get(block.day)!.push({
          id: `grid-${classIndex++}`,
          time,
          className: className || 'Unknown',
          trainer: effectiveTrainer,
          location: location || undefined,
          level: determineLevel(className),
        });
      }
    }

    // Build DaySchedule array in order
    const days: DaySchedule[] = [];
    for (const dayName of DAYS_IN_ORDER) {
      const classes = daySchedules.get(dayName);
      if (classes && classes.length > 0) {
        // Find date for this day
        const block = dayBlocks.find(b => b.day === dayName);
        days.push({
          day: dayName,
          date: block?.date,
          classes: classes.sort((a, b) => {
            const tA = a.time.replace(/[^0-9:]/g, '');
            const tB = b.time.replace(/[^0-9:]/g, '');
            return tA.localeCompare(tB);
          }),
        });
      }
    }

    // Determine week start/end from dates
    const dates = dayBlocks.map(b => b.date).filter(Boolean);
    const weekStart = dates[0] || '';
    const weekEnd = dates[dates.length - 1] || '';

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
