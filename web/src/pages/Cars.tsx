import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHeader, useApp } from '../App';
import { api, fmt, fmtDate, fmtUsd, type Car, type CarStatus } from '../lib/api';
import { Alert, Card, Empty, Spinner, StatusBadge } from '../components/ui';
import { CarAction } from '../components/CarActions';
import { Chip } from '../components/Chip';
import { CarMark } from '../components/icons';

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
    <div className="page">
      <PageHeader
        title="All cars"
        sub="Every car you have bought, wherever it is"
        action={
          <Link to="/buy">
            <button>Buy a car</button>
          </Link>
        }
      />

      <div className="tabs">
        {FILTERS.map((filter) => (
          <button
            key={filter.value}
            className={filter.value === status ? 'on' : ''}
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
                    <td>
                      <Chip
                        to={`/cars/${car.id}`}
                        kind="car"
                        name={`${car.year} ${car.makeName} ${car.modelName}`}
                        icon={<CarMark size={14} />}
                      />
                      <div className="small muted" style={{ marginTop: 3 }}>{car.color}</div>
                    </td>
                    <td className="small" style={{ fontFamily: 'ui-monospace, monospace' }}>
                      {car.vin}
                    </td>
                    <td>
                      {car.supplier ? (
                        <Chip to={`/accounts/${car.supplier.id}`} kind="supplier" name={car.supplier.name} plain />
                      ) : (
                        <span className="muted small">—</span>
                      )}
                    </td>
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
                        <div style={{ marginTop: 4 }}>
                          <Chip
                            to={`/shipments/${car.shipment.id}`}
                            kind="shipping"
                            name={car.shipment.shippingCompany?.name ?? 'Shipping company'}
                            plain
                          />
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
    </div>
  );
}
