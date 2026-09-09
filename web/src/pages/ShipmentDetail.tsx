import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageHeader, useApp } from '../App';
import { api, fmt, fmtDate, fmtUsd, todayIso, type Car, type Shipment } from '../lib/api';
import { Alert, Card, Empty, Field, Modal, Spinner, useSubmit } from '../components/ui';
import { MoneyInput } from '../components/MoneyInput';

export default function ShipmentDetail() {
  const { id } = useParams();
  const { cfa } = useApp();
  const [shipment, setShipment] = useState<Shipment | null>(null);
  const [available, setAvailable] = useState<Car[]>([]);
  const [shares, setShares] = useState<Record<number, string>>({});
  const [arriving, setArriving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    try {
      const data = await api.get<Shipment>(`/api/shipments/${id}`);
      setShipment(data);
      setShares(Object.fromEntries(data.cars.map((car) => [car.id, car.freightShareUsd ?? '0'])));
      if (data.status === 'DRAFT') {
        setAvailable(await api.get<Car[]>('/api/cars?status=PURCHASED&unassigned=true'));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the shipment');
    }
  };

  useEffect(() => {
    void load();
  }, [id]);

  if (error) return <Alert kind="error">{error}</Alert>;
  if (!shipment) return <Spinner />;

  const editable = shipment.status !== 'ARRIVED';
  const sharesTotal = Object.values(shares).reduce((sum, value) => sum + Number(value || 0), 0);
  const sharesMatch = Math.abs(sharesTotal - Number(shipment.freightCostUsd)) < 0.005;

  const act = async (fn: () => Promise<unknown>, success: string) => {
    setError(null);
    try {
      await fn();
      setMessage(success);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work');
    }
  };

  return (
    <>
      <PageHeader
        title={shipment.shippingCompany.name}
        sub={
          <>
            {shipment.cars.length} car{shipment.cars.length === 1 ? '' : 's'} · freight{' '}
            {fmtUsd(shipment.freightCostUsd)}
            {shipment.cfaRate && ` · rate locked at ${fmt(shipment.cfaRate)}`}
            {shipment.reference && (
              <span className="muted"> · {shipment.reference}</span>
            )}
          </>
        }
        action={
          <div className="row">
            {shipment.status === 'DRAFT' && (
              <button onClick={() => void act(() => api.post(`/api/shipments/${id}/ship`, { departureDate: todayIso() }), 'Marked as sailed.')}>
                Mark as sailed
              </button>
            )}
            {editable && shipment.cars.length > 0 && (
              <button onClick={() => setArriving(true)}>Mark as arrived</button>
            )}
          </div>
        }
      />

      <Alert kind="error">{error}</Alert>
      <Alert kind="success">{message}</Alert>

      {shipment.status === 'ARRIVED' && (
        <Alert kind="success">
          Arrived on {fmtDate(shipment.arrivalDate)}. Every car below was converted at a rate of{' '}
          {fmt(shipment.cfaRate)} and those costs are now locked.
        </Alert>
      )}

      <Card title="Cars on this shipment">
        {shipment.cars.length === 0 ? (
          <Empty>No cars on this shipment yet.</Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Car</th>
                  <th>Supplier</th>
                  <th className="num">Cost USD</th>
                  <th className="num">Freight share</th>
                  {shipment.status === 'ARRIVED' && <th className="num">Cost on arrival ({cfa})</th>}
                  {editable && <th />}
                </tr>
              </thead>
              <tbody>
                {shipment.cars.map((car) => (
                  <tr key={car.id}>
                    <td className="strong">
                      <Link to={`/cars/${car.id}`}>
                        {car.year} {car.makeName} {car.modelName}
                      </Link>
                      <div className="small muted">{car.vin}</div>
                    </td>
                    <td className="small">{car.supplier?.name}</td>
                    <td className="num">{fmtUsd(car.costs?.usd.totalCostUsd)}</td>
                    <td className="num">
                      {editable ? (
                        <div style={{ width: 120, marginLeft: 'auto' }}>
                          <MoneyInput
                            decimals={2}
                            value={shares[car.id] ?? ''}
                            onChange={(next) => setShares({ ...shares, [car.id]: next })}
                          />
                        </div>
                      ) : (
                        fmtUsd(car.freightShareUsd)
                      )}
                    </td>
                    {shipment.status === 'ARRIVED' && (
                      <td className="num strong">{fmt(car.arrivalCostCfa)}</td>
                    )}
                    {editable && (
                      <td className="num">
                        <button
                          className="link small"
                          onClick={() =>
                            void act(
                              () => api.del(`/api/shipments/${id}/cars/${car.id}`),
                              'Car removed from the shipment.',
                            )
                          }
                        >
                          Remove
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {editable && shipment.cars.length > 0 && (
          <div style={{ marginTop: 12 }}>
            {!sharesMatch && (
              <Alert kind="warn">
                The shares add up to {fmtUsd(sharesTotal.toFixed(2))} but the freight invoice is{' '}
                {fmtUsd(shipment.freightCostUsd)}. They must match exactly before this shipment can
                arrive.
              </Alert>
            )}
            <button
              className="secondary"
              disabled={!sharesMatch}
              onClick={() =>
                void act(
                  () =>
                    api.post(`/api/shipments/${id}/shares`, {
                      shares: Object.entries(shares).map(([carId, amountUsd]) => ({
                        carId: Number(carId),
                        amountUsd: Number(amountUsd),
                      })),
                    }),
                  'Freight shares saved.',
                )
              }
            >
              Save freight shares
            </button>
          </div>
        )}
      </Card>

      {shipment.status === 'DRAFT' && available.length > 0 && (
        <Card title="Add more cars">
          <div className="table-wrap">
            <table>
              <tbody>
                {available.map((car) => (
                  <tr key={car.id}>
                    <td>
                      {car.year} {car.makeName} {car.modelName}
                      <div className="small muted">
                        {car.color} · {car.vin}
                      </div>
                    </td>
                    <td className="num">{fmtUsd(car.costs.usd.totalCostUsd)}</td>
                    <td className="num">
                      <button
                        className="secondary small"
                        onClick={() =>
                          void act(
                            () => api.post(`/api/shipments/${id}/cars`, { carIds: [car.id] }),
                            'Car added. Freight has been split again equally.',
                          )
                        }
                      >
                        Add
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {arriving && (
        <ArriveModal
          shipment={shipment}
          onClose={() => setArriving(false)}
          onArrived={() => {
            setArriving(false);
            setMessage('Arrived. Every car now has its cost in local currency, locked at that rate.');
            void load();
          }}
        />
      )}
    </>
  );
}

/**
 * Entering the rate is the single most consequential action in the system, so
 * the exact figure each car will carry is shown BEFORE it is committed.
 */
function ArriveModal({
  shipment,
  onClose,
  onArrived,
}: {
  shipment: Shipment;
  onClose: () => void;
  onArrived: () => void;
}) {
  const { cfa } = useApp();
  const [rate, setRate] = useState('');
  const [arrivalDate, setArrivalDate] = useState(todayIso());

  const { busy, error, run } = useSubmit(async () => {
    await api.post(`/api/shipments/${shipment.id}/arrive`, {
      cfaRate: Number(rate),
      arrivalDate,
    });
    onArrived();
    return true;
  });

  const rateValue = Number(rate || 0);

  return (
    <Modal title={`Mark ${shipment.reference} as arrived`} onClose={onClose} wide>
      <Alert kind="error">{error}</Alert>

      <Alert kind="warn">
        The rate you enter here is used for the purchase price, the expenses abroad, the tax and the
        freight of every car in this shipment — and then it is locked. It will not change later, even
        if the rate moves.
      </Alert>

      <div className="row">
        <Field label={`Rate: how many ${cfa} for 1 USD?`} help="The rate you actually paid for this shipment.">
          <input type="number" step="0.000001" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="600" autoFocus />
        </Field>
        <Field label="Arrival date">
          <input type="date" value={arrivalDate} onChange={(e) => setArrivalDate(e.target.value)} />
        </Field>
      </div>

      {rateValue > 0 && (
        <>
          <h3>What each car will cost</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Car</th>
                  <th className="num">Cost USD</th>
                  <th className="num">Freight</th>
                  <th className="num">Cost on arrival ({cfa})</th>
                </tr>
              </thead>
              <tbody>
                {shipment.cars.map((car) => {
                  const usd = Number(car.costs?.usd.totalCostUsd ?? 0);
                  const freight = Number(car.freightShareUsd ?? 0);
                  return (
                    <tr key={car.id}>
                      <td>
                        {car.year} {car.makeName} {car.modelName}
                      </td>
                      <td className="num">{fmtUsd(usd)}</td>
                      <td className="num">{fmtUsd(freight)}</td>
                      <td className="num strong">{fmt(Math.round((usd + freight) * rateValue))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="small muted">
            The freight invoice of {fmtUsd(shipment.freightCostUsd)} will also be added to{' '}
            {shipment.shippingCompany.name}'s account.
          </p>
        </>
      )}

      <div className="modal-actions">
        <button className="secondary" onClick={onClose}>
          Cancel
        </button>
        <button onClick={() => void run()} disabled={busy || rateValue <= 0}>
          {busy ? 'Saving…' : 'Confirm arrival and lock these costs'}
        </button>
      </div>
    </Modal>
  );
}
