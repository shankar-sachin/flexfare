import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { loadCityIndex, type CityIndex } from '../lib/cityIndex';
import { POPULAR_CITIES } from '../lib/popularCities';
import { useSearch } from '../lib/SearchContext';
import type { City } from '../shared/types';

interface Props {
  label: string;
  value: City;
  onChange?: (c: City) => void;
  /** Read-only (signed-out landing page). */
  disabled?: boolean;
}

const detailOf = (value: City) =>
  [
    value.airports.length > 1 ? `All airports · ${value.airports.join(' · ')}` : value.airports[0],
    ...(value.nearby ?? []).map((n) => `plus nearby: ${n.city} (${n.airport}) by ${n.transfer.replace(/^[\dhm ]+/, '')}`),
  ].join(' · ');

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Bolds the part of `text` you've typed (at the start of a word), so you can see why a city matched. */
function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  const m = q ? new RegExp(`(^|[\\s(-])(${escapeRe(q)})`, 'i').exec(text) : null;
  if (!m) return <>{text}</>;
  const start = m.index + m[1].length;
  return (
    <>
      {text.slice(0, start)}
      <mark className="combo-mark">{text.slice(start, start + q.length)}</mark>
      {text.slice(start + q.length)}
    </>
  );
}

/**
 * A city (not airport) picker. The list updates on every keystroke from a bundled index of every city with
 * airline service, so it needs no network and shows matches from the first letter.
 */
export function CityField({ label, value, onChange, disabled }: Props) {
  const id = useId();
  const listId = `${id}-list`;
  const { rememberCity } = useSearch();
  const [text, setText] = useState(value.name);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [index, setIndex] = useState<CityIndex | null>(null);
  const activeRef = useRef<HTMLLIElement | null>(null);

  useEffect(() => {
    setText(value.name);
  }, [value.name]);

  // Start loading the city list as soon as the field exists, so it's ready before the first keystroke.
  useEffect(() => {
    if (disabled) return;
    let live = true;
    loadCityIndex().then((i) => live && setIndex(i)).catch(() => undefined);
    return () => {
      live = false;
    };
  }, [disabled]);

  // An untouched field (still showing the chosen city) lists the popular cities, not just that one.
  const query = text === value.name ? '' : text;
  const options = useMemo<City[]>(() => {
    if (index) return index.search(query, 8);
    const q = query.trim().toLowerCase(); // the list is still loading: filter the small built-in set
    return POPULAR_CITIES.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 8);
  }, [index, query]);

  useEffect(() => {
    setActive(0);
  }, [query]);
  useEffect(() => {
    activeRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [active, open]);

  const pick = (c: City) => {
    rememberCity(c);
    onChange?.(c);
    setText(c.name);
    setOpen(false);
  };

  if (disabled || !onChange) {
    return (
      <div className="city-field city-field--static" aria-disabled="true">
        <span className="label">{label}</span>
        <span className="city-field__value">{value.name}</span>
        <span className="muted" style={{ fontSize: 14 }}>{detailOf(value)}</span>
      </div>
    );
  }

  const move = (delta: number) => setActive((i) => (options.length === 0 ? 0 : (i + delta + options.length) % options.length));

  return (
    <div className="city-field">
      <label htmlFor={id} className="label">{label}</label>
      <input
        id={id}
        type="text"
        role="combobox"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && options[active] ? `${id}-opt-${active}` : undefined}
        value={text}
        onFocus={(e) => (e.currentTarget.select(), setOpen(true))}
        onChange={(e) => (setText(e.target.value), setOpen(true))}
        onBlur={() => (setOpen(false), setText(value.name))}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') (e.preventDefault(), setOpen(true), move(1));
          else if (e.key === 'ArrowUp') (e.preventDefault(), setOpen(true), move(-1));
          else if (e.key === 'Home' && open) (e.preventDefault(), setActive(0));
          else if (e.key === 'End' && open) (e.preventDefault(), setActive(Math.max(0, options.length - 1)));
          else if (e.key === 'Enter' && open && options[active]) (e.preventDefault(), pick(options[active]));
          else if (e.key === 'Escape') (setOpen(false), setText(value.name));
        }}
      />
      <span className="muted" style={{ fontSize: 14 }}>{detailOf(value)}</span>
      <div role="status" className="sr-only" aria-live="polite">
        {open ? (options.length ? `${options.length} ${options.length === 1 ? 'city' : 'cities'} found` : 'No cities found') : ''}
      </div>
      {open && (
        <ul id={listId} role="listbox" aria-label={`${label} suggestions`} className="combo-list">
          {options.map((c, i) => (
            <li
              key={c.code}
              id={`${id}-opt-${i}`}
              ref={i === active ? activeRef : undefined}
              role="option"
              aria-selected={i === active}
              className="combo-opt"
              onMouseDown={(e) => (e.preventDefault(), pick(c))}
              onMouseEnter={() => setActive(i)}
            >
              <strong>
                <Highlight text={c.name} query={query} />
              </strong>
              <span className="muted">
                {[c.country, c.airports.join(' · ')].filter(Boolean).map((part, k) => (
                  <span key={k}>
                    {k > 0 && ' · '}
                    <Highlight text={part!} query={query} />
                  </span>
                ))}
              </span>
            </li>
          ))}
          {options.length === 0 && <li className="combo-empty muted">No cities match “{query}”. Try the city's name or an airport code like SFO.</li>}
        </ul>
      )}
    </div>
  );
}
