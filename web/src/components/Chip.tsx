import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';

/**
 * A reference to something that has a face: a supplier, a shipping company, a
 * car, a worker.
 *
 * The old screens wrote every one of these as blue underlined text. When half
 * the words on a page are blue, none of them stand out and the page reads like
 * an old website. A chip carries a coloured initial instead, so you find the
 * supplier you want by shape and colour before you have read anything, and the
 * colour stays free to mean something elsewhere.
 */

export type Kind = 'supplier' | 'shipping' | 'transfer' | 'worker' | 'parts' | 'customer' | 'car';

/** One colour per kind of thing, fixed — never per row, or nothing is learnable. */
export const KIND_COLOUR: Record<Kind, string> = {
  supplier: '#2a78d6',
  shipping: '#0f8a9e',
  transfer: '#1baf7a',
  worker: '#c2761f',
  parts: '#7a5cd6',
  customer: '#c2557a',
  car: '#455571',
};

/** Two letters that stand for a name: "Mike Johnson" is MJ, "Atlantic" is AT. */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function Chip({
  to,
  kind,
  name,
  sub,
  plain,
  icon,
}: {
  to?: string;
  kind: Kind;
  name: string;
  sub?: ReactNode;
  /** No pill around it — for use inside a cell that is already busy. */
  plain?: boolean;
  icon?: ReactNode;
}) {
  const inner = (
    <>
      <span className="avatar" aria-hidden="true">
        {icon ?? initialsOf(name)}
      </span>
      <span className="label">
        {name}
        {sub && <span className="muted"> · {sub}</span>}
      </span>
    </>
  );

  const style = { ['--kind' as string]: KIND_COLOUR[kind] };
  const className = `chip${plain ? ' plain' : ''}`;

  if (!to) return <span className={className} style={style}>{inner}</span>;
  return (
    <Link className={className} style={style} to={to}>
      {inner}
    </Link>
  );
}
