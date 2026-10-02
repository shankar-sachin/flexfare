import type { Week, WeekFare } from '../shared/types';

interface Props {
  weeks: Week[];
  /** Lowest fare per week. Empty while loading or when we have no data. */
  fares: WeekFare[];
  depart: number; // index into weeks
  ret: number | null;
  onChange: (depart: number, ret: number | null) => void;
  disabled?: boolean;
}

/**
 * Two-tap range picker over weeks. First tap = leave week, second tap (later week) = return week.
 * Tapping again starts a new range. Bars show the lowest fare per week relative to the cheapest.
 */
export function WeekPicker({ weeks, fares, depart, ret, onChange, disabled }: Props) {
  const fareFor = (w: Week) => fares.find((f) => f.isoWeek === w.isoWeek)?.lowest ?? 0;
  const known = weeks.map(fareFor).filter((n) => n > 0);
  const min = known.length ? Math.min(...known) : 0;

  const pick = (i: number) => {
    if (ret !== null || i <= depart) onChange(i, null);
    else onChange(depart, i);
  };

  return (
    <div role="group" aria-label="Weeks" className="week-grid">
      {weeks.map((w, i) => {
        const isEnd = i === depart || i === ret;
        const inRange = ret !== null && i > depart && i < ret;
        const price = fareFor(w);
        const tag = i === depart ? 'Leave' : i === ret ? 'Return' : price > 0 && price === min ? 'Lowest' : '';
        return (
          <button
            key={w.start}
            type="button"
            disabled={disabled}
            aria-pressed={isEnd}
            onClick={() => pick(i)}
            className={`week${isEnd ? ' week--end' : ''}${inRange ? ' week--range' : ''}`}
          >
            <span className="week__top">
              <span className="mono" style={{ fontSize: 12, letterSpacing: '0.08em' }}>WK {w.isoWeek}</span>
              {tag && <span className="tag">{tag}</span>}
            </span>
            <span className="week__label">{w.label}</span>
            <span className="mono" style={{ fontSize: 13 }}>{price > 0 ? `from $${price}` : fares.length === 0 ? '…' : 'no fares seen'}</span>
            <span className="week__track">
              {price > 0 && <span className="week__bar" style={{ width: `${Math.round((min / price) * 100)}%` }} />}
            </span>
          </button>
        );
      })}
    </div>
  );
}
