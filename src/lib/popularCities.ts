import type { City } from '../shared/types';

/** Small built-in list shown while the full city index (cityIndex.ts) is still loading. */
export const POPULAR_CITIES: City[] = [
  { code: 'SFO', name: 'San Francisco', country: 'United States', airports: ['SFO', 'OAK', 'SJC'] },
  { code: 'LAX', name: 'Los Angeles', country: 'United States', airports: ['LAX', 'BUR', 'LGB', 'SNA'] },
  { code: 'NYC', name: 'New York', country: 'United States', airports: ['JFK', 'EWR', 'LGA'] },
  { code: 'CHI', name: 'Chicago', country: 'United States', airports: ['ORD', 'MDW'] },
  { code: 'LIS', name: 'Lisbon', country: 'Portugal', airports: ['LIS'], nearby: [{ airport: 'OPO', city: 'Porto', transfer: '2h 50m train' }] },
  { code: 'LON', name: 'London', country: 'United Kingdom', airports: ['LHR', 'LGW', 'STN', 'LTN', 'LCY'] },
  { code: 'PAR', name: 'Paris', country: 'France', airports: ['CDG', 'ORY'] },
  { code: 'TYO', name: 'Tokyo', country: 'Japan', airports: ['HND', 'NRT'] },
  { code: 'MEX', name: 'Mexico City', country: 'Mexico', airports: ['MEX', 'NLU'] },
];
