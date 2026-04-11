import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { buildCombinedClassLine, createSyntheticTemplateRowSlot, mergeTemplateRects } from '@/lib/pdfInlineEditor';
import type { PdfTemplateLayout, PdfTemplateRect, PdfTemplateRow } from '@/lib/pdfParser';
import type { ScheduleClass, WeekSchedule } from '@/types/schedule';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

export type PdfEditedTextFontKey =
  | 'montserratBold'
  | 'montserratMedium'
  | 'montserratMediumAlt'
  | 'montserratRegular'
  | 'myriadRegular'
  | 'agrandirHeavy'
  | 'ivyPrestoBoldItalic';

export type PdfEditedTextTarget = 'time' | 'class' | 'trainer' | 'theme';

export interface PdfEditedTextStyle {
  fontKey: PdfEditedTextFontKey;
  fontSize: number;
  color: string;
  offsetX?: number; // horizontal offset in px
  offsetY?: number; // vertical offset in px
  backgroundColor?: string; // background color
  backgroundOpacity?: number; // 0-1
  borderRadius?: number; // border radius in px
  paddingX?: number; // horizontal padding
  paddingY?: number; // vertical padding
}

export interface PdfEditedTextStyles {
  time: PdfEditedTextStyle;
  class: PdfEditedTextStyle;
  trainer: PdfEditedTextStyle;
  theme: PdfEditedTextStyle;
}

type PdfFontOption = {
  value: PdfEditedTextFontKey;
  label: string;
  fontFamily: string;
  fontWeight: number;
};

export const PDF_EDITED_TEXT_FONT_OPTIONS: PdfFontOption[] = [
  {
    value: 'montserratBold',
    label: 'Montserrat Bold',
    fontFamily: '"Montserrat-Bold_2a", "Montserrat-Bold_1z", sans-serif',
    fontWeight: 400,
  },
  {
    value: 'montserratMedium',
    label: 'Montserrat Medium',
    fontFamily: '"Montserrat-Medium_2b", sans-serif',
    fontWeight: 400,
  },
  {
    value: 'montserratMediumAlt',
    label: 'Montserrat Medium Alt',
    fontFamily: '"Montserrat-Medium_2k", sans-serif',
    fontWeight: 400,
  },
  {
    value: 'montserratRegular',
    label: 'Montserrat Regular',
    fontFamily: '"Montserrat-Regular_2c", sans-serif',
    fontWeight: 400,
  },
  {
    value: 'myriadRegular',
    label: 'Myriad Pro Regular',
    fontFamily: '"MyriadPro-Regular_2f", sans-serif',
    fontWeight: 400,
  },
  {
    value: 'agrandirHeavy',
    label: 'Agrandir GrandHeavy',
    fontFamily: '"Agrandir-GrandHeavy_2e", sans-serif',
    fontWeight: 400,
  },
  {
    value: 'ivyPrestoBoldItalic',
    label: 'Ivy Presto Bold Italic',
    fontFamily: '"IvyPrestoDisplay-BoldItalic_2d", serif',
    fontWeight: 700,
  },
];

export const DEFAULT_PDF_EDITED_TEXT_STYLES: PdfEditedTextStyles = {
  time: {
    fontKey: 'montserratBold',
    fontSize: 14,
    color: '#33B0E5',
    offsetX: 0,
    offsetY: 0,
    backgroundColor: '#FFFFFF',
    backgroundOpacity: 0,
    borderRadius: 4,
    paddingX: 0,
    paddingY: 0,
  },
  class: {
    fontKey: 'montserratMedium',
    fontSize: 13,
    color: '#2C2D2D',
    offsetX: 0,
    offsetY: 0,
    backgroundColor: '#FFFFFF',
    backgroundOpacity: 0,
    borderRadius: 4,
    paddingX: 0,
    paddingY: 0,
  },
  trainer: {
    fontKey: 'montserratRegular',
    fontSize: 11,
    color: '#666666',
    offsetX: 0,
    offsetY: 0,
    backgroundColor: '#FFFFFF',
    backgroundOpacity: 0,
    borderRadius: 4,
    paddingX: 0,
    paddingY: 0,
  },
  theme: {
    fontKey: 'montserratMedium',
    fontSize: 10,
    color: '#999999',
    offsetX: 0,
    offsetY: 0,
    backgroundColor: '#F0F0F0',
    backgroundOpacity: 0.3,
    borderRadius: 2,
    paddingX: 2,
    paddingY: 2,
  },
};

type ExportRow = {
  day: string;
  time: string;
  className: string;
  trainer: string;
  location: string;
};

function flattenSchedule(schedule: WeekSchedule): ExportRow[] {
  return schedule.days.flatMap(day =>
    day.classes.map((cls: ScheduleClass) => ({
      day: day.day,
      time: cls.time,
      className: cls.className,
      trainer: cls.trainer,
      location: cls.location || schedule.location,
    }))
  );
}

function sanitizeFileName(name: string): string {
  return name
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-z0-9-_]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function escapeCsv(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }

  return value;
}

function buildTabularSchedulePdfBlob(schedule: WeekSchedule, sourceName: string): Blob {
  const rows = flattenSchedule(schedule);
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });

  doc.setFontSize(18);
  doc.text('Edited Schedule Export', 40, 46);
  doc.setFontSize(11);
  doc.text(`Source: ${sourceName}`, 40, 66);
  doc.text(`Location: ${schedule.location || '—'}`, 40, 82);
  doc.text(`Week: ${schedule.weekStart || '—'} → ${schedule.weekEnd || '—'}`, 40, 98);

  autoTable(doc, {
    startY: 120,
    head: [['Day', 'Time', 'Class Name', 'Trainer', 'Location']],
    body: rows.map(row => [row.day, row.time, row.className, row.trainer, row.location]),
    styles: {
      fontSize: 10,
      cellPadding: 6,
      lineColor: [226, 232, 240],
      lineWidth: 0.5,
    },
    headStyles: {
      fillColor: [3, 83, 164],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    margin: { left: 40, right: 40, bottom: 32 },
  });

  return doc.output('blob');
}

function normalizeFieldValue(value: string | undefined | null): string {
  return (value || '').replace(/\s+/g, ' ').trim();
}

function shouldOverwriteField(currentValue: string | undefined, baselineValue: string | undefined): boolean {
  return normalizeFieldValue(currentValue) !== normalizeFieldValue(baselineValue);
}

type RenderedPdfPage = {
  width: number;
  height: number;
  scale: number;
  canvas: HTMLCanvasElement;
};

async function canvasToPngBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(result => {
      if (result) resolve(result);
      else reject(new Error('Failed to render PDF page image.'));
    }, 'image/png');
  });

  return new Uint8Array(await blob.arrayBuffer());
}

async function renderPdfPagesForOverlay(sourceBytes: ArrayBuffer): Promise<RenderedPdfPage[]> {
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(sourceBytes) }).promise;
  const renderedPages: RenderedPdfPage[] = [];

  for (let index = 1; index <= pdf.numPages; index++) {
    const page = await pdf.getPage(index);
    const outputViewport = page.getViewport({ scale: 1 });
    const renderScale = 2;
    const renderViewport = page.getViewport({ scale: renderScale });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    if (!context) {
      throw new Error('Could not create PDF rendering context.');
    }

    canvas.width = Math.ceil(renderViewport.width);
    canvas.height = Math.ceil(renderViewport.height);

    await page.render({ canvasContext: context, viewport: renderViewport }).promise;

    renderedPages.push({
      width: outputViewport.width,
      height: outputViewport.height,
      scale: renderScale,
      canvas,
    });
  }

  return renderedPages;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function sampleBackgroundColor(canvas: HTMLCanvasElement, rect: PdfTemplateRect, scale: number): { r: number; g: number; b: number } {
  const context = canvas.getContext('2d');
  if (!context) return { r: 1, g: 1, b: 1 };

  const x = clamp(Math.floor(rect.x * scale), 0, Math.max(canvas.width - 1, 0));
  const y = clamp(Math.floor(canvas.height - (rect.y + rect.height) * scale), 0, Math.max(canvas.height - 1, 0));
  const width = clamp(Math.ceil(rect.width * scale), 1, canvas.width - x);
  const height = clamp(Math.ceil(rect.height * scale), 1, canvas.height - y);
  const inset = Math.max(1, Math.min(3, Math.floor(Math.min(width, height) / 6)));
  const imageData = context.getImageData(x, y, width, height).data;

  let red = 0;
  let green = 0;
  let blue = 0;
  let sampleCount = 0;

  for (let row = 0; row < height; row++) {
    for (let column = 0; column < width; column++) {
      const isBorderPixel = row < inset || row >= height - inset || column < inset || column >= width - inset;
      if (!isBorderPixel) continue;

      const offset = (row * width + column) * 4;
      red += imageData[offset];
      green += imageData[offset + 1];
      blue += imageData[offset + 2];
      sampleCount += 1;
    }
  }

  if (!sampleCount) return { r: 1, g: 1, b: 1 };

  return {
    r: red / sampleCount / 255,
    g: green / sampleCount / 255,
    b: blue / sampleCount / 255,
  };
}

function getPdfEditedTextFontOption(fontKey: PdfEditedTextFontKey): PdfFontOption {
  return PDF_EDITED_TEXT_FONT_OPTIONS.find(option => option.value === fontKey) ?? PDF_EDITED_TEXT_FONT_OPTIONS[0];
}

function sanitizeColor(color: string, fallback: string): string {
  return /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;
}

function sanitizeFontSize(fontSize: number, fallback: number): number {
  if (!Number.isFinite(fontSize)) return fallback;
  return Math.min(Math.max(fontSize, 8), 72);
}

function resolvePdfEditedTextStyles(styles?: Partial<PdfEditedTextStyles>): PdfEditedTextStyles {
  return {
    time: {
      fontKey: styles?.time?.fontKey ?? DEFAULT_PDF_EDITED_TEXT_STYLES.time.fontKey,
      fontSize: sanitizeFontSize(styles?.time?.fontSize ?? DEFAULT_PDF_EDITED_TEXT_STYLES.time.fontSize, DEFAULT_PDF_EDITED_TEXT_STYLES.time.fontSize),
      color: sanitizeColor(styles?.time?.color ?? DEFAULT_PDF_EDITED_TEXT_STYLES.time.color, DEFAULT_PDF_EDITED_TEXT_STYLES.time.color),
      offsetX: styles?.time?.offsetX ?? DEFAULT_PDF_EDITED_TEXT_STYLES.time.offsetX,
      offsetY: styles?.time?.offsetY ?? DEFAULT_PDF_EDITED_TEXT_STYLES.time.offsetY,
      backgroundColor: styles?.time?.backgroundColor ?? DEFAULT_PDF_EDITED_TEXT_STYLES.time.backgroundColor,
      backgroundOpacity: styles?.time?.backgroundOpacity ?? DEFAULT_PDF_EDITED_TEXT_STYLES.time.backgroundOpacity,
      borderRadius: styles?.time?.borderRadius ?? DEFAULT_PDF_EDITED_TEXT_STYLES.time.borderRadius,
      paddingX: styles?.time?.paddingX ?? DEFAULT_PDF_EDITED_TEXT_STYLES.time.paddingX,
      paddingY: styles?.time?.paddingY ?? DEFAULT_PDF_EDITED_TEXT_STYLES.time.paddingY,
    },
    class: {
      fontKey: styles?.class?.fontKey ?? DEFAULT_PDF_EDITED_TEXT_STYLES.class.fontKey,
      fontSize: sanitizeFontSize(styles?.class?.fontSize ?? DEFAULT_PDF_EDITED_TEXT_STYLES.class.fontSize, DEFAULT_PDF_EDITED_TEXT_STYLES.class.fontSize),
      color: sanitizeColor(styles?.class?.color ?? DEFAULT_PDF_EDITED_TEXT_STYLES.class.color, DEFAULT_PDF_EDITED_TEXT_STYLES.class.color),
      offsetX: styles?.class?.offsetX ?? DEFAULT_PDF_EDITED_TEXT_STYLES.class.offsetX,
      offsetY: styles?.class?.offsetY ?? DEFAULT_PDF_EDITED_TEXT_STYLES.class.offsetY,
      backgroundColor: styles?.class?.backgroundColor ?? DEFAULT_PDF_EDITED_TEXT_STYLES.class.backgroundColor,
      backgroundOpacity: styles?.class?.backgroundOpacity ?? DEFAULT_PDF_EDITED_TEXT_STYLES.class.backgroundOpacity,
      borderRadius: styles?.class?.borderRadius ?? DEFAULT_PDF_EDITED_TEXT_STYLES.class.borderRadius,
      paddingX: styles?.class?.paddingX ?? DEFAULT_PDF_EDITED_TEXT_STYLES.class.paddingX,
      paddingY: styles?.class?.paddingY ?? DEFAULT_PDF_EDITED_TEXT_STYLES.class.paddingY,
    },
    trainer: {
      fontKey: styles?.trainer?.fontKey ?? DEFAULT_PDF_EDITED_TEXT_STYLES.trainer.fontKey,
      fontSize: sanitizeFontSize(styles?.trainer?.fontSize ?? DEFAULT_PDF_EDITED_TEXT_STYLES.trainer.fontSize, DEFAULT_PDF_EDITED_TEXT_STYLES.trainer.fontSize),
      color: sanitizeColor(styles?.trainer?.color ?? DEFAULT_PDF_EDITED_TEXT_STYLES.trainer.color, DEFAULT_PDF_EDITED_TEXT_STYLES.trainer.color),
      offsetX: styles?.trainer?.offsetX ?? DEFAULT_PDF_EDITED_TEXT_STYLES.trainer.offsetX,
      offsetY: styles?.trainer?.offsetY ?? DEFAULT_PDF_EDITED_TEXT_STYLES.trainer.offsetY,
      backgroundColor: styles?.trainer?.backgroundColor ?? DEFAULT_PDF_EDITED_TEXT_STYLES.trainer.backgroundColor,
      backgroundOpacity: styles?.trainer?.backgroundOpacity ?? DEFAULT_PDF_EDITED_TEXT_STYLES.trainer.backgroundOpacity,
      borderRadius: styles?.trainer?.borderRadius ?? DEFAULT_PDF_EDITED_TEXT_STYLES.trainer.borderRadius,
      paddingX: styles?.trainer?.paddingX ?? DEFAULT_PDF_EDITED_TEXT_STYLES.trainer.paddingX,
      paddingY: styles?.trainer?.paddingY ?? DEFAULT_PDF_EDITED_TEXT_STYLES.trainer.paddingY,
    },
    theme: {
      fontKey: styles?.theme?.fontKey ?? DEFAULT_PDF_EDITED_TEXT_STYLES.theme.fontKey,
      fontSize: sanitizeFontSize(styles?.theme?.fontSize ?? DEFAULT_PDF_EDITED_TEXT_STYLES.theme.fontSize, DEFAULT_PDF_EDITED_TEXT_STYLES.theme.fontSize),
      color: sanitizeColor(styles?.theme?.color ?? DEFAULT_PDF_EDITED_TEXT_STYLES.theme.color, DEFAULT_PDF_EDITED_TEXT_STYLES.theme.color),
      offsetX: styles?.theme?.offsetX ?? DEFAULT_PDF_EDITED_TEXT_STYLES.theme.offsetX,
      offsetY: styles?.theme?.offsetY ?? DEFAULT_PDF_EDITED_TEXT_STYLES.theme.offsetY,
      backgroundColor: styles?.theme?.backgroundColor ?? DEFAULT_PDF_EDITED_TEXT_STYLES.theme.backgroundColor,
      backgroundOpacity: styles?.theme?.backgroundOpacity ?? DEFAULT_PDF_EDITED_TEXT_STYLES.theme.backgroundOpacity,
      borderRadius: styles?.theme?.borderRadius ?? DEFAULT_PDF_EDITED_TEXT_STYLES.theme.borderRadius,
      paddingX: styles?.theme?.paddingX ?? DEFAULT_PDF_EDITED_TEXT_STYLES.theme.paddingX,
      paddingY: styles?.theme?.paddingY ?? DEFAULT_PDF_EDITED_TEXT_STYLES.theme.paddingY,
    },
  };
}

type CanvasTextStyle = {
  fontFamily: string;
  fontWeight: number;
  fontSize: number;
  color: string;
  scaleX?: number;
  baselineFromBottomRatio?: number;
  offsetX?: number;
  offsetY?: number;
  backgroundColor?: string;
  backgroundOpacity?: number;
  borderRadius?: number;
  paddingX?: number;
  paddingY?: number;
};

type CanvasRectMetrics = {
  left: number;
  top: number;
  width: number;
  height: number;
  textLeft: number;
  textTop: number;
  textWidth: number;
  textHeight: number;
};

async function ensureOverlayFontsLoaded() {
  if (!document.fonts) return;

  await Promise.all(PDF_EDITED_TEXT_FONT_OPTIONS.map(option => document.fonts.load(`16px ${option.fontFamily}`)));
}

function hexToRgb(color: string): { r: number; g: number; b: number } {
  const sanitized = sanitizeColor(color, '#FFFFFF').slice(1);
  return {
    r: Number.parseInt(sanitized.slice(0, 2), 16),
    g: Number.parseInt(sanitized.slice(2, 4), 16),
    b: Number.parseInt(sanitized.slice(4, 6), 16),
  };
}

function getCanvasRectMetrics(
  canvas: HTMLCanvasElement,
  rect: PdfTemplateRect,
  scale: number,
  style?: Pick<CanvasTextStyle, 'offsetX' | 'offsetY' | 'paddingX' | 'paddingY'>
): CanvasRectMetrics {
  const offsetX = (style?.offsetX ?? 0) * scale;
  const offsetY = (style?.offsetY ?? 0) * scale;
  const paddingX = Math.max(style?.paddingX ?? 0, 0) * scale;
  const paddingY = Math.max(style?.paddingY ?? 0, 0) * scale;
  const width = Math.max(rect.width * scale + paddingX * 2, 1);
  const height = Math.max(rect.height * scale + paddingY * 2, 1);
  const left = rect.x * scale + offsetX - paddingX;
  const top = canvas.height - (rect.y + rect.height) * scale + offsetY - paddingY;

  return {
    left,
    top,
    width,
    height,
    textLeft: left + paddingX,
    textTop: top + paddingY,
    textWidth: Math.max(width - paddingX * 2, 1),
    textHeight: Math.max(height - paddingY * 2, 1),
  };
}

function drawRoundedRect(
  context: CanvasRenderingContext2D,
  left: number,
  top: number,
  width: number,
  height: number,
  radius: number
) {
  const safeRadius = Math.max(0, Math.min(radius, width / 2, height / 2));
  context.beginPath();
  context.moveTo(left + safeRadius, top);
  context.lineTo(left + width - safeRadius, top);
  context.quadraticCurveTo(left + width, top, left + width, top + safeRadius);
  context.lineTo(left + width, top + height - safeRadius);
  context.quadraticCurveTo(left + width, top + height, left + width - safeRadius, top + height);
  context.lineTo(left + safeRadius, top + height);
  context.quadraticCurveTo(left, top + height, left, top + height - safeRadius);
  context.lineTo(left, top + safeRadius);
  context.quadraticCurveTo(left, top, left + safeRadius, top);
  context.closePath();
}

function clearCanvasRect(
  canvas: HTMLCanvasElement,
  rect: PdfTemplateRect | null,
  scale: number,
  fillColor: { r: number; g: number; b: number },
  style?: Pick<CanvasTextStyle, 'offsetX' | 'offsetY' | 'paddingX' | 'paddingY'>
) {
  if (!rect) return;

  const context = canvas.getContext('2d');
  if (!context) return;

  const metrics = getCanvasRectMetrics(canvas, rect, scale, style);
  const left = Math.max(metrics.left - 4, 0);
  const top = Math.max(metrics.top - 4, 0);
  const width = Math.min(metrics.width + 8, canvas.width - left);
  const height = Math.min(metrics.height + 8, canvas.height - top);

  context.save();
  context.fillStyle = `rgb(${Math.round(fillColor.r * 255)}, ${Math.round(fillColor.g * 255)}, ${Math.round(fillColor.b * 255)})`;
  context.fillRect(left, top, width, height);
  context.restore();
}

function fitCanvasFontSize(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  preferredSize: number,
  fontFamily: string,
  fontWeight: number,
  maxHeight: number
): number {
  const sanitized = text.trim() || ' ';
  let fontSize = Math.max(Math.min(preferredSize, maxHeight), 8);

  while (fontSize > 8) {
    context.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
    if (context.measureText(sanitized).width <= maxWidth) {
      return fontSize;
    }
    fontSize -= 0.25;
  }

  return 8;
}

function ellipsizeCanvasText(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string {
  const sanitized = text.trim();
  if (!sanitized) return '';
  if (context.measureText(sanitized).width <= maxWidth) return sanitized;

  const ellipsis = '…';
  let candidate = sanitized;
  while (candidate.length > 1 && context.measureText(`${candidate}${ellipsis}`).width > maxWidth) {
    candidate = candidate.slice(0, -1).trimEnd();
  }

  return candidate ? `${candidate}${ellipsis}` : sanitized;
}

function drawCanvasTextInRect(
  canvas: HTMLCanvasElement,
  text: string,
  rect: PdfTemplateRect | null,
  scale: number,
  style: CanvasTextStyle
) {
  if (!rect) return;

  const sanitized = text.trim();
  if (!sanitized) return;

  const context = canvas.getContext('2d');
  if (!context) return;

  const scaleX = style.scaleX ?? 1;
  const metrics = getCanvasRectMetrics(canvas, rect, scale, style);
  const width = Math.max(metrics.textWidth - 4, 1);
  const height = Math.max(metrics.textHeight, 1);
  const fontSize = fitCanvasFontSize(
    context,
    sanitized,
    width / scaleX,
    style.fontSize * scale,
    style.fontFamily,
    style.fontWeight,
    height * 0.82
  );

  const backgroundOpacity = clamp(style.backgroundOpacity ?? 0, 0, 1);
  if (backgroundOpacity > 0) {
    const backgroundColor = hexToRgb(style.backgroundColor ?? '#FFFFFF');
    context.save();
    context.globalAlpha = backgroundOpacity;
    context.fillStyle = `rgb(${backgroundColor.r}, ${backgroundColor.g}, ${backgroundColor.b})`;
    drawRoundedRect(
      context,
      metrics.left,
      metrics.top,
      metrics.width,
      metrics.height,
      Math.max(style.borderRadius ?? 0, 0) * scale
    );
    context.fill();
    context.restore();
  }

  context.save();
  context.font = `${style.fontWeight} ${fontSize}px ${style.fontFamily}`;
  context.fillStyle = style.color;
  context.textBaseline = 'alphabetic';
  context.textAlign = 'left';
  const fittedText = ellipsizeCanvasText(context, sanitized, width / scaleX);
  const baselineOffset = Math.max(height * (style.baselineFromBottomRatio ?? 0.2), 2);
  context.translate(metrics.textLeft + 2, 0);
  context.scale(scaleX, 1);
  context.fillText(fittedText, 0, metrics.textTop + height - baselineOffset);
  context.restore();
}

async function buildTemplatePreservingPdfBlob(
  schedule: WeekSchedule,
  sourcePdfUrl: string,
  templateLayout: PdfTemplateLayout,
  baselineSchedule?: WeekSchedule | null,
  editedTextStyles?: Partial<PdfEditedTextStyles>
): Promise<Blob> {
  const response = await fetch(sourcePdfUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch original PDF (${response.status})`);
  }

  const sourceBytes = await response.arrayBuffer();
  const renderedPages = await renderPdfPagesForOverlay(sourceBytes);
  await ensureOverlayFontsLoaded();
  const resolvedEditedTextStyles = resolvePdfEditedTextStyles(editedTextStyles);
  const timeFontOption = getPdfEditedTextFontOption(resolvedEditedTextStyles.time.fontKey);
  const classFontOption = getPdfEditedTextFontOption(resolvedEditedTextStyles.class.fontKey);

  const classesByDay = new Map(schedule.days.map(day => [day.day, day.classes]));
  const baselineClassesByDay = new Map((baselineSchedule?.days || []).map(day => [day.day, day.classes]));
  const orderedDays = Array.from(new Set([
    ...Object.keys(templateLayout.rowsByDay),
    ...schedule.days.map(day => day.day),
  ])).sort((left, right) => {
    const order = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    return order.indexOf(left) - order.indexOf(right);
  });

  for (const day of orderedDays) {
    const templateRows = templateLayout.rowsByDay[day] ?? [];
    const dayClasses = classesByDay.get(day) ?? [];
    const baselineClasses = baselineClassesByDay.get(day) ?? [];
    const slotCount = Math.max(templateRows.length, dayClasses.length, baselineClasses.length);

    for (let index = 0; index < slotCount; index++) {
      const slot = templateRows[index] ?? createSyntheticTemplateRowSlot(templateRows, index);
      if (!slot) continue;

      const renderedPage = renderedPages[slot.pageIndex];
      if (!renderedPage) continue;

      const currentClass = dayClasses[index];
      const baselineClass = baselineClasses[index];
      const currentCombinedLine = buildCombinedClassLine(currentClass?.className, currentClass?.trainer);
      const baselineCombinedLine = buildCombinedClassLine(baselineClass?.className, baselineClass?.trainer);
      const shouldOverwriteTime = shouldOverwriteField(currentClass?.time, baselineClass?.time);
      const shouldOverwriteCombinedLine = shouldOverwriteField(currentCombinedLine, baselineCombinedLine);

      if (slot.timeRect && shouldOverwriteTime) {
        clearCanvasRect(
          renderedPage.canvas,
          slot.timeRect,
          renderedPage.scale,
          sampleBackgroundColor(renderedPage.canvas, slot.timeRect, renderedPage.scale),
          resolvedEditedTextStyles.time
        );
        if (currentClass?.time) {
          drawCanvasTextInRect(renderedPage.canvas, currentClass.time, slot.timeRect, renderedPage.scale, {
            fontFamily: timeFontOption.fontFamily,
            fontWeight: timeFontOption.fontWeight,
            fontSize: resolvedEditedTextStyles.time.fontSize,
            color: resolvedEditedTextStyles.time.color,
            scaleX: 1,
            baselineFromBottomRatio: 0.14,
            offsetX: resolvedEditedTextStyles.time.offsetX,
            offsetY: resolvedEditedTextStyles.time.offsetY,
            backgroundColor: resolvedEditedTextStyles.time.backgroundColor,
            backgroundOpacity: resolvedEditedTextStyles.time.backgroundOpacity,
            borderRadius: resolvedEditedTextStyles.time.borderRadius,
            paddingX: resolvedEditedTextStyles.time.paddingX,
            paddingY: resolvedEditedTextStyles.time.paddingY,
          });
        }
      }

      const combinedRect = mergeTemplateRects(slot.classRect, slot.trainerRect);
      if (combinedRect && shouldOverwriteCombinedLine) {
        clearCanvasRect(
          renderedPage.canvas,
          combinedRect,
          renderedPage.scale,
          sampleBackgroundColor(renderedPage.canvas, combinedRect, renderedPage.scale),
          resolvedEditedTextStyles.class
        );
        if (currentCombinedLine) {
          drawCanvasTextInRect(renderedPage.canvas, currentCombinedLine, combinedRect, renderedPage.scale, {
            fontFamily: classFontOption.fontFamily,
            fontWeight: classFontOption.fontWeight,
            fontSize: resolvedEditedTextStyles.class.fontSize,
            color: resolvedEditedTextStyles.class.color,
            scaleX: 1.006,
            baselineFromBottomRatio: 0.18,
            offsetX: resolvedEditedTextStyles.class.offsetX,
            offsetY: resolvedEditedTextStyles.class.offsetY,
            backgroundColor: resolvedEditedTextStyles.class.backgroundColor,
            backgroundOpacity: resolvedEditedTextStyles.class.backgroundOpacity,
            borderRadius: resolvedEditedTextStyles.class.borderRadius,
            paddingX: resolvedEditedTextStyles.class.paddingX,
            paddingY: resolvedEditedTextStyles.class.paddingY,
          });
        }
      }
    }
  }

  const pdfDoc = await PDFDocument.create();

  for (const renderedPage of renderedPages) {
    const page = pdfDoc.addPage([renderedPage.width, renderedPage.height]);
    const embeddedImage = await pdfDoc.embedPng(await canvasToPngBytes(renderedPage.canvas));
    page.drawImage(embeddedImage, {
      x: 0,
      y: 0,
      width: renderedPage.width,
      height: renderedPage.height,
    });
  }

  return new Blob([Uint8Array.from(await pdfDoc.save())], { type: 'application/pdf' });
}

export async function buildSchedulePdfBlob(
  schedule: WeekSchedule,
  sourceName: string,
  options?: {
    sourcePdfUrl?: string;
    templateLayout?: PdfTemplateLayout | null;
    useTemplateLayout?: boolean;
    baselineSchedule?: WeekSchedule | null;
    editedTextStyles?: Partial<PdfEditedTextStyles>;
  }
): Promise<Blob> {
  if ((options?.useTemplateLayout ?? true) && options?.sourcePdfUrl && options.templateLayout) {
    try {
      return await buildTemplatePreservingPdfBlob(
        schedule,
        options.sourcePdfUrl,
        options.templateLayout,
        options.baselineSchedule,
        options.editedTextStyles
      );
    } catch (error) {
      console.warn('Falling back to tabular PDF export because the original layout could not be updated.', error);
    }
  }

  return buildTabularSchedulePdfBlob(schedule, sourceName);
}

export function exportScheduleAsCsv(schedule: WeekSchedule, sourceName: string) {
  const rows = flattenSchedule(schedule);
  const header = ['Day', 'Time', 'Class Name', 'Trainer', 'Location'];
  const csv = [
    header.join(','),
    ...rows.map(row => [row.day, row.time, row.className, row.trainer, row.location].map(escapeCsv).join(',')),
  ].join('\n');

  downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `${sanitizeFileName(sourceName) || 'schedule'}-edited.csv`);
}

export async function exportScheduleAsPdf(
  schedule: WeekSchedule,
  sourceName: string,
  options?: {
    sourcePdfUrl?: string;
    templateLayout?: PdfTemplateLayout | null;
    useTemplateLayout?: boolean;
    baselineSchedule?: WeekSchedule | null;
    editedTextStyles?: Partial<PdfEditedTextStyles>;
  }
) {
  const safeName = sanitizeFileName(sourceName) || 'schedule';
  downloadBlob(await buildSchedulePdfBlob(schedule, sourceName, options), `${safeName}-edited.pdf`);
}
