export interface MomenceSession {
  id: number;
  name: string;
  startsAt: string;
  endsAt: string;
  durationMin: number;
  capacity: number;
  bookedCount: number | null;
  spotsLeft: number | null;
  lateCancelled: number | null;
  instructor: {
    id?: number;
    firstName?: string;
    lastName?: string;
    name?: string;
    pictureUrl?: string;
  } | null;
  location: {
    id?: number;
    name?: string;
  } | null;
  level: string | null;
  category: string | null;
  price: number | null;
  description: string;
  isCancelled?: boolean;
  isDraft?: boolean;
  isRecurring?: boolean;
  isInPerson?: boolean;
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
