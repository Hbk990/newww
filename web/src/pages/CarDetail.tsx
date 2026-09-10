import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageHeader, useApp } from '../App';
import { api, fmt, fmtDate, fmtUsd, todayIso, type Car, type CarStatus } from '../lib/api';
import { Alert, Card, Field, Spinner, StatusBadge, useSubmit } from '../components/ui';
import { CarAction } from '../components/CarActions';
import { PhotoGallery } from '../components/Photos';
import { PriceModal } from '../components/PriceModal';
import { MoneyInput } from '../components/MoneyInput';

interface Adjustment {
  id: number;
  amountCfa: string;
  reason: string;
  date: string;
  party: { id: number; name: string } | null;
}

interface CarDetailData extends Car {
  costAdjustments?: Adjustment[];
  originExpenses: { id: number; amountUsd: string; note: string | null; date: string }[];
  repairJobs: { id: number; serviceType: string; labourCostCfa: string; description: string | null; worker: { name: string } }[];
  repairParts: { id: number; description: string; costCfa: string; partsSupplier: { name: string } }[];
  sale: {
    id: number;
    channel: 'LOCAL' | 'ORIGIN';
    price: string;
    currency: string;
    saleDate: string;
    buyerName: string;
    payments: { amount: string }[];
  } | null;
  shipment: { id: number; reference: string; status: string; cfaRate: string | null } | null;
  supplier: { id: number; name: string; country: string | null };
  taxUsd: string;
  taxRefundableUsd: string;
  taxRefundMode: string;
  taxRefundSettled: boolean;
}

export default function CarDetail() {
  const { id } = useParams();
  const { cfa } = useApp();
  const [car, setCar] = useState<CarDetailData | null>(null);
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    void api.get<Adjustment[]>(`/api/cars/${id}/cost-adjustments`).then(setAdjustments).catch(() => undefined);
    return api
      .get<CarDetailData>(`/api/cars/${id}`)
      .then(setCar)
      .catch((e) => setError(e.message));
  };

  useEffect(() => {
    void load();
  }, [id]);

  if (error) return <Alert kind="error">{error}</Alert>;
  if (!car) return <Spinner />;

  const costs = car.costs;

  return (
    <>
      <PageHeader
        title={`${car.year} ${car.makeName} ${car.modelName}`}
        sub={
          <>
            {car.color} · <span style={{ fontFamily: 'ui-monospace, monospace' }}>{car.vin}</span> ·
            bought from <Link to={`/accounts/${car.supplier.id}`}>{car.supplier.name}</Link> on{' '}
            {fmtDate(car.purchaseDate)}
          </>
        }
        action={
          <div className="row" style={{ alignItems: 'center' }}>
            <StatusBadge status={car.status as CarStatus} />
            <CarAction car={car} onDone={load} />
          </div>
        }
      />

      {car.problemNote && (
        <Alert kind="warn">
          <strong>Noted when buying:</strong> {car.problemNote}
        </Alert>
      )}

      <div className="grid cols-2">
        <div>
          <ArrivalCard car={car} onChanged={load} />

          <Card title="Cost breakdown">
            <div className="breakdown">
              <div className="section-label">In USD, while abroad</div>
              <div className="line">
                <span>Purchase price</span>
                <span className="amount">{fmtUsd(costs.usd.purchasePriceUsd)}</span>
              </div>
              {Number(costs.usd.originExpensesUsd) > 0 && (
                <div className="line">
                  <span>Expenses abroad</span>
                  <span className="amount">{fmtUsd(costs.usd.originExpensesUsd)}</span>
                </div>
              )}
              {Number(costs.usd.taxCapitalizedUsd) > 0 && (
                <div className="line">
                  <span>Tax kept in the cost</span>
                  <span className="amount">{fmtUsd(costs.usd.taxCapitalizedUsd)}</span>
                </div>
              )}
              {costs.usd.freightShareUsd && (
                <div className="line">
                  <span>Freight share</span>
                  <span className="amount">{fmtUsd(costs.usd.freightShareUsd)}</span>
                </div>
              )}
              <div className="line total">
                <span>Total in USD</span>
                <span className="amount">
                  {fmtUsd(
                    Number(costs.usd.totalCostUsd) + Number(costs.usd.freightShareUsd ?? 0),
                  )}
                </span>
              </div>

              {costs.cfa ? (
                <>
                  <div className="section-label">
                    Converted at the shipment rate of {fmt(costs.cfa.cfaRate)} — locked, never recalculated
                  </div>
                  <div className="line">
                    <span>Purchase price</span>
                    <span className="amount">{fmt(costs.cfa.purchaseCfa)}</span>
                  </div>
                  {Number(costs.cfa.originExpensesCfa) > 0 && (
                    <div className="line">
                      <span>Expenses abroad</span>
                      <span className="amount">{fmt(costs.cfa.originExpensesCfa)}</span>
                    </div>
                  )}
                  {Number(costs.cfa.taxCapitalizedCfa) > 0 && (
                    <div className="line">
                      <span>Tax</span>
                      <span className="amount">{fmt(costs.cfa.taxCapitalizedCfa)}</span>
                    </div>
                  )}
                  <div className="line">
                    <span>Freight</span>
                    <span className="amount">{fmt(costs.cfa.freightCfa)}</span>
                  </div>
                  <div className="line">
                    <span className="strong">Cost on arrival</span>
                    <span className="amount strong">{fmt(costs.cfa.arrivalCostCfa)}</span>
                  </div>

                  {Number(costs.repairsCfa) > 0 && (
                    <div className="line">
                      <span>Garage work</span>
                      <span className="amount">{fmt(costs.repairsCfa)}</span>
                    </div>
                  )}
                  {adjustments.map((adjustment) => (
                    <div className="line" key={adjustment.id}>
                      <span>
                        Correction
                        <div className="small muted">
                          {fmtDate(adjustment.date)} — {adjustment.reason}
                          {adjustment.party && ` (also corrected on ${adjustment.party.name}'s account)`}
                        </div>
                      </span>
                      <span className="amount">{fmt(adjustment.amountCfa)}</span>
                    </div>
                  ))}
                  <div className="line total">
                    <span>Landed cost</span>
                    <span className="amount">{fmt(costs.landedCostCfa)} {cfa}</span>
                  </div>
                </>
              ) : (
                <Alert kind="info">
                  This car has no local-currency cost yet. It gets one the moment its shipment is
                  marked as arrived and you enter that shipment's rate.
                </Alert>
              )}
            </div>
          </Card>
        </div>

        <div>
          {costs.arrived && <CorrectCost car={car} onDone={load} />}

          {Number(car.taxRefundableUsd) > 0 && (
            <Card title="Tax refund">
              <p className="small" style={{ marginTop: 0 }}>
                Tax invoiced: {fmtUsd(car.taxUsd)} · kept in the cost:{' '}
                {fmtUsd(costs.usd.taxCapitalizedUsd)} · refundable:{' '}
                <strong>{fmtUsd(car.taxRefundableUsd)}</strong>
              </p>
              <p className="small muted">
                {car.taxRefundMode === 'SUPPLIER_CREDIT'
                  ? 'Credited to the supplier’s account, so it already reduces what you owe him.'
                  : 'To be refunded to you separately.'}
              </p>
              {car.taxRefundSettled ? (
                <Alert kind="success">Received.</Alert>
              ) : (
                <button
                  className="secondary"
                  onClick={async () => {
                    await api.post(`/api/cars/${car.id}/tax-refund/settle`);
                    await load();
                  }}
                >
                  Mark this refund as received
                </button>
              )}
            </Card>
          )}

          <Card
            title="Expenses abroad"
            action={<AddExpense carId={car.id} disabled={costs.arrived || car.status === 'SOLD_IN_ORIGIN' || car.status === 'SOLD'} onAdded={load} />}
          >
            {car.originExpenses.length === 0 ? (
              <p className="muted small" style={{ margin: 0 }}>None recorded.</p>
            ) : (
              <table>
                <tbody>
                  {car.originExpenses.map((expense) => (
                    <tr key={expense.id}>
                      <td className="small">{fmtDate(expense.date)}</td>
                      <td className="small">{expense.note ?? 'Expense'}</td>
                      <td className="num">{fmtUsd(expense.amountUsd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {costs.arrived && (
              <p className="small muted" style={{ marginBottom: 0 }}>
                The cost is frozen now, so nothing further can be added to this car.
              </p>
            )}
          </Card>

          {car.shipment && (
            <Card title="Shipment">
              <p style={{ margin: 0 }}>
                <Link to={`/shipments/${car.shipment.id}`}>{car.shipment.reference}</Link> —{' '}
                {car.shipment.status.toLowerCase()}
              </p>
            </Card>
          )}

          {(car.repairJobs.length > 0 || car.repairParts.length > 0) && (
            <Card title="Garage work">
              <table>
                <tbody>
                  {car.repairJobs.map((job) => (
                    <tr key={`j${job.id}`}>
                      <td className="small">
                        {job.serviceType.toLowerCase()} — {job.worker.name}
                        {job.description && <div className="muted">{job.description}</div>}
                      </td>
                      <td className="num">{fmt(job.labourCostCfa)}</td>
                    </tr>
                  ))}
                  {car.repairParts.map((part) => (
                    <tr key={`p${part.id}`}>
                      <td className="small">
                        {part.description}
                        <div className="muted">from {part.partsSupplier.name}</div>
                      </td>
                      <td className="num">{fmt(part.costCfa)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}

          {!car.sale && costs.landedCostCfa && <PriceCard car={car} onChanged={load} />}

          <Card title="Photos">
            <p className="small muted" style={{ marginTop: 0 }}>
              Photograph every car the day it arrives. Weeks later, when a supplier or a shipper says
              it left him perfect, these are the only answer.
            </p>
            <PhotoGallery carId={car.id} sold={car.status === 'SOLD' || car.status === 'SOLD_IN_ORIGIN'} />
          </Card>

          {car.sale && (
            <Card title="Sold">
              <p style={{ marginTop: 0 }}>
                {fmt(car.sale.price)} {car.sale.currency} to {car.sale.buyerName} on{' '}
                {fmtDate(car.sale.saleDate)}
              </p>
              {costs.landedCostCfa && (
                <p className="strong">
                  Profit: {fmt(Number(car.sale.price) - Number(costs.landedCostCfa))} {cfa}
                </p>
              )}
              {car.sale.channel !== 'ORIGIN' && (
                <Link to={`/sales/${car.sale.id}/receipt`}>
                  <button className="secondary small">Print the buyer's receipt</button>
                </Link>
              )}
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

/**
 * The arrival condition. The two checkboxes stay disabled until the car's
 * shipment has actually been marked as arrived — a car still in Texas cannot
 * be "damaged on arrival", and letting it be ticked would push it into the
 * garage queue with no cost to repair against.
 */
function ArrivalCard({ car, onChanged }: { car: CarDetailData; onChanged: () => void }) {
  const [damaged, setDamaged] = useState(car.damaged);
  const [driveAndRun, setDriveAndRun] = useState(car.driveAndRun);
  const [note, setNote] = useState(car.arrivalNote ?? '');
  // Which trades it is waiting for. Ticked here, it lands in the right column
  // of the garage board instead of a pile of "damaged" cars.
  const [needs, setNeeds] = useState({ blacksmith: false, painter: false, mechanic: false });

  const arrived = car.status === 'ARRIVED';
  const alreadySet = ['IN_GARAGE', 'SHOWROOM', 'SOLD'].includes(car.status);

  const { busy, error, run } = useSubmit(async () => {
    await api.post(`/api/cars/${car.id}/arrival-condition`, {
      damaged,
      driveAndRun,
      arrivalNote: note || null,
      needsBlacksmith: needs.blacksmith,
      needsPainter: needs.painter,
      needsMechanic: needs.mechanic,
    });
    onChanged();
    return true;
  });

  if (alreadySet) {
    return (
      <Card title="Condition on arrival">
        <p style={{ margin: 0 }}>
          {car.damaged ? (
            <span className="badge red">Damaged — went to the garage</span>
          ) : (
            <span className="badge green">Not damaged — went straight to the showroom</span>
          )}{' '}
          {car.driveAndRun ? (
            <span className="badge green">Drives &amp; runs</span>
          ) : (
            <span className="badge amber">Does not drive</span>
          )}
        </p>
        {car.arrivalNote && <p className="small muted">{car.arrivalNote}</p>}
      </Card>
    );
  }

  return (
    <Card title="Condition on arrival">
      <Alert kind="error">{error}</Alert>

      {!arrived && (
        <Alert kind="info">
          These can only be filled in once the car has arrived. Mark its shipment as arrived first.
        </Alert>
      )}

      <div className={`checkbox${arrived ? '' : ' disabled'}`}>
        <input
          type="checkbox"
          id="damaged"
          disabled={!arrived}
          checked={damaged}
          onChange={(e) => setDamaged(e.target.checked)}
        />
        <label htmlFor="damaged">
          Damaged — needs repair
          <div className="small muted">Sends the car to the garage instead of the showroom.</div>
        </label>
      </div>

      {damaged && arrived && (
        <div style={{ margin: '4px 0 4px 26px' }}>
          <div className="small muted" style={{ marginBottom: 2 }}>
            What does it need? It goes to that column of the garage board.
          </div>
          {([
            ['blacksmith', 'Blacksmith — body work'],
            ['painter', 'Painter'],
            ['mechanic', 'Mechanic'],
          ] as const).map(([key, label]) => (
            <div className="checkbox" key={key}>
              <input
                type="checkbox"
                id={`needs-${key}`}
                checked={needs[key]}
                onChange={(e) => setNeeds({ ...needs, [key]: e.target.checked })}
              />
              <label htmlFor={`needs-${key}`}>{label}</label>
            </div>
          ))}
        </div>
      )}

      <div className={`checkbox${arrived ? '' : ' disabled'}`}>
        <input
          type="checkbox"
          id="driveAndRun"
          disabled={!arrived}
          checked={driveAndRun}
          onChange={(e) => setDriveAndRun(e.target.checked)}
        />
        <label htmlFor="driveAndRun">
          Drives &amp; runs
          <div className="small muted">The car started and moved under its own power.</div>
        </label>
      </div>

      <Field label="Note on arrival">
        <textarea value={note} onChange={(e) => setNote(e.target.value)} disabled={!arrived} />
      </Field>

      <button onClick={() => void run()} disabled={!arrived || busy}>
        {busy ? 'Saving…' : damaged ? 'Send to the garage' : 'Send to the showroom'}
      </button>
    </Card>
  );
}

/**
 * Fixing a cost that was recorded wrongly — including on a car already sold,
 * which is usually when the mistake is spotted. The wrong line is never
 * deleted: deleting a 100,000 repair would quietly raise that car's profit by
 * 100,000 with nothing left to explain it. The original stays, this correction
 * sits beside it, and both remain visible.
 */
function CorrectCost({ car, onDone }: { car: CarDetailData; onDone: () => void }) {
  const { cfa } = useApp();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [partyId, setPartyId] = useState('');
  const [parties, setParties] = useState<{ id: number; name: string }[]>([]);

  useEffect(() => {
    if (!open) return;
    void Promise.all([
      api.get<{ id: number; name: string }[]>('/api/parties?type=WORKER'),
      api.get<{ id: number; name: string }[]>('/api/parties?type=PARTS_SUPPLIER'),
    ]).then(([workers, suppliers]) => setParties([...workers, ...suppliers]));
  }, [open]);

  const { busy, error, run } = useSubmit(async () => {
    await api.post(`/api/cars/${car.id}/cost-adjustments`, {
      amountCfa: Number(amount),
      reason,
      partyId: partyId ? Number(partyId) : null,
    });
    setOpen(false);
    setAmount('');
    setReason('');
    setPartyId('');
    onDone();
    return true;
  });

  if (!open)
    return (
      <Card title="Correct this car's cost">
        <p className="small muted" style={{ marginTop: 0 }}>
          Something recorded wrongly? Correct it here. The original line stays exactly as it is and
          the correction is recorded beside it with your reason — so the profit is right and the
          history still shows what happened.
        </p>
        <button className="secondary" onClick={() => setOpen(true)}>
          Make a correction
        </button>
      </Card>
    );

  return (
    <Card title="Correct this car's cost">
      <Alert kind="error">{error}</Alert>

      <Field
        label={`Amount (${cfa})`}
        help="Negative to take cost off this car, positive to add. A repair entered twice at 100,000 is −100,000."
      >
        <MoneyInput value={amount} onChange={setAmount} allowNegative placeholder="-100,000" autoFocus />
      </Field>

      <Field label="Why?" help="This stays on the record permanently.">
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="The repaint was entered twice on 1 March"
        />
      </Field>

      <Field
        label="Does this change what someone is owed?"
        help="If the wrong amount was charged to a worker or parts supplier, their balance is corrected too."
      >
        <select value={partyId} onChange={(e) => setPartyId(e.target.value)}>
          <option value="">No — only this car's cost</option>
          {parties.map((party) => (
            <option key={party.id} value={party.id}>
              {party.name}
            </option>
          ))}
        </select>
      </Field>

      {Number(amount) !== 0 && car.costs.landedCostCfa && (
        <Alert kind="info">
          Cost becomes {fmt(Number(car.costs.landedCostCfa) + Number(amount))} {cfa}
          {car.sale && ', and the profit on this sale changes to match'}.
        </Alert>
      )}

      <div className="row">
        <button onClick={() => void run()} disabled={busy || !Number(amount) || reason.trim().length < 5}>
          {busy ? 'Saving…' : 'Record the correction'}
        </button>
        <button className="secondary" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </Card>
  );
}

function AddExpense({ carId, disabled, onAdded }: { carId: number; disabled: boolean; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  const { busy, error, run } = useSubmit(async () => {
    await api.post(`/api/cars/${carId}/origin-expenses`, {
      amountUsd: Number(amount),
      note: note || null,
      date: todayIso(),
    });
    setOpen(false);
    setAmount('');
    setNote('');
    onAdded();
    return true;
  });

  if (disabled) return null;
  if (!open)
    return (
      <button className="secondary small" onClick={() => setOpen(true)}>
        + Add
      </button>
    );

  return (
    <div style={{ width: '100%' }}>
      <Alert kind="error">{error}</Alert>
      <div className="row">
        <Field label="Amount (USD)">
          <MoneyInput decimals={2} value={amount} onChange={setAmount} />
        </Field>
        <Field label="What for?">
          <input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <div className="actions">
          <button className="small" onClick={() => void run()} disabled={busy || !Number(amount)}>
            Add
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * The asking price, changeable for as long as the car is unsold. Beside it sits
 * what the car has cost, so the two numbers are never read apart.
 */
function PriceCard({ car, onChanged }: { car: CarDetailData; onChanged: () => void }) {
  const { cfa } = useApp();
  const [editing, setEditing] = useState(false);

  const cost = Number(car.costs.landedCostCfa ?? 0);
  const asking = Number(car.askingPriceCfa ?? 0);
  const profit = asking - cost;

  return (
    <Card
      title="Asking price"
      action={
        <button className="secondary small" onClick={() => setEditing(true)}>
          {car.askingPriceCfa ? 'Change the price' : 'Set a price'}
        </button>
      }
    >
      {car.askingPriceCfa ? (
        <div className="breakdown">
          <div className="line">
            <span>Asking</span>
            <span className="amount strong">{fmt(car.askingPriceCfa)} {cfa}</span>
          </div>
          <div className="line">
            <span>Cost so far</span>
            <span className="amount">{fmt(cost)} {cfa}</span>
          </div>
          <div className="line total">
            <span>{profit >= 0 ? 'Profit if it sells at that' : 'Loss if it sells at that'}</span>
            <span className={`amount ${profit < 0 ? 'neg' : 'pos'}`}>{fmt(Math.abs(profit))} {cfa}</span>
          </div>
        </div>
      ) : (
        <p className="small muted" style={{ margin: 0 }}>
          No price yet. It has cost {fmt(cost)} {cfa} so far.
        </p>
      )}

      {editing && (
        <PriceModal
          car={car}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            onChanged();
          }}
        />
      )}
    </Card>
  );
}
