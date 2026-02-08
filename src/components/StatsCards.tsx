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
      color: 'primary' as const,
    },
    {
      label: 'Active Days',
      value: stats?.totalDays ?? '—',
      icon: Clock,
      color: 'accent' as const,
    },
    {
      label: 'Trainers',
      value: stats?.uniqueTrainers ?? '—',
      icon: Users,
      color: 'secondary' as const,
    },
    {
      label: 'Avg/Day',
      value: stats?.avgPerDay ?? '—',
      icon: TrendingUp,
      color: 'muted' as const,
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {cards.map((card, i) => (
        <div 
          key={card.label}
          className={cn(
            "p-5 rounded-xl border bg-card shadow-soft",
            "animate-fade-in"
          )}
          style={{ animationDelay: `${i * 50}ms` }}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-muted-foreground">{card.label}</span>
            <div className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center",
              card.color === 'primary' && "bg-primary/10 text-primary",
              card.color === 'accent' && "bg-accent/10 text-accent",
              card.color === 'secondary' && "bg-secondary text-secondary-foreground",
              card.color === 'muted' && "bg-muted text-muted-foreground"
            )}>
              <card.icon className="w-4 h-4" />
            </div>
          </div>
          <p className="text-3xl font-display font-bold">{card.value}</p>
        </div>
      ))}
    </div>
  );
}
