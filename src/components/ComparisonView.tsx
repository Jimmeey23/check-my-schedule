import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { ComparedClass, ComparisonResult, NormalizedClass } from '@/types/schedule';
import {
  CheckCircle2, XCircle, AlertTriangle, Plus, ArrowLeftRight,
  Filter, LayoutGrid, List, Building2, BarChart3
} from 'lucide-react';

interface ComparisonViewProps {
  comparison: ComparisonResult;
}

type CompViewMode = 'side-by-side' | 'list' | 'location' | 'summary';
type StatusFilter = 'all' | 'match' | 'mismatch' | 'missing' | 'extra';

const statusConfig = {
  match: { icon: CheckCircle2, label: 'Match', bg: 'bg-status-match/10', text: 'text-status-match', border: 'border-status-match/20', badge: 'bg-status-match/10 text-status-match' },
  mismatch: { icon: XCircle, label: 'Mismatch', bg: 'bg-status-mismatch/10', text: 'text-status-mismatch', border: 'border-status-mismatch/20', badge: 'bg-status-mismatch/10 text-status-mismatch' },
  missing: { icon: AlertTriangle, label: 'Missing in CSV', bg: 'bg-status-missing/10', text: 'text-status-missing', border: 'border-status-missing/20', badge: 'bg-status-missing/10 text-status-missing' },
  extra: { icon: Plus, label: 'Extra in CSV', bg: 'bg-status-extra/10', text: 'text-status-extra', border: 'border-status-extra/20', badge: 'bg-status-extra/10 text-status-extra' },
};

function StatCard({ label, value, color, icon: Icon }: { label: string; value: number; color: string; icon: typeof CheckCircle2 }) {
  return (
    <div className={cn("rounded-xl border p-4 text-center", color)}>
      <Icon className="w-5 h-5 mx-auto mb-1 opacity-70" />
      <p className="text-2xl font-bold font-display">{value}</p>
      <p className="text-xs opacity-70">{label}</p>
    </div>
  );
}

function CompactClassCard({ cls, side }: { cls: ComparedClass; side: 'pdf' | 'csv' }) {
  const config = statusConfig[cls.status];
  const StatusIcon = config.icon;
  return (
    <div className={cn("p-2.5 rounded-lg border transition-all text-sm", config.bg, config.border)}>
      <div className="flex items-center justify-between gap-1 mb-1">
        <div className="flex items-center gap-1.5">
          <StatusIcon className={cn("w-3.5 h-3.5", config.text)} />
          <span className="font-semibold text-foreground">{cls.time}</span>
        </div>
        <Badge variant="outline" className={cn("text-[10px] h-5", config.badge)}>{config.label}</Badge>
      </div>
      <p className={cn("font-medium text-xs", cls.differences?.className ? "text-status-mismatch" : "text-foreground")}>
        {cls.normalizedClassName?.replace('Studio ', '') || cls.className}
      </p>
      <p className={cn("text-xs", cls.differences?.trainer ? "text-status-mismatch" : "text-muted-foreground")}>
        {cls.normalizedTrainer || cls.trainer}
      </p>
      {cls.normalizedLocation && (
        <p className={cn("text-[11px]", cls.differences?.location ? "text-status-mismatch" : "text-muted-foreground")}>
          📍 {cls.normalizedLocation}
        </p>
      )}
      {cls.differences && cls.matchedWith && (
        <div className="mt-1.5 pt-1.5 border-t border-dashed border-current/20 text-[11px]">
          <p className="text-muted-foreground font-medium">{side === 'pdf' ? 'CSV:' : 'PDF:'}</p>
          {cls.differences.time && <p className="text-status-mismatch">Time: {cls.matchedWith.time}</p>}
          {cls.differences.className && <p className="text-status-mismatch">Class: {cls.matchedWith.normalizedClassName?.replace('Studio ', '') || cls.matchedWith.className}</p>}
          {cls.differences.trainer && <p className="text-status-mismatch">Trainer: {cls.matchedWith.normalizedTrainer || cls.matchedWith.trainer}</p>}
        </div>
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
    comparison.csvClasses.forEach(c => { if (c.normalizedLocation) set.add(c.normalizedLocation); });
    comparison.pdfClasses.forEach(c => { if (c.normalizedLocation) set.add(c.normalizedLocation); });
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
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        <StatCard label="PDF Classes" value={summary.totalPdf} color="bg-card border" icon={BarChart3} />
        <StatCard label="CSV Classes" value={summary.totalCsv} color="bg-card border" icon={BarChart3} />
        <StatCard label="Matches" value={summary.matches} color="bg-status-match/5 border-status-match/20 text-status-match" icon={CheckCircle2} />
        <StatCard label="Mismatches" value={summary.mismatches} color="bg-status-mismatch/5 border-status-mismatch/20 text-status-mismatch" icon={XCircle} />
        <StatCard label="Missing" value={summary.missingInCsv} color="bg-status-missing/5 border-status-missing/20 text-status-missing" icon={AlertTriangle} />
        <StatCard label="Extra" value={summary.extraInCsv} color="bg-status-extra/5 border-status-extra/20 text-status-extra" icon={Plus} />
      </div>

      {/* Match Rate */}
      <div className="bg-card border rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <ArrowLeftRight className="w-4 h-4 text-primary" />
            <span className="font-medium text-sm text-foreground">Match Rate</span>
          </div>
          <span className={cn("text-xl font-bold font-display",
            matchRate >= 90 ? "text-status-match" : matchRate >= 70 ? "text-status-missing" : "text-status-mismatch"
          )}>{matchRate}%</span>
        </div>
        <div className="h-2 bg-secondary rounded-full overflow-hidden">
          <div className={cn("h-full transition-all duration-700",
            matchRate >= 90 ? "bg-status-match" : matchRate >= 70 ? "bg-status-missing" : "bg-status-mismatch"
          )} style={{ width: `${matchRate}%` }} />
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex gap-1 p-1 bg-secondary/50 rounded-lg">
          {viewModes.map(mode => (
            <button key={mode.id} onClick={() => setViewMode(mode.id)}
              className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all",
                viewMode === mode.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}>
              <mode.icon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{mode.label}</span>
            </button>
          ))}
        </div>
        <Select value={statusFilter} onValueChange={v => setStatusFilter(v as StatusFilter)}>
          <SelectTrigger className="w-[140px] h-9 bg-secondary/30"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="match">✅ Matches</SelectItem>
            <SelectItem value="mismatch">❌ Mismatches</SelectItem>
            <SelectItem value="missing">⚠️ Missing</SelectItem>
            <SelectItem value="extra">➕ Extra</SelectItem>
          </SelectContent>
        </Select>
        <Select value={dayFilter} onValueChange={setDayFilter}>
          <SelectTrigger className="w-[130px] h-9 bg-secondary/30"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Days</SelectItem>
            {days.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
          </SelectContent>
        </Select>
        {locations.length > 1 && (
          <Select value={locationFilter} onValueChange={setLocationFilter}>
            <SelectTrigger className="w-[180px] h-9 bg-secondary/30"><SelectValue /></SelectTrigger>
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

function SideBySideView({ days, pdfClasses, csvClasses }: { days: string[]; pdfClasses: ComparedClass[]; csvClasses: ComparedClass[] }) {
  return (
    <div className="space-y-4">
      {days.map(day => {
        const dayPdf = pdfClasses.filter(c => c.day === day);
        const dayCsv = csvClasses.filter(c => c.day === day);
        if (dayPdf.length === 0 && dayCsv.length === 0) return null;
        return (
          <div key={day} className="border rounded-xl overflow-hidden">
            <div className="bg-primary text-primary-foreground px-4 py-2.5 flex items-center justify-between">
              <h4 className="font-display font-semibold text-sm">{day}</h4>
              <span className="text-xs opacity-80">PDF: {dayPdf.length} • CSV: {dayCsv.length}</span>
            </div>
            <div className="grid grid-cols-2 divide-x">
              <div className="p-2.5 space-y-2">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1">PDF</p>
                {dayPdf.length === 0 ? <p className="text-xs text-muted-foreground italic">No classes</p>
                  : dayPdf.map(cls => <CompactClassCard key={cls.id} cls={cls} side="pdf" />)}
              </div>
              <div className="p-2.5 space-y-2">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1">CSV</p>
                {dayCsv.length === 0 ? <p className="text-xs text-muted-foreground italic">No classes</p>
                  : dayCsv.map(cls => <CompactClassCard key={cls.id} cls={cls} side="csv" />)}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

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
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-secondary/50 text-left text-xs text-muted-foreground">
            <th className="p-2.5">Status</th><th className="p-2.5">Day</th><th className="p-2.5">Time</th>
            <th className="p-2.5">Class</th><th className="p-2.5">Trainer</th><th className="p-2.5">Location</th><th className="p-2.5">Source</th>
          </tr>
        </thead>
        <tbody>
          {allClasses.map(cls => {
            const config = statusConfig[cls.status];
            const Icon = config.icon;
            return (
              <tr key={`${cls.source}-${cls.id}`} className={cn("border-b hover:bg-secondary/30", config.bg)}>
                <td className="p-2.5"><div className="flex items-center gap-1"><Icon className={cn("w-3.5 h-3.5", config.text)} /><span className="text-xs">{config.label}</span></div></td>
                <td className="p-2.5">{cls.day.slice(0, 3)}</td>
                <td className="p-2.5 font-medium">{cls.time}</td>
                <td className="p-2.5 font-medium">{cls.normalizedClassName?.replace('Studio ', '') || cls.className}</td>
                <td className="p-2.5">{cls.normalizedTrainer || cls.trainer}</td>
                <td className="p-2.5 text-muted-foreground">{cls.normalizedLocation || '—'}</td>
                <td className="p-2.5"><Badge variant="outline" className="text-[10px]">{cls.source.toUpperCase()}</Badge></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function LocationCompView({ pdfClasses, csvClasses, locations }: { pdfClasses: ComparedClass[]; csvClasses: ComparedClass[]; locations: string[] }) {
  return (
    <div className="space-y-6">
      {locations.map(loc => {
        const locPdf = pdfClasses.filter(c => c.normalizedLocation === loc);
        const locCsv = csvClasses.filter(c => c.normalizedLocation === loc);
        const locMatches = locPdf.filter(c => c.status === 'match').length;
        const locTotal = locPdf.length;
        const rate = locTotal > 0 ? Math.round((locMatches / locTotal) * 100) : 0;

        return (
          <div key={loc} className="border rounded-xl overflow-hidden">
            <div className="bg-secondary px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-primary" />
                <h4 className="font-display font-semibold">{loc}</h4>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <span className="text-muted-foreground">PDF: {locPdf.length} • CSV: {locCsv.length}</span>
                <Badge className={cn(rate >= 90 ? "bg-status-match/20 text-status-match" : rate >= 70 ? "bg-status-missing/20 text-status-missing" : "bg-status-mismatch/20 text-status-mismatch", "border-0")}>
                  {rate}% match
                </Badge>
              </div>
            </div>
            <div className="p-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {locPdf.map(cls => <CompactClassCard key={cls.id} cls={cls} side="pdf" />)}
              {locCsv.filter(c => c.status === 'extra').map(cls => <CompactClassCard key={cls.id} cls={cls} side="csv" />)}
            </div>
          </div>
        );
      })}
      {locations.length === 0 && <p className="text-center py-8 text-muted-foreground">No location data available</p>}
    </div>
  );
}

function SummaryView({ comparison }: { comparison: ComparisonResult }) {
  const { summary } = comparison;

  // Stats by day
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

  // Class type breakdown
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
        <h4 className="font-display font-semibold mb-3">Day-by-Day Breakdown</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-secondary/50 text-left text-xs text-muted-foreground">
                <th className="p-2.5">Day</th><th className="p-2.5 text-center">PDF</th><th className="p-2.5 text-center">CSV</th>
                <th className="p-2.5 text-center">Matches</th><th className="p-2.5 text-center">Mismatches</th><th className="p-2.5 text-center">Rate</th>
              </tr>
            </thead>
            <tbody>
              {dayStats.map(d => {
                const rate = d.pdf > 0 ? Math.round((d.matches / d.pdf) * 100) : 0;
                return (
                  <tr key={d.day} className="border-b hover:bg-secondary/30">
                    <td className="p-2.5 font-medium">{d.day}</td>
                    <td className="p-2.5 text-center">{d.pdf}</td>
                    <td className="p-2.5 text-center">{d.csv}</td>
                    <td className="p-2.5 text-center text-status-match font-medium">{d.matches}</td>
                    <td className="p-2.5 text-center text-status-mismatch font-medium">{d.mismatches}</td>
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
        <h4 className="font-display font-semibold mb-3">Class Type Breakdown</h4>
        <div className="grid gap-2">
          {classBreakdown.map(([name, stats]) => {
            const total = stats.matches + stats.mismatches + stats.missing;
            return (
              <div key={name} className="flex items-center gap-3 p-2.5 rounded-lg border bg-card">
                <span className="font-medium text-sm flex-1">{name}</span>
                <div className="flex gap-2 text-xs">
                  {stats.matches > 0 && <Badge className="bg-status-match/10 text-status-match border-0">{stats.matches} ✓</Badge>}
                  {stats.mismatches > 0 && <Badge className="bg-status-mismatch/10 text-status-mismatch border-0">{stats.mismatches} ✗</Badge>}
                  {stats.missing > 0 && <Badge className="bg-status-missing/10 text-status-missing border-0">{stats.missing} ?</Badge>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
