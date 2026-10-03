import { useId } from 'react';
import { addLeg, editLeg, legsOf, removeLeg } from '../lib/legs';
import { MAX_LEGS, type SearchQuery, type Week } from '../shared/types';
import { CityField } from './CityField';

interface Props {
  query: SearchQuery;
  weeks: Week[];
  onChange: (patch: Partial<SearchQuery>) => void;
}

function WeekSelect({ label, value, weeks, onChange }: { label: string; value: Week; weeks: Week[]; onChange: (w: Week) => void }) {
  const id = useId();
  return (
    <div className="field" style={{ flex: '0 1 220px' }}>
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value.start} onChange={(e) => onChange(weeks.find((w) => w.start === e.target.value)!)}>
        {weeks.map((w) => (
          <option key={w.start} value={w.start}>
            WK {w.isoWeek} · {w.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Multi-city: 2 to 4 flights, each with its own cities and leave week. */
export function LegRows({ query, weeks, onChange }: Props) {
  const legs = legsOf(query);
  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="stack" style={{ gap: 4 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, fontStretch: '110%' }}>Your flights</h2>
        <p className="muted" style={{ fontSize: 15 }}>
          Add up to {MAX_LEGS} flights. Each one is searched on its own and booked separately, so leave enough time between them.
        </p>
      </div>
      {legs.map((leg, i) => (
        <fieldset key={i} className="leg stack" style={{ gap: 12 }}>
          <legend className="leg__title">Flight {i + 1}</legend>
          <div className="row" style={{ alignItems: 'stretch', gap: 12 }}>
            <CityField label="From city" value={leg.from} onChange={(from) => onChange(editLeg(query, i, { from }))} />
            <CityField label="To city" value={leg.to} onChange={(to) => onChange(editLeg(query, i, { to }))} />
            <WeekSelect label="Leaves" value={leg.week} weeks={weeks} onChange={(week) => onChange(editLeg(query, i, { week }))} />
          </div>
          {legs.length > 2 && (
            <button type="button" className="linklike leg__remove" aria-label={`Remove flight ${i + 1}`} onClick={() => onChange(removeLeg(query, i))}>
              Remove flight {i + 1}
            </button>
          )}
        </fieldset>
      ))}
      {legs.length < MAX_LEGS && (
        <button type="button" className="btn btn--outline" style={{ alignSelf: 'flex-start' }} onClick={() => onChange(addLeg(query, weeks))}>
          Add another flight
        </button>
      )}
    </div>
  );
}
