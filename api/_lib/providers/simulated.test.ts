import { describe, expect, it } from 'vitest';
import { parseIsoWeek } from '../../../src/shared/weeks';
import { simulatedProvider } from './simulated';
import type { NormalizedQuery } from './types';

const q: NormalizedQuery = {
  from: 'SFO', to: 'LIS', departWeek: parseIsoWeek('2026-W43')!, returnWeek: parseIsoWeek('2026-W45')!, travelers: 1, cabin: 'economy',
};

describe('simulated provider', () => {
  it('is deterministic and flagged as sample', async () => {
    const a = await simulatedProvider.searchWeeks(q);
    const b = await simulatedProvider.searchWeeks(q);
    expect(a.sample).toBe(true);
    expect(a.candidates.map((c) => [c.id, c.price])).toEqual(b.candidates.map((c) => [c.id, c.price]));
  });

  it('only returns dates inside the chosen weeks, and includes nearby arrivals', async () => {
    const r = await simulatedProvider.searchWeeks(q);
    expect(r.grid).toHaveLength(49);
    for (const c of r.candidates) {
      expect(c.outDate >= q.departWeek.start && c.outDate <= q.departWeek.end).toBe(true);
      expect(c.backDate! >= q.returnWeek!.start && c.backDate! <= q.returnWeek!.end).toBe(true);
    }
    expect(r.candidates.some((c) => c.destAirport === 'OPO' && c.isNearby)).toBe(true);
  });
});
