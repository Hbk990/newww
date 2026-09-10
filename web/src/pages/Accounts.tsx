import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader, useApp } from '../App';
import { api, fmt, type Party, type PartyType } from '../lib/api';
import { Alert, Empty, Field, Modal, Spinner, useSubmit } from '../components/ui';
import { KIND_COLOUR, initialsOf, type Kind } from '../components/Chip';
import { Flag, PartMark, PersonMark, ShipMark, ToolMark, WalletMark } from '../components/icons';

/**
 * WHO YOU DEAL WITH.
 *
 * A table of names told you nothing at a glance. Each account is now a card
 * that looks like what it is — a supplier carries his country's flag, a shipper
 * a ship, the garage a spanner — and the balance is the largest thing on it,
 * because that is the only reason anyone opens this page.
 */

const TABS: {
  type: PartyType;
  label: string;
  singular: string;
  blurb: string;
  kind: Kind;
  mark: () => JSX.Element | null;
}[] = [
  {
    type: 'CAR_SUPPLIER',
    label: 'Car suppliers',
    singular: 'supplier',
    blurb: 'Where you buy cars. Balances in USD.',
    kind: 'supplier',
    mark: () => null,
  },
  {
    type: 'SHIPPING_COMPANY',
    label: 'Shipping',
    singular: 'shipping company',
    blurb: 'Ocean freight. Invoiced in USD.',
    kind: 'shipping',
    mark: () => <ShipMark size={96} />,
  },
  {
    type: 'TRANSFER_COMPANY',
    label: 'Transfer companies',
    singular: 'transfer company',
    blurb: 'Your money. A negative balance means you have overdrawn.',
    kind: 'transfer',
    mark: () => <WalletMark size={96} />,
  },
  {
    type: 'WORKER',
    label: 'Workers',
    singular: 'worker',
    blurb: 'Garage and showroom staff, paid in local currency.',
    kind: 'worker',
    mark: () => <ToolMark size={96} />,
  },
  {
    type: 'PARTS_SUPPLIER',
    label: 'Parts suppliers',
    singular: 'parts supplier',
    blurb: 'Auto parts bought on account.',
    kind: 'parts',
    mark: () => <PartMark size={96} />,
  },
  {
    type: 'CUSTOMER',
    label: 'Customers',
    singular: 'customer',
    blurb: 'Only needed for a buyer who pays over time.',
    kind: 'customer',
    mark: () => <PersonMark size={96} />,
  },
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
    <div className="page">
      <PageHeader
        title="Accounts"
        sub={tab.blurb}
        action={<button onClick={() => setEditing('new')}>Add a {tab.singular}</button>}
      />

      <div className="tabs">
        {TABS.map((t) => (
          <button key={t.type} className={t.type === type ? 'on' : ''} onClick={() => setType(t.type)}>
            {t.label}
          </button>
        ))}
      </div>

      <Alert kind="error">{error}</Alert>

      {!parties ? (
        <Spinner />
      ) : parties.length === 0 ? (
        <Empty>No {tab.label.toLowerCase()} yet.</Empty>
      ) : (
        <div className="account-grid">
          {parties.map((party) => (
            <AccountCard key={party.id} party={party} tab={tab} onEdit={() => setEditing(party)} />
          ))}
        </div>
      )}

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
    </div>
  );
}

/** One account, as a card. */
function AccountCard({
  party,
  tab,
  onEdit,
}: {
  party: Party;
  tab: (typeof TABS)[number];
  onEdit: () => void;
}) {
  const balance = Number(party.balance ?? 0);
  // For a supplier or a worker a positive balance is a debt of yours; for your
  // own money and for a customer it is the other way round.
  const positiveIsGood = tab.type === 'TRANSFER_COMPANY' || tab.type === 'CUSTOMER';
  const tone = balance === 0 ? '' : (balance > 0) === positiveIsGood ? 'pos' : 'neg';

  return (
    <div className="account" style={{ ['--kind' as string]: KIND_COLOUR[tab.kind] }}>
      <div className="crest">
        <div className="who">
          <div className="name">{party.name}</div>
          {(party.companyName || party.note) && (
            <div className="company">{party.companyName ?? party.note}</div>
          )}
          {party.mobile && <div className="company">{party.mobile}</div>}
        </div>

        {tab.type === 'CAR_SUPPLIER' ? (
          <span className="flag">
            <Flag country={party.country} />
          </span>
        ) : (
          <span className="avatar" style={{ background: KIND_COLOUR[tab.kind], width: 28, height: 28, borderRadius: 999, display: 'grid', placeItems: 'center', color: '#fff', fontSize: 12, fontWeight: 800 }}>
            {initialsOf(party.name)}
          </span>
        )}

        <span className="mark">{tab.mark()}</span>
      </div>

      <div className="body">
        <div>
          <div className={`balance ${tone}`}>
            {fmt(party.balance ?? 0)}
            <span className="unit">{party.currency}</span>
          </div>
          <div className="meaning">{party.balanceLabel ?? 'Nothing owed either way'}</div>
        </div>

        <div className="row" style={{ gap: 6 }}>
          {party.country && (
            <span className="badge grey" style={{ flex: '0 0 auto' }}>
              {party.country === 'CANADA' ? 'Canada' : 'USA'}
              {party.wholesaler === 'PRICE_PLUS_TAX' ? ' · invoices tax' : ''}
            </span>
          )}
          {party.workerRole && (
            <span className="badge amber" style={{ flex: '0 0 auto' }}>
              {party.workerRole === 'GARAGE' ? 'Garage' : 'Showroom'}
            </span>
          )}
        </div>
      </div>

      <div className="foot">
        <Link to={`/accounts/${party.id}`}>
          <button className="secondary small" style={{ width: '100%' }}>
            Statement
          </button>
        </Link>
        <button className="secondary small" onClick={onEdit}>
          Edit
        </button>
      </div>
    </div>
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
