import { useEffect } from 'react';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import { Gate, GuestOnly, NeedsUser } from './components/Guards';
import { AuthProvider } from './lib/AuthContext';
import { SearchProvider } from './lib/SearchContext';
import { AccountPage } from './pages/AccountPage';
import { AddPhonePage } from './pages/AddPhonePage';
import { AuthPage } from './pages/AuthPage';
import { FinishEmailLinkPage } from './pages/FinishEmailLinkPage';
import { LandingPage } from './pages/LandingPage';
import { ResultsPage } from './pages/ResultsPage';
import { RoutePage } from './pages/RoutePage';
import { SearchPage } from './pages/SearchPage';
import { VerifyEmailPage } from './pages/VerifyEmailPage';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export default function App() {
  return (
    <AuthProvider>
      <SearchProvider>
        <BrowserRouter>
          <ScrollToTop />
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/demo" element={<ResultsPage demo />} />
            <Route path="/demo/route/:id" element={<RoutePage demo />} />
            <Route path="/signup" element={<GuestOnly><AuthPage mode="signup" /></GuestOnly>} />
            <Route path="/signin" element={<GuestOnly><AuthPage mode="signin" /></GuestOnly>} />
            <Route path="/auth/finish" element={<FinishEmailLinkPage />} />
            <Route path="/verify-email" element={<NeedsUser><VerifyEmailPage /></NeedsUser>} />
            <Route path="/add-phone" element={<NeedsUser><AddPhonePage /></NeedsUser>} />
            <Route path="/search" element={<Gate><SearchPage /></Gate>} />
            <Route path="/results" element={<Gate><ResultsPage /></Gate>} />
            <Route path="/route/:id" element={<Gate><RoutePage /></Gate>} />
            <Route path="/account" element={<Gate><AccountPage /></Gate>} />
          </Routes>
        </BrowserRouter>
      </SearchProvider>
    </AuthProvider>
  );
}
