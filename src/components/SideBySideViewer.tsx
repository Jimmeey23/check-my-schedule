import React, { useMemo, useState, useEffect } from 'react';
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
import { normalizeLocation } from '@/lib/normalizers';
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
} from 'lucide-react';

interface SideBySideViewerProps {
  csvData: { [day: string]: ClassData[] } | null;
  pdfData: PdfClassData[] | null;
  comparison: ScheduleComparisonResult | null;
  locationFilter?: string;
}

type RowStatus = 'match' | 'mismatch' | 'csv-only' | 'pdf-only';
type IssueType = 'trainer-mismatch' | 'class-mismatch' | 'time-mismatch' | 'location-mismatch' | 'csv-only' | 'pdf-only';
type QuickFilter = 'all' | 'matches' | IssueType;

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

function findRawPdfClass(
  comparedClass: ComparedClass | null,
  pdfLookup: Map<string, PdfClassData[]>,
  pdfRows: PdfClassData[]
): PdfClassData | null {
  if (!comparedClass) return null;

  const exactMatch = pdfLookup.get(getComparedPdfUniqueKey(comparedClass))?.[0];
  if (exactMatch) return exactMatch;

  return (
    pdfRows.find(row => {
      const sameDay = row.day === comparedClass.day;
      const sameTime = row.time === comparedClass.normalizedTime;
      const sameClass = row.className === comparedClass.normalizedClassName;
      const sameTrainer = row.trainer === comparedClass.normalizedTrainer;
      return sameDay && sameTime && sameClass && sameTrainer;
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

  return issues.length > 0 ? issues : ['class-mismatch'];
}

function getRowStatus(row: ComparisonAlignedRow): RowStatus {
  if (row.status === 'match') return 'match';
  if (row.status === 'extra') return 'csv-only';
  if (row.status === 'missing') return 'pdf-only';
  return 'mismatch';
}

function rowMatchesQuickFilter(row: AlignedRow, filter: QuickFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'matches') return row.matchStatus === 'match';
  return row.issueTypes.includes(filter);
}

function getStatusInfo(row: AlignedRow): { icon: React.ReactNode; label: string; color: string } {
  if (row.matchStatus === 'match') {
    return {
      icon: <CheckCircle2 className="w-4 h-4 text-blue-800" />,
      label: 'Match',
      color: 'text-slate-700',
    };
  }

  if (row.matchStatus === 'csv-only') {
    return {
      icon: <FileSpreadsheet className="w-4 h-4 text-slate-500" />,
      label: 'CSV Only',
      color: 'text-slate-700',
    };
  }

  if (row.matchStatus === 'pdf-only') {
    return {
      icon: <FileText className="w-4 h-4 text-slate-500" />,
      label: 'PDF Only',
      color: 'text-slate-700',
    };
  }

  if (row.issueTypes.length > 1) {
    return {
      icon: <AlertTriangle className="w-4 h-4 text-blue-700" />,
      label: 'Multiple',
      color: 'text-slate-800',
    };
  }

  switch (row.issueTypes[0]) {
    case 'trainer-mismatch':
      return {
        icon: <Users className="w-4 h-4 text-blue-700" />,
        label: 'Trainer',
        color: 'text-slate-800',
      };
    case 'class-mismatch':
      return {
        icon: <BookOpen className="w-4 h-4 text-blue-700" />,
        label: 'Class',
        color: 'text-slate-800',
      };
    case 'time-mismatch':
      return {
        icon: <Clock className="w-4 h-4 text-blue-700" />,
        label: 'Time',
        color: 'text-slate-800',
      };
    case 'location-mismatch':
      return {
        icon: <Building2 className="w-4 h-4 text-blue-700" />,
        label: 'Location',
        color: 'text-slate-800',
      };
    default:
      return {
        icon: <AlertTriangle className="w-4 h-4 text-blue-700" />,
        label: 'Mismatch',
        color: 'text-slate-800',
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
    case 'csv-only':
      return 'Not in PDF';
    case 'pdf-only':
      return 'Not in CSV';
  }
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

export function SideBySideViewer({ csvData, pdfData, comparison, locationFilter = 'all' }: SideBySideViewerProps) {
  const [filters, setFilters] = useState<FilterState>({ day: [], location: [], trainer: [], className: [] });
  const [editablePdfData, setEditablePdfData] = useState<PdfClassData[]>([]);
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');
  const [copied, setCopied] = useState(false);
  const [showOnlyMismatches, setShowOnlyMismatches] = useState(false);
  const [activeMismatchIndex, setActiveMismatchIndex] = useState(0);

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

  const allDays = useMemo(() => {
    return Array.from(new Set(allAlignedData.map(row => row.day))).sort((a, b) => {
      const aIndex = DAY_ORDER.indexOf(a);
      const bIndex = DAY_ORDER.indexOf(b);
      if (aIndex === -1 && bIndex === -1) return a.localeCompare(b);
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    });
  }, [allAlignedData]);

  const rowsByDay = useMemo(() => {
    const grouped = new Map<string, AlignedRow[]>();
    allAlignedData.forEach(row => {
      const bucket = grouped.get(row.day) || [];
      bucket.push(row);
      grouped.set(row.day, bucket);
    });

    grouped.forEach(rows => {
      rows.sort((a, b) => a.sortTime.localeCompare(b.sortTime));
    });

    return grouped;
  }, [allAlignedData]);

  const totalMatches = allAlignedData.filter(row => row.matchStatus === 'match').length;
  const totalMismatches = allAlignedData.filter(row => row.matchStatus === 'mismatch').length;
  const totalTrainerMismatch = allAlignedData.filter(row => row.issueTypes.includes('trainer-mismatch')).length;
  const totalClassMismatch = allAlignedData.filter(row => row.issueTypes.includes('class-mismatch')).length;
  const totalTimeMismatch = allAlignedData.filter(row => row.issueTypes.includes('time-mismatch')).length;
  const totalLocationMismatch = allAlignedData.filter(row => row.issueTypes.includes('location-mismatch')).length;
  const totalCsvOnly = allAlignedData.filter(row => row.matchStatus === 'csv-only').length;
  const totalPdfOnly = allAlignedData.filter(row => row.matchStatus === 'pdf-only').length;

  const displayRowsByDay = allDays.map(day => {
    let rows = [...(rowsByDay.get(day) || [])];

    if (showOnlyMismatches) {
      rows = rows.filter(row => row.matchStatus !== 'match');
    }

    rows = rows.filter(row => rowMatchesQuickFilter(row, quickFilter));

    return { day, rows };
  });

  const visibleRows = displayRowsByDay.flatMap(group => group.rows);
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

  const getEditablePdfRow = (pdfClass: PdfClassData | null): PdfClassData | null => {
    if (!pdfClass) return null;
    return editablePdfData.find(row => row.uniqueKey === pdfClass.uniqueKey) || pdfClass;
  };

  const generateCSVExport = (): string => {
    const headers = ['Day', 'Location', 'CSV Time', 'CSV Class', 'CSV Trainer', 'Status', 'PDF Time', 'PDF Class', 'PDF Trainer'];
    const rows = allAlignedData.map(row => {
      const editablePdfRow = getEditablePdfRow(row.pdfClass);

      return [
        row.day,
        getCombinedLocationLabel(row),
        row.csvClass?.time || '',
        row.csvClass?.className || '',
        row.csvClass?.trainer || '',
        row.matchStatus === 'mismatch' ? row.issueTypes.map(getIssueLabel).join(' + ') : getStatusInfo(row).label,
        editablePdfRow?.time || '',
        editablePdfRow?.className || '',
        editablePdfRow?.trainer || '',
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
    htmlTable += `<td style="${headerStyles}">Status</td>`;
    htmlTable += `<td style="${headerStyles}">PDF Time</td>`;
    htmlTable += `<td style="${headerStyles}">PDF Class</td>`;
    htmlTable += `<td style="${headerStyles}">PDF Trainer</td>`;
    htmlTable += `<td style="${headerStyles}">PDF Location</td>`;
    htmlTable += `</tr>\n`;

    mismatchRowsOnly.forEach(row => {
      const editablePdfRow = getEditablePdfRow(row.pdfClass);
      htmlTable += `<tr>\n`;
      htmlTable += `<td style="${cellStyles}">${row.day}</td>`;
      htmlTable += `<td style="${cellStyles}">${row.csvClass?.time || '—'}</td>`;
      htmlTable += `<td style="${cellStyles}">${row.csvClass?.className || '—'}</td>`;
      htmlTable += `<td style="${cellStyles}">${row.csvClass?.trainer || '—'}</td>`;
      htmlTable += `<td style="${cellStyles}">${row.csvClass?.normalizedLocation || row.csvClass?.location || '—'}</td>`;
      htmlTable += `<td style="${cellStyles}">${row.matchStatus === 'mismatch' ? row.issueTypes.map(getIssueLabel).join(' + ') : getStatusInfo(row).label}</td>`;
      htmlTable += `<td style="${cellStyles}">${editablePdfRow?.time || '—'}</td>`;
      htmlTable += `<td style="${cellStyles}">${editablePdfRow?.className || '—'}</td>`;
      htmlTable += `<td style="${cellStyles}">${editablePdfRow?.trainer || '—'}</td>`;
      htmlTable += `<td style="${cellStyles}">${editablePdfRow?.location || row.pdfComparedClass?.normalizedLocation || '—'}</td>`;
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

      const pdfIndex = correctedData.findIndex(item => item.uniqueKey === row.pdfClass?.uniqueKey);
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

  const handleCellEdit = (uniqueKey: string, field: 'time' | 'className' | 'trainer' | 'location', value: string) => {
    const updated = [...editablePdfData];
    const index = updated.findIndex(item => item.uniqueKey === uniqueKey);
    if (index === -1) return;

    updated[index] = {
      ...updated[index],
      [field]: value,
    };
    setEditablePdfData(updated);
  };

  const exportPdfData = () => {
    const headers = ['Day', 'Time', 'Class Name', 'Trainer', 'Location'];
    const rows = editablePdfData.map(item => [item.day, item.time, item.className, item.trainer, item.location || '']);

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

  return (
    <div className="flex flex-col h-full space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900 mb-1">PDF data is editable</h3>
        <p className="text-xs text-slate-600">
          This tab now uses the same comparison rows as the Comparison tab. Click any PDF cell (Time, Class, Trainer) to edit manually, or use Auto-Correct to apply CSV values to mismatch rows.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">Mismatch Focus</p>
            <p className="text-xs text-slate-600">
              {mismatchRows.length} highlighted issue{mismatchRows.length === 1 ? '' : 's'} out of {visibleRows.length} visible rows
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => scrollToMismatch(activeMismatchIndex - 1)}
              disabled={mismatchRows.length === 0}
              className="h-8 px-2.5"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <div className="text-xs font-semibold text-slate-700 min-w-[56px] text-center">
              {mismatchRows.length > 0 ? `${activeMismatchIndex + 1}/${mismatchRows.length}` : '0/0'}
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => scrollToMismatch(activeMismatchIndex + 1)}
              disabled={mismatchRows.length === 0}
              className="h-8 px-2.5"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      <FilterSection data={csvData} filters={filters} onFilterChange={handleFilterChange} />

      <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <span className="text-sm font-medium text-slate-600 mr-2 flex items-center">Quick Filter:</span>

        {[
          { key: 'all' as QuickFilter, label: 'All', count: totalMatches + totalMismatches + totalCsvOnly + totalPdfOnly },
          { key: 'matches' as QuickFilter, label: 'Matches', count: totalMatches },
          { key: 'trainer-mismatch' as QuickFilter, label: 'Trainer Mismatch', count: totalTrainerMismatch },
          { key: 'class-mismatch' as QuickFilter, label: 'Class Mismatch', count: totalClassMismatch },
          { key: 'time-mismatch' as QuickFilter, label: 'Time Mismatch', count: totalTimeMismatch },
          { key: 'location-mismatch' as QuickFilter, label: 'Location Mismatch', count: totalLocationMismatch },
          { key: 'csv-only' as QuickFilter, label: 'Not in PDF', count: totalCsvOnly },
          { key: 'pdf-only' as QuickFilter, label: 'Not in CSV', count: totalPdfOnly },
        ].map(btn => (
          <Button
            key={btn.key}
            variant={quickFilter === btn.key ? 'default' : 'outline'}
            size="sm"
            onClick={() => setQuickFilter(btn.key)}
            className="gap-1"
          >
            {btn.label} ({btn.count})
          </Button>
        ))}
      </div>

      <div className="flex gap-2 flex-wrap">
        <Button
          variant={showOnlyMismatches ? 'default' : 'outline'}
          size="sm"
          onClick={() => setShowOnlyMismatches(!showOnlyMismatches)}
          className="gap-2"
        >
          <AlertTriangle className="w-4 h-4" />
          {showOnlyMismatches ? 'Show All' : 'Show Only Mismatches'}
        </Button>

        <Button variant="outline" onClick={copyMismatchesInTableFormat} size="sm" className="gap-2">
          {copied ? <Check className="w-4 h-4 text-blue-800" /> : <Copy className="w-4 h-4" />}
          Copy Mismatches Table
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const csvContent = generateCSVExport();
            downloadFile(csvContent, 'schedule-comparison.csv', 'text/csv');
            toast({ title: 'Exported!', description: 'Comparison exported to CSV' });
          }}
          className="gap-2"
        >
          <Download className="w-4 h-4" />
          Export Comparison
        </Button>

        <Button variant="default" size="sm" onClick={applyAutoCorrections} className="gap-2">
          <Wand2 className="w-4 h-4" />
          Auto-Correct PDF from CSV
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={exportPdfData}
          className="gap-2 border-slate-300 text-slate-700 hover:bg-slate-50"
        >
          <Download className="w-4 h-4" />
          Export Edited PDF Data
        </Button>
      </div>

      <div className="flex-1 overflow-auto surface-card p-0 overflow-hidden">
        <table className="table-premium table-head-dark table-compact text-sm">
          <thead>
            <tr className="gradient-header-dark text-white sticky top-0 z-10">
              <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">Day</th>
              <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">Location</th>
              <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">CSV Time</th>
              <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">CSV Class</th>
              <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">CSV Trainer</th>
              <th className="px-3 py-2 text-center font-semibold whitespace-nowrap">Status</th>
              <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">PDF Time</th>
              <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">PDF Class</th>
              <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">PDF Trainer</th>
            </tr>
          </thead>
          <tbody>
            {allDays.map(day => {
              const displayData = displayRowsByDay.find(group => group.day === day)?.rows || [];

              return displayData.map((row, idx) => {
                const statusInfo = getStatusInfo(row);
                const isMatch = row.matchStatus === 'match';
                const isTrainerMismatch = row.issueTypes.includes('trainer-mismatch');
                const isClassMismatch = row.issueTypes.includes('class-mismatch');
                const isTimeMismatch = row.issueTypes.includes('time-mismatch');
                const isLocationMismatch = row.issueTypes.includes('location-mismatch');
                const isPdfOnly = row.matchStatus === 'pdf-only';
                const isCsvOnly = row.matchStatus === 'csv-only';
                const mismatchIndex = mismatchIndexByRow.get(row);
                const isActiveMismatch = mismatchIndex !== undefined && mismatchIndex === activeMismatchIndex;
                const editablePdfRow = getEditablePdfRow(row.pdfClass);

                const rowBgClass = isMatch
                  ? 'bg-white hover:bg-slate-50 border-l-2 border-l-transparent'
                  : (isPdfOnly || isCsvOnly)
                    ? 'bg-slate-50 hover:bg-slate-100 border-l-4 border-l-slate-400'
                    : 'bg-blue-50/50 hover:bg-blue-50 border-l-4 border-l-blue-700';

                return (
                  <tr
                    key={`${day}-${idx}`}
                    data-mismatch-index={mismatchIndex !== undefined ? mismatchIndex : undefined}
                    className={`border-b border-slate-200/70 transition-colors ${rowBgClass} ${isActiveMismatch ? 'ring-2 ring-blue-300 ring-inset' : ''}`}
                  >
                    <td className="px-3 py-2 font-semibold text-slate-900">{row.day}</td>
                    <td className={`px-3 py-2 text-slate-700 ${isLocationMismatch ? 'bg-amber-100/70 font-semibold text-slate-900' : ''}`}>
                      {getCombinedLocationLabel(row)}
                    </td>
                    <td className={`px-3 py-2 font-mono ${isTimeMismatch ? 'text-amber-800 font-semibold bg-amber-100/60' : 'text-slate-800'} ${!row.csvClass ? 'bg-slate-100/70 text-slate-400' : ''}`}>
                      {row.csvClass?.time || '—'}
                    </td>
                    <td className={`px-3 py-2 ${isClassMismatch ? 'text-slate-900 font-semibold bg-amber-100/70' : 'text-slate-800'} ${!row.csvClass ? 'bg-slate-100/70 text-slate-400' : ''}`}>
                      {row.csvClass?.className || '—'}
                    </td>
                    <td className={`px-3 py-2 ${isTrainerMismatch ? 'text-slate-900 font-semibold bg-amber-100/70' : 'text-slate-700'} ${!row.csvClass ? 'bg-slate-100/70 text-slate-400' : ''}`}>
                      {row.csvClass?.trainer || '—'}
                    </td>
                    <td className="px-3 py-2 text-center bg-white/60">
                      <div className="flex items-center justify-center gap-1">
                        {statusInfo.icon}
                        <span className={`text-xs font-medium ${statusInfo.color}`}>{statusInfo.label}</span>
                      </div>
                    </td>
                    <td className={`px-3 py-2 font-mono ${isTimeMismatch ? 'text-amber-800 font-semibold bg-amber-100/60' : 'text-slate-800'} ${!editablePdfRow ? 'bg-slate-100/70 text-slate-400' : ''}`}>
                      {editablePdfRow ? (
                        <input
                          type="text"
                          value={editablePdfRow.time}
                          onChange={e => handleCellEdit(editablePdfRow.uniqueKey, 'time', e.target.value)}
                          className="w-full bg-transparent border-none focus:outline-none focus:ring-1 focus:ring-[#0353A4] px-1 rounded"
                        />
                      ) : '—'}
                    </td>
                    <td className={`px-3 py-2 ${isClassMismatch ? 'text-slate-900 font-semibold bg-amber-100/70' : 'text-slate-800'} ${!editablePdfRow ? 'bg-slate-100/70 text-slate-400' : ''}`}>
                      {editablePdfRow ? (
                        <input
                          type="text"
                          value={editablePdfRow.className}
                          onChange={e => handleCellEdit(editablePdfRow.uniqueKey, 'className', e.target.value)}
                          className="w-full bg-transparent border-none focus:outline-none focus:ring-1 focus:ring-[#0353A4] px-1 rounded"
                        />
                      ) : '—'}
                    </td>
                    <td className={`px-3 py-2 ${isTrainerMismatch ? 'text-slate-900 font-semibold bg-amber-100/70' : 'text-slate-700'} ${!editablePdfRow ? 'bg-slate-100/70 text-slate-400' : ''}`}>
                      {editablePdfRow ? (
                        <input
                          type="text"
                          value={editablePdfRow.trainer}
                          onChange={e => handleCellEdit(editablePdfRow.uniqueKey, 'trainer', e.target.value)}
                          className="w-full bg-transparent border-none focus:outline-none focus:ring-1 focus:ring-[#0353A4] px-1 rounded"
                        />
                      ) : '—'}
                    </td>
                  </tr>
                );
              });
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
