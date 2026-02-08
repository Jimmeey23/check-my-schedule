import { FilterState } from '@/types/schedule';

export function passesFilters(item: {
  day?: string;
  location?: string;
  trainer?: string;
  className?: string;
}, filters: FilterState): boolean {
  // If no filters applied, pass all
  if (!filters || (!filters.day?.length && !filters.location?.length && !filters.trainer?.length && !filters.className?.length)) {
    return true;
  }

  // Day filter
  if (filters.day && filters.day.length > 0) {
    if (!filters.day.includes(item.day || '')) {
      return false;
    }
  }

  // Location filter
  if (filters.location && filters.location.length > 0) {
    if (!filters.location.includes(item.location || '')) {
      return false;
    }
  }

  // Trainer filter
  if (filters.trainer && filters.trainer.length > 0) {
    if (!filters.trainer.includes(item.trainer || '')) {
      return false;
    }
  }

  // Class name filter
  if (filters.className && filters.className.length > 0) {
    if (!filters.className.includes(item.className || '')) {
      return false;
    }
  }

  return true;
}
