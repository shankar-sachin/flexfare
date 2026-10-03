import { describe, expect, it } from 'vitest';
import { upcomingWeeks } from '../shared/weeks';
import { buildCalendar } from './calendar';

// Thursday 1 Oct 2026. The first bookable week is Monday 5 Oct; 26 weeks end on Sunday 4 Apr 2027.
const today = new Date('2026-10-01T12:00:00Z');
const weeks = upcomingWeeks(26, today);
const cal = buildCalendar(weeks, today);
const month = (key: string) => cal.find((m) => m.key === key)!;

describe('the six-month window', () => {
  it('is 26 bookable weeks starting next Monday', () => {
    expect(weeks).toHaveLength(26);
    expect(weeks[0].start).toBe('2026-10-05');
    expect(weeks[25].start).toBe('2027-03-29');
    expect(weeks[25].end).toBe('2027-04-04');
  });
});

describe('buildCalendar', () => {
  it('lists every month from October 2026 to March 2027 (the last week starts in March)', () => {
    expect(cal.map((m) => m.key)).toEqual(['2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03']);
    expect(cal.map((m) => m.short)).toEqual(['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar']);
    expect(cal[0].label).toBe('October 2026');
  });

  it('draws October 2026 the way a wall calendar does: Monday first, 1 Oct is a Thursday', () => {
    const oct = month('2026-10');
    expect(oct.weeks).toHaveLength(5);
    const first = oct.weeks[0];
    expect(first.start).toBe('2026-09-28'); // the week that contains the 1st starts in September
    expect(first.days.map((d) => d.day)).toEqual([28, 29, 30, 1, 2, 3, 4]);
    expect(first.days.map((d) => d.inMonth)).toEqual([false, false, false, true, true, true, true]);
    const last = oct.weeks[4];
    expect(last.start).toBe('2026-10-26');
    expect(last.days.map((d) => d.day)).toEqual([26, 27, 28, 29, 30, 31, 1]);
    expect(last.days[6].inMonth).toBe(false); // 1 Nov is shown, muted
  });

  it('every row has seven consecutive days and a correct ISO week number', () => {
    for (const m of cal) {
      for (const w of m.weeks) {
        expect(w.days).toHaveLength(7);
        expect(w.days[0].date).toBe(w.start);
        expect(w.days[6].date).toBe(w.end);
        expect(new Date(`${w.start}T00:00:00Z`).getUTCDay()).toBe(1); // a Monday
      }
    }
    expect(month('2026-10').weeks.find((w) => w.start === '2026-10-19')!.isoWeek).toBe(43);
    expect(month('2026-12').weeks.at(-1)!.isoWeek).toBe(53); // 28 Dec 2026 starts week 53
    expect(month('2027-01').weeks[0].isoWeek).toBe(53); // the same week appears in January's first row
    expect(month('2027-01').weeks[1].isoWeek).toBe(1);
  });

  it('marks weeks you can search by their position in the list, and past weeks as unavailable', () => {
    const oct = month('2026-10');
    expect(oct.weeks[0].index).toBe(-1); // 28 Sep: already gone
    expect(oct.weeks[1].start).toBe('2026-10-05');
    expect(oct.weeks[1].index).toBe(0); // 5 Oct is the first bookable week
    expect(oct.weeks[4].index).toBe(3);
  });

  it('shows a week that spans two months in both, as the same week', () => {
    const oct = month('2026-10').weeks.find((w) => w.start === '2026-10-26')!;
    const nov = month('2026-11').weeks.find((w) => w.start === '2026-10-26')!;
    expect(oct.index).toBe(nov.index);
    expect(oct.index).toBeGreaterThan(-1);
    expect(nov.days.map((d) => d.inMonth)).toEqual([false, false, false, false, false, false, true]); // only 1 Nov counts here
  });

  it('marks today', () => {
    const flat = cal.flatMap((m) => m.weeks.flatMap((w) => w.days.filter((d) => d.isToday)));
    expect(flat.length).toBeGreaterThan(0);
    expect(new Set(flat.map((d) => d.date))).toEqual(new Set(['2026-10-01']));
  });

  it('covers every bookable week at least once, with no gaps or repeats inside a month', () => {
    const seen = new Set(cal.flatMap((m) => m.weeks.map((w) => w.index)).filter((i) => i >= 0));
    expect(seen.size).toBe(26);
    for (const m of cal) expect(new Set(m.weeks.map((w) => w.start)).size).toBe(m.weeks.length);
  });

  it('copes with an empty list and with a window that crosses the new year', () => {
    expect(buildCalendar([])).toEqual([]);
    const winter = upcomingWeeks(8, new Date('2026-12-10T12:00:00Z'));
    expect(buildCalendar(winter, new Date('2026-12-10T12:00:00Z')).map((m) => m.key)).toEqual(['2026-12', '2027-01', '2027-02']);
  });
});
