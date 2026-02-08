import React, { useState, useEffect } from 'react';
import { ClassData, PdfClassData, FilterState } from '@/types/schedule';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { FilterSection } from './FilterSection';
import { passesFilters } from '@/lib/filterUtils';
import { toast } from '@/hooks/use-toast';
import { 
  CheckCircle2, 
  AlertTriangle, 
  ArrowLeftRight, 
  FileSpreadsheet, 
  FileText, 
  Users, 
  BookOpen, 
  Clock,
  Filter,
  Copy,
  Check,
  ChevronDown,
  ChevronRight
} from 'lucide-react';

interface SideBySideViewerProps {
  csvData: {[day: string]: ClassData[]} | null;
  pdfData: PdfClassData[] | null;
}

type MismatchType = 'match' | 'trainer-mismatch' | 'class-mismatch' | 'time-mismatch' | 'csv-only' | 'pdf-only';
type QuickFilter = 'all' | 'matches' | 'trainer-mismatch' | 'class-mismatch' | 'time-mismatch' | 'csv-only' | 'pdf-only';

export function SideBySideViewer({ csvData, pdfData }: SideBySideViewerProps) {
  const [filters, setFilters] = useState<FilterState>({ day: [], location: [], trainer: [], className: [] });
  const [flattenedCsvData, setFlattenedCsvData] = useState<ClassData[]>([]);
  const [filteredCsvData, setFilteredCsvData] = useState<ClassData[]>([]);
  const [filteredPdfData, setFilteredPdfData] = useState<PdfClassData[]>([]);
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');
  const [copied, setCopied] = useState(false);
  
  useEffect(() => {
    if (!csvData) return;
    const flattened: ClassData[] = [];
    Object.values(csvData).forEach(dayClasses => {
      flattened.push(...dayClasses);
    });
    setFlattenedCsvData(flattened);
  }, [csvData]);
  
  useEffect(() => {
    if (!csvData || !pdfData) return;
    
    const csvFiltered = flattenedCsvData.filter(item => 
      passesFilters({
        day: item.day,
        location: item.location,
        trainer: item.trainer1,
        className: item.className
      }, filters)
    );
    
    const pdfFiltered = pdfData.filter(item => 
      passesFilters({
        day: item.day,
        location: item.location,
        trainer: item.trainer,
        className: item.className
      }, filters)
    );
    
    setFilteredCsvData(csvFiltered);
    setFilteredPdfData(pdfFiltered);
  }, [csvData, pdfData, flattenedCsvData, filters]);
  
  const handleFilterChange = (newFilters: FilterState) => {
    setFilters(newFilters);
    localStorage.setItem('csvFilters', JSON.stringify(newFilters));
  };

  const parseTimeToMinutes = (timeStr: string): number => {
    if (!timeStr) return 0;
    const match = timeStr.match(/(\d{1,2})[:.:](\d{2})\s*(AM|PM)?/i);
    if (match) {
      let hours = parseInt(match[1]);
      const minutes = parseInt(match[2]);
      const period = match[3]?.toUpperCase();
      
      if (period === 'PM' && hours !== 12) hours += 12;
      if (period === 'AM' && hours === 12) hours = 0;
      
      return hours * 60 + minutes;
    }
    return 0;
  };

  const normalizeTimeKey = (timeStr: string): string => {
    const minutes = parseTimeToMinutes(timeStr);
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  };

  const daysOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const groupedCsvData: {[day: string]: ClassData[]} = {};
  const groupedPdfData: {[day: string]: PdfClassData[]} = {};
  
  filteredCsvData.forEach(item => {
    if (!groupedCsvData[item.day]) groupedCsvData[item.day] = [];
    groupedCsvData[item.day].push(item);
  });
  
  filteredPdfData.forEach(item => {
    if (!groupedPdfData[item.day]) groupedPdfData[item.day] = [];
    groupedPdfData[item.day].push(item);
  });
  
  const allDays = Array.from(new Set([
    ...Object.keys(groupedCsvData),
    ...Object.keys(groupedPdfData)
  ])).sort((a, b) => {
    const aIndex = daysOrder.indexOf(a);
    const bIndex = daysOrder.indexOf(b);
    if (aIndex === -1 && bIndex === -1) return a.localeCompare(b);
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    return aIndex - bIndex;
  });

  interface AlignedRow {
    day: string;
    displayTime: string;
    sortKey: number;
    csvClass: ClassData | null;
    pdfClass: PdfClassData | null;
    matchStatus: MismatchType;
  }

  const buildAlignedDayData = (day: string): AlignedRow[] => {
    const csvClasses = [...(groupedCsvData[day] || [])].sort((a, b) => 
      parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time)
    );
    const pdfClasses = [...(groupedPdfData[day] || [])].sort((a, b) => 
      parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time)
    );
    
    const alignedRows: AlignedRow[] = [];
    const usedCsvIndices = new Set<number>();
    const usedPdfIndices = new Set<number>();
    
    const getMatchStatus = (csvClass: ClassData | null, pdfClass: PdfClassData | null): MismatchType => {
      if (!csvClass && pdfClass) return 'pdf-only';
      if (csvClass && !pdfClass) return 'csv-only';
      if (!csvClass || !pdfClass) return 'csv-only';
      
      const csvTimeKey = normalizeTimeKey(csvClass.time);
      const pdfTimeKey = normalizeTimeKey(pdfClass.time);
      const timeMatches = csvTimeKey === pdfTimeKey;
      
      const csvClassName = csvClass.className.toLowerCase().replace('studio ', '');
      const pdfClassName = pdfClass.className.toLowerCase().replace('studio ', '');
      const classMatches = csvClassName.includes(pdfClassName) || pdfClassName.includes(csvClassName);
      
      const trainerMatches = csvClass.trainer1 === pdfClass.trainer;
      
      if (!timeMatches) return 'time-mismatch';
      if (!classMatches) return 'class-mismatch';
      if (!trainerMatches) return 'trainer-mismatch';
      
      return 'match';
    };
    
    csvClasses.forEach((csvClass, csvIdx) => {
      const csvTimeKey = normalizeTimeKey(csvClass.time);
      const csvSortKey = parseTimeToMinutes(csvClass.time);
      
      const matchingPdfIdx = pdfClasses.findIndex((pdfClass, pdfIdx) => {
        if (usedPdfIndices.has(pdfIdx)) return false;
        const pdfTimeKey = normalizeTimeKey(pdfClass.time);
        return pdfTimeKey === csvTimeKey && 
          (pdfClass.className.toLowerCase().includes(csvClass.className.toLowerCase().replace('studio ', '')) ||
           csvClass.className.toLowerCase().includes(pdfClass.className.toLowerCase().replace('studio ', '')));
      });
      
      if (matchingPdfIdx !== -1) {
        usedCsvIndices.add(csvIdx);
        usedPdfIndices.add(matchingPdfIdx);
        const pdfClass = pdfClasses[matchingPdfIdx];
        alignedRows.push({
          day,
          displayTime: csvClass.time,
          sortKey: csvSortKey,
          csvClass: csvClass,
          pdfClass: pdfClass,
          matchStatus: getMatchStatus(csvClass, pdfClass)
        });
      }
    });
    
    csvClasses.forEach((csvClass, csvIdx) => {
      if (usedCsvIndices.has(csvIdx)) return;
      const csvTimeKey = normalizeTimeKey(csvClass.time);
      const csvSortKey = parseTimeToMinutes(csvClass.time);
      
      const pdfAtSameTime = pdfClasses.find((pdfClass, pdfIdx) => {
        if (usedPdfIndices.has(pdfIdx)) return false;
        return normalizeTimeKey(pdfClass.time) === csvTimeKey;
      });
      
      if (pdfAtSameTime) {
        const pdfIdx = pdfClasses.indexOf(pdfAtSameTime);
        usedPdfIndices.add(pdfIdx);
        alignedRows.push({
          day,
          displayTime: csvClass.time,
          sortKey: csvSortKey,
          csvClass: csvClass,
          pdfClass: pdfAtSameTime,
          matchStatus: getMatchStatus(csvClass, pdfAtSameTime)
        });
      } else {
        alignedRows.push({
          day,
          displayTime: csvClass.time,
          sortKey: csvSortKey,
          csvClass: csvClass,
          pdfClass: null,
          matchStatus: 'csv-only'
        });
      }
    });
    
    pdfClasses.forEach((pdfClass, pdfIdx) => {
      if (usedPdfIndices.has(pdfIdx)) return;
      const pdfSortKey = parseTimeToMinutes(pdfClass.time);
      
      alignedRows.push({
        day,
        displayTime: pdfClass.time,
        sortKey: pdfSortKey,
        csvClass: null,
        pdfClass: pdfClass,
        matchStatus: 'pdf-only'
      });
    });
    
    alignedRows.sort((a, b) => a.sortKey - b.sortKey);
    return alignedRows;
  };

  const allAlignedData: AlignedRow[] = [];
  allDays.forEach(day => {
    allAlignedData.push(...buildAlignedDayData(day));
  });

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

  const filterRows = (rows: AlignedRow[]): AlignedRow[] => {
    if (quickFilter === 'all') return rows;
    if (quickFilter === 'matches') return rows.filter(row => row.matchStatus === 'match');
    return rows.filter(row => row.matchStatus === quickFilter);
  };

  const getStatusInfo = (status: MismatchType): { icon: React.ReactNode; label: string; color: string } => {
    switch (status) {
      case 'match':
        return { 
          icon: <CheckCircle2 className="w-4 h-4 text-emerald-600" />, 
          label: 'Match',
          color: 'text-emerald-600'
        };
      case 'trainer-mismatch':
        return { 
          icon: <Users className="w-4 h-4 text-orange-500" />, 
          label: 'Trainer',
          color: 'text-orange-500'
        };
      case 'class-mismatch':
        return { 
          icon: <BookOpen className="w-4 h-4 text-purple-500" />, 
          label: 'Class',
          color: 'text-purple-500'
        };
      case 'time-mismatch':
        return { 
          icon: <Clock className="w-4 h-4 text-amber-500" />, 
          label: 'Time',
          color: 'text-amber-500'
        };
      case 'csv-only':
        return { 
          icon: <FileSpreadsheet className="w-4 h-4 text-blue-600" />, 
          label: 'CSV Only',
          color: 'text-blue-600'
        };
      case 'pdf-only':
        return { 
          icon: <FileText className="w-4 h-4 text-red-600" />, 
          label: 'PDF Only',
          color: 'text-red-600'
        };
    }
  };

  const copyMismatchesToClipboard = () => {
    const mismatchedRows = allAlignedData.filter(row => row.matchStatus !== 'match');
    
    if (mismatchedRows.length === 0) {
      toast({
        title: "No Mismatches",
        description: "All classes match!",
      });
      return;
    }

    const text = mismatchedRows.map(row => 
      `${row.day}\t${row.csvClass?.time || '—'}\t${row.csvClass?.className || '—'}\t${row.csvClass?.trainer1 || '—'}\t${row.pdfClass?.time || '—'}\t${row.pdfClass?.className || '—'}\t${row.pdfClass?.trainer || '—'}`
    ).join('\n');

    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      toast({
        title: "Copied!",
        description: `${mismatchedRows.length} mismatches copied`,
      });
      setTimeout(() => setCopied(false), 2000);
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
      <FilterSection 
        data={csvData}
        filters={filters}
        onFilterChange={handleFilterChange}
      />
      
      {/* Quick Filter Buttons */}
      <div className="flex flex-wrap gap-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
        <span className="text-sm font-medium text-slate-600 mr-2 flex items-center">Quick Filter:</span>
        
        {[
          { key: 'all' as QuickFilter, label: 'All', count: totalMatches + totalMismatches + totalCsvOnly + totalPdfOnly },
          { key: 'matches' as QuickFilter, label: 'Matches', count: totalMatches, color: 'emerald' },
          { key: 'trainer-mismatch' as QuickFilter, label: 'Trainer Mismatch', count: totalTrainerMismatch, color: 'orange' },
          { key: 'class-mismatch' as QuickFilter, label: 'Class Mismatch', count: totalClassMismatch, color: 'purple' },
          { key: 'time-mismatch' as QuickFilter, label: 'Time Mismatch', count: totalTimeMismatch, color: 'amber' },
          { key: 'csv-only' as QuickFilter, label: 'Not in PDF', count: totalCsvOnly, color: 'blue' },
          { key: 'pdf-only' as QuickFilter, label: 'Not in CSV', count: totalPdfOnly, color: 'red' },
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

      {/* Copy Buttons */}
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={copyMismatchesToClipboard}
          className="gap-2"
        >
          {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
          Copy Mismatches
        </Button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto border rounded-lg bg-white">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-slate-800 text-white sticky top-0 z-10">
              <th className="border border-slate-300 px-3 py-2 text-left font-semibold bg-slate-700">Day</th>
              <th className="border border-slate-300 px-3 py-2 text-left font-semibold bg-slate-700">Location</th>
              <th className="border border-slate-300 px-3 py-2 text-left font-semibold bg-blue-600">CSV Time</th>
              <th className="border border-slate-300 px-3 py-2 text-left font-semibold bg-blue-600">CSV Class</th>
              <th className="border border-slate-300 px-3 py-2 text-left font-semibold bg-blue-600">CSV Trainer</th>
              <th className="border border-slate-300 px-3 py-2 text-center font-semibold">Status</th>
              <th className="border border-slate-300 px-3 py-2 text-left font-semibold bg-red-600">PDF Time</th>
              <th className="border border-slate-300 px-3 py-2 text-left font-semibold bg-red-600">PDF Class</th>
              <th className="border border-slate-300 px-3 py-2 text-left font-semibold bg-red-600">PDF Trainer</th>
            </tr>
          </thead>
          <tbody>
            {allDays.map(day => {
              const alignedData = buildAlignedDayData(day);
              const displayData = filterRows(alignedData);
              
              return displayData.map((row, idx) => {
                const statusInfo = getStatusInfo(row.matchStatus);
                const isMatch = row.matchStatus === 'match';
                const isTrainerMismatch = row.matchStatus === 'trainer-mismatch';
                const isClassMismatch = row.matchStatus === 'class-mismatch';
                const isTimeMismatch = row.matchStatus === 'time-mismatch';
                const isPdfOnly = row.matchStatus === 'pdf-only';
                const isCsvOnly = row.matchStatus === 'csv-only';
                
                // Enhanced styling for matches and mismatches
                const rowBgClass = isMatch 
                  ? 'bg-emerald-50/40 hover:bg-emerald-50/60 border-l-2 border-l-emerald-400' 
                  : (isPdfOnly || isCsvOnly)
                  ? 'bg-slate-50 hover:bg-slate-100 border-l-2 border-l-slate-300'
                  : 'bg-amber-50/30 hover:bg-amber-50/50 border-l-2 border-l-amber-400';
                
                return (
                  <tr key={`${day}-${idx}`} className={`border-b border-slate-200 transition-colors ${rowBgClass}`}>
                    <td className="border border-slate-200 px-3 py-2 font-semibold text-slate-800">
                      {row.day}
                    </td>
                    <td className="border border-slate-200 px-3 py-2 text-slate-700">
                      {row.csvClass?.location || row.pdfClass?.location || '—'}
                    </td>
                    <td className={`border border-slate-200 px-3 py-2 font-mono ${isTimeMismatch ? 'text-amber-700 font-semibold bg-amber-100/50' : 'text-slate-800'} ${!row.csvClass ? 'bg-slate-100/70 text-slate-400' : ''}`}>
                      {row.csvClass?.time || '—'}
                    </td>
                    <td className={`border border-slate-200 px-3 py-2 ${isClassMismatch ? 'text-purple-700 font-semibold bg-purple-100/50' : 'text-slate-800'} ${!row.csvClass ? 'bg-slate-100/70 text-slate-400' : ''}`}>
                      {row.csvClass?.className || '—'}
                    </td>
                    <td className={`border border-slate-200 px-3 py-2 ${isTrainerMismatch ? 'text-orange-700 font-semibold bg-orange-100/50' : 'text-slate-700'} ${!row.csvClass ? 'bg-slate-100/70 text-slate-400' : ''}`}>
                      {row.csvClass?.trainer1 || '—'}
                    </td>
                    <td className="border border-slate-200 px-3 py-2 text-center bg-white/80">
                      <div className="flex items-center justify-center gap-1">
                        {statusInfo.icon}
                        <span className={`text-xs font-medium ${statusInfo.color}`}>{statusInfo.label}</span>
                      </div>
                    </td>
                    <td className={`border border-slate-200 px-3 py-2 font-mono ${isTimeMismatch ? 'text-amber-700 font-semibold bg-amber-100/50' : 'text-slate-800'} ${!row.pdfClass ? 'bg-slate-100/70 text-slate-400' : ''}`}>
                      {row.pdfClass?.time || '—'}
                    </td>
                    <td className={`border border-slate-200 px-3 py-2 ${isClassMismatch ? 'text-purple-700 font-semibold bg-purple-100/50' : 'text-slate-800'} ${!row.pdfClass ? 'bg-slate-100/70 text-slate-400' : ''}`}>
                      {row.pdfClass?.className || '—'}
                    </td>
                    <td className={`border border-slate-200 px-3 py-2 ${isTrainerMismatch ? 'text-orange-700 font-semibold bg-orange-100/50' : 'text-slate-700'} ${!row.pdfClass ? 'bg-slate-100/70 text-slate-400' : ''}`}>
                      {row.pdfClass?.trainer || '—'}
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
