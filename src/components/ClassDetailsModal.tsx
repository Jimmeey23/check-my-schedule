import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ScheduleClass } from '@/types/schedule';
import {
  Clock,
  MapPin,
  Users,
  BookOpen,
  Zap,
  X,
  Shield,
  Award,
  Lightbulb,
} from 'lucide-react';

interface ClassDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  classData: ScheduleClass | null;
  day?: string;
}

const getLevelIcon = (level?: string) => {
  switch (level) {
    case 'beginner':
      return <Shield className="w-4 h-4" />;
    case 'intermediate':
      return <Award className="w-4 h-4" />;
    case 'advanced':
      return <Zap className="w-4 h-4" />;
    default:
      return <Lightbulb className="w-4 h-4" />;
  }
};

const getLevelColor = (level?: string) => {
  switch (level) {
    case 'beginner':
      return 'bg-emerald-100 text-emerald-800 border-emerald-300';
    case 'intermediate':
      return 'bg-blue-100 text-blue-800 border-blue-300';
    case 'advanced':
      return 'bg-purple-100 text-purple-800 border-purple-300';
    default:
      return 'bg-slate-100 text-slate-800 border-slate-300';
  }
};

export function ClassDetailsModal({
  isOpen,
  onClose,
  classData,
  day,
}: ClassDetailsModalProps) {
  if (!classData) return null;

  const getLevelLabel = (level?: string) => {
    return level ? level.charAt(0).toUpperCase() + level.slice(1) : 'All Levels';
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl bg-gradient-to-br from-white via-slate-50 to-blue-50 border border-blue-200 shadow-2xl rounded-2xl overflow-hidden">
        {/* Header with gradient */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-600 via-blue-500 to-blue-400" />

        <DialogHeader className="pb-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <DialogTitle className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-blue-500 bg-clip-text text-transparent mb-2">
                {classData.className}
              </DialogTitle>
              {day && (
                <p className="text-sm text-slate-500 font-medium">{day}</p>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 hover:bg-white/50 rounded-full"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>
        </DialogHeader>

        <Separator className="bg-gradient-to-r from-blue-200 to-transparent" />

        {/* Content Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-6">
          {/* Left Column */}
          <div className="space-y-4">
            {/* Time */}
            <div className="group p-4 rounded-xl bg-white border border-blue-100 hover:border-blue-300 hover:shadow-md transition-all duration-300">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-gradient-to-br from-blue-100 to-blue-50 rounded-lg group-hover:from-blue-200 group-hover:to-blue-100 transition-all">
                  <Clock className="w-5 h-5 text-blue-600" />
                </div>
                <span className="text-sm font-semibold text-slate-600">Time</span>
              </div>
              <p className="text-lg font-bold text-slate-900 ml-11">
                {classData.time}
              </p>
            </div>

            {/* Trainer */}
            <div className="group p-4 rounded-xl bg-white border border-orange-100 hover:border-orange-300 hover:shadow-md transition-all duration-300">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-gradient-to-br from-orange-100 to-orange-50 rounded-lg group-hover:from-orange-200 group-hover:to-orange-100 transition-all">
                  <Users className="w-5 h-5 text-orange-600" />
                </div>
                <span className="text-sm font-semibold text-slate-600">Trainer</span>
              </div>
              <p className="text-lg font-bold text-slate-900 ml-11">
                {classData.trainer || 'TBD'}
              </p>
            </div>

            {/* Level Badge */}
            <div className="p-4 rounded-xl bg-white border border-purple-100">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 bg-gradient-to-br from-purple-100 to-purple-50 rounded-lg">
                  {getLevelIcon(classData.level)}
                </div>
                <span className="text-sm font-semibold text-slate-600">Difficulty Level</span>
              </div>
              <Badge
                variant="outline"
                className={`ml-11 text-xs font-semibold px-3 py-1 border ${getLevelColor(classData.level)}`}
              >
                {getLevelLabel(classData.level)}
              </Badge>
            </div>
          </div>

          {/* Right Column */}
          <div className="space-y-4">
            {/* Location */}
            <div className="group p-4 rounded-xl bg-white border border-emerald-100 hover:border-emerald-300 hover:shadow-md transition-all duration-300">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-gradient-to-br from-emerald-100 to-emerald-50 rounded-lg group-hover:from-emerald-200 group-hover:to-emerald-100 transition-all">
                  <MapPin className="w-5 h-5 text-emerald-600" />
                </div>
                <span className="text-sm font-semibold text-slate-600">Location</span>
              </div>
              <p className="text-base font-bold text-slate-900 ml-11">
                {classData.location || 'Not specified'}
              </p>
            </div>

            {/* Class ID */}
            <div className="group p-4 rounded-xl bg-white border border-slate-200 hover:border-slate-300 hover:shadow-md transition-all duration-300">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-gradient-to-br from-slate-100 to-slate-50 rounded-lg group-hover:from-slate-200 group-hover:to-slate-100 transition-all">
                  <BookOpen className="w-5 h-5 text-slate-600" />
                </div>
                <span className="text-sm font-semibold text-slate-600">Class ID</span>
              </div>
              <p className="text-xs font-mono text-slate-500 ml-11 break-all">
                {classData.id}
              </p>
            </div>
          </div>
        </div>

        <Separator className="bg-gradient-to-r from-transparent via-blue-200 to-transparent" />

        {/* Footer */}
        <div className="flex gap-3 pt-4">
          <Button
            variant="outline"
            onClick={onClose}
            className="flex-1 border-blue-200 text-blue-600 hover:bg-blue-50 hover:border-blue-300 font-semibold rounded-lg transition-all duration-300"
          >
            Close
          </Button>
          <Button
            onClick={onClose}
            className="flex-1 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white font-semibold rounded-lg shadow-lg hover:shadow-xl transition-all duration-300"
          >
            Got it
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
