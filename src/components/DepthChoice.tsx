import type { Depth, QuotaSummary } from '../shared/types';

interface Props {
  value: Depth;
  onChange: (d: Depth) => void;
  quota: QuotaSummary | null;
}

/** Regular (cheap, fast) or Deep (larger AI model, closer look, once a day). */
export function DepthChoice({ value, onChange, quota }: Props) {
  const left = (d: Depth) => (quota ? Math.max(0, quota[d].limit - quota[d].used) : null);
  const options: { value: Depth; label: string; note: string }[] = [
    { value: 'regular', label: 'Regular', note: 'Fast, smaller AI model' },
    { value: 'deep', label: 'Deep search', note: 'Larger AI model, closer look at more options' },
  ];
  return (
    <div className="depth" role="group" aria-label="Search depth">
      {options.map((o) => {
        const n = left(o.value);
        const empty = n === 0;
        return (
          <button
            key={o.value}
            type="button"
            className="depth__opt"
            aria-pressed={value === o.value}
            disabled={empty}
            onClick={() => onChange(o.value)}
          >
            <span className="depth__label">{o.label}</span>
            <span className="depth__note">{empty ? 'Used up today' : o.note}</span>
            <span className="depth__left mono">{n === null ? '' : `${n} left today`}</span>
          </button>
        );
      })}
    </div>
  );
}
