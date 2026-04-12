import { describe, expect, it } from 'vitest';
import { buildCleanedPdfSheetRows, buildCleanedPdfSheetValues, CLEANED_PDF_SHEET_HEADERS } from '@/lib/cleanedPdfSheet';
import type { WeekSchedule } from '@/types/schedule';

describe('cleanedPdfSheet', () => {
  it('builds Cleaned-PDF rows with formatted dates, times, and themes', () => {
    const schedule: WeekSchedule = {
      id: 'schedule-1',
      weekStart: '13 Apr 2026',
      weekEnd: '19 Apr 2026',
      location: 'Kwality House, Kemps Corner',
      levels: {
        beginner: [],
        intermediate: [],
        advanced: [],
      },
      days: [
        {
          day: 'Monday',
          classes: [
            {
              id: 'class-2',
              time: '7:30 AM',
              className: 'Studio Barre 57',
              trainer: 'Simonelle De Vitre',
            },
            {
              id: 'class-1',
              time: '7:15',
              className: 'Studio Strength Lab (Push)',
              trainer: 'Anisha Shah',
              theme: 'Sean Paul & Friends',
            },
          ],
        },
        {
          day: 'Tuesday',
          date: '2026-04-14',
          classes: [
            {
              id: 'class-3',
              time: '18:30',
              className: 'Studio PowerCycle',
              trainer: 'Anmol Sharma',
              location: 'Supreme HQ, Bandra',
            },
          ],
        },
      ],
    };

    const rows = buildCleanedPdfSheetRows([schedule]);

    expect(rows).toEqual([
      {
        day: 'Monday',
        time: '07:15 AM',
        location: 'Kwality House, Kemps Corner',
        className: 'Studio Strength Lab (Push)',
        trainer: 'Anisha Shah',
        notes: '',
        date: '13 Apr 2026',
        theme: 'Sean Paul & Friends',
      },
      {
        day: 'Monday',
        time: '07:30 AM',
        location: 'Kwality House, Kemps Corner',
        className: 'Studio Barre 57',
        trainer: 'Simonelle De Vitre',
        notes: '',
        date: '13 Apr 2026',
        theme: '',
      },
      {
        day: 'Tuesday',
        time: '06:30 PM',
        location: 'Supreme HQ, Bandra',
        className: 'Studio PowerCycle',
        trainer: 'Anmol Sharma',
        notes: '',
        date: '14 Apr 2026',
        theme: '',
      },
    ]);
  });

  it('includes the spreadsheet headers when building values', () => {
    const values = buildCleanedPdfSheetValues([
      {
        day: 'Monday',
        time: '07:15 AM',
        location: 'Kwality House, Kemps Corner',
        className: 'Studio Strength Lab (Push)',
        trainer: 'Anisha Shah',
        notes: '',
        date: '13 Apr 2026',
        theme: '',
      },
    ]);

    expect(values[0]).toEqual([...CLEANED_PDF_SHEET_HEADERS]);
    expect(values[1]).toEqual([
      'Monday',
      '07:15 AM',
      'Kwality House, Kemps Corner',
      'Studio Strength Lab (Push)',
      'Anisha Shah',
      '',
      '13 Apr 2026',
      '',
    ]);
  });
});
