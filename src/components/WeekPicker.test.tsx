// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { upcomingWeeks } from '../shared/weeks';
import { WeekPicker } from './WeekPicker';

afterEach(cleanup);
const weeks = upcomingWeeks(6, new Date('2026-10-01T12:00:00Z'));
const fares = weeks.map((w, i) => ({ isoWeek: w.isoWeek, lowest: 400 + i * 50 }));
const tap = (i: number) => fireEvent.click(screen.getAllByRole('button')[i]);

describe('WeekPicker', () => {
  it('first tap sets leave week, a later tap sets the return week', () => {
    const onChange = vi.fn();
    render(<WeekPicker weeks={weeks} fares={fares} depart={1} ret={null} onChange={onChange} />);
    tap(4);
    expect(onChange).toHaveBeenCalledWith(1, 4);
  });

  it('tapping an earlier week, or tapping when a range is set, starts a new range', () => {
    const onChange = vi.fn();
    const { rerender } = render(<WeekPicker weeks={weeks} fares={fares} depart={3} ret={null} onChange={onChange} />);
    tap(1);
    expect(onChange).toHaveBeenLastCalledWith(1, null);
    rerender(<WeekPicker weeks={weeks} fares={fares} depart={1} ret={3} onChange={onChange} />);
    tap(5);
    expect(onChange).toHaveBeenLastCalledWith(5, null);
  });

  it('shows the lowest week and copes with no fare data', () => {
    const { rerender } = render(<WeekPicker weeks={weeks} fares={fares} depart={2} ret={null} onChange={() => undefined} />);
    expect(screen.getByText('Lowest')).toBeTruthy();
    rerender(<WeekPicker weeks={weeks} fares={[]} depart={2} ret={null} onChange={() => undefined} />);
    expect(screen.queryByText('Lowest')).toBeNull();
    expect(screen.getAllByText('…').length).toBe(weeks.length);
  });

  it('is inert when disabled', () => {
    const onChange = vi.fn();
    render(<WeekPicker weeks={weeks} fares={fares} depart={1} ret={null} onChange={onChange} disabled />);
    tap(3);
    expect(onChange).not.toHaveBeenCalled();
  });
});
