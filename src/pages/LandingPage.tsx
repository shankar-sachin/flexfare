import { Link, Navigate } from 'react-router-dom';
import { Faq } from '../components/home/Faq';
import { Features } from '../components/home/Features';
import { FreePlan } from '../components/home/FreePlan';
import { SamplePreview } from '../components/home/SamplePreview';
import { Footer } from '../components/Footer';
import { Header } from '../components/Header';
import { HowItWorks } from '../components/HowItWorks';
import { ArrowRight } from '../components/Icons';
import { useAuth } from '../lib/AuthContext';

/** The home page for people who aren't signed in: what flexfare is, what you get, and how to start. */
export function LandingPage() {
  const { user, loading } = useAuth();
  if (!loading && user) return <Navigate to="/search" replace />;

  return (
    <>
      <Header showHowItWorks />
      <main>
        <section style={{ background: 'var(--ink)', color: '#fff', padding: '64px 0 72px' }}>
          <div className="container stack" style={{ gap: 22 }}>
            <p className="mono" style={{ fontSize: 15, color: 'var(--signal)' }}>city to city · week to week · ranked by ai</p>
            <h1 className="display" style={{ fontSize: 'clamp(44px, 7vw, 92px)', maxWidth: 1000 }}>
              Pick the week.
              <br />
              We'll find the flight.
            </h1>
            <p style={{ maxWidth: 640, fontSize: 19, color: 'var(--on-dark-muted)' }}>
              Tell us the cities and the weeks you could go. flexfare prices the best-fitting days across every airport in each city,
              then explains in plain words which flights are worth booking, and why.
            </p>
            <div className="row" style={{ gap: 12, marginTop: 6 }}>
              <Link to="/signup" className="btn btn--signal btn--lg">Sign up free <ArrowRight /></Link>
              <Link to="/demo" className="btn btn--ghost-dark btn--lg">See a sample search</Link>
            </div>
            <p className="mono" style={{ fontSize: 14, color: 'var(--on-dark-muted)' }}>
              Free accounts · 4 regular searches and 1 Deep Search a day · No card
            </p>
          </div>
        </section>

        <div className="container stack" style={{ paddingBlock: '72px 88px', gap: 88 }}>
          <SamplePreview />
          <Features />
          <HowItWorks />
          <FreePlan />
          <Faq />

          <section aria-labelledby="cta-h" className="cta-band stack">
            <h2 id="cta-h" className="home-h2" style={{ margin: 0 }}>Find the week that costs less.</h2>
            <p style={{ maxWidth: 560, color: 'var(--ink-2)' }}>Create a free account and run your first search in a couple of minutes.</p>
            <div className="row" style={{ gap: 12 }}>
              <Link to="/signup" className="btn btn--ink btn--lg">Sign up free <ArrowRight /></Link>
              <Link to="/demo" className="btn btn--outline btn--lg">See a sample search</Link>
            </div>
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
