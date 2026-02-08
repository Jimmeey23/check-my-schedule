import { useState, useCallback, useMemo } from 'react';
import { Header } from '@/components/Header';
import { FileUploadZone } from '@/components/FileUploadZone';
import { ScheduleViewer } from '@/components/ScheduleViewer';
import { ComparisonView } from '@/components/ComparisonView';
import { SideBySideViewer } from '@/components/SideBySideViewer';
import { ComparisonViewer } from '@/components/ComparisonViewer';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  FileSpreadsheet, FileText, GitCompare, Trash2, Upload,
  CheckCircle2, AlertCircle, Building2
} from 'lucide-react';
import { readCSVFile } from '@/lib/csvParser';
import { parsePDF, parsePDFToClassData } from '@/lib/pdfParser';
import { normalizeSchedule, compareSchedules, normalizeLocation } from '@/lib/normalizers';
import type { UploadedFile, WeekSchedule, ComparisonResult, NormalizedClass, ClassData, PdfClassData } from '@/types/schedule';

const Index = () => {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [pdfSchedules, setPdfSchedules] = useState<Map<string, WeekSchedule>>(new Map());
  const [csvSchedule, setCsvSchedule] = useState<WeekSchedule | null>(null);
  const [csvClassData, setCsvClassData] = useState<{[day: string]: ClassData[]} | null>(null);
  const [pdfClassDataByLocation, setPdfClassDataByLocation] = useState<Map<string, PdfClassData[]>>(new Map());
  const [activeTab, setActiveTab] = useState('upload');
  const [selectedPdfLocation, setSelectedPdfLocation] = useState<string>('all');
  const [comparisonLocation, setComparisonLocation] = useState<string>('all');

  // Get all locations from CSV
  const csvLocations = useMemo(() => {
    if (!csvSchedule) return [];
    const set = new Set<string>();
    csvSchedule.days.forEach(d => d.classes.forEach(c => {
      const loc = normalizeLocation(c.location);
      if (loc && loc.trim() !== '') set.add(loc);
    }));
    return Array.from(set).sort();
  }, [csvSchedule]);

  const pdfLocations = useMemo(() => Array.from(pdfSchedules.keys()).filter(k => k && k.trim() !== '').sort(), [pdfSchedules]);

  // Aggregate all PDF class data from all locations
  const aggregatedPdfClassData = useMemo<PdfClassData[] | null>(() => {
    if (pdfClassDataByLocation.size === 0) return null;
    const allData: PdfClassData[] = [];
    for (const data of pdfClassDataByLocation.values()) {
      allData.push(...data);
    }
    return allData;
  }, [pdfClassDataByLocation]);

  // Build comparison - location-specific if selected
  const comparison = useMemo<ComparisonResult | null>(() => {
    if (pdfSchedules.size === 0 || !csvSchedule) return null;

    let pdfClasses: NormalizedClass[] = [];
    let csvClasses: NormalizedClass[] = [];

    if (comparisonLocation === 'all') {
      // Combine all PDFs
      for (const schedule of pdfSchedules.values()) {
        pdfClasses.push(...normalizeSchedule(schedule.days));
      }
      csvClasses = normalizeSchedule(csvSchedule.days);
    } else {
      // Specific location
      const pdfSchedule = pdfSchedules.get(comparisonLocation);
      if (pdfSchedule) {
        pdfClasses = normalizeSchedule(pdfSchedule.days);
      }
      // Filter CSV to this location
      const filteredDays = csvSchedule.days.map(day => ({
        ...day,
        classes: day.classes.filter(c => normalizeLocation(c.location) === comparisonLocation),
      })).filter(d => d.classes.length > 0);
      csvClasses = normalizeSchedule(filteredDays);
    }

    return compareSchedules(pdfClasses, csvClasses);
  }, [pdfSchedules, csvSchedule, comparisonLocation]);

  // Get combined PDF schedule for viewing
  const viewPdfSchedule = useMemo<WeekSchedule | null>(() => {
    if (pdfSchedules.size === 0) return null;
    if (selectedPdfLocation !== 'all') {
      return pdfSchedules.get(selectedPdfLocation) || null;
    }
    // Merge all
    const merged: WeekSchedule = {
      id: 'merged',
      weekStart: '',
      weekEnd: '',
      location: 'All Locations',
      days: [],
      levels: { beginner: [], intermediate: [], advanced: [] },
    };
    const dayMap = new Map<string, typeof merged.days[0]>();
    for (const schedule of pdfSchedules.values()) {
      if (!merged.weekStart) { merged.weekStart = schedule.weekStart; merged.weekEnd = schedule.weekEnd; }
      for (const day of schedule.days) {
        if (!dayMap.has(day.day)) dayMap.set(day.day, { day: day.day, date: day.date, classes: [] });
        dayMap.get(day.day)!.classes.push(...day.classes);
      }
    }
    const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    merged.days = dayOrder.filter(d => dayMap.has(d)).map(d => dayMap.get(d)!);
    return merged;
  }, [pdfSchedules, selectedPdfLocation]);

  const handleUpload = useCallback(async (file: File, type: 'pdf' | 'csv') => {
    const newFile: UploadedFile = {
      id: crypto.randomUUID(),
      name: file.name,
      type,
      uploadedAt: new Date(),
      status: 'uploading',
    };

    setUploadedFiles(prev => [...prev, newFile]);

    try {
      setUploadedFiles(prev => prev.map(f => f.id === newFile.id ? { ...f, status: 'processing' as const } : f));

      if (type === 'csv') {
        const { schedule, rawData } = await readCSVFile(file);
        if (schedule) {
          setUploadedFiles(prev => prev.map(f => f.id === newFile.id ? {
            ...f, status: 'completed' as const, data: schedule, rawData
          } : f));
          setCsvSchedule(schedule);
          
          // Populate ClassData from CSV
          if (rawData) {
            const classDataByDay: {[day: string]: ClassData[]} = {};
            rawData.forEach(row => {
              if (!classDataByDay[row.day]) classDataByDay[row.day] = [];
              classDataByDay[row.day].push(row);
            });
            setCsvClassData(classDataByDay);
          }
          
          setActiveTab('side-by-side');
        } else {
          throw new Error('Failed to parse CSV');
        }
      } else {
        // Real PDF parsing - NO MOCK DATA
        const schedule = await parsePDF(file);
        const location = schedule.location;

        // Parse PDF to ClassData format
        const pdfData = await parsePDFToClassData(file);
        
        // Accumulate PDF data by location
        setPdfClassDataByLocation(prev => {
          const next = new Map(prev);
          const existing = next.get(location) || [];
          next.set(location, [...existing, ...pdfData]);
          return next;
        });

        setUploadedFiles(prev => prev.map(f => f.id === newFile.id ? {
          ...f, status: 'completed' as const, data: schedule, location
        } : f));

        setPdfSchedules(prev => {
          const next = new Map(prev);
          next.set(location, schedule);
          return next;
        });
        setActiveTab('side-by-side');
      }
    } catch (error) {
      console.error('File processing error:', error);
      setUploadedFiles(prev => prev.map(f => f.id === newFile.id ? {
        ...f, status: 'error' as const,
        error: `Failed to process ${type.toUpperCase()} file. ${error instanceof Error ? error.message : ''}`
      } : f));
    }
  }, []);

  const handleRemoveFile = useCallback((id: string) => {
    const file = uploadedFiles.find(f => f.id === id);
    if (file) {
      if (file.type === 'pdf' && file.location) {
        setPdfSchedules(prev => {
          const next = new Map(prev);
          next.delete(file.location!);
          return next;
        });
        setPdfClassDataByLocation(prev => {
          const next = new Map(prev);
          next.delete(file.location!);
          return next;
        });
      }
      if (file.type === 'csv') {
        setCsvSchedule(null);
        setCsvClassData(null);
      }
    }
    setUploadedFiles(prev => prev.filter(f => f.id !== id));
  }, [uploadedFiles]);

  const handleClearAll = useCallback(() => {
    setUploadedFiles([]);
    setPdfSchedules(new Map());
    setCsvSchedule(null);
    setCsvClassData(null);
    setPdfClassDataByLocation(new Map());
    setActiveTab('upload');
  }, []);

  const hasPdf = pdfSchedules.size > 0;
  const hasCsv = csvSchedule !== null;
  const canCompare = hasPdf && hasCsv;

  return (
    <div className="min-h-screen app-shell">
      <Header />

      <main className="container mx-auto px-4 sm:px-6 py-8 max-w-7xl">
        {/* Hero */}
        <section className="text-center mb-10">
          <h1 className="text-4xl md:text-5xl font-display font-bold mb-3 gradient-text">
            Check My Schedule
          </h1>
          <p className="text-base text-slate-600 max-w-2xl mx-auto leading-relaxed">
            Upload PDF and CSV schedules to compare and verify class data across locations with ease.
          </p>
        </section>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <TabsList className="surface-muted p-1.5 h-auto flex-wrap rounded-xl shadow-soft">
              <TabsTrigger value="upload" className="gap-2 text-sm data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-sm rounded-lg transition-all">
                <Upload className="w-4 h-4" /> Upload
              </TabsTrigger>
              <TabsTrigger value="pdf" className="gap-2 text-sm data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-sm rounded-lg transition-all" disabled={!hasPdf}>
                <FileText className="w-4 h-4" /> PDF
                {hasPdf && <Badge variant="secondary" className="text-xs h-5 px-1.5 bg-red-100 text-red-700 border-red-200">{pdfSchedules.size}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="csv" className="gap-2 text-sm data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-sm rounded-lg transition-all" disabled={!hasCsv}>
                <FileSpreadsheet className="w-4 h-4" /> CSV
                {hasCsv && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
              </TabsTrigger>
              <TabsTrigger value="side-by-side" className="gap-2 text-sm data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-sm rounded-lg transition-all" disabled={!(csvClassData && aggregatedPdfClassData)}>
                <GitCompare className="w-4 h-4" /> Side-by-Side
              </TabsTrigger>
              <TabsTrigger value="comparison" className="gap-2 text-sm data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-sm rounded-lg transition-all" disabled={!(csvClassData && aggregatedPdfClassData)}>
                <GitCompare className="w-4 h-4" /> Comparison
              </TabsTrigger>
            </TabsList>

            {uploadedFiles.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleClearAll}
                className="gap-2 text-red-600 hover:text-red-700 border-red-200 hover:bg-red-50"
              >
                <Trash2 className="w-4 h-4" /> Clear All
              </Button>
            )}
          </div>

          {/* Status Bar */}
          {(hasPdf || hasCsv) && (
            <div className="flex flex-wrap gap-3 items-center p-4 surface-card">
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium ${hasPdf ? 'bg-white text-emerald-700 border border-emerald-200' : 'bg-white/50 text-slate-500 border border-slate-200'}`}>
                {hasPdf ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                PDF: {hasPdf ? `${pdfSchedules.size} file(s)` : 'Not uploaded'}
              </div>
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium ${hasCsv ? 'bg-white text-emerald-700 border border-emerald-200' : 'bg-white/50 text-slate-500 border border-slate-200'}`}>
                {hasCsv ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                CSV: {hasCsv ? 'Ready' : 'Not uploaded'}
              </div>
              {canCompare && (
                <Button size="sm" onClick={() => setActiveTab('comparison')} className="gap-2 ml-auto">
                  <GitCompare className="w-4 h-4" /> Compare Now
                </Button>
              )}
            </div>
          )}

          <TabsContent value="upload" className="animate-fade-in">
            <div className="surface-card gradient-border-top p-8">
              <FileUploadZone onUpload={handleUpload} uploadedFiles={uploadedFiles} onRemoveFile={handleRemoveFile} />
            </div>
          </TabsContent>

          <TabsContent value="pdf" className="animate-fade-in">
            <div className="surface-card gradient-border-top p-8">
              {hasPdf ? (
                <div className="space-y-6">
                  {pdfLocations.length > 1 && (
                    <div className="flex items-center gap-3 p-4 surface-muted">
                      <Building2 className="w-5 h-5 text-blue-600" />
                      <span className="text-sm font-medium text-slate-700">Filter by location:</span>
                      <Select value={selectedPdfLocation} onValueChange={setSelectedPdfLocation}>
                        <SelectTrigger className="w-[220px] h-10 border-blue-200 focus:border-blue-500"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Locations</SelectItem>
                          {pdfLocations.filter(l => l && l.trim() !== '').map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {viewPdfSchedule && (
                    <ScheduleViewer
                      schedule={viewPdfSchedule}
                      title={`PDF Schedule — ${viewPdfSchedule.location}`}
                    />
                  )}
                </div>
              ) : (
                <div className="text-center py-16 text-slate-500">Upload a PDF to view the schedule</div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="csv" className="animate-fade-in">
            <div className="surface-card gradient-border-top p-8">
              {csvSchedule ? (
                <ScheduleViewer schedule={csvSchedule} title="CSV Schedule" />
              ) : (
                <div className="text-center py-16 text-slate-500">Upload a CSV to view the schedule</div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="comparison" className="animate-fade-in">
            <div className="surface-card gradient-border-top p-8">
              {comparison ? (
                <div className="space-y-6">
                  {(pdfLocations.length > 1 || csvLocations.length > 1) && (
                    <div className="flex items-center gap-3 p-4 surface-muted">
                      <Building2 className="w-5 h-5 text-blue-600" />
                      <span className="text-sm font-medium text-slate-700">Compare by location:</span>
                      <Select value={comparisonLocation} onValueChange={setComparisonLocation}>
                        <SelectTrigger className="w-[220px] h-10 border-blue-200 focus:border-blue-500"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Locations</SelectItem>
                          {[...new Set([...pdfLocations, ...csvLocations])].filter(l => l && l.trim() !== '').sort().map(l =>
                            <SelectItem key={l} value={l}>{l}</SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <ComparisonView comparison={comparison} />
                </div>
              ) : (
                <div className="text-center py-16 text-slate-500">Upload both PDF and CSV files to compare</div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="side-by-side" className="animate-fade-in">
            <div className="surface-card gradient-border-top p-4">
              {csvClassData && aggregatedPdfClassData ? (
                <SideBySideViewer csvData={csvClassData} pdfData={aggregatedPdfClassData} />
              ) : (
                <div className="text-center py-16 text-slate-500">Upload both CSV and PDF files to use the side-by-side viewer</div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="comparison-detail" className="animate-fade-in">
            <div className="surface-card gradient-border-top p-4">
              {csvClassData && aggregatedPdfClassData ? (
                <ComparisonViewer csvData={csvClassData} pdfData={aggregatedPdfClassData} />
              ) : (
                <div className="text-center py-16 text-slate-500">Upload both CSV and PDF files to use the comparison viewer</div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Index;
