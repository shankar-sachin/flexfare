import { serpApiProvider } from './serpapi.js';
import { simulatedProvider } from './simulated.js';
import { travelpayoutsProvider } from './travelpayouts.js';
import type { FareProvider } from './types.js';

export function getProvider(): FareProvider {
  switch (process.env.FARE_PROVIDER) {
    case 'serpapi':
      return serpApiProvider;
    case 'travelpayouts':
      return travelpayoutsProvider;
    default:
      return simulatedProvider;
  }
}
