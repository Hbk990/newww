import { useEffect, useState } from 'react';
import { api, fmt, todayIso, type Car, type Party, type Reservation } from '../lib/api';
import { Alert, Field, Modal, useSubmit } from '../components/ui';
import { MoneyInput, moneyValue } from './MoneyInput';
import { useApp } from '../App';

/**
 * HOLDING A CAR FOR A BUYER.
 *
 * He pays something now and comes back with the rest. The money is yours the
 * moment he hands it over, so it goes into an account immediately — but the car
 * is not sold and none of this is profit yet. When he comes back the deposit
 * counts towards the price; it is never collected twice.
 */
export function ReserveModal({
  car,
  onClose,
  onDone,
}: {
  car: Car;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const { cfa } = useApp();
  const [accounts, setAccounts] = useState<Party[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [customerMobile, setCustomerMobile] = useState('');
  const [deposit, setDeposit] = useState('');
  const [date, setDate] = useState(todayIso());
  const [note, setNote] = useState('');
  const [destinationAccountId, setDestination] = useState('');

  useEffect(() => {
    void api.get<Party[]>('/api/parties?type=TRANSFER_COMPANY').then(setAccounts);
  }, []);

  const amount = moneyValue(deposit) ?? 0;
  const asking = Number(car.askingPriceCfa ?? 0);

  const { busy, error, run } = useSubmit(async () => {
    await api.post(`/api/cars/${car.id}/reserve`, {
      customerName,
      customerMobile: customerMobile || null,
      depositCfa: amount,
      date,
      note: note || null,
      destinationAccountId: destinationAccountId ? Number(destinationAccountId) : null,
    });
    onDone(`${customerName} is holding this car with ${fmt(amount)} ${cfa}.`);
  });

  return (
    <Modal title={`Hold the ${car.year} ${car.makeName} ${car.modelName}`} onClose={onClose}>
      <Alert kind="error">{error}</Alert>

      <div className="row">
        <Field label="Who is holding it?">
          <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} autoFocus />
        </Field>
        <Field label="His mobile">
          <input value={customerMobile} onChange={(e) => setCustomerMobile(e.target.value)} />
        </Field>
      </div>

      <div className="row">
        <Field label={`Deposit paid (${cfa})`}>
          <MoneyInput value={deposit} onChange={setDeposit} />
        </Field>
        <Field label="Date">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>

      <Field
        label="Where does the money go?"
        help="The deposit is in your hands now, so it lands in that account straight away. It is not profit until the car is sold."
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

      <Field label="Note" help="What was agreed — when he comes back, what he still owes.">
        <textarea value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>

      {amount > 0 && asking > 0 && (
        <Alert kind={amount > asking ? 'error' : 'info'}>
          {amount > asking
            ? `That is more than the asking price of ${fmt(asking)} ${cfa}. Record it as a sale instead.`
            : `He would still owe ${fmt(asking - amount)} ${cfa} of the ${fmt(asking)} asking price.`}
        </Alert>
      )}

      <div className="modal-actions">
        <button className="secondary" onClick={onClose}>
          Cancel
        </button>
        <button
          onClick={() => void run()}
          disabled={busy || !customerName.trim() || amount <= 0 || (asking > 0 && amount > asking)}
        >
          {busy ? 'Saving…' : 'Take the deposit'}
        </button>
      </div>
    </Modal>
  );
}

/**
 * The buyer changed his mind. Either the money goes back to him, or you keep
 * it — and keeping it is income, so it has to be said out loud rather than
 * left unexplained in the cash box.
 */
export function CancelReservationModal({
  reservation,
  onClose,
  onDone,
}: {
  reservation: Reservation;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const { cfa } = useApp();
  const [outcome, setOutcome] = useState<'REFUNDED' | 'FORFEITED'>('REFUNDED');
  const [reason, setReason] = useState('');

  const { busy, error, run } = useSubmit(async () => {
    await api.post(`/api/reservations/${reservation.id}/cancel`, { outcome, reason });
    onDone(
      outcome === 'REFUNDED'
        ? `${fmt(reservation.depositCfa)} ${cfa} given back to ${reservation.customerName}.`
        : `Deposit of ${fmt(reservation.depositCfa)} ${cfa} kept. It is counted as income.`,
    );
  });

  return (
    <Modal title={`${reservation.customerName} is not taking the car`} onClose={onClose}>
      <Alert kind="error">{error}</Alert>

      <p className="small muted" style={{ marginTop: 0 }}>
        He put down {fmt(reservation.depositCfa)} {cfa}. What happens to it?
      </p>

      <div className="checkbox">
        <input
          type="radio"
          id="refund"
          checked={outcome === 'REFUNDED'}
          onChange={() => setOutcome('REFUNDED')}
        />
        <label htmlFor="refund">
          Give it back
          <div className="small muted">The money leaves the account it went into.</div>
        </label>
      </div>
      <div className="checkbox">
        <input
          type="radio"
          id="keep"
          checked={outcome === 'FORFEITED'}
          onChange={() => setOutcome('FORFEITED')}
        />
        <label htmlFor="keep">
          Keep it
          <div className="small muted">The money stays where it is and counts as income this month.</div>
        </label>
      </div>

      <Field label="What happened?" help="This stays on the record.">
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="He found another car" />
      </Field>

      <div className="modal-actions">
        <button className="secondary" onClick={onClose}>
          Cancel
        </button>
        <button className="danger" onClick={() => void run()} disabled={busy || reason.trim().length < 3}>
          {busy ? 'Saving…' : outcome === 'REFUNDED' ? 'Give the deposit back' : 'Keep the deposit'}
        </button>
      </div>
    </Modal>
  );
}
