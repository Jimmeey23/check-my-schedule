import React, { useEffect, useState, useMemo } from 'react';
import { ClassData, PdfClassData, ComparisonResult } from '@/types/schedule';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { toast } from '@/hooks/use-toast';
import { alignCsvPdfData } from '@/lib/classDataMatcher';
import {
  CheckCircle2,
  AlertTriangle,
  FileSpreadsheet,
  FileText,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Copy,
  Check,
} from 'lucide-react';

interface ComparisonViewerProps {
  csvData: {[day: string]: ClassData[]} | null;
  pdfData: PdfClassData[] | null;
}

type StatusFilter = 'all' | 'match' | 'mismatch';

export function ComparisonViewer({ csvData, pdfData }: ComparisonViewerProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [selectedDetail, setSelectedDetail] = useState<ComparisonResult | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [showOnlyMismatches, setShowOnlyMismatches] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeMismatchIndex, setActiveMismatchIndex] = useState(0);

  const compareData = useMemo(() => {
    return alignCsvPdfData(csvData, pdfData).map((row): ComparisonResult => {
      const time = row.pdfClass?.time || row.csvClass?.time || '';
      const isMatch = row.status === 'match';

      return {
        day: row.day,
        time,
        csv: row.csvClass,
        pdf: row.pdfClass,
        isMatch,
        discrepancies: {
          classMismatch: row.status === 'class-mismatch' || undefined,
          trainerMismatch: row.status === 'trainer-mismatch' || undefined,
          timeMismatch: row.status === 'time-mismatch' || undefined,
          themeMismatch: row.discrepancies.themeMismatch || undefined,
          csvMissing: row.status === 'pdf-only' || undefined,
          pdfMissing: row.status === 'csv-only' || undefined,
        },
      };
    });
  }, [csvData, pdfData]);

  const filteredResults = useMemo(() => {
    let filtered = compareData;
    
    // Apply mismatch-only filter if enabled
    if (showOnlyMismatches) {
      filtered = filtered.filter(r => !r.isMatch);
    }
    
    // Apply status filter
    if (statusFilter !== 'all') {
      if (statusFilter === 'match') {
        filtered = filtered.filter(r => r.isMatch);
      } else {
        filtered = filtered.filter(r => !r.isMatch);
      }
    }
    
    return filtered;
  }, [compareData, statusFilter, showOnlyMismatches]);

  const mismatchResults = filteredResults.filter(result => !result.isMatch);
  const mismatchIndexByResult = new Map<ComparisonResult, number>();
  mismatchResults.forEach((result, index) => mismatchIndexByResult.set(result, index));

  useEffect(() => {
    if (activeMismatchIndex >= mismatchResults.length) {
      setActiveMismatchIndex(0);
    }
  }, [activeMismatchIndex, mismatchResults.length]);

  const scrollToMismatch = (targetIndex: number) => {
    if (mismatchResults.length === 0) return;
    const next = (targetIndex + mismatchResults.length) % mismatchResults.length;
    setActiveMismatchIndex(next);
    requestAnimationFrame(() => {
      const row = document.querySelector<HTMLElement>(`[data-mismatch-index="${next}"]`);
      row?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  };

  if (!csvData || !pdfData) {
    return (
      <Card className="flex flex-col items-center justify-center p-8 bg-white">
        <p className="text-slate-600 mb-4">Please upload both CSV and PDF files to use the comparison viewer.</p>
      </Card>
    );
  }

  const totalMatches = compareData.filter(r => r.isMatch).length;
  const totalMismatches = compareData.filter(r => !r.isMatch).length;

  const getDiscrepancyDetails = (result: ComparisonResult): string[] => {
    const details: string[] = [];

    if (result.discrepancies.classMismatch) {
      details.push(`Class: "${result.csv?.className}" (CSV) vs "${result.pdf?.className}" (PDF)`);
    }

    if (result.discrepancies.trainerMismatch) {
      details.push(`Trainer: "${result.csv?.trainer1}" (CSV) vs "${result.pdf?.trainer}" (PDF)`);
    }

    if (result.discrepancies.timeMismatch) {
      details.push(`Time: "${result.csv?.time}" (CSV) vs "${result.pdf?.time}" (PDF)`);
    }

    if (result.discrepancies.themeMismatch) {
      details.push(`Theme: "${result.csv?.theme || '—'}" (CSV) vs "${result.pdf?.theme || '—'}" (PDF)`);
    }

    if (result.discrepancies.csvMissing) {
      details.push('This class is in the PDF but missing from the CSV');
    }

    if (result.discrepancies.pdfMissing) {
      details.push('This class is in the CSV but missing from the PDF');
    }

    return details;
  };

  const copyMismatchesInTableFormat = async (): Promise<void> => {
    // Filter to only mismatches
    const mismatchResults = compareData.filter(r => !r.isMatch);

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
    
    const getStatusLabel = (result: ComparisonResult): string => {
      if (result.discrepancies.classMismatch && result.discrepancies.trainerMismatch) return 'Class & Trainer Mismatch';
      if (result.discrepancies.classMismatch) return 'Class Mismatch';
      if (result.discrepancies.trainerMismatch) return 'Trainer Mismatch';
      if (result.discrepancies.timeMismatch) return 'Time Mismatch';
      if (result.discrepancies.themeMismatch) return 'Theme Mismatch';
      if (result.discrepancies.csvMissing) return 'Not in CSV';
      if (result.discrepancies.pdfMissing) return 'Not in PDF';
      return 'Mismatch';
    };
    
    let htmlTable = `<table style="${tableStyles}">\n`;
    
    // Add header row
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
    
    // Add data rows
    mismatchResults.forEach(result => {
      htmlTable += `<tr>\n`;
      htmlTable += `<td style="${cellStyles}">${result.day}</td>`;
      htmlTable += `<td style="${cellStyles}">${result.csv?.time || '—'}</td>`;
      htmlTable += `<td style="${cellStyles}">${result.csv?.className || '—'}</td>`;
      htmlTable += `<td style="${cellStyles}">${result.csv?.trainer1 || '—'}</td>`;
      htmlTable += `<td style="${cellStyles}">${result.csv?.location || '—'}</td>`;
      htmlTable += `<td style="${cellStyles}">${result.csv?.theme || '—'}</td>`;
      htmlTable += `<td style="${cellStyles}">${getStatusLabel(result)}</td>`;
      htmlTable += `<td style="${cellStyles}">${result.pdf?.time || '—'}</td>`;
      htmlTable += `<td style="${cellStyles}">${result.pdf?.className || '—'}</td>`;
      htmlTable += `<td style="${cellStyles}">${result.pdf?.trainer || '—'}</td>`;
      htmlTable += `<td style="${cellStyles}">${result.pdf?.location || '—'}</td>`;
      htmlTable += `<td style="${cellStyles}">${result.pdf?.theme || '—'}</td>`;
      htmlTable += `</tr>\n`;
    });
    
    htmlTable += `</table>`;
    
    try {
      await navigator.clipboard.writeText(htmlTable);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({
        title: "Mismatches Copied!",
        description: `Copied ${mismatchResults.length} mismatch rows in HTML table format to clipboard`,
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

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* Action Buttons */}
      <div className="flex gap-2 flex-wrap p-3 bg-slate-50 rounded-lg border border-slate-200">
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
      </div>

      <div className="surface-card p-3 border border-amber-200 bg-amber-50/60">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">Mismatch Focus</p>
            <p className="text-xs text-slate-600">
              {mismatchResults.length} highlighted issue{mismatchResults.length === 1 ? '' : 's'} in current view
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => scrollToMismatch(activeMismatchIndex - 1)}
              disabled={mismatchResults.length === 0}
              className="h-8 px-2.5"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <div className="text-xs font-semibold text-slate-700 min-w-[56px] text-center">
              {mismatchResults.length > 0 ? `${activeMismatchIndex + 1}/${mismatchResults.length}` : '0/0'}
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => scrollToMismatch(activeMismatchIndex + 1)}
              disabled={mismatchResults.length === 0}
              className="h-8 px-2.5"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Status Filter */}
      <div className="flex gap-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
        <span className="text-sm font-medium text-slate-600 mr-2">Status:</span>
        {[
          { key: 'all' as StatusFilter, label: 'All', count: compareData.length, color: 'slate' },
          { key: 'match' as StatusFilter, label: 'Matches', count: totalMatches, color: 'emerald' },
          { key: 'mismatch' as StatusFilter, label: 'Mismatches', count: totalMismatches, color: 'red' },
        ].map(btn => (
          <Button
            key={btn.key}
            variant={statusFilter === btn.key ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStatusFilter(btn.key)}
            className="gap-1"
          >
            {btn.label} ({btn.count})
          </Button>
        ))}
      </div>

      {/* Comparison Table */}
      <div className="flex-1 overflow-auto border rounded-lg bg-white">
        <table className="w-full border-collapse table-compact text-sm">
          <thead>
            <tr className="bg-slate-800 text-white sticky top-0 z-10">
              <th className="border border-slate-300 px-3 py-2 text-left font-semibold w-20">Status</th>
              <th className="border border-slate-300 px-3 py-2 text-left font-semibold">Day</th>
              <th className="border border-slate-300 px-3 py-2 text-left font-semibold">Time</th>
              <th className="border border-slate-300 px-3 py-2 text-left font-semibold">Location</th>
              <th className="border border-slate-300 px-3 py-2 text-left font-semibold">Class</th>
              <th className="border border-slate-300 px-3 py-2 text-left font-semibold">CSV Trainer</th>
              <th className="border border-slate-300 px-3 py-2 text-left font-semibold">PDF Trainer</th>
              <th className="border border-slate-300 px-3 py-2 text-left font-semibold">Theme</th>
              <th className="border border-slate-300 px-3 py-2 text-center font-semibold w-12">Details</th>
            </tr>
          </thead>
          <tbody>
            {filteredResults.map((result, idx) => {
              const mismatchIndex = mismatchIndexByResult.get(result);
              const isActiveMismatch = mismatchIndex !== undefined && mismatchIndex === activeMismatchIndex;
              // Enhanced styling with subtle backgrounds
              const rowBgClass = result.isMatch 
                ? 'bg-white hover:bg-slate-50 border-l-2 border-l-transparent' 
                : 'bg-amber-50/70 hover:bg-amber-100/70 border-l-4 border-l-amber-500';
              
              return (
              <tr
                key={idx}
                data-mismatch-index={mismatchIndex !== undefined ? mismatchIndex : undefined}
                className={`border-b border-slate-200 transition-colors ${rowBgClass} ${isActiveMismatch ? 'ring-2 ring-blue-300 ring-inset' : ''}`}
              >
                <td className="border border-slate-300 px-3 py-2 text-center">
                  {result.isMatch ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-500 inline" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-amber-700 inline" />
                  )}
                </td>
                <td className="border border-slate-300 px-3 py-2 font-semibold text-slate-800">{result.day}</td>
                <td
                  className={`border border-slate-300 px-3 py-2 font-mono ${
                    result.discrepancies.timeMismatch ? 'text-amber-800 font-semibold bg-amber-100/50' : 'text-slate-700'
                  }`}
                >
                  {result.time}
                </td>
                <td className="border border-slate-300 px-3 py-2 text-slate-700">
                  {result.csv?.location || result.pdf?.location || '—'}
                </td>
                <td className={`border border-slate-300 px-3 py-2 ${result.discrepancies.classMismatch ? 'text-slate-900 font-semibold bg-amber-100/70' : 'text-slate-700'}`}>
                  {result.csv?.className || result.pdf?.className || '—'}
                </td>
                <td className={`border border-slate-300 px-3 py-2 ${result.discrepancies.trainerMismatch ? 'text-slate-900 font-semibold bg-amber-100/70' : 'text-slate-700'}`}>
                  {result.csv?.trainer1 || '—'}
                </td>
                <td className={`border border-slate-300 px-3 py-2 ${result.discrepancies.trainerMismatch ? 'text-slate-900 font-semibold bg-amber-100/70' : 'text-slate-700'}`}>
                  {result.pdf?.trainer || '—'}
                </td>
                <td className={`border border-slate-300 px-3 py-2 ${result.discrepancies.themeMismatch ? 'text-slate-900 font-semibold bg-amber-100/70' : 'text-slate-700'}`}>
                  {result.csv?.theme || result.pdf?.theme || '—'}
                </td>
                <td className="border border-slate-300 px-3 py-2 text-center">
                  {!result.isMatch && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedDetail(result);
                        setIsDetailOpen(true);
                      }}
                      className="w-full hover:bg-blue-100"
                    >
                      <ChevronDown className="w-4 h-4" />
                    </Button>
                  )}
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Detail Sheet */}
      <Sheet open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <SheetContent className="w-full max-w-2xl bg-white overflow-y-auto">
          {selectedDetail && (
            <>
              <SheetHeader>
                <SheetTitle className="text-2xl font-bold text-slate-900">
                  {selectedDetail.day} at {selectedDetail.time}
                </SheetTitle>
                <SheetDescription className="text-base text-slate-600">
                  Detailed mismatch information
                </SheetDescription>
              </SheetHeader>

              <div className="mt-6 space-y-6">
                {/* Header */}
                <div className="flex gap-4 pb-4 border-b border-slate-200">
                  <div className="flex-1">
                    <h3 className="font-semibold text-slate-700 flex items-center gap-2 mb-3">
                      <FileSpreadsheet className="w-5 h-5" />
                      CSV Data
                    </h3>
                    <div className="space-y-2 text-slate-700">
                      <p><span className="font-semibold">Time:</span> {selectedDetail.csv?.time || '—'}</p>
                      <p><span className="font-semibold">Class:</span> {selectedDetail.csv?.className || '—'}</p>
                      <p><span className="font-semibold">Trainer:</span> {selectedDetail.csv?.trainer1 || '—'}</p>
                      <p><span className="font-semibold">Location:</span> {selectedDetail.csv?.location || '—'}</p>
                      {selectedDetail.csv?.notes && (
                        <p><span className="font-semibold">Notes:</span> {selectedDetail.csv.notes}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex-1">
                    <h3 className="font-semibold text-slate-700 flex items-center gap-2 mb-3">
                      <FileText className="w-5 h-5" />
                      PDF Data
                    </h3>
                    <div className="space-y-2 text-slate-700">
                      <p><span className="font-semibold">Time:</span> {selectedDetail.pdf?.time || '—'}</p>
                      <p><span className="font-semibold">Class:</span> {selectedDetail.pdf?.className || '—'}</p>
                      <p><span className="font-semibold">Trainer:</span> {selectedDetail.pdf?.trainer || '—'}</p>
                      <p><span className="font-semibold">Location:</span> {selectedDetail.pdf?.location || '—'}</p>
                    </div>
                  </div>
                </div>

                {/* Discrepancies */}
                <div>
                  <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-amber-500" />
                    Discrepancies Found
                  </h3>

                  <div className="space-y-2">
                    {getDiscrepancyDetails(selectedDetail).map((detail, idx) => (
                      <div key={idx} className="p-3 bg-amber-50 border border-amber-200 rounded-md">
                        <p className="text-amber-900 text-sm">{detail}</p>
                      </div>
                    ))}
                  </div>

                  {getDiscrepancyDetails(selectedDetail).length === 0 && (
                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-md">
                      <p className="text-emerald-900 text-sm">✓ No discrepancies - this is a perfect match!</p>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
