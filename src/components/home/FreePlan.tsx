export function FreePlan() {
  return (
    <section id="plan" aria-labelledby="plan-h" className="stack" style={{ gap: 20 }}>
      <div className="stack" style={{ gap: 6 }}>
        <h2 id="plan-h" className="home-h2">Free, with daily searches.</h2>
        <p className="muted" style={{ maxWidth: 640 }}>No card needed. Every account gets this each day:</p>
      </div>
      <div className="feature-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
        <article className="card stack" style={{ gap: 6, padding: 24 }}>
          <span className="mono" style={{ fontSize: 40, fontWeight: 600 }}>4</span>
          <h3 style={{ fontSize: 20, fontWeight: 800, fontStretch: '110%' }}>Regular searches</h3>
          <p className="muted">Fast. A smaller AI model reads the best flights we found and explains the top picks.</p>
        </article>
        <article className="card card--dark stack" style={{ gap: 6, padding: 24 }}>
          <span className="mono" style={{ fontSize: 40, fontWeight: 600, color: 'var(--signal)' }}>1</span>
          <h3 style={{ fontSize: 20, fontWeight: 800, fontStretch: '110%' }}>Deep Search</h3>
          <p style={{ color: 'var(--on-dark-muted)' }}>A larger AI model takes a closer look at more options and spells out what each one gains and gives up.</p>
        </article>
      </div>
      <p className="muted" style={{ fontSize: 15 }}>Searches reset at 00:00 UTC. Repeating a search you ran in the last 6 hours is free.</p>
    </section>
  );
}
