const STEPS = [
  {
    title: 'Cities, not airports',
    body: 'Say "San Francisco" and we search SFO, OAK and SJC. Say "Lisbon" and we\'ll also flag a cheaper landing in Porto if the train is easy.',
  },
  {
    title: 'Weeks, not dates',
    body: "Pick the week you'd leave and the week you'd come back. Every day inside those weeks is fair game.",
  },
  {
    title: 'A short list, with reasons',
    body: 'The AI weighs fare, total travel time, layovers and your stay length, then tells you in plain words why each route made the cut.',
  },
];

export function HowItWorks() {
  return (
    <section id="how" aria-labelledby="how-h" className="stack" style={{ gap: 28 }}>
      <h2 id="how-h" style={{ fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 900, fontStretch: '115%', letterSpacing: '-0.02em' }}>
        Built for people whose plans are a little loose.
      </h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
        {STEPS.map((s, i) => (
          <article key={s.title} className="card stack" style={{ gap: 12, padding: 28 }}>
            <span
              className="mono"
              style={{
                fontSize: 14, fontWeight: 600, background: 'var(--ink)', color: 'var(--signal)', width: 40, height: 40,
                borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              0{i + 1}
            </span>
            <h3 style={{ fontSize: 22, fontWeight: 800, fontStretch: '110%' }}>{s.title}</h3>
            <p className="muted">{s.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
