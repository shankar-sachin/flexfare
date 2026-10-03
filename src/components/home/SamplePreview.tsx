import { Link } from 'react-router-dom';
import { demoQuery, mockCuration } from '../../demo/demoResult';
import { useSearch } from '../../lib/SearchContext';
import { RouteCard } from '../RouteCard';
import { ArrowRight } from '../Icons';

/** Two real result cards from the demo data, clearly labelled as an example. */
export function SamplePreview() {
  const { weeks } = useSearch();
  const routes = mockCuration(demoQuery(weeks), weeks).routes.slice(0, 2);
  return (
    <section aria-labelledby="sample-h" className="stack" style={{ gap: 20 }}>
      <div className="stack" style={{ gap: 6 }}>
        <h2 id="sample-h" className="home-h2">A short list, with the reasons.</h2>
        <p className="muted" style={{ maxWidth: 640 }}>
          This is a sample search from San Francisco to Lisbon. <strong style={{ color: 'var(--ink)' }}>The fares are made up for the example.</strong> A real search uses live prices.
        </p>
      </div>
      <div className="stack" style={{ gap: 16 }}>
        {routes.map((r) => (
          <RouteCard key={r.id} route={r} to={`/demo/route/${r.id}`} />
        ))}
      </div>
      <Link to="/demo" className="btn btn--ink" style={{ alignSelf: 'flex-start' }}>
        See the whole sample search <ArrowRight size={16} />
      </Link>
    </section>
  );
}
