import React, { useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  Procurement,
  seedProcurementDemoData,
  getProcurementSnapshot,
  type Supplier,
  type Product,
  type PurchaseOrder,
  type Contract,
  type ReverseAuction,
  type QualityCheck,
  type RiskBand,
} from '../engines/procurementEngine';

// ═══════════════════════════════════════════════════════════════════════════
// THEME — Onyx dark Palantir palette
// ═══════════════════════════════════════════════════════════════════════════

const COLORS = {
  bg: '#252A31',
  panel: '#2F343C',
  panelAlt: '#383E47',
  input: '#383E47',
  border: 'rgba(255,255,255,0.1)',
  borderStrong: 'rgba(255,255,255,0.18)',
  text: '#F6F7F9',
  textMuted: '#ABB3BF',
  textDim: '#5C7080',
  accent: '#FFA500',
  cyan: '#14CCBB',
  yellow: '#F6B64A',
  red: '#FC8585',
  blue: '#48AFF0',
  purple: '#8B7FFF',
  green: '#14CCBB',
};

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", "Heebo", sans-serif';

// ═══════════════════════════════════════════════════════════════════════════
// BAND / STATUS / STRATEGY META
// ═══════════════════════════════════════════════════════════════════════════

const BAND_META: Record<RiskBand, { label: string; color: string; bg: string }> = {
  preferred: { label: 'מועדף', color: COLORS.cyan, bg: 'rgba(20,204,187,0.15)' },
  approved:  { label: 'מאושר', color: COLORS.blue, bg: 'rgba(72,175,240,0.15)' },
  watch:     { label: 'במעקב', color: COLORS.yellow, bg: 'rgba(246,182,74,0.15)' },
  avoid:     { label: 'להימנע', color: COLORS.red, bg: 'rgba(252,133,133,0.15)' },
};

const PO_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft:            { label: 'טיוטה', color: COLORS.textDim },
  pending_approval: { label: 'ממתין לאישור', color: COLORS.yellow },
  approved:         { label: 'מאושר', color: COLORS.blue },
  sent:             { label: 'נשלח', color: COLORS.blue },
  confirmed:        { label: 'אושרה קבלה', color: COLORS.cyan },
  in_transit:       { label: 'בתנועה', color: COLORS.purple },
  received:         { label: 'התקבל', color: COLORS.cyan },
  qc_pending:       { label: 'בבדיקת איכות', color: COLORS.yellow },
  qc_passed:        { label: 'עבר בקרה', color: COLORS.cyan },
  qc_failed:        { label: 'נכשל בבקרה', color: COLORS.red },
  invoiced:         { label: 'חויב', color: COLORS.blue },
  paid:             { label: 'שולם', color: COLORS.cyan },
  closed:           { label: 'סגור', color: COLORS.textDim },
  cancelled:        { label: 'בוטל', color: COLORS.red },
};

const CONTRACT_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft:      { label: 'טיוטה', color: COLORS.textDim },
  active:     { label: 'פעיל', color: COLORS.cyan },
  suspended:  { label: 'מושהה', color: COLORS.yellow },
  expired:    { label: 'פג תוקף', color: COLORS.red },
  terminated: { label: 'בוטל', color: COLORS.red },
};

const STRATEGY_META: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  direct_contract:           { label: 'חוזה ישיר', color: COLORS.cyan, bg: 'rgba(20,204,187,0.15)', icon: '📜' },
  reverse_auction:           { label: 'מכרז הפוך', color: COLORS.purple, bg: 'rgba(139,127,255,0.15)', icon: '⚡' },
  bundling:                  { label: 'איחוד הזמנות', color: COLORS.blue, bg: 'rgba(72,175,240,0.15)', icon: '📦' },
  collaborative_negotiation: { label: 'משא ומתן שיתופי', color: COLORS.accent, bg: 'rgba(255,165,0,0.15)', icon: '🤝' },
  aggressive_negotiation:    { label: 'משא ומתן אגרסיבי', color: COLORS.red, bg: 'rgba(252,133,133,0.15)', icon: '⚔️' },
};

const URGENCY_META: Record<string, { label: string; color: string }> = {
  low:      { label: 'נמוכה', color: COLORS.textDim },
  medium:   { label: 'בינונית', color: COLORS.blue },
  high:     { label: 'גבוהה', color: COLORS.yellow },
  critical: { label: 'קריטית', color: COLORS.red },
};

const QC_ACTION_LABELS: Record<string, { label: string; color: string }> = {
  accept:         { label: 'אושר', color: COLORS.cyan },
  return:         { label: 'הוחזר', color: COLORS.red },
  credit:         { label: 'זיכוי', color: COLORS.yellow },
  replace:        { label: 'החלפה', color: COLORS.purple },
  partial_accept: { label: 'אישור חלקי', color: COLORS.blue },
};

const NEG_STRATEGY_LABELS: Record<string, string> = {
  aggressive: 'אגרסיבית',
  collaborative: 'שיתופית',
  competitive: 'תחרותית',
  volume: 'נפח',
  relationship: 'מערכת יחסים',
  time_pressure: 'לחץ זמן',
};

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

const ils = (n: number | undefined): string => `₪${(n ?? 0).toLocaleString('he-IL', { maximumFractionDigits: 0 })}`;
const num = (n: number | undefined): string => (n ?? 0).toLocaleString('he-IL', { maximumFractionDigits: 2 });
const pct = (n: number | undefined): string => `${(n ?? 0).toFixed(1)}%`;

function fmtDate(iso?: string): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return '—';
  }
}

function fmtDateTime(iso?: string): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString('he-IL');
  } catch {
    return '—';
  }
}

function fmtCountdown(endIso?: string): string {
  if (!endIso) return '—';
  const ms = new Date(endIso).getTime() - Date.now();
  if (ms <= 0) return 'הסתיים';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function daysBetween(aIso: string, bIso: string = new Date().toISOString()): number {
  return Math.floor((new Date(aIso).getTime() - new Date(bIso).getTime()) / 86400000);
}

function scoreColor(score: number): string {
  if (score >= 80) return COLORS.cyan;
  if (score >= 60) return COLORS.blue;
  if (score >= 40) return COLORS.yellow;
  return COLORS.red;
}

// ═══════════════════════════════════════════════════════════════════════════
// SAFE MUTATION WRAPPERS — never crash the UI, fall back silently
// ═══════════════════════════════════════════════════════════════════════════

function safeRecomputeScore(supplierId: string): boolean {
  try {
    const api: any = Procurement.suppliers as any;
    if (typeof api.recomputeScore === 'function') { api.recomputeScore(supplierId); return true; }
    if (typeof api.recomputeAllScores === 'function') { api.recomputeAllScores(); return true; }
  } catch (e) {
    console.error('safeRecomputeScore failed', e);
  }
  return false;
}

function safeDeactivateSupplier(supplierId: string, reason: string): boolean {
  try {
    Procurement.suppliers.deactivate(supplierId, reason);
    return true;
  } catch (e) {
    console.error('safeDeactivateSupplier failed', e);
  }
  return false;
}

function safeRegisterSupplier(data: any): Supplier | undefined {
  try {
    return Procurement.suppliers.registerSupplier(data);
  } catch (e) {
    console.error('safeRegisterSupplier failed', e);
  }
  return undefined;
}

function safeCloseAuction(auctionId: string): boolean {
  try {
    Procurement.auctions.closeAuction(auctionId);
    return true;
  } catch (e) {
    console.error('safeCloseAuction failed', e);
  }
  return false;
}

function safePlaceBid(auctionId: string, supplierId: string, unitPrice: number): boolean {
  try {
    const bid = Procurement.auctions.placeBid(auctionId, supplierId, unitPrice);
    return !!bid;
  } catch (e) {
    console.error('safePlaceBid failed', e);
  }
  return false;
}

function safeCloseSession(sessionId: string, outcome: 'agreed' | 'failed' | 'cancelled', finalPrice?: number): boolean {
  try {
    Procurement.negotiation.closeSession(sessionId, outcome, finalPrice);
    return true;
  } catch (e) {
    console.error('safeCloseSession failed', e);
  }
  return false;
}

function safeCounterOffer(sessionId: string, newTarget: number, body?: string): boolean {
  try {
    const msg = Procurement.negotiation.counterOffer(sessionId, newTarget, body);
    return !!msg;
  } catch (e) {
    console.error('safeCounterOffer failed', e);
  }
  return false;
}

function safeRecordReply(sessionId: string, body: string, priceOffered?: number): boolean {
  try {
    const msg = Procurement.negotiation.recordSupplierReply(sessionId, body, priceOffered);
    return !!msg;
  } catch (e) {
    console.error('safeRecordReply failed', e);
  }
  return false;
}

function safeMergeBundle(bundleId: string, mergedPoId: string): boolean {
  try {
    Procurement.bundling.markMerged(bundleId, mergedPoId);
    return true;
  } catch (e) {
    console.error('safeMergeBundle failed', e);
  }
  return false;
}

function safeApprovePending(approvalId: string): boolean {
  try {
    return Procurement.reorder.approvePending(approvalId);
  } catch (e) {
    console.error('safeApprovePending failed', e);
  }
  return false;
}

function safeRejectPending(approvalId: string): boolean {
  try {
    return Procurement.reorder.rejectPending(approvalId);
  } catch (e) {
    console.error('safeRejectPending failed', e);
  }
  return false;
}

function safeRenewContract(contractId: string, months: number): boolean {
  try {
    Procurement.contracts.renew(contractId, months);
    return true;
  } catch (e) {
    console.error('safeRenewContract failed', e);
  }
  return false;
}

function safeSuspendContract(contractId: string, reason: string): boolean {
  try {
    Procurement.contracts.suspend(contractId, reason);
    return true;
  } catch (e) {
    console.error('safeSuspendContract failed', e);
  }
  return false;
}

function safeRunCheck(params: {
  purchaseOrderId: string;
  productId: string;
  quantityReceived: number;
  quantityPassed: number;
  quantityRejected: number;
  defectReasons?: string[];
  inspectedBy: string;
}): QualityCheck | undefined {
  try {
    return Procurement.quality.runCheck(params);
  } catch (e) {
    console.error('safeRunCheck failed', e);
  }
  return undefined;
}

async function safeIntelligentOrder(params: {
  productId: string;
  quantity: number;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  canWait?: boolean;
  maxWaitHours?: number;
}) {
  try {
    return await Procurement.intelligentOrder(params);
  } catch (e) {
    console.error('safeIntelligentOrder failed', e);
    return undefined;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════

const s: Record<string, CSSProperties> = {
  page: {
    direction: 'rtl',
    fontFamily: FONT,
    background: COLORS.bg,
    color: COLORS.text,
    minHeight: '100vh',
    padding: 20,
    boxSizing: 'border-box',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
    paddingBottom: 14,
    borderBottom: `1px solid ${COLORS.border}`,
    flexWrap: 'wrap',
    gap: 12,
  },
  titleWrap: { display: 'flex', flexDirection: 'column', gap: 6 },
  title: { fontSize: 28, fontWeight: 700, color: COLORS.text, margin: 0, letterSpacing: 0.3 },
  subtitle: { fontSize: 13, color: COLORS.textMuted, margin: 0 },
  headerRight: { display: 'flex', alignItems: 'center', gap: 10 },
  liveDot: {
    display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
    background: COLORS.cyan, marginLeft: 6, boxShadow: `0 0 8px ${COLORS.cyan}`,
  },
  generatedAt: {
    fontSize: 12, color: COLORS.cyan, fontFamily: '"SF Mono", "Consolas", monospace',
    padding: '6px 12px', background: 'rgba(20,204,187,0.08)',
    border: `1px solid ${COLORS.cyan}33`, borderRadius: 6,
  },
  refreshBtn: {
    background: COLORS.panelAlt, color: COLORS.text,
    border: `1px solid ${COLORS.borderStrong}`,
    padding: '8px 16px', borderRadius: 6, fontSize: 12, fontWeight: 600,
    cursor: 'pointer', fontFamily: 'inherit',
  },
  killerBtn: {
    background: `linear-gradient(135deg, ${COLORS.accent}, #FF7300)`,
    color: '#1a1a1a', border: 'none',
    padding: '10px 18px', borderRadius: 6, fontSize: 13, fontWeight: 700,
    cursor: 'pointer', fontFamily: 'inherit',
    boxShadow: '0 0 20px rgba(255,165,0,0.35)',
  },
  kpiStrip: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: 10, marginBottom: 16,
  },
  kpiCard: {
    background: COLORS.panel, border: `1px solid ${COLORS.border}`,
    borderRadius: 10, padding: '12px 14px',
    display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0,
  },
  kpiLabel: {
    fontSize: 10, color: COLORS.textMuted, fontWeight: 600, letterSpacing: 0.3,
    textTransform: 'uppercase', whiteSpace: 'nowrap',
    overflow: 'hidden', textOverflow: 'ellipsis',
  },
  kpiValue: { fontSize: 24, fontWeight: 700, color: COLORS.text, lineHeight: 1.1 },
  kpiValueBig: { fontSize: 28, fontWeight: 800, color: COLORS.accent, lineHeight: 1.1 },
  kpiHint: { fontSize: 10, color: COLORS.textDim },
  tabBar: {
    display: 'flex', gap: 4, marginBottom: 16,
    borderBottom: `1px solid ${COLORS.border}`,
    flexWrap: 'wrap',
  },
  tabBtn: {
    background: 'transparent', color: COLORS.textMuted, border: 'none',
    padding: '10px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
    borderBottom: '2px solid transparent', fontFamily: 'inherit',
    display: 'flex', alignItems: 'center', gap: 6,
  },
  tabBtnActive: { color: COLORS.accent, borderBottom: `2px solid ${COLORS.accent}` },
  panel: {
    background: COLORS.panel, border: `1px solid ${COLORS.border}`,
    borderRadius: 10, padding: 16, marginBottom: 14,
  },
  panelHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 14, flexWrap: 'wrap', gap: 10,
  },
  panelTitle: { fontSize: 16, fontWeight: 600, color: COLORS.text, margin: 0 },
  panelMeta: { fontSize: 12, color: COLORS.textMuted },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  thead: { background: COLORS.panelAlt },
  th: {
    textAlign: 'right' as const, padding: '10px 12px',
    fontSize: 11, fontWeight: 600, color: COLORS.textMuted,
    textTransform: 'uppercase' as const, letterSpacing: 0.5,
    borderBottom: `1px solid ${COLORS.border}`,
  },
  td: {
    padding: '10px 12px', color: COLORS.text,
    borderBottom: `1px solid ${COLORS.border}`, fontSize: 13,
  },
  chip: {
    display: 'inline-block', padding: '3px 10px', borderRadius: 12,
    fontSize: 11, fontWeight: 600,
  },
  pill: {
    display: 'inline-block', padding: '2px 8px', margin: '2px 3px 2px 0',
    borderRadius: 10, fontSize: 10, background: COLORS.panelAlt,
    color: COLORS.textMuted, border: `1px solid ${COLORS.border}`,
  },
  input: {
    background: COLORS.input, color: COLORS.text,
    border: `1px solid ${COLORS.border}`, borderRadius: 6,
    padding: '8px 12px', fontSize: 13, fontFamily: 'inherit',
    minWidth: 0, boxSizing: 'border-box', width: '100%',
  },
  select: {
    background: COLORS.input, color: COLORS.text,
    border: `1px solid ${COLORS.border}`, borderRadius: 6,
    padding: '8px 12px', fontSize: 13, fontFamily: 'inherit',
    cursor: 'pointer',
  },
  btn: {
    background: COLORS.accent, color: '#1a1a1a', border: 'none',
    padding: '8px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600,
    cursor: 'pointer', fontFamily: 'inherit',
  },
  btnGhost: {
    background: 'transparent', color: COLORS.textMuted,
    border: `1px solid ${COLORS.border}`,
    padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500,
    cursor: 'pointer', fontFamily: 'inherit',
  },
  btnGreen: {
    background: COLORS.cyan, color: '#1a1a1a', border: 'none',
    padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
    cursor: 'pointer', fontFamily: 'inherit',
  },
  btnYellow: {
    background: COLORS.yellow, color: '#1a1a1a', border: 'none',
    padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
    cursor: 'pointer', fontFamily: 'inherit',
  },
  btnRed: {
    background: 'rgba(252,133,133,0.15)', color: COLORS.red,
    border: `1px solid ${COLORS.red}`,
    padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
    cursor: 'pointer', fontFamily: 'inherit',
  },
  btnBlue: {
    background: COLORS.blue, color: '#1a1a1a', border: 'none',
    padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
    cursor: 'pointer', fontFamily: 'inherit',
  },
  cardGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
    gap: 12,
  },
  card: {
    background: COLORS.panel, border: `1px solid ${COLORS.border}`,
    borderRadius: 10, padding: 14, cursor: 'pointer',
    transition: 'border-color 0.15s ease, transform 0.15s ease',
  },
  cardHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 10, paddingBottom: 8, borderBottom: `1px solid ${COLORS.border}`,
  },
  cardTitle: { fontSize: 14, fontWeight: 700, color: COLORS.text, margin: 0 },
  cardSubtitle: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  cardRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    fontSize: 12, color: COLORS.textMuted, marginBottom: 6,
  },
  barRow: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 },
  barLabel: { width: 110, fontSize: 12, color: COLORS.textMuted, textAlign: 'right' as const },
  barTrack: {
    flex: 1, height: 14, background: COLORS.panelAlt,
    borderRadius: 4, overflow: 'hidden', position: 'relative',
  },
  barFill: { height: '100%', borderRadius: 4, transition: 'width 0.4s ease' },
  barCount: {
    width: 50, fontSize: 12, fontWeight: 600, color: COLORS.text,
    textAlign: 'left' as const,
  },
  emptyState: {
    padding: 40, textAlign: 'center' as const,
    color: COLORS.textDim, fontSize: 13,
  },
  sidePanel: {
    background: COLORS.panelAlt, border: `1px solid ${COLORS.borderStrong}`,
    borderRadius: 10, padding: 16, maxHeight: 720, overflowY: 'auto',
  },
  twoCol: {
    display: 'grid', gridTemplateColumns: '2fr 1fr',
    gap: 14, alignItems: 'flex-start',
  },
  formGrid: {
    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10,
  },
  formRow: {
    display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center', flexWrap: 'wrap',
  },
  label: {
    fontSize: 11, color: COLORS.textMuted, fontWeight: 500,
    textTransform: 'uppercase' as const, letterSpacing: 0.4, marginBottom: 4,
    display: 'block',
  },
  modalBackdrop: {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0,0,0,0.72)', zIndex: 1000,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    backdropFilter: 'blur(4px)',
  },
  modal: {
    background: COLORS.panel, border: `1px solid ${COLORS.borderStrong}`,
    borderRadius: 12, padding: 20, minWidth: 520, maxWidth: 720,
    maxHeight: '86vh', overflowY: 'auto',
    boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
  },
  modalHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 14, paddingBottom: 12,
    borderBottom: `1px solid ${COLORS.border}`,
  },
  modalTitle: { fontSize: 18, fontWeight: 700, color: COLORS.text, margin: 0 },
  closeX: {
    background: 'transparent', border: 'none', color: COLORS.textMuted,
    fontSize: 20, cursor: 'pointer', padding: '4px 10px',
  },
  stickyBottom: {
    position: 'fixed', bottom: 0, left: 0, right: 0,
    background: `linear-gradient(180deg, transparent, ${COLORS.bg} 30%)`,
    padding: '14px 20px', zIndex: 500, direction: 'rtl',
    display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10,
  },
  subcard: {
    background: COLORS.panelAlt, border: `1px solid ${COLORS.border}`,
    borderRadius: 8, padding: 12, marginBottom: 8,
  },
  scoreBar: {
    flex: 1, height: 10, background: COLORS.bg,
    borderRadius: 5, overflow: 'hidden', position: 'relative',
  },
  splitRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 },
  messageRow: {
    padding: '10px 12px', borderRadius: 8,
    marginBottom: 8, fontSize: 12,
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// SMALL RENDER HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function BandPill({ band }: { band: RiskBand }) {
  const meta = BAND_META[band];
  return (
    <span style={{
      ...s.chip,
      background: meta.bg,
      color: meta.color,
      border: `1px solid ${meta.color}55`,
    }}>
      {meta.label}
    </span>
  );
}

function ScoreBar({ value, color }: { value: number; color?: string }) {
  const c = color ?? scoreColor(value);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 140 }}>
      <div style={s.scoreBar}>
        <div style={{
          height: '100%',
          width: `${Math.max(0, Math.min(100, value))}%`,
          background: c,
          borderRadius: 5,
          transition: 'width 0.4s ease',
        }} />
      </div>
      <span style={{
        fontSize: 12, fontWeight: 700, color: c, width: 40,
        textAlign: 'left',
      }}>{value.toFixed(0)}</span>
    </div>
  );
}

function StatusPill({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      ...s.chip,
      background: `${color}22`,
      color,
      border: `1px solid ${color}55`,
    }}>
      {label}
    </span>
  );
}

function KpiCard({
  label, value, hint, color, big,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  color?: string;
  big?: boolean;
}) {
  return (
    <div style={s.kpiCard}>
      <div style={s.kpiLabel}>{label}</div>
      <div style={{
        ...(big ? s.kpiValueBig : s.kpiValue),
        color: color ?? (big ? COLORS.accent : COLORS.text),
      }}>{value}</div>
      {hint && <div style={s.kpiHint}>{hint}</div>}
    </div>
  );
}

function Sparkline({ data, width = 220, height = 60, stroke = COLORS.cyan }: {
  data: number[]; width?: number; height?: number; stroke?: string;
}) {
  if (!data || data.length === 0) {
    return <div style={{ fontSize: 11, color: COLORS.textDim }}>אין נתונים</div>;
  }
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = Math.max(max - min, 1);
  const step = width / Math.max(data.length - 1, 1);
  const points = data.map((v, i) => {
    const x = i * step;
    const y = height - ((v - min) / range) * (height - 8) - 4;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const areaPoints = `0,${height} ${points} ${width},${height}`;
  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <defs>
        <linearGradient id="spark-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.4" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={areaPoints} fill="url(#spark-grad)" />
      <polyline
        fill="none"
        stroke={stroke}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={points}
      />
    </svg>
  );
}

function BarChart({ data, width = 520, height = 220, color = COLORS.accent }: {
  data: Array<{ label: string; value: number }>;
  width?: number; height?: number; color?: string;
}) {
  if (!data || data.length === 0) {
    return <div style={s.emptyState}>אין נתונים להצגה</div>;
  }
  const max = Math.max(...data.map(d => d.value), 1);
  const padL = 80;
  const padR = 20;
  const padT = 16;
  const padB = 40;
  const chartW = width - padL - padR;
  const chartH = height - padT - padB;
  const barH = Math.max(14, chartH / data.length - 8);
  return (
    <svg width={width} height={height} style={{ display: 'block', direction: 'ltr' }}>
      {data.map((d, i) => {
        const y = padT + i * (barH + 8);
        const w = (d.value / max) * chartW;
        return (
          <g key={i}>
            <text
              x={padL - 8}
              y={y + barH / 2 + 4}
              textAnchor="end"
              fill={COLORS.textMuted}
              fontSize="11"
              fontFamily={FONT}
            >{d.label.length > 14 ? d.label.slice(0, 14) + '…' : d.label}</text>
            <rect
              x={padL}
              y={y}
              width={w}
              height={barH}
              fill={color}
              opacity="0.85"
              rx="3"
            />
            <text
              x={padL + w + 6}
              y={y + barH / 2 + 4}
              fill={COLORS.text}
              fontSize="11"
              fontFamily={FONT}
              fontWeight="600"
            >{d.value.toLocaleString('he-IL', { maximumFractionDigits: 0 })}</text>
          </g>
        );
      })}
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

type TabKey =
  | 'suppliers'
  | 'products'
  | 'purchaseOrders'
  | 'contracts'
  | 'auctions'
  | 'negotiation'
  | 'bundling'
  | 'quality'
  | 'spend';

const TABS: Array<{ key: TabKey; label: string; icon: string }> = [
  { key: 'suppliers',      label: 'ספקים',             icon: '🏭' },
  { key: 'products',       label: 'מוצרים',            icon: '📦' },
  { key: 'purchaseOrders', label: 'הזמנות רכש',        icon: '📋' },
  { key: 'contracts',      label: 'חוזים',             icon: '📜' },
  { key: 'auctions',       label: 'מכרזים הפוכים',     icon: '⚡' },
  { key: 'negotiation',    label: 'משא ומתן',          icon: '🤝' },
  { key: 'bundling',       label: 'Bundling חכם',      icon: '📦' },
  { key: 'quality',        label: 'איכות',             icon: '✅' },
  { key: 'spend',          label: 'אנליטיקס הוצאה',    icon: '📊' },
];

type Snapshot = ReturnType<typeof getProcurementSnapshot>;

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function ProcurementHyperintelligencePage() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [tab, setTab] = useState<TabKey>('suppliers');
  // tick forces re-render each second so auction countdowns stay live
  const [, setTick] = useState(0);

  // Supplier side-panel
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);
  const [showSupplierForm, setShowSupplierForm] = useState(false);

  // Product detail
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);

  // Negotiation
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState('');
  const [replyPrice, setReplyPrice] = useState('');
  const [counterPrice, setCounterPrice] = useState('');

  // Intelligent Order panel
  const [showIntelligentOrder, setShowIntelligentOrder] = useState(false);
  const [ioProductId, setIoProductId] = useState('');
  const [ioQuantity, setIoQuantity] = useState('100');
  const [ioUrgency, setIoUrgency] = useState<'low' | 'medium' | 'high' | 'critical'>('medium');
  const [ioCanWait, setIoCanWait] = useState(false);
  const [ioMaxWait, setIoMaxWait] = useState('24');
  const [ioResult, setIoResult] = useState<any>(null);
  const [ioBusy, setIoBusy] = useState(false);

  // New supplier form
  const [newSupName, setNewSupName] = useState('');
  const [newSupLegal, setNewSupLegal] = useState('');
  const [newSupCountry, setNewSupCountry] = useState('IL');
  const [newSupCategories, setNewSupCategories] = useState('');
  const [newSupCurrency, setNewSupCurrency] = useState('ILS');
  const [newSupPaymentDays, setNewSupPaymentDays] = useState('60');
  const [newSupFinancial, setNewSupFinancial] = useState('75');
  const [newSupDelivery, setNewSupDelivery] = useState('0.9');
  const [newSupDefect, setNewSupDefect] = useState('0.02');
  const [newSupResponse, setNewSupResponse] = useState('8');

  // QC form
  const [qcProductId, setQcProductId] = useState('');
  const [qcSupplierId, setQcSupplierId] = useState('');
  const [qcReceived, setQcReceived] = useState('100');
  const [qcPassed, setQcPassed] = useState('98');
  const [qcRejected, setQcRejected] = useState('2');
  const [qcReasons, setQcReasons] = useState<string[]>([]);

  const DEFECT_OPTIONS = [
    'אריזה פגומה',
    'מימדים לא תקניים',
    'לחות',
    'חלודה',
    'שריטות',
    'חסר סימון',
    'תיעוד חסר',
    'כמות שגויה',
  ];

  // ─── Mount: seed + polling every 3s + countdown tick every 1s ───────────
  useEffect(() => {
    try {
      seedProcurementDemoData();
    } catch (e) {
      console.error('seedProcurementDemoData failed', e);
    }
    setSnapshot(getProcurementSnapshot());
    const poll = setInterval(() => {
      try {
        // tick auctions each poll so they auto-close
        Procurement.auctions.tickAll();
        setSnapshot(getProcurementSnapshot());
      } catch (e) {
        console.error('polling failed', e);
      }
    }, 3000);
    const ticker = setInterval(() => setTick(t => t + 1), 1000);
    return () => {
      clearInterval(poll);
      clearInterval(ticker);
    };
  }, []);

  // ─── Derived ───────────────────────────────────────────────────────────
  const suppliers = snapshot?.suppliers?.list ?? [];
  const products = snapshot?.products ?? [];
  const openAuctions = snapshot?.openAuctions ?? [];
  const activeBundles = snapshot?.activeBundles ?? [];
  const openSessions = snapshot?.openSessions ?? [];
  const pendingApprovals = snapshot?.pendingApprovals ?? [];
  const spend = snapshot?.spend;

  const purchaseOrders = useMemo<PurchaseOrder[]>(() => {
    try {
      return Array.from(Procurement.spend.purchaseOrders.values()).sort(
        (a, b) => b.createdAt.localeCompare(a.createdAt)
      );
    } catch {
      return [];
    }
  }, [snapshot]);

  const contracts = useMemo<Contract[]>(() => {
    try {
      return Array.from(Procurement.contracts.contracts.values()).sort(
        (a, b) => a.endDate.localeCompare(b.endDate)
      );
    } catch {
      return [];
    }
  }, [snapshot]);

  const closedAuctions = useMemo<ReverseAuction[]>(() => {
    try {
      return Array.from(Procurement.auctions.auctions.values())
        .filter(a => a.status === 'closed' || a.status === 'cancelled')
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    } catch {
      return [];
    }
  }, [snapshot]);

  const recentChecks = useMemo<QualityCheck[]>(() => {
    try {
      return Array.from(Procurement.quality.checks.values())
        .sort((a, b) => b.inspectedAt.localeCompare(a.inspectedAt))
        .slice(0, 20);
    } catch {
      return [];
    }
  }, [snapshot]);

  const worstOffenders = useMemo(() => {
    try {
      return Procurement.quality.worstOffenders(10);
    } catch {
      return [];
    }
  }, [snapshot]);

  const totalSavings = useMemo(() => {
    try {
      return Procurement.spend.totalSavings();
    } catch {
      return 0;
    }
  }, [snapshot]);

  const concentration = useMemo(() => {
    try {
      return Procurement.spend.supplierConcentration();
    } catch {
      return { topSharePct: 0, top3SharePct: 0 };
    }
  }, [snapshot]);

  const expiringContracts = useMemo(() => {
    try {
      return Procurement.contracts.checkExpiring(30);
    } catch {
      return [];
    }
  }, [snapshot]);

  const selectedSupplier = selectedSupplierId
    ? suppliers.find(x => x.id === selectedSupplierId)
    : null;

  const selectedProduct = selectedProductId
    ? products.find(p => p.id === selectedProductId)
    : null;

  const selectedSession = selectedSessionId
    ? openSessions.find(x => x.id === selectedSessionId)
    : null;

  // ─── Handlers ──────────────────────────────────────────────────────────
  const handleRefresh = () => {
    try {
      Procurement.auctions.tickAll();
      Procurement.contracts.markExpired();
      Procurement.suppliers.recomputeAllScores();
      setSnapshot(getProcurementSnapshot());
    } catch (e) {
      console.error('refresh failed', e);
    }
  };

  const handleRegisterSupplier = () => {
    if (!newSupName.trim()) return;
    const cats = newSupCategories.split(',').map(x => x.trim()).filter(Boolean);
    safeRegisterSupplier({
      name: newSupName,
      legalName: newSupLegal || undefined,
      country: newSupCountry || 'IL',
      categories: cats.length > 0 ? cats : ['general'],
      paymentTermsDays: parseInt(newSupPaymentDays, 10) || 60,
      currency: newSupCurrency || 'ILS',
      financialHealth: parseFloat(newSupFinancial) || 75,
      onTimeDeliveryRate: parseFloat(newSupDelivery) || 0.9,
      defectRate: parseFloat(newSupDefect) || 0.02,
      returnRate: 0.01,
      avgResponseHours: parseFloat(newSupResponse) || 8,
      countryRiskScore: 10,
      tags: [],
      isActive: true,
    });
    setShowSupplierForm(false);
    setNewSupName(''); setNewSupLegal(''); setNewSupCategories('');
    setSnapshot(getProcurementSnapshot());
  };

  const openIntelligentOrderFor = (productId: string) => {
    setIoProductId(productId);
    setIoQuantity('100');
    setIoUrgency('medium');
    setIoCanWait(false);
    setIoResult(null);
    setShowIntelligentOrder(true);
  };

  const runIntelligentOrder = async () => {
    if (!ioProductId) return;
    setIoBusy(true);
    setIoResult(null);
    const r = await safeIntelligentOrder({
      productId: ioProductId,
      quantity: parseInt(ioQuantity, 10) || 1,
      urgency: ioUrgency,
      canWait: ioCanWait,
      maxWaitHours: parseInt(ioMaxWait, 10) || 24,
    });
    setIoResult(r);
    setIoBusy(false);
    setSnapshot(getProcurementSnapshot());
  };

  const handleRunCheck = () => {
    if (!qcProductId) return;
    safeRunCheck({
      purchaseOrderId: `manual_${Date.now()}`,
      productId: qcProductId,
      quantityReceived: parseInt(qcReceived, 10) || 0,
      quantityPassed: parseInt(qcPassed, 10) || 0,
      quantityRejected: parseInt(qcRejected, 10) || 0,
      defectReasons: qcReasons,
      inspectedBy: 'kobi',
    });
    setQcReasons([]);
    setSnapshot(getProcurementSnapshot());
  };

  // ═══════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════
  if (!snapshot) {
    return (
      <div style={s.page}>
        <div style={s.emptyState}>טוען מערכת רכש היפר-אינטליגנטית…</div>
      </div>
    );
  }

  const sup = snapshot.suppliers;
  const dem = snapshot.demand;
  const auc = snapshot.auctions;
  const bnd = snapshot.bundling;
  const reo = snapshot.reorder;
  const con = snapshot.contracts;
  const qua = snapshot.quality;

  return (
    <div style={s.page}>
      {/* ═══════════ HEADER ═══════════ */}
      <div style={s.header}>
        <div style={s.titleWrap}>
          <h1 style={s.title}>
            <span style={s.liveDot} />
            רכש היפר-אינטליגנטי
          </h1>
          <p style={s.subtitle}>
            ProcurementHyperintelligence — 9 engines, one brain ·
            <span style={{ color: COLORS.accent, marginRight: 6 }}>טכנו כל עוזי</span>
          </p>
        </div>
        <div style={s.headerRight}>
          <div style={s.generatedAt}>
            עודכן: {fmtDateTime(snapshot.generatedAt)}
          </div>
          <button style={s.refreshBtn} onClick={handleRefresh}>רענן</button>
          <button
            style={s.killerBtn}
            onClick={() => {
              setIoProductId(products[0]?.id ?? '');
              setShowIntelligentOrder(true);
              setIoResult(null);
            }}
          >⚡ Intelligent Order</button>
        </div>
      </div>

      {/* ═══════════ KPI STRIP ═══════════ */}
      <div style={s.kpiStrip}>
        <KpiCard
          label="סה״כ ספקים"
          value={sup.total}
          hint={`${sup.preferred}מ / ${sup.approved}א / ${sup.watch}ב / ${sup.avoid}ל`}
        />
        <KpiCard label="מועדפים" value={sup.preferred} color={COLORS.cyan} />
        <KpiCard label="במעקב" value={sup.watch} color={COLORS.yellow} />
        <KpiCard label="להימנע" value={sup.avoid} color={COLORS.red} />
        <KpiCard label="מוצרים" value={dem.products} />
        <KpiCard
          label="נדרש מילוי"
          value={dem.needingReorder}
          color={dem.needingReorder > 0 ? COLORS.red : COLORS.cyan}
        />
        <KpiCard
          label="מכרזים פתוחים"
          value={auc.open}
          color={auc.open > 0 ? COLORS.purple : COLORS.text}
        />
        <KpiCard
          label="חסכון ממכרזים"
          value={ils(auc.totalSavings)}
          color={COLORS.cyan}
        />
        <KpiCard label="Bundles פעילים" value={bnd.active} />
        <KpiCard label="חוזים פעילים" value={con.active} />
        <KpiCard
          label="חוזים פוקעים"
          value={con.expiringSoon}
          color={con.expiringSoon > 0 ? COLORS.yellow : COLORS.text}
          hint="תוך 30 יום"
        />
        <KpiCard
          label="אישורים ממתינים"
          value={reo.pendingApprovals}
          color={reo.pendingApprovals > 0 ? COLORS.yellow : COLORS.text}
        />
        <KpiCard
          label="הוצאה 90 יום"
          value={ils(spend?.totalSpend ?? 0)}
          big
          hint={`${purchaseOrders.length} הזמנות`}
        />
        <KpiCard label="בדיקות איכות" value={qua.totalChecks} />
        <KpiCard
          label="חסכון כולל"
          value={ils(totalSavings)}
          color={COLORS.cyan}
          hint="12 חודשים"
        />
      </div>

      {/* ═══════════ TAB BAR ═══════════ */}
      <div style={s.tabBar}>
        {TABS.map(t => (
          <button
            key={t.key}
            style={{ ...s.tabBtn, ...(tab === t.key ? s.tabBtnActive : {}) }}
            onClick={() => setTab(t.key)}
          >
            <span>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      {/* ═══════════ TAB: SUPPLIERS ═══════════ */}
      {tab === 'suppliers' && (
        <div style={s.twoCol}>
          <div style={s.panel}>
            <div style={s.panelHeader}>
              <h3 style={s.panelTitle}>מאגר ספקים · {suppliers.length}</h3>
              <button
                style={s.btn}
                onClick={() => setShowSupplierForm(true)}
              >+ רישום ספק חדש</button>
            </div>
            {suppliers.length === 0 ? (
              <div style={s.emptyState}>אין ספקים רשומים</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={s.table}>
                  <thead style={s.thead}>
                    <tr>
                      <th style={s.th}>שם</th>
                      <th style={s.th}>קטגוריות</th>
                      <th style={s.th}>מדינה</th>
                      <th style={s.th}>מטבע</th>
                      <th style={s.th}>תשלום</th>
                      <th style={s.th}>ציון</th>
                      <th style={s.th}>רצועה</th>
                      <th style={s.th}>איכות</th>
                      <th style={s.th}>אספקה</th>
                      <th style={s.th}>פיננסי</th>
                      <th style={s.th}>תגובה</th>
                      <th style={s.th}>הוצאה</th>
                      <th style={s.th}>פעולות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {suppliers.map(sp => {
                      const sc = sp.score;
                      const isSelected = sp.id === selectedSupplierId;
                      return (
                        <tr
                          key={sp.id}
                          style={{
                            cursor: 'pointer',
                            background: isSelected ? 'rgba(255,165,0,0.08)' : undefined,
                          }}
                          onClick={() => setSelectedSupplierId(sp.id)}
                        >
                          <td style={s.td}>
                            <div style={{ fontWeight: 600 }}>{sp.name}</div>
                            {sp.legalName && (
                              <div style={{ fontSize: 10, color: COLORS.textDim }}>{sp.legalName}</div>
                            )}
                          </td>
                          <td style={s.td}>
                            {sp.categories.slice(0, 2).map(c => (
                              <span key={c} style={s.pill}>{c}</span>
                            ))}
                            {sp.categories.length > 2 && (
                              <span style={s.pill}>+{sp.categories.length - 2}</span>
                            )}
                          </td>
                          <td style={s.td}>{sp.country}</td>
                          <td style={s.td}>{sp.currency}</td>
                          <td style={s.td}>{sp.paymentTermsDays}י</td>
                          <td style={s.td}>
                            {sc ? <ScoreBar value={sc.overall} /> : <span style={{ color: COLORS.textDim }}>—</span>}
                          </td>
                          <td style={s.td}>{sc ? <BandPill band={sc.band} /> : '—'}</td>
                          <td style={s.td}>{sc ? sc.factors.quality.toFixed(0) : '—'}</td>
                          <td style={s.td}>{sc ? sc.factors.delivery.toFixed(0) : '—'}</td>
                          <td style={s.td}>{sc ? sc.factors.financial.toFixed(0) : '—'}</td>
                          <td style={s.td}>{sc ? sc.factors.response.toFixed(0) : '—'}</td>
                          <td style={s.td}>{ils(sp.totalSpend)}</td>
                          <td style={s.td} onClick={e => e.stopPropagation()}>
                            <button
                              style={s.btnGhost}
                              onClick={() => {
                                safeRecomputeScore(sp.id);
                                setSnapshot(getProcurementSnapshot());
                              }}
                            >חשב מחדש</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* SIDE PANEL */}
          <div style={s.sidePanel}>
            {!selectedSupplier ? (
              <div style={s.emptyState}>בחר ספק להצגת פרטים</div>
            ) : (
              <>
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: COLORS.text }}>
                    {selectedSupplier.name}
                  </div>
                  <div style={{ fontSize: 11, color: COLORS.textDim, marginTop: 2 }}>
                    {selectedSupplier.legalName ?? selectedSupplier.id}
                  </div>
                  <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {selectedSupplier.score && <BandPill band={selectedSupplier.score.band} />}
                    {selectedSupplier.tags.map(t => (
                      <span key={t} style={s.pill}>{t}</span>
                    ))}
                  </div>
                </div>

                {selectedSupplier.score && (
                  <>
                    <div style={s.subcard}>
                      <div style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 6 }}>ציון כולל</div>
                      <div style={{
                        fontSize: 36, fontWeight: 800,
                        color: scoreColor(selectedSupplier.score.overall),
                      }}>{selectedSupplier.score.overall.toFixed(1)}</div>
                    </div>

                    <div style={{ marginTop: 12, marginBottom: 8, fontSize: 12, color: COLORS.textMuted, fontWeight: 600 }}>
                      גורמי סיכון
                    </div>
                    {(['financial', 'delivery', 'quality', 'concentration', 'response', 'geopolitical'] as const).map(k => {
                      const val = selectedSupplier.score!.factors[k];
                      const labels: Record<string, string> = {
                        financial: 'פיננסי',
                        delivery: 'אספקה',
                        quality: 'איכות',
                        concentration: 'ריכוזיות',
                        response: 'תגובה',
                        geopolitical: 'גיאו-פוליטי',
                      };
                      return (
                        <div key={k} style={s.barRow}>
                          <div style={s.barLabel}>{labels[k]}</div>
                          <div style={s.barTrack}>
                            <div style={{
                              ...s.barFill,
                              width: `${val}%`,
                              background: scoreColor(val),
                            }} />
                          </div>
                          <div style={s.barCount}>{val.toFixed(0)}</div>
                        </div>
                      );
                    })}

                    {selectedSupplier.score.notes.length > 0 && (
                      <div style={{ marginTop: 12 }}>
                        <div style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 6 }}>הערות</div>
                        {selectedSupplier.score.notes.map((n, i) => (
                          <div key={i} style={{
                            fontSize: 11, color: COLORS.yellow, padding: '6px 10px',
                            background: 'rgba(246,182,74,0.08)',
                            border: `1px solid ${COLORS.yellow}22`,
                            borderRadius: 5, marginBottom: 4,
                          }}>⚠ {n}</div>
                        ))}
                      </div>
                    )}
                  </>
                )}

                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 6 }}>מידע</div>
                  <div style={{ fontSize: 12, color: COLORS.text, lineHeight: 1.7 }}>
                    <div>מדינה: <b>{selectedSupplier.country}</b></div>
                    <div>מטבע: <b>{selectedSupplier.currency}</b></div>
                    <div>תנאי תשלום: <b>{selectedSupplier.paymentTermsDays} ימים</b></div>
                    <div>דירוג אשראי: <b>{selectedSupplier.creditRating ?? '—'}</b></div>
                    <div>אחוז אספקה בזמן: <b>{pct(selectedSupplier.onTimeDeliveryRate * 100)}</b></div>
                    <div>שיעור פגמים: <b>{pct(selectedSupplier.defectRate * 100)}</b></div>
                    <div>זמן תגובה ממוצע: <b>{selectedSupplier.avgResponseHours} שעות</b></div>
                    <div>הוצאה מצטברת: <b>{ils(selectedSupplier.totalSpend)}</b></div>
                    <div>רכישות בעבר: <b>{selectedSupplier.pastPurchasesCount}</b></div>
                    <div>נוצר: {fmtDate(selectedSupplier.createdAt)}</div>
                  </div>
                </div>

                {selectedSupplier.priceHistory.length > 0 && (
                  <div style={{ marginTop: 14 }}>
                    <div style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 6 }}>
                      היסטוריית מחירים ({selectedSupplier.priceHistory.length})
                    </div>
                    <Sparkline
                      data={selectedSupplier.priceHistory.slice(-20).map(p => p.unitPrice)}
                      stroke={COLORS.accent}
                    />
                  </div>
                )}

                <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    style={s.btn}
                    onClick={() => {
                      safeRecomputeScore(selectedSupplier.id);
                      setSnapshot(getProcurementSnapshot());
                    }}
                  >חשב ציון מחדש</button>
                  {selectedSupplier.isActive && (
                    <button
                      style={s.btnRed}
                      onClick={() => {
                        if (confirm(`להשבית את הספק ${selectedSupplier.name}?`)) {
                          safeDeactivateSupplier(selectedSupplier.id, 'manual');
                          setSnapshot(getProcurementSnapshot());
                        }
                      }}
                    >השבת ספק</button>
                  )}
                  <button
                    style={s.btnGhost}
                    onClick={() => setSelectedSupplierId(null)}
                  >סגור</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ═══════════ TAB: PRODUCTS ═══════════ */}
      {tab === 'products' && (
        <div style={s.twoCol}>
          <div>
            <div style={s.panel}>
              <div style={s.panelHeader}>
                <h3 style={s.panelTitle}>מוצרים · {products.length}</h3>
                <div style={s.panelMeta}>נדרש מילוי: {dem.needingReorder}</div>
              </div>
              {products.length === 0 ? (
                <div style={s.emptyState}>אין מוצרים רשומים</div>
              ) : (
                <div style={s.cardGrid}>
                  {products.map(p => {
                    const needsReorder = p.currentStock <= p.reorderPoint;
                    const daysLeft = p.annualDemand > 0
                      ? Math.round(p.currentStock / (p.annualDemand / 365))
                      : Infinity;
                    const ropPct = p.reorderPoint > 0
                      ? Math.min(100, (p.currentStock / (p.reorderPoint * 2)) * 100)
                      : 50;
                    const eoq = (() => {
                      try {
                        return Procurement.demand.eoqCache.get(p.id)?.eoq
                          ?? Procurement.demand.computeEOQ(p.id)?.eoq
                          ?? 0;
                      } catch {
                        return 0;
                      }
                    })();
                    const isSelected = p.id === selectedProductId;
                    return (
                      <div
                        key={p.id}
                        style={{
                          ...s.card,
                          borderColor: needsReorder ? COLORS.red : (isSelected ? COLORS.accent : COLORS.border),
                          borderWidth: needsReorder || isSelected ? 2 : 1,
                        }}
                        onClick={() => setSelectedProductId(p.id)}
                      >
                        <div style={s.cardHeader}>
                          <div>
                            <h4 style={s.cardTitle}>{p.name}</h4>
                            <div style={s.cardSubtitle}>{p.sku} · {p.category}</div>
                          </div>
                          {needsReorder && (
                            <span style={{ color: COLORS.red, fontSize: 18 }}>▲</span>
                          )}
                        </div>
                        <div style={s.cardRow}>
                          <span>מלאי נוכחי</span>
                          <span style={{ color: COLORS.text, fontWeight: 600 }}>
                            {num(p.currentStock)} {p.unit}
                          </span>
                        </div>
                        <div style={{ ...s.barTrack, marginBottom: 8 }}>
                          <div style={{
                            ...s.barFill,
                            width: `${ropPct}%`,
                            background: needsReorder ? COLORS.red : COLORS.cyan,
                          }} />
                        </div>
                        <div style={s.cardRow}>
                          <span>נקודת הזמנה</span>
                          <span>{num(p.reorderPoint)}</span>
                        </div>
                        <div style={s.cardRow}>
                          <span>ימים עד מחסור</span>
                          <span style={{
                            color: daysLeft < 14 ? COLORS.red : COLORS.text,
                            fontWeight: 600,
                          }}>{daysLeft === Infinity ? '∞' : daysLeft}</span>
                        </div>
                        <div style={s.cardRow}>
                          <span>EOQ אופטימלי</span>
                          <span style={{ color: COLORS.accent, fontWeight: 600 }}>
                            {num(eoq)}
                          </span>
                        </div>
                        <div style={s.cardRow}>
                          <span>מחיר יחידה</span>
                          <span>{ils(p.lastUnitPrice)}</span>
                        </div>
                        <div style={s.cardRow}>
                          <span>זמן אספקה</span>
                          <span>{p.leadTimeDays} ימים</span>
                        </div>
                        <div style={{ marginTop: 10, display: 'flex', gap: 6 }}>
                          <button
                            style={{ ...s.btn, width: '100%' }}
                            onClick={e => {
                              e.stopPropagation();
                              openIntelligentOrderFor(p.id);
                            }}
                          >⚡ הזמן עכשיו</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* PRODUCT DETAIL */}
          <div style={s.sidePanel}>
            {!selectedProduct ? (
              <div style={s.emptyState}>בחר מוצר להצגת חיזוי ביקוש</div>
            ) : (
              <>
                <div style={{ fontSize: 18, fontWeight: 700, color: COLORS.text, marginBottom: 4 }}>
                  {selectedProduct.name}
                </div>
                <div style={{ fontSize: 11, color: COLORS.textDim, marginBottom: 12 }}>
                  SKU: {selectedProduct.sku} · {selectedProduct.category} / {selectedProduct.subcategory}
                </div>

                {(() => {
                  const f = (() => {
                    try {
                      return Procurement.demand.forecast(selectedProduct.id, 30);
                    } catch {
                      return null;
                    }
                  })();
                  if (!f) return <div style={s.emptyState}>אין חיזוי זמין</div>;
                  return (
                    <>
                      <div style={s.subcard}>
                        <div style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 8 }}>
                          חיזוי ביקוש (30 יום)
                        </div>
                        <Sparkline
                          data={f.forecastDaily}
                          width={240}
                          height={70}
                          stroke={COLORS.blue}
                        />
                        <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 8 }}>
                          ביקוש בסיסי: <b style={{ color: COLORS.text }}>{num(f.baseline)}</b> / יום
                        </div>
                        <div style={{ fontSize: 11, color: COLORS.textMuted }}>
                          מגמה: <b style={{ color: f.trend > 0 ? COLORS.cyan : COLORS.red }}>
                            {f.trend > 0 ? '▲' : '▼'} {num(Math.abs(f.trend))}
                          </b>
                        </div>
                        <div style={{ fontSize: 11, color: COLORS.textMuted }}>
                          עונתיות: <b style={{ color: COLORS.text }}>{f.seasonalityIndex.toFixed(2)}x</b>
                        </div>
                        <div style={{ fontSize: 11, color: COLORS.textMuted }}>
                          רווח ביטחון: [{num(f.confidenceLo)} – {num(f.confidenceHi)}]
                        </div>
                      </div>
                    </>
                  );
                })()}

                <div style={s.subcard}>
                  <div style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 6 }}>
                    EOQ & ביטחון
                  </div>
                  {(() => {
                    const eoq = (() => {
                      try {
                        return Procurement.demand.computeEOQ(selectedProduct.id);
                      } catch {
                        return null;
                      }
                    })();
                    if (!eoq) return <div style={{ fontSize: 11 }}>—</div>;
                    return (
                      <div style={{ fontSize: 12, lineHeight: 1.8 }}>
                        <div>EOQ: <b style={{ color: COLORS.accent }}>{num(eoq.eoq)}</b></div>
                        <div>הזמנות שנתיות: <b>{num(eoq.annualOrders)}</b></div>
                        <div>מלאי ביטחון: <b>{num(eoq.safetyStock)}</b></div>
                        <div>נקודת הזמנה: <b>{num(eoq.reorderPoint)}</b></div>
                        <div>עלות שנתית כוללת: <b>{ils(eoq.totalCost)}</b></div>
                      </div>
                    );
                  })()}
                </div>

                <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                  <button
                    style={s.btn}
                    onClick={() => openIntelligentOrderFor(selectedProduct.id)}
                  >⚡ הזמן עכשיו</button>
                  <button
                    style={s.btnGhost}
                    onClick={() => setSelectedProductId(null)}
                  >סגור</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ═══════════ TAB: PURCHASE ORDERS ═══════════ */}
      {tab === 'purchaseOrders' && (
        <div style={s.panel}>
          <div style={s.panelHeader}>
            <h3 style={s.panelTitle}>הזמנות רכש · {purchaseOrders.length}</h3>
            <div style={s.panelMeta}>סה״כ הוצאה: {ils(spend?.totalSpend)}</div>
          </div>
          {purchaseOrders.length === 0 ? (
            <div style={s.emptyState}>אין הזמנות רכש במערכת</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={s.table}>
                <thead style={s.thead}>
                  <tr>
                    <th style={s.th}>מספר</th>
                    <th style={s.th}>ספק</th>
                    <th style={s.th}>סטטוס</th>
                    <th style={s.th}>מקור</th>
                    <th style={s.th}>פריטים</th>
                    <th style={s.th}>סה״כ</th>
                    <th style={s.th}>נוצר</th>
                    <th style={s.th}>אספקה צפויה</th>
                  </tr>
                </thead>
                <tbody>
                  {purchaseOrders.map(po => {
                    const statusMeta = PO_STATUS_LABELS[po.status] ?? { label: po.status, color: COLORS.textDim };
                    const supplier = suppliers.find(x => x.id === po.supplierId);
                    return (
                      <tr key={po.id}>
                        <td style={s.td}>
                          <div style={{ fontFamily: '"SF Mono", monospace', fontWeight: 600 }}>
                            {po.poNumber}
                          </div>
                        </td>
                        <td style={s.td}>{supplier?.name ?? po.supplierId}</td>
                        <td style={s.td}>
                          <StatusPill label={statusMeta.label} color={statusMeta.color} />
                        </td>
                        <td style={s.td}>
                          <span style={s.pill}>{po.source}</span>
                        </td>
                        <td style={s.td}>{po.lines.length}</td>
                        <td style={s.td}>
                          <b>{ils(po.total)}</b>
                          <div style={{ fontSize: 10, color: COLORS.textDim }}>{po.currency}</div>
                        </td>
                        <td style={s.td}>{fmtDate(po.createdAt)}</td>
                        <td style={s.td}>{fmtDate(po.expectedDeliveryAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ═══════════ TAB: CONTRACTS ═══════════ */}
      {tab === 'contracts' && (
        <div>
          {expiringContracts.length > 0 && (
            <div style={{
              ...s.panel,
              borderColor: COLORS.yellow,
              background: 'rgba(246,182,74,0.06)',
            }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.yellow, marginBottom: 8 }}>
                ⚠ {expiringContracts.length} חוזים פוקעים ב-30 הימים הקרובים
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {expiringContracts.map(({ contract, daysLeft }) => (
                  <span key={contract.id} style={{
                    ...s.chip,
                    background: `${COLORS.yellow}22`,
                    color: COLORS.yellow,
                    border: `1px solid ${COLORS.yellow}55`,
                  }}>
                    {contract.contractNumber} · {daysLeft}י
                  </span>
                ))}
              </div>
            </div>
          )}

          <div style={s.panel}>
            <div style={s.panelHeader}>
              <h3 style={s.panelTitle}>חוזים · {contracts.length}</h3>
              <div style={s.panelMeta}>
                מחויבות כוללת: {ils(con.totalCommitted)}
              </div>
            </div>
            {contracts.length === 0 ? (
              <div style={s.emptyState}>אין חוזים במערכת</div>
            ) : (
              <div style={s.cardGrid}>
                {contracts.map(c => {
                  const statusMeta = CONTRACT_STATUS_LABELS[c.status] ?? { label: c.status, color: COLORS.textDim };
                  const supplier = suppliers.find(x => x.id === c.supplierId);
                  const daysLeft = daysBetween(c.endDate);
                  const warningBand = daysLeft < 30 ? COLORS.yellow : daysLeft < 0 ? COLORS.red : COLORS.cyan;
                  return (
                    <div key={c.id} style={{
                      ...s.card,
                      cursor: 'default',
                      borderColor: daysLeft < 30 && daysLeft >= 0 ? COLORS.yellow : COLORS.border,
                    }}>
                      <div style={s.cardHeader}>
                        <div>
                          <h4 style={s.cardTitle}>{c.contractNumber}</h4>
                          <div style={s.cardSubtitle}>{supplier?.name ?? c.supplierId}</div>
                        </div>
                        <StatusPill label={statusMeta.label} color={statusMeta.color} />
                      </div>
                      <div style={s.cardRow}>
                        <span>מחויבות</span>
                        <span style={{ color: COLORS.text, fontWeight: 600 }}>{ils(c.totalValue)}</span>
                      </div>
                      <div style={s.cardRow}>
                        <span>תוקף</span>
                        <span>{fmtDate(c.startDate)} – {fmtDate(c.endDate)}</span>
                      </div>
                      <div style={s.cardRow}>
                        <span>תנאים</span>
                        <span>{c.terms.length}</span>
                      </div>
                      <div style={s.cardRow}>
                        <span>SLA אספקה</span>
                        <span>{pct(c.slaOnTimePct * 100)}</span>
                      </div>
                      <div style={s.cardRow}>
                        <span>SLA פגמים מקס</span>
                        <span>{pct(c.slaDefectPct * 100)}</span>
                      </div>
                      <div style={s.cardRow}>
                        <span>חידוש אוטו</span>
                        <span>{c.autoRenewal ? 'כן' : 'לא'}</span>
                      </div>
                      <div style={{
                        marginTop: 8,
                        padding: '6px 10px',
                        background: `${warningBand}18`,
                        border: `1px solid ${warningBand}55`,
                        borderRadius: 6,
                        fontSize: 11,
                        color: warningBand,
                        fontWeight: 600,
                      }}>
                        {daysLeft < 0
                          ? `פג תוקף לפני ${Math.abs(daysLeft)} ימים`
                          : `${daysLeft} ימים להתראה`}
                      </div>
                      <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button
                          style={s.btnGreen}
                          onClick={() => {
                            safeRenewContract(c.id, 12);
                            setSnapshot(getProcurementSnapshot());
                          }}
                        >חדש +12 חו׳</button>
                        {c.status === 'active' && (
                          <button
                            style={s.btnYellow}
                            onClick={() => {
                              safeSuspendContract(c.id, 'manual hold');
                              setSnapshot(getProcurementSnapshot());
                            }}
                          >השהה</button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════ TAB: AUCTIONS ═══════════ */}
      {tab === 'auctions' && (
        <div>
          <div style={s.panel}>
            <div style={s.panelHeader}>
              <h3 style={s.panelTitle}>מכרזים פתוחים · {openAuctions.length}</h3>
              <div style={s.panelMeta}>ציר זמן פעיל</div>
            </div>
            {openAuctions.length === 0 ? (
              <div style={s.emptyState}>אין מכרזים פתוחים</div>
            ) : (
              <div style={s.cardGrid}>
                {openAuctions.map(a => {
                  const product = products.find(p => p.id === a.productId);
                  const lowest = a.bids.length > 0
                    ? a.bids.reduce((lo, b) => b.unitPrice < lo.unitPrice ? b : lo)
                    : null;
                  return (
                    <div key={a.id} style={{
                      ...s.card,
                      cursor: 'default',
                      borderColor: COLORS.purple,
                    }}>
                      <div style={s.cardHeader}>
                        <div>
                          <h4 style={s.cardTitle}>{product?.name ?? a.productId}</h4>
                          <div style={s.cardSubtitle}>{product?.sku}</div>
                        </div>
                        <span style={{
                          ...s.chip,
                          background: 'rgba(139,127,255,0.15)',
                          color: COLORS.purple,
                          border: `1px solid ${COLORS.purple}55`,
                        }}>{a.status}</span>
                      </div>
                      <div style={{
                        fontSize: 22, fontWeight: 800, color: COLORS.purple,
                        textAlign: 'center', fontFamily: '"SF Mono", monospace',
                        padding: '10px 0', background: 'rgba(139,127,255,0.08)',
                        borderRadius: 6, marginBottom: 10,
                      }}>
                        ⏱ {fmtCountdown(a.endAt)}
                      </div>
                      <div style={s.cardRow}>
                        <span>כמות</span>
                        <span style={{ color: COLORS.text, fontWeight: 600 }}>{num(a.quantity)}</span>
                      </div>
                      <div style={s.cardRow}>
                        <span>מחיר תקרה</span>
                        <span>{ils(a.ceilingPrice)} / יח׳</span>
                      </div>
                      <div style={s.cardRow}>
                        <span>הצעה נמוכה</span>
                        <span style={{ color: COLORS.cyan, fontWeight: 700 }}>
                          {lowest ? ils(lowest.unitPrice) : '—'}
                        </span>
                      </div>
                      <div style={s.cardRow}>
                        <span>משתתפים</span>
                        <span>{a.participantIds.length}</span>
                      </div>
                      <div style={s.cardRow}>
                        <span>הצעות</span>
                        <span>{a.bids.length}</span>
                      </div>
                      <div style={s.cardRow}>
                        <span>הארכות</span>
                        <span>{a.extensionsUsed}/{a.maxExtensions}</span>
                      </div>

                      {a.bids.length > 0 && (
                        <div style={{
                          marginTop: 10, padding: 8,
                          background: COLORS.panelAlt, borderRadius: 6,
                          maxHeight: 120, overflowY: 'auto',
                        }}>
                          <div style={{ fontSize: 10, color: COLORS.textMuted, marginBottom: 4 }}>היסטוריית הצעות</div>
                          {a.bids.slice(-8).reverse().map(b => {
                            const sp = suppliers.find(x => x.id === b.supplierId);
                            return (
                              <div key={b.id} style={{
                                fontSize: 11,
                                padding: '4px 0',
                                borderBottom: `1px solid ${COLORS.border}`,
                                display: 'flex',
                                justifyContent: 'space-between',
                              }}>
                                <span style={{ color: COLORS.textMuted }}>
                                  {sp?.name.slice(0, 14) ?? b.supplierId.slice(0, 8)}
                                </span>
                                <b style={{ color: COLORS.cyan }}>{ils(b.unitPrice)}</b>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      <div style={{ marginTop: 10, display: 'flex', gap: 6 }}>
                        <button
                          style={s.btnRed}
                          onClick={() => {
                            if (confirm('לסגור מכרז עכשיו?')) {
                              safeCloseAuction(a.id);
                              setSnapshot(getProcurementSnapshot());
                            }
                          }}
                        >סגור מכרז</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div style={s.panel}>
            <div style={s.panelHeader}>
              <h3 style={s.panelTitle}>מכרזים שהסתיימו · {closedAuctions.length}</h3>
              <div style={s.panelMeta}>חסכון כולל: {ils(auc.totalSavings)}</div>
            </div>
            {closedAuctions.length === 0 ? (
              <div style={s.emptyState}>אין מכרזים שהסתיימו</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={s.table}>
                  <thead style={s.thead}>
                    <tr>
                      <th style={s.th}>מוצר</th>
                      <th style={s.th}>כמות</th>
                      <th style={s.th}>תקרה</th>
                      <th style={s.th}>זוכה</th>
                      <th style={s.th}>הצעה</th>
                      <th style={s.th}>חסכון</th>
                      <th style={s.th}>משתתפים</th>
                      <th style={s.th}>סיום</th>
                    </tr>
                  </thead>
                  <tbody>
                    {closedAuctions.map(a => {
                      const product = products.find(p => p.id === a.productId);
                      const winning = a.bids.find(b => b.id === a.winningBidId);
                      const winner = winning ? suppliers.find(x => x.id === winning.supplierId) : null;
                      return (
                        <tr key={a.id}>
                          <td style={s.td}>{product?.name ?? a.productId}</td>
                          <td style={s.td}>{num(a.quantity)}</td>
                          <td style={s.td}>{ils(a.ceilingPrice)}</td>
                          <td style={s.td}>{winner?.name ?? '—'}</td>
                          <td style={s.td}>
                            <b style={{ color: COLORS.cyan }}>
                              {winning ? ils(winning.unitPrice) : '—'}
                            </b>
                          </td>
                          <td style={s.td}>
                            <b style={{ color: COLORS.cyan }}>
                              {ils(a.savingsEstimate ?? 0)}
                            </b>
                          </td>
                          <td style={s.td}>{a.participantIds.length}</td>
                          <td style={s.td}>{fmtDate(a.endAt)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════ TAB: NEGOTIATION ═══════════ */}
      {tab === 'negotiation' && (
        <div style={s.twoCol}>
          <div style={s.panel}>
            <div style={s.panelHeader}>
              <h3 style={s.panelTitle}>סשנים פתוחים · {openSessions.length}</h3>
              <div style={s.panelMeta}>לחץ לבחירה</div>
            </div>
            {openSessions.length === 0 ? (
              <div style={s.emptyState}>אין משא ומתן פתוח כרגע</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {openSessions.map(ses => {
                  const supplier = suppliers.find(x => x.id === ses.supplierId);
                  const product = products.find(p => p.id === ses.productId);
                  const isSelected = ses.id === selectedSessionId;
                  const deltaPct = ((ses.ceilingPrice - ses.targetPrice) / ses.ceilingPrice) * 100;
                  return (
                    <div
                      key={ses.id}
                      style={{
                        ...s.subcard,
                        cursor: 'pointer',
                        borderColor: isSelected ? COLORS.accent : COLORS.border,
                        borderWidth: isSelected ? 2 : 1,
                      }}
                      onClick={() => setSelectedSessionId(ses.id)}
                    >
                      <div style={{
                        display: 'flex', justifyContent: 'space-between',
                        alignItems: 'center', marginBottom: 8,
                      }}>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700 }}>{supplier?.name ?? ses.supplierId}</div>
                          <div style={{ fontSize: 11, color: COLORS.textMuted }}>
                            {product?.name ?? ses.productId}
                          </div>
                        </div>
                        <span style={s.pill}>{NEG_STRATEGY_LABELS[ses.strategy] ?? ses.strategy}</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, fontSize: 11 }}>
                        <div>
                          <div style={{ color: COLORS.textDim }}>כמות</div>
                          <b>{num(ses.quantity)}</b>
                        </div>
                        <div>
                          <div style={{ color: COLORS.textDim }}>יעד</div>
                          <b style={{ color: COLORS.accent }}>{ils(ses.targetPrice)}</b>
                        </div>
                        <div>
                          <div style={{ color: COLORS.textDim }}>תקרה</div>
                          <b>{ils(ses.ceilingPrice)}</b>
                        </div>
                      </div>
                      <div style={{
                        marginTop: 8, padding: '4px 8px',
                        background: `${COLORS.cyan}15`,
                        color: COLORS.cyan,
                        borderRadius: 4,
                        fontSize: 11, fontWeight: 600, textAlign: 'center',
                      }}>
                        הנחה יעד: {pct(deltaPct)}
                      </div>
                      <div style={{ fontSize: 10, color: COLORS.textDim, marginTop: 6 }}>
                        {ses.messages.length} הודעות · {fmtDate(ses.createdAt)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Thread */}
          <div style={s.sidePanel}>
            {!selectedSession ? (
              <div style={s.emptyState}>בחר סשן להצגת השיחה</div>
            ) : (
              <>
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>
                    {suppliers.find(x => x.id === selectedSession.supplierId)?.name ?? selectedSession.supplierId}
                  </div>
                  <div style={{ fontSize: 11, color: COLORS.textDim, marginTop: 2 }}>
                    {products.find(p => p.id === selectedSession.productId)?.name} · {NEG_STRATEGY_LABELS[selectedSession.strategy]}
                  </div>
                </div>

                <div style={{
                  maxHeight: 280, overflowY: 'auto', marginBottom: 12,
                  padding: 8, background: COLORS.bg, borderRadius: 8,
                }}>
                  {selectedSession.messages.length === 0 ? (
                    <div style={s.emptyState}>אין הודעות</div>
                  ) : selectedSession.messages.map(m => {
                    const isBot = m.sender === 'bot';
                    const bg = isBot ? 'rgba(255,165,0,0.12)' : m.sender === 'supplier' ? 'rgba(20,204,187,0.12)' : 'rgba(139,127,255,0.12)';
                    const color = isBot ? COLORS.accent : m.sender === 'supplier' ? COLORS.cyan : COLORS.purple;
                    return (
                      <div key={m.id} style={{
                        ...s.messageRow,
                        background: bg,
                        borderLeft: `3px solid ${color}`,
                      }}>
                        <div style={{
                          fontSize: 10, color, fontWeight: 700,
                          marginBottom: 4, textTransform: 'uppercase',
                        }}>
                          {m.sender === 'bot' ? 'Bot' : m.sender === 'supplier' ? 'ספק' : 'אנוש'}
                          {m.priceOffered && ` · ${ils(m.priceOffered)}`}
                        </div>
                        <div style={{ color: COLORS.text, fontSize: 12 }}>{m.body}</div>
                        <div style={{ fontSize: 9, color: COLORS.textDim, marginTop: 4 }}>
                          {fmtDateTime(m.at)}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div style={{ marginBottom: 12 }}>
                  <label style={s.label}>רשום תגובת ספק</label>
                  <input
                    style={s.input}
                    placeholder="גוף ההודעה"
                    value={replyBody}
                    onChange={e => setReplyBody(e.target.value)}
                  />
                  <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                    <input
                      style={{ ...s.input, flex: 1 }}
                      placeholder="מחיר מוצע"
                      type="number"
                      value={replyPrice}
                      onChange={e => setReplyPrice(e.target.value)}
                    />
                    <button
                      style={s.btn}
                      onClick={() => {
                        if (replyBody.trim()) {
                          safeRecordReply(
                            selectedSession.id,
                            replyBody,
                            replyPrice ? parseFloat(replyPrice) : undefined
                          );
                          setReplyBody('');
                          setReplyPrice('');
                          setSnapshot(getProcurementSnapshot());
                        }
                      }}
                    >שמור</button>
                  </div>
                </div>

                <div style={{ marginBottom: 12 }}>
                  <label style={s.label}>counter offer</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      style={{ ...s.input, flex: 1 }}
                      placeholder="מחיר יעד חדש"
                      type="number"
                      value={counterPrice}
                      onChange={e => setCounterPrice(e.target.value)}
                    />
                    <button
                      style={s.btn}
                      onClick={() => {
                        if (counterPrice) {
                          safeCounterOffer(selectedSession.id, parseFloat(counterPrice));
                          setCounterPrice('');
                          setSnapshot(getProcurementSnapshot());
                        }
                      }}
                    >שלח Counter</button>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button
                    style={s.btnGreen}
                    onClick={() => {
                      const fp = prompt('מחיר סופי מוסכם?', String(selectedSession.targetPrice));
                      if (fp) {
                        safeCloseSession(selectedSession.id, 'agreed', parseFloat(fp));
                        setSelectedSessionId(null);
                        setSnapshot(getProcurementSnapshot());
                      }
                    }}
                  >✓ סגור (הסכמה)</button>
                  <button
                    style={s.btnRed}
                    onClick={() => {
                      if (confirm('לסגור ככישלון?')) {
                        safeCloseSession(selectedSession.id, 'failed');
                        setSelectedSessionId(null);
                        setSnapshot(getProcurementSnapshot());
                      }
                    }}
                  >✗ סגור (כישלון)</button>
                  <button
                    style={s.btnGhost}
                    onClick={() => setSelectedSessionId(null)}
                  >סגור חלון</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ═══════════ TAB: BUNDLING ═══════════ */}
      {tab === 'bundling' && (
        <div style={s.panel}>
          <div style={s.panelHeader}>
            <h3 style={s.panelTitle}>Bundling חכם · {activeBundles.length}</h3>
            <div style={s.panelMeta}>
              סה״כ בהמתנה: {ils(activeBundles.reduce((sum, b) => sum + b.totalValue, 0))}
            </div>
          </div>
          {activeBundles.length === 0 ? (
            <div style={s.emptyState}>אין bundles פעילים</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={s.table}>
                <thead style={s.thead}>
                  <tr>
                    <th style={s.th}>קטגוריה</th>
                    <th style={s.th}>תת-קטגוריה</th>
                    <th style={s.th}>שורות</th>
                    <th style={s.th}>ערך כולל</th>
                    <th style={s.th}>הנחה צפויה</th>
                    <th style={s.th}>חסכון צפוי</th>
                    <th style={s.th}>סטטוס</th>
                    <th style={s.th}>נוצר</th>
                    <th style={s.th}>פעולות</th>
                  </tr>
                </thead>
                <tbody>
                  {activeBundles.map(b => {
                    const savings = b.totalValue * (b.expectedDiscountPct / 100);
                    const statusColor = b.status === 'ready' ? COLORS.cyan : COLORS.yellow;
                    return (
                      <tr key={b.id}>
                        <td style={s.td}><b>{b.category}</b></td>
                        <td style={s.td}>{b.subcategory}</td>
                        <td style={s.td}>{b.linesQueued.length}</td>
                        <td style={s.td}><b>{ils(b.totalValue)}</b></td>
                        <td style={s.td}>
                          <span style={{ color: COLORS.accent, fontWeight: 700 }}>
                            {b.expectedDiscountPct}%
                          </span>
                        </td>
                        <td style={s.td}>
                          <b style={{ color: COLORS.cyan }}>{ils(savings)}</b>
                        </td>
                        <td style={s.td}>
                          <StatusPill
                            label={b.status === 'ready' ? 'מוכן' : 'בתור'}
                            color={statusColor}
                          />
                        </td>
                        <td style={s.td}>{fmtDate(b.createdAt)}</td>
                        <td style={s.td}>
                          <button
                            style={s.btn}
                            onClick={() => {
                              safeMergeBundle(b.id, `merged_po_${Date.now()}`);
                              setSnapshot(getProcurementSnapshot());
                            }}
                          >Merge & Send</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Bundle line breakdown */}
          {activeBundles.length > 0 && activeBundles.map(b => (
            b.linesQueued.length > 0 && (
              <div key={`detail_${b.id}`} style={{ ...s.subcard, marginTop: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
                  {b.category} / {b.subcategory} — {b.linesQueued.length} שורות
                </div>
                {b.linesQueued.map((l, i) => (
                  <div key={i} style={{
                    display: 'flex', justifyContent: 'space-between',
                    fontSize: 11, padding: '4px 0',
                    borderBottom: `1px solid ${COLORS.border}`,
                  }}>
                    <span>{l.sku}</span>
                    <span>× {num(l.quantity)}</span>
                    <span>{ils(l.expectedUnitPrice)} / יח׳</span>
                    <span><b>{ils(l.quantity * l.expectedUnitPrice)}</b></span>
                  </div>
                ))}
              </div>
            )
          ))}
        </div>
      )}

      {/* ═══════════ TAB: QUALITY ═══════════ */}
      {tab === 'quality' && (
        <div>
          <div style={s.splitRow}>
            <div style={s.panel}>
              <div style={s.panelHeader}>
                <h3 style={s.panelTitle}>Worst Offenders</h3>
                <div style={s.panelMeta}>{worstOffenders.length} מוצרים</div>
              </div>
              {worstOffenders.length === 0 ? (
                <div style={s.emptyState}>אין נתוני איכות</div>
              ) : (
                <table style={s.table}>
                  <thead style={s.thead}>
                    <tr>
                      <th style={s.th}>מוצר</th>
                      <th style={s.th}>שיעור פגמים</th>
                      <th style={s.th}>בדיקות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {worstOffenders.map(w => {
                      const prod = products.find(p => p.id === w.productId);
                      return (
                        <tr key={w.productId}>
                          <td style={s.td}>{prod?.name ?? w.productId}</td>
                          <td style={s.td}>
                            <b style={{
                              color: w.defectRate > 5 ? COLORS.red : w.defectRate > 2 ? COLORS.yellow : COLORS.cyan,
                            }}>{pct(w.defectRate)}</b>
                          </td>
                          <td style={s.td}>{w.checks}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            <div style={s.panel}>
              <div style={s.panelHeader}>
                <h3 style={s.panelTitle}>הפעל בדיקת איכות</h3>
              </div>
              <div style={s.formGrid}>
                <div>
                  <label style={s.label}>מוצר</label>
                  <select
                    style={{ ...s.select, width: '100%' }}
                    value={qcProductId}
                    onChange={e => setQcProductId(e.target.value)}
                  >
                    <option value="">בחר מוצר</option>
                    {products.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={s.label}>ספק</label>
                  <select
                    style={{ ...s.select, width: '100%' }}
                    value={qcSupplierId}
                    onChange={e => setQcSupplierId(e.target.value)}
                  >
                    <option value="">בחר ספק</option>
                    {suppliers.map(sp => (
                      <option key={sp.id} value={sp.id}>{sp.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={s.label}>כמות שהתקבלה</label>
                  <input
                    style={s.input}
                    type="number"
                    value={qcReceived}
                    onChange={e => setQcReceived(e.target.value)}
                  />
                </div>
                <div>
                  <label style={s.label}>עברו בקרה</label>
                  <input
                    style={s.input}
                    type="number"
                    value={qcPassed}
                    onChange={e => setQcPassed(e.target.value)}
                  />
                </div>
                <div>
                  <label style={s.label}>נדחו</label>
                  <input
                    style={s.input}
                    type="number"
                    value={qcRejected}
                    onChange={e => setQcRejected(e.target.value)}
                  />
                </div>
              </div>
              <div style={{ marginTop: 6 }}>
                <label style={s.label}>סיבות פסילה</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {DEFECT_OPTIONS.map(r => {
                    const on = qcReasons.includes(r);
                    return (
                      <button
                        key={r}
                        style={{
                          ...s.btnGhost,
                          background: on ? 'rgba(252,133,133,0.15)' : 'transparent',
                          color: on ? COLORS.red : COLORS.textMuted,
                          borderColor: on ? COLORS.red : COLORS.border,
                        }}
                        onClick={() => {
                          if (on) setQcReasons(qcReasons.filter(x => x !== r));
                          else setQcReasons([...qcReasons, r]);
                        }}
                      >{r}</button>
                    );
                  })}
                </div>
              </div>
              <div style={{ marginTop: 12 }}>
                <button style={s.btn} onClick={handleRunCheck}>הפעל בדיקה</button>
              </div>
            </div>
          </div>

          <div style={s.panel}>
            <div style={s.panelHeader}>
              <h3 style={s.panelTitle}>בדיקות איכות אחרונות · {recentChecks.length}</h3>
            </div>
            {recentChecks.length === 0 ? (
              <div style={s.emptyState}>אין בדיקות איכות עדיין</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={s.table}>
                  <thead style={s.thead}>
                    <tr>
                      <th style={s.th}>מוצר</th>
                      <th style={s.th}>התקבל</th>
                      <th style={s.th}>עבר</th>
                      <th style={s.th}>נדחה</th>
                      <th style={s.th}>ציון</th>
                      <th style={s.th}>פעולה</th>
                      <th style={s.th}>סיבות</th>
                      <th style={s.th}>נבדק ע״י</th>
                      <th style={s.th}>תאריך</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentChecks.map(chk => {
                      const prod = products.find(p => p.id === chk.productId);
                      const actionMeta = QC_ACTION_LABELS[chk.action] ?? { label: chk.action, color: COLORS.textDim };
                      return (
                        <tr key={chk.id}>
                          <td style={s.td}>{prod?.name ?? chk.productId}</td>
                          <td style={s.td}>{num(chk.quantityReceived)}</td>
                          <td style={s.td}>
                            <span style={{ color: COLORS.cyan }}>{num(chk.quantityPassed)}</span>
                          </td>
                          <td style={s.td}>
                            <span style={{ color: COLORS.red }}>{num(chk.quantityRejected)}</span>
                          </td>
                          <td style={s.td}>
                            <ScoreBar value={chk.qualityScore} />
                          </td>
                          <td style={s.td}>
                            <StatusPill label={actionMeta.label} color={actionMeta.color} />
                          </td>
                          <td style={s.td}>
                            {chk.defectReasons.length === 0 ? '—' : chk.defectReasons.map(r => (
                              <span key={r} style={s.pill}>{r}</span>
                            ))}
                          </td>
                          <td style={s.td}>{chk.inspectedBy}</td>
                          <td style={s.td}>{fmtDate(chk.inspectedAt)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════ TAB: SPEND ═══════════ */}
      {tab === 'spend' && spend && (
        <div>
          <div style={s.kpiStrip}>
            <KpiCard label="הוצאה 90 יום" value={ils(spend.totalSpend)} big />
            <KpiCard label="חסכון כולל" value={ils(totalSavings)} color={COLORS.cyan} />
            <KpiCard
              label="קטגוריה מובילה"
              value={
                Object.entries(spend.byCategory)
                  .sort(([, a], [, b]) => b - a)[0]?.[0] ?? '—'
              }
            />
            <KpiCard
              label="ספק מוביל"
              value={(() => {
                const top = spend.topSuppliers[0];
                if (!top) return '—';
                const sp = suppliers.find(x => x.id === top.supplierId);
                return sp?.name ?? top.supplierId.slice(0, 10);
              })()}
            />
            <KpiCard
              label="ריכוזיות מובילה"
              value={pct(concentration.topSharePct)}
              color={concentration.topSharePct > 40 ? COLORS.red : COLORS.text}
            />
            <KpiCard
              label="ריכוזיות Top-3"
              value={pct(concentration.top3SharePct)}
              color={concentration.top3SharePct > 70 ? COLORS.yellow : COLORS.text}
            />
          </div>

          <div style={s.splitRow}>
            <div style={s.panel}>
              <div style={s.panelHeader}>
                <h3 style={s.panelTitle}>התפלגות לפי קטגוריה</h3>
              </div>
              <BarChart
                data={Object.entries(spend.byCategory)
                  .map(([category, amount]) => ({ label: category, value: amount }))
                  .sort((a, b) => b.value - a.value)
                  .slice(0, 8)}
                color={COLORS.accent}
                height={240}
              />
            </div>

            <div style={s.panel}>
              <div style={s.panelHeader}>
                <h3 style={s.panelTitle}>פירוט חסכון</h3>
              </div>
              <div style={{ fontSize: 13, lineHeight: 2 }}>
                <div style={s.cardRow}>
                  <span>ממכרזים</span>
                  <b style={{ color: COLORS.cyan }}>{ils(spend.savingsBreakdown.fromAuctions)}</b>
                </div>
                <div style={s.cardRow}>
                  <span>מאיחוד הזמנות</span>
                  <b style={{ color: COLORS.cyan }}>{ils(spend.savingsBreakdown.fromBundling)}</b>
                </div>
                <div style={s.cardRow}>
                  <span>ממשא ומתן</span>
                  <b style={{ color: COLORS.cyan }}>{ils(spend.savingsBreakdown.fromNegotiation)}</b>
                </div>
                <div style={s.cardRow}>
                  <span>מחוזים</span>
                  <b style={{ color: COLORS.cyan }}>{ils(spend.savingsBreakdown.fromContracts)}</b>
                </div>
                <div style={s.cardRow}>
                  <span>מ-Auto reorder</span>
                  <b style={{ color: COLORS.cyan }}>{ils(spend.savingsBreakdown.fromAutoReorder)}</b>
                </div>
                <div style={{
                  marginTop: 10, paddingTop: 10,
                  borderTop: `1px solid ${COLORS.border}`,
                  display: 'flex', justifyContent: 'space-between',
                }}>
                  <b>סה״כ</b>
                  <b style={{ color: COLORS.accent, fontSize: 16 }}>
                    {ils(
                      spend.savingsBreakdown.fromAuctions +
                      spend.savingsBreakdown.fromBundling +
                      spend.savingsBreakdown.fromNegotiation +
                      spend.savingsBreakdown.fromContracts +
                      spend.savingsBreakdown.fromAutoReorder
                    )}
                  </b>
                </div>
              </div>
            </div>
          </div>

          <div style={s.panel}>
            <div style={s.panelHeader}>
              <h3 style={s.panelTitle}>ספקים מובילים</h3>
              <div style={s.panelMeta}>{spend.topSuppliers.length} ספקים</div>
            </div>
            {spend.topSuppliers.length === 0 ? (
              <div style={s.emptyState}>אין נתונים</div>
            ) : (
              <table style={s.table}>
                <thead style={s.thead}>
                  <tr>
                    <th style={s.th}>#</th>
                    <th style={s.th}>ספק</th>
                    <th style={s.th}>הוצאה</th>
                    <th style={s.th}>% מההוצאה</th>
                    <th style={s.th}>התפלגות</th>
                  </tr>
                </thead>
                <tbody>
                  {spend.topSuppliers.map((t, i) => {
                    const sp = suppliers.find(x => x.id === t.supplierId);
                    return (
                      <tr key={t.supplierId}>
                        <td style={s.td}><b>{i + 1}</b></td>
                        <td style={s.td}>{sp?.name ?? t.supplierId}</td>
                        <td style={s.td}><b>{ils(t.amount)}</b></td>
                        <td style={s.td}>{pct(t.pct)}</td>
                        <td style={s.td}>
                          <div style={{ ...s.barTrack, width: 180 }}>
                            <div style={{
                              ...s.barFill,
                              width: `${t.pct}%`,
                              background: t.pct > 30 ? COLORS.red : COLORS.accent,
                            }} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div style={s.panel}>
            <div style={s.panelHeader}>
              <h3 style={s.panelTitle}>אישורי Auto-Reorder ממתינים · {pendingApprovals.length}</h3>
            </div>
            {pendingApprovals.length === 0 ? (
              <div style={s.emptyState}>אין אישורים ממתינים</div>
            ) : (
              <table style={s.table}>
                <thead style={s.thead}>
                  <tr>
                    <th style={s.th}>מוצר</th>
                    <th style={s.th}>כמות</th>
                    <th style={s.th}>עלות משוערת</th>
                    <th style={s.th}>נוצר</th>
                    <th style={s.th}>פעולות</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingApprovals.map(pa => {
                    const prod = products.find(p => p.id === pa.productId);
                    return (
                      <tr key={pa.id}>
                        <td style={s.td}>{prod?.name ?? pa.productId}</td>
                        <td style={s.td}>{num(pa.quantity)}</td>
                        <td style={s.td}><b>{ils(pa.estCost)}</b></td>
                        <td style={s.td}>{fmtDateTime(pa.createdAt)}</td>
                        <td style={s.td}>
                          <button
                            style={s.btnGreen}
                            onClick={() => {
                              safeApprovePending(pa.id);
                              setSnapshot(getProcurementSnapshot());
                            }}
                          >אשר</button>
                          {' '}
                          <button
                            style={s.btnRed}
                            onClick={() => {
                              safeRejectPending(pa.id);
                              setSnapshot(getProcurementSnapshot());
                            }}
                          >דחה</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {spend.riskHotspots.length > 0 && (
            <div style={s.panel}>
              <div style={s.panelHeader}>
                <h3 style={s.panelTitle}>אזורי סיכון · {spend.riskHotspots.length}</h3>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {spend.riskHotspots.map((h, i) => {
                  const sp = suppliers.find(x => x.id === h.supplierId);
                  const sevColor = h.severity === 'high' ? COLORS.red : h.severity === 'medium' ? COLORS.yellow : COLORS.blue;
                  return (
                    <div key={i} style={{
                      padding: 10,
                      background: `${sevColor}10`,
                      border: `1px solid ${sevColor}55`,
                      borderRadius: 6,
                      fontSize: 12,
                    }}>
                      <b style={{ color: sevColor }}>{sp?.name ?? h.supplierId}</b>
                      {' — '}
                      <span style={{ color: COLORS.text }}>{h.reason}</span>
                      {' · '}
                      <span style={{ color: sevColor, fontSize: 10, fontWeight: 700 }}>
                        {h.severity.toUpperCase()}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════════ MODAL: NEW SUPPLIER ═══════════ */}
      {showSupplierForm && (
        <div style={s.modalBackdrop} onClick={() => setShowSupplierForm(false)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <div style={s.modalHeader}>
              <h2 style={s.modalTitle}>רישום ספק חדש</h2>
              <button style={s.closeX} onClick={() => setShowSupplierForm(false)}>×</button>
            </div>
            <div style={s.formGrid}>
              <div>
                <label style={s.label}>שם ספק *</label>
                <input style={s.input} value={newSupName} onChange={e => setNewSupName(e.target.value)} />
              </div>
              <div>
                <label style={s.label}>שם משפטי</label>
                <input style={s.input} value={newSupLegal} onChange={e => setNewSupLegal(e.target.value)} />
              </div>
              <div>
                <label style={s.label}>מדינה</label>
                <input style={s.input} value={newSupCountry} onChange={e => setNewSupCountry(e.target.value)} />
              </div>
              <div>
                <label style={s.label}>מטבע</label>
                <input style={s.input} value={newSupCurrency} onChange={e => setNewSupCurrency(e.target.value)} />
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={s.label}>קטגוריות (מופרדות בפסיק)</label>
                <input
                  style={s.input}
                  value={newSupCategories}
                  onChange={e => setNewSupCategories(e.target.value)}
                  placeholder="electrical, cables, tools"
                />
              </div>
              <div>
                <label style={s.label}>תנאי תשלום (ימים)</label>
                <input
                  style={s.input}
                  type="number"
                  value={newSupPaymentDays}
                  onChange={e => setNewSupPaymentDays(e.target.value)}
                />
              </div>
              <div>
                <label style={s.label}>בריאות פיננסית 0-100</label>
                <input
                  style={s.input}
                  type="number"
                  value={newSupFinancial}
                  onChange={e => setNewSupFinancial(e.target.value)}
                />
              </div>
              <div>
                <label style={s.label}>אספקה בזמן 0-1</label>
                <input
                  style={s.input}
                  type="number"
                  step="0.01"
                  value={newSupDelivery}
                  onChange={e => setNewSupDelivery(e.target.value)}
                />
              </div>
              <div>
                <label style={s.label}>שיעור פגמים 0-1</label>
                <input
                  style={s.input}
                  type="number"
                  step="0.01"
                  value={newSupDefect}
                  onChange={e => setNewSupDefect(e.target.value)}
                />
              </div>
              <div>
                <label style={s.label}>זמן תגובה (שעות)</label>
                <input
                  style={s.input}
                  type="number"
                  value={newSupResponse}
                  onChange={e => setNewSupResponse(e.target.value)}
                />
              </div>
            </div>
            <div style={{
              display: 'flex', justifyContent: 'flex-end', gap: 8,
              marginTop: 16, paddingTop: 12, borderTop: `1px solid ${COLORS.border}`,
            }}>
              <button style={s.btnGhost} onClick={() => setShowSupplierForm(false)}>ביטול</button>
              <button style={s.btn} onClick={handleRegisterSupplier}>רשום ספק</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ MODAL: INTELLIGENT ORDER ═══════════ */}
      {showIntelligentOrder && (
        <div style={s.modalBackdrop} onClick={() => setShowIntelligentOrder(false)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <div style={s.modalHeader}>
              <h2 style={s.modalTitle}>⚡ Intelligent Order — הזמנה אינטליגנטית</h2>
              <button style={s.closeX} onClick={() => setShowIntelligentOrder(false)}>×</button>
            </div>
            <div style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 14 }}>
              המערכת תנתח את ההזמנה ותבחר אוטומטית את אסטרטגיית הרכש האופטימלית:
              חוזה ישיר, מכרז הפוך, bundling, או משא ומתן שיתופי / אגרסיבי.
            </div>
            <div style={s.formGrid}>
              <div>
                <label style={s.label}>מוצר</label>
                <select
                  style={{ ...s.select, width: '100%' }}
                  value={ioProductId}
                  onChange={e => setIoProductId(e.target.value)}
                >
                  <option value="">בחר מוצר</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.name} · {p.sku}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={s.label}>כמות</label>
                <input
                  style={s.input}
                  type="number"
                  value={ioQuantity}
                  onChange={e => setIoQuantity(e.target.value)}
                />
              </div>
              <div>
                <label style={s.label}>דחיפות</label>
                <select
                  style={{ ...s.select, width: '100%' }}
                  value={ioUrgency}
                  onChange={e => setIoUrgency(e.target.value as any)}
                >
                  {Object.entries(URGENCY_META).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={s.label}>שעות מקסימליות המתנה</label>
                <input
                  style={s.input}
                  type="number"
                  value={ioMaxWait}
                  onChange={e => setIoMaxWait(e.target.value)}
                />
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={{ ...s.label, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={ioCanWait}
                    onChange={e => setIoCanWait(e.target.checked)}
                  />
                  אפשר לחכות (יאפשר bundling עם הזמנות אחרות)
                </label>
              </div>
            </div>
            <div style={{
              display: 'flex', justifyContent: 'flex-end', gap: 8,
              marginTop: 14, paddingTop: 12, borderTop: `1px solid ${COLORS.border}`,
            }}>
              <button style={s.btnGhost} onClick={() => setShowIntelligentOrder(false)}>סגור</button>
              <button
                style={s.btn}
                disabled={ioBusy || !ioProductId}
                onClick={runIntelligentOrder}
              >
                {ioBusy ? 'מנתח…' : '⚡ Analyze & Act'}
              </button>
            </div>

            {/* Result */}
            {ioResult && (
              <div style={{ marginTop: 16 }}>
                <div style={{
                  padding: 14,
                  background: STRATEGY_META[ioResult.strategy]?.bg ?? COLORS.panelAlt,
                  border: `2px solid ${STRATEGY_META[ioResult.strategy]?.color ?? COLORS.border}`,
                  borderRadius: 10,
                }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 10,
                  }}>
                    <div style={{
                      fontSize: 20,
                      fontWeight: 700,
                      color: STRATEGY_META[ioResult.strategy]?.color ?? COLORS.text,
                    }}>
                      {STRATEGY_META[ioResult.strategy]?.icon}
                      {' '}
                      {STRATEGY_META[ioResult.strategy]?.label ?? ioResult.strategy}
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                    <div>
                      <div style={{ fontSize: 10, color: COLORS.textMuted }}>עלות משוערת</div>
                      <div style={{ fontSize: 18, fontWeight: 700 }}>{ils(ioResult.estimatedCost)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: COLORS.textMuted }}>חסכון משוער</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: COLORS.cyan }}>
                        {ils(ioResult.estimatedSavings)}
                      </div>
                    </div>
                  </div>

                  <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 6, fontWeight: 600 }}>
                    הנמקה:
                  </div>
                  <ul style={{ margin: 0, paddingRight: 20, fontSize: 12, color: COLORS.text, lineHeight: 1.8 }}>
                    {ioResult.reasoning?.map((r: string, i: number) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>

                  <div style={{
                    marginTop: 12,
                    paddingTop: 10,
                    borderTop: `1px solid ${COLORS.border}`,
                    fontSize: 11,
                    color: COLORS.textMuted,
                  }}>
                    {ioResult.contractId && (
                      <div>📜 חוזה: <b style={{ color: COLORS.cyan }}>{ioResult.contractId}</b></div>
                    )}
                    {ioResult.auctionId && (
                      <div>⚡ מכרז נוצר: <b style={{ color: COLORS.purple }}>{ioResult.auctionId}</b>
                        {' '}
                        <button
                          style={{ ...s.btnGhost, padding: '2px 8px', fontSize: 10 }}
                          onClick={() => {
                            setShowIntelligentOrder(false);
                            setTab('auctions');
                          }}
                        >לצפיה</button>
                      </div>
                    )}
                    {ioResult.bundleId && (
                      <div>📦 Bundle נוצר: <b style={{ color: COLORS.blue }}>{ioResult.bundleId}</b>
                        {' '}
                        <button
                          style={{ ...s.btnGhost, padding: '2px 8px', fontSize: 10 }}
                          onClick={() => {
                            setShowIntelligentOrder(false);
                            setTab('bundling');
                          }}
                        >לצפיה</button>
                      </div>
                    )}
                    {ioResult.recommendedSupplierId && (
                      <div>🏭 ספק מומלץ: <b style={{ color: COLORS.accent }}>
                        {suppliers.find(x => x.id === ioResult.recommendedSupplierId)?.name ?? ioResult.recommendedSupplierId}
                      </b></div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
