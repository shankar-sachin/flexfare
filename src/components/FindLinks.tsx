import type { FindLinks as Links } from '../shared/types';
import { ArrowUpRight } from './Icons';

/** "Find this flight" buttons. flexfare doesn't sell tickets, it points to where you can. */
export function FindLinks({ links, demo }: { links: Links; demo?: boolean }) {
  if (demo) {
    return <a href="/signup" className="btn btn--signal" style={{ fontSize: 17, padding: 16 }}>Sign up free to find this flight</a>;
  }
  const ext = { target: '_blank', rel: 'noopener noreferrer' } as const;
  return (
    <div className="stack" style={{ gap: 10 }}>
      <a href={links.googleFlights} {...ext} className="btn btn--signal" style={{ fontSize: 17, padding: 16 }}>
        Find on Google Flights <ArrowUpRight />
      </a>
      <div className="row" style={{ gap: 10 }}>
        <a href={links.skyscanner} {...ext} className="btn btn--ghost-dark" style={{ flex: 1 }}>Skyscanner</a>
        {links.aviasales && <a href={links.aviasales} {...ext} className="btn btn--ghost-dark" style={{ flex: 1 }}>Aviasales</a>}
      </div>
    </div>
  );
}
