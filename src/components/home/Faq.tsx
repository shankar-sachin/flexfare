import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';

const QUESTIONS: { q: string; a: ReactNode }[] = [
  {
    q: 'Does flexfare sell tickets?',
    a: 'No. flexfare finds and ranks flights, then shows you where to book them. You pay the airline or the booking site, never us.',
  },
  {
    q: 'Where do the prices come from?',
    a: 'From live flight searches (Google Flights data) through a partner, so they are real fares. Fares change quickly, so treat every price as an estimate until you book.',
  },
  {
    q: 'What does the AI actually do?',
    a: "It reads the fares we found, picks the best ones and explains why. It doesn't set or change prices, and every dollar amount it writes is checked against the real data first. If the AI is unavailable you still get a ranked list.",
  },
  {
    q: 'Why do I need an account?',
    a: 'Each search uses paid services, so accounts keep the free daily allowance fair. It takes about a minute: you get a 6-digit code by email.',
  },
  {
    q: 'What is the phone number for?',
    a: "To discourage duplicate accounts. We don't text it, we don't verify it, and we store only a scrambled version of it.",
  },
  {
    q: 'Can I try it first?',
    a: (
      <>
        Yes. The <Link to="/demo">sample search</Link> shows the real screens with example data. No account needed.
      </>
    ),
  },
  {
    q: 'How far ahead can I search?',
    a: 'The next 12 weeks.',
  },
];

export function Faq() {
  return (
    <section id="faq" aria-labelledby="faq-h" className="stack" style={{ gap: 20 }}>
      <h2 id="faq-h" className="home-h2">Questions.</h2>
      <div className="faq">
        {QUESTIONS.map((item) => (
          <details key={item.q}>
            <summary>{item.q}</summary>
            <p className="muted">{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
