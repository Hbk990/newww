import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader, useApp } from '../App';
import { api, fmtUsd, todayIso, type Party } from '../lib/api';
import { Alert, Card, Field, useSubmit } from '../components/ui';
import { MoneyInput } from '../components/MoneyInput';
import { Flag } from '../components/icons';

/**
 * BUYING A CAR, ONE THING AT A TIME.
 *
 * It used to be a single long form: supplier, car, money and tax all shouting
 * at once, and the running cost somewhere off the bottom of the screen. It is
 * three calm steps now — who you bought it from, which car, what it cost — with
 * the cost adding itself up beside you the whole way, because the only question
 * that matters while typing is "what is this car going to owe me?".
 */

interface Make { id: number; name: string }
interface Model { id: number; name: string }

interface VinCheck {
  normalized: string;
  wellFormed: boolean;
  checkDigitValid: boolean;
  message: string | null;
  duplicate: { id: number; makeName: string; modelName: string; year: number } | null;
  decoded: { makeName?: string; modelName?: string; year?: number } | null;
  decodeSource: string;
}

interface ExpenseRow { amountUsd: string; note: string }

export default function BuyCar() {
  const navigate = useNavigate();
  const { settings } = useApp();
  const threshold = Number(settings.taxThresholdUsd);

  const [suppliers, setSuppliers] = useState<Party[]>([]);
  const [supplierId, setSupplierId] = useState('');

  const [makeQuery, setMakeQuery] = useState('');
  const [makes, setMakes] = useState<Make[]>([]);
  const [makeName, setMakeName] = useState('');
  const [models, setModels] = useState<Model[]>([]);
  const [modelName, setModelName] = useState('');

  const [year, setYear] = useState(String(new Date().getFullYear() - 3));
  const [color, setColor] = useState('');
  const [vin, setVin] = useState('');
  const [vinCheck, setVinCheck] = useState<VinCheck | null>(null);

  const [price, setPrice] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(todayIso());
  const [taxUsd, setTaxUsd] = useState('');
  const [taxRefundMode, setTaxRefundMode] = useState('SUPPLIER_CREDIT');
  const [problemNote, setProblemNote] = useState('');
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [step, setStep] = useState(0);

  useEffect(() => {
    void api.get<Party[]>('/api/parties?type=CAR_SUPPLIER').then(setSuppliers);
  }, []);

  const supplier = suppliers.find((s) => String(s.id) === supplierId);
  const taxApplies = supplier?.country === 'CANADA' && supplier.wholesaler === 'PRICE_PLUS_TAX';

  // Brand search: typing "m" brings back Mercedes-Benz, Mazda, Mitsubishi...
  useEffect(() => {
    const timer = setTimeout(() => {
      void api.get<Make[]>(`/api/vehicles/makes?q=${encodeURIComponent(makeQuery)}`).then(setMakes);
    }, 150);
    return () => clearTimeout(timer);
  }, [makeQuery]);

  useEffect(() => {
    if (!makeName) return setModels([]);
    void api
      .get<Model[]>(`/api/vehicles/models?makeName=${encodeURIComponent(makeName)}`)
      .then(setModels);
  }, [makeName]);

  // Checking the VIN as it is typed catches a mistake now, not at customs.
  useEffect(() => {
    if (vin.trim().length < 11) return setVinCheck(null);
    const timer = setTimeout(() => {
      void api
        .get<VinCheck>(`/api/vehicles/vin/${encodeURIComponent(vin.trim())}`)
        .then((check) => {
          setVinCheck(check);
          if (check.decoded?.year && !color) setYear(String(check.decoded.year));
          if (check.decoded?.makeName && !makeName) {
            setMakeName(check.decoded.makeName);
            setMakeQuery(check.decoded.makeName);
          }
          if (check.decoded?.modelName && !modelName) setModelName(check.decoded.modelName);
        })
        .catch(() => setVinCheck(null));
    }, 400);
    return () => clearTimeout(timer);
  }, [vin]);

  const tax = useMemo(() => {
    const value = Number(taxUsd || 0);
    if (!taxApplies || value <= 0) return null;
    const capitalized = Math.min(value, threshold);
    return { capitalized, refundable: value - capitalized };
  }, [taxUsd, taxApplies, threshold]);

  const expensesTotal = expenses.reduce((sum, e) => sum + Number(e.amountUsd || 0), 0);
  const carCost = Number(price || 0) + expensesTotal + (tax?.capitalized ?? 0);

  const { busy, error, run } = useSubmit(async () => {
    const car = await api.post<{ id: number }>('/api/cars', {
      supplierId: Number(supplierId),
      makeName,
      modelName,
      year: Number(year),
      color,
      vin,
      purchasePriceUsd: Number(price),
      purchaseDate,
      taxUsd: taxApplies ? Number(taxUsd || 0) : 0,
      taxRefundMode: tax && tax.refundable > 0 ? taxRefundMode : undefined,
      problemNote: problemNote || null,
      originExpenses: expenses
        .filter((e) => Number(e.amountUsd) > 0)
        .map((e) => ({ amountUsd: Number(e.amountUsd), note: e.note || null, date: purchaseDate })),
    });
    navigate(`/cars/${car.id}`);
    return car;
  });

  const ready = supplierId && makeName && modelName && color && vin && Number(price) > 0;

  const stepsDone = [
    Boolean(supplierId),
    Boolean(makeName && modelName && color && vin),
    Number(price) > 0,
  ];

  const STEPS = ['Who you bought it from', 'Which car', 'What it cost'];

  return (
    <div className="page">
      <PageHeader
        title="Buy a car"
        sub="Everything here is in USD — it converts to local currency when the shipment arrives"
      />

      <Alert kind="error">{error}</Alert>

      <div className="steps">
        {STEPS.map((label, index) => (
          <button
            key={label}
            type="button"
            className={`step${index === step ? ' on' : ''}${stepsDone[index] ? ' done' : ''}`}
            onClick={() => setStep(index)}
          >
            <span className="n">{stepsDone[index] && index !== step ? '✓' : index + 1}</span>
            {label}
          </button>
        ))}
      </div>

      <div className="grid cols-2">
        <div>
          {step === 0 && (
            <Card title="Who you bought it from">
              <Field label="Supplier">
                <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                  <option value="">Choose a supplier…</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                      {s.companyName ? ` — ${s.companyName}` : ''} ({s.country === 'CANADA' ? 'Canada' : 'USA'})
                    </option>
                  ))}
                </select>
              </Field>

              {supplier && (
                <div className="row" style={{ alignItems: 'center', gap: 10, margin: '4px 0 12px' }}>
                  <span style={{ flex: '0 0 auto' }}>
                    <Flag country={supplier.country} />
                  </span>
                  <span className="small" style={{ flex: 1 }}>
                    {supplier.country === 'USA'
                      ? 'A supplier in the USA — no tax applies to this purchase.'
                      : taxApplies
                        ? 'A Canadian supplier who invoices price + tax. The tax rule applies to this car.'
                        : 'A Canadian supplier who invoices the car price only, so there is no tax to enter.'}
                  </span>
                </div>
              )}

              <Field label="Purchase date">
                <input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
              </Field>

              <button onClick={() => setStep(1)} disabled={!supplierId}>
                Next — which car
              </button>
            </Card>
          )}

          {step === 1 && (
            <Card title="Which car">
              <Field label="Brand" help="Type a letter or two — for example “m” for Mercedes-Benz, Mazda, Mitsubishi.">
                <input
                  list="makes"
                  value={makeQuery}
                  placeholder="Start typing a brand…"
                  onChange={(e) => {
                    setMakeQuery(e.target.value);
                    setMakeName(e.target.value);
                    setModelName('');
                  }}
                />
                <datalist id="makes">
                  {makes.map((make) => (
                    <option key={make.id} value={make.name} />
                  ))}
                </datalist>
              </Field>

              <Field
                label="Model"
                help={
                  models.length > 0
                    ? `${models.length} models known for ${makeName}. You can also type one that is not listed.`
                    : 'Type the model.'
                }
              >
                <input
                  list="models"
                  value={modelName}
                  placeholder="CLA 300"
                  onChange={(e) => setModelName(e.target.value)}
                />
                <datalist id="models">
                  {models.map((model) => (
                    <option key={model.id} value={model.name} />
                  ))}
                </datalist>
              </Field>

              <div className="row">
                <Field label="Year">
                  <input
                    type="number"
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                    min={1950}
                    max={new Date().getFullYear() + 1}
                  />
                </Field>
                <Field label="Colour">
                  <input value={color} onChange={(e) => setColor(e.target.value)} placeholder="Black" />
                </Field>
              </div>

              <Field label="VIN" help="17 characters. It is checked as you type.">
                <input
                  value={vin}
                  onChange={(e) => setVin(e.target.value.toUpperCase())}
                  placeholder="WDDSJ4EB0KN712345"
                  maxLength={17}
                  style={{ fontFamily: 'ui-monospace, monospace', letterSpacing: '0.04em' }}
                />
              </Field>

              {vinCheck?.duplicate && (
                <Alert kind="error">
                  This VIN is already in the system: {vinCheck.duplicate.year} {vinCheck.duplicate.makeName}{' '}
                  {vinCheck.duplicate.modelName}.
                </Alert>
              )}
              {vinCheck && !vinCheck.duplicate && vinCheck.message && (
                <Alert kind="warn">{vinCheck.message}</Alert>
              )}
              {vinCheck?.wellFormed && !vinCheck.message && !vinCheck.duplicate && (
                <Alert kind="success">
                  VIN looks valid
                  {vinCheck.decodeSource === 'nhtsa' && vinCheck.decoded?.makeName
                    ? ` — decoded as ${vinCheck.decoded.year ?? ''} ${vinCheck.decoded.makeName} ${vinCheck.decoded.modelName ?? ''}`
                    : ''}
                  .
                </Alert>
              )}

              <Field label="Any problem with the car?" help="Written down now so it is not forgotten when it arrives.">
                <textarea
                  value={problemNote}
                  onChange={(e) => setProblemNote(e.target.value)}
                  placeholder="Front bumper cracked, seller says it drives fine"
                />
              </Field>

              <div className="row" style={{ gap: 8 }}>
                <div className="actions">
                  <button className="secondary" onClick={() => setStep(0)}>
                    Back
                  </button>
                </div>
                <div className="actions">
                  <button onClick={() => setStep(2)} disabled={!makeName || !modelName || !color || !vin}>
                    Next — what it cost
                  </button>
                </div>
              </div>
            </Card>
          )}

          {step === 2 && (
            <Card title="What it cost">
              <Field label="Purchase price (USD)">
                <MoneyInput decimals={2} value={price} onChange={setPrice} placeholder="10,000" />
              </Field>

              {taxApplies && (
                <>
                  <Field
                    label="Tax on the invoice (USD)"
                    help={`Tax up to $${threshold} becomes part of the car's cost. Anything above comes back to you.`}
                  >
                    <MoneyInput decimals={2} value={taxUsd} onChange={setTaxUsd} placeholder="700" />
                  </Field>

                  {tax && tax.refundable > 0 && (
                    <>
                      <Alert kind="warn">
                        {fmtUsd(tax.capitalized)} goes into this car's cost and {fmtUsd(tax.refundable)} is
                        refundable to you.
                      </Alert>
                      <Field label="How does the refundable part come back?">
                        <select value={taxRefundMode} onChange={(e) => setTaxRefundMode(e.target.value)}>
                          <option value="SUPPLIER_CREDIT">The supplier credits it to my account</option>
                          <option value="SEPARATE_REFUND">It is refunded to me separately</option>
                        </select>
                      </Field>
                    </>
                  )}
                </>
              )}

              <h3 style={{ marginTop: 16 }}>
                Expenses inside{' '}
                {supplier ? (supplier.country === 'CANADA' ? 'Canada' : 'the USA') : 'the origin country'}
              </h3>
              <p className="small muted" style={{ marginTop: 0 }}>
                Inland transport, something the seller fixed — not the ocean freight. These are charged to
                the supplier's account.
              </p>

              {expenses.map((expense, index) => (
                <div className="row" key={index}>
                  <Field label="Amount (USD)">
                    <MoneyInput
                      decimals={2}
                      value={expense.amountUsd}
                      onChange={(next) =>
                        setExpenses(expenses.map((x, i) => (i === index ? { ...x, amountUsd: next } : x)))
                      }
                    />
                  </Field>
                  <Field label="What was it for?">
                    <input
                      value={expense.note}
                      onChange={(e) =>
                        setExpenses(expenses.map((x, i) => (i === index ? { ...x, note: e.target.value } : x)))
                      }
                      placeholder="Optional"
                    />
                  </Field>
                  <div className="actions">
                    <button
                      className="secondary small"
                      onClick={() => setExpenses(expenses.filter((_, i) => i !== index))}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}

              <button
                className="secondary small"
                onClick={() => setExpenses([...expenses, { amountUsd: '', note: '' }])}
              >
                + Add an expense
              </button>

              <div className="row" style={{ gap: 8, marginTop: 16 }}>
                <div className="actions">
                  <button className="secondary" onClick={() => setStep(1)}>
                    Back
                  </button>
                </div>
                <div className="actions">
                  <button onClick={() => void run()} disabled={busy || !ready}>
                    {busy ? 'Saving…' : 'Save this purchase'}
                  </button>
                </div>
              </div>
            </Card>
          )}
        </div>

        <div>
          <div className="sticky-total">
            <Card title="What this car will cost you">
              <div className="breakdown">
                <div className="line">
                  <span>Purchase price</span>
                  <span className="amount">{fmtUsd(price || 0)}</span>
                </div>
                {expensesTotal > 0 && (
                  <div className="line">
                    <span>Expenses abroad</span>
                    <span className="amount">{fmtUsd(expensesTotal)}</span>
                  </div>
                )}
                {tax && (
                  <>
                    <div className="line">
                      <span>Tax kept in the cost</span>
                      <span className="amount">{fmtUsd(tax.capitalized)}</span>
                    </div>
                    {tax.refundable > 0 && (
                      <div className="line muted">
                        <span>Tax refundable (not a cost)</span>
                        <span className="amount">−{fmtUsd(tax.refundable)}</span>
                      </div>
                    )}
                  </>
                )}
                <div className="line total">
                  <span>Cost so far</span>
                  <span className="amount">{fmtUsd(carCost)}</span>
                </div>
              </div>

              {(supplier || makeName) && (
                <p className="small muted" style={{ marginBottom: 0 }}>
                  {[
                    supplier ? `From ${supplier.name}` : null,
                    makeName && modelName ? `${year} ${makeName} ${modelName}` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              )}

              <p className="small muted" style={{ marginBottom: 0 }}>
                Freight is added when you put this car on a shipment, and the whole amount converts to
                local currency at the rate you enter when it arrives.
              </p>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
