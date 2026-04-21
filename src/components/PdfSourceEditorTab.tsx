import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { EditableHtmlSchedule } from '@/components/EditableHtmlSchedule';
import {
  DEFAULT_PDF_EDITED_TEXT_STYLES,
  exportScheduleAsCsv,
  exportScheduleAsPdf,
  PDF_EDITED_TEXT_FONT_OPTIONS,
  type PdfEditedTextStyles,
  type PdfEditedTextTarget,
} from '@/lib/scheduleExport';
import { buildCombinedClassLine, buildInlineOverlayTargets } from '@/lib/pdfInlineEditor';
import { extractPdfTemplateLayoutFromUrl, type PdfTemplateLayout } from '@/lib/pdfParser';
import { cn } from '@/lib/utils';
import type {
  ScheduleClass,
  UploadedFile,
  WeekSchedule,
} from '@/types/schedule';
import {
  CalendarDays,
  Download,
  FileText,
  PencilLine,
  Plus,
  Save,
  Trash2,
  FileCode,
} from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface PdfSourceEditorTabProps {
  pdfFiles: UploadedFile[];
  previewUrls: Record<string, string>;
  onUpdateSchedule: (fileId: string, schedule: WeekSchedule) => void;
}

function createEmptyClass(location: string): ScheduleClass {
  return {
    id: crypto.randomUUID(),
    time: '',
    className: '',
    trainer: '',
    location,
    theme: '',
  };
}

function getTrainerFirstName(trainer?: string) {
  const trimmed = trainer?.trim() ?? '';
  if (!trimmed) return '';
  return trimmed.split(/\s+/)[0] ?? trimmed;
}

function sortClassesByTime(classes: ScheduleClass[]): ScheduleClass[] {
  return [...classes].sort((a, b) => a.time.localeCompare(b.time));
}

function cloneSchedule(schedule: WeekSchedule): WeekSchedule {
  return JSON.parse(JSON.stringify(schedule)) as WeekSchedule;
}

function getEditedTextStyle(target: PdfEditedTextTarget, editedTextStyles: PdfEditedTextStyles) {
  const style = editedTextStyles[target];
  const fontOption = PDF_EDITED_TEXT_FONT_OPTIONS.find(option => option.value === style.fontKey) ?? PDF_EDITED_TEXT_FONT_OPTIONS[0];
  const opacity = Math.max(0, Math.min(style.backgroundOpacity ?? 0, 1));
  const hasBackground = opacity > 0 && /^#[0-9a-f]{6}$/i.test(style.backgroundColor ?? '');

  const backgroundColor = hasBackground
    ? `rgba(${Number.parseInt((style.backgroundColor ?? '#FFFFFF').slice(1, 3), 16)}, ${Number.parseInt((style.backgroundColor ?? '#FFFFFF').slice(3, 5), 16)}, ${Number.parseInt((style.backgroundColor ?? '#FFFFFF').slice(5, 7), 16)}, ${opacity})`
    : 'transparent';

  return {
    color: style.color,
    fontFamily: fontOption.fontFamily,
    fontSize: `${style.fontSize}px`,
    fontWeight: fontOption.fontWeight,
    backgroundColor,
    borderRadius: `${style.borderRadius ?? 0}px`,
    padding: `${style.paddingY ?? 0}px ${style.paddingX ?? 0}px`,
    transform: `translate(${style.offsetX ?? 0}px, ${style.offsetY ?? 0}px)`,
  };
}

export function PdfSourceEditorTab({ pdfFiles, previewUrls, onUpdateSchedule }: PdfSourceEditorTabProps) {
  const availablePdfFiles = useMemo(
    () => pdfFiles.filter(file => file.type === 'pdf' && file.data),
    [pdfFiles]
  );
  const [selectedFileId, setSelectedFileId] = useState<string | null>(availablePdfFiles[0]?.id ?? null);
  const [templateLayouts, setTemplateLayouts] = useState<Record<string, PdfTemplateLayout>>({});
  const [templateLayoutResolved, setTemplateLayoutResolved] = useState<Record<string, boolean>>({});
  const [templateLoadingFileId, setTemplateLoadingFileId] = useState<string | null>(null);
  const [baselineSchedules, setBaselineSchedules] = useState<Record<string, WeekSchedule>>(() => Object.fromEntries(
    availablePdfFiles
      .filter(file => Boolean(file.data))
      .map(file => [file.id, cloneSchedule(file.data as WeekSchedule)])
  ));
  const [editedTextStyles, setEditedTextStyles] = useState<PdfEditedTextStyles>(() => ({
    time: { ...DEFAULT_PDF_EDITED_TEXT_STYLES.time },
    class: { ...DEFAULT_PDF_EDITED_TEXT_STYLES.class },
    trainer: { ...DEFAULT_PDF_EDITED_TEXT_STYLES.trainer },
    theme: { ...DEFAULT_PDF_EDITED_TEXT_STYLES.theme },
  }));

  const updateEditedTextStyle = <K extends keyof PdfEditedTextStyles['time']>(
    target: PdfEditedTextTarget,
    field: K,
    value: PdfEditedTextStyles['time'][K]
  ) => {
    setEditedTextStyles(current => ({
      ...current,
      [target]: {
        ...current[target],
        [field]: value,
      },
    }));
  };

  const resetEditedTextStyles = () => {
    setEditedTextStyles({
      time: { ...DEFAULT_PDF_EDITED_TEXT_STYLES.time },
      class: { ...DEFAULT_PDF_EDITED_TEXT_STYLES.class },
      trainer: { ...DEFAULT_PDF_EDITED_TEXT_STYLES.trainer },
      theme: { ...DEFAULT_PDF_EDITED_TEXT_STYLES.theme },
    });
  };

  useEffect(() => {
    if (!availablePdfFiles.length) {
      setSelectedFileId(null);
      return;
    }

    if (!selectedFileId || !availablePdfFiles.some(file => file.id === selectedFileId)) {
      setSelectedFileId(availablePdfFiles[0].id);
    }
  }, [availablePdfFiles, selectedFileId]);

  useEffect(() => {
    setBaselineSchedules(current => {
      const next = { ...current };
      let changed = false;

      for (const file of availablePdfFiles) {
        if (file.data && !next[file.id]) {
          next[file.id] = cloneSchedule(file.data);
          changed = true;
        }
      }

      return changed ? next : current;
    });
  }, [availablePdfFiles]);

  const selectedFile = useMemo(
    () => availablePdfFiles.find(file => file.id === selectedFileId) ?? availablePdfFiles[0] ?? null,
    [availablePdfFiles, selectedFileId]
  );

  const selectedSchedule = selectedFile?.data;
  const originalPreviewUrl = selectedFile ? previewUrls[selectedFile.id] : undefined;
  const selectedTemplateLayout = selectedFile ? templateLayouts[selectedFile.id] : undefined;
  const baselineSchedule = selectedFile ? baselineSchedules[selectedFile.id] : undefined;
  const studioLocation = selectedFile?.location || selectedSchedule?.location || null;

  useEffect(() => {
    if (!selectedFile || !originalPreviewUrl || templateLayouts[selectedFile.id]) {
      return;
    }

    let cancelled = false;
    const selectedFileId = selectedFile.id;
    setTemplateLoadingFileId(selectedFile.id);

    extractPdfTemplateLayoutFromUrl(originalPreviewUrl)
      .then(layout => {
        if (cancelled) return;
        setTemplateLayouts(current => ({
          ...current,
          [selectedFileId]: layout,
        }));
        setTemplateLayoutResolved(current => ({
          ...current,
          [selectedFileId]: true,
        }));
        setTemplateLoadingFileId(current => (current === selectedFileId ? null : current));
      })
      .catch(error => {
        if (cancelled) return;
        console.warn('Could not extract the original PDF row layout. The studio template editor will stay available, but PDF export will use the template-based fallback for this file.', error);
        setTemplateLayoutResolved(current => ({
          ...current,
          [selectedFileId]: true,
        }));
        setTemplateLoadingFileId(current => (current === selectedFileId ? null : current));
      });

    return () => {
      cancelled = true;
    };
  }, [originalPreviewUrl, selectedFile, templateLayouts]);

  const updateSchedule = useCallback((updater: (schedule: WeekSchedule) => WeekSchedule) => {
    if (!selectedFile || !selectedSchedule) return;
    onUpdateSchedule(selectedFile.id, updater(selectedSchedule));
  }, [onUpdateSchedule, selectedFile, selectedSchedule]);

  const updateScheduleField = (field: keyof Pick<WeekSchedule, 'location' | 'weekStart' | 'weekEnd'>, value: string) => {
    updateSchedule(schedule => ({
      ...schedule,
      [field]: value,
      days: field === 'location'
        ? schedule.days.map(day => ({
            ...day,
            classes: day.classes.map(cls => ({ ...cls, location: value })),
          }))
        : schedule.days,
    }));
  };

  const updateClass = (dayIndex: number, classIndex: number, field: keyof ScheduleClass, value: string) => {
    updateSchedule(schedule => ({
      ...schedule,
      days: schedule.days.map((day, currentDayIndex) => {
        if (currentDayIndex !== dayIndex) return day;

        const nextClasses = day.classes.map((cls, currentClassIndex) =>
          currentClassIndex === classIndex ? { ...cls, [field]: value } : cls
        );

        return {
          ...day,
          classes: field === 'time' ? sortClassesByTime(nextClasses) : nextClasses,
        };
      }),
    }));
  };

  const addClass = (dayIndex: number) => {
    updateSchedule(schedule => ({
      ...schedule,
      days: schedule.days.map((day, currentDayIndex) =>
        currentDayIndex === dayIndex
          ? {
              ...day,
              classes: sortClassesByTime([...day.classes, createEmptyClass(schedule.location)]),
            }
          : day
      ),
    }));
  };

  const removeClass = (dayIndex: number, classIndex: number) => {
    updateSchedule(schedule => ({
      ...schedule,
      days: schedule.days.map((day, currentDayIndex) =>
        currentDayIndex === dayIndex
          ? {
              ...day,
              classes: day.classes.filter((_, currentClassIndex) => currentClassIndex !== classIndex),
            }
          : day
      ),
    }));
  };

  const overlayTargets = useMemo(() => {
    if (!selectedFile || !selectedSchedule || !selectedTemplateLayout) return [];
    return buildInlineOverlayTargets(selectedFile.id, selectedSchedule, selectedTemplateLayout);
  }, [selectedFile, selectedSchedule, selectedTemplateLayout]);

  const inlineEditingEnabled = Boolean(selectedSchedule);

  const renderFormEditor = () => {
    if (!selectedFile || !selectedSchedule) return null;

    return (
      <ScrollArea className="h-[900px]">
        <div className="space-y-6 p-5 pr-4">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            Inline overlay editing is unavailable for this PDF because its row layout could not be extracted reliably.
            You can still edit the parsed schedule below and preview the regenerated PDF on the left.
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Location</span>
              <Input value={selectedSchedule.location} onChange={event => updateScheduleField('location', event.target.value)} />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Week start</span>
              <Input value={selectedSchedule.weekStart} onChange={event => updateScheduleField('weekStart', event.target.value)} />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Week end</span>
              <Input value={selectedSchedule.weekEnd} onChange={event => updateScheduleField('weekEnd', event.target.value)} />
            </label>
          </div>

          {selectedSchedule.days.map((day, dayIndex) => (
            <div key={`${selectedFile.id}-${day.day}`} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-blue-600" />
                  <h4 className="font-semibold text-slate-900">{day.day}</h4>
                  <Badge variant="secondary" className="bg-white text-slate-600">{day.classes.length} classes</Badge>
                </div>
                <Button size="sm" variant="outline" onClick={() => addClass(dayIndex)} className="gap-2">
                  <Plus className="h-4 w-4" /> Add class
                </Button>
              </div>

              <div className="space-y-3 p-4">
                {day.classes.length === 0 && (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                    No classes yet for {day.day}. Add one to start editing.
                  </div>
                )}

                {day.classes.map((cls, classIndex) => (
                  <div key={cls.id} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <Badge variant="secondary" className="bg-white text-slate-600">Class {classIndex + 1}</Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => removeClass(dayIndex, classIndex)}
                        className="h-9 rounded-xl border-red-200 bg-red-50 px-3 font-semibold text-red-700 shadow-sm hover:border-red-300 hover:bg-red-100 hover:text-red-800"
                      >
                        Delete row
                      </Button>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="space-y-2">
                        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Time</span>
                        <Input value={cls.time} onChange={event => updateClass(dayIndex, classIndex, 'time', event.target.value)} />
                      </label>
                      <label className="space-y-2">
                        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Trainer</span>
                        <Input value={cls.trainer} onChange={event => updateClass(dayIndex, classIndex, 'trainer', event.target.value)} />
                      </label>
                      <label className="space-y-2 md:col-span-2">
                        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Class name</span>
                        <Input value={cls.className} onChange={event => updateClass(dayIndex, classIndex, 'className', event.target.value)} />
                      </label>
                      <label className="space-y-2 md:col-span-2">
                        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Location</span>
                        <Input value={cls.location || ''} onChange={event => updateClass(dayIndex, classIndex, 'location', event.target.value)} />
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    );
  };

  if (!availablePdfFiles.length) {
    return <div className="text-center py-16 text-slate-500">Upload a PDF to preview the source file and edit its extracted schedule.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3">
        {availablePdfFiles.map(file => {
          const isSelected = file.id === selectedFile?.id;
          return (
            <button
              key={file.id}
              type="button"
              onClick={() => setSelectedFileId(file.id)}
              className={cn(
                'flex min-w-[220px] items-center gap-3 rounded-[22px] border px-4 py-3 text-left transition-all',
                isSelected
                  ? 'border-slate-900 bg-slate-900 text-white shadow-md'
                  : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
              )}
            >
              <div className={cn('flex h-11 w-11 items-center justify-center rounded-xl', isSelected ? 'bg-white/10 text-white' : 'bg-red-100 text-red-600')}>
                <FileText className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className={cn('truncate font-medium', isSelected ? 'text-white' : 'text-slate-900')}>{file.name}</p>
                <p className={cn('truncate text-xs', isSelected ? 'text-slate-300' : 'text-slate-500')}>{file.location || file.data?.location || 'Unknown location'}</p>
              </div>
              <span className={cn('inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]', isSelected ? 'bg-white/10 text-white' : 'border border-slate-200 bg-slate-50 text-slate-500')}>
                PDF
              </span>
            </button>
          );
        })}
      </div>

      {selectedFile && selectedSchedule && (
        <div className="grid items-start gap-6 2xl:grid-cols-[minmax(0,1fr)_380px]">
          <section className="min-w-0 overflow-hidden rounded-[28px] border border-slate-200/80 bg-white p-0 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <div>
                <h3 className="flex items-center gap-2 font-display text-lg font-semibold text-slate-900">
                  <FileCode className="h-5 w-5 text-blue-600" /> HTML Schedule Editor
                </h3>
                <p className="text-sm text-slate-500">
                  Edit the studio template directly. Parsed PDF rows are placed into the Bandra or Kemps schedule layout first, so the file is ready for inline formatting as soon as upload and sync finish.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                  Studio template ready
                </span>

                <span className={cn(
                  'inline-flex rounded-full border px-3 py-1 text-xs font-medium',
                  selectedTemplateLayout ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'
                )}>
                  {templateLoadingFileId === selectedFile.id
                    ? 'Mapping original PDF for export…'
                    : selectedTemplateLayout
                      ? 'Original PDF export mapping ready'
                      : 'Using template-only export fallback'}
                </span>

                <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">{selectedFile.name}</span>
              </div>
            </div>

            <div className="border-b border-slate-200 px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-slate-900">Full-width preview workspace</p>
                  <p className="text-xs text-slate-500">The schedule viewport now takes the full available canvas area. Use the sidebar for detailed controls and structure edits.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700">Preview width: 100%</span>
                  <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700">Inline theme labels enabled</span>
                </div>
              </div>
            </div>

            <div className="p-4">
              <div className="h-[calc(100vh-14rem)] min-h-[900px] w-full overflow-x-auto overflow-y-auto rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-slate-100">
                <EditableHtmlSchedule
                  schedule={selectedSchedule ?? null}
                  sourcePdfUrl={null}
                  studioLocation={studioLocation}
                  onScheduleUpdate={(updatedSchedule) => {
                    if (selectedFile) {
                      onUpdateSchedule(selectedFile.id, updatedSchedule);
                    }
                  }}
                />
              </div>
            </div>
          </section>

          <section className="min-w-0 overflow-hidden rounded-[28px] border border-slate-200/80 bg-gradient-to-b from-white to-slate-50/80 p-0 shadow-sm 2xl:sticky 2xl:top-4">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <div className="min-w-0 flex-1">
                <h3 className="flex items-center gap-2 font-display text-lg font-semibold text-slate-900">
                  <PencilLine className="h-5 w-5 text-blue-600" /> Schedule inspector
                </h3>
                <p className="text-sm text-slate-500">
                  Edit directly inside the studio template on the left, then use these controls for metadata, structure, and export.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-2"
                  onClick={() => exportScheduleAsCsv(selectedSchedule, selectedFile.name)}
                >
                  <Download className="h-4 w-4" /> Export CSV
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-2"
                  onClick={() => {
                    void exportScheduleAsPdf(selectedSchedule, selectedFile.name, {
                      sourcePdfUrl: originalPreviewUrl,
                      templateLayout: selectedTemplateLayout,
                      baselineSchedule,
                      editedTextStyles,
                    });
                  }}
                >
                  <Download className="h-4 w-4" /> Export PDF
                </Button>
                <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                  <Save className="mr-1 h-3.5 w-3.5" /> Auto-saved
                </span>
              </div>
            </div>

            {inlineEditingEnabled && (
              <ScrollArea className="h-[calc(100vh-12rem)] min-h-[900px] w-full">
                <div className="min-w-0 space-y-5 p-5 pr-4">
                  {!selectedTemplateLayout && (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                      The studio template editor is ready. Original PDF row mapping could not be extracted for this file, so PDF export will use the template-based fallback instead of source-preserving placement.
                    </div>
                  )}

                  <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
                      <h4 className="font-semibold text-slate-900">Element styling</h4>
                      <p className="mt-1 text-sm text-slate-500">Change font, color, spacing, and position. The HTML schedule on the left updates immediately and exports to PDF with the same data.</p>
                    </div>
                    <div className="space-y-4 p-4">
                      {(['time', 'class', 'trainer', 'theme'] as PdfEditedTextTarget[]).map(target => {
                        const style = editedTextStyles[target];
                        const labels: Record<PdfEditedTextTarget, string> = {
                          time: 'Time',
                          class: 'Class name',
                          trainer: 'Trainer name',
                          theme: 'Theme tag',
                        };

                        return (
                          <div key={target} className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50/50 p-4">
                            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <h5 className="mb-1 font-semibold text-slate-900">{labels[target]} Block</h5>
                                <p className="text-xs text-slate-500">Font, size, color, position, and background styling</p>
                              </div>
                              <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-right shadow-sm">
                                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Preview</p>
                                <div className="mt-1 overflow-hidden text-ellipsis whitespace-nowrap text-slate-900" style={getEditedTextStyle(target, editedTextStyles)}>
                                  {target === 'time'
                                    ? '7:15 AM'
                                    : target === 'class'
                                      ? 'Studio Barre 57 - Reshma'
                                      : target === 'trainer'
                                        ? 'Reshma'
                                        : 'SIGNATURE'}
                                </div>
                              </div>
                            </div>

                            <div className="grid gap-4 md:grid-cols-2">
                              <label className="space-y-2">
                                <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Font</span>
                                <Select value={style.fontKey} onValueChange={value => updateEditedTextStyle(target, 'fontKey', value as PdfEditedTextStyles['time']['fontKey'])}>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select font" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {PDF_EDITED_TEXT_FONT_OPTIONS.map(option => (
                                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </label>

                              <label className="space-y-2">
                                <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Size</span>
                                <Input
                                  type="number"
                                  min={8}
                                  max={72}
                                  value={style.fontSize}
                                  onChange={event => updateEditedTextStyle(target, 'fontSize', Number(event.target.value) || 8)}
                                />
                              </label>

                              <label className="space-y-2">
                                <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Color</span>
                                <Input
                                  type="color"
                                  value={style.color}
                                  onChange={event => updateEditedTextStyle(target, 'color', event.target.value)}
                                  className="h-10 cursor-pointer p-1"
                                />
                              </label>

                              <label className="space-y-2">
                                <span className="text-xs font-medium uppercase tracking-wide text-slate-500">X offset</span>
                                <Input
                                  type="number"
                                  min={-100}
                                  max={100}
                                  value={style.offsetX ?? 0}
                                  onChange={event => updateEditedTextStyle(target, 'offsetX', Number(event.target.value) || 0)}
                                />
                              </label>

                              <label className="space-y-2">
                                <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Y offset</span>
                                <Input
                                  type="number"
                                  min={-100}
                                  max={100}
                                  value={style.offsetY ?? 0}
                                  onChange={event => updateEditedTextStyle(target, 'offsetY', Number(event.target.value) || 0)}
                                />
                              </label>

                              <label className="space-y-2">
                                <span className="text-xs font-medium uppercase tracking-wide text-slate-500">BG Color</span>
                                <Input
                                  type="color"
                                  value={style.backgroundColor ?? 'transparent'}
                                  onChange={event => updateEditedTextStyle(target, 'backgroundColor', event.target.value)}
                                  className="h-10 cursor-pointer p-1"
                                />
                              </label>

                              <label className="space-y-2">
                                <span className="text-xs font-medium uppercase tracking-wide text-slate-500">BG opacity</span>
                                <div className="space-y-1">
                                  <Input
                                    type="range"
                                    min={0}
                                    max={1}
                                    step={0.05}
                                    value={style.backgroundOpacity ?? 0}
                                    onChange={event => updateEditedTextStyle(target, 'backgroundOpacity', Number(event.target.value))}
                                  />
                                  <span className="text-xs text-slate-500">{Math.round((style.backgroundOpacity ?? 0) * 100)}%</span>
                                </div>
                              </label>

                              <label className="space-y-2">
                                <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Border radius</span>
                                <Input
                                  type="number"
                                  min={0}
                                  max={20}
                                  value={style.borderRadius ?? 4}
                                  onChange={event => updateEditedTextStyle(target, 'borderRadius', Number(event.target.value) || 0)}
                                />
                              </label>

                              <label className="space-y-2">
                                <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Padding X</span>
                                <Input
                                  type="number"
                                  min={0}
                                  max={20}
                                  value={style.paddingX ?? 0}
                                  onChange={event => updateEditedTextStyle(target, 'paddingX', Number(event.target.value) || 0)}
                                />
                              </label>

                              <label className="space-y-2">
                                <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Padding Y</span>
                                <Input
                                  type="number"
                                  min={0}
                                  max={20}
                                  value={style.paddingY ?? 0}
                                  onChange={event => updateEditedTextStyle(target, 'paddingY', Number(event.target.value) || 0)}
                                />
                              </label>
                            </div>
                          </div>
                        );
                      })}
                      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-4">
                        <p className="text-xs text-slate-500">These settings affect both the live preview and exported PDF.</p>
                        <Button type="button" size="sm" variant="outline" onClick={resetEditedTextStyles}>
                          Reset defaults
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-3">
                    <label className="space-y-2">
                      <span className="text-sm font-medium text-slate-700">Location</span>
                      <Input value={selectedSchedule.location} onChange={event => updateScheduleField('location', event.target.value)} />
                    </label>
                    <label className="space-y-2">
                      <span className="text-sm font-medium text-slate-700">Week start</span>
                      <Input value={selectedSchedule.weekStart} onChange={event => updateScheduleField('weekStart', event.target.value)} />
                    </label>
                    <label className="space-y-2">
                      <span className="text-sm font-medium text-slate-700">Week end</span>
                      <Input value={selectedSchedule.weekEnd} onChange={event => updateScheduleField('weekEnd', event.target.value)} />
                    </label>
                  </div>

                  {selectedSchedule.days.map((day, dayIndex) => (
                    <div key={`${selectedFile.id}-${day.day}`} className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
                        <div className="flex items-center gap-2">
                          <CalendarDays className="h-4 w-4 text-blue-600" />
                          <h4 className="font-semibold text-slate-900">{day.day}</h4>
                          <span className="inline-flex rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600">{day.classes.length} classes</span>
                        </div>
                        <Button size="sm" variant="outline" onClick={() => addClass(dayIndex)} className="gap-2">
                          <Plus className="h-4 w-4" /> Add class
                        </Button>
                      </div>

                      <div className="space-y-2 p-4">
                        {day.classes.length === 0 && (
                          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-center text-sm text-slate-500">
                            No classes yet for {day.day}. Add one to create a new synthetic row slot.
                          </div>
                        )}

                        {day.classes.map((cls, classIndex) => {
                          const classDescriptor = overlayTargets.find(target => target.day === day.day && target.classIndex === classIndex && target.target === 'classLine');

                          return (
                            <div key={cls.id} className="min-w-0 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-3">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                                    <span className="inline-flex rounded-full border border-slate-200 bg-white px-2.5 py-1 font-medium text-slate-600">Class {classIndex + 1}</span>
                                    {classDescriptor?.synthetic && (
                                      <span className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 font-medium text-blue-700">Synthetic slot</span>
                                    )}
                                    {cls.theme?.trim() && (
                                      <span className="inline-flex rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 font-medium text-violet-700">{cls.theme.trim()}</span>
                                    )}
                                  </div>
                                  <p className="mt-2 truncate text-sm font-medium text-slate-900">{buildCombinedClassLine(cls.className, cls.trainer) || 'Untitled class'}</p>
                                  <p className="text-xs text-slate-500">{cls.time || 'No time set'} · {getTrainerFirstName(cls.trainer) || 'No trainer'} · {cls.location || selectedSchedule.location}</p>
                                </div>

                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => removeClass(dayIndex, classIndex)}
                                  className="h-9 rounded-xl border-red-200 bg-red-50 px-3 font-semibold text-red-700 shadow-sm hover:border-red-300 hover:bg-red-100 hover:text-red-800"
                                >
                                  Delete row
                                </Button>
                              </div>

                              <div className="mt-3 grid gap-3 md:grid-cols-2">
                                <label className="space-y-1.5">
                                  <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Time</span>
                                  <Input value={cls.time} onChange={event => updateClass(dayIndex, classIndex, 'time', event.target.value)} />
                                </label>
                                <label className="space-y-1.5">
                                  <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Trainer</span>
                                  <Input value={cls.trainer} onChange={event => updateClass(dayIndex, classIndex, 'trainer', event.target.value)} />
                                </label>
                                <label className="space-y-1.5 md:col-span-2">
                                  <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Class name</span>
                                  <Input value={cls.className} onChange={event => updateClass(dayIndex, classIndex, 'className', event.target.value)} />
                                </label>
                                <label className="space-y-1.5">
                                  <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Theme badge</span>
                                  <Input value={cls.theme || ''} onChange={event => updateClass(dayIndex, classIndex, 'theme', event.target.value)} placeholder="Optional theme" />
                                </label>
                                <label className="space-y-1.5">
                                  <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Location</span>
                                  <Input value={cls.location || ''} onChange={event => updateClass(dayIndex, classIndex, 'location', event.target.value)} />
                                </label>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
