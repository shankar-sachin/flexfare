import { useState } from 'react';
import { ApiError, lookupBooking } from '../lib/api';
import type { BookChoice, BookLookup, BookRef, BookingOption } from '../shared/types';
import { ArrowUpRight } from './Icons';

/**
 * Where to book this trip. The airline itself comes first and is recommended; the comparison sites follow.
 * flexfare doesn't sell tickets, so each link opens the seller's own site in a new tab.
 */
export function BookingOptions({ options, demo, book, lookup = lookupBooking }: { options: BookingOption[]; demo?: boolean; book?: BookRef; lookup?: (book: BookRef) => Promise<BookLookup> }) {
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
      {book && <DirectBooking book={book} lookup={lookup} />}
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

type Direct = { state: 'idle' } | { state: 'loading' } | { state: 'ready'; result: BookLookup } | { state: 'failed'; message: string };

/**
 * "Book directly": looks up the live fare for this exact flight, then each choice is a form that opens the
 * seller's own checkout page in a new tab. The lookup costs us live-fare searches, so it only runs on a click.
 */
function DirectBooking({ book, lookup }: { book: BookRef; lookup: (book: BookRef) => Promise<BookLookup> }) {
  const [direct, setDirect] = useState<Direct>({ state: 'idle' });
  const run = () => {
    setDirect({ state: 'loading' });
    lookup(book).then(
      (result) => setDirect({ state: 'ready', result }),
      (err) => setDirect({ state: 'failed', message: err instanceof ApiError ? err.message : 'We could not look that up just now. Use the links below.' }),
    );
  };
  return (
    <section className="stack" style={{ gap: 8 }} aria-label="Book directly" aria-live="polite">
      <h4 className="booking__group">Book this exact flight</h4>
      {direct.state === 'idle' && (
        <>
          <button type="button" className="btn btn--signal" style={{ fontSize: 17, padding: 16 }} onClick={run}>Check the live fare and book</button>
          <span className="booking__note">Takes a few seconds. Opens the seller's checkout in a new tab.</span>
        </>
      )}
      {direct.state === 'loading' && <span className="booking__note">Checking the live fare…</span>}
      {direct.state === 'failed' && <span className="booking__note" role="alert">{direct.message}</span>}
      {direct.state === 'ready' && (
        <>
          {direct.result.choices.map((c) => (
            <ChoiceForm key={`${c.seller}-${c.price}`} choice={c} />
          ))}
          <span className="booking__note">
            {direct.result.returnFlight ? `Prices are for the return flight ${direct.result.returnFlight}. ` : ''}The seller sets the final price.
          </span>
        </>
      )}
    </section>
  );
}

/** Submits the seller's own booking request from the traveler's browser, the way Google Flights does. */
function ChoiceForm({ choice }: { choice: BookChoice }) {
  const fields = [...new URLSearchParams(choice.postData).entries()];
  return (
    <form method="post" action={choice.url} target="_blank" rel="noopener noreferrer">
      {fields.map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <button type="submit" className="booking__row booking__row--rec" style={{ width: '100%', cursor: 'pointer', font: 'inherit', textAlign: 'left' }}>
        <span className="booking__main">
          <span className="booking__label">Book with {choice.seller} · ${choice.price}</span>
        </span>
        <ArrowUpRight size={18} />
      </button>
    </form>
  );
}
