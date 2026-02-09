import React, { useState, useMemo } from 'react';
import { ClassData, PdfClassData, ComparisonResult } from '@/types/schedule';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Users,
  BookOpen,
  FileSpreadsheet,
  FileText,
  ChevronDown,
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

  const compareData = useMemo(() => {
    if (!csvData || !pdfData) return [];

    const flatCsvData = Object.values(csvData).flat();
    const results: ComparisonResult[] = [];

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

    const csvUsed = new Set<number>();

    // Match PDF items with CSV items
    pdfData.forEach(pdfClass => {
      const csvMatches = flatCsvData
        .map((csv, idx) => ({ csv, idx }))
        .filter(({ csv, idx }) => {
          if (csvUsed.has(idx)) return false;
          if (csv.day !== pdfClass.day) return false;

          const csvTimeKey = normalizeTimeKey(csv.time);
          const pdfTimeKey = normalizeTimeKey(pdfClass.time);

          return csvTimeKey === pdfTimeKey;
        });

      if (csvMatches.length > 0) {
        const match = csvMatches[0];
        csvUsed.add(match.idx);
        const csv = match.csv;

        const csvClassName = csv.className.toLowerCase().replace('studio ', '');
        const pdfClassName = pdfClass.className.toLowerCase().replace('studio ', '');
        const classMatches = csvClassName.includes(pdfClassName) || pdfClassName.includes(csvClassName);
        const trainerMatches = csv.trainer1 === pdfClass.trainer;

        const isMatch = classMatches && trainerMatches;

        results.push({
          day: pdfClass.day,
          time: pdfClass.time,
          csv: csv,
          pdf: pdfClass,
          isMatch: isMatch,
          discrepancies: {
            classMismatch: !classMatches,
            trainerMismatch: !trainerMatches,
          },
        });
      } else {
        results.push({
          day: pdfClass.day,
          time: pdfClass.time,
          csv: null,
          pdf: pdfClass,
          isMatch: false,
          discrepancies: {
            csvMissing: true,
          },
        });
      }
    });

    // Add unmatched CSV items
    flatCsvData.forEach((csv, idx) => {
      if (!csvUsed.has(idx)) {
        results.push({
          day: csv.day,
          time: csv.time,
          csv: csv,
          pdf: null,
          isMatch: false,
          discrepancies: {
            pdfMissing: true,
          },
        });
      }
    });

    return results.sort((a, b) => {
      const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
      const dayA = dayOrder.indexOf(a.day);
      const dayB = dayOrder.indexOf(b.day);

      if (dayA !== dayB) return dayA - dayB;

      const timeA = parseTimeToMinutes(a.time);
      const timeB = parseTimeToMinutes(b.time);

      return timeA - timeB;
    });
  }, [csvData, pdfData]);

  const filteredResults = useMemo(() => {
    if (statusFilter === 'all') return compareData;
    if (statusFilter === 'match') return compareData.filter(r => r.isMatch);
    return compareData.filter(r => !r.isMatch);
  }, [compareData, statusFilter]);

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

    if (result.discrepancies.csvMissing) {
      details.push('This class is in the PDF but missing from the CSV');
    }

    if (result.discrepancies.pdfMissing) {
      details.push('This class is in the CSV but missing from the PDF');
    }

    return details;
  };

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* Status Filter */}
      <div className="flex gap-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
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
              <th className="border border-slate-300 px-3 py-2 text-center font-semibold w-12">Details</th>
            </tr>
          </thead>
          <tbody>
            {filteredResults.map((result, idx) => {
              // Enhanced styling with subtle backgrounds
              const rowBgClass = result.isMatch 
                ? 'bg-emerald-50/40 hover:bg-emerald-50/60 border-l-2 border-l-emerald-400' 
                : 'bg-amber-50/30 hover:bg-amber-50/50 border-l-2 border-l-amber-400';
              
              return (
              <tr key={idx} className={`border-b border-slate-200 transition-colors ${rowBgClass}`}>
                <td className="border border-slate-300 px-3 py-2 text-center">
                  {result.isMatch ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-500 inline" />
                  ) : (
                    <XCircle className="w-5 h-5 text-red-500 inline" />
                  )}
                </td>
                <td className="border border-slate-300 px-3 py-2 font-semibold text-slate-800">{result.day}</td>
                <td className="border border-slate-300 px-3 py-2 font-mono text-slate-700">{result.time}</td>
                <td className="border border-slate-300 px-3 py-2 text-slate-700">
                  {result.csv?.location || result.pdf?.location || '—'}
                </td>
                <td className={`border border-slate-300 px-3 py-2 ${result.discrepancies.classMismatch ? 'text-purple-700 font-semibold bg-purple-100/50' : 'text-slate-700'}`}>
                  {result.csv?.className || result.pdf?.className || '—'}
                </td>
                <td className={`border border-slate-300 px-3 py-2 ${result.discrepancies.trainerMismatch ? 'text-orange-700 font-semibold bg-orange-100/50' : 'text-slate-700'}`}>
                  {result.csv?.trainer1 || '—'}
                </td>
                <td className={`border border-slate-300 px-3 py-2 ${result.discrepancies.trainerMismatch ? 'text-orange-700 font-semibold bg-orange-100/50' : 'text-slate-700'}`}>
                  {result.pdf?.trainer || '—'}
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
                    <h3 className="font-semibold text-blue-600 flex items-center gap-2 mb-3">
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
                    <h3 className="font-semibold text-red-600 flex items-center gap-2 mb-3">
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
