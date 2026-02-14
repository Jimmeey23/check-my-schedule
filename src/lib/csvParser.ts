import type { WeekSchedule, DaySchedule, ScheduleClass, ClassLevel } from '@/types/schedule';
import { normalizeTime, normalizeTrainer, normalizeLocation, normalizeClassName, normalizeDay } from './normalizers';
import { isGridStyleCSV, parseGridCSV } from './gridCsvParser';

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
  'Pooja'
];

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
  
  // Debug logging for excluded trainers
  if (shouldExclude) {
    console.log(`[CSV Parser] Excluding class with trainer: "${trainerToCheck}"`);
  }
  
  return shouldExclude;
}

interface CSVRow {
  [key: string]: string;
}

/**
 * Parse CSV string into rows
 */
function parseCSVString(csvString: string): CSVRow[] {
  const lines = csvString.trim().split('\n');
  if (lines.length < 2) return [];
  
  // Parse header
  const headers = parseCSVLine(lines[0]);
  const rows: CSVRow[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length === 0 || values.every(v => !v.trim())) continue;
    
    const row: CSVRow = {};
    headers.forEach((header, index) => {
      row[header.trim().toLowerCase()] = values[index]?.trim() || '';
    });
    rows.push(row);
  }
  
  return rows;
}

/**
 * Parse a single CSV line handling quotes
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
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  
  result.push(current);
  return result;
}

/**
 * Detect column mappings from headers
 */
function detectColumns(headers: string[]): {
  day: string;
  time: string;
  className: string;
  trainer: string;
  location?: string;
  cover?: string;
} | null {
  const lowerHeaders = headers.map(h => h.toLowerCase().trim());
  
  // Common column name variations
  const dayVariations = ['day', 'weekday', 'dayofweek', 'day_of_week'];
  const timeVariations = ['time', 'start_time', 'starttime', 'class_time', 'classtime', 'start time', 'class time'];
  const classVariations = ['class', 'classname', 'class_name', 'class name', 'workout', 'session', 'type'];
  const trainerVariations = ['trainer', 'instructor', 'teacher', 'coach', 'trainer_name', 'instructor_name'];
  const locationVariations = ['location', 'studio', 'room', 'venue', 'place'];
  const coverVariations = ['cover', 'substitute', 'sub', 'replacement', 'cover_trainer', 'sub_trainer'];
  
  const findColumn = (variations: string[]) => {
    for (const v of variations) {
      const index = lowerHeaders.findIndex(h => h === v || h.includes(v));
      if (index !== -1) return headers[index];
    }
    return null;
  };
  
  const day = findColumn(dayVariations);
  const time = findColumn(timeVariations);
  const className = findColumn(classVariations);
  const trainer = findColumn(trainerVariations);
  const location = findColumn(locationVariations);
  const cover = findColumn(coverVariations);
  
  if (!day || !time || !className || !trainer) {
    return null;
  }
  
  return { day, time, className, trainer, location: location || undefined, cover: cover || undefined };
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

/**
 * Parse CSV data into WeekSchedule format
 */
export function parseCSVToSchedule(csvString: string): WeekSchedule | null {
  try {
    // Try grid-style parsing first (spreadsheet layout with days as column groups)
    if (isGridStyleCSV(csvString)) {
      const gridResult = parseGridCSV(csvString);
      if (gridResult) return gridResult;
    }

    // Fall back to standard row-per-record CSV parsing
    const rows = parseCSVString(csvString);
    if (rows.length === 0) return null;
    
    // Get headers from first row keys
    const headers = Object.keys(rows[0]);
    const columns = detectColumns(headers);
    
    if (!columns) {
      console.error('Could not detect required columns in CSV');
      return null;
    }
    
    // Default levels (can be overridden if CSV contains this info)
    const levels: WeekSchedule['levels'] = {
      beginner: ['BARRE 57', 'powerCycle'],
      intermediate: ['CARDIO BARRE', 'MAT 57', 'CARDIO BARRE PLUS', 'FIT', 'BACK BODY BLAZE', 'STRENGTH LAB'],
      advanced: ['HIIT', 'AMPED UP'],
    };
    
    // Group classes by day
    const dayMap = new Map<string, ScheduleClass[]>();
    const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    
    rows.forEach((row, index) => {
      const dayRaw = row[columns.day.toLowerCase()];
      const rawTime = row[columns.time.toLowerCase()];
      const rawClassName = row[columns.className.toLowerCase()];
      const rawTrainer = row[columns.trainer.toLowerCase()];
      const rawLocation = columns.location ? row[columns.location.toLowerCase()] : undefined;
      const rawCover = columns.cover ? (row[columns.cover.toLowerCase()]?.trim() || '') : '';
      
      // Check if class should be excluded
      if (shouldExcludeClass(rawTrainer, rawCover)) {
        return;
      }
      
      // Normalize time to handle special characters like commas
      const time = normalizeTime(rawTime);
      
      // Normalize class name, trainer, and location
      const className = normalizeClassName(rawClassName);
      // Use cover if present and non-empty, otherwise use trainer
      const trainerToUse = (rawCover && rawCover.trim() !== '') ? rawCover : rawTrainer;
      const trainer = normalizeTrainer(trainerToUse);
      const location = rawLocation ? normalizeLocation(rawLocation) : undefined;
      
      if (!dayRaw || !time || !className || !trainer) return;
      
      const day = normalizeDay(dayRaw);
      
      if (!dayMap.has(day)) {
        dayMap.set(day, []);
      }
      
      dayMap.get(day)!.push({
        id: `csv-${index}`,
        time,
        className,
        trainer,
        location,
        level: determineLevel(className, levels),
      });
    });
    
    // Convert to DaySchedule array
    const days: DaySchedule[] = [];
    for (const day of dayOrder) {
      if (dayMap.has(day)) {
        days.push({
          day,
          classes: dayMap.get(day)!.sort((a, b) => {
            const timeA = a.time.replace(/[^0-9:]/g, '');
            const timeB = b.time.replace(/[^0-9:]/g, '');
            return timeA.localeCompare(timeB);
          }),
        });
      }
    }
    
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

/**
 * Read CSV file and parse to schedule
 */
export async function readCSVFile(file: File): Promise<{ schedule: WeekSchedule | null; rawData: any[] }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      const csvString = e.target?.result as string;
      
      // Check if grid-style CSV
      if (isGridStyleCSV(csvString)) {
        const schedule = parseGridCSV(csvString);
        const rawData: any[] = [];
        
        if (schedule) {
          schedule.days.forEach(day => {
            day.classes.forEach(cls => {
              rawData.push({
                day: day.day,
                time: cls.time,
                className: cls.className,
                trainer1: cls.trainer, // Already uses cover field if present
                trainer2: '',
                cover: '', // Cover already applied to trainer1
                location: cls.location || '',
              });
            });
          });
        }
        
        resolve({ schedule, rawData });
        return;
      }
      
      // Parse regular CSV
      const schedule = parseCSVToSchedule(csvString);
      const rawRows = parseCSVString(csvString);
      
      // Parse to raw array format for ClassData
      const rawData: any[] = [];
      if (schedule && rawRows.length > 0) {
        // Re-detect columns for raw data access
        const rawHeaders = Object.keys(rawRows[0] || {});
        const rawColumns = detectColumns(rawHeaders);
        
        schedule.days.forEach(day => {
          day.classes.forEach((cls, idx) => {
            // Find corresponding raw row to get cover field
            // Match by day and time (more reliable than class name which may be normalized differently)
            const rawRow = rawRows.find(r => {
              const dayField = rawColumns?.day.toLowerCase() || 'day';
              const timeField = rawColumns?.time.toLowerCase() || 'time';
              const rowDay = normalizeDay(r[dayField] || '');
              const rowTime = normalizeTime(r[timeField] || '');
              return rowDay === day.day && rowTime === cls.time;
            });
            
            // Use proper column names for field access
            const coverField = rawColumns?.cover?.toLowerCase() || 'cover';
            const trainerField = rawColumns?.trainer.toLowerCase() || 'trainer';
            
            const cover = rawRow?.[coverField]?.trim() || '';
            const originalTrainer1 = rawRow?.[trainerField] || '';
            
            // Use cover if present and non-empty, otherwise use original trainer1
            const effectiveTrainer = (cover && cover.trim() !== '') ? cover : originalTrainer1;
            
            rawData.push({
              day: day.day,
              time: cls.time,
              className: cls.className,
              trainer1: effectiveTrainer, // Use cover if available, otherwise original trainer
              trainer2: rawRow?.trainer2 || '',
              cover: cover,
              location: cls.location || '',
            });
          });
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
