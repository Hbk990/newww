import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp, PageHeader } from '../App';
import { api, fmt, fmtUsd } from '../lib/api';
import { Card, Spinner, Alert } from '../components/ui';

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

export default function Dashboard() {
  const { cfa } = useApp();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<DashboardData>('/api/reports/dashboard')
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <Alert kind="error">{error}</Alert>;
  if (!data) return <Spinner />;

  const awaitingCondition = data.carsByStatus.ARRIVED ?? 0;

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

      <h2 style={{ margin: '20px 0 8px' }}>What you owe</h2>
      <div className="grid cols-4">
        <Stat label="Car suppliers" value={fmtUsd(data.owedToSuppliersUsd)} negative={Number(data.owedToSuppliersUsd) > 0} />
        <Stat label="Shipping" value={fmtUsd(data.owedToShippingUsd)} negative={Number(data.owedToShippingUsd) > 0} />
        <Stat label={`Garage workers ${cfa}`} value={fmt(data.owedToWorkersCfa)} negative={Number(data.owedToWorkersCfa) > 0} />
        <Stat label={`Parts suppliers ${cfa}`} value={fmt(data.owedToPartsSuppliersCfa)} negative={Number(data.owedToPartsSuppliersCfa) > 0} />
      </div>

      <h2 style={{ margin: '20px 0 8px' }}>Cars by stage</h2>
      <div className="grid cols-4">
        <StageLink to="/cars?status=PURCHASED" label="In origin country" count={data.carsByStatus.PURCHASED ?? 0} />
        <StageLink to="/cars?status=SHIPPED" label="Shipped" count={data.carsByStatus.SHIPPED ?? 0} />
        <StageLink to="/garage" label="In garage" count={data.carsByStatus.IN_GARAGE ?? 0} />
        <StageLink to="/showroom" label="In showroom" count={data.carsByStatus.SHOWROOM ?? 0} />
      </div>

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

function Stat({ label, value, hint, negative }: { label: string; value: string; hint?: string; negative?: boolean }) {
  return (
    <div className="stat">
      <div className="label">{label}</div>
      <div className={`value${negative ? ' neg' : ''}`}>{value}</div>
      {hint && <div className="hint">{hint}</div>}
    </div>
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
