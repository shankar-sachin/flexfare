import { describe, expect, it } from 'vitest';
import rows from '../data/cities.json';
import { buildCityIndex, normalize, type CityRow } from './cityIndex';

const region = new Intl.DisplayNames(['en'], { type: 'region' });
const index = buildCityIndex(rows as CityRow[], (cc) => region.of(cc) ?? cc);
const names = (q: string, n = 8) => index.search(q, n).map((c) => c.name);
const codes = (q: string, n = 8) => index.search(q, n).map((c) => c.code);

describe('city data', () => {
  it('has thousands of cities, every one with an airport', () => {
    expect(index.size).toBeGreaterThan(3000);
    for (const [code, name, cc, ...airports] of rows as CityRow[]) {
      expect(code).toMatch(/^[A-Z]{3}$/);
      expect(name.length).toBeGreaterThan(0);
      expect(cc).toMatch(/^[A-Z]{2}$/);
      expect(airports.length).toBeGreaterThan(0);
    }
  });
});

describe('typing one letter at a time', () => {
  it('answers from the very first letter, with well-known cities first', () => {
    expect(names('s').slice(0, 3).length).toBe(3);
    expect(names('s')).toContain('Seattle');
    expect(names('l')[0]).toMatch(/^L/);
    expect(codes('l')).toContain('LON');
  });

  it('narrows as you type "san francisco"', () => {
    const steps = ['s', 'sa', 'san', 'san ', 'san f', 'san fr', 'san francisco'].map((q) => codes(q));
    expect(steps[0].length).toBeGreaterThan(0);
    expect(steps[1].length).toBeGreaterThan(0);
    expect(steps[4][0]).toBe('SFO'); // "san f"
    expect(steps[5][0]).toBe('SFO');
    expect(steps[6][0]).toBe('SFO');
  });

  it('every step of "lisbon" and "tokyo" gives an answer, ending on the right city', () => {
    for (const word of ['lisbon', 'tokyo', 'new york', 'london', 'paris', 'los angeles']) {
      for (let i = 1; i <= word.length; i++) expect(index.search(word.slice(0, i)).length, word.slice(0, i)).toBeGreaterThan(0);
    }
    expect(codes('lisbon')[0]).toBe('LIS');
    expect(codes('tokyo')[0]).toBe('TYO');
    expect(codes('new york')[0]).toBe('NYC');
    expect(codes('london')[0]).toBe('LON');
    expect(codes('paris')[0]).toBe('PAR');
    expect(codes('los a')[0]).toBe('LAX');
  });
});

describe('what it understands', () => {
  it('city and airport codes', () => {
    expect(codes('sfo')[0]).toBe('SFO');
    expect(codes('oak')[0]).toBe('SFO'); // Oakland airport -> the San Francisco area
    expect(codes('jfk')[0]).toBe('NYC');
    expect(codes('lhr')[0]).toBe('LON');
    expect(codes('nrt')[0]).toBe('TYO');
    expect(codes('lis')[0]).toBe('LIS');
  });

  it('any word of the name, not just the start', () => {
    expect(codes('francisco')).toContain('SFO');
    expect(codes('angeles')).toContain('LAX');
    expect(codes('york')).toContain('NYC');
  });

  it('ignores accents, case, punctuation and extra spaces', () => {
    expect(normalize('  São  Paulo ')).toBe('sao paulo');
    expect(codes('SAO PAULO')[0]).toBe('SAO');
    expect(codes('sao')).toContain('SAO');
    expect(codes('st. louis')).toContain('STL');
    expect(codes('  lisbon ')[0]).toBe('LIS');
  });

  it('a country finds its cities, the best known first', () => {
    const portugal = index.search('portugal', 5);
    expect(portugal.length).toBeGreaterThan(2);
    expect(portugal[0].code).toBe('LIS');
    expect(portugal.every((c) => c.country === 'Portugal')).toBe(true);
    expect(codes('japan')).toContain('TYO');
  });

  it('returns nothing for gibberish, and everything is capped at the limit', () => {
    expect(index.search('qqqzzzxxx')).toEqual([]);
    expect(index.search('a', 5).length).toBe(5);
    expect(index.search('a', 3).length).toBe(3);
  });
});

describe('the cities it returns', () => {
  it('expand to the real passenger airports of the metro area', () => {
    expect(index.byCode('SFO')!.airports).toEqual(['SFO', 'OAK', 'SJC']);
    expect(index.byCode('NYC')!.airports).toEqual(['JFK', 'EWR', 'LGA']);
    expect(index.byCode('CHI')!.airports).toEqual(['ORD', 'MDW']); // not the small fields around Chicago
    expect(index.byCode('LON')!.airports).toContain('LHR');
    expect(index.byCode('lis')!.airports).toEqual(['LIS']); // case-insensitive lookup
  });

  it('carry nearby arrivals, a country name and a code', () => {
    const lisbon = index.byCode('LIS')!;
    expect(lisbon.country).toBe('Portugal');
    expect(lisbon.nearby).toEqual([{ airport: 'OPO', city: 'Porto', transfer: '2h 50m train' }]);
    expect(index.byCode('XXX')).toBeUndefined();
  });

  it('start with the popular cities when nothing is typed', () => {
    const first = codes('', 6);
    expect(first).toEqual(['NYC', 'LON', 'PAR', 'TYO', 'LAX', 'SFO']);
  });

  it('are fast enough to run on every keystroke', () => {
    const t0 = performance.now();
    for (let i = 0; i < 100; i++) index.search('san fran');
    expect((performance.now() - t0) / 100).toBeLessThan(15); // ms per search, generous for slow CI machines
  });
});
