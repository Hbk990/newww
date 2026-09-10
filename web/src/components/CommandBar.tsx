import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type Car, type Party } from '../lib/api';
import { KIND_COLOUR, initialsOf, type Kind } from './Chip';

/**
 * JUMP TO ANYTHING — Ctrl + K.
 *
 * With three hundred cars, walking to the right screen and searching is the
 * slowest thing in the day. Type part of a chassis number, a buyer's name, a
 * supplier or a brand and go straight there. The pages themselves are listed
 * too, so it doubles as a way to move around without the mouse.
 *
 * It searches the server rather than a copy held here: a stale list would send
 * you to a car that has already been sold.
 */

interface Result {
  id: string;
  title: string;
  sub?: string;
  to: string;
  kind: Kind | 'page';
}

const PAGES: Result[] = [
  { id: 'p-dash', title: 'Dashboard', to: '/', kind: 'page' },
  { id: 'p-buy', title: 'Buy a car', to: '/buy', kind: 'page' },
  { id: 'p-cars', title: 'All cars', to: '/cars', kind: 'page' },
  { id: 'p-ship', title: 'Shipments', to: '/shipments', kind: 'page' },
  { id: 'p-garage', title: 'Garage', to: '/garage', kind: 'page' },
  { id: 'p-showroom', title: 'Showroom', to: '/showroom', kind: 'page' },
  { id: 'p-sales', title: 'Sales', to: '/sales', kind: 'page' },
  { id: 'p-accounts', title: 'Accounts', to: '/accounts', kind: 'page' },
  { id: 'p-money', title: 'Payments', to: '/money', kind: 'page' },
  { id: 'p-expenses', title: 'Expenses', to: '/expenses', kind: 'page' },
  { id: 'p-reports', title: 'Reports', to: '/reports', kind: 'page' },
  { id: 'p-analysis', title: 'Analysis', to: '/analysis', kind: 'page' },
  { id: 'p-settings', title: 'Settings', to: '/settings', kind: 'page' },
];

const PARTY_KIND: Record<string, Kind> = {
  CAR_SUPPLIER: 'supplier',
  SHIPPING_COMPANY: 'shipping',
  TRANSFER_COMPANY: 'transfer',
  WORKER: 'worker',
  PARTS_SUPPLIER: 'parts',
  CUSTOMER: 'customer',
};

export function CommandBar() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<Result[]>([]);
  const [cursor, setCursor] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  // Ctrl+K anywhere, and Escape to leave.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((was) => !was);
      }
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery('');
      setFound([]);
      setCursor(0);
      setTimeout(() => input.current?.focus(), 20);
    }
  }, [open]);

  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setFound([]);
      return;
    }
    const timer = setTimeout(async () => {
      const q = encodeURIComponent(query.trim());
      const [cars, parties] = await Promise.all([
        api.get<Car[]>(`/api/cars?search=${q}`).catch(() => []),
        api.get<Party[]>(`/api/parties?search=${q}`).catch(() => []),
      ]);
      setFound([
        ...cars.slice(0, 8).map((car) => ({
          id: `car-${car.id}`,
          title: `${car.year} ${car.makeName} ${car.modelName}`,
          sub: `${car.color} · ${car.vin} · ${car.status.replace('_', ' ').toLowerCase()}`,
          to: `/cars/${car.id}`,
          kind: 'car' as const,
        })),
        ...parties.slice(0, 8).map((party) => ({
          id: `party-${party.id}`,
          title: party.name,
          sub: [party.companyName, party.type.replace('_', ' ').toLowerCase()].filter(Boolean).join(' · '),
          to: `/accounts/${party.id}`,
          kind: PARTY_KIND[party.type] ?? ('supplier' as Kind),
        })),
      ]);
      setCursor(0);
    }, 180);
    return () => clearTimeout(timer);
  }, [query, open]);

  const results = useMemo(() => {
    const text = query.trim().toLowerCase();
    const pages = text
      ? PAGES.filter((page) => page.title.toLowerCase().includes(text))
      : PAGES.slice(0, 6);
    return [...found, ...pages].slice(0, 14);
  }, [found, query]);

  if (!open) return null;

  const go = (result: Result) => {
    setOpen(false);
    navigate(result.to);
  };

  return (
    <div className="palette-backdrop" onClick={() => setOpen(false)}>
      <div className="palette" onClick={(event) => event.stopPropagation()}>
        <input
          ref={input}
          value={query}
          placeholder="A chassis number, a buyer, a supplier, a page…"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setCursor((n) => Math.min(n + 1, results.length - 1));
            }
            if (event.key === 'ArrowUp') {
              event.preventDefault();
              setCursor((n) => Math.max(n - 1, 0));
            }
            if (event.key === 'Enter' && results[cursor]) go(results[cursor]);
          }}
        />

        <div className="results">
          {results.length === 0 ? (
            <div className="small muted" style={{ padding: 14 }}>
              {query.trim().length < 2 ? 'Type at least two letters.' : 'Nothing matches that.'}
            </div>
          ) : (
            results.map((result, index) => (
              <button
                key={result.id}
                className={`result${index === cursor ? ' on' : ''}`}
                onMouseEnter={() => setCursor(index)}
                onClick={() => go(result)}
              >
                <span
                  className="avatar"
                  style={{
                    background: result.kind === 'page' ? 'var(--muted)' : KIND_COLOUR[result.kind],
                    width: 26,
                    height: 26,
                    borderRadius: 999,
                    display: 'grid',
                    placeItems: 'center',
                    color: '#fff',
                    fontSize: 11,
                    fontWeight: 800,
                    flex: '0 0 auto',
                  }}
                >
                  {result.kind === 'page' ? '→' : initialsOf(result.title)}
                </span>
                <span style={{ minWidth: 0 }}>
                  <div className="title">{result.title}</div>
                  {result.sub && <div className="sub">{result.sub}</div>}
                </span>
              </button>
            ))
          )}
        </div>

        <div className="foot">
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> move
          </span>
          <span>
            <kbd>enter</kbd> open
          </span>
          <span>
            <kbd>esc</kbd> close
          </span>
        </div>
      </div>
    </div>
  );
}
