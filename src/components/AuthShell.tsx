import type { ReactNode } from 'react';
import { Footer } from './Footer';
import { Header } from './Header';

export function AuthShell({ title, intro, children }: { title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <>
      <Header />
      <main className="container" style={{ paddingBlock: '48px 80px' }}>
        <div className="card stack" style={{ maxWidth: 480, margin: '0 auto', gap: 20, padding: 28 }}>
          <div className="stack" style={{ gap: 8 }}>
            <h1 className="display" style={{ fontSize: 'clamp(30px, 6vw, 40px)' }}>{title}</h1>
            {intro && <p className="muted">{intro}</p>}
          </div>
          {children}
        </div>
      </main>
      <Footer />
    </>
  );
}
