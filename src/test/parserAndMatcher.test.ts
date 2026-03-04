import { describe, expect, it } from 'vitest';
import { parseCSVToSchedule } from '@/lib/csvParser';
import { alignCsvPdfData } from '@/lib/classDataMatcher';
import type { ClassData, PdfClassData } from '@/types/schedule';

describe('CSV parser', () => {
  it('uses day-specific cover columns even when cover fields move', () => {
    const csv = `
Exported Report
Day,Start Time,Class Name,Trainer,Monday Cover,Tuesday Cover,Location
Monday,7:15 PM,Barre 57,Anisha,Reshma,,Kemps
Tuesday,8:30 AM,Mat 57,Richard,,Pranjali,Bandra
`;

    const schedule = parseCSVToSchedule(csv);
    expect(schedule).not.toBeNull();

    const monday = schedule!.days.find(day => day.day === 'Monday');
    const tuesday = schedule!.days.find(day => day.day === 'Tuesday');

    expect(monday?.classes[0]?.trainer).toBe('Reshma Sharma');
    expect(tuesday?.classes[0]?.trainer).toBe('Pranjali Jain');
  });

  it('derives day name from date when no explicit day column exists', () => {
    const csv = `
Class Date,Time,Class,Instructor,Cover,Location
2026-02-09,7:15 PM,Barre 57,Anisha,Reshma,Kemps
`;

    const schedule = parseCSVToSchedule(csv);
    expect(schedule).not.toBeNull();
    expect(schedule!.days[0]?.day).toBe('Monday');
    expect(schedule!.days[0]?.classes[0]?.trainer).toBe('Reshma Sharma');
  });

  it('parses grid CSV with dynamic subcolumn order', () => {
    const csv = `
,9 Feb 2026,,,,,10 Feb 2026,,,,
,Monday,,,,,Tuesday,,,,
Slot,Class,Instructor,Cover,Location,Theme,Class,Cover,Instructor,Location,Theme
7:15 PM,Barre 57,Anisha,Reshma,Kemps,,Mat 57,Pranjali,Richard,Bandra,
`;

    const schedule = parseCSVToSchedule(csv);
    expect(schedule).not.toBeNull();

    const monday = schedule!.days.find(day => day.day === 'Monday');
    const tuesday = schedule!.days.find(day => day.day === 'Tuesday');

    expect(monday?.classes[0]?.trainer).toBe('Reshma Sharma');
    expect(tuesday?.classes[0]?.trainer).toBe('Pranjali Jain');
  });
});

describe('CSV/PDF alignment', () => {
  it('returns consistent mismatch status categories', () => {
    const csvData: { [day: string]: ClassData[] } = {
      Monday: [
        {
          day: 'Monday',
          timeRaw: '7:15 PM',
          timeDate: null,
          time: '19:15',
          location: 'Kemps',
          className: 'Barre 57',
          trainer1: 'Reshma Sharma',
          cover: '',
          notes: '',
          uniqueKey: 'csv-1',
        },
      ],
      Tuesday: [
        {
          day: 'Tuesday',
          timeRaw: '8:30 AM',
          timeDate: null,
          time: '08:30',
          location: 'Bandra',
          className: 'Mat 57',
          trainer1: 'Richard D\'Costa',
          cover: '',
          notes: '',
          uniqueKey: 'csv-2',
        },
      ],
    };

    const pdfData: PdfClassData[] = [
      {
        day: 'Monday',
        time: '19:15',
        className: 'Studio Barre 57',
        trainer: 'Anisha Shah',
        location: 'Kwality House, Kemps Corner',
        uniqueKey: 'pdf-1',
      },
      {
        day: 'Tuesday',
        time: '08:40',
        className: 'Studio Mat 57',
        trainer: 'Richard D\'Costa',
        location: 'Supreme HQ, Bandra',
        uniqueKey: 'pdf-2',
      },
    ];

    const rows = alignCsvPdfData(csvData, pdfData);
    const monday = rows.find(row => row.day === 'Monday');
    const tuesday = rows.find(row => row.day === 'Tuesday');

    expect(monday?.status).toBe('trainer-mismatch');
    expect(tuesday?.status).toBe('time-mismatch');
  });
});
