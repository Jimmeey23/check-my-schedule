import { describe, expect, it } from 'vitest';
import { parseCSVToSchedule } from '@/lib/csvParser';
import { alignCsvPdfData } from '@/lib/classDataMatcher';
import { __pdfParserTestUtils } from '@/lib/pdfParser';
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

  it('skips rows where the class column contains a trainer name', () => {
    const csv = `
Day,Start Time,Class Name,Trainer,Location
Friday,10:00 AM,Smita Parekh,Richard D'Costa,Kemps
Friday,11:00 AM,FIT,Anisha,Kemps
`;

    const schedule = parseCSVToSchedule(csv);
    expect(schedule).not.toBeNull();

    const friday = schedule!.days.find(day => day.day === 'Friday');
    expect(friday?.classes).toHaveLength(1);
    expect(friday?.classes[0]?.className).toBe('Studio FIT');
  });

  it('skips rows where the class column is a private session or trainer-only label', () => {
    const csv = `
Day,Start Time,Class Name,Trainer,Location
Friday,10:00 AM,PVT - Smita Parekh,Richard D'Costa,Kemps
Friday,10:30 AM,Smita Parekh,Richard D'Costa,Kemps
Friday,11:00 AM,Barre 57,Anisha,Kemps
`;

    const schedule = parseCSVToSchedule(csv);
    expect(schedule).not.toBeNull();

    const friday = schedule!.days.find(day => day.day === 'Friday');
    expect(friday?.classes).toHaveLength(1);
    expect(friday?.classes[0]?.className).toBe('Studio Barre 57');
  });

  it('skips grid csv rows whose class cell does not contain a recognized class name', () => {
    const csv = `
,9 Feb 2026,,,,,10 Feb 2026,,,,
,Monday,,,,,Tuesday,,,,
Slot,Class,Instructor,Cover,Location,Theme,Class,Instructor,Cover,Location,Theme
7:15 PM,PVT - Smita Parekh,Richard,,Kemps,,Mat 57,Richard,,Bandra,
8:15 PM,PowerCycle,Anmol,,Kemps,,FIT,Anisha,,Bandra,
`;

    const schedule = parseCSVToSchedule(csv);
    expect(schedule).not.toBeNull();

    const monday = schedule!.days.find(day => day.day === 'Monday');
    expect(monday?.classes).toHaveLength(1);
    expect(monday?.classes[0]?.className).toBe('Studio PowerCycle');
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

  it('prefers stronger class matches over same-time wrong-class pairings', () => {
    const csvData: { [day: string]: ClassData[] } = {
      Wednesday: [
        {
          day: 'Wednesday',
          timeRaw: '6:30 PM',
          timeDate: null,
          time: '18:30',
          location: 'Kemps',
          className: 'PowerCycle',
          trainer1: 'Anmol Sharma',
          cover: '',
          notes: '',
          uniqueKey: 'csv-1',
        },
        {
          day: 'Wednesday',
          timeRaw: '6:15 PM',
          timeDate: null,
          time: '18:15',
          location: 'Kemps',
          className: 'Mat 57',
          trainer1: 'Bret Saldanha',
          cover: '',
          notes: '',
          uniqueKey: 'csv-2',
        },
      ],
    };

    const pdfData: PdfClassData[] = [
      {
        day: 'Wednesday',
        time: '18:15',
        className: 'Studio PowerCycle',
        trainer: 'Bret Saldanha',
        location: 'Kwality House, Kemps Corner',
        uniqueKey: 'pdf-1',
      },
    ];

    const rows = alignCsvPdfData(csvData, pdfData);
    const mismatch = rows.find(row => row.pdfClass?.uniqueKey === 'pdf-1');

    expect(mismatch?.csvClass?.uniqueKey).toBe('csv-1');
    expect(mismatch?.status).toBe('time-mismatch');
  });
});

describe('PDF parser regressions', () => {
  const buildTextItems = (line: string) => {
    const items: Array<{ str: string; x: number; y: number; width: number; height: number }> = [];
    let x = 10;

    for (const char of line) {
      if (char === ' ') {
        x += 5;
        continue;
      }

      items.push({
        str: char,
        x,
        y: 100,
        width: 4,
        height: 10,
      });

      x += 4;
    }

    return items;
  };

  it('reconstructs split glyph text so PowerCycle maps correctly', () => {
    const lines = __pdfParserTestUtils.groupIntoLines(buildTextItems('7:15 PM PowerCycle - RAUNAK'));
    const classes = __pdfParserTestUtils.parseDayClasses(lines, 0);

    expect(classes).toHaveLength(1);
    expect(classes[0]?.className).toBe('Studio PowerCycle');
    expect(classes[0]?.trainer).toBe('Raunak Khemuka');
  });

  it('recovers PowerCycle from fragmented extracted text with trainer appended', () => {
    const classes = __pdfParserTestUtils.parseDayClasses(['7:15 PM pow e r C y cle - RAUNAK'], 0);

    expect(classes).toHaveLength(1);
    expect(classes[0]?.className).toBe('Studio PowerCycle');
    expect(classes[0]?.trainer).toBe('Raunak Khemuka');
  });

  it('preserves strength lab variants when they continue on the next line', () => {
    const classes = __pdfParserTestUtils.parseDayClasses([
      '7:15 PM Strength Lab',
      '(Full Body) - Raunak',
    ], 0);

    expect(classes).toHaveLength(1);
    expect(classes[0]?.className).toBe('Studio Strength Lab (Full Body)');
    expect(classes[0]?.trainer).toBe('Raunak Khemuka');
  });

  it('extracts inline theme badges trailing after the trainer', () => {
    const classes = __pdfParserTestUtils.parseDayClasses([
      '10:15 AM Cardio Barre - Rohan ⚡️ GLUTE CAMP',
    ], 0);

    expect(classes).toHaveLength(1);
    expect(classes[0]?.className).toBe('Studio Cardio Barre');
    expect(classes[0]?.trainer).toBe('Rohan Dahima');
    expect(classes[0]?.theme).toBe('Glute Camp');
  });

  it('does not extract themes from the next line after the trainer', () => {
    const classes = __pdfParserTestUtils.parseDayClasses([
      '5:00 PM PowerCycle - Anmol',
      '⚡️ Taylor Swift Vs Somber',
    ], 0);

    expect(classes).toHaveLength(1);
    expect(classes[0]?.className).toBe('Studio PowerCycle');
    expect(classes[0]?.trainer).toBe('Anmol Sharma');
    expect(classes[0]?.theme).toBeUndefined();
  });

  it('does not extract split theme fragments from separate lines', () => {
    const classes = __pdfParserTestUtils.parseDayClasses([
      '07:30 AM Mat 57 - Reshma',
      '(Sean Paul',
      '08:30 AM PowerCycle - Anmol',
      'And Friends)',
    ], 0);

    expect(classes).toHaveLength(2);
    expect(classes[0]?.className).toBe('Studio Mat 57');
    expect(classes[0]?.theme).toBeUndefined();
    expect(classes[1]?.className).toBe('Studio PowerCycle');
    expect(classes[1]?.trainer).toBe('Anmol Sharma');
    expect(classes[1]?.theme).toBeUndefined();
  });
});
