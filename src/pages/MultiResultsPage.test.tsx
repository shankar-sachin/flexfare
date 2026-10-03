// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { City, CuratedRoute, CurationResult, SearchQuery } from '../shared/types';
import { parseIsoWeek } from '../shared/weeks';

vi.mock('../lib/AuthContext', () => ({ useAuth: () => ({ user: { uid: 'u' }, loading: false, emailVerified: true, phoneOnFile: true, signOut: vi.fn() }) }));
const curate = vi.fn();
vi.mock('../lib/api', () => {
  class ApiError extends Error {
    constructor(public code: string, message: string) {
      super(message);
    }
  }
  return { ApiError, curateRoutes: (q: unknown) => curate(q), useQuota: () => null, getMe: () => Promise.resolve() };
});
const { MultiResultsPage } = await import('./MultiResultsPage');
const { ApiError } = await import('../lib/api');

const city = (code: string, name: string): City => ({ code, name, airports: [code] });
const w = (s: string) => parseIsoWeek(s)!;
const query: SearchQuery = {
  trip: 'multi', returnWeek: null, travelers: 2, cabin: 'economy', stay: 'range', priority: 'balance', depth: 'regular',
  from: city('SFO', 'San Francisco'), to: city('LIS', 'Lisbon'), departWeek: w('2026-W43'),
  extraLegs: [{ from: city('LIS', 'Lisbon'), to: city('PAR', 'Paris'), week: w('2026-W45') }],
};
const route = (id: string, price: number, over: Partial<CuratedRoute> = {}): CuratedRoute => ({
  id, fit: 90, price, totalMinutes: 600, carrier: 'United', fromAirport: 'SFO', toAirport: 'LIS', via: 'nonstop', outDate: '2026-10-20', backDate: null,
  duration: '10h 00m', nights: 0, why: `Why ${id}`, reasons: ['r'], scores: [], outbound: { date: '2026-10-20', totalDuration: '10h', segments: [], layovers: [] }, inbound: null,
  outDayFares: [], backDayFares: [], links: { googleFlights: '#', skyscanner: '#' }, ...over,
});
const result = (routes: CuratedRoute[], over: Partial<CurationResult> = {}): CurationResult => ({
  headline: 'h', summary: 's', combosChecked: 3, weekFares: [], routes, ...over,
});
const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((a, b) => ((resolve = a), (reject = b)));
  return { promise, resolve, reject };
};
const setup = () => render(<MemoryRouter><MultiResultsPage query={query} /></MemoryRouter>);

beforeEach(() => curate.mockReset());
afterEach(cleanup);

describe('MultiResultsPage', () => {
  it('searches one flight at a time, in order, as one-way searches', async () => {
    const first = deferred<CurationResult>();
    const second = deferred<CurationResult>();
    curate.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    setup();
    await waitFor(() => expect(curate).toHaveBeenCalledTimes(1)); // the second flight waits
    expect(screen.getByText('Searching flight 1 of 2…')).toBeTruthy();
    const q1 = curate.mock.calls[0][0] as SearchQuery;
    expect(q1).toMatchObject({ trip: 'oneway', returnWeek: null, travelers: 2 });
    expect(q1.from.code + q1.to.code).toBe('SFOLIS');
    await act(async () => first.resolve(result([route('a', 600)])));
    await waitFor(() => expect(curate).toHaveBeenCalledTimes(2));
    expect(screen.getByText('Searching flight 2 of 2…')).toBeTruthy();
    expect((curate.mock.calls[1][0] as SearchQuery).from.code).toBe('LIS');
    await act(async () => second.resolve(result([route('b', 500)])));
  });

  it("shows each flight's options, linking to its own one-way route page", async () => {
    curate.mockResolvedValueOnce(result([route('a', 600)])).mockResolvedValueOnce(result([route('b', 500)]));
    setup();
    const flight1 = await screen.findByRole('heading', { name: 'San Francisco to Lisbon' });
    const flight2 = await screen.findByRole('heading', { name: 'Lisbon to Paris' });
    expect(flight1).toBeTruthy();
    expect(flight2).toBeTruthy();
    await screen.findByText('Why b');
    const links = screen.getAllByRole('link', { name: /View route/ });
    expect(links.map((l) => l.getAttribute('href'))).toEqual([
      expect.stringMatching(/^\/route\/a\?trip=oneway&from=SFO&to=LIS&out=2026-W43/),
      expect.stringMatching(/^\/route\/b\?trip=oneway&from=LIS&to=PAR&out=2026-W45/),
    ]);
    expect(links[0].getAttribute('href')).not.toContain('back=');
  });

  it('adds up the cheapest combination and the top picks, once every flight has options', async () => {
    curate
      .mockResolvedValueOnce(result([route('a1', 700, { fit: 95 }), route('a2', 600, { fit: 80 })]))
      .mockResolvedValueOnce(result([route('b1', 520, { fit: 90 }), route('b2', 480, { fit: 70 })]));
    setup();
    expect(await screen.findByText('$1,080 for the cheapest combination')).toBeTruthy(); // 600 + 480
    expect(screen.getByText(/Our top pick for each flight comes to \$1,220/)).toBeTruthy(); // 700 + 520
    expect(screen.getByText(/separate one-way tickets/)).toBeTruthy();
  });

  it('says so when the cheapest flights are also the top picks', async () => {
    curate.mockResolvedValueOnce(result([route('a', 600)])).mockResolvedValueOnce(result([route('b', 500)]));
    setup();
    expect(await screen.findByText('$1,100 for the cheapest combination')).toBeTruthy();
    expect(screen.getByText(/also our top pick for every flight/)).toBeTruthy();
  });

  it('keeps going after one flight fails, and shows no total', async () => {
    curate.mockRejectedValueOnce(new Error('Fare data is down')).mockResolvedValueOnce(result([route('b', 500)]));
    setup();
    expect(await screen.findByText('Fare data is down')).toBeTruthy();
    expect(await screen.findByText('Why b')).toBeTruthy();
    expect(screen.queryByText(/for the cheapest combination/)).toBeNull();
    expect(screen.getByText('Some flights need another look')).toBeTruthy();
  });

  it('stops searching when the daily searches run out, and says the rest were not searched', async () => {
    curate.mockRejectedValueOnce(new ApiError('QUOTA_EXCEEDED', "You've used all 4 regular searches for today."));
    setup();
    const reasons = await screen.findAllByText(/You've used all 4 regular searches/);
    expect(reasons).toHaveLength(2); // flight 1 failed with it, flight 2 was skipped because of it
    expect(screen.getByText("Couldn't search this flight.")).toBeTruthy();
    expect(screen.getByText('Not searched.')).toBeTruthy();
    expect(curate).toHaveBeenCalledTimes(1); // the second flight was never requested
  });

  it('says so when a flight has no fares', async () => {
    curate.mockResolvedValueOnce(result([])).mockResolvedValueOnce(result([route('b', 500)]));
    setup();
    expect(await screen.findByText(/No fares found for this flight and week/)).toBeTruthy();
    expect(screen.queryByText(/for the cheapest combination/)).toBeNull();
  });

  it('labels simulated fares as sample data', async () => {
    curate.mockResolvedValue(result([route('a', 600)], { sample: true }));
    setup();
    expect(await screen.findByText(/Sample data\./)).toBeTruthy();
  });

  it('names the whole trip in the header', async () => {
    curate.mockResolvedValue(result([route('a', 600)]));
    setup();
    const header = await screen.findByText(/2 flights · 2 adults/);
    expect(header.textContent).toContain('economy'); // shown capitalised by CSS
    const bar = header.closest('.container')!;
    for (const name of ['San Francisco', 'Lisbon', 'Paris']) expect(within(bar as HTMLElement).getAllByText(new RegExp(name)).length).toBeGreaterThan(0);
  });
});
