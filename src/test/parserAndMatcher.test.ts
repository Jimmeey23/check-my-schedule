import { describe, expect, it } from 'vitest';
import { parseCSVToSchedule } from '@/lib/csvParser';
import { alignCsvPdfData } from '@/lib/classDataMatcher';
import { __pdfParserTestUtils, scheduleToPdfClassData } from '@/lib/pdfParser';
import type { ClassData, PdfClassData } from '@/types/schedule';
import { compareSchedules, normalizeSchedule, normalizeThemeName } from '@/lib/normalizers';
import { applyPdfDataThemesToSchedule, mergeVisionThemesIntoPdfData } from '@/lib/pdfThemeVision';

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
  it('normalizes Weeknd theme spelling and spacing variants', () => {
    expect(normalizeThemeName('Kendrick Vs the Weekend')).toBe(normalizeThemeName('(Kendrick Vs Theweeknd)'));
    expect(normalizeThemeName('KENDRICK VS THE WEEKND')).toBe(normalizeThemeName('Kendrick Vs Theweeknd'));
  });

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

  it('flags theme mismatches only after matching the class row', () => {
    const csvData: { [day: string]: ClassData[] } = {
      Sunday: [
        {
          day: 'Sunday',
          timeRaw: '5:00 PM',
          timeDate: null,
          time: '17:00',
          location: 'Kemps',
          className: 'PowerCycle',
          trainer1: 'Anmol Sharma',
          cover: '',
          notes: '',
          theme: 'Decade Hits',
          uniqueKey: 'csv-theme-1',
        },
        {
          day: 'Sunday',
          timeRaw: '5:15 PM',
          timeDate: null,
          time: '17:15',
          location: 'Kemps',
          className: 'Mat 57',
          trainer1: 'Simran Dutt',
          cover: '',
          notes: '',
          theme: 'Circle Circus',
          uniqueKey: 'csv-theme-2',
        },
      ],
    };

    const pdfData: PdfClassData[] = [
      {
        day: 'Sunday',
        time: '17:00',
        className: 'Studio PowerCycle',
        trainer: 'Anmol Sharma',
        location: 'Kwality House, Kemps Corner',
        theme: '( DECADE HITS )',
        uniqueKey: 'pdf-theme-1',
      },
      {
        day: 'Sunday',
        time: '17:15',
        className: 'Studio Mat 57',
        trainer: 'Simran Dutt',
        location: 'Kwality House, Kemps Corner',
        theme: 'Kendrick vs the Weeknd',
        uniqueKey: 'pdf-theme-2',
      },
    ];

    const rows = alignCsvPdfData(csvData, pdfData);

    expect(rows.find(row => row.pdfClass?.uniqueKey === 'pdf-theme-1')?.status).toBe('match');
    const themeMismatch = rows.find(row => row.pdfClass?.uniqueKey === 'pdf-theme-2');
    expect(themeMismatch?.status).toBe('theme-mismatch');
    expect(themeMismatch?.discrepancies.themeMismatch).toBe(true);
  });

  it('does not treat PDF-only themes as mismatches when CSV theme is blank', () => {
    const csvData: { [day: string]: ClassData[] } = {
      Sunday: [
        {
          day: 'Sunday',
          timeRaw: '10:00 AM',
          timeDate: null,
          time: '10:00',
          location: 'Kemps',
          className: 'PowerCycle',
          trainer1: 'Raunak Khemuka',
          cover: '',
          notes: '',
          theme: '',
          uniqueKey: 'csv-no-theme',
        },
      ],
    };

    const pdfData: PdfClassData[] = [
      {
        day: 'Sunday',
        time: '10:00',
        className: 'Studio PowerCycle',
        trainer: 'Raunak Khemuka',
        location: 'Kwality House, Kemps Corner',
        theme: 'Decade Hits',
        uniqueKey: 'pdf-extra-theme',
      },
    ];

    const rows = alignCsvPdfData(csvData, pdfData);

    expect(rows[0]?.status).toBe('match');
    expect(rows[0]?.discrepancies.themeMismatch).toBeUndefined();
  });

  it('marks theme-only differences as theme differences in normalized schedule comparison', () => {
    const pdfClasses = normalizeSchedule([
      {
        day: 'Thursday',
        classes: [
          {
            id: 'pdf-theme-only',
            time: '8:00 AM',
            className: 'Studio PowerCycle',
            trainer: 'Anisha Shah',
            location: 'Supreme HQ, Bandra',
            theme: 'Kendrick vs the Weeknd',
          },
        ],
      },
    ]);
    const csvClasses = normalizeSchedule([
      {
        day: 'Thursday',
        classes: [
          {
            id: 'csv-theme-only',
            time: '8:00 AM',
            className: 'Studio PowerCycle',
            trainer: 'Anisha Shah',
            location: 'Supreme HQ, Bandra',
            theme: 'A Linkin Park Special',
          },
        ],
      },
    ]);

    const comparison = compareSchedules(pdfClasses, csvClasses);

    expect(comparison.pdfClasses[0]?.status).toBe('mismatch');
    expect(comparison.pdfClasses[0]?.differences).toEqual({ theme: true });
  });

  it('ignores PDF-only themes in normalized schedule comparison when CSV has no theme', () => {
    const pdfClasses = normalizeSchedule([
      {
        day: 'Sunday',
        classes: [
          {
            id: 'pdf-extra-theme',
            time: '10:00 AM',
            className: 'Studio PowerCycle',
            trainer: 'Raunak Khemuka',
            location: 'Kwality House, Kemps Corner',
            theme: 'Decade Hits',
          },
        ],
      },
    ]);
    const csvClasses = normalizeSchedule([
      {
        day: 'Sunday',
        classes: [
          {
            id: 'csv-no-theme',
            time: '10:00 AM',
            className: 'Studio PowerCycle',
            trainer: 'Raunak Khemuka',
            location: 'Kwality House, Kemps Corner',
          },
        ],
      },
    ]);

    const comparison = compareSchedules(pdfClasses, csvClasses);

    expect(comparison.pdfClasses[0]?.status).toBe('match');
    expect(comparison.pdfClasses[0]?.differences).toBeUndefined();
  });
});

describe('PDF visual theme enrichment', () => {
  it('fills blank PDF themes from high-confidence visual matches', () => {
    const pdfData: PdfClassData[] = [
      {
        day: 'Tuesday',
        time: '07:30',
        className: 'Studio PowerCycle',
        trainer: 'Bret Saldanha',
        location: 'Kwality House, Kemps Corner',
        uniqueKey: 'pdf-1',
      },
    ];

    const enriched = mergeVisionThemesIntoPdfData(pdfData, [
      {
        day: 'Tuesday',
        time: '07:30',
        className: 'PowerCycle',
        trainer: 'Bret Saldanha',
        theme: 'Decade Hits',
        confidence: 0.91,
      },
    ]);

    expect(enriched[0]?.theme).toBe('Decade Hits');
  });

  it('does not overwrite existing PDF themes or apply low-confidence matches', () => {
    const pdfData: PdfClassData[] = [
      {
        day: 'Sunday',
        time: '17:00',
        className: 'Studio PowerCycle',
        trainer: 'Anmol Sharma',
        location: 'Kwality House, Kemps Corner',
        theme: 'Existing Theme',
        uniqueKey: 'pdf-existing',
      },
      {
        day: 'Monday',
        time: '19:30',
        className: 'Studio PowerCycle',
        trainer: 'Raunak Khemuka',
        location: 'Kwality House, Kemps Corner',
        uniqueKey: 'pdf-low',
      },
    ];

    const enriched = mergeVisionThemesIntoPdfData(pdfData, [
      {
        day: 'Sunday',
        time: '17:00',
        className: 'PowerCycle',
        trainer: 'Anmol Sharma',
        theme: 'Decade Hits',
        confidence: 0.99,
      },
      {
        day: 'Monday',
        time: '19:30',
        className: 'PowerCycle',
        trainer: 'Raunak Khemuka',
        theme: 'Kendrick Vs The Weeknd',
        confidence: 0.55,
      },
    ]);

    expect(enriched[0]?.theme).toBe('Existing Theme');
    expect(enriched[1]?.theme).toBeUndefined();
  });

  it('does not apply ambiguous partial visual matches', () => {
    const pdfData: PdfClassData[] = [
      {
        day: 'Thursday',
        time: '10:30',
        className: 'Studio PowerCycle',
        trainer: 'Karanvir Bhatia',
        location: 'Kwality House, Kemps Corner',
        uniqueKey: 'pdf-ambiguous',
      },
    ];

    const enriched = mergeVisionThemesIntoPdfData(pdfData, [
      {
        day: 'Thursday',
        time: '10:30',
        className: 'PowerCycle',
        trainer: '',
        theme: 'Kendrick Vs The Weeknd',
        confidence: 0.92,
      },
      {
        day: 'Thursday',
        time: '10:30',
        className: 'PowerCycle',
        trainer: '',
        theme: 'Decade Hits',
        confidence: 0.93,
      },
    ]);

    expect(enriched[0]?.theme).toBeUndefined();
  });

  it('does not apply visual matches to the wrong day even when time and class match', () => {
    const pdfData: PdfClassData[] = [
      {
        day: 'Monday',
        time: '19:30',
        className: 'Studio PowerCycle',
        trainer: 'Raunak Khemuka',
        location: 'Kwality House, Kemps Corner',
        uniqueKey: 'pdf-monday',
      },
    ];

    const enriched = mergeVisionThemesIntoPdfData(pdfData, [
      {
        day: 'Tuesday',
        time: '19:30',
        className: 'Studio PowerCycle',
        trainer: 'Raunak Khemuka',
        theme: 'Kendrick Vs the Weeknd',
        confidence: 1,
      },
    ]);

    expect(enriched[0]?.theme).toBeUndefined();
  });

  it('does not apply visual OCR day headers as themes', () => {
    const pdfData: PdfClassData[] = [
      {
        day: 'Monday',
        time: '19:30',
        className: 'Studio PowerCycle',
        trainer: 'Raunak Khemuka',
        location: 'Kwality House, Kemps Corner',
        uniqueKey: 'pdf-monday',
      },
    ];

    const enriched = mergeVisionThemesIntoPdfData(pdfData, [
      {
        day: 'Monday',
        time: '19:30',
        className: 'Studio PowerCycle',
        trainer: 'Raunak Khemuka',
        theme: 'Wednesday Thursday',
        confidence: 0.98,
      },
    ]);

    expect(enriched[0]?.theme).toBeUndefined();
  });

  it('requires visual themes to match known CSV candidates when candidates are provided', () => {
    const pdfData: PdfClassData[] = [
      {
        day: 'Tuesday',
        time: '07:30',
        className: 'Studio PowerCycle',
        trainer: 'Bret Saldanha',
        location: 'Kwality House, Kemps Corner',
        uniqueKey: 'pdf-tuesday',
      },
      {
        day: 'Tuesday',
        time: '08:30',
        className: 'Studio Amped Up!',
        trainer: 'Reshma Sharma',
        location: 'Kwality House, Kemps Corner',
        uniqueKey: 'pdf-tuesday-amped',
      },
    ];

    const enriched = mergeVisionThemesIntoPdfData(
      pdfData,
      [
        {
          day: 'Tuesday',
          time: '07:30',
          className: 'Studio PowerCycle',
          trainer: 'Bret Saldanha',
          theme: 'Hosted',
          confidence: 0.99,
        },
        {
          day: 'Tuesday',
          time: '08:30',
          className: 'Studio Amped Up!',
          trainer: 'Reshma Sharma',
          theme: 'CIRCLE CIRCUS',
          confidence: 0.99,
        },
      ],
      { themeCandidates: ['Circle Circus', 'Decade Hits'] }
    );

    expect(enriched[0]?.theme).toBeUndefined();
    expect(enriched[1]?.theme).toBe('Circle Circus');
  });

  it('canonicalizes already parsed PDF themes against known CSV candidates', () => {
    const pdfData: PdfClassData[] = [
      {
        day: 'Monday',
        time: '19:30',
        className: 'Studio PowerCycle',
        trainer: 'Vivaran Dhasmana',
        location: 'Supreme HQ, Bandra',
        theme: 'Decade Hits Kendrick Vs The',
        uniqueKey: 'pdf-bandra-monday',
      },
      {
        day: 'Wednesday',
        time: '10:30',
        className: 'Studio PowerCycle',
        trainer: 'Cauveri Vikrant',
        location: 'Supreme HQ, Bandra',
        theme: 'Kendrick Vs Theweeknd Kendrick Vs The',
        uniqueKey: 'pdf-bandra-wednesday',
      },
    ];

    const enriched = mergeVisionThemesIntoPdfData(
      pdfData,
      [],
      { themeCandidates: ['Decade Hits', 'Kendrick Vs the Weekend'] }
    );

    expect(enriched[0]?.theme).toBe('Decade Hits');
    expect(enriched[1]?.theme).toBe('Kendrick Vs the Weekend');
  });

  it('does not add visual-only themes to PDF-only rows', () => {
    const pdfData: PdfClassData[] = [
      {
        day: 'Sunday',
        time: '11:30',
        className: 'Studio PowerCycle',
        trainer: 'Raunak Khemuka',
        location: 'Kwality House, Kemps Corner',
        uniqueKey: 'pdf-only-sunday',
      },
    ];

    const csvData: Record<string, ClassData[]> = {
      Sunday: [
        {
          day: 'Sunday',
          timeRaw: '17:00',
          timeDate: null,
          time: '17:00',
          location: 'Kwality House, Kemps Corner',
          className: 'Studio PowerCycle',
          trainer1: 'Anmol Sharma',
          cover: '',
          notes: '',
          theme: '',
          uniqueKey: 'csv-sunday',
        },
      ],
    };

    const enriched = mergeVisionThemesIntoPdfData(
      pdfData,
      [
        {
          day: 'Sunday',
          time: '11:30',
          className: 'Studio PowerCycle',
          trainer: 'Raunak Khemuka',
          theme: 'Length & Strength',
          confidence: 0.98,
        },
      ],
      { themeCandidates: ['Length & Strength'], csvData }
    );

    expect(enriched[0]?.theme).toBeUndefined();
  });

  it('copies enriched PDF themes back into the parsed schedule', () => {
    const schedule = {
      id: 'week-1',
      weekStart: '',
      weekEnd: '',
      location: 'Kemps',
      levels: { beginner: [], intermediate: [], advanced: [] },
      days: [
        {
          day: 'Tuesday',
          classes: [
            {
              id: 'class-1',
              time: '7:30 AM',
              className: 'Studio PowerCycle',
              trainer: 'Bret Saldanha',
            },
          ],
        },
      ],
    };

    const enrichedSchedule = applyPdfDataThemesToSchedule(schedule, [
      {
        day: 'Tuesday',
        time: '07:30',
        className: 'Studio PowerCycle',
        trainer: 'Bret Saldanha',
        location: 'Kwality House, Kemps Corner',
        theme: 'Decade Hits',
        uniqueKey: 'pdf-1',
      },
    ]);

    expect(enrichedSchedule.days[0]?.classes[0]?.theme).toBe('Decade Hits');
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

  it('does not extract unmarked hidden trailing text as a theme', () => {
    const classes = __pdfParserTestUtils.parseDayClasses([
      '7:15 AM FIT - Richard A LINKIN PARK SPECIAL',
    ], 0);

    expect(classes).toHaveLength(1);
    expect(classes[0]?.className).toBe('Studio FIT');
    expect(classes[0]?.trainer).toBe("Richard D'Costa");
    expect(classes[0]?.theme).toBeUndefined();
  });

  it('does not extract unmarked known theme words from a class row', () => {
    const classes = __pdfParserTestUtils.parseDayClasses([
      '7:15 AM FIT - Richard GLUTE CAMP',
    ], 0);

    expect(classes).toHaveLength(1);
    expect(classes[0]?.className).toBe('Studio FIT');
    expect(classes[0]?.trainer).toBe("Richard D'Costa");
    expect(classes[0]?.theme).toBeUndefined();
  });

  it('extracts parenthesized inline themes trailing after the trainer', () => {
    const classes = __pdfParserTestUtils.parseDayClasses([
      '7:30 PM powerCycle - Vivaran ( DECADE HITS )',
    ], 0);

    expect(classes).toHaveLength(1);
    expect(classes[0]?.className).toBe('Studio PowerCycle');
    expect(classes[0]?.trainer).toBe('Vivaran Dhasmana');
    expect(classes[0]?.theme).toBe('Decade Hits');
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

  it('pairs columnar time anchors with nearby class text when PDF baselines differ', () => {
    const parsePageColumnar = (__pdfParserTestUtils as unknown as {
      parsePageColumnar: (items: Array<{ str: string; x: number; y: number; width: number; height: number }>) => {
        days: Array<{ day: string; classes: Array<{ time: string; className: string; trainer: string }> }>;
        isColumnar: boolean;
      };
    }).parsePageColumnar;

    const { days, isColumnar } = parsePageColumnar([
      { str: 'WEDNESDAY', x: 47.59, y: 249.53, width: 151.16, height: 10 },
      { str: 'THURSDAY', x: 314.1, y: 249.18, width: 125.87, height: 10 },
      { str: '9:30 AM', x: 315.1, y: 172.48, width: 36.35, height: 10 },
      { str: 'MAT 57 - Anisha', x: 365.75, y: 175.62, width: 72.97, height: 10 },
      { str: '11:00 AM', x: 315.1, y: 156.08, width: 38.31, height: 10 },
      { str: 'BARRE 57 - Anisha', x: 365.75, y: 159.6, width: 85.02, height: 10 },
    ]);

    const thursday = days.find(day => day.day === 'Thursday');

    expect(isColumnar).toBe(true);
    expect(thursday?.classes).toHaveLength(2);
    expect(thursday?.classes[0]).toMatchObject({
      time: '9:30 AM',
      className: 'Studio Mat 57',
      trainer: 'Anisha Shah',
    });
    expect(thursday?.classes[1]).toMatchObject({
      time: '11:00 AM',
      className: 'Studio Barre 57',
      trainer: 'Anisha Shah',
    });
  });

  it('applies recovered legend themes to matching parsed rows', () => {
    const classes = [
      {
        id: 'pdf-0',
        time: '5:00 PM',
        className: 'Studio PowerCycle',
        trainer: 'Anmol Sharma',
      },
      {
        id: 'pdf-1',
        time: '5:15 PM',
        className: 'Studio Mat 57',
        trainer: 'Simran Dutt',
      },
    ];

    __pdfParserTestUtils.applyRecoveredThemesToDayClasses(
      classes,
      [
        {
          day: 'Sunday',
          pageIndex: 1,
          rowIndex: 0,
          sourceTime: '5:00PM',
          sourceClassName: 'powerCycle - Anmol',
          sourceTrainer: 'Anmol Sharma',
          timeRect: { pageIndex: 1, x: 0, y: 0, width: 10, height: 10 },
          classRect: { pageIndex: 1, x: 10, y: 0, width: 50, height: 10 },
          trainerRect: null,
        },
        {
          day: 'Sunday',
          pageIndex: 1,
          rowIndex: 1,
          sourceTime: '5:15 PM',
          sourceClassName: 'MAT 57 - Simran',
          sourceTrainer: 'Simran Dutt',
          timeRect: { pageIndex: 1, x: 0, y: 0, width: 10, height: 10 },
          classRect: { pageIndex: 1, x: 10, y: 0, width: 50, height: 10 },
          trainerRect: null,
        },
      ],
      ['Decade Hits', 'Circle Circus']
    );

    expect(classes[0]?.theme).toBe('Decade Hits');
    expect(classes[1]?.theme).toBe('Circle Circus');
  });

  it('does not attach leftover legend themes to rows by index', () => {
    const classes = [
      {
        id: 'pdf-0',
        time: '10:00 AM',
        className: 'Studio PowerCycle',
        trainer: 'Raunak Khemuka',
      },
      {
        id: 'pdf-1',
        time: '10:15 AM',
        className: 'Studio Cardio Barre',
        trainer: 'Rohan Dahima',
      },
    ];

    __pdfParserTestUtils.applyRecoveredThemesToDayClasses(
      classes,
      [
        {
          day: 'Sunday',
          pageIndex: 1,
          rowIndex: 0,
          sourceTime: '1:00 PM',
          sourceClassName: 'Legend placeholder',
          sourceTrainer: '',
          timeRect: { pageIndex: 1, x: 0, y: 0, width: 10, height: 10 },
          classRect: { pageIndex: 1, x: 10, y: 0, width: 50, height: 10 },
          trainerRect: null,
        },
        {
          day: 'Sunday',
          pageIndex: 1,
          rowIndex: 1,
          sourceTime: '2:00 PM',
          sourceClassName: 'Legend placeholder',
          sourceTrainer: '',
          timeRect: { pageIndex: 1, x: 0, y: 0, width: 10, height: 10 },
          classRect: { pageIndex: 1, x: 10, y: 0, width: 50, height: 10 },
          trainerRect: null,
        },
      ],
      ['Decade Hits', 'Circle Circus']
    );

    expect(classes[0]?.theme).toBeUndefined();
    expect(classes[1]?.theme).toBeUndefined();
  });

  it('does not treat schedule day headers as theme legend labels', () => {
    const width = 240;
    const height = 240;
    const data = new Uint8ClampedArray(width * height * 4).fill(255);
    const paintPdfRect = (rect: { x: number; y: number; width: number; height: number }, color: [number, number, number]) => {
      for (let pdfY = rect.y; pdfY < rect.y + rect.height; pdfY += 1) {
        for (let pdfX = rect.x; pdfX < rect.x + rect.width; pdfX += 1) {
          const imageY = height - pdfY - 1;
          const index = (imageY * width + pdfX) * 4;
          data[index] = color[0];
          data[index + 1] = color[1];
          data[index + 2] = color[2];
          data[index + 3] = 255;
        }
      }
    };

    paintPdfRect({ x: 8, y: 93, width: 35, height: 14 }, [112, 186, 149]);
    paintPdfRect({ x: 45, y: 28, width: 55, height: 14 }, [242, 201, 156]);

    const detectThemeLegendEntries = (__pdfParserTestUtils as unknown as {
      detectThemeLegendEntries: (
        lines: Array<{ text: string; items: unknown[]; x: number; y: number; width: number; height: number; pageIndex: number }>,
        pageIndex: number,
        sample: { width: number; height: number; imageData: { width: number; height: number; data: Uint8ClampedArray } }
      ) => Array<{ theme: string }>;
    }).detectThemeLegendEntries;

    const entries = detectThemeLegendEntries(
      [
        { text: 'Wednesday Thursday', items: [], x: 48, y: 95, width: 160, height: 14, pageIndex: 0 },
        { text: 'DECADE HITS', items: [], x: 112, y: 30, width: 90, height: 14, pageIndex: 0 },
      ],
      0,
      {
        width,
        height,
        imageData: { width, height, data },
      }
    );

    expect(entries.map(entry => entry.theme)).toEqual(['Decade Hits']);
  });

  it('keeps parsed PDF themes when converting schedule rows for comparison', () => {
    const rows = scheduleToPdfClassData({
      id: 'week-1',
      weekStart: '',
      weekEnd: '',
      location: 'Kemps',
      levels: { beginner: [], intermediate: [], advanced: [] },
      days: [
        {
          day: 'Sunday',
          classes: [
            {
              id: 'pdf-theme-row',
              time: '5:00 PM',
              className: 'Studio PowerCycle',
              trainer: 'Anmol Sharma',
              theme: 'Decade Hits',
            },
          ],
        },
      ],
    });

    expect(rows[0]?.theme).toBe('Decade Hits');
  });
});
