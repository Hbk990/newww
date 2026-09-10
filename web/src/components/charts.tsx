import { useState, type ReactNode } from 'react';
import { fmt } from '../lib/api';

/**
 * Charts, drawn as plain SVG.
 *
 * The palette is the validated categorical set — blue, orange, aqua — assigned
 * in fixed order and never cycled. Aqua sits under 3:1 against this surface, so
 * every chart here ships visible labels and a table beside it; identity never
 * rests on colour alone.
 *
 * Marks follow one spec throughout: bars capped at 24px with a 4px rounded
 * data-end and a square baseline, 2px lines, 8px markers ringed in the surface
 * colour, hairline recessive gridlines, and a 2px gap of surface between
 * touching marks.
 */

/*
 * The colours come from the stylesheet rather than from here, so the charts
 * follow the day/night switch without being redrawn. Each theme defines its own
 * steps: the dark ones were checked for colour-blind separation against the
 * dark surface, not dimmed from the light ones.
 */
export const SERIES = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)'] as const;
export const STATUS = {
  good: 'var(--chart-good)',
  warning: 'var(--warning)',
  critical: 'var(--chart-bad)',
} as const;

const SURFACE = 'var(--chart-surface)';
const GRID = 'var(--chart-grid)';
const TEXT_MUTED = 'var(--muted)';
const TEXT = 'var(--text)';

/** Round axis ticks to numbers a person would say out loud. */
function niceTicks(max: number, count = 4, wholeNumbers = false): number[] {
  if (max <= 0) return [0];
  const rough = max / count;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  let step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rough) ?? magnitude * 10;
  // Counting cars, a tick of 0.5 is meaningless and prints as a repeated 1.
  if (wholeNumbers) step = Math.max(1, Math.round(step));
  const ticks: number[] = [];
  for (let value = 0; value <= max + step / 2; value += step) ticks.push(value);
  return ticks;
}

/** Compact axis labels: 7,500,000 reads as 7.5M. */
export function short(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}k`;
  return String(Math.round(value));
}

interface Tip {
  x: number;
  y: number;
  lines: string[];
}

function Tooltip({ tip, width }: { tip: Tip; width: number }) {
  const boxWidth = Math.max(...tip.lines.map((l) => l.length)) * 6.6 + 20;
  const left = Math.min(Math.max(tip.x - boxWidth / 2, 4), width - boxWidth - 4);
  return (
    <foreignObject x={left} y={Math.max(tip.y - 12 - tip.lines.length * 17, 2)} width={boxWidth} height={tip.lines.length * 17 + 12}>
      <div
        style={{
          background: 'var(--surface-3)',
          color: 'var(--text)',
          border: '1px solid var(--border-strong)',
          boxShadow: 'var(--shadow-lift)',
          borderRadius: 6,
          padding: '5px 8px',
          fontSize: 12,
          lineHeight: '15px',
          whiteSpace: 'nowrap',
        }}
      >
        {tip.lines.map((line, i) => (
          <div key={i} style={{ fontWeight: i === 0 ? 600 : 400 }}>{line}</div>
        ))}
      </div>
    </foreignObject>
  );
}

export function ChartFrame({
  title,
  subtitle,
  children,
  legend,
  footer,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  legend?: { label: string; color: string }[];
  footer?: ReactNode;
}) {
  return (
    <div className="card">
      <h2>{title}</h2>
      {subtitle && <div className="small muted" style={{ marginBottom: 8 }}>{subtitle}</div>}
      {legend && legend.length > 1 && (
        <div className="row" style={{ gap: 14, marginBottom: 6 }}>
          {legend.map((item) => (
            <span key={item.label} className="small" style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: item.color, display: 'inline-block' }} />
              {item.label}
            </span>
          ))}
        </div>
      )}
      {children}
      {footer}
    </div>
  );
}

/**
 * Columns over time. One series, so no legend — the title says what it is.
 * The latest column is labelled; the axis carries the rest.
 */
export function ColumnChart({
  data,
  height = 190,
  currency,
  colorFor,
  wholeNumbers,
  width = 660,
}: {
  data: { label: string; value: number; tooltip?: string[] }[];
  height?: number;
  /** The drawing's own width. It scales down to fit; it never stretches. */
  width?: number;
  currency?: string;
  colorFor?: (value: number) => string;
  /** For counts of things, where half a unit means nothing. */
  wholeNumbers?: boolean;
}) {
  const [tip, setTip] = useState<Tip | null>(null);
  const padding = { top: 16, right: 12, bottom: 26, left: 52 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;

  const values = data.map((d) => d.value);
  const max = Math.max(0, ...values);
  const min = Math.min(0, ...values);
  const span = max - min || 1;
  const ticks = niceTicks(max, 4, wholeNumbers);
  const yOf = (value: number) => padding.top + plotH - ((value - min) / span) * plotH;
  const zeroY = yOf(0);

  const band = plotW / Math.max(data.length, 1);
  const barWidth = Math.min(24, band - 8); // capped; the leftover is air

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        style={{ maxWidth: width, minWidth: Math.min(width, 460), display: 'block' }}
      >
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={padding.left} x2={width - padding.right} y1={yOf(tick)} y2={yOf(tick)} stroke={GRID} strokeWidth={1} />
            <text x={padding.left - 8} y={yOf(tick) + 4} textAnchor="end" fontSize={11} fill={TEXT_MUTED}>
              {short(tick)}
            </text>
          </g>
        ))}
        {min < 0 && <line x1={padding.left} x2={width - padding.right} y1={zeroY} y2={zeroY} stroke={TEXT_MUTED} strokeWidth={1} />}

        {data.map((point, index) => {
          const x = padding.left + band * index + (band - barWidth) / 2;
          const top = point.value >= 0 ? yOf(point.value) : zeroY;
          const barHeight = Math.max(Math.abs(yOf(point.value) - zeroY), point.value === 0 ? 0 : 2);
          const fill = colorFor ? colorFor(point.value) : SERIES[0];
          const isLast = index === data.length - 1;
          return (
            <g key={point.label}>
              {/* 4px rounded data-end, square at the baseline */}
              <path
                d={
                  point.value >= 0
                    ? `M${x},${top + barHeight} L${x},${top + 4} Q${x},${top} ${x + 4},${top} L${x + barWidth - 4},${top} Q${x + barWidth},${top} ${x + barWidth},${top + 4} L${x + barWidth},${top + barHeight} Z`
                    : `M${x},${top} L${x},${top + barHeight - 4} Q${x},${top + barHeight} ${x + 4},${top + barHeight} L${x + barWidth - 4},${top + barHeight} Q${x + barWidth},${top + barHeight} ${x + barWidth},${top + barHeight - 4} L${x + barWidth},${top} Z`
                }
                fill={fill}
              />
              {isLast && point.value !== 0 && (
                <text
                  x={x + barWidth / 2}
                  y={point.value >= 0 ? top - 5 : top + barHeight + 13}
                  textAnchor="middle"
                  fontSize={11}
                  fontWeight={600}
                  fill={TEXT}
                >
                  {short(point.value)}
                </text>
              )}
              <rect
                x={padding.left + band * index}
                y={padding.top}
                width={band}
                height={plotH}
                fill="transparent"
                onMouseEnter={() =>
                  setTip({
                    x: padding.left + band * index + band / 2,
                    y: Math.min(top, zeroY),
                    lines: point.tooltip ?? [point.label, `${fmt(point.value)}${currency ? ` ${currency}` : ''}`],
                  })
                }
                onMouseLeave={() => setTip(null)}
              />
              <text x={padding.left + band * index + band / 2} y={height - 8} textAnchor="middle" fontSize={11} fill={TEXT_MUTED}>
                {point.label}
              </text>
            </g>
          );
        })}
        {tip && <Tooltip tip={tip} width={width} />}
      </svg>
    </div>
  );
}

/** Bars across, for comparing named things. Every bar carries its value. */
export function BarRows({
  data,
  currency,
  height = 26,
}: {
  data: { label: string; value: number; hint?: string; color?: string }[];
  currency?: string;
  height?: number;
}) {
  if (data.length === 0) return <p className="muted small">Nothing to show yet.</p>;
  const max = Math.max(...data.map((d) => Math.abs(d.value)), 1);

  return (
    <div>
      {data.map((row) => {
        const width = (Math.abs(row.value) / max) * 100;
        const color = row.color ?? (row.value < 0 ? STATUS.critical : SERIES[0]);
        return (
          <div key={row.label} style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 2 }}>
              <span>
                {row.label}
                {row.hint && <span className="muted small"> · {row.hint}</span>}
              </span>
              <span className="strong" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {fmt(row.value)}{currency ? ` ${currency}` : ''}
              </span>
            </div>
            <div style={{ background: GRID, borderRadius: 4, height: height / 3 }}>
              <div
                style={{
                  width: `${Math.max(width, 1)}%`,
                  height: '100%',
                  background: color,
                  borderRadius: '0 4px 4px 0',
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * A line over time — for the rates you have actually paid. 2px line, 8px
 * markers ringed in the surface colour so they stay readable where they cross,
 * and the last value labelled.
 */
export function LineChart({
  data,
  height = 200,
  suffix = '',
}: {
  data: { label: string; value: number; tooltip?: string[] }[];
  height?: number;
  suffix?: string;
}) {
  const [tip, setTip] = useState<Tip | null>(null);
  const width = 660;
  const padding = { top: 18, right: 46, bottom: 26, left: 52 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;

  if (data.length === 0) return <p className="muted small">No rates recorded yet.</p>;

  const values = data.map((d) => d.value);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const pad = (rawMax - rawMin) * 0.15 || Math.max(rawMax * 0.02, 1);
  const min = rawMin - pad;
  const max = rawMax + pad;

  const xOf = (i: number) => padding.left + (data.length === 1 ? plotW / 2 : (i / (data.length - 1)) * plotW);
  const yOf = (value: number) => padding.top + plotH - ((value - min) / (max - min)) * plotH;

  const path = data.map((point, i) => `${i === 0 ? 'M' : 'L'}${xOf(i)},${yOf(point.value)}`).join(' ');
  const ticks = [min, (min + max) / 2, max];
  const last = data[data.length - 1];

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        style={{ maxWidth: width, minWidth: Math.min(width, 460), display: 'block' }}
      >
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={padding.left} x2={width - padding.right} y1={yOf(tick)} y2={yOf(tick)} stroke={GRID} strokeWidth={1} />
            <text x={padding.left - 8} y={yOf(tick) + 4} textAnchor="end" fontSize={11} fill={TEXT_MUTED}>
              {Math.round(tick)}
            </text>
          </g>
        ))}

        <path d={path} fill="none" stroke={SERIES[0]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

        {data.map((point, i) => (
          <g key={i}>
            {/* 2px surface ring keeps overlapping markers readable */}
            <circle cx={xOf(i)} cy={yOf(point.value)} r={5} fill={SERIES[0]} stroke={SURFACE} strokeWidth={2} />
            <circle
              cx={xOf(i)}
              cy={yOf(point.value)}
              r={13}
              fill="transparent"
              onMouseEnter={() =>
                setTip({
                  x: xOf(i),
                  y: yOf(point.value),
                  lines: point.tooltip ?? [point.label, `${point.value}${suffix}`],
                })
              }
              onMouseLeave={() => setTip(null)}
            />
          </g>
        ))}

        <text x={xOf(data.length - 1) + 10} y={yOf(last.value) + 4} fontSize={12} fontWeight={600} fill={TEXT}>
          {last.value}
        </text>

        <text x={padding.left} y={height - 8} fontSize={11} fill={TEXT_MUTED}>{data[0].label}</text>
        {data.length > 1 && (
          <text x={width - padding.right} y={height - 8} textAnchor="end" fontSize={11} fill={TEXT_MUTED}>
            {last.label}
          </text>
        )}

        {tip && <Tooltip tip={tip} width={width} />}
      </svg>
    </div>
  );
}
