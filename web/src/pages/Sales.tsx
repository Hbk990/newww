import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader, useApp } from '../App';
import { api, fmt, fmtDate, fmtUsd, todayIso, type Car, type Party } from '../lib/api';
import { Alert, Card, Empty, Field, Modal, Spinner, useSubmit } from '../components/ui';
import { MoneyInput } from '../components/MoneyInput';

interface Sale {
  id: number;
  settled: boolean;
  carId: number;
  label: string;
  channel: 'LOCAL' | 'ORIGIN';
  currency: string;
  price: string;
  saleDate: string;
  buyerName: string;
  paid: string;
  remaining: string;
  payments: { id: number; amount: string; date: string; method: string | null }[];
  profit: { profit: string; marginPct: string | null; cost: string };
}

export default function Sales() {
  const [sales, setSales] = useState<Sale[] | null>(null);
  const [paying, setPaying] = useState<Sale | null>(null);
  const [sellingAbroad, setSellingAbroad] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [list, setList] = useState<'owing' | 'paid'>('owing');

  const load = () =>
    api
      .get<Sale[]>('/api/sales')
      .then(setSales)
      .catch((e) => setError(e.message));

  useEffect(() => {
    void load();
  }, []);

  // A sale sits in one list or the other by how much is still owed — it moves
  // across by itself when the last payment arrives.
  const owing = (sales ?? []).filter((sale) => !sale.settled);
  const paid = (sales ?? []).filter((sale) => sale.settled);
  const shown = list === 'owing' ? owing : paid;
  const owedTotal = owing.reduce((sum, sale) => sum + Number(sale.remaining), 0);

  return (
    <>
      <PageHeader
        title="Sales"
        sub={
          owing.length > 0
            ? `${owing.length} buyer${owing.length > 1 ? 's owe' : ' owes'} you ${fmt(owedTotal.toFixed(0))} in total`
            : 'Every car sold, what it cost, and what is still owed'
        }
        action={<button className="secondary" onClick={() => setSellingAbroad(true)}>Sell a car abroad</button>}
      />

      <Alert kind="error">{error}</Alert>

      {sales && (
        <div className="row" style={{ marginBottom: 12 }}>
          <button
            className={list === 'owing' ? '' : 'secondary'}
            style={{ flex: '0 0 auto' }}
            onClick={() => setList('owing')}
          >
            Still owing ({owing.length})
          </button>
          <button
            className={list === 'paid' ? '' : 'secondary'}
            style={{ flex: '0 0 auto' }}
            onClick={() => setList('paid')}
          >
            Paid in full ({paid.length})
          </button>
        </div>
      )}

      {!sales ? (
        <Spinner />
      ) : shown.length === 0 ? (
        <Card>
          <Empty>
            {sales.length === 0
              ? 'No sales yet.'
              : list === 'owing'
                ? 'Nobody owes you anything. Every car sold has been paid for in full.'
                : 'No sale has been paid off yet.'}
          </Empty>
        </Card>
      ) : (
        <Card>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Car</th>
                  <th>Buyer</th>
                  <th>Date</th>
                  <th className="num">Price</th>
                  <th className="num">Cost</th>
                  <th className="num">Profit</th>
                  <th className="num">Still owed</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {shown.map((sale) => (
                  <tr key={sale.id}>
                    <td className="strong">
                      <Link to={`/cars/${sale.carId}`}>{sale.label}</Link>
                      {sale.channel === 'ORIGIN' && (
                        <div>
                          <span className="badge blue">sold abroad</span>
                        </div>
                      )}
                    </td>
                    <td className="small">{sale.buyerName}</td>
                    <td className="small">{fmtDate(sale.saleDate)}</td>
                    <td className="num">
                      {sale.currency === 'USD' ? fmtUsd(sale.price) : fmt(sale.price)}
                    </td>
                    <td className="num muted">
                      {sale.currency === 'USD' ? fmtUsd(sale.profit.cost) : fmt(sale.profit.cost)}
                    </td>
                    <td className={`num strong ${Number(sale.profit.profit) < 0 ? 'neg' : 'pos'}`}>
                      {sale.currency === 'USD' ? fmtUsd(sale.profit.profit) : fmt(sale.profit.profit)}
                      {sale.profit.marginPct && <div className="small muted">{sale.profit.marginPct}%</div>}
                    </td>
                    <td className="num">{sale.channel === 'ORIGIN' ? 'Settled with supplier' : Number(sale.remaining) > 0 ? fmt(sale.remaining) : '—'}</td>
                    <td className="num">
                      <div className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
                        {sale.channel === 'LOCAL' && Number(sale.remaining) > 0 && (
                          <div className="actions">
                            <button className="small" onClick={() => setPaying(sale)}>
                              Payment
                            </button>
                          </div>
                        )}
                        {sale.channel === 'LOCAL' && (
                          <div className="actions">
                            <Link to={`/sales/${sale.id}/receipt`}>
                              <button className="small secondary">Receipt</button>
                            </Link>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {paying && <PaymentModal sale={paying} onClose={() => setPaying(null)} onSaved={() => { setPaying(null); void load(); }} />}
      {sellingAbroad && (
        <SellAbroad onClose={() => setSellingAbroad(false)} onSold={() => { setSellingAbroad(false); void load(); }} />
      )}
    </>
  );
}

function PaymentModal({ sale, onClose, onSaved }: { sale: Sale; onClose: () => void; onSaved: () => void }) {
  const [amount, setAmount] = useState(sale.remaining);
  const [date, setDate] = useState(todayIso());
  const [method, setMethod] = useState('cash');
  const [accounts, setAccounts] = useState<Party[]>([]);
  const [destinationAccountId, setDestination] = useState('');

  useEffect(() => {
    void api.get<Party[]>('/api/parties?type=TRANSFER_COMPANY').then(setAccounts);
  }, []);

  const { busy, error, run } = useSubmit(async () => {
    await api.post(`/api/sales/${sale.id}/payments`, {
      amount: Number(amount),
      date,
      method,
      destinationAccountId: destinationAccountId ? Number(destinationAccountId) : null,
    });
    onSaved();
    return true;
  });

  return (
    <Modal title={`Payment for ${sale.label}`} onClose={onClose}>
      <Alert kind="error">{error}</Alert>
      <p className="small muted">
        Price {fmt(sale.price)} · already paid {fmt(sale.paid)} · still owed{' '}
        <strong>{fmt(sale.remaining)}</strong> {sale.currency}
      </p>

      <div className="row">
        <Field label="Amount received">
          <MoneyInput value={amount} onChange={setAmount} autoFocus />
        </Field>
        <Field label="Date">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="How?">
          <input value={method} onChange={(e) => setMethod(e.target.value)} />
        </Field>
      </div>

      <Field
        label="Where did the money go?"
        help="Recording it here puts it straight into that account. Do not enter it again on the Payments screen as a deposit."
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

      <div className="modal-actions">
        <button className="secondary" onClick={onClose}>Cancel</button>
        <button onClick={() => void run()} disabled={busy || !Number(amount)}>
          {busy ? 'Saving…' : 'Record payment'}
        </button>
      </div>
    </Modal>
  );
}

/**
 * A car bought in the USA and sold there without ever shipping. The proceeds go
 * into the supplier's own USD account: they cancel part of what you owe him,
 * and if they are more than that, he ends up owing you.
 */
function SellAbroad({ onClose, onSold }: { onClose: () => void; onSold: () => void }) {
  const [cars, setCars] = useState<Car[]>([]);
  const [carId, setCarId] = useState('');
  const [price, setPrice] = useState('');
  const [saleDate, setSaleDate] = useState(todayIso());
  const [buyerName, setBuyerName] = useState('');

  useEffect(() => {
    void api.get<Car[]>('/api/cars?status=PURCHASED').then(setCars);
  }, []);

  const car = cars.find((c) => String(c.id) === carId);
  const cost = Number(car?.costs.usd.totalCostUsd ?? 0);
  const profit = Number(price || 0) - cost;

  const { busy, error, run } = useSubmit(async () => {
    await api.post(`/api/cars/${carId}/sell`, {
      channel: 'ORIGIN',
      price: Number(price),
      saleDate,
      buyerName,
    });
    onSold();
    return true;
  });

  return (
    <Modal title="Sell a car in the origin country" onClose={onClose}>
      <Alert kind="info">
        The car never ships. The sale is in USD and lands in the supplier's account, reducing what you
        owe him.
      </Alert>
      <Alert kind="error">{error}</Alert>

      <Field label="Which car?">
        <select value={carId} onChange={(e) => setCarId(e.target.value)}>
          <option value="">Choose a car still abroad…</option>
          {cars.map((c) => (
            <option key={c.id} value={c.id}>
              {c.year} {c.makeName} {c.modelName} — {c.supplier?.name} — cost {c.costs.usd.totalCostUsd} USD
            </option>
          ))}
        </select>
      </Field>

      <div className="row">
        <Field label="Sale price (USD)">
          <MoneyInput decimals={2} value={price} onChange={setPrice} />
        </Field>
        <Field label="Sale date">
          <input type="date" value={saleDate} onChange={(e) => setSaleDate(e.target.value)} />
        </Field>
      </div>

      <Field label="Who bought it?">
        <input value={buyerName} onChange={(e) => setBuyerName(e.target.value)} />
      </Field>

      {car && Number(price) > 0 && (
        <Alert kind={profit >= 0 ? 'success' : 'error'}>
          Cost {fmtUsd(cost)} · price {fmtUsd(price)} ·{' '}
          <strong>{profit >= 0 ? 'profit' : 'loss'} {fmtUsd(Math.abs(profit))}</strong>
        </Alert>
      )}

      <div className="modal-actions">
        <button className="secondary" onClick={onClose}>Cancel</button>
        <button onClick={() => void run()} disabled={busy || !carId || !Number(price) || !buyerName}>
          {busy ? 'Saving…' : 'Record the sale'}
        </button>
      </div>
    </Modal>
  );
}
