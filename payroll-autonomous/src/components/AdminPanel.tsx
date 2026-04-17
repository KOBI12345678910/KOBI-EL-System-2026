/**
 * AdminPanel — ניהול משתמשים, הרשאות ולוג מערכת
 */
import React, { useState, useEffect, useCallback } from 'react';

/* ─── Types ────────────────────────────────────────────── */
interface User {
  id: string;
  fullName: string;
  username: string;
  email: string;
  role: string;
  status: 'active' | 'inactive';
  lastLogin: string | null;
}

interface AuditEntry {
  id: string;
  timestamp: string;
  user: string;
  action: 'create' | 'update' | 'delete' | 'login';
  entityType: string;
  entityId: string;
}

/* ─── Constants ────────────────────────────────────────── */
const ROLES = ['admin', 'manager', 'accountant', 'field_worker', 'viewer'] as const;
type Role = typeof ROLES[number];

const PERMISSIONS: Record<Role, Record<string, boolean>> = {
  admin:        { employees: true,  projects: true,  finance: true,  procurement: true,  admin: true  },
  manager:      { employees: true,  projects: true,  finance: true,  procurement: true,  admin: false },
  accountant:   { employees: false, projects: false, finance: true,  procurement: true,  admin: false },
  field_worker: { employees: false, projects: true,  finance: false, procurement: false, admin: false },
  viewer:       { employees: false, projects: true,  finance: false, procurement: false, admin: false },
};

const ROLE_LABELS: Record<Role, string> = {
  admin: 'מנהל מערכת',
  manager: 'מנהל',
  accountant: 'חשב',
  field_worker: 'עובד שטח',
  viewer: 'צופה',
};

const ACTION_COLORS: Record<string, string> = {
  create: '#2ea043',
  update: '#d29922',
  delete: '#f85149',
  login: '#4a9eff',
};

const API_URL =
  (typeof window !== 'undefined' && (window as any).ONYX_API_URL) ||
  import.meta.env?.VITE_API_URL ||
  'http://localhost:3100';

/* ─── Mock data (used when API unavailable) ─────────────── */
const MOCK_USERS: User[] = [
  { id: '1', fullName: 'קובי אלגרבלי', username: 'kobi', email: 'kobi@company.co.il', role: 'admin', status: 'active', lastLogin: new Date().toISOString() },
  { id: '2', fullName: 'עוזי לוי', username: 'uzi', email: 'uzi@company.co.il', role: 'manager', status: 'active', lastLogin: new Date(Date.now() - 3600000).toISOString() },
  { id: '3', fullName: 'רונית כהן', username: 'ronit', email: 'ronit@company.co.il', role: 'accountant', status: 'active', lastLogin: new Date(Date.now() - 86400000).toISOString() },
  { id: '4', fullName: 'דני מזרחי', username: 'dani', email: 'dani@company.co.il', role: 'field_worker', status: 'active', lastLogin: null },
  { id: '5', fullName: 'שרה גולן', username: 'sara', email: 'sara@company.co.il', role: 'viewer', status: 'inactive', lastLogin: new Date(Date.now() - 604800000).toISOString() },
];

const MOCK_AUDIT: AuditEntry[] = [
  { id: '1', timestamp: new Date().toISOString(), user: 'kobi', action: 'login', entityType: 'session', entityId: 'sess-001' },
  { id: '2', timestamp: new Date(Date.now() - 300000).toISOString(), user: 'kobi', action: 'update', entityType: 'employee', entityId: 'emp-42' },
  { id: '3', timestamp: new Date(Date.now() - 600000).toISOString(), user: 'uzi', action: 'create', entityType: 'project', entityId: 'proj-7' },
  { id: '4', timestamp: new Date(Date.now() - 900000).toISOString(), user: 'ronit', action: 'login', entityType: 'session', entityId: 'sess-002' },
  { id: '5', timestamp: new Date(Date.now() - 1200000).toISOString(), user: 'kobi', action: 'delete', entityType: 'supplier', entityId: 'sup-3' },
  { id: '6', timestamp: new Date(Date.now() - 1800000).toISOString(), user: 'uzi', action: 'update', entityType: 'finance', entityId: 'fin-12' },
  { id: '7', timestamp: new Date(Date.now() - 3600000).toISOString(), user: 'dani', action: 'login', entityType: 'session', entityId: 'sess-003' },
  { id: '8', timestamp: new Date(Date.now() - 7200000).toISOString(), user: 'ronit', action: 'create', entityType: 'invoice', entityId: 'inv-99' },
];

/* ─── Helpers ────────────────────────────────────────────── */
async function apiFetch(path: string, opts?: RequestInit) {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_URL}${path}`, { ...opts, headers: { ...headers, ...(opts?.headers as any) } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/* ─── Styles ─────────────────────────────────────────────── */
const s = {
  wrap: { padding: '24px', minHeight: '100%' } as React.CSSProperties,
  title: { fontSize: 22, fontWeight: 700, marginBottom: 20, color: '#e6edf3' } as React.CSSProperties,
  tabs: { display: 'flex', gap: 4, marginBottom: 24, borderBottom: '1px solid #2a3340' } as React.CSSProperties,
  tab: (active: boolean): React.CSSProperties => ({
    padding: '10px 20px', cursor: 'pointer', border: 'none', background: 'transparent',
    color: active ? '#4a9eff' : '#8b96a5',
    borderBottom: active ? '2px solid #4a9eff' : '2px solid transparent',
    fontWeight: active ? 600 : 400, fontSize: 14, margin: 0,
  }),
  btn: { background: '#4a9eff', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 4, cursor: 'pointer', fontSize: 13, fontWeight: 600 } as React.CSSProperties,
  btnDanger: { background: '#3a1818', color: '#f85149', border: '1px solid #f85149', padding: '5px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 12 } as React.CSSProperties,
  btnEdit: { background: '#1a2028', color: '#4a9eff', border: '1px solid #2a3340', padding: '5px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 12 } as React.CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse' as const },
  th: { padding: '10px 12px', textAlign: 'right' as const, borderBottom: '1px solid #2a3340', color: '#8b96a5', fontSize: 11, textTransform: 'uppercase' as const, letterSpacing: '0.05em' },
  td: { padding: '10px 12px', textAlign: 'right' as const, borderBottom: '1px solid #2a3340', fontSize: 13, color: '#e6edf3' },
  badge: (active: boolean): React.CSSProperties => ({
    display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600,
    background: active ? '#1f3321' : '#2a1a1a',
    color: active ? '#3fb950' : '#f85149',
  }),
  modal: { position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modalBox: { background: '#13171c', border: '1px solid #2a3340', borderRadius: 8, padding: 32, width: 460, maxWidth: '95vw' },
  field: { marginBottom: 14 },
  label: { display: 'block', marginBottom: 4, fontSize: 12, color: '#8b96a5' } as React.CSSProperties,
  input: { background: '#1a2028', color: '#e6edf3', border: '1px solid #2a3340', padding: '8px 10px', borderRadius: 4, fontSize: 13, fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' as const },
  select: { background: '#1a2028', color: '#e6edf3', border: '1px solid #2a3340', padding: '8px 10px', borderRadius: 4, fontSize: 13, fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' as const },
  matrixTh: { padding: '8px 14px', textAlign: 'center' as const, color: '#8b96a5', fontSize: 11, textTransform: 'uppercase' as const, letterSpacing: '0.05em', borderBottom: '1px solid #2a3340' },
  matrixTd: { padding: '10px 14px', textAlign: 'center' as const, borderBottom: '1px solid #2a3340', fontSize: 14 },
  matrixTdRole: { padding: '10px 14px', textAlign: 'right' as const, borderBottom: '1px solid #2a3340', fontSize: 13, fontWeight: 600, color: '#e6edf3' },
  logEntry: (action: string): React.CSSProperties => ({
    padding: '10px 14px', borderBottom: '1px solid #2a3340', display: 'flex', gap: 12, alignItems: 'center', fontSize: 13,
    borderRight: `3px solid ${ACTION_COLORS[action] || '#8b96a5'}`,
  }),
  logTs: { color: '#8b96a5', fontSize: 11, whiteSpace: 'nowrap' as const, minWidth: 110 },
  logAction: (action: string): React.CSSProperties => ({
    color: ACTION_COLORS[action] || '#8b96a5', fontWeight: 700, minWidth: 60, fontSize: 12, textTransform: 'uppercase' as const,
  }),
  panel: { background: '#13171c', border: '1px solid #2a3340', borderRadius: 6, padding: 0, overflow: 'hidden' } as React.CSSProperties,
  panelHeader: { padding: '14px 20px', borderBottom: '1px solid #2a3340', display: 'flex', justifyContent: 'space-between', alignItems: 'center' } as React.CSSProperties,
  panelTitle: { fontSize: 14, fontWeight: 600, color: '#e6edf3' } as React.CSSProperties,
  error: { color: '#f85149', fontSize: 12, marginBottom: 8 } as React.CSSProperties,
};

/* ─── AddUserModal ─────────────────────────────────────── */
interface ModalProps {
  onClose: () => void;
  onSave: (user: Partial<User> & { tempPassword?: string }) => Promise<void>;
  initial?: User | null;
}

function UserModal({ onClose, onSave, initial }: ModalProps) {
  const [form, setForm] = useState({
    fullName: initial?.fullName || '',
    username: initial?.username || '',
    email: initial?.email || '',
    role: initial?.role || 'viewer',
    tempPassword: '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.fullName || !form.username || !form.email) { setErr('יש למלא שם מלא, שם משתמש ואימייל'); return; }
    setSaving(true);
    try {
      await onSave(form);
      onClose();
    } catch (ex: any) {
      setErr(ex.message || 'שגיאה בשמירה');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={s.modal} onClick={onClose}>
      <div style={s.modalBox} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 20, color: '#e6edf3' }}>
          {initial ? 'עריכת משתמש' : 'הוסף משתמש חדש'}
        </div>
        {err && <div style={s.error}>{err}</div>}
        <form onSubmit={submit}>
          <div style={s.field}>
            <label style={s.label}>שם מלא *</label>
            <input style={s.input} value={form.fullName} onChange={set('fullName')} placeholder="ישראל ישראלי" />
          </div>
          <div style={s.field}>
            <label style={s.label}>שם משתמש *</label>
            <input style={s.input} value={form.username} onChange={set('username')} placeholder="israel" />
          </div>
          <div style={s.field}>
            <label style={s.label}>אימייל *</label>
            <input style={s.input} type="email" value={form.email} onChange={set('email')} placeholder="israel@company.co.il" />
          </div>
          <div style={s.field}>
            <label style={s.label}>תפקיד</label>
            <select style={s.select} value={form.role} onChange={set('role')}>
              {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
          </div>
          {!initial && (
            <div style={s.field}>
              <label style={s.label}>סיסמה זמנית</label>
              <input style={s.input} type="password" value={form.tempPassword} onChange={set('tempPassword')} placeholder="••••••••" />
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
            <button type="button" onClick={onClose} style={{ background: '#1a2028', color: '#8b96a5', border: '1px solid #2a3340', padding: '8px 16px', borderRadius: 4, cursor: 'pointer' }}>
              ביטול
            </button>
            <button type="submit" disabled={saving} style={s.btn}>
              {saving ? 'שומר...' : 'שמור'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── UsersTab ─────────────────────────────────────────── */
function UsersTab() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch('/api/admin/users');
      setUsers(data);
    } catch {
      setUsers(MOCK_USERS);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSave(form: Partial<User> & { tempPassword?: string }) {
    if (editUser) {
      try {
        await apiFetch(`/api/admin/users/${editUser.id}`, { method: 'PUT', body: JSON.stringify(form) });
      } catch {
        setUsers(u => u.map(x => x.id === editUser.id ? { ...x, ...form } : x));
        return;
      }
    } else {
      try {
        await apiFetch('/api/admin/users', { method: 'POST', body: JSON.stringify(form) });
      } catch {
        const newUser: User = {
          id: String(Date.now()), fullName: form.fullName!, username: form.username!, email: form.email!,
          role: form.role || 'viewer', status: 'active', lastLogin: null,
        };
        setUsers(u => [...u, newUser]);
        return;
      }
    }
    await load();
  }

  async function handleDeactivate(id: string) {
    if (!window.confirm('האם לנטרל משתמש זה?')) return;
    try {
      await apiFetch(`/api/admin/users/${id}`, { method: 'DELETE' });
      await load();
    } catch {
      setUsers(u => u.map(x => x.id === id ? { ...x, status: 'inactive' } : x));
    }
  }

  return (
    <div>
      <div style={s.panel}>
        <div style={s.panelHeader}>
          <span style={s.panelTitle}>משתמשי המערכת ({users.length})</span>
          <button style={s.btn} onClick={() => { setEditUser(null); setShowModal(true); }}>
            + הוסף משתמש
          </button>
        </div>
        {loading ? (
          <div style={{ padding: 20, color: '#8b96a5', textAlign: 'center' }}>טוען...</div>
        ) : (
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>שם מלא</th>
                <th style={s.th}>שם משתמש</th>
                <th style={s.th}>תפקיד</th>
                <th style={s.th}>סטטוס</th>
                <th style={s.th}>כניסה אחרונה</th>
                <th style={s.th}>פעולות</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td style={s.td}>{u.fullName}</td>
                  <td style={{ ...s.td, color: '#8b96a5', fontFamily: 'monospace' }}>{u.username}</td>
                  <td style={s.td}>{ROLE_LABELS[u.role as Role] || u.role}</td>
                  <td style={s.td}><span style={s.badge(u.status === 'active')}>{u.status === 'active' ? 'פעיל' : 'מושבת'}</span></td>
                  <td style={{ ...s.td, color: '#8b96a5', fontSize: 12 }}>{fmtDate(u.lastLogin)}</td>
                  <td style={s.td}>
                    <button style={s.btnEdit} onClick={() => { setEditUser(u); setShowModal(true); }}>עריכה</button>
                    {' '}
                    {u.status === 'active' && (
                      <button style={s.btnDanger} onClick={() => handleDeactivate(u.id)}>נטרל</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <UserModal
          onClose={() => { setShowModal(false); setEditUser(null); }}
          onSave={handleSave}
          initial={editUser}
        />
      )}
    </div>
  );
}

/* ─── PermissionsTab ───────────────────────────────────── */
function PermissionsTab() {
  const modules = ['employees', 'projects', 'finance', 'procurement', 'admin'];
  const moduleLabels: Record<string, string> = {
    employees: 'עובדים', projects: 'פרויקטים', finance: 'פיננסים', procurement: 'רכש', admin: 'ניהול מערכת',
  };

  return (
    <div style={s.panel}>
      <div style={s.panelHeader}>
        <span style={s.panelTitle}>מטריצת הרשאות לפי תפקיד</span>
        <span style={{ fontSize: 11, color: '#8b96a5' }}>קריאה בלבד — הרשאות מוגדרות בקוד</span>
      </div>
      <table style={s.table}>
        <thead>
          <tr>
            <th style={{ ...s.matrixTh, textAlign: 'right' }}>תפקיד</th>
            {modules.map(m => <th key={m} style={s.matrixTh}>{moduleLabels[m]}</th>)}
          </tr>
        </thead>
        <tbody>
          {ROLES.map(role => (
            <tr key={role}>
              <td style={s.matrixTdRole}>{ROLE_LABELS[role]}</td>
              {modules.map(m => (
                <td key={m} style={s.matrixTd}>
                  {PERMISSIONS[role][m]
                    ? <span style={{ color: '#3fb950', fontSize: 16 }}>✅</span>
                    : <span style={{ color: '#484f58', fontSize: 16 }}>❌</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── AuditLogTab ──────────────────────────────────────── */
function AuditLogTab() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const data = await apiFetch('/api/admin/audit-log');
        setEntries(data);
      } catch {
        setEntries(MOCK_AUDIT);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const actionLabel: Record<string, string> = { create: 'יצירה', update: 'עדכון', delete: 'מחיקה', login: 'כניסה' };

  return (
    <div style={s.panel}>
      <div style={s.panelHeader}>
        <span style={s.panelTitle}>לוג פעולות מערכת</span>
        <div style={{ display: 'flex', gap: 12, fontSize: 11 }}>
          {Object.entries(ACTION_COLORS).map(([a, c]) => (
            <span key={a} style={{ color: c }}>■ {actionLabel[a] || a}</span>
          ))}
        </div>
      </div>
      {loading ? (
        <div style={{ padding: 20, color: '#8b96a5', textAlign: 'center' }}>טוען...</div>
      ) : entries.length === 0 ? (
        <div style={{ padding: 20, color: '#8b96a5', textAlign: 'center' }}>אין רשומות</div>
      ) : (
        <div>
          {entries.map(e => (
            <div key={e.id} style={s.logEntry(e.action)}>
              <span style={s.logTs}>{fmtDate(e.timestamp)}</span>
              <span style={{ color: '#e6edf3', fontWeight: 600, minWidth: 80 }}>{e.user}</span>
              <span style={s.logAction(e.action)}>{actionLabel[e.action] || e.action}</span>
              <span style={{ color: '#8b96a5' }}>{e.entityType}</span>
              <span style={{ color: '#484f58', fontSize: 11 }}>#{e.entityId}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── AdminPanel (main) ────────────────────────────────── */
export default function AdminPanel() {
  const [activeTab, setActiveTab] = useState<'users' | 'permissions' | 'audit'>('users');

  const tabs = [
    { id: 'users' as const, label: 'משתמשים' },
    { id: 'permissions' as const, label: 'הרשאות' },
    { id: 'audit' as const, label: 'לוג מערכת' },
  ];

  return (
    <div style={s.wrap}>
      <div style={s.title}>⚙️ ניהול מערכת</div>
      <div style={s.tabs}>
        {tabs.map(t => (
          <button key={t.id} style={s.tab(activeTab === t.id)} onClick={() => setActiveTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      {activeTab === 'users' && <UsersTab />}
      {activeTab === 'permissions' && <PermissionsTab />}
      {activeTab === 'audit' && <AuditLogTab />}
    </div>
  );
}
