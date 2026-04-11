import type { ClassData, PdfClassData } from "@/types/schedule";
import { normalizeClassName, normalizeDay, normalizeLocation, normalizeTime, normalizeTrainer } from "./normalizers";
import { assessMatch, matchSortKey, type CanonicalClassRecord, type MatchAssessment } from "./matchingUtils";

export type CsvPdfMatchStatus =
  | "match"
  | "trainer-mismatch"
  | "class-mismatch"
  | "time-mismatch"
  | "csv-only"
  | "pdf-only";

export interface CsvPdfAlignedRow {
  day: string;
  csvClass: ClassData | null;
  pdfClass: PdfClassData | null;
  status: CsvPdfMatchStatus;
  assessment?: MatchAssessment;
  discrepancies: {
    classMismatch?: boolean;
    trainerMismatch?: boolean;
    timeMismatch?: boolean;
    csvMissing?: boolean;
    pdfMissing?: boolean;
  };
}

interface CanonicalRow<T> {
  original: T;
  canonical: CanonicalClassRecord;
}

function isPlausiblePair(assessment: MatchAssessment): boolean {
  const exactTime = assessment.timeDiffMinutes === 0;
  const nearTime = assessment.timeDiffMinutes <= 15;
  const strongClass = assessment.classSimilarity >= 0.9;
  const mediumClass = assessment.classSimilarity >= 0.6;
  const exactTrainer = assessment.trainerSimilarity >= 0.999;
  const similarTrainer = assessment.trainerSimilarity >= 0.82;

  if (strongClass && nearTime) return true;
  if (exactTime && exactTrainer) return true;
  if (exactTime && mediumClass && similarTrainer) return true;

  return false;
}

function compareAssessments(candidate: MatchAssessment, current: MatchAssessment | null): number {
  if (!current) return 1;

  const candidateRank = [
    candidate.classSimilarity >= 0.9 ? 2 : candidate.classSimilarity >= 0.6 ? 1 : 0,
    candidate.timeDiffMinutes === 0 ? 2 : candidate.timeDiffMinutes <= 15 ? 1 : 0,
    candidate.trainerSimilarity >= 0.999 ? 2 : candidate.trainerSimilarity >= 0.82 ? 1 : 0,
    candidate.score,
    -candidate.timeDiffMinutes,
  ];

  const currentRank = [
    current.classSimilarity >= 0.9 ? 2 : current.classSimilarity >= 0.6 ? 1 : 0,
    current.timeDiffMinutes === 0 ? 2 : current.timeDiffMinutes <= 15 ? 1 : 0,
    current.trainerSimilarity >= 0.999 ? 2 : current.trainerSimilarity >= 0.82 ? 1 : 0,
    current.score,
    -current.timeDiffMinutes,
  ];

  for (let i = 0; i < candidateRank.length; i++) {
    if (candidateRank[i] !== currentRank[i]) {
      return candidateRank[i] > currentRank[i] ? 1 : -1;
    }
  }

  return 0;
}

function canonicalizeCsv(row: ClassData): CanonicalRow<ClassData> {
  const coverTrainer = row.cover?.trim();
  const effectiveTrainer = coverTrainer || row.trainer1 || "";

  return {
    original: row,
    canonical: {
      day: normalizeDay(row.day || ""),
      time: normalizeTime(row.time || row.timeRaw || ""),
      className: normalizeClassName(row.className || ""),
      trainer: normalizeTrainer(effectiveTrainer),
      location: normalizeLocation(row.location) || "",
    },
  };
}

function canonicalizePdf(row: PdfClassData): CanonicalRow<PdfClassData> {
  return {
    original: row,
    canonical: {
      day: normalizeDay(row.day || ""),
      time: normalizeTime(row.time || ""),
      className: normalizeClassName(row.className || ""),
      trainer: normalizeTrainer(row.trainer || ""),
      location: normalizeLocation(row.location) || "",
    },
  };
}

function chooseStatus(assessment: MatchAssessment): CsvPdfMatchStatus {
  if (!assessment.timeMismatch && !assessment.classMismatch && !assessment.trainerMismatch) {
    return "match";
  }

  if (assessment.timeMismatch) return "time-mismatch";
  if (assessment.classMismatch) return "class-mismatch";
  if (assessment.trainerMismatch) return "trainer-mismatch";

  return "match";
}

export function alignCsvPdfData(
  csvData: { [day: string]: ClassData[] } | null,
  pdfData: PdfClassData[] | null
): CsvPdfAlignedRow[] {
  if (!csvData || !pdfData) return [];

  const csvRows: CanonicalRow<ClassData>[] = Object.values(csvData)
    .flat()
    .map(canonicalizeCsv)
    .filter(row => row.canonical.day && row.canonical.time && row.canonical.className);

  const pdfRows: CanonicalRow<PdfClassData>[] = pdfData
    .map(canonicalizePdf)
    .filter(row => row.canonical.day && row.canonical.time && row.canonical.className);

  const usedCsv = new Set<number>();
  const aligned: CsvPdfAlignedRow[] = [];

  const sortedPdf = [...pdfRows].sort((a, b) =>
    matchSortKey(a.canonical.day, a.canonical.time).localeCompare(matchSortKey(b.canonical.day, b.canonical.time))
  );

  for (const pdfRow of sortedPdf) {
    let bestCsvIndex = -1;
    let bestAssessment: MatchAssessment | null = null;

    csvRows.forEach((csvRow, index) => {
      if (usedCsv.has(index)) return;
      if (csvRow.canonical.day !== pdfRow.canonical.day) return;

      const assessment = assessMatch(pdfRow.canonical, csvRow.canonical);
      if (!isPlausiblePair(assessment)) return;

      const isBetter = compareAssessments(assessment, bestAssessment) > 0;

      if (isBetter) {
        bestAssessment = assessment;
        bestCsvIndex = index;
      }
    });

    if (bestAssessment && bestCsvIndex >= 0 && bestAssessment.score >= 62) {
      usedCsv.add(bestCsvIndex);
      const status = chooseStatus(bestAssessment);

      aligned.push({
        day: pdfRow.canonical.day,
        csvClass: csvRows[bestCsvIndex].original,
        pdfClass: pdfRow.original,
        status,
        assessment: bestAssessment,
        discrepancies: {
          timeMismatch: bestAssessment.timeMismatch || undefined,
          classMismatch: bestAssessment.classMismatch || undefined,
          trainerMismatch: bestAssessment.trainerMismatch || undefined,
        },
      });
      continue;
    }

    aligned.push({
      day: pdfRow.canonical.day,
      csvClass: null,
      pdfClass: pdfRow.original,
      status: "pdf-only",
      discrepancies: { csvMissing: true },
    });
  }

  csvRows.forEach((csvRow, index) => {
    if (usedCsv.has(index)) return;
    aligned.push({
      day: csvRow.canonical.day,
      csvClass: csvRow.original,
      pdfClass: null,
      status: "csv-only",
      discrepancies: { pdfMissing: true },
    });
  });

  aligned.sort((a, b) => {
    const timeA = normalizeTime(a.csvClass?.time || a.pdfClass?.time || "");
    const timeB = normalizeTime(b.csvClass?.time || b.pdfClass?.time || "");
    return matchSortKey(a.day, timeA).localeCompare(matchSortKey(b.day, timeB));
  });

  return aligned;
}
