export interface MomenceSession {
  id: number;
  name: string;
  type: string;
  description: string;
  startsAt: string;
  endsAt: string;
  durationInMinutes: number;
  capacity: number;
  bookingCount: number;
  teacher: {
    id: number;
    firstName: string;
    lastName: string;
    pictureUrl?: string;
  } | null;
  isRecurring: boolean;
  isCancelled: boolean;
  isInPerson: boolean;
  isDraft: boolean;
  inPersonLocation?: {
    id: number;
    name: string;
  } | null;
  onlineStreamUrl?: string | null;
  onlineStreamPassword?: string | null;
  bannerImageUrl?: string | null;
  hostPhotoUrl?: string | null;
  tags?: Array<{
    id: number;
    name: string;
    isCustomerBadge: boolean;
    badgeLabel: string;
    badgeColor: string;
  }>;
}

export interface MomenceClassData {
  day: string;
  time: string;
  className: string;
  trainer: string;
  location: string;
  uniqueKey: string;
  startsAt: string;
  bookingCount: number;
  capacity: number;
}
