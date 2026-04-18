// ─────────────────────────────────────────────────────────────
// ProgressBar.tsx
//
// Small reusable progress bar component, primarily used as an
// AG Grid cell renderer but equally usable as a standalone React
// component (e.g. inside the OrderDetailPanel header).
//
// Color rules (per spec):
//   0  ≤ p <  30  → red
//   30 ≤ p <  70  → orange
//   70 ≤ p < 100  → green
//   p  ===   100  → dark green
//
// Shows a centered percentage label over the fill. Design tokens
// are imported from ../styles/theme — if the token is missing the
// component gracefully falls back to literal hex values.
// ─────────────────────────────────────────────────────────────
import React from 'react';
import { theme } from '../styles/theme';

export interface ProgressBarProps {
  /** Progress value 0-100. Values outside the range are clamped. */
  value: number | string | null | undefined;
  /** Optional height override (default 18px). */
  height?: number;
  /** Hide the "NN%" label when true. */
  hideLabel?: boolean;
  /** Optional extra class. */
  className?: string;
}

/**
 * Resolve a color for the given progress value. Uses theme tokens
 * when available and falls back to the literal hex palette from
 * the spec when a token is undefined.
 */
function colorFor(p: number): string {
  const t = (theme as any)?.colors ?? {};
  if (p >= 100) return t.successDark ?? '#1F7A3A';
  if (p >= 70) return t.success ?? '#2FA84F';
  if (p >= 30) return t.warning ?? '#FFB366';
  return t.danger ?? '#FC8585';
}

/** Clamp a possibly-null numeric-ish value into [0,100]. */
function clamp(value: number | string | null | undefined): number {
  const n =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
      ? parseFloat(value)
      : 0;
  if (Number.isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > 100) return 100;
  return Math.round(n);
}

/**
 * AG Grid calls cell renderers with a `value`-bearing params object.
 * We accept either direct props or the AG Grid params object so this
 * component can serve both callers without a wrapper.
 */
export interface AGGridLikeParams {
  value: unknown;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  value,
  height = 18,
  hideLabel = false,
  className,
}) => {
  const pct = clamp(value as any);
  const fill = colorFor(pct);
  const bg =
    ((theme as any)?.colors?.surfaceAlt as string) ?? 'rgba(0,0,0,0.08)';

  return (
    <div
      className={className}
      style={{
        position: 'relative',
        width: '100%',
        height,
        background: bg,
        borderRadius: height / 2,
        overflow: 'hidden',
        boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.05)',
      }}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: `${pct}%`,
          background: fill,
          transition: 'width 320ms ease',
        }}
      />
      {!hideLabel && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: Math.max(10, height - 8),
            fontWeight: 600,
            color: pct > 50 ? '#fff' : '#222',
            lineHeight: 1,
            pointerEvents: 'none',
          }}
        >
          {pct}%
        </div>
      )}
    </div>
  );
};

/**
 * AG Grid cell-renderer wrapper. Usage:
 *   { field: 'progress', cellRenderer: ProgressBarCellRenderer }
 */
export const ProgressBarCellRenderer: React.FC<AGGridLikeParams> = (params) => (
  <ProgressBar value={params.value as number | string | null} />
);

export default ProgressBar;
