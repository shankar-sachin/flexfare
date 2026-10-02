import { Link, Navigate } from 'react-router-dom';
import { demoQuery, mockWeekFares } from '../demo/demoResult';
import { Footer } from '../components/Footer';
import { Header } from '../components/Header';
import { Hero } from '../components/Hero';
import { HowItWorks } from '../components/HowItWorks';
import { ArrowRight } from '../components/Icons';
import { SearchPanel } from '../components/SearchPanel';
import { useAuth } from '../lib/AuthContext';
import { useSearch } from '../lib/SearchContext';

/** Signed-out home: the real form, locked, plus a ready-made sample search. */
export function LandingPage() {
  const { user, loading } = useAuth();
  const { weeks } = useSearch();
  if (!loading && user) return <Navigate to="/search" replace />;
  const q = demoQuery(weeks);

  return (
    <>
      <Header showHowItWorks />
      <Hero kicker="city to city · week to week · ranked by ai">
        <div className="row" style={{ gap: 12, marginTop: 8 }}>
          <Link to="/signup" className="btn btn--signal btn--lg">Sign up free <ArrowRight /></Link>
          <Link to="/demo" className="btn btn--ghost-dark btn--lg">See a sample search</Link>
        </div>
      </Hero>
      <main className="container stack" style={{ marginTop: -100, paddingBottom: 80, gap: 64 }}>
        <SearchPanel
          query={q}
          weeks={weeks}
          fares={mockWeekFares(weeks)}
          footer={<Link to="/demo" className="btn btn--signal btn--lg">See what you'd get <ArrowRight /></Link>}
        />
        <HowItWorks />
      </main>
      <Footer />
    </>
  );
}
