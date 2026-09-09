import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader, useApp } from '../App';
import { api, fmt, fmtDate, fmtUsd } from '../lib/api';
import { Alert, Card, Empty, Spinner } from '../components/ui';

/** A subtracted line: no minus sign when there is nothing to subtract. */
const minus = (value: string) => (Number(value) === 0 ? fmt(value) : `−${fmt(value)}`);

interface MonthlyReport {
  salesCfa: string;
  costOfCarsSoldCfa: string;
  grossProfitCfa: string;
  overheadCfa: string;
  feesCfa: string;
  fxDifferenceCfa: string;
  netProfitCfa: string;
  carsSold: number;
  lines: { carId: number; label: string; price: string; cost: string; profit: string; saleDate: string }[];
  overheadLines: { id: number; category: string; amountCfa: string; note: string | null }[];
  fx: { totalCfa: string; perSupplier: { id: number; name: string; differenceCfa: string }[] };
  originSales: { carId: number; label: string; priceUsd: string; costUsd: string; profitUsd: string }[];
}

interface InventoryRow {
  id: number;
  label: string;
  status: string;
  supplier: string;
  costUsd: string;
  landedCostCfa: string | null;
  askingPriceCfa: string | null;
  daysHeld: number;
}

export default function Reports() {
  const { cfa } = useApp();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [report, setReport] = useState<MonthlyReport | null>(null);
  const [inventory, setInventory] = useState<InventoryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setReport(null);
    api
      .get<MonthlyReport>(`/api/reports/monthly?year=${year}&month=${month}`)
      .then(setReport)
      .catch((e) => setError(e.message));
  }, [year, month]);

  useEffect(() => {
    void api.get<InventoryRow[]>('/api/reports/inventory').then(setInventory);
  }, []);

  const stockValue = (inventory ?? []).reduce((sum, row) => sum + Number(row.landedCostCfa ?? 0), 0);

  return (
    <>
      <PageHeader
        title="Reports"
        sub="What the month actually made, and what you are holding"
        action={
          <a href={`/api/reports/export/monthly?year=${year}&month=${month}`}>
            <button className="secondary">Download this month</button>
          </a>
        }
      />

      <Alert kind="error">{error}</Alert>

      <div className="row" style={{ marginBottom: 12 }}>
        <div style={{ flex: '0 0 130px' }}>
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {new Date(2000, i, 1).toLocaleDateString(undefined, { month: 'long' })}
              </option>
            ))}
          </select>
        </div>
        <div style={{ flex: '0 0 110px' }}>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {Array.from({ length: 6 }, (_, i) => now.getFullYear() - i).map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!report ? (
        <Spinner />
      ) : (
        <>
          <Card title="Profit for the month">
            <div className="breakdown">
              <div className="line">
                <span>Sales — {report.carsSold} car{report.carsSold === 1 ? '' : 's'} sold</span>
                <span className="amount">{fmt(report.salesCfa)}</span>
              </div>
              <div className="line">
                <span>Cost of exactly those cars</span>
                <span className="amount">{minus(report.costOfCarsSoldCfa)}</span>
              </div>
              <div className="line" style={{ fontWeight: 600 }}>
                <span>Gross profit</span>
                <span className="amount">{fmt(report.grossProfitCfa)}</span>
              </div>
              <div className="line">
                <span>Running expenses (rent, salaries…)</span>
                <span className="amount">{minus(report.overheadCfa)}</span>
              </div>
              <div className="line">
                <span>Transfer commissions</span>
                <span className="amount">{minus(report.feesCfa)}</span>
              </div>
              <div className="line">
                <span>
                  Exchange difference
                  <div className="small muted">
                    The rate moved between locking a car's cost and wiring the money.
                  </div>
                </span>
                <span className="amount">{minus(report.fxDifferenceCfa)}</span>
              </div>
              <div className="line total">
                <span>Real profit</span>
                <span className={`amount ${Number(report.netProfitCfa) < 0 ? 'neg' : 'pos'}`}>
                  {fmt(report.netProfitCfa)} {cfa}
                </span>
              </div>
            </div>

            <p className="small muted" style={{ marginBottom: 0 }}>
              Cars bought or paid for this month do not appear here. A car's cost counts in the month
              it is <strong>sold</strong> — that is what makes this figure a real profit.
            </p>
          </Card>

          {report.lines.length > 0 && (
            <Card title="Cars sold this month">
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Car</th>
                      <th>Date</th>
                      <th className="num">Price</th>
                      <th className="num">Cost</th>
                      <th className="num">Profit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.lines.map((line) => (
                      <tr key={line.carId}>
                        <td>
                          <Link to={`/cars/${line.carId}`}>{line.label}</Link>
                        </td>
                        <td className="small">{fmtDate(line.saleDate)}</td>
                        <td className="num">{fmt(line.price)}</td>
                        <td className="num muted">{fmt(line.cost)}</td>
                        <td className={`num strong ${Number(line.profit) < 0 ? 'neg' : 'pos'}`}>
                          {fmt(line.profit)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {report.originSales.length > 0 && (
            <Card title="Cars sold abroad this month (in USD)">
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Car</th>
                      <th className="num">Price</th>
                      <th className="num">Cost</th>
                      <th className="num">Profit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.originSales.map((sale) => (
                      <tr key={sale.carId}>
                        <td>
                          <Link to={`/cars/${sale.carId}`}>{sale.label}</Link>
                        </td>
                        <td className="num">{fmtUsd(sale.priceUsd)}</td>
                        <td className="num muted">{fmtUsd(sale.costUsd)}</td>
                        <td className={`num strong ${Number(sale.profitUsd) < 0 ? 'neg' : 'pos'}`}>
                          {fmtUsd(sale.profitUsd)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="small muted" style={{ marginBottom: 0 }}>
                These settle inside the supplier's account in USD, so they are kept out of the local
                profit above.
              </p>
            </Card>
          )}

          {report.fx.perSupplier.length > 0 && (
            <Card title="Where the exchange difference came from">
              <table>
                <tbody>
                  {report.fx.perSupplier.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <Link to={`/accounts/${row.id}`}>{row.name}</Link>
                      </td>
                      <td className={`num ${Number(row.differenceCfa) > 0 ? 'neg' : 'pos'}`}>
                        {fmt(row.differenceCfa)} {cfa}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="small muted" style={{ marginBottom: 0 }}>
                A positive number is a loss: you paid at a worse rate than the one the car's cost was
                locked at. The car's cost was not changed.
              </p>
            </Card>
          )}
        </>
      )}

      <Card
        title="Stock you are holding"
        action={
          <a href="/api/reports/export/inventory">
            <button className="secondary small">Download Excel</button>
          </a>
        }
      >
        {!inventory ? (
          <Spinner />
        ) : inventory.length === 0 ? (
          <Empty>No cars in stock.</Empty>
        ) : (
          <>
            <p className="small muted" style={{ marginTop: 0 }}>
              {inventory.length} cars · {fmt(stockValue.toFixed(0))} {cfa} of landed cost tied up.
            </p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Car</th>
                    <th>Stage</th>
                    <th>Supplier</th>
                    <th className="num">Cost USD</th>
                    <th className="num">Landed {cfa}</th>
                    <th className="num">Days held</th>
                  </tr>
                </thead>
                <tbody>
                  {inventory.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <Link to={`/cars/${row.id}`}>{row.label}</Link>
                      </td>
                      <td className="small">{row.status.toLowerCase().replace(/_/g, ' ')}</td>
                      <td className="small">{row.supplier}</td>
                      <td className="num">{fmtUsd(row.costUsd)}</td>
                      <td className="num">{fmt(row.landedCostCfa)}</td>
                      <td className="num">{row.daysHeld}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
    </>
  );
}
