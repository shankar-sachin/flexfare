import type { BookingOption } from '../shared/types';
import { ArrowUpRight } from './Icons';

/**
 * Where to book this trip. The airline itself comes first and is recommended; the comparison sites follow.
 * flexfare doesn't sell tickets, so each link opens the seller's own site in a new tab.
 */
export function BookingOptions({ options, demo }: { options: BookingOption[]; demo?: boolean }) {
  if (demo) {
    return (
      <div className="stack" style={{ gap: 10 }}>
        <h3 className="booking__title">Booking options</h3>
        <a href="/signup" className="btn btn--signal" style={{ fontSize: 17, padding: 16 }}>Sign up free to see where to book</a>
      </div>
    );
  }
  const airlines = options.filter((o) => o.kind === 'airline');
  const sites = options.filter((o) => o.kind === 'site');
  return (
    <div className="stack booking" style={{ gap: 14 }}>
      <h3 className="booking__title">Booking options</h3>
      {airlines.length > 0 && (
        <section className="stack" style={{ gap: 8 }} aria-label="Directly by airline">
          <h4 className="booking__group">Directly by airline (recommended)</h4>
          {airlines.map((o) => (
            <Row key={o.id} o={o} />
          ))}
        </section>
      )}
      <section className="stack" style={{ gap: 8 }} aria-label="Search sites">
        <h4 className="booking__group">{airlines.length > 0 ? 'Or compare on a search site' : 'Where to book'}</h4>
        {sites.map((o) => (
          <Row key={o.id} o={o} />
        ))}
      </section>
    </div>
  );
}

function Row({ o }: { o: BookingOption }) {
  return (
    <a href={o.url} target="_blank" rel="noopener noreferrer" className={`booking__row${o.recommended ? ' booking__row--rec' : ''}`}>
      <span className="booking__main">
        <span className="booking__label">
          {o.label}
          {o.recommended && <span className="tag">Recommended</span>}
        </span>
        {o.note && <span className="booking__note">{o.note}</span>}
      </span>
      <ArrowUpRight size={18} />
    </a>
  );
}
