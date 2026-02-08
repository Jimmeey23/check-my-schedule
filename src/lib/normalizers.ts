import type { NormalizedClass, ComparedClass, ComparisonResult, DaySchedule, ClassLevel } from '@/types/schedule';
import { classNameMappings, teacherNameMappings, locationMappings, classLevels, knownTeachers } from './normalizationMaps';

/**
 * Levenshtein distance for fuzzy matching
 */
export function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

/**
 * Normalize time with comprehensive OCR error correction
 */
export function normalizeTime(rawTime: string): string {
  if (!rawTime) return '';
  let time = rawTime.trim().replace(/\s+/g, ' ');

  // First pass: Replace special characters with colons (., ', ;, -, ~, |, \, /)
  time = time.replace(/[.,';~\-\|\\\/]+/g, ':');
  
  // Remove all spaces
  time = time.replace(/\s+/g, '');
  
  // Clean up multiple colons
  time = time.replace(/:+/g, ':');
  time = time.replace(/^:+|:+$/g, '');

  // OCR fixes for common misread characters
  time = time.replace(/^(\d{1,2}):(\d{2})(AM|PM)/i, '$1:$2 $3');
  time = time.replace(/^S(\d{2})(AM|PM)/i, '9:$1 $2');
  time = time.replace(/^S00(AM|PM)/i, '9:00 $1');
  time = time.replace(/^I(\d{2})(AM|PM)/i, '1:$1 $2');
  time = time.replace(/^I:(\d{2})(AM|PM)/i, '1:$1 $2');
  time = time.replace(/^G:(\d{2})(AM|PM)/i, '6:$1 $2');
  time = time.replace(/^T:(\d{2})(AM|PM)/i, '11:$1 $2');
  time = time.replace(/^1n:(\d{2})(AM|PM)/i, '11:$1 $2');
  time = time.replace(/^11(\d{2})(AM|PM)/i, '11:$1 $2');

  // Fix :20 -> :30 for fitness schedule context
  time = time.replace(/^(\d{1,2}):20(AM|PM)/i, (match, hour, period) => {
    const h = parseInt(hour);
    if (h >= 4 && h <= 11) return `${hour}:30${period}`;
    return match;
  });

  // Pad single digit minutes
  time = time.replace(/^(\d{1,2}):(\d{1})(AM|PM)/i, (_m, h, m, p) => `${h}:${m}0${p}`);
  // Add space before AM/PM
  time = time.replace(/(\d)(AM|PM)/gi, '$1 $2');
  // Fix concatenated times like "730AM"
  time = time.replace(/^(\d{1,2})(\d{2})\s*(AM|PM)/i, '$1:$2 $3');
  // Missing minutes
  time = time.replace(/^(\d{1,2})\s+(AM|PM)$/gi, '$1:00 $2');
  // Extra spaces around colon
  time = time.replace(/\s*:\s*/g, ':');

  const match = time.match(/(\d{1,2}):?(\d{0,2})\s*(AM|PM)/i);
  if (!match) return rawTime.trim();

  let hours = parseInt(match[1]);
  let minutes = match[2] || '00';
  let period = match[3].toUpperCase();

  if (hours > 12 && hours <= 23) { hours -= 12; period = 'PM'; }
  if (hours < 1) return '';

  // Fix OCR: 1:XX AM -> 11:XX AM (fitness classes never at 1 AM)
  if (hours === 1 && period === 'AM') hours = 11;

  if (minutes.length === 0) minutes = '00';
  else if (minutes.length === 1) minutes += '0';

  const minutesInt = parseInt(minutes);
  if (minutesInt > 59) return '';

  // Convert to 24h for sorting
  let h24 = hours;
  if (period === 'PM' && hours !== 12) h24 += 12;
  if (period === 'AM' && hours === 12) h24 = 0;

  return `${h24.toString().padStart(2, '0')}:${minutes}`;
}

/**
 * Normalize class name using comprehensive mapping
 */
export function normalizeClassName(name: string): string {
  if (!name) return '';
  let cleaned = name.trim().replace(/\s+/g, ' ');

  // Handle "exp" suffix (express classes)
  const expMatch = cleaned.match(/^(.+?)\s*exp$/i);
  if (expMatch) {
    const base = normalizeClassName(expMatch[1]);
    if (base.startsWith('Studio ') && !base.includes('Express')) {
      return base + ' Express';
    }
    return base;
  }

  // Direct lookup (case-sensitive first)
  if (classNameMappings[cleaned]) return classNameMappings[cleaned];

  // Case-insensitive lookup
  const upperCleaned = cleaned.toUpperCase();
  for (const [key, value] of Object.entries(classNameMappings)) {
    if (key.toUpperCase() === upperCleaned) return value;
  }

  // Lowercase lookup (for CSV data that may be lowercased)
  const lowerCleaned = cleaned.toLowerCase();
  for (const [key, value] of Object.entries(classNameMappings)) {
    if (key.toLowerCase() === lowerCleaned) return value;
  }

  // Fuzzy: remove parentheses variations
  const withoutParens = cleaned.replace(/\s*\(.*?\)\s*/g, '').trim();
  if (classNameMappings[withoutParens]) return classNameMappings[withoutParens];
  for (const [key, value] of Object.entries(classNameMappings)) {
    if (key.toUpperCase() === withoutParens.toUpperCase()) return value;
  }

  // Partial match: check if cleaned string contains a known key
  for (const [key, value] of Object.entries(classNameMappings)) {
    if (lowerCleaned === key.toLowerCase()) return value;
  }

  // If already starts with "Studio ", it's probably normalized
  if (cleaned.startsWith('Studio ')) return cleaned;

  return cleaned;
}

/**
 * Normalize trainer name using comprehensive mapping with fuzzy matching
 */
export function normalizeTrainer(name: string): string {
  if (!name) return '';
  let cleaned = name.trim().replace(/\s+/g, ' ');

  // Direct lookup
  if (teacherNameMappings[cleaned]) return teacherNameMappings[cleaned];

  // Case-insensitive lookup
  for (const [key, value] of Object.entries(teacherNameMappings)) {
    if (key.toLowerCase() === cleaned.toLowerCase()) return value;
  }

  // Try first name only
  const firstName = cleaned.split(' ')[0];
  if (teacherNameMappings[firstName]) return teacherNameMappings[firstName];
  for (const [key, value] of Object.entries(teacherNameMappings)) {
    if (key.toLowerCase() === firstName.toLowerCase()) return value;
  }

  // Match against full known teachers list (first name match)
  const lowerCleaned = cleaned.toLowerCase();
  for (const teacher of knownTeachers) {
    const lowerTeacher = teacher.toLowerCase();
    if (lowerTeacher === lowerCleaned || lowerTeacher.startsWith(lowerCleaned + ' ')) {
      return teacher;
    }
  }

  // Fuzzy matching with levenshtein distance
  let closestMatch: string | null = null;
  let closestDistance = 3;
  for (const teacher of knownTeachers) {
    const distance = levenshteinDistance(lowerCleaned, teacher.toLowerCase());
    if (distance < closestDistance && (lowerCleaned.length >= 5 || teacher.toLowerCase().includes(lowerCleaned))) {
      closestDistance = distance;
      closestMatch = teacher;
    }
  }
  if (closestMatch) return closestMatch;

  // Title case
  return cleaned.split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Normalize location name with partial matching
 */
export function normalizeLocation(location: string | undefined): string | undefined {
  if (!location) return undefined;
  let cleaned = location.trim().replace(/\s+/g, ' ');

  // Direct lookup
  if (locationMappings[cleaned]) return locationMappings[cleaned];
  
  // Case-insensitive lookup
  for (const [key, value] of Object.entries(locationMappings)) {
    if (key.toLowerCase() === cleaned.toLowerCase()) return value;
  }

  // Partial/contains match (for CSV data with partial location names)
  const lowerCleaned = cleaned.toLowerCase();
  for (const [key, value] of Object.entries(locationMappings)) {
    if (lowerCleaned.includes(key.toLowerCase())) return value;
  }

  return cleaned;
}

/**
 * Get class level from normalized name
 */
export function getClassLevel(normalizedName: string): ClassLevel | undefined {
  return classLevels[normalizedName];
}

/**
 * Normalize day name
 */
export function normalizeDay(day: string): string {
  const dayMap: Record<string, string> = {
    'mon': 'Monday', 'monday': 'Monday',
    'tue': 'Tuesday', 'tues': 'Tuesday', 'tuesday': 'Tuesday',
    'wed': 'Wednesday', 'wednesday': 'Wednesday',
    'thu': 'Thursday', 'thur': 'Thursday', 'thurs': 'Thursday', 'thursday': 'Thursday',
    'fri': 'Friday', 'friday': 'Friday',
    'sat': 'Saturday', 'saturday': 'Saturday',
    'sun': 'Sunday', 'sunday': 'Sunday',
  };
  return dayMap[day.trim().toLowerCase()] || day.charAt(0).toUpperCase() + day.slice(1).toLowerCase();
}

/**
 * Convert schedule days to normalized classes
 */
export function normalizeSchedule(days: DaySchedule[]): NormalizedClass[] {
  const normalized: NormalizedClass[] = [];

  for (const day of days) {
    for (const cls of day.classes) {
      const normalizedName = normalizeClassName(cls.className);
      normalized.push({
        id: cls.id,
        day: normalizeDay(day.day),
        time: cls.time,
        normalizedTime: normalizeTime(cls.time),
        className: cls.className,
        normalizedClassName: normalizedName,
        trainer: cls.trainer,
        normalizedTrainer: normalizeTrainer(cls.trainer),
        location: cls.location,
        normalizedLocation: normalizeLocation(cls.location),
        level: getClassLevel(normalizedName) || cls.level,
      });
    }
  }

  // Sort by day order then time
  const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  normalized.sort((a, b) => {
    const dayDiff = dayOrder.indexOf(a.day) - dayOrder.indexOf(b.day);
    if (dayDiff !== 0) return dayDiff;
    return a.normalizedTime.localeCompare(b.normalizedTime);
  });

  return normalized;
}

/**
 * Compare two schedules and find matches/mismatches
 */
export function compareSchedules(
  pdfClasses: NormalizedClass[],
  csvClasses: NormalizedClass[]
): ComparisonResult {
  const pdfResults: ComparedClass[] = [];
  const csvResults: ComparedClass[] = [];
  const matchedCsvIds = new Set<string>();

  let matches = 0;
  let mismatches = 0;

  for (const pdfClass of pdfClasses) {
    let bestMatch: NormalizedClass | undefined;
    let bestMatchScore = 0;
    let differences: ComparedClass['differences'] = {};

    for (const csvClass of csvClasses) {
      if (matchedCsvIds.has(csvClass.id)) continue;
      if (pdfClass.day !== csvClass.day) continue;

      let score = 0;
      const tempDiffs: ComparedClass['differences'] = {};

      if (pdfClass.normalizedTime === csvClass.normalizedTime) score += 40;
      else tempDiffs.time = true;

      if (pdfClass.normalizedClassName === csvClass.normalizedClassName) score += 30;
      else tempDiffs.className = true;

      if (pdfClass.normalizedTrainer === csvClass.normalizedTrainer) score += 20;
      else tempDiffs.trainer = true;

      if (pdfClass.normalizedLocation && csvClass.normalizedLocation) {
        if (pdfClass.normalizedLocation === csvClass.normalizedLocation) score += 10;
        else tempDiffs.location = true;
      }

      if (score > bestMatchScore) {
        bestMatchScore = score;
        bestMatch = csvClass;
        differences = tempDiffs;
      }
    }

    if (bestMatch && bestMatchScore >= 70) {
      matchedCsvIds.add(bestMatch.id);
      const hasDifferences = Object.values(differences).some(v => v);
      const status: ComparedClass['status'] = hasDifferences ? 'mismatch' : 'match';
      if (hasDifferences) mismatches++; else matches++;

      pdfResults.push({ ...pdfClass, status, matchedWith: bestMatch, differences: hasDifferences ? differences : undefined });
    } else {
      pdfResults.push({ ...pdfClass, status: 'missing' });
    }
  }

  for (const csvClass of csvClasses) {
    const matchedPdf = pdfResults.find(p => p.matchedWith?.id === csvClass.id);
    if (matchedPdf) {
      csvResults.push({
        ...csvClass, status: matchedPdf.status,
        matchedWith: pdfClasses.find(p => p.id === matchedPdf.id),
        differences: matchedPdf.differences,
      });
    } else {
      csvResults.push({ ...csvClass, status: 'extra' });
    }
  }

  return {
    pdfClasses: pdfResults,
    csvClasses: csvResults,
    summary: {
      totalPdf: pdfClasses.length,
      totalCsv: csvClasses.length,
      matches,
      mismatches,
      missingInCsv: pdfResults.filter(c => c.status === 'missing').length,
      extraInCsv: csvResults.filter(c => c.status === 'extra').length,
    },
  };
}
