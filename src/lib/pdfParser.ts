import * as pdfjsLib from 'pdfjs-dist';
import type { WeekSchedule, DaySchedule, ScheduleClass, PdfClassData } from '@/types/schedule';
import { classNameMappings, knownTeachers } from './normalizationMaps';
import { normalizeClassName, normalizeTrainer, normalizeTime, getClassLevel } from './normalizers';
import {
  normalizeTrainerName,
  normalizeClassName as normalizeClassNameNew,
  normalizeLocationName,
  normalizeTimeString,
  isValidClassName,
} from './normalizers-new';

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

// =====================================================================
// TEXT EXTRACTION
// =====================================================================

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
        x: Math.round(item.transform[4] * 100) / 100,
        y: Math.round(item.transform[5] * 100) / 100,
        width: item.width,
        height: item.height,
      }));
    allPages.push(items);
  }

  return allPages;
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

  const lines: string[] = [];
  let currentY = sorted[0].y;
  let currentLine = '';

  for (const item of sorted) {
    if (Math.abs(item.y - currentY) > yTolerance) {
      if (currentLine.trim()) lines.push(currentLine.trim());
      currentLine = '';
      currentY = item.y;
    }
    currentLine += (currentLine ? ' ' : '') + item.str;
  }
  if (currentLine.trim()) lines.push(currentLine.trim());

  return lines;
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
  const cleaned = text.trim();
  if (!cleaned) return null;

  const normalized = normalizeClassName(cleaned);
  if (normalized.startsWith('Studio ')) return normalized;

  const upper = cleaned.toUpperCase();
  for (const [key, value] of Object.entries(classNameMappings)) {
    if (upper.includes(key.toUpperCase())) return value;
  }

  return null;
}

function matchTrainer(text: string): string | null {
  const cleaned = text.trim();
  if (!cleaned) return null;

  const normalized = normalizeTrainer(cleaned);
  if (knownTeachers.includes(normalized)) return normalized;

  for (const teacher of knownTeachers) {
    const firstName = teacher.split(' ')[0];
    if (firstName.length >= 3 && cleaned.toLowerCase().includes(firstName.toLowerCase())) {
      return teacher;
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

    // Find time pattern
    const timeMatch = line.match(/^(\d{1,2}[:.]\d{2}\s*(AM|PM)|\d{1,2}\s*(AM|PM))/i);
    if (!timeMatch) {
      const inlineTime = line.match(/(\d{1,2}[:.]\d{2}\s*(AM|PM))/i);
      if (!inlineTime) continue;
    }

    const time = timeMatch ? timeMatch[0].trim() : '';
    const rest = timeMatch ? line.slice(timeMatch[0].length).trim() : line;

    let className: string | null = null;
    let trainer: string | null = null;

    const parts = rest.split(/\s{2,}|\t|[-–|]/);
    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      if (!className) { className = matchClassName(trimmed); if (className) continue; }
      if (!trainer) { trainer = matchTrainer(trimmed); if (trainer) continue; }
    }

    if (!className) className = matchClassName(rest);

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

    if (!trainer) {
      const words = rest.split(/\s+/);
      for (const word of words) {
        trainer = matchTrainer(word);
        if (trainer) break;
      }
    }

    if (!trainer && i + 1 < lines.length) {
      const nextLine = lines[i + 1].trim();
      if (!nextLine.match(/^\d{1,2}[:.]\d{2}\s*(AM|PM)/i) &&
          !DAY_PATTERNS.some(p => p.regex.test(nextLine) && nextLine.length < 30)) {
        trainer = matchTrainer(nextLine);
      }
    }

    if (time && (className || trainer)) {
      const normalizedName = className || rest;
      classes.push({
        id: `pdf-${dayIndex}-${classCounter++}`,
        time,
        className: className || rest,
        trainer: trainer || 'TBD',
        level: getClassLevel(normalizedName),
      });
    }
  }

  return classes;
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
    const lines = groupIntoLines(dayItems);
    const classes = parseDayClasses(lines, dayIdx);

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

// =====================================================================
// MAIN ENTRY POINT
// =====================================================================

export async function parsePDF(file: File): Promise<WeekSchedule> {
  const pages = await extractTextItems(file);

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
 * Parse PDF and return PdfClassData array with normalized data
 */
export async function parsePDFToClassData(file: File): Promise<PdfClassData[]> {
  const schedule = await parsePDF(file);
  const result: PdfClassData[] = [];

  for (const daySchedule of schedule.days) {
    for (const cls of daySchedule.classes) {
      const normalizedTrainer = normalizeTrainerName(cls.trainer);
      const normalizedClass = normalizeClassNameNew(cls.className);
      const normalizedLocation = normalizeLocationName(schedule.location);

      // Only include valid classes
      if (isValidClassName(normalizedClass)) {
        const uniqueKey = `${daySchedule.day}-${normalizeTimeString(cls.time)}-${normalizedClass}-${normalizedTrainer}`;

        result.push({
          day: daySchedule.day,
          time: normalizeTimeString(cls.time),
          className: normalizedClass,
          trainer: normalizedTrainer,
          location: normalizedLocation,
          uniqueKey: uniqueKey,
        });
      }
    }
  }

  return result;
}
