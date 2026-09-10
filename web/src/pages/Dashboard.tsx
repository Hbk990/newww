import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp, PageHeader } from '../App';
import { api, fmt, fmtUsd } from '../lib/api';
import { Card, Spinner, Alert, Stat } from '../components/ui';
import { BarRows, ChartFrame, ColumnChart, STATUS } from '../components/charts';

interface DashboardData {
  carsByStatus: Record<string, number>;
  carsInStock: number;
  stockValueCfa: string;
  abroadValueUsd: string;
  owedToSuppliersUsd: string;
  owedToShippingUsd: string;
  treasuryCfa: string;
  owedToWorkersCfa: string;
  owedToPartsSuppliersCfa: string;
  owedByCustomersCfa: string;
  taxRefundsPending: { carId: number; label: string; supplier: string; amountUsd: string; mode: string }[];
  taxRefundsPendingTotalUsd: string;
}

interface TrendMonth {
  month: string;
  salesCfa: string;
  costCfa: string;
  grossProfitCfa: string;
  netProfitCfa: string;
  carsSold: number;
}

interface StageRow {
  stage: string;
  cars: number;
  valueCfa: string;
  valueUsd: string;
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

interface Deposits {
  heldCount: number;
  heldTotalCfa: string;
  held: { id: number; carId: number; label: string; customerName: string; depositCfa: string; daysHeld: number }[];
  forfeitedCfa: string;
  forfeitedCount: number;
}

const STAGE_LABEL: Record<string, string> = {
  PURCHASED: 'In origin',
  SHIPPED: 'Shipped',
  ARRIVED: 'Arrived',
  IN_GARAGE: 'Garage',
  SHOWROOM: 'Showroom',
};

/** 2026-03 → Mar 26, which is what fits under a column. */
const monthLabel = (month: string) => {
  const [year, m] = month.split('-');
  return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m) - 1]} ${year.slice(2)}`;
};

export default function Dashboard() {
  const { cfa } = useApp();
  const [data, setData] = useState<DashboardData | null>(null);
  const [trend, setTrend] = useState<TrendMonth[] | null>(null);
  const [stages, setStages] = useState<StageRow[] | null>(null);
  const [risk, setRisk] = useState<RiskRow[] | null>(null);
  const [deposits, setDeposits] = useState<Deposits | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<DashboardData>('/api/reports/dashboard').then(setData).catch((e) => setError(e.message));
    void api.get<TrendMonth[]>('/api/reports/trend').then(setTrend);
    void api.get<StageRow[]>('/api/reports/stock-by-stage').then(setStages);
    void api.get<RiskRow[]>('/api/reports/at-risk').then(setRisk);
    void api.get<Deposits>('/api/reports/deposits').then(setDeposits);
  }, []);

  if (error) return <Alert kind="error">{error}</Alert>;
  if (!data) return <Spinner />;

  const awaitingCondition = data.carsByStatus.ARRIVED ?? 0;
  const losing = (risk ?? []).filter((row) => row.severity === 'loss');
  const soldThisYear = (trend ?? []).reduce((sum, month) => sum + month.carsSold, 0);
  const profitThisYear = (trend ?? []).reduce((sum, month) => sum + Number(month.netProfitCfa), 0);

  return (
    <>
      <PageHeader title="Dashboard" sub="Where the business stands right now" />

      {awaitingCondition > 0 && (
        <Alert kind="warn">
          {awaitingCondition} car{awaitingCondition > 1 ? 's have' : ' has'} arrived and{' '}
          {awaitingCondition > 1 ? 'are' : 'is'} waiting for you to say whether{' '}
          {awaitingCondition > 1 ? 'they are' : 'it is'} damaged.{' '}
          <Link to="/cars?status=ARRIVED">Set the condition</Link>
        </Alert>
      )}

      {losing.length > 0 && (
        <Alert kind="error">
          {losing.length === 1
            ? `${losing[0].label} now costs more than you are asking for it.`
            : `${losing.length} cars now cost more than you are asking for them.`}{' '}
          <Link to="/analysis">See what went into them</Link>
        </Alert>
      )}

      <div className="grid cols-4">
        <Stat label="Cars in stock" value={String(data.carsInStock)} hint="not yet sold" />
        <Stat label={`Stock value ${cfa}`} value={fmt(data.stockValueCfa)} hint="landed cost of cars here" />
        <Stat label="Still abroad" value={fmtUsd(data.abroadValueUsd)} hint="cost of cars not yet arrived" />
        <Stat
          label={`Treasury ${cfa}`}
          value={fmt(data.treasuryCfa)}
          hint="held by transfer companies"
          negative={Number(data.treasuryCfa) < 0}
        />
      </div>

      <div className="grid cols-4" style={{ marginTop: 12 }}>
        <Stat label="Sold in 12 months" value={String(soldThisYear)} hint="cars sold from the showroom" />
        <Stat
          label={`Profit in 12 months ${cfa}`}
          value={fmt(profitThisYear.toFixed(0))}
          hint="after overhead"
          tone={profitThisYear >= 0 ? 'good' : 'bad'}
        />
        <Stat
          label={`Deposits held ${cfa}`}
          value={fmt(deposits?.heldTotalCfa ?? '0')}
          hint={`${deposits?.heldCount ?? 0} car${(deposits?.heldCount ?? 0) === 1 ? '' : 's'} held for a buyer`}
        />
        <Stat
          label={`Owed by customers ${cfa}`}
          value={fmt(data.owedByCustomersCfa)}
          hint="cars sold but not fully paid"
          negative={Number(data.owedByCustomersCfa) > 0}
        />
      </div>

      {trend && trend.some((month) => month.carsSold > 0) && (
        <div style={{ marginTop: 14 }}>
          <ChartFrame
            title="Profit, month by month"
            subtitle={`After the cost of the cars sold and that month's overhead, in ${cfa}. Red months lost money.`}
            footer={<TrendTable trend={trend} cfa={cfa} />}
          >
            <ColumnChart
              data={trend.map((month) => ({
                label: monthLabel(month.month),
                value: Number(month.netProfitCfa),
                tooltip: [
                  monthLabel(month.month),
                  `Sold ${month.carsSold} car${month.carsSold === 1 ? '' : 's'} for ${fmt(month.salesCfa)}`,
                  `They cost ${fmt(month.costCfa)}`,
                  `Left after overhead ${fmt(month.netProfitCfa)} ${cfa}`,
                ],
              }))}
              currency={cfa}
              colorFor={(value) => (value < 0 ? STATUS.critical : '#2a78d6')}
            />
          </ChartFrame>
        </div>
      )}

      <div className="grid cols-2" style={{ marginTop: 14 }}>
        {stages && (
          <ChartFrame title="Where your cars are" subtitle="Every car you own that is not yet sold">
            <ColumnChart
              height={180}
              width={420}
              wholeNumbers
              data={stages.map((row) => ({
                label: STAGE_LABEL[row.stage] ?? row.stage,
                value: row.cars,
                tooltip: [
                  STAGE_LABEL[row.stage] ?? row.stage,
                  `${row.cars} car${row.cars === 1 ? '' : 's'}`,
                  Number(row.valueCfa) > 0 ? `Worth ${fmt(row.valueCfa)} ${cfa} in cost` : `Cost ${fmtUsd(row.valueUsd)} so far`,
                ],
              }))}
            />
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Stage</th>
                    <th className="num">Cars</th>
                    <th className="num">Money tied up</th>
                  </tr>
                </thead>
                <tbody>
                  {stages.map((row) => (
                    <tr key={row.stage}>
                      <td>{STAGE_LABEL[row.stage] ?? row.stage}</td>
                      <td className="num">{row.cars}</td>
                      <td className="num">
                        {Number(row.valueCfa) > 0 ? `${fmt(row.valueCfa)} ${cfa}` : fmtUsd(row.valueUsd)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ChartFrame>
        )}

        {/* Two currencies, two scales. Putting a dollar bar beside a franc bar
            on one axis would say a supplier is owed less than a painter. */}
        <ChartFrame title="What you owe" subtitle="Balances on every account that is waiting to be paid">
          <div className="small muted" style={{ marginBottom: 6 }}>Abroad, in dollars</div>
          <BarRows
            currency="USD"
            data={[
              { label: 'Car suppliers', value: Number(data.owedToSuppliersUsd) },
              { label: 'Shipping companies', value: Number(data.owedToShippingUsd) },
            ]}
          />
          <div className="small muted" style={{ margin: '14px 0 6px' }}>Here, in {cfa}</div>
          <BarRows
            currency={cfa}
            data={[
              { label: 'Garage workers', value: Number(data.owedToWorkersCfa) },
              { label: 'Parts suppliers', value: Number(data.owedToPartsSuppliersCfa) },
            ]}
          />
        </ChartFrame>
      </div>

      <h2 style={{ margin: '20px 0 8px' }}>Cars by stage</h2>
      <div className="grid cols-4">
        <StageLink to="/cars?status=PURCHASED" label="In origin country" count={data.carsByStatus.PURCHASED ?? 0} />
        <StageLink to="/cars?status=SHIPPED" label="Shipped" count={data.carsByStatus.SHIPPED ?? 0} />
        <StageLink to="/garage" label="In garage" count={data.carsByStatus.IN_GARAGE ?? 0} />
        <StageLink to="/showroom" label="In showroom" count={data.carsByStatus.SHOWROOM ?? 0} />
      </div>

      {risk && risk.length > 0 && (
        <Card
          title="Cars to watch"
          action={<Link to="/analysis" className="small">Full analysis</Link>}
        >
          <p className="small muted" style={{ marginTop: 0 }}>
            What is left between the cost so far and the price you are asking. Fix these before you spend more on them.
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Car</th>
                  <th>Where</th>
                  <th className="num">Cost so far</th>
                  <th className="num">Asking</th>
                  <th className="num">Left</th>
                </tr>
              </thead>
              <tbody>
                {risk.slice(0, 8).map((row) => (
                  <tr key={row.carId}>
                    <td>
                      <Link to={`/cars/${row.carId}`}>{row.label}</Link>
                      <div className="small muted">{row.supplier}</div>
                    </td>
                    <td className="small">{STAGE_LABEL[row.status] ?? row.status}</td>
                    <td className="num">{fmt(row.landedCostCfa)}</td>
                    <td className="num">{fmt(row.askingPriceCfa)}</td>
                    <td className="num">
                      <span className={row.severity === 'loss' ? 'neg strong' : 'strong'}>{fmt(row.marginCfa)}</span>
                      <div className="small muted">
                        {row.severity === 'loss' ? 'losing money' : `only ${row.marginPct}%`}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {deposits && deposits.held.length > 0 && (
        <Card title={`Cars held with a deposit — ${fmt(deposits.heldTotalCfa)} ${cfa}`}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Car</th>
                  <th>Buyer</th>
                  <th className="num">Deposit</th>
                  <th className="num">Held</th>
                </tr>
              </thead>
              <tbody>
                {deposits.held.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <Link to={`/cars/${row.carId}`}>{row.label}</Link>
                    </td>
                    <td>{row.customerName}</td>
                    <td className="num">{fmt(row.depositCfa)}</td>
                    <td className="num">{row.daysHeld} days</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="small muted" style={{ marginBottom: 0 }}>
            This money is already in your accounts. It becomes part of the price when the car is sold.
          </p>
        </Card>
      )}

      {data.taxRefundsPending.length > 0 && (
        <Card title={`Tax refunds not yet received — ${fmtUsd(data.taxRefundsPendingTotalUsd)}`}>
          <p className="small muted" style={{ marginTop: 0 }}>
            Canadian tax above the limit that is still owed back to you.
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Car</th>
                  <th>Supplier</th>
                  <th>How it comes back</th>
                  <th className="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {data.taxRefundsPending.map((refund) => (
                  <tr key={refund.carId}>
                    <td>
                      <Link to={`/cars/${refund.carId}`}>{refund.label}</Link>
                    </td>
                    <td>{refund.supplier}</td>
                    <td className="small">
                      {refund.mode === 'SUPPLIER_CREDIT' ? 'Credited to his account' : 'Refunded separately'}
                    </td>
                    <td className="num">{fmtUsd(refund.amountUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}

/** The same months as the chart, in numbers, for when you need the exact figure. */
function TrendTable({ trend, cfa }: { trend: TrendMonth[]; cfa: string }) {
  const months = trend.filter((month) => month.carsSold > 0 || Number(month.netProfitCfa) !== 0);
  return (
    <details style={{ marginTop: 10 }}>
      <summary className="small muted" style={{ cursor: 'pointer' }}>
        Show these months as numbers
      </summary>
      <div className="table-wrap" style={{ marginTop: 8 }}>
        <table>
          <thead>
            <tr>
              <th>Month</th>
              <th className="num">Cars</th>
              <th className="num">Sales {cfa}</th>
              <th className="num">Their cost</th>
              <th className="num">Gross</th>
              <th className="num">After overhead</th>
            </tr>
          </thead>
          <tbody>
            {months.map((month) => (
              <tr key={month.month}>
                <td>{monthLabel(month.month)}</td>
                <td className="num">{month.carsSold}</td>
                <td className="num">{fmt(month.salesCfa)}</td>
                <td className="num">{fmt(month.costCfa)}</td>
                <td className="num">{fmt(month.grossProfitCfa)}</td>
                <td className={`num strong ${Number(month.netProfitCfa) < 0 ? 'neg' : ''}`}>
                  {fmt(month.netProfitCfa)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function StageLink({ to, label, count }: { to: string; label: string; count: number }) {
  return (
    <Link to={to} style={{ textDecoration: 'none', color: 'inherit' }}>
      <div className="stat">
        <div className="label">{label}</div>
        <div className="value">{count}</div>
      </div>
    </Link>
  );
}
