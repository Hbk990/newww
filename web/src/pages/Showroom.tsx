import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader, useApp } from '../App';
import { api, fmt, todayIso, type Car, type Party } from '../lib/api';
import { Alert, Card, Empty, Field, Modal, Spinner, useSubmit } from '../components/ui';

export default function Showroom() {
  const { cfa } = useApp();
  const [cars, setCars] = useState<Car[] | null>(null);
  const [selling, setSelling] = useState<Car | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = () =>
    api
      .get<Car[]>('/api/showroom')
      .then(setCars)
      .catch((e) => setError(e.message));

  useEffect(() => {
    void load();
  }, []);

  return (
    <>
      <PageHeader title="Showroom" sub="Ready to sell, with what each one really cost you" />

      <Alert kind="error">{error}</Alert>
      <Alert kind="success">{message}</Alert>

      {!cars ? (
        <Spinner />
      ) : cars.length === 0 ? (
        <Card>
          <Empty>Nothing in the showroom yet.</Empty>
        </Card>
      ) : (
        <Card>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Car</th>
                  <th className="num">Landed cost</th>
                  <th className="num">Asking price</th>
                  <th className="num">Profit if sold</th>
                  <th className="num">Days in stock</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {cars.map((car) => (
                  <tr key={car.id}>
                    <td className="strong">
                      <Link to={`/cars/${car.id}`}>
                        {car.year} {car.makeName} {car.modelName}
                      </Link>
                      <div className="small muted">
                        {car.color} · {car.vin}
                        {car.damaged && ' · was repaired'}
                      </div>
                    </td>
                    <td className="num">{fmt(car.costs.landedCostCfa)}</td>
                    <td className="num">{fmt(car.askingPriceCfa)}</td>
                    <td className={`num ${Number(car.potentialProfitCfa ?? 0) < 0 ? 'neg' : 'pos'}`}>
                      {fmt(car.potentialProfitCfa)}
                    </td>
                    <td className="num">{car.daysInStock ?? '—'}</td>
                    <td className="num">
                      <button className="small" onClick={() => setSelling(car)}>
                        Sell
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="small muted" style={{ marginBottom: 0 }}>
            All amounts in {cfa}. Landed cost = purchase, expenses, tax and freight at the locked
            rate, plus any garage work.
          </p>
        </Card>
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
  const [buyerName, setBuyerName] = useState('');
  const [buyerMobile, setBuyerMobile] = useState('');
  const [initialPayment, setInitialPayment] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [customerId, setCustomerId] = useState('');

  useEffect(() => {
    void api.get<Party[]>('/api/parties?type=CUSTOMER').then(setCustomers);
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
    });
    onSold(result.profit.profit);
    return result;
  });

  const cost = Number(car.costs.landedCostCfa ?? 0);
  const profit = Number(price || 0) - cost;
  const remaining = Number(price || 0) - Number(initialPayment || 0);

  return (
    <Modal title={`Sell the ${car.year} ${car.makeName} ${car.modelName}`} onClose={onClose}>
      <Alert kind="error">{error}</Alert>

      <div className="row">
        <Field label={`Sale price (${cfa})`}>
          <input type="number" value={price} onChange={(e) => setPrice(e.target.value)} autoFocus />
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
          <input type="number" min="0" max={price || undefined} step="1" value={initialPayment} onChange={(e) => setInitialPayment(e.target.value)} />
        </Field>
        <Field label="How?">
          <input value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} placeholder="cash" />
        </Field>
      </div>

      {Number(initialPayment) > 0 && remaining > 0 && (
        <Alert kind="warn">{fmt(remaining)} {cfa} will still be owed on this sale.</Alert>
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
