import type { ClassData, PdfClassData, UploadedFile, WeekSchedule } from '@/types/schedule';

type SerializedClassData = Omit<ClassData, 'timeDate'> & {
  timeDate: string | null;
};

type SerializedUploadedFile = Omit<UploadedFile, 'uploadedAt' | 'rawData'> & {
  uploadedAt: string;
  rawData?: SerializedClassData[];
};

export interface PersistedScheduleSnapshot {
  version: number;
  uploadedFiles: SerializedUploadedFile[];
  csvSchedule: WeekSchedule | null;
  csvClassData: Record<string, SerializedClassData[]> | null;
  pdfSchedules: Array<[string, WeekSchedule]>;
  pdfClassDataByLocation: Array<[string, PdfClassData[]]>;
  updatedAt: string;
}

export interface ScheduleStateForPersistence {
  uploadedFiles: UploadedFile[];
  csvSchedule: WeekSchedule | null;
  csvClassData: Record<string, ClassData[]> | null;
  pdfSchedules: Map<string, WeekSchedule>;
  pdfClassDataByLocation: Map<string, PdfClassData[]>;
}

function serializeClassData(row: ClassData): SerializedClassData {
  return {
    ...row,
    timeDate: row.timeDate ? row.timeDate.toISOString() : null,
  };
}

function deserializeClassData(row: SerializedClassData): ClassData {
  return {
    ...row,
    timeDate: row.timeDate ? new Date(row.timeDate) : null,
  };
}

export function createPersistedScheduleSnapshot(state: ScheduleStateForPersistence): PersistedScheduleSnapshot {
  return {
    version: 1,
    uploadedFiles: state.uploadedFiles.map(file => ({
      ...file,
      uploadedAt: file.uploadedAt instanceof Date ? file.uploadedAt.toISOString() : new Date(file.uploadedAt).toISOString(),
      rawData: file.rawData?.map(serializeClassData),
    })),
    csvSchedule: state.csvSchedule,
    csvClassData: state.csvClassData
      ? Object.fromEntries(
          Object.entries(state.csvClassData).map(([day, rows]) => [day, rows.map(serializeClassData)])
        )
      : null,
    pdfSchedules: Array.from(state.pdfSchedules.entries()),
    pdfClassDataByLocation: Array.from(state.pdfClassDataByLocation.entries()),
    updatedAt: new Date().toISOString(),
  };
}

export function restorePersistedScheduleSnapshot(snapshot: PersistedScheduleSnapshot): ScheduleStateForPersistence {
  return {
    uploadedFiles: snapshot.uploadedFiles.map(file => ({
      ...file,
      uploadedAt: new Date(file.uploadedAt),
      rawData: file.rawData?.map(deserializeClassData),
    })),
    csvSchedule: snapshot.csvSchedule,
    csvClassData: snapshot.csvClassData
      ? Object.fromEntries(
          Object.entries(snapshot.csvClassData).map(([day, rows]) => [day, rows.map(deserializeClassData)])
        )
      : null,
    pdfSchedules: new Map(snapshot.pdfSchedules),
    pdfClassDataByLocation: new Map(snapshot.pdfClassDataByLocation),
  };
}

export function hasPersistableScheduleState(state: ScheduleStateForPersistence): boolean {
  return Boolean(
    state.uploadedFiles.length ||
      state.csvSchedule ||
      state.csvClassData ||
      state.pdfSchedules.size ||
      state.pdfClassDataByLocation.size
  );
}