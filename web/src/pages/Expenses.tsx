import { useEffect, useState } from 'react';
import { PageHeader, useApp } from '../App';
import { api, fmt, fmtDate, todayIso, type Party } from '../lib/api';
import { Alert, Card, Empty, Field, Modal, Spinner, useSubmit } from '../components/ui';

interface Overhead {
  id: number;
  date: string;
  category: string;
  amountCfa: string;
  note: string | null;
  party: { id: number; name: string } | null;
}

const CATEGORIES = [
  { value: 'RENT', label: 'Rent' },
  { value: 'SALARY', label: 'Salary' },
  { value: 'UTILITIES', label: 'Electricity, water, internet' },
  { value: 'TRANSPORT', label: 'Transport' },
  { value: 'OTHER', label: 'Other' },
];

export default function Expenses() {
  const { cfa } = useApp();
  const [expenses, setExpenses] = useState<Overhead[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    api
      .get<Overhead[]>('/api/overhead')
      .then(setExpenses)
      .catch((e) => setError(e.message));

  useEffect(() => {
    void load();
  }, []);

  const total = (expenses ?? []).reduce((sum, expense) => sum + Number(expense.amountCfa), 0);

  return (
    <>
      <PageHeader
        title="Running expenses"
        sub="Rent, salaries and the rest — kept out of every car's cost on purpose"
        action={<button onClick={() => setAdding(true)}>Add an expense</button>}
      />

      <Alert kind="info">
        These are not added to any car. They are subtracted at the bottom of the monthly report, so
        each car's cost stays exactly what it took to buy, ship and repair that car.
      </Alert>

      <Alert kind="error">{error}</Alert>

      {!expenses ? (
        <Spinner />
      ) : expenses.length === 0 ? (
        <Card>
          <Empty>No expenses recorded yet.</Empty>
        </Card>
      ) : (
        <Card title={`${expenses.length} expenses — ${fmt(total)} ${cfa} in total`}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Category</th>
                  <th>Note</th>
                  <th>Who</th>
                  <th className="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((expense) => (
                  <tr key={expense.id}>
                    <td className="small">{fmtDate(expense.date)}</td>
                    <td>
                      <span className="badge">
                        {CATEGORIES.find((c) => c.value === expense.category)?.label ?? expense.category}
                      </span>
                    </td>
                    <td className="small">{expense.note ?? '—'}</td>
                    <td className="small">{expense.party?.name ?? '—'}</td>
                    <td className="num">{fmt(expense.amountCfa)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {adding && (
        <AddExpense
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            void load();
          }}
        />
      )}
    </>
  );
}

function AddExpense({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { cfa } = useApp();
  const [category, setCategory] = useState('RENT');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayIso());
  const [note, setNote] = useState('');
  const [partyId, setPartyId] = useState('');
  const [transferCompanyId, setTransferCompanyId] = useState('');
  const [workers, setWorkers] = useState<Party[]>([]);
  const [transferCompanies, setTransferCompanies] = useState<Party[]>([]);

  useEffect(() => {
    void api.get<Party[]>('/api/parties?type=WORKER').then(setWorkers);
    void api.get<Party[]>('/api/parties?type=TRANSFER_COMPANY').then(setTransferCompanies);
  }, []);

  const { busy, error, run } = useSubmit(async () => {
    await api.post('/api/overhead', {
      category,
      amountCfa: Number(amount),
      date,
      note: note || null,
      partyId: partyId ? Number(partyId) : null,
      transferCompanyId: transferCompanyId ? Number(transferCompanyId) : null,
    });
    onSaved();
    return true;
  });

  return (
    <Modal title="Add a running expense" onClose={onClose}>
      <Alert kind="error">{error}</Alert>

      <div className="row">
        <Field label="Category">
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label={`Amount (${cfa})`}>
          <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
        </Field>
        <Field label="Date">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>

      <Field label="Note">
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Showroom rent for March" />
      </Field>

      {category === 'SALARY' && (
        <Field label="Whose salary?" help="Puts it on that person's account so you can see what is owed.">
          <select value={partyId} onChange={(e) => setPartyId(e.target.value)}>
            <option value="">Not linked to a person</option>
            {workers.map((worker) => (
              <option key={worker.id} value={worker.id}>
                {worker.name} ({worker.workerRole?.toLowerCase()})
              </option>
            ))}
          </select>
        </Field>
      )}

      <Field
        label="Paid now from"
        help="Leave empty if it has not been paid yet — it will still count as an expense of the month."
      >
        <select value={transferCompanyId} onChange={(e) => setTransferCompanyId(e.target.value)}>
          <option value="">Not paid yet</option>
          {transferCompanies.map((company) => (
            <option key={company.id} value={company.id}>
              {company.name}
            </option>
          ))}
        </select>
      </Field>

      <div className="modal-actions">
        <button className="secondary" onClick={onClose}>Cancel</button>
        <button onClick={() => void run()} disabled={busy || !Number(amount)}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </Modal>
  );
}
