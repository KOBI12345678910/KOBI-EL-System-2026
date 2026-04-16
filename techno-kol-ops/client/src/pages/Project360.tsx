import React, { useState, useEffect, useCallback } from 'react';
import { useApi, api } from '../hooks/useApi';
import { formatCurrency, formatDate, formatDateTime } from '../utils/format';

/* ─────────────────────────  TYPES  ───────────────────────── */

interface Project {
  id: number;
  project_number: string;
  project_name: string;
  customer_id: number;
  customer_name?: string;
  state: string;
  priority?: string;
  owner_user_id?: number;
  owner_name?: string;
  budget_amount: number;
  actual_cost: number;
  billed_amount: number;
  collected_amount: number;
  progress_percent: number;
  planned_start_date?: string;
  planned_end_date?: string;
  actual_start_date?: string;
  city?: string;
  internal_notes?: string;
  created_at?: string;
  updated_at?: string;
}

interface WorkOrder { id: number; wo_number: string; title: string; status: string; assigned_to?: string; priority?: string; progress: number; due_date?: string; }
interface PO { id: number; po_number: string; supplier_name?: string; status: string; total: number; created_at?: string; }
interface MaterialReq { id: number; material_name: string; quantity: number; status: string; rfq_id?: number; created_at?: string; }
interface Invoice { id: number; invoice_number: string; customer_name?: string; status: string; gross_amount: number; amount_paid: number; due_date?: string; }
interface Payment { id: number; reference: string; amount: number; method?: string; date?: string; }
interface Employee { id: number; name: string; role?: string; assigned_date?: string; hours_logged?: number; }
interface Task { id: number; title: string; assignee?: string; status: string; due_date?: string; priority?: string; }
interface Expense { id: number; description: string; amount: number; category?: string; date?: string; approved?: boolean; }
interface LogisticsOrder { id: number; description: string; status: string; pickup_date?: string; delivery_date?: string; }
interface Document { id: number; name: string; type?: string; uploaded_by?: string; created_at?: string; url?: string; }
interface AuditEntry { id: number; action: string; user?: string; details?: string; created_at?: string; }
interface Alert { id: number; type: string; message: string; severity?: string; is_resolved: boolean; created_at?: string; }
interface Phase { id: number; name: string; status: string; progress: number; start_date?: string; end_date?: string; }
interface InventoryItem { id: number; material_name: string; reserved: number; available: number; location?: string; }
interface Report { id: number; title: string; type?: string; created_at?: string; url?: string; }

type TabKey =
  | 'overview' | 'timeline' | 'phases' | 'work_orders' | 'procurement'
  | 'materials' | 'inventory' | 'employees' | 'tasks' | 'expenses'
  | 'logistics' | 'invoices' | 'payments' | 'reports' | 'alerts'
  | 'documents' | 'ai_insights' | 'audit_log';

/* ─────────────────────────  CONSTANTS  ───────────────────────── */

const STATE_COLORS: Record<string, { bg: string; fg: string; label: string }> = {
  draft:          { bg: 'rgba(92,112,128,0.2)',  fg: '#5C7080', label: 'טיוטה' },
  approved:       { bg: 'rgba(61,204,145,0.15)', fg: '#3DCC91', label: 'מאושר' },
  in_planning:    { bg: 'rgba(72,175,240,0.15)', fg: '#48AFF0', label: 'בתכנון' },
  in_procurement: { bg: 'rgba(255,179,102,0.15)',fg: '#FFB366', label: 'ברכש' },
  in_production:  { bg: 'rgba(157,78,221,0.15)', fg: '#9D4EDD', label: 'בייצור' },
  in_delivery:    { bg: 'rgba(255,165,0,0.15)',  fg: '#FFA500', label: 'באספקה' },
  completed:      { bg: 'rgba(61,204,145,0.2)',  fg: '#3DCC91', label: 'הושלם' },
  closed:         { bg: 'rgba(92,112,128,0.15)', fg: '#5C7080', label: 'סגור' },
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
  { key: 'timeline',     label: 'ציר זמן' },
  { key: 'phases',       label: 'שלבים' },
  { key: 'work_orders',  label: 'הזמנות עבודה' },
  { key: 'procurement',  label: 'רכש' },
  { key: 'materials',    label: 'חומרים' },
  { key: 'inventory',    label: 'מלאי' },
  { key: 'employees',    label: 'עובדים' },
  { key: 'tasks',        label: 'משימות' },
  { key: 'expenses',     label: 'הוצאות' },
  { key: 'logistics',    label: 'לוגיסטיקה' },
  { key: 'invoices',     label: 'חשבוניות' },
  { key: 'payments',     label: 'תשלומים' },
  { key: 'reports',      label: 'דוחות' },
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
const valStyle: React.CSSProperties = { fontSize: 14, color: '#F6F7F9', fontWeight: 600 };

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
                style={{ textAlign: 'right', padding: '8px 10px', color: '#5C7080', fontSize: 10, letterSpacing: '0.1em',
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

/* ─────────────────────────  PROGRESS BAR  ───────────────────────── */

function ProgressBar({ value, height = 6, color }: { value: number; height?: number; color?: string }) {
  const clr = color || (value >= 100 ? '#3DCC91' : value >= 60 ? '#48AFF0' : value >= 30 ? '#FFB366' : '#FC8585');
  return (
    <div style={{ width: '100%', height, background: '#383E47', borderRadius: 2, overflow: 'hidden' }}>
      <div style={{ width: `${Math.min(value, 100)}%`, height: '100%', background: clr, transition: 'width 0.3s' }} />
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════════
   MAIN COMPONENT: Project360
   ═════════════════════════════════════════════════════════════════ */

export function Project360({ projectId: propProjectId }: { projectId?: number }) {
  // resolve project id from prop or URL
  const resolvedId = propProjectId ?? (() => {
    const m = window.location.search.match(/[?&]id=(\d+)/);
    return m ? Number(m[1]) : null;
  })();

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // related data states
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [pos, setPos] = useState<PO[]>([]);
  const [materials, setMaterials] = useState<MaterialReq[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [logistics, setLogistics] = useState<LogisticsOrder[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [tabLoading, setTabLoading] = useState(false);

  /* ── fetch project ── */
  const fetchProject = useCallback(async () => {
    if (!resolvedId) { setError('לא סופק מזהה פרויקט'); setLoading(false); return; }
    setLoading(true);
    try {
      const res = await api.get(`/api/projects/${resolvedId}`);
      setProject(res.data);
    } catch { setError('שגיאה בטעינת פרויקט'); }
    finally { setLoading(false); }
  }, [resolvedId]);

  useEffect(() => { fetchProject(); }, [fetchProject]);

  /* ── fetch tab data ── */
  const fetchTabData = useCallback(async (tab: TabKey) => {
    if (!resolvedId) return;
    setTabLoading(true);
    try {
      const base = `/api/projects/${resolvedId}`;
      switch (tab) {
        case 'work_orders':  { const r = await api.get(`${base}/work-orders`);  setWorkOrders(r.data || []); break; }
        case 'procurement':  { const r = await api.get(`${base}/pos`);          setPos(r.data || []); break; }
        case 'materials':    { const r = await api.get(`${base}/materials`);     setMaterials(r.data || []); break; }
        case 'inventory':    { const r = await api.get(`${base}/inventory`);     setInventory(r.data || []); break; }
        case 'invoices':     { const r = await api.get(`${base}/invoices`);      setInvoices(r.data || []); break; }
        case 'payments':     { const r = await api.get(`${base}/payments`);      setPayments(r.data || []); break; }
        case 'employees':    { const r = await api.get(`${base}/employees`);     setEmployees(r.data || []); break; }
        case 'tasks':        { const r = await api.get(`${base}/tasks`);         setTasks(r.data || []); break; }
        case 'expenses':     { const r = await api.get(`${base}/expenses`);      setExpenses(r.data || []); break; }
        case 'logistics':    { const r = await api.get(`${base}/logistics`);     setLogistics(r.data || []); break; }
        case 'documents':    { const r = await api.get(`${base}/documents`);     setDocuments(r.data || []); break; }
        case 'audit_log':    { const r = await api.get(`${base}/audit-log`);     setAuditLog(r.data || []); break; }
        case 'alerts':       { const r = await api.get(`${base}/alerts`);        setAlerts(r.data || []); break; }
        case 'phases':       { const r = await api.get(`${base}/phases`);        setPhases(r.data || []); break; }
        case 'reports':      { const r = await api.get(`${base}/reports`);       setReports(r.data || []); break; }
      }
    } catch (e) { console.error('[Project360] Failed to load tab data', tab, e); }
    finally { setTabLoading(false); }
  }, [resolvedId]);

  useEffect(() => { if (activeTab !== 'overview' && activeTab !== 'timeline' && activeTab !== 'ai_insights') fetchTabData(activeTab); }, [activeTab, fetchTabData]);

  // initial parallel fetch for side panel data
  useEffect(() => {
    if (!resolvedId) return;
    const base = `/api/projects/${resolvedId}`;
    Promise.allSettled([
      api.get(`${base}/work-orders`).then(r => setWorkOrders(r.data || [])),
      api.get(`${base}/alerts`).then(r => setAlerts(r.data || [])),
      api.get(`${base}/materials`).then(r => setMaterials(r.data || [])),
      api.get(`${base}/invoices`).then(r => setInvoices(r.data || [])),
    ]).catch(() => {});
  }, [resolvedId]);

  /* ── actions ── */
  const executeAction = async (actionId: string, body?: any) => {
    if (!resolvedId) return;
    setActionLoading(actionId);
    try {
      await api.post('/api/orchestrator/execute', { entity: 'project', entity_id: resolvedId, action: actionId, ...body });
      await fetchProject();
    } catch (e) { console.error('[Project360] Action failed', actionId, e); }
    finally { setActionLoading(null); }
  };

  const transitionState = async (targetState: string) => {
    if (!resolvedId) return;
    setActionLoading(targetState);
    try {
      await api.post(`/api/projects/${resolvedId}/transition`, { target_state: targetState });
      await fetchProject();
    } catch (e) { console.error('[Project360] Transition failed', e); }
    finally { setActionLoading(null); }
  };

  /* ── Next Best Action logic ── */
  const getNextBestAction = (): { label: string; action: () => void } | null => {
    if (!project) return null;
    const openAlerts = alerts.filter(a => !a.is_resolved && (a.severity === 'critical' || a.severity === 'high'));
    if (openAlerts.length > 0) return { label: 'פתח התראות קריטיות', action: () => setActiveTab('alerts') };
    if (workOrders.length === 0) return { label: 'צור הזמנת עבודה', action: () => executeAction('create_work_order') };
    const pendingMats = materials.filter(m => m.status === 'pending' && !m.rfq_id);
    if (pendingMats.length > 0) return { label: 'צור RFQ לחומרים ממתינים', action: () => executeAction('create_rfq') };
    if (project.billed_amount < project.actual_cost * 0.5 && project.progress_percent > 50) return { label: 'צור חשבונית', action: () => executeAction('create_invoice') };
    return null;
  };

  /* ── primary context-aware action per state ── */
  const getPrimaryAction = (): { label: string; action: () => void } | null => {
    if (!project) return null;
    switch (project.state) {
      case 'draft':          return { label: 'אשר פרויקט',    action: () => transitionState('approved') };
      case 'approved':       return { label: 'התחל תכנון',     action: () => transitionState('in_planning') };
      case 'in_planning':    return { label: 'התחל רכש',       action: () => transitionState('in_procurement') };
      case 'in_procurement': return { label: 'התחל ייצור',     action: () => transitionState('in_production') };
      case 'in_production':  return { label: 'התחל אספקה',     action: () => transitionState('in_delivery') };
      case 'in_delivery':    return { label: 'סמן כהושלם',     action: () => transitionState('completed') };
      case 'completed':      return { label: 'סגור פרויקט',    action: () => transitionState('closed') };
      default: return null;
    }
  };

  /* ═══════════════  RENDER  ═══════════════ */

  if (loading) return <div style={{ fontFamily: FONT, direction: 'rtl', padding: 32 }}><Skeleton rows={8} /></div>;
  if (error || !project) return (
    <div style={{ fontFamily: FONT, direction: 'rtl', padding: 32, color: '#FC8585', textAlign: 'center' }}>
      {error || 'פרויקט לא נמצא'}
    </div>
  );

  const stateCfg = STATE_COLORS[project.state] || STATE_COLORS.draft;
  const prioCfg = PRIORITY_COLORS[project.priority || 'normal'] || PRIORITY_COLORS.normal;
  const budgetUsed = project.budget_amount > 0 ? Math.round((project.actual_cost / project.budget_amount) * 100) : 0;
  const nextBest = getNextBestAction();
  const primaryAction = getPrimaryAction();
  const openAlertCount = alerts.filter(a => !a.is_resolved).length;

  return (
    <div style={{ fontFamily: FONT, direction: 'rtl', maxWidth: 1600, margin: '0 auto' }}>

      {/* ══════════ HEADER ══════════ */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ width: 10, height: 10, background: stateCfg.fg }} />
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#F6F7F9' }}>{project.project_name}</div>
          <div style={{ fontSize: 12, color: '#5C7080', fontFamily: 'monospace' }}>#{project.project_number}</div>
        </div>
        <Badge bg={stateCfg.bg} fg={stateCfg.fg} text={stateCfg.label} />
        <Badge bg={prioCfg.bg} fg={prioCfg.fg} text={prioCfg.label} />
        {project.owner_name && <span style={{ fontSize: 11, color: '#ABB3BF' }}>| {project.owner_name}</span>}
        {project.city && <span style={{ fontSize: 11, color: '#5C7080' }}>| {project.city}</span>}
        {project.customer_name && <span style={{ fontSize: 11, color: '#48AFF0' }}>| {project.customer_name}</span>}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: '#5C7080' }}>עודכן {formatDateTime(project.updated_at || '')}</span>
      </div>

      {/* ══════════ ACTIONS BAR ══════════ */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {primaryAction && (
          <button onClick={primaryAction.action} disabled={!!actionLoading}
            style={btnPrimary({ fontWeight: 600, opacity: actionLoading ? 0.5 : 1 })}>
            {actionLoading === project.state ? '...' : primaryAction.label}
          </button>
        )}
        <button onClick={() => executeAction('create_work_order')} style={btnGhost()} disabled={!!actionLoading}>+ הזמנת עבודה</button>
        <button onClick={() => executeAction('create_po')} style={btnGhost()} disabled={!!actionLoading}>+ הזמנת רכש</button>
        <button onClick={() => executeAction('allocate_materials')} style={btnGhost()} disabled={!!actionLoading}>הקצה חומרים</button>
        <button onClick={() => executeAction('assign_employees')} style={btnGhost()} disabled={!!actionLoading}>שבץ עובדים</button>
        <button onClick={() => executeAction('add_task')} style={btnGhost()} disabled={!!actionLoading}>+ משימה</button>
        <button onClick={() => executeAction('create_invoice')} style={btnGhost()} disabled={!!actionLoading}>+ חשבונית</button>
        {project.state !== 'closed' && (
          <button onClick={() => transitionState('closed')} style={btnGhost({ color: '#FC8585', borderColor: '#FC858540' })} disabled={!!actionLoading}>סגור פרויקט</button>
        )}
      </div>

      {/* ══════════ SUMMARY BAND — 6 cards ══════════ */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginBottom: 16 }}>
        {/* 1. Identity */}
        <div style={card({ borderTop: '2px solid #48AFF0' })}>
          <div style={labelStyle}>זהות</div>
          <div style={{ fontSize: 14, color: '#F6F7F9', fontWeight: 600, marginBottom: 4 }}>{project.project_name}</div>
          <div style={{ fontSize: 11, color: '#ABB3BF' }}>{project.customer_name || '-'}</div>
          <div style={{ fontSize: 10, color: '#5C7080', marginTop: 4 }}>
            {formatDate(project.planned_start_date || '')} - {formatDate(project.planned_end_date || '')}
          </div>
        </div>

        {/* 2. Progress */}
        <div style={card({ borderTop: '2px solid #3DCC91' })}>
          <div style={labelStyle}>התקדמות</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#3DCC91', lineHeight: 1, marginBottom: 8, fontVariantNumeric: 'tabular-nums' }}>
            {project.progress_percent}%
          </div>
          <ProgressBar value={project.progress_percent} />
        </div>

        {/* 3. Budget vs Actual */}
        <div style={card({ borderTop: `2px solid ${budgetUsed > 100 ? '#FC8585' : '#FFA500'}` })}>
          <div style={labelStyle}>תקציב מול ביצוע</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 11, color: '#ABB3BF' }}>תקציב</span>
            <span style={{ fontSize: 13, color: '#F6F7F9', fontWeight: 600 }}>{formatCurrency(project.budget_amount)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 11, color: '#ABB3BF' }}>בפועל</span>
            <span style={{ fontSize: 13, color: budgetUsed > 100 ? '#FC8585' : '#FFB366', fontWeight: 600 }}>{formatCurrency(project.actual_cost)}</span>
          </div>
          <ProgressBar value={budgetUsed} color={budgetUsed > 100 ? '#FC8585' : '#FFA500'} />
          <div style={{ fontSize: 10, color: '#5C7080', marginTop: 4, textAlign: 'left' }}>{budgetUsed}% ניצול</div>
        </div>

        {/* 4. Procurement */}
        <div style={card({ borderTop: '2px solid #9D4EDD' })}>
          <div style={labelStyle}>רכש והוצאות</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 11, color: '#ABB3BF' }}>חשבוניות</span>
            <span style={{ fontSize: 13, color: '#F6F7F9', fontWeight: 600 }}>{formatCurrency(project.billed_amount)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, color: '#ABB3BF' }}>נגבה</span>
            <span style={{ fontSize: 13, color: '#3DCC91', fontWeight: 600 }}>{formatCurrency(project.collected_amount)}</span>
          </div>
        </div>

        {/* 5. Alerts */}
        <div style={card({ borderTop: `2px solid ${openAlertCount > 0 ? '#FC8585' : '#5C7080'}` })}>
          <div style={labelStyle}>התראות</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: openAlertCount > 0 ? '#FC8585' : '#3DCC91', lineHeight: 1 }}>
            {openAlertCount}
          </div>
          <div style={{ fontSize: 11, color: '#5C7080', marginTop: 4 }}>{openAlertCount > 0 ? 'התראות פתוחות' : 'הכל תקין'}</div>
        </div>

        {/* 6. AI Risk */}
        <div style={card({ borderTop: '2px solid #FFB366' })}>
          <div style={labelStyle}>AI RISK SCORE</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: budgetUsed > 90 ? '#FC8585' : budgetUsed > 70 ? '#FFB366' : '#3DCC91', lineHeight: 1 }}>
            {budgetUsed > 90 ? 'HIGH' : budgetUsed > 70 ? 'MEDIUM' : 'LOW'}
          </div>
          <div style={{ fontSize: 10, color: '#5C7080', marginTop: 4 }}>
            {budgetUsed > 90 ? 'חריגת תקציב וסיכון עיכוב' : budgetUsed > 70 ? 'מעקב נדרש' : 'מצב תקין'}
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
              <SidePanelLink label="הזמנות עבודה" count={workOrders.length} color="#48AFF0" onClick={() => setActiveTab('work_orders')} />
              <SidePanelLink label="חשבוניות" count={invoices.length} color="#3DCC91" onClick={() => setActiveTab('invoices')} />
              <SidePanelLink label="בקשות חומרים" count={materials.length} color="#9D4EDD" onClick={() => setActiveTab('materials')} />
              <SidePanelLink label="עובדים משובצים" count={employees.length} color="#FFB366" onClick={() => setActiveTab('employees')} />
            </div>
          </div>

          {/* Open Alerts */}
          <div style={card()}>
            <div style={labelStyle}>התראות פתוחות</div>
            {alerts.filter(a => !a.is_resolved).length === 0
              ? <div style={{ fontSize: 11, color: '#3DCC91', marginTop: 6 }}>אין התראות פתוחות</div>
              : alerts.filter(a => !a.is_resolved).slice(0, 5).map(a => (
                <div key={a.id} style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: a.severity === 'critical' ? '#FC8585' : '#FFB366', flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: '#ABB3BF' }}>{a.message}</span>
                </div>
              ))
            }
          </div>

          {/* AI Watchlist */}
          <div style={card()}>
            <div style={labelStyle}>AI WATCHLIST</div>
            <div style={{ fontSize: 11, color: '#ABB3BF', marginTop: 6 }}>
              {budgetUsed > 80 && <div style={{ color: '#FC8585', marginBottom: 4 }}>* חריגת תקציב צפויה</div>}
              {project.progress_percent < 30 && project.state === 'in_production' && <div style={{ color: '#FFB366', marginBottom: 4 }}>* התקדמות איטית לשלב הייצור</div>}
              {materials.filter(m => m.status === 'pending').length > 0 && <div style={{ color: '#FFB366', marginBottom: 4 }}>* חומרים ממתינים לאישור</div>}
              {budgetUsed <= 80 && project.progress_percent >= 30 && materials.filter(m => m.status === 'pending').length === 0 && (
                <div style={{ color: '#3DCC91' }}>הכל תקין - אין בעיות צפויות</div>
              )}
            </div>
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
              <div style={{ fontSize: 13, color: '#F6F7F9', lineHeight: 1.6 }}>{project!.internal_notes || 'אין תיאור'}</div>
              <div style={{ marginTop: 16 }}>
                <div style={labelStyle}>תאריכים</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div><span style={{ fontSize: 10, color: '#5C7080' }}>תחילה מתוכננת: </span><span style={{ fontSize: 12, color: '#ABB3BF' }}>{formatDate(project!.planned_start_date || '')}</span></div>
                  <div><span style={{ fontSize: 10, color: '#5C7080' }}>סיום מתוכנן: </span><span style={{ fontSize: 12, color: '#ABB3BF' }}>{formatDate(project!.planned_end_date || '')}</span></div>
                  <div><span style={{ fontSize: 10, color: '#5C7080' }}>תחילה בפועל: </span><span style={{ fontSize: 12, color: '#ABB3BF' }}>{formatDate(project!.actual_start_date || '')}</span></div>
                </div>
              </div>
            </div>
            <div>
              <div style={labelStyle}>סיכום כספי</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  ['תקציב', formatCurrency(project!.budget_amount), '#48AFF0'],
                  ['עלות בפועל', formatCurrency(project!.actual_cost), budgetUsed > 100 ? '#FC8585' : '#FFB366'],
                  ['חשבוניות', formatCurrency(project!.billed_amount), '#3DCC91'],
                  ['נגבה', formatCurrency(project!.collected_amount), '#3DCC91'],
                  ['יתרה לגביה', formatCurrency(project!.billed_amount - project!.collected_amount), '#FFB366'],
                ].map(([k, v, c]) => (
                  <div key={k as string} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <span style={{ fontSize: 12, color: '#ABB3BF' }}>{k}</span>
                    <span style={{ fontSize: 13, color: c as string, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );

      /* ── Timeline ── */
      case 'timeline':
        return (
          <div>
            <div style={labelStyle}>ציר זמן פרויקט</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0, marginTop: 12, position: 'relative', paddingRight: 20 }}>
              <div style={{ position: 'absolute', right: 6, top: 0, bottom: 0, width: 2, background: '#383E47' }} />
              {[
                { label: 'נוצר', date: project!.created_at, active: true },
                { label: 'מאושר', date: project!.state !== 'draft' ? project!.updated_at : undefined, active: project!.state !== 'draft' },
                { label: 'בתכנון', date: project!.state === 'in_planning' ? project!.updated_at : undefined, active: ['in_planning','in_procurement','in_production','in_delivery','completed','closed'].includes(project!.state) },
                { label: 'ברכש', date: undefined, active: ['in_procurement','in_production','in_delivery','completed','closed'].includes(project!.state) },
                { label: 'בייצור', date: project!.actual_start_date, active: ['in_production','in_delivery','completed','closed'].includes(project!.state) },
                { label: 'באספקה', date: undefined, active: ['in_delivery','completed','closed'].includes(project!.state) },
                { label: 'הושלם', date: undefined, active: ['completed','closed'].includes(project!.state) },
                { label: 'סגור', date: undefined, active: project!.state === 'closed' },
              ].map((step, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', position: 'relative' }}>
                  <div style={{ width: 12, height: 12, borderRadius: '50%', background: step.active ? '#FFA500' : '#383E47', border: `2px solid ${step.active ? '#FFA500' : '#5C7080'}`, zIndex: 1, flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 12, color: step.active ? '#F6F7F9' : '#5C7080', fontWeight: step.active ? 600 : 400 }}>{step.label}</div>
                    {step.date && <div style={{ fontSize: 10, color: '#5C7080' }}>{formatDateTime(step.date)}</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );

      /* ── Phases ── */
      case 'phases':
        return phases.length === 0
          ? <EmptyState message="אין שלבים מוגדרים לפרויקט" actionLabel="+ הוסף שלב" onAction={() => executeAction('add_phase')} />
          : (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={labelStyle}>שלבי פרויקט</div>
                <button style={btnGhost({ padding: '4px 10px', fontSize: 11 })} onClick={() => executeAction('add_phase')}>+ שלב</button>
              </div>
              {phases.map(ph => (
                <div key={ph.id} style={{ background: '#383E47', padding: '10px 14px', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, color: '#F6F7F9', fontWeight: 500 }}>{ph.name}</div>
                    <div style={{ fontSize: 10, color: '#5C7080' }}>{formatDate(ph.start_date || '')} - {formatDate(ph.end_date || '')}</div>
                  </div>
                  <div style={{ width: 100 }}><ProgressBar value={ph.progress} /></div>
                  <span style={{ fontSize: 11, color: '#ABB3BF', width: 40, textAlign: 'left' }}>{ph.progress}%</span>
                  <Badge bg={STATE_COLORS[ph.status]?.bg || 'rgba(255,255,255,0.05)'} fg={STATE_COLORS[ph.status]?.fg || '#5C7080'} text={STATE_COLORS[ph.status]?.label || ph.status} />
                </div>
              ))}
            </div>
          );

      /* ── Work Orders ── */
      case 'work_orders':
        return workOrders.length === 0
          ? <EmptyState message="אין הזמנות עבודה לפרויקט" actionLabel="+ צור הזמנת עבודה" onAction={() => executeAction('create_work_order')} />
          : (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={labelStyle}>הזמנות עבודה</div>
                <button style={btnGhost({ padding: '4px 10px', fontSize: 11 })} onClick={() => executeAction('create_work_order')}>+ הזמנה</button>
              </div>
              <SortableTable columns={[
                { key: 'wo_number', label: 'מספר', width: 90, render: r => <span style={{ color: '#48AFF0', fontFamily: 'monospace', fontSize: 11 }}>{r.wo_number}</span> },
                { key: 'title', label: 'כותרת' },
                { key: 'assigned_to', label: 'אחראי', width: 110 },
                { key: 'priority', label: 'עדיפות', width: 80, render: r => { const p = PRIORITY_COLORS[r.priority || 'normal']; return <Badge bg={p.bg} fg={p.fg} text={p.label} />; } },
                { key: 'progress', label: 'התקדמות', width: 120, render: r => <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div style={{ width: 60 }}><ProgressBar value={r.progress} height={4} /></div><span style={{ fontSize: 10, color: '#5C7080' }}>{r.progress}%</span></div> },
                { key: 'status', label: 'סטטוס', width: 90, render: r => <Badge bg="rgba(255,255,255,0.05)" fg={r.status === 'done' ? '#3DCC91' : '#48AFF0'} text={r.status} /> },
                { key: 'due_date', label: 'יעד', width: 90, render: r => <span style={{ fontSize: 11 }}>{formatDate(r.due_date || '')}</span> },
              ] as Column<WorkOrder>[]} data={workOrders} />
            </div>
          );

      /* ── Procurement / POs ── */
      case 'procurement':
        return pos.length === 0
          ? <EmptyState message="אין הזמנות רכש לפרויקט" actionLabel="+ צור הזמנת רכש" onAction={() => executeAction('create_po')} />
          : (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={labelStyle}>הזמנות רכש</div>
                <button style={btnGhost({ padding: '4px 10px', fontSize: 11 })} onClick={() => executeAction('create_po')}>+ הזמנת רכש</button>
              </div>
              <SortableTable columns={[
                { key: 'po_number', label: 'מספר PO', width: 100, render: r => <span style={{ color: '#9D4EDD', fontFamily: 'monospace', fontSize: 11 }}>{r.po_number}</span> },
                { key: 'supplier_name', label: 'ספק' },
                { key: 'total', label: 'סכום', width: 100, render: r => <span style={{ color: '#3DCC91' }}>{formatCurrency(r.total)}</span> },
                { key: 'status', label: 'סטטוס', width: 90, render: r => <Badge bg="rgba(255,255,255,0.05)" fg="#ABB3BF" text={r.status} /> },
                { key: 'created_at', label: 'תאריך', width: 90, render: r => <span style={{ fontSize: 11 }}>{formatDate(r.created_at || '')}</span> },
              ] as Column<PO>[]} data={pos} />
            </div>
          );

      /* ── Materials ── */
      case 'materials':
        return materials.length === 0
          ? <EmptyState message="אין בקשות חומרים לפרויקט" actionLabel="+ בקשת חומרים" onAction={() => executeAction('allocate_materials')} />
          : (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={labelStyle}>בקשות חומרים</div>
                <button style={btnGhost({ padding: '4px 10px', fontSize: 11 })} onClick={() => executeAction('allocate_materials')}>+ בקשה</button>
              </div>
              <SortableTable columns={[
                { key: 'material_name', label: 'חומר' },
                { key: 'quantity', label: 'כמות', width: 80 },
                { key: 'status', label: 'סטטוס', width: 100, render: r => <Badge bg={r.status === 'fulfilled' ? 'rgba(61,204,145,0.15)' : 'rgba(255,179,102,0.15)'} fg={r.status === 'fulfilled' ? '#3DCC91' : '#FFB366'} text={r.status} /> },
                { key: 'rfq_id', label: 'RFQ', width: 80, render: r => r.rfq_id ? <span style={{ color: '#48AFF0' }}>#{r.rfq_id}</span> : <span style={{ color: '#5C7080' }}>-</span> },
                { key: 'created_at', label: 'תאריך', width: 90, render: r => <span style={{ fontSize: 11 }}>{formatDate(r.created_at || '')}</span> },
              ] as Column<MaterialReq>[]} data={materials} />
            </div>
          );

      /* ── Inventory ── */
      case 'inventory':
        return inventory.length === 0
          ? <EmptyState message="אין פריטי מלאי שמורים לפרויקט" />
          : (
            <div>
              <div style={labelStyle}>מלאי שמור</div>
              <SortableTable columns={[
                { key: 'material_name', label: 'חומר' },
                { key: 'reserved', label: 'שמור', width: 80 },
                { key: 'available', label: 'זמין', width: 80, render: r => <span style={{ color: r.available > 0 ? '#3DCC91' : '#FC8585' }}>{r.available}</span> },
                { key: 'location', label: 'מיקום', width: 120 },
              ] as Column<InventoryItem>[]} data={inventory} />
            </div>
          );

      /* ── Employees ── */
      case 'employees':
        return employees.length === 0
          ? <EmptyState message="אין עובדים משובצים לפרויקט" actionLabel="+ שבץ עובדים" onAction={() => executeAction('assign_employees')} />
          : (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={labelStyle}>עובדים משובצים</div>
                <button style={btnGhost({ padding: '4px 10px', fontSize: 11 })} onClick={() => executeAction('assign_employees')}>+ שבץ</button>
              </div>
              <SortableTable columns={[
                { key: 'name', label: 'שם', render: r => <span style={{ color: '#F6F7F9', fontWeight: 500 }}>{r.name}</span> },
                { key: 'role', label: 'תפקיד', width: 120 },
                { key: 'hours_logged', label: 'שעות', width: 80, render: r => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{r.hours_logged || 0}</span> },
                { key: 'assigned_date', label: 'שובץ', width: 90, render: r => <span style={{ fontSize: 11 }}>{formatDate(r.assigned_date || '')}</span> },
              ] as Column<Employee>[]} data={employees} />
            </div>
          );

      /* ── Tasks ── */
      case 'tasks':
        return tasks.length === 0
          ? <EmptyState message="אין משימות לפרויקט" actionLabel="+ משימה חדשה" onAction={() => executeAction('add_task')} />
          : (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={labelStyle}>משימות</div>
                <button style={btnGhost({ padding: '4px 10px', fontSize: 11 })} onClick={() => executeAction('add_task')}>+ משימה</button>
              </div>
              <SortableTable columns={[
                { key: 'title', label: 'כותרת', render: r => <span style={{ color: '#F6F7F9' }}>{r.title}</span> },
                { key: 'assignee', label: 'אחראי', width: 110 },
                { key: 'priority', label: 'עדיפות', width: 80, render: r => { const p = PRIORITY_COLORS[r.priority || 'normal']; return <Badge bg={p.bg} fg={p.fg} text={p.label} />; } },
                { key: 'status', label: 'סטטוס', width: 90, render: r => <Badge bg="rgba(255,255,255,0.05)" fg={r.status === 'done' ? '#3DCC91' : '#ABB3BF'} text={r.status} /> },
                { key: 'due_date', label: 'יעד', width: 90, render: r => <span style={{ fontSize: 11 }}>{formatDate(r.due_date || '')}</span> },
              ] as Column<Task>[]} data={tasks} />
            </div>
          );

      /* ── Expenses ── */
      case 'expenses':
        return expenses.length === 0
          ? <EmptyState message="אין הוצאות רשומות לפרויקט" actionLabel="+ הוסף הוצאה" onAction={() => executeAction('add_expense')} />
          : (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={labelStyle}>הוצאות</div>
                <button style={btnGhost({ padding: '4px 10px', fontSize: 11 })} onClick={() => executeAction('add_expense')}>+ הוצאה</button>
              </div>
              <SortableTable columns={[
                { key: 'description', label: 'תיאור', render: r => <span style={{ color: '#F6F7F9' }}>{r.description}</span> },
                { key: 'category', label: 'קטגוריה', width: 100 },
                { key: 'amount', label: 'סכום', width: 100, render: r => <span style={{ color: '#FC8585' }}>{formatCurrency(r.amount)}</span> },
                { key: 'approved', label: 'מאושר', width: 70, render: r => <span style={{ color: r.approved ? '#3DCC91' : '#FFB366' }}>{r.approved ? 'V' : 'X'}</span> },
                { key: 'date', label: 'תאריך', width: 90, render: r => <span style={{ fontSize: 11 }}>{formatDate(r.date || '')}</span> },
              ] as Column<Expense>[]} data={expenses} />
            </div>
          );

      /* ── Logistics ── */
      case 'logistics':
        return logistics.length === 0
          ? <EmptyState message="אין הובלות רשומות לפרויקט" actionLabel="+ פתח לוגיסטיקה" onAction={() => executeAction('open_logistics')} />
          : (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={labelStyle}>לוגיסטיקה</div>
                <button style={btnGhost({ padding: '4px 10px', fontSize: 11 })} onClick={() => executeAction('open_logistics')}>+ הובלה</button>
              </div>
              <SortableTable columns={[
                { key: 'description', label: 'תיאור', render: r => <span style={{ color: '#F6F7F9' }}>{r.description}</span> },
                { key: 'status', label: 'סטטוס', width: 100, render: r => <Badge bg="rgba(255,255,255,0.05)" fg="#ABB3BF" text={r.status} /> },
                { key: 'pickup_date', label: 'איסוף', width: 90, render: r => <span style={{ fontSize: 11 }}>{formatDate(r.pickup_date || '')}</span> },
                { key: 'delivery_date', label: 'אספקה', width: 90, render: r => <span style={{ fontSize: 11 }}>{formatDate(r.delivery_date || '')}</span> },
              ] as Column<LogisticsOrder>[]} data={logistics} />
            </div>
          );

      /* ── Invoices ── */
      case 'invoices':
        return invoices.length === 0
          ? <EmptyState message="אין חשבוניות לפרויקט" actionLabel="+ צור חשבונית" onAction={() => executeAction('create_invoice')} />
          : (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={labelStyle}>חשבוניות</div>
                <button style={btnGhost({ padding: '4px 10px', fontSize: 11 })} onClick={() => executeAction('create_invoice')}>+ חשבונית</button>
              </div>
              <SortableTable columns={[
                { key: 'invoice_number', label: 'מספר', width: 100, render: r => <span style={{ color: '#3DCC91', fontFamily: 'monospace', fontSize: 11 }}>{r.invoice_number}</span> },
                { key: 'customer_name', label: 'לקוח' },
                { key: 'gross_amount', label: 'סכום', width: 100, render: r => <span style={{ color: '#F6F7F9', fontWeight: 600 }}>{formatCurrency(r.gross_amount)}</span> },
                { key: 'amount_paid', label: 'שולם', width: 100, render: r => <span style={{ color: '#3DCC91' }}>{formatCurrency(r.amount_paid)}</span> },
                { key: 'status', label: 'סטטוס', width: 90, render: r => <Badge bg={r.status === 'paid' ? 'rgba(61,204,145,0.15)' : r.status === 'overdue' ? 'rgba(252,133,133,0.15)' : 'rgba(255,255,255,0.05)'} fg={r.status === 'paid' ? '#3DCC91' : r.status === 'overdue' ? '#FC8585' : '#ABB3BF'} text={r.status} /> },
                { key: 'due_date', label: 'יעד', width: 90, render: r => <span style={{ fontSize: 11 }}>{formatDate(r.due_date || '')}</span> },
              ] as Column<Invoice>[]} data={invoices} />
            </div>
          );

      /* ── Payments ── */
      case 'payments':
        return payments.length === 0
          ? <EmptyState message="אין תשלומים רשומים לפרויקט" />
          : (
            <div>
              <div style={labelStyle}>תשלומים</div>
              <SortableTable columns={[
                { key: 'reference', label: 'אסמכתא', width: 120, render: r => <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#48AFF0' }}>{r.reference}</span> },
                { key: 'amount', label: 'סכום', width: 100, render: r => <span style={{ color: '#3DCC91', fontWeight: 600 }}>{formatCurrency(r.amount)}</span> },
                { key: 'method', label: 'אמצעי', width: 100 },
                { key: 'date', label: 'תאריך', width: 100, render: r => <span style={{ fontSize: 11 }}>{formatDate(r.date || '')}</span> },
              ] as Column<Payment>[]} data={payments} />
            </div>
          );

      /* ── Reports ── */
      case 'reports':
        return reports.length === 0
          ? <EmptyState message="אין דוחות לפרויקט" actionLabel="+ צור דוח" onAction={() => executeAction('view_financials')} />
          : (
            <div>
              <div style={labelStyle}>דוחות</div>
              <SortableTable columns={[
                { key: 'title', label: 'כותרת', render: r => <span style={{ color: '#F6F7F9' }}>{r.title}</span> },
                { key: 'type', label: 'סוג', width: 100 },
                { key: 'created_at', label: 'תאריך', width: 100, render: r => <span style={{ fontSize: 11 }}>{formatDate(r.created_at || '')}</span> },
              ] as Column<Report>[]} data={reports} />
            </div>
          );

      /* ── Alerts ── */
      case 'alerts':
        return alerts.length === 0
          ? <EmptyState message="אין התראות לפרויקט - הכל תקין" />
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
          ? <EmptyState message="אין מסמכים מצורפים לפרויקט" actionLabel="+ העלה מסמך" onAction={() => executeAction('add_document')} />
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
            <div style={labelStyle}>AI INSIGHTS - PROJECT INTELLIGENCE</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
              <div style={{ background: '#383E47', padding: 14 }}>
                <div style={{ fontSize: 11, color: '#FFA500', fontWeight: 600, marginBottom: 8 }}>BUDGET FORECAST</div>
                <div style={{ fontSize: 13, color: '#F6F7F9' }}>
                  {budgetUsed > 100
                    ? `חריגת תקציב של ${budgetUsed - 100}%. יש לבדוק הוצאות חומרים ושעות עבודה.`
                    : budgetUsed > 80
                    ? `ניצול תקציב גבוה (${budgetUsed}%). צפי לסיום בתקציב רק עם בקרה הדוקה.`
                    : `ניצול תקציב תקין (${budgetUsed}%). צפי חיובי לסיום בתקציב.`}
                </div>
              </div>
              <div style={{ background: '#383E47', padding: 14 }}>
                <div style={{ fontSize: 11, color: '#48AFF0', fontWeight: 600, marginBottom: 8 }}>SCHEDULE PREDICTION</div>
                <div style={{ fontSize: 13, color: '#F6F7F9' }}>
                  {project!.progress_percent >= 80 ? 'הפרויקט בקצב טוב לסיום בזמן.'
                    : project!.progress_percent >= 50 ? 'התקדמות סבירה. יש לעקוב אחרי שלבים קריטיים.'
                    : 'התקדמות איטית. יש סיכון גבוה לעיכוב.'}
                </div>
              </div>
              <div style={{ background: '#383E47', padding: 14 }}>
                <div style={{ fontSize: 11, color: '#3DCC91', fontWeight: 600, marginBottom: 8 }}>CASH FLOW IMPACT</div>
                <div style={{ fontSize: 13, color: '#F6F7F9' }}>
                  {project!.collected_amount >= project!.billed_amount * 0.8
                    ? 'גביה תקינה - תזרים מזומנים חיובי.'
                    : `יתרה לגביה: ${formatCurrency(project!.billed_amount - project!.collected_amount)}. יש לדרבן גביה.`}
                </div>
              </div>
              <div style={{ background: '#383E47', padding: 14 }}>
                <div style={{ fontSize: 11, color: '#9D4EDD', fontWeight: 600, marginBottom: 8 }}>RECOMMENDED ACTIONS</div>
                <div style={{ fontSize: 12, color: '#ABB3BF', lineHeight: 1.8 }}>
                  {nextBest && <div>1. {nextBest.label}</div>}
                  {budgetUsed > 80 && <div>2. בדוק חריגות בהוצאות חומרים</div>}
                  {materials.filter(m => m.status === 'pending').length > 0 && <div>3. אשר בקשות חומרים ממתינות</div>}
                  {openAlertCount > 0 && <div>4. טפל ב-{openAlertCount} התראות פתוחות</div>}
                </div>
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
                  <div style={{ textAlign: 'left', flexShrink: 0 }}>
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
