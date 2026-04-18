import React, { useState, useEffect, useMemo } from 'react';
import {
  HoursStore,
  computeHours,
  DEFAULT_ACCRUAL_RULES,
  type HoursEntry,
  type ShiftType,
} from '../engines/hoursAttendanceEngine';

// ═══════════════════════════════════════════════════════════════════════════
// THEME TOKENS
// ═══════════════════════════════════════════════════════════════════════════

const COLORS = {
  bg: '#252A31',
  panel: '#2F343C',
  input: '#383E47',
  border: 'rgba(255,255,255,0.1)',
  text: '#F6F7F9',
  textMuted: '#ABB3BF',
  textDim: '#5C7080',
  accent: '#FFA500',
  green: '#14CCBB',
  yellow: '#F6B64A',
  red: '#FC8585',
};

const SHIFT_LABELS: Record<ShiftType, string> = {
  regular: 'רגילה',
  overtime_125: 'נוספות 125%',
  overtime_150: 'נוספות 150%',
  night: 'לילה',
  saturday: 'שבת',
  holiday: 'חג',
};

const SHIFT_OPTIONS: ShiftType[] = [
  'regular',
  'overtime_125',
  'overtime_150',
  'night',
  'saturday',
  'holiday',
];

// ═══════════════════════════════════════════════════════════════════════════
// PROPS
// ═══════════════════════════════════════════════════════════════════════════

interface EmployeeHoursLogProps {
  employeeId: string;
  employeeName: string;
  onEntryAdded?: (entry: HoursEntry) => void;
  showRecent?: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function nowTimeStr(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatDateHe(date: string): string {
  const d = new Date(date);
  const dayNames = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
  return `${dayNames[d.getDay()]}, ${d.getDate()}/${d.getMonth() + 1}`;
}

function isValidTime(t: string): boolean {
  return /^\d{2}:\d{2}$/.test(t);
}

function startOfWeekSunday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 6);
  return d.toISOString().slice(0, 10);
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export const EmployeeHoursLog: React.FC<EmployeeHoursLogProps> = ({
  employeeId,
  employeeName,
  onEntryAdded,
  showRecent = 14,
}) => {
  // ─── form state ─────────────────────────────────────────────────────────
  const [date, setDate] = useState<string>(todayStr());
  const [startTime, setStartTime] = useState<string>('07:30');
  const [endTime, setEndTime] = useState<string>('16:30');
  const [breakMinutes, setBreakMinutes] = useState<number>(30);
  const [shiftType, setShiftType] = useState<ShiftType>('regular');
  const [project, setProject] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [error, setError] = useState<string>('');

  // ─── data state ─────────────────────────────────────────────────────────
  const [entries, setEntries] = useState<HoursEntry[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<HoursEntry>>({});
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState<number>(0);

  // ─── load entries ───────────────────────────────────────────────────────
  useEffect(() => {
    setEntries(HoursStore.getByEmployee(employeeId));
  }, [employeeId, refreshKey]);

  // ─── live preview of current form ──────────────────────────────────────
  const livePreview = useMemo(() => {
    if (!isValidTime(startTime) || !isValidTime(endTime)) {
      return { total: 0, regular: 0, overtime125: 0, overtime150: 0 };
    }
    return computeHours(startTime, endTime, breakMinutes, DEFAULT_ACCRUAL_RULES.standardHoursPerDay);
  }, [startTime, endTime, breakMinutes]);

  // ─── recent entries (sorted desc by date+createdAt) ────────────────────
  const recentEntries = useMemo(() => {
    return [...entries]
      .sort((a, b) => {
        if (a.date !== b.date) return a.date < b.date ? 1 : -1;
        return a.createdAt < b.createdAt ? 1 : -1;
      })
      .slice(0, showRecent);
  }, [entries, showRecent]);

  // ─── weekly summary ────────────────────────────────────────────────────
  const weekSummary = useMemo(() => {
    const ws = startOfWeekSunday();
    const we = todayStr();
    return HoursStore.summary(employeeId, ws, we);
  }, [employeeId, refreshKey]);

  // ─── validation ────────────────────────────────────────────────────────
  function validate(): string {
    if (!date) return 'יש לבחור תאריך';
    if (!isValidTime(startTime)) return 'שעת התחלה לא תקינה';
    if (!isValidTime(endTime)) return 'שעת סיום לא תקינה';
    if (breakMinutes < 0) return 'דקות הפסקה חייבות להיות חיוביות';
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    const startMin = sh * 60 + sm;
    const endMin = eh * 60 + em;
    // allow overnight: end < start handled in compute, but warn if same time
    if (startMin === endMin) return 'שעת התחלה ושעת סיום זהות';
    return '';
  }

  // ─── handlers ──────────────────────────────────────────────────────────
  function handleAdd() {
    const err = validate();
    if (err) {
      setError(err);
      return;
    }
    setError('');
    const calc = computeHours(startTime, endTime, breakMinutes, DEFAULT_ACCRUAL_RULES.standardHoursPerDay);
    const entry = HoursStore.add({
      employeeId,
      employeeName,
      date,
      startTime,
      endTime,
      breakMinutes,
      totalHours: calc.total,
      regularHours: calc.regular,
      overtime125: calc.overtime125,
      overtime150: calc.overtime150,
      shiftType,
      projectName: project || undefined,
      notes: notes || undefined,
      approved: false,
    });
    if (onEntryAdded) onEntryAdded(entry);
    // reset
    setStartTime('07:30');
    setEndTime('16:30');
    setBreakMinutes(30);
    setShiftType('regular');
    setProject('');
    setNotes('');
    setRefreshKey(k => k + 1);
  }

  function handleStartNow() {
    setStartTime(nowTimeStr());
    setEndTime('');
  }

  function handleEndNow() {
    setEndTime(nowTimeStr());
  }

  function handleApprove(id: string) {
    HoursStore.approve(id, 'manager');
    setRefreshKey(k => k + 1);
  }

  function handleDelete(id: string) {
    HoursStore.remove(id);
    setConfirmDeleteId(null);
    setRefreshKey(k => k + 1);
  }

  function handleStartEdit(entry: HoursEntry) {
    setEditingId(entry.id);
    setEditDraft({
      date: entry.date,
      startTime: entry.startTime,
      endTime: entry.endTime,
      breakMinutes: entry.breakMinutes,
      shiftType: entry.shiftType,
      projectName: entry.projectName,
      notes: entry.notes,
    });
  }

  function handleSaveEdit(id: string) {
    const d = editDraft;
    if (!d.startTime || !d.endTime || !isValidTime(d.startTime) || !isValidTime(d.endTime)) {
      return;
    }
    const calc = computeHours(d.startTime, d.endTime, d.breakMinutes ?? 0, DEFAULT_ACCRUAL_RULES.standardHoursPerDay);
    HoursStore.update(id, {
      ...d,
      totalHours: calc.total,
      regularHours: calc.regular,
      overtime125: calc.overtime125,
      overtime150: calc.overtime150,
    });
    setEditingId(null);
    setEditDraft({});
    setRefreshKey(k => k + 1);
  }

  function handleCancelEdit() {
    setEditingId(null);
    setEditDraft({});
  }

  // ═════════════════════════════════════════════════════════════════════
  // STYLES
  // ═════════════════════════════════════════════════════════════════════

  const styles: Record<string, React.CSSProperties> = {
    container: {
      direction: 'rtl',
      backgroundColor: COLORS.bg,
      color: COLORS.text,
      fontFamily: 'Heebo, Rubik, Arial, sans-serif',
      padding: '20px',
      display: 'flex',
      flexDirection: 'column',
      gap: '20px',
      minHeight: '100%',
    },
    panel: {
      backgroundColor: COLORS.panel,
      borderRadius: '10px',
      border: `1px solid ${COLORS.border}`,
      padding: '20px',
      boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
    },
    panelTitle: {
      fontSize: '17px',
      fontWeight: 700,
      margin: 0,
      marginBottom: '14px',
      color: COLORS.text,
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
    },
    formGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap: '12px',
    },
    fieldWrap: {
      display: 'flex',
      flexDirection: 'column',
      gap: '4px',
    },
    label: {
      fontSize: '12px',
      color: COLORS.textMuted,
      fontWeight: 500,
    },
    input: {
      backgroundColor: COLORS.input,
      border: `1px solid ${COLORS.border}`,
      borderRadius: '6px',
      padding: '8px 10px',
      color: COLORS.text,
      fontSize: '14px',
      outline: 'none',
      fontFamily: 'inherit',
    },
    select: {
      backgroundColor: COLORS.input,
      border: `1px solid ${COLORS.border}`,
      borderRadius: '6px',
      padding: '8px 10px',
      color: COLORS.text,
      fontSize: '14px',
      outline: 'none',
      cursor: 'pointer',
      fontFamily: 'inherit',
    },
    summaryBar: {
      marginTop: '12px',
      padding: '10px 14px',
      backgroundColor: COLORS.input,
      borderRadius: '8px',
      border: `1px dashed ${COLORS.border}`,
      display: 'flex',
      gap: '18px',
      flexWrap: 'wrap',
      alignItems: 'center',
      fontSize: '13px',
    },
    summaryItem: {
      display: 'flex',
      gap: '6px',
      alignItems: 'center',
    },
    summaryLabel: {
      color: COLORS.textMuted,
    },
    summaryValue: {
      color: COLORS.text,
      fontWeight: 700,
    },
    actionsRow: {
      marginTop: '14px',
      display: 'flex',
      gap: '10px',
      flexWrap: 'wrap',
      alignItems: 'center',
    },
    btnPrimary: {
      backgroundColor: COLORS.accent,
      color: '#1A1F26',
      border: 'none',
      borderRadius: '8px',
      padding: '12px 22px',
      fontSize: '15px',
      fontWeight: 700,
      cursor: 'pointer',
      fontFamily: 'inherit',
      boxShadow: '0 2px 6px rgba(255,165,0,0.25)',
    },
    btnSecondary: {
      backgroundColor: COLORS.input,
      color: COLORS.text,
      border: `1px solid ${COLORS.border}`,
      borderRadius: '6px',
      padding: '10px 14px',
      fontSize: '13px',
      fontWeight: 500,
      cursor: 'pointer',
      fontFamily: 'inherit',
    },
    errorBox: {
      marginTop: '10px',
      padding: '8px 12px',
      backgroundColor: 'rgba(252, 133, 133, 0.12)',
      border: `1px solid ${COLORS.red}`,
      borderRadius: '6px',
      color: COLORS.red,
      fontSize: '13px',
    },
    tableWrap: {
      maxHeight: '440px',
      overflowY: 'auto',
      border: `1px solid ${COLORS.border}`,
      borderRadius: '8px',
    },
    table: {
      width: '100%',
      borderCollapse: 'collapse',
      fontSize: '13px',
    },
    th: {
      position: 'sticky',
      top: 0,
      backgroundColor: COLORS.input,
      color: COLORS.textMuted,
      fontWeight: 600,
      textAlign: 'right',
      padding: '10px 8px',
      borderBottom: `1px solid ${COLORS.border}`,
      fontSize: '12px',
      whiteSpace: 'nowrap',
    },
    td: {
      padding: '8px',
      borderBottom: `1px solid ${COLORS.border}`,
      color: COLORS.text,
      whiteSpace: 'nowrap',
    },
    statusOk: {
      color: COLORS.green,
      fontSize: '15px',
    },
    statusPending: {
      color: COLORS.yellow,
      fontSize: '15px',
    },
    miniBtn: {
      backgroundColor: 'transparent',
      border: `1px solid ${COLORS.border}`,
      color: COLORS.text,
      borderRadius: '4px',
      padding: '4px 8px',
      cursor: 'pointer',
      fontSize: '12px',
      marginLeft: '4px',
      fontFamily: 'inherit',
    },
    kpiStrip: {
      display: 'grid',
      gridTemplateColumns: 'repeat(5, 1fr)',
      gap: '12px',
    },
    kpiCard: {
      backgroundColor: COLORS.input,
      borderRadius: '8px',
      border: `1px solid ${COLORS.border}`,
      padding: '14px',
      display: 'flex',
      flexDirection: 'column',
      gap: '4px',
    },
    kpiLabel: {
      fontSize: '11px',
      color: COLORS.textMuted,
      fontWeight: 500,
    },
    kpiValue: {
      fontSize: '22px',
      color: COLORS.text,
      fontWeight: 700,
    },
    modalOverlay: {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.6)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
    },
    modalBox: {
      backgroundColor: COLORS.panel,
      borderRadius: '10px',
      border: `1px solid ${COLORS.border}`,
      padding: '24px',
      maxWidth: '420px',
      width: '90%',
      direction: 'rtl',
    },
    modalTitle: {
      fontSize: '17px',
      fontWeight: 700,
      color: COLORS.text,
      margin: 0,
      marginBottom: '10px',
    },
    modalText: {
      fontSize: '14px',
      color: COLORS.textMuted,
      marginBottom: '18px',
    },
    modalActions: {
      display: 'flex',
      gap: '10px',
      justifyContent: 'flex-end',
    },
    btnDanger: {
      backgroundColor: COLORS.red,
      color: '#1A1F26',
      border: 'none',
      borderRadius: '6px',
      padding: '9px 16px',
      fontSize: '13px',
      fontWeight: 700,
      cursor: 'pointer',
      fontFamily: 'inherit',
    },
    headerName: {
      fontSize: '13px',
      color: COLORS.textDim,
      fontWeight: 500,
      marginRight: '4px',
    },
  };

  const cellInput: React.CSSProperties = {
    ...styles.input,
    padding: '4px 6px',
    fontSize: '12px',
    width: '90px',
  };

  // ═════════════════════════════════════════════════════════════════════
  // RENDER
  // ═════════════════════════════════════════════════════════════════════

  return (
    <div style={styles.container}>
      {/* ───────── QUICK ENTRY PANEL ───────── */}
      <div style={styles.panel}>
        <h3 style={styles.panelTitle}>
          רישום מהיר
          <span style={styles.headerName}>· {employeeName}</span>
        </h3>

        <div style={styles.formGrid}>
          <div style={styles.fieldWrap}>
            <label style={styles.label}>תאריך</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              style={styles.input}
            />
          </div>

          <div style={styles.fieldWrap}>
            <label style={styles.label}>שעת התחלה</label>
            <input
              type="time"
              value={startTime}
              onChange={e => setStartTime(e.target.value)}
              style={styles.input}
            />
          </div>

          <div style={styles.fieldWrap}>
            <label style={styles.label}>שעת סיום</label>
            <input
              type="time"
              value={endTime}
              onChange={e => setEndTime(e.target.value)}
              style={styles.input}
            />
          </div>

          <div style={styles.fieldWrap}>
            <label style={styles.label}>הפסקה (דקות)</label>
            <input
              type="number"
              min={0}
              value={breakMinutes}
              onChange={e => setBreakMinutes(Number(e.target.value))}
              style={styles.input}
            />
          </div>

          <div style={styles.fieldWrap}>
            <label style={styles.label}>סוג משמרת</label>
            <select
              value={shiftType}
              onChange={e => setShiftType(e.target.value as ShiftType)}
              style={styles.select}
            >
              {SHIFT_OPTIONS.map(s => (
                <option key={s} value={s}>{SHIFT_LABELS[s]}</option>
              ))}
            </select>
          </div>

          <div style={styles.fieldWrap}>
            <label style={styles.label}>פרויקט (אופציונלי)</label>
            <input
              type="text"
              value={project}
              onChange={e => setProject(e.target.value)}
              placeholder="שם פרויקט..."
              style={styles.input}
            />
          </div>

          <div style={{ ...styles.fieldWrap, gridColumn: 'span 3' }}>
            <label style={styles.label}>הערות (אופציונלי)</label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="הערות כלליות..."
              style={styles.input}
            />
          </div>
        </div>

        {/* ─── live summary ─── */}
        <div style={styles.summaryBar}>
          <div style={styles.summaryItem}>
            <span style={styles.summaryLabel}>סה״כ:</span>
            <span style={styles.summaryValue}>{livePreview.total.toFixed(2)}</span>
          </div>
          <div style={styles.summaryItem}>
            <span style={styles.summaryLabel}>תקן:</span>
            <span style={styles.summaryValue}>{livePreview.regular.toFixed(2)}</span>
          </div>
          <div style={styles.summaryItem}>
            <span style={styles.summaryLabel}>125%:</span>
            <span style={{ ...styles.summaryValue, color: COLORS.yellow }}>
              {livePreview.overtime125.toFixed(2)}
            </span>
          </div>
          <div style={styles.summaryItem}>
            <span style={styles.summaryLabel}>150%:</span>
            <span style={{ ...styles.summaryValue, color: COLORS.accent }}>
              {livePreview.overtime150.toFixed(2)}
            </span>
          </div>
          {livePreview.total > 10 && (
            <span style={{ color: COLORS.accent, fontSize: '13px' }}>
              ⚠ משמרת ארוכה (מעל 10 שעות)
            </span>
          )}
        </div>

        {/* ─── action buttons ─── */}
        <div style={styles.actionsRow}>
          <button onClick={handleAdd} style={styles.btnPrimary}>
            הוסף רישום
          </button>
          <button onClick={handleStartNow} style={styles.btnSecondary}>
            שעון הכנסת שעה הנוכחית
          </button>
          <button onClick={handleEndNow} style={styles.btnSecondary}>
            סיים משמרת עכשיו
          </button>
        </div>

        {error && <div style={styles.errorBox}>{error}</div>}
      </div>

      {/* ───────── RECENT ENTRIES TABLE ───────── */}
      <div style={styles.panel}>
        <h3 style={styles.panelTitle}>רישומים אחרונים ({recentEntries.length})</h3>

        {recentEntries.length === 0 ? (
          <div style={{ padding: '30px', textAlign: 'center', color: COLORS.textDim }}>
            אין רישומים עדיין
          </div>
        ) : (
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>תאריך</th>
                  <th style={styles.th}>שעות</th>
                  <th style={styles.th}>הפסקה</th>
                  <th style={styles.th}>סה״כ</th>
                  <th style={styles.th}>תקן</th>
                  <th style={styles.th}>125%</th>
                  <th style={styles.th}>150%</th>
                  <th style={styles.th}>משמרת</th>
                  <th style={styles.th}>פרויקט</th>
                  <th style={styles.th}>סטטוס</th>
                  <th style={styles.th}>פעולות</th>
                </tr>
              </thead>
              <tbody>
                {recentEntries.map(entry => {
                  const isEditing = editingId === entry.id;
                  if (isEditing) {
                    return (
                      <tr key={entry.id} style={{ backgroundColor: 'rgba(255,165,0,0.06)' }}>
                        <td style={styles.td}>
                          <input
                            type="date"
                            value={editDraft.date ?? entry.date}
                            onChange={e => setEditDraft({ ...editDraft, date: e.target.value })}
                            style={cellInput}
                          />
                        </td>
                        <td style={styles.td}>
                          <input
                            type="time"
                            value={editDraft.startTime ?? entry.startTime}
                            onChange={e => setEditDraft({ ...editDraft, startTime: e.target.value })}
                            style={{ ...cellInput, width: '70px' }}
                          />
                          <span style={{ margin: '0 4px' }}>—</span>
                          <input
                            type="time"
                            value={editDraft.endTime ?? entry.endTime}
                            onChange={e => setEditDraft({ ...editDraft, endTime: e.target.value })}
                            style={{ ...cellInput, width: '70px' }}
                          />
                        </td>
                        <td style={styles.td}>
                          <input
                            type="number"
                            min={0}
                            value={editDraft.breakMinutes ?? entry.breakMinutes}
                            onChange={e =>
                              setEditDraft({ ...editDraft, breakMinutes: Number(e.target.value) })
                            }
                            style={{ ...cellInput, width: '60px' }}
                          />
                        </td>
                        <td style={styles.td}>—</td>
                        <td style={styles.td}>—</td>
                        <td style={styles.td}>—</td>
                        <td style={styles.td}>—</td>
                        <td style={styles.td}>
                          <select
                            value={editDraft.shiftType ?? entry.shiftType}
                            onChange={e =>
                              setEditDraft({ ...editDraft, shiftType: e.target.value as ShiftType })
                            }
                            style={{ ...cellInput, width: '110px' }}
                          >
                            {SHIFT_OPTIONS.map(s => (
                              <option key={s} value={s}>{SHIFT_LABELS[s]}</option>
                            ))}
                          </select>
                        </td>
                        <td style={styles.td}>
                          <input
                            type="text"
                            value={editDraft.projectName ?? entry.projectName ?? ''}
                            onChange={e =>
                              setEditDraft({ ...editDraft, projectName: e.target.value })
                            }
                            style={{ ...cellInput, width: '110px' }}
                          />
                        </td>
                        <td style={styles.td}>—</td>
                        <td style={styles.td}>
                          <button
                            onClick={() => handleSaveEdit(entry.id)}
                            style={{
                              ...styles.miniBtn,
                              backgroundColor: COLORS.green,
                              color: '#1A1F26',
                              borderColor: COLORS.green,
                              fontWeight: 700,
                            }}
                          >
                            שמור
                          </button>
                          <button onClick={handleCancelEdit} style={styles.miniBtn}>
                            ביטול
                          </button>
                        </td>
                      </tr>
                    );
                  }

                  const isLong = entry.totalHours > 10;
                  return (
                    <tr key={entry.id}>
                      <td style={styles.td}>{formatDateHe(entry.date)}</td>
                      <td style={styles.td}>
                        {entry.startTime}—{entry.endTime}
                      </td>
                      <td style={styles.td}>{entry.breakMinutes}׳</td>
                      <td style={styles.td}>
                        {isLong && (
                          <span style={{ color: COLORS.accent, marginLeft: '4px' }} title="משמרת ארוכה">
                            ⚠
                          </span>
                        )}
                        <strong>{entry.totalHours.toFixed(2)}</strong>
                      </td>
                      <td style={styles.td}>{entry.regularHours.toFixed(2)}</td>
                      <td style={{ ...styles.td, color: COLORS.yellow }}>
                        {entry.overtime125.toFixed(2)}
                      </td>
                      <td style={{ ...styles.td, color: COLORS.accent }}>
                        {entry.overtime150.toFixed(2)}
                      </td>
                      <td style={styles.td}>{SHIFT_LABELS[entry.shiftType]}</td>
                      <td style={{ ...styles.td, color: COLORS.textMuted }}>
                        {entry.projectName ?? '—'}
                      </td>
                      <td style={styles.td}>
                        {entry.approved ? (
                          <span style={styles.statusOk} title="מאושר">✓</span>
                        ) : (
                          <span style={styles.statusPending} title="ממתין לאישור">⏱</span>
                        )}
                      </td>
                      <td style={styles.td}>
                        {!entry.approved && (
                          <button
                            onClick={() => handleApprove(entry.id)}
                            style={{
                              ...styles.miniBtn,
                              backgroundColor: COLORS.green,
                              color: '#1A1F26',
                              borderColor: COLORS.green,
                              fontWeight: 700,
                            }}
                          >
                            אישור
                          </button>
                        )}
                        <button onClick={() => handleStartEdit(entry)} style={styles.miniBtn}>
                          עריכה
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(entry.id)}
                          style={{ ...styles.miniBtn, color: COLORS.red, borderColor: COLORS.red }}
                        >
                          מחיקה
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ───────── WEEKLY KPI STRIP ───────── */}
      <div style={styles.panel}>
        <h3 style={styles.panelTitle}>סיכום שבועי (7 ימים אחרונים)</h3>
        <div style={styles.kpiStrip}>
          <div style={styles.kpiCard}>
            <span style={styles.kpiLabel}>סה״כ השבוע</span>
            <span style={styles.kpiValue}>{weekSummary.totalHours.toFixed(1)}</span>
          </div>
          <div style={styles.kpiCard}>
            <span style={styles.kpiLabel}>ימי עבודה</span>
            <span style={styles.kpiValue}>{weekSummary.daysWorked}</span>
          </div>
          <div style={styles.kpiCard}>
            <span style={styles.kpiLabel}>ממוצע יומי</span>
            <span style={styles.kpiValue}>{weekSummary.avgHoursPerDay.toFixed(1)}</span>
          </div>
          <div style={styles.kpiCard}>
            <span style={styles.kpiLabel}>שעות 125%</span>
            <span style={{ ...styles.kpiValue, color: COLORS.yellow }}>
              {weekSummary.overtime125.toFixed(1)}
            </span>
          </div>
          <div style={styles.kpiCard}>
            <span style={styles.kpiLabel}>שעות 150%</span>
            <span style={{ ...styles.kpiValue, color: COLORS.accent }}>
              {weekSummary.overtime150.toFixed(1)}
            </span>
          </div>
        </div>
      </div>

      {/* ───────── DELETE CONFIRM MODAL ───────── */}
      {confirmDeleteId && (
        <div style={styles.modalOverlay} onClick={() => setConfirmDeleteId(null)}>
          <div style={styles.modalBox} onClick={e => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>אישור מחיקה</h3>
            <p style={styles.modalText}>
              האם אתה בטוח שברצונך למחוק את הרישום? פעולה זו אינה ניתנת לשחזור.
            </p>
            <div style={styles.modalActions}>
              <button onClick={() => setConfirmDeleteId(null)} style={styles.btnSecondary}>
                ביטול
              </button>
              <button onClick={() => handleDelete(confirmDeleteId)} style={styles.btnDanger}>
                מחק
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EmployeeHoursLog;
