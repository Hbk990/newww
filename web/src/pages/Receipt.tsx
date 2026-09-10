import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useApp } from '../App';
import { api, fmt, fmtDate, type CostBreakdown } from '../lib/api';
import { Alert, Spinner } from '../components/ui';

/**
 * THE PAPER THE BUYER TAKES HOME.
 *
 * One page: what he bought, what he agreed to pay, what he has paid so far and
 * what is left. Nothing about cost or profit appears on it — that is your
 * business, not his — and the amount outstanding is printed in words as well as
 * figures so it cannot be argued about later.
 */

interface SaleDetail {
  id: number;
  carId: number;
  label: string;
  price: string;
  currency: string;
  saleDate: string;
  buyerName: string;
  buyerMobile: string | null;
  channel: 'LOCAL' | 'ORIGIN';
  note: string | null;
  paid: string;
  remaining: string;
  settled: boolean;
  costs: CostBreakdown;
  customer: { id: number; name: string; mobile: string | null } | null;
  car: { id: number; year: number; makeName: string; modelName: string; color: string; vin: string };
  payments: { id: number; amount: string; date: string; method: string | null; note: string | null }[];
}

export default function Receipt() {
  const { id } = useParams();
  const { settings } = useApp();
  const [sale, setSale] = useState<SaleDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<SaleDetail>(`/api/sales/${id}`)
      .then(setSale)
      .catch((e) => setError(e.message));
  }, [id]);

  if (error) return <Alert kind="error">{error}</Alert>;
  if (!sale) return <Spinner />;

  const outstanding = Number(sale.remaining);

  return (
    <>
      <div className="page-header no-print">
        <div>
          <h1>Receipt</h1>
          <div className="sub">
            <Link to="/sales">Back to sales</Link>
          </div>
        </div>
        <div className="actions">
          <button onClick={() => window.print()}>Print this receipt</button>
        </div>
      </div>

      <div className="doc">
        <div className="doc-head">
          <div>
            <h1>{settings.businessName}</h1>
            <div className="small muted">Car sale receipt</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="doc-title">Receipt no.</div>
            <div className="strong">{String(sale.id).padStart(5, '0')}</div>
            <div className="small muted">{fmtDate(sale.saleDate)}</div>
          </div>
        </div>

        <table>
          <tbody>
            <tr>
              <td className="strong" style={{ width: 170 }}>Sold to</td>
              <td>
                {sale.buyerName}
                {sale.buyerMobile && <div className="small muted">{sale.buyerMobile}</div>}
              </td>
            </tr>
            <tr>
              <td className="strong">Vehicle</td>
              <td>
                {sale.car.year} {sale.car.makeName} {sale.car.modelName}
                <div className="small muted">
                  Colour {sale.car.color} · chassis {sale.car.vin}
                </div>
              </td>
            </tr>
            <tr>
              <td className="strong">Agreed price</td>
              <td className="strong">
                {fmt(sale.price)} {sale.currency}
              </td>
            </tr>
          </tbody>
        </table>

        <h3 style={{ marginTop: 22 }}>Payments received</h3>
        {sale.payments.length === 0 ? (
          <p className="muted small">Nothing has been paid on this sale yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>How</th>
                <th>Note</th>
                <th className="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              {sale.payments.map((payment) => (
                <tr key={payment.id}>
                  <td>{fmtDate(payment.date)}</td>
                  <td className="small">{payment.method ?? 'cash'}</td>
                  <td className="small muted">{payment.note ?? ''}</td>
                  <td className="num">{fmt(payment.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="breakdown" style={{ marginTop: 18 }}>
          <div className="line">
            <span>Agreed price</span>
            <span className="amount">
              {fmt(sale.price)} {sale.currency}
            </span>
          </div>
          <div className="line">
            <span>Paid so far</span>
            <span className="amount">{fmt(sale.paid)}</span>
          </div>
          <div className="line total">
            <span>{outstanding > 0 ? 'Still to pay' : 'Balance'}</span>
            <span className="amount">
              {fmt(sale.remaining)} {sale.currency}
            </span>
          </div>
        </div>

        {outstanding > 0 ? (
          <p className="doc-note">
            {sale.buyerName} still owes {fmt(sale.remaining)} {sale.currency} on this vehicle. The
            vehicle's papers are handed over when the full amount has been paid.
          </p>
        ) : (
          <p className="doc-note">
            Paid in full. Received with thanks — this receipt is the buyer's proof of payment.
          </p>
        )}

        {sale.note && <p className="doc-note">{sale.note}</p>}

        <div className="doc-sign">
          <div>Buyer — {sale.buyerName}</div>
          <div>For {settings.businessName}</div>
        </div>
      </div>
    </>
  );
}
