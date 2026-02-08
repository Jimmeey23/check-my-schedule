export type ClassLevel = 'beginner' | 'intermediate' | 'advanced';
export type ComparisonStatus = 'match' | 'mismatch' | 'missing' | 'extra';

export interface ScheduleClass {
  id: string;
  time: string;
  className: string;
  trainer: string;
  location?: string;
  level?: ClassLevel;
}

export interface NormalizedClass {
  id: string;
  day: string;
  time: string;
  normalizedTime: string;
  className: string;
  normalizedClassName: string;
  trainer: string;
  normalizedTrainer: string;
  location?: string;
  normalizedLocation?: string;
  level?: ClassLevel;
}

export interface ComparedClass extends NormalizedClass {
  status: ComparisonStatus;
  matchedWith?: NormalizedClass;
  differences?: {
    time?: boolean;
    className?: boolean;
    trainer?: boolean;
    location?: boolean;
  };
}

export interface DaySchedule {
  day: string;
  date?: string;
  classes: ScheduleClass[];
}

export interface WeekSchedule {
  id: string;
  weekStart: string;
  weekEnd: string;
  location: string;
  days: DaySchedule[];
  levels: {
    beginner: string[];
    intermediate: string[];
    advanced: string[];
  };
}

export interface ComparisonResult {
  pdfClasses: ComparedClass[];
  csvClasses: ComparedClass[];
  summary: {
    totalPdf: number;
    totalCsv: number;
    matches: number;
    mismatches: number;
    missingInCsv: number;
    extraInCsv: number;
  };
}

export interface UploadedFile {
  id: string;
  name: string;
  type: 'pdf' | 'csv';
  uploadedAt: Date;
  data?: WeekSchedule;
  rawData?: string;
  status: 'uploading' | 'processing' | 'completed' | 'error';
  error?: string;
  location?: string;
}

export type UploadedPDF = UploadedFile;

export type ScheduleViewMode = 'cards' | 'grid' | 'list' | 'trainer' | 'location';

export interface ScheduleFilters {
  day: string | null;
  className: string | null;
  trainer: string | null;
  location: string | null;
  level: ClassLevel | null;
  searchQuery: string;
}
