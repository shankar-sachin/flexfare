// Lays the bookable weeks out as month-by-month calendars: Monday to Sunday, one row per week.
// A week that spans two months appears in both, and is the same week (same index) in each.
import type { Week } from '../shared/types';
import { addDays, mondayOf, parseISO } from '../shared/weeks';

export interface CalendarDay {
  date: string; // YYYY-MM-DD
  day: number; // 1-31
  inMonth: boolean; // false for the few days of a neighbouring month that share the row
  isToday: boolean;
}

export interface CalendarWeek {
  start: string; // the Monday
  end: string; // the Sunday
  isoWeek: number;
  days: CalendarDay[]; // always 7
  /** Position in the bookable `weeks` list, or -1 when the week can't be searched (already past). */
  index: number;
}

export interface CalendarMonth {
  key: string; // "2026-10"
  label: string; // "October 2026"
  short: string; // "Oct"
  weeks: CalendarWeek[];
}

const monthFmt = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const shortFmt = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' });
const iso = (d: Date) => d.toISOString().slice(0, 10);
const monthKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

/** ISO week number of a Monday (the week's Thursday decides the year). */
function isoWeekOf(monday: Date): number {
  const thursday = new Date(monday);
  thursday.setUTCDate(thursday.getUTCDate() + 3);
  const jan1 = Date.UTC(thursday.getUTCFullYear(), 0, 1);
  return Math.ceil(((thursday.getTime() - jan1) / 86400000 + 1) / 7);
}

export function buildCalendar(weeks: Week[], today = new Date()): CalendarMonth[] {
  if (weeks.length === 0) return [];
  const indexOf = new Map(weeks.map((w, i) => [w.start, i]));
  const todayIso = iso(today);

  const first = parseISO(weeks[0].start);
  const last = parseISO(weeks[weeks.length - 1].start);
  const months: CalendarMonth[] = [];

  for (let y = first.getUTCFullYear(), m = first.getUTCMonth(); ; ) {
    const monthStart = new Date(Date.UTC(y, m, 1));
    const monthEnd = new Date(Date.UTC(y, m + 1, 0));
    const rows: CalendarWeek[] = [];
    for (let monday = mondayOf(monthStart); monday <= monthEnd; monday = parseISO(addDays(iso(monday), 7))) {
      const start = iso(monday);
      rows.push({
        start,
        end: addDays(start, 6),
        isoWeek: isoWeekOf(monday),
        index: indexOf.get(start) ?? -1,
        days: Array.from({ length: 7 }, (_, i) => {
          const date = addDays(start, i);
          const d = parseISO(date);
          return { date, day: d.getUTCDate(), inMonth: monthKey(d) === monthKey(monthStart), isToday: date === todayIso };
        }),
      });
    }
    months.push({ key: monthKey(monthStart), label: monthFmt.format(monthStart), short: shortFmt.format(monthStart), weeks: rows });
    if (y === last.getUTCFullYear() && m === last.getUTCMonth()) break;
    m += 1;
    if (m > 11) (m = 0), (y += 1);
  }
  return months;
}
