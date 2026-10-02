import { describe, expect, it } from 'vitest';
import { formatIsoWeek, isoWeekNumber, parseIsoWeek, timeAgo, upcomingWeeks, weeksBetween } from './weeks';

describe('iso weeks', () => {
  it('round-trips parse and format', () => {
    const w = parseIsoWeek('2026-W43')!;
    expect(w.start).toBe('2026-10-19');
    expect(w.end).toBe('2026-10-25');
    expect(formatIsoWeek(w)).toBe('2026-W43');
  });

  it('handles week 53 and the year boundary', () => {
    expect(parseIsoWeek('2026-W53')?.start).toBe('2026-12-28');
    expect(isoWeekNumber(new Date('2027-01-01T00:00:00Z'))).toEqual({ week: 53, year: 2026 });
    expect(parseIsoWeek('2027-W01')?.start).toBe('2027-01-04');
  });

  it('rejects weeks that do not exist or are malformed', () => {
    expect(parseIsoWeek('2025-W53')).toBeNull();
    expect(parseIsoWeek('2026-W00')).toBeNull();
    expect(parseIsoWeek('2026-43')).toBeNull();
    expect(parseIsoWeek('')).toBeNull();
  });

  it('upcomingWeeks starts next Monday and is evenly spaced', () => {
    const weeks = upcomingWeeks(4, new Date('2026-10-01T12:00:00Z')); // a Thursday
    expect(weeks[0].start).toBe('2026-10-05');
    expect(weeksBetween(weeks[0], weeks[3])).toBe(3);
  });

  it('describes how old a fare is', () => {
    const now = Date.parse('2026-10-01T12:00:00Z');
    expect(timeAgo('2026-10-01T11:59:30Z', now)).toBe('just now');
    expect(timeAgo('2026-10-01T09:00:00Z', now)).toBe('3h ago');
  });
});
