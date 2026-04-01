import type { ScheduleComparisonResult, ComparedClass } from '@/types/schedule';

const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

interface MismatchDetail {
  day: string;
  time: string;
  type: string; // e.g., "Trainer Mismatch", "Class Mismatch", etc.
  csv: {
    time: string;
    className: string;
    trainer: string;
  };
  pdf: {
    time: string;
    className: string;
    trainer: string;
  };
}

function getMismatchType(pdfClass: ComparedClass, csvClass: ComparedClass | undefined): string {
  if (!csvClass) return 'Missing in CSV';
  if (!pdfClass) return 'Extra in PDF';

  const differences = pdfClass.differences || {};

  if (differences.trainer) return '👤 *Trainer Mismatch*';
  if (differences.className) return '📚 *Class Mismatch*';
  if (differences.time) return '⏰ *Time Mismatch*';
  if (differences.location) return '📍 *Location Mismatch*';

  return '⚠️ *Mismatch*';
}

function formatTime(time: string): string {
  if (!time || time === '—' || time === '-') return '—';
  return time;
}

function groupMismatchesByDay(comparison: ScheduleComparisonResult, location: string | null): Map<string, MismatchDetail[]> {
  const map = new Map<string, MismatchDetail[]>();

  for (const pdfClass of comparison.pdfClasses) {
    if (pdfClass.status === 'match') continue;

    // Filter by location if specified
    if (location && location !== 'all' && pdfClass.normalizedLocation !== location) {
      continue;
    }

    const day = pdfClass.day || 'Unknown';
    const csvMatch = comparison.csvClasses.find(
      c => c.day === day && c.normalizedTime === pdfClass.normalizedTime
    );

    if (!map.has(day)) {
      map.set(day, []);
    }

    const bucket = map.get(day)!;

    const mismatch: MismatchDetail = {
      day,
      time: pdfClass.time,
      type: getMismatchType(pdfClass, csvMatch),
      csv: {
        time: csvMatch?.time || '—',
        className: csvMatch?.className || '—',
        trainer: csvMatch?.trainer || '—',
      },
      pdf: {
        time: pdfClass.time || '—',
        className: pdfClass.className || '—',
        trainer: pdfClass.trainer || '—',
      },
    };

    bucket.push(mismatch);
  }

  // Sort days
  const sortedMap = new Map<string, MismatchDetail[]>();
  const sortedDays = Array.from(map.keys()).sort(
    (a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b)
  );

  for (const day of sortedDays) {
    sortedMap.set(day, map.get(day) || []);
  }

  return sortedMap;
}

export function formatMismatchesAsWhatsApp(
  comparison: ScheduleComparisonResult,
  location: string | null = null,
  studioName: string = 'the studio'
): string {
  const mismatchesByDay = groupMismatchesByDay(comparison, location);

  if (mismatchesByDay.size === 0) {
    return `Hi, No mismatches found in the schedule for ${studioName}. All classes match! ✅`;
  }

  const totalMismatches = Array.from(mismatchesByDay.values()).reduce((sum, arr) => sum + arr.length, 0);

  let message = `Hi, Below are the mismatches found in the schedule for ${studioName}:\n`;
  message += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  message += `Total Mismatches: *${totalMismatches}*\n\n`;

  let issueNumber = 1;

  for (const [day, mismatches] of mismatchesByDay) {
    message += `📅 *${day}*\n`;
    message += `─────────────────────────────\n\n`;

    for (const mismatch of mismatches) {
      message += `${issueNumber}. ${mismatch.type}\n`;
      message += `   📊 *CSV:*\n`;
      message += `   • Time: ${formatTime(mismatch.csv.time)}\n`;
      message += `   • Class: ${mismatch.csv.className}\n`;
      message += `   • Trainer: ${mismatch.csv.trainer}\n`;
      message += `   📄 *PDF:*\n`;
      message += `   • Time: ${formatTime(mismatch.pdf.time)}\n`;
      message += `   • Class: ${mismatch.pdf.className}\n`;
      message += `   • Trainer: ${mismatch.pdf.trainer}\n\n`;

      issueNumber++;
    }

    message += `\n`;
  }

  const now = new Date();
  const formattedDate = now.toLocaleString('en-US', {
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });

  message += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  message += `Generated: ${formattedDate}\n`;
  message += `\n⚠️ *PLEASE UPDATE THE PDF FILE WITH THE CHANGES MENTIONED ABOVE*`;

  return message;
}

export function copyToClipboard(text: string): Promise<void> {
  return navigator.clipboard.writeText(text);
}
