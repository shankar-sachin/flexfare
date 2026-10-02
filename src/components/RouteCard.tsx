import { Link } from 'react-router-dom';
import type { CuratedRoute } from '../shared/types';
import { shortDate } from '../shared/weeks';
import { ArrowRight } from './Icons';

export function FitScore({ value }: { value: number }) {
  return (
    <div className={`fit${value >= 90 ? ' fit--top' : ''}`} aria-label={`Fit score ${value} out of 100`}>
      <span className="fit__num">{value}</span>
      <span className="fit__label">FIT</span>
    </div>
  );
}

export function RouteCard({ route, to }: { route: CuratedRoute; to: string }) {
  return (
    <article className="card row" style={{ gap: 24, alignItems: 'center' }}>
      <FitScore value={route.fit} />

      <div className="stack" style={{ flex: '1 1 420px', gap: 10, minWidth: 0 }}>
        <div className="row" style={{ gap: 8 }}>
          {route.badge && <span className="tag">{route.badge}</span>}
          {route.warning && <span className="tag tag--warn">{route.warning}</span>}
          <span className="muted" style={{ fontSize: 14 }}>{route.carrier}</span>
        </div>
        <div className="row mono" style={{ gap: 10, fontSize: 22, fontWeight: 600 }}>
          <span>{route.fromAirport}</span>
          <span className="row muted" style={{ gap: 6, fontSize: 13, fontWeight: 500 }}>
            <span style={{ width: 28, height: 2, background: '#b8bdc4' }} />
            {route.via}
            <span style={{ width: 28, height: 2, background: '#b8bdc4' }} />
          </span>
          <span>{route.toAirport}</span>
        </div>
        <div className="row" style={{ gap: '6px 20px', fontSize: 15 }}>
          <span><strong>Out</strong> {shortDate(route.outDate)}</span>
          {route.backDate && <span><strong>Back</strong> {shortDate(route.backDate)}</span>}
          <span className="muted">
            {route.duration} {route.inbound || !route.backDate ? 'each way' : 'outbound'}{route.nights ? ` · ${route.nights} nights` : ''}
          </span>
        </div>
        <p style={{ fontSize: 15, color: 'var(--ink-2)' }}>{route.why}</p>
      </div>

      <div className="stack" style={{ alignItems: 'flex-end', gap: 10, marginLeft: 'auto' }}>
        <span style={{ fontSize: 36, fontWeight: 900, fontStretch: '110%', lineHeight: 1 }}>${route.price}</span>
        <span className="muted" style={{ fontSize: 13 }}>{route.backDate ? 'round trip' : 'one way'} · per adult</span>
        <Link to={to} className="btn btn--ink">
          View route <ArrowRight size={16} />
        </Link>
      </div>
    </article>
  );
}
