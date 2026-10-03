// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadCityIndex } from '../lib/cityIndex';
import { SearchProvider } from '../lib/SearchContext';
import type { City } from '../shared/types';
import { CityField } from './CityField';

const sfo: City = { code: 'SFO', name: 'San Francisco', airports: ['SFO', 'OAK', 'SJC'] };

/** Renders the field and waits for its city list to finish loading (a few ms in real life). */
const setup = async (onChange = vi.fn()) => {
  render(
    <SearchProvider>
      <CityField label="To city" value={sfo} onChange={onChange} />
    </SearchProvider>,
  );
  await act(async () => {
    await loadCityIndex();
  });
  return { onChange, input: screen.getByRole('combobox') as HTMLInputElement };
};
const type = (input: HTMLInputElement, value: string) => fireEvent.change(input, { target: { value } });
const optionNames = () => screen.queryAllByRole('option').map((o) => o.querySelector('strong')?.textContent);

beforeEach(async () => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('the city search must not use the network'))));
  await loadCityIndex(); // so the first keystroke already has the full list
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('CityField', () => {
  it('shows the airports a city expands to', async () => {
    await setup();
    expect(screen.getByText(/All airports · SFO · OAK · SJC/)).toBeTruthy();
  });

  it('lists popular cities as soon as you focus it, not just the one already chosen', async () => {
    const { input } = await setup();
    fireEvent.focus(input);
    await waitFor(() => expect(optionNames().length).toBe(8));
    expect(optionNames()[0]).toBe('New York');
  });

  it('updates the list on every single keystroke, synchronously', async () => {
    const { input } = await setup();
    fireEvent.focus(input);
    let previous: (string | null | undefined)[] = [];
    for (const typed of ['l', 'li', 'lis', 'lisb', 'lisbo', 'lisbon']) {
      type(input, typed);
      const now = optionNames(); // read right after the keystroke: no waiting, no debounce
      expect(now.length, typed).toBeGreaterThan(0);
      previous = now;
    }
    expect(previous[0]).toBe('Lisbon');
    type(input, 'l');
    expect(optionNames()).not.toEqual(previous); // the list really changed with the letters
  });

  it('works from the first letter', async () => {
    const { input } = await setup();
    fireEvent.focus(input);
    type(input, 's');
    expect(optionNames().length).toBe(8);
    expect(optionNames()).toContain('Seattle');
  });

  it('matches airport codes and says which one matched', async () => {
    const { input } = await setup();
    fireEvent.focus(input);
    type(input, 'oak');
    expect(optionNames()[0]).toBe('San Francisco');
    expect(document.querySelector('.combo-mark')?.textContent).toBe('OAK');
  });

  it('highlights the letters you typed', async () => {
    const { input } = await setup();
    fireEvent.focus(input);
    type(input, 'san f');
    expect(optionNames()[0]).toBe('San Francisco');
    expect(document.querySelector('.combo-mark')?.textContent).toBe('San F');
  });

  it('selects with Enter after moving with the arrow keys', async () => {
    const { input, onChange } = await setup();
    fireEvent.focus(input);
    type(input, 'portugal');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledTimes(1);
    const picked = onChange.mock.calls[0][0] as City;
    expect(picked.country).toBe('Portugal');
    expect(picked.code).not.toBe('LIS'); // moved down one from the best-known (Lisbon)
  });

  it('selects the top match with Enter, and shows the chosen city', async () => {
    const { input, onChange } = await setup();
    fireEvent.focus(input);
    type(input, 'lisb');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ code: 'LIS', name: 'Lisbon' }));
    expect(input.value).toBe('Lisbon');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('wraps around with ArrowUp/ArrowDown and jumps with Home/End', async () => {
    const { input } = await setup();
    fireEvent.focus(input);
    type(input, 'san');
    const selected = () => screen.getAllByRole('option').findIndex((o) => o.getAttribute('aria-selected') === 'true');
    const last = optionNames().length - 1;
    expect(selected()).toBe(0);
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(selected()).toBe(last);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(selected()).toBe(0);
    fireEvent.keyDown(input, { key: 'End' });
    expect(selected()).toBe(last);
    fireEvent.keyDown(input, { key: 'Home' });
    expect(selected()).toBe(0);
  });

  it('picks with a click', async () => {
    const { input, onChange } = await setup();
    fireEvent.focus(input);
    type(input, 'tok');
    fireEvent.mouseDown(screen.getAllByRole('option')[0]);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ code: 'TYO' }));
  });

  it('closes on Escape and restores the current city', async () => {
    const { input } = await setup();
    fireEvent.focus(input);
    type(input, 'xx');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input.value).toBe('San Francisco');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('says so, and gives a hint, when nothing matches', async () => {
    const { input } = await setup();
    fireEvent.focus(input);
    type(input, 'qqqzzz');
    expect(screen.getByText(/No cities match “qqqzzz”/)).toBeTruthy();
    expect(screen.getByText(/airport code like SFO/)).toBeTruthy();
  });

  it('tells screen readers how many results there are', async () => {
    const { input } = await setup();
    fireEvent.focus(input);
    type(input, 'lisbon');
    expect(screen.getByRole('status').textContent).toMatch(/\d+ (city|cities) found/);
    type(input, 'qqqzzz');
    expect(screen.getByRole('status').textContent).toBe('No cities found');
  });

  it('never touches the network', async () => {
    const { input } = await setup();
    fireEvent.focus(input);
    for (const t of ['p', 'pa', 'par', 'pari', 'paris']) type(input, t);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('is read-only when disabled', () => {
    render(
      <SearchProvider>
        <CityField label="From city" value={sfo} disabled />
      </SearchProvider>,
    );
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getByText('San Francisco')).toBeTruthy();
  });
});
