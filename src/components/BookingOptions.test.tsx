// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { buildBookingOptions } from '../shared/booking';
import { BookingOptions } from './BookingOptions';

afterEach(cleanup);
const trip = { from: 'SFO', to: 'LIS', outDate: '2026-10-20', backDate: '2026-11-03', travelers: 1, cabin: 'economy' as const };

describe('BookingOptions', () => {
  it('shows "Booking options", the airline group first marked recommended, then the search sites', () => {
    const options = buildBookingOptions({ ...trip, carriers: [{ code: 'UA', name: 'United' }] });
    render(<BookingOptions options={options} />);
    expect(screen.getByRole('heading', { name: 'Booking options' })).toBeTruthy();
    expect(screen.getByText('Directly by airline (recommended)')).toBeTruthy();
    expect(screen.getByText('Recommended')).toBeTruthy();
    const links = screen.getAllByRole('link').map((a) => a.textContent);
    expect(links[0]).toContain('United Airlines');
    for (const name of ['Google Flights', 'Skyscanner', 'Expedia', 'Kayak']) expect(links.some((t) => t?.includes(name))).toBe(true);
  });

  it('opens every link in a new tab without leaking the opener', () => {
    render(<BookingOptions options={buildBookingOptions({ ...trip, carriers: [{ code: 'UA', name: 'United' }] })} />);
    for (const a of screen.getAllByRole('link')) {
      expect(a.getAttribute('target')).toBe('_blank');
      expect(a.getAttribute('rel')).toContain('noopener');
    }
  });

  it('shows what to type for an airline that cannot be pre-filled', () => {
    render(<BookingOptions options={buildBookingOptions({ ...trip, carriers: [{ code: 'TP', name: 'TAP Air Portugal' }] })} />);
    expect(screen.getByText(/can't be pre-filled, so enter: SFO to LIS/)).toBeTruthy();
  });

  it('without an airline, skips that group and just lists where to book', () => {
    render(<BookingOptions options={buildBookingOptions(trip)} />);
    expect(screen.queryByText('Directly by airline (recommended)')).toBeNull();
    expect(screen.getByText('Where to book')).toBeTruthy();
  });

  it('in the demo it only invites you to sign up', () => {
    render(<BookingOptions options={[]} demo />);
    expect(screen.getByRole('link', { name: /Sign up free/ }).getAttribute('href')).toBe('/signup');
    expect(screen.queryByText('Kayak')).toBeNull();
  });
});
