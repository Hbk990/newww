import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../App';
import { api, fmt, fmtDate, fmtUsd, todayIso, type Car, type Party, type Shipment } from '../lib/api';
import { Alert, Card, Empty, Field, Modal, Spinner, useSubmit } from '../components/ui';
import { MoneyInput, hasAmount, moneyValue } from '../components/MoneyInput';
import { Chip } from '../components/Chip';
import { CarMark, ShipMark } from '../components/icons';

/**
 * SHIPMENTS, DRAWN AS VOYAGES.
 *
 * A shipment is not a row of figures, it is cars in a container somewhere
 * between a port in America and your yard. The strip shows where each one has
 * got to, what it is costing, and which cars are aboard — the three things you
 * would ask if you telephoned the shipping company.
 */

const STATUS_BADGE: Record<string, string> = {
  DRAFT: 'grey',
  SHIPPED: 'blue',
  ARRIVED: 'green',
};

export default function Shipments() {
  const [shipments, setShipments] = useState<Shipment[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    api
      .get<Shipment[]>('/api/shipments')
      .then(setShipments)
      .catch((e) => setError(e.message));

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="page">
      <PageHeader
        title="Shipments"
        sub="One car alone is simply a shipment with one car in it"
        action={<button onClick={() => setCreating(true)}>New shipment</button>}
      />

      <Alert kind="error">{error}</Alert>

      {!shipments ? (
        <Spinner />
      ) : shipments.length === 0 ? (
        <Card>
          <Empty>No shipments yet. Create one and add the cars that are travelling together.</Empty>
        </Card>
      ) : (
        shipments.map((shipment) => <Voyage key={shipment.id} shipment={shipment} />)
      )}

      {creating && (
        <NewShipment
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            void load();
          }}
        />
      )}
    </div>
  );
}

/** One shipment: where it is, what it costs, and who is aboard. */
function Voyage({ shipment }: { shipment: Shipment }) {
  const stops = [
    {
      what: 'Loaded',
      when: shipment.departureDate,
      reached: shipment.status !== 'DRAFT',
    },
    {
      what: 'At sea',
      when: shipment.status === 'SHIPPED' ? shipment.departureDate : null,
      reached: shipment.status !== 'DRAFT',
    },
    {
      what: 'Arrived',
      when: shipment.arrivalDate,
      reached: shipment.status === 'ARRIVED',
    },
  ];
  // Where the shipment is now: the last stop it has reached.
  const here = stops.reduce((last, stop, index) => (stop.reached ? index : last), -1);

  return (
    <div className="voyage">
      <div className="head">
        <div>
          <Link to={`/shipments/${shipment.id}`} className="name-link" style={{ fontSize: 17 }}>
            {shipment.shippingCompany.name}
          </Link>
          <div className="small muted">
            {shipment.reference} · {shipment.cars.length} car
            {shipment.cars.length === 1 ? '' : 's'}{' '}
            <span className={`badge ${STATUS_BADGE[shipment.status]}`}>
              {shipment.status.toLowerCase()}
            </span>
          </div>
        </div>

        <div className="figures">
          <div className="figure">
            <div className="k">Freight</div>
            <div className="v">{fmtUsd(shipment.freightCostUsd)}</div>
          </div>
          <div className="figure">
            <div className="k">Rate locked</div>
            <div className="v">{shipment.cfaRate ? fmt(shipment.cfaRate) : '—'}</div>
          </div>
          <div className="figure">
            <div className="k">Each car</div>
            <div className="v">
              {shipment.cars.length > 0
                ? fmtUsd((Number(shipment.freightCostUsd) / shipment.cars.length).toFixed(2))
                : '—'}
            </div>
          </div>
        </div>
      </div>

      <div className="track">
        {stops.map((stop, index) => (
          <div
            key={stop.what}
            className={`stop ${index === here ? 'here' : stop.reached ? 'done' : 'todo'}`}
          >
            <div className="dot">
              {index === here && (
                <span style={{ color: '#fff', display: 'grid', placeItems: 'center' }}>
                  <ShipMark size={12} />
                </span>
              )}
            </div>
            <div className="what">{stop.what}</div>
            <div className="when">{stop.when ? fmtDate(stop.when) : '—'}</div>
          </div>
        ))}
      </div>

      <div className="car-chips">
        {shipment.cars.length === 0 ? (
          <span className="small muted">No cars aboard yet.</span>
        ) : (
          shipment.cars.map((car) => (
            <Chip
              key={car.id}
              to={`/cars/${car.id}`}
              kind="car"
              name={`${car.year} ${car.makeName} ${car.modelName}`}
              icon={<CarMark size={14} />}
            />
          ))
        )}
      </div>
    </div>
  );
}

function NewShipment({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [companies, setCompanies] = useState<Party[]>([]);
  const [available, setAvailable] = useState<Car[]>([]);
  const [reference, setReference] = useState('');
  const [shippingCompanyId, setShippingCompanyId] = useState('');
  const [freight, setFreight] = useState('');
  const [departureDate, setDepartureDate] = useState(todayIso());
  const [selected, setSelected] = useState<number[]>([]);

  useEffect(() => {
    void api.get<Party[]>('/api/parties?type=SHIPPING_COMPANY').then(setCompanies);
    void api.get<Car[]>('/api/cars?status=PURCHASED&unassigned=true').then(setAvailable);
  }, []);

  const { busy, error, run } = useSubmit(async () => {
    await api.post('/api/shipments', {
      reference: reference || null,
      shippingCompanyId: Number(shippingCompanyId),
      freightCostUsd: moneyValue(freight),
      departureDate,
      carIds: selected,
    });
    onCreated();
    return true;
  });

  const share = selected.length > 0 ? Number(freight || 0) / selected.length : 0;

  return (
    <Modal title="New shipment" onClose={onClose} wide>
      <Alert kind="error">{error}</Alert>

      <Field label="Shipping company" help="This is what identifies the shipment afterwards.">
        <select value={shippingCompanyId} onChange={(e) => setShippingCompanyId(e.target.value)} autoFocus>
          <option value="">Choose…</option>
          {companies.map((company) => (
            <option key={company.id} value={company.id}>
              {company.name}
            </option>
          ))}
        </select>
      </Field>

      <div className="row">
        <Field label="Freight cost (USD)" help="The whole invoice for this shipment.">
          <MoneyInput decimals={2} value={freight} onChange={setFreight} />
        </Field>
        <Field label="Departure date">
          <input type="date" value={departureDate} onChange={(e) => setDepartureDate(e.target.value)} />
        </Field>
      </div>

      <Field label="Container or booking number" help="Optional — only if the shipping line gave you one you want to keep.">
        <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="MSCU-7781234" />
      </Field>

      <h3 style={{ marginTop: 14 }}>Which cars are on it?</h3>
      {available.length === 0 ? (
        <p className="muted small">No cars are waiting in the origin country.</p>
      ) : (
        <div style={{ maxHeight: 240, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 6, padding: 8 }}>
          {available.map((car) => (
            <div className="checkbox" key={car.id}>
              <input
                type="checkbox"
                id={`car${car.id}`}
                checked={selected.includes(car.id)}
                onChange={(e) =>
                  setSelected(e.target.checked ? [...selected, car.id] : selected.filter((x) => x !== car.id))
                }
              />
              <label htmlFor={`car${car.id}`}>
                {car.year} {car.makeName} {car.modelName}
                <div className="small muted">
                  {car.color} · {car.vin} · {fmtUsd(car.costs.usd.totalCostUsd)}
                </div>
              </label>
            </div>
          ))}
        </div>
      )}

      {selected.length > 0 && Number(freight) > 0 && (
        <Alert kind="info">
          {fmtUsd(freight)} split across {selected.length} car{selected.length > 1 ? 's' : ''} ={' '}
          <strong>{fmtUsd(share.toFixed(2))}</strong> each. You can change any car's share afterwards.
        </Alert>
      )}

      <div className="modal-actions">
        <button className="secondary" onClick={onClose}>
          Cancel
        </button>
        <button onClick={() => void run()} disabled={busy || !shippingCompanyId || !hasAmount(freight)}>
          {busy ? 'Creating…' : 'Create shipment'}
        </button>
      </div>
    </Modal>
  );
}
