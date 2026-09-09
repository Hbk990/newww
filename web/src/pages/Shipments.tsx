import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../App';
import { api, fmt, fmtDate, fmtUsd, todayIso, type Car, type Party, type Shipment } from '../lib/api';
import { Alert, Card, Empty, Field, Modal, Spinner, useSubmit } from '../components/ui';
import { MoneyInput, hasAmount, moneyValue } from '../components/MoneyInput';

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
    <>
      <PageHeader
        title="Shipments"
        sub="One car alone is simply a shipment with one car in it"
        action={<button onClick={() => setCreating(true)}>New shipment</button>}
      />

      <Alert kind="error">{error}</Alert>

      <Card>
        {!shipments ? (
          <Spinner />
        ) : shipments.length === 0 ? (
          <Empty>No shipments yet. Create one and add the cars that are travelling together.</Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Shipping company</th>
                  <th>Cars on board</th>
                  <th className="num">Freight</th>
                  <th className="num">Rate</th>
                  <th>Departed</th>
                  <th>Arrived</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {shipments.map((shipment) => (
                  <tr key={shipment.id}>
                    <td className="strong">
                      <Link to={`/shipments/${shipment.id}`}>{shipment.shippingCompany.name}</Link>
                    </td>
                    <td className="small">
                      {shipment.cars.map((car) => (
                        <div key={car.id}>
                          {car.year} {car.makeName} {car.modelName}
                        </div>
                      ))}
                      {shipment.cars.length === 0 && <span className="muted">no cars yet</span>}
                    </td>
                    <td className="num">{fmtUsd(shipment.freightCostUsd)}</td>
                    <td className="num">{shipment.cfaRate ? fmt(shipment.cfaRate) : '—'}</td>
                    <td className="small">{fmtDate(shipment.departureDate)}</td>
                    <td className="small">{fmtDate(shipment.arrivalDate)}</td>
                    <td>
                      <span className={`badge ${STATUS_BADGE[shipment.status]}`}>
                        {shipment.status.toLowerCase()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {creating && (
        <NewShipment
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            void load();
          }}
        />
      )}
    </>
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
