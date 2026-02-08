import { useState } from 'react';
import { Edit2, Check, X, User, Clock, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { WeekSchedule, ScheduleClass, DaySchedule } from '@/types/schedule';

interface ScheduleTableProps {
  schedule: WeekSchedule;
  onUpdateClass: (dayIndex: number, classId: string, updates: Partial<ScheduleClass>) => void;
  selectedDay: string | null;
  onSelectDay: (day: string | null) => void;
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function ClassRow({ 
  cls, 
  dayIndex, 
  onUpdate 
}: { 
  cls: ScheduleClass; 
  dayIndex: number; 
  onUpdate: (classId: string, updates: Partial<ScheduleClass>) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValues, setEditValues] = useState(cls);

  const handleSave = () => {
    onUpdate(cls.id, editValues);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditValues(cls);
    setIsEditing(false);
  };

  const getLevelColor = (className: string) => {
    const name = className.toUpperCase();
    if (name.includes('BARRE 57') || name.includes('POWERCYCLE')) return 'beginner';
    if (name.includes('HIIT') || name.includes('AMPED')) return 'advanced';
    return 'intermediate';
  };

  const level = getLevelColor(cls.className);

  if (isEditing) {
    return (
      <tr className="bg-primary/5 border-l-2 border-l-primary">
        <td className="p-3">
          <Input 
            value={editValues.time}
            onChange={(e) => setEditValues({ ...editValues, time: e.target.value })}
            className="h-8 text-sm"
          />
        </td>
        <td className="p-3">
          <Input 
            value={editValues.className}
            onChange={(e) => setEditValues({ ...editValues, className: e.target.value })}
            className="h-8 text-sm"
          />
        </td>
        <td className="p-3">
          <Input 
            value={editValues.trainer}
            onChange={(e) => setEditValues({ ...editValues, trainer: e.target.value })}
            className="h-8 text-sm"
          />
        </td>
        <td className="p-3">
          <div className="flex gap-1">
            <Button size="icon" variant="ghost" className="h-8 w-8 text-primary" onClick={handleSave}>
              <Check className="w-4 h-4" />
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground" onClick={handleCancel}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="group hover:bg-muted/50 transition-colors">
      <td className="p-3">
        <div className="flex items-center gap-2 text-sm">
          <Clock className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="font-medium">{cls.time}</span>
        </div>
      </td>
      <td className="p-3">
        <div className="flex items-center gap-2">
          <span className="font-medium">{cls.className}</span>
          <Badge 
            variant="outline" 
            className={cn(
              "text-[10px] uppercase tracking-wider",
              level === 'beginner' && "border-level-beginner/30 text-level-beginner bg-level-beginner/10",
              level === 'intermediate' && "border-level-intermediate/30 text-level-intermediate bg-level-intermediate/10",
              level === 'advanced' && "border-level-advanced/30 text-level-advanced bg-level-advanced/10"
            )}
          >
            {level}
          </Badge>
        </div>
      </td>
      <td className="p-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <User className="w-3.5 h-3.5" />
          <span>{cls.trainer}</span>
        </div>
      </td>
      <td className="p-3">
        <Button 
          size="icon" 
          variant="ghost" 
          className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={() => setIsEditing(true)}
        >
          <Edit2 className="w-4 h-4" />
        </Button>
      </td>
    </tr>
  );
}

function DayCard({ 
  day, 
  dayIndex, 
  isSelected,
  onSelect,
  onUpdateClass 
}: { 
  day: DaySchedule; 
  dayIndex: number; 
  isSelected: boolean;
  onSelect: () => void;
  onUpdateClass: (dayIndex: number, classId: string, updates: Partial<ScheduleClass>) => void;
}) {
  return (
    <div 
      className={cn(
        "rounded-xl border bg-card overflow-hidden transition-all duration-300",
        isSelected ? "ring-2 ring-primary shadow-card" : "shadow-soft hover:shadow-card"
      )}
    >
      <button
        onClick={onSelect}
        className={cn(
          "w-full px-5 py-4 flex items-center justify-between transition-colors",
          isSelected ? "bg-primary text-primary-foreground" : "bg-muted/50 hover:bg-muted"
        )}
      >
        <div className="flex items-center gap-3">
          <span className="text-lg font-display font-semibold">{day.day}</span>
          {day.date && (
            <span className={cn(
              "text-sm",
              isSelected ? "text-primary-foreground/70" : "text-muted-foreground"
            )}>
              {day.date}
            </span>
          )}
        </div>
        <Badge 
          variant={isSelected ? "secondary" : "outline"}
          className={isSelected ? "bg-primary-foreground/20 text-primary-foreground border-0" : ""}
        >
          {day.classes.length} classes
        </Badge>
      </button>
      
      {isSelected && (
        <div className="animate-fade-in">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="p-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider w-28">Time</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Class</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider w-40">Trainer</th>
                <th className="p-3 w-12"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {day.classes.map((cls) => (
                <ClassRow 
                  key={cls.id} 
                  cls={cls} 
                  dayIndex={dayIndex}
                  onUpdate={(classId, updates) => onUpdateClass(dayIndex, classId, updates)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function ScheduleTable({ schedule, onUpdateClass, selectedDay, onSelectDay }: ScheduleTableProps) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-display font-bold">{schedule.location}</h2>
          <p className="text-muted-foreground">
            {schedule.weekStart} - {schedule.weekEnd}
          </p>
        </div>
        
        <div className="flex gap-2">
          {Object.entries(schedule.levels).map(([level, classes]) => (
            <Badge 
              key={level}
              variant="outline"
              className={cn(
                "text-xs",
                level === 'beginner' && "border-level-beginner/30 text-level-beginner bg-level-beginner/10",
                level === 'intermediate' && "border-level-intermediate/30 text-level-intermediate bg-level-intermediate/10",
                level === 'advanced' && "border-level-advanced/30 text-level-advanced bg-level-advanced/10"
              )}
            >
              {level}: {classes.length} types
            </Badge>
          ))}
        </div>
      </div>

      {/* Quick Day Filter */}
      <div className="flex gap-2 flex-wrap">
        <Button 
          variant={selectedDay === null ? "default" : "outline"} 
          size="sm"
          onClick={() => onSelectDay(null)}
        >
          All Days
        </Button>
        {DAYS.map((day) => {
          const hasClasses = schedule.days.some(d => d.day === day && d.classes.length > 0);
          if (!hasClasses) return null;
          return (
            <Button 
              key={day}
              variant={selectedDay === day ? "default" : "outline"} 
              size="sm"
              onClick={() => onSelectDay(selectedDay === day ? null : day)}
            >
              {day.slice(0, 3)}
            </Button>
          );
        })}
      </div>

      {/* Day Cards */}
      <div className="space-y-4">
        {schedule.days
          .filter(day => !selectedDay || day.day === selectedDay)
          .map((day, index) => (
            <DayCard
              key={day.day}
              day={day}
              dayIndex={index}
              isSelected={selectedDay === day.day || (selectedDay === null && schedule.days.length === 1)}
              onSelect={() => onSelectDay(selectedDay === day.day ? null : day.day)}
              onUpdateClass={onUpdateClass}
            />
          ))}
      </div>
    </div>
  );
}
