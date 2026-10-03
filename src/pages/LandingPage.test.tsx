// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SearchProvider } from '../lib/SearchContext';

let auth: Record<string, unknown> = {};
vi.mock('../lib/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../lib/api', () => ({ useQuota: () => null, getMe: () => Promise.resolve() }));
const { LandingPage } = await import('./LandingPage');

afterEach(cleanup);
const signedOut = () => (auth = { user: null, loading: false, emailVerified: false, phoneOnFile: false, signOut: vi.fn() });
const setup = () =>
  render(
    <MemoryRouter initialEntries={['/']}>
      <SearchProvider>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/search" element={<p>search page</p>} />
        </Routes>
      </SearchProvider>
    </MemoryRouter>,
  );
const hrefs = (name: RegExp) => screen.getAllByRole('link', { name }).map((a) => a.getAttribute('href'));

describe('home page (signed out)', () => {
  it('has one main heading and says what flexfare is', () => {
    signedOut();
    setup();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain("Pick the week.");
    expect(screen.getByText(/prices the best-fitting days across every airport/)).toBeTruthy();
  });

  it('invites you to sign up or try the sample, from the top and the bottom', () => {
    signedOut();
    setup();
    expect(hrefs(/Sign up free/).filter((h) => h === '/signup').length).toBeGreaterThanOrEqual(3); // header, hero, closing band
    expect(hrefs(/See a sample search/)).toEqual(['/demo', '/demo']);
    expect(screen.getByText(/Free accounts · 4 regular searches and 1 Deep Search a day · No card/)).toBeTruthy();
  });

  it('is its own page, not the search form with the controls locked', () => {
    signedOut();
    setup();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByRole('group', { name: 'Weeks' })).toBeNull();
    expect(screen.queryByText(/This is a preview/)).toBeNull();
    expect(screen.queryByRole('button', { name: /Curate my routes/ })).toBeNull();
  });

  it('shows two real example results, labelled as made up, linking into the demo', () => {
    signedOut();
    setup();
    const sample = screen.getByRole('region', { name: 'A short list, with the reasons.' });
    expect(within(sample).getByText(/fares are made up for the example/)).toBeTruthy();
    const detail = within(sample).getAllByRole('link', { name: /View route/ }).map((a) => a.getAttribute('href'));
    expect(detail).toHaveLength(2);
    for (const h of detail) expect(h).toMatch(/^\/demo\/route\//);
    expect(within(sample).getByRole('link', { name: /See the whole sample search/ }).getAttribute('href')).toBe('/demo');
  });

  it('has the sections a home page needs, each with a heading', () => {
    signedOut();
    setup();
    for (const name of ['A short list, with the reasons.', 'Why use flexfare.', 'Built for people whose plans are a little loose.', 'Free, with daily searches.', 'Questions.', 'Find the week that costs less.']) {
      expect(screen.getByRole('heading', { name }), name).toBeTruthy();
    }
    for (const feature of ['No more checking seven dates', 'Cheaper airports, found for you', 'An AI that shows its work', 'You choose where to book']) {
      expect(screen.getByRole('heading', { name: feature })).toBeTruthy();
    }
  });

  it("doesn't repeat itself: no heading appears twice on the page", () => {
    signedOut();
    setup();
    const titles = screen.getAllByRole('heading').map((h) => h.textContent);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it('spells out the free plan: 4 regular searches and 1 Deep Search a day', () => {
    signedOut();
    setup();
    const plan = screen.getByRole('region', { name: 'Free, with daily searches.' });
    expect(within(plan).getByRole('heading', { name: 'Regular searches' })).toBeTruthy();
    expect(within(plan).getByRole('heading', { name: 'Deep Search' })).toBeTruthy();
    expect(within(plan).getByText('4')).toBeTruthy();
    expect(within(plan).getByText('1')).toBeTruthy();
    expect(within(plan).getByText(/reset at 00:00 UTC/)).toBeTruthy();
  });

  it('answers the real questions people have, truthfully', () => {
    signedOut();
    setup();
    const faq = screen.getByRole('region', { name: 'Questions.' });
    const questions = Array.from(faq.querySelectorAll('summary')).map((s) => s.textContent);
    expect(questions).toEqual([
      'Does flexfare sell tickets?', 'Where do the prices come from?', 'What does the AI actually do?', 'Why do I need an account?',
      'What is the phone number for?', 'Can I try it first?', 'How far ahead can I search?',
    ]);
    expect(faq.querySelectorAll('details')).toHaveLength(7);
    expect(within(faq).getByText(/No\. flexfare finds and ranks flights/)).toBeTruthy();
    expect(within(faq).getByText(/Each phone number can be linked to only one flexfare account/)).toBeTruthy();
    expect(within(faq).getByText(/store only a scrambled version of it and never share it/)).toBeTruthy();
    // the page may not claim a phone check that doesn't exist (nobody is texted a code)
    expect(faq.textContent).not.toMatch(/\b(sms|text message|texted a code|verification code (by|via) (text|phone))/i);
    expect(within(faq).getByText(/treat every price as an estimate/)).toBeTruthy();
    expect(within(faq).getByRole('link', { name: 'sample search' }).getAttribute('href')).toBe('/demo');
  });

  it('puts How it works and FAQ in the header, linking to sections on the page', () => {
    signedOut();
    setup();
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    expect(within(nav).getByRole('link', { name: 'How it works' }).getAttribute('href')).toBe('#how');
    expect(within(nav).getByRole('link', { name: 'FAQ' }).getAttribute('href')).toBe('#faq');
    expect(document.getElementById('how')).toBeTruthy();
    expect(document.getElementById('faq')).toBeTruthy();
    expect(within(nav).getByRole('link', { name: 'Sign in' }).getAttribute('href')).toBe('/signin');
  });

  it('sends signed-in people straight to the search, but not while auth is still loading', () => {
    auth = { user: { uid: 'u' }, loading: false, emailVerified: true, phoneOnFile: true, signOut: vi.fn() };
    setup();
    expect(screen.getByText('search page')).toBeTruthy();
    cleanup();
    auth = { user: { uid: 'u' }, loading: true, emailVerified: true, phoneOnFile: true, signOut: vi.fn() };
    setup();
    expect(screen.queryByText('search page')).toBeNull();
  });
});
