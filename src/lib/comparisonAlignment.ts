import type { ComparedClass } from '@/types/schedule';

export type ComparisonSortMode = 'day-time' | 'status-severity' | 'class-name' | 'trainer-name';

export interface ComparisonAlignedRow {
  pdfClass: ComparedClass | null;
  csvClass: ComparedClass | null;
  status: ComparedClass['status'];
}

export const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const STATUS_SEVERITY: Record<ComparedClass['status'], number> = {
  mismatch: 0,
  missing: 1,
  extra: 2,
  match: 3,
};

export function getComparisonRowDay(row: ComparisonAlignedRow): string {
  return row.pdfClass?.day || row.csvClass?.day || '';
}

export function getComparisonRowTime(row: ComparisonAlignedRow): string {
  return row.pdfClass?.normalizedTime || row.csvClass?.normalizedTime || '';
}

export function getComparisonRowLocation(row: ComparisonAlignedRow): string {
  return row.pdfClass?.normalizedLocation || row.csvClass?.normalizedLocation || '';
}

export function getComparisonRowFocusId(row: ComparisonAlignedRow): string | null {
  if (row.status === 'extra') return row.csvClass?.id || null;
  return row.pdfClass?.id || row.csvClass?.id || null;
}

export function sortComparisonAlignedRows(rows: ComparisonAlignedRow[], sortMode: ComparisonSortMode): ComparisonAlignedRow[] {
  return [...rows].sort((a, b) => {
    const daySort = DAY_ORDER.indexOf(getComparisonRowDay(a)) - DAY_ORDER.indexOf(getComparisonRowDay(b));
    const timeSort = getComparisonRowTime(a).localeCompare(getComparisonRowTime(b));

    if (sortMode === 'day-time') {
      if (daySort !== 0) return daySort;
      return timeSort;
    }

    if (sortMode === 'status-severity') {
      const severitySort = STATUS_SEVERITY[a.status] - STATUS_SEVERITY[b.status];
      if (severitySort !== 0) return severitySort;
      if (daySort !== 0) return daySort;
      return timeSort;
    }

    if (sortMode === 'class-name') {
      const classSort = (a.pdfClass?.normalizedClassName || a.csvClass?.normalizedClassName || a.pdfClass?.className || a.csvClass?.className || '')
        .toLowerCase()
        .localeCompare((b.pdfClass?.normalizedClassName || b.csvClass?.normalizedClassName || b.pdfClass?.className || b.csvClass?.className || '').toLowerCase());
      if (classSort !== 0) return classSort;
      if (daySort !== 0) return daySort;
      return timeSort;
    }

    const trainerSort = (a.pdfClass?.normalizedTrainer || a.csvClass?.normalizedTrainer || '').toLowerCase().localeCompare(
      (b.pdfClass?.normalizedTrainer || b.csvClass?.normalizedTrainer || '').toLowerCase()
    );
    if (trainerSort !== 0) return trainerSort;
    if (daySort !== 0) return daySort;
    return timeSort;
  });
}

export function buildComparisonAlignedRows(pdfClasses: ComparedClass[], csvClasses: ComparedClass[]): ComparisonAlignedRow[] {
  const rows: ComparisonAlignedRow[] = [];
  const usedCsvIds = new Set<string>();

  for (const pdfCls of pdfClasses) {
    if (pdfCls.status === 'match' || pdfCls.status === 'mismatch') {
      const csvMatch = csvClasses.find(c => c.id === pdfCls.matchedWith?.id);
      if (csvMatch) {
        usedCsvIds.add(csvMatch.id);
        rows.push({ pdfClass: pdfCls, csvClass: csvMatch, status: pdfCls.status });
      } else {
        rows.push({ pdfClass: pdfCls, csvClass: null, status: pdfCls.status });
      }
      continue;
    }

    if (pdfCls.status === 'missing') {
      rows.push({ pdfClass: pdfCls, csvClass: null, status: 'missing' });
    }
  }

  for (const csvCls of csvClasses) {
    if (!usedCsvIds.has(csvCls.id) && csvCls.status === 'extra') {
      rows.push({ pdfClass: null, csvClass: csvCls, status: 'extra' });
    }
  }

  return sortComparisonAlignedRows(rows, 'day-time');
}
