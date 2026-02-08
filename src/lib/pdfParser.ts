import * as pdfjsLib from 'pdfjs-dist';
import type { WeekSchedule, DaySchedule, ScheduleClass } from '@/types/schedule';
import { classNameMappings, teacherNameMappings, knownTeachers, knownClasses } from './normalizationMaps';
import { normalizeClassName, normalizeTrainer, normalizeTime, getClassLevel } from './normalizers';

// Set up worker from CDN
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

interface TextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

const DAYS_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAY_PATTERNS = DAYS_ORDER.map(d => ({
  day: d,
  regex: new RegExp(`\\b${d}\\b`, 'i'),
}));

/**
 * Extract structured text from PDF
 */
async function extractTextItems(file: File): Promise<TextItem[][]> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  const allPages: TextItem[][] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const items: TextItem[] = (textContent.items as any[])
      .filter(item => item.str && item.str.trim())
      .map(item => ({
        str: item.str,
        x: item.transform[4],
        y: item.transform[5],
        width: item.width,
        height: item.height,
      }));
    allPages.push(items);
  }

  return allPages;
}

/**
 * Group text items into lines based on Y position
 */
function groupIntoLines(items: TextItem[]): string[] {
  if (items.length === 0) return [];

  // Sort by Y (descending = top to bottom), then X (ascending = left to right)
  const sorted = [...items].sort((a, b) => {
    const yDiff = b.y - a.y;
    if (Math.abs(yDiff) > 3) return yDiff;
    return a.x - b.x;
  });

  const lines: string[] = [];
  let currentY = sorted[0].y;
  let currentLine = '';

  for (const item of sorted) {
    if (Math.abs(item.y - currentY) > 3) {
      if (currentLine.trim()) lines.push(currentLine.trim());
      currentLine = '';
      currentY = item.y;
    }
    currentLine += (currentLine ? ' ' : '') + item.str;
  }
  if (currentLine.trim()) lines.push(currentLine.trim());

  return lines;
}

/**
 * Detect location from PDF text
 */
function detectLocation(lines: string[]): string {
  const firstLines = lines.slice(0, 10).join(' ').toUpperCase();

  const locationKeywords: Record<string, string> = {
    'KEMPS': 'Kwality House, Kemps Corner',
    'KWALITY': 'Kwality House, Kemps Corner',
    'BANDRA': 'Supreme HQ, Bandra',
    'SUPREME': 'Supreme HQ, Bandra',
    'KENKERE': 'Kenkere House',
    'ANNEX': 'Kenkere House',
    'WILLINGDON': 'South United Football Club',
    'SOUTH UNITED': 'South United Football Club',
    'COPPER': 'The Studio by Copper + Cloves',
    'WEWORK GALAXY': 'WeWork Galaxy',
    'WEWORK PRESTIGE': 'WeWork Prestige Central',
    'OUTDOOR': 'Physique Outdoor Pop-up',
  };

  for (const [keyword, location] of Object.entries(locationKeywords)) {
    if (firstLines.includes(keyword)) return location;
  }

  return 'Unknown Location';
}

/**
 * Detect date range from text
 */
function detectDateRange(lines: string[]): { weekStart: string; weekEnd: string } {
  const text = lines.slice(0, 15).join(' ');
  
  // Look for date patterns like "9 Feb 2026 - 15 Feb 2026" or "February 9 - 15, 2026"
  const rangeMatch = text.match(/(\d{1,2}\s+\w+\s+\d{4})\s*[-–to]+\s*(\d{1,2}\s+\w+\s+\d{4})/i);
  if (rangeMatch) return { weekStart: rangeMatch[1], weekEnd: rangeMatch[2] };

  const altMatch = text.match(/(\w+\s+\d{1,2})\s*[-–to]+\s*(\w+\s+\d{1,2}),?\s*(\d{4})/i);
  if (altMatch) return { weekStart: `${altMatch[1]} ${altMatch[3]}`, weekEnd: `${altMatch[2]} ${altMatch[3]}` };

  return { weekStart: '', weekEnd: '' };
}

/**
 * Check if a string is a time pattern
 */
function isTimePattern(str: string): boolean {
  return /^\d{1,2}[:.]\d{2}\s*(AM|PM)/i.test(str.trim()) ||
    /^\d{1,2}\s*(AM|PM)/i.test(str.trim()) ||
    /^\d{1,2}:\d{2}$/i.test(str.trim());
}

/**
 * Try to match a string to a known class name
 */
function matchClassName(text: string): string | null {
  const cleaned = text.trim();
  if (!cleaned) return null;

  // Direct mapping
  const normalized = normalizeClassName(cleaned);
  if (normalized.startsWith('Studio ')) return normalized;

  // Try uppercase
  const upper = cleaned.toUpperCase();
  for (const [key, value] of Object.entries(classNameMappings)) {
    if (upper.includes(key.toUpperCase())) return value;
  }

  return null;
}

/**
 * Try to match a string to a known trainer
 */
function matchTrainer(text: string): string | null {
  const cleaned = text.trim();
  if (!cleaned) return null;

  const normalized = normalizeTrainer(cleaned);
  if (knownTeachers.includes(normalized)) return normalized;

  // Check if any known teacher name appears in the text
  for (const teacher of knownTeachers) {
    const firstName = teacher.split(' ')[0];
    if (cleaned.toLowerCase().includes(firstName.toLowerCase())) {
      return teacher;
    }
  }

  return null;
}

/**
 * Parse lines within a day section to extract classes
 */
function parseDayClasses(lines: string[], dayIndex: number): ScheduleClass[] {
  const classes: ScheduleClass[] = [];
  let classCounter = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Try to find time at the start of the line
    const timeMatch = line.match(/^(\d{1,2}[:.]\d{2}\s*(AM|PM)|\d{1,2}\s*(AM|PM))/i);
    if (!timeMatch) {
      // Try to find time anywhere in the line
      const inlineTime = line.match(/(\d{1,2}[:.]\d{2}\s*(AM|PM))/i);
      if (!inlineTime) continue;
    }

    const time = timeMatch ? timeMatch[0].trim() : '';
    const rest = timeMatch ? line.slice(timeMatch[0].length).trim() : line;

    // Try to extract class name and trainer from the rest of the line
    let className: string | null = null;
    let trainer: string | null = null;

    // Try matching the whole rest as class + trainer
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

    // If no class found from parts, try the whole rest
    if (!className) className = matchClassName(rest);

    // If still no class, try word combinations
    if (!className) {
      const words = rest.split(/\s+/);
      for (let w = 0; w < words.length; w++) {
        for (let len = Math.min(5, words.length - w); len > 0; len--) {
          const candidate = words.slice(w, w + len).join(' ');
          className = matchClassName(candidate);
          if (className) break;
        }
        if (className) break;
      }
    }

    // Look for trainer in remaining text
    if (!trainer) {
      const words = rest.split(/\s+/);
      for (const word of words) {
        trainer = matchTrainer(word);
        if (trainer) break;
      }
    }

    // Also check next line for trainer if not found
    if (!trainer && i + 1 < lines.length) {
      trainer = matchTrainer(lines[i + 1].trim());
    }

    if (time && (className || trainer)) {
      const normalizedName = className || rest;
      const level = getClassLevel(normalizedName);
      classes.push({
        id: `pdf-${dayIndex}-${classCounter++}`,
        time: time,
        className: className || rest,
        trainer: trainer || 'TBD',
        level,
      });
    }
  }

  return classes;
}

/**
 * Parse PDF text into schedule structure
 */
function parseScheduleFromLines(lines: string[]): DaySchedule[] {
  const daySchedules: DaySchedule[] = [];
  let currentDay: string | null = null;
  let currentLines: string[] = [];

  for (const line of lines) {
    // Check if this line is a day header
    let foundDay: string | null = null;
    for (const { day, regex } of DAY_PATTERNS) {
      if (regex.test(line) && line.trim().length < 30) {
        foundDay = day;
        break;
      }
    }

    if (foundDay) {
      // Save previous day
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

  // Don't forget the last day
  if (currentDay && currentLines.length > 0) {
    const dayIdx = DAYS_ORDER.indexOf(currentDay);
    const classes = parseDayClasses(currentLines, dayIdx);
    if (classes.length > 0) {
      daySchedules.push({ day: currentDay, classes });
    }
  }

  // Sort classes within each day by time
  for (const day of daySchedules) {
    day.classes.sort((a, b) => {
      const tA = normalizeTime(a.time);
      const tB = normalizeTime(b.time);
      return tA.localeCompare(tB);
    });
  }

  return daySchedules;
}

/**
 * Main PDF parsing function
 */
export async function parsePDF(file: File): Promise<WeekSchedule> {
  const pages = await extractTextItems(file);
  const allLines: string[] = [];

  for (const pageItems of pages) {
    const lines = groupIntoLines(pageItems);
    allLines.push(...lines);
  }

  const location = detectLocation(allLines);
  const { weekStart, weekEnd } = detectDateRange(allLines);
  const days = parseScheduleFromLines(allLines);

  // Set location on all classes
  for (const day of days) {
    for (const cls of day.classes) {
      cls.location = location;
    }
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
