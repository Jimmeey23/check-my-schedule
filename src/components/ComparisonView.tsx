import { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import type { ComparedClass, ScheduleComparisonResult } from '@/types/schedule';
import { formatMismatchesAsWhatsApp, copyToClipboard } from '@/lib/whatsappFormatter';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Plus,
  ArrowLeftRight,
  LayoutGrid,
  List,
  Building2,
  BarChart3,
  Search,
  SlidersHorizontal,
  FilterX,
  ChevronLeft,
  ChevronRight,
  MessageCircle,
  Copy,
  Check,
} from 'lucide-react';

interface ComparisonViewProps {
  comparison: ScheduleComparisonResult;
  locationFilter?: string;
}


type CompViewMode = 'side-by-side' | 'list' | 'location' | 'issues' | 'summary';
type StatusFilter = 'all' | 'match' | 'mismatch' | 'missing' | 'extra';
type SortMode = 'day-time' | 'status-severity' | 'class-name' | 'trainer-name';
type GroupMode = 'day' | 'location';
type IssueFilter = 'all' | 'class' | 'trainer' | 'time' | 'location' | 'missing' | 'extra';
type IssueType = Exclude<IssueFilter, 'all'>;

const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const statusConfig = {
  match: {
    icon: CheckCircle2,
    label: 'Match',
    text: 'text-slate-700',
    iconText: 'text-blue-800',
    pillBorder: 'border-slate-300',
    iconBg: 'bg-slate-50',
    iconBorder: 'border-slate-300',
  },
  mismatch: {
    icon: XCircle,
    label: 'Mismatch',
    text: 'text-slate-800',
    iconText: 'text-blue-700',
    pillBorder: 'border-slate-300',
    iconBg: 'bg-blue-50',
    iconBorder: 'border-blue-200',
  },
  missing: {
    icon: AlertTriangle,
    label: 'Missing in CSV',
    text: 'text-slate-800',
    iconText: 'text-slate-500',
    pillBorder: 'border-slate-300',
    iconBg: 'bg-slate-50',
    iconBorder: 'border-slate-300',
  },
  extra: {
    icon: Plus,
    label: 'Extra in CSV',
    text: 'text-slate-800',
    iconText: 'text-slate-500',
    pillBorder: 'border-slate-300',
    iconBg: 'bg-slate-50',
    iconBorder: 'border-slate-300',
  },
};

const STATUS_SEVERITY: Record<ComparedClass['status'], number> = {
  mismatch: 0,
  missing: 1,
  extra: 2,
  match: 3,
};

const ISSUE_LABELS: Record<IssueType, string> = {
  class: 'Class',
  trainer: 'Trainer',
  time: 'Time',
  location: 'Location',
  missing: 'Missing in CSV',
  extra: 'Extra in CSV',
};

const ISSUE_PRIORITY: IssueType[] = ['class', 'trainer', 'time', 'location', 'missing', 'extra'];

interface AlignedRow {
  pdfClass: ComparedClass | null;
  csvClass: ComparedClass | null;
  status: ComparedClass['status'];
}

interface FocusTarget {
  id: string;
  status: ComparedClass['status'];
  day: string;
  time: string;
  className: string;
}

function formatTime24to12(time24: string): string {
  if (!time24 || !time24.includes(':')) return time24;
  const [h, m] = time24.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${m.toString().padStart(2, '0')} ${period}`;
}

function getDisplayName(cls: ComparedClass | null): string {
  if (!cls) return '—';
  return cls.normalizedClassName?.replace('Studio ', '') || cls.className;
}

function getRowDay(row: AlignedRow): string {
  return row.pdfClass?.day || row.csvClass?.day || '';
}

function getRowTime(row: AlignedRow): string {
  return row.pdfClass?.normalizedTime || row.csvClass?.normalizedTime || '';
}

function getRowLocation(row: AlignedRow): string {
  return row.pdfClass?.normalizedLocation || row.csvClass?.normalizedLocation || '';
}

function getRowFocusId(row: AlignedRow): string | null {
  if (row.status === 'extra') return row.csvClass?.id || null;
  return row.pdfClass?.id || row.csvClass?.id || null;
}

function classMatchesIssueFilter(cls: ComparedClass, issueFilter: IssueFilter): boolean {
  if (issueFilter === 'all') return true;
  if (issueFilter === 'missing') return cls.status === 'missing';
  if (issueFilter === 'extra') return cls.status === 'extra';
  if (cls.status !== 'mismatch') return false;

  if (issueFilter === 'class') return Boolean(cls.differences?.className);
  if (issueFilter === 'trainer') return Boolean(cls.differences?.trainer);
  if (issueFilter === 'time') return Boolean(cls.differences?.time);
  if (issueFilter === 'location') return Boolean(cls.differences?.location);

  return true;
}

function getIssueTypesForRow(row: AlignedRow): IssueType[] {
  if (row.status === 'missing') return ['missing'];
  if (row.status === 'extra') return ['extra'];

  const diffSource = row.pdfClass?.differences || row.csvClass?.differences;
  const types: IssueType[] = [];

  if (diffSource?.className) types.push('class');
  if (diffSource?.trainer) types.push('trainer');
  if (diffSource?.time) types.push('time');
  if (diffSource?.location) types.push('location');

  return types.length ? types : ['class'];
}

function getIssueChipsForClass(cls: ComparedClass): string[] {
  if (cls.status === 'missing') return ['Missing in CSV'];
  if (cls.status === 'extra') return ['Extra in CSV'];
  if (cls.status !== 'mismatch') return [];

  const chips: string[] = [];
  if (cls.differences?.className) chips.push('Class');
  if (cls.differences?.trainer) chips.push('Trainer');
  if (cls.differences?.time) chips.push('Time');
  if (cls.differences?.location) chips.push('Location');
  return chips;
}

function sortComparedClasses(classes: ComparedClass[], sortMode: SortMode): ComparedClass[] {
  return [...classes].sort((a, b) => {
    const daySort = DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day);
    const timeSort = (a.normalizedTime || '').localeCompare(b.normalizedTime || '');

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
      const nameA = getDisplayName(a).toLowerCase();
      const nameB = getDisplayName(b).toLowerCase();
      const classSort = nameA.localeCompare(nameB);
      if (classSort !== 0) return classSort;
      if (daySort !== 0) return daySort;
      return timeSort;
    }

    const trainerSort = (a.normalizedTrainer || '').toLowerCase().localeCompare((b.normalizedTrainer || '').toLowerCase());
    if (trainerSort !== 0) return trainerSort;
    if (daySort !== 0) return daySort;
    return timeSort;
  });
}

function sortAlignedRows(rows: AlignedRow[], sortMode: SortMode): AlignedRow[] {
  return [...rows].sort((a, b) => {
    const daySort = DAY_ORDER.indexOf(getRowDay(a)) - DAY_ORDER.indexOf(getRowDay(b));
    const timeSort = getRowTime(a).localeCompare(getRowTime(b));

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
      const classSort = getDisplayName(a.pdfClass || a.csvClass).toLowerCase().localeCompare(getDisplayName(b.pdfClass || b.csvClass).toLowerCase());
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

function buildAlignedRows(pdfClasses: ComparedClass[], csvClasses: ComparedClass[]): AlignedRow[] {
  const rows: AlignedRow[] = [];
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

  return sortAlignedRows(rows, 'day-time');
}

function StatCard({
  label,
  value,
  accent,
  icon: Icon,
}: {
  label: string;
  value: number;
  accent?: string;
  icon: typeof CheckCircle2;
}) {
  return (
    <div className={cn('surface-card hoverable p-3 sm:p-4 text-center border-l-4', accent || 'border-l-transparent')}>
      <Icon className="w-4 h-4 sm:w-5 sm:h-5 mx-auto mb-1 opacity-80" />
      <p className="text-xl sm:text-2xl font-bold font-display text-slate-900">{value}</p>
      <p className="text-[10px] sm:text-xs opacity-70 font-medium text-slate-600">{label}</p>
    </div>
  );
}

function ClassCell({ cls, compactMode }: { cls: ComparedClass | null; compactMode: boolean }) {
  if (!cls) {
    return (
      <div
        className={cn(
          'rounded-lg border border-dashed border-slate-300/50 bg-slate-50/60 flex items-center justify-center',
          compactMode ? 'p-2 min-h-[64px]' : 'p-3 min-h-[80px]'
        )}
      >
        <span className="text-xs text-slate-400 italic">No class</span>
      </div>
    );
  }

  const config = statusConfig[cls.status];
  const StatusIcon = config.icon;
  const displayTime = formatTime24to12(cls.normalizedTime) || cls.time;
  const issueChips = getIssueChipsForClass(cls);

  return (
    <div
      className={cn(
        'rounded-xl border shadow-soft transition-all',
        compactMode ? 'p-2.5 min-h-[64px]' : 'p-3 min-h-[80px]',
        cls.status === 'match' ? 'border-border/70 bg-white/85' : 'border-blue-200 bg-blue-50/40'
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={cn('inline-flex h-6 w-6 items-center justify-center rounded-full border', config.iconBg, config.iconBorder)}>
            <StatusIcon className={cn('w-3.5 h-3.5', config.iconText)} />
          </span>
          <span className="font-semibold text-xs text-slate-900 truncate">{displayTime}</span>
        </div>
        <Badge variant="outline" className={cn('text-[9px] h-5 px-1.5 bg-white/70 text-slate-700', config.pillBorder)}>
          {config.label}
        </Badge>
      </div>

      <p className={cn('font-medium text-xs leading-tight', cls.differences?.className ? 'text-blue-900 font-semibold' : 'text-slate-900')}>
        {getDisplayName(cls)}
      </p>
      <p className={cn('text-[11px] mt-0.5', cls.differences?.trainer ? 'text-blue-900 font-semibold' : 'text-slate-600')}>
        {cls.normalizedTrainer || cls.trainer || '—'}
      </p>
      {cls.normalizedLocation && (
        <p className={cn('text-[10px] mt-0.5', cls.differences?.location ? 'text-blue-900' : 'text-slate-500')}>
          {cls.normalizedLocation}
        </p>
      )}

      {issueChips.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {issueChips.map(chip => (
            <Badge key={chip} variant="outline" className="text-[9px] h-4 px-1.5 border-blue-200 text-blue-900 bg-blue-50">
              {chip}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

export function ComparisonView({ comparison, locationFilter: sharedLocationFilter = 'all' }: ComparisonViewProps) {
  const { toast } = useToast();
  const [viewMode, setViewMode] = useState<CompViewMode>('side-by-side');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [dayFilter, setDayFilter] = useState<string>('all');
  const [locationFilter, setLocationFilter] = useState<string>('all');
  const [issueFilter, setIssueFilter] = useState<IssueFilter>('all');
  const [sortMode, setSortMode] = useState<SortMode>('day-time');
  const [groupMode, setGroupMode] = useState<GroupMode>('day');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [focusIssuesOnly, setFocusIssuesOnly] = useState<boolean>(false);
  const [compactMode, setCompactMode] = useState<boolean>(false);
  const [activeMismatchIndex, setActiveMismatchIndex] = useState<number>(0);
  const [isCopyingWhatsApp, setIsCopyingWhatsApp] = useState(false);

  const { summary } = comparison;

  const allDays = useMemo(() => {
    const set = new Set<string>();
    comparison.pdfClasses.forEach(c => set.add(c.day));
    comparison.csvClasses.forEach(c => set.add(c.day));
    return DAY_ORDER.filter(day => set.has(day));
  }, [comparison]);

  const allLocations = useMemo(() => {
    const set = new Set<string>();
    comparison.csvClasses.forEach(c => {
      if (c.normalizedLocation && c.normalizedLocation.trim()) set.add(c.normalizedLocation);
    });
    comparison.pdfClasses.forEach(c => {
      if (c.normalizedLocation && c.normalizedLocation.trim()) set.add(c.normalizedLocation);
    });
    return Array.from(set).sort();
  }, [comparison]);

  const activeLocationFilter = sharedLocationFilter !== 'all' ? sharedLocationFilter : locationFilter;

  const { filteredPdf, filteredCsv } = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    const matchesFilters = (cls: ComparedClass) => {
      if (focusIssuesOnly && cls.status === 'match') return false;
      if (statusFilter !== 'all' && cls.status !== statusFilter) return false;
      if (dayFilter !== 'all' && cls.day !== dayFilter) return false;
      if (activeLocationFilter !== 'all' && cls.normalizedLocation !== activeLocationFilter) return false;
      if (!classMatchesIssueFilter(cls, issueFilter)) return false;

      if (query) {
        const haystack = [
          cls.day,
          cls.time,
          cls.normalizedTime,
          cls.className,
          cls.normalizedClassName,
          cls.trainer,
          cls.normalizedTrainer,
          cls.location,
          cls.normalizedLocation,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        if (!haystack.includes(query)) return false;
      }

      return true;
    };

    return {
      filteredPdf: sortComparedClasses(comparison.pdfClasses.filter(matchesFilters), sortMode),
      filteredCsv: sortComparedClasses(comparison.csvClasses.filter(matchesFilters), sortMode),
    };
  }, [activeLocationFilter, comparison, dayFilter, focusIssuesOnly, issueFilter, searchQuery, sortMode, statusFilter]);

  const alignedRows = useMemo(() => buildAlignedRows(filteredPdf, filteredCsv), [filteredPdf, filteredCsv]);
  const sortedAlignedRows = useMemo(() => sortAlignedRows(alignedRows, sortMode), [alignedRows, sortMode]);

  const inViewSummary = useMemo(() => {
    const totals = {
      totalRows: sortedAlignedRows.length,
      totalPdf: sortedAlignedRows.filter(row => row.pdfClass).length,
      totalCsv: sortedAlignedRows.filter(row => row.csvClass).length,
      matches: sortedAlignedRows.filter(row => row.status === 'match').length,
      mismatches: sortedAlignedRows.filter(row => row.status === 'mismatch').length,
      missing: sortedAlignedRows.filter(row => row.status === 'missing').length,
      extra: sortedAlignedRows.filter(row => row.status === 'extra').length,
    };
    return totals;
  }, [sortedAlignedRows]);

  const inViewMatchRate = inViewSummary.totalPdf > 0
    ? Math.round((inViewSummary.matches / inViewSummary.totalPdf) * 100)
    : 0;

  const visibleLocations = useMemo(() => {
    const set = new Set<string>();
    sortedAlignedRows.forEach(row => {
      const loc = getRowLocation(row);
      if (loc) set.add(loc);
    });
    return Array.from(set).sort();
  }, [sortedAlignedRows]);

  const focusTargets = useMemo<FocusTarget[]>(() => {
    const targets: FocusTarget[] = [];

    for (const row of sortedAlignedRows) {
      if (row.status === 'match') continue;
      const focusId = getRowFocusId(row);
      const source = row.status === 'extra' ? row.csvClass : row.pdfClass;
      if (!focusId || !source) continue;

      targets.push({
        id: focusId,
        status: row.status,
        day: source.day,
        time: formatTime24to12(source.normalizedTime || source.time),
        className: getDisplayName(source),
      });
    }

    return targets;
  }, [sortedAlignedRows]);

  useEffect(() => {
    if (activeMismatchIndex >= focusTargets.length) {
      setActiveMismatchIndex(0);
    }
  }, [activeMismatchIndex, focusTargets.length]);

  const activeFocusId = focusTargets.length > 0 ? focusTargets[activeMismatchIndex].id : null;

  const scrollToMismatch = (targetIndex: number) => {
    if (focusTargets.length === 0) return;
    const next = (targetIndex + focusTargets.length) % focusTargets.length;
    setActiveMismatchIndex(next);

    requestAnimationFrame(() => {
      const nextId = focusTargets[next].id.replace(/"/g, '\\"');
      const row = document.querySelector<HTMLElement>(`[data-focus-id="${nextId}"]`);
      row?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  };

  const resetFilters = () => {
    setStatusFilter('all');
    setDayFilter('all');
    setLocationFilter('all');
    setIssueFilter('all');
    setSortMode('day-time');
    setGroupMode('day');
    setSearchQuery('');
    setFocusIssuesOnly(false);
    setCompactMode(false);
    setActiveMismatchIndex(0);
  };

  const handleCopyWhatsAppMessage = async () => {
    setIsCopyingWhatsApp(true);
    try {
      const studioName = activeLocationFilter && activeLocationFilter !== 'all' ? activeLocationFilter : 'the studio';
      const message = formatMismatchesAsWhatsApp(comparison, activeLocationFilter !== 'all' ? activeLocationFilter : null, studioName);
      await copyToClipboard(message);
      
      toast({
        title: 'Copied!',
        description: 'WhatsApp message copied to clipboard. You can now paste it in WhatsApp.',
        duration: 3000,
      });
    } catch (error) {
      console.error('Failed to copy WhatsApp message:', error);
      toast({
        title: 'Error',
        description: 'Failed to copy message to clipboard. Please try again.',
        variant: 'destructive',
        duration: 3000,
      });
    } finally {
      setIsCopyingWhatsApp(false);
    }
  };


  const viewModes: { id: CompViewMode; label: string; icon: typeof LayoutGrid }[] = [
    { id: 'side-by-side', label: 'Side by Side', icon: LayoutGrid },
    { id: 'list', label: 'Flat List', icon: List },
    { id: 'location', label: 'By Location', icon: Building2 },
    { id: 'issues', label: 'Issue Board', icon: AlertTriangle },
    { id: 'summary', label: 'Summary', icon: BarChart3 },
  ];

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2 sm:gap-3">
        <StatCard label="PDF Classes" value={summary.totalPdf} icon={BarChart3} />
        <StatCard label="CSV Classes" value={summary.totalCsv} icon={BarChart3} />
        <StatCard label="Matches" value={summary.matches} accent="border-l-blue-900/80" icon={CheckCircle2} />
        <StatCard label="Mismatches" value={summary.mismatches} accent="border-l-slate-500/80" icon={XCircle} />
        <StatCard label="Missing" value={summary.missingInCsv} accent="border-l-slate-400/80" icon={AlertTriangle} />
        <StatCard label="Extra" value={summary.extraInCsv} accent="border-l-blue-700/80" icon={Plus} />
      </div>

      <div className="surface-card p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ArrowLeftRight className="w-4 h-4 text-primary" />
            <span className="font-medium text-sm text-foreground">Filtered Match Rate</span>
            <Badge variant="outline" className="text-[10px] bg-white/70">
              {inViewSummary.totalRows} rows in view
            </Badge>
          </div>
          <span className="text-xl font-bold font-display text-slate-900">{inViewMatchRate}%</span>
        </div>
        <div className="h-2.5 bg-slate-200/70 rounded-full overflow-hidden">
          <div className="h-full transition-all duration-700 rounded-full gradient-primary" style={{ width: `${inViewMatchRate}%` }} />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-slate-600">
          <span className="rounded-md bg-slate-100/80 px-2 py-1">Matches: {inViewSummary.matches}</span>
          <span className="rounded-md bg-amber-50/80 px-2 py-1">Mismatches: {inViewSummary.mismatches}</span>
          <span className="rounded-md bg-amber-50/80 px-2 py-1">Missing: {inViewSummary.missing}</span>
          <span className="rounded-md bg-amber-50/80 px-2 py-1">Extra: {inViewSummary.extra}</span>
        </div>
      </div>

      <div className="surface-card p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-primary" />
            <span className="font-medium text-sm">Comparison Controls</span>
          </div>
          <Button size="sm" variant="ghost" className="h-8 px-2.5 text-xs" onClick={resetFilters}>
            <FilterX className="w-3.5 h-3.5" />
            Reset
          </Button>
        </div>

        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <Input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search class, trainer, time, location"
              className="pl-9 h-10 text-xs"
            />
          </div>

          <Select value={statusFilter} onValueChange={v => setStatusFilter(v as StatusFilter)}>
            <SelectTrigger className="h-10 text-xs bg-white/70 backdrop-blur-sm border-border/70 shadow-soft">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="match">Match</SelectItem>
              <SelectItem value="mismatch">Mismatch</SelectItem>
              <SelectItem value="missing">Missing in CSV</SelectItem>
              <SelectItem value="extra">Extra in CSV</SelectItem>
            </SelectContent>
          </Select>

          <Select value={issueFilter} onValueChange={v => setIssueFilter(v as IssueFilter)}>
            <SelectTrigger className="h-10 text-xs bg-white/70 backdrop-blur-sm border-border/70 shadow-soft">
              <SelectValue placeholder="Issue Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Issue Types</SelectItem>
              <SelectItem value="class">Class Issues</SelectItem>
              <SelectItem value="trainer">Trainer Issues</SelectItem>
              <SelectItem value="time">Time Issues</SelectItem>
              <SelectItem value="location">Location Issues</SelectItem>
              <SelectItem value="missing">Missing in CSV</SelectItem>
              <SelectItem value="extra">Extra in CSV</SelectItem>
            </SelectContent>
          </Select>

          <Select value={dayFilter} onValueChange={setDayFilter}>
            <SelectTrigger className="h-10 text-xs bg-white/70 backdrop-blur-sm border-border/70 shadow-soft">
              <SelectValue placeholder="Day" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Days</SelectItem>
              {allDays.map(day => (
                <SelectItem key={day} value={day}>
                  {day}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={activeLocationFilter} onValueChange={setLocationFilter} disabled={sharedLocationFilter !== 'all'}>
            <SelectTrigger className="h-10 text-xs bg-white/70 backdrop-blur-sm border-border/70 shadow-soft">
              <SelectValue placeholder="Location" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Locations</SelectItem>
              {allLocations.map(location => (
                <SelectItem key={location} value={location}>
                  {location}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={sortMode} onValueChange={v => setSortMode(v as SortMode)}>
            <SelectTrigger className="h-10 text-xs bg-white/70 backdrop-blur-sm border-border/70 shadow-soft">
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day-time">Sort: Day + Time</SelectItem>
              <SelectItem value="status-severity">Sort: Issue Severity</SelectItem>
              <SelectItem value="class-name">Sort: Class Name</SelectItem>
              <SelectItem value="trainer-name">Sort: Trainer Name</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap gap-2 items-center justify-between">
          <div className="flex gap-1 p-1 surface-muted rounded-xl shadow-soft">
            {viewModes.map(mode => (
              <button
                key={mode.id}
                onClick={() => setViewMode(mode.id)}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all',
                  viewMode === mode.id ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <mode.icon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{mode.label}</span>
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 rounded-lg border border-border/70 bg-white/70 px-2.5 py-1.5 text-xs">
              <Switch checked={focusIssuesOnly} onCheckedChange={setFocusIssuesOnly} />
              Issues only
            </label>
            <label className="flex items-center gap-2 rounded-lg border border-border/70 bg-white/70 px-2.5 py-1.5 text-xs">
              <Switch checked={compactMode} onCheckedChange={setCompactMode} />
              Compact rows
            </label>
            <Select value={groupMode} onValueChange={v => setGroupMode(v as GroupMode)}>
              <SelectTrigger className="w-[150px] h-9 text-xs bg-white/70 backdrop-blur-sm border-border/70 shadow-soft">
                <SelectValue placeholder="Grouping" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="day">Group: Day</SelectItem>
                <SelectItem value="location">Group: Location</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="surface-card p-3 border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">Mismatch Navigator</p>
            <p className="text-xs text-slate-600">
              {focusTargets.length} highlighted issue{focusTargets.length === 1 ? '' : 's'} in current view
            </p>
            {focusTargets.length > 0 && (
              <p className="text-xs text-blue-900 mt-0.5">
                {focusTargets[activeMismatchIndex]?.day} • {focusTargets[activeMismatchIndex]?.time} • {focusTargets[activeMismatchIndex]?.className}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              onClick={handleCopyWhatsAppMessage}
              disabled={summary.mismatches === 0 || isCopyingWhatsApp}
              className="h-8 px-3 bg-blue-900 hover:bg-blue-800 text-white gap-1.5"
            >
              <MessageCircle className="w-4 h-4" />
              <span className="hidden sm:inline">Copy WhatsApp</span>
              <span className="sm:hidden text-[10px]">WhatsApp</span>
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => scrollToMismatch(activeMismatchIndex - 1)}
              disabled={focusTargets.length === 0}
              className="h-8 px-2.5"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <div className="text-xs font-semibold text-slate-700 min-w-[56px] text-center">
              {focusTargets.length > 0 ? `${activeMismatchIndex + 1}/${focusTargets.length}` : '0/0'}
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => scrollToMismatch(activeMismatchIndex + 1)}
              disabled={focusTargets.length === 0}
              className="h-8 px-2.5"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      <ScrollArea className="h-[620px]">
        <div className="pr-4">
          {viewMode === 'side-by-side' && (
            <SideBySideView rows={alignedRows} groupMode={groupMode} compactMode={compactMode} activeFocusId={activeFocusId} />
          )}
          {viewMode === 'list' && (
            <FlatListView rows={sortedAlignedRows} compactMode={compactMode} activeFocusId={activeFocusId} />
          )}
          {viewMode === 'location' && (
            <LocationCompView
              rows={alignedRows}
              locations={visibleLocations}
              compactMode={compactMode}
              activeFocusId={activeFocusId}
            />
          )}
          {viewMode === 'issues' && (
            <IssueBoardView rows={sortedAlignedRows} issueFilter={issueFilter} compactMode={compactMode} activeFocusId={activeFocusId} />
          )}
          {viewMode === 'summary' && <SummaryView comparison={comparison} />}
        </div>
      </ScrollArea>
    </div>
  );
}

function SideBySideView({
  rows,
  groupMode,
  compactMode,
  activeFocusId,
}: {
  rows: AlignedRow[];
  groupMode: GroupMode;
  compactMode: boolean;
  activeFocusId: string | null;
}) {
  const groupedRows = useMemo(() => {
    const map = new Map<string, AlignedRow[]>();

    for (const row of rows) {
      const key = groupMode === 'location'
        ? getRowLocation(row) || 'Unspecified Location'
        : getRowDay(row) || 'Unknown Day';

      const bucket = map.get(key) || [];
      bucket.push(row);
      map.set(key, bucket);
    }

    const entries = Array.from(map.entries());

    if (groupMode === 'day') {
      entries.sort((a, b) => DAY_ORDER.indexOf(a[0]) - DAY_ORDER.indexOf(b[0]));
    } else {
      entries.sort((a, b) => a[0].localeCompare(b[0]));
    }

    return entries.map(([label, grouped]) => ({
      label,
      rows: sortAlignedRows(grouped, 'day-time'),
    }));
  }, [groupMode, rows]);

  if (groupedRows.length === 0) {
    return <EmptyState label="No classes found for selected filters" />;
  }

  return (
    <div className="space-y-4">
      {groupedRows.map(group => {
        const pdfCount = group.rows.filter(row => row.pdfClass).length;
        const csvCount = group.rows.filter(row => row.csvClass).length;
        const matchCount = group.rows.filter(row => row.status === 'match').length;

        return (
          <div key={group.label} className="surface-card p-0 overflow-hidden">
            <div className="gradient-header-dark text-white px-4 py-2.5 flex items-center justify-between">
              <h4 className="font-display font-semibold text-sm tracking-wide">{group.label}</h4>
              <div className="flex items-center gap-3 text-xs opacity-90">
                <span>PDF: {pdfCount}</span>
                <span>CSV: {csvCount}</span>
                <Badge className="bg-white/10 text-white border-white/20 text-[10px]">
                  {matchCount}/{Math.max(pdfCount, csvCount)} match
                </Badge>
              </div>
            </div>

            <div className="grid grid-cols-2 divide-x bg-secondary/40">
              <div className="px-3 py-1.5">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">PDF Schedule</p>
              </div>
              <div className="px-3 py-1.5">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">CSV Schedule</p>
              </div>
            </div>

            <div className="divide-y divide-border/50">
              {group.rows.map((row, idx) => {
                const focusId = getRowFocusId(row);
                const isIssue = row.status !== 'match';
                const isActive = Boolean(activeFocusId && focusId && activeFocusId === focusId);

                return (
                  <div
                    key={`${group.label}-${idx}`}
                    data-focus-id={focusId || undefined}
                    className={cn(
                      'grid grid-cols-2 divide-x divide-border/50 transition-colors',
                      isIssue ? 'border-l-4 border-l-blue-700 bg-blue-50/35 hover:bg-blue-50/50' : 'bg-white/40 hover:bg-white/60',
                      isActive && 'ring-2 ring-blue-300 ring-inset'
                    )}
                  >
                    <div className={cn('p-2', compactMode && 'py-1.5')}>
                      <ClassCell cls={row.pdfClass} compactMode={compactMode} />
                    </div>
                    <div className={cn('p-2', compactMode && 'py-1.5')}>
                      <ClassCell cls={row.csvClass} compactMode={compactMode} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function FlatListView({ rows, compactMode, activeFocusId }: { rows: AlignedRow[]; compactMode: boolean; activeFocusId: string | null }) {
  if (rows.length === 0) {
    return <EmptyState label="No classes found for selected filters" />;
  }

  return (
    <div className="surface-card p-0 overflow-hidden">
      <table className={cn('table-premium text-sm', compactMode && 'table-compact')}>
        <thead>
          <tr className="border-b bg-secondary/50 text-left text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">
            <th className="sticky top-0 z-10 bg-white p-2.5">Status</th>
            <th className="sticky top-0 z-10 bg-white p-2.5">Day</th>
            <th className="sticky top-0 z-10 bg-white p-2.5">Time</th>
            <th className="sticky top-0 z-10 bg-white p-2.5">Location</th>
            <th className="sticky top-0 z-10 bg-white p-2.5">PDF Class</th>
            <th className="sticky top-0 z-10 bg-white p-2.5">CSV Class</th>
            <th className="sticky top-0 z-10 bg-white p-2.5">PDF Trainer</th>
            <th className="sticky top-0 z-10 bg-white p-2.5">CSV Trainer</th>
            <th className="sticky top-0 z-10 bg-white p-2.5">Issues</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
            const cfg = statusConfig[row.status];
            const Icon = cfg.icon;
            const focusId = getRowFocusId(row);
            const isIssue = row.status !== 'match';
            const isActive = Boolean(activeFocusId && focusId && activeFocusId === focusId);
            const issueLabels = row.status === 'match'
              ? ['—']
              : getIssueTypesForRow(row).map(issue => ISSUE_LABELS[issue]);

            return (
              <tr
                key={`${focusId || 'row'}-${idx}`}
                data-focus-id={focusId || undefined}
                className={cn(
                  'border-b transition-colors',
                  isIssue ? 'border-l-4 border-l-blue-700 bg-blue-50/25 hover:bg-blue-50/40' : 'hover:bg-secondary/20',
                  isActive && 'ring-2 ring-blue-300 ring-inset'
                )}
              >
                <td className="p-2.5">
                  <div className="flex items-center gap-1">
                    <span className={cn('inline-flex h-6 w-6 items-center justify-center rounded-full border', cfg.iconBg, cfg.iconBorder)}>
                      <Icon className={cn('w-3.5 h-3.5', cfg.iconText)} />
                    </span>
                    <span className={cn('text-xs font-medium', cfg.text)}>{cfg.label}</span>
                  </div>
                </td>
                <td className="p-2.5 text-xs">{getRowDay(row)}</td>
                <td className="p-2.5 font-medium text-xs">{formatTime24to12(getRowTime(row)) || '—'}</td>
                <td className="p-2.5 text-xs text-slate-600">{getRowLocation(row) || '—'}</td>
                <td className={cn('p-2.5 text-xs font-medium', row.pdfClass?.differences?.className && 'text-amber-900')}>
                  {getDisplayName(row.pdfClass)}
                </td>
                <td className={cn('p-2.5 text-xs font-medium', row.csvClass?.differences?.className && 'text-amber-900')}>
                  {getDisplayName(row.csvClass)}
                </td>
                <td className={cn('p-2.5 text-xs', row.pdfClass?.differences?.trainer && 'text-amber-900 font-semibold')}>
                  {row.pdfClass?.normalizedTrainer || row.pdfClass?.trainer || '—'}
                </td>
                <td className={cn('p-2.5 text-xs', row.csvClass?.differences?.trainer && 'text-amber-900 font-semibold')}>
                  {row.csvClass?.normalizedTrainer || row.csvClass?.trainer || '—'}
                </td>
                <td className="p-2.5 text-xs">
                  <div className="flex flex-wrap gap-1">
                    {issueLabels.map(label => (
                      <Badge
                        key={label}
                        variant="outline"
                        className={cn(
                          'text-[10px] h-5 px-1.5',
                          label === '—' ? 'border-slate-200 text-slate-500' : 'border-amber-300 text-amber-900 bg-amber-100/40'
                        )}
                      >
                        {label}
                      </Badge>
                    ))}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function LocationCompView({
  rows,
  locations,
  compactMode,
  activeFocusId,
}: {
  rows: AlignedRow[];
  locations: string[];
  compactMode: boolean;
  activeFocusId: string | null;
}) {
  if (locations.length === 0) {
    return <EmptyState label="No location data available for selected filters" />;
  }

  return (
    <div className="space-y-6">
      {locations.map(location => {
        const locationRows = rows.filter(row => getRowLocation(row) === location);
        const sortedRows = sortAlignedRows(locationRows, 'day-time');
        const matches = sortedRows.filter(row => row.status === 'match').length;
        const rate = sortedRows.length > 0 ? Math.round((matches / sortedRows.length) * 100) : 0;

        return (
          <div key={location} className="surface-card p-0 overflow-hidden">
            <div className="surface-muted px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-primary" />
                <h4 className="font-display font-semibold text-sm">{location}</h4>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="text-muted-foreground">Rows: {sortedRows.length}</span>
                <Badge variant="outline" className="text-[10px] bg-white/70">
                  {rate}% match
                </Badge>
              </div>
            </div>

            <div className="grid grid-cols-2 divide-x bg-secondary/30">
              <div className="px-3 py-1.5">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">PDF</p>
              </div>
              <div className="px-3 py-1.5">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">CSV</p>
              </div>
            </div>

            <div className="divide-y divide-border/50">
              {sortedRows.map((row, idx) => {
                const focusId = getRowFocusId(row);
                const isIssue = row.status !== 'match';
                const isActive = Boolean(activeFocusId && focusId && activeFocusId === focusId);

                return (
                  <div
                    key={`${location}-${idx}`}
                    data-focus-id={focusId || undefined}
                    className={cn(
                      'grid grid-cols-2 divide-x divide-border/50 transition-colors',
                      isIssue ? 'border-l-4 border-l-amber-500 bg-amber-50/35 hover:bg-amber-50/50' : 'bg-white/40 hover:bg-white/60',
                      isActive && 'ring-2 ring-blue-300 ring-inset'
                    )}
                  >
                    <div className={cn('p-2', compactMode && 'py-1.5')}>
                      <ClassCell cls={row.pdfClass} compactMode={compactMode} />
                    </div>
                    <div className={cn('p-2', compactMode && 'py-1.5')}>
                      <ClassCell cls={row.csvClass} compactMode={compactMode} />
                    </div>
                  </div>
                );
              })}
              {sortedRows.length === 0 && <p className="text-center py-6 text-xs text-muted-foreground">No classes for this location</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function IssueBoardView({
  rows,
  issueFilter,
  compactMode,
  activeFocusId,
}: {
  rows: AlignedRow[];
  issueFilter: IssueFilter;
  compactMode: boolean;
  activeFocusId: string | null;
}) {
  const grouped = useMemo(() => {
    const map = new Map<IssueType, AlignedRow[]>();

    if (issueFilter === 'all') {
      for (const row of rows) {
        if (row.status === 'match') continue;
        const types = getIssueTypesForRow(row);
        const primary = ISSUE_PRIORITY.find(type => types.includes(type)) || 'class';
        const bucket = map.get(primary) || [];
        bucket.push(row);
        map.set(primary, bucket);
      }
      return map;
    }

    if (issueFilter === 'missing' || issueFilter === 'extra') {
      const selected = issueFilter as IssueType;
      const filtered = rows.filter(row => getIssueTypesForRow(row).includes(selected));
      if (filtered.length) map.set(selected, filtered);
      return map;
    }

    const selected = issueFilter as IssueType;
    const filtered = rows.filter(row => getIssueTypesForRow(row).includes(selected));
    if (filtered.length) map.set(selected, filtered);
    return map;
  }, [issueFilter, rows]);

  const entries = useMemo(
    () => ISSUE_PRIORITY.filter(type => grouped.has(type)).map(type => ({ type, rows: grouped.get(type) || [] })),
    [grouped]
  );

  if (entries.length === 0) {
    return <EmptyState label="No issue rows found for selected filters" />;
  }

  return (
    <div className="space-y-4">
      {entries.map(section => (
        <div key={section.type} className="surface-card p-0 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b bg-secondary/40">
            <p className="text-sm font-semibold text-slate-900">{ISSUE_LABELS[section.type]} Issues</p>
            <Badge variant="outline" className="text-[10px] bg-white/70 border-amber-300 text-amber-900">
              {section.rows.length}
            </Badge>
          </div>

          <div className="divide-y divide-border/50">
            {section.rows.map((row, idx) => {
              const focusId = getRowFocusId(row);
              const isActive = Boolean(activeFocusId && focusId && activeFocusId === focusId);

              return (
                <div
                  key={`${section.type}-${idx}`}
                  data-focus-id={focusId || undefined}
                  className={cn('p-3 border-l-4 border-l-blue-700 bg-blue-50/25', isActive && 'ring-2 ring-blue-300 ring-inset')}
                >
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 mb-2">
                    <Badge variant="outline" className="text-[10px] h-5 px-1.5 bg-white/70">
                      {getRowDay(row)}
                    </Badge>
                    <Badge variant="outline" className="text-[10px] h-5 px-1.5 bg-white/70">
                      {formatTime24to12(getRowTime(row)) || '—'}
                    </Badge>
                    <span className="text-[11px]">{getRowLocation(row) || 'No location'}</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <ClassCell cls={row.pdfClass} compactMode={compactMode} />
                    <ClassCell cls={row.csvClass} compactMode={compactMode} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function SummaryView({ comparison }: { comparison: ScheduleComparisonResult }) {
  const dayStats = useMemo(() => {
    return DAY_ORDER
      .map(day => {
        const pdf = comparison.pdfClasses.filter(c => c.day === day);
        const csv = comparison.csvClasses.filter(c => c.day === day);
        const matches = pdf.filter(c => c.status === 'match').length;
        const mismatches = pdf.filter(c => c.status === 'mismatch').length;
        return { day, pdf: pdf.length, csv: csv.length, matches, mismatches };
      })
      .filter(day => day.pdf > 0 || day.csv > 0);
  }, [comparison]);

  const classBreakdown = useMemo(() => {
    const map = new Map<string, { matches: number; mismatches: number; missing: number }>();

    for (const cls of comparison.pdfClasses) {
      const name = getDisplayName(cls);
      if (!map.has(name)) map.set(name, { matches: 0, mismatches: 0, missing: 0 });
      const entry = map.get(name)!;
      if (cls.status === 'match') entry.matches += 1;
      if (cls.status === 'mismatch') entry.mismatches += 1;
      if (cls.status === 'missing') entry.missing += 1;
    }

    return Array.from(map.entries()).sort((a, b) => {
      const totalA = a[1].matches + a[1].mismatches + a[1].missing;
      const totalB = b[1].matches + b[1].mismatches + b[1].missing;
      return totalB - totalA;
    });
  }, [comparison]);

  return (
    <div className="space-y-6">
      <div>
        <h4 className="font-display font-semibold mb-3 text-sm">Day-by-Day Breakdown</h4>
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-secondary/50 text-left text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">
                <th className="sticky top-0 z-10 bg-white p-2.5">Day</th>
                <th className="sticky top-0 z-10 bg-white p-2.5 text-center">PDF</th>
                <th className="sticky top-0 z-10 bg-white p-2.5 text-center">CSV</th>
                <th className="sticky top-0 z-10 bg-white p-2.5 text-center">Matches</th>
                <th className="sticky top-0 z-10 bg-white p-2.5 text-center">Mismatches</th>
                <th className="sticky top-0 z-10 bg-white p-2.5 text-center">Rate</th>
              </tr>
            </thead>
            <tbody>
              {dayStats.map(day => {
                const rate = day.pdf > 0 ? Math.round((day.matches / day.pdf) * 100) : 0;
                return (
                  <tr key={day.day} className="border-b hover:bg-secondary/30 transition-colors">
                    <td className="p-2.5 font-medium text-xs">{day.day}</td>
                    <td className="p-2.5 text-center text-xs">{day.pdf}</td>
                    <td className="p-2.5 text-center text-xs">{day.csv}</td>
                    <td className="p-2.5 text-center text-emerald-700 font-semibold text-xs">{day.matches}</td>
                    <td className="p-2.5 text-center text-amber-900 font-semibold text-xs">{day.mismatches}</td>
                    <td className="p-2.5 text-center">
                      <Badge
                        className={cn(
                          'border-0 text-[10px]',
                          rate >= 90 ? 'bg-emerald-100 text-emerald-700' : rate >= 70 ? 'bg-amber-100 text-amber-800' : 'bg-amber-200/80 text-amber-900'
                        )}
                      >
                        {rate}%
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h4 className="font-display font-semibold mb-3 text-sm">Class Type Breakdown</h4>
        <div className="grid gap-2">
          {classBreakdown.map(([name, stats]) => (
            <div
              key={name}
              className="flex items-center gap-3 p-2.5 rounded-xl border border-border/70 bg-white/70 backdrop-blur-sm shadow-soft hover:shadow-card transition-all"
            >
              <span className="font-medium text-xs flex-1">{name}</span>
              <div className="flex gap-1.5 text-xs">
                {stats.matches > 0 && (
                  <Badge variant="outline" className="text-[10px] bg-white/70 border-blue-200 text-blue-800">
                    {stats.matches} <CheckCircle2 className="w-3 h-3 ml-1" />
                  </Badge>
                )}
                {stats.mismatches > 0 && (
                  <Badge variant="outline" className="text-[10px] bg-white/70 border-slate-300 text-slate-800">
                    {stats.mismatches} <XCircle className="w-3 h-3 ml-1" />
                  </Badge>
                )}
                {stats.missing > 0 && (
                  <Badge variant="outline" className="text-[10px] bg-white/70 border-slate-300 text-slate-700">
                    {stats.missing} <AlertTriangle className="w-3 h-3 ml-1" />
                  </Badge>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="surface-card p-6 text-center">
      <p className="text-sm text-slate-600">{label}</p>
    </div>
  );
}
