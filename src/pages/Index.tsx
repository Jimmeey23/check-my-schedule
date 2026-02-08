import { useState, useCallback, useMemo } from 'react';
import { Header } from '@/components/Header';
import { FileUploadZone } from '@/components/FileUploadZone';
import { ScheduleViewer } from '@/components/ScheduleViewer';
import { ComparisonView } from '@/components/ComparisonView';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  FileSpreadsheet, FileText, GitCompare, Trash2, Upload,
  CheckCircle2, AlertCircle, Building2
} from 'lucide-react';
import { readCSVFile } from '@/lib/csvParser';
import { parsePDF } from '@/lib/pdfParser';
import { normalizeSchedule, compareSchedules, normalizeLocation } from '@/lib/normalizers';
import type { UploadedFile, WeekSchedule, ComparisonResult, NormalizedClass } from '@/types/schedule';

const Index = () => {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [pdfSchedules, setPdfSchedules] = useState<Map<string, WeekSchedule>>(new Map());
  const [csvSchedule, setCsvSchedule] = useState<WeekSchedule | null>(null);
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
          setActiveTab('csv');
        } else {
          throw new Error('Failed to parse CSV');
        }
      } else {
        // Real PDF parsing - NO MOCK DATA
        const schedule = await parsePDF(file);
        const location = schedule.location;

        setUploadedFiles(prev => prev.map(f => f.id === newFile.id ? {
          ...f, status: 'completed' as const, data: schedule, location
        } : f));

        setPdfSchedules(prev => {
          const next = new Map(prev);
          next.set(location, schedule);
          return next;
        });
        setActiveTab('pdf');
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
      }
      if (file.type === 'csv') setCsvSchedule(null);
    }
    setUploadedFiles(prev => prev.filter(f => f.id !== id));
  }, [uploadedFiles]);

  const handleClearAll = useCallback(() => {
    setUploadedFiles([]);
    setPdfSchedules(new Map());
    setCsvSchedule(null);
    setActiveTab('upload');
  }, []);

  const hasPdf = pdfSchedules.size > 0;
  const hasCsv = csvSchedule !== null;
  const canCompare = hasPdf && hasCsv;

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container mx-auto px-4 sm:px-6 py-6 max-w-7xl">
        {/* Hero */}
        <section className="text-center mb-8">
          <h1 className="text-3xl md:text-4xl font-display font-bold mb-3 text-foreground">
            <span className="gradient-text">Schedule Checker</span>
          </h1>
          <p className="text-sm text-muted-foreground max-w-xl mx-auto">
            Upload PDF and CSV schedules to compare and verify class data across locations.
          </p>
        </section>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <TabsList className="bg-secondary/60 p-1 h-auto flex-wrap">
              <TabsTrigger value="upload" className="gap-1.5 text-xs data-[state=active]:bg-card">
                <Upload className="w-3.5 h-3.5" /> Upload
              </TabsTrigger>
              <TabsTrigger value="pdf" className="gap-1.5 text-xs data-[state=active]:bg-card" disabled={!hasPdf}>
                <FileText className="w-3.5 h-3.5" /> PDF
                {hasPdf && <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{pdfSchedules.size}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="csv" className="gap-1.5 text-xs data-[state=active]:bg-card" disabled={!hasCsv}>
                <FileSpreadsheet className="w-3.5 h-3.5" /> CSV
                {hasCsv && <CheckCircle2 className="w-3 h-3 text-status-match" />}
              </TabsTrigger>
              <TabsTrigger value="comparison" className="gap-1.5 text-xs data-[state=active]:bg-card" disabled={!canCompare}>
                <GitCompare className="w-3.5 h-3.5" /> Compare
                {canCompare && comparison && (
                  <Badge variant="outline" className={comparison.summary.mismatches > 0
                    ? "bg-status-mismatch/10 text-status-mismatch border-status-mismatch/20 text-[10px]"
                    : "bg-status-match/10 text-status-match border-status-match/20 text-[10px]"
                  }>{comparison.summary.mismatches > 0 ? `${comparison.summary.mismatches}` : '✓'}</Badge>
                )}
              </TabsTrigger>
            </TabsList>

            {uploadedFiles.length > 0 && (
              <Button variant="outline" size="sm" onClick={handleClearAll} className="gap-1.5 text-destructive hover:text-destructive text-xs">
                <Trash2 className="w-3.5 h-3.5" /> Clear All
              </Button>
            )}
          </div>

          {/* Status Bar */}
          {(hasPdf || hasCsv) && (
            <div className="flex flex-wrap gap-2 items-center">
              <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs ${hasPdf ? 'bg-status-match/10 text-status-match' : 'bg-secondary text-muted-foreground'}`}>
                {hasPdf ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                PDF: {hasPdf ? `${pdfSchedules.size} file(s)` : 'Not uploaded'}
              </div>
              <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs ${hasCsv ? 'bg-status-match/10 text-status-match' : 'bg-secondary text-muted-foreground'}`}>
                {hasCsv ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                CSV: {hasCsv ? 'Ready' : 'Not uploaded'}
              </div>
              {canCompare && (
                <Button variant="default" size="sm" onClick={() => setActiveTab('comparison')} className="gap-1.5 text-xs h-7">
                  <GitCompare className="w-3.5 h-3.5" /> Compare
                </Button>
              )}
            </div>
          )}

          <TabsContent value="upload" className="animate-fade-in">
            <div className="bg-card border rounded-xl p-5">
              <FileUploadZone onUpload={handleUpload} uploadedFiles={uploadedFiles} onRemoveFile={handleRemoveFile} />
            </div>
          </TabsContent>

          <TabsContent value="pdf" className="animate-fade-in">
            <div className="bg-card border rounded-xl p-5">
              {hasPdf ? (
                <div className="space-y-4">
                  {pdfLocations.length > 1 && (
                    <div className="flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-muted-foreground" />
                      <Select value={selectedPdfLocation} onValueChange={setSelectedPdfLocation}>
                        <SelectTrigger className="w-[200px] h-9"><SelectValue /></SelectTrigger>
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
                <div className="text-center py-12 text-muted-foreground">Upload a PDF to view the schedule</div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="csv" className="animate-fade-in">
            <div className="bg-card border rounded-xl p-5">
              {csvSchedule ? (
                <ScheduleViewer schedule={csvSchedule} title="CSV Schedule" />
              ) : (
                <div className="text-center py-12 text-muted-foreground">Upload a CSV to view the schedule</div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="comparison" className="animate-fade-in">
            <div className="bg-card border rounded-xl p-5">
              {comparison ? (
                <div className="space-y-4">
                  {(pdfLocations.length > 1 || csvLocations.length > 1) && (
                    <div className="flex items-center gap-2 p-3 bg-secondary/30 rounded-lg">
                      <Building2 className="w-4 h-4 text-primary" />
                      <span className="text-sm font-medium text-foreground">Compare by location:</span>
                      <Select value={comparisonLocation} onValueChange={setComparisonLocation}>
                        <SelectTrigger className="w-[200px] h-9"><SelectValue /></SelectTrigger>
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
                <div className="text-center py-12 text-muted-foreground">Upload both PDF and CSV files to compare</div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Index;
