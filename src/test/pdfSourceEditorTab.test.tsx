import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UploadedFile, WeekSchedule } from '@/types/schedule';

const extractPdfTemplateLayoutFromUrlMock = vi.fn();
const exportScheduleAsPdfMock = vi.fn();
const exportScheduleAsCsvMock = vi.fn();

vi.mock('pdfjs-dist', () => ({
  version: '4.9.155',
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: () => ({
    promise: Promise.resolve({
      numPages: 1,
      getPage: async () => ({
        getViewport: ({ scale }: { scale: number }) => ({ width: 600 * scale, height: 800 * scale }),
        render: () => ({ promise: Promise.resolve() }),
      }),
      destroy: async () => {},
    }),
    destroy: () => {},
  }),
}));

vi.mock('@/lib/pdfParser', () => ({
  extractPdfTemplateLayoutFromUrl: (...args: unknown[]) => extractPdfTemplateLayoutFromUrlMock(...args),
}));

vi.mock('@/lib/scheduleExport', async () => {
  const actual = await vi.importActual<typeof import('@/lib/scheduleExport')>('@/lib/scheduleExport');
  return {
    ...actual,
    exportScheduleAsCsv: (...args: unknown[]) => exportScheduleAsCsvMock(...args),
    exportScheduleAsPdf: (...args: unknown[]) => exportScheduleAsPdfMock(...args),
  };
});

import { PdfSourceEditorTab } from '@/components/PdfSourceEditorTab';

function createSchedule(): WeekSchedule {
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
        classes: [
          {
            id: 'class-1',
            time: '7:15 AM',
            className: 'Studio Barre 57',
            trainer: 'Reshma Sharma',
            location: 'Kemps',
            theme: 'Sean Paul & Friends',
          },
        ],
      },
    ],
  };
}

function createPdfFile(schedule: WeekSchedule): UploadedFile {
  return {
    id: 'file-1',
    name: 'schedule.pdf',
    type: 'pdf',
    uploadedAt: new Date('2026-04-05T10:00:00.000Z'),
    status: 'completed',
    location: 'Kemps',
    data: schedule,
  };
}

function createLayout() {
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

function renderHarness() {
  const onUpdate = vi.fn();

  function Harness() {
    const [files, setFiles] = useState<UploadedFile[]>([createPdfFile(createSchedule())]);

    return (
      <PdfSourceEditorTab
        pdfFiles={files}
        previewUrls={{ 'file-1': 'https://example.com/source.pdf' }}
        onUpdateSchedule={(fileId, schedule) => {
          setFiles(current => current.map(file => file.id === fileId ? { ...file, data: schedule, location: schedule.location } : file));
          onUpdate(fileId, schedule);
        }}
      />
    );
  }

  return {
    onUpdate,
    ...render(<Harness />),
  };
}

describe('PdfSourceEditorTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    extractPdfTemplateLayoutFromUrlMock.mockResolvedValue(createLayout());
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    })));
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:mock-pdf'),
      revokeObjectURL: vi.fn(),
    });
  });

  it('updates the matching schedule class when an inline time field is edited', async () => {
    const { onUpdate } = renderHarness();

    const field = await screen.findByTestId('template-MONDAY-0-time');
    field.textContent = '8:00 AM';
    fireEvent.input(field);
    fireEvent.blur(field);

    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalled();
    });

    const updatedSchedule = onUpdate.mock.calls.at(-1)?.[1] as WeekSchedule;
    expect(updatedSchedule.days[0]?.classes[0]?.time).toBe('8:00 AM');
  });

  it('updates class and theme fields inline and shows only the trainer first name in preview', async () => {
    const { onUpdate } = renderHarness();

    const trainerField = await screen.findByTestId('template-MONDAY-0-trainer');
    expect(trainerField).toHaveTextContent('Reshma');
    expect(trainerField).not.toHaveTextContent('Sharma');

    const classField = await screen.findByTestId('template-MONDAY-0-class');
    classField.textContent = 'Studio Cardio Barre';
    fireEvent.input(classField);
    fireEvent.blur(classField);

    const themeField = await screen.findByTestId('template-MONDAY-0-theme');
    themeField.textContent = 'Glute Camp';
    fireEvent.input(themeField);
    fireEvent.blur(themeField);

    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalled();
    });

    const updatedSchedule = onUpdate.mock.calls.at(-1)?.[1] as WeekSchedule;
    expect(updatedSchedule.days[0]?.classes[0]?.className).toBe('Studio Cardio Barre');
    expect(updatedSchedule.days[0]?.classes[0]?.theme).toBe('Glute Camp');
  });

  it('exports the edited schedule with original PDF mapping when available', async () => {
    renderHarness();

    await screen.findByText(/Original PDF export mapping ready/i);
    fireEvent.click(screen.getByRole('button', { name: /export pdf/i }));

    await waitFor(() => {
      expect(exportScheduleAsPdfMock).toHaveBeenCalled();
    });

    const latestOptions = exportScheduleAsPdfMock.mock.calls.at(-1)?.[2] as {
      baselineSchedule?: WeekSchedule;
      sourcePdfUrl?: string;
      templateLayout?: ReturnType<typeof createLayout>;
    };

    expect(latestOptions.sourcePdfUrl).toBe('https://example.com/source.pdf');
    expect(latestOptions.templateLayout).toEqual(createLayout());
    expect(latestOptions.baselineSchedule?.days[0]?.classes[0]?.time).toBe('7:15 AM');
  });

  it('updates inspector rows when classes are added and removed', async () => {
    renderHarness();

    await screen.findByTestId('template-MONDAY-0-time');
    expect(screen.getAllByRole('button', { name: /remove/i })).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: /add class/i }));

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /remove/i })).toHaveLength(2);
    });

    fireEvent.click(screen.getAllByRole('button', { name: /remove/i })[1]);

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /remove/i })).toHaveLength(1);
    });
  });

  it('keeps the studio template editor active when template layout extraction is unavailable', async () => {
    extractPdfTemplateLayoutFromUrlMock.mockRejectedValueOnce(new Error('layout unavailable'));
    renderHarness();

    expect(await screen.findByText(/Using template-only export fallback/i)).toBeInTheDocument();
    expect(screen.getByText(/The studio template editor is ready/i)).toBeInTheDocument();
    expect(screen.getByTestId('template-MONDAY-0-time')).toBeInTheDocument();
  });
});
