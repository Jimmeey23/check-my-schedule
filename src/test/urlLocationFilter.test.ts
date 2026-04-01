import { describe, expect, it } from 'vitest';
import { LOCATION_QUERY_PARAM, normalizeLocationFilterValue, updateLocationSearchParams } from '@/lib/urlLocationFilter';

describe('urlLocationFilter', () => {
  it('normalizes known location aliases from the URL', () => {
    expect(normalizeLocationFilterValue('Kwality House, Kemps Corner')).toBe('Kwality House, Kemps Corner');
    expect(normalizeLocationFilterValue('Kemps')).toBe('Kwality House, Kemps Corner');
    expect(normalizeLocationFilterValue('Supreme HQ, Bandra')).toBe('Supreme HQ, Bandra');
    expect(normalizeLocationFilterValue('Bandra')).toBe('Supreme HQ, Bandra');
  });

  it('falls back to all for empty values', () => {
    expect(normalizeLocationFilterValue(undefined)).toBe('all');
    expect(normalizeLocationFilterValue('')).toBe('all');
    expect(normalizeLocationFilterValue('all')).toBe('all');
  });

  it('adds and removes the location query parameter', () => {
    const withLocation = updateLocationSearchParams(new URLSearchParams('tab=comparison'), 'Kemps');
    expect(withLocation.get(LOCATION_QUERY_PARAM)).toBe('Kwality House, Kemps Corner');
    expect(withLocation.get('tab')).toBe('comparison');

    const cleared = updateLocationSearchParams(withLocation, 'all');
    expect(cleared.get(LOCATION_QUERY_PARAM)).toBeNull();
    expect(cleared.get('tab')).toBe('comparison');
  });
});