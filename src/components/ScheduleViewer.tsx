import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  LayoutGrid, List, Clock, User, MapPin, Users, Building2,
  Search, Filter, Calendar, TrendingUp, BarChart3, X, ChevronDown, ChevronUp
} from 'lucide-react';
import type { WeekSchedule, ScheduleClass, DaySchedule, ScheduleViewMode, ScheduleFilters, ClassLevel } from '@/types/schedule';
import { normalizeClassName, normalizeTrainer, normalizeLocation, getClassLevel } from '@/lib/normalizers';

interface ScheduleViewerProps {
  schedule: WeekSchedule;
  title?: string;
  locationFilter?: string;
  defaultViewMode?: ScheduleViewMode;
  groupListByDay?: boolean;
}

type ListGrouping = 'none' | 'day' | 'location' | 'trainer' | 'level';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const viewModes: { id: ScheduleViewMode; label: string; icon: typeof LayoutGrid }[] = [
  { id: 'cards', label: 'Day Cards', icon: LayoutGrid },
  { id: 'grid', label: 'Timetable', icon: Calendar },
  { id: 'list', label: 'List', icon: List },
  { id: 'trainer', label: 'By Trainer', icon: Users },
  { id: 'location', label: 'By Location', icon: Building2 },
];

function getFilteredClasses(schedule: WeekSchedule, filters: ScheduleFilters, locationFilter = 'all'): { day: string; cls: ScheduleClass }[] {
  const all: { day: string; cls: ScheduleClass }[] = [];
  for (const day of schedule.days) {
    for (const cls of day.classes) {
      if (filters.day && day.day !== filters.day) continue;
      if (filters.trainer && normalizeTrainer(cls.trainer) !== filters.trainer) continue;
      if (locationFilter !== 'all' && normalizeLocation(cls.location) !== locationFilter) continue;
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
        <div key={s.label} className="flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-gradient-to-b from-white to-slate-50/80 p-3 shadow-sm transition-all hover:shadow-md">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <s.icon className="w-4 h-4 text-primary icon-tilt" />
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

function FilterBar({ schedule, filters, setFilters, locationFilter = 'all' }: {
  schedule: WeekSchedule;
  filters: ScheduleFilters;
  setFilters: (f: ScheduleFilters) => void;
  locationFilter?: string;
}) {
  const allClasses = useMemo(() => {
    const set = new Set<string>();
    schedule.days.forEach(d => d.classes.forEach(c => {
      const name = normalizeClassName(c.className);
      if (name && name.trim() !== '') set.add(name);
    }));
    return Array.from(set).sort();
  }, [schedule]);

  const allTrainers = useMemo(() => {
    const set = new Set<string>();
    schedule.days.forEach(d => d.classes.forEach(c => {
      const trainer = normalizeTrainer(c.trainer);
      if (trainer && trainer.trim() !== '') set.add(trainer);
    }));
    return Array.from(set).sort();
  }, [schedule]);

  const allLocations = useMemo(() => {
    const set = new Set<string>();
    schedule.days.forEach(d => d.classes.forEach(c => {
      const loc = normalizeLocation(c.location);
      if (loc && loc.trim() !== '') set.add(loc);
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
            className="pl-9 h-10 rounded-2xl border-slate-200 bg-white shadow-sm"
          />
        </div>
        <Select value={filters.day || 'all'} onValueChange={v => setFilters({ ...filters, day: v === 'all' ? null : v })}>
          <SelectTrigger className="w-[140px] h-10 rounded-2xl bg-white border-slate-200 shadow-sm"><SelectValue placeholder="Day" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Days</SelectItem>
            {DAYS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filters.className || 'all'} onValueChange={v => setFilters({ ...filters, className: v === 'all' ? null : v })}>
          <SelectTrigger className="w-[180px] h-10 rounded-2xl bg-white border-slate-200 shadow-sm"><SelectValue placeholder="Class" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Classes</SelectItem>
            {allClasses.map(c => <SelectItem key={c} value={c}>{c.replace('Studio ', '')}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filters.trainer || 'all'} onValueChange={v => setFilters({ ...filters, trainer: v === 'all' ? null : v })}>
          <SelectTrigger className="w-[160px] h-10 rounded-2xl bg-white border-slate-200 shadow-sm"><SelectValue placeholder="Trainer" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Trainers</SelectItem>
            {allTrainers.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        {allLocations.length > 1 && (
          <Select value={filters.location || 'all'} onValueChange={v => setFilters({ ...filters, location: v === 'all' ? null : v })}>
            <SelectTrigger className="w-[180px] h-10 rounded-2xl bg-white border-slate-200 shadow-sm" disabled={locationFilter !== 'all'}><SelectValue placeholder="Location" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Locations</SelectItem>
              {allLocations.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Select value={filters.level || 'all'} onValueChange={v => setFilters({ ...filters, level: v === 'all' ? null : v as ClassLevel })}>
          <SelectTrigger className="w-[130px] h-10 rounded-2xl bg-white border-slate-200 shadow-sm"><SelectValue placeholder="Level" /></SelectTrigger>
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
    <div className="group rounded-2xl border border-slate-200/80 bg-gradient-to-b from-white to-slate-50/70 p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-700 whitespace-nowrap">
            <Clock className="h-3.5 w-3.5 text-slate-500" />
            {cls.time}
          </span>
          {showDay && day && <span className="inline-flex rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] font-medium text-slate-500">{day.slice(0, 3)}</span>}
        </div>
        {level && (
          <span className={cn("inline-flex rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap",
            level === 'beginner' && "border-level-beginner/30 text-level-beginner bg-level-beginner/10",
            level === 'intermediate' && "border-level-intermediate/30 text-level-intermediate bg-level-intermediate/10",
            level === 'advanced' && "border-level-advanced/30 text-level-advanced bg-level-advanced/10"
          )}>{level}</span>
        )}
      </div>
      <p className="font-medium text-foreground text-sm leading-snug">{normalized.replace('Studio ', '')}</p>
      <div className="mt-2 space-y-1.5 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><User className="w-3 h-3" />{normalizeTrainer(cls.trainer)}</span>
        {cls.location && <span className="flex items-center gap-1.5"><MapPin className="w-3 h-3" />{normalizeLocation(cls.location)}</span>}
      </div>
    </div>
  );
}

function DayCardsView({ schedule, filtered }: { schedule: WeekSchedule; filtered: { day: string; cls: ScheduleClass }[] }) {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
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
        <div key={day} className="overflow-hidden rounded-[24px] border border-slate-200/80 bg-white shadow-sm">
          <button
            type="button"
            onClick={() => setCollapsedGroups(current => {
              const next = new Set(current);
              if (next.has(day)) next.delete(day); else next.add(day);
              return next;
            })}
            className="w-full bg-gradient-to-r from-slate-950 via-slate-900 to-slate-800 px-4 py-3 text-white flex items-center justify-between"
          >
            <h4 className="font-display font-semibold">{day}</h4>
            <div className="flex items-center gap-3 text-xs text-slate-200">
              <span>{classes.length} classes</span>
              <span>{new Set(classes.map(cls => normalizeTrainer(cls.trainer))).size} trainers</span>
              {collapsedGroups.has(day) ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            </div>
          </button>
          {!collapsedGroups.has(day) && (
            <div className="bg-slate-50/60 p-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {classes.map(cls => <ClassCard key={cls.id} cls={cls} />)}
            </div>
          )}
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
    <div className="overflow-x-auto rounded-[24px] border border-slate-200/80 bg-white shadow-sm">
      <table className="table-premium table-auto w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50">
            <th className="sticky top-0 z-20 w-12 bg-slate-50 p-3 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">#</th>
            <th className="sticky top-0 left-0 z-20 w-24 bg-slate-50 p-3 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Time</th>
            {activeDays.map(d => (
              <th key={d} className="sticky top-0 z-10 min-w-[170px] bg-slate-50 p-3 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{d.slice(0, 3)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {timeSlots.map((time, rowIndex) => (
            <tr key={time} className="border-b border-slate-100 transition-colors hover:bg-slate-50/40">
              <td className="bg-white p-3 text-xs font-semibold text-slate-400 whitespace-nowrap">{rowIndex + 1}</td>
              <td className="sticky left-0 bg-white p-3 font-medium text-xs text-slate-500 whitespace-nowrap">{time}</td>
              {activeDays.map(day => {
                const classes = grid.get(time)?.get(day) || [];
                return (
                  <td key={day} className="p-2 align-top">
                    {classes.map(cls => {
                      const level = getClassLevel(normalizeClassName(cls.className));
                      return (
                        <div key={cls.id} className={cn("mb-1.5 rounded-xl border p-2 text-xs shadow-sm",
                          level === 'beginner' && "border-level-beginner/20 bg-level-beginner/10",
                          level === 'intermediate' && "border-level-intermediate/20 bg-level-intermediate/10",
                          level === 'advanced' && "border-level-advanced/20 bg-level-advanced/10",
                          !level && "border-slate-200 bg-slate-50"
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

function ListView({ filtered, groupBy }: { filtered: { day: string; cls: ScheduleClass }[]; groupBy: ListGrouping }) {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const grouped = useMemo(() => {
    if (groupBy === 'none') return [];

    const map = new Map<string, { day: string; cls: ScheduleClass }[]>();
    filtered.forEach(item => {
      const key = groupBy === 'day'
        ? item.day
        : groupBy === 'location'
          ? normalizeLocation(item.cls.location) || 'Unspecified'
          : groupBy === 'trainer'
            ? normalizeTrainer(item.cls.trainer) || 'Unassigned'
            : getClassLevel(normalizeClassName(item.cls.className)) || 'unclassified';

      const bucket = map.get(key) || [];
      bucket.push(item);
      map.set(key, bucket);
    });

    const entries = Array.from(map.entries());
    if (groupBy === 'day') {
      entries.sort((a, b) => DAYS.indexOf(a[0]) - DAYS.indexOf(b[0]));
    } else {
      entries.sort((a, b) => a[0].localeCompare(b[0]));
    }

    return entries.map(([label, items]) => ({ label, items }));
  }, [filtered, groupBy]);

  return (
    <div className="overflow-x-auto rounded-[24px] border border-slate-200/80 bg-white shadow-sm">
      <table className="table-premium table-auto w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-left text-[11px] uppercase tracking-[0.16em]">
            <th className="sticky top-0 z-10 bg-slate-50 p-3 font-semibold text-slate-500 w-12">#</th>
            <th className="sticky top-0 z-10 bg-slate-50 p-3 font-semibold text-slate-500">Day</th>
            <th className="sticky top-0 z-10 bg-slate-50 p-3 font-semibold text-slate-500">Time</th>
            <th className="sticky top-0 z-10 bg-slate-50 p-3 font-semibold text-slate-500">Class</th>
            <th className="sticky top-0 z-10 bg-slate-50 p-3 font-semibold text-slate-500">Trainer</th>
            <th className="sticky top-0 z-10 bg-slate-50 p-3 font-semibold text-slate-500">Location</th>
            <th className="sticky top-0 z-10 bg-slate-50 p-3 font-semibold text-slate-500">Level</th>
          </tr>
        </thead>
        <tbody>
          {(groupBy !== 'none' ? grouped.flatMap(({ label, items }) => {
            const trainerCount = new Set(items.map(item => normalizeTrainer(item.cls.trainer))).size;
            const locationCount = new Set(items.map(item => normalizeLocation(item.cls.location)).filter(Boolean)).size;
            const isCollapsed = collapsedGroups.has(label);

            return [
              <tr key={`${label}-group`} className="border-b border-slate-200 bg-gradient-to-r from-slate-100 to-slate-50">
                <td colSpan={7} className="px-4 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setCollapsedGroups(current => {
                        const next = new Set(current);
                        if (next.has(label)) next.delete(label); else next.add(label);
                        return next;
                      })}
                      className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-600"
                    >
                      {label}
                      {isCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                    </button>
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                      <span>{items.length} classes</span>
                      <span>{trainerCount} trainers</span>
                      <span>{locationCount} locations</span>
                    </div>
                  </div>
                </td>
              </tr>,
              ...(isCollapsed ? [] : items.map(({ day, cls }, itemIndex) => {
                const normalized = normalizeClassName(cls.className);
                const level = getClassLevel(normalized);
                return (
                  <tr key={cls.id} className="border-b border-slate-100 bg-white hover:bg-slate-50/70 transition-colors">
                    <td className="p-3 text-xs font-semibold text-slate-400 whitespace-nowrap">{itemIndex + 1}</td>
                    <td className="p-3 text-slate-500 whitespace-nowrap">{day.slice(0, 3)}</td>
                    <td className="p-3 font-medium whitespace-nowrap">{cls.time}</td>
                    <td className="p-3 font-medium max-w-[240px]"><span className="block truncate" title={normalized.replace('Studio ', '')}>{normalized.replace('Studio ', '')}</span></td>
                    <td className="p-3 max-w-[180px]"><span className="block truncate" title={normalizeTrainer(cls.trainer)}>{normalizeTrainer(cls.trainer)}</span></td>
                    <td className="p-3 text-slate-500 max-w-[220px]"><span className="block truncate" title={normalizeLocation(cls.location) || '—'}>{normalizeLocation(cls.location) || '—'}</span></td>
                    <td className="p-3 text-slate-600 capitalize whitespace-nowrap">{level || '—'}</td>
                  </tr>
                );
              }))
            ];
          }) : filtered.map(({ day, cls }, rowIndex) => {
            const normalized = normalizeClassName(cls.className);
            const level = getClassLevel(normalized);
            return (
              <tr key={cls.id} className="border-b border-slate-100 bg-white hover:bg-slate-50/70 transition-colors">
                <td className="p-3 text-xs font-semibold text-slate-400 whitespace-nowrap">{rowIndex + 1}</td>
                <td className="p-3 text-slate-500 whitespace-nowrap">{day.slice(0, 3)}</td>
                <td className="p-3 font-medium whitespace-nowrap">{cls.time}</td>
                <td className="p-3 font-medium max-w-[240px]"><span className="block truncate" title={normalized.replace('Studio ', '')}>{normalized.replace('Studio ', '')}</span></td>
                <td className="p-3 max-w-[180px]"><span className="block truncate" title={normalizeTrainer(cls.trainer)}>{normalizeTrainer(cls.trainer)}</span></td>
                <td className="p-3 text-slate-500 max-w-[220px]"><span className="block truncate" title={normalizeLocation(cls.location) || '—'}>{normalizeLocation(cls.location) || '—'}</span></td>
                <td className="p-3 text-slate-600 capitalize whitespace-nowrap">{level || '—'}</td>
              </tr>
            );
          }))}
        </tbody>
      </table>
      {filtered.length === 0 && <p className="text-center py-8 text-muted-foreground">No classes match your filters</p>}
    </div>
  );
}

function TrainerView({ filtered }: { filtered: { day: string; cls: ScheduleClass }[] }) {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
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
        <div key={trainer} className="overflow-hidden rounded-[24px] border border-slate-200/80 bg-white shadow-sm">
          <button
            type="button"
            onClick={() => setCollapsedGroups(current => {
              const next = new Set(current);
              if (next.has(trainer)) next.delete(trainer); else next.add(trainer);
              return next;
            })}
            className="w-full bg-gradient-to-r from-white to-slate-50 px-4 py-3 flex items-center justify-between border-b border-slate-200"
          >
            <div className="flex items-center gap-2 text-left">
              <User className="w-4 h-4 text-primary" />
              <h4 className="font-display font-semibold text-foreground">{trainer}</h4>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span>{items.length} classes</span>
              <span>{new Set(items.map(item => item.day)).size} days</span>
              {collapsedGroups.has(trainer) ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            </div>
          </button>
          {!collapsedGroups.has(trainer) && (
            <div className="bg-slate-50/50 p-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {items.map(({ day, cls }) => <ClassCard key={cls.id} cls={cls} showDay day={day} />)}
            </div>
          )}
        </div>
      ))}
      {byTrainer.length === 0 && <p className="text-center py-8 text-muted-foreground">No classes match your filters</p>}
    </div>
  );
}

function LocationView({ filtered }: { filtered: { day: string; cls: ScheduleClass }[] }) {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
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
        <div key={location} className="overflow-hidden rounded-[24px] border border-slate-200/80 bg-white shadow-sm">
          <button
            type="button"
            onClick={() => setCollapsedGroups(current => {
              const next = new Set(current);
              if (next.has(location)) next.delete(location); else next.add(location);
              return next;
            })}
            className="w-full bg-gradient-to-r from-white to-slate-50 px-4 py-3 flex items-center justify-between border-b border-slate-200"
          >
            <div className="flex items-center gap-2 text-left">
              <Building2 className="w-4 h-4 text-primary" />
              <h4 className="font-display font-semibold text-foreground">{location}</h4>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span>{items.length} classes</span>
              <span>{new Set(items.map(item => normalizeTrainer(item.cls.trainer))).size} trainers</span>
              {collapsedGroups.has(location) ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            </div>
          </button>
          {!collapsedGroups.has(location) && (
            <div className="bg-slate-50/50 p-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {items.map(({ day, cls }) => <ClassCard key={cls.id} cls={cls} showDay day={day} />)}
            </div>
          )}
        </div>
      ))}
      {byLocation.length === 0 && <p className="text-center py-8 text-muted-foreground">No classes match your filters</p>}
    </div>
  );
}

// ============ MAIN COMPONENT ============

export function ScheduleViewer({ schedule, title, locationFilter = 'all', defaultViewMode = 'cards', groupListByDay = false }: ScheduleViewerProps) {
  const [viewMode, setViewMode] = useState<ScheduleViewMode>(defaultViewMode);
  const [listGrouping, setListGrouping] = useState<ListGrouping>(groupListByDay ? 'day' : 'none');
  const [filters, setFilters] = useState<ScheduleFilters>({
    day: null, className: null, trainer: null, location: null, level: null, searchQuery: ''
  });

  const filtered = useMemo(() => getFilteredClasses(schedule, filters, locationFilter), [schedule, filters, locationFilter]);

  const totalClasses = schedule.days.reduce((sum, d) => sum + d.classes.length, 0);
  if (totalClasses === 0) {
    return <div className="text-center py-12 text-muted-foreground">No schedule data available</div>;
  }

  return (
    <div className="space-y-5">
      {title && (
        <div className="flex items-center justify-between">
          <h3 className="font-display font-bold text-lg text-foreground">{title}</h3>
          <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-mono text-slate-600 shadow-sm">{totalClasses} classes</span>
        </div>
      )}

      <StatsBar schedule={schedule} filtered={filtered} />
      <FilterBar schedule={schedule} filters={filters} setFilters={setFilters} locationFilter={locationFilter} />

      {/* View Mode Selector */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-slate-200/80 bg-gradient-to-b from-white to-slate-50/80 p-2 shadow-sm">
        <div className="flex gap-1 rounded-2xl border border-slate-200 bg-white p-1 shadow-sm w-fit">
          {viewModes.map(mode => (
            <button
              key={mode.id}
              onClick={() => setViewMode(mode.id)}
              className={cn(
                "flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition-all",
                viewMode === mode.id
                  ? "bg-slate-900 text-white shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <mode.icon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{mode.label}</span>
            </button>
          ))}
        </div>

        {viewMode === 'list' && (
          <Select value={listGrouping} onValueChange={value => setListGrouping(value as ListGrouping)}>
            <SelectTrigger className="w-[190px] h-10 rounded-2xl bg-white border-slate-200 shadow-sm text-xs">
              <SelectValue placeholder="List grouping" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No grouping</SelectItem>
              <SelectItem value="day">Group by day</SelectItem>
              <SelectItem value="location">Group by location</SelectItem>
              <SelectItem value="trainer">Group by trainer</SelectItem>
              <SelectItem value="level">Group by level</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>

      <ScrollArea className="h-[600px]">
        <div className="pr-4">
          {viewMode === 'cards' && <DayCardsView schedule={schedule} filtered={filtered} />}
          {viewMode === 'grid' && <GridView filtered={filtered} />}
          {viewMode === 'list' && <ListView filtered={filtered} groupBy={listGrouping} />}
          {viewMode === 'trainer' && <TrainerView filtered={filtered} />}
          {viewMode === 'location' && <LocationView filtered={filtered} />}
        </div>
      </ScrollArea>
    </div>
  );
}
