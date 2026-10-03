import { afterEach, describe, expect, it, vi } from 'vitest';
import { METRO } from '../../src/shared/metro';

afterEach(() => vi.unstubAllGlobals());

describe('METRO', () => {
  it('lists real three-letter airport codes with no repeats inside a city', () => {
    for (const [city, list] of Object.entries(METRO)) {
      expect(city).toMatch(/^[A-Z]{3}$/);
      expect(list.length).toBeGreaterThan(0);
      expect(new Set(list).size).toBe(list.length);
      for (const a of list) expect(a).toMatch(/^[A-Z]{3}$/);
    }
  });

  it('covers the Bay Area, which the public airport data splits into three separate cities', () => {
    expect(METRO.SFO).toEqual(['SFO', 'OAK', 'SJC']);
  });
});

describe('airportsFor', () => {
  it('uses the metro list without any network call, so San Francisco searches SFO, OAK and SJC', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    const { airportsFor } = await import('./airports');
    expect(await airportsFor('SFO')).toEqual(['SFO', 'OAK', 'SJC']);
    expect(await airportsFor('CHI')).toEqual(['ORD', 'MDW']); // not the small fields the raw data adds
    expect(f).not.toHaveBeenCalled();
  });

  it('falls back to the airport list for other cities, and to the code itself when unknown or offline', async () => {
    vi.resetModules();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([
      { code: 'LIS', city_code: 'LIS', flightable: true, iata_type: 'airport' },
      { code: 'XYZ', city_code: 'ABC', flightable: true, iata_type: 'airport' },
      { code: 'QQQ', city_code: 'ABC', flightable: true, iata_type: 'airport' },
      { code: 'ZZZ', city_code: 'ABC', flightable: false, iata_type: 'airport' },
    ]), { status: 200 })));
    const { airportsFor } = await import('./airports');
    expect(await airportsFor('LIS')).toEqual(['LIS']);
    expect(await airportsFor('ABC')).toEqual(['XYZ', 'QQQ']); // not-flightable airports are skipped
    expect(await airportsFor('NOP')).toEqual(['NOP']);

    vi.resetModules();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    const offline = await import('./airports');
    expect(await offline.airportsFor('ABC')).toEqual(['ABC']);
  });
});
