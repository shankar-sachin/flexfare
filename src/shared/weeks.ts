import type { Week } from './types';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const toISO = (d: Date) => d.toISOString().slice(0, 10);

/** Parse "YYYY-MM-DD" as a UTC date (avoids timezone drift). */
export const parseISO = (s: string) => new Date(`${s}T00:00:00Z`);

export function isoWeekNumber(date: Date): { week: number; year: number } {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { week, year: d.getUTCFullYear() };
}

function mondayOf(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - (day - 1));
  return d;
}

export function weekLabel(start: Date, end: Date): string {
  const sm = MONTHS[start.getUTCMonth()];
  const em = MONTHS[end.getUTCMonth()];
  return sm === em
    ? `${sm} ${start.getUTCDate()} – ${end.getUTCDate()}`
    : `${sm} ${start.getUTCDate()} – ${em} ${end.getUTCDate()}`;
}

export function makeWeek(monday: Date): Week {
  const end = new Date(monday);
  end.setUTCDate(end.getUTCDate() + 6);
  const { week, year } = isoWeekNumber(monday);
  return { isoWeek: week, year, start: toISO(monday), end: toISO(end), label: weekLabel(monday, end) };
}

/**
 * The next `count` bookable weeks. Starts with next week's Monday so the
 * current, partly-gone week isn't offered.
 */
export function upcomingWeeks(count = 12, from = new Date()): Week[] {
  const first = mondayOf(from);
  first.setUTCDate(first.getUTCDate() + 7);
  return Array.from({ length: count }, (_, i) => {
    const m = new Date(first);
    m.setUTCDate(m.getUTCDate() + i * 7);
    return makeWeek(m);
  });
}

/** "Tue Oct 20" */
export function shortDate(iso: string): string {
  const d = parseISO(iso);
  return `${DOW[(d.getUTCDay() + 6) % 7]} ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

export function dayParts(iso: string): { dow: string; day: number } {
  const d = parseISO(iso);
  return { dow: DOW[(d.getUTCDay() + 6) % 7], day: d.getUTCDate() };
}

export function weeksBetween(a: Week, b: Week): number {
  return Math.round((parseISO(b.start).getTime() - parseISO(a.start).getTime()) / (7 * 86400000));
}

/** "2026-W43" */
export function formatIsoWeek(w: Pick<Week, 'year' | 'isoWeek'>): string {
  return `${w.year}-W${String(w.isoWeek).padStart(2, '0')}`;
}

/** Parse "2026-W43" into a Week (Mon–Sun). Returns null if malformed. */
export function parseIsoWeek(s: string): Week | null {
  const m = /^(\d{4})-W(\d{2})$/.exec(s);
  if (!m) return null;
  const year = Number(m[1]);
  const week = Number(m[2]);
  if (week < 1 || week > 53) return null;
  // Jan 4th is always in ISO week 1.
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const monday = mondayOf(jan4);
  monday.setUTCDate(monday.getUTCDate() + (week - 1) * 7);
  const w = makeWeek(monday);
  return w.isoWeek === week && w.year === year ? w : null;
}

/** "3h ago", "just now". For "fare seen ..." labels. */
export function timeAgo(iso: string, now = Date.now()): string {
  const mins = Math.max(0, Math.round((now - Date.parse(iso)) / 60000));
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  return h < 36 ? `${h}h ago` : `${Math.round(h / 24)} days ago`;
}
