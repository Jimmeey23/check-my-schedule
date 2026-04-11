import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UploadedFile, WeekSchedule } from '@/types/schedule';

const extractPdfTemplateLayoutFromUrlMock = vi.fn();
const buildSchedulePdfBlobMock = vi.fn(async (_schedule?: unknown, _sourceName?: unknown, _options?: unknown) => new Blob(['pdf'], { type: 'application/pdf' }));

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
    buildSchedulePdfBlob: (schedule: unknown, sourceName: unknown, options?: unknown) => buildSchedulePdfBlobMock(schedule, sourceName, options),
    exportScheduleAsCsv: vi.fn(),
    exportScheduleAsPdf: vi.fn(),
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
    extractPdfTemplateLayoutFromUrlMock.mockResolvedValue(createLayout());
    buildSchedulePdfBlobMock.mockResolvedValue(new Blob(['pdf'], { type: 'application/pdf' }));
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

    const overlay = await screen.findByTestId('overlay-Monday-0-time');
    fireEvent.doubleClick(overlay);

    const editor = await screen.findByTestId('inline-editor-file-1:Monday:0:time');
    fireEvent.change(editor, { target: { value: '8:00 AM' } });
    fireEvent.keyDown(editor, { key: 'Enter' });

    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalled();
    });

    const updatedSchedule = onUpdate.mock.calls.at(-1)?.[1] as WeekSchedule;
    expect(updatedSchedule.days[0]?.classes[0]?.time).toBe('8:00 AM');
  });

  it('parses a combined class-line edit into class name and trainer', async () => {
    const { onUpdate } = renderHarness();

    const overlay = await screen.findByTestId('overlay-Monday-0-classLine');
    fireEvent.doubleClick(overlay);

    const editor = await screen.findByTestId('inline-editor-file-1:Monday:0:classLine');
    fireEvent.change(editor, { target: { value: 'Studio Cardio Barre - Raunak' } });
    fireEvent.keyDown(editor, { key: 'Enter' });

    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalled();
    });

    const updatedSchedule = onUpdate.mock.calls.at(-1)?.[1] as WeekSchedule;
    expect(updatedSchedule.days[0]?.classes[0]?.className).toBe('Studio Cardio Barre');
    expect(updatedSchedule.days[0]?.classes[0]?.trainer).toBe('Raunak');
  });

  it('regenerates the live PDF preview after inline edits are committed', async () => {
    renderHarness();

    await screen.findByTestId('overlay-Monday-0-time');
    expect(buildSchedulePdfBlobMock).not.toHaveBeenCalled();

    const initialCallCount = buildSchedulePdfBlobMock.mock.calls.length;
    const overlay = screen.getByTestId('overlay-Monday-0-time');
    fireEvent.doubleClick(overlay);

    const editor = await screen.findByTestId('inline-editor-file-1:Monday:0:time');
    fireEvent.change(editor, { target: { value: '8:10 AM' } });
    fireEvent.keyDown(editor, { key: 'Enter' });

    await waitFor(() => {
      expect(buildSchedulePdfBlobMock.mock.calls.length).toBeGreaterThan(initialCallCount);
    });

    const latestOptions = buildSchedulePdfBlobMock.mock.calls.at(-1)?.[2] as {
      editedTextStyles?: { time?: { fontSize?: number } };
      sourcePdfUrl?: string;
    };

    expect(latestOptions.sourcePdfUrl).toBe('https://example.com/source.pdf');
  });

  it('regenerates the live PDF preview when text styling changes', async () => {
    renderHarness();

    await screen.findByTestId('overlay-Monday-0-time');

    const initialCallCount = buildSchedulePdfBlobMock.mock.calls.length;
    const fontSizeInputs = screen.getAllByRole('spinbutton');

    fireEvent.change(fontSizeInputs[0], { target: { value: '18' } });

    await new Promise(resolve => setTimeout(resolve, 220));
    expect(buildSchedulePdfBlobMock.mock.calls.length).toBe(initialCallCount);
  });

  it('keeps the original preview until the schedule content actually changes', async () => {
    renderHarness();

    await screen.findByTestId('overlay-Monday-0-time');
    await new Promise(resolve => setTimeout(resolve, 220));

    expect(buildSchedulePdfBlobMock).not.toHaveBeenCalled();
  });

  it('updates overlay count when classes are added and removed from the inspector', async () => {
    renderHarness();

    await screen.findByTestId('overlay-Monday-0-time');
    expect(screen.getAllByTestId(/overlay-Monday-/)).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: /add class/i }));

    await waitFor(() => {
      expect(screen.getAllByTestId(/overlay-Monday-/)).toHaveLength(4);
    });

    fireEvent.click(screen.getAllByRole('button', { name: /remove/i })[1]);

    await waitFor(() => {
      expect(screen.getAllByTestId(/overlay-Monday-/)).toHaveLength(2);
    });
  });

  it('shows the fallback form editor when template layout extraction is unavailable', async () => {
    extractPdfTemplateLayoutFromUrlMock.mockRejectedValueOnce(new Error('layout unavailable'));
    renderHarness();

    expect(await screen.findByText(/Inline overlay editing is unavailable for this PDF/i)).toBeInTheDocument();
  });
});
