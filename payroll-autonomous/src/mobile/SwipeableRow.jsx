/**
 * SwipeableRow — Agent X-20 / Swarm 3 / Techno-Kol Uzi mega-ERP 2026
 * Touch/mouse swipe-to-action row.
 *
 * Zero deps. Inline styles. Real JSX.
 *
 * Behavior:
 *   - Left swipe  (user drags toward the left)  → DELETE action (red)
 *   - Right swipe (user drags toward the right) → EDIT action (blue)
 *   - Threshold: 80px before commit
 *   - Spring-back animation on release below threshold
 *   - Confirm dialog for destructive (delete) action
 *   - RTL-safe: mirrors direction when dir="rtl"
 *   - Works with mouse AND touch events
 *
 * Props:
 *   children            : React node — row content
 *   onDelete            : () => void — commit handler for delete
 *   onEdit              : () => void — commit handler for edit
 *   threshold           : number (default 80)
 *   confirmDelete       : boolean (default true) — shows window.confirm dialog
 *   confirmMessage      : string Hebrew confirm text
 *   rtl                 : boolean (default true)
 *   disabled            : boolean (default false)
 *   theme               : object — color overrides
 *   testMode            : boolean — disables animation for deterministic tests
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';

/* ------------------------------------------------------------------ */
/*  Theme                                                              */
/* ------------------------------------------------------------------ */

export const SWIPE_THEME = Object.freeze({
  bg: '#13171c',
  bgHover: '#1a2028',
  border: '#2a3340',
  text: '#e6edf3',
  deleteBg: '#da3633',
  deleteText: '#ffffff',
  editBg: '#4a9eff',
  editText: '#ffffff',
});

export const SWIPE_LABELS = Object.freeze({
  delete: 'מחק',
  edit: 'ערוך',
  confirm: 'האם אתה בטוח שברצונך למחוק פריט זה?',
});

/* ------------------------------------------------------------------ */
/*  Pure logic (exported for tests)                                    */
/* ------------------------------------------------------------------ */

/**
 * Given a raw dx (positive = right in LTR) plus the rtl flag and
 * threshold, returns the intended action or null.
 *
 * Semantics (both rtl and ltr):
 *   - "left swipe" (dx < -threshold) → delete
 *   - "right swipe" (dx > +threshold) → edit
 *
 * The "left/right" in the product spec refers to visual screen direction,
 * not to logical start/end. In RTL layouts the row itself is mirrored but
 * the raw pixel dx is still LTR, so this function is direction-agnostic.
 */
export function computeSwipeAction(dx, threshold = 80) {
  const t = Math.abs(Number(threshold) || 80);
  const v = Number(dx) || 0;
  if (v <= -t) return 'delete';
  if (v >= t) return 'edit';
  return null;
}

/**
 * Clamps the drag offset so the row can't be yanked off-screen.
 * Allows a tiny overshoot past the threshold for visual feedback.
 */
export function clampOffset(dx, threshold = 80) {
  const t = Math.abs(Number(threshold) || 80);
  const max = t * 2.2;
  const v = Number(dx) || 0;
  if (v > max) return max;
  if (v < -max) return -max;
  return v;
}

/**
 * Decides the action colour background for a given dx.
 * Returns { bg, label, side } or null below a small reveal threshold.
 */
export function describeSwipeReveal(dx, theme = SWIPE_THEME, labels = SWIPE_LABELS) {
  const v = Number(dx) || 0;
  if (v > 4) {
    return { bg: theme.editBg, label: labels.edit, side: 'right', kind: 'edit' };
  }
  if (v < -4) {
    return { bg: theme.deleteBg, label: labels.delete, side: 'left', kind: 'delete' };
  }
  return null;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function SwipeableRow({
  children,
  onDelete,
  onEdit,
  threshold = 80,
  confirmDelete = true,
  confirmMessage = SWIPE_LABELS.confirm,
  rtl = true,
  disabled = false,
  theme = SWIPE_THEME,
  labels = SWIPE_LABELS,
  testMode = false,
  ariaLabel,
}) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startXRef = useRef(0);
  const startedRef = useRef(false);
  const pointerIdRef = useRef(null);
  const rowRef = useRef(null);

  /* ---------- commit helpers ---------- */

  const commitDelete = useCallback(() => {
    if (typeof onDelete !== 'function') return;
    if (confirmDelete && typeof window !== 'undefined' && typeof window.confirm === 'function') {
      const ok = window.confirm(confirmMessage);
      if (!ok) {
        setDx(0);
        return;
      }
    }
    onDelete();
    setDx(0);
  }, [confirmDelete, confirmMessage, onDelete]);

  const commitEdit = useCallback(() => {
    if (typeof onEdit === 'function') onEdit();
    setDx(0);
  }, [onEdit]);

  /* ---------- pointer handlers ---------- */

  const onPointerDown = useCallback(
    (e) => {
      if (disabled) return;
      startedRef.current = true;
      startXRef.current = e.clientX ?? 0;
      pointerIdRef.current = e.pointerId ?? null;
      setDragging(true);
      if (rowRef.current && typeof rowRef.current.setPointerCapture === 'function' && e.pointerId != null) {
        try {
          rowRef.current.setPointerCapture(e.pointerId);
        } catch (_err) {
          /* ignore */
        }
      }
    },
    [disabled]
  );

  const onPointerMove = useCallback(
    (e) => {
      if (!startedRef.current || disabled) return;
      const rawDx = (e.clientX ?? 0) - startXRef.current;
      setDx(clampOffset(rawDx, threshold));
    },
    [disabled, threshold]
  );

  const onPointerEnd = useCallback(() => {
    if (!startedRef.current) return;
    startedRef.current = false;
    setDragging(false);
    const action = computeSwipeAction(dx, threshold);
    if (action === 'delete') {
      commitDelete();
    } else if (action === 'edit') {
      commitEdit();
    } else {
      // Spring back
      setDx(0);
    }
  }, [dx, threshold, commitDelete, commitEdit]);

  /* ---------- touch fallback (older iOS Safari w/o pointer) ---------- */

  const onTouchStart = useCallback(
    (e) => {
      if (disabled) return;
      const touch = e.touches && e.touches[0];
      if (!touch) return;
      startedRef.current = true;
      startXRef.current = touch.clientX;
      setDragging(true);
    },
    [disabled]
  );

  const onTouchMove = useCallback(
    (e) => {
      if (!startedRef.current || disabled) return;
      const touch = e.touches && e.touches[0];
      if (!touch) return;
      const rawDx = touch.clientX - startXRef.current;
      setDx(clampOffset(rawDx, threshold));
    },
    [disabled, threshold]
  );

  /* ---------- keyboard fallback for accessibility ---------- */

  const onKeyDown = useCallback(
    (e) => {
      if (disabled) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        commitDelete();
      } else if (e.key === 'Enter' || e.key === 'F2') {
        e.preventDefault();
        commitEdit();
      }
    },
    [disabled, commitDelete, commitEdit]
  );

  /* ---------- cancel drag if component unmounts mid-drag ---------- */

  useEffect(() => {
    return () => {
      startedRef.current = false;
    };
  }, []);

  /* ---------- render ---------- */

  const reveal = describeSwipeReveal(dx, theme, labels);

  const wrapStyle = {
    position: 'relative',
    direction: rtl ? 'rtl' : 'ltr',
    background: theme.bg,
    border: `1px solid ${theme.border}`,
    borderRadius: 8,
    overflow: 'hidden',
    userSelect: dragging ? 'none' : 'auto',
    touchAction: 'pan-y',
    marginBottom: 6,
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", "Heebo", "Rubik", Arial, sans-serif',
  };

  const contentStyle = {
    position: 'relative',
    zIndex: 2,
    background: theme.bg,
    color: theme.text,
    padding: '14px 16px',
    minHeight: 56,
    transform: `translate3d(${dx}px, 0, 0)`,
    transition: testMode || dragging ? 'none' : 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1)',
    cursor: dragging ? 'grabbing' : 'grab',
    WebkitTapHighlightColor: 'transparent',
  };

  const revealBase = {
    position: 'absolute',
    top: 0,
    bottom: 0,
    display: 'flex',
    alignItems: 'center',
    padding: '0 20px',
    fontWeight: 700,
    fontSize: 14,
    color: '#fff',
    letterSpacing: 0.2,
  };

  return (
    <div
      ref={rowRef}
      role="listitem"
      aria-label={ariaLabel || 'שורה הניתנת להחלקה'}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onPointerLeave={dragging ? onPointerEnd : undefined}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onPointerEnd}
      onKeyDown={onKeyDown}
      style={wrapStyle}
      data-component="swipeable-row"
      data-dx={dx}
      data-dragging={dragging ? 'true' : 'false'}
    >
      {/* Reveal backgrounds — always in the DOM so tests can inspect */}
      <div
        aria-hidden="true"
        style={{
          ...revealBase,
          insetInlineStart: 0,
          background: theme.editBg,
          opacity: reveal && reveal.kind === 'edit' ? 1 : 0,
        }}
      >
        <span>{labels.edit}</span>
      </div>
      <div
        aria-hidden="true"
        style={{
          ...revealBase,
          insetInlineEnd: 0,
          background: theme.deleteBg,
          opacity: reveal && reveal.kind === 'delete' ? 1 : 0,
        }}
      >
        <span>{labels.delete}</span>
      </div>

      {/* Foreground content */}
      <div style={contentStyle} data-role="content">
        {children}
      </div>
    </div>
  );
}
