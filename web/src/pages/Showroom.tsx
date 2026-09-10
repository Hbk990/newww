import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader, useApp } from '../App';
import { api, fmt, todayIso, type Car, type Party } from '../lib/api';
import { Alert, Card, Empty, Field, Modal, Spinner, useSubmit } from '../components/ui';
import { MoneyInput } from '../components/MoneyInput';
import { PhotoThumb } from '../components/Photos';
import { CancelReservationModal, ReserveModal } from '../components/ReserveModal';

export default function Showroom() {
  const { cfa } = useApp();
  const [cars, setCars] = useState<Car[] | null>(null);
  const [selling, setSelling] = useState<Car | null>(null);
  const [reserving, setReserving] = useState<Car | null>(null);
  const [cancelling, setCancelling] = useState<Car | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [condition, setCondition] = useState<'all' | 'clean' | 'repaired'>('all');
  const [priced, setPriced] = useState<'all' | 'priced' | 'unpriced'>('all');
  const [held, setHeld] = useState<'all' | 'held' | 'free'>('all');
  const [sort, setSort] = useState<'oldest' | 'newest' | 'cost' | 'price' | 'profit'>('oldest');

  const load = () =>
    api
      .get<Car[]>(`/api/showroom${search ? `?search=${encodeURIComponent(search)}` : ''}`)
      .then(setCars)
      .catch((e) => setError(e.message));

  useEffect(() => {
    const timer = setTimeout(() => void load(), 200);
    return () => clearTimeout(timer);
  }, [search]);

  const shown = (cars ?? [])
    .filter((car) => (condition === 'all' ? true : condition === 'repaired' ? car.damaged : !car.damaged))
    .filter((car) =>
      priced === 'all' ? true : priced === 'priced' ? Boolean(car.askingPriceCfa) : !car.askingPriceCfa,
    )
    .filter((car) => (held === 'all' ? true : held === 'held' ? Boolean(car.reservation) : !car.reservation))
    .sort((a, b) => {
      switch (sort) {
        case 'newest':
          return (b.daysInStock ?? 0) - (a.daysInStock ?? 0) === 0 ? 0 : (a.daysInStock ?? 0) - (b.daysInStock ?? 0);
        case 'cost':
          return Number(b.costs.landedCostCfa ?? 0) - Number(a.costs.landedCostCfa ?? 0);
        case 'price':
          return Number(b.askingPriceCfa ?? 0) - Number(a.askingPriceCfa ?? 0);
        case 'profit':
          return Number(b.potentialProfitCfa ?? 0) - Number(a.potentialProfitCfa ?? 0);
        default:
          return (b.daysInStock ?? 0) - (a.daysInStock ?? 0);
      }
    });

  const stockValue = shown.reduce((sum, car) => sum + Number(car.costs.landedCostCfa ?? 0), 0);
  const askingTotal = shown.reduce((sum, car) => sum + Number(car.askingPriceCfa ?? 0), 0);
  const unpriced = (cars ?? []).filter((car) => !car.askingPriceCfa).length;
  const sittingLong = (cars ?? []).filter((car) => (car.daysInStock ?? 0) >= 60).length;
  const reserved = (cars ?? []).filter((car) => car.reservation);
  const depositsHeld = reserved.reduce((sum, car) => sum + Number(car.reservation?.depositCfa ?? 0), 0);

  return (
    <>
      <PageHeader
        title="Showroom"
        sub={
          cars
            ? `${cars.length} car${cars.length === 1 ? '' : 's'} · ${fmt(stockValue.toFixed(0))} ${cfa} tied up`
            : 'Ready to sell, with what each one really cost you'
        }
      />

      {sittingLong > 0 && (
        <Alert kind="warn">
          {sittingLong} car{sittingLong > 1 ? 's have' : ' has'} been in the showroom for 60 days or
          more. Money sitting still.
        </Alert>
      )}
      {reserved.length > 0 && (
        <Alert kind="info">
          {reserved.length} car{reserved.length > 1 ? 's are' : ' is'} held for a buyer —{' '}
          {fmt(depositsHeld.toFixed(0))} {cfa} of deposits already in your accounts.
        </Alert>
      )}
      {unpriced > 0 && (
        <Alert kind="info">
          {unpriced} car{unpriced > 1 ? 's have' : ' has'} no asking price yet.
        </Alert>
      )}

      <Alert kind="error">{error}</Alert>
      <Alert kind="success">{message}</Alert>

      {!cars ? (
        <Spinner />
      ) : (
        <Card>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by VIN, brand, model, colour or supplier…"
            style={{ marginBottom: 10 }}
          />

          <div className="row" style={{ marginBottom: 12 }}>
            <div style={{ flex: '0 0 190px' }}>
              <select value={condition} onChange={(e) => setCondition(e.target.value as typeof condition)}>
                <option value="all">Every car</option>
                <option value="clean">Arrived undamaged</option>
                <option value="repaired">Repaired in the garage</option>
              </select>
            </div>
            <div style={{ flex: '0 0 180px' }}>
              <select value={priced} onChange={(e) => setPriced(e.target.value as typeof priced)}>
                <option value="all">Priced or not</option>
                <option value="priced">Has an asking price</option>
                <option value="unpriced">No asking price yet</option>
              </select>
            </div>
            <div style={{ flex: '0 0 200px' }}>
              <select value={held} onChange={(e) => setHeld(e.target.value as typeof held)}>
                <option value="all">Held or free</option>
                <option value="held">Held with a deposit</option>
                <option value="free">Nobody is holding it</option>
              </select>
            </div>
            <div style={{ flex: '0 0 210px' }}>
              <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
                <option value="oldest">Longest in stock first</option>
                <option value="newest">Newest arrivals first</option>
                <option value="cost">Most expensive first</option>
                <option value="price">Highest asking price</option>
                <option value="profit">Best profit first</option>
              </select>
            </div>
          </div>
          {shown.length === 0 ? (
            <Empty>
              {cars.length === 0
                ? search
                  ? `No car in the showroom matches “${search}”.`
                  : 'Nothing in the showroom yet.'
                : 'No car matches those filters.'}
            </Empty>
          ) : (
          <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 62 }} />
                  <th>Car</th>
                  <th className="num">Landed cost</th>
                  <th className="num">Asking price</th>
                  <th className="num">Profit if sold</th>
                  <th className="num">Days in stock</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {shown.map((car) => (
                  <tr key={car.id}>
                    <td>
                      <Link to={`/cars/${car.id}`}>
                        <PhotoThumb photo={car.photo ?? null} />
                      </Link>
                    </td>
                    <td className="strong">
                      <Link to={`/cars/${car.id}`}>
                        {car.year} {car.makeName} {car.modelName}
                      </Link>
                      <div className="small muted">
                        {car.color} · {car.vin}
                        {car.damaged && ' · was repaired'}
                      </div>
                      {car.reservation && (
                        <div className="small">
                          <span className="badge amber">Held</span>{' '}
                          {car.reservation.customerName} paid {fmt(car.reservation.depositCfa)} {cfa}
                        </div>
                      )}
                    </td>
                    <td className="num">{fmt(car.costs.landedCostCfa)}</td>
                    <td className="num">{fmt(car.askingPriceCfa)}</td>
                    <td className={`num ${Number(car.potentialProfitCfa ?? 0) < 0 ? 'neg' : 'pos'}`}>
                      {fmt(car.potentialProfitCfa)}
                    </td>
                    <td className={`num ${(car.daysInStock ?? 0) >= 60 ? 'neg strong' : ''}`}>
                      {car.daysInStock ?? '—'}
                    </td>
                    <td className="num">
                      <div className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
                        <div className="actions">
                          <button className="small" onClick={() => setSelling(car)}>
                            Sell
                          </button>
                        </div>
                        <div className="actions">
                          {car.reservation ? (
                            <button className="small secondary" onClick={() => setCancelling(car)}>
                              Release
                            </button>
                          ) : (
                            <button className="small secondary" onClick={() => setReserving(car)}>
                              Hold
                            </button>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="small muted" style={{ marginBottom: 0 }}>
            Showing {shown.length} of {cars.length}. All amounts in {cfa}. Landed cost = purchase,
            expenses, tax and freight at the locked rate, plus any garage work.
            {askingTotal > 0 && ` Asking prices here total ${fmt(askingTotal.toFixed(0))}.`}
          </p>
          </>
          )}
        </Card>
      )}

      {reserving && (
        <ReserveModal
          car={reserving}
          onClose={() => setReserving(null)}
          onDone={(text) => {
            setReserving(null);
            setMessage(text);
            void load();
          }}
        />
      )}

      {cancelling?.reservation && (
        <CancelReservationModal
          reservation={cancelling.reservation}
          onClose={() => setCancelling(null)}
          onDone={(text) => {
            setCancelling(null);
            setMessage(text);
            void load();
          }}
        />
      )}

      {selling && (
        <SellModal
          car={selling}
          onClose={() => setSelling(null)}
          onSold={(profit) => {
            setSelling(null);
            setMessage(`Sold. Profit on this car: ${fmt(profit)} ${cfa}.`);
            void load();
          }}
        />
      )}
    </>
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
          {fmt(remaining)} {cfa} will still be owed. This sale goes on the “Still owing” list until it
          is paid off, then moves to “Paid in full” by itself.
        </Alert>
      )}
      {remaining < 0 && <Alert kind="error">The initial payment cannot exceed the sale price.</Alert>}

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
        <button onClick={() => void run()} disabled={busy || Number(price) <= 0 || !buyerName.trim() || remaining < 0 || Number(initialPayment) < 0}>
          {busy ? 'Saving…' : 'Record the sale'}
        </button>
      </div>
    </Modal>
  );
}
