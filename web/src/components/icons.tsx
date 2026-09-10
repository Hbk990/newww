/**
 * Small drawings, all inline.
 *
 * They are SVG rather than an icon font or emoji for one practical reason:
 * Windows does not draw flag emoji — a Canadian supplier would read as the
 * letters "CA" — and nothing here should depend on a font a machine may not
 * have. Every shape below inherits the colour around it unless it is a flag,
 * where the colours are the point.
 */

export function FlagUsa({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size * 0.66} viewBox="0 0 30 20" role="img" aria-label="United States">
      <rect width="30" height="20" rx="2" fill="#f4f6f9" />
      {[0, 2, 4, 6, 8].map((n) => (
        <rect key={n} y={n * 2.4 + 0.4} width="30" height="1.5" fill="#c8102e" />
      ))}
      <rect width="13" height="11" rx="1.5" fill="#0a3161" />
      {[2.5, 6.5, 10.5].map((y) =>
        [2, 5, 8, 11].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="0.7" fill="#fff" />),
      )}
    </svg>
  );
}

export function FlagCanada({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size * 0.66} viewBox="0 0 30 20" role="img" aria-label="Canada">
      <rect width="30" height="20" rx="2" fill="#f4f6f9" />
      <rect width="7.5" height="20" fill="#d52b1e" />
      <rect x="22.5" width="7.5" height="20" fill="#d52b1e" />
      {/* A maple leaf, simplified to what reads at 22 pixels. */}
      <path
        fill="#d52b1e"
        d="M15 4.2l1.1 2.4 2.3-.7-.8 2.4 2.6.2-2 1.6 2.4 1.5-2.7.6.5 2.3-2.5-1-.9 2.7-.9-2.7-2.5 1 .5-2.3-2.7-.6 2.4-1.5-2-1.6 2.6-.2-.8-2.4 2.3.7z"
      />
    </svg>
  );
}

export function Flag({ country }: { country: string | null | undefined }) {
  if (country === 'USA') return <FlagUsa />;
  if (country === 'CANADA') return <FlagCanada />;
  return null;
}

/** A container ship, for the companies that move the cars. */
export function ShipMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M3 21h26l-3 6H6l-3-6Z" fill="currentColor" opacity="0.9" />
      <rect x="8" y="14" width="6" height="5" rx="0.6" fill="currentColor" opacity="0.55" />
      <rect x="15" y="11" width="6" height="8" rx="0.6" fill="currentColor" opacity="0.75" />
      <rect x="22" y="15" width="4" height="4" rx="0.6" fill="currentColor" opacity="0.45" />
      <path d="M22 6h5v5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity="0.6" />
    </svg>
  );
}

/** A spanner, for the garage. */
export function ToolMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path
        d="M21.5 5.5a6.5 6.5 0 0 0-8.4 8.4L5 22l4.9 4.9 8.1-8.1a6.5 6.5 0 0 0 8.4-8.4l-3.6 3.6-3.4-.6-.6-3.4 3.7-3.5Z"
        fill="currentColor"
        opacity="0.85"
      />
    </svg>
  );
}

/** A wallet, for the money that passes through transfer companies. */
export function WalletMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect x="4" y="8" width="24" height="17" rx="3" fill="currentColor" opacity="0.85" />
      <rect x="18" y="14" width="12" height="6" rx="2" fill="currentColor" />
      <circle cx="23" cy="17" r="1.4" fill="var(--surface)" />
    </svg>
  );
}

/** A cog, for the parts shops. */
export function PartMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path
        d="M16 4l2 3.2 3.7-.7.6 3.7 3.4 1.6-1.9 3.2 1.9 3.2-3.4 1.6-.6 3.7-3.7-.7L16 26l-2-3.2-3.7.7-.6-3.7-3.4-1.6 1.9-3.2-1.9-3.2 3.4-1.6.6-3.7 3.7.7L16 4Z"
        fill="currentColor"
        opacity="0.85"
      />
      <circle cx="16" cy="15" r="3.4" fill="var(--surface)" />
    </svg>
  );
}

/** A person, for buyers who pay over time. */
export function PersonMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <circle cx="16" cy="11" r="5.5" fill="currentColor" opacity="0.85" />
      <path d="M5 28c0-6.1 4.9-9.5 11-9.5S27 21.9 27 28H5Z" fill="currentColor" opacity="0.7" />
    </svg>
  );
}

/** A car, seen from the side. */
export function CarMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path
        d="M5 20l1.8-5.4A3 3 0 0 1 9.6 12h12.8a3 3 0 0 1 2.8 2l2 6H5Z"
        fill="currentColor"
        opacity="0.85"
      />
      <rect x="4" y="19" width="24" height="4" rx="1.6" fill="currentColor" opacity="0.55" />
      <circle cx="10" cy="23.5" r="2.6" fill="currentColor" />
      <circle cx="22" cy="23.5" r="2.6" fill="currentColor" />
    </svg>
  );
}
