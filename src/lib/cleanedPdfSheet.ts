import { addDays, format, isValid, parse, parseISO } from 'date-fns';
import { normalizeLocation, normalizeTime } from '@/lib/normalizers';
import type { DaySchedule, ScheduleClass, WeekSchedule } from '@/types/schedule';

export const CLEANED_PDF_SHEET_NAME = 'Cleaned-PDF';
export const CLEANED_PDF_SHEET_HEADERS = [
  'Day',
  'Time',
  'Location',
  'Class',
  'Trainer',
  'Notes',
  'Date',
  'Theme',
] as const;

export interface CleanedPdfSheetRow {
  day: string;
  time: string;
  location: string;
  className: string;
  trainer: string;
  notes: string;
  date: string;
  theme: string;
}

const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
const SUPPORTED_DATE_FORMATS = [
  'yyyy-MM-dd',
  'd MMM yyyy',
  'dd MMM yyyy',
  'd MMMM yyyy',
  'dd MMMM yyyy',
  'MMM d yyyy',
  'MMMM d yyyy',
  'MMM d, yyyy',
  'MMMM d, yyyy',
] as const;
const SUPPORTED_TIME_FORMATS = ['h:mm a', 'hh:mm a', 'h a', 'ha', 'H:mm', 'HH:mm'] as const;

function parseKnownTime(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  for (const timeFormat of SUPPORTED_TIME_FORMATS) {
    const parsed = parse(trimmed.toUpperCase(), timeFormat, new Date());
    if (isValid(parsed)) {
      return parsed;
    }
  }

  const normalizedTime = normalizeTime(trimmed);
  if (normalizedTime) {
    const parsed24Hour = parse(normalizedTime, 'HH:mm', new Date());
    if (isValid(parsed24Hour)) {
      return parsed24Hour;
    }
  }

  const simpleTimeMatch = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (simpleTimeMatch) {
    const hours = Number.parseInt(simpleTimeMatch[1], 10);
    const minutes = simpleTimeMatch[2];

    if (hours >= 0 && hours <= 23) {
      const inferredPeriod = hours === 0
        ? 'AM'
        : hours <= 3
          ? 'PM'
          : hours <= 11
            ? 'AM'
            : 'PM';
      const inferredHour = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
      const parsed = parse(`${inferredHour}:${minutes} ${inferredPeriod}`, 'h:mm a', new Date());
      if (isValid(parsed)) {
        return parsed;
      }
    }
  }

  return null;
}

function parseKnownDate(value?: string): Date | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  const direct = new Date(trimmed);
  if (isValid(direct)) return direct;

  const iso = parseISO(trimmed);
  if (isValid(iso)) return iso;

  for (const dateFormat of SUPPORTED_DATE_FORMATS) {
    const parsed = parse(trimmed, dateFormat, new Date());
    if (isValid(parsed)) return parsed;
  }

  return null;
}

function formatSheetDate(date: Date | null): string {
  if (!date || !isValid(date)) return '';
  return format(date, 'd MMM yyyy');
}

function resolveDayDate(schedule: WeekSchedule, daySchedule: DaySchedule): string {
  const explicitDate = parseKnownDate(daySchedule.date);
  if (explicitDate) {
    return formatSheetDate(explicitDate);
  }

  const weekStart = parseKnownDate(schedule.weekStart);
  const dayIndex = DAY_ORDER.indexOf(daySchedule.day as (typeof DAY_ORDER)[number]);
  if (weekStart && dayIndex >= 0) {
    return formatSheetDate(addDays(weekStart, dayIndex));
  }

  return '';
}

function formatSheetTime(rawTime: string): string {
  const trimmed = rawTime.trim();
  if (!trimmed) return '';

  const parsed = parseKnownTime(trimmed);
  if (parsed) {
    return format(parsed, 'hh:mm a');
  }

  return trimmed;
}

function buildTimeSortKey(rawTime: string): string {
  const parsed = parseKnownTime(rawTime);
  if (parsed) {
    return format(parsed, 'HH:mm');
  }

  const normalized = normalizeTime(rawTime);
  if (normalized) {
    return normalized;
  }

  return rawTime.trim();
}

function hasMeaningfulClassData(scheduleClass: ScheduleClass): boolean {
  return Boolean(scheduleClass.time?.trim() || scheduleClass.className?.trim() || scheduleClass.trainer?.trim());
}

function compareScheduleClasses(left: ScheduleClass, right: ScheduleClass): number {
  const leftTime = buildTimeSortKey(left.time);
  const rightTime = buildTimeSortKey(right.time);

  if (leftTime && rightTime && leftTime !== rightTime) {
    return leftTime.localeCompare(rightTime);
  }

  return [left.className, left.trainer, left.location || '']
    .join('|')
    .localeCompare([right.className, right.trainer, right.location || ''].join('|'));
}

function buildRow(schedule: WeekSchedule, daySchedule: DaySchedule, scheduleClass: ScheduleClass): CleanedPdfSheetRow {
  return {
    day: daySchedule.day,
    time: formatSheetTime(scheduleClass.time || ''),
    location: normalizeLocation(scheduleClass.location || schedule.location) || scheduleClass.location || schedule.location || '',
    className: scheduleClass.className?.trim() || '',
    trainer: scheduleClass.trainer?.trim() || '',
    notes: '',
    date: resolveDayDate(schedule, daySchedule),
    theme: scheduleClass.theme?.trim() || '',
  };
}

export function buildCleanedPdfSheetRows(schedules: Iterable<WeekSchedule>): CleanedPdfSheetRow[] {
  const rows: CleanedPdfSheetRow[] = [];

  for (const schedule of schedules) {
    const sortedDays = [...schedule.days].sort((left, right) => {
      const leftIndex = DAY_ORDER.indexOf(left.day as (typeof DAY_ORDER)[number]);
      const rightIndex = DAY_ORDER.indexOf(right.day as (typeof DAY_ORDER)[number]);
      return leftIndex - rightIndex;
    });

    for (const daySchedule of sortedDays) {
      const sortedClasses = [...daySchedule.classes]
        .filter(hasMeaningfulClassData)
        .sort(compareScheduleClasses);

      for (const scheduleClass of sortedClasses) {
        rows.push(buildRow(schedule, daySchedule, scheduleClass));
      }
    }
  }

  return rows;
}

export function buildCleanedPdfSheetValues(rows: CleanedPdfSheetRow[]): string[][] {
  return [
    [...CLEANED_PDF_SHEET_HEADERS],
    ...rows.map(row => [
      row.day,
      row.time,
      row.location,
      row.className,
      row.trainer,
      row.notes,
      row.date,
      row.theme,
    ]),
  ];
}
