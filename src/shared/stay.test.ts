import { describe, expect, it } from 'vitest';
import { describeNights, formatNights, parseNights, stayProblem, stayRange, stayScore } from './stay';

describe('stayScore', () => {
  it('keeps the existing 10-16 night and about-two-weeks scoring', () => {
    expect(stayScore('range', 10)).toBe(100);
    expect(stayScore('range', 16)).toBe(100);
    expect(stayScore('range', 8)).toBe(84);
    expect(stayScore('about-two-weeks', 14)).toBe(100);
    expect(stayScore('about-two-weeks', 10)).toBe(72);
    expect(stayScore('cheapest', 3)).toBe(100);
    expect(stayScore('exact', 40)).toBe(100);
  });

  it('1 night: only 1 is perfect and every extra night costs a lot', () => {
    expect([1, 2, 3].map((n) => stayScore('one-night', n))).toEqual([100, 80, 60]);
  });

  it('3 to 4 nights: both are perfect, others fall off quickly', () => {
    expect([2, 3, 4, 5, 7].map((n) => stayScore('short', n))).toEqual([80, 100, 100, 80, 40]);
  });

  it('custom uses the traveler’s own range, and ignores stay when none is given', () => {
    const c = { min: 7, max: 10 };
    expect([5, 7, 8, 10, 13].map((n) => stayScore('custom', n, c))).toEqual([76, 100, 100, 100, 64]);
    expect(stayScore('custom', 3, null)).toBe(100);
  });
});

describe('parseNights / formatNights', () => {
  it('reads one number or a range', () => {
    expect(parseNights('7')).toEqual({ min: 7, max: 7 });
    expect(parseNights('7-10')).toEqual({ min: 7, max: 10 });
    expect(formatNights({ min: 7, max: 7 })).toBe('7');
    expect(formatNights({ min: 7, max: 10 })).toBe('7-10');
  });

  it('rejects zero, too many nights, reversed ranges and junk', () => {
    for (const bad of ['0', '61', '10-7', 'abc', '', '3-', '-3', '1-2-3', null, undefined]) expect(parseNights(bad as string | null | undefined), String(bad)).toBeNull();
  });

  it('describes a range in words', () => {
    expect(describeNights({ min: 1, max: 1 })).toBe('1 night');
    expect(describeNights({ min: 7, max: 7 })).toBe('7 nights');
    expect(describeNights({ min: 3, max: 4 })).toBe('3 to 4 nights');
  });
});

describe('stayRange', () => {
  it('gives the nights each choice asks for, or none', () => {
    expect(stayRange('one-night')).toEqual({ min: 1, max: 1 });
    expect(stayRange('short')).toEqual({ min: 3, max: 4 });
    expect(stayRange('custom', { min: 5, max: 6 })).toEqual({ min: 5, max: 6 });
    expect(stayRange('custom')).toBeNull();
    expect(stayRange('cheapest')).toBeNull();
  });
});

describe('stayProblem: can these weeks give that stay?', () => {
  it('1 night and 3-4 nights fit weeks that are one week apart', () => {
    expect(stayProblem('one-night', null, 1)).toBeNull(); // Sunday out, Monday back
    expect(stayProblem('short', null, 1)).toBeNull();
  });

  it('1 night does not fit weeks two or more apart, and says what to do', () => {
    const p = stayProblem('one-night', null, 2)!;
    expect(p).toContain('1 night');
    expect(p).toContain('closer');
  });

  it('3-4 nights do not fit weeks three apart (15 to 27 nights possible)', () => {
    expect(stayProblem('short', null, 3)).toContain('closer');
  });

  it('a custom stay longer than the weeks allow asks for a later return week', () => {
    expect(stayProblem('custom', { min: 20, max: 25 }, 1)).toContain('further');
    expect(stayProblem('custom', { min: 20, max: 25 }, 3)).toBeNull();
  });

  it('custom needs a number of nights', () => {
    expect(stayProblem('custom', null, 2)).toContain('Enter how many nights');
  });

  it('the looser choices never block a search', () => {
    for (const s of ['cheapest', 'range', 'about-two-weeks', 'exact'] as const) expect(stayProblem(s, null, 12), s).toBeNull();
  });
});
