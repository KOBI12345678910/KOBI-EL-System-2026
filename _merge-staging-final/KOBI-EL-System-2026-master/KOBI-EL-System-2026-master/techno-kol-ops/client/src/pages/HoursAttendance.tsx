/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║   HoursAttendance.tsx — Techno-Kol Ops                                ║
 * ║   מודול שעות עבודה, חופש, מחלה, חיסורים ויתרות עובדים                ║
 * ║                                                                        ║
 * ║   5 טאבים:                                                            ║
 * ║     1. רישום שעות יומי                                                ║
 * ║     2. בקשות חופש ומחלה                                               ║
 * ║     3. חיסורים לא מוצדקים                                             ║
 * ║     4. יתרות עובדים                                                   ║
 * ║     5. דוחות ושעות חודשיות                                           ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  HoursStore,
  AbsenceStore,
  BalanceStore,
  computeHours,
  workingDaysBetween,
  seedHoursDemoData,
  DEFAULT_ACCRUAL_RULES,
  ABSENCE_LABELS,
  ABSENCE_COLORS,
  STATUS_LABELS,
  STATUS_COLORS,
  type HoursEntry,
  type AbsenceRequest,
  type AbsenceType,
  type AbsenceStatus,
  type EmployeeBalance,
  type ShiftType,
} from '../engines/hoursAttendanceEngine';
import { useStore } from '../store/useStore';

// ═══════════════════════════════════════════════════════════════════════════
// THEME — Palantir-style dark
// ═══════════════════════════════════════════════════════════════════════════

const C = {
  bg: '#252A31',
  panel: '#2F343C',
  panelAlt: '#383E47',
  border: 'rgba(255,255,255,0.1)',
  text: '#F6F7F9',
  textDim: '#ABB3BF',
  textMuted: '#5C7080',
  accent: '#FFA500',
  green: '#14CCBB',
  yellow: '#F6B64A',
  red: '#FC8585',
  purple: '#8B7FFF',
};

const FALLBACK_EMPLOYEES: Array<{ id: string; name: string }> = [
  { id: 'demo-1', name: 'דימה' },
  { id: 'demo-2', name: 'אוזי' },
];

// ═══════════════════════════════════════════════════════════════════════════
// COMMON STYLES
// ═══════════════════════════════════════════════════════════════════════════

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: C.bg,
    color: C.text,
    padding: '24px',
    fontFamily: '"Segoe UI", "Heebo", system-ui, sans-serif',
    direction: 'rtl',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
    paddingBottom: '16px',
    borderBottom: `1px solid ${C.border}`,
  },
  title: {
    fontSize: '24px',
    fontWeight: 700,
    color: C.text,
    margin: 0,
  },
  subtitle: {
    fontSize: '13px',
    color: C.textDim,
    marginTop: '4px',
  },
  tabBar: {
    display: 'flex',
    gap: '4px',
    background: C.panel,
    border: `1px solid ${C.border}`,
    borderRadius: '8px',
    padding: '6px',
    marginBottom: '20px',
    overflowX: 'auto',
  },
  tab: {
    flex: 1,
    minWidth: '160px',
    padding: '12px 16px',
    border: 'none',
    borderRadius: '6px',
    background: 'transparent',
    color: C.textDim,
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    fontFamily: 'inherit',
    whiteSpace: 'nowrap',
  },
  tabActive: {
    background: C.accent,
    color: '#1a1a1a',
    boxShadow: '0 2px 8px rgba(255,165,0,0.3)',
  },
  panel: {
    background: C.panel,
    border: `1px solid ${C.border}`,
    borderRadius: '10px',
    padding: '20px',
    marginBottom: '16px',
  },
  panelTitle: {
    fontSize: '16px',
    fontWeight: 700,
    color: C.text,
    margin: 0,
    marginBottom: '14px',
    paddingBottom: '10px',
    borderBottom: `1px solid ${C.border}`,
  },
  formGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '12px',
    marginBottom: '14px',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  label: {
    fontSize: '12px',
    color: C.textDim,
    fontWeight: 600,
  },
  input: {
    background: C.panelAlt,
    border: `1px solid ${C.border}`,
    borderRadius: '6px',
    padding: '9px 12px',
    color: C.text,
    fontSize: '14px',
    fontFamily: 'inherit',
    direction: 'rtl',
    outline: 'none',
  },
  select: {
    background: C.panelAlt,
    border: `1px solid ${C.border}`,
    borderRadius: '6px',
    padding: '9px 12px',
    color: C.text,
    fontSize: '14px',
    fontFamily: 'inherit',
    direction: 'rtl',
    outline: 'none',
    cursor: 'pointer',
  },
  textarea: {
    background: C.panelAlt,
    border: `1px solid ${C.border}`,
    borderRadius: '6px',
    padding: '9px 12px',
    color: C.text,
    fontSize: '14px',
    fontFamily: 'inherit',
    direction: 'rtl',
    outline: 'none',
    resize: 'vertical',
    minHeight: '60px',
  },
  btn: {
    background: C.accent,
    border: 'none',
    borderRadius: '6px',
    padding: '10px 18px',
    color: '#1a1a1a',
    fontSize: '14px',
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'all 0.15s ease',
  },
  btnSecondary: {
    background: 'transparent',
    border: `1px solid ${C.border}`,
    borderRadius: '6px',
    padding: '8px 14px',
    color: C.textDim,
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  btnGreen: {
    background: C.green,
    border: 'none',
    borderRadius: '6px',
    padding: '6px 12px',
    color: '#1a1a1a',
    fontSize: '12px',
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  btnRed: {
    background: C.red,
    border: 'none',
    borderRadius: '6px',
    padding: '6px 12px',
    color: '#1a1a1a',
    fontSize: '12px',
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  btnSmall: {
    background: 'transparent',
    border: `1px solid ${C.border}`,
    borderRadius: '4px',
    padding: '4px 10px',
    color: C.textDim,
    fontSize: '11px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '13px',
  },
  th: {
    textAlign: 'right',
    padding: '10px 12px',
    color: C.textDim,
    fontWeight: 600,
    borderBottom: `1px solid ${C.border}`,
    background: C.panelAlt,
    fontSize: '12px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  td: {
    padding: '10px 12px',
    color: C.text,
    borderBottom: `1px solid ${C.border}`,
  },
  tableRow: {
    transition: 'background 0.15s ease',
  },
  livePreview: {
    background: C.panelAlt,
    border: `1px dashed ${C.accent}`,
    borderRadius: '6px',
    padding: '12px 16px',
    marginBottom: '14px',
    color: C.text,
    fontSize: '13px',
    fontFamily: 'monospace',
    display: 'flex',
    gap: '20px',
    flexWrap: 'wrap',
  },
  kpiStrip: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '12px',
    marginBottom: '20px',
  },
  kpiCard: {
    background: C.panel,
    border: `1px solid ${C.border}`,
    borderRadius: '10px',
    padding: '16px 18px',
  },
  kpiLabel: {
    fontSize: '12px',
    color: C.textDim,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: '6px',
  },
  kpiValue: {
    fontSize: '26px',
    fontWeight: 700,
    color: C.text,
  },
  empty: {
    textAlign: 'center',
    padding: '40px 20px',
    color: C.textMuted,
    fontSize: '14px',
  },
  badge: {
    display: 'inline-block',
    padding: '3px 9px',
    borderRadius: '11px',
    fontSize: '11px',
    fontWeight: 700,
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

type TabKey = 'hours' | 'absences' | 'unauthorized' | 'balances' | 'reports';

export function HoursAttendance() {
  const snapshot = useStore((s) => s.snapshot) as any;
  const employees = useMemo<Array<{ id: string; name: string }>>(() => {
    const fromSnapshot = snapshot?.employees;
    if (Array.isArray(fromSnapshot) && fromSnapshot.length > 0) {
      return fromSnapshot.map((e: any) => ({
        id: String(e.id ?? e._id ?? ''),
        name: String(e.name ?? e.fullName ?? 'ללא שם'),
      })).filter((e: { id: string; name: string }) => e.id.length > 0);
    }
    return FALLBACK_EMPLOYEES;
  }, [snapshot]);

  const [activeTab, setActiveTab] = useState<TabKey>('hours');
  const [refreshTick, setRefreshTick] = useState(0);
  const refresh = () => setRefreshTick((n) => n + 1);

  // Seed once on mount with the resolved employee list
  useEffect(() => {
    seedHoursDemoData(employees);
    // Also ensure every employee has a balance row
    employees.forEach((e) => BalanceStore.getOrCreate(e.id, e.name));
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tabs: Array<{ key: TabKey; label: string }> = [
    { key: 'hours', label: 'רישום שעות יומי' },
    { key: 'absences', label: 'בקשות חופש ומחלה' },
    { key: 'unauthorized', label: 'חיסורים לא מוצדקים' },
    { key: 'balances', label: 'יתרות עובדים' },
    { key: 'reports', label: 'דוחות ושעות חודשיות' },
  ];

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>שעות, נוכחות ויתרות עובדים</h1>
          <div style={styles.subtitle}>
            מודול ניהול שעות עבודה, חופש, מחלה וחיסורים — בהתאם לחוק העבודה הישראלי
          </div>
        </div>
        <div style={{ fontSize: '13px', color: C.textDim }}>
          {employees.length} עובדים פעילים
        </div>
      </div>

      <div style={styles.tabBar}>
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            style={{
              ...styles.tab,
              ...(activeTab === t.key ? styles.tabActive : {}),
            }}
            onClick={() => setActiveTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'hours' && (
        <DailyHoursTab employees={employees} refreshTick={refreshTick} onRefresh={refresh} />
      )}
      {activeTab === 'absences' && (
        <AbsenceRequestsTab employees={employees} refreshTick={refreshTick} onRefresh={refresh} />
      )}
      {activeTab === 'unauthorized' && (
        <UnauthorizedTab employees={employees} refreshTick={refreshTick} onRefresh={refresh} />
      )}
      {activeTab === 'balances' && (
        <BalancesTab employees={employees} refreshTick={refreshTick} onRefresh={refresh} />
      )}
      {activeTab === 'reports' && (
        <ReportsTab employees={employees} refreshTick={refreshTick} />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER — date utilities
// ═══════════════════════════════════════════════════════════════════════════

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function nDaysAgo(n: number): string {
  return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
}

function startOfMonthStr(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

function endOfMonthStr(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
}

function fmtDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('he-IL');
}

function fmtDateTime(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' });
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB 1 — DAILY HOURS
// ═══════════════════════════════════════════════════════════════════════════

interface TabProps {
  employees: Array<{ id: string; name: string }>;
  refreshTick: number;
  onRefresh: () => void;
}

function DailyHoursTab({ employees, refreshTick, onRefresh }: TabProps) {
  const [employeeId, setEmployeeId] = useState<string>(employees[0]?.id ?? '');
  const [date, setDate] = useState<string>(todayStr());
  const [startTime, setStartTime] = useState<string>('07:30');
  const [endTime, setEndTime] = useState<string>('16:30');
  const [breakMinutes, setBreakMinutes] = useState<number>(30);
  const [shiftKind, setShiftKind] = useState<'regular' | 'overtime'>('regular');
  const [projectName, setProjectName] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [error, setError] = useState<string>('');

  // Live preview
  const preview = useMemo(() => {
    try {
      return computeHours(startTime, endTime, breakMinutes);
    } catch {
      return { total: 0, regular: 0, overtime125: 0, overtime150: 0 };
    }
  }, [startTime, endTime, breakMinutes]);

  // Last 7 days entries
  const recentEntries = useMemo(() => {
    const start = nDaysAgo(7);
    const end = todayStr();
    return HoursStore.getByDateRange(start, end).sort((a, b) =>
      a.date < b.date ? 1 : -1,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTick]);

  const handleSave = () => {
    setError('');
    if (!employeeId) {
      setError('יש לבחור עובד');
      return;
    }
    if (!date) {
      setError('יש לבחור תאריך');
      return;
    }
    if (!startTime || !endTime) {
      setError('יש להזין שעת תחילה וסיום');
      return;
    }
    // start<end check (for non-midnight crossings)
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    const startMin = sh * 60 + sm;
    const endMin = eh * 60 + em;
    if (endMin <= startMin) {
      setError('שעת הסיום חייבת להיות אחרי שעת התחילה');
      return;
    }

    const emp = employees.find((e) => e.id === employeeId);
    if (!emp) {
      setError('עובד לא נמצא');
      return;
    }

    const calc = computeHours(startTime, endTime, breakMinutes);
    let shiftType: ShiftType = 'regular';
    if (shiftKind === 'overtime') {
      shiftType = calc.overtime150 > 0 ? 'overtime_150' : 'overtime_125';
    }

    HoursStore.add({
      employeeId: emp.id,
      employeeName: emp.name,
      date,
      startTime,
      endTime,
      breakMinutes,
      totalHours: calc.total,
      regularHours: calc.regular,
      overtime125: calc.overtime125,
      overtime150: calc.overtime150,
      shiftType,
      projectName: projectName || undefined,
      notes: notes || undefined,
      approved: false,
    });

    // reset minimal state
    setProjectName('');
    setNotes('');
    onRefresh();
  };

  const handleApprove = (id: string) => {
    HoursStore.approve(id, 'manager');
    onRefresh();
  };

  const handleRemove = (id: string) => {
    if (!window.confirm('האם למחוק את הרישום?')) return;
    HoursStore.remove(id);
    onRefresh();
  };

  return (
    <>
      <div style={styles.panel}>
        <h2 style={styles.panelTitle}>הוספת רישום שעות חדש</h2>

        <div style={styles.formGrid}>
          <div style={styles.field}>
            <label style={styles.label}>עובד *</label>
            <select
              style={styles.select}
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
            >
              <option value="">— בחר עובד —</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name}
                </option>
              ))}
            </select>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>תאריך *</label>
            <input
              type="date"
              style={styles.input}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>שעת תחילה *</label>
            <input
              type="time"
              style={styles.input}
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>שעת סיום *</label>
            <input
              type="time"
              style={styles.input}
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>הפסקה (דקות)</label>
            <input
              type="number"
              min={0}
              max={240}
              style={styles.input}
              value={breakMinutes}
              onChange={(e) => setBreakMinutes(Number(e.target.value) || 0)}
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>סוג משמרת</label>
            <select
              style={styles.select}
              value={shiftKind}
              onChange={(e) => setShiftKind(e.target.value as 'regular' | 'overtime')}
            >
              <option value="regular">משמרת רגילה</option>
              <option value="overtime">שעות נוספות</option>
            </select>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>פרויקט (אופציונלי)</label>
            <input
              type="text"
              style={styles.input}
              placeholder="שם פרויקט"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>הערות (אופציונלי)</label>
            <input
              type="text"
              style={styles.input}
              placeholder="הערות נוספות"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <div style={styles.livePreview}>
          <span style={{ color: C.accent, fontWeight: 700 }}>תצוגה מקדימה:</span>
          <span>סה"כ: <b>{preview.total}</b> שעות</span>
          <span style={{ color: C.green }}>תקן: <b>{preview.regular}</b></span>
          <span style={{ color: C.yellow }}>125%: <b>{preview.overtime125}</b></span>
          <span style={{ color: C.accent }}>150%: <b>{preview.overtime150}</b></span>
        </div>

        {error && (
          <div
            style={{
              background: 'rgba(252,133,133,0.1)',
              border: `1px solid ${C.red}`,
              color: C.red,
              padding: '10px 14px',
              borderRadius: '6px',
              marginBottom: '12px',
              fontSize: '13px',
            }}
          >
            {error}
          </div>
        )}

        <button type="button" style={styles.btn} onClick={handleSave}>
          שמור רישום
        </button>
      </div>

      <div style={styles.panel}>
        <h2 style={styles.panelTitle}>
          רישומי שעות — 7 ימים אחרונים ({recentEntries.length})
        </h2>

        {recentEntries.length === 0 ? (
          <div style={styles.empty}>אין רישומים בתקופה הזו</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>תאריך</th>
                  <th style={styles.th}>עובד</th>
                  <th style={styles.th}>שעות</th>
                  <th style={styles.th}>הפסקה</th>
                  <th style={styles.th}>סה"כ</th>
                  <th style={styles.th}>תקן</th>
                  <th style={styles.th}>125%</th>
                  <th style={styles.th}>150%</th>
                  <th style={styles.th}>פרויקט</th>
                  <th style={styles.th}>סטטוס</th>
                  <th style={styles.th}>פעולות</th>
                </tr>
              </thead>
              <tbody>
                {recentEntries.map((entry) => (
                  <tr key={entry.id} style={styles.tableRow}>
                    <td style={styles.td}>{fmtDate(entry.date)}</td>
                    <td style={{ ...styles.td, fontWeight: 600 }}>{entry.employeeName}</td>
                    <td style={styles.td}>
                      {entry.startTime}–{entry.endTime}
                    </td>
                    <td style={styles.td}>{entry.breakMinutes} דק'</td>
                    <td style={{ ...styles.td, fontWeight: 700 }}>{entry.totalHours}</td>
                    <td style={{ ...styles.td, color: C.green }}>{entry.regularHours}</td>
                    <td style={{ ...styles.td, color: C.yellow }}>{entry.overtime125}</td>
                    <td style={{ ...styles.td, color: C.accent }}>{entry.overtime150}</td>
                    <td style={styles.td}>{entry.projectName ?? '—'}</td>
                    <td style={styles.td}>
                      {entry.approved ? (
                        <span style={{ color: C.green, fontWeight: 700 }}>מאושר</span>
                      ) : (
                        <span style={{ color: C.yellow, fontWeight: 700 }}>ממתין</span>
                      )}
                    </td>
                    <td style={styles.td}>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        {!entry.approved && (
                          <button
                            type="button"
                            style={styles.btnGreen}
                            onClick={() => handleApprove(entry.id)}
                          >
                            אישור
                          </button>
                        )}
                        <button
                          type="button"
                          style={styles.btnRed}
                          onClick={() => handleRemove(entry.id)}
                        >
                          מחיקה
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB 2 — ABSENCE REQUESTS
// ═══════════════════════════════════════════════════════════════════════════

function AbsenceRequestsTab({ employees, refreshTick, onRefresh }: TabProps) {
  const [employeeId, setEmployeeId] = useState<string>(employees[0]?.id ?? '');
  const [absenceType, setAbsenceType] = useState<AbsenceType>('vacation');
  const [startDate, setStartDate] = useState<string>(todayStr());
  const [endDate, setEndDate] = useState<string>(todayStr());
  const [halfDay, setHalfDay] = useState<boolean>(false);
  const [reason, setReason] = useState<string>('');
  const [error, setError] = useState<string>('');

  const allRequests = useMemo(() => {
    return AbsenceStore.getAll().filter((a) => a.type !== 'unauthorized');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTick]);

  const pending = allRequests.filter((a) => a.status === 'pending');
  const approved = allRequests.filter((a) => a.status === 'approved');
  const rejected = allRequests.filter((a) => a.status === 'rejected');

  const dayCount = useMemo(() => {
    if (halfDay) return 0.5;
    if (!startDate || !endDate) return 0;
    if (endDate < startDate) return 0;
    return workingDaysBetween(startDate, endDate);
  }, [startDate, endDate, halfDay]);

  // Filter out 'unauthorized' from select options for submitter form
  const SELECTABLE_TYPES: AbsenceType[] = [
    'vacation',
    'sick',
    'sick_family',
    'bereavement',
    'military',
    'maternity',
    'study',
    'personal',
    'unpaid',
  ];

  const handleSubmit = () => {
    setError('');
    if (!employeeId) {
      setError('יש לבחור עובד');
      return;
    }
    if (!startDate || !endDate) {
      setError('יש לבחור תאריכים');
      return;
    }
    if (endDate < startDate) {
      setError('תאריך הסיום חייב להיות אחרי תאריך התחילה');
      return;
    }

    const emp = employees.find((e) => e.id === employeeId);
    if (!emp) {
      setError('עובד לא נמצא');
      return;
    }

    AbsenceStore.submit({
      employeeId: emp.id,
      employeeName: emp.name,
      type: absenceType,
      startDate,
      endDate,
      halfDay,
      reason,
    });

    setReason('');
    setHalfDay(false);
    onRefresh();
  };

  const handleApprove = (id: string) => {
    AbsenceStore.approve(id, 'manager');
    onRefresh();
  };

  const handleReject = (id: string) => {
    const reasonText = window.prompt('סיבת הדחייה?');
    if (!reasonText) return;
    AbsenceStore.reject(id, reasonText, 'manager');
    onRefresh();
  };

  const renderRequestCard = (req: AbsenceRequest, withActions: boolean) => (
    <div
      key={req.id}
      style={{
        background: C.panelAlt,
        border: `1px solid ${C.border}`,
        borderRadius: '8px',
        padding: '12px',
        marginBottom: '10px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
        <span style={{ fontWeight: 700, color: C.text }}>{req.employeeName}</span>
        <span
          style={{
            ...styles.badge,
            background: ABSENCE_COLORS[req.type],
            color: '#1a1a1a',
          }}
        >
          {ABSENCE_LABELS[req.type]}
        </span>
      </div>
      <div style={{ fontSize: '12px', color: C.textDim, marginBottom: '4px' }}>
        {fmtDate(req.startDate)} – {fmtDate(req.endDate)}
        {' • '}
        <b style={{ color: C.text }}>{req.daysCount} ימים</b>
        {req.halfDay && ' (חצי יום)'}
      </div>
      {req.reason && (
        <div style={{ fontSize: '12px', color: C.textDim, marginBottom: '6px' }}>
          סיבה: {req.reason}
        </div>
      )}
      {req.rejectedReason && (
        <div style={{ fontSize: '12px', color: C.red, marginBottom: '6px' }}>
          נדחה: {req.rejectedReason}
        </div>
      )}
      {withActions && (
        <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
          <button type="button" style={styles.btnGreen} onClick={() => handleApprove(req.id)}>
            אשר
          </button>
          <button type="button" style={styles.btnRed} onClick={() => handleReject(req.id)}>
            דחה
          </button>
        </div>
      )}
    </div>
  );

  return (
    <>
      <div style={styles.panel}>
        <h2 style={styles.panelTitle}>הגשת בקשה חדשה</h2>

        <div style={styles.formGrid}>
          <div style={styles.field}>
            <label style={styles.label}>עובד *</label>
            <select
              style={styles.select}
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
            >
              <option value="">— בחר עובד —</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name}
                </option>
              ))}
            </select>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>סוג היעדרות</label>
            <select
              style={styles.select}
              value={absenceType}
              onChange={(e) => setAbsenceType(e.target.value as AbsenceType)}
            >
              {SELECTABLE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {ABSENCE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>מתאריך *</label>
            <input
              type="date"
              style={styles.input}
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>עד תאריך *</label>
            <input
              type="date"
              style={styles.input}
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>

          <div style={{ ...styles.field, justifyContent: 'flex-end' }}>
            <label
              style={{
                ...styles.label,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={halfDay}
                onChange={(e) => setHalfDay(e.target.checked)}
                style={{ width: '16px', height: '16px' }}
              />
              חצי יום
            </label>
          </div>
        </div>

        <div style={styles.field}>
          <label style={styles.label}>סיבה / הערות</label>
          <textarea
            style={styles.textarea}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="פרט את סיבת הבקשה..."
          />
        </div>

        <div style={{ ...styles.livePreview, marginTop: '14px' }}>
          <span style={{ color: C.accent, fontWeight: 700 }}>חישוב ימים:</span>
          <span>
            סה"כ ימי עבודה: <b>{dayCount}</b>
          </span>
          {halfDay && <span style={{ color: C.yellow }}>(חצי יום)</span>}
        </div>

        {error && (
          <div
            style={{
              background: 'rgba(252,133,133,0.1)',
              border: `1px solid ${C.red}`,
              color: C.red,
              padding: '10px 14px',
              borderRadius: '6px',
              marginBottom: '12px',
              fontSize: '13px',
            }}
          >
            {error}
          </div>
        )}

        <button type="button" style={styles.btn} onClick={handleSubmit}>
          הגש בקשה
        </button>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '14px',
        }}
      >
        <div
          style={{
            ...styles.panel,
            borderRightWidth: '4px',
            borderRightColor: C.yellow,
          }}
        >
          <h2 style={{ ...styles.panelTitle, color: C.yellow }}>
            ממתין לאישור ({pending.length})
          </h2>
          {pending.length === 0 ? (
            <div style={styles.empty}>אין בקשות ממתינות</div>
          ) : (
            pending.map((req) => renderRequestCard(req, true))
          )}
        </div>

        <div
          style={{
            ...styles.panel,
            borderRightWidth: '4px',
            borderRightColor: C.green,
          }}
        >
          <h2 style={{ ...styles.panelTitle, color: C.green }}>
            מאושר ({approved.length})
          </h2>
          {approved.length === 0 ? (
            <div style={styles.empty}>אין בקשות מאושרות</div>
          ) : (
            approved.map((req) => renderRequestCard(req, false))
          )}
        </div>

        <div
          style={{
            ...styles.panel,
            borderRightWidth: '4px',
            borderRightColor: C.red,
          }}
        >
          <h2 style={{ ...styles.panelTitle, color: C.red }}>
            נדחה ({rejected.length})
          </h2>
          {rejected.length === 0 ? (
            <div style={styles.empty}>אין בקשות שנדחו</div>
          ) : (
            rejected.map((req) => renderRequestCard(req, false))
          )}
        </div>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB 3 — UNAUTHORIZED ABSENCES
// ═══════════════════════════════════════════════════════════════════════════

function UnauthorizedTab({ employees, refreshTick, onRefresh }: TabProps) {
  const [employeeId, setEmployeeId] = useState<string>(employees[0]?.id ?? '');
  const [date, setDate] = useState<string>(todayStr());
  const [reason, setReason] = useState<string>('');
  const [error, setError] = useState<string>('');

  const unauthorizedList = useMemo(() => {
    return AbsenceStore.getAll()
      .filter((a) => a.type === 'unauthorized')
      .sort((a, b) => (a.startDate < b.startDate ? 1 : -1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTick]);

  const totalUnauthorized = useMemo(() => {
    return BalanceStore.getAll().reduce((sum, b) => sum + (b.unauthorizedDays || 0), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTick]);

  const handleLog = () => {
    setError('');
    if (!employeeId) {
      setError('יש לבחור עובד');
      return;
    }
    if (!date) {
      setError('יש לבחור תאריך');
      return;
    }
    if (!reason.trim()) {
      setError('יש להזין סיבה');
      return;
    }

    const emp = employees.find((e) => e.id === employeeId);
    if (!emp) {
      setError('עובד לא נמצא');
      return;
    }

    AbsenceStore.logUnauthorized(emp.id, emp.name, date, reason);
    setReason('');
    onRefresh();
  };

  return (
    <>
      <div style={styles.kpiStrip}>
        <div
          style={{
            ...styles.kpiCard,
            borderRightWidth: '4px',
            borderRightColor: C.red,
          }}
        >
          <div style={styles.kpiLabel}>סה"כ חיסורים השנה</div>
          <div style={{ ...styles.kpiValue, color: C.red }}>{totalUnauthorized}</div>
        </div>
        <div
          style={{
            ...styles.kpiCard,
            borderRightWidth: '4px',
            borderRightColor: C.yellow,
          }}
        >
          <div style={styles.kpiLabel}>רישומים השנה</div>
          <div style={styles.kpiValue}>{unauthorizedList.length}</div>
        </div>
        <div
          style={{
            ...styles.kpiCard,
            borderRightWidth: '4px',
            borderRightColor: C.purple,
          }}
        >
          <div style={styles.kpiLabel}>עובדים מעורבים</div>
          <div style={styles.kpiValue}>
            {new Set(unauthorizedList.map((a) => a.employeeId)).size}
          </div>
        </div>
      </div>

      <div
        style={{
          ...styles.panel,
          borderRight: `4px solid ${C.red}`,
          background: 'linear-gradient(135deg, rgba(252,133,133,0.05), transparent)',
        }}
      >
        <h2 style={{ ...styles.panelTitle, color: C.red }}>
          חיסורים לא מוצדקים — רישום מנהל
        </h2>

        <div style={styles.formGrid}>
          <div style={styles.field}>
            <label style={styles.label}>עובד *</label>
            <select
              style={styles.select}
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
            >
              <option value="">— בחר עובד —</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name}
                </option>
              ))}
            </select>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>תאריך *</label>
            <input
              type="date"
              style={styles.input}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <div style={{ ...styles.field, gridColumn: 'span 2' }}>
            <label style={styles.label}>סיבה *</label>
            <input
              type="text"
              style={styles.input}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="סיבת החיסור (לדוגמה: לא הגיע לעבודה ללא הודעה)"
            />
          </div>
        </div>

        {error && (
          <div
            style={{
              background: 'rgba(252,133,133,0.1)',
              border: `1px solid ${C.red}`,
              color: C.red,
              padding: '10px 14px',
              borderRadius: '6px',
              marginBottom: '12px',
              fontSize: '13px',
            }}
          >
            {error}
          </div>
        )}

        <button
          type="button"
          style={{ ...styles.btn, background: C.red, color: '#1a1a1a' }}
          onClick={handleLog}
        >
          רשום חיסור
        </button>
      </div>

      <div style={styles.panel}>
        <h2 style={styles.panelTitle}>
          רישומי חיסורים ({unauthorizedList.length})
        </h2>

        {unauthorizedList.length === 0 ? (
          <div style={styles.empty}>אין חיסורים רשומים</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>עובד</th>
                  <th style={styles.th}>תאריך</th>
                  <th style={styles.th}>סיבה</th>
                  <th style={styles.th}>נרשם בתאריך</th>
                </tr>
              </thead>
              <tbody>
                {unauthorizedList.map((a) => (
                  <tr key={a.id} style={styles.tableRow}>
                    <td style={{ ...styles.td, fontWeight: 600 }}>{a.employeeName}</td>
                    <td style={{ ...styles.td, color: C.red }}>{fmtDate(a.startDate)}</td>
                    <td style={styles.td}>{a.reason || '—'}</td>
                    <td style={{ ...styles.td, color: C.textDim }}>
                      {fmtDateTime(a.submittedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB 4 — EMPLOYEE BALANCES
// ═══════════════════════════════════════════════════════════════════════════

function BalancesTab({ employees, refreshTick, onRefresh }: TabProps) {
  const balances = useMemo(() => {
    return employees.map((emp) => BalanceStore.getOrCreate(emp.id, emp.name));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTick, employees]);

  const totals = useMemo(() => {
    return balances.reduce(
      (acc, b) => ({
        vacationUsed: acc.vacationUsed + (b.vacationUsed || 0),
        sickUsed: acc.sickUsed + (b.sickUsed || 0),
        unauthorized: acc.unauthorized + (b.unauthorizedDays || 0),
      }),
      { vacationUsed: 0, sickUsed: 0, unauthorized: 0 },
    );
  }, [balances]);

  const handleAccrue = (empId: string, empName: string) => {
    BalanceStore.accrueMonthly(empId, empName);
    onRefresh();
  };

  const renderBar = (used: number, entitled: number, color: string) => {
    const pct = entitled > 0 ? Math.min(100, (used / entitled) * 100) : 0;
    return (
      <div
        style={{
          background: 'rgba(255,255,255,0.05)',
          borderRadius: '4px',
          height: '8px',
          overflow: 'hidden',
          marginTop: '6px',
        }}
      >
        <div
          style={{
            background: color,
            height: '100%',
            width: `${pct}%`,
            transition: 'width 0.3s ease',
          }}
        />
      </div>
    );
  };

  return (
    <>
      <div style={styles.kpiStrip}>
        <div
          style={{
            ...styles.kpiCard,
            borderRightWidth: '4px',
            borderRightColor: C.green,
          }}
        >
          <div style={styles.kpiLabel}>סה"כ ימי חופש שנוצלו</div>
          <div style={{ ...styles.kpiValue, color: C.green }}>
            {totals.vacationUsed.toFixed(1)}
          </div>
        </div>
        <div
          style={{
            ...styles.kpiCard,
            borderRightWidth: '4px',
            borderRightColor: C.red,
          }}
        >
          <div style={styles.kpiLabel}>סה"כ ימי מחלה</div>
          <div style={{ ...styles.kpiValue, color: C.red }}>{totals.sickUsed.toFixed(1)}</div>
        </div>
        <div
          style={{
            ...styles.kpiCard,
            borderRightWidth: '4px',
            borderRightColor: C.yellow,
          }}
        >
          <div style={styles.kpiLabel}>סה"כ חיסורים לא מוצדקים</div>
          <div style={{ ...styles.kpiValue, color: C.yellow }}>{totals.unauthorized}</div>
        </div>
        <div
          style={{
            ...styles.kpiCard,
            borderRightWidth: '4px',
            borderRightColor: C.purple,
          }}
        >
          <div style={styles.kpiLabel}>עובדים</div>
          <div style={styles.kpiValue}>{balances.length}</div>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: '14px',
        }}
      >
        {balances.map((b) => (
          <div key={b.employeeId} style={styles.panel}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '14px',
                paddingBottom: '10px',
                borderBottom: `1px solid ${C.border}`,
              }}
            >
              <div>
                <div style={{ fontSize: '16px', fontWeight: 700, color: C.text }}>
                  {b.employeeName}
                </div>
                <div style={{ fontSize: '11px', color: C.textDim }}>
                  שנת {b.year}
                </div>
              </div>
              <button
                type="button"
                style={styles.btnSmall}
                onClick={() => handleAccrue(b.employeeId, b.employeeName)}
              >
                עדכון יתרות
              </button>
            </div>

            <div
              style={{
                background: 'rgba(20,204,187,0.08)',
                borderRight: `4px solid ${C.green}`,
                borderRadius: '6px',
                padding: '10px 12px',
                marginBottom: '10px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ fontWeight: 700, color: C.green }}>חופש</span>
                <span style={{ fontSize: '12px', color: C.textDim }}>
                  {b.vacationUsed.toFixed(1)} / {b.vacationEntitled.toFixed(1)}
                </span>
              </div>
              <div style={{ fontSize: '13px', color: C.text }}>
                <b>{b.vacationRemaining.toFixed(1)}</b> ימים זמינים
              </div>
              {renderBar(b.vacationUsed, b.vacationEntitled, C.green)}
            </div>

            <div
              style={{
                background: 'rgba(252,133,133,0.08)',
                borderRight: `4px solid ${C.red}`,
                borderRadius: '6px',
                padding: '10px 12px',
                marginBottom: '10px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ fontWeight: 700, color: C.red }}>מחלה</span>
                <span style={{ fontSize: '12px', color: C.textDim }}>
                  {b.sickUsed.toFixed(1)} / {b.sickEntitled.toFixed(1)}
                </span>
              </div>
              <div style={{ fontSize: '13px', color: C.text }}>
                <b>{b.sickRemaining.toFixed(1)}</b> ימים זמינים
              </div>
              {renderBar(b.sickUsed, b.sickEntitled, C.red)}
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '8px',
                fontSize: '12px',
              }}
            >
              <div
                style={{
                  background: C.panelAlt,
                  borderRadius: '6px',
                  padding: '8px 10px',
                }}
              >
                <div style={{ color: C.textDim, marginBottom: '2px' }}>מילואים</div>
                <div style={{ color: C.purple, fontWeight: 700 }}>
                  {b.militaryDaysUsed} ימים
                </div>
              </div>
              <div
                style={{
                  background: C.panelAlt,
                  borderRadius: '6px',
                  padding: '8px 10px',
                }}
              >
                <div style={{ color: C.textDim, marginBottom: '2px' }}>חיסורים</div>
                <div
                  style={{
                    color: b.unauthorizedDays > 0 ? C.red : C.textDim,
                    fontWeight: 700,
                  }}
                >
                  {b.unauthorizedDays} ימים
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB 5 — REPORTS
// ═══════════════════════════════════════════════════════════════════════════

function ReportsTab({ employees, refreshTick }: { employees: Array<{ id: string; name: string }>; refreshTick: number }) {
  const [startDate, setStartDate] = useState<string>(startOfMonthStr());
  const [endDate, setEndDate] = useState<string>(endOfMonthStr());
  const [selectedEmpId, setSelectedEmpId] = useState<string>('all');
  const [copyStatus, setCopyStatus] = useState<string>('');

  const reportRows = useMemo(() => {
    const targets =
      selectedEmpId === 'all'
        ? employees
        : employees.filter((e) => e.id === selectedEmpId);
    return targets.map((emp) => {
      const summary = HoursStore.summary(emp.id, startDate, endDate);
      return {
        employeeId: emp.id,
        employeeName: emp.name,
        ...summary,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employees, selectedEmpId, startDate, endDate, refreshTick]);

  const reportTotals = useMemo(() => {
    return reportRows.reduce(
      (acc, r) => ({
        totalHours: acc.totalHours + r.totalHours,
        regularHours: acc.regularHours + r.regularHours,
        overtime125: acc.overtime125 + r.overtime125,
        overtime150: acc.overtime150 + r.overtime150,
        daysWorked: acc.daysWorked + r.daysWorked,
      }),
      {
        totalHours: 0,
        regularHours: 0,
        overtime125: 0,
        overtime150: 0,
        daysWorked: 0,
      },
    );
  }, [reportRows]);

  const handleExport = async () => {
    try {
      const json = JSON.stringify(
        {
          period: { startDate, endDate },
          generatedAt: new Date().toISOString(),
          rows: reportRows,
          totals: reportTotals,
        },
        null,
        2,
      );
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(json);
        setCopyStatus('הדוח הועתק ללוח (JSON)');
      } else {
        // Fallback: open a window
        const win = window.open('', '_blank');
        if (win) {
          win.document.write(`<pre>${json}</pre>`);
        }
        setCopyStatus('הדוח הוצג בחלון חדש');
      }
      setTimeout(() => setCopyStatus(''), 3000);
    } catch (e) {
      setCopyStatus('שגיאה בהעתקה');
      setTimeout(() => setCopyStatus(''), 3000);
    }
  };

  // Stacked-bar visualization for selected employee (or first row)
  const focusRow = reportRows[0];
  const focusTotal = focusRow ? focusRow.totalHours : 0;
  const pct = (val: number) => (focusTotal > 0 ? (val / focusTotal) * 100 : 0);

  return (
    <>
      <div style={styles.panel}>
        <h2 style={styles.panelTitle}>הגדרות דוח</h2>

        <div style={styles.formGrid}>
          <div style={styles.field}>
            <label style={styles.label}>מתאריך</label>
            <input
              type="date"
              style={styles.input}
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>עד תאריך</label>
            <input
              type="date"
              style={styles.input}
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>עובד</label>
            <select
              style={styles.select}
              value={selectedEmpId}
              onChange={(e) => setSelectedEmpId(e.target.value)}
            >
              <option value="all">כל העובדים</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name}
                </option>
              ))}
            </select>
          </div>
          <div style={{ ...styles.field, justifyContent: 'flex-end' }}>
            <button type="button" style={styles.btn} onClick={handleExport}>
              ייצוא ל-Payroll
            </button>
          </div>
        </div>

        {copyStatus && (
          <div
            style={{
              background: 'rgba(20,204,187,0.1)',
              border: `1px solid ${C.green}`,
              color: C.green,
              padding: '8px 14px',
              borderRadius: '6px',
              fontSize: '13px',
              marginTop: '10px',
            }}
          >
            {copyStatus}
          </div>
        )}
      </div>

      <div style={styles.kpiStrip}>
        <div style={styles.kpiCard}>
          <div style={styles.kpiLabel}>סה"כ שעות</div>
          <div style={styles.kpiValue}>{reportTotals.totalHours.toFixed(1)}</div>
        </div>
        <div
          style={{ ...styles.kpiCard, borderRightWidth: '4px', borderRightColor: C.green }}
        >
          <div style={styles.kpiLabel}>תקן</div>
          <div style={{ ...styles.kpiValue, color: C.green }}>
            {reportTotals.regularHours.toFixed(1)}
          </div>
        </div>
        <div
          style={{ ...styles.kpiCard, borderRightWidth: '4px', borderRightColor: C.yellow }}
        >
          <div style={styles.kpiLabel}>שעות 125%</div>
          <div style={{ ...styles.kpiValue, color: C.yellow }}>
            {reportTotals.overtime125.toFixed(1)}
          </div>
        </div>
        <div
          style={{ ...styles.kpiCard, borderRightWidth: '4px', borderRightColor: C.accent }}
        >
          <div style={styles.kpiLabel}>שעות 150%</div>
          <div style={{ ...styles.kpiValue, color: C.accent }}>
            {reportTotals.overtime150.toFixed(1)}
          </div>
        </div>
        <div
          style={{ ...styles.kpiCard, borderRightWidth: '4px', borderRightColor: C.purple }}
        >
          <div style={styles.kpiLabel}>ימי עבודה</div>
          <div style={{ ...styles.kpiValue, color: C.purple }}>{reportTotals.daysWorked}</div>
        </div>
      </div>

      <div style={styles.panel}>
        <h2 style={styles.panelTitle}>סיכום שעות לעובד</h2>

        {reportRows.length === 0 ? (
          <div style={styles.empty}>אין נתונים בתקופה הזו</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>עובד</th>
                  <th style={styles.th}>סה"כ שעות</th>
                  <th style={styles.th}>תקן</th>
                  <th style={styles.th}>125%</th>
                  <th style={styles.th}>150%</th>
                  <th style={styles.th}>ימי עבודה</th>
                  <th style={styles.th}>ממוצע יומי</th>
                </tr>
              </thead>
              <tbody>
                {reportRows.map((r) => (
                  <tr key={r.employeeId}>
                    <td style={{ ...styles.td, fontWeight: 600 }}>{r.employeeName}</td>
                    <td style={{ ...styles.td, fontWeight: 700 }}>{r.totalHours.toFixed(1)}</td>
                    <td style={{ ...styles.td, color: C.green }}>{r.regularHours.toFixed(1)}</td>
                    <td style={{ ...styles.td, color: C.yellow }}>{r.overtime125.toFixed(1)}</td>
                    <td style={{ ...styles.td, color: C.accent }}>{r.overtime150.toFixed(1)}</td>
                    <td style={styles.td}>{r.daysWorked}</td>
                    <td style={styles.td}>{r.avgHoursPerDay.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td style={{ ...styles.td, fontWeight: 700, color: C.accent }}>סה"כ</td>
                  <td style={{ ...styles.td, fontWeight: 700, color: C.accent }}>
                    {reportTotals.totalHours.toFixed(1)}
                  </td>
                  <td style={{ ...styles.td, fontWeight: 700, color: C.green }}>
                    {reportTotals.regularHours.toFixed(1)}
                  </td>
                  <td style={{ ...styles.td, fontWeight: 700, color: C.yellow }}>
                    {reportTotals.overtime125.toFixed(1)}
                  </td>
                  <td style={{ ...styles.td, fontWeight: 700, color: C.accent }}>
                    {reportTotals.overtime150.toFixed(1)}
                  </td>
                  <td style={{ ...styles.td, fontWeight: 700 }}>{reportTotals.daysWorked}</td>
                  <td style={styles.td}>—</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      <div style={styles.panel}>
        <h2 style={styles.panelTitle}>פילוח שעות — {focusRow ? focusRow.employeeName : '—'}</h2>

        {focusRow && focusTotal > 0 ? (
          <>
            <div
              style={{
                display: 'flex',
                height: '36px',
                width: '100%',
                borderRadius: '6px',
                overflow: 'hidden',
                background: C.panelAlt,
                border: `1px solid ${C.border}`,
              }}
            >
              <div
                style={{
                  background: C.green,
                  width: `${pct(focusRow.regularHours)}%`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#1a1a1a',
                  fontSize: '12px',
                  fontWeight: 700,
                  transition: 'width 0.3s ease',
                }}
                title={`תקן: ${focusRow.regularHours} שעות`}
              >
                {pct(focusRow.regularHours) > 8 && `${focusRow.regularHours.toFixed(1)}h`}
              </div>
              <div
                style={{
                  background: C.yellow,
                  width: `${pct(focusRow.overtime125)}%`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#1a1a1a',
                  fontSize: '12px',
                  fontWeight: 700,
                  transition: 'width 0.3s ease',
                }}
                title={`125%: ${focusRow.overtime125} שעות`}
              >
                {pct(focusRow.overtime125) > 8 && `${focusRow.overtime125.toFixed(1)}h`}
              </div>
              <div
                style={{
                  background: C.accent,
                  width: `${pct(focusRow.overtime150)}%`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#1a1a1a',
                  fontSize: '12px',
                  fontWeight: 700,
                  transition: 'width 0.3s ease',
                }}
                title={`150%: ${focusRow.overtime150} שעות`}
              >
                {pct(focusRow.overtime150) > 8 && `${focusRow.overtime150.toFixed(1)}h`}
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                gap: '20px',
                marginTop: '14px',
                flexWrap: 'wrap',
                fontSize: '13px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div
                  style={{
                    width: '14px',
                    height: '14px',
                    background: C.green,
                    borderRadius: '3px',
                  }}
                />
                <span style={{ color: C.textDim }}>תקן ({focusRow.regularHours.toFixed(1)}h)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div
                  style={{
                    width: '14px',
                    height: '14px',
                    background: C.yellow,
                    borderRadius: '3px',
                  }}
                />
                <span style={{ color: C.textDim }}>125% ({focusRow.overtime125.toFixed(1)}h)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div
                  style={{
                    width: '14px',
                    height: '14px',
                    background: C.accent,
                    borderRadius: '3px',
                  }}
                />
                <span style={{ color: C.textDim }}>150% ({focusRow.overtime150.toFixed(1)}h)</span>
              </div>
            </div>
          </>
        ) : (
          <div style={styles.empty}>אין נתונים להציג</div>
        )}
      </div>
    </>
  );
}

export default HoursAttendance;
