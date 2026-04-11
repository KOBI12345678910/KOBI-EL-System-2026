import React, { useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  IAS,
  initIAS,
  getIASSnapshot,
  demoSignal,
} from '../engines/intelligentAlertEngine';
import type {
  Alert,
  AlertState,
  AlertRule,
  Severity,
  Channel,
  Recipient,
  EscalationPolicy,
  MaintenanceWindow,
  SuppressionRule,
} from '../engines/intelligentAlertEngine';

// ═══════════════════════════════════════════════════════════════════════════
// THEME — Onyx dark palette
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
  green: '#14CCBB',
  yellow: '#F6B64A',
  red: '#FC8585',
  blue: '#48AFF0',
  purple: '#8B7FFF',
};

// ═══════════════════════════════════════════════════════════════════════════
// MAPS & CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const SEVERITY_META: Record<Severity, { icon: string; label: string; bg: string; color: string }> = {
  P1_CRITICAL: { icon: '🚨', label: 'P1 קריטי', bg: 'rgba(252,133,133,0.15)', color: '#FC8585' },
  P2_HIGH:     { icon: '🔴', label: 'P2 גבוה',  bg: 'rgba(246,182,74,0.15)', color: '#F6B64A' },
  P3_MEDIUM:   { icon: '🟡', label: 'P3 בינוני', bg: 'rgba(255,165,0,0.12)', color: '#FFA500' },
  P4_LOW:      { icon: '🔵', label: 'P4 נמוך',   bg: 'rgba(20,204,187,0.12)', color: '#14CCBB' },
  P5_INFO:     { icon: 'ℹ️', label: 'P5 מידע',   bg: 'rgba(92,112,128,0.15)', color: '#ABB3BF' },
};

const STATE_META: Record<AlertState, { label: string; color: string; icon: string }> = {
  triggered:     { label: 'חדשה',      color: '#FC8585', icon: '⚡' },
  acknowledged:  { label: 'אושרה',      color: '#F6B64A', icon: '👁️' },
  investigating: { label: 'בבדיקה',     color: '#48AFF0', icon: '🔍' },
  mitigated:     { label: 'מוגבלת',     color: '#8B7FFF', icon: '🛡️' },
  resolved:      { label: 'נפתרה',      color: '#14CCBB', icon: '✅' },
  silenced:      { label: 'הושתקה',     color: '#5C7080', icon: '🔇' },
  expired:       { label: 'פגה',        color: '#5C7080', icon: '⏱️' },
  auto_resolved: { label: 'נפתרה אוטו', color: '#14CCBB', icon: '🤖' },
};

const CHANNEL_META: Record<Channel, { icon: string; label: string }> = {
  whatsapp:    { icon: '💬', label: 'WhatsApp' },
  sms:         { icon: '📱', label: 'SMS' },
  email:       { icon: '📧', label: 'Email' },
  telegram:    { icon: '✈️', label: 'Telegram' },
  slack:       { icon: '💼', label: 'Slack' },
  discord:     { icon: '🎮', label: 'Discord' },
  push:        { icon: '🔔', label: 'Push' },
  phone_call:  { icon: '📞', label: 'Phone' },
  system_log:  { icon: '📋', label: 'Log' },
};

type TabId = 'active' | 'history' | 'rules' | 'recipients' | 'escalation' | 'suppression' | 'stats';

const TABS: Array<{ id: TabId; label: string; icon: string }> = [
  { id: 'active',      label: 'התראות פעילות', icon: '🚨' },
  { id: 'history',     label: 'היסטוריה',     icon: '📜' },
  { id: 'rules',       label: 'כללים',        icon: '📏' },
  { id: 'recipients',  label: 'נמענים',       icon: '👥' },
  { id: 'escalation',  label: 'מדרגות אסקלציה', icon: '⬆️' },
  { id: 'suppression', label: 'דיכוי ותחזוקה', icon: '🔇' },
  { id: 'stats',       label: 'סטטיסטיקות',   icon: '📊' },
];

const DEMO_PRESETS: Array<{ id: 'cashflow' | 'complaint' | 'expense' | 'budget' | 'health'; label: string; icon: string; color: string }> = [
  { id: 'cashflow',  label: 'תזרים מזומנים',  icon: '💵', color: '#FC8585' },
  { id: 'complaint', label: 'תלונת לקוח',     icon: '😠', color: '#F6B64A' },
  { id: 'expense',   label: 'הוצאה חריגה',    icon: '💸', color: '#FFA500' },
  { id: 'budget',    label: 'חריגת תקציב',    icon: '📉', color: '#8B7FFF' },
  { id: 'health',    label: 'ציון בריאות',    icon: '❤️',  color: '#14CCBB' },
];

// ═══════════════════════════════════════════════════════════════════════════
// FORMATTERS
// ═══════════════════════════════════════════════════════════════════════════

function fmtMs(ms: number): string {
  if (!ms || ms < 0) return '0s';
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3600000) return `${Math.round(ms / 60000)}m`;
  return `${(ms / 3600000).toFixed(1)}h`;
}

function fmtTime(ts: number): string {
  try {
    return new Date(ts).toLocaleString('he-IL');
  } catch {
    return '—';
  }
}

function fmtAgo(ts: number): string {
  return `לפני ${fmtMs(Date.now() - ts)}`;
}

function fmtNumber(n: number): string {
  return (n || 0).toLocaleString('he-IL');
}

function fmtDateTimeLocal(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function parseDateTimeLocal(s: string): number {
  const ts = new Date(s).getTime();
  return isNaN(ts) ? Date.now() : ts;
}

function conditionSummary(c: AlertRule['condition']): string {
  switch (c.type) {
    case 'threshold':      return `ערך ${c.operator} ${c.value}`;
    case 'range':          return `טווח ${c.min}–${c.max} (${c.triggerOutside ? 'מחוץ' : 'בתוך'})`;
    case 'anomaly':        return `חריגה × ${c.deviationMultiplier}σ (min ${c.minSamples})`;
    case 'rate_of_change': return `שינוי ${c.changePercent}% / ${fmtMs(c.windowMs)} (${c.direction})`;
    case 'absence':        return `היעדרות ${fmtMs(c.expectedIntervalMs)} + grace ${fmtMs(c.gracePeriodMs)}`;
    case 'pattern':        return `דפוס: ${c.pattern} (${c.matchType})`;
    case 'composite':      return `${c.operator} × ${c.conditions.length} תנאים`;
    case 'frequency':      return `${c.count} / ${fmtMs(c.windowMs)}`;
    case 'custom':         return 'תנאי מותאם';
    default:               return 'תנאי לא ידוע';
  }
}

// Safe IAS action wrappers — the engine method names differ from spec, so we
// try multiple candidates and swallow errors. Never crash the UI.
function safeAck(alertId: string, actor: string, note?: string): boolean {
  try {
    const api: any = IAS as any;
    if (typeof api.acknowledgeAlert === 'function') { api.acknowledgeAlert(alertId, actor, note); return true; }
    if (typeof api.acknowledge === 'function')      { api.acknowledge(alertId, actor, note); return true; }
  } catch {}
  return false;
}

function safeResolve(alertId: string, actor: string, resolution: string): boolean {
  try {
    const api: any = IAS as any;
    if (typeof api.resolveAlert === 'function') { api.resolveAlert(alertId, actor, resolution); return true; }
    if (typeof api.resolve === 'function')      { api.resolve(alertId, actor, resolution); return true; }
  } catch {}
  return false;
}

function safeSnooze(alertId: string, durationMs: number, actor: string): boolean {
  try {
    const api: any = IAS as any;
    if (typeof api.snoozeAlert === 'function') { api.snoozeAlert(alertId, durationMs, actor); return true; }
    if (typeof api.snooze === 'function')      { api.snooze(alertId, durationMs, actor); return true; }
  } catch {}
  return false;
}

function safeAddNote(alertId: string, actor: string, text: string): boolean {
  try {
    const api: any = IAS as any;
    if (typeof api.addNote === 'function') { api.addNote(alertId, actor, text); return true; }
  } catch {}
  return false;
}

function safeToggleRule(ruleId: string, active: boolean): boolean {
  try {
    const re: any = IAS.ruleEngine as any;
    if (typeof re.toggleRule === 'function') { re.toggleRule(ruleId, active); return true; }
    const rules: AlertRule[] = re.getRules?.() ?? [];
    const match = rules.find(r => r.id === ruleId);
    if (match) { (match as any).active = active; return true; }
  } catch {}
  return false;
}

function safeAddMaintenance(mw: Omit<MaintenanceWindow, 'id'>): boolean {
  try {
    const se: any = IAS.suppressionEngine as any;
    if (typeof se.addMaintenanceWindow === 'function') { se.addMaintenanceWindow(mw); return true; }
  } catch {}
  return false;
}

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════

const styles: Record<string, CSSProperties> = {
  page: {
    direction: 'rtl',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Heebo", sans-serif',
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
  title: { fontSize: 26, fontWeight: 700, color: COLORS.text, margin: 0, letterSpacing: 0.2 },
  subtitle: { fontSize: 13, color: COLORS.textMuted, margin: 0 },
  liveDot: {
    display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
    background: COLORS.green, marginLeft: 6, boxShadow: `0 0 6px ${COLORS.green}`,
  },
  kpiStrip: { display: 'flex', gap: 12, marginBottom: 18, flexWrap: 'wrap' },
  kpiCard: {
    flex: '1 1 170px', background: COLORS.panel, border: `1px solid ${COLORS.border}`,
    borderRadius: 10, padding: 14, display: 'flex', flexDirection: 'column', gap: 4, minWidth: 150,
  },
  kpiLabel: { fontSize: 11, color: COLORS.textMuted, fontWeight: 500, letterSpacing: 0.2 },
  kpiValue: { fontSize: 26, fontWeight: 700, color: COLORS.text, lineHeight: 1.1 },
  kpiHint: { fontSize: 11, color: COLORS.textDim },
  tabs: {
    display: 'flex', gap: 4, marginBottom: 18, borderBottom: `1px solid ${COLORS.border}`,
    flexWrap: 'wrap',
  },
  tab: {
    background: 'transparent', border: 'none', color: COLORS.textMuted,
    padding: '10px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
    borderBottom: '2px solid transparent', fontFamily: 'inherit',
    display: 'flex', alignItems: 'center', gap: 6,
  },
  tabActive: { color: COLORS.accent, borderBottom: `2px solid ${COLORS.accent}` },
  panel: {
    background: COLORS.panel, border: `1px solid ${COLORS.border}`,
    borderRadius: 10, padding: 18, marginBottom: 16,
  },
  panelHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 14, flexWrap: 'wrap', gap: 10,
  },
  panelTitle: { fontSize: 16, fontWeight: 600, color: COLORS.text, margin: 0 },
  panelMeta: { fontSize: 12, color: COLORS.textMuted },
  alertRow: {
    display: 'grid',
    gridTemplateColumns: '44px 110px 1fr 140px 110px 110px',
    gap: 10, alignItems: 'center', padding: '12px 14px',
    borderBottom: `1px solid ${COLORS.border}`, fontSize: 13,
    cursor: 'pointer', transition: 'background 0.1s ease',
  },
  alertRowHover: { background: 'rgba(255,255,255,0.03)' },
  sevIcon: { fontSize: 22, textAlign: 'center' as const },
  chip: {
    display: 'inline-block', padding: '3px 9px', borderRadius: 12,
    fontSize: 11, fontWeight: 600,
  },
  pill: {
    display: 'inline-block', padding: '2px 8px', margin: '2px 3px 2px 0',
    borderRadius: 10, fontSize: 10, background: COLORS.panelAlt,
    color: COLORS.textMuted, border: `1px solid ${COLORS.border}`,
  },
  detailPanel: {
    background: COLORS.panelAlt, borderTop: `1px solid ${COLORS.border}`,
    padding: 16, fontSize: 13,
  },
  detailGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)',
    gap: 12, marginBottom: 14,
  },
  detailField: { display: 'flex', flexDirection: 'column', gap: 3 },
  detailLabel: { fontSize: 10, color: COLORS.textDim, textTransform: 'uppercase' as const, letterSpacing: 0.5 },
  detailValue: { fontSize: 13, color: COLORS.text, fontWeight: 500 },
  button: {
    background: COLORS.accent, color: '#1a1a1a', border: 'none',
    padding: '8px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600,
    cursor: 'pointer', fontFamily: 'inherit', marginLeft: 6,
  },
  buttonSecondary: {
    background: COLORS.panelAlt, color: COLORS.text,
    border: `1px solid ${COLORS.borderStrong}`,
    padding: '8px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600,
    cursor: 'pointer', fontFamily: 'inherit', marginLeft: 6,
  },
  buttonDanger: {
    background: 'rgba(252,133,133,0.15)', color: COLORS.red,
    border: `1px solid ${COLORS.red}`,
    padding: '8px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600,
    cursor: 'pointer', fontFamily: 'inherit', marginLeft: 6,
  },
  input: {
    background: COLORS.input, color: COLORS.text,
    border: `1px solid ${COLORS.border}`, borderRadius: 6,
    padding: '8px 12px', fontSize: 13, fontFamily: 'inherit',
    minWidth: 140,
  },
  select: {
    background: COLORS.input, color: COLORS.text,
    border: `1px solid ${COLORS.border}`, borderRadius: 6,
    padding: '8px 12px', fontSize: 13, fontFamily: 'inherit',
    cursor: 'pointer', minWidth: 140,
  },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  thead: { background: COLORS.panelAlt },
  th: {
    textAlign: 'right' as const, padding: '10px 12px',
    fontSize: 11, fontWeight: 600, color: COLORS.textMuted,
    textTransform: 'uppercase' as const, letterSpacing: 0.5,
    borderBottom: `1px solid ${COLORS.border}`,
  },
  td: { padding: '10px 12px', color: COLORS.text, borderBottom: `1px solid ${COLORS.border}` },
  filterBar: {
    display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center',
  },
  filterLabel: { fontSize: 12, color: COLORS.textMuted, marginLeft: 4 },
  demoBar: {
    display: 'flex', gap: 8, padding: 14, background: COLORS.panelAlt,
    borderRadius: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center',
  },
  demoLabel: { fontSize: 12, color: COLORS.textMuted, marginLeft: 8, fontWeight: 600 },
  demoButton: {
    background: COLORS.panel, border: `1px solid ${COLORS.borderStrong}`,
    color: COLORS.text, padding: '8px 12px', borderRadius: 6,
    fontSize: 12, fontWeight: 600, cursor: 'pointer',
    display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'inherit',
  },
  cardGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 },
  card: {
    background: COLORS.panel, border: `1px solid ${COLORS.border}`,
    borderRadius: 10, padding: 14,
  },
  cardHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 10, paddingBottom: 8, borderBottom: `1px solid ${COLORS.border}`,
  },
  cardTitle: { fontSize: 15, fontWeight: 700, color: COLORS.text, margin: 0 },
  cardRole: { fontSize: 11, color: COLORS.accent, fontWeight: 600 },
  cardRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    fontSize: 12, color: COLORS.textMuted, marginBottom: 6,
  },
  toggleSwitch: {
    display: 'inline-block', width: 34, height: 18, borderRadius: 9,
    position: 'relative' as const, cursor: 'pointer', transition: 'background 0.2s',
  },
  toggleKnob: {
    position: 'absolute' as const, top: 2, width: 14, height: 14,
    background: '#fff', borderRadius: '50%', transition: 'right 0.2s',
  },
  emptyState: {
    padding: 40, textAlign: 'center' as const,
    color: COLORS.textDim, fontSize: 13,
  },
  twoCol: {
    display: 'grid', gridTemplateColumns: '1fr 1fr',
    gap: 16, marginBottom: 16,
  },
  barRow: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 },
  barLabel: { width: 100, fontSize: 12, color: COLORS.textMuted, textAlign: 'right' as const },
  barTrack: {
    flex: 1, height: 18, background: COLORS.panelAlt,
    borderRadius: 4, overflow: 'hidden', position: 'relative',
  },
  barFill: { height: '100%', borderRadius: 4, transition: 'width 0.4s ease' },
  barCount: { width: 50, fontSize: 12, fontWeight: 600, color: COLORS.text, textAlign: 'left' as const },
  noteRow: {
    padding: '8px 12px', background: COLORS.bg, borderRadius: 6,
    marginBottom: 6, fontSize: 12,
  },
  slaBadge: {
    display: 'inline-block', padding: '3px 8px', borderRadius: 10,
    fontSize: 10, fontWeight: 600,
  },
  formRow: { display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center', flexWrap: 'wrap' },
  formLabel: { fontSize: 12, color: COLORS.textMuted, width: 110 },
  auditRow: {
    fontSize: 11, color: COLORS.textMuted, padding: '4px 8px',
    borderBottom: `1px solid ${COLORS.border}`,
    fontFamily: '"SF Mono", "Monaco", "Consolas", monospace',
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// SMALL RENDER HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function SeverityChip({ severity }: { severity: Severity }) {
  const meta = SEVERITY_META[severity];
  return (
    <span style={{ ...styles.chip, background: meta.bg, color: meta.color }}>
      {meta.icon} {meta.label}
    </span>
  );
}

function StateBadge({ state }: { state: AlertState }) {
  const meta = STATE_META[state];
  return (
    <span style={{
      ...styles.chip, background: 'rgba(255,255,255,0.06)',
      color: meta.color, border: `1px solid ${meta.color}33`,
    }}>
      {meta.icon} {meta.label}
    </span>
  );
}

function ChannelPill({ channel }: { channel: Channel }) {
  const meta = CHANNEL_META[channel];
  return (
    <span style={styles.pill}>
      {meta.icon} {meta.label}
    </span>
  );
}

function computeSlaCountdown(alert: Alert): { text: string; color: string } {
  const now = Date.now();
  const deadline = alert.lifecycle.triggeredAt + alert.lifecycle.slaResponseMs;
  const remaining = deadline - now;
  if (alert.lifecycle.slaBreached || remaining < 0) {
    return { text: `חריגת SLA ${fmtMs(Math.abs(remaining))}`, color: COLORS.red };
  }
  if (remaining < alert.lifecycle.slaResponseMs * 0.25) {
    return { text: `SLA: ${fmtMs(remaining)}`, color: COLORS.yellow };
  }
  return { text: `SLA: ${fmtMs(remaining)}`, color: COLORS.green };
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

type Snapshot = ReturnType<typeof getIASSnapshot>;

export function IntelligentAlerts() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [tab, setTab] = useState<TabId>('active');
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null);
  const [hoveredRowId, setHoveredRowId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState<string>('');
  const [filterSeverity, setFilterSeverity] = useState<Severity | 'all'>('all');
  const [filterState, setFilterState] = useState<AlertState | 'all'>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [toast, setToast] = useState<string | null>(null);

  // Maintenance window mini-form state
  const [mwName, setMwName] = useState<string>('');
  const [mwStart, setMwStart] = useState<string>(fmtDateTimeLocal(Date.now()));
  const [mwEnd, setMwEnd] = useState<string>(fmtDateTimeLocal(Date.now() + 4 * 3600000));
  const [mwCategories, setMwCategories] = useState<string>('');

  // ─── Mount: init + polling ────────────────────────────────────────────
  useEffect(() => {
    initIAS();
    setSnapshot(getIASSnapshot());
    const tick = setInterval(() => setSnapshot(getIASSnapshot()), 2000);
    return () => clearInterval(tick);
  }, []);

  // ─── Derived values ───────────────────────────────────────────────────
  const stats = snapshot?.stats;
  const activeAlerts = snapshot?.activeAlerts ?? [];
  const allAlerts = snapshot?.alerts ?? [];
  const rules = snapshot?.rules ?? [];
  const recipients = snapshot?.recipients ?? [];
  const escalationPolicies = snapshot?.escalationPolicies ?? [];
  const maintenanceWindows = snapshot?.maintenanceWindows ?? [];
  const activeMaintenanceWindows = snapshot?.activeMaintenanceWindows ?? [];
  const suppressionRules = snapshot?.suppressionRules ?? [];
  const activeSuppressions = snapshot?.activeSuppressions ?? [];

  const p1Count = useMemo(
    () => activeAlerts.filter(a => a.severity === 'P1_CRITICAL').length,
    [activeAlerts]
  );

  const allCategories = useMemo(() => {
    const set = new Set<string>();
    allAlerts.forEach(a => set.add(a.category));
    return Array.from(set).sort();
  }, [allAlerts]);

  const filteredAllAlerts = useMemo(() => {
    return allAlerts.filter(a => {
      if (filterSeverity !== 'all' && a.severity !== filterSeverity) return false;
      if (filterState !== 'all' && a.state !== filterState) return false;
      if (filterCategory !== 'all' && a.category !== filterCategory) return false;
      return true;
    });
  }, [allAlerts, filterSeverity, filterState, filterCategory]);

  const selectedAlert = useMemo(() => {
    if (!selectedAlertId) return null;
    return allAlerts.find(a => a.id === selectedAlertId) ?? null;
  }, [allAlerts, selectedAlertId]);

  // ─── Actions ──────────────────────────────────────────────────────────
  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const handleAck = (id: string) => {
    if (safeAck(id, 'kobi', 'אושרה מה-UI')) {
      showToast('ההתראה אושרה');
      setSnapshot(getIASSnapshot());
    } else {
      showToast('לא הצלחנו לאשר את ההתראה');
    }
  };

  const handleResolve = (id: string) => {
    if (safeResolve(id, 'kobi', 'נפתרה מה-UI')) {
      showToast('ההתראה נסגרה');
      setSelectedAlertId(null);
      setSnapshot(getIASSnapshot());
    } else {
      showToast('לא הצלחנו לפתור את ההתראה');
    }
  };

  const handleSnooze = (id: string, minutes: number) => {
    if (safeSnooze(id, minutes * 60 * 1000, 'kobi')) {
      showToast(`נשתיקה למשך ${minutes} דקות`);
      setSnapshot(getIASSnapshot());
    } else {
      showToast('לא הצלחנו להשתיק את ההתראה');
    }
  };

  const handleAddNote = (id: string) => {
    const txt = noteDraft.trim();
    if (!txt) return;
    if (safeAddNote(id, 'kobi', txt)) {
      showToast('הערה נוספה');
      setNoteDraft('');
      setSnapshot(getIASSnapshot());
    }
  };

  const handleToggleRule = (ruleId: string, active: boolean) => {
    safeToggleRule(ruleId, active);
    showToast(active ? 'הכלל הופעל' : 'הכלל הושבת');
    setSnapshot(getIASSnapshot());
  };

  const handleDemoSignal = async (id: 'cashflow' | 'complaint' | 'expense' | 'budget' | 'health') => {
    try {
      const res = await demoSignal(id);
      showToast(`סיגנל נשלח — ${res.alertsTriggered} התראות`);
      setSnapshot(getIASSnapshot());
    } catch {
      showToast('שגיאה בשליחת סיגנל');
    }
  };

  const handleAddMaintenance = () => {
    if (!mwName.trim()) { showToast('נא להזין שם חלון'); return; }
    const start = parseDateTimeLocal(mwStart);
    const end = parseDateTimeLocal(mwEnd);
    if (end <= start) { showToast('שעת הסיום חייבת להיות אחרי שעת ההתחלה'); return; }
    const cats = mwCategories.split(',').map(s => s.trim()).filter(Boolean);
    const ok = safeAddMaintenance({
      name: mwName.trim(),
      description: `נוצר מה-UI ב-${fmtTime(Date.now())}`,
      startTime: start, endTime: end,
      categories: cats, sources: [], suppressP1: false,
      createdBy: 'kobi', active: true,
    });
    if (ok) {
      showToast('חלון תחזוקה נוצר');
      setMwName('');
      setMwCategories('');
      setMwStart(fmtDateTimeLocal(Date.now()));
      setMwEnd(fmtDateTimeLocal(Date.now() + 4 * 3600000));
      setSnapshot(getIASSnapshot());
    } else {
      showToast('יצירת חלון נכשלה');
    }
  };

  // ─── Render helpers ───────────────────────────────────────────────────
  const renderAlertRow = (alert: Alert) => {
    const isSelected = alert.id === selectedAlertId;
    const isHovered = alert.id === hoveredRowId;
    const sla = computeSlaCountdown(alert);
    return (
      <div key={alert.id}>
        <div
          style={{
            ...styles.alertRow,
            ...(isHovered ? styles.alertRowHover : {}),
            ...(isSelected ? { background: 'rgba(255,165,0,0.08)' } : {}),
          }}
          onMouseEnter={() => setHoveredRowId(alert.id)}
          onMouseLeave={() => setHoveredRowId(null)}
          onClick={() => { setSelectedAlertId(isSelected ? null : alert.id); setNoteDraft(''); }}
        >
          <div style={styles.sevIcon}>{SEVERITY_META[alert.severity].icon}</div>
          <div>
            <StateBadge state={alert.state} />
          </div>
          <div>
            <div style={{ fontWeight: 600, color: COLORS.text, marginBottom: 3 }}>
              {alert.title}
            </div>
            <div style={{ fontSize: 11, color: COLORS.textMuted }}>
              {alert.source} · {alert.category} · {fmtAgo(alert.timestamp)}
            </div>
          </div>
          <div>
            <SeverityChip severity={alert.severity} />
          </div>
          <div>
            <span style={{ ...styles.slaBadge, background: `${sla.color}22`, color: sla.color }}>
              {sla.text}
            </span>
          </div>
          <div style={{ textAlign: 'left' }}>
            {alert.routing.recipients.slice(0, 3).map((r, i) => (
              <span key={i} style={{ ...styles.pill, fontSize: 9 }} title={r.recipientName}>
                {CHANNEL_META[r.channel]?.icon} {r.recipientName.slice(0, 6)}
              </span>
            ))}
            {alert.routing.recipients.length === 0 && (
              <span style={{ fontSize: 10, color: COLORS.textDim }}>—</span>
            )}
          </div>
        </div>
        {isSelected && renderAlertDetail(alert)}
      </div>
    );
  };

  const renderAlertDetail = (alert: Alert) => {
    const lc = alert.lifecycle;
    return (
      <div style={styles.detailPanel}>
        <div style={styles.detailGrid}>
          <div style={styles.detailField}>
            <span style={styles.detailLabel}>הודעה</span>
            <span style={styles.detailValue}>{alert.message}</span>
          </div>
          <div style={styles.detailField}>
            <span style={styles.detailLabel}>כלל</span>
            <span style={styles.detailValue}>{alert.ruleName}</span>
          </div>
          <div style={styles.detailField}>
            <span style={styles.detailLabel}>זמן פתיחה</span>
            <span style={styles.detailValue}>{fmtTime(lc.triggeredAt)}</span>
          </div>
          <div style={styles.detailField}>
            <span style={styles.detailLabel}>SLA תגובה</span>
            <span style={styles.detailValue}>{fmtMs(lc.slaResponseMs)}</span>
          </div>
          <div style={styles.detailField}>
            <span style={styles.detailLabel}>SLA פתרון</span>
            <span style={styles.detailValue}>{fmtMs(lc.slaResolutionMs)}</span>
          </div>
          <div style={styles.detailField}>
            <span style={styles.detailLabel}>התראות קורלטיביות</span>
            <span style={styles.detailValue}>{alert.correlatedAlertIds.length}</span>
          </div>
          <div style={styles.detailField}>
            <span style={styles.detailLabel}>אושרה ע"י</span>
            <span style={styles.detailValue}>
              {lc.acknowledgedBy ? `${lc.acknowledgedBy} (${fmtTime(lc.acknowledgedAt ?? 0)})` : '—'}
            </span>
          </div>
          <div style={styles.detailField}>
            <span style={styles.detailLabel}>נפתרה ע"י</span>
            <span style={styles.detailValue}>
              {lc.resolvedBy ? `${lc.resolvedBy} (${fmtTime(lc.resolvedAt ?? 0)})` : '—'}
            </span>
          </div>
        </div>

        {alert.technicalDetail && (
          <div style={{ marginBottom: 12 }}>
            <div style={styles.detailLabel}>פרטים טכניים</div>
            <pre style={{
              whiteSpace: 'pre-wrap', fontSize: 11, color: COLORS.textMuted,
              background: COLORS.bg, padding: 10, borderRadius: 6, margin: 0,
              fontFamily: '"SF Mono", "Monaco", "Consolas", monospace',
            }}>{alert.technicalDetail}</pre>
          </div>
        )}

        <div style={{ marginBottom: 12 }}>
          <div style={styles.detailLabel}>תיוגים</div>
          <div>
            {alert.tags.length === 0
              ? <span style={{ fontSize: 11, color: COLORS.textDim }}>אין תיוגים</span>
              : alert.tags.map(t => <span key={t} style={styles.pill}>{t}</span>)}
          </div>
        </div>

        {alert.notes.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={styles.detailLabel}>הערות ({alert.notes.length})</div>
            {alert.notes.slice(-5).map((n, i) => (
              <div key={i} style={styles.noteRow}>
                <strong style={{ color: COLORS.accent }}>{n.author}</strong>
                <span style={{ color: COLORS.textDim, marginRight: 8 }}>{fmtTime(n.timestamp)}</span>
                <div style={{ marginTop: 4 }}>{n.text}</div>
              </div>
            ))}
          </div>
        )}

        {alert.audit.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={styles.detailLabel}>יומן ביקורת</div>
            <div style={{ maxHeight: 150, overflowY: 'auto', border: `1px solid ${COLORS.border}`, borderRadius: 6 }}>
              {alert.audit.slice(-8).reverse().map((a, i) => (
                <div key={i} style={styles.auditRow}>
                  [{fmtTime(a.timestamp)}] {a.action} · {a.actor} {a.detail ? `· ${a.detail}` : ''}
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          <button style={styles.button}
            onClick={(e) => { e.stopPropagation(); handleAck(alert.id); }}>
            👁️ אישור (Ack)
          </button>
          <button style={styles.buttonSecondary}
            onClick={(e) => { e.stopPropagation(); handleSnooze(alert.id, 15); }}>
            🔇 השתק 15 דק
          </button>
          <button style={styles.buttonSecondary}
            onClick={(e) => { e.stopPropagation(); handleSnooze(alert.id, 60); }}>
            🔇 השתק שעה
          </button>
          <button style={styles.buttonDanger}
            onClick={(e) => { e.stopPropagation(); handleResolve(alert.id); }}>
            ✅ סגור/פתור
          </button>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginRight: 'auto' }}>
            <input
              type="text"
              placeholder="הוסף הערה..."
              style={{ ...styles.input, minWidth: 200 }}
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              onClick={(e) => e.stopPropagation()}
            />
            <button style={styles.button}
              onClick={(e) => { e.stopPropagation(); handleAddNote(alert.id); }}>
              ➕ הוסף
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ─── Tab: Active alerts ───────────────────────────────────────────────
  const renderActiveTab = () => (
    <div style={styles.panel}>
      <div style={styles.panelHeader}>
        <h3 style={styles.panelTitle}>
          <span style={styles.liveDot} /> התראות פעילות
        </h3>
        <span style={styles.panelMeta}>
          {activeAlerts.length} התראות · {p1Count} P1 קריטיות
        </span>
      </div>
      {activeAlerts.length === 0 ? (
        <div style={styles.emptyState}>
          ✅ אין התראות פעילות — המערכת שקטה
        </div>
      ) : (
        <div>{activeAlerts.map(renderAlertRow)}</div>
      )}
    </div>
  );

  // ─── Tab: History ─────────────────────────────────────────────────────
  const renderHistoryTab = () => (
    <div style={styles.panel}>
      <div style={styles.panelHeader}>
        <h3 style={styles.panelTitle}>היסטוריית התראות</h3>
        <span style={styles.panelMeta}>
          {filteredAllAlerts.length} מתוך {allAlerts.length}
        </span>
      </div>
      <div style={styles.filterBar}>
        <span style={styles.filterLabel}>חומרה:</span>
        <select style={styles.select} value={filterSeverity}
          onChange={(e) => setFilterSeverity(e.target.value as Severity | 'all')}>
          <option value="all">כל החומרות</option>
          {(Object.keys(SEVERITY_META) as Severity[]).map(s => (
            <option key={s} value={s}>{SEVERITY_META[s].label}</option>
          ))}
        </select>
        <span style={styles.filterLabel}>מצב:</span>
        <select style={styles.select} value={filterState}
          onChange={(e) => setFilterState(e.target.value as AlertState | 'all')}>
          <option value="all">כל המצבים</option>
          {(Object.keys(STATE_META) as AlertState[]).map(s => (
            <option key={s} value={s}>{STATE_META[s].label}</option>
          ))}
        </select>
        <span style={styles.filterLabel}>קטגוריה:</span>
        <select style={styles.select} value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}>
          <option value="all">כל הקטגוריות</option>
          {allCategories.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>
      {filteredAllAlerts.length === 0 ? (
        <div style={styles.emptyState}>אין התראות תואמות לפילטר</div>
      ) : (
        <div>{filteredAllAlerts.map(renderAlertRow)}</div>
      )}
    </div>
  );

  // ─── Tab: Rules ───────────────────────────────────────────────────────
  const renderRulesTab = () => (
    <>
      <div style={styles.demoBar}>
        <span style={styles.demoLabel}>🧪 שליחת סיגנל מבחן:</span>
        {DEMO_PRESETS.map(p => (
          <button key={p.id} style={{ ...styles.demoButton, borderColor: p.color }}
            onClick={() => handleDemoSignal(p.id)}>
            <span style={{ fontSize: 14 }}>{p.icon}</span>
            <span style={{ color: p.color }}>{p.label}</span>
          </button>
        ))}
      </div>
      <div style={styles.panel}>
        <div style={styles.panelHeader}>
          <h3 style={styles.panelTitle}>כללי התראה ({rules.length})</h3>
          <span style={styles.panelMeta}>
            {rules.filter(r => r.active).length} פעילים
          </span>
        </div>
        {rules.length === 0 ? (
          <div style={styles.emptyState}>לא הוגדרו כללים</div>
        ) : (
          <table style={styles.table}>
            <thead style={styles.thead}>
              <tr>
                <th style={styles.th}>שם הכלל</th>
                <th style={styles.th}>תנאי</th>
                <th style={styles.th}>חומרה</th>
                <th style={styles.th}>ערוצים</th>
                <th style={styles.th}>הפעלות</th>
                <th style={styles.th}>מצב</th>
              </tr>
            </thead>
            <tbody>
              {rules.map(rule => (
                <tr key={rule.id}>
                  <td style={styles.td}>
                    <div style={{ fontWeight: 600, color: COLORS.text }}>{rule.name}</div>
                    <div style={{ fontSize: 10, color: COLORS.textDim }}>{rule.description}</div>
                  </td>
                  <td style={styles.td}>
                    <span style={{ fontSize: 11, color: COLORS.textMuted }}>
                      {conditionSummary(rule.condition)}
                    </span>
                    <div style={{ fontSize: 10, color: COLORS.textDim }}>
                      {rule.signalCategories.join(', ')}
                    </div>
                  </td>
                  <td style={styles.td}><SeverityChip severity={rule.baseSeverity} /></td>
                  <td style={styles.td}>
                    {rule.channels.map(c => <ChannelPill key={c} channel={c} />)}
                  </td>
                  <td style={styles.td}>
                    <span style={{ fontWeight: 600 }}>{rule.triggerCount}</span>
                    {rule.lastTriggeredAt && (
                      <div style={{ fontSize: 10, color: COLORS.textDim }}>
                        {fmtAgo(rule.lastTriggeredAt)}
                      </div>
                    )}
                  </td>
                  <td style={styles.td}>
                    <div
                      style={{
                        ...styles.toggleSwitch,
                        background: rule.active ? COLORS.green : COLORS.panelAlt,
                      }}
                      onClick={() => handleToggleRule(rule.id, !rule.active)}
                    >
                      <div style={{
                        ...styles.toggleKnob,
                        right: rule.active ? 2 : 18,
                      }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );

  // ─── Tab: Recipients ──────────────────────────────────────────────────
  const renderRecipientsTab = () => (
    <div style={styles.panel}>
      <div style={styles.panelHeader}>
        <h3 style={styles.panelTitle}>נמענים ({recipients.length})</h3>
        <span style={styles.panelMeta}>
          {recipients.filter(r => r.onCall).length} תורנים · {recipients.filter(r => r.active).length} פעילים
        </span>
      </div>
      {recipients.length === 0 ? (
        <div style={styles.emptyState}>לא הוגדרו נמענים</div>
      ) : (
        <div style={styles.cardGrid}>
          {recipients.map((r: Recipient) => (
            <div key={r.id} style={styles.card}>
              <div style={styles.cardHeader}>
                <div>
                  <h4 style={styles.cardTitle}>{r.name}</h4>
                  <div style={styles.cardRole}>{r.role}</div>
                </div>
                {r.onCall && (
                  <span style={{ ...styles.chip, background: 'rgba(20,204,187,0.15)', color: COLORS.green }}>
                    📟 תורן
                  </span>
                )}
              </div>
              <div style={styles.cardRow}>
                <span>מצב</span>
                <span style={{ color: r.active ? COLORS.green : COLORS.textDim }}>
                  {r.active ? 'פעיל' : 'מושבת'}
                </span>
              </div>
              <div style={styles.cardRow}>
                <span>חומרה מינימלית</span>
                <SeverityChip severity={r.minSeverity} />
              </div>
              <div style={styles.cardRow}>
                <span>ערוצים</span>
                <div>
                  {(Object.keys(r.channels) as Channel[]).map(ch =>
                    r.channels[ch] ? <ChannelPill key={ch} channel={ch} /> : null
                  )}
                </div>
              </div>
              {r.quietHours && (
                <div style={styles.cardRow}>
                  <span>שעות שקטות</span>
                  <span style={{ color: COLORS.textMuted, fontSize: 11 }}>
                    {String(r.quietHours.start).padStart(2, '0')}:00 — {String(r.quietHours.end).padStart(2, '0')}:00
                    {r.quietHours.overrideForP1 && ' (P1 עוקף)'}
                  </span>
                </div>
              )}
              <div style={styles.cardRow}>
                <span>קטגוריות</span>
                <span style={{ color: COLORS.textMuted, fontSize: 11 }}>
                  {r.categories.length === 0 ? 'הכל' : r.categories.join(', ')}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // ─── Tab: Escalation ──────────────────────────────────────────────────
  const renderEscalationTab = () => (
    <div style={styles.panel}>
      <div style={styles.panelHeader}>
        <h3 style={styles.panelTitle}>מדיניות אסקלציה ({escalationPolicies.length})</h3>
        <span style={styles.panelMeta}>שלבי הסלמה אוטומטיים לפי חומרה</span>
      </div>
      {escalationPolicies.length === 0 ? (
        <div style={styles.emptyState}>לא הוגדרו מדיניות אסקלציה</div>
      ) : (
        <div style={styles.cardGrid}>
          {escalationPolicies.map((policy: EscalationPolicy) => (
            <div key={policy.id} style={styles.card}>
              <div style={styles.cardHeader}>
                <h4 style={styles.cardTitle}>{policy.name}</h4>
                <span style={{ ...styles.chip, background: COLORS.panelAlt, color: COLORS.accent }}>
                  {policy.finalAction}
                </span>
              </div>
              <div style={{ marginBottom: 10 }}>
                <div style={styles.detailLabel}>חל על</div>
                <div style={{ marginTop: 4 }}>
                  {policy.appliesTo.map(s => <SeverityChip key={s} severity={s} />)}
                </div>
              </div>
              <div>
                <div style={styles.detailLabel}>שלבים ({policy.levels.length})</div>
                {policy.levels.map((level, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 10px', borderBottom: `1px solid ${COLORS.border}`,
                    fontSize: 12,
                  }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%',
                      background: COLORS.accent, color: '#1a1a1a',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 700, fontSize: 12, flexShrink: 0,
                    }}>{i + 1}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: COLORS.text, fontWeight: 600 }}>
                        ⏱️ המתנה {fmtMs(level.waitMs)}
                      </div>
                      <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 3 }}>
                        נמענים: {level.recipientIds.join(', ') || '—'}
                      </div>
                      <div style={{ marginTop: 3 }}>
                        {level.channels.map(ch => <ChannelPill key={ch} channel={ch} />)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // ─── Tab: Suppression & Maintenance ───────────────────────────────────
  const renderSuppressionTab = () => (
    <>
      <div style={styles.panel}>
        <div style={styles.panelHeader}>
          <h3 style={styles.panelTitle}>🔧 יצירת חלון תחזוקה</h3>
          <span style={styles.panelMeta}>דיכוי התראות לתקופה מוגדרת</span>
        </div>
        <div style={styles.formRow}>
          <span style={styles.formLabel}>שם החלון</span>
          <input style={{ ...styles.input, flex: 1, minWidth: 200 }}
            value={mwName}
            onChange={(e) => setMwName(e.target.value)}
            placeholder="למשל: שדרוג מערכת סוף שבוע" />
        </div>
        <div style={styles.formRow}>
          <span style={styles.formLabel}>תחילה</span>
          <input style={styles.input} type="datetime-local"
            value={mwStart} onChange={(e) => setMwStart(e.target.value)} />
          <span style={styles.formLabel}>סיום</span>
          <input style={styles.input} type="datetime-local"
            value={mwEnd} onChange={(e) => setMwEnd(e.target.value)} />
        </div>
        <div style={styles.formRow}>
          <span style={styles.formLabel}>קטגוריות</span>
          <input style={{ ...styles.input, flex: 1, minWidth: 250 }}
            value={mwCategories}
            onChange={(e) => setMwCategories(e.target.value)}
            placeholder="הפרד בפסיקים (ריק = הכל)" />
          <button style={styles.button} onClick={handleAddMaintenance}>
            ➕ יצירה
          </button>
        </div>
      </div>
      <div style={styles.twoCol}>
        <div style={styles.panel}>
          <div style={styles.panelHeader}>
            <h3 style={styles.panelTitle}>🔇 דיכויים פעילים</h3>
            <span style={styles.panelMeta}>{activeSuppressions.length} / {suppressionRules.length}</span>
          </div>
          {activeSuppressions.length === 0 ? (
            <div style={styles.emptyState}>אין דיכויים פעילים</div>
          ) : (
            <table style={styles.table}>
              <thead style={styles.thead}>
                <tr>
                  <th style={styles.th}>שם</th>
                  <th style={styles.th}>סיבה</th>
                  <th style={styles.th}>יוצר</th>
                  <th style={styles.th}>פג תוקף</th>
                </tr>
              </thead>
              <tbody>
                {activeSuppressions.map((s: SuppressionRule) => (
                  <tr key={s.id}>
                    <td style={styles.td}>{s.name}</td>
                    <td style={styles.td}>{s.reason}</td>
                    <td style={styles.td}>{s.createdBy}</td>
                    <td style={styles.td}>{fmtTime(s.expiresAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div style={styles.panel}>
          <div style={styles.panelHeader}>
            <h3 style={styles.panelTitle}>🔧 חלונות תחזוקה</h3>
            <span style={styles.panelMeta}>
              {activeMaintenanceWindows.length} פעילים / {maintenanceWindows.length} סה"כ
            </span>
          </div>
          {maintenanceWindows.length === 0 ? (
            <div style={styles.emptyState}>לא הוגדרו חלונות תחזוקה</div>
          ) : (
            <table style={styles.table}>
              <thead style={styles.thead}>
                <tr>
                  <th style={styles.th}>שם</th>
                  <th style={styles.th}>תחילה</th>
                  <th style={styles.th}>סיום</th>
                  <th style={styles.th}>קטגוריות</th>
                  <th style={styles.th}>מצב</th>
                </tr>
              </thead>
              <tbody>
                {maintenanceWindows.map((mw: MaintenanceWindow) => {
                  const now = Date.now();
                  const isActive = mw.active && now >= mw.startTime && now <= mw.endTime;
                  return (
                    <tr key={mw.id}>
                      <td style={styles.td}>
                        <div style={{ fontWeight: 600 }}>{mw.name}</div>
                        <div style={{ fontSize: 10, color: COLORS.textDim }}>{mw.description}</div>
                      </td>
                      <td style={styles.td}>{fmtTime(mw.startTime)}</td>
                      <td style={styles.td}>{fmtTime(mw.endTime)}</td>
                      <td style={styles.td}>
                        <span style={{ fontSize: 11 }}>
                          {mw.categories.length === 0 ? 'הכל' : mw.categories.join(', ')}
                        </span>
                      </td>
                      <td style={styles.td}>
                        <span style={{
                          ...styles.chip,
                          background: isActive ? 'rgba(20,204,187,0.15)' : COLORS.panelAlt,
                          color: isActive ? COLORS.green : COLORS.textDim,
                        }}>
                          {isActive ? '🟢 פעיל' : '⚪ מתוזמן'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );

  // ─── Tab: Statistics ──────────────────────────────────────────────────
  const renderStatsTab = () => {
    if (!stats) {
      return <div style={styles.emptyState}>טוען נתונים...</div>;
    }
    const severityEntries: Array<[Severity, number, string]> = [
      ['P1_CRITICAL', stats.bySeverity.P1, 'P1'],
      ['P2_HIGH',     stats.bySeverity.P2, 'P2'],
      ['P3_MEDIUM',   stats.bySeverity.P3, 'P3'],
      ['P4_LOW',      stats.bySeverity.P4, 'P4'],
      ['P5_INFO',     stats.bySeverity.P5, 'P5'],
    ];
    const maxSev = Math.max(1, ...severityEntries.map(e => e[1]));
    const kpis: Array<[string, string | number, string]> = [
      ['סה"כ סיגנלים',      fmtNumber(stats.totalSignals),     'מעובדים במנוע'],
      ['סה"כ התראות',       fmtNumber(stats.totalAlerts),      'שנוצרו'],
      ['דוכאו',             fmtNumber(stats.totalSuppressed),  'כולל maintenance'],
      ['תואמו',             fmtNumber(stats.totalCorrelated),  'correlation engine'],
      ['אסקלציות',          fmtNumber(stats.totalEscalated),   'escalation policy'],
      ['נפתרו',             fmtNumber(stats.totalResolved),    'resolved total'],
      ['פעילות',            fmtNumber(stats.activeAlerts),     'לא נסגרו'],
      ['חריגות SLA',        fmtNumber(stats.slaBreached),      'breached'],
      ['ממוצע זמן ACK',     fmtMs(stats.avgTimeToAckMs),       'time-to-ack'],
      ['ממוצע זמן פתרון',   fmtMs(stats.avgTimeToResolveMs),   'time-to-resolve'],
      ['כללים',             fmtNumber(stats.rules),            'active rules'],
      ['דיכויים פעילים',    fmtNumber(stats.activeSuppressions), 'suppressions'],
      ['חלונות תחזוקה',     fmtNumber(stats.activeMaintenanceWindows), 'maintenance'],
    ];
    return (
      <>
        <div style={styles.panel}>
          <div style={styles.panelHeader}>
            <h3 style={styles.panelTitle}>📊 מדדי מפתח</h3>
            <span style={styles.panelMeta}>{fmtTime(Date.now())}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            {kpis.map(([label, value, hint]) => (
              <div key={label} style={styles.kpiCard}>
                <div style={styles.kpiLabel}>{label}</div>
                <div style={styles.kpiValue}>{value}</div>
                <div style={styles.kpiHint}>{hint}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={styles.panel}>
          <div style={styles.panelHeader}>
            <h3 style={styles.panelTitle}>התפלגות חומרה (פעילות)</h3>
            <span style={styles.panelMeta}>{stats.activeAlerts} התראות פעילות</span>
          </div>
          {severityEntries.map(([sev, count, shortLabel]) => {
            const meta = SEVERITY_META[sev];
            const pct = (count / maxSev) * 100;
            return (
              <div key={sev} style={styles.barRow}>
                <div style={{ ...styles.barLabel, color: meta.color }}>
                  {meta.icon} {shortLabel} {meta.label.replace(/^P\d\s/, '')}
                </div>
                <div style={styles.barTrack}>
                  <div style={{ ...styles.barFill, width: `${pct}%`, background: meta.color }} />
                </div>
                <div style={styles.barCount}>{count}</div>
              </div>
            );
          })}
        </div>
      </>
    );
  };

  // ─── Main render ──────────────────────────────────────────────────────
  if (!snapshot) {
    return (
      <div style={styles.page}>
        <div style={styles.emptyState}>טוען את מערכת ההתראות...</div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.titleWrap}>
          <h1 style={styles.title}>
            🚨 מרכז התראות חכם
            <span style={styles.liveDot} />
          </h1>
          <p style={styles.subtitle}>
            Intelligent Alert System · PagerDuty + Datadog style · {stats?.rules ?? 0} כללים · {recipients.length} נמענים
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {DEMO_PRESETS.slice(0, 3).map(p => (
            <button key={p.id} style={{ ...styles.buttonSecondary, borderColor: p.color, color: p.color }}
              onClick={() => handleDemoSignal(p.id)}>
              {p.icon} {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI strip */}
      <div style={styles.kpiStrip}>
        <div style={styles.kpiCard}>
          <div style={styles.kpiLabel}>התראות פעילות</div>
          <div style={styles.kpiValue}>
            {activeAlerts.length}
            {p1Count > 0 && (
              <span style={{ fontSize: 14, color: COLORS.red, marginRight: 8 }}>
                ({p1Count} P1)
              </span>
            )}
          </div>
          <div style={styles.kpiHint}>currently open</div>
        </div>
        <div style={styles.kpiCard}>
          <div style={styles.kpiLabel}>סיגנלים היום</div>
          <div style={styles.kpiValue}>{fmtNumber(stats?.totalSignals ?? 0)}</div>
          <div style={styles.kpiHint}>signals ingested</div>
        </div>
        <div style={styles.kpiCard}>
          <div style={styles.kpiLabel}>כללים פעילים</div>
          <div style={styles.kpiValue}>
            {rules.filter(r => r.active).length}/{rules.length}
          </div>
          <div style={styles.kpiHint}>alert rules</div>
        </div>
        <div style={styles.kpiCard}>
          <div style={styles.kpiLabel}>חריגות SLA</div>
          <div style={{ ...styles.kpiValue, color: (stats?.slaBreached ?? 0) > 0 ? COLORS.red : COLORS.text }}>
            {stats?.slaBreached ?? 0}
          </div>
          <div style={styles.kpiHint}>breached</div>
        </div>
        <div style={styles.kpiCard}>
          <div style={styles.kpiLabel}>זמן ACK ממוצע</div>
          <div style={styles.kpiValue}>{fmtMs(stats?.avgTimeToAckMs ?? 0)}</div>
          <div style={styles.kpiHint}>time-to-ack</div>
        </div>
        <div style={styles.kpiCard}>
          <div style={styles.kpiLabel}>דיכויים</div>
          <div style={styles.kpiValue}>{stats?.activeSuppressions ?? 0}</div>
          <div style={styles.kpiHint}>active</div>
        </div>
        <div style={styles.kpiCard}>
          <div style={styles.kpiLabel}>אסקלציות</div>
          <div style={styles.kpiValue}>{fmtNumber(stats?.totalEscalated ?? 0)}</div>
          <div style={styles.kpiHint}>total escalated</div>
        </div>
      </div>

      {/* Tab strip */}
      <div style={styles.tabs}>
        {TABS.map(t => (
          <button
            key={t.id}
            style={{ ...styles.tab, ...(tab === t.id ? styles.tabActive : {}) }}
            onClick={() => setTab(t.id)}
          >
            <span>{t.icon}</span>
            <span>{t.label}</span>
            {t.id === 'active' && activeAlerts.length > 0 && (
              <span style={{
                ...styles.chip, background: COLORS.red, color: '#fff',
                padding: '1px 6px', fontSize: 9, marginRight: 4,
              }}>{activeAlerts.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'active'      && renderActiveTab()}
      {tab === 'history'     && renderHistoryTab()}
      {tab === 'rules'       && renderRulesTab()}
      {tab === 'recipients'  && renderRecipientsTab()}
      {tab === 'escalation'  && renderEscalationTab()}
      {tab === 'suppression' && renderSuppressionTab()}
      {tab === 'stats'       && renderStatsTab()}

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, padding: '12px 20px',
          background: COLORS.panel, color: COLORS.text,
          border: `1px solid ${COLORS.accent}`, borderRadius: 8,
          fontSize: 13, fontWeight: 600, zIndex: 1000,
          boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
        }}>
          {toast}
        </div>
      )}
    </div>
  );
}
