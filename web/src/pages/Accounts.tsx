import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader, useApp } from '../App';
import { api, type Party, type PartyType } from '../lib/api';
import { Alert, Balance, Card, Empty, Field, Modal, Spinner, useSubmit } from '../components/ui';

const TABS: { type: PartyType; label: string; blurb: string }[] = [
  { type: 'CAR_SUPPLIER', label: 'Car suppliers', blurb: 'Where you buy cars. Balances in USD.' },
  { type: 'SHIPPING_COMPANY', label: 'Shipping', blurb: 'Ocean freight. Invoiced in USD.' },
  { type: 'TRANSFER_COMPANY', label: 'Transfer companies', blurb: 'Your money. A negative balance means you have overdrawn.' },
  { type: 'WORKER', label: 'Workers', blurb: 'Garage and showroom staff, paid in local currency.' },
  { type: 'PARTS_SUPPLIER', label: 'Parts suppliers', blurb: 'Auto parts bought on account.' },
  { type: 'CUSTOMER', label: 'Customers', blurb: 'Only needed for a buyer who pays over time.' },
];

export default function Accounts() {
  const [type, setType] = useState<PartyType>('CAR_SUPPLIER');
  const [parties, setParties] = useState<Party[] | null>(null);
  const [editing, setEditing] = useState<Party | 'new' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setParties(null);
    try {
      setParties(await api.get<Party[]>(`/api/parties?type=${type}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load accounts');
    }
  };

  useEffect(() => {
    void load();
  }, [type]);

  const tab = TABS.find((t) => t.type === type)!;

  return (
    <>
      <PageHeader
        title="Accounts"
        sub={tab.blurb}
        action={<button onClick={() => setEditing('new')}>Add {tab.label.replace(/s$/, '').toLowerCase()}</button>}
      />

      <div className="row" style={{ marginBottom: 12 }}>
        {TABS.map((t) => (
          <button
            key={t.type}
            className={t.type === type ? '' : 'secondary'}
            style={{ flex: '0 0 auto' }}
            onClick={() => setType(t.type)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <Alert kind="error">{error}</Alert>

      <Card>
        {!parties ? (
          <Spinner />
        ) : parties.length === 0 ? (
          <Empty>No {tab.label.toLowerCase()} yet.</Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Company</th>
                  <th>Mobile</th>
                  {type === 'CAR_SUPPLIER' && <th>Country</th>}
                  <th className="num">Balance</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {parties.map((party) => (
                  <tr key={party.id}>
                    <td className="strong">
                      <Link to={`/accounts/${party.id}`}>{party.name}</Link>
                    </td>
                    <td>{party.companyName ?? '—'}</td>
                    <td>{party.mobile ?? '—'}</td>
                    {type === 'CAR_SUPPLIER' && (
                      <td>
                        {party.country === 'CANADA' ? (
                          <span className="badge red">
                            Canada{party.wholesaler === 'PRICE_PLUS_TAX' ? ' + tax' : ''}
                          </span>
                        ) : (
                          <span className="badge blue">USA</span>
                        )}
                      </td>
                    )}
                    <td className="num">
                      <Balance
                        amount={party.balance}
                        currency={party.currency}
                        label={party.balanceLabel}
                        invertColour={type === 'TRANSFER_COMPANY' || type === 'CUSTOMER'}
                      />
                    </td>
                    <td className="num">
                      <button className="link" onClick={() => setEditing(party)}>
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {editing && (
        <PartyForm
          type={type}
          party={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      )}
    </>
  );
}

function PartyForm({
  type,
  party,
  onClose,
  onSaved,
}: {
  type: PartyType;
  party: Party | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { cfa } = useApp();
  const [name, setName] = useState(party?.name ?? '');
  const [companyName, setCompanyName] = useState(party?.companyName ?? '');
  const [mobile, setMobile] = useState(party?.mobile ?? '');
  const [country, setCountry] = useState(party?.country ?? '');
  const [wholesaler, setWholesaler] = useState(party?.wholesaler ?? '');
  const [workerRole, setWorkerRole] = useState(party?.workerRole ?? 'GARAGE');
  const [note, setNote] = useState(party?.note ?? '');

  const { busy, error, run } = useSubmit(async () => {
    const body = {
      type,
      name,
      companyName: companyName || null,
      mobile: mobile || null,
      country: country || null,
      wholesaler: wholesaler || null,
      workerRole: type === 'WORKER' ? workerRole : null,
      note: note || null,
    };
    if (party) await api.patch(`/api/parties/${party.id}`, body);
    else await api.post('/api/parties', body);
    onSaved();
    return true;
  });

  const archive = async () => {
    if (!party) return;
    try {
      await api.post(`/api/parties/${party.id}/archive`);
      onSaved();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Could not remove this account');
    }
  };

  return (
    <Modal title={party ? `Edit ${party.name}` : 'New account'} onClose={onClose}>
      <Alert kind="error">{error}</Alert>

      <Field label="Name">
        <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </Field>

      <Field label="Company name">
        <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
      </Field>

      <Field label="Mobile number">
        <input value={mobile} onChange={(e) => setMobile(e.target.value)} />
      </Field>

      {type === 'CAR_SUPPLIER' && (
        <>
          <Field
            label="Country"
            help="This decides how tax is handled — USA has none, Canada may add tax to the invoice."
          >
            <select value={country} onChange={(e) => setCountry(e.target.value as 'USA' | 'CANADA')}>
              <option value="">Choose a country…</option>
              <option value="USA">USA</option>
              <option value="CANADA">Canada</option>
            </select>
          </Field>

          {country === 'CANADA' && (
            <Field
              label="How does he invoice?"
              help="Price + tax means the Canada tax rule applies to every car from him."
            >
              <select value={wholesaler} onChange={(e) => setWholesaler(e.target.value as 'PRICE_ONLY' | 'PRICE_PLUS_TAX')}>
                <option value="">Choose…</option>
                <option value="PRICE_ONLY">Car price only</option>
                <option value="PRICE_PLUS_TAX">Car price + tax</option>
              </select>
            </Field>
          )}
        </>
      )}

      {type === 'WORKER' && (
        <Field label="Where does he work?">
          <select value={workerRole} onChange={(e) => setWorkerRole(e.target.value as 'GARAGE' | 'SHOWROOM')}>
            <option value="GARAGE">Garage</option>
            <option value="SHOWROOM">Showroom</option>
          </select>
        </Field>
      )}

      {type === 'TRANSFER_COMPANY' && !party && (
        <Alert kind="info">
          Tip: create one called “Cash box” for the money you hold yourself, so every franc that
          moves has an account it came from.
        </Alert>
      )}

      <Field label="Note">
        <textarea value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>

      <div className="modal-actions">
        {party && (
          <button className="secondary" onClick={archive} style={{ marginRight: 'auto' }}>
            Remove
          </button>
        )}
        <button className="secondary" onClick={onClose}>
          Cancel
        </button>
        <button onClick={() => void run()} disabled={busy || !name}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
      <div className="small muted" style={{ marginTop: 8 }}>
        Balances for this account are kept in {type === 'CAR_SUPPLIER' || type === 'SHIPPING_COMPANY' ? 'USD' : cfa}.
      </div>
    </Modal>
  );
}
