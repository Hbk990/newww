import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader, useApp } from '../App';
import { api, fmt, fmtDate, fmtUsd, todayIso, type Party } from '../lib/api';
import { Alert, Card, Empty, Field, Modal, Spinner, useSubmit } from '../components/ui';

interface Overview {
  accounts: (Party & { balance: string })[];
  totalAvailableCfa: string;
  note: string;
}

interface Transaction {
  id: number;
  type: string;
  date: string;
  amountCfa: string | null;
  amountUsd: string | null;
  rate: string | null;
  feeCfa: string;
  note: string | null;
  transferCompany: { id: number; name: string } | null;
  counterparty: { id: number; name: string; currency: string } | null;
}

const TYPE_LABELS: Record<string, string> = {
  DEPOSIT: 'Deposit',
  WITHDRAWAL: 'Cash taken back',
  WIRE_TO_SUPPLIER: 'Wire to supplier',
  PAY_SHIPPING: 'Freight paid',
  PAY_WORKER: 'Worker paid',
  PAY_PARTS_SUPPLIER: 'Parts supplier paid',
  PAY_OVERHEAD: 'Expense paid',
};

type Action = 'deposit' | 'wire' | 'shipping' | 'local' | null;

export default function Money() {
  const { cfa } = useApp();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [action, setAction] = useState<Action>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      setOverview(await api.get<Overview>('/api/treasury/overview'));
      setTransactions(await api.get<Transaction[]>('/api/treasury/transactions'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the treasury');
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <>
      <PageHeader
        title="Payments"
        sub="Your money with the transfer companies, and everything paid out of it"
        action={
          <div className="row">
            <button onClick={() => setAction('deposit')}>Deposit</button>
            <button className="secondary" onClick={() => setAction('wire')}>Wire to supplier</button>
            <button className="secondary" onClick={() => setAction('shipping')}>Pay freight</button>
            <button className="secondary" onClick={() => setAction('local')}>Pay worker / parts</button>
          </div>
        }
      />

      <Alert kind="error">{error}</Alert>

      {!overview ? (
        <Spinner />
      ) : (
        <>
          <div className="grid cols-4">
            <div className="stat">
              <div className="label">Total available</div>
              <div className={`value${Number(overview.totalAvailableCfa) < 0 ? ' neg' : ''}`}>
                {fmt(overview.totalAvailableCfa)}
              </div>
              <div className="hint">{cfa} across all transfer companies</div>
            </div>
            {overview.accounts.map((account) => (
              <Link key={account.id} to={`/accounts/${account.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                <div className="stat">
                  <div className="label">{account.name}</div>
                  <div className={`value${Number(account.balance) < 0 ? ' neg' : ''}`}>
                    {fmt(account.balance)}
                  </div>
                  <div className="hint">
                    {Number(account.balance) < 0 ? 'you have overdrawn' : 'held for you'}
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {overview.accounts.length === 0 && (
            <Alert kind="info">
              No transfer companies yet. Add them under Accounts — including one called “Cash box” for
              money you hold yourself, so every franc has an account it came from.
            </Alert>
          )}

          <Card title="Recent movements">
            {transactions.length === 0 ? (
              <Empty>Nothing has moved yet.</Empty>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Type</th>
                      <th>Through</th>
                      <th>To</th>
                      <th className="num">{cfa} out</th>
                      <th className="num">USD credited</th>
                      <th className="num">Rate</th>
                      <th className="num">Fee</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((transaction) => (
                      <tr key={transaction.id}>
                        <td className="small">{fmtDate(transaction.date)}</td>
                        <td className="small">{TYPE_LABELS[transaction.type] ?? transaction.type}</td>
                        <td className="small">{transaction.transferCompany?.name ?? '—'}</td>
                        <td className="small">{transaction.counterparty?.name ?? '—'}</td>
                        <td className="num">{fmt(transaction.amountCfa)}</td>
                        <td className="num">{transaction.amountUsd ? fmtUsd(transaction.amountUsd) : '—'}</td>
                        <td className="num small">{transaction.rate ? fmt(transaction.rate) : '—'}</td>
                        <td className="num small">{Number(transaction.feeCfa) > 0 ? fmt(transaction.feeCfa) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="small muted" style={{ marginBottom: 0 }}>
              A deposit is not an expense — it moves your own money into an account you can spend
              from. Cost only reaches your profit when a car is sold.
            </p>
          </Card>
        </>
      )}

      {action && (
        <PaymentModal
          action={action}
          onClose={() => setAction(null)}
          onDone={() => {
            setAction(null);
            void load();
          }}
        />
      )}
    </>
  );
}

function PaymentModal({ action, onClose, onDone }: { action: Exclude<Action, null>; onClose: () => void; onDone: () => void }) {
  const { cfa } = useApp();
  const [transferCompanies, setTransferCompanies] = useState<Party[]>([]);
  const [counterparties, setCounterparties] = useState<Party[]>([]);

  const [transferCompanyId, setTransferCompanyId] = useState('');
  const [counterpartyId, setCounterpartyId] = useState('');
  const [amount, setAmount] = useState('');
  const [rate, setRate] = useState('');
  const [feeCfa, setFeeCfa] = useState('');
  const [payCurrency, setPayCurrency] = useState<'USD' | 'CFA'>('USD');
  const [date, setDate] = useState(todayIso());
  const [note, setNote] = useState('');

  useEffect(() => {
    void api.get<Party[]>('/api/parties?type=TRANSFER_COMPANY').then(setTransferCompanies);
    if (action === 'wire') void api.get<Party[]>('/api/parties?type=CAR_SUPPLIER').then(setCounterparties);
    if (action === 'shipping') void api.get<Party[]>('/api/parties?type=SHIPPING_COMPANY').then(setCounterparties);
    if (action === 'local') {
      void Promise.all([
        api.get<Party[]>('/api/parties?type=WORKER'),
        api.get<Party[]>('/api/parties?type=PARTS_SUPPLIER'),
      ]).then(([workers, parts]) => setCounterparties([...workers, ...parts]));
    }
  }, [action]);

  const { busy, error, run } = useSubmit(async () => {
    const common = { transferCompanyId: Number(transferCompanyId), date, note: note || null };
    if (action === 'deposit') {
      await api.post('/api/treasury/deposit', { ...common, amountCfa: Number(amount) });
    } else if (action === 'wire') {
      await api.post('/api/treasury/wire', {
        ...common,
        supplierId: Number(counterpartyId),
        amountUsd: Number(amount),
        rate: Number(rate),
        feeCfa: Number(feeCfa || 0),
      });
    } else if (action === 'shipping') {
      await api.post('/api/treasury/pay-shipping', {
        ...common,
        shippingCompanyId: Number(counterpartyId),
        payCurrency,
        amount: Number(amount),
        rate: Number(rate),
        feeCfa: Number(feeCfa || 0),
      });
    } else {
      await api.post('/api/treasury/pay-local', {
        ...common,
        partyId: Number(counterpartyId),
        amountCfa: Number(amount),
      });
    }
    onDone();
    return true;
  });

  const titles: Record<Exclude<Action, null>, string> = {
    deposit: 'Deposit money with a transfer company',
    wire: 'Wire USD to a car supplier',
    shipping: 'Pay a shipping company',
    local: 'Pay a worker or a parts supplier',
  };

  const needsCounterparty = action !== 'deposit';
  const needsRate = action === 'wire' || action === 'shipping';
  const cfaOut =
    action === 'wire'
      ? Number(amount || 0) * Number(rate || 0) + Number(feeCfa || 0)
      : action === 'shipping' && payCurrency === 'USD'
        ? Number(amount || 0) * Number(rate || 0) + Number(feeCfa || 0)
        : Number(amount || 0) + Number(feeCfa || 0);

  return (
    <Modal title={titles[action]} onClose={onClose}>
      <Alert kind="error">{error}</Alert>

      <Field label="Which transfer company?" help="Where the money comes from.">
        <select value={transferCompanyId} onChange={(e) => setTransferCompanyId(e.target.value)}>
          <option value="">Choose…</option>
          {transferCompanies.map((company) => (
            <option key={company.id} value={company.id}>
              {company.name}
            </option>
          ))}
        </select>
      </Field>

      {needsCounterparty && (
        <Field label={action === 'wire' ? 'Which supplier?' : action === 'shipping' ? 'Which shipping company?' : 'Who is being paid?'}>
          <select value={counterpartyId} onChange={(e) => setCounterpartyId(e.target.value)}>
            <option value="">Choose…</option>
            {counterparties.map((party) => (
              <option key={party.id} value={party.id}>
                {party.name}
              </option>
            ))}
          </select>
        </Field>
      )}

      {action === 'shipping' && (
        <Field label="Paid in which currency?">
          <select value={payCurrency} onChange={(e) => setPayCurrency(e.target.value as 'USD' | 'CFA')}>
            <option value="USD">USD</option>
            <option value="CFA">{cfa}</option>
          </select>
        </Field>
      )}

      <div className="row">
        <Field
          label={
            action === 'wire'
              ? 'Amount to credit him (USD)'
              : action === 'shipping'
                ? `Amount paid (${payCurrency === 'USD' ? 'USD' : cfa})`
                : `Amount (${cfa})`
          }
        >
          <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
        </Field>

        {needsRate && (
          <Field label={`Rate today (${cfa} per USD)`}>
            <input type="number" step="0.000001" value={rate} onChange={(e) => setRate(e.target.value)} />
          </Field>
        )}
      </div>

      {needsRate && (
        <Field label={`Commission (${cfa})`} help="Leave empty when the company does not charge a visible fee.">
          <input type="number" value={feeCfa} onChange={(e) => setFeeCfa(e.target.value)} />
        </Field>
      )}

      <div className="row">
        <Field label="Date">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Note">
          <input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>

      {action !== 'deposit' && cfaOut > 0 && (
        <Alert kind="info">
          {fmt(cfaOut.toFixed(0))} {cfa} will leave the transfer company
          {Number(feeCfa) > 0 && ` (including ${fmt(feeCfa)} of commission)`}.
        </Alert>
      )}

      <div className="modal-actions">
        <button className="secondary" onClick={onClose}>Cancel</button>
        <button
          onClick={() => void run()}
          disabled={
            busy || !transferCompanyId || !Number(amount) ||
            (needsCounterparty && !counterpartyId) || (needsRate && !Number(rate))
          }
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </Modal>
  );
}
