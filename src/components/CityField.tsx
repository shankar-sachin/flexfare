import { useEffect, useId, useRef, useState } from 'react';
import { searchCities } from '../lib/api';
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

/** A city (not airport) autocomplete. Shows which airports the city expands to. */
export function CityField({ label, value, onChange, disabled }: Props) {
  const id = useId();
  const listId = `${id}-list`;
  const { rememberCity } = useSearch();
  const [text, setText] = useState(value.name);
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<City[]>(POPULAR_CITIES);
  const [active, setActive] = useState(0);
  const [failed, setFailed] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    setText(value.name);
  }, [value.name]);

  // Debounced live search; short input falls back to the popular list.
  useEffect(() => {
    if (!open) return;
    const q = text.trim();
    if (q === value.name) {
      // Untouched field: offer every popular city, not just the one already chosen.
      setOptions(POPULAR_CITIES);
      setFailed(false);
      return;
    }
    if (q.length < 2) {
      setOptions(POPULAR_CITIES.filter((c) => c.name.toLowerCase().includes(q.toLowerCase())));
      setFailed(false);
      return;
    }
    const mine = ++seq.current;
    const t = setTimeout(() => {
      searchCities(q)
        .then((cities) => mine === seq.current && (setOptions(cities), setActive(0), setFailed(false)))
        .catch(() => mine === seq.current && (setOptions([]), setFailed(true)));
    }, 200);
    return () => clearTimeout(t);
  }, [text, open, value.name]);

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

  return (
    <div className="city-field">
      <label htmlFor={id} className="label">{label}</label>
      <input
        id={id}
        type="text"
        role="combobox"
        autoComplete="off"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && options[active] ? `${id}-opt-${active}` : undefined}
        value={text}
        onFocus={(e) => (e.currentTarget.select(), setOpen(true))}
        onChange={(e) => (setText(e.target.value), setOpen(true))}
        onBlur={() => (setOpen(false), setText(value.name))}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') (e.preventDefault(), setOpen(true), setActive((i) => Math.min(options.length - 1, i + 1)));
          else if (e.key === 'ArrowUp') (e.preventDefault(), setActive((i) => Math.max(0, i - 1)));
          else if (e.key === 'Enter' && open && options[active]) (e.preventDefault(), pick(options[active]));
          else if (e.key === 'Escape') (setOpen(false), setText(value.name));
        }}
      />
      <span className="muted" style={{ fontSize: 14 }}>{detailOf(value)}</span>
      {open && (
        <ul id={listId} role="listbox" aria-label={`${label} suggestions`} className="combo-list">
          {options.map((c, i) => (
            <li
              key={c.code}
              id={`${id}-opt-${i}`}
              role="option"
              aria-selected={i === active}
              className="combo-opt"
              onMouseDown={(e) => (e.preventDefault(), pick(c))}
              onMouseEnter={() => setActive(i)}
            >
              <strong>{c.name}</strong>
              <span className="muted">{[c.country, c.airports.length > 1 ? c.airports.join(' · ') : c.airports[0]].filter(Boolean).join(' · ')}</span>
            </li>
          ))}
          {options.length === 0 && <li className="combo-empty muted">{failed ? 'City search is unavailable right now.' : 'No cities found.'}</li>}
        </ul>
      )}
    </div>
  );
}
