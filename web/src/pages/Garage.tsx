import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader, useApp } from '../App';
import { api, fmt, todayIso, type Car, type Party } from '../lib/api';
import { Alert, Card, Empty, Field, Modal, Spinner, useSubmit } from '../components/ui';
import { MoneyInput } from '../components/MoneyInput';

const SERVICES = [
  { value: 'BLACKSMITH', label: 'Blacksmith (body work)' },
  { value: 'PAINTER', label: 'Painter' },
  { value: 'MECHANIC', label: 'Mechanic' },
];

interface GarageCar extends Car {
  repairJobs: { id: number; serviceType: string; labourCostCfa: string; description: string | null; worker: { name: string } }[];
  repairParts: { id: number; description: string; costCfa: string; partsSupplier: { name: string } }[];
  servicesDone: string[];
  daysInGarage: number | null;
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
    <>
      <PageHeader title="Garage" sub="Damaged cars being made ready for the showroom" />

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
        <div className="grid cols-2">
          {cars.map((car) => (
            <Card key={car.id}>
              <div className="page-header" style={{ marginBottom: 8 }}>
                <div>
                  <h2>
                    <Link to={`/cars/${car.id}`}>
                      {car.year} {car.makeName} {car.modelName}
                    </Link>
                  </h2>
                  <div className="sub">
                    {car.color} · {car.driveAndRun ? 'drives & runs' : 'does not drive'}
                    {car.daysInGarage !== null && ` · ${car.daysInGarage} days here`}
                  </div>
                </div>
                <button className="small" onClick={() => setWorking(car)}>
                  Add work
                </button>
              </div>

              {car.arrivalNote && <p className="small muted">{car.arrivalNote}</p>}

              <div className="row" style={{ marginBottom: 8 }}>
                {SERVICES.map((service) => (
                  <span
                    key={service.value}
                    className={`badge ${car.servicesDone.includes(service.value) ? 'green' : 'grey'}`}
                    style={{ flex: '0 0 auto' }}
                  >
                    {service.label}
                    {car.servicesDone.includes(service.value) ? ' ✓' : ''}
                  </span>
                ))}
              </div>

              <div className="breakdown">
                <div className="line">
                  <span>Cost on arrival</span>
                  <span className="amount">{fmt(car.costs.cfa?.arrivalCostCfa)}</span>
                </div>
                {car.repairJobs.map((job) => (
                  <div className="line" key={`j${job.id}`}>
                    <span>
                      {job.serviceType.toLowerCase()} — {job.worker.name}
                      {job.description && <div className="small muted">{job.description}</div>}
                    </span>
                    <span className="amount">{fmt(job.labourCostCfa)}</span>
                  </div>
                ))}
                {car.repairParts.map((part) => (
                  <div className="line" key={`p${part.id}`}>
                    <span>
                      {part.description}
                      <div className="small muted">from {part.partsSupplier.name}</div>
                    </span>
                    <span className="amount">{fmt(part.costCfa)}</span>
                  </div>
                ))}
                <div className="line total">
                  <span>Cost so far</span>
                  <span className="amount">
                    {fmt(car.costs.landedCostCfa)} {cfa}
                  </span>
                </div>
              </div>

              <FinishRepair car={car} onDone={load} />
            </Card>
          ))}
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
    </>
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
