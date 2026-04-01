import { describe, expect, it } from 'vitest';
import { createPersistedScheduleSnapshot, restorePersistedScheduleSnapshot } from '@/lib/persistedScheduleState';

describe('persistedScheduleState', () => {
  it('serializes and restores uploaded schedule state', () => {
    const snapshot = createPersistedScheduleSnapshot({
      uploadedFiles: [
        {
          id: 'csv-1',
          name: 'schedule.csv',
          type: 'csv',
          uploadedAt: new Date('2026-04-01T10:00:00.000Z'),
          status: 'completed',
        },
      ],
      csvSchedule: {
        id: 'week-1',
        weekStart: '2026-03-30',
        weekEnd: '2026-04-05',
        location: 'All Locations',
        days: [],
        levels: { beginner: [], intermediate: [], advanced: [] },
      },
      csvClassData: {
        Monday: [
          {
            day: 'Monday',
            timeRaw: '7:00 AM',
            timeDate: new Date('2026-03-30T07:00:00.000Z'),
            time: '07:00',
            location: 'Kwality House, Kemps Corner',
            className: 'Studio FIT',
            trainer1: 'Anisha Shah',
            cover: '',
            notes: '',
            uniqueKey: 'monday-fit',
          },
        ],
      },
      pdfSchedules: new Map(),
      pdfClassDataByLocation: new Map(),
    });

    const restored = restorePersistedScheduleSnapshot(snapshot);

    expect(restored.uploadedFiles[0]?.uploadedAt).toBeInstanceOf(Date);
    expect(restored.csvClassData?.Monday[0]?.timeDate).toBeInstanceOf(Date);
    expect(restored.csvClassData?.Monday[0]?.location).toBe('Kwality House, Kemps Corner');
    expect(restored.csvSchedule?.id).toBe('week-1');
  });
});