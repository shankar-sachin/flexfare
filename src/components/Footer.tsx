import { BRAND } from './Logo';

export function Footer() {
  return (
    <footer style={{ borderTop: '1px solid var(--line)', background: 'var(--surface)' }}>
      <div className="container row muted" style={{ justifyContent: 'space-between', gap: 16, paddingBlock: 28, fontSize: 14 }}>
        <span>{BRAND}</span>
        <span>Fares shown are estimates until you book with the airline.</span>
      </div>
    </footer>
  );
}
