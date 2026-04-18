import React, { useState } from 'react';

interface Target {
  id: string;
  label: string;
  actual: number;
  target: number;
  unit: 'money' | 'count' | 'rating';
  isExpense?: boolean;
}

const INITIAL_TARGETS: Target[] = [
  { id: 'revenue', label: 'הכנסות ממכירות', actual: 145000, target: 200000, unit: 'money' },
  { id: 'projects', label: 'מספר פרויקטים חדשים', actual: 3, target: 5, unit: 'count' },
  { id: 'satisfaction', label: 'שביעות רצון לקוחות', actual: 4.2, target: 5, unit: 'rating' },
  { id: 'collection', label: 'גביה', actual: 98000, target: 120000, unit: 'money' },
  { id: 'expenses', label: 'הוצאות (לא לחרוג)', actual: 67000, target: 80000, unit: 'money', isExpense: true },
];

function fmtValue(value: number, unit: Target['unit']): string {
  if (unit === 'money') return '₪' + value.toLocaleString('he-IL');
  if (unit === 'rating') return value.toFixed(1) + '/5';
  return String(value);
}

function getStatus(pct: number, isExpense = false): { label: string; color: string } {
  if (isExpense) {
    if (pct <= 70) return { label: 'בסדר', color: '#22c55e' };
    if (pct <= 90) return { label: 'תשומת לב', color: '#f59e0b' };
    return { label: 'סיכון חריגה', color: '#ef4444' };
  }
  if (pct >= 80) return { label: 'בסדר', color: '#22c55e' };
  if (pct >= 50) return { label: 'סיכון', color: '#f59e0b' };
  return { label: 'חריגה', color: '#ef4444' };
}

function getBarColor(pct: number, isExpense = false): string {
  if (isExpense) {
    if (pct <= 70) return '#22c55e';
    if (pct <= 90) return '#f59e0b';
    return '#ef4444';
  }
  if (pct >= 80) return '#22c55e';
  if (pct >= 50) return '#f59e0b';
  return '#ef4444';
}

function EditModal({ target, onSave, onClose }: {
  target: Target;
  onSave: (id: string, actual: number, targetVal: number) => void;
  onClose: () => void;
}) {
  const [actual, setActual] = useState(target.actual);
  const [targetVal, setTargetVal] = useState(target.target);

  return (
    <div style={{
      position: 'fixed', inset: 0, background: '#000a', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div style={{
        background: '#1e293b', border: '1px solid #334155', borderRadius: 16,
        padding: 28, minWidth: 320, direction: 'rtl',
      }} onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 20px', color: '#f1f5f9' }}>עדכן יעד: {target.label}</h3>
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 6 }}>ביצוע בפועל</label>
          <input
            type="number"
            value={actual}
            onChange={e => setActual(Number(e.target.value))}
            style={{
              background: '#0f172a', border: '1px solid #334155', borderRadius: 8,
              padding: '10px 12px', color: '#f1f5f9', fontSize: 15, width: '100%',
            }}
          />
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 6 }}>יעד</label>
          <input
            type="number"
            value={targetVal}
            onChange={e => setTargetVal(Number(e.target.value))}
            style={{
              background: '#0f172a', border: '1px solid #334155', borderRadius: 8,
              padding: '10px 12px', color: '#f1f5f9', fontSize: 15, width: '100%',
            }}
          />
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={() => { onSave(target.id, actual, targetVal); onClose(); }}
            style={{
              flex: 1, background: '#3b82f6', border: 'none', color: '#fff',
              borderRadius: 8, padding: '10px 0', fontSize: 14, cursor: 'pointer', fontWeight: 600,
            }}
          >שמור</button>
          <button
            onClick={onClose}
            style={{
              flex: 1, background: '#334155', border: 'none', color: '#94a3b8',
              borderRadius: 8, padding: '10px 0', fontSize: 14, cursor: 'pointer',
            }}
          >ביטול</button>
        </div>
      </div>
    </div>
  );
}

export default function MonthlyTargets() {
  const [targets, setTargets] = useState<Target[]>(INITIAL_TARGETS);
  const [editing, setEditing] = useState<Target | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const handleSave = (id: string, actual: number, targetVal: number) => {
    setTargets(prev => prev.map(t => t.id === id ? { ...t, actual, target: targetVal } : t));
  };

  const openEdit = (t: Target) => {
    setEditing(t);
    setEditingId(t.id);
  };

  return (
    <div style={{
      padding: '20px 24px', maxWidth: 860,
      direction: 'rtl', fontFamily: '-apple-system, Segoe UI, Heebo, Arial, sans-serif',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#f1f5f9' }}>
            🎯 יעדים חודשיים — אפריל 2026
          </h1>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 5 }}>
            מעקב ביצוע מול יעד חודשי
          </div>
        </div>
        <button
          onClick={() => targets.length > 0 && openEdit(targets[0])}
          style={{
            background: '#3b82f6', border: 'none', color: '#fff',
            borderRadius: 8, padding: '10px 18px', fontSize: 14, cursor: 'pointer',
            fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          ✏️ עדכן יעדים
        </button>
      </div>

      {/* Target Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {targets.map(t => {
          const pct = Math.round((t.actual / t.target) * 100);
          const barColor = getBarColor(pct, t.isExpense);
          const status = getStatus(pct, t.isExpense);

          return (
            <div key={t.id} style={{
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: 12,
              padding: '18px 22px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 15, fontWeight: 600, color: '#e2e8f0' }}>{t.label}</span>
                  <span style={{
                    fontSize: 11, fontWeight: 700,
                    background: status.color + '22',
                    color: status.color,
                    border: `1px solid ${status.color}`,
                    borderRadius: 6, padding: '2px 8px',
                  }}>{status.label}</span>
                </div>
                <button
                  onClick={() => openEdit(t)}
                  style={{
                    background: 'transparent', border: '1px solid #334155',
                    color: '#64748b', borderRadius: 6, padding: '4px 10px',
                    fontSize: 11, cursor: 'pointer',
                  }}
                >ערוך</button>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 13, color: '#94a3b8' }}>
                  {fmtValue(t.actual, t.unit)} / {fmtValue(t.target, t.unit)}
                </span>
                <span style={{ fontSize: 18, fontWeight: 700, color: barColor }}>{pct}%</span>
              </div>

              <div style={{ background: '#0f172a', borderRadius: 6, height: 10, overflow: 'hidden' }}>
                <div style={{
                  width: `${Math.min(pct, 100)}%`,
                  background: barColor,
                  height: '100%',
                  borderRadius: 6,
                  transition: 'width 0.6s ease',
                  boxShadow: `0 0 8px ${barColor}66`,
                }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary */}
      <div style={{
        marginTop: 24,
        background: '#1e293b',
        border: '1px solid #334155',
        borderRadius: 12,
        padding: '16px 22px',
        display: 'flex',
        justifyContent: 'space-around',
        textAlign: 'center',
      }}>
        {[
          { label: 'בסדר', count: targets.filter(t => getStatus(Math.round((t.actual / t.target) * 100), t.isExpense).label === 'בסדר').length, color: '#22c55e' },
          { label: 'סיכון', count: targets.filter(t => getStatus(Math.round((t.actual / t.target) * 100), t.isExpense).label === 'סיכון').length, color: '#f59e0b' },
          { label: 'חריגה / סיכון חריגה', count: targets.filter(t => ['חריגה', 'סיכון חריגה'].includes(getStatus(Math.round((t.actual / t.target) * 100), t.isExpense).label)).length, color: '#ef4444' },
        ].map((s, i) => (
          <div key={i}>
            <div style={{ fontSize: 28, fontWeight: 800, color: s.color }}>{s.count}</div>
            <div style={{ fontSize: 12, color: '#64748b' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Edit Modal */}
      {editing && (
        <EditModal
          target={editing}
          onSave={handleSave}
          onClose={() => { setEditing(null); setEditingId(null); }}
        />
      )}
    </div>
  );
}
