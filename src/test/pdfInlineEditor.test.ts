import { describe, expect, it } from 'vitest';
import { buildInlineOverlayTargets, createSyntheticTemplateRowSlot, parseCombinedClassLine } from '@/lib/pdfInlineEditor';
import type { PdfTemplateLayout } from '@/lib/pdfParser';
import type { WeekSchedule } from '@/types/schedule';

function createSchedule(classCount = 1): WeekSchedule {
  return {
    id: 'schedule-1',
    weekStart: '2026-04-06',
    weekEnd: '2026-04-12',
    location: 'Kemps',
    levels: {
      beginner: [],
      intermediate: [],
      advanced: [],
    },
    days: [
      {
        day: 'Monday',
        classes: Array.from({ length: classCount }, (_, index) => ({
          id: `class-${index}`,
          time: index === 0 ? '7:15 AM' : '8:30 AM',
          className: index === 0 ? 'Studio Barre 57' : 'Studio FIT',
          trainer: index === 0 ? 'Reshma Sharma' : 'Raunak Khemuka',
          location: 'Kemps',
        })),
      },
    ],
  };
}

function createLayout(): PdfTemplateLayout {
  return {
    pageCount: 1,
    rowsByDay: {
      Monday: [
        {
          day: 'Monday',
          pageIndex: 0,
          rowIndex: 0,
          sourceTime: '7:15 AM',
          sourceClassName: 'Studio Barre 57',
          sourceTrainer: 'Reshma Sharma',
          timeRect: { pageIndex: 0, x: 20, y: 500, width: 60, height: 16 },
          classRect: { pageIndex: 0, x: 100, y: 498, width: 140, height: 18 },
          trainerRect: { pageIndex: 0, x: 245, y: 498, width: 60, height: 18 },
        },
      ],
    },
  };
}

describe('pdf inline editor helpers', () => {
  it('maps detected template rows to overlay targets with the correct schedule coordinates', () => {
    const overlays = buildInlineOverlayTargets('file-1', createSchedule(), createLayout());

    expect(overlays).toHaveLength(2);
    expect(overlays[0]).toMatchObject({
      fileId: 'file-1',
      day: 'Monday',
      classIndex: 0,
      target: 'classLine',
      pageIndex: 0,
    });
    expect(overlays[1]).toMatchObject({
      fileId: 'file-1',
      day: 'Monday',
      classIndex: 0,
      target: 'time',
      pageIndex: 0,
    });

    const classLine = overlays.find(overlay => overlay.target === 'classLine');
    expect(classLine?.value).toBe('Studio Barre 57 - Reshma');
    expect(classLine?.rect.width).toBeGreaterThan(140);
  });

  it('generates synthetic row slots when classes exceed detected rows', () => {
    const layout = createLayout();
    const synthetic = createSyntheticTemplateRowSlot(layout.rowsByDay.Monday, 1);

    expect(synthetic).not.toBeNull();
    expect(synthetic?.rowIndex).toBe(1);
    expect(synthetic!.timeRect.y).toBeLessThan(layout.rowsByDay.Monday[0].timeRect.y);

    const overlays = buildInlineOverlayTargets('file-1', createSchedule(2), layout);
    const syntheticTime = overlays.find(overlay => overlay.classIndex === 1 && overlay.target === 'time');

    expect(syntheticTime?.synthetic).toBe(true);
    expect(syntheticTime?.pageIndex).toBe(0);
  });

  it('parses combined class lines while preserving the trainer when no separator is present', () => {
    expect(parseCombinedClassLine('Studio Cardio Barre - Raunak', 'Reshma Sharma')).toEqual({
      className: 'Studio Cardio Barre',
      trainer: 'Raunak',
    });

    expect(parseCombinedClassLine('Studio FIT', 'Reshma Sharma')).toEqual({
      className: 'Studio FIT',
      trainer: 'Reshma Sharma',
    });
  });
});
