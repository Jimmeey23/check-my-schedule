import React, { useEffect, useMemo, useState, type CSSProperties } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import type { DaySchedule, ScheduleClass, WeekSchedule } from '@/types/schedule';
import { format } from 'date-fns';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

interface EditableHtmlScheduleProps {
  schedule: WeekSchedule | null;
  onScheduleUpdate?: (updatedSchedule: WeekSchedule) => void;
  sourcePdfUrl?: string | null;
  studioLocation?: string | null;
}

type DayName =
  | 'MONDAY'
  | 'TUESDAY'
  | 'WEDNESDAY'
  | 'THURSDAY'
  | 'FRIDAY'
  | 'SATURDAY'
  | 'SUNDAY';

interface DayLayout {
  day: DayName;
  headerLeft: number;
  headerBottom: number;
  headerLetterSpacing: string;
  timeLeft: number;
  classLeft: number;
  rowBottoms: number[];
}

interface PageLayout {
  key: string;
  locationLabel: { left: number; bottom: number };
  studio: { left: number; bottom: number };
  schedule: { left: number; bottom: number };
  date: { left: number; bottom: number };
  legends: Array<{ left: number; bottom: number; text: string }>;
  days: DayLayout[];
}

interface StudioTemplateConfig {
  key: 'bandra' | 'kemps';
  displayName: string;
  previewBackground: string;
  pageBackground: string;
  pageBorder: string;
  locationTextColor: string;
  dateTextColor: string;
  legendTextColor: string;
  maskColor: string;
  hoverColor: string;
  focusColor: string;
  focusRingColor: string;
}

const PAGE_WIDTH = 909;
const PAGE_HEIGHT = 1286;
const EDITABLE_ROW_MASK_HEIGHT = 22;
const DATE_MASK_WIDTH = 430;
const DATE_MASK_HEIGHT = 72;

const PAGE_LAYOUTS: PageLayout[] = [
  {
    key: 'page-1',
    locationLabel: { left: 682, bottom: 1162 },
    studio: { left: 71, bottom: 1092 },
    schedule: { left: 71, bottom: 1032 },
    date: { left: 76, bottom: 970 },
    legends: [
      { left: 71, bottom: 947, text: 'BEGINNER : FOUNDATIONS, BARRE 57, SWEAT IN 30' },
      {
        left: 71,
        bottom: 921,
        text: 'INTERMEDIATE : CARDIO BARRE, MAT 57, CARDIO BARRE PLUS, FIT, BACK BODY BLAZE',
      },
    ],
    days: [
      { day: 'MONDAY', headerLeft: 73, headerBottom: 824, headerLetterSpacing: '-0.48px', timeLeft: 73, classLeft: 159, rowBottoms: [787, 762, 737, 712, 687, 662, 637, 612, 587] },
      { day: 'TUESDAY', headerLeft: 478, headerBottom: 824, headerLetterSpacing: '-0.38px', timeLeft: 478, classLeft: 564, rowBottoms: [787, 762, 737, 712, 687, 662, 637, 612, 587, 562] },
      { day: 'WEDNESDAY', headerLeft: 73, headerBottom: 421, headerLetterSpacing: '-0.13px', timeLeft: 73, classLeft: 159, rowBottoms: [381, 356, 331, 306, 281, 256, 231, 206, 181] },
      { day: 'THURSDAY', headerLeft: 478, headerBottom: 421, headerLetterSpacing: '-0.3px', timeLeft: 478, classLeft: 564, rowBottoms: [381, 356, 331, 306, 281, 256, 231, 206, 181] },
    ],
  },
  {
    key: 'page-2',
    locationLabel: { left: 682, bottom: 1185 },
    studio: { left: 71, bottom: 1092 },
    schedule: { left: 71, bottom: 1032 },
    date: { left: 76, bottom: 970 },
    legends: [
      { left: 71, bottom: 938, text: 'BEGINNER : FOUNDATIONS, BARRE 57, SWEAT IN 30' },
      { left: 71, bottom: 908, text: 'INTERMEDIATE : CARDIO BARRE, MAT 57, FIT, BACK BODY BLAZE' },
    ],
    days: [
      { day: 'FRIDAY', headerLeft: 76, headerBottom: 772, headerLetterSpacing: '-0.64px', timeLeft: 76, classLeft: 162, rowBottoms: [736, 711, 686, 661, 636, 611, 586, 561] },
      { day: 'SATURDAY', headerLeft: 481, headerBottom: 772, headerLetterSpacing: '-0.83px', timeLeft: 481, classLeft: 567, rowBottoms: [735, 710, 685, 660, 635, 610, 585, 560] },
      { day: 'SUNDAY', headerLeft: 76, headerBottom: 369, headerLetterSpacing: '-0.6px', timeLeft: 76, classLeft: 162, rowBottoms: [329, 304, 279, 254, 229, 204] },
    ],
  },
];

const DAY_ORDER: DayName[] = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];

const STUDIO_TEMPLATES: Record<'bandra' | 'kemps', StudioTemplateConfig> = {
  bandra: {
    key: 'bandra',
    displayName: 'BANDRA',
    previewBackground: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 52%, #f8fafc 100%)',
    pageBackground: 'linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)',
    pageBorder: 'rgba(96, 165, 250, 0.22)',
    locationTextColor: '#0f172a',
    dateTextColor: '#6CCBF2',
    legendTextColor: '#334155',
    maskColor: 'rgba(241, 248, 255, 0.94)',
    hoverColor: 'rgba(125, 211, 252, 0.18)',
    focusColor: 'rgba(125, 211, 252, 0.28)',
    focusRingColor: 'rgba(14, 165, 233, 0.22)',
  },
  kemps: {
    key: 'kemps',
    displayName: 'KEMPS',
    previewBackground: 'linear-gradient(135deg, #f2f7ea 0%, #e4efe0 52%, #f8faf5 100%)',
    pageBackground: 'linear-gradient(180deg, #f4f6e3 0%, #fbfcf6 100%)',
    pageBorder: 'rgba(16, 185, 129, 0.18)',
    locationTextColor: '#2c2d2d',
    dateTextColor: '#000000',
    legendTextColor: '#2c2d2d',
    maskColor: 'rgba(244, 241, 227, 0.96)',
    hoverColor: 'rgba(74, 222, 128, 0.15)',
    focusColor: 'rgba(74, 222, 128, 0.22)',
    focusRingColor: 'rgba(22, 163, 74, 0.18)',
  },
};

const normalizeDayName = (value: string): DayName | null => {
  const normalized = value.trim().toUpperCase();
  return DAY_ORDER.includes(normalized as DayName) ? (normalized as DayName) : null;
};

const resolveStudioTemplateKey = (value?: string | null): 'bandra' | 'kemps' => {
  const normalized = value?.trim().toLowerCase() ?? '';
  if (normalized.includes('bandra')) return 'bandra';
  if (normalized.includes('kemps') || normalized.includes('kwality')) return 'kemps';
  return 'bandra';
};

const createEmptyClass = (): ScheduleClass => ({
  id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `slot-${Date.now()}-${Math.random()}`,
  time: '',
  className: '',
  trainer: '',
  theme: '',
});

const isBlankClass = (scheduleClass?: ScheduleClass | null) => {
  if (!scheduleClass) return true;
  return !scheduleClass.time.trim() && !scheduleClass.className.trim() && !scheduleClass.trainer.trim() && !(scheduleClass.theme?.trim());
};

const getTrainerFirstName = (trainer?: string | null) => {
  const trimmed = trainer?.trim() ?? '';
  if (!trimmed) return '';
  return trimmed.split(/\s+/)[0] ?? trimmed;
};

const isValidDate = (value?: string) => {
  if (!value) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime());
};

const getDateRangeLabel = (schedule: WeekSchedule) => {
  if (isValidDate(schedule.weekStart) && isValidDate(schedule.weekEnd)) {
    return `${format(new Date(schedule.weekStart), 'MMMM do')} - ${format(new Date(schedule.weekEnd), 'MMMM do')}`;
  }
  if (schedule.weekStart && schedule.weekEnd) {
    return `${schedule.weekStart} - ${schedule.weekEnd}`;
  }
  return 'Schedule';
};

const cloneSchedule = (schedule: WeekSchedule): WeekSchedule => ({
  ...schedule,
  levels: {
    beginner: [...schedule.levels.beginner],
    intermediate: [...schedule.levels.intermediate],
    advanced: [...schedule.levels.advanced],
  },
  days: schedule.days.map((day) => ({
    ...day,
    classes: day.classes.map((scheduleClass) => ({ ...scheduleClass })),
  })),
});

export const EditableHtmlSchedule: React.FC<EditableHtmlScheduleProps> = ({ schedule, onScheduleUpdate, sourcePdfUrl, studioLocation }) => {
  const [editableSchedule, setEditableSchedule] = useState<WeekSchedule | null>(schedule);
  const [pageBackgrounds, setPageBackgrounds] = useState<string[]>([]);

  useEffect(() => {
    setEditableSchedule(schedule);
  }, [schedule]);

  useEffect(() => {
    let cancelled = false;
    const renderPdfBackgrounds = async () => {
      if (!sourcePdfUrl) {
        setPageBackgrounds([]);
        return;
      }
      try {
        const response = await fetch(sourcePdfUrl);
        if (!response.ok) {
          throw new Error(`Failed to load PDF (${response.status})`);
        }
        const bytes = new Uint8Array(await response.arrayBuffer());
        const task = pdfjsLib.getDocument({ data: bytes });
        const pdf = await task.promise;
        const nextBackgrounds: string[] = [];
        for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex++) {
          const page = await pdf.getPage(pageIndex);
          const viewport = page.getViewport({ scale: 2 });
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          if (!context) {
            nextBackgrounds.push('');
            continue;
          }
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          await page.render({ canvasContext: context, viewport }).promise;
          nextBackgrounds.push(canvas.toDataURL('image/png'));
        }
        await pdf.destroy();
        if (!cancelled) {
          setPageBackgrounds(nextBackgrounds);
        }
      } catch (error) {
        console.warn('Could not render PDF backgrounds for HTML editor.', error);
        if (!cancelled) {
          setPageBackgrounds([]);
        }
      }
    };
    void renderPdfBackgrounds();
    return () => {
      cancelled = true;
    };
  }, [sourcePdfUrl]);

  const dayLookup = useMemo(() => {
    if (!editableSchedule) return new Map<DayName, DaySchedule>();
    return editableSchedule.days.reduce((map, day) => {
      const normalized = normalizeDayName(day.day);
      if (normalized) {
        map.set(normalized, day);
      }
      return map;
    }, new Map<DayName, DaySchedule>());
  }, [editableSchedule]);

  const studioTemplate = useMemo(
    () => STUDIO_TEMPLATES[resolveStudioTemplateKey(studioLocation ?? editableSchedule?.location)],
    [editableSchedule?.location, studioLocation]
  );

  const updateSlot = (dayName: DayName, slotIndex: number, updater: (current: ScheduleClass) => ScheduleClass) => {
    if (!editableSchedule) return;
    const updatedSchedule = cloneSchedule(editableSchedule);
    const existingDayIndex = updatedSchedule.days.findIndex((day) => normalizeDayName(day.day) === dayName);
    if (existingDayIndex === -1) {
      updatedSchedule.days.push({ day: dayName, classes: [] });
    }
    const dayIndex = updatedSchedule.days.findIndex((day) => normalizeDayName(day.day) === dayName);
    const day = updatedSchedule.days[dayIndex];
    while (day.classes.length <= slotIndex) {
      day.classes.push(createEmptyClass());
    }
    day.classes[slotIndex] = updater({ ...day.classes[slotIndex] });
    while (day.classes.length > 0 && isBlankClass(day.classes[day.classes.length - 1])) {
      day.classes.pop();
    }
    setEditableSchedule(updatedSchedule);
    onScheduleUpdate?.(updatedSchedule);
  };

  if (!editableSchedule) {
    return <div className="flex h-full items-center justify-center"><p className="text-muted-foreground">No schedule data available</p></div>;
  }

  const dateRange = getDateRangeLabel(editableSchedule);
  const cssVars = {
    '--template-preview-bg': studioTemplate.previewBackground,
    '--template-page-bg': studioTemplate.pageBackground,
    '--template-page-border': studioTemplate.pageBorder,
    '--template-location-color': studioTemplate.locationTextColor,
    '--template-date-color': studioTemplate.dateTextColor,
    '--template-legend-color': studioTemplate.legendTextColor,
    '--template-mask-color': studioTemplate.maskColor,
    '--template-hover-color': studioTemplate.hoverColor,
    '--template-focus-color': studioTemplate.focusColor,
    '--template-focus-ring': studioTemplate.focusRingColor,
  } as CSSProperties;

  return (
    <div className="studio-template-preview" style={cssVars}>
      <style>{`
        .studio-template-preview { min-height: 100%; background: var(--template-preview-bg); padding: 24px; width: max-content; min-width: 100%; overflow-x: auto; overflow-y: auto; }
        .studio-template-meta { display: inline-flex; align-items: center; gap: 10px; margin-bottom: 18px; border-radius: 999px; border: 1px solid var(--template-page-border); background: rgba(255, 255, 255, 0.82); padding: 8px 14px; box-shadow: 0 8px 22px rgba(15, 23, 42, 0.08); font: 600 12px/1.2 Montserrat, Arial, sans-serif; color: #334155; letter-spacing: 0.06em; text-transform: uppercase; }
        .studio-template-dot { width: 9px; height: 9px; border-radius: 999px; background: var(--template-location-color); opacity: 0.9; }
        .studio-page-shell { width: max-content; min-width: ${PAGE_WIDTH}px; display: flex; justify-content: flex-start; margin-bottom: 24px; }
        .studio-page { position: relative; width: ${PAGE_WIDTH}px; height: ${PAGE_HEIGHT}px; background: var(--template-page-bg); box-shadow: 0 10px 28px rgba(15, 23, 42, 0.12); border: 1px solid var(--template-page-border); overflow: hidden; }
        .studio-page::before { content: ''; position: absolute; inset: 0; background: radial-gradient(circle at top right, rgba(255,255,255,0.85), transparent 26%), linear-gradient(180deg, rgba(255,255,255,0.22), transparent 20%); pointer-events: none; z-index: 0; }
        .text-container { white-space: pre; position: absolute; inset: 0; width: 100%; height: 100%; z-index: 1; }
        .t { position: absolute; transform-origin: bottom left; white-space: pre; line-height: 1.5; color: #2c2d2d; }
        .t.v0 { transform: scaleX(1.006); }
        .t.m0 { transform: matrix(0,-1.01,1,0,0,0); }
        .t.m1 { transform: matrix(0,1.01,-1,0,0,0); }
        .s0, .s2 { font-size: 11px; font-family: Montserrat, Arial, sans-serif; color: #2c2d2d; }
        .s3 { font-size: 32px; font-family: Agrandir, 'Arial Black', sans-serif; font-weight: 900; color: var(--template-location-color); }
        .s4 { font-size: 25px; font-family: Agrandir, 'Arial Black', sans-serif; font-weight: 900; color: #2c2d2d; }
        .s5, .s6, .s8, .sa, .sf, .sg, .sh { font-size: 13px; font-family: Montserrat, Arial, sans-serif; font-weight: 400; color: #2c2d2d; }
        .s9 { font-size: 13px; font-family: Montserrat, Arial, sans-serif; font-weight: 700; color: #000; width: 75px; display: inline-block; text-align: left; white-space: nowrap; }
        .sb { font-size: 17px; font-family: Montserrat, Arial, sans-serif; font-weight: 500; color: var(--template-legend-color); }
        .sc { font-size: 49px; font-family: Agrandir, 'Arial Black', sans-serif; font-weight: 900; color: #2c2d2d; }
        .sd { font-size: 54px; font-family: 'Cormorant Garamond', Georgia, serif; font-style: italic; font-weight: 700; color: var(--template-date-color); }
        .editable-field { cursor: text; outline: none; border-radius: 3px; transition: background-color 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease; min-width: 14px; min-height: 18px; display: inline-block; padding: 1px 3px; border: 1px solid transparent; pointer-events: auto; user-select: text; -webkit-user-select: text; vertical-align: top; overflow: hidden; text-overflow: ellipsis; }
        .editable-field:hover { background: var(--template-hover-color); border-color: var(--template-page-border); }
        .editable-field:focus { background: var(--template-focus-color); border-color: var(--template-location-color); box-shadow: 0 0 0 2px var(--template-focus-ring); }
        .editable-field:empty::before { content: attr(data-placeholder); color: rgba(44, 45, 45, 0.35); }
        .inline-row-group { position: absolute; display: inline-flex; align-items: center; gap: 6px; max-width: 360px; z-index: 2; }
        .class-inline-field { max-width: 170px; }
        .trainer-inline-field { max-width: 84px; }
        .theme-inline-field { max-width: 122px; border-radius: 999px; padding: 2px 10px; border-color: rgba(15, 23, 42, 0.08); background: rgba(255, 255, 255, 0.82); font-size: 11px; font-weight: 600; line-height: 1.35; white-space: nowrap; }
        .inline-row-separator { color: rgba(44, 45, 45, 0.65); font-weight: 500; user-select: none; }
      `}</style>

      <div className="studio-template-meta">
        <span className="studio-template-dot" />
        <span>{studioTemplate.displayName} Template</span>
        <span aria-hidden="true">•</span>
        <span>Inline Editing Ready</span>
      </div>

      {PAGE_LAYOUTS.map((page, pageIndex) => {
        const background = pageBackgrounds[pageIndex];
        const showStaticOverlayText = !background;
        return (
          <div key={page.key} className="studio-page-shell">
            <section className="studio-page" aria-label={page.key}>
              {background && <img src={background} alt="Original schedule background" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }} />}
              <div className="text-container">
                {!background && (
                  <>
                    <span className="t v0 s0" style={{ left: 25, bottom: 1265, letterSpacing: '-0.22px' }}>INTERMEDIATE • CARDIO BARRE • MAT 57 • FIT • INTERMEDIATE • CARDIO BARRE • MAT 57 • FIT • INTERMEDIATE • CARDIO BARRE • MAT 57 • FIT • INTERMEDIATE • CARDIO BARRE • MAT 57 • FIT</span>
                    <span className="t v0 s0" style={{ left: 25, bottom: -1, letterSpacing: '-0.22px' }}>INTERMEDIATE • CARDIO BARRE • MAT 57 • INTERMEDIATE • CARDIO BARRE • MAT 57 • INTERMEDIATE • CARDIO BARRE • MAT 57 • INTERMEDIATE • CARDIO BARRE</span>
                    <span className="t m0 s0" style={{ left: 19.6, bottom: 3.1, letterSpacing: '-0.22px' }}>BARRE 57 • POWERCYCLE • FOUNDATIONS • SWEAT IN 30 • BARRE 57 • POWERCYCLE • FOUNDATIONS • SWEAT IN 30 • BARRE 57 • POWERCYCLE • FOUNDATIONS • SWEAT IN 30 • BARRE 57 • POWERCYCLE • FOUNDATIONS • SWEAT IN 30</span>
                    <span className="t m1 s2" style={{ left: 890.1, bottom: 1280.5, letterSpacing: '0.03px' }}>FOUNDATION : BARRE 57 • FOUNDATION : BARRE 57 • FOUNDATION : BARRE 57 • FOUNDATION : BARRE 57 • FOUNDATION : BARRE 57 • FOUNDATION</span>
                    <span className="t m1 s2" style={{ left: 889.9, bottom: 453.5, letterSpacing: '0.03px' }}>FOUNDATION : BARRE 57 • FOUNDATION : BARRE 57 • FOUNDATION : BARRE 57</span>
                  </>
                )}

                {showStaticOverlayText && (
                  <>
                    <span className="t s3" style={{ left: page.locationLabel.left, bottom: page.locationLabel.bottom, letterSpacing: '-0.79px' }}>{studioTemplate.displayName}</span>
                    <span className="t sc" style={{ left: page.studio.left, bottom: page.studio.bottom, letterSpacing: '-0.5px' }}>STUDIO</span>
                    <span className="t sc" style={{ left: page.schedule.left, bottom: page.schedule.bottom, letterSpacing: '-0.15px' }}>SCHEDULE</span>
                  </>
                )}

                {background && <div style={{ position: 'absolute', left: page.date.left - 10, bottom: page.date.bottom - 10, width: DATE_MASK_WIDTH, height: DATE_MASK_HEIGHT, background: studioTemplate.maskColor, zIndex: 1, borderRadius: 10 }} />}
                <span className="t sd" style={{ left: page.date.left, bottom: page.date.bottom, letterSpacing: '-0.5px', wordSpacing: '0.11px' }}>{dateRange}</span>

                {showStaticOverlayText && page.legends.map((legend, index) => <span key={`${page.key}-legend-${index}`} className="t sb" style={{ left: legend.left, bottom: legend.bottom, letterSpacing: '-0.1px' }}>{legend.text}</span>)}

                {page.days.map((dayLayout) => {
                  const scheduleDay = dayLookup.get(dayLayout.day);
                  const dayClasses = scheduleDay?.classes ?? [];
                  return (
                    <React.Fragment key={`${page.key}-${dayLayout.day}`}>
                      {showStaticOverlayText && <span className="t v0 s4" style={{ left: dayLayout.headerLeft, bottom: dayLayout.headerBottom, letterSpacing: dayLayout.headerLetterSpacing }}>{dayLayout.day}</span>}
                      {dayLayout.rowBottoms.map((rowBottom, slotIndex) => {
                        const slotClass = dayClasses[slotIndex];
                        const timeValue = slotClass?.time ?? '';
                        const classNameValue = slotClass?.className ?? '';
                        const trainerValue = slotClass?.trainer ?? '';
                        const trainerPreviewValue = getTrainerFirstName(trainerValue);
                        const themeValue = slotClass?.theme?.trim() ?? '';
                        const showTrainerSeparator = Boolean(classNameValue.trim() && trainerPreviewValue.trim());
                        const rowMaskWidth = Math.min(PAGE_WIDTH - dayLayout.timeLeft - 18, 390);
                        return (
                          <React.Fragment key={`${dayLayout.day}-${slotIndex}`}>
                            {background && <div style={{ position: 'absolute', left: dayLayout.timeLeft - 6, bottom: rowBottom - 3, width: rowMaskWidth, height: EDITABLE_ROW_MASK_HEIGHT, background: studioTemplate.maskColor, borderRadius: 4, zIndex: 1 }} />}
                            <span className="t s9 editable-field" style={{ left: dayLayout.timeLeft, bottom: rowBottom, color: '#1a1a1a', zIndex: 2 }} contentEditable suppressContentEditableWarning spellCheck={false} data-testid={`template-${dayLayout.day}-${slotIndex}-time`} data-placeholder="time" onBlur={(event) => updateSlot(dayLayout.day, slotIndex, (current) => ({ ...current, time: event.currentTarget.textContent?.trim() ?? '' }))}>{timeValue}</span>
                            <div className="t v0 s5 inline-row-group" style={{ left: dayLayout.classLeft, bottom: rowBottom, fontFamily: 'Montserrat, sans-serif', fontWeight: 400, color: '#1a1a1a', maxWidth: `${Math.min(PAGE_WIDTH - dayLayout.classLeft - 24, 360)}px` }}>
                              <span className="editable-field class-inline-field" contentEditable suppressContentEditableWarning spellCheck={false} data-testid={`template-${dayLayout.day}-${slotIndex}-class`} data-placeholder="class" onBlur={(event) => updateSlot(dayLayout.day, slotIndex, (current) => ({ ...current, className: event.currentTarget.textContent?.trim() ?? '' }))}>{classNameValue}</span>
                              {showTrainerSeparator && <span className="inline-row-separator" aria-hidden="true">-</span>}
                              <span className="editable-field trainer-inline-field" contentEditable suppressContentEditableWarning spellCheck={false} title={trainerValue || 'Trainer'} data-testid={`template-${dayLayout.day}-${slotIndex}-trainer`} data-placeholder="trainer" onFocus={(event) => {
                                if (trainerValue.trim() && event.currentTarget.textContent?.trim() === trainerPreviewValue) {
                                  event.currentTarget.textContent = trainerValue;
                                }
                              }} onBlur={(event) => updateSlot(dayLayout.day, slotIndex, (current) => ({ ...current, trainer: event.currentTarget.textContent?.trim() ?? '' }))}>{trainerPreviewValue}</span>
                              <span className="editable-field theme-inline-field" contentEditable suppressContentEditableWarning spellCheck={false} data-testid={`template-${dayLayout.day}-${slotIndex}-theme`} data-placeholder="theme" onBlur={(event) => updateSlot(dayLayout.day, slotIndex, (current) => ({ ...current, theme: event.currentTarget.textContent?.trim() ?? '' }))}>{themeValue}</span>
                            </div>
                          </React.Fragment>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
              </div>
            </section>
          </div>
        );
      })}
    </div>
  );
};
