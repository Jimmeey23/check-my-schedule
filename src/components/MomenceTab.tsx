import { useState, useMemo, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Globe, RefreshCw, CheckCircle2, XCircle, AlertTriangle,
  Loader2, Calendar, Users, MapPin, Filter, X
} from 'lucide-react';
import { normalizeClassName, normalizeTrainer, normalizeLocation, normalizeTime } from '@/lib/normalizers';
import { invokeMomenceFunction } from '@/lib/supabaseClient';
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
  const processedSessions = sessions
    .filter(s => !s.isCancelled && !s.isDraft)
    .map(session => {
      const dt = new Date(session.startsAt);
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const day = days[dt.getDay()];
      const hours = dt.getHours();
      const minutes = dt.getMinutes();
      const period = hours >= 12 ? 'PM' : 'AM';
      const h12 = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
      const rawTime = `${h12}:${minutes.toString().padStart(2, '0')} ${period}`;
      
      // Normalize the time using the same function as CSV/PDF
      const time = normalizeTime(rawTime);

      const trainerName = session.teacher
        ? `${session.teacher.firstName} ${session.teacher.lastName}`.trim()
        : '';

      const normalized = {
        day,
        time,
        className: normalizeClassName(session.name),
        trainer: normalizeTrainer(trainerName),
        location: normalizeLocation(session.inPersonLocation?.name || ''),
        uniqueKey: `${day}-${time}-${session.name}`,
        startsAt: session.startsAt,
        bookingCount: session.bookingCount,
        capacity: session.capacity,
      };

      return normalized;
    });

  // Remove duplicates based on normalized data, prioritizing latest session for trainer substitutions
  const uniqueSessions = new Map<string, MomenceClassData>();
  processedSessions.forEach(session => {
    // Use a key that doesn't include trainer to handle substitutions properly
    const baseKey = `${session.day}-${session.time}-${session.className}-${session.location}`;
    
    const existingSession = uniqueSessions.get(baseKey);
    if (!existingSession || new Date(session.startsAt) >= new Date(existingSession.startsAt)) {
      // Keep the latest session (most recent trainer assignment)
      uniqueSessions.set(baseKey, session);
    }
  });

  return Array.from(uniqueSessions.values())
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
}

export function MomenceTab({ startDate, endDate, csvData, pdfData }: MomenceTabProps) {
  const [loading, setLoading] = useState(false);
  const [sessions, setSessions] = useState<MomenceClassData[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [compareWith, setCompareWith] = useState<'csv' | 'pdf'>('csv');
  const [filterStatus, setFilterStatus] = useState<MismatchType | 'all'>('all');
  const [groupByDay, setGroupByDay] = useState(true);
  const [filterLocation, setFilterLocation] = useState<string>('all');
  const [filterDay, setFilterDay] = useState<string>('all');
  const [filterTime, setFilterTime] = useState<string>('all');
  const [filterClass, setFilterClass] = useState<string>('all');
  const [filterTrainer, setFilterTrainer] = useState<string>('all');

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      console.log('[Momence] Fetching sessions:', startDate && endDate 
        ? { startDate, endDate } 
        : 'default date range (next 30 days)');

      // Call Supabase edge function (dates are optional)
      const data = await invokeMomenceFunction(startDate, endDate);
      
      console.log('[Momence] Response received:', data);
      
      if (!data) {
        throw new Error('No data received from Momence API');
      }
      
      const payload = data.payload || data;
      
      if (!Array.isArray(payload) && !payload.length) {
        console.warn('[Momence] No sessions found in response');
        setSessions([]);
        return;
      }
      
      const parsed = parseMomenceSessions(payload);
      console.log('[Momence] Parsed sessions:', parsed.length);
      setSessions(parsed);
    } catch (err) {
      console.error('[Momence] Fetch error:', err);
      
      // Provide more helpful error messages
      let errorMessage = 'Failed to fetch sessions';
      if (err instanceof Error) {
        if (err.message.includes('Could not establish connection')) {
          errorMessage = 'Edge function not deployed. Please run: ./deploy-momence.sh';
        } else if (err.message.includes('404') || err.message.includes('Not Found')) {
          errorMessage = 'Edge function not found. Deploy it with: supabase functions deploy momence-sessions';
        } else if (err.message.includes('401') || err.message.includes('Unauthorized')) {
          errorMessage = 'Authentication failed. Check Momence credentials in the edge function.';
        } else {
          errorMessage = err.message;
        }
      }
      
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  // Auto-fetch sessions on component mount and when dates change
  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // Extract actual date range from CSV/PDF data
  const dataDateRange = useMemo(() => {
    const dates: Date[] = [];
    
    if (compareWith === 'csv' && csvData) {
      Object.values(csvData).flat().forEach(c => {
        if (c.timeDate) {
          dates.push(new Date(c.timeDate));
        }
      });
    } else if (compareWith === 'pdf' && pdfData && startDate && endDate) {
      // For PDF data, calculate dates based on weekStart/weekEnd and day names
      const weekStart = new Date(startDate);
      const weekEnd = new Date(endDate);
      
      // Find all unique days in PDF data and calculate their dates
      const dayNames = Array.from(new Set(pdfData.map(c => c.day)));
      const dayOrder = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      
      dayNames.forEach(dayName => {
        const dayIndex = dayOrder.indexOf(dayName);
        if (dayIndex !== -1) {
          // Calculate the date for this day within the week
          const startDayIndex = weekStart.getDay();
          let targetDate = new Date(weekStart);
          
          // Calculate days to add/subtract to get to the target day
          let daysToAdd = dayIndex - startDayIndex;
          if (daysToAdd < 0) daysToAdd += 7; // If target day is in next week
          
          targetDate.setDate(weekStart.getDate() + daysToAdd);
          
          // Only include if within the week range
          if (targetDate >= weekStart && targetDate <= weekEnd) {
            dates.push(targetDate);
          }
        }
      });
    }
    
    // If we have date info from the data, use it; otherwise fall back to props
    if (dates.length > 0) {
      const sortedDates = dates.sort((a, b) => a.getTime() - b.getTime());
      return {
        start: sortedDates[0],
        end: sortedDates[sortedDates.length - 1]
      };
    }
    
    // Fall back to startDate/endDate props if available
    if (startDate && endDate) {
      return {
        start: new Date(startDate),
        end: new Date(endDate)
      };
    }
    
    return null;
  }, [csvData, pdfData, compareWith, startDate, endDate]);

  // Filter Momence sessions to match the date range of CSV/PDF data
  const filteredSessions = useMemo(() => {
    if (!dataDateRange) return sessions;
    
    return sessions.filter(session => {
      const sessionDate = new Date(session.startsAt);
      // Remove time component for date comparison
      const sessionDay = new Date(sessionDate.getFullYear(), sessionDate.getMonth(), sessionDate.getDate());
      const rangeStart = new Date(dataDateRange.start.getFullYear(), dataDateRange.start.getMonth(), dataDateRange.start.getDate());
      const rangeEnd = new Date(dataDateRange.end.getFullYear(), dataDateRange.end.getMonth(), dataDateRange.end.getDate());
      
      return sessionDay >= rangeStart && sessionDay <= rangeEnd;
    });
  }, [sessions, dataDateRange]);

  // Build aligned comparison rows
  const comparisonRows = useMemo(() => {
    if (filteredSessions.length === 0) return [];

    const sourceDataRaw: { day: string; time: string; className: string; trainer: string; location: string }[] = [];

    if (compareWith === 'csv' && csvData) {
      Object.values(csvData).flat().forEach(c => {
        // Apply cover field logic: use cover if present, otherwise use trainer1
        const effectiveTrainer = c.cover?.trim() || c.trainer1;
        
        sourceDataRaw.push({
          day: c.day,
          time: normalizeTime(c.time),
          className: normalizeClassName(c.className),
          trainer: normalizeTrainer(effectiveTrainer),
          location: normalizeLocation(c.location),
        });
      });
    } else if (compareWith === 'pdf' && pdfData) {
      pdfData.forEach(c => {
        sourceDataRaw.push({
          day: c.day,
          time: normalizeTime(c.time),
          className: normalizeClassName(c.className),
          trainer: normalizeTrainer(c.trainer),
          location: normalizeLocation(c.location),
        });
      });
    }

    // Remove duplicates from source data
    const uniqueSourceData = new Map<string, typeof sourceDataRaw[0]>();
    sourceDataRaw.forEach(item => {
      const dedupeKey = `${item.day}-${item.time}-${item.className}-${item.trainer}-${item.location}`;
      if (!uniqueSourceData.has(dedupeKey)) {
        uniqueSourceData.set(dedupeKey, item);
      }
    });
    const sourceData = Array.from(uniqueSourceData.values());

    interface AlignedRow {
      day: string;
      momence: MomenceClassData | null;
      source: typeof sourceData[0] | null;
      status: MismatchType;
      matchNote?: string;
    }

    const rows: AlignedRow[] = [];
    const usedSourceIdx = new Set<number>();

    // Match Momence sessions to source
    for (const mClass of filteredSessions) {
      let bestIdx = -1;
      let bestScore = 0;

      sourceData.forEach((src, idx) => {
        if (usedSourceIdx.has(idx)) return;
        if (src.day !== mClass.day) return;

        let score = 0;
        if (mClass.time === src.time) score += 40;
        if (mClass.className === src.className) score += 30;
        if (mClass.trainer === src.trainer) score += 20;

        if (score > bestScore) {
          bestScore = score;
          bestIdx = idx;
        }
      });

      if (bestIdx >= 0 && bestScore >= 40) {
        usedSourceIdx.add(bestIdx);
        const src = sourceData[bestIdx];

        let status: MismatchType = 'match';
        let matchNote = '';
        
        if (mClass.time !== src.time) {
          status = 'time-mismatch';
        } else if (mClass.className !== src.className) {
          status = 'class-mismatch';
        } else {
          // Time and class match - this is considered a match even if trainer differs
          status = 'match';
          if (mClass.trainer !== src.trainer) {
            matchNote = 'trainer-substitution';
          }
        }

        rows.push({ day: mClass.day, momence: mClass, source: src, status, matchNote });
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

    // Sort by priority: matches first, then by day and time
    const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const statusPriority: { [key in MismatchType]: number } = {
      'match': 1,
      'trainer-mismatch': 2,
      'class-mismatch': 3,
      'time-mismatch': 4,
      'momence-only': 5,
      'source-only': 6
    };

    rows.sort((a, b) => {
      // First sort by day
      const da = dayOrder.indexOf(a.day);
      const db = dayOrder.indexOf(b.day);
      if (da !== db) return da - db;

      // Then by status priority (matches first)
      const statusDiff = statusPriority[a.status] - statusPriority[b.status];
      if (statusDiff !== 0) return statusDiff;

      // Finally by time
      const getTimeForSort = (row: typeof a) => {
        if (row.momence?.startsAt) {
          return new Date(row.momence.startsAt).getTime();
        }
        if (row.source?.time) {
          // Convert time string to comparable format
          const timeStr = row.source.time;
          const [time, period] = timeStr.split(' ');
          const [hours, minutes] = time.split(':').map(Number);
          let hour24 = hours;
          if (period === 'PM' && hours !== 12) hour24 += 12;
          if (period === 'AM' && hours === 12) hour24 = 0;
          return hour24 * 60 + minutes;
        }
        return 0;
      };
      
      return getTimeForSort(a) - getTimeForSort(b);
    });

    return rows;
  }, [filteredSessions, csvData, pdfData, compareWith]);

  // Get unique filter options
  const filterOptions = useMemo(() => {
    const locations = new Set<string>();
    const days = new Set<string>();
    const times = new Set<string>();
    const classes = new Set<string>();
    const trainers = new Set<string>();

    comparisonRows.forEach(row => {
      if (row.momence) {
        locations.add(row.momence.location);
        days.add(row.momence.day);
        times.add(row.momence.time);
        classes.add(row.momence.className);
        trainers.add(row.momence.trainer);
      }
      if (row.source) {
        locations.add(row.source.location);
        days.add(row.source.day);
        times.add(row.source.time);
        classes.add(row.source.className);
        trainers.add(row.source.trainer);
      }
    });

    return {
      locations: Array.from(locations).filter(Boolean).sort(),
      days: Array.from(days).sort((a, b) => {
        const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
        return dayOrder.indexOf(a) - dayOrder.indexOf(b);
      }),
      times: Array.from(times).filter(Boolean).sort(),
      classes: Array.from(classes).filter(Boolean).sort(),
      trainers: Array.from(trainers).filter(Boolean).sort()
    };
  }, [comparisonRows]);

  // Filtered rows
  const filteredRows = useMemo(() => {
    return comparisonRows.filter(row => {
      if (filterStatus !== 'all' && row.status !== filterStatus) return false;
      
      const momenceMatches = row.momence && (
        (filterLocation === 'all' || row.momence.location === filterLocation) &&
        (filterDay === 'all' || row.momence.day === filterDay) &&
        (filterTime === 'all' || row.momence.time === filterTime) &&
        (filterClass === 'all' || row.momence.className === filterClass) &&
        (filterTrainer === 'all' || row.momence.trainer === filterTrainer)
      );
      
      const sourceMatches = row.source && (
        (filterLocation === 'all' || row.source.location === filterLocation) &&
        (filterDay === 'all' || row.source.day === filterDay) &&
        (filterTime === 'all' || row.source.time === filterTime) &&
        (filterClass === 'all' || row.source.className === filterClass) &&
        (filterTrainer === 'all' || row.source.trainer === filterTrainer)
      );
      
      return momenceMatches || sourceMatches;
    });
  }, [comparisonRows, filterStatus, filterLocation, filterDay, filterTime, filterClass, filterTrainer]);

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
              {dataDateRange 
                ? `Filtered: ${dataDateRange.start.toLocaleDateString()} — ${dataDateRange.end.toLocaleDateString()} (${filteredSessions.length}/${sessions.length} sessions)`
                : startDate && endDate 
                  ? `${startDate} — ${endDate}` 
                  : 'Upload a PDF to set date range'
              }
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {filteredSessions.length > 0 && (csvData || pdfData) && (
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
            disabled={loading}
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
      {filteredSessions.length > 0 && comparisonRows.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <div className="surface-card hoverable p-3 text-center">
            <p className="text-xl font-bold font-display text-foreground">{filteredSessions.length}</p>
            <p className="text-[10px] text-muted-foreground font-medium">Filtered Momence</p>
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

      {/* Filter and View Controls */}
      {filteredSessions.length > 0 && (
        <div className="space-y-3">
          {/* Primary Status and View Filters */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex gap-1 p-1 surface-muted rounded-xl shadow-soft">
              <button onClick={() => setFilterStatus('all')} className={cn("px-3 py-1.5 rounded-md text-xs font-medium transition-all", filterStatus === 'all' ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>All</button>
              <button onClick={() => setFilterStatus('match')} className={cn("px-3 py-1.5 rounded-md text-xs font-medium transition-all", filterStatus === 'match' ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>Matches</button>
              <button onClick={() => setFilterStatus('trainer-mismatch')} className={cn("px-3 py-1.5 rounded-md text-xs font-medium transition-all", filterStatus === 'trainer-mismatch' ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>Trainer ≠</button>
              <button onClick={() => setFilterStatus('class-mismatch')} className={cn("px-3 py-1.5 rounded-md text-xs font-medium transition-all", filterStatus === 'class-mismatch' ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>Class ≠</button>
              <button onClick={() => setFilterStatus('momence-only')} className={cn("px-3 py-1.5 rounded-md text-xs font-medium transition-all", filterStatus === 'momence-only' ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>Momence Only</button>
              <button onClick={() => setFilterStatus('source-only')} className={cn("px-3 py-1.5 rounded-md text-xs font-medium transition-all", filterStatus === 'source-only' ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>{compareWith.toUpperCase()} Only</button>
            </div>
            <div className="flex gap-1 p-1 surface-muted rounded-xl shadow-soft">
              <button onClick={() => setGroupByDay(true)} className={cn("px-3 py-1.5 rounded-md text-xs font-medium transition-all", groupByDay ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>Group by Day</button>
              <button onClick={() => setGroupByDay(false)} className={cn("px-3 py-1.5 rounded-md text-xs font-medium transition-all", !groupByDay ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>Flat List</button>
            </div>
          </div>
          
          {/* Detailed Filters */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">Filter by:</span>
            </div>
            
            <Select value={filterLocation} onValueChange={setFilterLocation}>
              <SelectTrigger className="w-40 h-8">
                <SelectValue placeholder="Location" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Locations</SelectItem>
                {filterOptions.locations.map(loc => (
                  <SelectItem key={loc} value={loc}>{loc}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Select value={filterDay} onValueChange={setFilterDay}>
              <SelectTrigger className="w-32 h-8">
                <SelectValue placeholder="Day" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Days</SelectItem>
                {filterOptions.days.map(day => (
                  <SelectItem key={day} value={day}>{day.slice(0, 3)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Select value={filterTime} onValueChange={setFilterTime}>
              <SelectTrigger className="w-32 h-8">
                <SelectValue placeholder="Time" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Times</SelectItem>
                {filterOptions.times.map(time => (
                  <SelectItem key={time} value={time}>{time}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Select value={filterClass} onValueChange={setFilterClass}>
              <SelectTrigger className="w-48 h-8">
                <SelectValue placeholder="Class" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Classes</SelectItem>
                {filterOptions.classes.map(cls => (
                  <SelectItem key={cls} value={cls}>{cls}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Select value={filterTrainer} onValueChange={setFilterTrainer}>
              <SelectTrigger className="w-40 h-8">
                <SelectValue placeholder="Trainer" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Trainers</SelectItem>
                {filterOptions.trainers.map(trainer => (
                  <SelectItem key={trainer} value={trainer}>{trainer}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            {/* Clear Filters Button */}
            {(filterLocation !== 'all' || filterDay !== 'all' || filterTime !== 'all' || filterClass !== 'all' || filterTrainer !== 'all') && (
              <Button
                onClick={() => {
                  setFilterLocation('all');
                  setFilterDay('all');
                  setFilterTime('all');
                  setFilterClass('all');
                  setFilterTrainer('all');
                }}
                variant="outline"
                size="sm"
                className="h-8 px-2"
              >
                <X className="w-3 h-3" />
                Clear
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Sessions Table */}
      {filteredSessions.length > 0 ? (
        <div className="surface-card p-0 overflow-x-auto max-h-[600px] overflow-y-auto">
          <table className="table-premium table-head-dark table-responsive text-sm w-full min-w-[1600px]">
            <thead>
              <tr className="gradient-header-dark text-white sticky top-0 z-10">
                <th className="px-3 py-2 text-center font-semibold w-16">Status</th>
                {!groupByDay && <th className="px-3 py-2 text-left font-semibold w-20">Day</th>}
                <th className="px-3 py-2 text-left font-semibold w-24">Momence Time</th>
                <th className="px-3 py-2 text-left font-semibold min-w-[200px]">Momence Class</th>
                <th className="px-3 py-2 text-left font-semibold min-w-[140px]">Momence Trainer</th>
                <th className="px-3 py-2 text-left font-semibold min-w-[180px]">Momence Location</th>
                <th className="px-3 py-2 text-left font-semibold w-24">{compareWith.toUpperCase()} Time</th>
                <th className="px-3 py-2 text-left font-semibold min-w-[200px]">{compareWith.toUpperCase()} Class</th>
                <th className="px-3 py-2 text-left font-semibold min-w-[140px]">{compareWith.toUpperCase()} Trainer</th>
                <th className="px-3 py-2 text-left font-semibold min-w-[180px]">{compareWith.toUpperCase()} Location</th>
                <th className="px-3 py-2 text-center font-semibold w-20">Booked</th>
                <th className="px-3 py-2 text-left font-semibold min-w-[160px]">Match Reason</th>
              </tr>
            </thead>
              <tbody>
                {dayOrder.map(day => {
                  const dayRows = filteredRows.filter(r => r.day === day);
                  if (dayRows.length === 0) return null;

                  const getMatchReason = (row: typeof dayRows[0]) => {
                    if (row.status === 'match') {
                      if (row.matchNote === 'trainer-substitution') {
                        return 'Match (trainer substitution)';
                      }
                      return 'Perfect match';
                    }
                    if (row.status === 'trainer-mismatch') return 'Trainer name differs';
                    if (row.status === 'class-mismatch') return 'Class name differs';
                    if (row.status === 'time-mismatch') return 'Time differs';
                    if (row.status === 'momence-only') return 'Not found in ' + compareWith.toUpperCase();
                    if (row.status === 'source-only') return 'Not found in Momence';
                    return 'Unknown';
                  };

                  return (
                    <>
                      {groupByDay && (
                        <tr key={`${day}-header`}>
                          <td colSpan={12} className="px-3 py-2 bg-slate-100 border-y border-slate-300 font-display font-bold text-black">
                            {day}
                          </td>
                        </tr>
                      )}
                      {dayRows.map((row, idx) => {
                        const isMatch = row.status === 'match';
                        const isMomenceOnly = row.status === 'momence-only';
                        const isSourceOnly = row.status === 'source-only';

                        const rowBg = isMatch
                          ? 'bg-emerald-50/40 hover:bg-emerald-50/60 border-l-2 border-l-emerald-400'
                          : (isMomenceOnly || isSourceOnly)
                            ? 'bg-slate-50 hover:bg-slate-100 border-l-2 border-l-slate-300'
                            : 'bg-amber-50/30 hover:bg-amber-50/50 border-l-2 border-l-amber-400';

                        const statusIcon = isMatch
                          ? <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          : (isMomenceOnly || isSourceOnly)
                            ? <AlertTriangle className="w-4 h-4 text-amber-600" />
                            : <XCircle className="w-4 h-4 text-red-600" />;

                        return (
                          <tr key={`${day}-${idx}`} className={cn("border-b border-slate-200/70 transition-colors", rowBg)}>
                            <td className="px-3 py-3 text-center">{statusIcon}</td>
                            {!groupByDay && <td className="px-3 py-3 font-semibold text-black">{day.slice(0, 3)}</td>}
                            <td className={cn("px-3 py-3 font-mono text-black", !row.momence && "text-gray-500 bg-slate-100/70")}>
                              {row.momence?.time || '—'}
                            </td>
                            <td className={cn("px-3 py-3 text-black break-words", !row.momence && "text-gray-500 bg-slate-100/70")}>
                              {row.momence?.className || '—'}
                            </td>
                            <td className={cn("px-3 py-3 text-black", !row.momence && "text-gray-500 bg-slate-100/70")}>
                              {row.momence?.trainer || '—'}
                            </td>
                            <td className={cn("px-3 py-3 text-black break-words", !row.momence && "text-gray-500 bg-slate-100/70")}>
                              {row.momence?.location || '—'}
                            </td>
                            <td className={cn("px-3 py-3 font-mono text-black", !row.source && "text-gray-500 bg-slate-100/70")}>
                              {row.source?.time || '—'}
                            </td>
                            <td className={cn("px-3 py-3 text-black break-words", !row.source && "text-gray-500 bg-slate-100/70")}>
                              {row.source?.className || '—'}
                            </td>
                            <td className={cn("px-3 py-3 text-black", !row.source && "text-gray-500 bg-slate-100/70")}>
                              {row.source?.trainer || '—'}
                            </td>
                            <td className={cn("px-3 py-3 text-black break-words", !row.source && "text-gray-500 bg-slate-100/70")}>
                              {row.source?.location || '—'}
                            </td>
                            <td className="px-3 py-3 text-center">
                              {row.momence && (
                                <Badge variant="outline" className="text-[10px] bg-white/70">
                                  <Users className="w-3 h-3 mr-1" />
                                  {row.momence.bookingCount}/{row.momence.capacity}
                                </Badge>
                              )}
                            </td>
                            <td className="px-3 py-3 text-xs text-black break-words">
                              {getMatchReason(row)}
                            </td>
                          </tr>
                        );
                  })}
                  </>
                );
                })}
              </tbody>
            </table>
        </div>
      ) : !loading && (
        <div className="text-center py-16">
          <Globe className="w-12 h-12 mx-auto mb-4 text-muted-foreground/40" />
          <h4 className="font-display font-semibold text-foreground mb-1">No Sessions Loaded</h4>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            {startDate && endDate
              ? 'Click "Fetch Sessions" to load Momence class data for the schedule date range.'
              : 'Click "Fetch Sessions" to load Momence classes for the next 30 days.'}
          </p>
        </div>
      )}
    </div>
  );
}
