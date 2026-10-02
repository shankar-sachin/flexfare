// Curated "land somewhere else and take ground transport" options. Small on purpose:
// each entry must be a real, easy connection, otherwise the AI would be recommending noise.
export interface NearbyAirport {
  airport: string;
  city: string;
  transfer: string; // "2h 50m train"
  minutes: number;
}

export const NEARBY: Record<string, NearbyAirport[]> = {
  LIS: [{ airport: 'OPO', city: 'Porto', transfer: '2h 50m train', minutes: 170 }],
  VCE: [{ airport: 'TSF', city: 'Treviso', transfer: '40m bus', minutes: 40 }],
  BCN: [{ airport: 'GRO', city: 'Girona', transfer: '1h 20m bus', minutes: 80 }],
  NYC: [{ airport: 'PHL', city: 'Philadelphia', transfer: '1h 15m train', minutes: 75 }],
};

export const nearbyFor = (cityCode: string): NearbyAirport[] => NEARBY[cityCode] ?? [];
