/**
 * FieldWorkersMap — עובדים בשטח היום
 * Shows active field workers and those who haven't checked in yet.
 */

import React, { useState, useEffect, useCallback } from 'react';

// ── Types ──────────────────────────────────────────────────

type WorkerStatus = 'active' | 'traveling' | 'no-signal';

interface FieldWorker {
  id: number;
  name: string;
  site: string;
  entryTime: string;
  phone: string;
  status: WorkerStatus;
}

interface PendingWorker {
  id: number;
  name: string;
  expectedShift: string;
  phone: string;
}

// ── Mock data ──────────────────────────────────────────────

const FIELD_WORKERS: FieldWorker[] = [
  { id: 1, name: 'יוסי מזרחי', site: 'אתר גבעתיים — בניין A', entryTime: '07:45', phone: '050-1234567', status: 'active' },
  { id: 2, name: 'אבי שמש',    site: 'מחסן ראשון לציון',        entryTime: '08:10', phone: '052-9876543', status: 'active' },
  { id: 3, name: 'רוני ברק',   site: 'בדרך לאתר פתח תקווה',   entryTime: '08:30', phone: '054-1122334', status: 'traveling' },
  { id: 4, name: 'ניר שלום',   site: 'אתר נתניה — מגדל C',    entryTime: '07:00', phone: '058-5566778', status: 'no-signal' },
];

const PENDING_WORKERS: PendingWorker[] = [
  { id: 5, name: 'מיכל גולן',  expectedShift: '08:00', phone: '050-2233445' },
  { id: 6, name: 'דינה פרץ',   expectedShift: '08:00', phone: '052-3344556' },
  { id: 7, name: 'שי לבנה',    expectedShift: '09:00', phone: '054-4455667' },
];

// ── Helpers ────────────────────────────────────────────────

const STATUS_DOT: Record<WorkerStatus, { color: string; label: string }> = {
  'active':    { color: '#3fb950', label: 'פעיל' },
  'traveling': { color: '#d29922', label: 'בנסיעה' },
  'no-signal': { color: '#f85149', label: 'אין אות' },
};

function formatCountdown(nextRefresh: number): string {
  const m = Math.floor(nextRefresh / 60);
  const s = nextRefresh % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ── Component ──────────────────────────────────────────────

export default function FieldWorkersMap() {
  const [countdown, setCountdown] = useState(300); // 5 minutes
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [sending, setSending] = useState<number | null>(null);
  const [sendMsg, setSendMsg] = useState('');

  // Auto-refresh countdown
  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          setLastRefresh(new Date());
          return 300;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleManualRefresh = useCallback(() => {
    setLastRefresh(new Date());
    setCountdown(300);
  }, []);

  const sendReminder = useCallback(async (worker: PendingWorker) => {
    setSending(worker.id);
    setSendMsg('');
    try {
      await fetch('/api/notifications/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: worker.phone, name: worker.name }),
      });
      setSendMsg(`תזכורת נשלחה ל${worker.name} ✓`);
    } catch {
      setSendMsg(`שגיאה בשליחה ל${worker.name}`);
    } finally {
      setSending(null);
      setTimeout(() => setSendMsg(''), 3000);
    }
  }, []);

  const inField = FIELD_WORKERS.length;
  const inFactory = 3; // mock
  const onLeave = 2;   // mock

  return (
    <div style={{ padding: 24, direction: 'rtl', fontFamily: '-apple-system, Heebo, Arial, sans-serif', color: '#e6edf3' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>עובדים בשטח — היום</h2>
        <div style={{ textAlign: 'center' }}>
          <button onClick={handleManualRefresh} style={refreshBtn}>
            🔄 רענן
          </button>
          <div style={{ fontSize: 11, color: '#8b96a5', marginTop: 4 }}>
            עדכון הבא: {formatCountdown(countdown)}<br />
            <span style={{ fontSize: 10 }}>עודכן: {lastRefresh.toLocaleTimeString('he-IL')}</span>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <StatChip icon="🏠" label="עובדים בשטח" value={inField} color="#4caf50" />
        <StatChip icon="🏭" label="במפעל"       value={inFactory} color="#ff9800" />
        <StatChip icon="❌" label="חופש"         value={onLeave}  color="#8b96a5" />
      </div>

      {/* Section 1: Active field workers */}
      <h3 style={{ margin: '0 0 12px', fontSize: 15, color: '#8b96a5', fontWeight: 600, borderBottom: '1px solid #2a3340', paddingBottom: 8 }}>
        בשטח כרגע ({inField})
      </h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12, marginBottom: 28 }}>
        {FIELD_WORKERS.map(w => (
          <WorkerCard key={w.id} worker={w} />
        ))}
      </div>

      {/* Section 2: Not checked in */}
      <h3 style={{ margin: '0 0 12px', fontSize: 15, color: '#8b96a5', fontWeight: 600, borderBottom: '1px solid #2a3340', paddingBottom: 8 }}>
        לא נכנסו עדיין ({PENDING_WORKERS.length})
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {PENDING_WORKERS.map(w => (
          <PendingWorkerRow
            key={w.id}
            worker={w}
            sending={sending === w.id}
            onSendReminder={() => sendReminder(w)}
          />
        ))}
      </div>

      {sendMsg && (
        <div style={{ marginTop: 12, fontSize: 13, color: sendMsg.includes('שגיאה') ? '#f85149' : '#3fb950' }}>
          {sendMsg}
        </div>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────

function StatChip({ icon, label, value, color }: { icon: string; label: string; value: number; color: string }) {
  return (
    <div style={{
      background: '#13171c',
      border: `1px solid ${color}44`,
      borderRadius: 8,
      padding: '10px 18px',
      display: 'flex',
      alignItems: 'center',
      gap: 10,
    }}>
      <span style={{ fontSize: 20 }}>{icon}</span>
      <div>
        <div style={{ fontSize: 18, fontWeight: 700, color }}>{value}</div>
        <div style={{ fontSize: 11, color: '#8b96a5' }}>{label}</div>
      </div>
    </div>
  );
}

function WorkerCard({ worker }: { worker: FieldWorker }) {
  const dot = STATUS_DOT[worker.status];
  return (
    <div style={{
      background: '#13171c',
      border: '1px solid #2a3340',
      borderRadius: 8,
      padding: '14px 16px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontWeight: 700, fontSize: 14 }}>👤 {worker.name}</span>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          background: `${dot.color}22`, color: dot.color,
          borderRadius: 10, padding: '2px 8px', fontSize: 11, fontWeight: 600,
        }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: dot.color, display: 'inline-block' }} />
          {dot.label}
        </span>
      </div>
      <div style={{ fontSize: 12, color: '#8b96a5', lineHeight: 1.8 }}>
        <div>📍 אתר: {worker.site}</div>
        <div>⏰ שעת כניסה: {worker.entryTime}</div>
      </div>
      <a
        href={`tel:${worker.phone}`}
        style={{
          display: 'inline-block', marginTop: 10,
          background: '#1a2028', color: '#4a9eff',
          border: '1px solid #2a3340', borderRadius: 4,
          padding: '5px 12px', fontSize: 12, textDecoration: 'none',
        }}
      >
        📞 {worker.phone}
      </a>
    </div>
  );
}

function PendingWorkerRow({ worker, sending, onSendReminder }: {
  worker: PendingWorker;
  sending: boolean;
  onSendReminder: () => void;
}) {
  return (
    <div style={{
      background: '#13171c',
      border: '1px solid #2a3340',
      borderRadius: 6,
      padding: '10px 14px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 8,
    }}>
      <div>
        <span style={{ fontWeight: 600, fontSize: 13 }}>👤 {worker.name}</span>
        <span style={{ marginRight: 12, fontSize: 12, color: '#8b96a5' }}>
          ⏰ משמרת מתוכננת: {worker.expectedShift}
        </span>
      </div>
      <button
        onClick={onSendReminder}
        disabled={sending}
        style={{
          background: '#25d366',
          color: '#fff',
          border: 'none',
          padding: '6px 14px',
          borderRadius: 4,
          cursor: 'pointer',
          fontSize: 12,
          fontWeight: 600,
          opacity: sending ? 0.6 : 1,
        }}
      >
        💬 שלח תזכורת WhatsApp
      </button>
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────

const refreshBtn: React.CSSProperties = {
  background: '#1a2028',
  color: '#e6edf3',
  border: '1px solid #2a3340',
  padding: '8px 14px',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 13,
};
