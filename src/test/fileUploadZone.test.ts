import { describe, expect, it } from 'vitest';
import { getOrderedUploadItems } from '@/components/FileUploadZone';

describe('FileUploadZone upload ordering', () => {
  it('processes CSV files before PDFs so PDF enrichment can use CSV themes', () => {
    const pdf = new File(['pdf'], 'schedule.pdf', { type: 'application/pdf' });
    const csv = new File(['csv'], 'schedule.csv', { type: 'text/csv' });
    const other = new File(['txt'], 'notes.txt', { type: 'text/plain' });

    const ordered = getOrderedUploadItems([pdf, other, csv], ['pdf', 'csv']);

    expect(ordered.map(item => item.file.name)).toEqual(['schedule.csv', 'schedule.pdf']);
  });
});
