import React, { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
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

/**
 * A message at the top of a page.
 *
 * Two things it must be able to do, learned from a screen with four of them
 * stacked up: get out of the way when you have read it, and — when it is
 * telling you money is being lost — take you to the thing that fixes it. A
 * warning you cannot act on and cannot close is just noise you learn to skip.
 */
export function Alert({
  kind = 'info',
  children,
  onDismiss,
  onAct,
  actLabel,
}: {
  kind?: 'error' | 'success' | 'warn' | 'info';
  children: ReactNode;
  /** Shows an × that removes it. */
  onDismiss?: () => void;
  /** Makes the whole message clickable — for the ones worth acting on now. */
  onAct?: () => void;
  actLabel?: string;
}) {
  if (!children) return null;
  return (
    <div className={`alert ${kind}${onAct ? ' actionable' : ''}`}>
      <div
        className="alert-body"
        {...(onAct
          ? {
              role: 'button',
              tabIndex: 0,
              onClick: onAct,
              onKeyDown: (event: React.KeyboardEvent) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onAct();
                }
              },
            }
          : {})}
      >
        {children}
        {onAct && <span className="alert-act">{actLabel ?? 'Fix it'} →</span>}
      </div>
      {onDismiss && (
        <button type="button" className="alert-x" onClick={onDismiss} aria-label="Dismiss">
          ×
        </button>
      )}
    </div>
  );
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

  // Rendered at the top of the page rather than where it was opened from.
  // A dialog opened from a table cell used to sit inside that cell in the DOM,
  // so it inherited the cell's styling — text in a dialog opened from a numbers
  // column ran off the side instead of wrapping, because those cells are set
  // not to wrap. A portal also keeps it clear of any parent that clips or
  // scrolls its contents.
  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className={`modal${wide ? ' wide' : ''}`} onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>,
    document.body,
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

/**
 * One number, given room. The label always says which currency and which
 * direction, because a bare number on a screen is how people misread money.
 */
export function Stat({
  label,
  value,
  hint,
  negative,
  tone,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  negative?: boolean;
  tone?: 'good' | 'bad';
}) {
  const className = negative || tone === 'bad' ? ' neg' : tone === 'good' ? ' pos' : '';
  return (
    <div className="stat">
      <div className="label">{label}</div>
      <div className={`value${className}`}>{value}</div>
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

/**
 * A short message that slides in and leaves by itself.
 *
 * In the showroom you are doing one thing after another — price, sell, hold —
 * and a banner at the top of a long page confirms a sale you can no longer see.
 * A toast appears where you are looking and gets out of the way.
 */
export interface Toast {
  id: number;
  text: string;
  bad?: boolean;
}

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = (text: string, bad?: boolean) => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { id, text, bad }]);
    setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 5000);
  };

  return { toasts, push };
}

export function Toasts({ toasts }: { toasts: Toast[] }) {
  if (toasts.length === 0) return null;
  return createPortal(
    <div className="toast-wrap">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast${toast.bad ? ' bad' : ''}`}>
          {toast.text}
        </div>
      ))}
    </div>,
    document.body,
  );
}

/**
 * A number that counts up to its value when it first appears.
 *
 * Only on the dashboard's headline figures: it draws the eye to what changed
 * since yesterday. Anywhere a number has to be read carefully — a statement, a
 * price, a ledger — it is printed plainly and never moves.
 */
export function CountUp({ value, format }: { value: number; format: (value: number) => string }) {
  const [shown, setShown] = useState(value);

  useEffect(() => {
    if (!Number.isFinite(value)) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShown(value);
      return;
    }
    const from = 0;
    const start = performance.now();
    const duration = 620;
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      // Fast at first, easing into the real figure.
      const eased = 1 - (1 - progress) ** 3;
      setShown(from + (value - from) * eased);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return <>{format(shown)}</>;
}
