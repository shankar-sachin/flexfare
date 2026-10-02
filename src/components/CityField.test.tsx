// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SearchProvider } from '../lib/SearchContext';
import type { City } from '../shared/types';

// A plain function (not vi.fn): the spy's own copy of a rejected promise is reported as unhandled.
const calls: string[] = [];
let searchImpl: (q: string) => Promise<City[]> = async () => [];
const searchCities = (q: string) => (calls.push(q), searchImpl(q));
vi.mock('../lib/api', () => ({ searchCities: (q: string) => searchCities(q) }));
const { CityField } = await import('./CityField');

const sfo: City = { code: 'SFO', name: 'San Francisco', airports: ['SFO', 'OAK', 'SJC'] };
const porto: City = { code: 'OPO', name: 'Porto', country: 'Portugal', airports: ['OPO'] };
const lisbon: City = { code: 'LIS', name: 'Lisbon', country: 'Portugal', airports: ['LIS'] };

const setup = (onChange = vi.fn()) => {
  render(
    <SearchProvider>
      <CityField label="To city" value={sfo} onChange={onChange} />
    </SearchProvider>,
  );
  return { onChange, input: screen.getByRole('combobox') as HTMLInputElement };
};

beforeEach(() => {
  calls.length = 0;
  searchImpl = async () => [];
});
afterEach(cleanup);

describe('CityField', () => {
  it('shows the airports a city expands to', () => {
    setup();
    expect(screen.getByText(/All airports · SFO · OAK · SJC/)).toBeTruthy();
  });

  it('searches as you type and picks with the keyboard', async () => {
    searchImpl = async () => [lisbon, porto];
    const { onChange, input } = setup();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'por' } });
    await waitFor(() => expect(calls).toContain('por'), { timeout: 1000 });
    await screen.findByText('Porto');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith(porto);
  });

  it('shows popular cities for short input without calling the API', () => {
    const { input } = setup();
    fireEvent.focus(input);
    expect(screen.getAllByRole('option').length).toBeGreaterThan(3);
    expect(calls).toHaveLength(0);
  });

  it('closes on Escape and restores the current city', () => {
    const { input } = setup();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'xx' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input.value).toBe('San Francisco');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('says so when city search is unavailable', async () => {
    searchImpl = () => Promise.reject(new Error('down'));
    const { input } = setup();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'zzz' } });
    await screen.findByText(/unavailable/i, undefined, { timeout: 1500 });
  });
});
