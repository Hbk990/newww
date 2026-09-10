import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader, useApp } from '../App';
import { api, fmt, fmtDate, todayIso, type Car, type Party } from '../lib/api';
import { Alert, Card, Empty, Field, Modal, Spinner, StatusBadge, Toasts, useSubmit, useToasts } from '../components/ui';
import { MoneyInput } from '../components/MoneyInput';
import { photoUrl, type Photo } from '../components/Photos';
import { CancelReservationModal, ReserveModal } from '../components/ReserveModal';
import { PriceModal } from '../components/PriceModal';

/**
 * THE SHOWROOM.
 *
 * Two ways to look at the same cars:
 *
 *  · Working — the list down the left, the chosen car filling the right. This
 *    is the one for getting through fifty cars: click, price, sell, next, with
 *    no page ever reloading and the arrow keys moving down the list.
 *  · Cards — what you turn the screen round to show a customer.
 *
 * Photos are never required. A car without one gets its own plate rather than
 * an empty grey hole, because most cars will not have photos on the day they
 * arrive and the screen should not look broken for it.
 */

type View = 'working' | 'cards';
type Sort = 'oldest' | 'newest' | 'cost' | 'price' | 'profit';

export default function Showroom() {
  const { cfa } = useApp();
  const { toasts, push } = useToasts();

  const [cars, setCars] = useState<Car[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<View>(() =>
    (localStorage.getItem('showroom-view') as View) === 'cards' ? 'cards' : 'working',
  );
  const [condition, setCondition] = useState<'all' | 'clean' | 'repaired'>('all');
  const [priced, setPriced] = useState<'all' | 'priced' | 'unpriced'>('all');
  const [held, setHeld] = useState<'all' | 'held' | 'free'>('all');
  const [sort, setSort] = useState<Sort>('oldest');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [hidden, setHidden] = useState<string[]>([]);

  const [selling, setSelling] = useState<Car | null>(null);
  const [reserving, setReserving] = useState<Car | null>(null);
  const [cancelling, setCancelling] = useState<Car | null>(null);
  const [pricing, setPricing] = useState<Car | null>(null);

  const load = () =>
    api
      .get<Car[]>(`/api/showroom${search ? `?search=${encodeURIComponent(search)}` : ''}`)
      .then(setCars)
      .catch((e) => setError(e.message));

  useEffect(() => {
    const timer = setTimeout(() => void load(), 200);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => localStorage.setItem('showroom-view', view), [view]);

  const shown = useMemo(
    () =>
      (cars ?? [])
        .filter((car) => (condition === 'all' ? true : condition === 'repaired' ? car.damaged : !car.damaged))
        .filter((car) =>
          priced === 'all' ? true : priced === 'priced' ? Boolean(car.askingPriceCfa) : !car.askingPriceCfa,
        )
        .filter((car) => (held === 'all' ? true : held === 'held' ? Boolean(car.reservation) : !car.reservation))
        .sort((a, b) => {
          switch (sort) {
            case 'newest':
              return (a.daysInStock ?? 0) - (b.daysInStock ?? 0);
            case 'cost':
              return Number(b.costs.landedCostCfa ?? 0) - Number(a.costs.landedCostCfa ?? 0);
            case 'price':
              return Number(b.askingPriceCfa ?? 0) - Number(a.askingPriceCfa ?? 0);
            case 'profit':
              return Number(b.potentialProfitCfa ?? 0) - Number(a.potentialProfitCfa ?? 0);
            default:
              return (b.daysInStock ?? 0) - (a.daysInStock ?? 0);
          }
        }),
    [cars, condition, priced, held, sort],
  );

  // Keep something selected, and never something that has just been filtered
  // away or sold.
  const selected = shown.find((car) => car.id === selectedId) ?? shown[0] ?? null;
  useEffect(() => {
    if (selected && selected.id !== selectedId) setSelectedId(selected.id);
  }, [selected?.id]);

  /** Up and down move through the list without touching the mouse. */
  useEffect(() => {
    if (view !== 'working') return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      const target = event.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      event.preventDefault();
      const index = shown.findIndex((car) => car.id === selected?.id);
      const next = shown[index + (event.key === 'ArrowDown' ? 1 : -1)];
      if (next) setSelectedId(next.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view, shown, selected?.id]);

  const done = (message: string) => {
    push(message);
    void load();
  };

  const stockValue = shown.reduce((sum, car) => sum + Number(car.costs.landedCostCfa ?? 0), 0);
  const unpriced = (cars ?? []).filter((car) => !car.askingPriceCfa).length;
  const sittingLong = (cars ?? []).filter((car) => (car.daysInStock ?? 0) >= 60).length;
  const reserved = (cars ?? []).filter((car) => car.reservation);
  const depositsHeld = reserved.reduce((sum, car) => sum + Number(car.reservation?.depositCfa ?? 0), 0);

  const actions = {
    sell: setSelling,
    hold: setReserving,
    release: setCancelling,
    price: setPricing,
  };

  return (
    <div className="page">
      <PageHeader
        title="Showroom"
        sub={
          cars
            ? `${cars.length} car${cars.length === 1 ? '' : 's'} · ${fmt(stockValue.toFixed(0))} ${cfa} tied up`
            : 'Ready to sell, with what each one really cost you'
        }
        action={
          <div className="view-switch">
            <button className={view === 'working' ? 'on' : ''} onClick={() => setView('working')}>
              Working
            </button>
            <button className={view === 'cards' ? 'on' : ''} onClick={() => setView('cards')}>
              Cards
            </button>
          </div>
        }
      />

      {sittingLong > 0 && !hidden.includes('old') && (
        <Alert
          kind="warn"
          onDismiss={() => setHidden([...hidden, 'old'])}
          onAct={() => {
            setSort('oldest');
            setHeld('all');
          }}
          actLabel="Show the oldest first"
        >
          {sittingLong} car{sittingLong > 1 ? 's have' : ' has'} been here 60 days or more. Money sitting still.
        </Alert>
      )}
      {reserved.length > 0 && !hidden.includes('held') && (
        <Alert kind="info" onDismiss={() => setHidden([...hidden, 'held'])} onAct={() => setHeld('held')} actLabel="Show them">
          {reserved.length} car{reserved.length > 1 ? 's are' : ' is'} held for a buyer —{' '}
          {fmt(depositsHeld.toFixed(0))} {cfa} of deposits already in your accounts.
        </Alert>
      )}
      {unpriced > 0 && !hidden.includes('unpriced') && (
        <Alert
          kind="info"
          onDismiss={() => setHidden([...hidden, 'unpriced'])}
          onAct={() => setPriced('unpriced')}
          actLabel="Price them"
        >
          {unpriced} car{unpriced > 1 ? 's have' : ' has'} no asking price yet.
        </Alert>
      )}
      <Alert kind="error">{error}</Alert>

      {!cars ? (
        <Spinner />
      ) : view === 'cards' ? (
        <>
          <Filters
            {...{ search, setSearch, condition, setCondition, priced, setPriced, held, setHeld, sort, setSort }}
          />
          {shown.length === 0 ? (
            <Empty>{emptyMessage(cars.length, search)}</Empty>
          ) : (
            <div className="car-grid">
              {shown.map((car) => (
                <CarCard key={car.id} car={car} actions={actions} />
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="split">
          <div className="split-list">
            <div className="search">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search VIN, brand, colour…"
              />
            </div>
            <div className="rows">
              {shown.length === 0 ? (
                <div style={{ padding: 16 }} className="small muted">
                  {emptyMessage(cars.length, search)}
                </div>
              ) : (
                shown.map((car) => (
                  <button
                    key={car.id}
                    className={`car-row${car.id === selected?.id ? ' on' : ''}`}
                    onClick={() => setSelectedId(car.id)}
                  >
                    <div className="who">
                      <div className="name">
                        {car.year} {car.makeName} {car.modelName}
                      </div>
                      <div className="sub">
                        {car.daysInStock ?? 0} days
                        {car.reservation ? ' · held' : ''}
                        {car.damaged ? ' · repaired' : ''}
                      </div>
                    </div>
                    <div className="price">
                      {car.askingPriceCfa ? fmt(car.askingPriceCfa) : <span className="muted">no price</span>}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          <div>
            <Filters
              {...{ search: null, setSearch, condition, setCondition, priced, setPriced, held, setHeld, sort, setSort }}
            />
            {selected ? <CarPanel car={selected} actions={actions} /> : null}
          </div>
        </div>
      )}

      {pricing && (
        <PriceModal car={pricing} onClose={() => setPricing(null)} onSaved={(t) => { setPricing(null); done(t); }} />
      )}
      {reserving && (
        <ReserveModal car={reserving} onClose={() => setReserving(null)} onDone={(t) => { setReserving(null); done(t); }} />
      )}
      {cancelling?.reservation && (
        <CancelReservationModal
          reservation={cancelling.reservation}
          onClose={() => setCancelling(null)}
          onDone={(t) => { setCancelling(null); done(t); }}
        />
      )}
      {selling && (
        <SellModal
          car={selling}
          onClose={() => setSelling(null)}
          onSold={(profit) => { setSelling(null); done(`Sold. Profit on this car: ${fmt(profit)} ${cfa}.`); }}
        />
      )}

      <Toasts toasts={toasts} />
    </div>
  );
}

const emptyMessage = (total: number, search: string) =>
  total === 0
    ? search
      ? `No car in the showroom matches “${search}”.`
      : 'Nothing in the showroom yet.'
    : 'No car matches those filters.';

interface Actions {
  sell: (car: Car) => void;
  hold: (car: Car) => void;
  release: (car: Car) => void;
  price: (car: Car) => void;
}

function Filters({
  search,
  setSearch,
  condition,
  setCondition,
  priced,
  setPriced,
  held,
  setHeld,
  sort,
  setSort,
}: {
  /** Null in the working view, where the search box lives above the list. */
  search: string | null;
  setSearch: (value: string) => void;
  condition: 'all' | 'clean' | 'repaired';
  setCondition: (value: 'all' | 'clean' | 'repaired') => void;
  priced: 'all' | 'priced' | 'unpriced';
  setPriced: (value: 'all' | 'priced' | 'unpriced') => void;
  held: 'all' | 'held' | 'free';
  setHeld: (value: 'all' | 'held' | 'free') => void;
  sort: Sort;
  setSort: (value: Sort) => void;
}) {
  return (
    <div className="row" style={{ marginBottom: 12 }}>
      {search !== null && (
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by VIN, brand, model, colour or supplier…"
          style={{ flex: '2 1 260px' }}
        />
      )}
      <select value={condition} onChange={(e) => setCondition(e.target.value as typeof condition)}>
        <option value="all">Every car</option>
        <option value="clean">Arrived undamaged</option>
        <option value="repaired">Repaired in the garage</option>
      </select>
      <select value={priced} onChange={(e) => setPriced(e.target.value as typeof priced)}>
        <option value="all">Priced or not</option>
        <option value="priced">Has an asking price</option>
        <option value="unpriced">No asking price yet</option>
      </select>
      <select value={held} onChange={(e) => setHeld(e.target.value as typeof held)}>
        <option value="all">Held or free</option>
        <option value="held">Held with a deposit</option>
        <option value="free">Nobody is holding it</option>
      </select>
      <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
        <option value="oldest">Longest in stock first</option>
        <option value="newest">Newest arrivals first</option>
        <option value="cost">Most expensive first</option>
        <option value="price">Highest asking price</option>
        <option value="profit">Best profit first</option>
      </select>
    </div>
  );
}

/** What a car with no photograph shows. Most cars will not have one on the day
 *  they arrive, so this is the normal case and it should look deliberate. */
function Plate({ car }: { car: Car }) {
  return (
    <div className="plate">
      <div className="initials">{car.makeName}</div>
      <div className="small">no photo yet</div>
    </div>
  );
}

function CarCard({ car, actions }: { car: Car; actions: Actions }) {
  const { cfa } = useApp();
  const profit = Number(car.potentialProfitCfa ?? 0);

  return (
    <div className="car-card">
      <div className={`shot${car.photo ? '' : ' empty'}`}>
        {car.photo ? <img src={photoUrl(car.photo)} alt="" loading="lazy" /> : <Plate car={car} />}
        <div className="tag">
          {car.reservation && <span className="badge amber">Held</span>}
          {(car.daysInStock ?? 0) >= 60 && <span className="badge red">{car.daysInStock} days</span>}
        </div>
      </div>
      <div className="body">
        <div className="title">
          <Link to={`/cars/${car.id}`}>
            {car.year} {car.makeName} {car.modelName}
          </Link>
        </div>
        <div className="small muted">
          {car.color} · {car.vin}
        </div>
        <div className="ask">
          {car.askingPriceCfa ? `${fmt(car.askingPriceCfa)} ${cfa}` : <span className="muted">No price yet</span>}
        </div>
        <div className="small">
          Cost {fmt(car.costs.landedCostCfa)} ·{' '}
          <span className={profit < 0 ? 'neg strong' : 'pos strong'}>
            {profit >= 0 ? '+' : '−'}
            {fmt(Math.abs(profit))}
          </span>
        </div>
      </div>
      <div className="foot">
        <button className="small" onClick={() => actions.sell(car)}>
          Sell
        </button>
        <button className="small secondary" onClick={() => actions.price(car)}>
          Price
        </button>
        <button
          className="small secondary"
          onClick={() => (car.reservation ? actions.release(car) : actions.hold(car))}
        >
          {car.reservation ? 'Release' : 'Hold'}
        </button>
      </div>
    </div>
  );
}

/** Everything about one car, on the right of the working view. */
function CarPanel({ car, actions }: { car: Car; actions: Actions }) {
  const { cfa } = useApp();
  const [photos, setPhotos] = useState<Photo[]>([]);

  useEffect(() => {
    setPhotos([]);
    void api.get<Photo[]>(`/api/cars/${car.id}/photos`).then(setPhotos).catch(() => setPhotos([]));
  }, [car.id]);

  const cost = Number(car.costs.landedCostCfa ?? 0);
  const asking = Number(car.askingPriceCfa ?? 0);
  const profit = asking - cost;

  return (
    <div key={car.id} className="card" style={{ animation: 'rise 220ms var(--ease) both' }}>
      <div className="page-header" style={{ marginBottom: 12 }}>
        <div>
          <h2 style={{ marginBottom: 2 }}>
            <Link to={`/cars/${car.id}`}>
              {car.year} {car.makeName} {car.modelName}
            </Link>
          </h2>
          <div className="small muted">
            {car.color} · {car.vin} · from {car.supplier?.name} · in the showroom{' '}
            {car.daysInStock ?? 0} days
          </div>
        </div>
        <div className="row" style={{ flexWrap: 'nowrap', gap: 6 }}>
          <div className="actions">
            <button onClick={() => actions.sell(car)}>Sell it</button>
          </div>
          <div className="actions">
            <button className="secondary" onClick={() => actions.price(car)}>
              {car.askingPriceCfa ? 'Change price' : 'Set a price'}
            </button>
          </div>
          <div className="actions">
            <button
              className="secondary"
              onClick={() => (car.reservation ? actions.release(car) : actions.hold(car))}
            >
              {car.reservation ? 'Release' : 'Hold'}
            </button>
          </div>
        </div>
      </div>

      {car.reservation && (
        <Alert kind="warn">
          <strong>{car.reservation.customerName}</strong> is holding this car with{' '}
          {fmt(car.reservation.depositCfa)} {cfa}, paid {fmtDate(car.reservation.date)}. It can only be sold to
          him until that deposit is released.
        </Alert>
      )}

      <div className="grid cols-2">
        <div>
          <div className="breakdown">
            <div className="line">
              <span>Asking price</span>
              <span className="amount strong">
                {car.askingPriceCfa ? `${fmt(car.askingPriceCfa)} ${cfa}` : '—'}
              </span>
            </div>
            <div className="line">
              <span>Bought for</span>
              <span className="amount">${fmt(car.costs.usd.purchasePriceUsd)}</span>
            </div>
            <div className="line">
              <span>Freight and expenses</span>
              <span className="amount">
                $
                {fmt(
                  (
                    Number(car.costs.usd.freightShareUsd ?? 0) +
                    Number(car.costs.usd.originExpensesUsd) +
                    Number(car.costs.usd.taxCapitalizedUsd)
                  ).toFixed(2),
                )}
              </span>
            </div>
            {Number(car.costs.repairsCfa) > 0 && (
              <div className="line">
                <span>Garage work</span>
                <span className="amount">{fmt(car.costs.repairsCfa)}</span>
              </div>
            )}
            <div className="line">
              <span>Landed cost</span>
              <span className="amount strong">
                {fmt(car.costs.landedCostCfa)} {cfa}
              </span>
            </div>
            <div className="line total">
              <span>{profit >= 0 ? 'Profit if it sells at that' : 'Loss if it sells at that'}</span>
              <span className={`amount ${profit < 0 ? 'neg' : 'pos'}`}>
                {car.askingPriceCfa ? `${fmt(Math.abs(profit))} ${cfa}` : '—'}
              </span>
            </div>
          </div>

          <div className="row" style={{ marginTop: 12, gap: 8 }}>
            <span className="small" style={{ flex: '0 0 auto' }}>
              <StatusBadge status={car.status} />
            </span>
            {car.damaged && (
              <span className="small muted" style={{ flex: '0 0 auto' }}>
                Repaired in the garage before it came here
              </span>
            )}
          </div>
        </div>

        <div>
          <div className="small muted" style={{ marginBottom: 6 }}>
            Photos {photos.length > 0 ? `(${photos.length})` : ''}
          </div>
          {photos.length === 0 ? (
            <div className="detail-shots">
              <Plate car={car} />
            </div>
          ) : (
            <div className="detail-shots">
              {photos.slice(0, 6).map((photo) => (
                <a key={photo.id} href={photoUrl(photo)} target="_blank" rel="noreferrer">
                  <img src={photoUrl(photo)} alt={photo.caption ?? ''} loading="lazy" />
                </a>
              ))}
            </div>
          )}
          <div className="small muted" style={{ marginTop: 8 }}>
            <Link to={`/cars/${car.id}`}>Open the car</Link> to add photos, correct a cost or see its history.
          </div>
        </div>
      </div>
    </div>
  );
}

function SellModal({
  car,
  onClose,
  onSold,
}: {
  car: Car;
  onClose: () => void;
  onSold: (profit: string) => void;
}) {
  const { cfa } = useApp();
  const [customers, setCustomers] = useState<Party[]>([]);
  const [price, setPrice] = useState(car.askingPriceCfa ?? '');
  const [saleDate, setSaleDate] = useState(todayIso());
  const [buyerName, setBuyerName] = useState(car.reservation?.customerName ?? '');
  const [buyerMobile, setBuyerMobile] = useState(car.reservation?.customerMobile ?? '');
  const [initialPayment, setInitialPayment] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [accounts, setAccounts] = useState<Party[]>([]);
  const [destinationAccountId, setDestination] = useState('');
  const [customerId, setCustomerId] = useState('');

  useEffect(() => {
    void api.get<Party[]>('/api/parties?type=CUSTOMER').then(setCustomers);
    void api.get<Party[]>('/api/parties?type=TRANSFER_COMPANY').then(setAccounts);
  }, []);

  const { busy, error, run } = useSubmit(async () => {
    const result = await api.post<{ profit: { profit: string } }>(`/api/cars/${car.id}/sell`, {
      channel: 'LOCAL',
      price: Number(price),
      saleDate,
      buyerName,
      buyerMobile: buyerMobile || null,
      customerId: customerId ? Number(customerId) : null,
      initialPayment: initialPayment ? Number(initialPayment) : undefined,
      paymentMethod,
      destinationAccountId: destinationAccountId ? Number(destinationAccountId) : null,
    });
    onSold(result.profit.profit);
    return result;
  });

  const cost = Number(car.costs.landedCostCfa ?? 0);
  const profit = Number(price || 0) - cost;
  // A deposit already paid is part of the price and is already in an account.
  const deposit = Number(car.reservation?.depositCfa ?? 0);
  const remaining = Number(price || 0) - Number(initialPayment || 0) - deposit;

  return (
    <Modal title={`Sell the ${car.year} ${car.makeName} ${car.modelName}`} onClose={onClose}>
      <Alert kind="error">{error}</Alert>

      <div className="row">
        <Field label={`Sale price (${cfa})`}>
          <MoneyInput value={price} onChange={setPrice} autoFocus />
        </Field>
        <Field label="Sale date">
          <input type="date" value={saleDate} onChange={(e) => setSaleDate(e.target.value)} />
        </Field>
      </div>

      {Number(price) > 0 && (
        <Alert kind={profit >= 0 ? 'success' : 'error'}>
          Cost {fmt(cost)} · price {fmt(price)} ·{' '}
          <strong>
            {profit >= 0 ? 'profit' : 'loss'} {fmt(Math.abs(profit))} {cfa}
          </strong>
        </Alert>
      )}

      {car.reservation && (
        <Alert kind="info">
          {car.reservation.customerName} already paid {fmt(car.reservation.depositCfa)} {cfa} to hold this car.
          That money is in your account — do not enter it again below. It counts towards the price by itself.
        </Alert>
      )}

      <div className="row">
        <Field label="Buyer's name">
          <input value={buyerName} onChange={(e) => setBuyerName(e.target.value)} />
        </Field>
        <Field label="Buyer's mobile">
          <input value={buyerMobile} onChange={(e) => setBuyerMobile(e.target.value)} />
        </Field>
      </div>

      <div className="row">
        <Field label="Paid now" help="Leave empty if nothing has been paid yet.">
          <MoneyInput value={initialPayment} onChange={setInitialPayment} />
        </Field>
        <Field label="How?">
          <input value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} placeholder="cash" />
        </Field>
      </div>

      {Number(initialPayment) > 0 && (
        <Field
          label="Where did the money go?"
          help="It goes straight into that account. Never record it again as a deposit."
        >
          <select value={destinationAccountId} onChange={(e) => setDestination(e.target.value)}>
            <option value="">Cash box (default)</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </Field>
      )}

      {(Number(initialPayment) > 0 || deposit > 0) && remaining > 0 && (
        <Alert kind="warn">
          {fmt(remaining)} {cfa} will still be owed. This sale goes on the “Still owing” list until it is paid
          off, then moves to “Paid in full” by itself.
        </Alert>
      )}
      {remaining < 0 && <Alert kind="error">The payments cannot exceed the sale price.</Alert>}

      {customers.length > 0 && (
        <Field
          label="Put the balance on a customer account?"
          help="Only needed if this buyer pays over time and you want a running account for him."
        >
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">No — just track it on this sale</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </select>
        </Field>
      )}

      <div className="modal-actions">
        <button className="secondary" onClick={onClose}>
          Cancel
        </button>
        <button
          onClick={() => void run()}
          disabled={busy || Number(price) <= 0 || !buyerName.trim() || remaining < 0 || Number(initialPayment) < 0}
        >
          {busy ? 'Saving…' : 'Record the sale'}
        </button>
      </div>
    </Modal>
  );
}
