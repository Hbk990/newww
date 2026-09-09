import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHeader, useApp } from '../App';
import { api, fmt, fmtDate, fmtUsd, type Car, type CarStatus } from '../lib/api';
import { Alert, Card, Empty, Spinner, StatusBadge } from '../components/ui';
import { CarAction } from '../components/CarActions';

const FILTERS: { value: string; label: string }[] = [
  { value: '', label: 'All cars' },
  { value: 'PURCHASED', label: 'In origin country' },
  { value: 'SHIPPED', label: 'Shipped' },
  { value: 'ARRIVED', label: 'Arrived' },
  { value: 'IN_GARAGE', label: 'In garage' },
  { value: 'SHOWROOM', label: 'In showroom' },
  { value: 'SOLD', label: 'Sold' },
];

export default function Cars() {
  const { cfa } = useApp();
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? '';
  const [search, setSearch] = useState(params.get('search') ?? '');
  const [cars, setCars] = useState<Car[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloads, setReloads] = useState(0);
  const reload = () => setReloads((n) => n + 1);

  useEffect(() => {
    const query = new URLSearchParams();
    if (status) query.set('status', status);
    if (search) query.set('search', search);
    const timer = setTimeout(() => {
      api
        .get<Car[]>(`/api/cars?${query}`)
        .then(setCars)
        .catch((e) => setError(e.message));
    }, 200);
    return () => clearTimeout(timer);
  }, [status, search, reloads]);

  return (
    <>
      <PageHeader
        title="All cars"
        sub="Every car you have bought, wherever it is"
        action={
          <Link to="/buy">
            <button>Buy a car</button>
          </Link>
        }
      />

      <div className="row" style={{ marginBottom: 12 }}>
        {FILTERS.map((filter) => (
          <button
            key={filter.value}
            className={filter.value === status ? '' : 'secondary'}
            style={{ flex: '0 0 auto' }}
            onClick={() => setParams(filter.value ? { status: filter.value } : {})}
          >
            {filter.label}
          </button>
        ))}
      </div>

      <Alert kind="error">{error}</Alert>

      <Card>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by VIN, brand, model, colour or supplier…"
          style={{ marginBottom: 12 }}
        />

        {!cars ? (
          <Spinner />
        ) : cars.length === 0 ? (
          <Empty>No cars here yet.</Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Car</th>
                  <th>VIN</th>
                  <th>Supplier</th>
                  <th>Bought</th>
                  <th className="num">Cost USD</th>
                  <th className="num">Landed {cfa}</th>
                  <th>Stage</th>
                  <th>Next step</th>
                </tr>
              </thead>
              <tbody>
                {cars.map((car) => (
                  <tr key={car.id}>
                    <td className="strong">
                      <Link to={`/cars/${car.id}`}>
                        {car.year} {car.makeName} {car.modelName}
                      </Link>
                      <div className="small muted">{car.color}</div>
                    </td>
                    <td className="small" style={{ fontFamily: 'ui-monospace, monospace' }}>
                      {car.vin}
                    </td>
                    <td className="small">{car.supplier?.name}</td>
                    <td className="small">{fmtDate(car.purchaseDate)}</td>
                    <td className="num">{fmtUsd(car.costs.usd.totalCostUsd)}</td>
                    <td className="num">
                      {car.costs.landedCostCfa ? (
                        fmt(car.costs.landedCostCfa)
                      ) : (
                        <span className="muted small">not arrived</span>
                      )}
                    </td>
                    <td>
                      <StatusBadge status={car.status as CarStatus} />
                      {car.damaged && <div className="badge red" style={{ marginTop: 3 }}>Damaged</div>}
                      {car.shipment && (
                        <div className="small muted" style={{ marginTop: 3 }}>
                          with {car.shipment.shippingCompany?.name ?? 'shipping company'}
                        </div>
                      )}
                    </td>
                    <td className="num">
                      <CarAction car={car} onDone={reload} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
