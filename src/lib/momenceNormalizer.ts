import { MomenceSession } from '@/types/momence';
import { PdfClassData } from '@/types/schedule';
import { normalizeClassName, normalizeTrainer, normalizeLocation, normalizeTime } from './normalizers';

export function normalizeMomenceSession(session: MomenceSession): PdfClassData {
  const startTime = new Date(session.startsAt);
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const day = dayNames[startTime.getDay()];
  
  // Format time as HH:MM
  const hours = startTime.getHours().toString().padStart(2, '0');
  const minutes = startTime.getMinutes().toString().padStart(2, '0');
  const time = `${hours}:${minutes}`;
  
  const trainerName = session.teacher
    ? `${session.teacher.firstName} ${session.teacher.lastName}`.trim()
    : '';
  const location = session.inPersonLocation?.name || 'Online';
  
  return {
    day,
    time: normalizeTime(time),
    className: normalizeClassName(session.name),
    trainer: normalizeTrainer(trainerName),
    location: normalizeLocation(location),
    uniqueKey: `${day}-${time}-${session.name}-${trainerName}`,
  };
}

