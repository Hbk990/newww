import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader, useApp } from '../App';
import { api, fmt, todayIso, type Car, type Party } from '../lib/api';
import { Alert, Card, Empty, Field, Modal, Spinner, useSubmit } from '../components/ui';
import { MoneyInput } from '../components/MoneyInput';

/**
 * THE GARAGE, AS A BOARD.
 *
 * A car sits in the column of the trade it is still waiting for — the question
 * a garage is actually asked is "what is left on it", not "what has been done".
 * The trades are worked in the order a body shop works them: metal first, then
 * paint, then the engine. When nothing is left the car moves to the last column
 * and can go to the showroom.
 *
 * Every card carries what the car has cost so far against what you mean to ask
 * for it, so a repair that has quietly eaten the profit is visible while you
 * can still stop.
 */

const SERVICES = [
  { value: 'BLACKSMITH', label: 'Blacksmith (body work)', short: 'Body', colour: '#c2761f' },
  { value: 'PAINTER', label: 'Painter', short: 'Paint', colour: '#7a5cd6' },
  { value: 'MECHANIC', label: 'Mechanic', short: 'Engine', colour: '#0f8a9e' },
];

interface GarageCar extends Car {
  repairJobs: { id: number; serviceType: string; labourCostCfa: string; description: string | null; worker: { name: string } }[];
  repairParts: { id: number; description: string; costCfa: string; partsSupplier: { name: string } }[];
  servicesDone: string[];
  daysInGarage: number | null;
  needsBlacksmith: boolean;
  needsPainter: boolean;
  needsMechanic: boolean;
}

/** What a car is waiting for: ticked as needed, and not yet done. */
function waitingFor(car: GarageCar): string[] {
  const needs = [
    car.needsBlacksmith ? 'BLACKSMITH' : null,
    car.needsPainter ? 'PAINTER' : null,
    car.needsMechanic ? 'MECHANIC' : null,
  ].filter(Boolean) as string[];
  return needs.filter((service) => !car.servicesDone.includes(service));
}

export default function Garage() {
  const { cfa } = useApp();
  const [cars, setCars] = useState<GarageCar[] | null>(null);
  const [workers, setWorkers] = useState<Party[]>([]);
  const [partsSuppliers, setPartsSuppliers] = useState<Party[]>([]);
  const [working, setWorking] = useState<GarageCar | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const [garage, w, p] = await Promise.all([
        api.get<GarageCar[]>('/api/garage'),
        api.get<Party[]>('/api/parties?type=WORKER'),
        api.get<Party[]>('/api/parties?type=PARTS_SUPPLIER'),
      ]);
      setCars(garage);
      setWorkers(w.filter((worker) => worker.workerRole === 'GARAGE'));
      setPartsSuppliers(p);
      if (working) setWorking(garage.find((car) => car.id === working.id) ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the garage');
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="page">
      <PageHeader
        title="Garage"
        sub="Each car sits under the trade it is still waiting for"
      />

      <Alert kind="error">{error}</Alert>

      {!cars ? (
        <Spinner />
      ) : cars.length === 0 ? (
        <Card>
          <Empty>
            Nothing in the garage. Cars arrive here when you tick “damaged” on their arrival
            condition.
          </Empty>
        </Card>
      ) : (
        <div className="board">
          {COLUMNS.map((column) => {
            const inColumn = cars.filter((car) => column.holds(car));
            return (
              <div className="column" key={column.key}>
                <h3>
                  {column.label}
                  <span className="count">{inColumn.length}</span>
                </h3>
                {inColumn.length === 0 ? (
                  <p className="small muted" style={{ margin: 0 }}>
                    {column.empty}
                  </p>
                ) : (
                  inColumn.map((car) => (
                    <JobCard
                      key={car.id}
                      car={car}
                      colour={column.colour}
                      onWork={() => setWorking(car)}
                      onChanged={load}
                    />
                  ))
                )}
              </div>
            );
          })}
        </div>
      )}

      {working && (
        <AddWork
          car={working}
          workers={workers}
          partsSuppliers={partsSuppliers}
          onClose={() => setWorking(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}

/** The columns of the board, in the order a body shop works. */
const COLUMNS: {
  key: string;
  label: string;
  colour: string;
  empty: string;
  holds: (car: GarageCar) => boolean;
}[] = [
  {
    key: 'unassessed',
    label: 'Not looked at',
    colour: 'var(--border-strong)',
    empty: 'Every car has been looked at.',
    holds: (car) => !car.needsBlacksmith && !car.needsPainter && !car.needsMechanic,
  },
  {
    key: 'BLACKSMITH',
    label: 'Waiting for the blacksmith',
    colour: '#c2761f',
    empty: 'No body work outstanding.',
    holds: (car) => waitingFor(car)[0] === 'BLACKSMITH',
  },
  {
    key: 'PAINTER',
    label: 'Waiting for the painter',
    colour: '#7a5cd6',
    empty: 'Nothing waiting for paint.',
    holds: (car) => waitingFor(car)[0] === 'PAINTER',
  },
  {
    key: 'MECHANIC',
    label: 'Waiting for the mechanic',
    colour: '#0f8a9e',
    empty: 'Nothing waiting on the engine.',
    holds: (car) => waitingFor(car)[0] === 'MECHANIC',
  },
  {
    key: 'ready',
    label: 'Work finished',
    colour: 'var(--chart-3)',
    empty: 'Nothing finished yet.',
    holds: (car) =>
      (car.needsBlacksmith || car.needsPainter || car.needsMechanic) && waitingFor(car).length === 0,
  },
];

/** One car on the board. */
function JobCard({
  car,
  colour,
  onWork,
  onChanged,
}: {
  car: GarageCar;
  colour: string;
  onWork: () => void;
  onChanged: () => void;
}) {
  const { cfa } = useApp();
  const [needsOpen, setNeedsOpen] = useState(false);
  const waiting = waitingFor(car);
  const cost = Number(car.costs.landedCostCfa ?? 0);
  const asking = Number(car.askingPriceCfa ?? 0);
  const margin = asking > 0 ? asking - cost : null;

  return (
    <div className="job" style={{ ['--trade' as string]: colour }}>
      <div className="who">
        <Link to={`/cars/${car.id}`} className="name-link">
          {car.year} {car.makeName} {car.modelName}
        </Link>
      </div>
      <div className="meta">
        {car.color}
        {car.daysInGarage !== null && ` · ${car.daysInGarage} days here`}
        {!car.driveAndRun && ' · does not drive'}
      </div>
      {car.arrivalNote && <div className="meta">{car.arrivalNote}</div>}

      <div className="trades">
        {SERVICES.map((service) => {
          const needed =
            (service.value === 'BLACKSMITH' && car.needsBlacksmith) ||
            (service.value === 'PAINTER' && car.needsPainter) ||
            (service.value === 'MECHANIC' && car.needsMechanic);
          const done = car.servicesDone.includes(service.value);
          if (!needed && !done) return null;
          return (
            <span key={service.value} className={`trade-dot ${done ? 'done' : 'waiting'}`}>
              {service.short}
              {done ? ' ✓' : ''}
            </span>
          );
        })}
      </div>

      <div className="money">
        <span>Cost so far</span>
        <span className="strong">{fmt(cost)}</span>
      </div>
      {margin !== null && (
        <div className="money" style={{ borderTop: 'none', paddingTop: 0, marginTop: 2 }}>
          <span className="muted">Left against {fmt(asking)}</span>
          <span className={margin < 0 ? 'neg strong' : 'pos strong'}>{fmt(margin)}</span>
        </div>
      )}

      <div className="row" style={{ gap: 6, marginTop: 10, flexWrap: 'nowrap' }}>
        <div className="actions">
          <button className="small" onClick={onWork}>
            Add work
          </button>
        </div>
        <div className="actions">
          <button className="small secondary" onClick={() => setNeedsOpen(true)}>
            What it needs
          </button>
        </div>
      </div>

      {waiting.length === 0 && (car.needsBlacksmith || car.needsPainter || car.needsMechanic) && (
        <div style={{ marginTop: 8 }}>
          <FinishRepair car={car} onDone={onChanged} />
        </div>
      )}

      {needsOpen && (
        <NeedsModal
          car={car}
          onClose={() => setNeedsOpen(false)}
          onSaved={() => {
            setNeedsOpen(false);
            onChanged();
          }}
        />
      )}
    </div>
  );
}

/** Ticking the trades a car is waiting for — what puts it in a column. */
function NeedsModal({
  car,
  onClose,
  onSaved,
}: {
  car: GarageCar;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [blacksmith, setBlacksmith] = useState(car.needsBlacksmith);
  const [painter, setPainter] = useState(car.needsPainter);
  const [mechanic, setMechanic] = useState(car.needsMechanic);

  const { busy, error, run } = useSubmit(async () => {
    await api.patch(`/api/cars/${car.id}`, {
      needsBlacksmith: blacksmith,
      needsPainter: painter,
      needsMechanic: mechanic,
    });
    onSaved();
    return true;
  });

  const rows: [string, boolean, (value: boolean) => void][] = [
    ['Blacksmith — body work', blacksmith, setBlacksmith],
    ['Painter', painter, setPainter],
    ['Mechanic', mechanic, setMechanic],
  ];

  return (
    <Modal title={`What does the ${car.year} ${car.makeName} ${car.modelName} need?`} onClose={onClose}>
      <Alert kind="error">{error}</Alert>
      <p className="small muted" style={{ marginTop: 0 }}>
        Tick every trade it is waiting for. It moves along the board as each one is done.
      </p>

      {rows.map(([label, value, set]) => (
        <div className="checkbox" key={label}>
          <input
            type="checkbox"
            id={`need-${label}`}
            checked={value}
            onChange={(e) => set(e.target.checked)}
          />
          <label htmlFor={`need-${label}`}>
            {label}
            {car.servicesDone.includes(label.split(' ')[0].toUpperCase()) && (
              <div className="small muted">Work has already been recorded for this trade.</div>
            )}
          </label>
        </div>
      ))}

      <div className="modal-actions">
        <button className="secondary" onClick={onClose}>
          Cancel
        </button>
        <button onClick={() => void run()} disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </Modal>
  );
}

function AddWork({
  car,
  workers,
  partsSuppliers,
  onClose,
  onSaved,
}: {
  car: GarageCar;
  workers: Party[];
  partsSuppliers: Party[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { cfa } = useApp();
  const [tab, setTab] = useState<'labour' | 'parts'>('labour');

  const [serviceType, setServiceType] = useState('BLACKSMITH');
  const [workerId, setWorkerId] = useState('');
  const [labourCost, setLabourCost] = useState('');
  const [description, setDescription] = useState('');

  const [partDescription, setPartDescription] = useState('');
  const [partCost, setPartCost] = useState('');
  const [partsSupplierId, setPartsSupplierId] = useState('');

  const { busy, error, run } = useSubmit(async () => {
    if (tab === 'labour') {
      await api.post(`/api/cars/${car.id}/repairs/jobs`, {
        serviceType,
        workerId: Number(workerId),
        labourCostCfa: Number(labourCost),
        description: description || null,
        date: todayIso(),
      });
    } else {
      await api.post(`/api/cars/${car.id}/repairs/parts`, {
        description: partDescription,
        costCfa: Number(partCost),
        partsSupplierId: Number(partsSupplierId),
        date: todayIso(),
      });
    }
    onSaved();
    onClose();
    return true;
  });

  return (
    <Modal title={`Work on the ${car.year} ${car.makeName} ${car.modelName}`} onClose={onClose}>
      <div className="row" style={{ marginBottom: 12 }}>
        <button className={tab === 'labour' ? '' : 'secondary'} onClick={() => setTab('labour')}>
          Work done
        </button>
        <button className={tab === 'parts' ? '' : 'secondary'} onClick={() => setTab('parts')}>
          Parts bought
        </button>
      </div>

      <Alert kind="error">{error}</Alert>

      {tab === 'labour' ? (
        <>
          <Field label="Which service?">
            <select value={serviceType} onChange={(e) => setServiceType(e.target.value)}>
              {SERVICES.map((service) => (
                <option key={service.value} value={service.value}>
                  {service.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Which worker?" help="The cost goes onto his account, to be paid later.">
            <select value={workerId} onChange={(e) => setWorkerId(e.target.value)}>
              <option value="">Choose a worker…</option>
              {workers.map((worker) => (
                <option key={worker.id} value={worker.id}>
                  {worker.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label={`Cost (${cfa})`}>
            <MoneyInput value={labourCost} onChange={setLabourCost} />
          </Field>

          <Field label="What was done?">
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Bumper and left wing repainted" />
          </Field>
        </>
      ) : (
        <>
          <Field label="Which parts?">
            <textarea
              value={partDescription}
              onChange={(e) => setPartDescription(e.target.value)}
              placeholder="Front bumper + left mirror glass"
            />
          </Field>

          <Field label="Bought from" help="The cost goes onto that supplier's account, to be paid later.">
            <select value={partsSupplierId} onChange={(e) => setPartsSupplierId(e.target.value)}>
              <option value="">Choose a parts supplier…</option>
              {partsSuppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label={`Cost (${cfa})`}>
            <MoneyInput value={partCost} onChange={setPartCost} />
          </Field>
        </>
      )}

      <div className="modal-actions">
        <button className="secondary" onClick={onClose}>
          Cancel
        </button>
        <button
          onClick={() => void run()}
          disabled={
            busy ||
            (tab === 'labour'
              ? !workerId || !Number(labourCost)
              : !partsSupplierId || !partDescription || !Number(partCost))
          }
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </Modal>
  );
}

function FinishRepair({ car, onDone }: { car: GarageCar; onDone: () => void }) {
  const { cfa } = useApp();
  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState('');

  const { busy, error, run } = useSubmit(async () => {
    await api.post(`/api/cars/${car.id}/repairs/finish`, {
      askingPriceCfa: asking ? Number(asking) : undefined,
    });
    setOpen(false);
    onDone();
    return true;
  });

  if (!open)
    return (
      <button className="secondary" style={{ marginTop: 10 }} onClick={() => setOpen(true)}>
        Repairs finished — move to showroom
      </button>
    );

  return (
    <div style={{ marginTop: 10 }}>
      <Alert kind="error">{error}</Alert>
      <Field label={`Asking price (${cfa})`} help={`It cost ${fmt(car.costs.landedCostCfa)} to get here.`}>
        <MoneyInput value={asking} onChange={setAsking} />
      </Field>
      <div className="row">
        <button onClick={() => void run()} disabled={busy}>
          {busy ? 'Moving…' : 'Move to showroom'}
        </button>
        <button className="secondary" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}
