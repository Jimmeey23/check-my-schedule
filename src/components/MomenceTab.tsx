import { useState, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Globe, RefreshCw, CheckCircle2, XCircle, AlertTriangle,
  Loader2, Calendar, Users, MapPin
} from 'lucide-react';
import { normalizeClassName, normalizeTrainer, normalizeLocation, normalizeTime } from '@/lib/normalizers';
import type { MomenceSession, MomenceClassData } from '@/types/momence';
import type { ClassData, PdfClassData } from '@/types/schedule';
import { cn } from '@/lib/utils';

interface MomenceTabProps {
  startDate?: string;
  endDate?: string;
  csvData?: { [day: string]: ClassData[] } | null;
  pdfData?: PdfClassData[] | null;
}

type MismatchType = 'match' | 'trainer-mismatch' | 'class-mismatch' | 'time-mismatch' | 'momence-only' | 'source-only';

function parseMomenceSessions(sessions: MomenceSession[]): MomenceClassData[] {
  return sessions
    .filter(s => !s.isCancelled && !s.isDraft)
    .map(session => {
      const dt = new Date(session.startsAt);
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const day = days[dt.getDay()];
      const hours = dt.getHours();
      const minutes = dt.getMinutes();
      const period = hours >= 12 ? 'PM' : 'AM';
      const h12 = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
      const time = `${h12}:${minutes.toString().padStart(2, '0')} ${period}`;

      const trainerName = session.teacher
        ? `${session.teacher.firstName} ${session.teacher.lastName}`.trim()
        : '';

      return {
        day,
        time,
        className: session.name,
        trainer: trainerName,
        location: session.inPersonLocation?.name || '',
        uniqueKey: `${day}-${time}-${session.name}`,
        startsAt: session.startsAt,
        bookingCount: session.bookingCount,
        capacity: session.capacity,
      };
    })
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
}

export function MomenceTab({ startDate, endDate, csvData, pdfData }: MomenceTabProps) {
  const [loading, setLoading] = useState(false);
  const [sessions, setSessions] = useState<MomenceClassData[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [compareWith, setCompareWith] = useState<'csv' | 'pdf'>('csv');

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Call the edge function
      const params = new URLSearchParams();
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);

      const response = await fetch(`/functions/v1/momence-sessions?${params.toString()}`);

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(errText || `HTTP ${response.status}`);
      }

      const data = await response.json();
      const parsed = parseMomenceSessions(data.payload || data);
      setSessions(parsed);
    } catch (err) {
      console.error('Momence fetch error:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch sessions');
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  // Build aligned comparison rows
  const comparisonRows = useMemo(() => {
    if (sessions.length === 0) return [];

    const sourceData: { day: string; time: string; className: string; trainer: string; location: string }[] = [];

    if (compareWith === 'csv' && csvData) {
      Object.values(csvData).flat().forEach(c => {
        sourceData.push({
          day: c.day,
          time: c.time,
          className: c.className,
          trainer: c.trainer1,
          location: c.location,
        });
      });
    } else if (compareWith === 'pdf' && pdfData) {
      pdfData.forEach(c => {
        sourceData.push({
          day: c.day,
          time: c.time,
          className: c.className,
          trainer: c.trainer,
          location: c.location,
        });
      });
    }

    interface AlignedRow {
      day: string;
      momence: MomenceClassData | null;
      source: typeof sourceData[0] | null;
      status: MismatchType;
    }

    const rows: AlignedRow[] = [];
    const usedSourceIdx = new Set<number>();

    // Match Momence sessions to source
    for (const mClass of sessions) {
      const mTime = normalizeTime(mClass.time);
      const mName = normalizeClassName(mClass.className);
      const mTrainer = normalizeTrainer(mClass.trainer);

      let bestIdx = -1;
      let bestScore = 0;

      sourceData.forEach((src, idx) => {
        if (usedSourceIdx.has(idx)) return;
        if (src.day !== mClass.day) return;

        const sTime = normalizeTime(src.time);
        const sName = normalizeClassName(src.className);
        const sTrainer = normalizeTrainer(src.trainer);

        let score = 0;
        if (mTime === sTime) score += 40;
        if (mName === sName) score += 30;
        if (mTrainer === sTrainer) score += 20;

        if (score > bestScore) {
          bestScore = score;
          bestIdx = idx;
        }
      });

      if (bestIdx >= 0 && bestScore >= 40) {
        usedSourceIdx.add(bestIdx);
        const src = sourceData[bestIdx];
        const sTime = normalizeTime(src.time);
        const sName = normalizeClassName(src.className);
        const sTrainer = normalizeTrainer(src.trainer);

        let status: MismatchType = 'match';
        if (mTime !== sTime) status = 'time-mismatch';
        else if (mName !== sName) status = 'class-mismatch';
        else if (mTrainer !== sTrainer) status = 'trainer-mismatch';

        rows.push({ day: mClass.day, momence: mClass, source: src, status });
      } else {
        rows.push({ day: mClass.day, momence: mClass, source: null, status: 'momence-only' });
      }
    }

    // Unmatched source entries
    sourceData.forEach((src, idx) => {
      if (!usedSourceIdx.has(idx)) {
        rows.push({ day: src.day, momence: null, source: src, status: 'source-only' });
      }
    });

    // Sort by day order then time
    const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    rows.sort((a, b) => {
      const da = dayOrder.indexOf(a.day);
      const db = dayOrder.indexOf(b.day);
      if (da !== db) return da - db;
      const ta = a.momence?.startsAt || a.source?.time || '';
      const tb = b.momence?.startsAt || b.source?.time || '';
      return ta.localeCompare(tb);
    });

    return rows;
  }, [sessions, csvData, pdfData, compareWith]);

  const stats = useMemo(() => {
    const s = { total: comparisonRows.length, matches: 0, mismatches: 0, momenceOnly: 0, sourceOnly: 0 };
    comparisonRows.forEach(r => {
      if (r.status === 'match') s.matches++;
      else if (r.status === 'momence-only') s.momenceOnly++;
      else if (r.status === 'source-only') s.sourceOnly++;
      else s.mismatches++;
    });
    return s;
  }, [comparisonRows]);

  const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl gradient-primary flex items-center justify-center">
            <Globe className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="font-display font-semibold text-foreground">Momence Sessions</h3>
            <p className="text-xs text-muted-foreground">
              {startDate && endDate ? `${startDate} — ${endDate}` : 'Upload a PDF to set date range'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {sessions.length > 0 && (csvData || pdfData) && (
            <div className="flex gap-0.5 p-1 surface-muted rounded-xl shadow-soft">
              <button
                onClick={() => setCompareWith('csv')}
                className={cn("px-2.5 py-1.5 rounded-md text-xs font-medium transition-all",
                  compareWith === 'csv' ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
                disabled={!csvData}
              >
                vs CSV
              </button>
              <button
                onClick={() => setCompareWith('pdf')}
                className={cn("px-2.5 py-1.5 rounded-md text-xs font-medium transition-all",
                  compareWith === 'pdf' ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
                disabled={!pdfData}
              >
                vs PDF
              </button>
            </div>
          )}

          <Button
            onClick={fetchSessions}
            disabled={loading || (!startDate && !endDate)}
            className="gap-2"
            size="sm"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {loading ? 'Fetching...' : sessions.length > 0 ? 'Refresh' : 'Fetch Sessions'}
          </Button>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Stats */}
      {sessions.length > 0 && comparisonRows.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <div className="surface-card hoverable p-3 text-center">
            <p className="text-xl font-bold font-display text-foreground">{sessions.length}</p>
            <p className="text-[10px] text-muted-foreground font-medium">Momence</p>
          </div>
          <div className="surface-card hoverable p-3 text-center border-l-4 border-l-emerald-500/70">
            <p className="text-xl font-bold font-display text-foreground">{stats.matches}</p>
            <p className="text-[10px] text-muted-foreground font-medium">Matches</p>
          </div>
          <div className="surface-card hoverable p-3 text-center border-l-4 border-l-red-500/70">
            <p className="text-xl font-bold font-display text-foreground">{stats.mismatches}</p>
            <p className="text-[10px] text-muted-foreground font-medium">Mismatches</p>
          </div>
          <div className="surface-card hoverable p-3 text-center border-l-4 border-l-amber-500/70">
            <p className="text-xl font-bold font-display text-foreground">{stats.momenceOnly}</p>
            <p className="text-[10px] text-muted-foreground font-medium">Momence Only</p>
          </div>
          <div className="surface-card hoverable p-3 text-center border-l-4 border-l-blue-500/70">
            <p className="text-xl font-bold font-display text-foreground">{stats.sourceOnly}</p>
            <p className="text-[10px] text-muted-foreground font-medium">{compareWith.toUpperCase()} Only</p>
          </div>
        </div>
      )}

      {/* Sessions Table */}
      {sessions.length > 0 ? (
        <ScrollArea className="h-[600px]">
          <div className="surface-card p-0 overflow-hidden">
            <table className="table-premium table-head-dark table-compact text-sm w-full">
              <thead>
                <tr className="gradient-header-dark text-white sticky top-0 z-10">
                  <th className="px-3 py-2 text-center font-semibold w-12">Status</th>
                  <th className="px-3 py-2 text-left font-semibold">Day</th>
                  <th className="px-3 py-2 text-left font-semibold">Momence Time</th>
                  <th className="px-3 py-2 text-left font-semibold">Momence Class</th>
                  <th className="px-3 py-2 text-left font-semibold">Momence Trainer</th>
                  <th className="px-3 py-2 text-left font-semibold">{compareWith.toUpperCase()} Time</th>
                  <th className="px-3 py-2 text-left font-semibold">{compareWith.toUpperCase()} Class</th>
                  <th className="px-3 py-2 text-left font-semibold">{compareWith.toUpperCase()} Trainer</th>
                  <th className="px-3 py-2 text-center font-semibold">Booked</th>
                </tr>
              </thead>
              <tbody>
                {dayOrder.map(day => {
                  const dayRows = comparisonRows.filter(r => r.day === day);
                  if (dayRows.length === 0) return null;

                  return dayRows.map((row, idx) => {
                    const isMatch = row.status === 'match';
                    const isMomenceOnly = row.status === 'momence-only';
                    const isSourceOnly = row.status === 'source-only';

                    const rowBg = isMatch
                      ? 'bg-emerald-50/40 hover:bg-emerald-50/60 border-l-2 border-l-emerald-400'
                      : (isMomenceOnly || isSourceOnly)
                        ? 'bg-slate-50 hover:bg-slate-100 border-l-2 border-l-slate-300'
                        : 'bg-amber-50/30 hover:bg-amber-50/50 border-l-2 border-l-amber-400';

                    const statusIcon = isMatch
                      ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      : (isMomenceOnly || isSourceOnly)
                        ? <AlertTriangle className="w-4 h-4 text-amber-500" />
                        : <XCircle className="w-4 h-4 text-red-500" />;

                    return (
                      <tr key={`${day}-${idx}`} className={cn("border-b border-slate-200/70 transition-colors", rowBg)}>
                        <td className="px-3 py-2 text-center">{statusIcon}</td>
                        <td className="px-3 py-2 font-semibold text-foreground">{day.slice(0, 3)}</td>
                        <td className={cn("px-3 py-2 font-mono text-foreground", !row.momence && "text-muted-foreground bg-slate-100/70")}>
                          {row.momence?.time || '—'}
                        </td>
                        <td className={cn("px-3 py-2", row.status === 'class-mismatch' ? 'text-purple-700 font-semibold' : 'text-foreground', !row.momence && "text-muted-foreground bg-slate-100/70")}>
                          {row.momence?.className || '—'}
                        </td>
                        <td className={cn("px-3 py-2", row.status === 'trainer-mismatch' ? 'text-orange-700 font-semibold' : 'text-foreground', !row.momence && "text-muted-foreground bg-slate-100/70")}>
                          {row.momence?.trainer || '—'}
                        </td>
                        <td className={cn("px-3 py-2 font-mono text-foreground", !row.source && "text-muted-foreground bg-slate-100/70")}>
                          {row.source?.time || '—'}
                        </td>
                        <td className={cn("px-3 py-2", row.status === 'class-mismatch' ? 'text-purple-700 font-semibold' : 'text-foreground', !row.source && "text-muted-foreground bg-slate-100/70")}>
                          {row.source?.className || '—'}
                        </td>
                        <td className={cn("px-3 py-2", row.status === 'trainer-mismatch' ? 'text-orange-700 font-semibold' : 'text-foreground', !row.source && "text-muted-foreground bg-slate-100/70")}>
                          {row.source?.trainer || '—'}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {row.momence && (
                            <Badge variant="outline" className="text-[10px] bg-white/70">
                              <Users className="w-3 h-3 mr-1" />
                              {row.momence.bookingCount}/{row.momence.capacity}
                            </Badge>
                          )}
                        </td>
                      </tr>
                    );
                  });
                })}
              </tbody>
            </table>
          </div>
        </ScrollArea>
      ) : !loading && (
        <div className="text-center py-16">
          <Globe className="w-12 h-12 mx-auto mb-4 text-muted-foreground/40" />
          <h4 className="font-display font-semibold text-foreground mb-1">No Sessions Loaded</h4>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            {startDate && endDate
              ? 'Click "Fetch Sessions" to load Momence class data for the schedule date range.'
              : 'Upload a PDF schedule first to set the date range, then fetch Momence sessions.'}
          </p>
        </div>
      )}
    </div>
  );
}
