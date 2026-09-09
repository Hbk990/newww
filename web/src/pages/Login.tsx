import { useState } from 'react';
import { api, type Settings } from '../lib/api';
import { Alert, Field, useSubmit } from '../components/ui';

interface Session {
  user: { id: number; username: string; totpEnabled: boolean };
  settings: Settings;
}

export default function Login({ onSignedIn }: { onSignedIn: (session: Session) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [needsCode, setNeedsCode] = useState(false);

  const { busy, error, setError, run } = useSubmit(async () => {
    const session = await api.post<Session>('/api/auth/login', {
      username,
      password,
      token: token || undefined,
    });
    onSignedIn(session);
    return session;
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const result = await run();
    // The server asks for the 6-digit code only once the password is right.
    if (!result) setNeedsCode((current) => current || Boolean(password));
  };

  return (
    <div className="login-page">
      <form className="login-box" onSubmit={submit}>
        <h1>Sign in</h1>
        <p className="muted small" style={{ marginTop: 0 }}>
          This system holds your supplier balances and your cash position. Never share this login.
        </p>

        <Alert kind="error">{error}</Alert>

        <Field label="Username">
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus autoComplete="username" />
        </Field>

        <Field label="Password">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </Field>

        {(needsCode || token) && (
          <Field label="Code from your authenticator app" help="Or one of your recovery codes if you lost the phone.">
            <input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
            />
          </Field>
        )}

        <button type="submit" disabled={busy || !username || !password} style={{ width: '100%', marginTop: 6 }}>
          {busy ? 'Checking…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
