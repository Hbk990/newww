import { useState } from 'react';
import { api, fmt } from '../lib/api';
import { Alert, Field, Modal, useSubmit } from './ui';
import { MoneyInput, moneyValue } from './MoneyInput';
import { useApp } from '../App';

/**
 * WHAT YOU ARE ASKING FOR A CAR.
 *
 * It is a decision, not a fact: you change it when the car sits too long, when
 * a buyer haggles, or when the repairs came in higher than you expected. So it
 * can be changed at any time, right up until the car is sold — after that it is
 * history and the sale price is what matters.
 *
 * The cost is shown beside the box while you type, with what you would make at
 * that price, because pricing a car without seeing what it cost is how a
 * showroom loses money politely.
 */
export function PriceModal({
  car,
  onClose,
  onSaved,
}: {
  car: {
    id: number;
    year: number;
    makeName: string;
    modelName: string;
    askingPriceCfa: string | null;
    costs: { landedCostCfa: string | null };
  };
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const { cfa } = useApp();
  const [price, setPrice] = useState(car.askingPriceCfa ?? '');

  const cost = Number(car.costs.landedCostCfa ?? 0);
  const asking = moneyValue(price) ?? 0;
  const profit = asking - cost;
  const marginPct = cost > 0 && asking > 0 ? (profit / cost) * 100 : null;

  /** Cost plus a margin, rounded to something you would actually say. */
  const suggest = (percent: number) =>
    String(Math.round((cost * (1 + percent / 100)) / 25000) * 25000);

  const { busy, error, run } = useSubmit(async () => {
    await api.patch(`/api/cars/${car.id}`, { askingPriceCfa: asking });
    onSaved(
      `${car.year} ${car.makeName} ${car.modelName} is now priced at ${fmt(asking)} ${cfa}.`,
    );
  });

  return (
    <Modal title={`Price the ${car.year} ${car.makeName} ${car.modelName}`} onClose={onClose}>
      <Alert kind="error">{error}</Alert>

      <div className="breakdown" style={{ marginBottom: 12 }}>
        <div className="line">
          <span>What it has cost you</span>
          <span className="amount strong">{fmt(cost)} {cfa}</span>
        </div>
        {car.askingPriceCfa && (
          <div className="line">
            <span>Price now</span>
            <span className="amount">{fmt(car.askingPriceCfa)} {cfa}</span>
          </div>
        )}
      </div>

      <Field label={`Asking price (${cfa})`}>
        <MoneyInput value={price} onChange={setPrice} autoFocus />
      </Field>

      {cost > 0 && (
        <div className="row" style={{ gap: 6, marginBottom: 12 }}>
          <span className="small muted" style={{ flex: '0 0 auto', alignSelf: 'center' }}>
            Cost plus
          </span>
          {[10, 15, 20, 25, 30].map((percent) => (
            <div className="actions" key={percent}>
              <button type="button" className="secondary small" onClick={() => setPrice(suggest(percent))}>
                {percent}%
              </button>
            </div>
          ))}
        </div>
      )}

      {asking > 0 && cost > 0 && (
        <Alert kind={profit > 0 ? 'success' : 'error'}>
          {profit >= 0 ? 'You would make ' : 'You would lose '}
          <strong>
            {fmt(Math.abs(profit))} {cfa}
          </strong>
          {marginPct !== null && ` — ${marginPct.toFixed(1)}% of what it cost`}
          {profit <= 0 && '. Sell it anyway if you must, but know what it is doing.'}
        </Alert>
      )}

      <div className="modal-actions">
        <button className="secondary" onClick={onClose}>
          Cancel
        </button>
        <button onClick={() => void run()} disabled={busy || asking <= 0}>
          {busy ? 'Saving…' : 'Save the price'}
        </button>
      </div>
    </Modal>
  );
}
