import { useEffect, useId, useState } from 'react';
import { ChipGroup } from './ChipGroup';
import { DEFAULT_CUSTOM_STAY, MAX_CUSTOM_NIGHTS, stayProblem } from '../shared/stay';
import type { NightsRange, SearchQuery, StayPreference } from '../shared/types';
import { weeksBetween } from '../shared/weeks';

export const STAYS: { value: StayPreference; label: string }[] = [
  { value: 'cheapest', label: 'Whatever’s cheapest' },
  { value: 'one-night', label: '1 night' },
  { value: 'short', label: '3 – 4 nights' },
  { value: 'range', label: '10 – 16 nights' },
  { value: 'about-two-weeks', label: 'About 2 weeks' },
  { value: 'custom', label: 'Custom' },
  { value: 'exact', label: 'Exactly as picked' },
];

const toNights = (s: string): number | null => (/^\d{1,2}$/.test(s) && Number(s) >= 1 && Number(s) <= MAX_CUSTOM_NIGHTS ? Number(s) : null);

interface Props {
  query: SearchQuery;
  disabled?: boolean;
  onChange?: (patch: Partial<SearchQuery>) => void;
}

/** "How long do you want to stay?": preset chips, plus a from/to nights pair for Custom. */
export function StayField({ query, disabled, onChange }: Props) {
  const id = useId();
  const committed = query.customStay ?? DEFAULT_CUSTOM_STAY;
  const [lo, setLo] = useState(String(committed.min));
  const [hi, setHi] = useState(String(committed.max));
  // Follow the query when it changes from outside (a shared link, switching trips).
  useEffect(() => {
    setLo(String(committed.min));
    setHi(String(committed.max));
  }, [committed.min, committed.max]);

  const edit = (nextLo: string, nextHi: string) => {
    setLo(nextLo);
    setHi(nextHi);
    const a = toNights(nextLo);
    const b = toNights(nextHi);
    if (a !== null && b !== null && a <= b) onChange?.({ customStay: { min: a, max: b } satisfies NightsRange });
  };
  const typedOk = (() => {
    const a = toNights(lo);
    const b = toNights(hi);
    return a !== null && b !== null && a <= b;
  })();
  const snapBack = () => {
    if (typedOk) return;
    setLo(String(committed.min));
    setHi(String(committed.max));
  };

  const pick = (stay: StayPreference) => onChange?.({ stay, ...(stay === 'custom' && !query.customStay ? { customStay: DEFAULT_CUSTOM_STAY } : {}) });
  const problem = query.returnWeek ? stayProblem(query.stay, query.stay === 'custom' ? committed : null, weeksBetween(query.departWeek, query.returnWeek)) : null;

  return (
    <div className="stack" style={{ gap: 12, flex: '1 1 360px' }}>
      <ChipGroup label="How long do you want to stay?" options={STAYS} value={query.stay} disabled={disabled} onChange={pick} />
      {query.stay === 'custom' && (
        <div className="row" style={{ gap: 10, alignItems: 'center' }}>
          <label htmlFor={`${id}-lo`} className="muted">From</label>
          <input id={`${id}-lo`} className="nights-input" type="text" inputMode="numeric" autoComplete="off" maxLength={2} value={lo} disabled={disabled} aria-invalid={!typedOk || undefined} onChange={(e) => edit(e.target.value.trim(), hi)} onBlur={snapBack} />
          <label htmlFor={`${id}-hi`} className="muted">to</label>
          <input id={`${id}-hi`} className="nights-input" type="text" inputMode="numeric" autoComplete="off" maxLength={2} value={hi} disabled={disabled} aria-invalid={!typedOk || undefined} onChange={(e) => edit(lo, e.target.value.trim())} onBlur={snapBack} />
          <span className="muted">nights</span>
        </div>
      )}
      {query.stay === 'custom' && !typedOk && (
        <p className="muted" role="note" style={{ fontSize: 14 }}>Enter whole nights from 1 to {MAX_CUSTOM_NIGHTS}, lowest first. Use the same number twice for an exact stay.</p>
      )}
      {problem && !disabled && (
        <p className="form-ok" role="note" style={{ fontSize: 14 }}>{problem}</p>
      )}
    </div>
  );
}
