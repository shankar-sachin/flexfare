// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { POPULAR_CITIES } from '../lib/popularCities';
import { SearchProvider } from '../lib/SearchContext';
import type { SearchQuery } from '../shared/types';
import { upcomingWeeks } from '../shared/weeks';
import { SearchPanel } from './SearchPanel';

afterEach(cleanup);
const weeks = upcomingWeeks(12, new Date('2026-10-01T12:00:00Z'));
const city = (code: string) => POPULAR_CITIES.find((c) => c.code === code)!;
const initial: SearchQuery = {
  trip: 'round', extraLegs: [], from: city('SFO'), to: city('LIS'), departWeek: weeks[2], returnWeek: weeks[4],
  travelers: 1, cabin: 'economy', stay: 'range', priority: 'balance', depth: 'regular',
};

/** Holds the query in state, like the real search page does. */
function Harness({ readOnly = false, start = initial }: { readOnly?: boolean; start?: SearchQuery }) {
  const [q, setQ] = useState(start);
  return (
    <SearchProvider>
      <SearchPanel query={q} weeks={weeks} fares={[]} onChange={readOnly ? undefined : (patch) => setQ((x) => ({ ...x, ...patch }))} footer={<span data-testid="trip">{q.trip}</span>} />
    </SearchProvider>
  );
}
const setup = async (props: Parameters<typeof Harness>[0] = {}) => {
  render(<Harness {...props} />);
};
const tab = (name: string) => screen.getByRole('button', { name });
const pressed = (name: string) => tab(name).getAttribute('aria-pressed') === 'true';

describe('trip type tabs', () => {
  it('offers round trip, one way and multi-city, starting on round trip', async () => {
    await setup();
    expect(pressed('Round trip')).toBe(true);
    expect(pressed('One way')).toBe(false);
    expect(pressed('Multi-city')).toBe(false);
  });

  it('round trip asks for two weeks and the stay length', async () => {
    await setup();
    expect(screen.getByText('Which weeks could you go?')).toBeTruthy();
    expect(screen.getByText('How long do you want to stay?')).toBeTruthy();
    expect(screen.getByText(/Leave .* → Return/)).toBeTruthy();
  });

  it('one way asks for a single week, has no return and no stay length', async () => {
    await setup();
    fireEvent.click(tab('One way'));
    expect(pressed('One way')).toBe(true);
    expect(screen.getByText('Which week could you go?')).toBeTruthy();
    expect(screen.getByText(/One way, leaving the week of/)).toBeTruthy();
    expect(screen.queryByText('How long do you want to stay?')).toBeNull();
    expect(screen.queryByText(/now pick a return week/)).toBeNull();
  });

  it('in one way mode every click on a week picks the leave week', async () => {
    await setup();
    fireEvent.click(tab('One way'));
    const row = (name: RegExp) => screen.getAllByRole('button', { name })[0] as HTMLButtonElement;
    fireEvent.click(row(/^Week 45,/));
    expect(row(/^Week 45,/).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(row(/^Week 42,/)); // an earlier week works too: still one way
    expect(row(/^Week 42,/).getAttribute('aria-pressed')).toBe('true');
    expect(row(/^Week 45,/).getAttribute('aria-pressed')).toBe('false');
    expect(screen.queryAllByRole('button', { name: /Return week/ })).toHaveLength(0);
    expect(screen.getByTestId('trip').textContent).toBe('oneway');
  });

  it('switching back to round trip suggests a return week', async () => {
    await setup();
    fireEvent.click(tab('One way'));
    fireEvent.click(tab('Round trip'));
    expect(screen.getByText(/Leave .* → Return/)).toBeTruthy();
    expect(screen.getByText('How long do you want to stay?')).toBeTruthy();
  });

  it('multi-city shows two flights, each with cities and a week, and no stay length', async () => {
    await setup();
    fireEvent.click(tab('Multi-city'));
    expect(screen.getByRole('heading', { name: 'Your flights' })).toBeTruthy();
    expect(screen.getByText('Flight 1')).toBeTruthy();
    expect(screen.getByText('Flight 2')).toBeTruthy();
    expect(screen.getAllByLabelText('From city').length).toBe(2); // each flight has its own cities
    expect(screen.getAllByLabelText('To city').length).toBe(2);
    expect(screen.getAllByLabelText('Leaves').length).toBe(2);
    expect(screen.queryByText('How long do you want to stay?')).toBeNull();
    expect(screen.queryByRole('group', { name: 'Weeks' })).toBeNull();
    // the second flight starts where the first ends and heads home
    const flight2 = within(screen.getByText('Flight 2').closest('fieldset')!);
    expect((flight2.getByLabelText('From city') as HTMLInputElement).value).toBe('Lisbon');
    expect((flight2.getByLabelText('To city') as HTMLInputElement).value).toBe('San Francisco');
  });

  it('multi-city: add up to four flights, and remove them down to two', async () => {
    await setup();
    fireEvent.click(tab('Multi-city'));
    const add = () => screen.getByRole('button', { name: 'Add another flight' });
    fireEvent.click(add());
    expect(screen.getByText('Flight 3')).toBeTruthy();
    fireEvent.click(add());
    expect(screen.getByText('Flight 4')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add another flight' })).toBeNull(); // four is the most
    fireEvent.click(screen.getByRole('button', { name: 'Remove flight 4' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove flight 3' }));
    expect(screen.getByText('Flight 2')).toBeTruthy();
    expect(screen.queryByText('Flight 3')).toBeNull();
    expect(screen.queryByRole('button', { name: /Remove flight/ })).toBeNull(); // never fewer than two
  });

  it('multi-city: changing a flight\'s week updates that flight', async () => {
    await setup();
    fireEvent.click(tab('Multi-city'));
    const selects = screen.getAllByLabelText('Leaves') as HTMLSelectElement[];
    fireEvent.change(selects[1], { target: { value: weeks[8].start } });
    expect((screen.getAllByLabelText('Leaves') as HTMLSelectElement[])[1].value).toBe(weeks[8].start);
    expect((screen.getAllByLabelText('Leaves') as HTMLSelectElement[])[0].value).toBe(weeks[2].start);
  });

  it('the tabs are locked in the signed-out preview', async () => {
    await setup({ readOnly: true });
    for (const name of ['Round trip', 'One way', 'Multi-city']) expect((tab(name) as HTMLButtonElement).disabled).toBe(true);
  });
});
