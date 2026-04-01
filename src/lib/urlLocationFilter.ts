import { normalizeLocation } from '@/lib/normalizers';

export const LOCATION_QUERY_PARAM = 'location';

export function normalizeLocationFilterValue(value: string | null | undefined): string {
  if (!value) return 'all';

  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === 'all') return 'all';

  return normalizeLocation(trimmed) || trimmed;
}

export function updateLocationSearchParams(current: URLSearchParams, location: string): URLSearchParams {
  const next = new URLSearchParams(current);
  const normalized = normalizeLocationFilterValue(location);

  if (normalized === 'all') {
    next.delete(LOCATION_QUERY_PARAM);
  } else {
    next.set(LOCATION_QUERY_PARAM, normalized);
  }

  return next;
}