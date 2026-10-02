import type { DayFare } from '../shared/types';
import { dayParts } from '../shared/weeks';

interface Props {
  label: string;
  days: DayFare[];
  selected: number;
  onSelect: (i: number) => void;
  disabled?: boolean;
}

/** Mon–Sun inside one chosen week, each showing $ over that week's cheapest day. */
export function DayPicker({ label, days, selected, onSelect, disabled }: Props) {
  return (
    <div className="stack" style={{ gap: 8 }}>
      <h3 className="label" style={{ fontWeight: 600 }}>{label}</h3>
      <div role="group" aria-label={label} className="day-grid">
        {days.map((d, i) => {
          const { dow, day } = dayParts(d.date);
          return (
            <button
              key={d.date}
              type="button"
              disabled={disabled}
              aria-pressed={i === selected}
              onClick={() => onSelect(i)}
              className={`day${d.delta === 0 ? ' day--cheapest' : ''}`}
            >
              <span style={{ fontSize: 13, fontWeight: 600 }}>{dow}</span>
              <span style={{ fontSize: 20, fontWeight: 800 }}>{day}</span>
              <span className="mono" style={{ fontSize: 12 }}>{d.delta === 0 ? 'lowest' : `+$${d.delta}`}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
