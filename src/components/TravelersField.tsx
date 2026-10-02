import { useId } from 'react';
import type { SearchQuery } from '../shared/types';

interface Props {
  travelers: number;
  cabin: SearchQuery['cabin'];
  onChange?: (patch: Pick<SearchQuery, 'travelers' | 'cabin'>) => void;
  disabled?: boolean;
}

export function TravelersField({ travelers, cabin, onChange, disabled }: Props) {
  const id = useId();
  const editable = !disabled && !!onChange;
  const set = (t: number) => onChange?.({ travelers: Math.max(1, Math.min(9, t)), cabin });
  return (
    <div className="city-field city-field--narrow" aria-disabled={!editable || undefined}>
      <span className="label" id={`${id}-l`}>Travelers</span>
      <div className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
        {editable && (
          <button type="button" className="step-btn" aria-label="Fewer travelers" disabled={travelers <= 1} onClick={() => set(travelers - 1)}>−</button>
        )}
        <span className="city-field__value" aria-live="polite" style={{ fontSize: 22, whiteSpace: 'nowrap' }}>
          {travelers} {travelers === 1 ? 'adult' : 'adults'}
        </span>
        {editable && (
          <button type="button" className="step-btn" aria-label="More travelers" disabled={travelers >= 9} onClick={() => set(travelers + 1)}>+</button>
        )}
      </div>
      {editable ? (
        <select
          aria-label="Cabin"
          className="cabin-select"
          value={cabin}
          onChange={(e) => onChange?.({ travelers, cabin: e.target.value as SearchQuery['cabin'] })}
        >
          <option value="economy">Economy</option>
          <option value="premium">Premium economy</option>
          <option value="business">Business</option>
        </select>
      ) : (
        <span className="muted" style={{ fontSize: 14, textTransform: 'capitalize' }}>{cabin}</span>
      )}
      {editable && cabin !== 'economy' && (
        <span className="muted" style={{ fontSize: 12 }}>Cabin only changes the links we give you. Ranked fares are economy.</span>
      )}
    </div>
  );
}
