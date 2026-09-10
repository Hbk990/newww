import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { PageHeader, useApp } from '../App';
import { api, fmt, fmtDate, type Statement } from '../lib/api';
import { Alert, Balance, Card, Empty, Spinner } from '../components/ui';

/**
 * AN ACCOUNT, AS A TIMELINE.
 *
 * A statement is a story in date order: he bought a car, you sent a wire, he
 * credited the tax back. A spreadsheet grid hides that; a line down the page
 * with the days marked on it shows it. Money in one direction is green, money
 * the other way is red, and the running balance sits under each amount so you
 * can always answer "how did it get to this?".
 *
 * The printed version stays a table — that is what a supplier expects on paper.
 */

const KIND_LABELS: Record<string, string> = {
  OPENING_BALANCE: 'Opening balance',
  CAR_PURCHASE: 'Car bought',
  ORIGIN_EXPENSE: 'Expense abroad',
  TAX_CHARGE: 'Tax invoiced',
  TAX_REFUND_CREDIT: 'Tax credited back',
  FREIGHT_INVOICE: 'Freight',
  LABOUR_CHARGE: 'Repair work',
  PARTS_CHARGE: 'Parts',
  SALARY_CHARGE: 'Salary',
  SALE_CHARGE: 'Car sold',
  SALE_PAYMENT: 'Payment received',
  ORIGIN_SALE_PROCEEDS: 'Sold abroad',
  DEPOSIT: 'Deposit',
  WIRE_OUT: 'Wire sent',
  PAYMENT: 'Payment',
  FEE: 'Commission',
  REVERSAL: 'Reversal',
  ADJUSTMENT: 'Correction',
};

export default function StatementPage() {
  const { id } = useParams();
  const { settings } = useApp();
  const [data, setData] = useState<Statement | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    api
      .get<Statement>(`/api/parties/${id}/statement`)
      .then(setData)
      .catch((e) => setError(e.message));

  useEffect(() => {
    void load();
  }, [id]);

  const reverse = async (entryId: number) => {
    const reason = prompt('Why is this line being reversed? It stays visible in the history.');
    if (!reason) return;
    try {
      await api.post(`/api/ledger/${entryId}/reverse`, { reason });
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Could not reverse that line');
    }
  };

  if (error) return <Alert kind="error">{error}</Alert>;
  if (!data) return <Spinner />;

  const currency = data.party.currency;

  return (
    <>
      {/* On paper the printed header below carries the name and the balance,
          so the screen header and the tiles would only repeat them. */}
      <div className="no-print">
      <PageHeader
        title={data.party.name}
        sub={
          <>
            {data.party.companyName && `${data.party.companyName} · `}
            {data.party.mobile ?? 'no mobile on file'}
          </>
        }
        action={
          <div className="row">
            <div className="actions">
              <button className="secondary" onClick={() => window.print()}>
                Print
              </button>
            </div>
            <div className="actions">
              <a href={`/api/reports/export/statement/${id}`}>
                <button className="secondary">Download Excel</button>
              </a>
            </div>
          </div>
        }
      />
      </div>

      {/* Only on paper: a statement handed to someone has to say whose it is. */}
      <div className="print-only doc-head">
        <div>
          <h1>{settings.businessName}</h1>
          <div className="small muted">Account statement — {data.party.name}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="doc-title">{data.meaning.label}</div>
          <div className="strong">
            {fmt(data.closingBalance)} {currency}
          </div>
          <div className="small muted">{data.balanceLabel}</div>
        </div>
      </div>

      <div className="grid cols-3 no-print">
        <div className="stat">
          <div className="label">{data.meaning.label}</div>
          <div className="value">
            <Balance
              amount={data.closingBalance}
              currency={currency}
              invertColour={data.party.type === 'TRANSFER_COMPANY' || data.party.type === 'CUSTOMER'}
            />
          </div>
          <div className="hint">{data.balanceLabel}</div>
        </div>
        <div className="stat">
          <div className="label">Movements</div>
          <div className="value">{data.lines.length}</div>
        </div>
      </div>

      <Card title="Statement">
        {data.lines.length === 0 ? (
          <Empty>Nothing has moved on this account yet.</Empty>
        ) : (
          <>
          <div className="timeline no-print">
            {data.lines.map((line, index) => {
              const day = fmtDate(line.date);
              const newDay = index === 0 || fmtDate(data.lines[index - 1].date) !== day;
              // Coloured by what it means for you, not by its sign: on a
              // supplier's account a new car is a debt going up, which is not
              // good news, while the payment that clears it is.
              const raw = Number(line.amount);
              const positiveIsGood =
                data.party.type === 'TRANSFER_COMPANY' || data.party.type === 'CUSTOMER';
              const out = raw === 0 ? false : (raw > 0) !== positiveIsGood;
              return (
                <div key={line.id}>
                  {newDay && <div className="day">{day}</div>}
                  <div className={`entry ${out ? 'out' : 'in'}`}>
                    <div className="what">
                      <div className="kind">{KIND_LABELS[line.kind] ?? line.kind}</div>
                      <div className="desc">{line.description}</div>
                      {line.kind !== 'REVERSAL' && (
                        <button className="link small" onClick={() => void reverse(line.id)}>
                          Reverse this
                        </button>
                      )}
                    </div>
                    <div className="amounts">
                      <span className="amount">
                        {raw < 0 ? '−' : '+'}
                        {fmt(String(line.amount).replace('-', ''))}
                      </span>
                      <div className="running">
                        balance {fmt(line.runningBalance)} {currency}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="table-wrap print-only-block">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Description</th>
                  <th className="num">Amount</th>
                  <th className="num">Balance</th>
                  <th className="no-print" />
                </tr>
              </thead>
              <tbody>
                {data.lines.map((line) => (
                  <tr key={line.id}>
                    <td className="small">{fmtDate(line.date)}</td>
                    <td className="small">{KIND_LABELS[line.kind] ?? line.kind}</td>
                    <td className="small">{line.description}</td>
                    <td className={`num ${Number(line.amount) < 0 ? 'pos' : ''}`}>{fmt(line.amount)}</td>
                    <td className="num strong">{fmt(line.runningBalance)}</td>
                    <td className="num no-print">
                      {line.kind !== 'REVERSAL' && (
                        <button className="link small" onClick={() => void reverse(line.id)}>
                          Reverse
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
        <div className="small muted" style={{ marginTop: 10 }}>
          Lines are never edited or deleted. A mistake is cancelled with a reversal, so the history
          always shows what really happened.
        </div>
      </Card>
    </>
  );
}
