import { Fragment } from 'react';
import type { Leg } from '../shared/types';
import { Clock } from './Icons';

export function LegTimeline({ title, leg }: { title: string; leg: Leg }) {
  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="row" style={{ justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
        <h3 style={{ fontSize: 17, fontWeight: 800 }}>{title}</h3>
        <span className="mono muted" style={{ fontSize: 14 }}>{leg.totalDuration} total</span>
      </div>
      {leg.segments.length === 0 && (
        <p className="muted">
          {leg.stops === undefined ? '' : leg.stops === 0 ? 'Nonstop. ' : `${leg.stops} ${leg.stops === 1 ? 'stop' : 'stops'}. `}
          Exact flight times are on the airline and search sites; use the links on this page.
        </p>
      )}
      {leg.segments.map((s, i) => (
        <Fragment key={s.flight}>
          <div style={{ display: 'grid', gridTemplateColumns: '72px 24px minmax(0, 1fr)', columnGap: 12 }}>
            <div className="stack mono" style={{ justifyContent: 'space-between', gap: 28, fontSize: 15, fontWeight: 600 }}>
              <span>{s.depart}</span>
              <span>{s.arrive}</span>
            </div>
            <div className="stack" style={{ alignItems: 'center' }} aria-hidden="true">
              <span style={{ width: 12, height: 12, borderRadius: 999, border: '3px solid var(--ink)' }} />
              <span style={{ flex: 1, width: 3, background: 'var(--ink)' }} />
              <span style={{ width: 12, height: 12, borderRadius: 999, background: 'var(--ink)' }} />
            </div>
            <div className="stack" style={{ justifyContent: 'space-between', gap: 6 }}>
              <span style={{ fontWeight: 700 }}>{s.from}</span>
              <span className="muted" style={{ fontSize: 14 }}>
                {s.carrier} {s.flight} · {s.duration}{s.aircraft ? ` · ${s.aircraft}` : ''}
              </span>
              <span style={{ fontWeight: 700 }}>{s.to}</span>
            </div>
          </div>
          {leg.layovers[i] && (
            <div className="row" style={{ marginLeft: 108, gap: 10, padding: '10px 14px', background: 'var(--ground)', borderRadius: 10, fontSize: 14 }}>
              <Clock />
              <span>{leg.layovers[i]}</span>
            </div>
          )}
        </Fragment>
      ))}
    </div>
  );
}
