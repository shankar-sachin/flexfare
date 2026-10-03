// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WeekFare } from '../shared/types';
import { upcomingWeeks } from '../shared/weeks';
import { WeekCalendar } from './WeekCalendar';

afterEach(cleanup);
const today = new Date('2026-10-01T12:00:00Z');
const weeks = upcomingWeeks(26, today); // 5 Oct 2026 .. 4 Apr 2027

/** Keeps the selection in state, like the search form does. */
function Harness({ single = false, fares = [], loading = false, start = { depart: 2, ret: null as number | null }, onPick = () => undefined, disabled = false }: {
  single?: boolean; fares?: WeekFare[]; loading?: boolean; start?: { depart: number; ret: number | null }; onPick?: (d: number, r: number | null) => void; disabled?: boolean;
}) {
  const [sel, setSel] = useState(start);
  return (
    <WeekCalendar
      weeks={weeks} fares={fares} loading={loading} single={single} disabled={disabled} depart={sel.depart} ret={sel.ret}
      onChange={(depart, ret) => (setSel({ depart, ret }), onPick(depart, ret))}
    />
  );
}
const week = (name: RegExp | string) => screen.getAllByRole('button', { name: typeof name === 'string' ? new RegExp(`^${name}`) : name });
const first = (name: RegExp | string) => week(name)[0] as HTMLButtonElement;
const pressed = (name: RegExp | string) => week(name).map((b) => b.getAttribute('aria-pressed'));
const monthTitles = () => screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);

describe('the months', () => {
  it('shows the month of the chosen week and the next, and every month in a strip', () => {
    render(<Harness />);
    expect(monthTitles()).toEqual(['October 2026', 'November 2026']);
    const strip = screen.getByRole('group', { name: 'Jump to a month' });
    expect(within(strip).getAllByRole('button').map((b) => b.textContent)).toEqual(['Oct ’26', 'Nov', 'Dec', 'Jan ’27', 'Feb', 'Mar']);
  });

  it('opens on the month of the leave week, wherever it is', () => {
    render(<Harness start={{ depart: 16, ret: null }} />); // mid-Jan
    expect(monthTitles()).toEqual(['January 2027', 'February 2027']);
  });

  it('pages with the arrows, and disables them at the ends', () => {
    render(<Harness />);
    const prev = screen.getByRole('button', { name: 'Previous month' }) as HTMLButtonElement;
    const next = screen.getByRole('button', { name: 'Next month' }) as HTMLButtonElement;
    expect(prev.disabled).toBe(true);
    fireEvent.click(next);
    expect(monthTitles()).toEqual(['November 2026', 'December 2026']);
    expect(prev.disabled).toBe(false);
    fireEvent.click(prev);
    expect(monthTitles()).toEqual(['October 2026', 'November 2026']);
    for (let i = 0; i < 5; i++) fireEvent.click(next);
    expect(monthTitles()).toEqual(['March 2027']);
    expect(next.disabled).toBe(true);
  });

  it('jumps straight to a month from the strip, and marks which months are showing', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'February 2027' }));
    expect(monthTitles()).toEqual(['February 2027', 'March 2027']);
    expect(screen.getByRole('button', { name: 'February 2027' }).getAttribute('aria-current')).toBe('true'); // the main month
    expect(screen.getByRole('button', { name: 'March 2027' }).className).toContain('cal__chip--second'); // lit up too on wide screens
    expect(screen.getByRole('button', { name: 'March 2027' }).getAttribute('aria-current')).toBeNull();
    expect(screen.getByRole('button', { name: 'October 2026' }).getAttribute('aria-current')).toBeNull();
    expect(screen.getByRole('button', { name: 'October 2026' }).className).not.toContain('cal__chip--second');
  });

  it('reaches all six months, so you can search six months out', () => {
    render(<Harness />);
    const seen = new Set<string>();
    for (const m of ['October 2026', 'November 2026', 'December 2026', 'January 2027', 'February 2027', 'March 2027']) {
      fireEvent.click(screen.getByRole('button', { name: m }));
      monthTitles().forEach((t) => seen.add(t!));
    }
    expect(seen.size).toBe(6);
  });
});

describe('each week is a row you click', () => {
  it('describes every week for screen readers, with its dates and state', () => {
    render(<Harness start={{ depart: 2, ret: 4 }} />);
    expect(screen.getByRole('button', { name: 'Week 43, Mon Oct 19 to Sun Oct 25. Leave week.' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Week 45, Mon Nov 2 to Sun Nov 8. Return week.' })).toBeTruthy();
    // week 44 spans Oct and Nov, so it appears in both months that are on screen
    expect(screen.getAllByRole('button', { name: 'Week 44, Mon Oct 26 to Sun Nov 1. Between your leave and return weeks.' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /^Week 41, .*Oct 5 to Sun Oct 11\.$/ }).length).toBe(1);
  });

  it('rows that are already past cannot be picked', () => {
    render(<Harness />);
    const past = first(/Week 40, Mon Sep 28 to Sun Oct 4\. Not available\./);
    expect(past.disabled).toBe(true);
    expect(first(/Week 41, Mon Oct 5/).disabled).toBe(false); // the first bookable week
  });

  it('shows the day numbers of every row, Monday first', () => {
    render(<Harness />);
    const row = first(/Week 43,/);
    expect(row.textContent).toContain('WK 43');
    expect(Array.from(row.querySelectorAll('.cal__day')).map((d) => d.textContent)).toEqual(['19', '20', '21', '22', '23', '24', '25']);
    expect(Array.from(document.querySelectorAll('.cal__row--head span.cal__days span')).slice(0, 7).map((d) => d.textContent)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
  });
});

describe('picking weeks', () => {
  it('first click leaves, a later click returns, a third starts over', () => {
    const onPick = vi.fn();
    render(<Harness start={{ depart: 2, ret: null }} onPick={onPick} />);
    fireEvent.click(first(/Week 45,/));
    expect(onPick).toHaveBeenLastCalledWith(2, 4); // leave wk 43, return wk 45
    expect(pressed(/Week 45,/)).toEqual(['true']);
    fireEvent.click(first(/Week 47,/));
    expect(onPick).toHaveBeenLastCalledWith(6, null); // a third click is a new leave week
    expect(pressed(/Week 47,/).includes('true')).toBe(true);
    expect(pressed(/Week 45,/)).toEqual(['false', 'false'].slice(0, pressed(/Week 45,/).length));
  });

  it('clicking a week at or before the leave week restarts instead of returning', () => {
    const onPick = vi.fn();
    render(<Harness start={{ depart: 6, ret: null }} onPick={onPick} />); // opens on November
    fireEvent.click(screen.getByRole('button', { name: 'October 2026' }));
    fireEvent.click(first(/Week 43,/));
    expect(onPick).toHaveBeenLastCalledWith(2, null); // earlier than the leave week: a new leave week
    fireEvent.click(first(/Week 43,/)); // clicking the leave week itself
    expect(onPick).toHaveBeenLastCalledWith(2, null);
  });

  it('marks the weeks in between, in both months a week appears in', () => {
    render(<Harness start={{ depart: 2, ret: 6 }} />);
    const between = screen.getAllByRole('button', { name: /Between your leave and return weeks/ });
    expect(between.length).toBeGreaterThanOrEqual(3); // weeks 44, 45, 46 (week 44 shows in Oct and Nov)
    expect(between.every((b) => b.className.includes('cal__week--range'))).toBe(true);
  });

  it('a week that spans two months is the same week in both', () => {
    const onPick = vi.fn();
    render(<Harness start={{ depart: 2, ret: null }} onPick={onPick} />);
    const wk44 = week(/Week 44,/);
    expect(wk44).toHaveLength(2); // Oct 26 - Nov 1 shows in October and in November
    fireEvent.click(wk44[1]);
    expect(onPick).toHaveBeenLastCalledWith(2, 3);
    expect(pressed(/Week 44,/)).toEqual(['true', 'true']);
  });

  it('a return can be at most 12 weeks after the leave week', () => {
    render(<Harness start={{ depart: 2, ret: null }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
    fireEvent.click(screen.getByRole('button', { name: 'January 2027' }));
    const wk55 = first(/Week 2, Mon Jan 11 to Sun Jan 17/); // 12 weeks after week 43 (which is index 2 -> 14)
    const wk3 = first(/Week 3, Mon Jan 18 to Sun Jan 24/); // 13 weeks after
    expect(wk55.disabled).toBe(false);
    expect(wk3.disabled).toBe(true);
    expect(wk3.getAttribute('aria-label')).toContain('More than 12 weeks after your leave week');
  });

  it('the 12-week limit applies only while you are choosing a return', () => {
    render(<Harness start={{ depart: 2, ret: 5 }} />);
    fireEvent.click(screen.getByRole('button', { name: 'January 2027' }));
    expect(first(/Week 3, Mon Jan 18/).disabled).toBe(false); // a trip is set: you can start a new one anywhere
  });

  it('one way: every click picks the leave week and nothing is ever a return', () => {
    const onPick = vi.fn();
    render(<Harness single start={{ depart: 2, ret: null }} onPick={onPick} />);
    fireEvent.click(first(/Week 47,/));
    expect(onPick).toHaveBeenLastCalledWith(6, null);
    fireEvent.click(first(/Week 41, Mon Oct 5/));
    expect(onPick).toHaveBeenLastCalledWith(0, null); // an earlier week works too
    expect(screen.queryAllByRole('button', { name: /Return week/ })).toHaveLength(0);
  });

  it('one way: nothing is disabled for being too far from the leave week', () => {
    render(<Harness single start={{ depart: 2, ret: null }} />);
    fireEvent.click(screen.getByRole('button', { name: 'March 2027' }));
    expect(first(/Week 12, Mon Mar 22/).disabled).toBe(false);
  });

  it('is fully locked when disabled (the signed-out preview)', () => {
    const onPick = vi.fn();
    render(<Harness disabled onPick={onPick} />);
    for (const b of screen.getAllByRole('button', { name: /^Week / })) expect((b as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(first(/Week 45,/));
    expect(onPick).not.toHaveBeenCalled();
  });
});

describe('prices', () => {
  const fares: WeekFare[] = [{ isoWeek: 43, lowest: 489 }, { isoWeek: 45, lowest: 612 }];

  it('shows "from $X" on weeks that have a fare, but not on the leave or return week labels', () => {
    render(<Harness fares={fares} start={{ depart: 3, ret: null }} />);
    expect(first(/Week 43,/).textContent).toContain('from $489');
    expect(first(/Week 45,/).textContent).toContain('from $612');
    expect(first(/Week 46,/).textContent).not.toContain('$');
  });

  it('shows a dash while loading, only for weeks you can search, and nothing once loaded with no prices', () => {
    const { rerender } = render(<Harness loading />);
    expect(first(/Week 45,/).textContent).toContain('…');
    expect(first(/Week 40,/).textContent).not.toContain('…'); // a past week has nothing to load
    rerender(<Harness />);
    expect(first(/Week 45,/).textContent).not.toContain('…');
  });
});
