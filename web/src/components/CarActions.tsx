import { useEffect, useState } from 'react';
import { api, fmt, fmtUsd, todayIso, type Car, type Party } from '../lib/api';
import { Alert, Field, Modal, useSubmit } from '../components/ui';
import { MoneyInput, hasAmount, moneyValue } from './MoneyInput';

/**
 * The next thing to do to a car, offered wherever the car is shown.
 *
 * Moving a car along used to mean going to the Shipments screen, creating a
 * shipment, adding the car, marking it sailed and later marking it arrived —
 * four screens' worth of steps for what is one decision. These buttons do the
 * same work from the car list, and each one names the next action rather than
 * the machinery behind it.
 */
export function CarAction({ car, onDone }: { car: Car; onDone: () => void }) {
  const [open, setOpen] = useState<'ship' | 'arrive' | 'condition' | null>(null);

  const button = (label: string, action: 'ship' | 'arrive' | 'condition') => (
    <button className="small" onClick={() => setOpen(action)}>
      {label}
    </button>
  );

  return (
    <>
      {car.status === 'PURCHASED' && !car.shipment && button('Ship it', 'ship')}
      {car.status === 'SHIPPED' && button('It arrived', 'arrive')}
      {car.status === 'ARRIVED' && button('Set condition', 'condition')}

      {open === 'ship' && (
        <ShipModal car={car} onClose={() => setOpen(null)} onDone={() => { setOpen(null); onDone(); }} />
      )}
      {open === 'arrive' && (
        <ArriveModal car={car} onClose={() => setOpen(null)} onDone={() => { setOpen(null); onDone(); }} />
      )}
      {open === 'condition' && (
        <ConditionModal car={car} onClose={() => setOpen(null)} onDone={() => { setOpen(null); onDone(); }} />
      )}
    </>
  );
}

const carName = (car: Car) => `${car.year} ${car.makeName} ${car.modelName}`;

interface OpenShipment {
  id: number;
  reference: string;
  shippingCompany: { id: number; name: string };
  cars: { id: number; year: number; makeName: string; modelName: string }[];
}

/**
 * Shipping a car: either it joins a group already on its way, or it starts a
 * new one. Cars are bought over weeks and loaded as they are ready, so a car
 * going out today often belongs with cars sent last week — the shipment's name
 * is how you recognise that group.
 *
 * Freight is not asked for here. The invoice usually only turns up when the
 * cars land, so it is entered on arrival.
 */
function ShipModal({ car, onClose, onDone }: { car: Car; onClose: () => void; onDone: () => void }) {
  const [companies, setCompanies] = useState<Party[]>([]);
  const [open, setOpen] = useState<OpenShipment[]>([]);
  const [waiting, setWaiting] = useState<Car[]>([]);

  const [mode, setMode] = useState<'join' | 'new'>('new');
  const [shipmentId, setShipmentId] = useState('');
  const [reference, setReference] = useState('');
  const [shippingCompanyId, setCompany] = useState('');
  const [departureDate, setDeparture] = useState(todayIso());
  const [alsoCarIds, setAlso] = useState<number[]>([]);

  useEffect(() => {
    void api.get<Party[]>('/api/parties?type=SHIPPING_COMPANY').then(setCompanies);
    void api.get<OpenShipment[]>('/api/shipments/open').then((list) => {
      setOpen(list);
      // If something is already on its way, joining it is the likely intent.
      if (list.length > 0) {
        setMode('join');
        setShipmentId(String(list[0].id));
      }
    });
    void api
      .get<Car[]>('/api/cars?status=PURCHASED&unassigned=true')
      .then((cars) => setWaiting(cars.filter((c) => c.id !== car.id)));
  }, [car.id]);

  const { busy, error, run } = useSubmit(async () => {
    await api.post(`/api/cars/${car.id}/ship`, {
      ...(mode === 'join'
        ? { shipmentId: Number(shipmentId) }
        : { reference, shippingCompanyId: Number(shippingCompanyId) }),
      departureDate,
      alsoCarIds,
    });
    onDone();
    return true;
  });

  const chosen = open.find((s) => String(s.id) === shipmentId);
  const ready = mode === 'join' ? Boolean(shipmentId) : Boolean(reference.trim() && shippingCompanyId);

  return (
    <Modal title={`Ship the ${carName(car)}`} onClose={onClose}>
      <Alert kind="error">{error}</Alert>

      {open.length > 0 && (
        <div className="row" style={{ marginBottom: 12 }}>
          <button
            className={mode === 'join' ? '' : 'secondary'}
            style={{ flex: '0 0 auto' }}
            onClick={() => setMode('join')}
          >
            Add to a shipment on its way
          </button>
          <button
            className={mode === 'new' ? '' : 'secondary'}
            style={{ flex: '0 0 auto' }}
            onClick={() => setMode('new')}
          >
            Start a new shipment
          </button>
        </div>
      )}

      {mode === 'join' ? (
        <Field label="Which shipment is it going with?">
          <select value={shipmentId} onChange={(e) => setShipmentId(e.target.value)} autoFocus>
            {open.map((shipment) => (
              <option key={shipment.id} value={shipment.id}>
                {shipment.reference} — {shipment.shippingCompany.name} ({shipment.cars.length} car
                {shipment.cars.length === 1 ? '' : 's'})
              </option>
            ))}
          </select>
        </Field>
      ) : (
        <>
          <Field
            label="Name this shipment"
            help="Whatever you call it — a container number, or just “February container”. You will pick it from this name when the next car joins."
          >
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="MSCU-7781234"
              autoFocus
            />
          </Field>

          <Field label="Shipping company">
            <select value={shippingCompanyId} onChange={(e) => setCompany(e.target.value)}>
              <option value="">Choose…</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
          </Field>
        </>
      )}

      {chosen && mode === 'join' && chosen.cars.length > 0 && (
        <Alert kind="info">
          Already on “{chosen.reference}”:{' '}
          {chosen.cars.map((c) => `${c.year} ${c.makeName} ${c.modelName}`).join(', ')}.
        </Alert>
      )}

      <Field label="Departure date">
        <input type="date" value={departureDate} onChange={(e) => setDeparture(e.target.value)} />
      </Field>

      {waiting.length > 0 && (
        <Field label="Any other cars going at the same time?" help="Tick them and they travel together.">
          <div style={{ maxHeight: 170, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 6, padding: 8 }}>
            {waiting.map((other) => (
              <div className="checkbox" key={other.id}>
                <input
                  type="checkbox"
                  id={`also${other.id}`}
                  checked={alsoCarIds.includes(other.id)}
                  onChange={(e) =>
                    setAlso(e.target.checked ? [...alsoCarIds, other.id] : alsoCarIds.filter((x) => x !== other.id))
                  }
                />
                <label htmlFor={`also${other.id}`}>
                  {carName(other)}
                  <div className="small muted">{other.color} · {other.vin}</div>
                </label>
              </div>
            ))}
          </div>
        </Field>
      )}

      <Alert kind="info">
        The freight invoice is entered when the cars arrive, along with the rate.
      </Alert>

      <div className="modal-actions">
        <button className="secondary" onClick={onClose}>Cancel</button>
        <button onClick={() => void run()} disabled={busy || !ready}>
          {busy ? 'Saving…' : mode === 'join' ? 'Add it to that shipment' : 'Ship it'}
        </button>
      </div>
    </Modal>
  );
}

/**
 * Landing the shipment. Two things are only known now: what the freight
 * actually cost, and the rate. Both are entered here, and the screen shows what
 * each car will carry before anything is locked.
 *
 * The freight goes onto the shipping company's account as owed — it is not
 * treated as paid. Pay it from the Payments screen whenever you settle up.
 */
function ArriveModal({ car, onClose, onDone }: { car: Car; onClose: () => void; onDone: () => void }) {
  const [rate, setRate] = useState('');
  const [freight, setFreight] = useState('');
  const [arrivalDate, setArrival] = useState(todayIso());
  const [shipment, setShipment] = useState<{
    id: number;
    reference: string;
    cars: Car[];
    shippingCompany: { name: string };
    freightCostUsd: string;
  } | null>(null);
  const [shares, setShares] = useState<Record<number, string>>({});
  const [splitByHand, setSplitByHand] = useState(false);

  useEffect(() => {
    if (!car.shipment) return;
    void api.get<NonNullable<typeof shipment>>(`/api/shipments/${car.shipment.id}`).then((data) => {
      setShipment(data);
      if (Number(data.freightCostUsd) > 0) setFreight(String(data.freightCostUsd));
    });
  }, [car.shipment?.id]);

  // Equal split follows the freight until you choose to change it yourself.
  const carCount = shipment?.cars.length ?? 1;
  const equalShare = hasAmount(freight) ? Number(freight) / carCount : 0;
  const shareOf = (id: number) =>
    splitByHand ? Number(shares[id] ?? 0) : Number(equalShare.toFixed(2));

  const sharesTotal = (shipment?.cars ?? []).reduce((sum, c) => sum + shareOf(c.id), 0);
  const sharesMatch = Math.abs(sharesTotal - Number(freight || 0)) < 0.005;

  const { busy, error, run } = useSubmit(async () => {
    await api.post(`/api/shipments/${car.shipment!.id}/arrive`, {
      cfaRate: Number(rate),
      freightCostUsd: moneyValue(freight),
      arrivalDate,
      ...(splitByHand
        ? {
            shares: (shipment?.cars ?? []).map((c) => ({
              carId: c.id,
              amountUsd: Number(shares[c.id] ?? 0),
            })),
          }
        : {}),
    });
    onDone();
    return true;
  });

  const others = carCount - 1;
  const rateValue = Number(rate || 0);

  return (
    <Modal title={shipment ? `“${shipment.reference}” arrived` : 'Shipment arrived'} onClose={onClose} wide>
      <Alert kind="error">{error}</Alert>

      {others > 0 && (
        <Alert kind="info">
          {carCount} cars travelled together and land at the same rate:{' '}
          {(shipment?.cars ?? []).map((c) => `${c.year} ${c.makeName} ${c.modelName}`).join(', ')}.
        </Alert>
      )}

      <div className="row">
        <Field
          label="Freight invoice (USD)"
          help={`The whole invoice for this shipment. It goes onto ${shipment?.shippingCompany.name ?? 'the shipping company'}'s account as owed — pay it whenever you settle up.`}
        >
          <MoneyInput decimals={2} value={freight} onChange={setFreight} placeholder="1,200" autoFocus />
        </Field>
        <Field label="Rate: how many CFA for 1 USD?" help="The rate you actually paid for this shipment.">
          <input
            type="number"
            step="0.000001"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            placeholder="600"
          />
        </Field>
        <Field label="Arrival date">
          <input type="date" value={arrivalDate} onChange={(e) => setArrival(e.target.value)} />
        </Field>
      </div>

      <Alert kind="warn">
        The rate converts each car's purchase price, expenses, tax and freight into local currency —
        and then it is locked. It will not change later, even if the rate moves.
      </Alert>

      {hasAmount(freight) && shipment && (
        <>
          <div className="page-header" style={{ marginBottom: 6 }}>
            <h3>What each car will cost</h3>
            {carCount > 1 && (
              <button
                className="secondary small"
                onClick={() => {
                  if (!splitByHand) {
                    setShares(
                      Object.fromEntries(
                        shipment.cars.map((c) => [c.id, equalShare.toFixed(2)]),
                      ),
                    );
                  }
                  setSplitByHand(!splitByHand);
                }}
              >
                {splitByHand ? 'Split the freight equally' : 'Split the freight unevenly'}
              </button>
            )}
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Car</th>
                  <th className="num">Cost USD</th>
                  <th className="num">Freight share</th>
                  <th className="num">Cost on arrival</th>
                </tr>
              </thead>
              <tbody>
                {shipment.cars.map((other) => {
                  const usd = Number(other.costs?.usd.totalCostUsd ?? 0);
                  const freightShare = shareOf(other.id);
                  return (
                    <tr key={other.id}>
                      <td>{other.year} {other.makeName} {other.modelName}</td>
                      <td className="num">{fmtUsd(usd)}</td>
                      <td className="num">
                        {splitByHand ? (
                          <div style={{ width: 120, marginLeft: 'auto' }}>
                            <MoneyInput
                              decimals={2}
                              value={shares[other.id] ?? ''}
                              onChange={(next) => setShares({ ...shares, [other.id]: next })}
                            />
                          </div>
                        ) : (
                          fmtUsd(freightShare.toFixed(2))
                        )}
                      </td>
                      <td className="num strong">
                        {rateValue > 0 ? fmt(Math.round((usd + freightShare) * rateValue)) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {splitByHand && !sharesMatch && (
            <Alert kind="warn">
              The shares add up to {fmtUsd(sharesTotal.toFixed(2))} but the freight is{' '}
              {fmtUsd(freight)}. They must match exactly.
            </Alert>
          )}
        </>
      )}

      <div className="modal-actions">
        <button className="secondary" onClick={onClose}>Cancel</button>
        <button
          onClick={() => void run()}
          disabled={busy || rateValue <= 0 || !hasAmount(freight) || (splitByHand && !sharesMatch)}
        >
          {busy ? 'Saving…' : 'Confirm arrival and lock these costs'}
        </button>
      </div>
    </Modal>
  );
}

/** Damaged or not — the one thing that decides garage or showroom. */
function ConditionModal({ car, onClose, onDone }: { car: Car; onClose: () => void; onDone: () => void }) {
  const [damaged, setDamaged] = useState(car.damaged);
  const [driveAndRun, setDriveAndRun] = useState(car.driveAndRun);
  const [note, setNote] = useState(car.arrivalNote ?? '');

  const { busy, error, run } = useSubmit(async () => {
    await api.post(`/api/cars/${car.id}/arrival-condition`, {
      damaged,
      driveAndRun,
      arrivalNote: note || null,
    });
    onDone();
    return true;
  });

  return (
    <Modal title={`How did the ${carName(car)} arrive?`} onClose={onClose}>
      <Alert kind="error">{error}</Alert>

      <div className="checkbox">
        <input type="checkbox" id="dmg" checked={damaged} onChange={(e) => setDamaged(e.target.checked)} />
        <label htmlFor="dmg">
          Damaged — needs repair
          <div className="small muted">Sends it to the garage instead of the showroom.</div>
        </label>
      </div>

      <div className="checkbox">
        <input type="checkbox" id="drv" checked={driveAndRun} onChange={(e) => setDriveAndRun(e.target.checked)} />
        <label htmlFor="drv">
          Drives &amp; runs
          <div className="small muted">It started and moved under its own power.</div>
        </label>
      </div>

      <Field label="Note on arrival">
        <textarea value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>

      <div className="modal-actions">
        <button className="secondary" onClick={onClose}>Cancel</button>
        <button onClick={() => void run()} disabled={busy}>
          {busy ? 'Saving…' : damaged ? 'Send to the garage' : 'Send to the showroom'}
        </button>
      </div>
    </Modal>
  );
}
