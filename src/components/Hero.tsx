export function Hero({ kicker, children }: { kicker: string; children?: React.ReactNode }) {
  return (
    <section style={{ background: 'var(--ink)', color: '#fff', padding: '56px 0 140px' }}>
      <div className="container stack" style={{ gap: 20 }}>
        <p className="mono" style={{ fontSize: 15, color: 'var(--signal)' }}>{kicker}</p>
        <h1 className="display" style={{ fontSize: 'clamp(44px, 7vw, 92px)', maxWidth: 1000 }}>
          Pick the week.
          <br />
          We'll find the flight.
        </h1>
        <p style={{ maxWidth: 620, fontSize: 19, color: 'var(--on-dark-muted)' }}>
          Tell us the cities and the weeks you could go. We search every airport in each city and every day in each
          week, then rank the routes by price and how well they fit you.
        </p>
        {children}
      </div>
    </section>
  );
}
