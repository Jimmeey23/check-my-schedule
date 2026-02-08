// Normalization functions without type imports


// Days order for sorting
export const daysOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// ====================================================================
// NORMALIZATION DATA
// ====================================================================

// Allowed trainer names
export const allowedTeachers = [
  'Anisha Shah', 'Atulan Purohit', 'Janhavi Jain', 'Karanvir Bhatia', 'Mrigakshi Jaiswal',
  'Pranjali Jain', 'Reshma Sharma', "Richard D'Costa", 'Rohan Dahima', 'Upasna Paranjpe',
  'Karan Bhatia', 'Saniya Jaiswal', 'Vivaran Dhasmana', 'Nishanth Raj', 'Cauveri Vikrant',
  'Kabir Varma', 'Simonelle De Vitre', 'Simran Dutt', 'Anmol Sharma', 'Bret Saldanha',
  'Raunak Khemuka', 'Kajol Kanchan', 'Pushyank Nahar', 'Shruti Kulkarni',
  'Shruti Suresh', 'Poojitha Bhaskar', 'Siddhartha Kusuma', 'Chaitanya Nahar', 'Veena Narasimhan',
  'Sovena Fernandes',
  'Rohan', 'Anisha', 'Richard', 'Pranjali', 'Reshma', 'Atulan', 'Karanvir', 'Cauveri', 
  'Mrigakshi', 'Vivaran', 'Karan', 'Nishanth', 'Pushyank', 'Kajol', 'Siddhartha', 'Shruti K', 'Veena', 'Chaitanya', 'Raunak', 'Sovena'
];

// Class name mappings
export const classNameMappings: {[key: string]: string} = {
  'hosted class': 'Studio Hosted Class',
  'hosted': 'Studio Barre 57',
  'fit': 'Studio FIT',
  'back body blaze': 'Studio Back Body Blaze',
  'bbb': 'Studio Back Body Blaze',
  'barre 57': 'Studio Barre 57',
  'barre57': 'Studio Barre 57',
  'mat 57': 'Studio Mat 57',
  'mat57': 'Studio Mat 57',
  "trainer's choice": "Studio Trainer's Choice",
  'amped up': 'Studio Amped Up!',
  'amped up!': 'Studio Amped Up!',
  'hiit': 'Studio HIIT',
  'foundations': 'Studio Foundations',
  'sweat in 30': 'Studio SWEAT In 30',
  'sweat': 'Studio SWEAT In 30',
  'cardio barre plus': 'Studio Cardio Barre Plus',
  'cardio b+': 'Studio Cardio Barre Plus',
  'cardio barre': 'Studio Cardio Barre',
  'cardio b': 'Studio Cardio Barre',
  'recovery': 'Studio Recovery',
  'pre/post natal': 'Studio Pre/Post Natal',
  'prenatal': 'Studio Pre/Post Natal',
  'cycle': 'Studio PowerCycle',
  'powercycle': 'Studio PowerCycle',
  'strength lab': 'Studio Strength Lab',
  'strength lab (full body)': 'Studio Strength Lab',
  'strength (pull)': 'Studio Strength Lab (Pull)',
  'strength (push)': 'Studio Strength Lab (Push)',
  'strength - fb': 'Studio Strength Lab (Full Body)',
  'strength - pull': 'Studio Strength Lab (Pull)',
  'strength - push': 'Studio Strength Lab (Push)',
  'cardio barre express': 'Studio Cardio Barre Express',
  'cardio barre exp': 'Studio Cardio Barre Express',
  'cardio b exp': 'Studio Cardio Barre Express',
  'barre 57 express': 'Studio Barre 57 Express',
  'barre 57 exp': 'Studio Barre 57 Express',
  'barre57 exp': 'Studio Barre 57 Express',
  'back body blaze express': 'Studio Back Body Blaze Express',
  'bbb exp': 'Studio Back Body Blaze Express',
  'mat 57 express': 'Studio Mat 57 Express',
  'mat 57 exp': 'Studio Mat 57 Express',
  'mat57 exp': 'Studio Mat 57 Express',
  'cycle exp': 'Studio PowerCycle Express',
  'powercycle express': 'Studio PowerCycle Express',
};

// Location mappings
export const locationMappings: {[key: string]: string} = {
  'kemps': 'Kwality House, Kemps Corner',
  'kemps corner': 'Kwality House, Kemps Corner',
  'bandra': 'Supreme HQ, Bandra',
  'kenkere': 'Kenkere House',
  'south united': 'South United Football Club',
  'copper cloves': 'The Studio by Copper + Cloves',
  'wework galaxy': 'WeWork Galaxy',
  'wework prestige': 'WeWork Prestige Central',
  'physique': 'Physique Outdoor Pop-up',
  'annex': 'Kwality House, Kemps Corner',
};

// ====================================================================
// NORMALIZATION FUNCTIONS
// ====================================================================

export function levenshteinDistance(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix: number[][] = [];

  for (let i = 0; i <= len2; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= len1; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= len2; i++) {
    for (let j = 1; j <= len1; j++) {
      if (str2[i - 1] === str1[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[len2][len1];
}

export function normalizeLocationName(raw: string): string {
  if (!raw) return '';
  const val = raw.trim().toLowerCase();
  
  for (const [key, value] of Object.entries(locationMappings)) {
    if (val.includes(key)) {
      return value;
    }
  }

  return raw.trim();
}

export function normalizeClassName(raw: string): string {
  if (!raw) return '';
  const val = raw.trim().replace(/\s+/g, ' ').toLowerCase();

  for (const [key, value] of Object.entries(classNameMappings)) {
    if (val === key) {
      return value;
    }
  }

  return raw.trim().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
}

export function normalizeTrainerName(raw: string): string {
  if (!raw) return '';
  const val = raw.trim().toLowerCase();

  // Specific common nicknames
  if (val === 'mriga') return 'Mrigakshi Jaiswal';
  if (val === 'nishant') return 'Nishanth Raj';
  if (val === 'raunaq') return 'Raunak Khemuka';
  if (val === 'richy') return "Richard D'Costa";
  if (val === 'sovena' || val === 'sov') return 'Sovena Fernandes';

  for (const name of allowedTeachers) {
    const lowerCaseName = name.toLowerCase();
    if (lowerCaseName === val || lowerCaseName.startsWith(val + ' ')) {
      return name;
    }
  }

  let closestMatch: string | null = null;
  let closestDistance = 3;
  
  for (const name of allowedTeachers) {
    const lowerCaseName = name.toLowerCase();
    const distance = levenshteinDistance(val, lowerCaseName);
    
    if (distance < closestDistance && (val.length >= 5 || lowerCaseName.includes(val))) {
      closestDistance = distance;
      closestMatch = name;
    }
  }
  
  if (closestMatch) {
    console.log(`Fuzzy matched trainer "${raw}" → "${closestMatch}"`);
    return closestMatch;
  }

  return raw.trim();
}

export function isValidClassName(className: string): boolean {
  if (!className || className.trim() === '') return false;
  
  const trimmed = className.trim().toLowerCase();
  
  const validClassNames = [
    'recovery', 'fit', 'hiit', 'barre', 'mat', 'cycle', 'sweat', 'foundations',
    'studio recovery', 'studio fit', 'studio hiit', 'express', 'hosted'
  ];
  
  if (trimmed.includes('express')) {
    return true;
  }
  
  for (const valid of validClassNames) {
    if (trimmed === valid || trimmed.includes(valid)) {
      return true;
    }
  }
  
  const invalidNames = [
    'smita parekh', 'anandita', '2', '1', 'taarika', 'sakshi',
    'smita', 'parekh', 'anand', 'anandi', 'host', 'cover', 'replacement'
  ];
  
  for (const invalid of invalidNames) {
    if (trimmed === invalid || trimmed.includes(invalid)) {
      return false;
    }
  }
  
  if (/^\d+$/.test(trimmed)) return false;
  if (trimmed.split(' ').length === 1 && trimmed.length < 4) return false;
  
  return true;
}

export function normalizeTimeString(timeStr: string): string {
  if (!timeStr) return '';
  
  let time = timeStr.trim();
  
  // Remove all spaces first
  time = time.replace(/\s+/g, '');
  
  // Replace special characters with colon: (., ', ;, -, ~, etc)
  // Keep only digits, colons, and AM/PM
  time = time.replace(/[.,';~\-\|\\\/\s]+/g, ':');
  
  // Handle multiple colons (user might have typed multiple separators)
  time = time.replace(/:+/g, ':');
  
  // Remove leading/trailing colons
  time = time.replace(/^:+|:+$/g, '');
  
  // Now extract time and AM/PM
  const ampmMatch = time.match(/(AM|PM)/i);
  const period = ampmMatch ? ampmMatch[1].toUpperCase() : '';
  
  // Get just the numeric part
  let numericPart = time.replace(/(AM|PM)/gi, '').trim();
  numericPart = numericPart.replace(/^:+|:+$/g, '');
  
  // If no numeric part found, return empty
  if (!numericPart) return '';
  
  // Split by colon to get hours and minutes
  let parts = numericPart.split(':').filter(p => p.length > 0);
  
  if (parts.length === 0) return '';
  
  let hours = parts[0];
  let minutes = parts.length > 1 ? parts[1] : '00';
  
  // Validate hours and minutes
  const h = parseInt(hours);
  // Allow 1-12 for 12-hour format or 0-23 for 24-hour format
  if (isNaN(h) || h < 0 || (period && h > 12) || (!period && h > 23)) return '';
  
  const m = parseInt(minutes);
  if (isNaN(m) || m < 0 || m > 59) {
    // Try to parse minutes differently (e.g., "30" from "930")
    if (minutes.length > 2) {
      const minStr = minutes.substring(0, 2);
      const min = parseInt(minStr);
      if (min >= 0 && min <= 59) {
        minutes = minStr;
      } else {
        minutes = '00';
      }
    } else {
      minutes = '00';
    }
  }
  
  // Pad hours and minutes
  hours = hours.padStart(2, '0');
  minutes = minutes.padStart(2, '0');
  
  // Format: "HH:MM AM/PM"
  let result = `${hours}:${minutes}`;
  if (period) {
    result += ` ${period}`;
  }
  
  return result.trim().toUpperCase();
}

export function parseTimeToDate(timeStr: string): Date | null {
  if (!timeStr) return null;
  const today = new Date();
  let time = normalizeTimeString(timeStr);
  const ampmMatch = time.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (ampmMatch) {
    let hour = parseInt(ampmMatch[1], 10);
    const minute = parseInt(ampmMatch[2], 10);
    const ampm = ampmMatch[3].toUpperCase();
    if (ampm === 'PM' && hour !== 12) hour += 12;
    if (ampm === 'AM' && hour === 12) hour = 0;
    return new Date(today.getFullYear(), today.getMonth(), today.getDate(), hour, minute);
  }
  const hmMatch = time.match(/^(\d{1,2}):(\d{2})$/);
  if (hmMatch) {
    const hour = parseInt(hmMatch[1], 10);
    const minute = parseInt(hmMatch[2], 10);
    return new Date(today.getFullYear(), today.getMonth(), today.getDate(), hour, minute);
  }
  return null;
}

export function formatTime(date: Date | null): string {
  if (!date) return '';
  let hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const minStr = minutes < 10 ? '0' + minutes : String(minutes);
  return `${hours}:${minStr} ${ampm}`;
}

export function normalizeSchedule(days: any[]): any[] {
  const classes: any[] = [];
  days.forEach(day => {
    day.classes?.forEach((cls: any) => {
      classes.push({
        ...cls,
        day: day.day,
        normalizedClassName: normalizeClassName(cls.className),
        normalizedTrainer: normalizeTrainerName(cls.trainer || cls.trainer1),
        normalizedLocation: normalizeLocationName(cls.location),
        normalizedTime: normalizeTimeString(cls.time),
      });
    });
  });
  return classes;
}

export function compareSchedules(pdfClasses: any[], csvClasses: any[]): any {
  const matches: any[] = [];
  const mismatches: any[] = [];
  const missing: any[] = [];
  const extra: any[] = [];

  const pdfMap = new Map();
  pdfClasses.forEach(cls => {
    const key = `${cls.day}|${cls.normalizedTime}|${cls.normalizedClassName}`;
    pdfMap.set(key, cls);
  });

  csvClasses.forEach(cls => {
    const key = `${cls.day}|${cls.normalizedTime}|${cls.normalizedClassName}`;
    const pdfClass = pdfMap.get(key);
    
    if (pdfClass) {
      const trainerMatch = cls.normalizedTrainer === pdfClass.normalizedTrainer;
      if (trainerMatch) {
        matches.push({ pdf: pdfClass, csv: cls });
      } else {
        mismatches.push({ pdf: pdfClass, csv: cls, reason: 'Trainer Mismatch' });
      }
      pdfMap.delete(key);
    } else {
      missing.push(cls);
    }
  });

  pdfMap.forEach(pdfClass => {
    extra.push(pdfClass);
  });

  return {
    summary: {
      matches: matches.length,
      mismatches: mismatches.length,
      missing: missing.length,
      extra: extra.length,
    },
    pdfClasses,
    csvClasses,
    matches,
    mismatches,
    missing,
    extra,
  };
}
