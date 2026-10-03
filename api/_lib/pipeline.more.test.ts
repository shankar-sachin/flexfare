import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseIsoWeek } from '../../src/shared/weeks';
import { runCuration } from './pipeline';
import type { NormalizedQuery } from './providers/types';

const q: NormalizedQuery = { from: 'SFO', to: 'LIS', departWeek: parseIsoWeek('2026-W43')!, returnWeek: parseIsoWeek('2026-W45')!, travelers: 1, cabin: 'economy' };

describe('more flight options', () => {
  beforeEach(() => {
    process.env.FARE_PROVIDER = 'simulated';
    delete process.env.GROQ_API_KEY; // no AI: picks come from the score ranking
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('shows the picks, then up to 10 more flights ranked by score (15 for a deep search)', async () => {
    const regular = await runCuration(q, { stay: 'range', priority: 'balance', depth: 'regular' });
    const picks = regular.routes.filter((r) => r.tier === 'pick');
    const more = regular.routes.filter((r) => r.tier === 'more');
    expect(picks).toHaveLength(5);
    expect(more.length).toBeGreaterThan(0);
    expect(more.length).toBeLessThanOrEqual(10);
    expect(regular.routes.slice(0, picks.length).every((r) => r.tier === 'pick')).toBe(true); // picks come first

    const deep = await runCuration(q, { stay: 'range', priority: 'balance', depth: 'deep' });
    expect(deep.routes.filter((r) => r.tier === 'more').length).toBeLessThanOrEqual(15);
    expect(deep.routes.length).toBeGreaterThanOrEqual(regular.routes.length);
  });

  it('never lists the same flight twice, and every route is bookable', async () => {
    const r = await runCuration(q, { stay: 'range', priority: 'balance' });
    expect(new Set(r.routes.map((x) => x.id)).size).toBe(r.routes.length);
    for (const route of r.routes) {
      expect(route.booking.length).toBeGreaterThanOrEqual(4);
      expect(route.price).toBeGreaterThan(0);
      expect(route.why.length).toBeGreaterThan(0);
    }
  });

  it('gives each badge to one route at most, and only to a flight that really earns it', async () => {
    const r = await runCuration(q, { stay: 'range', priority: 'balance' });
    const badges = r.routes.flatMap((x) => (x.badge ? [x.badge] : []));
    expect(new Set(badges).size).toBe(badges.length);
    const cheapest = Math.min(...r.routes.map((x) => x.price));
    const lowest = r.routes.find((x) => x.badge === 'Lowest fare');
    if (lowest) expect(lowest.price).toBeLessThanOrEqual(cheapest + 1);
    expect(r.routes.filter((x) => x.tier === 'more').every((x) => x.badge !== 'Best fit')).toBe(true);
  });
});
