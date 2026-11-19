// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildBookingOptions } from '../shared/booking';
import type { BookLookup, BookRef } from '../shared/types';
import { ApiError } from '../lib/api';
import { BookingOptions } from './BookingOptions';

afterEach(cleanup);
const options = buildBookingOptions({ from: 'SEA', to: 'HND', outDate: '2026-12-30', backDate: '2027-01-06', travelers: 1, cabin: 'economy', carriers: [{ code: 'DL', name: 'Delta' }] });
const book: BookRef = { kind: 'departure', token: 'tok-1234567890', dep: 'SEA', arr: 'HND', out: '2026-12-30', back: '2027-01-06', cabin: 'economy', sig: 'a'.repeat(64) };
const result: BookLookup = {
  returnFlight: 'DL 198 HND to HNL 21:00',
  choices: [{ seller: 'Delta', price: 1351, url: 'https://www.google.com/travel/clk/f', postData: 'u=AAcRjHJ2%2BNW-abc&x=1' }],
};

describe('BookingOptions: book directly', () => {
  it('shows nothing extra when there is no booking reference, so the usual links are all there is', () => {
    render(<BookingOptions options={options} />);
    expect(screen.queryByRole('button', { name: /live fare/i })).toBeNull();
    expect(screen.getAllByRole('link').length).toBeGreaterThan(0);
  });

  it('looks the fare up only when asked, then offers a form per seller that posts to the click-out in a new tab', async () => {
    const lookup = vi.fn(async () => result);
    const { container } = render(<BookingOptions options={options} book={book} lookup={lookup} />);
    expect(lookup).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /check the live fare/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /book with delta · \$1351/i })).toBeTruthy());
    expect(lookup).toHaveBeenCalledWith(book);
    const form = container.querySelector('form')!;
    expect(form.getAttribute('method')).toBe('post');
    expect(form.getAttribute('action')).toBe('https://www.google.com/travel/clk/f');
    expect(form.getAttribute('target')).toBe('_blank');
    expect(form.getAttribute('rel')).toContain('noopener');
    const fields = [...form.querySelectorAll('input[type=hidden]')].map((i) => [i.getAttribute('name'), (i as HTMLInputElement).value]);
    expect(fields).toEqual([['u', 'AAcRjHJ2+NW-abc'], ['x', '1']]); // the post data, decoded once; the browser encodes it again
    expect(screen.getByText(/return flight DL 198 HND to HNL 21:00/)).toBeTruthy();
  });

  it('explains a failed lookup and leaves the other booking links in place', async () => {
    const lookup = vi.fn(async () => {
      throw new ApiError('EXPIRED', 'That fare is no longer available. Use the links below.', 404);
    });
    render(<BookingOptions options={options} book={book} lookup={lookup} />);
    fireEvent.click(screen.getByRole('button', { name: /check the live fare/i }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('no longer available'));
    expect(screen.getAllByRole('link').some((a) => a.textContent?.includes('Delta'))).toBe(true);
  });

  it('shows no direct booking in the signed-out demo', () => {
    render(<BookingOptions options={options} book={book} demo />);
    expect(screen.queryByRole('button', { name: /live fare/i })).toBeNull();
  });
});
