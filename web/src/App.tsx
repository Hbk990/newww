import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { BrowserRouter, NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { api, type Settings } from './lib/api';
import { useTheme } from './lib/theme';
import { Spinner } from './components/ui';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Accounts from './pages/Accounts';
import StatementPage from './pages/Statement';
import BuyCar from './pages/BuyCar';
import Cars from './pages/Cars';
import CarDetail from './pages/CarDetail';
import Shipments from './pages/Shipments';
import ShipmentDetail from './pages/ShipmentDetail';
import Garage from './pages/Garage';
import Showroom from './pages/Showroom';
import Sales from './pages/Sales';
import Receipt from './pages/Receipt';
import Money from './pages/Money';
import Expenses from './pages/Expenses';
import Reports from './pages/Reports';
import Analysis from './pages/Analysis';
import SettingsPage from './pages/Settings';

interface Session {
  user: { id: number; username: string; totpEnabled: boolean };
  settings: Settings;
}

interface AppContextValue extends Session {
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
  /** The configured local currency code (XOF or XAF). */
  cfa: string;
}

const AppContext = createContext<AppContextValue | null>(null);

export const useApp = () => {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp must be used inside the app');
  return value;
};

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      setSession(await api.get<Session>('/api/auth/me'));
    } catch {
      setSession(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  if (loading) return <Spinner />;
  if (!session) return <Login onSignedIn={(s) => setSession(s)} />;

  const context: AppContextValue = {
    ...session,
    cfa: session.settings.cfaCode,
    refresh: load,
    signOut: async () => {
      await api.post('/api/auth/logout');
      setSession(null);
    },
  };

  return (
    <AppContext.Provider value={context}>
      <BrowserRouter>
        <div className="app">
          <Sidebar businessName={session.settings.businessName} onSignOut={context.signOut} />
          <div className="main">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/accounts" element={<Accounts />} />
              <Route path="/accounts/:id" element={<StatementPage />} />
              <Route path="/buy" element={<BuyCar />} />
              <Route path="/cars" element={<Cars />} />
              <Route path="/cars/:id" element={<CarDetail />} />
              <Route path="/shipments" element={<Shipments />} />
              <Route path="/shipments/:id" element={<ShipmentDetail />} />
              <Route path="/garage" element={<Garage />} />
              <Route path="/showroom" element={<Showroom />} />
              <Route path="/sales" element={<Sales />} />
              <Route path="/sales/:id/receipt" element={<Receipt />} />
              <Route path="/money" element={<Money />} />
              <Route path="/expenses" element={<Expenses />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/analysis" element={<Analysis />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
        </div>
      </BrowserRouter>
    </AppContext.Provider>
  );
}

function Sidebar({ businessName, onSignOut }: { businessName: string; onSignOut: () => void }) {
  const item = (to: string, label: string) => (
    <NavLink to={to} end={to === '/'}>
      {label}
    </NavLink>
  );

  return (
    <nav className="sidebar">
      <div className="brand">{businessName}</div>

      {item('/', 'Dashboard')}

      <div className="group">Buying</div>
      {item('/buy', 'Buy a car')}
      {item('/cars', 'All cars')}
      {item('/shipments', 'Shipments')}

      <div className="group">Preparing</div>
      {item('/garage', 'Garage')}
      {item('/showroom', 'Showroom')}
      {item('/sales', 'Sales')}

      <div className="group">Money</div>
      {item('/accounts', 'Accounts')}
      {item('/money', 'Payments')}
      {item('/expenses', 'Expenses')}
      {item('/reports', 'Reports')}
      {item('/analysis', 'Analysis')}

      <div className="group">System</div>
      {item('/settings', 'Settings')}
      <a href="#" onClick={(e) => { e.preventDefault(); void onSignOut(); }}>
        Sign out
      </a>

      <ThemeSwitch />
    </nav>
  );
}

/** Day or evening. Nothing else changes — same screens, same numbers. */
function ThemeSwitch() {
  const { theme, setTheme } = useTheme();
  return (
    <div className="theme-toggle">
      <button
        type="button"
        className={theme === 'light' ? 'on' : ''}
        onClick={() => setTheme('light')}
      >
        Day
      </button>
      <button
        type="button"
        className={theme === 'dark' ? 'on' : ''}
        onClick={() => setTheme('dark')}
      >
        Night
      </button>
    </div>
  );
}

export function PageHeader({ title, sub, action }: { title: string; sub?: ReactNode; action?: ReactNode }) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {sub && <div className="sub">{sub}</div>}
      </div>
      {action}
    </div>
  );
}
