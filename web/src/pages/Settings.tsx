import { useEffect, useState } from 'react';
import { PageHeader, useApp } from '../App';
import { api, fmtDate } from '../lib/api';
import { Alert, Card, Field, useSubmit } from '../components/ui';

interface AuditRow {
  id: number;
  at: string;
  action: string;
  entity: string;
  entityId: string | null;
  user: { username: string } | null;
}

export default function SettingsPage() {
  const { settings, user, refresh } = useApp();
  const [cfaCode, setCfaCode] = useState(settings.cfaCode);
  const [threshold, setThreshold] = useState(settings.taxThresholdUsd);
  const [businessName, setBusinessName] = useState(settings.businessName);
  const [cashAccountId, setCashAccountId] = useState(settings.defaultCashAccountId ?? '');
  const [cashAccounts, setCashAccounts] = useState<{ id: number; name: string }[]>([]);
  const [saved, setSaved] = useState(false);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [catalog, setCatalog] = useState<{ makes: number; models: number; complete: boolean; importedAt: string | null } | null>(null);
  const [catalogError, setCatalogError] = useState('');

  useEffect(() => {
    void api.get<AuditRow[]>('/api/audit?limit=40').then(setAudit);
    void api.get<{ id: number; name: string }[]>('/api/parties?type=TRANSFER_COMPANY').then(setCashAccounts);
    void api.get<NonNullable<typeof catalog>>('/api/vehicles/catalog-status').then(setCatalog).catch(e => setCatalogError(e.message));
  }, []);

  const { busy, error, run } = useSubmit(async () => {
    await api.patch('/api/settings', {
      cfaCode,
      taxThresholdUsd: Number(threshold),
      businessName,
      defaultCashAccountId: cashAccountId === '' ? '' : Number(cashAccountId),
    });
    await refresh();
    setSaved(true);
    return true;
  });

  return (
    <>
      <PageHeader title="Settings" sub={`Signed in as ${user.username}`} />

      <div className="grid cols-2">
        <div>
          <Card title="System">
            <Alert kind="error">{error}</Alert>
            {saved && <Alert kind="success">Saved.</Alert>}

            <Field label="Business name">
              <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
            </Field>

            <Field label="Local currency" help="XOF is West Africa, XAF is Central Africa.">
              <select value={cfaCode} onChange={(e) => setCfaCode(e.target.value)}>
                <option value="XOF">XOF — West African CFA franc</option>
                <option value="XAF">XAF — Central African CFA franc</option>
              </select>
            </Field>

            <Field
              label="Canada tax limit (USD)"
              help="Tax up to this amount stays in the car's cost. Anything above it is refundable to you. Changing this only affects cars bought from now on."
            >
              <input type="number" value={threshold} onChange={(e) => setThreshold(e.target.value)} />
            </Field>

            <Field
              label="Where does money from a car sale go?"
              help="When you record a customer's payment it lands in this account straight away, so you never enter it twice. Moving it onwards is a transfer, not a new deposit."
            >
              <select value={cashAccountId} onChange={(e) => setCashAccountId(e.target.value)}>
                <option value="">Not chosen — sales will be refused</option>
                {cashAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </Field>

            <button onClick={() => void run()} disabled={busy}>
              {busy ? 'Saving…' : 'Save settings'}
            </button>
          </Card>

          <TwoFactor />
          <ChangePassword />
          <Card title="Vehicle catalog">
            <Alert kind="error">{catalogError}</Alert>
            {catalog && <>
              <p>{catalog.makes} makes · {catalog.models} models saved</p>
              <p className="small muted">Brand and model searches use your saved catalog. Only VIN decoding needs the external service. Missing models can still be entered manually.</p>
              <p className="small muted">{catalog.complete ? 'Catalog imported' : 'Full catalog import not completed'}{catalog.importedAt ? ` · ${fmtDate(catalog.importedAt)}` : ''}</p>
            </>}
          </Card>
        </div>

        <div>
          <Card title="Recent activity">
            <p className="small muted" style={{ marginTop: 0 }}>
              Every change is recorded with who made it and when.
            </p>
            <div className="table-wrap">
              <table>
                <tbody>
                  {audit.map((row) => (
                    <tr key={row.id}>
                      <td className="small">{fmtDate(row.at)}</td>
                      <td className="small">
                        {row.action.toLowerCase().replace(/_/g, ' ')} {row.entity}
                        {row.entityId ? ` #${row.entityId}` : ''}
                      </td>
                      <td className="small muted">{row.user?.username ?? 'system'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

function TwoFactor() {
  const { user, refresh } = useApp();
  const [setup, setSetup] = useState<{ qrDataUrl: string; secret: string } | null>(null);
  const [token, setToken] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);

  const { busy, error, run } = useSubmit(async () => {
    const result = await api.post<{ recoveryCodes: string[] }>('/api/auth/2fa/enable', { token });
    setCodes(result.recoveryCodes);
    setSetup(null);
    await refresh();
    return result;
  });

  if (user.totpEnabled && !codes) {
    return (
      <Card title="Two-factor authentication">
        <Alert kind="success">
          Switched on. Signing in needs your password and the 6-digit code from your phone.
        </Alert>
        <button
          className="secondary"
          onClick={async () => {
            const password = prompt('Enter your password to switch two-factor off');
            if (!password) return;
            try {
              await api.post('/api/auth/2fa/disable', { password });
              await refresh();
            } catch (e) {
              alert(e instanceof Error ? e.message : 'Could not switch it off');
            }
          }}
        >
          Switch off
        </button>
      </Card>
    );
  }

  if (codes) {
    return (
      <Card title="Save these recovery codes now">
        <Alert kind="warn">
          Write these down and keep them somewhere safe. Each one gets you in once if you lose your
          phone. They will not be shown again.
        </Alert>
        <pre style={{ background: '#f8fafc', padding: 12, borderRadius: 6, fontSize: 14 }}>
          {codes.join('\n')}
        </pre>
        <button onClick={() => setCodes(null)}>I have saved them</button>
      </Card>
    );
  }

  return (
    <Card title="Two-factor authentication">
      <Alert kind="warn">
        Not switched on. With this system reachable from the internet, a password alone is thin
        protection for your supplier balances — switch this on.
      </Alert>

      {!setup ? (
        <button
          onClick={async () => {
            setSetup(await api.post<{ qrDataUrl: string; secret: string }>('/api/auth/2fa/setup'));
          }}
        >
          Set up two-factor
        </button>
      ) : (
        <>
          <p className="small">
            Scan this with Google Authenticator or Authy, then type the 6-digit code it shows to
            confirm it works.
          </p>
          <img src={setup.qrDataUrl} alt="QR code" style={{ width: 180, height: 180 }} />
          <p className="small muted">
            Can't scan? Enter this key by hand: <code>{setup.secret}</code>
          </p>

          <Alert kind="error">{error}</Alert>

          <Field label="Code from the app">
            <input value={token} onChange={(e) => setToken(e.target.value)} placeholder="123456" inputMode="numeric" />
          </Field>
          <button onClick={() => void run()} disabled={busy || token.length < 6}>
            {busy ? 'Checking…' : 'Confirm and switch on'}
          </button>
        </>
      )}
    </Card>
  );
}

function ChangePassword() {
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');
  const [done, setDone] = useState(false);

  const { busy, error, run } = useSubmit(async () => {
    await api.post('/api/auth/password', { currentPassword, newPassword });
    setDone(true);
    setCurrent('');
    setNew('');
    return true;
  });

  return (
    <Card title="Change password">
      <Alert kind="error">{error}</Alert>
      {done && <Alert kind="success">Changed. Every other device has been signed out.</Alert>}

      <Field label="Current password">
        <input type="password" value={currentPassword} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
      </Field>
      <Field
        label="New password"
        help="At least 12 characters, with upper and lower case, a number and a symbol."
      >
        <input type="password" value={newPassword} onChange={(e) => setNew(e.target.value)} autoComplete="new-password" />
      </Field>
      <button onClick={() => void run()} disabled={busy || !currentPassword || !newPassword}>
        {busy ? 'Saving…' : 'Change password'}
      </button>
    </Card>
  );
}
