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
      gradient: 'from-blue-500 to-blue-600',
      bgGradient: 'from-blue-50 to-blue-100/50',
      borderColor: 'border-blue-200',
    },
    {
      label: 'Active Days',
      value: stats?.totalDays ?? '—',
      icon: Clock,
      gradient: 'from-cyan-500 to-cyan-600',
      bgGradient: 'from-cyan-50 to-cyan-100/50',
      borderColor: 'border-cyan-200',
    },
    {
      label: 'Trainers',
      value: stats?.uniqueTrainers ?? '—',
      icon: Users,
      gradient: 'from-emerald-500 to-emerald-600',
      bgGradient: 'from-emerald-50 to-emerald-100/50',
      borderColor: 'border-emerald-200',
    },
    {
      label: 'Avg/Day',
      value: stats?.avgPerDay ?? '—',
      icon: TrendingUp,
      gradient: 'from-orange-500 to-orange-600',
      bgGradient: 'from-orange-50 to-orange-100/50',
      borderColor: 'border-orange-200',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {cards.map((card, i) => (
        <div 
          key={card.label}
          className={cn(
            "group relative p-6 rounded-xl border overflow-hidden transition-all duration-300",
            `bg-gradient-to-br ${card.bgGradient} ${card.borderColor}`,
            "hover:shadow-lg hover:shadow-blue-200/30 hover-lift",
            "animate-fade-in backdrop-blur-sm"
          )}
          style={{ animationDelay: `${i * 50}ms` }}
        >
          {/* Animated background effect */}
          <div className="absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity duration-300" 
               style={{ background: `linear-gradient(135deg, var(--tw-gradient-stops))` }} />

          {/* Shine effect */}
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

          <div className="flex items-center justify-between mb-4 relative z-10">
            <span className="text-sm font-semibold text-slate-700 group-hover:text-slate-900 transition-colors">{card.label}</span>
            <div className={cn(
              "w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-300",
              `bg-gradient-to-br ${card.gradient} text-white`,
              "shadow-lg group-hover:shadow-xl group-hover:scale-110"
            )}>
              <card.icon className="w-5 h-5" />
            </div>
          </div>

          <p className="text-3xl font-display font-bold text-slate-900 group-hover:text-slate-950 transition-colors relative z-10">
            {card.value}
          </p>

          {/* Floating animation element */}
          <div className="absolute top-2 right-2 w-20 h-20 rounded-full opacity-0 group-hover:opacity-5 transition-opacity duration-300"
               style={{ background: 'radial-gradient(circle, var(--tw-gradient-stops))' }} />
        </div>
      ))}
    </div>
  );
}
