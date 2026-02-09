export interface MomenceSession {
  id: number;
  name: string;
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
  };
  inPersonLocation?: {
    id: number;
    name: string;
  };
  isCancelled: boolean;
  isRecurring: boolean;
  isDraft: boolean;
  isInPerson: boolean;
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
