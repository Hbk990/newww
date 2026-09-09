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

/** Create the shipment, load the car, and sail it — one action. */
function ShipModal({ car, onClose, onDone }: { car: Car; onClose: () => void; onDone: () => void }) {
  const [companies, setCompanies] = useState<Party[]>([]);
  const [waiting, setWaiting] = useState<Car[]>([]);
  const [shippingCompanyId, setCompany] = useState('');
  const [freight, setFreight] = useState('');
  const [departureDate, setDeparture] = useState(todayIso());
  const [alsoCarIds, setAlso] = useState<number[]>([]);

  useEffect(() => {
    void api.get<Party[]>('/api/parties?type=SHIPPING_COMPANY').then(setCompanies);
    void api
      .get<Car[]>('/api/cars?status=PURCHASED&unassigned=true')
      .then((cars) => setWaiting(cars.filter((c) => c.id !== car.id)));
  }, [car.id]);

  const { busy, error, run } = useSubmit(async () => {
    await api.post(`/api/cars/${car.id}/ship`, {
      shippingCompanyId: Number(shippingCompanyId),
      freightCostUsd: moneyValue(freight),
      departureDate,
      alsoCarIds,
    });
    onDone();
    return true;
  });

  const carCount = alsoCarIds.length + 1;
  const share = hasAmount(freight) ? Number(freight) / carCount : 0;

  return (
    <Modal title={`Ship the ${carName(car)}`} onClose={onClose}>
      <Alert kind="error">{error}</Alert>

      <Field label="Which shipping company?" help="This is what identifies the shipment afterwards.">
        <select value={shippingCompanyId} onChange={(e) => setCompany(e.target.value)} autoFocus>
          <option value="">Choose…</option>
          {companies.map((company) => (
            <option key={company.id} value={company.id}>
              {company.name}
            </option>
          ))}
        </select>
      </Field>

      <div className="row">
        <Field label="Freight cost (USD)" help="The whole invoice, however many cars travel.">
          <MoneyInput decimals={2} value={freight} onChange={setFreight} placeholder="1,200" />
        </Field>
        <Field label="Departure date">
          <input type="date" value={departureDate} onChange={(e) => setDeparture(e.target.value)} />
        </Field>
      </div>

      {waiting.length > 0 && (
        <Field label="Any other cars travelling with it?" help="Tick the ones in the same container.">
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

      {hasAmount(freight) && (
        <Alert kind="info">
          {fmtUsd(freight)} across {carCount} car{carCount > 1 ? 's' : ''} ={' '}
          <strong>{fmtUsd(share.toFixed(2))}</strong> each. You can change any car's share on the
          shipment before it arrives.
        </Alert>
      )}

      <div className="modal-actions">
        <button className="secondary" onClick={onClose}>Cancel</button>
        <button onClick={() => void run()} disabled={busy || !shippingCompanyId || !hasAmount(freight)}>
          {busy ? 'Saving…' : 'Ship it'}
        </button>
      </div>
    </Modal>
  );
}

/**
 * Landing the car. The rate belongs to the whole shipment, so when other cars
 * travelled with it they land together — and the screen says so plainly before
 * anything is locked.
 */
function ArriveModal({ car, onClose, onDone }: { car: Car; onClose: () => void; onDone: () => void }) {
  const [rate, setRate] = useState('');
  const [arrivalDate, setArrival] = useState(todayIso());
  const [shipment, setShipment] = useState<{ id: number; cars: Car[]; shippingCompany: { name: string }; freightCostUsd: string } | null>(null);

  useEffect(() => {
    if (!car.shipment) return;
    void api.get<typeof shipment>(`/api/shipments/${car.shipment.id}`).then(setShipment);
  }, [car.shipment?.id]);

  const { busy, error, run } = useSubmit(async () => {
    await api.post(`/api/shipments/${car.shipment!.id}/arrive`, {
      cfaRate: Number(rate),
      arrivalDate,
    });
    onDone();
    return true;
  });

  const others = (shipment?.cars.length ?? 1) - 1;
  const rateValue = Number(rate || 0);

  return (
    <Modal title={`The ${carName(car)} arrived`} onClose={onClose} wide>
      <Alert kind="error">{error}</Alert>

      <Alert kind="warn">
        The rate you enter converts this car's purchase price, its expenses, its tax and its freight
        into local currency — and then it is locked. It will not change later, even if the rate moves.
      </Alert>

      {others > 0 && (
        <Alert kind="info">
          {others} other car{others > 1 ? 's' : ''} travelled with it and will land at this same rate.
        </Alert>
      )}

      <div className="row">
        <Field label="Rate: how many CFA for 1 USD?" help="The rate you actually paid for this shipment.">
          <input
            type="number"
            step="0.000001"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            placeholder="600"
            autoFocus
          />
        </Field>
        <Field label="Arrival date">
          <input type="date" value={arrivalDate} onChange={(e) => setArrival(e.target.value)} />
        </Field>
      </div>

      {rateValue > 0 && shipment && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Car</th>
                <th className="num">Cost USD</th>
                <th className="num">Freight</th>
                <th className="num">Cost on arrival</th>
              </tr>
            </thead>
            <tbody>
              {shipment.cars.map((other) => {
                const usd = Number(other.costs?.usd.totalCostUsd ?? 0);
                const freightShare = Number(other.freightShareUsd ?? 0);
                return (
                  <tr key={other.id}>
                    <td>{carName(other)}</td>
                    <td className="num">{fmtUsd(usd)}</td>
                    <td className="num">{fmtUsd(freightShare)}</td>
                    <td className="num strong">{fmt(Math.round((usd + freightShare) * rateValue))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="modal-actions">
        <button className="secondary" onClick={onClose}>Cancel</button>
        <button onClick={() => void run()} disabled={busy || rateValue <= 0}>
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
