import { useEffect, useState, type ReactNode } from 'react';
import type { CarStatus } from '../lib/api';

export function Card({ title, action, children }: { title?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="card">
      {(title || action) && (
        <div className="page-header" style={{ marginBottom: 10 }}>
          {title && <h2>{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

export function Field({
  label,
  help,
  children,
}: {
  label: string;
  help?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
      {help && <div className="help">{help}</div>}
    </div>
  );
}

export function Alert({ kind = 'info', children }: { kind?: 'error' | 'success' | 'warn' | 'info'; children: ReactNode }) {
  if (!children) return null;
  return <div className={`alert ${kind}`}>{children}</div>;
}

export function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className={`modal${wide ? ' wide' : ''}`} onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function Spinner() {
  return <div className="spinner">Loading…</div>;
}

const STATUS_STYLE: Record<CarStatus, { className: string; label: string }> = {
  PURCHASED: { className: 'grey', label: 'In origin country' },
  SHIPPED: { className: 'blue', label: 'Shipped' },
  ARRIVED: { className: 'amber', label: 'Arrived — set condition' },
  IN_GARAGE: { className: 'amber', label: 'In garage' },
  SHOWROOM: { className: 'green', label: 'In showroom' },
  SOLD: { className: 'grey', label: 'Sold' },
  SOLD_IN_ORIGIN: { className: 'grey', label: 'Sold in origin' },
};

export function StatusBadge({ status }: { status: CarStatus }) {
  const style = STATUS_STYLE[status] ?? { className: 'grey', label: status };
  return <span className={`badge ${style.className}`}>{style.label}</span>;
}

/**
 * A balance is meaningless without knowing which way it points, so the label
 * ("You owe him" / "He is holding your money") always travels with the number.
 */
export function Balance({
  amount,
  currency,
  label,
  invertColour,
}: {
  amount: string | null | undefined;
  currency: string;
  label?: string;
  invertColour?: boolean;
}) {
  const value = Number(amount ?? 0);
  const positiveIsGood = invertColour ? value > 0 : value < 0;
  const className = value === 0 ? '' : positiveIsGood ? 'pos' : 'neg';
  return (
    <span>
      <span className={`strong ${className}`}>{fmtLocal(amount)} {currency}</span>
      {label && <div className="small muted">{label}</div>}
    </span>
  );
}

function fmtLocal(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  const raw = String(value);
  const negative = raw.startsWith('-');
  const [whole, decimals] = raw.replace('-', '').split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const cents = decimals && Number(decimals) !== 0 ? `.${decimals.replace(/0+$/, '')}` : '';
  return `${negative ? '−' : ''}${grouped}${cents}`;
}

/** A submit button that cannot be double-clicked into two identical payments. */
export function useSubmit<T>(action: () => Promise<T>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (busy) return undefined;
    setBusy(true);
    setError(null);
    try {
      return await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
      return undefined;
    } finally {
      setBusy(false);
    }
  };

  return { busy, error, setError, run };
}
