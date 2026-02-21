import type { WeekSchedule, DaySchedule, ScheduleClass, ClassLevel } from '@/types/schedule';
import { normalizeTime, normalizeTrainer, normalizeLocation, normalizeClassName, normalizeDay } from './normalizers';
import { shouldExcludeClass } from './csvParser';

/**
 * Parse a grid-style schedule CSV where:
 * - Row 1: empty/title
 * - Row 2: dates per day block
 * - Row 3: day names
 * - Row 4+: time slots with class data
 * - Each day = 6 columns: Location, Class, Trainer1, Trainer2, Cover, Theme
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
 * Updated for 6-column format: Location, Class, Trainer1, Trainer2, Cover, Theme
 */
function detectDayBlocks(grid: string[][]): DayBlock[] {
  if (grid.length < 3) return [];

  const dateRow = grid[0]; // Row 1 (0-indexed: 0) - dates are in the first row
  const dayRow = grid[1];  // Row 2 (0-indexed: 1) - day names are in the second row
  const blocks: DayBlock[] = [];

  // Strategy 1: Find date cells (non-empty cells in row 1, skipping col A)
  // Each day starts at columns: 1, 7, 13, 19, 25, 31, 37 (pattern: 1 + dayIndex * 6)
  const expectedColumns = [1, 7, 13, 19, 25, 31, 37]; // Monday through Sunday
  
  for (let i = 0; i < expectedColumns.length && i < DAYS_IN_ORDER.length; i++) {
    const col = expectedColumns[i];
    if (col >= dateRow.length) break;
    
    const cell = dateRow[col];
    if (cell && cell.trim()) {
      // Check if it looks like a date (flexible patterns)
      const isDate = /\d{1,2}[\s\-\/]\w+/.test(cell.trim()) || 
                     /\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}/.test(cell.trim()) ||
                     /\w+[\s\-]\d{1,2}/.test(cell.trim());
      
      if (isDate) {
        const dayName = DAYS_IN_ORDER[i];
        blocks.push({
          day: dayName,
          date: cell.trim(),
          startCol: col,
        });
      }
    }
  }

  // Strategy 2 fallback: scan day name row directly at expected positions
  if (blocks.length === 0) {
    for (let i = 0; i < expectedColumns.length && i < DAYS_IN_ORDER.length; i++) {
      const col = expectedColumns[i];
      if (col >= dayRow.length) break;
      
      const cell = dayRow[col]?.trim().toLowerCase();
      const expectedDay = DAYS_IN_ORDER[i];
      if (cell && expectedDay.toLowerCase().includes(cell) || cell.includes(expectedDay.toLowerCase())) {
        blocks.push({
          day: expectedDay,
          date: dateRow[col]?.trim() || '',
          startCol: col,
        });
      }
    }
  }

  // Strategy 3: If still no blocks, try scanning all columns for day names
  if (blocks.length === 0) {
    for (let col = 1; col < Math.min(dayRow.length, 50); col++) {
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

  // Check if column A has time-like values starting from row 3 (0-indexed: 2)
  let timeCount = 0;
  for (let row = 3; row < Math.min(grid.length, 15); row++) {
    const cell = grid[row]?.[0]?.trim();
    // Check for time patterns including comma-separated times like "7,15 PM"
    // Also check if normalizeTimeString can parse it
    if (cell) {
      const hasTimePattern = /\d{1,2}[:.,:;]\d{2}/.test(cell) || /\d{1,2}\s*(AM|PM)/i.test(cell);
      const normalizedTime = hasTimePattern ? normalizeTime(cell) : '';
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

    // Iterate through data rows (row 3+, 0-indexed: 2+) 
    // Row structure: 0=dates, 1=days, 2=headers, 3+=data
    for (let rowIdx = 3; rowIdx < grid.length; rowIdx++) {
      const row = grid[rowIdx];
      const rawTime = row[0]?.trim();

      // Skip rows without a time value
      if (!rawTime) continue;
      
      // Normalize time to handle special characters like commas
      const time = normalizeTime(rawTime);
      
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
        const rawTheme = row[col + 5]?.trim() || '';

        // Skip if no class data
        if (!rawClassName && !rawTrainer1) continue;

        // Check if class should be excluded
        if (shouldExcludeClass(rawTrainer1, rawCover)) {
          continue;
        }

        // Skip classes with "hosted" in the name (case-insensitive)
        if (rawClassName && rawClassName.toLowerCase().includes('hosted')) {
          continue;
        }

        // Apply normalization
        const location = rawLocation ? normalizeLocation(rawLocation) : undefined;
        const className = normalizeClassName(rawClassName);
        const trainer1 = normalizeTrainer(rawTrainer1);
        const cover = (rawCover && rawCover.trim() !== '') ? normalizeTrainer(rawCover) : '';
        const theme = rawTheme || undefined;
        
        // Apply cover logic: if cover is present and non-empty, use cover as the trainer
        const effectiveTrainer = cover ? cover : trainer1;

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
          theme,
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
