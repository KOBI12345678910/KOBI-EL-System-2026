import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../hooks/useApi';
import { formatCurrency, formatDate, formatDateTime } from '../utils/format';

/* ─────────────────────────  TYPES  ───────────────────────── */

interface WorkOrderDetail {
  id: number;
  wo_number: string;
  title: string;
  description?: string;
  project_id?: number;
  project_name?: string;
  customer_name?: string;
  state: string;
  priority?: string;
  owner_name?: string;
  assigned_to?: string;
  location?: string;
  city?: string;
  progress: number;
  quality_status?: string;
  signature_status?: string;
  estimated_hours?: number;
  actual_hours?: number;
  estimated_cost?: number;
  actual_cost?: number;
  due_date?: string;
  started_at?: string;
  completed_at?: string;
  created_at?: string;
  updated_at?: string;
  internal_notes?: string;
}

interface TeamMember { id: number; name: string; role?: string; phone?: string; assigned_date?: string; hours_logged?: number; status?: string; }
interface AttendanceRecord { id: number; employee_name: string; date: string; check_in?: string; check_out?: string; hours?: number; status?: string; }
interface MaterialItem { id: number; material_name: string; quantity_needed: number; quantity_reserved: number; status: string; location?: string; }
interface Reservation { id: number; material_name: string; quantity: number; warehouse?: string; status: string; reserved_at?: string; }
interface QualityCheck { id: number; check_type: string; inspector?: string; result: string; notes?: string; checked_at?: string; }
interface Signature { id: number; signer_name: string; role?: string; status: string; signed_at?: string; token?: string; }
interface Expense { id: number; description: string; amount: number; category?: string; date?: string; approved?: boolean; }
interface Alert { id: number; type: string; message: string; severity?: string; is_resolved: boolean; created_at?: string; }
interface Document { id: number; name: string; type?: string; uploaded_by?: string; created_at?: string; url?: string; }
interface AuditEntry { id: number; action: string; user?: string; details?: string; created_at?: string; }

type TabKey =
  | 'overview' | 'execution' | 'team' | 'attendance' | 'materials'
  | 'reservations' | 'quality' | 'signatures' | 'expenses' | 'alerts'
  | 'documents' | 'ai_insights' | 'audit_log';

/* ─────────────────────────  CONSTANTS  ───────────────────────── */

const STATE_COLORS: Record<string, { bg: string; fg: string; label: string }> = {
  open:              { bg: 'rgba(92,112,128,0.2)',  fg: '#5C7080', label: 'פתוח' },
  assigned:          { bg: 'rgba(72,175,240,0.15)', fg: '#48AFF0', label: 'שובץ' },
  in_progress:       { bg: 'rgba(255,165,0,0.15)',  fg: '#FFA500', label: 'בביצוע' },
  waiting_materials: { bg: 'rgba(157,78,221,0.15)', fg: '#9D4EDD', label: 'ממתין לחומרים' },
  qa_check:          { bg: 'rgba(255,179,102,0.15)',fg: '#FFB366', label: 'בדיקת איכות' },
  done:              { bg: 'rgba(61,204,145,0.15)', fg: '#3DCC91', label: 'הושלם' },
  signed_off:        { bg: 'rgba(61,204,145,0.25)', fg: '#3DCC91', label: 'נחתם' },
};

const QUALITY_COLORS: Record<string, { bg: string; fg: string; label: string }> = {
  pending:  { bg: 'rgba(92,112,128,0.15)', fg: '#5C7080', label: 'ממתין' },
  passed:   { bg: 'rgba(61,204,145,0.15)', fg: '#3DCC91', label: 'עבר' },
  failed:   { bg: 'rgba(252,133,133,0.15)',fg: '#FC8585', label: 'נכשל' },
  partial:  { bg: 'rgba(255,179,102,0.15)',fg: '#FFB366', label: 'חלקי' },
};

const SIGNATURE_COLORS: Record<string, { bg: string; fg: string; label: string }> = {
  pending:  { bg: 'rgba(255,179,102,0.15)',fg: '#FFB366', label: 'ממתין' },
  signed:   { bg: 'rgba(61,204,145,0.15)', fg: '#3DCC91', label: 'נחתם' },
  rejected: { bg: 'rgba(252,133,133,0.15)',fg: '#FC8585', label: 'נדחה' },
};

const PRIORITY_COLORS: Record<string, { bg: string; fg: string; label: string }> = {
  low:     { bg: 'rgba(92,112,128,0.15)', fg: '#5C7080', label: 'נמוכה' },
  normal:  { bg: 'rgba(72,175,240,0.15)', fg: '#48AFF0', label: 'רגילה' },
  high:    { bg: 'rgba(255,179,102,0.15)',fg: '#FFB366', label: 'גבוהה' },
  urgent:  { bg: 'rgba(252,133,133,0.15)',fg: '#FC8585', label: 'דחופה' },
  critical:{ bg: 'rgba(252,80,80,0.2)',   fg: '#FF4444', label: 'קריטית' },
};

const TABS: { key: TabKey; label: string }[] = [
  { key: 'overview',     label: 'סקירה' },
  { key: 'execution',    label: 'ביצוע' },
  { key: 'team',         label: 'צוות' },
  { key: 'attendance',   label: 'נוכחות' },
  { key: 'materials',    label: 'חומרים' },
  { key: 'reservations', label: 'שמורים' },
  { key: 'quality',      label: 'איכות' },
  { key: 'signatures',   label: 'חתימות' },
  { key: 'expenses',     label: 'הוצאות' },
  { key: 'alerts',       label: 'התראות' },
  { key: 'documents',    label: 'מסמכים' },
  { key: 'ai_insights',  label: 'AI Insights' },
  { key: 'audit_log',    label: 'יומן פעולות' },
];

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

/* ─────────────────────────  STYLE HELPERS  ───────────────────────── */

const card = (extra?: React.CSSProperties): React.CSSProperties => ({
  background: '#2F343C', border: '1px solid rgba(255,255,255,0.08)', padding: '14px 16px', ...extra,
});

const btnPrimary = (extra?: React.CSSProperties): React.CSSProperties => ({
  background: 'rgba(255,165,0,0.1)', border: '1px solid #FFA500', color: '#FFA500',
  padding: '7px 14px', cursor: 'pointer', fontSize: 12, fontFamily: FONT, ...extra,
});

const btnGhost = (extra?: React.CSSProperties): React.CSSProperties => ({
  background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: '#ABB3BF',
  padding: '7px 14px', cursor: 'pointer', fontSize: 12, fontFamily: FONT, ...extra,
});

const labelStyle: React.CSSProperties = { fontSize: 9, color: '#5C7080', letterSpacing: '0.12em', marginBottom: 4 };

/* ─────────────────────────  BADGE  ───────────────────────── */

function Badge({ bg, fg, text }: { bg: string; fg: string; text: string }) {
  return (
    <span style={{
      background: bg, color: fg, border: `1px solid ${fg}40`,
      padding: '2px 10px', fontSize: 10, letterSpacing: '0.08em', borderRadius: 2,
    }}>
      {text}
    </span>
  );
}

/* ─────────────────────────  SKELETON  ───────────────────────── */

function Skeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 16 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ height: 14, background: '#383E47', borderRadius: 3, width: `${70 + Math.random() * 30}%`, animation: 'pulse 1.5s infinite ease-in-out' }} />
      ))}
      <style>{`@keyframes pulse { 0%,100%{opacity:.4} 50%{opacity:1} }`}</style>
    </div>
  );
}

/* ─────────────────────────  EMPTY STATE  ───────────────────────── */

function EmptyState({ message, actionLabel, onAction }: { message: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 24px' }}>
      <div style={{ fontSize: 13, color: '#5C7080', marginBottom: 16 }}>{message}</div>
      {actionLabel && onAction && (
        <button onClick={onAction} style={btnPrimary()}>{actionLabel}</button>
      )}
    </div>
  );
}

/* ─────────────────────────  PROGRESS BAR  ───────────────────────── */

function ProgressBar({ value, height = 6, color }: { value: number; height?: number; color?: string }) {
  const clr = color || (value >= 100 ? '#3DCC91' : value >= 60 ? '#48AFF0' : value >= 30 ? '#FFB366' : '#FC8585');
  return (
    <div style={{ width: '100%', height, background: '#383E47', borderRadius: 2, overflow: 'hidden' }}>
      <div style={{ width: `${Math.min(value, 100)}%`, height: '100%', background: clr, transition: 'width 0.3s' }} />
    </div>
  );
}

/* ─────────────────────────  SORTABLE TABLE  ───────────────────────── */

interface Column<T> { key: keyof T | string; label: string; width?: number; render?: (row: T) => React.ReactNode; }

function SortableTable<T extends { id: number | string }>({ columns, data, onRowClick }: { columns: Column<T>[]; data: T[]; onRowClick?: (row: T) => void }) {
  const [sortKey, setSortKey] = useState<string>('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const handleSort = (key: string) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const sorted = [...data].sort((a: any, b: any) => {
    if (!sortKey) return 0;
    const va = a[sortKey], vb = b[sortKey];
    const cmp = typeof va === 'number' ? va - vb : String(va ?? '').localeCompare(String(vb ?? ''));
    return sortDir === 'asc' ? cmp : -cmp;
  });

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: FONT }}>
        <thead>
          <tr>
            {columns.map(c => (
              <th key={String(c.key)} onClick={() => handleSort(String(c.key))}
                style={{ textAlign: 'end', padding: '8px 10px', color: '#5C7080', fontSize: 10, letterSpacing: '0.1em',
                  borderBottom: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer', userSelect: 'none',
                  width: c.width, whiteSpace: 'nowrap' }}>
                {c.label} {sortKey === String(c.key) ? (sortDir === 'asc' ? ' ^' : ' v') : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map(row => (
            <tr key={row.id} onClick={() => onRowClick?.(row)}
              style={{ cursor: onRowClick ? 'pointer' : 'default', borderBottom: '1px solid rgba(255,255,255,0.04)' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#383E47')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
              {columns.map(c => (
                <td key={String(c.key)} style={{ padding: '8px 10px', color: '#ABB3BF' }}>
                  {c.render ? c.render(row) : String((row as any)[c.key] ?? '-')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════════
   MAIN COMPONENT: WorkOrder360
   ═════════════════════════════════════════════════════════════════ */

export function WorkOrder360({ workOrderId: propId }: { workOrderId?: number }) {
  const resolvedId = propId ?? (() => {
    const m = window.location.search.match(/[?&]id=(\d+)/);
    return m ? Number(m[1]) : null;
  })();

  const [wo, setWo] = useState<WorkOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // related data
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [materials, setMaterials] = useState<MaterialItem[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [qualityChecks, setQualityChecks] = useState<QualityCheck[]>([]);
  const [signatures, setSignatures] = useState<Signature[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [tabLoading, setTabLoading] = useState(false);

  /* ── fetch work order ── */
  const fetchWo = useCallback(async () => {
    if (!resolvedId) { setError('לא סופק מזהה הזמנת עבודה'); setLoading(false); return; }
    setLoading(true);
    try {
      const res = await api.get(`/api/work-orders/${resolvedId}`);
      setWo(res.data);
    } catch { setError('שגיאה בטעינת הזמנת עבודה'); }
    finally { setLoading(false); }
  }, [resolvedId]);

  useEffect(() => { fetchWo(); }, [fetchWo]);

  /* ── fetch tab data ── */
  const fetchTabData = useCallback(async (tab: TabKey) => {
    if (!resolvedId) return;
    setTabLoading(true);
    try {
      const base = `/api/work-orders/${resolvedId}`;
      switch (tab) {
        case 'team':         { const r = await api.get(`${base}/team`);          setTeam(r.data || []); break; }
        case 'attendance':   { const r = await api.get(`${base}/attendance`);    setAttendance(r.data || []); break; }
        case 'materials':    { const r = await api.get(`${base}/materials`);     setMaterials(r.data || []); break; }
        case 'reservations': { const r = await api.get(`${base}/reservations`);  setReservations(r.data || []); break; }
        case 'quality':      { const r = await api.get(`${base}/quality`);       setQualityChecks(r.data || []); break; }
        case 'signatures':   { const r = await api.get(`${base}/signatures`);    setSignatures(r.data || []); break; }
        case 'expenses':     { const r = await api.get(`${base}/expenses`);      setExpenses(r.data || []); break; }
        case 'alerts':       { const r = await api.get(`${base}/alerts`);        setAlerts(r.data || []); break; }
        case 'documents':    { const r = await api.get(`${base}/documents`);     setDocuments(r.data || []); break; }
        case 'audit_log':    { const r = await api.get(`${base}/audit-log`);     setAuditLog(r.data || []); break; }
      }
    } catch (e) { console.error('[WorkOrder360] Failed to load tab data', tab, e); }
    finally { setTabLoading(false); }
  }, [resolvedId]);

  useEffect(() => { if (activeTab !== 'overview' && activeTab !== 'execution' && activeTab !== 'ai_insights') fetchTabData(activeTab); }, [activeTab, fetchTabData]);

  // initial parallel fetch for side panel
  useEffect(() => {
    if (!resolvedId) return;
    const base = `/api/work-orders/${resolvedId}`;
    Promise.allSettled([
      api.get(`${base}/team`).then(r => setTeam(r.data || [])),
      api.get(`${base}/materials`).then(r => setMaterials(r.data || [])),
      api.get(`${base}/alerts`).then(r => setAlerts(r.data || [])),
      api.get(`${base}/quality`).then(r => setQualityChecks(r.data || [])),
    ]).catch(() => {});
  }, [resolvedId]);

  /* ── actions ── */
  const executeAction = async (actionId: string, body?: any) => {
    if (!resolvedId) return;
    setActionLoading(actionId);
    try {
      await api.post('/api/orchestrator/execute', { entity: 'work_order', entity_id: resolvedId, action: actionId, ...body });
      await fetchWo();
    } catch (e) { console.error('[WorkOrder360] Action failed', actionId, e); }
    finally { setActionLoading(null); }
  };

  const transitionState = async (targetState: string) => {
    if (!resolvedId) return;
    setActionLoading(targetState);
    try {
      await api.post(`/api/work-orders/${resolvedId}/transition`, { target_state: targetState });
      await fetchWo();
    } catch (e) { console.error('[WorkOrder360] Transition failed', e); }
    finally { setActionLoading(null); }
  };

  const updateProgress = async (value: number) => {
    if (!resolvedId) return;
    try {
      await api.put(`/api/work-orders/${resolvedId}/progress`, { progress: value });
      setWo(prev => prev ? { ...prev, progress: value } : prev);
    } catch (e) { console.error('[WorkOrder360] Progress update failed', e); }
  };

  /* ── Next Best Action logic ── */
  const getNextBestAction = (): { label: string; action: () => void } | null => {
    if (!wo) return null;
    if (team.length === 0) return { label: 'שבץ צוות', action: () => executeAction('assign_worker') };
    const missingMats = materials.filter(m => m.quantity_reserved < m.quantity_needed);
    if (missingMats.length > 0) return { label: 'הזמן חומרים חסרים', action: () => executeAction('reserve_materials') };
    if (wo.state === 'assigned') return { label: 'התחל ביצוע', action: () => transitionState('in_progress') };
    if (wo.state === 'in_progress') return { label: 'עדכן התקדמות', action: () => executeAction('update_progress') };
    if (wo.progress >= 100 && wo.state === 'in_progress') return { label: 'סמן כהושלם', action: () => transitionState('done') };
    if (wo.state === 'done') return { label: 'חתימה וסגירה', action: () => transitionState('signed_off') };
    return null;
  };

  /* ── primary context-aware action per state ── */
  const getPrimaryAction = (): { label: string; action: () => void } | null => {
    if (!wo) return null;
    switch (wo.state) {
      case 'open':              return { label: 'שבץ עובדים',     action: () => transitionState('assigned') };
      case 'assigned':          return { label: 'התחל ביצוע',     action: () => transitionState('in_progress') };
      case 'in_progress':       return { label: 'בדיקת איכות',    action: () => transitionState('qa_check') };
      case 'waiting_materials': return { label: 'חומרים הגיעו',   action: () => transitionState('in_progress') };
      case 'qa_check':          return { label: 'סמן כהושלם',     action: () => transitionState('done') };
      case 'done':              return { label: 'חתימה וסגירה',   action: () => transitionState('signed_off') };
      default: return null;
    }
  };

  /* ═══════════════  RENDER  ═══════════════ */

  if (loading) return <div style={{ fontFamily: FONT, direction: 'rtl', padding: 32 }}><Skeleton rows={8} /></div>;
  if (error || !wo) return (
    <div style={{ fontFamily: FONT, direction: 'rtl', padding: 32, color: '#FC8585', textAlign: 'center' }}>
      {error || 'הזמנת עבודה לא נמצאה'}
    </div>
  );

  const stateCfg = STATE_COLORS[wo.state] || STATE_COLORS.open;
  const prioCfg = PRIORITY_COLORS[wo.priority || 'normal'] || PRIORITY_COLORS.normal;
  const qualCfg = QUALITY_COLORS[wo.quality_status || 'pending'] || QUALITY_COLORS.pending;
  const sigCfg = SIGNATURE_COLORS[wo.signature_status || 'pending'] || SIGNATURE_COLORS.pending;
  const hoursUsed = wo.estimated_hours ? Math.round((wo.actual_hours || 0) / wo.estimated_hours * 100) : 0;
  const costUsed = wo.estimated_cost ? Math.round((wo.actual_cost || 0) / wo.estimated_cost * 100) : 0;
  const nextBest = getNextBestAction();
  const primaryAction = getPrimaryAction();
  const openAlertCount = alerts.filter(a => !a.is_resolved).length;

  return (
    <div style={{ fontFamily: FONT, direction: 'rtl', maxWidth: 1600, margin: '0 auto' }}>

      {/* ══════════ HEADER ══════════ */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ width: 10, height: 10, background: stateCfg.fg }} />
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#F6F7F9' }}>{wo.title}</div>
          <div style={{ fontSize: 12, color: '#5C7080', fontFamily: 'monospace' }}>#{wo.wo_number}</div>
        </div>
        <Badge bg={stateCfg.bg} fg={stateCfg.fg} text={stateCfg.label} />
        <Badge bg={prioCfg.bg} fg={prioCfg.fg} text={prioCfg.label} />
        <Badge bg={qualCfg.bg} fg={qualCfg.fg} text={`QA: ${qualCfg.label}`} />
        <Badge bg={sigCfg.bg} fg={sigCfg.fg} text={`SIG: ${sigCfg.label}`} />
        {wo.project_name && <span style={{ fontSize: 11, color: '#48AFF0' }}>| {wo.project_name}</span>}
        {wo.owner_name && <span style={{ fontSize: 11, color: '#ABB3BF' }}>| {wo.owner_name}</span>}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: '#5C7080' }}>עודכן {formatDateTime(wo.updated_at || '')}</span>
      </div>

      {/* ══════════ ACTIONS BAR ══════════ */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {primaryAction && (
          <button onClick={primaryAction.action} disabled={!!actionLoading}
            style={btnPrimary({ fontWeight: 600, opacity: actionLoading ? 0.5 : 1 })}>
            {actionLoading ? '...' : primaryAction.label}
          </button>
        )}
        <button onClick={() => executeAction('assign_worker')} style={btnGhost()} disabled={!!actionLoading}>שבץ צוות</button>
        <button onClick={() => executeAction('reserve_materials')} style={btnGhost()} disabled={!!actionLoading}>הזמן חומרים</button>
        {wo.state === 'open' && <button onClick={() => transitionState('in_progress')} style={btnGhost()} disabled={!!actionLoading}>התחל עבודה</button>}
        <button onClick={() => executeAction('update_progress')} style={btnGhost()} disabled={!!actionLoading}>עדכן התקדמות</button>
        {wo.state === 'in_progress' && <button onClick={() => transitionState('done')} style={btnGhost()} disabled={!!actionLoading}>סמן כהושלם</button>}
        {wo.state === 'done' && <button onClick={() => transitionState('signed_off')} style={btnGhost({ color: '#3DCC91', borderColor: '#3DCC9140' })} disabled={!!actionLoading}>חתימה וסגירה</button>}
      </div>

      {/* ══════════ SUMMARY CARDS — 5 cards ══════════ */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginBottom: 16 }}>
        {/* 1. Identity */}
        <div style={card({ borderTop: '2px solid #48AFF0' })}>
          <div style={labelStyle}>זהות</div>
          <div style={{ fontSize: 13, color: '#F6F7F9', fontWeight: 600, marginBottom: 4 }}>{wo.project_name || '-'}</div>
          <div style={{ fontSize: 11, color: '#ABB3BF' }}>{wo.owner_name || wo.assigned_to || '-'}</div>
          <div style={{ fontSize: 10, color: '#5C7080', marginTop: 4 }}>{wo.city || wo.location || '-'}</div>
          <div style={{ fontSize: 10, color: '#5C7080', marginTop: 2 }}>יעד: {formatDate(wo.due_date || '')}</div>
        </div>

        {/* 2. Progress */}
        <div style={card({ borderTop: '2px solid #3DCC91' })}>
          <div style={labelStyle}>התקדמות</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: wo.progress >= 100 ? '#3DCC91' : '#FFA500', lineHeight: 1, marginBottom: 8, fontVariantNumeric: 'tabular-nums' }}>
            {wo.progress}%
          </div>
          <ProgressBar value={wo.progress} />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
            <span style={{ fontSize: 10, color: '#5C7080' }}>שעות: {wo.actual_hours || 0}/{wo.estimated_hours || '-'}</span>
            <span style={{ fontSize: 10, color: hoursUsed > 100 ? '#FC8585' : '#5C7080' }}>{hoursUsed}%</span>
          </div>
        </div>

        {/* 3. Team */}
        <div style={card({ borderTop: '2px solid #FFB366' })}>
          <div style={labelStyle}>צוות</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: team.length > 0 ? '#FFB366' : '#5C7080', lineHeight: 1 }}>
            {team.length}
          </div>
          <div style={{ fontSize: 11, color: '#5C7080', marginTop: 4 }}>{team.length > 0 ? 'עובדים משובצים' : 'טרם שובצו'}</div>
          {team.slice(0, 3).map(m => (
            <div key={m.id} style={{ fontSize: 10, color: '#ABB3BF', marginTop: 2 }}>{m.name} - {m.role || '-'}</div>
          ))}
          {team.length > 3 && <div style={{ fontSize: 10, color: '#5C7080', marginTop: 2 }}>+{team.length - 3} נוספים</div>}
        </div>

        {/* 4. Materials */}
        <div style={card({ borderTop: '2px solid #9D4EDD' })}>
          <div style={labelStyle}>חומרים</div>
          {(() => {
            const total = materials.length;
            const ready = materials.filter(m => m.quantity_reserved >= m.quantity_needed).length;
            const missing = total - ready;
            return (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: '#ABB3BF' }}>מוכנים</span>
                  <span style={{ fontSize: 13, color: '#3DCC91', fontWeight: 600 }}>{ready}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: '#ABB3BF' }}>חסרים</span>
                  <span style={{ fontSize: 13, color: missing > 0 ? '#FC8585' : '#3DCC91', fontWeight: 600 }}>{missing}</span>
                </div>
                {total > 0 && <ProgressBar value={Math.round(ready / total * 100)} color="#9D4EDD" />}
              </>
            );
          })()}
        </div>

        {/* 5. Quality */}
        <div style={card({ borderTop: `2px solid ${qualCfg.fg}` })}>
          <div style={labelStyle}>איכות</div>
          <Badge bg={qualCfg.bg} fg={qualCfg.fg} text={qualCfg.label} />
          <div style={{ marginTop: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
              <span style={{ fontSize: 10, color: '#5C7080' }}>בדיקות</span>
              <span style={{ fontSize: 11, color: '#ABB3BF' }}>{qualityChecks.length}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 10, color: '#5C7080' }}>עברו</span>
              <span style={{ fontSize: 11, color: '#3DCC91' }}>{qualityChecks.filter(q => q.result === 'passed').length}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ══════════ MAIN LAYOUT: Tabs + Content + Side Panel ══════════ */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 260px', gap: 12 }}>
        {/* LEFT: Tabs + Content */}
        <div>
          {/* Tab strip */}
          <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid rgba(255,255,255,0.08)', marginBottom: 12, overflowX: 'auto' }}>
            {TABS.map(t => (
              <button key={t.key} onClick={() => setActiveTab(t.key)}
                style={{
                  background: 'none', border: 'none', borderBottom: activeTab === t.key ? '2px solid #FFA500' : '2px solid transparent',
                  color: activeTab === t.key ? '#FFA500' : '#5C7080', padding: '8px 14px', fontSize: 11, cursor: 'pointer',
                  fontFamily: FONT, whiteSpace: 'nowrap', transition: 'color 0.15s',
                }}>
                {t.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div style={card({ minHeight: 300 })}>
            {tabLoading ? <Skeleton rows={6} /> : renderTabContent()}
          </div>
        </div>

        {/* RIGHT: Side Panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Next Best Action */}
          {nextBest && (
            <div style={card({ borderTop: '2px solid #FFA500' })}>
              <div style={labelStyle}>NEXT BEST ACTION</div>
              <button onClick={nextBest.action} style={btnPrimary({ width: '100%', textAlign: 'center', fontWeight: 600 })}>
                {nextBest.label}
              </button>
            </div>
          )}

          {/* Linked Entities */}
          <div style={card()}>
            <div style={labelStyle}>ישויות מקושרות</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
              {wo.project_name && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                  <span style={{ fontSize: 11, color: '#5C7080' }}>פרויקט</span>
                  <span style={{ fontSize: 12, color: '#48AFF0', cursor: 'pointer' }}>{wo.project_name}</span>
                </div>
              )}
              {wo.customer_name && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                  <span style={{ fontSize: 11, color: '#5C7080' }}>לקוח</span>
                  <span style={{ fontSize: 12, color: '#ABB3BF' }}>{wo.customer_name}</span>
                </div>
              )}
              <SidePanelLink label="צוות" count={team.length} color="#FFB366" onClick={() => setActiveTab('team')} />
              <SidePanelLink label="חומרים" count={materials.length} color="#9D4EDD" onClick={() => setActiveTab('materials')} />
              <SidePanelLink label="בדיקות איכות" count={qualityChecks.length} color="#3DCC91" onClick={() => setActiveTab('quality')} />
              <SidePanelLink label="חתימות" count={signatures.length} color="#48AFF0" onClick={() => setActiveTab('signatures')} />
            </div>
          </div>

          {/* Open Alerts */}
          <div style={card()}>
            <div style={labelStyle}>התראות פתוחות</div>
            {openAlertCount === 0
              ? <div style={{ fontSize: 11, color: '#3DCC91', marginTop: 6 }}>אין התראות פתוחות</div>
              : alerts.filter(a => !a.is_resolved).slice(0, 5).map(a => (
                <div key={a.id} style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: a.severity === 'critical' ? '#FC8585' : '#FFB366', flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: '#ABB3BF' }}>{a.message}</span>
                </div>
              ))
            }
          </div>

          {/* Progress Slider */}
          <div style={card()}>
            <div style={labelStyle}>עדכן התקדמות</div>
            <input type="range" min={0} max={100} step={5} value={wo.progress}
              onChange={e => updateProgress(parseInt(e.target.value))}
              style={{ width: '100%', accentColor: '#FFA500' }} />
            <div style={{ textAlign: 'center', fontSize: 13, color: '#FFA500', fontWeight: 700, marginTop: 4 }}>{wo.progress}%</div>
          </div>
        </div>
      </div>
    </div>
  );

  /* ─────────────────────  Tab Content Renderer  ───────────────────── */

  function renderTabContent() {
    switch (activeTab) {

      /* ── Overview ── */
      case 'overview':
        return (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <div style={labelStyle}>תיאור</div>
              <div style={{ fontSize: 13, color: '#F6F7F9', lineHeight: 1.6, marginBottom: 16 }}>{wo!.description || wo!.internal_notes || 'אין תיאור'}</div>
              <div style={labelStyle}>פרטים</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {[
                  ['פרויקט', wo!.project_name || '-'],
                  ['לקוח', wo!.customer_name || '-'],
                  ['אחראי', wo!.assigned_to || wo!.owner_name || '-'],
                  ['מיקום', wo!.city || wo!.location || '-'],
                  ['התחלה', formatDate(wo!.started_at || '')],
                  ['סיום', formatDate(wo!.completed_at || '')],
                  ['יעד', formatDate(wo!.due_date || '')],
                  ['נוצר', formatDate(wo!.created_at || '')],
                ].map(([k, v]) => (
                  <div key={k}>
                    <span style={{ fontSize: 10, color: '#5C7080' }}>{k}: </span>
                    <span style={{ fontSize: 12, color: '#ABB3BF' }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div style={labelStyle}>עלויות</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  ['עלות מוערכת', formatCurrency(wo!.estimated_cost || 0), '#48AFF0'],
                  ['עלות בפועל', formatCurrency(wo!.actual_cost || 0), costUsed > 100 ? '#FC8585' : '#FFB366'],
                  ['שעות מוערכות', `${wo!.estimated_hours || '-'}`, '#48AFF0'],
                  ['שעות בפועל', `${wo!.actual_hours || 0}`, hoursUsed > 100 ? '#FC8585' : '#FFB366'],
                ].map(([k, v, c]) => (
                  <div key={k as string} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <span style={{ fontSize: 12, color: '#ABB3BF' }}>{k}</span>
                    <span style={{ fontSize: 13, color: c as string, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{v}</span>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 16 }}>
                <div style={labelStyle}>סטטוסים</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                  <Badge bg={stateCfg.bg} fg={stateCfg.fg} text={`מצב: ${stateCfg.label}`} />
                  <Badge bg={qualCfg.bg} fg={qualCfg.fg} text={`איכות: ${qualCfg.label}`} />
                  <Badge bg={sigCfg.bg} fg={sigCfg.fg} text={`חתימה: ${sigCfg.label}`} />
                </div>
              </div>
            </div>
          </div>
        );

      /* ── Execution ── */
      case 'execution':
        return (
          <div>
            <div style={labelStyle}>מסלול ביצוע</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0, marginTop: 12, position: 'relative', paddingRight: 20 }}>
              <div style={{ position: 'absolute', right: 6, top: 0, bottom: 0, width: 2, background: '#383E47' }} />
              {[
                { label: 'נפתח',    state: 'open',              active: true },
                { label: 'שובץ',    state: 'assigned',          active: ['assigned','in_progress','waiting_materials','qa_check','done','signed_off'].includes(wo!.state) },
                { label: 'בביצוע',  state: 'in_progress',       active: ['in_progress','waiting_materials','qa_check','done','signed_off'].includes(wo!.state) },
                { label: 'בדיקת QA', state: 'qa_check',         active: ['qa_check','done','signed_off'].includes(wo!.state) },
                { label: 'הושלם',   state: 'done',              active: ['done','signed_off'].includes(wo!.state) },
                { label: 'נחתם',    state: 'signed_off',        active: wo!.state === 'signed_off' },
              ].map((step, i) => {
                const isCurrent = step.state === wo!.state;
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', position: 'relative' }}>
                    <div style={{
                      width: 14, height: 14, borderRadius: '50%', zIndex: 1, flexShrink: 0,
                      background: isCurrent ? '#FFA500' : step.active ? '#3DCC91' : '#383E47',
                      border: `2px solid ${isCurrent ? '#FFA500' : step.active ? '#3DCC91' : '#5C7080'}`,
                    }} />
                    <div>
                      <div style={{ fontSize: 13, color: isCurrent ? '#FFA500' : step.active ? '#F6F7F9' : '#5C7080', fontWeight: isCurrent ? 700 : step.active ? 500 : 400 }}>
                        {step.label}
                        {isCurrent && <span style={{ fontSize: 10, color: '#FFA500', marginRight: 6 }}>(נוכחי)</span>}
                      </div>
                    </div>
                    {!step.active && step.state !== wo!.state && (
                      <button onClick={() => transitionState(step.state)} style={btnGhost({ padding: '2px 8px', fontSize: 10 })} disabled={!!actionLoading}>
                        קפוץ לשלב
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            {/* Progress */}
            <div style={{ marginTop: 24 }}>
              <div style={labelStyle}>התקדמות ביצוע</div>
              <ProgressBar value={wo!.progress} height={10} />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                <span style={{ fontSize: 11, color: '#5C7080' }}>{wo!.progress}%</span>
                <span style={{ fontSize: 11, color: '#5C7080' }}>שעות: {wo!.actual_hours || 0} / {wo!.estimated_hours || '-'}</span>
              </div>
            </div>
          </div>
        );

      /* ── Team ── */
      case 'team':
        return team.length === 0
          ? <EmptyState message="לא שובצו עובדים להזמנת עבודה" actionLabel="+ שבץ צוות" onAction={() => executeAction('assign_worker')} />
          : (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={labelStyle}>צוות</div>
                <button style={btnGhost({ padding: '4px 10px', fontSize: 11 })} onClick={() => executeAction('assign_worker')}>+ שבץ</button>
              </div>
              <SortableTable columns={[
                { key: 'name', label: 'שם', render: r => <span style={{ color: '#F6F7F9', fontWeight: 500 }}>{r.name}</span> },
                { key: 'role', label: 'תפקיד', width: 110 },
                { key: 'phone', label: 'טלפון', width: 110, render: r => <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{r.phone || '-'}</span> },
                { key: 'hours_logged', label: 'שעות', width: 70, render: r => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{r.hours_logged || 0}</span> },
                { key: 'status', label: 'סטטוס', width: 80, render: r => <Badge bg={r.status === 'active' ? 'rgba(61,204,145,0.15)' : 'rgba(255,255,255,0.05)'} fg={r.status === 'active' ? '#3DCC91' : '#5C7080'} text={r.status || '-'} /> },
                { key: 'assigned_date', label: 'שובץ', width: 90, render: r => <span style={{ fontSize: 11 }}>{formatDate(r.assigned_date || '')}</span> },
              ] as Column<TeamMember>[]} data={team} />
            </div>
          );

      /* ── Attendance ── */
      case 'attendance':
        return attendance.length === 0
          ? <EmptyState message="אין רשומות נוכחות" />
          : (
            <div>
              <div style={labelStyle}>נוכחות</div>
              <SortableTable columns={[
                { key: 'employee_name', label: 'עובד', render: r => <span style={{ color: '#F6F7F9' }}>{r.employee_name}</span> },
                { key: 'date', label: 'תאריך', width: 100, render: r => <span style={{ fontSize: 11 }}>{formatDate(r.date)}</span> },
                { key: 'check_in', label: 'כניסה', width: 80, render: r => <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{r.check_in || '-'}</span> },
                { key: 'check_out', label: 'יציאה', width: 80, render: r => <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{r.check_out || '-'}</span> },
                { key: 'hours', label: 'שעות', width: 60, render: r => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{r.hours || '-'}</span> },
                { key: 'status', label: 'סטטוס', width: 80, render: r => <Badge bg="rgba(255,255,255,0.05)" fg={r.status === 'present' ? '#3DCC91' : '#FFB366'} text={r.status || '-'} /> },
              ] as Column<AttendanceRecord>[]} data={attendance} />
            </div>
          );

      /* ── Materials ── */
      case 'materials':
        return materials.length === 0
          ? <EmptyState message="אין חומרים מוגדרים להזמנת עבודה" actionLabel="+ הזמן חומרים" onAction={() => executeAction('reserve_materials')} />
          : (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={labelStyle}>חומרים</div>
                <button style={btnGhost({ padding: '4px 10px', fontSize: 11 })} onClick={() => executeAction('reserve_materials')}>+ הזמן</button>
              </div>
              <SortableTable columns={[
                { key: 'material_name', label: 'חומר', render: r => <span style={{ color: '#F6F7F9' }}>{r.material_name}</span> },
                { key: 'quantity_needed', label: 'נדרש', width: 70 },
                { key: 'quantity_reserved', label: 'שמור', width: 70, render: r => <span style={{ color: r.quantity_reserved >= r.quantity_needed ? '#3DCC91' : '#FC8585' }}>{r.quantity_reserved}</span> },
                { key: 'status', label: 'סטטוס', width: 100, render: r => <Badge bg={r.status === 'ready' ? 'rgba(61,204,145,0.15)' : 'rgba(255,179,102,0.15)'} fg={r.status === 'ready' ? '#3DCC91' : '#FFB366'} text={r.status} /> },
                { key: 'location', label: 'מיקום', width: 100 },
              ] as Column<MaterialItem>[]} data={materials} />
            </div>
          );

      /* ── Reservations ── */
      case 'reservations':
        return reservations.length === 0
          ? <EmptyState message="אין שמורים למלאי" actionLabel="+ שמור מלאי" onAction={() => executeAction('reserve_materials')} />
          : (
            <div>
              <div style={labelStyle}>שמורים למלאי</div>
              <SortableTable columns={[
                { key: 'material_name', label: 'חומר', render: r => <span style={{ color: '#F6F7F9' }}>{r.material_name}</span> },
                { key: 'quantity', label: 'כמות', width: 80 },
                { key: 'warehouse', label: 'מחסן', width: 110 },
                { key: 'status', label: 'סטטוס', width: 100, render: r => <Badge bg="rgba(255,255,255,0.05)" fg={r.status === 'confirmed' ? '#3DCC91' : '#FFB366'} text={r.status} /> },
                { key: 'reserved_at', label: 'תאריך', width: 100, render: r => <span style={{ fontSize: 11 }}>{formatDate(r.reserved_at || '')}</span> },
              ] as Column<Reservation>[]} data={reservations} />
            </div>
          );

      /* ── Quality ── */
      case 'quality':
        return qualityChecks.length === 0
          ? <EmptyState message="לא בוצעו בדיקות איכות" actionLabel="+ הוסף בדיקה" onAction={() => executeAction('add_quality_check')} />
          : (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={labelStyle}>בדיקות איכות</div>
                <button style={btnGhost({ padding: '4px 10px', fontSize: 11 })} onClick={() => executeAction('add_quality_check')}>+ בדיקה</button>
              </div>
              <SortableTable columns={[
                { key: 'check_type', label: 'סוג בדיקה', render: r => <span style={{ color: '#F6F7F9' }}>{r.check_type}</span> },
                { key: 'inspector', label: 'בודק', width: 110 },
                { key: 'result', label: 'תוצאה', width: 90, render: r => { const q = QUALITY_COLORS[r.result] || QUALITY_COLORS.pending; return <Badge bg={q.bg} fg={q.fg} text={q.label} />; } },
                { key: 'notes', label: 'הערות', render: r => <span style={{ fontSize: 11, color: '#5C7080' }}>{r.notes || '-'}</span> },
                { key: 'checked_at', label: 'תאריך', width: 100, render: r => <span style={{ fontSize: 11 }}>{formatDate(r.checked_at || '')}</span> },
              ] as Column<QualityCheck>[]} data={qualityChecks} />
            </div>
          );

      /* ── Signatures ── */
      case 'signatures':
        return signatures.length === 0
          ? <EmptyState message="אין חתימות להזמנת עבודה" actionLabel="+ בקש חתימה" onAction={() => executeAction('request_signature')} />
          : (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={labelStyle}>חתימות</div>
                <button style={btnGhost({ padding: '4px 10px', fontSize: 11 })} onClick={() => executeAction('request_signature')}>+ בקש חתימה</button>
              </div>
              <SortableTable columns={[
                { key: 'signer_name', label: 'חותם', render: r => <span style={{ color: '#F6F7F9', fontWeight: 500 }}>{r.signer_name}</span> },
                { key: 'role', label: 'תפקיד', width: 110 },
                { key: 'status', label: 'סטטוס', width: 90, render: r => { const s = SIGNATURE_COLORS[r.status] || SIGNATURE_COLORS.pending; return <Badge bg={s.bg} fg={s.fg} text={s.label} />; } },
                { key: 'signed_at', label: 'נחתם', width: 100, render: r => <span style={{ fontSize: 11 }}>{r.signed_at ? formatDateTime(r.signed_at) : '-'}</span> },
              ] as Column<Signature>[]} data={signatures} />
            </div>
          );

      /* ── Expenses ── */
      case 'expenses':
        return expenses.length === 0
          ? <EmptyState message="אין הוצאות רשומות" actionLabel="+ הוסף הוצאה" onAction={() => executeAction('add_expense')} />
          : (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={labelStyle}>הוצאות</div>
                <button style={btnGhost({ padding: '4px 10px', fontSize: 11 })} onClick={() => executeAction('add_expense')}>+ הוצאה</button>
              </div>
              <SortableTable columns={[
                { key: 'description', label: 'תיאור', render: r => <span style={{ color: '#F6F7F9' }}>{r.description}</span> },
                { key: 'category', label: 'קטגוריה', width: 100 },
                { key: 'amount', label: 'סכום', width: 100, render: r => <span style={{ color: '#FC8585', fontWeight: 600 }}>{formatCurrency(r.amount)}</span> },
                { key: 'approved', label: 'מאושר', width: 70, render: r => <span style={{ color: r.approved ? '#3DCC91' : '#FFB366' }}>{r.approved ? 'V' : 'X'}</span> },
                { key: 'date', label: 'תאריך', width: 90, render: r => <span style={{ fontSize: 11 }}>{formatDate(r.date || '')}</span> },
              ] as Column<Expense>[]} data={expenses} />
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                <span style={{ fontSize: 12, color: '#5C7080', marginLeft: 8 }}>סה"כ:</span>
                <span style={{ fontSize: 14, color: '#FC8585', fontWeight: 700 }}>{formatCurrency(expenses.reduce((s, e) => s + e.amount, 0))}</span>
              </div>
            </div>
          );

      /* ── Alerts ── */
      case 'alerts':
        return alerts.length === 0
          ? <EmptyState message="אין התראות - הכל תקין" />
          : (
            <div>
              <div style={labelStyle}>התראות</div>
              {alerts.map(a => (
                <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: a.is_resolved ? '#5C7080' : (a.severity === 'critical' ? '#FC8585' : '#FFB366'), flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, color: a.is_resolved ? '#5C7080' : '#F6F7F9', textDecoration: a.is_resolved ? 'line-through' : 'none' }}>{a.message}</div>
                    <div style={{ fontSize: 10, color: '#5C7080' }}>{a.type} | {formatDateTime(a.created_at || '')}</div>
                  </div>
                  {!a.is_resolved && <Badge bg="rgba(252,133,133,0.15)" fg="#FC8585" text={a.severity || 'info'} />}
                </div>
              ))}
            </div>
          );

      /* ── Documents ── */
      case 'documents':
        return documents.length === 0
          ? <EmptyState message="אין מסמכים מצורפים" actionLabel="+ העלה מסמך" onAction={() => executeAction('add_document')} />
          : (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={labelStyle}>מסמכים</div>
                <button style={btnGhost({ padding: '4px 10px', fontSize: 11 })} onClick={() => executeAction('add_document')}>+ מסמך</button>
              </div>
              <SortableTable columns={[
                { key: 'name', label: 'שם', render: r => <span style={{ color: '#F6F7F9' }}>{r.name}</span> },
                { key: 'type', label: 'סוג', width: 90 },
                { key: 'uploaded_by', label: 'הועלה ע"י', width: 110 },
                { key: 'created_at', label: 'תאריך', width: 100, render: r => <span style={{ fontSize: 11 }}>{formatDate(r.created_at || '')}</span> },
              ] as Column<Document>[]} data={documents} />
            </div>
          );

      /* ── AI Insights ── */
      case 'ai_insights':
        return (
          <div>
            <div style={labelStyle}>AI INSIGHTS - WORK ORDER INTELLIGENCE</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
              <div style={{ background: '#383E47', padding: 14 }}>
                <div style={{ fontSize: 11, color: '#FFA500', fontWeight: 600, marginBottom: 8 }}>COMPLETION FORECAST</div>
                <div style={{ fontSize: 13, color: '#F6F7F9' }}>
                  {wo!.progress >= 90 ? 'קרוב לסיום. צפי לסיום בזמן.'
                    : wo!.progress >= 50 ? 'התקדמות סבירה. יש לעקוב אחר משאבים קריטיים.'
                    : 'התקדמות איטית. יש סיכון לעיכוב.'}
                </div>
              </div>
              <div style={{ background: '#383E47', padding: 14 }}>
                <div style={{ fontSize: 11, color: '#48AFF0', fontWeight: 600, marginBottom: 8 }}>RESOURCE UTILIZATION</div>
                <div style={{ fontSize: 13, color: '#F6F7F9' }}>
                  {team.length === 0 ? 'לא שובצו עובדים - נדרש שיבוץ צוות.'
                    : hoursUsed > 100 ? `חריגת שעות (${hoursUsed}%). יש לבדוק יעילות הצוות.`
                    : `ניצול שעות: ${hoursUsed}%. ${hoursUsed > 80 ? 'קרוב ליעד.' : 'בתקציב שעות.'}`}
                </div>
              </div>
              <div style={{ background: '#383E47', padding: 14 }}>
                <div style={{ fontSize: 11, color: '#9D4EDD', fontWeight: 600, marginBottom: 8 }}>MATERIAL READINESS</div>
                <div style={{ fontSize: 13, color: '#F6F7F9' }}>
                  {materials.length === 0 ? 'לא הוגדרו חומרים.'
                    : (() => {
                      const missing = materials.filter(m => m.quantity_reserved < m.quantity_needed).length;
                      return missing > 0 ? `${missing} פריטי חומר חסרים. יש להזמין לפני המשך.` : 'כל החומרים מוכנים.';
                    })()}
                </div>
              </div>
              <div style={{ background: '#383E47', padding: 14 }}>
                <div style={{ fontSize: 11, color: '#3DCC91', fontWeight: 600, marginBottom: 8 }}>QUALITY SCORE</div>
                <div style={{ fontSize: 13, color: '#F6F7F9' }}>
                  {qualityChecks.length === 0 ? 'טרם בוצעו בדיקות איכות.'
                    : (() => {
                      const passed = qualityChecks.filter(q => q.result === 'passed').length;
                      const rate = Math.round(passed / qualityChecks.length * 100);
                      return `${rate}% עברו בהצלחה (${passed}/${qualityChecks.length}). ${rate >= 80 ? 'ציון איכות טוב.' : 'נדרש שיפור.'}`;
                    })()}
                </div>
              </div>
            </div>
            {/* Recommended Actions */}
            <div style={{ background: '#383E47', padding: 14, marginTop: 12 }}>
              <div style={{ fontSize: 11, color: '#FFA500', fontWeight: 600, marginBottom: 8 }}>RECOMMENDED ACTIONS</div>
              <div style={{ fontSize: 12, color: '#ABB3BF', lineHeight: 1.8 }}>
                {nextBest && <div>1. {nextBest.label}</div>}
                {team.length === 0 && <div>2. שבץ צוות עבודה</div>}
                {materials.filter(m => m.quantity_reserved < m.quantity_needed).length > 0 && <div>3. השלם חומרים חסרים</div>}
                {wo!.progress >= 90 && wo!.state === 'in_progress' && <div>4. בדוק תקינות ועבור ל-QA</div>}
                {openAlertCount > 0 && <div>5. טפל ב-{openAlertCount} התראות פתוחות</div>}
              </div>
            </div>
          </div>
        );

      /* ── Audit Log ── */
      case 'audit_log':
        return auditLog.length === 0
          ? <EmptyState message="אין רשומות ביומן הפעולות" />
          : (
            <div>
              <div style={labelStyle}>יומן פעולות</div>
              {auditLog.map(entry => (
                <div key={entry.id} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <div style={{ width: 4, background: '#FFA500', flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, color: '#F6F7F9' }}>{entry.action}</div>
                    {entry.details && <div style={{ fontSize: 11, color: '#5C7080' }}>{entry.details}</div>}
                  </div>
                  <div style={{ textAlign: 'start', flexShrink: 0 }}>
                    <div style={{ fontSize: 10, color: '#5C7080' }}>{entry.user || '-'}</div>
                    <div style={{ fontSize: 10, color: '#383E47' }}>{formatDateTime(entry.created_at || '')}</div>
                  </div>
                </div>
              ))}
            </div>
          );

      default:
        return <EmptyState message="תוכן בפיתוח" />;
    }
  }
}

/* ── Side Panel Link ── */
function SidePanelLink({ label, count, color, onClick }: { label: string; count: number; color: string; onClick: () => void }) {
  return (
    <div onClick={onClick} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px', cursor: 'pointer', borderRadius: 2, transition: 'background 0.15s' }}
      onMouseEnter={e => (e.currentTarget.style.background = '#383E47')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
      <span style={{ fontSize: 12, color: '#ABB3BF' }}>{label}</span>
      <span style={{ fontSize: 13, color, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{count}</span>
    </div>
  );
}
