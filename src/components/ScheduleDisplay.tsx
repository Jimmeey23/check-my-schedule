import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import type { WeekSchedule } from '@/types/schedule';
import { Clock, User, MapPin } from 'lucide-react';

interface ScheduleDisplayProps {
  schedule: WeekSchedule;
  title?: string;
  emptyMessage?: string;
}

const levelColors = {
  beginner: 'bg-green-100 text-green-700 border-green-200',
  intermediate: 'bg-amber-100 text-amber-700 border-amber-200',
  advanced: 'bg-red-100 text-red-700 border-red-200',
};

export function ScheduleDisplay({ schedule, title, emptyMessage }: ScheduleDisplayProps) {
  const totalClasses = useMemo(() => 
    schedule.days.reduce((sum, day) => sum + day.classes.length, 0),
    [schedule]
  );

  if (totalClasses === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        {emptyMessage || 'No schedule data available'}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {title && (
        <div className="flex items-center justify-between">
          <h3 className="font-display font-semibold text-lg text-foreground">{title}</h3>
          <Badge variant="secondary">{totalClasses} classes</Badge>
        </div>
      )}
      
      <ScrollArea className="h-[500px]">
        <div className="space-y-4 pr-4">
          {schedule.days.map((day) => (
            <div key={day.day} className="border rounded-lg bg-card overflow-hidden">
              <div className="bg-primary text-primary-foreground px-4 py-3 flex items-center justify-between">
                <h4 className="font-display font-semibold">{day.day}</h4>
                <Badge variant="secondary" className="bg-primary-foreground/20 text-primary-foreground border-0">
                  {day.classes.length} classes
                </Badge>
              </div>
              
              <div className="divide-y">
                {day.classes.map((cls) => (
                  <div key={cls.id} className="p-3 hover:bg-secondary/50 transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                          <span className="text-sm font-medium text-foreground">{cls.time}</span>
                          {cls.level && (
                            <Badge variant="outline" className={cn("text-xs capitalize", levelColors[cls.level])}>
                              {cls.level}
                            </Badge>
                          )}
                        </div>
                        <p className="font-medium text-foreground">{cls.className}</p>
                        <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <User className="w-3.5 h-3.5" />
                            {cls.trainer}
                          </span>
                          {cls.location && (
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3.5 h-3.5" />
                              {cls.location}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
