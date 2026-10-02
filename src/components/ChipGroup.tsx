interface Props<T extends string> {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  disabled?: boolean;
}

export function ChipGroup<T extends string>({ label, options, value, onChange, disabled }: Props<T>) {
  return (
    <div className="stack" style={{ gap: 12, flex: '1 1 360px' }}>
      <h3 style={{ fontSize: 16, fontWeight: 700 }}>{label}</h3>
      <div role="group" aria-label={label} className="row" style={{ gap: 8 }}>
        {options.map((o) => (
          <button key={o.value} type="button" className="chip" disabled={disabled} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
