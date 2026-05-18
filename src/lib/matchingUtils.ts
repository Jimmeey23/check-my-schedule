export interface CanonicalClassRecord {
  day: string;
  time: string;
  className: string;
  trainer: string;
  location?: string;
  theme?: string;
}

export interface MatchAssessment {
  score: number;
  timeDiffMinutes: number;
  classSimilarity: number;
  trainerSimilarity: number;
  locationSimilarity: number;
  timeMismatch: boolean;
  classMismatch: boolean;
  trainerMismatch: boolean;
  locationMismatch: boolean;
}

const TIME_WEIGHT = 0.45;
const CLASS_WEIGHT = 0.35;
const TRAINER_WEIGHT = 0.15;
const LOCATION_WEIGHT = 0.05;

function parseHHMMToMinutes(value: string): number {
  const match = value.match(/^(\d{2}):(\d{2})$/);
  if (!match) return -1;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return -1;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return -1;
  return hours * 60 + minutes;
}

function normalizeTokenText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripClassDecorators(value: string): string {
  const normalized = normalizeTokenText(value);
  return normalized
    .replace(/^studio\s+/, "")
    .replace(/\s+express$/, "")
    .trim();
}

function tokenizeClass(value: string): Set<string> {
  const normalized = stripClassDecorators(value);
  return new Set(normalized.split(" ").filter(Boolean));
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;

  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection++;
  }

  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + 1
        );
      }
    }
  }

  return dp[m][n];
}

function classSimilarity(left: string, right: string): number {
  const a = normalizeTokenText(left);
  const b = normalizeTokenText(right);
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  if (a === b) return 1;

  const baseA = stripClassDecorators(left);
  const baseB = stripClassDecorators(right);
  if (baseA === baseB && baseA) return 0.95;
  if (baseA && baseB && (baseA.includes(baseB) || baseB.includes(baseA))) return 0.86;

  const tokenScore = jaccardSimilarity(tokenizeClass(left), tokenizeClass(right));
  if (tokenScore > 0.8) return 0.84;
  if (tokenScore > 0.65) return 0.76;
  if (tokenScore > 0.5) return 0.62;
  if (tokenScore > 0.35) return 0.48;

  return tokenScore * 0.7;
}

function trainerSimilarity(left: string, right: string): number {
  const a = normalizeTokenText(left);
  const b = normalizeTokenText(right);
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  if (a === b) return 1;

  const firstA = a.split(" ")[0];
  const firstB = b.split(" ")[0];
  if (firstA && firstA === firstB) return 0.82;
  if (a.includes(b) || b.includes(a)) return 0.7;

  const distance = levenshteinDistance(a, b);
  const maxLen = Math.max(a.length, b.length);
  const ratio = maxLen === 0 ? 0 : 1 - distance / maxLen;
  if (ratio > 0.82) return 0.68;
  if (ratio > 0.72) return 0.56;

  return Math.max(0, ratio * 0.5);
}

function locationSimilarity(left?: string, right?: string): number {
  const a = normalizeTokenText(left || "");
  const b = normalizeTokenText(right || "");
  if (!a && !b) return 1;
  if (!a || !b) return 0.75;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.85;
  return 0;
}

function timeSimilarity(diffMinutes: number): number {
  if (diffMinutes < 0) return 0;
  if (diffMinutes === 0) return 1;
  if (diffMinutes <= 5) return 0.86;
  if (diffMinutes <= 10) return 0.7;
  if (diffMinutes <= 15) return 0.55;
  if (diffMinutes <= 20) return 0.35;
  return 0;
}

export function assessMatch(left: CanonicalClassRecord, right: CanonicalClassRecord): MatchAssessment {
  const leftMinutes = parseHHMMToMinutes(left.time);
  const rightMinutes = parseHHMMToMinutes(right.time);
  const timeDiffMinutes =
    leftMinutes >= 0 && rightMinutes >= 0 ? Math.abs(leftMinutes - rightMinutes) : Number.POSITIVE_INFINITY;

  const classScore = classSimilarity(left.className, right.className);
  const trainerScore = trainerSimilarity(left.trainer, right.trainer);
  const locationScore = locationSimilarity(left.location, right.location);
  const timeScore = Number.isFinite(timeDiffMinutes) ? timeSimilarity(timeDiffMinutes) : 0;

  const score = Math.round(
    (timeScore * TIME_WEIGHT +
      classScore * CLASS_WEIGHT +
      trainerScore * TRAINER_WEIGHT +
      locationScore * LOCATION_WEIGHT) *
      100
  );

  return {
    score,
    timeDiffMinutes: Number.isFinite(timeDiffMinutes) ? timeDiffMinutes : 9999,
    classSimilarity: classScore,
    trainerSimilarity: trainerScore,
    locationSimilarity: locationScore,
    timeMismatch: Number.isFinite(timeDiffMinutes) ? timeDiffMinutes > 0 : true,
    classMismatch: classScore < 0.9,
    trainerMismatch: trainerScore < 0.999,
    locationMismatch: locationScore < 0.999 && Boolean(left.location && right.location),
  };
}

export function matchSortKey(day: string, time: string): string {
  const dayOrder: Record<string, number> = {
    Monday: 1,
    Tuesday: 2,
    Wednesday: 3,
    Thursday: 4,
    Friday: 5,
    Saturday: 6,
    Sunday: 7,
  };
  const dayIndex = dayOrder[day] ?? 99;
  return `${dayIndex.toString().padStart(2, "0")}-${time || "99:99"}`;
}
