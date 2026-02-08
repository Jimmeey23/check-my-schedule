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

function detectLocationFromItems(items: TextItem[]): string {
  // Check all items from all pages, not just lines
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

/**
 * Detect date range from text
 */
function detectDateRange(lines: string[]): { weekStart: string; weekEnd: string } {
  const text = lines.slice(0, 15).join(' ');

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

  const normalized = normalizeClassName(cleaned);
  if (normalized.startsWith('Studio ')) return normalized;

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

  for (const teacher of knownTeachers) {
    const firstName = teacher.split(' ')[0];
    if (cleaned.toLowerCase().includes(firstName.toLowerCase())) {
      return teacher;
    }
  }

  return null;
}

// =====================================================================
// COLUMNAR LAYOUT DETECTION AND PARSING
// =====================================================================

interface DayColumn {
  day: string;
  xMin: number;
  xMax: number;
  headerY: number;
}

/**
 * Find all day header text items and determine if layout is columnar
 */
function findDayHeaders(items: TextItem[]): { isColumnar: boolean; columns: DayColumn[] } {
  const dayItems: { day: string; item: TextItem }[] = [];

  for (const item of items) {
    const text = item.str.trim();
    for (const { day, regex } of DAY_PATTERNS) {
      if (regex.test(text) && text.length < 30) {
        dayItems.push({ day, item });
        break;
      }
    }
  }

  if (dayItems.length < 2) {
    return { isColumnar: false, columns: [] };
  }

  // Check if multiple day headers share similar Y positions (columnar layout)
  // Group by Y proximity
  const yGroups: { y: number; items: typeof dayItems }[] = [];
  for (const di of dayItems) {
    let found = false;
    for (const group of yGroups) {
      if (Math.abs(di.item.y - group.y) < 10) {
        group.items.push(di);
        found = true;
        break;
      }
    }
    if (!found) {
      yGroups.push({ y: di.item.y, items: [di] });
    }
  }

  // If any Y group has 2+ day headers, it's columnar
  const columnarGroup = yGroups.find(g => g.items.length >= 2);

  if (!columnarGroup) {
    return { isColumnar: false, columns: [] };
  }

  // Build columns from ALL day items that appear at similar Y levels
  // Collect all columnar groups (some PDFs may have days on slightly different Y levels)
  const allColumnarItems = dayItems.filter(di => {
    return yGroups.some(g => g.items.length >= 2 && Math.abs(di.item.y - g.y) < 15);
  });

  // Also include single-item Y groups if their Y is close to a columnar group
  for (const di of dayItems) {
    if (!allColumnarItems.includes(di)) {
      const isClose = yGroups.some(g => g.items.length >= 2 && Math.abs(di.item.y - g.y) < 30);
      if (isClose) allColumnarItems.push(di);
    }
  }

  // Sort columns by X position
  const sorted = [...allColumnarItems].sort((a, b) => a.item.x - b.item.x);

  // Determine column boundaries
  const columns: DayColumn[] = sorted.map((di, idx) => {
    const nextX = idx + 1 < sorted.length ? sorted[idx + 1].item.x : Infinity;
    return {
      day: di.day,
      xMin: di.item.x - 5, // small left padding
      xMax: nextX - 5, // just before the next column
      headerY: di.item.y,
    };
  });

  // Deduplicate days - keep the one with the lowest X for each day
  const uniqueColumns: DayColumn[] = [];
  const seenDays = new Set<string>();
  for (const col of columns) {
    if (!seenDays.has(col.day)) {
      seenDays.add(col.day);
      uniqueColumns.push(col);
    }
  }

  return { isColumnar: uniqueColumns.length >= 2, columns: uniqueColumns };
}

/**
 * Assign each text item to its column based on X position
 */
function assignItemsToColumns(items: TextItem[], columns: DayColumn[]): Map<string, TextItem[]> {
  const columnItems = new Map<string, TextItem[]>();
  for (const col of columns) {
    columnItems.set(col.day, []);
  }

  // Only process items below the day headers
  const headerY = Math.max(...columns.map(c => c.headerY));
  const itemsBelowHeaders = items.filter(item => item.y < headerY - 2); // lower Y = below (PDF coords)

  for (const item of itemsBelowHeaders) {
    // Find which column this item belongs to
    let bestCol: DayColumn | null = null;
    for (const col of columns) {
      if (item.x >= col.xMin && item.x < col.xMax) {
        bestCol = col;
        break;
      }
    }

    // Fallback: find closest column by X center
    if (!bestCol) {
      let minDist = Infinity;
      const itemCenter = item.x + item.width / 2;
      for (const col of columns) {
        const colCenter = (col.xMin + col.xMax) / 2;
        const dist = Math.abs(itemCenter - colCenter);
        if (dist < minDist) {
          minDist = dist;
          bestCol = col;
        }
      }
    }

    if (bestCol) {
      columnItems.get(bestCol.day)!.push(item);
    }
  }

  return columnItems;
}

/**
 * Parse classes from text items within a single column
 */
function parseColumnClasses(items: TextItem[], dayIndex: number): ScheduleClass[] {
  const lines = groupIntoLines(items);
  return parseDayClasses(lines, dayIndex);
}

// =====================================================================
// LINEAR LAYOUT PARSING (original approach)
// =====================================================================

/**
 * Parse lines within a day section to extract classes
 */
function parseDayClasses(lines: string[], dayIndex: number): ScheduleClass[] {
  const classes: ScheduleClass[] = [];
  let classCounter = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Skip lines that look like day headers
    const isDayHeader = DAY_PATTERNS.some(p => p.regex.test(line) && line.trim().length < 30);
    if (isDayHeader) continue;

    // Try to find time at the start of the line
    const timeMatch = line.match(/^(\d{1,2}[:.]\d{2}\s*(AM|PM)|\d{1,2}\s*(AM|PM))/i);
    if (!timeMatch) {
      // Try to find time anywhere in the line
      const inlineTime = line.match(/(\d{1,2}[:.]\d{2}\s*(AM|PM))/i);
      if (!inlineTime) continue;
    }

    const time = timeMatch ? timeMatch[0].trim() : '';
    const rest = timeMatch ? line.slice(timeMatch[0].length).trim() : line;

    // Extract class name and trainer
    let className: string | null = null;
    let trainer: string | null = null;

    // Try matching parts separated by whitespace/delimiters
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
      const nextLine = lines[i + 1].trim();
      // Make sure next line is not a time or day header
      if (!nextLine.match(/^\d{1,2}[:.]\d{2}\s*(AM|PM)/i) &&
          !DAY_PATTERNS.some(p => p.regex.test(nextLine) && nextLine.length < 30)) {
        trainer = matchTrainer(nextLine);
      }
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
 * Parse PDF text into schedule structure using linear layout
 */
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

// =====================================================================
// MULTI-PAGE COLUMNAR SUPPORT
// =====================================================================

/**
 * Parse a single page's items using columnar detection
 */
function parsePageColumnar(items: TextItem[]): DaySchedule[] {
  const { isColumnar, columns } = findDayHeaders(items);

  if (!isColumnar) {
    return []; // Will fall back to linear
  }

  console.log(`[PDF Parser] Columnar layout detected with ${columns.length} day columns:`, columns.map(c => c.day));

  const columnItems = assignItemsToColumns(items, columns);
  const daySchedules: DaySchedule[] = [];

  for (const col of columns) {
    const colItems = columnItems.get(col.day) || [];
    if (colItems.length === 0) continue;

    const dayIdx = DAYS_ORDER.indexOf(col.day);
    const classes = parseColumnClasses(colItems, dayIdx);

    if (classes.length > 0) {
      daySchedules.push({ day: col.day, classes });
    }
  }

  return daySchedules;
}

/**
 * Main PDF parsing function
 */
export async function parsePDF(file: File): Promise<WeekSchedule> {
  const pages = await extractTextItems(file);
  const allItems: TextItem[] = [];
  const allLines: string[] = [];

  for (const pageItems of pages) {
    allItems.push(...pageItems);
    const lines = groupIntoLines(pageItems);
    allLines.push(...lines);
  }

  const location = detectLocation(allLines) !== 'Unknown Location'
    ? detectLocation(allLines)
    : detectLocationFromItems(allItems);
  const { weekStart, weekEnd } = detectDateRange(allLines);

  // Try columnar parsing first (page by page)
  let days: DaySchedule[] = [];
  let usedColumnar = false;

  for (const pageItems of pages) {
    const columnarDays = parsePageColumnar(pageItems);
    if (columnarDays.length > 0) {
      // Merge with existing days (in case days span multiple pages)
      for (const newDay of columnarDays) {
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

  // If columnar didn't find enough days, try linear parsing
  if (days.length < 2 && !usedColumnar) {
    console.log('[PDF Parser] Using linear layout parsing');
    days = parseScheduleFromLines(allLines);
  } else if (usedColumnar && days.length < 2) {
    // Columnar was detected but parsed very few days - also try linear as fallback
    console.log('[PDF Parser] Columnar found few days, trying linear fallback');
    const linearDays = parseScheduleFromLines(allLines);
    if (linearDays.length > days.length) {
      days = linearDays;
      usedColumnar = false;
    }
  }

  if (usedColumnar) {
    console.log(`[PDF Parser] Columnar parsing result: ${days.length} days, ${days.reduce((s, d) => s + d.classes.length, 0)} total classes`);
    days.forEach(d => console.log(`  ${d.day}: ${d.classes.length} classes`));
  }

  // Sort days in correct order
  days.sort((a, b) => DAYS_ORDER.indexOf(a.day) - DAYS_ORDER.indexOf(b.day));

  // Sort classes within each day by time
  for (const day of days) {
    day.classes.sort((a, b) => {
      const tA = normalizeTime(a.time);
      const tB = normalizeTime(b.time);
      return tA.localeCompare(tB);
    });
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
