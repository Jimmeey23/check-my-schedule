import { Calendar, Users, Clock, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WeekSchedule } from '@/types/schedule';

interface StatsCardsProps {
  schedule: WeekSchedule | null;
}

export function StatsCards({ schedule }: StatsCardsProps) {
  const stats = schedule ? {
    totalClasses: schedule.days.reduce((acc, day) => acc + day.classes.length, 0),
    totalDays: schedule.days.filter(d => d.classes.length > 0).length,
    uniqueTrainers: new Set(schedule.days.flatMap(d => d.classes.map(c => c.trainer))).size,
    avgPerDay: Math.round(schedule.days.reduce((acc, day) => acc + day.classes.length, 0) / schedule.days.filter(d => d.classes.length > 0).length),
  } : null;

  const cards = [
    {
      label: 'Total Classes',
      value: stats?.totalClasses ?? '—',
      icon: Calendar,
      accent: 'border-l-[#0353A4]',
    },
    {
      label: 'Active Days',
      value: stats?.totalDays ?? '—',
      icon: Clock,
      accent: 'border-l-cyan-500',
    },
    {
      label: 'Trainers',
      value: stats?.uniqueTrainers ?? '—',
      icon: Users,
      accent: 'border-l-emerald-500',
    },
    {
      label: 'Avg/Day',
      value: stats?.avgPerDay ?? '—',
      icon: TrendingUp,
      accent: 'border-l-amber-500',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {cards.map((card, i) => (
        <div 
          key={card.label}
          className={cn(
            "group relative p-6 border-l-4 overflow-hidden animate-fade-in",
            "surface-card hoverable",
            card.accent
          )}
          style={{ animationDelay: `${i * 50}ms` }}
        >
          <div className="flex items-center justify-between mb-4 relative z-10">
            <span className="text-sm font-semibold text-slate-700 group-hover:text-slate-900 transition-colors">{card.label}</span>
            <div className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300",
              "gradient-primary text-white shadow-card group-hover:shadow-elevated group-hover:scale-110",
            )}>
              <card.icon className="w-5 h-5 icon-tilt" />
            </div>
          </div>

          <p className="text-3xl font-display font-bold text-slate-900 group-hover:text-slate-950 transition-colors relative z-10">
            {card.value}
          </p>

          {/* subtle corner glow */}
          <div className="absolute -top-10 -right-10 w-24 h-24 rounded-full opacity-0 group-hover:opacity-20 transition-opacity duration-300"
               style={{ background: 'radial-gradient(circle, rgba(3,83,164,0.20), transparent 60%)' }} />
        </div>
      ))}
    </div>
  );
}
