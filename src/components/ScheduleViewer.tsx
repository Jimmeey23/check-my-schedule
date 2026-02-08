import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  LayoutGrid, List, Clock, User, MapPin, Users, Building2,
  Search, Filter, Calendar, TrendingUp, BarChart3, X
} from 'lucide-react';
import type { WeekSchedule, ScheduleClass, DaySchedule, ScheduleViewMode, ScheduleFilters, ClassLevel } from '@/types/schedule';
import { normalizeClassName, normalizeTrainer, normalizeLocation, getClassLevel } from '@/lib/normalizers';

interface ScheduleViewerProps {
  schedule: WeekSchedule;
  title?: string;
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const viewModes: { id: ScheduleViewMode; label: string; icon: typeof LayoutGrid }[] = [
  { id: 'cards', label: 'Day Cards', icon: LayoutGrid },
  { id: 'grid', label: 'Timetable', icon: Calendar },
  { id: 'list', label: 'List', icon: List },
  { id: 'trainer', label: 'By Trainer', icon: Users },
  { id: 'location', label: 'By Location', icon: Building2 },
];

function getFilteredClasses(schedule: WeekSchedule, filters: ScheduleFilters): { day: string; cls: ScheduleClass }[] {
  const all: { day: string; cls: ScheduleClass }[] = [];
  for (const day of schedule.days) {
    for (const cls of day.classes) {
      if (filters.day && day.day !== filters.day) continue;
      if (filters.trainer && normalizeTrainer(cls.trainer) !== filters.trainer) continue;
      if (filters.location && normalizeLocation(cls.location) !== filters.location) continue;
      if (filters.className && normalizeClassName(cls.className) !== filters.className) continue;
      if (filters.level) {
        const level = getClassLevel(normalizeClassName(cls.className));
        if (level !== filters.level) continue;
      }
      if (filters.searchQuery) {
        const q = filters.searchQuery.toLowerCase();
        const matchesSearch = cls.className.toLowerCase().includes(q) ||
          cls.trainer.toLowerCase().includes(q) ||
          (cls.location?.toLowerCase().includes(q));
        if (!matchesSearch) continue;
      }
      all.push({ day: day.day, cls });
    }
  }
  return all;
}

function StatsBar({ schedule, filtered }: { schedule: WeekSchedule; filtered: { day: string; cls: ScheduleClass }[] }) {
  const totalClasses = schedule.days.reduce((sum, d) => sum + d.classes.length, 0);
  const uniqueTrainers = new Set(filtered.map(f => normalizeTrainer(f.cls.trainer))).size;
  const uniqueLocations = new Set(filtered.map(f => normalizeLocation(f.cls.location)).filter(Boolean)).size;
  const uniqueClasses = new Set(filtered.map(f => normalizeClassName(f.cls.className))).size;

  const stats = [
    { label: 'Showing', value: filtered.length, sub: `of ${totalClasses}`, icon: BarChart3 },
    { label: 'Class Types', value: uniqueClasses, icon: Calendar },
    { label: 'Trainers', value: uniqueTrainers, icon: Users },
    { label: 'Locations', value: uniqueLocations, icon: Building2 },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {stats.map(s => (
        <div key={s.label} className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50 border border-border/50">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <s.icon className="w-4 h-4 text-primary" />
          </div>
          <div>
            <p className="text-xl font-bold font-display text-foreground">{s.value}</p>
            <p className="text-xs text-muted-foreground">{s.label}{s.sub ? ` ${s.sub}` : ''}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function FilterBar({ schedule, filters, setFilters }: {
  schedule: WeekSchedule;
  filters: ScheduleFilters;
  setFilters: (f: ScheduleFilters) => void;
}) {
  const allClasses = useMemo(() => {
    const set = new Set<string>();
    schedule.days.forEach(d => d.classes.forEach(c => set.add(normalizeClassName(c.className))));
    return Array.from(set).sort();
  }, [schedule]);

  const allTrainers = useMemo(() => {
    const set = new Set<string>();
    schedule.days.forEach(d => d.classes.forEach(c => set.add(normalizeTrainer(c.trainer))));
    return Array.from(set).sort();
  }, [schedule]);

  const allLocations = useMemo(() => {
    const set = new Set<string>();
    schedule.days.forEach(d => d.classes.forEach(c => {
      const loc = normalizeLocation(c.location);
      if (loc) set.add(loc);
    }));
    return Array.from(set).sort();
  }, [schedule]);

  const hasFilters = filters.day || filters.className || filters.trainer || filters.location || filters.level || filters.searchQuery;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search classes, trainers..."
            value={filters.searchQuery}
            onChange={e => setFilters({ ...filters, searchQuery: e.target.value })}
            className="pl-9 h-9 bg-secondary/30"
          />
        </div>
        <Select value={filters.day || 'all'} onValueChange={v => setFilters({ ...filters, day: v === 'all' ? null : v })}>
          <SelectTrigger className="w-[140px] h-9 bg-secondary/30"><SelectValue placeholder="Day" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Days</SelectItem>
            {DAYS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filters.className || 'all'} onValueChange={v => setFilters({ ...filters, className: v === 'all' ? null : v })}>
          <SelectTrigger className="w-[180px] h-9 bg-secondary/30"><SelectValue placeholder="Class" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Classes</SelectItem>
            {allClasses.map(c => <SelectItem key={c} value={c}>{c.replace('Studio ', '')}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filters.trainer || 'all'} onValueChange={v => setFilters({ ...filters, trainer: v === 'all' ? null : v })}>
          <SelectTrigger className="w-[160px] h-9 bg-secondary/30"><SelectValue placeholder="Trainer" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Trainers</SelectItem>
            {allTrainers.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        {allLocations.length > 1 && (
          <Select value={filters.location || 'all'} onValueChange={v => setFilters({ ...filters, location: v === 'all' ? null : v })}>
            <SelectTrigger className="w-[180px] h-9 bg-secondary/30"><SelectValue placeholder="Location" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Locations</SelectItem>
              {allLocations.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Select value={filters.level || 'all'} onValueChange={v => setFilters({ ...filters, level: v === 'all' ? null : v as ClassLevel })}>
          <SelectTrigger className="w-[130px] h-9 bg-secondary/30"><SelectValue placeholder="Level" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Levels</SelectItem>
            <SelectItem value="beginner">Beginner</SelectItem>
            <SelectItem value="intermediate">Intermediate</SelectItem>
            <SelectItem value="advanced">Advanced</SelectItem>
          </SelectContent>
        </Select>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={() => setFilters({ day: null, className: null, trainer: null, location: null, level: null, searchQuery: '' })} className="h-9 gap-1 text-muted-foreground">
            <X className="w-3.5 h-3.5" /> Clear
          </Button>
        )}
      </div>
    </div>
  );
}

// ============ VIEW COMPONENTS ============

function ClassCard({ cls, showDay, day }: { cls: ScheduleClass; showDay?: boolean; day?: string }) {
  const normalized = normalizeClassName(cls.className);
  const level = getClassLevel(normalized);
  return (
    <div className="p-3 rounded-lg border bg-card hover:shadow-card transition-all group">
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-2">
          <Clock className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">{cls.time}</span>
          {showDay && day && <Badge variant="outline" className="text-[10px]">{day.slice(0, 3)}</Badge>}
        </div>
        {level && (
          <Badge variant="outline" className={cn("text-[10px] uppercase tracking-wider",
            level === 'beginner' && "border-level-beginner/30 text-level-beginner bg-level-beginner/10",
            level === 'intermediate' && "border-level-intermediate/30 text-level-intermediate bg-level-intermediate/10",
            level === 'advanced' && "border-level-advanced/30 text-level-advanced bg-level-advanced/10"
          )}>{level}</Badge>
        )}
      </div>
      <p className="font-medium text-foreground text-sm">{normalized.replace('Studio ', '')}</p>
      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><User className="w-3 h-3" />{normalizeTrainer(cls.trainer)}</span>
        {cls.location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{normalizeLocation(cls.location)}</span>}
      </div>
    </div>
  );
}

function DayCardsView({ schedule, filtered }: { schedule: WeekSchedule; filtered: { day: string; cls: ScheduleClass }[] }) {
  const byDay = useMemo(() => {
    const map = new Map<string, ScheduleClass[]>();
    for (const { day, cls } of filtered) {
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(cls);
    }
    return DAYS.filter(d => map.has(d)).map(d => ({ day: d, classes: map.get(d)! }));
  }, [filtered]);

  return (
    <div className="space-y-4">
      {byDay.map(({ day, classes }) => (
        <div key={day} className="rounded-xl border overflow-hidden">
          <div className="bg-primary text-primary-foreground px-4 py-3 flex items-center justify-between">
            <h4 className="font-display font-semibold">{day}</h4>
            <Badge variant="secondary" className="bg-primary-foreground/20 text-primary-foreground border-0">{classes.length}</Badge>
          </div>
          <div className="p-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {classes.map(cls => <ClassCard key={cls.id} cls={cls} />)}
          </div>
        </div>
      ))}
      {byDay.length === 0 && <p className="text-center py-8 text-muted-foreground">No classes match your filters</p>}
    </div>
  );
}

function GridView({ filtered }: { filtered: { day: string; cls: ScheduleClass }[] }) {
  const { timeSlots, grid } = useMemo(() => {
    const times = new Set<string>();
    const g = new Map<string, Map<string, ScheduleClass[]>>();
    for (const { day, cls } of filtered) {
      const time = cls.time;
      times.add(time);
      if (!g.has(time)) g.set(time, new Map());
      if (!g.get(time)!.has(day)) g.get(time)!.set(day, []);
      g.get(time)!.get(day)!.push(cls);
    }
    const sortedTimes = Array.from(times).sort();
    return { timeSlots: sortedTimes, grid: g };
  }, [filtered]);

  const activeDays = useMemo(() => DAYS.filter(d => filtered.some(f => f.day === d)), [filtered]);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b bg-secondary/50">
            <th className="p-2 text-left font-medium text-muted-foreground w-24 sticky left-0 bg-secondary/50">Time</th>
            {activeDays.map(d => (
              <th key={d} className="p-2 text-left font-medium text-muted-foreground min-w-[150px]">{d.slice(0, 3)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {timeSlots.map(time => (
            <tr key={time} className="border-b hover:bg-secondary/30 transition-colors">
              <td className="p-2 font-medium text-xs text-muted-foreground whitespace-nowrap sticky left-0 bg-card">{time}</td>
              {activeDays.map(day => {
                const classes = grid.get(time)?.get(day) || [];
                return (
                  <td key={day} className="p-1">
                    {classes.map(cls => {
                      const level = getClassLevel(normalizeClassName(cls.className));
                      return (
                        <div key={cls.id} className={cn("p-1.5 rounded text-xs mb-1",
                          level === 'beginner' && "bg-level-beginner/10 border border-level-beginner/20",
                          level === 'intermediate' && "bg-level-intermediate/10 border border-level-intermediate/20",
                          level === 'advanced' && "bg-level-advanced/10 border border-level-advanced/20",
                          !level && "bg-secondary/50 border"
                        )}>
                          <p className="font-medium truncate">{normalizeClassName(cls.className).replace('Studio ', '')}</p>
                          <p className="text-muted-foreground truncate">{normalizeTrainer(cls.trainer)}</p>
                        </div>
                      );
                    })}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {timeSlots.length === 0 && <p className="text-center py-8 text-muted-foreground">No classes match your filters</p>}
    </div>
  );
}

function ListView({ filtered }: { filtered: { day: string; cls: ScheduleClass }[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-secondary/50 text-left">
            <th className="p-3 font-medium text-muted-foreground">Day</th>
            <th className="p-3 font-medium text-muted-foreground">Time</th>
            <th className="p-3 font-medium text-muted-foreground">Class</th>
            <th className="p-3 font-medium text-muted-foreground">Trainer</th>
            <th className="p-3 font-medium text-muted-foreground">Location</th>
            <th className="p-3 font-medium text-muted-foreground">Level</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map(({ day, cls }) => {
            const normalized = normalizeClassName(cls.className);
            const level = getClassLevel(normalized);
            return (
              <tr key={cls.id} className="border-b hover:bg-secondary/30 transition-colors">
                <td className="p-3 text-muted-foreground">{day.slice(0, 3)}</td>
                <td className="p-3 font-medium">{cls.time}</td>
                <td className="p-3 font-medium">{normalized.replace('Studio ', '')}</td>
                <td className="p-3">{normalizeTrainer(cls.trainer)}</td>
                <td className="p-3 text-muted-foreground">{normalizeLocation(cls.location) || '—'}</td>
                <td className="p-3">
                  {level && <Badge variant="outline" className={cn("text-[10px] capitalize",
                    level === 'beginner' && "border-level-beginner/30 text-level-beginner bg-level-beginner/10",
                    level === 'intermediate' && "border-level-intermediate/30 text-level-intermediate bg-level-intermediate/10",
                    level === 'advanced' && "border-level-advanced/30 text-level-advanced bg-level-advanced/10"
                  )}>{level}</Badge>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {filtered.length === 0 && <p className="text-center py-8 text-muted-foreground">No classes match your filters</p>}
    </div>
  );
}

function TrainerView({ filtered }: { filtered: { day: string; cls: ScheduleClass }[] }) {
  const byTrainer = useMemo(() => {
    const map = new Map<string, { day: string; cls: ScheduleClass }[]>();
    for (const item of filtered) {
      const trainer = normalizeTrainer(item.cls.trainer);
      if (!map.has(trainer)) map.set(trainer, []);
      map.get(trainer)!.push(item);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [filtered]);

  return (
    <div className="space-y-4">
      {byTrainer.map(([trainer, items]) => (
        <div key={trainer} className="rounded-xl border overflow-hidden">
          <div className="bg-secondary px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-primary" />
              <h4 className="font-display font-semibold text-foreground">{trainer}</h4>
            </div>
            <Badge variant="outline">{items.length} classes</Badge>
          </div>
          <div className="p-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {items.map(({ day, cls }) => <ClassCard key={cls.id} cls={cls} showDay day={day} />)}
          </div>
        </div>
      ))}
      {byTrainer.length === 0 && <p className="text-center py-8 text-muted-foreground">No classes match your filters</p>}
    </div>
  );
}

function LocationView({ filtered }: { filtered: { day: string; cls: ScheduleClass }[] }) {
  const byLocation = useMemo(() => {
    const map = new Map<string, { day: string; cls: ScheduleClass }[]>();
    for (const item of filtered) {
      const loc = normalizeLocation(item.cls.location) || 'Unspecified';
      if (!map.has(loc)) map.set(loc, []);
      map.get(loc)!.push(item);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [filtered]);

  return (
    <div className="space-y-4">
      {byLocation.map(([location, items]) => (
        <div key={location} className="rounded-xl border overflow-hidden">
          <div className="bg-secondary px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-primary" />
              <h4 className="font-display font-semibold text-foreground">{location}</h4>
            </div>
            <Badge variant="outline">{items.length} classes</Badge>
          </div>
          <div className="p-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {items.map(({ day, cls }) => <ClassCard key={cls.id} cls={cls} showDay day={day} />)}
          </div>
        </div>
      ))}
      {byLocation.length === 0 && <p className="text-center py-8 text-muted-foreground">No classes match your filters</p>}
    </div>
  );
}

// ============ MAIN COMPONENT ============

export function ScheduleViewer({ schedule, title }: ScheduleViewerProps) {
  const [viewMode, setViewMode] = useState<ScheduleViewMode>('cards');
  const [filters, setFilters] = useState<ScheduleFilters>({
    day: null, className: null, trainer: null, location: null, level: null, searchQuery: ''
  });

  const filtered = useMemo(() => getFilteredClasses(schedule, filters), [schedule, filters]);

  const totalClasses = schedule.days.reduce((sum, d) => sum + d.classes.length, 0);
  if (totalClasses === 0) {
    return <div className="text-center py-12 text-muted-foreground">No schedule data available</div>;
  }

  return (
    <div className="space-y-5">
      {title && (
        <div className="flex items-center justify-between">
          <h3 className="font-display font-bold text-lg text-foreground">{title}</h3>
          <Badge variant="secondary" className="font-mono">{totalClasses} classes</Badge>
        </div>
      )}

      <StatsBar schedule={schedule} filtered={filtered} />
      <FilterBar schedule={schedule} filters={filters} setFilters={setFilters} />

      {/* View Mode Selector */}
      <div className="flex gap-1 p-1 bg-secondary/50 rounded-lg w-fit">
        {viewModes.map(mode => (
          <button
            key={mode.id}
            onClick={() => setViewMode(mode.id)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all",
              viewMode === mode.id
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <mode.icon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{mode.label}</span>
          </button>
        ))}
      </div>

      <ScrollArea className="h-[600px]">
        <div className="pr-4">
          {viewMode === 'cards' && <DayCardsView schedule={schedule} filtered={filtered} />}
          {viewMode === 'grid' && <GridView filtered={filtered} />}
          {viewMode === 'list' && <ListView filtered={filtered} />}
          {viewMode === 'trainer' && <TrainerView filtered={filtered} />}
          {viewMode === 'location' && <LocationView filtered={filtered} />}
        </div>
      </ScrollArea>
    </div>
  );
}
