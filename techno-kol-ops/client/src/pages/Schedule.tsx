/**
 * Schedule — סידור עבודה שבועי (techno-kol-ops)
 * Israeli work week: Sun-Fri (skip Shabbat)
 */

import React, { useState, useCallback } from 'react';

// ── Types ──────────────────────────────────────────────────

type ShiftType = 'morning' | 'regular' | 'night' | 'field' | 'factory' | 'off';

interface Employee {
  id: number;
  name: string;
  role: string;
}

interface ShiftCell {
  type: ShiftType;
}

type ScheduleGrid = Record<number, Record<number, ShiftCell>>;

// ── Constants ──────────────────────────────────────────────

const SHIFT_TYPES: ShiftType[] = ['morning', 'regular', 'night', 'field', 'factory', 'off'];

const SHIFT_META: Record<ShiftType, { emoji: string; label: string; hours: string; color: string; bg: string }> = {
  morning:  { emoji: '🌅', label: 'בוקר',  hours: '06:00-14:00', color: '#1a3a5c', bg: '#bde0fe' },
  regular:  { emoji: '🌞', label: 'רגיל',  hours: '08:00-17:00', color: '#1a2f5c', bg: '#4a9eff' },
  night:    { emoji: '🌙', label: 'לילה',  hours: '22:00-06:00', color: '#e0d0ff', bg: '#3b1d6e' },
  field:    { emoji: '🏠', label: 'שטח',   hours: '',            color: '#1a3a1a', bg: '#4caf50' },
  factory:  { emoji: '🏭', label: 'מפעל',  hours: '',            color: '#3a2a0a', bg: '#ff9800' },
  off:      { emoji: '❌', label: 'חופש',  hours: '',            color: '#5a5a5a', bg: '#3a3a3a' },
};

const DAYS_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי'];
const DAY_OF_WEEK_OFFSETS = [0, 1, 2, 3, 4, 5]; // Sun-Fri

const MOCK_EMPLOYEES: Employee[] = [
  { id: 1, name: 'דוד לוי',    role: 'מנהל ייצור' },
  { id: 2, name: 'רחל כהן',   role: 'מנהלת כספים' },
  { id: 3, name: 'יוסי מזרחי', role: 'עובד שטח' },
  { id: 4, name: 'מיכל גולן',  role: 'עובד מפעל' },
  { id: 5, name: 'אבי שמש',    role: 'נהג' },
];

// ── Helpers ────────────────────────────────────────────────

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function formatDate(date: Date): string {
  return `${date.getDate()}/${date.getMonth() + 1}`;
}

function hebrewMonthRange(sun: Date, fri: Date): string {
  const months = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];
  const m = sun.getMonth() === fri.getMonth()
    ? months[sun.getMonth()]
    : `${months[sun.getMonth()]}-${months[fri.getMonth()]}`;
  return `${sun.getDate()}-${fri.getDate()} ${m} ${sun.getFullYear()}`;
}

function buildInitialGrid(): ScheduleGrid {
  const grid: ScheduleGrid = {};
  MOCK_EMPLOYEES.forEach(emp => {
    grid[emp.id] = {};
    DAY_OF_WEEK_OFFSETS.forEach(offset => {
      grid[emp.id][offset] = { type: offset === 5 ? 'off' : 'regular' };
    });
  });
  return grid;
}

// ── Component ──────────────────────────────────────────────

export function Schedule() {
  const [weekStart, setWeekStart] = useState<Date>(() => getWeekStart(new Date()));
  const [grid, setGrid] = useState<ScheduleGrid>(buildInitialGrid);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  const weekDays = DAY_OF_WEEK_OFFSETS.map(offset => addDays(weekStart, offset));
  const friDate = weekDays[5];

  const prevWeek = () => setWeekStart(d => addDays(d, -7));
  const nextWeek = () => setWeekStart(d => addDays(d, 7));

  const cycleShift = useCallback((empId: number, dayOffset: number) => {
    setGrid(prev => {
      const current = prev[empId]?.[dayOffset]?.type ?? 'regular';
      const idx = SHIFT_TYPES.indexOf(current);
      const next: ShiftType = SHIFT_TYPES[(idx + 1) % SHIFT_TYPES.length];
      return { ...prev, [empId]: { ...prev[empId], [dayOffset]: { type: next } } };
    });
  }, []);

  const countWorking = (dayOffset: number) =>
    MOCK_EMPLOYEES.filter(e => grid[e.id]?.[dayOffset]?.type !== 'off').length;

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch('/api/schedule/week', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weekStart: weekStart.toISOString(), grid }),
      });
      setSaveMsg('הסידור נשמר בהצלחה ✓');
    } catch {
      setSaveMsg('שגיאה בשמירה');
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(''), 3000);
    }
  };

  const handleCopyPrev = () => {
    setGrid(buildInitialGrid());
    setSaveMsg('הועתק מהשבוע הקודם');
    setTimeout(() => setSaveMsg(''), 2000);
  };

  const cellStyle = (type: ShiftType): React.CSSProperties => ({
    background: SHIFT_META[type].bg,
    color: SHIFT_META[type].color,
    borderRadius: 6,
    padding: '6px 4px',
    cursor: 'pointer',
    userSelect: 'none',
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 1.4,
    border: '1px solid rgba(255,255,255,0.15)',
    minWidth: 80,
  });

  return (
    <div style={{ padding: 24, direction: 'rtl', fontFamily: '-apple-system, Heebo, Arial, sans-serif', color: '#e6edf3' }}>
      <h2 style={{ margin: '0 0 20px', fontSize: 22, fontWeight: 700 }}>סידור עבודה שבועי</h2>

      {/* Week navigation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
        <button onClick={prevWeek} style={navBtn}>{'>'} שבוע קודם</button>
        <span style={{ fontWeight: 600, fontSize: 16, minWidth: 220, textAlign: 'center' }}>
          {hebrewMonthRange(weekStart, friDate)}
        </span>
        <button onClick={nextWeek} style={navBtn}>שבוע הבא {'<'}</button>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        {SHIFT_TYPES.map(type => (
          <span key={type} style={{ ...cellStyle(type), padding: '3px 10px', cursor: 'default', fontSize: 11 }}>
            {SHIFT_META[type].emoji} {SHIFT_META[type].label}
            {SHIFT_META[type].hours ? ` (${SHIFT_META[type].hours})` : ''}
          </span>
        ))}
      </div>

      {/* Grid */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'separate', borderSpacing: 4, minWidth: 700 }}>
          <thead>
            <tr>
              <th style={thStyle}>עובד</th>
              {weekDays.map((d, i) => (
                <th key={i} style={thStyle}>
                  {DAYS_HE[i]}<br />
                  <span style={{ fontWeight: 400, fontSize: 11 }}>{formatDate(d)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MOCK_EMPLOYEES.map(emp => (
              <tr key={emp.id}>
                <td style={{ ...tdStyle, whiteSpace: 'nowrap' as const }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{emp.name}</div>
                  <div style={{ fontSize: 11, color: '#5C7080' }}>{emp.role}</div>
                </td>
                {DAY_OF_WEEK_OFFSETS.map(offset => {
                  const type = grid[emp.id]?.[offset]?.type ?? 'regular';
                  const meta = SHIFT_META[type];
                  return (
                    <td key={offset} style={{ padding: 2 }}>
                      <div
                        style={cellStyle(type)}
                        onClick={() => cycleShift(emp.id, offset)}
                        title="לחץ לשינוי משמרת"
                      >
                        <div style={{ fontSize: 16 }}>{meta.emoji}</div>
                        <div style={{ fontSize: 11, fontWeight: 600 }}>{meta.label}</div>
                        {meta.hours && <div style={{ fontSize: 10, opacity: 0.85 }}>{meta.hours}</div>}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr>
              <td style={{ ...tdStyle, fontWeight: 700, fontSize: 12, color: '#5C7080' }}>סה"כ כוח אדם</td>
              {DAY_OF_WEEK_OFFSETS.map(offset => {
                const count = countWorking(offset);
                const warn = count < 3;
                return (
                  <td key={offset} style={{ ...tdStyle, textAlign: 'center' }}>
                    <span style={{ fontWeight: 700, fontSize: 15, color: warn ? '#CD4246' : '#32A467' }}>
                      {warn ? '🔴 ' : ''}{count}
                    </span>
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={handleSave} disabled={saving} style={{ ...actionBtn, background: '#2D72D2', color: '#fff', border: 'none' }}>
          💾 שמור סידור
        </button>
        <button onClick={() => window.print()} style={actionBtn}>🖨️ הדפס</button>
        <button onClick={handleCopyPrev} style={actionBtn}>📋 העתק מהשבוע הקודם</button>
        {saveMsg && <span style={{ fontSize: 13, color: saveMsg.includes('שגיאה') ? '#CD4246' : '#32A467' }}>{saveMsg}</span>}
      </div>
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────

const navBtn: React.CSSProperties = {
  background: '#252A31',
  color: '#F6F7F9',
  border: '1px solid #404854',
  padding: '8px 14px',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 13,
};

const thStyle: React.CSSProperties = {
  background: '#252A31',
  color: '#ABB3BF',
  fontSize: 12,
  fontWeight: 700,
  padding: '8px 10px',
  textAlign: 'center',
  borderRadius: 4,
  whiteSpace: 'nowrap',
};

const tdStyle: React.CSSProperties = {
  padding: '6px 8px',
  background: '#1C2127',
  borderRadius: 4,
};

const actionBtn: React.CSSProperties = {
  background: '#252A31',
  color: '#F6F7F9',
  border: '1px solid #404854',
  padding: '10px 18px',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 14,
};
