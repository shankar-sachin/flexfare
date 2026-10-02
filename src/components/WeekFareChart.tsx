import type { WeekFare } from '../shared/types';

/** Simple bar chart of lowest fare per departure week; highlighted weeks drawn in brand yellow. */
export function WeekFareChart({ fares, highlight }: { fares: WeekFare[]; highlight: number[] }) {
  const max = Math.max(...fares.map((f) => f.lowest)) * 1.04;
  const lowest = fares.reduce((a, b) => (b.lowest < a.lowest ? b : a), fares[0]);
  const cols = { gridTemplateColumns: `repeat(${fares.length}, minmax(0, 1fr))` };
  return (
    <div className="stack" style={{ gap: 0 }}>
      <div
        role="img"
        aria-label={`Lowest fare per departure week. Lowest is week ${lowest?.isoWeek} at $${lowest?.lowest}.`}
        style={{ display: 'grid', ...cols, gap: 10, alignItems: 'end', height: 180 }}
      >
        {fares.map((f) => (
          <div key={f.isoWeek} className="stack" style={{ alignItems: 'center', justifyContent: 'flex-end', gap: 6, height: '100%' }}>
            <span className="mono" style={{ fontSize: 12, fontWeight: 600 }}>${f.lowest}</span>
            <span
              style={{
                display: 'block',
                width: '100%',
                maxWidth: 44,
                height: Math.round((f.lowest / max) * 130),
                borderRadius: '6px 6px 0 0',
                background: highlight.includes(f.isoWeek) ? 'var(--signal)' : 'var(--ink)',
              }}
            />
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', ...cols, gap: 10, borderTop: '1px solid var(--line)', paddingTop: 8 }}>
        {fares.map((f) => (
          <span key={f.isoWeek} className="mono muted" style={{ fontSize: 12, textAlign: 'center' }}>WK {f.isoWeek}</span>
        ))}
      </div>
    </div>
  );
}
