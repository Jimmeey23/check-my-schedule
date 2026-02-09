import { MomenceSession } from './momenceApi';
import { PdfClassData } from '@/types/schedule';
import { normalizeClassName, normalizeTrainerName, normalizeLocationName, normalizeTimeString } from './normalizers';

export function normalizeMomenceSession(session: MomenceSession): PdfClassData {
  const startTime = new Date(session.startsAt);
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const day = dayNames[startTime.getDay()];
  
  // Format time as HH:MM
  const hours = startTime.getHours().toString().padStart(2, '0');
  const minutes = startTime.getMinutes().toString().padStart(2, '0');
  const time = `${hours}:${minutes}`;
  
  const trainerName = `${session.teacher.firstName} ${session.teacher.lastName}`;
  const location = session.inPersonLocation?.name || 'Online';
  
  return {
    day,
    time: normalizeTimeString(time),
    className: normalizeClassName(session.name),
    trainer: normalizeTrainerName(trainerName),
    location: normalizeLocationName(location),
    uniqueKey: `${day}-${time}-${session.name}-${trainerName}`,
  };
}
