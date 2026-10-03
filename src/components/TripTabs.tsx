import type { TripType } from '../shared/types';

const OPTIONS: { value: TripType; label: string }[] = [
  { value: 'round', label: 'Round trip' },
  { value: 'oneway', label: 'One way' },
  { value: 'multi', label: 'Multi-city' },
];

export function TripTabs({ value, onChange, disabled }: { value: TripType; onChange: (t: TripType) => void; disabled?: boolean }) {
  return (
    <div role="group" aria-label="Trip type" className="segmented" style={{ alignSelf: 'flex-start' }}>
      {OPTIONS.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} disabled={disabled} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
