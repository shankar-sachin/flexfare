// Where users go to find or book a flight. flexfare doesn't sell tickets.
import type { FindLinks } from './types';

interface LinkArgs {
  from: string; // airport or city code
  to: string;
  outDate: string; // YYYY-MM-DD
  backDate: string | null;
  travelers: number;
  cabin: 'economy' | 'premium' | 'business';
  aviasalesPath?: string; // "/search/..." from the fare API
  marker?: string;
}

const yymmdd = (iso: string) => iso.replaceAll('-', '').slice(2);

export function buildLinks(a: LinkArgs): FindLinks {
  const cabinWord = a.cabin === 'economy' ? '' : ` ${a.cabin} class`;
  const text = a.backDate
    ? `Flights from ${a.from} to ${a.to} on ${a.outDate} through ${a.backDate}${cabinWord}`
    : `Flights from ${a.from} to ${a.to} on ${a.outDate}${cabinWord}`;
  const sky = new URLSearchParams({
    adultsv2: String(a.travelers),
    cabinclass: a.cabin === 'premium' ? 'premiumeconomy' : a.cabin,
  });
  const dates = a.backDate ? `${yymmdd(a.outDate)}/${yymmdd(a.backDate)}` : yymmdd(a.outDate);
  const links: FindLinks = {
    googleFlights: `https://www.google.com/travel/flights?q=${encodeURIComponent(text)}`,
    skyscanner: `https://www.skyscanner.com/transport/flights/${a.from.toLowerCase()}/${a.to.toLowerCase()}/${dates}/?${sky}`,
  };
  if (a.aviasalesPath) {
    const sep = a.aviasalesPath.includes('?') ? '&' : '?';
    links.aviasales = `https://www.aviasales.com${a.aviasalesPath}${a.marker ? `${sep}marker=${encodeURIComponent(a.marker)}` : ''}`;
  }
  return links;
}
