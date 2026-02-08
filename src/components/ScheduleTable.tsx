import { useState } from 'react';
import { Edit2, Check, X, User, Clock, MapPin, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ClassDetailsModal } from '@/components/ClassDetailsModal';
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
  day,
  onUpdate,
  onOpenModal
}: { 
  cls: ScheduleClass; 
  dayIndex: number;
  day: string;
  onUpdate: (classId: string, updates: Partial<ScheduleClass>) => void;
  onOpenModal: (classData: ScheduleClass, day: string) => void;
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
      <tr className="bg-blue-50 border-l-4 border-l-blue-500">
        <td className="p-3">
          <Input 
            value={editValues.time}
            onChange={(e) => setEditValues({ ...editValues, time: e.target.value })}
            className="h-8 text-sm border-blue-300"
          />
        </td>
        <td className="p-3">
          <Input 
            value={editValues.className}
            onChange={(e) => setEditValues({ ...editValues, className: e.target.value })}
            className="h-8 text-sm border-blue-300"
          />
        </td>
        <td className="p-3">
          <Input 
            value={editValues.trainer}
            onChange={(e) => setEditValues({ ...editValues, trainer: e.target.value })}
            className="h-8 text-sm border-blue-300"
          />
        </td>
        <td className="p-3">
          <div className="flex gap-1">
            <Button size="icon" variant="ghost" className="h-8 w-8 text-emerald-600 hover:bg-emerald-50" onClick={handleSave}>
              <Check className="w-4 h-4" />
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-500 hover:bg-slate-100" onClick={handleCancel}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr 
      className="group hover:bg-blue-50/50 transition-all duration-300 cursor-pointer"
      onClick={() => onOpenModal(cls, day)}
    >
      <td className="p-3">
        <div className="flex items-center gap-2 text-sm">
          <Clock className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600 transition-colors" />
          <span className="font-medium text-slate-900">{cls.time}</span>
        </div>
      </td>
      <td className="p-3">
        <div className="flex items-center gap-2">
          <span className="font-medium text-slate-900">{cls.className}</span>
          <Badge 
            variant="outline" 
            className={cn(
              "text-[10px] uppercase tracking-wider font-medium",
              level === 'beginner' && "border-emerald-200 text-emerald-700 bg-emerald-50",
              level === 'intermediate' && "border-amber-200 text-amber-700 bg-amber-50",
              level === 'advanced' && "border-red-200 text-red-700 bg-red-50"
            )}
          >
            {level}
          </Badge>
        </div>
      </td>
      <td className="p-3">
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <User className="w-3.5 h-3.5" />
          <span>{cls.trainer}</span>
        </div>
      </td>
      <td className="p-3">
        <Button 
          size="icon" 
          variant="ghost" 
          className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-blue-600 hover:bg-blue-50"
          onClick={(e) => {
            e.stopPropagation();
            setIsEditing(true);
          }}
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
  onUpdateClass,
  onOpenModal
}: { 
  day: DaySchedule; 
  dayIndex: number; 
  isSelected: boolean;
  onSelect: () => void;
  onUpdateClass: (dayIndex: number, classId: string, updates: Partial<ScheduleClass>) => void;
  onOpenModal: (classData: ScheduleClass, day: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(isSelected);

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      className={cn(
        "rounded-xl border overflow-hidden transition-all duration-300 bg-white shadow-sm hover:shadow-lg",
        isOpen ? "ring-2 ring-blue-500 shadow-lg border-blue-200" : "border-slate-200"
      )}
    >
      <CollapsibleTrigger
        onClick={() => {
          onSelect();
          setIsOpen(!isOpen);
        }}
        className={cn(
          "w-full px-5 py-4 flex items-center justify-between transition-all duration-300",
          isOpen ? "bg-gradient-to-r from-blue-500 to-blue-600 text-white" : "bg-slate-50 hover:bg-blue-50 text-slate-900"
        )}
      >
        <div className="flex items-center gap-3">
          {isOpen ? (
            <ChevronDown className="w-5 h-5" />
          ) : (
            <ChevronRight className="w-5 h-5" />
          )}
          <span className="text-lg font-display font-semibold">{day.day}</span>
          {day.date && (
            <span className={cn(
              "text-sm",
              isOpen ? "text-white/80" : "text-slate-500"
            )}>
              {day.date}
            </span>
          )}
        </div>
        <Badge 
          variant={isOpen ? "secondary" : "outline"}
          className={isOpen ? "bg-white text-blue-600 border-0 font-medium" : "bg-white text-slate-700 border-slate-200"}
        >
          {day.classes.length} classes
        </Badge>
      </CollapsibleTrigger>
      
      <CollapsibleContent className="animate-fade-in">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-blue-50">
              <th className="p-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider w-28">Time</th>
              <th className="p-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">Class</th>
              <th className="p-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider w-40">Trainer</th>
              <th className="p-3 w-12"></th>
            </tr>
          </thead>
            <tbody className="divide-y divide-slate-200">
              {day.classes.map((cls) => (
                <ClassRow 
                  key={cls.id} 
                  cls={cls} 
                  dayIndex={dayIndex}
                  day={day.day}
                  onUpdate={(classId, updates) => onUpdateClass(dayIndex, classId, updates)}
                  onOpenModal={onOpenModal}
                />
              ))}
            </tbody>
          </table>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function ScheduleTable({ schedule, onUpdateClass, selectedDay, onSelectDay }: ScheduleTableProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedClass, setSelectedClass] = useState<ScheduleClass | null>(null);
  const [selectedClassDay, setSelectedClassDay] = useState<string>('');

  const handleOpenModal = (classData: ScheduleClass, day: string) => {
    setSelectedClass(classData);
    setSelectedClassDay(day);
    setModalOpen(true);
  };

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-display font-bold text-slate-900">{schedule.location}</h2>
            <p className="text-slate-500">
              {schedule.weekStart} - {schedule.weekEnd}
            </p>
          </div>
          
          <div className="flex gap-2">
            {Object.entries(schedule.levels).map(([level, classes]) => (
              <Badge 
                key={level}
                variant="outline"
                className={cn(
                  "text-xs font-medium",
                  level === 'beginner' && "border-emerald-200 text-emerald-700 bg-emerald-50",
                  level === 'intermediate' && "border-amber-200 text-amber-700 bg-amber-50",
                  level === 'advanced' && "border-red-200 text-red-700 bg-red-50"
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
            className={selectedDay === null ? "bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-md hover:shadow-lg" : "text-slate-700 border-slate-200 hover:border-blue-300 hover:bg-blue-50"}
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
                className={selectedDay === day ? "bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-md hover:shadow-lg" : "text-slate-700 border-slate-200 hover:border-blue-300 hover:bg-blue-50"}
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
                onOpenModal={handleOpenModal}
              />
            ))}
        </div>
      </div>

      <ClassDetailsModal 
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        classData={selectedClass}
        day={selectedClassDay}
      />
    </>
  );
}
