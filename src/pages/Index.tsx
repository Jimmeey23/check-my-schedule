import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Header } from '@/components/Header';
import { FileUploadZone } from '@/components/FileUploadZone';
import { ScheduleViewer } from '@/components/ScheduleViewer';
import { PdfSourceEditorTab } from '@/components/PdfSourceEditorTab';
import { SideBySideViewer } from '@/components/SideBySideViewer';
import { MomenceTab } from '@/components/MomenceTab';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  FileSpreadsheet, FileText, GitCompare, Trash2, Upload,
  CheckCircle2, AlertCircle, Building2, Globe, Eye
} from 'lucide-react';
import { readCSVFile } from '@/lib/csvParser';
import { parsePDF, parsePDFToClassData, scheduleToPdfClassData } from '@/lib/pdfParser';
import { applyPdfDataThemesToSchedule, collectThemeCandidates, mergeVisionThemesIntoPdfData, renderPdfPagesForThemeVision } from '@/lib/pdfThemeVision';
import { buildCleanedPdfSheetRows, CLEANED_PDF_SHEET_NAME } from '@/lib/cleanedPdfSheet';
import { normalizeSchedule, compareSchedules, normalizeLocation } from '@/lib/normalizers';
import { LOCATION_QUERY_PARAM, normalizeLocationFilterValue, updateLocationSearchParams } from '@/lib/urlLocationFilter';
import {
  createPersistedScheduleSnapshot,
  hasPersistableScheduleState,
  restorePersistedScheduleSnapshot,
  shouldRestorePersistedScheduleSnapshot,
} from '@/lib/persistedScheduleState';
import type { UploadedFile, WeekSchedule, ScheduleComparisonResult, NormalizedClass, ClassData, PdfClassData } from '@/types/schedule';
import { clearPersistedUploadState, deletePersistedPdf, invokeMomenceFunction, invokePdfThemeVision, loadPersistedUploadState, savePersistedUploadState, syncCleanedPdfSheet, uploadPersistedPdf, urlLooksLikePdf } from '@/lib/supabaseClient';
import { type MomenceClassData } from '@/types/momence';
import { parseMomenceSessions } from '@/components/MomenceTab';
import { toast } from '@/hooks/use-toast';

function revokePreviewUrl(url?: string) {
  if (url?.startsWith('blob:')) {
    URL.revokeObjectURL(url);
  }
}

const DEFAULT_COMPARE_LOCATION = 'kwality house kemps corner';

const Index = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [pdfSchedules, setPdfSchedules] = useState<Map<string, WeekSchedule>>(new Map());
  const [csvSchedule, setCsvSchedule] = useState<WeekSchedule | null>(null);
  const [csvClassData, setCsvClassData] = useState<{[day: string]: ClassData[]} | null>(null);
  const [pdfClassDataByLocation, setPdfClassDataByLocation] = useState<Map<string, PdfClassData[]>>(new Map());
  const [pdfPreviewUrls, setPdfPreviewUrls] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState('upload');
  const [momenceSessions, setMomenceSessions] = useState<MomenceClassData[]>([]);
  const [momenceLoading, setMomenceLoading] = useState(false);
  const [momenceError, setMomenceError] = useState<string | null>(null);
  const [persistenceReady, setPersistenceReady] = useState(false);
  const pdfPreviewUrlsRef = useRef<Record<string, string>>({});
  const pdfSchedulesRef = useRef<Map<string, WeekSchedule>>(new Map());
  const csvClassDataRef = useRef<{[day: string]: ClassData[]} | null>(null);

  const completedPdfUploads = useMemo(
    () => uploadedFiles.filter(file => file.type === 'pdf' && file.status === 'completed'),
    [uploadedFiles]
  );
  const completedCsvUploads = useMemo(
    () => uploadedFiles.filter(file => file.type === 'csv' && file.status === 'completed'),
    [uploadedFiles]
  );

  const sharedLocationFilter = useMemo(
    () => normalizeLocationFilterValue(searchParams.get(LOCATION_QUERY_PARAM)),
    [searchParams]
  );

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

  const momenceLocations = useMemo(() => {
    const set = new Set<string>();
    momenceSessions.forEach(session => {
      if (session.location && session.location.trim()) set.add(session.location);
    });
    return Array.from(set).sort();
  }, [momenceSessions]);

  const allAvailableLocations = useMemo(() => {
    const set = new Set<string>();
    [...pdfLocations, ...csvLocations, ...momenceLocations]
      .filter(location => location && location.trim() !== '')
      .forEach(location => set.add(location));

    const normalizedFilter = normalizeLocationFilterValue(searchParams.get(LOCATION_QUERY_PARAM));
    if (normalizedFilter !== 'all') set.add(normalizedFilter);

    return Array.from(set).sort();
  }, [csvLocations, momenceLocations, pdfLocations, searchParams]);

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
  const comparison = useMemo<ScheduleComparisonResult | null>(() => {
    if (pdfSchedules.size === 0 || !csvSchedule) return null;

    let pdfClasses: NormalizedClass[] = [];
    let csvClasses: NormalizedClass[] = [];

    if (sharedLocationFilter === 'all') {
      // Combine all PDFs
      for (const schedule of pdfSchedules.values()) {
        pdfClasses.push(...normalizeSchedule(schedule.days));
      }
      csvClasses = normalizeSchedule(csvSchedule.days);
    } else {
      // Specific location
      const pdfSchedule = pdfSchedules.get(sharedLocationFilter);
      if (pdfSchedule) {
        pdfClasses = normalizeSchedule(pdfSchedule.days);
      }
      // Filter CSV to this location
      const filteredDays = csvSchedule.days.map(day => ({
        ...day,
        classes: day.classes.filter(c => normalizeLocation(c.location) === sharedLocationFilter),
      })).filter(d => d.classes.length > 0);
      csvClasses = normalizeSchedule(filteredDays);
    }

    return compareSchedules(pdfClasses, csvClasses);
  }, [pdfSchedules, csvSchedule, sharedLocationFilter]);

  // Get combined PDF schedule for viewing
  const viewPdfSchedule = useMemo<WeekSchedule | null>(() => {
    if (pdfSchedules.size === 0) return null;
    if (sharedLocationFilter !== 'all') {
      return pdfSchedules.get(sharedLocationFilter) || null;
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
  }, [pdfSchedules, sharedLocationFilter]);

  const handleSharedLocationChange = useCallback((location: string) => {
    setSearchParams(current => updateLocationSearchParams(current, location));
  }, [setSearchParams]);

  const defaultLocationFilter = useMemo(() => {
    if (completedCsvUploads.length !== 1) return 'all';

    if (completedPdfUploads.length === 1) {
      const singlePdfLocation = completedPdfUploads[0]?.location || pdfLocations[0];
      return normalizeLocation(singlePdfLocation) || singlePdfLocation || 'all';
    }

    if (completedPdfUploads.length === 2) {
      return normalizeLocation(DEFAULT_COMPARE_LOCATION) || DEFAULT_COMPARE_LOCATION;
    }

    return 'all';
  }, [completedCsvUploads, completedPdfUploads, pdfLocations]);

  useEffect(() => {
    let cancelled = false;

    const hydratePersistedState = async () => {
      // Auto-load from previous session is disabled
      setPersistenceReady(true);
      return;
      
      // Previous auto-load logic is commented out below
      /*
      try {
        const { snapshot, pdfPreviewUrls } = await loadPersistedUploadState();
        if (!snapshot || cancelled) return;

        if (!shouldRestorePersistedScheduleSnapshot(snapshot)) {
          clearPersistedUploadState().catch(error => {
            console.error('Failed to clear fresh persisted upload state', error);
          });
          return;
        }

        const restored = restorePersistedScheduleSnapshot(snapshot);
        setUploadedFiles(restored.uploadedFiles);
        setCsvSchedule(restored.csvSchedule);
        setCsvClassData(restored.csvClassData);
        setPdfSchedules(restored.pdfSchedules);
        setPdfClassDataByLocation(restored.pdfClassDataByLocation);
        setPdfPreviewUrls(pdfPreviewUrls || {});

        if (restored.uploadedFiles.length > 0) {
          setActiveTab('side-by-side');
        }
      } catch (error) {
        console.error('Failed to restore persisted upload state', error);
      } finally {
        if (!cancelled) setPersistenceReady(true);
      }
      */
    };

    hydratePersistedState();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    pdfPreviewUrlsRef.current = pdfPreviewUrls;
  }, [pdfPreviewUrls]);

  useEffect(() => {
    pdfSchedulesRef.current = pdfSchedules;
  }, [pdfSchedules]);

  useEffect(() => {
    csvClassDataRef.current = csvClassData;
  }, [csvClassData]);

  useEffect(() => {
    if (defaultLocationFilter === 'all') return;
    if (sharedLocationFilter !== 'all') return;

    setSearchParams(current => updateLocationSearchParams(current, defaultLocationFilter));
  }, [defaultLocationFilter, setSearchParams, sharedLocationFilter]);

  useEffect(() => {
    return () => {
      Object.values(pdfPreviewUrlsRef.current).forEach(url => revokePreviewUrl(url));
    };
  }, []);

  useEffect(() => {
    if (!persistenceReady) return;

    const currentState = {
      uploadedFiles,
      csvSchedule,
      csvClassData,
      pdfSchedules,
      pdfClassDataByLocation,
    };

    if (!hasPersistableScheduleState(currentState)) {
      clearPersistedUploadState().catch(error => {
        console.error('Failed to clear persisted upload state', error);
      });
      return;
    }

    const timeoutId = window.setTimeout(() => {
      savePersistedUploadState(createPersistedScheduleSnapshot(currentState)).catch(error => {
        console.error('Failed to persist upload state', error);
      });
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [csvClassData, csvSchedule, pdfClassDataByLocation, pdfSchedules, persistenceReady, uploadedFiles]);

  const syncPdfSchedulesToSheet = useCallback(async (schedules: Iterable<WeekSchedule>) => {
    try {
      await syncCleanedPdfSheet(buildCleanedPdfSheetRows(schedules), {
        sheetName: CLEANED_PDF_SHEET_NAME,
      });
    } catch (error) {
      console.error('Failed to sync parsed PDF rows to Google Sheets.', error);
      toast({
        title: 'Cleaned-PDF sync failed',
        description: error instanceof Error
          ? error.message
          : 'The PDF was parsed locally, but the spreadsheet could not be updated.',
        variant: 'destructive',
      });
    }
  }, []);

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
        let schedule = await parsePDF(file);
        const location = schedule.location;

        // Parse PDF to ClassData format (reuse parsed schedule to avoid re-parsing file)
        let pdfData = await parsePDFToClassData(file, schedule);

        try {
          const pageImages = await renderPdfPagesForThemeVision(file);
          if (pageImages.length > 0) {
            const themeCandidates = collectThemeCandidates(csvClassDataRef.current);
            const themeMatches = await invokePdfThemeVision(
              pdfData,
              pageImages,
              themeCandidates
            );
            const enrichedPdfData = mergeVisionThemesIntoPdfData(pdfData, themeMatches, {
              themeCandidates,
              csvData: csvClassDataRef.current,
            });

            if (enrichedPdfData.some((row, index) => row.theme !== pdfData[index]?.theme)) {
              pdfData = enrichedPdfData;
              schedule = applyPdfDataThemesToSchedule(schedule, pdfData);
            }
          }
        } catch (themeError) {
          console.warn('Visual PDF theme enrichment skipped.', themeError);
        }

        let storagePath: string | undefined;
        let previewUrl = URL.createObjectURL(file);

        try {
          const persistedPdf = await uploadPersistedPdf(file, newFile.id);
          storagePath = persistedPdf.storagePath;
          if (persistedPdf.signedUrl && await urlLooksLikePdf(persistedPdf.signedUrl)) {
            revokePreviewUrl(previewUrl);
            previewUrl = persistedPdf.signedUrl;
          } else if (persistedPdf.signedUrl) {
            console.warn('Persisted preview URL did not return PDF content. Keeping the local blob preview instead.', persistedPdf.signedUrl);
          }
        } catch (persistError) {
          console.warn('PDF was parsed locally but could not be persisted to Supabase storage.', persistError);
        }

        setPdfPreviewUrls(prev => ({
          ...prev,
          [newFile.id]: previewUrl,
        }));
        
        // Accumulate PDF data by location
        setPdfClassDataByLocation(prev => {
          const next = new Map(prev);
          const existing = next.get(location) || [];
          next.set(location, [...existing, ...pdfData]);
          return next;
        });

        setUploadedFiles(prev => prev.map(f => f.id === newFile.id ? {
          ...f, status: 'completed' as const, data: schedule, location, storagePath
        } : f));

        const nextPdfSchedules = new Map(pdfSchedulesRef.current);
        nextPdfSchedules.set(location, schedule);

        setPdfSchedules(prev => {
          const next = new Map(prev);
          next.set(location, schedule);
          return next;
        });

        void syncPdfSchedulesToSheet(nextPdfSchedules.values());
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
      setPdfPreviewUrls(prev => {
        const next = { ...prev };
        revokePreviewUrl(next[id]);
        delete next[id];
        return next;
      });

      if (file.type === 'pdf' && file.storagePath) {
        deletePersistedPdf(file.storagePath).catch(error => {
          console.error('Failed to delete persisted PDF', error);
        });
      }

      if (file.type === 'pdf' && file.location) {
        setPdfSchedules(prev => {
          const next = new Map(prev);
          next.delete(file.location!);
          return next;
        });

        const nextPdfSchedules = new Map(pdfSchedulesRef.current);
        nextPdfSchedules.delete(file.location!);
        void syncPdfSchedulesToSheet(nextPdfSchedules.values());

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
    Object.values(pdfPreviewUrlsRef.current).forEach(url => revokePreviewUrl(url));
    setUploadedFiles([]);
    setPdfSchedules(new Map());
    setCsvSchedule(null);
    setCsvClassData(null);
    setPdfClassDataByLocation(new Map());
    setPdfPreviewUrls({});
    setActiveTab('upload');
    setSearchParams(current => updateLocationSearchParams(current, 'all'));
    void syncPdfSchedulesToSheet([]);
    clearPersistedUploadState().catch(error => {
      console.error('Failed to clear persisted upload state', error);
    });
  }, [setSearchParams, syncPdfSchedulesToSheet]);

  const handleUpdatePdfSchedule = useCallback((fileId: string, updatedSchedule: WeekSchedule) => {
    const targetFile = uploadedFiles.find(file => file.id === fileId && file.type === 'pdf');
    if (!targetFile) return;

    const previousLocation = targetFile.location || targetFile.data?.location;
    const nextLocation = updatedSchedule.location;
    const nextPdfClassData = scheduleToPdfClassData(updatedSchedule);

    setUploadedFiles(prev => prev.map(file =>
      file.id === fileId
        ? { ...file, data: updatedSchedule, location: nextLocation }
        : file
    ));

    setPdfSchedules(prev => {
      const next = new Map(prev);
      if (previousLocation) next.delete(previousLocation);
      next.set(nextLocation, updatedSchedule);
      return next;
    });

    setPdfClassDataByLocation(prev => {
      const next = new Map(prev);
      if (previousLocation) next.delete(previousLocation);
      next.set(nextLocation, nextPdfClassData);
      return next;
    });

    const nextPdfSchedules = new Map(pdfSchedulesRef.current);
    if (previousLocation) nextPdfSchedules.delete(previousLocation);
    nextPdfSchedules.set(nextLocation, updatedSchedule);
    void syncPdfSchedulesToSheet(nextPdfSchedules.values());
  }, [syncPdfSchedulesToSheet, uploadedFiles]);

  const fetchMomenceSessions = useCallback(async (startDate?: string, endDate?: string) => {
    setMomenceLoading(true);
    setMomenceError(null);
    try {
      const data = await invokeMomenceFunction(startDate, endDate);
      if (!data) throw new Error('No data received from Momence API');
      const payload = Array.isArray(data) ? data
        : Array.isArray(data.payload) ? data.payload
        : Array.isArray(data.sessions) ? data.sessions
        : [];
      setMomenceSessions(parseMomenceSessions(payload));
    } catch (err) {
      let msg = 'Failed to fetch sessions';
      if (err instanceof Error) {
        if (err.message.includes('Could not establish connection')) msg = 'Edge function not deployed. Run: ./deploy-momence.sh';
        else if (err.message.includes('404') || err.message.includes('Not Found')) msg = 'Edge function not found. Deploy with: supabase functions deploy momence-sessions';
        else if (err.message.includes('401') || err.message.includes('Unauthorized')) msg = 'Supabase blocked the edge function request (401 Unauthorized). Redeploy momence-sessions with --no-verify-jwt or invoke it with a valid Supabase user JWT.';
        else msg = err.message;
      }
      setMomenceError(msg);
    } finally {
      setMomenceLoading(false);
    }
  }, []);

  // Fetch Momence data once on page load
  useEffect(() => {
    fetchMomenceSessions();
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
              <TabsTrigger value="csv" className="gap-2 text-sm data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-sm rounded-lg transition-all" disabled={!hasCsv}>
                <FileSpreadsheet className="w-4 h-4" /> CSV
                {hasCsv && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
              </TabsTrigger>
              <TabsTrigger value="pdf" className="gap-2 text-sm data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-sm rounded-lg transition-all" disabled={!hasPdf}>
                <FileText className="w-4 h-4" /> PDF
                {hasPdf && <Badge variant="secondary" className="text-xs h-5 px-1.5 bg-red-100 text-red-700 border-red-200">{pdfSchedules.size}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="pdf-files" className="gap-2 text-sm data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-sm rounded-lg transition-all" disabled={!hasPdf}>
                <Eye className="w-4 h-4" /> Editor
                {hasPdf && <Badge variant="secondary" className="text-xs h-5 px-1.5 bg-red-100 text-red-700 border-red-200">{pdfSchedules.size}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="side-by-side" className="gap-2 text-sm data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-sm rounded-lg transition-all">
                <GitCompare className="w-4 h-4" /> Compare
              </TabsTrigger>
              <TabsTrigger value="momence" className="gap-2 text-sm data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-sm rounded-lg transition-all">
                <Globe className="w-4 h-4" /> Momence
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

          {allAvailableLocations.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 p-4 surface-card">
              <Building2 className="w-5 h-5 text-blue-600" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-700">Global location filter</p>
                <p className="text-xs text-slate-500">
                  Synced with the URL via <code className="font-mono">?location=...</code> so every tab stays in step.
                </p>
              </div>
              <Select value={sharedLocationFilter} onValueChange={handleSharedLocationChange}>
                <SelectTrigger className="w-[240px] h-10 border-blue-200 focus:border-blue-500">
                  <SelectValue placeholder="All Locations" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Locations</SelectItem>
                  {allAvailableLocations.map(location => (
                    <SelectItem key={location} value={location}>{location}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

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
                <Button size="sm" onClick={() => setActiveTab('side-by-side')} className="gap-2 ml-auto">
                  <GitCompare className="w-4 h-4" /> Open Compare
                </Button>
              )}
            </div>
          )}

          <TabsContent value="upload" className="animate-fade-in">
            <div className="surface-card gradient-border-top p-8">
              <FileUploadZone onUpload={handleUpload} uploadedFiles={uploadedFiles} onRemoveFile={handleRemoveFile} />
            </div>
          </TabsContent>

          <TabsContent value="csv" className="animate-fade-in">
            <div className="surface-card gradient-border-top p-8">
              {csvSchedule ? (
                <ScheduleViewer
                  schedule={csvSchedule}
                  title="CSV Schedule"
                  locationFilter={sharedLocationFilter}
                  defaultViewMode="list"
                  groupListByDay
                />
              ) : (
                <div className="text-center py-16 text-slate-500">Upload a CSV to view the schedule</div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="pdf" className="animate-fade-in">
            <div className="surface-card gradient-border-top p-8">
              {hasPdf ? (
                <div className="space-y-6">
                  {viewPdfSchedule && (
                    <ScheduleViewer
                      schedule={viewPdfSchedule}
                      title={`PDF Schedule — ${viewPdfSchedule.location}`}
                      locationFilter={sharedLocationFilter}
                      defaultViewMode="list"
                      groupListByDay
                    />
                  )}
                  {!viewPdfSchedule && sharedLocationFilter !== 'all' && (
                    <div className="text-center py-16 text-slate-500">
                      No PDF schedule found for `{sharedLocationFilter}`.
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-16 text-slate-500">Upload a PDF to view the schedule</div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="pdf-files" className="animate-fade-in">
            <div className="surface-card gradient-border-top p-6">
              <PdfSourceEditorTab
                pdfFiles={uploadedFiles}
                previewUrls={pdfPreviewUrls}
                onUpdateSchedule={handleUpdatePdfSchedule}
              />
            </div>
          </TabsContent>

          <TabsContent value="side-by-side" className="animate-fade-in">
            <div className="surface-card gradient-border-top p-4">
              {csvClassData && aggregatedPdfClassData ? (
                <SideBySideViewer
                  csvData={csvClassData}
                  pdfData={aggregatedPdfClassData}
                  comparison={comparison}
                  locationFilter={sharedLocationFilter}
                />
              ) : (
                <div className="text-center py-16 text-slate-500">Upload both CSV and PDF files to use the side-by-side viewer</div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="momence" className="animate-fade-in">
            <div className="surface-card gradient-border-top p-4">
              <MomenceTab
                startDate={viewPdfSchedule?.weekStart}
                endDate={viewPdfSchedule?.weekEnd}
                csvData={csvClassData}
                pdfData={aggregatedPdfClassData}
                sessions={momenceSessions}
                loading={momenceLoading}
                error={momenceError}
                locationFilter={sharedLocationFilter}
                onRefresh={() => fetchMomenceSessions(viewPdfSchedule?.weekStart, viewPdfSchedule?.weekEnd)}
              />
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Index;
