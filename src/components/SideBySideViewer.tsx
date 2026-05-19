import React, { useCallback, useMemo, useState, useEffect } from 'react';
import { ClassData, ComparedClass, FilterState, PdfClassData, ScheduleComparisonResult } from '@/types/schedule';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FilterSection } from './FilterSection';
import { passesFilters } from '@/lib/filterUtils';
import { toast } from '@/hooks/use-toast';
import {
  buildComparisonAlignedRows,
  DAY_ORDER,
  getComparisonRowDay,
  getComparisonRowLocation,
  getComparisonRowTime,
  type ComparisonAlignedRow,
} from '@/lib/comparisonAlignment';
import { normalizeClassName, normalizeLocation, normalizeTime, normalizeTrainer } from '@/lib/normalizers';
import {
  CheckCircle2,
  AlertTriangle,
  FileSpreadsheet,
  FileText,
  Users,
  BookOpen,
  Clock,
  Copy,
  Check,
  Download,
  Wand2,
  ChevronLeft,
  ChevronRight,
  Building2,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
} from 'lucide-react';

interface SideBySideViewerProps {
  csvData: { [day: string]: ClassData[] } | null;
  pdfData: PdfClassData[] | null;
  comparison: ScheduleComparisonResult | null;
  locationFilter?: string;
}

type RowStatus = 'match' | 'mismatch' | 'csv-only' | 'pdf-only';
type IssueType = 'trainer-mismatch' | 'class-mismatch' | 'time-mismatch' | 'location-mismatch' | 'theme-mismatch' | 'csv-only' | 'pdf-only';
type QuickFilter = string; // 'all' | 'matches' | 'mismatches' | location string
type GroupBy = 'day' | 'location' | 'both' | 'none';
type SortColumn =
  | 'default'
  | 'day'
  | 'location'
  | 'csvTime'
  | 'csvClass'
  | 'csvTrainer'
  | 'csvTheme'
  | 'status'
  | 'pdfTime'
  | 'pdfClass'
  | 'pdfTrainer'
  | 'pdfTheme';
type SortDirection = 'asc' | 'desc';
type SortConfig = { column: SortColumn; direction: SortDirection };
type GroupSection = { key: string; label: string; subLabel?: string; rows: AlignedRow[] };
type GroupMetrics = { matches: number; issues: number; csvOnly: number; pdfOnly: number };

interface AlignedRow {
  day: string;
  location: string;
  sortTime: string;
  csvClass: ComparedClass | null;
  pdfComparedClass: ComparedClass | null;
  pdfClass: PdfClassData | null;
  matchStatus: RowStatus;
  issueTypes: IssueType[];
}

const HEADER_BASE_CLASS = 'sticky z-30 border-r border-slate-700/60 bg-transparent px-3 py-0 text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-100 whitespace-nowrap align-middle shadow-[inset_0_-1px_0_rgba(148,163,184,0.32)]';
const CSV_HEADER_CLASS = 'sticky z-20 border-r border-slate-700/60 bg-transparent px-3 py-0 text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-100 whitespace-nowrap align-middle shadow-[inset_0_-1px_0_rgba(125,211,252,0.22)]';
const PDF_HEADER_CLASS = 'sticky z-20 border-r border-slate-700/60 bg-transparent px-3 py-0 text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-indigo-100 whitespace-nowrap align-middle shadow-[inset_0_-1px_0_rgba(165,180,252,0.22)]';
const GROUP_HEADER_CLASS = 'sticky top-0 z-20 h-9 border-r border-slate-700/60 bg-transparent px-3 py-0 text-center text-[10px] font-semibold uppercase tracking-[0.16em] align-middle shadow-[inset_0_-1px_0_rgba(148,163,184,0.32)]';

function getComparedPdfUniqueKey(cls: ComparedClass): string {
  return `${cls.day}-${cls.normalizedTime}-${cls.normalizedClassName}-${cls.normalizedTrainer}`;
}

function buildPdfLookup(pdfRows: PdfClassData[]): Map<string, PdfClassData[]> {
  const lookup = new Map<string, PdfClassData[]>();

  for (const row of pdfRows) {
    const existing = lookup.get(row.uniqueKey) || [];
    existing.push(row);
    lookup.set(row.uniqueKey, existing);
  }

  return lookup;
}

function getComparedLocation(comparedClass: ComparedClass): string | undefined {
  return comparedClass.normalizedLocation || normalizeLocation(comparedClass.location);
}

function hasSamePdfLocation(row: PdfClassData, comparedClass: ComparedClass): boolean {
  const rowLocation = normalizeLocation(row.location);
  const comparedLocation = getComparedLocation(comparedClass);

  return Boolean(rowLocation && comparedLocation && rowLocation === comparedLocation);
}

function hasCompatiblePdfLocation(row: PdfClassData, comparedClass: ComparedClass): boolean {
  const rowLocation = normalizeLocation(row.location);
  const comparedLocation = getComparedLocation(comparedClass);

  return !rowLocation || !comparedLocation || rowLocation === comparedLocation;
}

function findRawPdfClass(
  comparedClass: ComparedClass | null,
  pdfLookup: Map<string, PdfClassData[]>,
  pdfRows: PdfClassData[]
): PdfClassData | null {
  if (!comparedClass) return null;

  const exactMatches = pdfLookup.get(getComparedPdfUniqueKey(comparedClass)) || [];
  const exactLocationMatch = exactMatches.find(row => hasSamePdfLocation(row, comparedClass));
  if (exactLocationMatch) return exactLocationMatch;

  if (exactMatches.length === 1 && hasCompatiblePdfLocation(exactMatches[0], comparedClass)) {
    return exactMatches[0];
  }

  if (exactMatches.length > 0 && !getComparedLocation(comparedClass)) {
    return exactMatches[0];
  }

  return (
    pdfRows.find(row => {
      const sameDay = row.day === comparedClass.day;
      const sameTime = normalizeTime(row.time) === comparedClass.normalizedTime;
      const sameClass = normalizeClassName(row.className) === comparedClass.normalizedClassName;
      const sameTrainer = normalizeTrainer(row.trainer) === comparedClass.normalizedTrainer;

      return sameDay && sameTime && sameClass && sameTrainer && hasCompatiblePdfLocation(row, comparedClass);
    }) || null
  );
}

function deriveIssueTypes(row: ComparisonAlignedRow): IssueType[] {
  if (row.status === 'missing') return ['pdf-only'];
  if (row.status === 'extra') return ['csv-only'];
  if (row.status !== 'mismatch') return [];

  const differences = row.pdfClass?.differences || row.csvClass?.differences;
  const issues: IssueType[] = [];

  if (differences?.className) issues.push('class-mismatch');
  if (differences?.trainer) issues.push('trainer-mismatch');
  if (differences?.time) issues.push('time-mismatch');
  if (differences?.location) issues.push('location-mismatch');
  if (differences?.theme) issues.push('theme-mismatch');

  return issues;
}

function getRowStatus(row: ComparisonAlignedRow): RowStatus {
  if (row.status === 'match') return 'match';
  if (row.status === 'extra') return 'csv-only';
  if (row.status === 'missing') return 'pdf-only';
  return 'mismatch';
}

function rowMatchesQuickFilter(row: AlignedRow, filter: string): boolean {
  if (filter === 'all') return true;
  if (filter === 'matches') return row.matchStatus === 'match';
  if (filter === 'mismatches') return row.matchStatus !== 'match';
  const rowLoc = normalizeLocation(row.location) || row.location;
  return rowLoc === filter || row.location === filter;
}

function getStatusInfo(row: AlignedRow): { icon: React.ReactNode; label: string; color: string; badgeClass: string } {
  if (row.matchStatus === 'match') {
    return {
      icon: <CheckCircle2 className="w-4 h-4 text-emerald-700" />,
      label: 'Match',
      color: 'text-slate-700',
      badgeClass: 'border-emerald-200 bg-emerald-50/80',
    };
  }

  if (row.matchStatus === 'csv-only') {
    return {
      icon: <FileSpreadsheet className="w-4 h-4 text-slate-600" />,
      label: 'CSV Only',
      color: 'text-slate-700',
      badgeClass: 'border-slate-200 bg-slate-50',
    };
  }

  if (row.matchStatus === 'pdf-only') {
    return {
      icon: <FileText className="w-4 h-4 text-slate-600" />,
      label: 'PDF Only',
      color: 'text-slate-700',
      badgeClass: 'border-slate-200 bg-slate-50',
    };
  }

  if (row.issueTypes.length > 1) {
    return {
      icon: <AlertTriangle className="w-4 h-4 text-amber-700" />,
      label: 'Multiple',
      color: 'text-slate-800',
      badgeClass: 'border-amber-200 bg-amber-50/80',
    };
  }

  switch (row.issueTypes[0]) {
    case 'trainer-mismatch':
      return {
        icon: <Users className="w-4 h-4 text-amber-700" />,
        label: 'Trainer',
        color: 'text-slate-800',
        badgeClass: 'border-amber-200 bg-amber-50/80',
      };
    case 'class-mismatch':
      return {
        icon: <BookOpen className="w-4 h-4 text-amber-700" />,
        label: 'Class',
        color: 'text-slate-800',
        badgeClass: 'border-amber-200 bg-amber-50/80',
      };
    case 'time-mismatch':
      return {
        icon: <Clock className="w-4 h-4 text-amber-700" />,
        label: 'Time',
        color: 'text-slate-800',
        badgeClass: 'border-amber-200 bg-amber-50/80',
      };
    case 'location-mismatch':
      return {
        icon: <Building2 className="w-4 h-4 text-amber-700" />,
        label: 'Location',
        color: 'text-slate-800',
        badgeClass: 'border-amber-200 bg-amber-50/80',
      };
    case 'theme-mismatch':
      return {
        icon: <Wand2 className="w-4 h-4 text-amber-700" />,
        label: 'Theme',
        color: 'text-slate-800',
        badgeClass: 'border-amber-200 bg-amber-50/80',
      };
    default:
      return {
        icon: <AlertTriangle className="w-4 h-4 text-amber-700" />,
        label: 'Mismatch',
        color: 'text-slate-800',
        badgeClass: 'border-amber-200 bg-amber-50/80',
      };
  }
}

function getIssueLabel(issue: IssueType): string {
  switch (issue) {
    case 'trainer-mismatch':
      return 'Trainer Mismatch';
    case 'class-mismatch':
      return 'Class Mismatch';
    case 'time-mismatch':
      return 'Time Mismatch';
    case 'location-mismatch':
      return 'Location Mismatch';
    case 'theme-mismatch':
      return 'Theme Mismatch';
    case 'csv-only':
      return 'Not in PDF';
    case 'pdf-only':
      return 'Not in CSV';
  }
}

function getIssueSummary(row: AlignedRow): string {
  if (row.matchStatus !== 'mismatch') return getStatusInfo(row).label;
  return row.issueTypes.length > 0 ? row.issueTypes.map(getIssueLabel).join(' + ') : 'Mismatch';
}

function getCombinedLocationLabel(row: AlignedRow): string {
  const csvLocation = row.csvClass?.normalizedLocation || row.csvClass?.location || '';
  const pdfLocation = row.pdfClass?.location || row.pdfComparedClass?.normalizedLocation || row.pdfComparedClass?.location || '';

  if (!csvLocation && !pdfLocation) return '—';
  if (!csvLocation) return pdfLocation;
  if (!pdfLocation) return csvLocation;
  if (csvLocation === pdfLocation) return csvLocation;
  return `${csvLocation} ↔ ${pdfLocation}`;
}

function getGroupMetrics(rows: AlignedRow[]): GroupMetrics {
  return {
    matches: rows.filter(row => row.matchStatus === 'match').length,
    issues: rows.filter(row => row.matchStatus === 'mismatch').length,
    csvOnly: rows.filter(row => row.matchStatus === 'csv-only').length,
    pdfOnly: rows.filter(row => row.matchStatus === 'pdf-only').length,
  };
}

function compareDefaultRows(a: AlignedRow, b: AlignedRow): number {
  const ai = DAY_ORDER.indexOf(a.day);
  const bi = DAY_ORDER.indexOf(b.day);
  if (ai !== bi) {
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  }

  const timeSort = a.sortTime.localeCompare(b.sortTime);
  if (timeSort !== 0) return timeSort;

  return getCombinedLocationLabel(a).localeCompare(getCombinedLocationLabel(b));
}

function compareSortValues(a: string | number, b: string | number): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

function SortableColumnHeader({
  label,
  column,
  sortConfig,
  onSort,
}: {
  label: string;
  column: SortColumn;
  sortConfig: SortConfig;
  onSort: (column: SortColumn) => void;
}) {
  const active = sortConfig.column === column;
  const SortIcon = active
    ? sortConfig.direction === 'asc'
      ? ChevronUp
      : ChevronDown
    : ArrowUpDown;
  const iconClass = active
    ? 'bg-white/15 text-white shadow-[0_0_0_1px_rgba(255,255,255,0.14)] sort-icon-active'
    : 'text-slate-400 group-hover:bg-white/10 group-hover:text-white';

  return (
    <button
      type="button"
      onClick={() => onSort(column)}
      aria-label={`Sort by ${label}`}
      aria-pressed={active}
      className="group flex h-full w-full items-center justify-between gap-2 rounded-md text-left uppercase transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/35"
    >
      <span>{label}</span>
      <span className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-all duration-200 ${iconClass}`}>
        <SortIcon className={`h-3.5 w-3.5 transition-transform duration-200 ${active && sortConfig.direction === 'desc' ? 'rotate-0' : ''}`} />
      </span>
    </button>
  );
}

export function SideBySideViewer({ csvData, pdfData, comparison, locationFilter = 'all' }: SideBySideViewerProps) {
  const [filters, setFilters] = useState<FilterState>({ day: [], location: [], trainer: [], className: [] });
  const [editablePdfData, setEditablePdfData] = useState<PdfClassData[]>([]);
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');
  const [copied, setCopied] = useState(false);
  const [showOnlyMismatches, setShowOnlyMismatches] = useState(true);
  const [activeMismatchIndex, setActiveMismatchIndex] = useState(0);
  const [groupBy, setGroupBy] = useState<GroupBy>('none');
  const [showFilters, setShowFilters] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [sortConfig, setSortConfig] = useState<SortConfig>({ column: 'default', direction: 'asc' });

  useEffect(() => {
    if (pdfData) {
      setEditablePdfData([...pdfData]);
    }
  }, [pdfData]);

  const handleFilterChange = (newFilters: FilterState) => {
    setFilters(newFilters);
    localStorage.setItem('csvFilters', JSON.stringify(newFilters));
  };

  const pdfLookup = useMemo(() => buildPdfLookup(pdfData || []), [pdfData]);

  const comparisonRows = useMemo(() => {
    if (!comparison) return [];
    return buildComparisonAlignedRows(comparison.pdfClasses, comparison.csvClasses);
  }, [comparison]);

  const allAlignedData = useMemo<AlignedRow[]>(() => {
    return comparisonRows
      .map(row => {
        const day = getComparisonRowDay(row);
        const location = getComparisonRowLocation(row) || '';
        const sortTime = getComparisonRowTime(row);

        return {
          day,
          location,
          sortTime,
          csvClass: row.csvClass,
          pdfComparedClass: row.pdfClass,
          pdfClass: findRawPdfClass(row.pdfClass, pdfLookup, pdfData || []),
          matchStatus: getRowStatus(row),
          issueTypes: deriveIssueTypes(row),
        };
      })
      .filter(row => {
        const normalizedRowLocation = normalizeLocation(row.location) || row.location;

        if (locationFilter !== 'all' && normalizedRowLocation !== locationFilter) {
          return false;
        }

        return passesFilters(
          {
            day: row.day,
            location: row.location,
            trainer: row.csvClass?.trainer || row.pdfComparedClass?.trainer || row.pdfClass?.trainer || '',
            className: row.csvClass?.className || row.pdfComparedClass?.className || row.pdfClass?.className || '',
          },
          filters
        );
      });
  }, [comparisonRows, filters, locationFilter, pdfData, pdfLookup]);

  const allLocations = useMemo(() => {
    const locs = new Set<string>();
    allAlignedData.forEach(row => { if (row.location) locs.add(row.location); });
    return Array.from(locs).sort();
  }, [allAlignedData]);

  const totalMatches = allAlignedData.filter(row => row.matchStatus === 'match').length;
  const totalNonMatches = allAlignedData.filter(row => row.matchStatus !== 'match').length;

  const getEditablePdfRowIndex = useCallback((pdfClass: PdfClassData | null): number => {
    if (!pdfClass) return -1;

    const matchingIndexes = editablePdfData
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => row.uniqueKey === pdfClass.uniqueKey);

    const targetLocation = normalizeLocation(pdfClass.location);
    const locationMatch = matchingIndexes.find(({ row }) => {
      const rowLocation = normalizeLocation(row.location);
      return Boolean(rowLocation && targetLocation && rowLocation === targetLocation);
    });

    if (locationMatch) return locationMatch.index;
    if (matchingIndexes.length === 1) return matchingIndexes[0].index;

    return -1;
  }, [editablePdfData]);

  const getEditablePdfRow = useCallback((pdfClass: PdfClassData | null): PdfClassData | null => {
    if (!pdfClass) return null;
    const index = getEditablePdfRowIndex(pdfClass);
    return index >= 0 ? editablePdfData[index] : pdfClass;
  }, [editablePdfData, getEditablePdfRowIndex]);

  const getSortValue = useCallback((row: AlignedRow, column: SortColumn): string | number => {
    const editablePdfRow = getEditablePdfRow(row.pdfClass);

    switch (column) {
      case 'day': {
        const dayIndex = DAY_ORDER.indexOf(row.day);
        return dayIndex === -1 ? Number.MAX_SAFE_INTEGER : dayIndex;
      }
      case 'location':
        return getCombinedLocationLabel(row);
      case 'csvTime':
        return row.csvClass?.normalizedTime || row.csvClass?.time || '';
      case 'csvClass':
        return row.csvClass?.normalizedClassName || row.csvClass?.className || '';
      case 'csvTrainer':
        return row.csvClass?.normalizedTrainer || row.csvClass?.trainer || '';
      case 'csvTheme':
        return row.csvClass?.theme || '';
      case 'status':
        return getIssueSummary(row);
      case 'pdfTime':
        return normalizeTime(editablePdfRow?.time || row.pdfComparedClass?.time || '');
      case 'pdfClass':
        return normalizeClassName(editablePdfRow?.className || row.pdfComparedClass?.className || '');
      case 'pdfTrainer':
        return normalizeTrainer(editablePdfRow?.trainer || row.pdfComparedClass?.trainer || '');
      case 'pdfTheme':
        return editablePdfRow?.theme || row.pdfComparedClass?.theme || '';
      case 'default':
      default:
        return 0;
    }
  }, [getEditablePdfRow]);

  const handleSort = useCallback((column: SortColumn) => {
    setSortConfig(current => {
      if (current.column === column) {
        return { column, direction: current.direction === 'asc' ? 'desc' : 'asc' };
      }

      return { column, direction: 'asc' };
    });
  }, []);

  const sortedRows = useMemo(() => {
    return [...allAlignedData].sort((a, b) => {
      const baseSort = sortConfig.column === 'default'
        ? compareDefaultRows(a, b)
        : compareSortValues(getSortValue(a, sortConfig.column), getSortValue(b, sortConfig.column)) || compareDefaultRows(a, b);

      return sortConfig.direction === 'asc' ? baseSort : -baseSort;
    });
  }, [allAlignedData, getSortValue, sortConfig]);

  const filteredRows = useMemo(() => {
    return sortedRows.filter(row => {
      if (showOnlyMismatches && row.matchStatus === 'match') return false;
      return rowMatchesQuickFilter(row, quickFilter);
    });
  }, [sortedRows, showOnlyMismatches, quickFilter]);

  const groupedSections = useMemo((): GroupSection[] => {
    if (groupBy === 'none') {
      return [{ key: 'all', label: '', rows: filteredRows }];
    }
    if (groupBy === 'day') {
      const map = new Map<string, AlignedRow[]>();
      filteredRows.forEach(row => { const b = map.get(row.day) || []; b.push(row); map.set(row.day, b); });
      return Array.from(map.entries()).map(([day, rows]) => ({ key: day, label: day, rows }));
    }
    if (groupBy === 'location') {
      const map = new Map<string, AlignedRow[]>();
      filteredRows.forEach(row => {
        const loc = row.location || 'Unknown';
        const b = map.get(loc) || []; b.push(row); map.set(loc, b);
      });
      return Array.from(map.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([loc, rows]) => ({ key: loc, label: loc, rows }));
    }
    // both: day > location
    const dayLocMap = new Map<string, Map<string, AlignedRow[]>>();
    filteredRows.forEach(row => {
      const locMap = dayLocMap.get(row.day) || new Map<string, AlignedRow[]>();
      const loc = row.location || 'Unknown';
      const b = locMap.get(loc) || []; b.push(row); locMap.set(loc, b);
      dayLocMap.set(row.day, locMap);
    });
    const sections: GroupSection[] = [];
    const sortedDays = Array.from(dayLocMap.keys()).sort((a, b) => {
      const ai = DAY_ORDER.indexOf(a), bi = DAY_ORDER.indexOf(b);
      return ai === -1 ? 1 : bi === -1 ? -1 : ai - bi;
    });
    sortedDays.forEach(day => {
      const locMap = dayLocMap.get(day)!;
      Array.from(locMap.entries()).sort((a, b) => a[0].localeCompare(b[0])).forEach(([loc, rows]) => {
        sections.push({ key: `${day}-${loc}`, label: day, subLabel: loc, rows });
      });
    });
    return sections;
  }, [groupBy, filteredRows]);

  const visibleRows = filteredRows;
  const mismatchRows = visibleRows.filter(row => row.matchStatus !== 'match');
  const mismatchIndexByRow = new Map<AlignedRow, number>();
  mismatchRows.forEach((row, index) => mismatchIndexByRow.set(row, index));

  useEffect(() => {
    if (activeMismatchIndex >= mismatchRows.length) {
      setActiveMismatchIndex(0);
    }
  }, [activeMismatchIndex, mismatchRows.length]);

  const scrollToMismatch = (targetIndex: number) => {
    if (mismatchRows.length === 0) return;
    const next = (targetIndex + mismatchRows.length) % mismatchRows.length;
    setActiveMismatchIndex(next);

    requestAnimationFrame(() => {
      const row = document.querySelector<HTMLElement>(`[data-mismatch-index="${next}"]`);
      row?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  };

  const generateCSVExport = (): string => {
    const headers = ['Day', 'Location', 'CSV Time', 'CSV Class', 'CSV Trainer', 'CSV Theme', 'Status', 'PDF Time', 'PDF Class', 'PDF Trainer', 'PDF Theme'];
    const rows = allAlignedData.map(row => {
      const editablePdfRow = getEditablePdfRow(row.pdfClass);

      return [
        row.day,
        getCombinedLocationLabel(row),
        row.csvClass?.time || '',
        row.csvClass?.className || '',
        row.csvClass?.trainer || '',
        row.csvClass?.theme || '',
        getIssueSummary(row),
        editablePdfRow?.time || '',
        editablePdfRow?.className || '',
        editablePdfRow?.trainer || '',
        editablePdfRow?.theme || row.pdfComparedClass?.theme || '',
      ];
    });

    return [headers.join(','), ...rows.map(r => r.map(cell => `"${cell}"`).join(','))].join('\n');
  };

  const copyMismatchesInTableFormat = async (): Promise<void> => {
    const mismatchRowsOnly = allAlignedData.filter(row => row.matchStatus !== 'match');

    const tableStyles = `
      border-collapse: collapse;
      width: 100%;
      font-family: Arial, sans-serif;
      font-size: 12px;
    `;

    const headerStyles = `
      background-color: #f8f9fa;
      border: 1px solid #dee2e6;
      padding: 8px;
      text-align: left;
      font-weight: bold;
    `;

    const cellStyles = `
      border: 1px solid #dee2e6;
      padding: 8px;
      text-align: left;
    `;

    let htmlTable = `<table style="${tableStyles}">\n`;
    htmlTable += `<tr>\n`;
    htmlTable += `<td style="${headerStyles}">Day</td>`;
    htmlTable += `<td style="${headerStyles}">CSV Time</td>`;
    htmlTable += `<td style="${headerStyles}">CSV Class</td>`;
    htmlTable += `<td style="${headerStyles}">CSV Trainer</td>`;
    htmlTable += `<td style="${headerStyles}">CSV Location</td>`;
    htmlTable += `<td style="${headerStyles}">CSV Theme</td>`;
    htmlTable += `<td style="${headerStyles}">Status</td>`;
    htmlTable += `<td style="${headerStyles}">PDF Time</td>`;
    htmlTable += `<td style="${headerStyles}">PDF Class</td>`;
    htmlTable += `<td style="${headerStyles}">PDF Trainer</td>`;
    htmlTable += `<td style="${headerStyles}">PDF Location</td>`;
    htmlTable += `<td style="${headerStyles}">PDF Theme</td>`;
    htmlTable += `</tr>\n`;

    mismatchRowsOnly.forEach(row => {
      const editablePdfRow = getEditablePdfRow(row.pdfClass);
      htmlTable += `<tr>\n`;
      htmlTable += `<td style="${cellStyles}">${row.day}</td>`;
      htmlTable += `<td style="${cellStyles}">${row.csvClass?.time || '—'}</td>`;
      htmlTable += `<td style="${cellStyles}">${row.csvClass?.className || '—'}</td>`;
      htmlTable += `<td style="${cellStyles}">${row.csvClass?.trainer || '—'}</td>`;
      htmlTable += `<td style="${cellStyles}">${row.csvClass?.normalizedLocation || row.csvClass?.location || '—'}</td>`;
      htmlTable += `<td style="${cellStyles}">${row.csvClass?.theme || '—'}</td>`;
      htmlTable += `<td style="${cellStyles}">${getIssueSummary(row)}</td>`;
      htmlTable += `<td style="${cellStyles}">${editablePdfRow?.time || '—'}</td>`;
      htmlTable += `<td style="${cellStyles}">${editablePdfRow?.className || '—'}</td>`;
      htmlTable += `<td style="${cellStyles}">${editablePdfRow?.trainer || '—'}</td>`;
      htmlTable += `<td style="${cellStyles}">${editablePdfRow?.location || row.pdfComparedClass?.normalizedLocation || '—'}</td>`;
      htmlTable += `<td style="${cellStyles}">${editablePdfRow?.theme || row.pdfComparedClass?.theme || '—'}</td>`;
      htmlTable += `</tr>\n`;
    });

    htmlTable += `</table>`;

    try {
      await navigator.clipboard.writeText(htmlTable);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({
        title: 'Mismatches Copied!',
        description: `Copied ${mismatchRowsOnly.length} mismatch rows in HTML table format to clipboard`,
      });
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
      toast({
        title: 'Copy Failed',
        description: 'Could not copy to clipboard. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const downloadFile = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const applyAutoCorrections = () => {
    if (!editablePdfData.length) return;

    let correctionCount = 0;
    const correctedData: PdfClassData[] = [...editablePdfData];

    allAlignedData.forEach(row => {
      if (!row.pdfClass || !row.csvClass || row.matchStatus !== 'mismatch') return;

      const pdfIndex = getEditablePdfRowIndex(row.pdfClass);
      if (pdfIndex === -1) return;

      if (row.issueTypes.includes('time-mismatch')) {
        correctedData[pdfIndex].time = row.csvClass.time;
        correctionCount++;
      }

      if (row.issueTypes.includes('class-mismatch')) {
        correctedData[pdfIndex].className = row.csvClass.className;
        correctionCount++;
      }

      if (row.issueTypes.includes('trainer-mismatch')) {
        correctedData[pdfIndex].trainer = row.csvClass.trainer;
        correctionCount++;
      }

      if (row.issueTypes.includes('location-mismatch')) {
        correctedData[pdfIndex].location = row.csvClass.normalizedLocation || row.csvClass.location || correctedData[pdfIndex].location;
        correctionCount++;
      }
    });

    setEditablePdfData(correctedData);

    toast({
      title: 'Auto-Corrections Applied!',
      description: `${correctionCount} corrections made to PDF data. Click Export to download.`,
    });
  };

  const handleCellEdit = (pdfClass: PdfClassData, field: 'time' | 'className' | 'trainer' | 'location' | 'theme', value: string) => {
    const updated = [...editablePdfData];
    const index = getEditablePdfRowIndex(pdfClass);
    if (index === -1) return;

    updated[index] = {
      ...updated[index],
      [field]: value,
    };
    setEditablePdfData(updated);
  };

  const exportPdfData = () => {
    const headers = ['Day', 'Time', 'Class Name', 'Trainer', 'Location', 'Theme'];
    const rows = editablePdfData.map(item => [item.day, item.time, item.className, item.trainer, item.location || '', item.theme || '']);

    const csvContent = [headers.join(','), ...rows.map(r => r.map(cell => `"${cell}"`).join(','))].join('\n');
    downloadFile(csvContent, 'edited-schedule-data.csv', 'text/csv');

    toast({
      title: 'PDF Data Exported!',
      description: `Exported ${editablePdfData.length} classes. Use this to update your PDF.`,
    });
  };

  if (!csvData || !pdfData || !comparison) {
    return (
      <Card className="flex flex-col items-center justify-center p-8 bg-white">
        <p className="text-slate-600 mb-4">Please upload both CSV and PDF files to use the side-by-side viewer.</p>
        <div className="text-sm text-slate-500 space-y-1">
          <p>CSV Data: {csvData ? '✓ Loaded' : '✗ Missing'}</p>
          <p>PDF Data: {pdfData ? `✓ Loaded (${pdfData.length} classes)` : '✗ Missing'}</p>
          <p>Comparison: {comparison ? '✓ Ready' : '✗ Missing'}</p>
        </div>
      </Card>
    );
  }

  const totalCols = groupBy === 'none' ? 12 : groupBy === 'both' ? 10 : 11;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">

      {/* Top toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
        <div className="flex items-center gap-3">
          <p className="text-xs font-medium text-slate-600">
            {visibleRows.length} rows ·{' '}
            <span className="font-semibold text-amber-700">{mismatchRows.length} issues</span>
            {' '}· {totalMatches} matches
          </p>
          <div className="flex items-center gap-1 border-l border-slate-200 pl-3">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => scrollToMismatch(activeMismatchIndex - 1)}
              disabled={mismatchRows.length === 0}
              className="h-7 w-7 rounded-md p-0 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </Button>
            <span className="min-w-[44px] text-center font-mono text-xs text-slate-500">
              {mismatchRows.length > 0 ? `${activeMismatchIndex + 1}/${mismatchRows.length}` : '—'}
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => scrollToMismatch(activeMismatchIndex + 1)}
              disabled={mismatchRows.length === 0}
              className="h-7 w-7 rounded-md p-0 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowFilters(f => !f)}
            className={`h-8 rounded-md text-xs gap-1.5 ${showFilters ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            Filters
            {showFilters ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </Button>
          <div className="w-px h-5 bg-slate-200" />
          <Button variant="outline" size="sm" onClick={copyMismatchesInTableFormat} className="h-8 rounded-md border-slate-200 bg-white text-xs gap-1.5">
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-700" /> : <Copy className="w-3.5 h-3.5" />}
            Copy
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const c = generateCSVExport();
              downloadFile(c, 'schedule-comparison.csv', 'text/csv');
              toast({ title: 'Exported!', description: 'Comparison exported to CSV' });
            }}
            className="h-8 rounded-md border-slate-200 bg-white text-xs gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            Export
          </Button>
          <Button variant="default" size="sm" onClick={applyAutoCorrections} className="h-8 rounded-md bg-slate-900 text-xs gap-1.5 hover:bg-slate-800">
            <Wand2 className="w-3.5 h-3.5" />
            Auto-Correct
          </Button>
          <Button variant="outline" size="sm" onClick={exportPdfData} className="h-8 rounded-md border-slate-200 bg-white text-xs gap-1.5">
            <Download className="w-3.5 h-3.5" />
            Export PDF
          </Button>
        </div>
      </div>

      {/* Collapsible filters */}
      {showFilters && (
        <FilterSection data={csvData} filters={filters} onFilterChange={handleFilterChange} />
      )}

      {/* Controls: quick filters + show mismatches + group by */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
        <Button
          variant={showOnlyMismatches ? 'default' : 'outline'}
          size="sm"
          onClick={() => setShowOnlyMismatches(!showOnlyMismatches)}
          className="h-8 rounded-md text-xs gap-1.5"
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          {showOnlyMismatches ? 'Show All' : 'Issues Only'}
        </Button>
        <div className="w-px h-5 bg-slate-200" />
        {[
          { key: 'all', label: `All (${allAlignedData.length})` },
          { key: 'matches', label: `Matches (${totalMatches})` },
          { key: 'mismatches', label: `Issues (${totalNonMatches})` },
          ...allLocations.map(loc => ({
            key: loc,
            label: `${loc} (${allAlignedData.filter(r => r.location === loc).length})`,
          })),
        ].map(btn => (
          <Button
            key={btn.key}
            variant={quickFilter === btn.key ? 'default' : 'outline'}
            size="sm"
            onClick={() => setQuickFilter(btn.key)}
            className={`h-8 rounded-md px-3 text-xs whitespace-nowrap ${quickFilter === btn.key ? 'bg-slate-900 text-white shadow-none' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
          >
            {btn.label}
          </Button>
        ))}
        <div className="ml-auto flex items-center gap-1">
          <span className="text-xs text-slate-400 mr-1">Group:</span>
          {(
            [
              { key: 'day', label: 'Day' },
              { key: 'location', label: 'Location' },
              { key: 'both', label: 'Day + Location' },
              { key: 'none', label: 'None' },
            ] as const
          ).map(opt => (
            <Button
              key={opt.key}
              variant={groupBy === opt.key ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setGroupBy(opt.key)}
              className="h-8 rounded-md text-xs"
            >
              {opt.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="min-h-0 h-[70vh] flex-1 overflow-x-auto overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-[1440px] w-max border-collapse text-[12px] leading-5">
          <thead className="bg-slate-950 text-slate-100">
            <tr className="bg-slate-950">
              <th rowSpan={2} className={`${HEADER_BASE_CLASS} top-0 h-[72px] min-w-[44px]`}>
                <SortableColumnHeader label="#" column="default" sortConfig={sortConfig} onSort={handleSort} />
              </th>
              {(groupBy === 'none' || groupBy === 'location') && (
                <th rowSpan={2} className={`${HEADER_BASE_CLASS} top-0 h-[72px] min-w-[104px]`}>
                  <SortableColumnHeader label="Day" column="day" sortConfig={sortConfig} onSort={handleSort} />
                </th>
              )}
              {(groupBy === 'none' || groupBy === 'day') && (
                <th rowSpan={2} className={`${HEADER_BASE_CLASS} top-0 h-[72px] min-w-[200px]`}>
                  <SortableColumnHeader label="Location" column="location" sortConfig={sortConfig} onSort={handleSort} />
                </th>
              )}
              <th colSpan={4} className={`${GROUP_HEADER_CLASS} text-sky-100`}>
                <span className="inline-flex items-center rounded-full border border-sky-300/30 bg-sky-300/10 px-3 py-1 text-[10px] font-bold tracking-[0.22em] text-sky-100 shadow-[0_0_22px_rgba(56,189,248,0.12)]">
                  CSV
                </span>
              </th>
              <th rowSpan={2} className={`${HEADER_BASE_CLASS} top-0 h-[72px] min-w-[112px] border-x text-center`}>
                <SortableColumnHeader label="Status" column="status" sortConfig={sortConfig} onSort={handleSort} />
              </th>
              <th colSpan={4} className={`${GROUP_HEADER_CLASS} text-indigo-100`}>
                <span className="inline-flex items-center rounded-full border border-indigo-300/30 bg-indigo-300/10 px-3 py-1 text-[10px] font-bold tracking-[0.22em] text-indigo-100 shadow-[0_0_22px_rgba(129,140,248,0.12)]">
                  PDF
                </span>
              </th>
            </tr>
            <tr className="z-10 bg-slate-950">
              <th className={`${CSV_HEADER_CLASS} top-9 h-9 min-w-[96px]`}>
                <SortableColumnHeader label="Time" column="csvTime" sortConfig={sortConfig} onSort={handleSort} />
              </th>
              <th className={`${CSV_HEADER_CLASS} top-9 h-9 min-w-[230px]`}>
                <SortableColumnHeader label="Class" column="csvClass" sortConfig={sortConfig} onSort={handleSort} />
              </th>
              <th className={`${CSV_HEADER_CLASS} top-9 h-9 min-w-[220px]`}>
                <SortableColumnHeader label="Trainer" column="csvTrainer" sortConfig={sortConfig} onSort={handleSort} />
              </th>
              <th className={`${CSV_HEADER_CLASS} top-9 h-9 min-w-[170px]`}>
                <SortableColumnHeader label="Theme" column="csvTheme" sortConfig={sortConfig} onSort={handleSort} />
              </th>
              <th className={`${PDF_HEADER_CLASS} top-9 h-9 min-w-[96px]`}>
                <SortableColumnHeader label="Time" column="pdfTime" sortConfig={sortConfig} onSort={handleSort} />
              </th>
              <th className={`${PDF_HEADER_CLASS} top-9 h-9 min-w-[230px]`}>
                <SortableColumnHeader label="Class" column="pdfClass" sortConfig={sortConfig} onSort={handleSort} />
              </th>
              <th className={`${PDF_HEADER_CLASS} top-9 h-9 min-w-[220px]`}>
                <SortableColumnHeader label="Trainer" column="pdfTrainer" sortConfig={sortConfig} onSort={handleSort} />
              </th>
              <th className={`${PDF_HEADER_CLASS} top-9 h-9 min-w-[170px]`}>
                <SortableColumnHeader label="Theme" column="pdfTheme" sortConfig={sortConfig} onSort={handleSort} />
              </th>
            </tr>
          </thead>
          <tbody>
            {groupedSections.map(section => (
              <React.Fragment key={section.key}>
                {section.label && (
                  <tr className="border-y border-slate-200 bg-slate-100">
                    <td
                      colSpan={totalCols}
                      className="px-3 py-2"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => setCollapsedGroups(current => {
                            const next = new Set(current);
                            if (next.has(section.key)) next.delete(section.key); else next.add(section.key);
                            return next;
                          })}
                          className="flex items-center gap-2 text-[11px] font-semibold text-slate-700 tracking-[0.12em] uppercase"
                        >
                          {collapsedGroups.has(section.key) ? <ChevronDown className="h-4 w-4 text-slate-500" /> : <ChevronUp className="h-4 w-4 text-slate-500" />}
                          <span>
                            {section.label}
                            {section.subLabel && <span className="text-slate-500 font-semibold"> · {section.subLabel}</span>}
                          </span>
                        </button>
                        {(() => {
                          const metrics = getGroupMetrics(section.rows);
                          return (
                            <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-slate-600">
                              <span className="rounded-md border border-slate-200 bg-white px-2 py-0.5">{section.rows.length} rows</span>
                              <span className="rounded-md border border-slate-200 bg-white px-2 py-0.5">{metrics.matches} match</span>
                              <span className="rounded-md border border-slate-200 bg-white px-2 py-0.5">{metrics.issues} issue</span>
                              {metrics.csvOnly > 0 && <span className="rounded-md border border-slate-200 bg-white px-2 py-0.5">{metrics.csvOnly} CSV-only</span>}
                              {metrics.pdfOnly > 0 && <span className="rounded-md border border-slate-200 bg-white px-2 py-0.5">{metrics.pdfOnly} PDF-only</span>}
                            </div>
                          );
                        })()}
                      </div>
                    </td>
                  </tr>
                )}
                {(collapsedGroups.has(section.key) && section.label ? [] : section.rows).map((row, idx) => {
                  const statusInfo = getStatusInfo(row);
                  const mismatchIndex = mismatchIndexByRow.get(row);
                  const isActiveMismatch = mismatchIndex !== undefined && mismatchIndex === activeMismatchIndex;
                  const editablePdfRow = getEditablePdfRow(row.pdfClass);

                  const rowState = isActiveMismatch
                    ? 'bg-white shadow-[inset_3px_0_0_rgb(217,119,6)]'
                    : 'bg-white';

                  return (
                    <tr
                      key={`${section.key}-${idx}`}
                      data-mismatch-index={mismatchIndex !== undefined ? mismatchIndex : undefined}
                      className={`border-b border-slate-200 transition-colors hover:bg-slate-50 ${rowState}`}
                    >
                      <td className="border-r border-slate-200 px-3 py-2 text-xs font-semibold text-slate-400 whitespace-nowrap align-middle">{idx + 1}</td>
                      {(groupBy === 'none' || groupBy === 'location') && (
                        <td className="border-r border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 whitespace-nowrap align-middle">{row.day}</td>
                      )}
                      {(groupBy === 'none' || groupBy === 'day') && (
                        <td className="min-w-[200px] border-r border-slate-200 px-3 py-2 text-xs text-slate-600 align-middle whitespace-normal break-words">
                          {getCombinedLocationLabel(row)}
                        </td>
                      )}
                      <td className="border-r border-slate-200 px-3 py-2 font-mono text-xs text-slate-700 whitespace-nowrap align-middle">
                        {row.csvClass?.time || <span className="text-slate-300">—</span>}
                      </td>
                      <td className="min-w-[230px] border-r border-slate-200 px-3 py-2 text-xs text-slate-800 font-medium align-middle whitespace-normal break-words">
                        {row.csvClass?.className || <span className="text-slate-300">—</span>}
                      </td>
                      <td className="min-w-[220px] border-r border-slate-200 px-3 py-2 text-xs text-slate-700 align-middle whitespace-normal break-words">
                        {row.csvClass?.trainer || <span className="text-slate-300">—</span>}
                      </td>
                      <td className="min-w-[170px] border-r border-slate-200 px-3 py-2 text-xs text-slate-700 align-middle whitespace-normal break-words">
                        {row.csvClass?.theme || <span className="text-slate-300">—</span>}
                      </td>
                      <td className="border-x border-slate-200 px-3 py-2 text-center align-middle">
                        <div className={`inline-flex h-7 w-[104px] items-center justify-center gap-1 whitespace-nowrap rounded-md border px-2 py-1 ${statusInfo.badgeClass}`}>
                          {statusInfo.icon}
                          <span className={`text-[10px] font-semibold ${statusInfo.color}`}>{statusInfo.label}</span>
                        </div>
                      </td>
                      <td className="border-r border-slate-200 px-3 py-2 font-mono text-xs text-slate-700 whitespace-nowrap align-middle">
                        {editablePdfRow ? (
                          <input
                            type="text"
                            value={editablePdfRow.time}
                            onChange={e => handleCellEdit(editablePdfRow, 'time', e.target.value)}
                            className="w-full min-w-[84px] rounded-md border border-transparent bg-transparent px-1 py-0.5 font-mono text-xs text-slate-700 hover:border-slate-200 focus:border-slate-300 focus:bg-white focus:outline-none focus:ring-0"
                          />
                        ) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="min-w-[230px] border-r border-slate-200 px-3 py-2 text-xs text-slate-800 font-medium align-middle">
                        {editablePdfRow ? (
                          <input
                            type="text"
                            value={editablePdfRow.className}
                            onChange={e => handleCellEdit(editablePdfRow, 'className', e.target.value)}
                            className="w-full min-w-[210px] rounded-md border border-transparent bg-transparent px-1 py-0.5 text-xs text-slate-800 hover:border-slate-200 focus:border-slate-300 focus:bg-white focus:outline-none focus:ring-0"
                          />
                        ) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="min-w-[220px] border-r border-slate-200 px-3 py-2 text-xs text-slate-700 align-middle">
                        {editablePdfRow ? (
                          <input
                            type="text"
                            value={editablePdfRow.trainer}
                            onChange={e => handleCellEdit(editablePdfRow, 'trainer', e.target.value)}
                            className="w-full min-w-[200px] rounded-md border border-transparent bg-transparent px-1 py-0.5 text-xs text-slate-700 hover:border-slate-200 focus:border-slate-300 focus:bg-white focus:outline-none focus:ring-0"
                          />
                        ) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="min-w-[170px] border-r border-slate-200 px-3 py-2 text-xs text-slate-700 align-middle">
                        {editablePdfRow ? (
                          <input
                            type="text"
                            value={editablePdfRow.theme || ''}
                            onChange={e => handleCellEdit(editablePdfRow, 'theme', e.target.value)}
                            className="w-full min-w-[150px] rounded-md border border-transparent bg-transparent px-1 py-0.5 text-xs text-slate-700 hover:border-slate-200 focus:border-slate-300 focus:bg-white focus:outline-none focus:ring-0"
                          />
                        ) : <span className="text-slate-300">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
