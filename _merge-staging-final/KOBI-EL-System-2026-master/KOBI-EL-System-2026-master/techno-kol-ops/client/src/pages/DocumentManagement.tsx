/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║   DOCUMENT MANAGEMENT SYSTEM — Techno-Kol DMS UI                        ║
 * ║   6 tabs: Browse · Upload · Search · Approvals · Retention · Audit     ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  DMS,
  FolderStore,
  AuditLog,
  seedDMSDemoData,
  wireDMSToDataFlow,
  retentionYearsFor,
  CATEGORY_LABELS,
  CATEGORY_COLORS,
  SECURITY_LABELS,
  SECURITY_COLORS,
  STATUS_LABELS,
  STATUS_COLORS,
  DEFAULT_RETENTION_POLICIES,
  type DocumentRecord,
  type Folder,
  type DocCategory,
  type EntityType,
  type DocStatus,
  type SecurityLevel,
  type AuditEntry,
} from '../engines/dmsEngine';

// ═══════════════════════════════════════════════════════════════════════════
// THEME
// ═══════════════════════════════════════════════════════════════════════════

const C = {
  bg: '#252A31',
  panel: '#2F343C',
  panelAlt: '#383E47',
  border: 'rgba(255,255,255,0.1)',
  borderStrong: 'rgba(255,255,255,0.18)',
  text: '#F6F7F9',
  textMuted: '#ABB3BF',
  textDim: '#5C7080',
  accent: '#FFA500',
  green: '#14CCBB',
  yellow: '#F6B64A',
  red: '#FC8585',
  purple: '#8B7FFF',
  blue: '#48AFF0',
};

const S: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: C.bg,
    color: C.text,
    padding: 20,
    fontFamily: '"Segoe UI", "Heebo", system-ui, sans-serif',
    direction: 'rtl',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
    marginBottom: 16,
    borderBottom: `1px solid ${C.border}`,
  },
  title: { fontSize: 22, fontWeight: 700, color: C.text, letterSpacing: '0.02em' },
  subtitle: { fontSize: 12, color: C.textDim, marginTop: 2 },
  tabs: {
    display: 'flex',
    gap: 4,
    borderBottom: `1px solid ${C.border}`,
    marginBottom: 16,
    overflowX: 'auto',
  },
  tab: {
    padding: '10px 18px',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
    color: C.textMuted,
    borderBottom: '2px solid transparent',
    whiteSpace: 'nowrap',
    transition: 'all 120ms',
  },
  tabActive: {
    color: C.accent,
    borderBottom: `2px solid ${C.accent}`,
  },
  card: {
    background: C.panel,
    border: `1px solid ${C.border}`,
    borderRadius: 10,
    padding: 16,
  },
  kpiGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
    gap: 10,
    marginBottom: 16,
  },
  kpiLabel: {
    fontSize: 10,
    color: C.textDim,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    marginBottom: 6,
  },
  kpiValue: { fontSize: 22, fontWeight: 700 },
  input: {
    background: C.panelAlt,
    border: `1px solid ${C.border}`,
    color: C.text,
    padding: '8px 12px',
    borderRadius: 6,
    fontSize: 13,
    outline: 'none',
    fontFamily: 'inherit',
  },
  button: {
    background: 'rgba(255,165,0,0.15)',
    border: `1px solid ${C.accent}`,
    color: C.accent,
    padding: '8px 16px',
    cursor: 'pointer',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 600,
  },
  buttonGhost: {
    background: 'transparent',
    border: `1px solid ${C.border}`,
    color: C.textMuted,
    padding: '6px 12px',
    cursor: 'pointer',
    borderRadius: 5,
    fontSize: 11,
  },
  badge: {
    display: 'inline-block',
    padding: '2px 9px',
    borderRadius: 10,
    fontSize: 10,
    fontWeight: 700,
  },
  row: { display: 'flex', gap: 10, alignItems: 'center' },
  tableWrap: {
    background: C.panel,
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    overflow: 'hidden',
  },
  table: { width: '100%', borderCollapse: 'collapse' as any },
  th: {
    background: C.panelAlt,
    color: C.textMuted,
    fontSize: 11,
    textAlign: 'right' as const,
    padding: '10px 12px',
    borderBottom: `1px solid ${C.border}`,
    fontWeight: 600,
    letterSpacing: '0.05em',
  },
  td: {
    padding: '10px 12px',
    borderBottom: `1px solid ${C.border}`,
    fontSize: 12,
    color: C.text,
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// TABS
// ═══════════════════════════════════════════════════════════════════════════

type TabKey = 'browse' | 'upload' | 'search' | 'approvals' | 'retention' | 'audit';

const TABS: Array<{ key: TabKey; label: string; icon: string }> = [
  { key: 'browse',    label: 'דפדוף בתיקיות', icon: '📁' },
  { key: 'upload',    label: 'העלאת מסמך',    icon: '📤' },
  { key: 'search',    label: 'חיפוש',         icon: '🔎' },
  { key: 'approvals', label: 'אישורים',       icon: '✍️' },
  { key: 'retention', label: 'שימור מסמכים',  icon: '🗄️' },
  { key: 'audit',     label: 'יומן פעולות',   icon: '📜' },
];

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('he-IL', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

function categoryChip(cat: DocCategory): React.ReactNode {
  return (
    <span
      style={{
        ...S.badge,
        background: `${CATEGORY_COLORS[cat]}22`,
        color: CATEGORY_COLORS[cat],
        border: `1px solid ${CATEGORY_COLORS[cat]}55`,
      }}
    >
      {CATEGORY_LABELS[cat]}
    </span>
  );
}

function securityChip(sec: SecurityLevel): React.ReactNode {
  return (
    <span
      style={{
        ...S.badge,
        background: `${SECURITY_COLORS[sec]}22`,
        color: SECURITY_COLORS[sec],
        border: `1px solid ${SECURITY_COLORS[sec]}55`,
      }}
    >
      {SECURITY_LABELS[sec]}
    </span>
  );
}

function statusChip(st: DocStatus): React.ReactNode {
  return (
    <span
      style={{
        ...S.badge,
        background: `${STATUS_COLORS[st]}22`,
        color: STATUS_COLORS[st],
        border: `1px solid ${STATUS_COLORS[st]}55`,
      }}
    >
      {STATUS_LABELS[st]}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function DocumentManagement() {
  const [tab, setTab] = useState<TabKey>('browse');
  const [tick, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);

  // seed + wire
  useEffect(() => {
    seedDMSDemoData();
    void wireDMSToDataFlow();
    refresh();
  }, []);

  const stats = useMemo(() => DMS.stats(), [tick]);

  return (
    <div style={S.page}>
      <div style={S.header}>
        <div>
          <div style={S.title}>מערכת ניהול מסמכים · DMS</div>
          <div style={S.subtitle}>כל מסמכי החברה במקום אחד · סיווג אוטומטי · גרסאות · אישורים · שימור · ביקורת</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ ...S.badge, background: `${C.green}22`, color: C.green, border: `1px solid ${C.green}55` }}>
            {stats.totalDocuments} מסמכים
          </span>
          <span style={{ ...S.badge, background: `${C.blue}22`, color: C.blue, border: `1px solid ${C.blue}55` }}>
            {stats.totalFolders} תיקיות
          </span>
          <span style={{ ...S.badge, background: `${C.yellow}22`, color: C.yellow, border: `1px solid ${C.yellow}55` }}>
            {formatBytes(stats.totalBytes)}
          </span>
        </div>
      </div>

      {/* KPI strip */}
      <div style={S.kpiGrid}>
        <KpiCard label="סה״כ מסמכים"          value={stats.totalDocuments} color={C.text} />
        <KpiCard label="ממתינים לאישור"       value={stats.byStatus.pending_approval || 0} color={C.yellow} />
        <KpiCard label="מסמכי חוזה"           value={stats.byCategory.contract || 0} color={C.purple} />
        <KpiCard label="חשבוניות"             value={stats.byCategory.invoice || 0} color={C.green} />
        <KpiCard label="תלושי שכר"            value={stats.byCategory.payslip || 0} color={C.red} />
        <KpiCard label="מסווגים 'מוגבל'"      value={stats.bySecurity.restricted || 0} color={C.red} />
      </div>

      {/* Tabs */}
      <div style={S.tabs}>
        {TABS.map((t) => (
          <div
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{ ...S.tab, ...(tab === t.key ? S.tabActive : {}) }}
          >
            {t.icon} {t.label}
          </div>
        ))}
      </div>

      {tab === 'browse'    && <BrowseTab    refresh={refresh} key={`b-${tick}`} />}
      {tab === 'upload'    && <UploadTab    refresh={refresh} />}
      {tab === 'search'    && <SearchTab    refresh={refresh} key={`s-${tick}`} />}
      {tab === 'approvals' && <ApprovalsTab refresh={refresh} key={`a-${tick}`} />}
      {tab === 'retention' && <RetentionTab refresh={refresh} key={`r-${tick}`} />}
      {tab === 'audit'     && <AuditTab     key={`u-${tick}`} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// KPI CARD
// ═══════════════════════════════════════════════════════════════════════════

function KpiCard({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div style={S.card}>
      <div style={S.kpiLabel}>{label}</div>
      <div style={{ ...S.kpiValue, color }}>{value}</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB: BROWSE
// ═══════════════════════════════════════════════════════════════════════════

function BrowseTab({ refresh }: { refresh: () => void }) {
  const [currentId, setCurrentId] = useState<string | null>(null);
  const folders = FolderStore.children(currentId);
  const current = currentId ? FolderStore.get(currentId) : null;
  const breadcrumb = useMemo(() => {
    const list: Folder[] = [];
    let cur = current;
    while (cur) {
      list.unshift(cur);
      cur = cur.parentId ? FolderStore.get(cur.parentId) || null : null;
    }
    return list;
  }, [current, currentId]);

  const docsInFolder = currentId
    ? DMS.all().filter((d) => d.folderId === currentId && d.status !== 'deleted')
    : [];

  return (
    <div>
      {/* Breadcrumb */}
      <div style={{ ...S.row, marginBottom: 12, flexWrap: 'wrap' }}>
        <span
          onClick={() => setCurrentId(null)}
          style={{ cursor: 'pointer', color: currentId === null ? C.accent : C.textMuted, fontSize: 12 }}
        >
          🏠 שורש
        </span>
        {breadcrumb.map((f) => (
          <React.Fragment key={f.id}>
            <span style={{ color: C.textDim }}>›</span>
            <span
              onClick={() => setCurrentId(f.id)}
              style={{ cursor: 'pointer', color: f.id === currentId ? C.accent : C.textMuted, fontSize: 12 }}
            >
              {f.name}
            </span>
          </React.Fragment>
        ))}
      </div>

      {/* Folders */}
      {folders.length > 0 && (
        <>
          <div style={{ fontSize: 11, color: C.textDim, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            תיקיות
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
              gap: 10,
              marginBottom: 18,
            }}
          >
            {folders.map((f) => (
              <div
                key={f.id}
                onClick={() => setCurrentId(f.id)}
                style={{
                  ...S.card,
                  cursor: 'pointer',
                  padding: 14,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <div style={{ fontSize: 20 }}>📁</div>
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {f.name}
                  </div>
                  <div style={{ fontSize: 10, color: C.textDim }}>
                    {FolderStore.children(f.id).length} תיקיות־משנה
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Docs */}
      <div style={{ fontSize: 11, color: C.textDim, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        מסמכים בתיקייה זו ({docsInFolder.length})
      </div>
      {docsInFolder.length === 0 ? (
        <div style={{ ...S.card, textAlign: 'center', color: C.textMuted, padding: 30 }}>
          {currentId ? 'אין מסמכים בתיקייה זו' : 'בחר תיקייה כדי לראות את המסמכים שלה'}
        </div>
      ) : (
        <div style={S.tableWrap}>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>כותרת</th>
                <th style={S.th}>קטגוריה</th>
                <th style={S.th}>סיווג</th>
                <th style={S.th}>סטטוס</th>
                <th style={S.th}>גרסה</th>
                <th style={S.th}>גודל</th>
                <th style={S.th}>עודכן</th>
                <th style={S.th}></th>
              </tr>
            </thead>
            <tbody>
              {docsInFolder.map((d) => (
                <tr key={d.id}>
                  <td style={S.td}>
                    <div style={{ fontWeight: 600 }}>{d.title}</div>
                    <div style={{ fontSize: 10, color: C.textDim }}>{d.fileName}</div>
                  </td>
                  <td style={S.td}>{categoryChip(d.category)}</td>
                  <td style={S.td}>{securityChip(d.security)}</td>
                  <td style={S.td}>{statusChip(d.status)}</td>
                  <td style={S.td}>v{d.currentVersion}</td>
                  <td style={S.td}>
                    {formatBytes(d.versions[d.currentVersion - 1]?.sizeBytes ?? 0)}
                  </td>
                  <td style={S.td}>{formatDate(d.updatedAt)}</td>
                  <td style={S.td}>
                    <button
                      style={S.buttonGhost}
                      onClick={() => {
                        if (d.status === 'archived') {
                          DMS.restore(d.id, 'ui');
                        } else {
                          DMS.archive(d.id, 'ui');
                        }
                        refresh();
                      }}
                    >
                      {d.status === 'archived' ? 'שחזר' : 'העבר לארכיון'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB: UPLOAD
// ═══════════════════════════════════════════════════════════════════════════

function UploadTab({ refresh }: { refresh: () => void }) {
  const [title, setTitle] = useState('');
  const [folderId, setFolderId] = useState<string>('');
  const [file, setFile] = useState<File | null>(null);
  const [entityType, setEntityType] = useState<EntityType | ''>('');
  const [entityName, setEntityName] = useState('');
  const [security, setSecurity] = useState<SecurityLevel | ''>('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const folders = FolderStore.all();

  const handleUpload = async () => {
    if (!file || !title || !folderId) {
      setMsg('חסרים שדות חובה: כותרת, תיקייה וקובץ');
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const doc = await DMS.uploadDocument({
        title,
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        file,
        folderId,
        entityType: entityType || undefined,
        entityName: entityName || undefined,
        createdBy: 'ui',
        security: security || undefined,
      });
      setMsg(`נוסף: ${doc.title} — קטגוריה ${CATEGORY_LABELS[doc.category]}`);
      setTitle('');
      setFile(null);
      setEntityName('');
      refresh();
    } catch (e) {
      console.error(e);
      setMsg('שגיאה בהעלאה');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ ...S.card, maxWidth: 720 }}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>העלאת מסמך חדש</div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="כותרת">
          <input style={S.input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="למשל: הצעת מחיר פרויקט ראשון" />
        </Field>
        <Field label="תיקייה">
          <select style={S.input as any} value={folderId} onChange={(e) => setFolderId(e.target.value)}>
            <option value="">בחר תיקייה…</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.path}
              </option>
            ))}
          </select>
        </Field>
        <Field label="סוג ישות (אופציונלי)">
          <select style={S.input as any} value={entityType} onChange={(e) => setEntityType(e.target.value as any)}>
            <option value="">—</option>
            <option value="project">פרויקט</option>
            <option value="client">לקוח</option>
            <option value="subcontractor">קבלן משנה</option>
            <option value="employee">עובד</option>
            <option value="supplier">ספק</option>
            <option value="asset">נכס</option>
            <option value="company">חברה</option>
            <option value="real_estate">נדלן</option>
          </select>
        </Field>
        <Field label="שם ישות (אופציונלי)">
          <input style={S.input} value={entityName} onChange={(e) => setEntityName(e.target.value)} />
        </Field>
        <Field label="סיווג אבטחה (ברירת מחדל: אוטומטי)">
          <select style={S.input as any} value={security} onChange={(e) => setSecurity(e.target.value as any)}>
            <option value="">אוטומטי (לפי הכללים)</option>
            <option value="public">ציבורי</option>
            <option value="internal">פנימי</option>
            <option value="confidential">סודי</option>
            <option value="restricted">מוגבל</option>
          </select>
        </Field>
        <Field label="קובץ">
          <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} style={{ ...S.input, padding: 6 }} />
        </Field>
      </div>

      <div style={{ marginTop: 16, display: 'flex', gap: 10, alignItems: 'center' }}>
        <button style={S.button} disabled={busy} onClick={handleUpload}>
          {busy ? 'מעלה…' : 'העלה מסמך'}
        </button>
        {msg && <span style={{ fontSize: 12, color: C.green }}>{msg}</span>}
      </div>

      <div style={{ marginTop: 16, padding: 12, background: C.panelAlt, borderRadius: 6, fontSize: 11, color: C.textMuted }}>
        💡 המסמך יסווג אוטומטית לפי הכותרת, שם הקובץ וסוג ה־MIME.
        <br />
        💡 SHA-256 מחושב בדפדפן (Web Crypto) — כפילויות מזוהות אוטומטית.
        <br />
        💡 חוזים, מסמכים משפטיים ובטיחות ידרשו אישור מרובה־שלבים לפני אישור סופי.
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontSize: 10, color: C.textDim, display: 'block', marginBottom: 4, letterSpacing: '0.05em' }}>
        {label}
      </label>
      {children}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB: SEARCH
// ═══════════════════════════════════════════════════════════════════════════

function SearchTab({ refresh }: { refresh: () => void }) {
  const [q, setQ] = useState('');
  const [category, setCategory] = useState<DocCategory | ''>('');
  const [status, setStatus] = useState<DocStatus | ''>('');
  const results = DMS.search(q, {
    category: category || undefined,
    status: status || undefined,
  });

  return (
    <div>
      <div style={{ ...S.card, marginBottom: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 10 }}>
          <input
            style={S.input}
            placeholder="חיפוש חופשי — כותרת, שם קובץ, תיוג, לקוח…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select style={S.input as any} value={category} onChange={(e) => setCategory(e.target.value as any)}>
            <option value="">כל הקטגוריות</option>
            {(Object.keys(CATEGORY_LABELS) as DocCategory[]).map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
          <select style={S.input as any} value={status} onChange={(e) => setStatus(e.target.value as any)}>
            <option value="">כל הסטטוסים</option>
            {(Object.keys(STATUS_LABELS) as DocStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          <button style={S.buttonGhost} onClick={() => { setQ(''); setCategory(''); setStatus(''); refresh(); }}>
            נקה
          </button>
        </div>
      </div>

      <div style={{ fontSize: 11, color: C.textDim, marginBottom: 8 }}>
        נמצאו {results.length} מסמכים
      </div>

      <div style={S.tableWrap}>
        <table style={S.table}>
          <thead>
            <tr>
              <th style={S.th}>כותרת</th>
              <th style={S.th}>קטגוריה</th>
              <th style={S.th}>סיווג</th>
              <th style={S.th}>סטטוס</th>
              <th style={S.th}>ישות</th>
              <th style={S.th}>עודכן</th>
            </tr>
          </thead>
          <tbody>
            {results.map((d) => (
              <tr key={d.id}>
                <td style={S.td}>
                  <div style={{ fontWeight: 600 }}>{d.title}</div>
                  <div style={{ fontSize: 10, color: C.textDim }}>{d.fileName}</div>
                </td>
                <td style={S.td}>{categoryChip(d.category)}</td>
                <td style={S.td}>{securityChip(d.security)}</td>
                <td style={S.td}>{statusChip(d.status)}</td>
                <td style={S.td}>{d.entityName || '—'}</td>
                <td style={S.td}>{formatDate(d.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB: APPROVALS
// ═══════════════════════════════════════════════════════════════════════════

function ApprovalsTab({ refresh }: { refresh: () => void }) {
  const pending = DMS.all().filter((d) => d.status === 'pending_approval');
  return (
    <div>
      <div style={{ fontSize: 11, color: C.textDim, marginBottom: 8 }}>
        {pending.length} מסמכים ממתינים לאישור
      </div>
      {pending.length === 0 ? (
        <div style={{ ...S.card, textAlign: 'center', color: C.textMuted, padding: 30 }}>
          ✅ אין מסמכים ממתינים לאישור
        </div>
      ) : (
        pending.map((d) => {
          const currentStep = d.approvalSteps.find((s) => s.status === 'pending');
          return (
            <div key={d.id} style={{ ...S.card, marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{d.title}</div>
                  <div style={{ fontSize: 11, color: C.textDim, marginTop: 4 }}>{d.fileName}</div>
                  <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {categoryChip(d.category)}
                    {securityChip(d.security)}
                  </div>
                </div>
                {currentStep && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      style={{ ...S.button, background: `${C.green}22`, borderColor: C.green, color: C.green }}
                      onClick={() => {
                        DMS.approveStep(d.id, currentStep.stepNumber, 'ui-approver');
                        refresh();
                      }}
                    >
                      אשר שלב {currentStep.stepNumber}
                    </button>
                    <button
                      style={{ ...S.button, background: `${C.red}22`, borderColor: C.red, color: C.red }}
                      onClick={() => {
                        DMS.rejectStep(d.id, currentStep.stepNumber, 'ui-approver', 'נדחה מהממשק');
                        refresh();
                      }}
                    >
                      דחה
                    </button>
                  </div>
                )}
              </div>
              <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                {d.approvalSteps.map((s) => (
                  <div
                    key={s.stepNumber}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 14,
                      fontSize: 11,
                      fontWeight: 600,
                      background: s.status === 'approved'
                        ? `${C.green}22`
                        : s.status === 'rejected'
                          ? `${C.red}22`
                          : `${C.yellow}22`,
                      color: s.status === 'approved' ? C.green : s.status === 'rejected' ? C.red : C.yellow,
                      border: `1px solid ${s.status === 'approved' ? C.green : s.status === 'rejected' ? C.red : C.yellow}55`,
                    }}
                  >
                    {s.stepNumber}. {s.approverRole} — {s.status === 'approved' ? '✓' : s.status === 'rejected' ? '✗' : '⏳'}
                  </div>
                ))}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB: RETENTION
// ═══════════════════════════════════════════════════════════════════════════

function RetentionTab({ refresh }: { refresh: () => void }) {
  const review = DMS.retentionReview();
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <div style={S.card}>
          <div style={S.kpiLabel}>פגי תוקף</div>
          <div style={{ ...S.kpiValue, color: C.red }}>{review.expired.length}</div>
          <div style={{ fontSize: 11, color: C.textDim, marginTop: 4 }}>מסמכים שעברו את תקופת השימור</div>
        </div>
        <div style={S.card}>
          <div style={S.kpiLabel}>יפוגו תוך 90 יום</div>
          <div style={{ ...S.kpiValue, color: C.yellow }}>{review.expiring.length}</div>
          <div style={{ fontSize: 11, color: C.textDim, marginTop: 4 }}>יש לבדוק לפני העברה לארכיון</div>
        </div>
      </div>

      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>מדיניות שימור מסמכים</div>
      <div style={S.tableWrap}>
        <table style={S.table}>
          <thead>
            <tr>
              <th style={S.th}>קטגוריה</th>
              <th style={S.th}>שנות שימור</th>
              <th style={S.th}>הערה</th>
            </tr>
          </thead>
          <tbody>
            {DEFAULT_RETENTION_POLICIES.map((p) => (
              <tr key={p.category}>
                <td style={S.td}>{categoryChip(p.category)}</td>
                <td style={S.td}><strong>{p.years}</strong> שנים</td>
                <td style={S.td}>{p.note || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {review.expired.length > 0 && (
        <>
          <div style={{ fontSize: 13, fontWeight: 700, marginTop: 20, marginBottom: 8, color: C.red }}>
            ⚠️ מסמכים פגי תוקף
          </div>
          <div style={S.tableWrap}>
            <table style={S.table}>
              <thead>
                <tr>
                  <th style={S.th}>כותרת</th>
                  <th style={S.th}>קטגוריה</th>
                  <th style={S.th}>תוקף עד</th>
                  <th style={S.th}></th>
                </tr>
              </thead>
              <tbody>
                {review.expired.map((d) => (
                  <tr key={d.id}>
                    <td style={S.td}>{d.title}</td>
                    <td style={S.td}>{categoryChip(d.category)}</td>
                    <td style={S.td}>{formatDate(d.retainUntil)}</td>
                    <td style={S.td}>
                      <button
                        style={S.buttonGhost}
                        onClick={() => {
                          DMS.archive(d.id, 'retention');
                          refresh();
                        }}
                      >
                        העבר לארכיון
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB: AUDIT
// ═══════════════════════════════════════════════════════════════════════════

function AuditTab() {
  const entries: AuditEntry[] = AuditLog.entries().slice().reverse().slice(0, 300);
  return (
    <div>
      <div style={{ fontSize: 11, color: C.textDim, marginBottom: 8 }}>
        מציג {entries.length} רשומות אחרונות (מתוך {AuditLog.entries().length})
      </div>
      <div style={S.tableWrap}>
        <table style={S.table}>
          <thead>
            <tr>
              <th style={S.th}>זמן</th>
              <th style={S.th}>פעולה</th>
              <th style={S.th}>מבצע</th>
              <th style={S.th}>מסמך</th>
              <th style={S.th}>פרטים</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id}>
                <td style={S.td}>{formatDate(e.timestamp)}</td>
                <td style={S.td}>
                  <span style={{ ...S.badge, background: `${C.blue}22`, color: C.blue, border: `1px solid ${C.blue}55` }}>
                    {e.action}
                  </span>
                </td>
                <td style={S.td}>{e.actor}</td>
                <td style={S.td}>{e.documentId?.slice(0, 14) || e.folderId?.slice(0, 14) || '—'}</td>
                <td style={S.td}>{e.details || (e.before || e.after ? `${e.before || ''} → ${e.after || ''}` : '—')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default DocumentManagement;
