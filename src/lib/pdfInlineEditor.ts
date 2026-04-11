import type { PdfTemplateLayout, PdfTemplateRect, PdfTemplateRow } from '@/lib/pdfParser';
import type { InlinePdfOverlayTargetDescriptor, RenderedPdfPageMetrics, WeekSchedule } from '@/types/schedule';

export const PDF_INLINE_EDITOR_DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function normalizeFieldValue(value: string | undefined | null): string {
  return (value || '').replace(/\s+/g, ' ').trim();
}

function getTrainerFirstName(trainer: string | undefined): string {
  const normalized = normalizeFieldValue(trainer);
  return normalized.split(/\s+/)[0] || '';
}

export function buildCombinedClassLine(className: string | undefined, trainer: string | undefined): string {
  const safeClassName = normalizeFieldValue(className);
  const safeTrainer = getTrainerFirstName(trainer);

  if (safeClassName && safeTrainer) return `${safeClassName} - ${safeTrainer}`;
  return safeClassName || safeTrainer;
}

export function parseCombinedClassLine(input: string, currentTrainer: string | undefined): { className: string; trainer?: string } {
  const normalized = normalizeFieldValue(input);
  if (!normalized) {
    return {
      className: '',
      trainer: normalizeFieldValue(currentTrainer),
    };
  }

  const separator = ' - ';
  if (!normalized.includes(separator)) {
    return {
      className: normalized,
      trainer: normalizeFieldValue(currentTrainer),
    };
  }

  const [classNamePart, ...trainerParts] = normalized.split(separator);
  const trainer = normalizeFieldValue(trainerParts.join(separator));

  return {
    className: normalizeFieldValue(classNamePart),
    trainer: trainer || normalizeFieldValue(currentTrainer),
  };
}

export function mergeTemplateRects(...rects: Array<PdfTemplateRect | null | undefined>): PdfTemplateRect | null {
  const validRects = rects.filter((rect): rect is PdfTemplateRect => Boolean(rect));
  if (!validRects.length) return null;

  const first = validRects[0];
  const minX = Math.min(...validRects.map(rect => rect.x));
  const minY = Math.min(...validRects.map(rect => rect.y));
  const maxX = Math.max(...validRects.map(rect => rect.x + rect.width));
  const maxY = Math.max(...validRects.map(rect => rect.y + rect.height));

  return {
    pageIndex: first.pageIndex,
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

export function averageTemplateRowGap(rows: PdfTemplateRow[]): number {
  if (rows.length < 2) return Math.max((rows[0]?.timeRect.height || 12) * 1.7, 18);

  const gaps = rows
    .slice(1)
    .map((row, index) => rows[index].timeRect.y - row.timeRect.y)
    .filter(gap => gap > 0);

  if (!gaps.length) return Math.max(rows[0]?.timeRect.height * 1.7 || 18, 18);
  return gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
}

function offsetRect(rect: PdfTemplateRect, deltaY: number): PdfTemplateRect {
  return {
    ...rect,
    y: rect.y + deltaY,
  };
}

export function createSyntheticTemplateRowSlot(rows: PdfTemplateRow[], index: number): PdfTemplateRow | null {
  if (!rows.length) return null;

  const lastRow = rows[rows.length - 1];
  const step = averageTemplateRowGap(rows);
  const multiplier = index - rows.length + 1;
  const deltaY = -step * multiplier;

  return {
    ...lastRow,
    rowIndex: index,
    timeRect: offsetRect(lastRow.timeRect, deltaY),
    classRect: offsetRect(lastRow.classRect, deltaY),
    trainerRect: lastRow.trainerRect ? offsetRect(lastRow.trainerRect, deltaY) : null,
  };
}

export function getTemplateRowSlot(rows: PdfTemplateRow[], index: number): PdfTemplateRow | null {
  return rows[index] ?? createSyntheticTemplateRowSlot(rows, index);
}

export function pdfRectToDomPosition(rect: PdfTemplateRect, pageMetrics: RenderedPdfPageMetrics) {
  return {
    left: rect.x * pageMetrics.scale,
    top: pageMetrics.height - (rect.y + rect.height) * pageMetrics.scale,
    width: rect.width * pageMetrics.scale,
    height: rect.height * pageMetrics.scale,
  };
}

export function buildInlineOverlayTargets(
  fileId: string,
  schedule: WeekSchedule,
  templateLayout: PdfTemplateLayout
): InlinePdfOverlayTargetDescriptor[] {
  const daysInOrder = [...schedule.days]
    .sort((left, right) => PDF_INLINE_EDITOR_DAY_ORDER.indexOf(left.day) - PDF_INLINE_EDITOR_DAY_ORDER.indexOf(right.day));

  const overlays: InlinePdfOverlayTargetDescriptor[] = [];

  for (const day of daysInOrder) {
    const templateRows = templateLayout.rowsByDay[day.day] ?? [];

    day.classes.forEach((cls, classIndex) => {
      const slot = getTemplateRowSlot(templateRows, classIndex);
      if (!slot) return;

      const classLineRect = mergeTemplateRects(slot.classRect, slot.trainerRect) ?? slot.classRect;

      overlays.push({
        id: `${fileId}:${day.day}:${classIndex}:time`,
        fileId,
        day: day.day,
        classIndex,
        target: 'time',
        pageIndex: slot.pageIndex,
        rect: slot.timeRect,
        value: cls.time,
        label: `${day.day} class ${classIndex + 1} time`,
        synthetic: classIndex >= templateRows.length,
      });

      overlays.push({
        id: `${fileId}:${day.day}:${classIndex}:classLine`,
        fileId,
        day: day.day,
        classIndex,
        target: 'classLine',
        pageIndex: slot.pageIndex,
        rect: classLineRect,
        value: buildCombinedClassLine(cls.className, cls.trainer),
        label: `${day.day} class ${classIndex + 1} class line`,
        synthetic: classIndex >= templateRows.length,
      });
    });
  }

  return overlays.sort((left, right) => {
    if (left.pageIndex !== right.pageIndex) return left.pageIndex - right.pageIndex;
    const dayOrder = PDF_INLINE_EDITOR_DAY_ORDER.indexOf(left.day) - PDF_INLINE_EDITOR_DAY_ORDER.indexOf(right.day);
    if (dayOrder !== 0) return dayOrder;
    if (left.classIndex !== right.classIndex) return left.classIndex - right.classIndex;
    return left.target.localeCompare(right.target);
  });
}
