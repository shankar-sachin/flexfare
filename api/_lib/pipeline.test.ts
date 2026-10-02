import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseIsoWeek } from '../../src/shared/weeks';
import { runCuration } from './pipeline';
import type { NormalizedQuery } from './providers/types';

const q = (over: Partial<NormalizedQuery> = {}): NormalizedQuery => ({
  from: 'SFO', to: 'LIS', departWeek: parseIsoWeek('2026-W43')!, returnWeek: parseIsoWeek('2026-W45')!, travelers: 1, cabin: 'economy', ...over,
});

describe('runCuration (simulated fares, Groq unavailable)', () => {
  beforeEach(() => {
    process.env.FARE_PROVIDER = 'simulated';
    delete process.env.GROQ_API_KEY;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('falls back to deterministic ranking with real, consistent data', async () => {
    const r = await runCuration(q(), { stay: 'range', priority: 'balance' });
    expect(r.aiFallback).toBe(true);
    expect(r.sample).toBe(true);
    expect(r.routes.length).toBeGreaterThan(0);
    expect(r.routes.length).toBeLessThanOrEqual(5);
    for (const route of r.routes) {
      expect(route.price).toBeGreaterThan(0);
      expect(route.links.googleFlights).toContain('google.com/travel/flights');
      expect(route.outDate >= '2026-10-19' && route.outDate <= '2026-10-25').toBe(true);
      expect(route.inbound).not.toBeNull();
      expect(route.outDayFares.length).toBeGreaterThan(0);
      expect(Math.min(...route.outDayFares.map((d) => d.delta))).toBe(0);
    }
    expect(r.routes.filter((x) => x.badge === 'Best fit')).toHaveLength(1);
    const badges = r.routes.map((x) => x.badge).filter(Boolean);
    expect(new Set(badges).size).toBe(badges.length);
  });

  it('handles one-way searches', async () => {
    const r = await runCuration(q({ returnWeek: null }), { stay: 'cheapest', priority: 'price' });
    expect(r.routes.length).toBeGreaterThan(0);
    expect(r.routes.every((x) => x.backDate === null && x.inbound === null && x.nights === 0)).toBe(true);
  });

  it('uses the AI answer when Groq responds validly', async () => {
    process.env.GROQ_API_KEY = 'k';
    const seen: { ids: string[] } = { ids: [] };
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      const cands = JSON.parse(body.messages[1].content).candidates as { id: string; priceUsd: number }[];
      seen.ids = cands.map((c) => c.id);
      const best = cands[0];
      const out = {
        headline: `Top pick is $${best.priceUsd}.`, summary: 'Checked many combinations.',
        picks: [{ candidateId: best.id, fit: 93, why: `About $${best.priceUsd} per adult.`, reasons: ['Matches your weeks.'], scores: { price: 90, travelTime: 80, connections: 70, weeksFit: 100 } }],
      };
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(out) } }] }), { status: 200 });
    }));
    const r = await runCuration(q(), { stay: 'range', priority: 'balance' });
    vi.unstubAllGlobals();
    expect(r.aiFallback).toBe(false);
    expect(r.routes).toHaveLength(1);
    expect(r.routes[0].id).toBe(seen.ids[0]);
    expect(r.routes[0].fit).toBe(93);
    expect(r.headline).toContain('Top pick');
  });
});
