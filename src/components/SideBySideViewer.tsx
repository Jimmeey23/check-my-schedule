import React, { useMemo, useState, useEffect } from 'react';
import { ClassData, PdfClassData, FilterState } from '@/types/schedule';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FilterSection } from './FilterSection';
import { passesFilters } from '@/lib/filterUtils';
import { toast } from '@/hooks/use-toast';
import { alignCsvPdfData, type CsvPdfMatchStatus } from '@/lib/classDataMatcher';
import { normalizeTime } from '@/lib/normalizers';
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
} from 'lucide-react';

interface SideBySideViewerProps {
  csvData: {[day: string]: ClassData[]} | null;
  pdfData: PdfClassData[] | null;
}

type MismatchType = 'match' | 'trainer-mismatch' | 'class-mismatch' | 'time-mismatch' | 'csv-only' | 'pdf-only';
type QuickFilter = 'all' | 'matches' | 'trainer-mismatch' | 'class-mismatch' | 'time-mismatch' | 'csv-only' | 'pdf-only';

interface AlignedRow {
  day: string;
  csvClass: ClassData | null;
  pdfClass: PdfClassData | null;
  matchStatus: CsvPdfMatchStatus;
}

const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function SideBySideViewer({ csvData, pdfData }: SideBySideViewerProps) {
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
  const allAlignedData = useMemo<AlignedRow[]>(() => {
    const alignedRows = alignCsvPdfData(csvData, pdfData);

    return alignedRows
      .filter(row =>
        passesFilters(
          {
            day: row.day,
            location: row.csvClass?.location || row.pdfClass?.location || '',
            trainer: row.csvClass?.trainer1 || row.pdfClass?.trainer || '',
            className: row.csvClass?.className || row.pdfClass?.className || '',
          },
          filters
        )
      )
      .map(row => ({
        day: row.day,
        csvClass: row.csvClass,
        pdfClass: row.pdfClass,
        matchStatus: row.status,
      }));
  }, [csvData, pdfData, filters]);

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
      rows.sort((a, b) => {
        const timeA = normalizeTime(a.csvClass?.time || a.pdfClass?.time || '');
        const timeB = normalizeTime(b.csvClass?.time || b.pdfClass?.time || '');
        return timeA.localeCompare(timeB);
      });
    });

    return grouped;
  }, [allAlignedData]);

  let totalMatches = 0, totalTrainerMismatch = 0, totalClassMismatch = 0, totalTimeMismatch = 0, totalCsvOnly = 0, totalPdfOnly = 0;

  allAlignedData.forEach(row => {
    switch (row.matchStatus) {
      case 'match': totalMatches++; break;
      case 'trainer-mismatch': totalTrainerMismatch++; break;
      case 'class-mismatch': totalClassMismatch++; break;
      case 'time-mismatch': totalTimeMismatch++; break;
      case 'csv-only': totalCsvOnly++; break;
      case 'pdf-only': totalPdfOnly++; break;
    }
  });

  const totalMismatches = totalTrainerMismatch + totalClassMismatch + totalTimeMismatch;
  const displayRowsByDay = allDays.map(day => {
    let rows = [...(rowsByDay.get(day) || [])];

    if (showOnlyMismatches) {
      rows = rows.filter(row => row.matchStatus !== 'match');
    }

    if (quickFilter !== 'all') {
      if (quickFilter === 'matches') {
        rows = rows.filter(row => row.matchStatus === 'match');
      } else {
        rows = rows.filter(row => row.matchStatus === quickFilter);
      }
    }

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

  const getStatusInfo = (status: MismatchType): { icon: React.ReactNode; label: string; color: string } => {
    switch (status) {
      case 'match':
        return { 
          icon: <CheckCircle2 className="w-4 h-4 text-emerald-600" />, 
          label: 'Match',
          color: 'text-slate-700'
        };
      case 'trainer-mismatch':
        return { 
          icon: <Users className="w-4 h-4 text-amber-700" />, 
          label: 'Trainer',
          color: 'text-amber-800'
        };
      case 'class-mismatch':
        return { 
          icon: <BookOpen className="w-4 h-4 text-amber-700" />, 
          label: 'Class',
          color: 'text-amber-800'
        };
      case 'time-mismatch':
        return { 
          icon: <Clock className="w-4 h-4 text-amber-700" />, 
          label: 'Time',
          color: 'text-amber-800'
        };
      case 'csv-only':
        return { 
          icon: <FileSpreadsheet className="w-4 h-4 text-amber-700" />, 
          label: 'CSV Only',
          color: 'text-amber-800'
        };
      case 'pdf-only':
        return { 
          icon: <FileText className="w-4 h-4 text-amber-700" />, 
          label: 'PDF Only',
          color: 'text-amber-800'
        };
    }
  };

  const generateCSVExport = (): string => {
    const headers = ['Day', 'Location', 'CSV Time', 'CSV Class', 'CSV Trainer', 'Status', 'PDF Time', 'PDF Class', 'PDF Trainer'];
    const rows = allAlignedData.map(row => [
      row.day,
      row.csvClass?.location || row.pdfClass?.location || '',
      row.csvClass?.time || '',
      row.csvClass?.className || '',
      row.csvClass?.trainer1 || '',
      row.matchStatus,
      row.pdfClass?.time || '',
      row.pdfClass?.className || '',
      row.pdfClass?.trainer || ''
    ]);
    
    return [headers.join(','), ...rows.map(r => r.map(cell => `"${cell}"`).join(','))].join('\n');
  };

  const copyMismatchesInTableFormat = async (): Promise<void> => {
    // Filter to only mismatches and missing rows
    const mismatchRows = allAlignedData.filter(row => 
      row.matchStatus !== 'match'
    );

    // Generate HTML table with inline styles
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
    
    const getStatusLabel = (status: MismatchType): string => {
      switch (status) {
        case 'trainer-mismatch': return 'Trainer Mismatch';
        case 'class-mismatch': return 'Class Mismatch';
        case 'time-mismatch': return 'Time Mismatch';
        case 'csv-only': return 'Not in PDF';
        case 'pdf-only': return 'Not in CSV';
        default: return status;
      }
    };
    
    let htmlTable = `<table style="${tableStyles}">\n`;
    
    // Add header row
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
    
    // Add data rows
    mismatchRows.forEach(row => {
      htmlTable += `<tr>\n`;
      htmlTable += `<td style="${cellStyles}">${row.day}</td>`;
      htmlTable += `<td style="${cellStyles}">${row.csvClass?.time || '—'}</td>`;
      htmlTable += `<td style="${cellStyles}">${row.csvClass?.className || '—'}</td>`;
      htmlTable += `<td style="${cellStyles}">${row.csvClass?.trainer1 || '—'}</td>`;
      htmlTable += `<td style="${cellStyles}">${row.csvClass?.location || '—'}</td>`;
      htmlTable += `<td style="${cellStyles}">${getStatusLabel(row.matchStatus)}</td>`;
      htmlTable += `<td style="${cellStyles}">${row.pdfClass?.time || '—'}</td>`;
      htmlTable += `<td style="${cellStyles}">${row.pdfClass?.className || '—'}</td>`;
      htmlTable += `<td style="${cellStyles}">${row.pdfClass?.trainer || '—'}</td>`;
      htmlTable += `<td style="${cellStyles}">${row.pdfClass?.location || '—'}</td>`;
      htmlTable += `</tr>\n`;
    });
    
    htmlTable += `</table>`;
    
    try {
      await navigator.clipboard.writeText(htmlTable);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({
        title: "Mismatches Copied!",
        description: `Copied ${mismatchRows.length} mismatch rows in HTML table format to clipboard`,
      });
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
      toast({
        title: "Copy Failed",
        description: "Could not copy to clipboard. Please try again.",
        variant: "destructive"
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
    
    // Apply corrections based on CSV matches to PDF data
    allAlignedData.forEach((row, idx) => {
      if (row.pdfClass && row.csvClass && row.matchStatus !== 'match') {
        const pdfIndex = editablePdfData.findIndex(p => 
          p.day === row.pdfClass?.day && 
          p.time === row.pdfClass?.time && 
          p.className === row.pdfClass?.className
        );
        
        if (pdfIndex !== -1) {
          if (row.matchStatus === 'time-mismatch') {
            correctedData[pdfIndex].time = row.csvClass.time;
            correctionCount++;
          }
          if (row.matchStatus === 'class-mismatch') {
            correctedData[pdfIndex].className = row.csvClass.className;
            correctionCount++;
          }
          if (row.matchStatus === 'trainer-mismatch') {
            correctedData[pdfIndex].trainer = row.csvClass.trainer1;
            correctionCount++;
          }
        }
      }
    });
    
    setEditablePdfData(correctedData);
    
    toast({
      title: "Auto-Corrections Applied!",
      description: `${correctionCount} corrections made to PDF data. Click Export to download.`,
    });
  };
  
  const handleCellEdit = (rowIndex: number, field: 'time' | 'className' | 'trainer', value: string) => {
    const updated = [...editablePdfData];
    if (updated[rowIndex]) {
      updated[rowIndex] = {
        ...updated[rowIndex],
        [field]: value,
      };
      setEditablePdfData(updated);
    }
  };
  
  const exportPdfData = () => {
    // Export as CSV that can be used to regenerate PDF
    const headers = ['Day', 'Time', 'Class Name', 'Trainer', 'Location'];
    const rows = editablePdfData.map(item => [
      item.day,
      item.time,
      item.className,
      item.trainer,
      item.location || ''
    ]);
    
    const csvContent = [headers.join(','), ...rows.map(r => r.map(cell => `"${cell}"`).join(','))].join('\n');
    downloadFile(csvContent, 'edited-schedule-data.csv', 'text/csv');
    
    toast({
      title: "PDF Data Exported!",
      description: `Exported ${editablePdfData.length} classes. Use this to update your PDF.`,
    });
  };

  if (!csvData || !pdfData) {
    return (
      <Card className="flex flex-col items-center justify-center p-8 bg-white">
        <p className="text-slate-600 mb-4">Please upload both CSV and PDF files to use the side-by-side viewer.</p>
        <div className="text-sm text-slate-500 space-y-1">
          <p>CSV Data: {csvData ? '✓ Loaded' : '✗ Missing'}</p>
          <p>PDF Data: {pdfData ? `✓ Loaded (${pdfData.length} classes)` : '✗ Missing'}</p>
        </div>
      </Card>
    );
  }
  
  return (
    <div className="flex flex-col h-full space-y-4">
      {/* Info Banner */}
      <div className="surface-card p-4 border-l-4 border-l-[#0353A4]">
        <h3 className="text-sm font-semibold text-slate-900 mb-1">PDF Data is editable</h3>
        <p className="text-xs text-slate-600">
          Click any PDF cell (Time, Class, Trainer) to edit manually. Use "Auto-Correct" to apply CSV values to mismatches, then "Export Edited PDF Data" to download.
        </p>
      </div>

      <div className="surface-card p-3 border border-amber-200 bg-amber-50/60">
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
      
      <FilterSection 
        data={csvData}
        filters={filters}
        onFilterChange={handleFilterChange}
      />
      
      {/* Quick Filter Buttons */}
      <div className="flex flex-wrap gap-2 p-3 surface-muted shadow-soft">
        <span className="text-sm font-medium text-slate-600 mr-2 flex items-center">Quick Filter:</span>
        
        {[
          { key: 'all' as QuickFilter, label: 'All', count: totalMatches + totalMismatches + totalCsvOnly + totalPdfOnly },
          { key: 'matches' as QuickFilter, label: 'Matches', count: totalMatches },
          { key: 'trainer-mismatch' as QuickFilter, label: 'Trainer Mismatch', count: totalTrainerMismatch },
          { key: 'class-mismatch' as QuickFilter, label: 'Class Mismatch', count: totalClassMismatch },
          { key: 'time-mismatch' as QuickFilter, label: 'Time Mismatch', count: totalTimeMismatch },
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

      {/* Action Buttons */}
      <div className="flex gap-2 flex-wrap">
        <Button
          variant={showOnlyMismatches ? "default" : "outline"}
          size="sm"
          onClick={() => setShowOnlyMismatches(!showOnlyMismatches)}
          className="gap-2"
        >
          <AlertTriangle className="w-4 h-4" />
          {showOnlyMismatches ? 'Show All' : 'Show Only Mismatches'}
        </Button>
        
        <Button
          variant="outline"
          size="sm"
          onClick={copyMismatchesInTableFormat}
          className="gap-2"
        >
          {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
          Copy Mismatches Table
        </Button>
        
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const csvContent = generateCSVExport();
            downloadFile(csvContent, 'schedule-comparison.csv', 'text/csv');
            toast({ title: "Exported!", description: "Comparison exported to CSV" });
          }}
          className="gap-2"
        >
          <Download className="w-4 h-4" />
          Export Comparison
        </Button>
        
        <Button
          variant="default"
          size="sm"
          onClick={applyAutoCorrections}
          className="gap-2"
        >
          <Wand2 className="w-4 h-4" />
          Auto-Correct PDF from CSV
        </Button>
        
        <Button
          variant="outline"
          size="sm"
          onClick={exportPdfData}
          className="gap-2 border-emerald-200 text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50"
        >
          <Download className="w-4 h-4" />
          Export Edited PDF Data
        </Button>
      </div>

      {/* Table */}
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
                const statusInfo = getStatusInfo(row.matchStatus);
                const isMatch = row.matchStatus === 'match';
                const isTrainerMismatch = row.matchStatus === 'trainer-mismatch';
                const isClassMismatch = row.matchStatus === 'class-mismatch';
                const isTimeMismatch = row.matchStatus === 'time-mismatch';
                const isPdfOnly = row.matchStatus === 'pdf-only';
                const isCsvOnly = row.matchStatus === 'csv-only';
                const mismatchIndex = mismatchIndexByRow.get(row);
                const isActiveMismatch = mismatchIndex !== undefined && mismatchIndex === activeMismatchIndex;
                
                // Enhanced styling for matches and mismatches
                const rowBgClass = isMatch 
                  ? 'bg-white hover:bg-slate-50 border-l-2 border-l-transparent' 
                  : (isPdfOnly || isCsvOnly)
                  ? 'bg-amber-50/40 hover:bg-amber-50/70 border-l-4 border-l-amber-400'
                  : 'bg-amber-50/70 hover:bg-amber-100/70 border-l-4 border-l-amber-500';
                
                return (
                  <tr
                    key={`${day}-${idx}`}
                    data-mismatch-index={mismatchIndex !== undefined ? mismatchIndex : undefined}
                    className={`border-b border-slate-200/70 transition-colors ${rowBgClass} ${isActiveMismatch ? 'ring-2 ring-blue-300 ring-inset' : ''}`}
                  >
                    <td className="px-3 py-2 font-semibold text-slate-900">
                      {row.day}
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      {row.csvClass?.location || row.pdfClass?.location || '—'}
                    </td>
                    <td className={`px-3 py-2 font-mono ${isTimeMismatch ? 'text-amber-800 font-semibold bg-amber-100/60' : 'text-slate-800'} ${!row.csvClass ? 'bg-slate-100/70 text-slate-400' : ''}`}>
                      {row.csvClass?.time || '—'}
                    </td>
                    <td className={`px-3 py-2 ${isClassMismatch ? 'text-slate-900 font-semibold bg-amber-100/70' : 'text-slate-800'} ${!row.csvClass ? 'bg-slate-100/70 text-slate-400' : ''}`}>
                      {row.csvClass?.className || '—'}
                    </td>
                    <td className={`px-3 py-2 ${isTrainerMismatch ? 'text-slate-900 font-semibold bg-amber-100/70' : 'text-slate-700'} ${!row.csvClass ? 'bg-slate-100/70 text-slate-400' : ''}`}>
                      {row.csvClass?.trainer1 || '—'}
                    </td>
                    <td className="px-3 py-2 text-center bg-white/60">
                      <div className="flex items-center justify-center gap-1">
                        {statusInfo.icon}
                        <span className={`text-xs font-medium ${statusInfo.color}`}>{statusInfo.label}</span>
                      </div>
                    </td>
                    <td className={`px-3 py-2 font-mono ${isTimeMismatch ? 'text-amber-800 font-semibold bg-amber-100/60' : 'text-slate-800'} ${!row.pdfClass ? 'bg-slate-100/70 text-slate-400' : ''}`}>
                      {row.pdfClass ? (
                        <input
                          type="text"
                          value={editablePdfData.find(p => p.day === row.pdfClass?.day && p.time === row.pdfClass?.time && p.className === row.pdfClass?.className)?.time || row.pdfClass.time}
                          onChange={(e) => {
                            const pdfIdx = editablePdfData.findIndex(p => p.day === row.pdfClass?.day && p.time === row.pdfClass?.time && p.className === row.pdfClass?.className);
                            if (pdfIdx !== -1) handleCellEdit(pdfIdx, 'time', e.target.value);
                          }}
                          className="w-full bg-transparent border-none focus:outline-none focus:ring-1 focus:ring-[#0353A4] px-1 rounded"
                        />
                      ) : '—'}
                    </td>
                    <td className={`px-3 py-2 ${isClassMismatch ? 'text-slate-900 font-semibold bg-amber-100/70' : 'text-slate-800'} ${!row.pdfClass ? 'bg-slate-100/70 text-slate-400' : ''}`}>
                      {row.pdfClass ? (
                        <input
                          type="text"
                          value={editablePdfData.find(p => p.day === row.pdfClass?.day && p.time === row.pdfClass?.time && p.className === row.pdfClass?.className)?.className || row.pdfClass.className}
                          onChange={(e) => {
                            const pdfIdx = editablePdfData.findIndex(p => p.day === row.pdfClass?.day && p.time === row.pdfClass?.time && p.className === row.pdfClass?.className);
                            if (pdfIdx !== -1) handleCellEdit(pdfIdx, 'className', e.target.value);
                          }}
                          className="w-full bg-transparent border-none focus:outline-none focus:ring-1 focus:ring-[#0353A4] px-1 rounded"
                        />
                      ) : '—'}
                    </td>
                    <td className={`px-3 py-2 ${isTrainerMismatch ? 'text-slate-900 font-semibold bg-amber-100/70' : 'text-slate-700'} ${!row.pdfClass ? 'bg-slate-100/70 text-slate-400' : ''}`}>
                      {row.pdfClass ? (
                        <input
                          type="text"
                          value={editablePdfData.find(p => p.day === row.pdfClass?.day && p.time === row.pdfClass?.time && p.className === row.pdfClass?.className)?.trainer || row.pdfClass.trainer}
                          onChange={(e) => {
                            const pdfIdx = editablePdfData.findIndex(p => p.day === row.pdfClass?.day && p.time === row.pdfClass?.time && p.className === row.pdfClass?.className);
                            if (pdfIdx !== -1) handleCellEdit(pdfIdx, 'trainer', e.target.value);
                          }}
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
