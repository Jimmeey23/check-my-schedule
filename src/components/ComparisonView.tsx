import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { ComparedClass, ComparisonResult } from '@/types/schedule';
import {
  CheckCircle2, XCircle, AlertTriangle, Plus, ArrowLeftRight,
  LayoutGrid, List, Building2, BarChart3
} from 'lucide-react';

interface ComparisonViewProps {
  comparison: ComparisonResult;
}

type CompViewMode = 'side-by-side' | 'list' | 'location' | 'summary';
type StatusFilter = 'all' | 'match' | 'mismatch' | 'missing' | 'extra';

const statusConfig = {
  match: {
    icon: CheckCircle2,
    label: 'Match',
    text: 'text-slate-800',
    iconText: 'text-[#0353A4]',
    pillBorder: 'border-slate-200',
  },
  mismatch: {
    icon: XCircle,
    label: 'Mismatch',
    text: 'text-slate-900',
    iconText: 'text-[#0353A4]',
    pillBorder: 'border-slate-200',
  },
  missing: {
    icon: AlertTriangle,
    label: 'Missing in CSV',
    text: 'text-slate-800',
    iconText: 'text-[#0353A4]',
    pillBorder: 'border-slate-200',
  },
  extra: {
    icon: Plus,
    label: 'Extra in CSV',
    text: 'text-slate-800',
    iconText: 'text-[#0353A4]',
    pillBorder: 'border-slate-200',
  },
};

function StatusChip({ status }: { status: ComparedClass['status'] }) {
  const cfg = statusConfig[status];
  const Icon = cfg.icon;
  return (
    <div className="inline-flex items-center gap-1.5">
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-900/5 border border-slate-200">
        <Icon className={cn("w-3.5 h-3.5", cfg.iconText)} />
      </span>
      <span className={cn("text-xs font-medium", cfg.text)}>{cfg.label}</span>
    </div>
  );
}

function formatTime24to12(time24: string): string {
  if (!time24 || !time24.includes(':')) return time24;
  const [h, m] = time24.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${m.toString().padStart(2, '0')} ${period}`;
}

function StatCard({ label, value, color, icon: Icon }: { label: string; value: number; color: string; icon: typeof CheckCircle2 }) {
  return (
    <div className={cn("surface-card hoverable p-3 sm:p-4 text-center", color)}>
      <Icon className="w-4 h-4 sm:w-5 sm:h-5 mx-auto mb-1 opacity-80" />
      <p className="text-xl sm:text-2xl font-bold font-display text-slate-900">{value}</p>
      <p className="text-[10px] sm:text-xs opacity-70 font-medium text-slate-600">{label}</p>
    </div>
  );
}

/** Aligned row for side-by-side view */
interface AlignedRow {
  pdfClass: ComparedClass | null;
  csvClass: ComparedClass | null;
  status: ComparedClass['status'];
}

function buildAlignedRows(
  pdfClasses: ComparedClass[],
  csvClasses: ComparedClass[]
): AlignedRow[] {
  const rows: AlignedRow[] = [];
  const usedCsvIds = new Set<string>();

  // First pass: matched & mismatched PDF classes (they have matchedWith)
  for (const pdfCls of pdfClasses) {
    if (pdfCls.status === 'match' || pdfCls.status === 'mismatch') {
      const csvMatch = csvClasses.find(c => c.id === pdfCls.matchedWith?.id);
      if (csvMatch) {
        usedCsvIds.add(csvMatch.id);
        rows.push({ pdfClass: pdfCls, csvClass: csvMatch, status: pdfCls.status });
      } else {
        rows.push({ pdfClass: pdfCls, csvClass: null, status: pdfCls.status });
      }
    } else if (pdfCls.status === 'missing') {
      rows.push({ pdfClass: pdfCls, csvClass: null, status: 'missing' });
    }
  }

  // Second pass: extra CSV classes (not matched to any PDF)
  for (const csvCls of csvClasses) {
    if (!usedCsvIds.has(csvCls.id) && csvCls.status === 'extra') {
      rows.push({ pdfClass: null, csvClass: csvCls, status: 'extra' });
    }
  }

  // Sort by day order, then time
  const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  rows.sort((a, b) => {
    const dayA = a.pdfClass?.day || a.csvClass?.day || '';
    const dayB = b.pdfClass?.day || b.csvClass?.day || '';
    const dayDiff = dayOrder.indexOf(dayA) - dayOrder.indexOf(dayB);
    if (dayDiff !== 0) return dayDiff;
    const timeA = a.pdfClass?.normalizedTime || a.csvClass?.normalizedTime || '';
    const timeB = b.pdfClass?.normalizedTime || b.csvClass?.normalizedTime || '';
    return timeA.localeCompare(timeB);
  });

  return rows;
}

function ClassCell({ cls, side, isEmpty }: { cls: ComparedClass | null; side: 'pdf' | 'csv'; isEmpty?: boolean }) {
  if (!cls || isEmpty) {
    return (
      <div className="p-3 rounded-lg border border-dashed border-slate-300/30 bg-slate-50/30 flex items-center justify-center min-h-[72px]">
        <span className="text-xs text-slate-400/50 italic">—</span>
      </div>
    );
  }

  const config = statusConfig[cls.status];
  const StatusIcon = config.icon;
  const displayName = cls.normalizedClassName?.replace('Studio ', '') || cls.className;
  const displayTime = formatTime24to12(cls.normalizedTime) || cls.time;

  return (
    <div className={cn(
      "p-3 rounded-xl border border-border/70 bg-white/70 backdrop-blur-sm shadow-soft transition-all min-h-[72px]",
      "hover:shadow-card",
    )}>
      <div className="flex items-start justify-between gap-1 mb-1">
        <div className="flex items-center gap-1.5">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-900/5 border border-slate-200">
            <StatusIcon className={cn("w-3.5 h-3.5 flex-shrink-0", config.iconText)} />
          </span>
          <span className="font-semibold text-sm text-slate-900">{displayTime}</span>
        </div>
        <Badge
          variant="outline"
          className={cn(
            "text-[9px] h-5 px-2 flex-shrink-0 bg-white/70 text-slate-700",
            config.pillBorder,
          )}
        >
          {config.label}
        </Badge>
      </div>
      <p className={cn("font-medium text-xs leading-tight", cls.differences?.className ? "text-red-600 font-bold" : "text-slate-900")}>
        {displayName}
      </p>
      <p className={cn("text-[11px] mt-0.5", cls.differences?.trainer ? "text-red-600 font-semibold" : "text-slate-600")}>
        {cls.normalizedTrainer || cls.trainer}
      </p>
      {cls.normalizedLocation && (
        <p className={cn("text-[10px] mt-0.5", cls.differences?.location ? "text-red-600" : "text-slate-500/70")}>
          📍 {cls.normalizedLocation}
        </p>
      )}
    </div>
  );
}

export function ComparisonView({ comparison }: ComparisonViewProps) {
  const [viewMode, setViewMode] = useState<CompViewMode>('side-by-side');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [dayFilter, setDayFilter] = useState<string>('all');
  const [locationFilter, setLocationFilter] = useState<string>('all');

  const { summary } = comparison;

  const days = useMemo(() => {
    const set = new Set<string>();
    comparison.pdfClasses.forEach(c => set.add(c.day));
    comparison.csvClasses.forEach(c => set.add(c.day));
    return ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].filter(d => set.has(d));
  }, [comparison]);

  const locations = useMemo(() => {
    const set = new Set<string>();
    comparison.csvClasses.forEach(c => { if (c.normalizedLocation && c.normalizedLocation.trim()) set.add(c.normalizedLocation); });
    comparison.pdfClasses.forEach(c => { if (c.normalizedLocation && c.normalizedLocation.trim()) set.add(c.normalizedLocation); });
    return Array.from(set).sort();
  }, [comparison]);

  const filterClass = (cls: ComparedClass) => {
    if (statusFilter !== 'all' && cls.status !== statusFilter) return false;
    if (dayFilter !== 'all' && cls.day !== dayFilter) return false;
    if (locationFilter !== 'all' && cls.normalizedLocation !== locationFilter) return false;
    return true;
  };

  const filteredPdf = useMemo(() => comparison.pdfClasses.filter(filterClass), [comparison, statusFilter, dayFilter, locationFilter]);
  const filteredCsv = useMemo(() => comparison.csvClasses.filter(filterClass), [comparison, statusFilter, dayFilter, locationFilter]);

  const matchRate = summary.totalPdf > 0 ? Math.round((summary.matches / summary.totalPdf) * 100) : 0;

  const viewModes: { id: CompViewMode; label: string; icon: typeof LayoutGrid }[] = [
    { id: 'side-by-side', label: 'Side by Side', icon: LayoutGrid },
    { id: 'list', label: 'Flat List', icon: List },
    { id: 'location', label: 'By Location', icon: Building2 },
    { id: 'summary', label: 'Summary', icon: BarChart3 },
  ];

  return (
    <div className="space-y-5">
      {/* Summary Stats */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2 sm:gap-3">
        <StatCard label="PDF Classes" value={summary.totalPdf} color="" icon={BarChart3} />
        <StatCard label="CSV Classes" value={summary.totalCsv} color="" icon={BarChart3} />
        <StatCard label="Matches" value={summary.matches} color="border-l-4 border-l-emerald-500/70" icon={CheckCircle2} />
        <StatCard label="Mismatches" value={summary.mismatches} color="border-l-4 border-l-red-500/70" icon={XCircle} />
        <StatCard label="Missing" value={summary.missingInCsv} color="border-l-4 border-l-amber-500/70" icon={AlertTriangle} />
        <StatCard label="Extra" value={summary.extraInCsv} color="border-l-4 border-l-blue-500/70" icon={Plus} />
      </div>

      {/* Match Rate Bar */}
      <div className="surface-card p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <ArrowLeftRight className="w-4 h-4 text-primary" />
            <span className="font-medium text-sm text-foreground">Match Rate</span>
          </div>
          <span className="text-xl font-bold font-display text-slate-900">{matchRate}%</span>
        </div>
        <div className="h-2.5 bg-slate-200/70 rounded-full overflow-hidden">
          <div
            className="h-full transition-all duration-700 rounded-full gradient-primary"
            style={{ width: `${matchRate}%` }}
          />
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex gap-0.5 p-1 surface-muted rounded-xl shadow-soft">
          {viewModes.map(mode => (
            <button key={mode.id} onClick={() => setViewMode(mode.id)}
              className={cn("flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all",
                viewMode === mode.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}>
              <mode.icon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{mode.label}</span>
            </button>
          ))}
        </div>
        <Select value={statusFilter} onValueChange={v => setStatusFilter(v as StatusFilter)}>
          <SelectTrigger className="w-[130px] h-10 text-xs bg-white/70 backdrop-blur-sm border-border/70 shadow-soft"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="match">✅ Matches</SelectItem>
            <SelectItem value="mismatch">❌ Mismatches</SelectItem>
            <SelectItem value="missing">⚠️ Missing</SelectItem>
            <SelectItem value="extra">➕ Extra</SelectItem>
          </SelectContent>
        </Select>
        <Select value={dayFilter} onValueChange={setDayFilter}>
          <SelectTrigger className="w-[120px] h-10 text-xs bg-white/70 backdrop-blur-sm border-border/70 shadow-soft"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Days</SelectItem>
            {days.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
          </SelectContent>
        </Select>
        {locations.length > 1 && (
          <Select value={locationFilter} onValueChange={setLocationFilter}>
            <SelectTrigger className="w-[170px] h-10 text-xs bg-white/70 backdrop-blur-sm border-border/70 shadow-soft"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Locations</SelectItem>
              {locations.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* View Content */}
      <ScrollArea className="h-[600px]">
        <div className="pr-4">
          {viewMode === 'side-by-side' && <SideBySideView days={days} pdfClasses={filteredPdf} csvClasses={filteredCsv} />}
          {viewMode === 'list' && <FlatListView pdfClasses={filteredPdf} csvClasses={filteredCsv} />}
          {viewMode === 'location' && <LocationCompView pdfClasses={filteredPdf} csvClasses={filteredCsv} locations={locations} />}
          {viewMode === 'summary' && <SummaryView comparison={comparison} />}
        </div>
      </ScrollArea>
    </div>
  );
}

/* ===== SIDE BY SIDE — Aligned rows with blanks ===== */
function SideBySideView({ days, pdfClasses, csvClasses }: { days: string[]; pdfClasses: ComparedClass[]; csvClasses: ComparedClass[] }) {
  const alignedByDay = useMemo(() => {
    const result: Record<string, AlignedRow[]> = {};
    for (const day of days) {
      const dayPdf = pdfClasses.filter(c => c.day === day);
      const dayCsv = csvClasses.filter(c => c.day === day);
      result[day] = buildAlignedRows(dayPdf, dayCsv);
    }
    return result;
  }, [days, pdfClasses, csvClasses]);

  return (
    <div className="space-y-4">
      {days.map(day => {
        const rows = alignedByDay[day] || [];
        if (rows.length === 0) return null;
        const dayPdfCount = rows.filter(r => r.pdfClass).length;
        const dayCsvCount = rows.filter(r => r.csvClass).length;
        const dayMatches = rows.filter(r => r.status === 'match').length;

        return (
          <div key={day} className="surface-card p-0 overflow-hidden">
            {/* Day header */}
            <div className="gradient-header-dark text-white px-4 py-2.5 flex items-center justify-between">
              <h4 className="font-display font-semibold text-sm tracking-wide">{day}</h4>
              <div className="flex items-center gap-3 text-xs opacity-90">
                <span>PDF: {dayPdfCount}</span>
                <span>CSV: {dayCsvCount}</span>
                <Badge className="bg-white/10 text-white border-white/20 text-[10px]">
                  {dayMatches}/{Math.max(dayPdfCount, dayCsvCount)} match
                </Badge>
              </div>
            </div>

            {/* Column headers */}
            <div className="grid grid-cols-2 divide-x bg-secondary/40">
              <div className="px-3 py-1.5">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">PDF Schedule</p>
              </div>
              <div className="px-3 py-1.5">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">CSV Schedule</p>
              </div>
            </div>

            {/* Aligned rows */}
            <div className="divide-y divide-border/50">
              {rows.map((row, idx) => (
                <div key={idx} className={cn(
                  "grid grid-cols-2 divide-x divide-border/50 bg-white/40 hover:bg-white/60 transition-colors",
                )}>
                  <div className="p-2">
                    <ClassCell cls={row.pdfClass} side="pdf" />
                  </div>
                  <div className="p-2">
                    <ClassCell cls={row.csvClass} side="csv" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ===== FLAT LIST ===== */
function FlatListView({ pdfClasses, csvClasses }: { pdfClasses: ComparedClass[]; csvClasses: ComparedClass[] }) {
  const allClasses = useMemo(() => {
    const combined: (ComparedClass & { source: 'pdf' | 'csv' })[] = [
      ...pdfClasses.map(c => ({ ...c, source: 'pdf' as const })),
      ...csvClasses.filter(c => c.status === 'extra').map(c => ({ ...c, source: 'csv' as const })),
    ];
    return combined.sort((a, b) => {
      const dayDiff = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].indexOf(a.day)
        - ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].indexOf(b.day);
      if (dayDiff !== 0) return dayDiff;
      return (a.normalizedTime || '').localeCompare(b.normalizedTime || '');
    });
  }, [pdfClasses, csvClasses]);

  return (
    <div className="surface-card p-0 overflow-hidden">
      <table className="table-premium text-sm">
        <thead>
          <tr className="border-b bg-secondary/50 text-left text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">
            <th className="p-2.5">Status</th><th className="p-2.5">Day</th><th className="p-2.5">Time</th>
            <th className="p-2.5">Class</th><th className="p-2.5">Trainer</th><th className="p-2.5">Location</th><th className="p-2.5">Source</th>
          </tr>
        </thead>
        <tbody>
          {allClasses.map(cls => {
            const config = statusConfig[cls.status];
            const Icon = config.icon;
            return (
              <tr
                key={`${cls.source}-${cls.id}`}
                className="border-b hover:bg-secondary/20 transition-colors"
              >
                <td className="p-2.5">
                  <div className="flex items-center gap-1">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-900/5 border border-slate-200">
                      <Icon className={cn("w-3.5 h-3.5", config.iconText)} />
                    </span>
                    <span className={cn("text-xs font-medium", config.text)}>{config.label}</span>
                  </div>
                </td>
                <td className="p-2.5 text-xs">{cls.day.slice(0, 3)}</td>
                <td className="p-2.5 font-medium text-xs">{formatTime24to12(cls.normalizedTime) || cls.time}</td>
                <td className="p-2.5 font-medium text-xs">{cls.normalizedClassName?.replace('Studio ', '') || cls.className}</td>
                <td className="p-2.5 text-xs">{cls.normalizedTrainer || cls.trainer}</td>
                <td className="p-2.5 text-xs text-muted-foreground">{cls.normalizedLocation || '—'}</td>
                <td className="p-2.5"><Badge variant="outline" className="text-[10px]">{cls.source.toUpperCase()}</Badge></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ===== LOCATION VIEW ===== */
function LocationCompView({ pdfClasses, csvClasses, locations }: { pdfClasses: ComparedClass[]; csvClasses: ComparedClass[]; locations: string[] }) {
  return (
    <div className="space-y-6">
      {locations.map(loc => {
        const locPdf = pdfClasses.filter(c => c.normalizedLocation === loc);
        const locCsv = csvClasses.filter(c => c.normalizedLocation === loc);
        const alignedRows = buildAlignedRows(locPdf, locCsv);
        const locMatches = alignedRows.filter(r => r.status === 'match').length;
        const total = alignedRows.length;
        const rate = total > 0 ? Math.round((locMatches / total) * 100) : 0;

        return (
          <div key={loc} className="surface-card p-0 overflow-hidden">
            <div className="surface-muted px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-primary" />
                <h4 className="font-display font-semibold text-sm">{loc}</h4>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="text-muted-foreground">PDF: {locPdf.length} • CSV: {locCsv.length}</span>
                <Badge variant="outline" className="text-[10px] bg-white/70">{rate}% match</Badge>
              </div>
            </div>
            <div className="grid grid-cols-2 divide-x bg-secondary/30">
              <div className="px-3 py-1.5"><p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">PDF</p></div>
              <div className="px-3 py-1.5"><p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">CSV</p></div>
            </div>
            <div className="divide-y divide-border/50">
              {alignedRows.map((row, idx) => (
                <div key={idx} className={cn(
                  "grid grid-cols-2 divide-x divide-border/50 bg-white/40 hover:bg-white/60 transition-colors",
                )}>
                  <div className="p-2"><ClassCell cls={row.pdfClass} side="pdf" /></div>
                  <div className="p-2"><ClassCell cls={row.csvClass} side="csv" /></div>
                </div>
              ))}
              {alignedRows.length === 0 && (
                <p className="text-center py-6 text-xs text-muted-foreground">No classes for this location</p>
              )}
            </div>
          </div>
        );
      })}
      {locations.length === 0 && <p className="text-center py-8 text-muted-foreground">No location data available</p>}
    </div>
  );
}

/* ===== SUMMARY VIEW ===== */
function SummaryView({ comparison }: { comparison: ComparisonResult }) {
  const dayStats = useMemo(() => {
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    return days.map(day => {
      const pdf = comparison.pdfClasses.filter(c => c.day === day);
      const csv = comparison.csvClasses.filter(c => c.day === day);
      const matches = pdf.filter(c => c.status === 'match').length;
      const mismatches = pdf.filter(c => c.status === 'mismatch').length;
      return { day, pdf: pdf.length, csv: csv.length, matches, mismatches };
    }).filter(d => d.pdf > 0 || d.csv > 0);
  }, [comparison]);

  const classBreakdown = useMemo(() => {
    const map = new Map<string, { matches: number; mismatches: number; missing: number }>();
    for (const cls of comparison.pdfClasses) {
      const name = cls.normalizedClassName?.replace('Studio ', '') || cls.className;
      if (!map.has(name)) map.set(name, { matches: 0, mismatches: 0, missing: 0 });
      const entry = map.get(name)!;
      if (cls.status === 'match') entry.matches++;
      else if (cls.status === 'mismatch') entry.mismatches++;
      else if (cls.status === 'missing') entry.missing++;
    }
    return Array.from(map.entries()).sort((a, b) => (b[1].matches + b[1].mismatches + b[1].missing) - (a[1].matches + a[1].mismatches + a[1].missing));
  }, [comparison]);

  return (
    <div className="space-y-6">
      <div>
        <h4 className="font-display font-semibold mb-3 text-sm">Day-by-Day Breakdown</h4>
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-secondary/50 text-left text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">
                <th className="p-2.5">Day</th><th className="p-2.5 text-center">PDF</th><th className="p-2.5 text-center">CSV</th>
                <th className="p-2.5 text-center">Matches</th><th className="p-2.5 text-center">Mismatches</th><th className="p-2.5 text-center">Rate</th>
              </tr>
            </thead>
            <tbody>
              {dayStats.map(d => {
                const rate = d.pdf > 0 ? Math.round((d.matches / d.pdf) * 100) : 0;
                return (
                  <tr key={d.day} className="border-b hover:bg-secondary/30 transition-colors">
                    <td className="p-2.5 font-medium text-xs">{d.day}</td>
                    <td className="p-2.5 text-center text-xs">{d.pdf}</td>
                    <td className="p-2.5 text-center text-xs">{d.csv}</td>
                    <td className="p-2.5 text-center text-status-match font-semibold text-xs">{d.matches}</td>
                    <td className="p-2.5 text-center text-status-mismatch font-semibold text-xs">{d.mismatches}</td>
                    <td className="p-2.5 text-center">
                      <Badge className={cn("border-0 text-[10px]",
                        rate >= 90 ? "bg-status-match/20 text-status-match" : rate >= 70 ? "bg-status-missing/20 text-status-missing" : "bg-status-mismatch/20 text-status-mismatch"
                      )}>{rate}%</Badge>
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
            <div key={name} className="flex items-center gap-3 p-2.5 rounded-xl border border-border/70 bg-white/70 backdrop-blur-sm shadow-soft hover:shadow-card transition-all">
              <span className="font-medium text-xs flex-1">{name}</span>
              <div className="flex gap-1.5 text-xs">
                {stats.matches > 0 && (
                  <Badge variant="outline" className="text-[10px] bg-white/70">
                    {stats.matches} <CheckCircle2 className="w-3 h-3 ml-1" />
                  </Badge>
                )}
                {stats.mismatches > 0 && (
                  <Badge variant="outline" className="text-[10px] bg-white/70">
                    {stats.mismatches} <XCircle className="w-3 h-3 ml-1" />
                  </Badge>
                )}
                {stats.missing > 0 && (
                  <Badge variant="outline" className="text-[10px] bg-white/70">
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
