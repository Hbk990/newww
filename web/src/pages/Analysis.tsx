import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader, useApp } from '../App';
import { api, fmt, fmtDate, fmtUsd } from '../lib/api';
import { Alert, Card, Empty, Spinner, Stat } from '../components/ui';
import { BarRows, ChartFrame, LineChart, STATUS } from '../components/charts';

/**
 * ANALYSIS.
 *
 * The monthly report says what happened. This page says why: which supplier's
 * cars actually earn, which shipper bills more than he quoted, what rate you
 * have really been paying, and which cars are quietly turning into a loss.
 */

interface SupplierRow {
  supplierId: number;
  name: string;
  country: string | null;
  carsSold: number;
  revenueCfa: string;
  costCfa: string;
  repairsCfa: string;
  profitCfa: string;
  profitPerCarCfa: string;
  marginPct: string | null;
  damagedPct: number;
  averageDaysToSell: number | null;
}

interface FreightData {
  rows: {
    shipmentId: number;
    reference: string;
    company: string;
    arrivalDate: string | null;
    cars: number;
    estimatedUsd: string;
    actualUsd: string;
    differenceUsd: string;
    overPct: string | null;
  }[];
  byCompany: {
    companyId: number;
    name: string;
    shipments: number;
    estimatedUsd: string;
    actualUsd: string;
    differenceUsd: string;
    overPct: string | null;
  }[];
}

interface RateHistory {
  points: { date: string; rate: string; kind: 'shipment' | 'wire'; label: string }[];
  summary: {
    count: number;
    lowest: number | null;
    highest: number | null;
    latest: number | null;
    averageWireRate: number | null;
  };
}

interface RiskRow {
  carId: number;
  label: string;
  status: string;
  supplier: string;
  landedCostCfa: string;
  askingPriceCfa: string;
  marginCfa: string;
  marginPct: string | null;
  repairsCfa: string;
  severity: 'loss' | 'thin';
}

const STAGE_LABEL: Record<string, string> = {
  ARRIVED: 'Just arrived',
  IN_GARAGE: 'In the garage',
  SHOWROOM: 'In the showroom',
};

export default function Analysis() {
  const { cfa } = useApp();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [suppliers, setSuppliers] = useState<SupplierRow[] | null>(null);
  const [freight, setFreight] = useState<FreightData | null>(null);
  const [rates, setRates] = useState<RateHistory | null>(null);
  const [risk, setRisk] = useState<RiskRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const query = new URLSearchParams();
    if (from) query.set('from', from);
    if (to) query.set('to', to);
    setSuppliers(null);
    api
      .get<SupplierRow[]>(`/api/reports/by-supplier${query.toString() ? `?${query}` : ''}`)
      .then(setSuppliers)
      .catch((e) => setError(e.message));
  }, [from, to]);

  useEffect(() => {
    void api.get<FreightData>('/api/reports/freight-accuracy').then(setFreight);
    void api.get<RateHistory>('/api/reports/rate-history').then(setRates);
    void api.get<RiskRow[]>('/api/reports/at-risk').then(setRisk);
  }, []);

  if (error) return <Alert kind="error">{error}</Alert>;

  return (
    <div className="page">
      <PageHeader
        title="Analysis"
        sub="Which suppliers earn, which shippers overcharge, and which cars are in trouble"
      />

      <Card title="Profit by supplier">
        <div className="row no-print" style={{ marginBottom: 12 }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Sold from</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Sold up to</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="actions">
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setFrom('');
                setTo('');
              }}
            >
              All time
            </button>
          </div>
        </div>

        {suppliers === null ? (
          <Spinner />
        ) : suppliers.length === 0 ? (
          <Empty>No cars from any supplier have been sold in this period yet.</Empty>
        ) : (
          <>
            <BarRows
              currency={cfa}
              data={suppliers.map((row) => ({
                label: row.name,
                value: Number(row.profitCfa),
                hint: `${row.carsSold} car${row.carsSold === 1 ? '' : 's'}${row.marginPct ? ` · ${row.marginPct}% margin` : ''}`,
              }))}
            />
            <div className="table-wrap" style={{ marginTop: 14 }}>
              <table>
                <thead>
                  <tr>
                    <th>Supplier</th>
                    <th className="num">Cars sold</th>
                    <th className="num">Sold for</th>
                    <th className="num">They cost</th>
                    <th className="num">Of that, repairs</th>
                    <th className="num">Profit</th>
                    <th className="num">Per car</th>
                    <th className="num">Arrive damaged</th>
                    <th className="num">Days to sell</th>
                  </tr>
                </thead>
                <tbody>
                  {suppliers.map((row) => (
                    <tr key={row.supplierId}>
                      <td>
                        <Link to={`/accounts/${row.supplierId}`}>{row.name}</Link>
                        {row.country && <div className="small muted">{row.country}</div>}
                      </td>
                      <td className="num">{row.carsSold}</td>
                      <td className="num">{fmt(row.revenueCfa)}</td>
                      <td className="num">{fmt(row.costCfa)}</td>
                      <td className="num">{fmt(row.repairsCfa)}</td>
                      <td className={`num strong ${Number(row.profitCfa) < 0 ? 'neg' : 'pos'}`}>
                        {fmt(row.profitCfa)}
                        {row.marginPct && <div className="small muted">{row.marginPct}%</div>}
                      </td>
                      <td className="num">{fmt(row.profitPerCarCfa)}</td>
                      <td className="num">{row.damagedPct}%</td>
                      <td className="num">{row.averageDaysToSell ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="small muted" style={{ marginBottom: 0 }}>
              A supplier whose cars arrive damaged is not cheap, however low the price: the repairs are already
              counted in the cost above.
            </p>
          </>
        )}
      </Card>

      <Card title="Cars that are losing money">
        {risk === null ? (
          <Spinner />
        ) : risk.length === 0 ? (
          <Empty>Every car in stock is still priced above what it has cost you. Nothing to worry about.</Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Car</th>
                  <th>Where</th>
                  <th>Supplier</th>
                  <th className="num">Cost so far</th>
                  <th className="num">Of that, repairs</th>
                  <th className="num">Asking</th>
                  <th className="num">What is left</th>
                </tr>
              </thead>
              <tbody>
                {risk.map((row) => (
                  <tr key={row.carId}>
                    <td>
                      <Link to={`/cars/${row.carId}`}>{row.label}</Link>
                    </td>
                    <td className="small">{STAGE_LABEL[row.status] ?? row.status}</td>
                    <td className="small">{row.supplier}</td>
                    <td className="num">{fmt(row.landedCostCfa)}</td>
                    <td className="num">{fmt(row.repairsCfa)}</td>
                    <td className="num">{fmt(row.askingPriceCfa)}</td>
                    <td className="num">
                      <span className={row.severity === 'loss' ? 'neg strong' : 'strong'}>{fmt(row.marginCfa)}</span>
                      <div className="small muted">
                        {row.severity === 'loss' ? 'below cost' : `thin — ${row.marginPct}%`}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {rates && (
        <ChartFrame
          title="The rate you have actually paid"
          subtitle={`Every rate locked into a car's cost and every rate you wired at, in ${cfa} to the dollar.`}
          footer={
            rates.points.length > 0 && (
              <details style={{ marginTop: 10 }}>
                <summary className="small muted" style={{ cursor: 'pointer' }}>
                  Show every rate as numbers
                </summary>
                <div className="table-wrap" style={{ marginTop: 8 }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>What it was</th>
                        <th className="num">Rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...rates.points].reverse().map((point, index) => (
                        <tr key={index}>
                          <td>{fmtDate(point.date)}</td>
                          <td className="small">{point.label}</td>
                          <td className="num strong">{fmt(point.rate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )
          }
        >
          <div className="grid cols-4" style={{ marginBottom: 12 }}>
            <Stat label="Latest rate" value={rates.summary.latest ? fmt(rates.summary.latest) : '—'} hint={`${cfa} per $1`} />
            <Stat label="Best you have had" value={rates.summary.lowest ? fmt(rates.summary.lowest) : '—'} hint="cheapest dollar" />
            <Stat label="Worst you have had" value={rates.summary.highest ? fmt(rates.summary.highest) : '—'} hint="dearest dollar" />
            <Stat
              label="Average on wires"
              value={rates.summary.averageWireRate ? fmt(rates.summary.averageWireRate) : '—'}
              hint="what your transfers really cost"
            />
          </div>
          <LineChart
            data={rates.points.map((point) => ({
              label: fmtDate(point.date),
              value: Number(point.rate),
              tooltip: [fmtDate(point.date), point.label, `${fmt(point.rate)} ${cfa} per $1`],
            }))}
          />
        </ChartFrame>
      )}

      <Card title="What the shipper quoted against what he billed">
        {freight === null ? (
          <Spinner />
        ) : freight.rows.length === 0 ? (
          <Empty>
            No shipment has been given an expected freight yet. Enter one when you ship a car and this page will
            start comparing it with the invoice that arrives.
          </Empty>
        ) : (
          <>
            <BarRows
              data={freight.byCompany.map((row) => ({
                label: row.name,
                value: Number(row.differenceUsd),
                hint: `${row.shipments} shipment${row.shipments === 1 ? '' : 's'}${row.overPct ? ` · ${row.overPct}% over` : ''}`,
                color: Number(row.differenceUsd) > 0 ? STATUS.critical : STATUS.good,
              }))}
            />
            <p className="small muted">
              Above zero means he invoiced more than he quoted. That difference is money you never planned for.
            </p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Shipment</th>
                    <th>Company</th>
                    <th>Arrived</th>
                    <th className="num">Cars</th>
                    <th className="num">Quoted</th>
                    <th className="num">Invoiced</th>
                    <th className="num">Difference</th>
                  </tr>
                </thead>
                <tbody>
                  {freight.rows.map((row) => (
                    <tr key={row.shipmentId}>
                      <td>
                        <Link to={`/shipments/${row.shipmentId}`}>{row.reference}</Link>
                      </td>
                      <td>{row.company}</td>
                      <td className="small">{fmtDate(row.arrivalDate)}</td>
                      <td className="num">{row.cars}</td>
                      <td className="num">{fmtUsd(row.estimatedUsd)}</td>
                      <td className="num">{fmtUsd(row.actualUsd)}</td>
                      <td className={`num strong ${Number(row.differenceUsd) > 0 ? 'neg' : 'pos'}`}>
                        {fmtUsd(row.differenceUsd)}
                        {row.overPct && <div className="small muted">{row.overPct}%</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
