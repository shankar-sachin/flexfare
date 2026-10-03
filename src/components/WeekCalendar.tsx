import { useMemo, useState } from 'react';
import { buildCalendar, type CalendarWeek } from '../lib/calendar';
import type { Week, WeekFare } from '../shared/types';
import { MAX_RETURN_GAP_WEEKS, shortDate } from '../shared/weeks';

interface Props {
  /** The weeks you can search (about six months of them). */
  weeks: Week[];
  /** Lowest fare per week, when a fare source has it. Empty is fine. */
  fares: WeekFare[];
  /** True while fares are loading; afterwards an empty list simply means no prices. */
  loading?: boolean;
  /** One way: every click picks the leave week and there is no return. */
  single?: boolean;
  depart: number; // index into weeks
  ret: number | null;
  onChange: (depart: number, ret: number | null) => void;
  disabled?: boolean;
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * A month-by-month calendar for choosing weeks, six months ahead. Each row is one Monday-to-Sunday week and the
 * whole row is the button. Click a week to leave, then a later week to come back (or just one for one way).
 */
export function WeekCalendar({ weeks, fares, loading, single, depart, ret, onChange, disabled }: Props) {
  const months = useMemo(() => buildCalendar(weeks), [weeks]);
  // Open on the month of the chosen leave week.
  const [first, setFirst] = useState(() => {
    const start = weeks[depart]?.start.slice(0, 7);
    return Math.max(0, months.findIndex((m) => m.key === start));
  });
  const visible = months.slice(first, first + 2); // the second month is hidden on narrow screens (CSS)

  const awaitingReturn = !single && ret === null && depart >= 0;
  const fareFor = (isoWeek: number) => fares.find((f) => f.isoWeek === isoWeek)?.lowest ?? 0;

  const pick = (i: number) => {
    if (single) onChange(i, null);
    else if (ret !== null || i <= depart) onChange(i, null); // start a new trip
    else onChange(depart, i);
  };

  const stateOf = (w: CalendarWeek) => {
    if (w.index < 0) return 'off';
    if (w.index === depart) return 'leave';
    if (w.index === ret) return 'return';
    if (ret !== null && w.index > depart && w.index < ret) return 'range';
    return 'free';
  };

  const chipLabel = (i: number) => {
    const m = months[i];
    return i === 0 || m.short === 'Jan' ? `${m.short} ’${m.key.slice(2, 4)}` : m.short;
  };

  return (
    <div className="cal">
      <div className="cal__nav">
        <button type="button" className="cal__arrow" aria-label="Previous month" disabled={first <= 0} onClick={() => setFirst((f) => Math.max(0, f - 1))}>
          ‹
        </button>
        <div className="cal__chips" role="group" aria-label="Jump to a month">
          {months.map((m, i) => (
            <button
              key={m.key}
              type="button"
              // The second month is only on screen on wide screens, so only then does its chip light up too.
              className={`cal__chip${i === first + 1 ? ' cal__chip--second' : ''}`}
              aria-current={i === first ? 'true' : undefined}
              aria-label={m.label}
              onClick={() => setFirst(i)}
            >
              {chipLabel(i)}
            </button>
          ))}
        </div>
        <button type="button" className="cal__arrow" aria-label="Next month" disabled={first >= months.length - 1} onClick={() => setFirst((f) => Math.min(months.length - 1, f + 1))}>
          ›
        </button>
      </div>

      <div className="cal__months">
        {visible.map((m) => (
          <section key={m.key} className="cal__month" role="group" aria-label={m.label}>
            <h3 className="cal__title">{m.label}</h3>
            <div className="cal__row cal__row--head" aria-hidden="true">
              <span />
              <span className="cal__days">
                {DAYS.map((d) => (
                  <span key={d}>{d}</span>
                ))}
              </span>
              <span />
            </div>
            {m.weeks.map((w) => {
              const st = stateOf(w);
              const tooFar = awaitingReturn && w.index > depart + MAX_RETURN_GAP_WEEKS;
              const off = st === 'off' || tooFar;
              const price = w.index >= 0 ? fareFor(w.isoWeek) : 0;
              const label = `Week ${w.isoWeek}, ${shortDate(w.start)} to ${shortDate(w.end)}`;
              const note =
                st === 'leave' ? '. Leave week.' : st === 'return' ? '. Return week.' : st === 'range' ? '. Between your leave and return weeks.' : st === 'off' ? '. Not available.' : tooFar ? `. More than ${MAX_RETURN_GAP_WEEKS} weeks after your leave week.` : '.';
              return (
                <button
                  key={w.start}
                  type="button"
                  disabled={disabled || off}
                  aria-pressed={st === 'leave' || st === 'return'}
                  aria-label={label + note}
                  onClick={() => pick(w.index)}
                  className={`cal__week cal__week--${off && st !== 'off' ? 'off' : st}`}
                >
                  <span className="cal__wk mono">WK {w.isoWeek}</span>
                  <span className="cal__days" aria-hidden="true">
                    {w.days.map((d) => (
                      <span key={d.date} className={`cal__day${d.inMonth ? '' : ' cal__day--out'}${d.isToday ? ' cal__day--today' : ''}`}>
                        {d.day}
                      </span>
                    ))}
                  </span>
                  <span className="cal__side mono" aria-hidden="true">
                    {st === 'leave' ? 'Leave' : st === 'return' ? 'Return' : price > 0 ? `from $${price}` : loading && w.index >= 0 ? '…' : ''}
                  </span>
                </button>
              );
            })}
          </section>
        ))}
      </div>
    </div>
  );
}
