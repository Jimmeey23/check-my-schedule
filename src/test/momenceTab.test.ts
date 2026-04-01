import { describe, expect, it } from 'vitest';
import { rowMatchesMomenceFilters, type MomenceComparisonRow, type MomenceRowFilters } from '@/components/MomenceTab';

const baseFilters: MomenceRowFilters = {
  status: 'all',
  location: 'all',
  day: 'all',
  time: 'all',
  className: 'all',
  trainer: 'all',
  showOnlyMismatches: false,
};

describe('MomenceTab row filtering', () => {
  it('filters mismatched rows by the primary Momence location', () => {
    const row: MomenceComparisonRow = {
      day: 'Monday',
      status: 'trainer-mismatch',
      momence: {
        day: 'Monday',
        time: '19:15',
        className: 'Studio Barre 57',
        trainer: 'Reshma Sharma',
        location: 'Kemps',
        uniqueKey: 'momence-1',
        startsAt: '2026-03-02T19:15:00.000Z',
        bookingCount: 10,
        capacity: 20,
      },
      source: {
        day: 'Monday',
        time: '19:15',
        className: 'Studio Barre 57',
        trainer: 'Richard D\'Costa',
        location: 'Bandra',
      },
      matchNote: 'trainer-substitution',
    };

    expect(rowMatchesMomenceFilters(row, { ...baseFilters, location: 'Kemps' })).toBe(true);
    expect(rowMatchesMomenceFilters(row, { ...baseFilters, location: 'Bandra' })).toBe(false);
  });

  it('falls back to source values for source-only rows', () => {
    const row: MomenceComparisonRow = {
      day: 'Tuesday',
      status: 'source-only',
      momence: null,
      source: {
        day: 'Tuesday',
        time: '08:30',
        className: 'Studio Mat 57',
        trainer: 'Richard D\'Costa',
        location: 'Bandra',
      },
    };

    expect(rowMatchesMomenceFilters(row, { ...baseFilters, location: 'Bandra' })).toBe(true);
    expect(rowMatchesMomenceFilters(row, { ...baseFilters, location: 'Kemps' })).toBe(false);
  });

  it('respects mismatch-only filtering', () => {
    const row: MomenceComparisonRow = {
      day: 'Wednesday',
      status: 'match',
      momence: {
        day: 'Wednesday',
        time: '07:00',
        className: 'Studio FIT',
        trainer: 'Anisha Shah',
        location: 'Kemps',
        uniqueKey: 'momence-2',
        startsAt: '2026-03-04T07:00:00.000Z',
        bookingCount: 8,
        capacity: 18,
      },
      source: {
        day: 'Wednesday',
        time: '07:00',
        className: 'Studio FIT',
        trainer: 'Anisha Shah',
        location: 'Kemps',
      },
      matchNote: 'exact',
    };

    expect(rowMatchesMomenceFilters(row, { ...baseFilters, showOnlyMismatches: true })).toBe(false);
  });
});