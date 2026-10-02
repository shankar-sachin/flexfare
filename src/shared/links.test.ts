import { describe, expect, it } from 'vitest';
import { buildLinks } from './links';

describe('buildLinks', () => {
  const base = { from: 'OAK', to: 'LIS', outDate: '2026-10-20', backDate: '2026-11-01', travelers: 2, cabin: 'economy' as const };

  it('builds Google Flights and Skyscanner links for a round trip', () => {
    const l = buildLinks(base);
    expect(decodeURIComponent(l.googleFlights)).toContain('Flights from OAK to LIS on 2026-10-20 through 2026-11-01');
    expect(l.skyscanner).toBe('https://www.skyscanner.com/transport/flights/oak/lis/261020/261101/?adultsv2=2&cabinclass=economy');
    expect(l.aviasales).toBeUndefined();
  });

  it('handles one-way, cabin and the affiliate marker', () => {
    const l = buildLinks({ ...base, backDate: null, cabin: 'business', aviasalesPath: '/search/OAK2010LIS1', marker: 'abc 1' });
    expect(l.skyscanner).toContain('/261020/?');
    expect(l.skyscanner).toContain('cabinclass=business');
    expect(l.aviasales).toBe('https://www.aviasales.com/search/OAK2010LIS1?marker=abc%201');
  });
});
