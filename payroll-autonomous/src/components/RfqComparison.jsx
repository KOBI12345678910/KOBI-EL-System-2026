/**
 * RfqComparison.jsx — השוואת הצעות מחיר (RFQ)
 * Agent X-28 — Swarm 3B — Techno-Kol Uzi mega-ERP 2026
 *
 * Side-by-side comparison matrix for bids received against an RFQ.
 *
 * Layout:
 *   - Header:    RFQ title (HE + EN), state badge, currency
 *   - Matrix:    rows = line items, cols = suppliers
 *                best unit-price per row is highlighted
 *   - Totals:    per-supplier summary row (delivery / quality / payment /
 *                weighted score / winner badge)
 *   - Weights:   editable weight panel → re-scores live
 *   - Actions:   Award selected bid, export, close
 *
 * Hebrew RTL, Palantir dark theme, zero external UI libs.
 * Inline styles only. Pure React (no hooks outside standard library).
 *
 * Props:
 *   matrix : output of rfqEngine.buildComparisonMatrix(rfqId) — see shape
 *            below
 *   scores : ranked output of rfqEngine.scoreBids(rfqId) — optional; when
 *            provided the totals row shows weighted scores and winner
 *   weights: { price, delivery, quality, paymentTerms } — optional
 *   onWeightsChange : (weights) => void — triggers re-score on parent
 *   onAward         : (bidId)  => void — awards winning bid
 *   onExport        : ()       => void — export to PDF
 *   onClose         : ()       => void — close RFQ (lock bids)
 *   loading         : boolean
 *   theme           : "dark" (default) | "light"
 *
 * matrix shape:
 *   {
 *     rfqId, title, currency, state,
 *     lines: [{
 *       lineItemId, description, quantity, unit, spec, bestPrice,
 *       cells: [{ supplierId, supplierName, unitPrice, lineTotal,
 *                 currency, isBest }]
 *     }],
 *     suppliers: [{ supplierId, supplierName }],
 *     totals: [{ supplierId, supplierName, currency, total, deliveryDays,
 *                qualityScore, paymentTermsDays, isWinner }]
 *   }
 */

import React, { useState, useMemo, useCallback } from 'react';

/* ------------------------------------------------------------------ */
/*  Theme — Palantir dark                                             */
/* ------------------------------------------------------------------ */

const PALANTIR = {
  bg:          '#0b0d10',
  panel:       '#13171c',
  panelAlt:    '#181d24',
  border:      '#232a33',
  borderSoft:  '#1a2029',
  accent:      '#4a9eff',
  accentSoft:  'rgba(74,158,255,0.12)',
  text:        '#e6edf3',
  textDim:     '#8b95a5',
  textMuted:   '#5a6472',
  success:     '#3ddc84',
  successSoft: 'rgba(61,220,132,0.15)',
  warn:        '#f5a623',
  warnSoft:    'rgba(245,166,35,0.15)',
  critical:    '#ff5c5c',
  highlight:   '#ffd76a',
  highlightBg: 'rgba(255,215,106,0.18)',
  winnerBg:    'rgba(61,220,132,0.18)',
};

/* ------------------------------------------------------------------ */
/*  Hebrew labels                                                      */
/* ------------------------------------------------------------------ */

const HE = {
  title:        'השוואת הצעות מחיר',
  subtitle:     'RFQ Bid Comparison — מטריצת השוואה בין ספקים',
  lineItem:     'פריט',
  description:  'תיאור',
  quantity:     'כמות',
  unit:         'יח׳',
  spec:         'מפרט',
  supplier:     'ספק',
  unitPrice:    'מחיר יחידה',
  lineTotal:    'סה״כ שורה',
  totalRow:     'סה״כ',
  deliveryDays: 'ימי אספקה',
  qualityScore: 'ציון איכות',
  paymentTerms: 'תנאי תשלום',
  score:        'ציון משוקלל',
  rank:         'דירוג',
  winner:       'זוכה',
  bestPrice:    'מחיר מיטבי',
  award:        'הענק זכייה',
  export:       'ייצוא ל־PDF',
  close:        'סגור RFQ',
  loading:      'טוען נתונים…',
  empty:        'לא התקבלו הצעות',
  emptyHint:    'השוואה תוצג לאחר קבלת הצעות מהספקים',
  state:        'מצב',
  stateLabels: {
    DRAFT:    'טיוטה',
    INVITED:  'הוזמן',
    OPEN:     'פתוח להגשה',
    CLOSED:   'נסגר',
    SCORED:   'מדורג',
    AWARDED:  'הוענק',
    ARCHIVED: 'בארכיון',
  },
  weights:      'משקלים',
  weightPrice:  'מחיר',
  weightDelivery: 'אספקה',
  weightQuality:  'איכות',
  weightPayment:  'תנאי תשלום',
  weightInfo:   'המשקלים נרמלים אוטומטית לסכום של 100%',
  days:         'ימים',
  currencySymbol: {
    ILS: '₪',
    USD: '$',
    EUR: '€',
    GBP: '£',
    JPY: '¥',
    CHF: 'CHF',
  },
};

/* ------------------------------------------------------------------ */
/*  Formatting helpers                                                 */
/* ------------------------------------------------------------------ */

function formatMoney(amount, currency) {
  if (amount === null || amount === undefined || Number.isNaN(amount)) {
    return '—';
  }
  const symbol = HE.currencySymbol[currency] || currency;
  try {
    const nf = new Intl.NumberFormat('he-IL', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return `${symbol} ${nf.format(amount)}`;
  } catch (_e) {
    return `${symbol} ${Number(amount).toFixed(2)}`;
  }
}

function formatInt(n) {
  if (n === null || n === undefined) return '—';
  try {
    return new Intl.NumberFormat('he-IL').format(n);
  } catch (_e) {
    return String(n);
  }
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function StateBadge({ state }) {
  const color = {
    DRAFT:    PALANTIR.textDim,
    INVITED:  PALANTIR.accent,
    OPEN:     PALANTIR.accent,
    CLOSED:   PALANTIR.warn,
    SCORED:   PALANTIR.accent,
    AWARDED:  PALANTIR.success,
    ARCHIVED: PALANTIR.textMuted,
  }[state] || PALANTIR.textDim;

  return (
    <span
      role="status"
      aria-label={`${HE.state}: ${HE.stateLabels[state] || state}`}
      style={{
        display: 'inline-block',
        padding: '4px 10px',
        borderRadius: 4,
        fontSize: 12,
        fontWeight: 600,
        color,
        border: `1px solid ${color}`,
        background: 'transparent',
        marginInlineStart: 8,
      }}
    >
      {HE.stateLabels[state] || state}
    </span>
  );
}

function WinnerBadge() {
  return (
    <span
      aria-label={HE.winner}
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 700,
        color: PALANTIR.success,
        background: PALANTIR.winnerBg,
        border: `1px solid ${PALANTIR.success}`,
        marginInlineStart: 6,
      }}
    >
      ★ {HE.winner}
    </span>
  );
}

function WeightsPanel({ weights, onWeightsChange }) {
  const [local, setLocal] = useState({
    price:        Math.round((weights.price        || 0.5)  * 100),
    delivery:     Math.round((weights.delivery     || 0.2)  * 100),
    quality:      Math.round((weights.quality      || 0.2)  * 100),
    paymentTerms: Math.round((weights.paymentTerms || 0.1)  * 100),
  });

  const handle = (key) => (e) => {
    const v = Math.max(0, Math.min(100, Number(e.target.value) || 0));
    const next = { ...local, [key]: v };
    setLocal(next);
    if (typeof onWeightsChange === 'function') {
      const sum = next.price + next.delivery + next.quality + next.paymentTerms;
      if (sum > 0) {
        onWeightsChange({
          price:        next.price        / sum,
          delivery:     next.delivery     / sum,
          quality:      next.quality      / sum,
          paymentTerms: next.paymentTerms / sum,
        });
      }
    }
  };

  const inputStyle = {
    width: 60,
    padding: '6px 8px',
    background: PALANTIR.bg,
    border: `1px solid ${PALANTIR.border}`,
    borderRadius: 4,
    color: PALANTIR.text,
    fontSize: 13,
    textAlign: 'center',
  };

  const labelStyle = {
    fontSize: 12,
    color: PALANTIR.textDim,
    marginInlineEnd: 8,
  };

  return (
    <div
      style={{
        background: PALANTIR.panelAlt,
        border: `1px solid ${PALANTIR.border}`,
        borderRadius: 6,
        padding: 12,
        marginBlockEnd: 12,
      }}
      aria-label={HE.weights}
    >
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: PALANTIR.text,
          marginBlockEnd: 8,
        }}
      >
        {HE.weights}
      </div>
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center' }}>
          <span style={labelStyle}>{HE.weightPrice}</span>
          <input
            type="number"
            min={0}
            max={100}
            value={local.price}
            onChange={handle('price')}
            style={inputStyle}
            aria-label={HE.weightPrice}
          />
          <span style={{ ...labelStyle, marginInlineStart: 4 }}>%</span>
        </label>
        <label style={{ display: 'flex', alignItems: 'center' }}>
          <span style={labelStyle}>{HE.weightDelivery}</span>
          <input
            type="number"
            min={0}
            max={100}
            value={local.delivery}
            onChange={handle('delivery')}
            style={inputStyle}
            aria-label={HE.weightDelivery}
          />
          <span style={{ ...labelStyle, marginInlineStart: 4 }}>%</span>
        </label>
        <label style={{ display: 'flex', alignItems: 'center' }}>
          <span style={labelStyle}>{HE.weightQuality}</span>
          <input
            type="number"
            min={0}
            max={100}
            value={local.quality}
            onChange={handle('quality')}
            style={inputStyle}
            aria-label={HE.weightQuality}
          />
          <span style={{ ...labelStyle, marginInlineStart: 4 }}>%</span>
        </label>
        <label style={{ display: 'flex', alignItems: 'center' }}>
          <span style={labelStyle}>{HE.weightPayment}</span>
          <input
            type="number"
            min={0}
            max={100}
            value={local.paymentTerms}
            onChange={handle('paymentTerms')}
            style={inputStyle}
            aria-label={HE.weightPayment}
          />
          <span style={{ ...labelStyle, marginInlineStart: 4 }}>%</span>
        </label>
      </div>
      <div
        style={{
          fontSize: 11,
          color: PALANTIR.textMuted,
          marginBlockStart: 8,
        }}
      >
        {HE.weightInfo}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export default function RfqComparison(props) {
  const {
    matrix,
    scores,
    weights,
    onWeightsChange,
    onAward,
    onExport,
    onClose,
    loading = false,
    theme = 'dark',
  } = props || {};

  // theme is accepted for future light mode; current impl is dark-only.
  const _theme = theme; // eslint-disable-line no-unused-vars

  const [selectedBidId, setSelectedBidId] = useState(null);

  const activeWeights = weights || {
    price: 0.5, delivery: 0.2, quality: 0.2, paymentTerms: 0.1,
  };

  // Map supplierId → score row
  const scoreBySupplier = useMemo(() => {
    const m = {};
    if (Array.isArray(scores)) {
      for (const s of scores) m[s.supplierId] = s;
    }
    return m;
  }, [scores]);

  const handleAward = useCallback(() => {
    if (!selectedBidId) return;
    if (typeof onAward === 'function') onAward(selectedBidId);
  }, [selectedBidId, onAward]);

  /* --------------- Container styles --------------- */
  const rootStyle = {
    direction: 'rtl',
    background: PALANTIR.bg,
    color: PALANTIR.text,
    fontFamily:
      '"Segoe UI", "Heebo", "Noto Sans Hebrew", Arial, sans-serif',
    padding: 16,
    borderRadius: 8,
    border: `1px solid ${PALANTIR.border}`,
    minHeight: 200,
  };

  /* --------------- Empty / loading states --------------- */
  if (loading) {
    return (
      <div style={rootStyle} aria-busy="true">
        <div
          style={{
            padding: 40,
            textAlign: 'center',
            color: PALANTIR.textDim,
            fontSize: 14,
          }}
        >
          {HE.loading}
        </div>
      </div>
    );
  }

  if (!matrix || !Array.isArray(matrix.lines) || matrix.lines.length === 0) {
    return (
      <div style={rootStyle}>
        <div
          style={{
            padding: 40,
            textAlign: 'center',
            color: PALANTIR.textDim,
            fontSize: 14,
          }}
        >
          <div style={{ fontWeight: 600, marginBlockEnd: 8 }}>{HE.empty}</div>
          <div style={{ fontSize: 12, color: PALANTIR.textMuted }}>
            {HE.emptyHint}
          </div>
        </div>
      </div>
    );
  }

  const suppliers = matrix.suppliers || [];
  const noBids = suppliers.length === 0;

  /* --------------- Header --------------- */
  const header = (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBlockEnd: 16,
        paddingBlockEnd: 12,
        borderBlockEnd: `1px solid ${PALANTIR.border}`,
      }}
    >
      <div>
        <h2
          style={{
            fontSize: 20,
            fontWeight: 700,
            margin: 0,
            color: PALANTIR.text,
          }}
        >
          {HE.title}
          <StateBadge state={matrix.state} />
        </h2>
        <div
          style={{
            fontSize: 13,
            color: PALANTIR.textDim,
            marginBlockStart: 4,
          }}
          dir="ltr"
        >
          {HE.subtitle}
        </div>
        <div
          style={{
            fontSize: 14,
            color: PALANTIR.text,
            marginBlockStart: 8,
            fontWeight: 600,
          }}
        >
          {matrix.title}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {typeof onExport === 'function' && (
          <button
            type="button"
            onClick={onExport}
            style={btn('secondary')}
            aria-label={HE.export}
          >
            {HE.export}
          </button>
        )}
        {typeof onClose === 'function' && matrix.state === 'OPEN' && (
          <button
            type="button"
            onClick={onClose}
            style={btn('warn')}
            aria-label={HE.close}
          >
            {HE.close}
          </button>
        )}
        {typeof onAward === 'function' &&
          (matrix.state === 'SCORED' || matrix.state === 'CLOSED') && (
            <button
              type="button"
              onClick={handleAward}
              disabled={!selectedBidId}
              style={{
                ...btn(selectedBidId ? 'primary' : 'disabled'),
              }}
              aria-label={HE.award}
            >
              {HE.award}
            </button>
          )}
      </div>
    </div>
  );

  /* --------------- Weights --------------- */
  const weightsPanel =
    typeof onWeightsChange === 'function' ? (
      <WeightsPanel
        weights={activeWeights}
        onWeightsChange={onWeightsChange}
      />
    ) : null;

  /* --------------- No-bids state --------------- */
  if (noBids) {
    return (
      <div style={rootStyle}>
        {header}
        {weightsPanel}
        <div
          style={{
            padding: 40,
            textAlign: 'center',
            color: PALANTIR.textDim,
            fontSize: 14,
          }}
        >
          <div style={{ fontWeight: 600, marginBlockEnd: 8 }}>{HE.empty}</div>
          <div style={{ fontSize: 12, color: PALANTIR.textMuted }}>
            {HE.emptyHint}
          </div>
        </div>
      </div>
    );
  }

  /* --------------- Matrix table --------------- */
  const thStyle = {
    padding: '10px 12px',
    textAlign: 'right',
    fontSize: 12,
    fontWeight: 600,
    color: PALANTIR.textDim,
    background: PALANTIR.panelAlt,
    borderBlockEnd: `1px solid ${PALANTIR.border}`,
    borderInlineStart: `1px solid ${PALANTIR.borderSoft}`,
    whiteSpace: 'nowrap',
    position: 'sticky',
    top: 0,
  };

  const tdStyle = {
    padding: '10px 12px',
    fontSize: 13,
    color: PALANTIR.text,
    borderBlockEnd: `1px solid ${PALANTIR.borderSoft}`,
    borderInlineStart: `1px solid ${PALANTIR.borderSoft}`,
  };

  const table = (
    <div
      style={{
        overflowX: 'auto',
        borderRadius: 6,
        border: `1px solid ${PALANTIR.border}`,
      }}
    >
      <table
        dir="rtl"
        style={{
          width: '100%',
          borderCollapse: 'separate',
          borderSpacing: 0,
          direction: 'rtl',
        }}
        role="table"
        aria-label={HE.title}
      >
        <thead>
          <tr>
            <th style={{ ...thStyle, minWidth: 220 }}>{HE.description}</th>
            <th style={{ ...thStyle, minWidth: 80 }}>{HE.quantity}</th>
            {suppliers.map((s) => (
              <th key={s.supplierId} style={{ ...thStyle, minWidth: 140 }}>
                {s.supplierName}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.lines.map((line, rowIdx) => (
            <tr
              key={line.lineItemId}
              style={{
                background: rowIdx % 2 === 0 ? PALANTIR.panel : PALANTIR.panelAlt,
              }}
            >
              <td style={tdStyle}>
                <div style={{ fontWeight: 600 }}>{line.description}</div>
                {line.spec && (
                  <div
                    style={{
                      fontSize: 11,
                      color: PALANTIR.textMuted,
                      marginBlockStart: 2,
                    }}
                  >
                    {line.spec}
                  </div>
                )}
              </td>
              <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                {formatInt(line.quantity)} {line.unit}
              </td>
              {suppliers.map((s) => {
                const cell = line.cells.find((c) => c.supplierId === s.supplierId);
                const hl = cell && cell.isBest;
                return (
                  <td
                    key={s.supplierId}
                    style={{
                      ...tdStyle,
                      background: hl ? PALANTIR.highlightBg : undefined,
                      color: hl ? PALANTIR.highlight : PALANTIR.text,
                      fontWeight: hl ? 700 : 400,
                    }}
                    aria-label={
                      hl
                        ? `${HE.bestPrice}: ${formatMoney(
                            cell ? cell.unitPrice : null,
                            cell ? cell.currency : matrix.currency
                          )}`
                        : undefined
                    }
                  >
                    <div>
                      {cell ? formatMoney(cell.unitPrice, cell.currency) : '—'}
                    </div>
                    {cell && cell.lineTotal !== null && (
                      <div
                        style={{
                          fontSize: 11,
                          color: PALANTIR.textMuted,
                          marginBlockStart: 2,
                        }}
                      >
                        {formatMoney(cell.lineTotal, cell.currency)}
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}

          {/* Totals row */}
          <tr
            style={{
              background: PALANTIR.panelAlt,
              borderBlockStart: `2px solid ${PALANTIR.accent}`,
            }}
          >
            <td
              style={{
                ...tdStyle,
                fontWeight: 700,
                color: PALANTIR.accent,
                fontSize: 14,
              }}
            >
              {HE.totalRow}
            </td>
            <td style={tdStyle} />
            {suppliers.map((s) => {
              const t = (matrix.totals || []).find(
                (x) => x.supplierId === s.supplierId
              );
              const sc = scoreBySupplier[s.supplierId];
              const isWinner = t && t.isWinner;
              const isSelected = selectedBidId && sc && sc.bidId === selectedBidId;
              return (
                <td
                  key={s.supplierId}
                  onClick={() => {
                    if (sc && sc.bidId) setSelectedBidId(sc.bidId);
                  }}
                  style={{
                    ...tdStyle,
                    background: isWinner
                      ? PALANTIR.winnerBg
                      : isSelected
                      ? PALANTIR.accentSoft
                      : undefined,
                    cursor: sc ? 'pointer' : 'default',
                    fontWeight: 700,
                  }}
                  aria-selected={isSelected || undefined}
                >
                  <div style={{ color: PALANTIR.text, fontSize: 14 }}>
                    {t ? formatMoney(t.total, t.currency) : '—'}
                  </div>
                  {t && (
                    <div
                      style={{
                        fontSize: 11,
                        color: PALANTIR.textDim,
                        marginBlockStart: 4,
                        fontWeight: 400,
                      }}
                    >
                      {HE.deliveryDays}: {formatInt(t.deliveryDays)} {HE.days}
                      <br />
                      {HE.qualityScore}: {formatInt(t.qualityScore)}
                      <br />
                      {HE.paymentTerms}: {formatInt(t.paymentTermsDays)}{' '}
                      {HE.days}
                    </div>
                  )}
                  {sc && (
                    <div
                      style={{
                        fontSize: 12,
                        color: PALANTIR.accent,
                        marginBlockStart: 4,
                        fontWeight: 700,
                      }}
                    >
                      {HE.score}: {sc.score}
                      {sc.rank === 1 ? ' ★' : ''}
                    </div>
                  )}
                  {isWinner && <WinnerBadge />}
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
    </div>
  );

  return (
    <div style={rootStyle}>
      {header}
      {weightsPanel}
      {table}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Button style factory                                               */
/* ------------------------------------------------------------------ */

function btn(kind) {
  const base = {
    padding: '8px 16px',
    fontSize: 13,
    fontWeight: 600,
    borderRadius: 4,
    cursor: 'pointer',
    border: '1px solid',
    fontFamily: 'inherit',
  };
  if (kind === 'primary') {
    return {
      ...base,
      background: PALANTIR.accent,
      color: '#ffffff',
      borderColor: PALANTIR.accent,
    };
  }
  if (kind === 'warn') {
    return {
      ...base,
      background: PALANTIR.warnSoft,
      color: PALANTIR.warn,
      borderColor: PALANTIR.warn,
    };
  }
  if (kind === 'disabled') {
    return {
      ...base,
      background: 'transparent',
      color: PALANTIR.textMuted,
      borderColor: PALANTIR.border,
      cursor: 'not-allowed',
    };
  }
  return {
    ...base,
    background: 'transparent',
    color: PALANTIR.text,
    borderColor: PALANTIR.border,
  };
}

/* ------------------------------------------------------------------ */
/*  Named export for tests                                             */
/* ------------------------------------------------------------------ */

export { RfqComparison, PALANTIR as RFQ_COMPARISON_THEME, HE as RFQ_COMPARISON_HE };
