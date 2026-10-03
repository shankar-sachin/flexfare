const FEATURES = [
  {
    title: 'No more checking seven dates',
    body: 'If your plans have some give, flexfare does the comparing for you. It prices the best-fitting days inside your weeks and shows which ones cost least.',
  },
  {
    title: 'Cheaper airports, found for you',
    body: 'A city has more than one way in. We search them together and flag a nearby landing, like Porto for Lisbon, when the train makes it worth it.',
  },
  {
    title: 'An AI that shows its work',
    body: "It ranks the options and explains why in plain words. Every price it mentions is checked against the real fares before you see it, and it can't invent a flight.",
  },
  {
    title: 'You choose where to book',
    body: 'flexfare finds and compares. It never sells tickets or adds a markup. When you are ready, you book on the site you pick.',
  },
];

export function Features() {
  return (
    <section id="features" aria-labelledby="features-h" className="stack" style={{ gap: 24 }}>
      <h2 id="features-h" className="home-h2">Why use flexfare.</h2>
      <div className="feature-grid feature-grid--four">
        {FEATURES.map((f) => (
          <article key={f.title} className="card stack" style={{ gap: 8, padding: 24 }}>
            <h3 style={{ fontSize: 20, fontWeight: 800, fontStretch: '110%' }}>{f.title}</h3>
            <p className="muted">{f.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
