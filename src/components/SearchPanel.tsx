import type { ReactNode } from 'react';
import { ChipGroup } from './ChipGroup';
import { CityField } from './CityField';
import { Calendar, Swap } from './Icons';
import { TravelersField } from './TravelersField';
import { WeekPicker } from './WeekPicker';
import type { Priority, SearchQuery, StayPreference, Week, WeekFare } from '../shared/types';
import { weeksBetween } from '../shared/weeks';

const STAYS: { value: StayPreference; label: string }[] = [
  { value: 'cheapest', label: 'Whatever’s cheapest' },
  { value: 'range', label: '10 – 16 nights' },
  { value: 'about-two-weeks', label: 'About 2 weeks' },
  { value: 'exact', label: 'Exactly as picked' },
];
const PRIORITIES: { value: Priority; label: string }[] = [
  { value: 'price', label: 'Lowest price' },
  { value: 'balance', label: 'Best balance' },
  { value: 'speed', label: 'Shortest trip' },
];

interface Props {
  query: SearchQuery;
  weeks: Week[];
  fares: WeekFare[];
  /** Omit for the read-only preview on the landing page. */
  onChange?: (patch: Partial<SearchQuery>) => void;
  /** Footer: the call-to-action and any usage note. */
  footer: ReactNode;
}

/** The whole search form. Interactive on /search, locked on the signed-out landing page. */
export function SearchPanel({ query, weeks, fares, onChange, footer }: Props) {
  const readOnly = !onChange;
  const depIdx = weeks.findIndex((w) => w.start === query.departWeek.start);
  const retIdx = query.returnWeek ? weeks.findIndex((w) => w.start === query.returnWeek!.start) : null;
  const span = query.returnWeek ? weeksBetween(query.departWeek, query.returnWeek) : 0;
  const combos = query.returnWeek ? 49 : 7;
  const airports = query.from.airports.length + query.to.airports.length + (query.to.nearby?.length ?? 0);

  return (
    <section aria-label="Search" className="stack search-panel">
      {readOnly && (
        <p className="lock-note" role="note">
          This is a preview. <strong>Sign up free</strong> to choose your own cities and weeks.
        </p>
      )}
      <div className="row" style={{ alignItems: 'stretch', gap: 12 }}>
        <CityField label="From city" value={query.from} disabled={readOnly} onChange={onChange && ((from) => onChange({ from }))} />
        <button
          type="button"
          className="icon-btn"
          aria-label="Swap cities"
          disabled={readOnly}
          onClick={() => onChange?.({ from: query.to, to: query.from })}
        >
          <Swap />
        </button>
        <CityField label="To city" value={query.to} disabled={readOnly} onChange={onChange && ((to) => onChange({ to }))} />
        <TravelersField travelers={query.travelers} cabin={query.cabin} disabled={readOnly} onChange={onChange} />
      </div>

      <div className="stack" style={{ gap: 16 }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline', gap: 16 }}>
          <h2 style={{ fontSize: 22, fontWeight: 800, fontStretch: '110%' }}>Which weeks could you go?</h2>
          <p className="muted" style={{ fontSize: 15 }}>
            Tap a week to leave, then a week to come back. Bars show the lowest fare we've seen that week.
          </p>
        </div>
        <WeekPicker
          weeks={weeks}
          fares={fares}
          depart={depIdx}
          ret={retIdx}
          disabled={readOnly}
          onChange={(d, r) => onChange?.({ departWeek: weeks[d], returnWeek: r === null ? null : weeks[r] })}
        />
        <div className="row" style={{ gap: 12, padding: '14px 18px', background: 'var(--ground)', borderRadius: 12 }} aria-live="polite">
          <Calendar />
          {query.returnWeek ? (
            <>
              <strong>Leave {query.departWeek.label} → Return {query.returnWeek.label}</strong>
              <span className="muted">({span} {span === 1 ? 'week' : 'weeks'} apart, 7 × 7 day options)</span>
            </>
          ) : (
            <strong>Leave week of {query.departWeek.label} · now pick a return week</strong>
          )}
        </div>
      </div>

      <div className="row" style={{ gap: 40, alignItems: 'flex-start' }}>
        <ChipGroup label="How long do you want to stay?" options={STAYS} value={query.stay} disabled={readOnly} onChange={(stay) => onChange?.({ stay })} />
        <ChipGroup label="What matters most?" options={PRIORITIES} value={query.priority} disabled={readOnly} onChange={(priority) => onChange?.({ priority })} />
      </div>

      <div className="row" style={{ justifyContent: 'space-between', gap: 20, paddingTop: 24, borderTop: '1px solid var(--line-soft)' }}>
        <p className="muted" style={{ maxWidth: 560 }}>
          We'll check <strong style={{ color: 'var(--ink)' }}>{combos} date combinations</strong> across {airports} airports,
          then show you the handful worth booking.
        </p>
        {footer}
      </div>
    </section>
  );
}
