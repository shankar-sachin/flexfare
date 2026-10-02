import { simulatedProvider } from './simulated.js';
import { travelpayoutsProvider } from './travelpayouts.js';
import type { FareProvider } from './types.js';

export function getProvider(): FareProvider {
  return process.env.FARE_PROVIDER === 'travelpayouts' ? travelpayoutsProvider : simulatedProvider;
}
