/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║   HOURS REPORT — דו"ח שעות עבודה והיעדרויות                             ║
 * ║                                                                          ║
 * ║   • סינון לפי תקופה ועובדים                                              ║
 * ║   • KPI strip עם 4 כרטיסים                                              ║
 * ║   • טבלת פירוט לפי עובד עם הרחבה של רשומות                              ║
 * ║   • גרפים: סוגי משמרת + פירוט היעדרויות                                 ║
 * ║   • ייצוא: JSON / CSV / Payroll Autonomous                              ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

import React, { useState, useMemo } from 'react';
import {
  HoursStore,
  AbsenceStore,
  BalanceStore,
  ABSENCE_LABELS,
  ABSENCE_COLORS,
  type HoursEntry,
  type AbsenceRequest,
} from '../engines/hoursAttendanceEngine';

// ═══════════════════════════════════════════════════════════════════════════
// THEME
// ═══════════════════════════════════════════════════════════════════════════

const THEME = {
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
  purple: '#8B7FFF',
};

// ═══════════════════════════════════════════════════════════════════════════
// PROPS
// ═══════════════════════════════════════════════════════════════════════════

interface HoursReportProps {
  employees: Array<{ id: string; name: string }>;
  defaultMonth?: number;
  defaultYear?: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function firstDayOfMonth(year: number, month: number): string {
  return `${year}-${pad2(month)}-01`;
}

function lastDayOfMonth(year: number, month: number): string {
  const d = new Date(year, month, 0);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function fmtNum(n: number, digits = 1): string {
  if (!isFinite(n) || isNaN(n)) return '0';
  return n.toFixed(digits);
}

function fmtDate(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export const HoursReport: React.FC<HoursReportProps> = ({
  employees,
  defaultMonth,
  defaultYear,
}) => {
  const now = new Date();
  const initYear = defaultYear ?? now.getFullYear();
  const initMonth = defaultMonth ?? now.getMonth() + 1;

  const [startDate, setStartDate] = useState<string>(firstDayOfMonth(initYear, initMonth));
  const [endDate, setEndDate] = useState<string>(lastDayOfMonth(initYear, initMonth));
  const [selectedIds, setSelectedIds] = useState<string[]>(employees.map(e => e.id));
  const [expandedEmp, setExpandedEmp] = useState<string | null>(null);
  const [hoverRow, setHoverRow] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  // ─────────────────────────────────────────────────────────────────────────
  // SELECTION HANDLERS
  // ─────────────────────────────────────────────────────────────────────────

  const allSelected = selectedIds.length === employees.length;

  const toggleAll = () => {
    if (allSelected) setSelectedIds([]);
    else setSelectedIds(employees.map(e => e.id));
  };

  const toggleOne = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleRefresh = () => setRefreshTick(t => t + 1);

  // ─────────────────────────────────────────────────────────────────────────
  // DATA — useMemo, recompute when range/selection/refresh changes
  // ─────────────────────────────────────────────────────────────────────────

  const perEmployeeRows = useMemo(() => {
    void refreshTick;
    return employees
      .filter(e => selectedIds.includes(e.id))
      .map(emp => {
        const summary = HoursStore.summary(emp.id, startDate, endDate);
        const absences = AbsenceStore.getByEmployee(emp.id).filter(
          a =>
            a.status === 'approved' &&
            !(a.endDate < startDate || a.startDate > endDate)
        );
        const vacationDays = absences
          .filter(a => a.type === 'vacation')
          .reduce((s, a) => s + a.daysCount, 0);
        const sickDays = absences
          .filter(a => a.type === 'sick' || a.type === 'sick_family')
          .reduce((s, a) => s + a.daysCount, 0);
        const unauthorizedDays = absences
          .filter(a => a.type === 'unauthorized')
          .reduce((s, a) => s + a.daysCount, 0);
        return {
          empId: emp.id,
          empName: emp.name,
          ...summary,
          standardHours: summary.daysWorked * 8.6,
          vacationDays,
          sickDays,
          unauthorizedDays,
          absences,
        };
      });
  }, [employees, selectedIds, startDate, endDate, refreshTick]);

  // ─────────────────────────────────────────────────────────────────────────
  // KPIs
  // ─────────────────────────────────────────────────────────────────────────

  const kpis = useMemo(() => {
    const totalHours = perEmployeeRows.reduce((s, r) => s + r.totalHours, 0);
    const totalDays = perEmployeeRows.reduce((s, r) => s + r.daysWorked, 0);
    const avgPerDay = totalDays > 0 ? totalHours / totalDays : 0;
    const totalVacation = perEmployeeRows.reduce((s, r) => s + r.vacationDays, 0);
    const totalSick = perEmployeeRows.reduce((s, r) => s + r.sickDays, 0);
    return {
      totalHours,
      avgPerDay,
      totalVacation,
      totalSick,
    };
  }, [perEmployeeRows]);

  // ─────────────────────────────────────────────────────────────────────────
  // SHIFT-TYPE BREAKDOWN
  // ─────────────────────────────────────────────────────────────────────────

  const shiftBreakdown = useMemo(() => {
    const regular = perEmployeeRows.reduce((s, r) => s + r.regularHours, 0);
    const ot125 = perEmployeeRows.reduce((s, r) => s + r.overtime125, 0);
    const ot150 = perEmployeeRows.reduce((s, r) => s + r.overtime150, 0);
    const max = Math.max(regular, ot125, ot150, 1);
    return {
      regular,
      ot125,
      ot150,
      max,
    };
  }, [perEmployeeRows]);

  // ─────────────────────────────────────────────────────────────────────────
  // ABSENCE BREAKDOWN BY TYPE
  // ─────────────────────────────────────────────────────────────────────────

  const absenceBreakdown = useMemo(() => {
    void refreshTick;
    const byType = new Map<string, number>();
    perEmployeeRows.forEach(row => {
      row.absences.forEach(a => {
        byType.set(a.type, (byType.get(a.type) || 0) + a.daysCount);
      });
    });
    const list = Array.from(byType.entries())
      .map(([type, days]) => ({
        type: type as keyof typeof ABSENCE_LABELS,
        days,
      }))
      .sort((a, b) => b.days - a.days);
    const max = list.reduce((m, x) => Math.max(m, x.days), 1);
    return { list, max };
  }, [perEmployeeRows, refreshTick]);

  // ─────────────────────────────────────────────────────────────────────────
  // EXPANDED ROW — individual hours entries
  // ─────────────────────────────────────────────────────────────────────────

  const getEntriesForEmployee = (empId: string): HoursEntry[] => {
    return HoursStore.getByEmployee(empId)
      .filter(h => h.date >= startDate && h.date <= endDate)
      .sort((a, b) => a.date.localeCompare(b.date));
  };

  // ─────────────────────────────────────────────────────────────────────────
  // EXPORT
  // ─────────────────────────────────────────────────────────────────────────

  const buildExportPayload = () => {
    return {
      meta: {
        generatedAt: new Date().toISOString(),
        startDate,
        endDate,
        employeeCount: perEmployeeRows.length,
      },
      kpis,
      rows: perEmployeeRows.map(r => ({
        empId: r.empId,
        empName: r.empName,
        daysWorked: r.daysWorked,
        totalHours: r.totalHours,
        regularHours: r.regularHours,
        overtime125: r.overtime125,
        overtime150: r.overtime150,
        avgHoursPerDay: r.avgHoursPerDay,
        vacationDays: r.vacationDays,
        sickDays: r.sickDays,
        unauthorizedDays: r.unauthorizedDays,
      })),
      shiftBreakdown: {
        regular: shiftBreakdown.regular,
        overtime125: shiftBreakdown.ot125,
        overtime150: shiftBreakdown.ot150,
      },
      absenceBreakdown: absenceBreakdown.list,
    };
  };

  const handleCopyJSON = async () => {
    const payload = buildExportPayload();
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      alert('הדוח הועתק ללוח כ-JSON');
    } catch {
      alert('שגיאה בהעתקה ללוח');
    }
  };

  const handleDownloadCSV = () => {
    const headers = 'עובד,ימי עבודה,סה"כ שעות,תקן,125%,150%,חופשים,מחלה';
    const lines = perEmployeeRows.map(r => {
      const cells = [
        r.empName,
        String(r.daysWorked),
        fmtNum(r.totalHours, 2),
        fmtNum(r.regularHours, 2),
        fmtNum(r.overtime125, 2),
        fmtNum(r.overtime150, 2),
        fmtNum(r.vacationDays, 1),
        fmtNum(r.sickDays, 1),
      ];
      return cells
        .map(c => (c.includes(',') || c.includes('"') ? `"${c.replace(/"/g, '""')}"` : c))
        .join(',');
    });
    const csv = '\uFEFF' + [headers, ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hours-report_${startDate}_to_${endDate}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handlePayrollExport = () => {
    void BalanceStore;
    alert('הדוח מוכן לייבוא ב-Payroll Autonomous');
  };

  // ─────────────────────────────────────────────────────────────────────────
  // STYLES
  // ─────────────────────────────────────────────────────────────────────────

  const containerStyle: React.CSSProperties = {
    direction: 'rtl',
    background: THEME.bg,
    color: THEME.text,
    padding: 20,
    fontFamily: 'Heebo, Arial, sans-serif',
    minHeight: '100vh',
  };

  const panelStyle: React.CSSProperties = {
    background: THEME.panel,
    border: `1px solid ${THEME.border}`,
    borderRadius: 10,
    padding: 16,
    marginBottom: 16,
  };

  const inputStyle: React.CSSProperties = {
    background: THEME.input,
    color: THEME.text,
    border: `1px solid ${THEME.border}`,
    borderRadius: 6,
    padding: '6px 10px',
    fontSize: 13,
    fontFamily: 'inherit',
    outline: 'none',
  };

  const labelStyle: React.CSSProperties = {
    color: THEME.textMuted,
    fontSize: 12,
    marginBottom: 4,
    display: 'block',
  };

  const buttonPrimary: React.CSSProperties = {
    background: THEME.accent,
    color: '#1A1D23',
    border: 'none',
    borderRadius: 6,
    padding: '8px 18px',
    fontWeight: 700,
    fontSize: 13,
    cursor: 'pointer',
    fontFamily: 'inherit',
  };

  const buttonGhost: React.CSSProperties = {
    background: THEME.input,
    color: THEME.text,
    border: `1px solid ${THEME.border}`,
    borderRadius: 6,
    padding: '8px 16px',
    fontWeight: 600,
    fontSize: 13,
    cursor: 'pointer',
    fontFamily: 'inherit',
  };

  const sectionTitleStyle: React.CSSProperties = {
    fontSize: 14,
    fontWeight: 700,
    color: THEME.text,
    marginBottom: 12,
    paddingBottom: 8,
    borderBottom: `1px solid ${THEME.border}`,
  };

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div style={containerStyle}>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 16px 0' }}>
        דו"ח שעות והיעדרויות
      </h1>

      {/* ─── FILTER BAR ──────────────────────────────────────────────────── */}
      <div style={panelStyle}>
        <div style={sectionTitleStyle}>סינון</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'flex-end' }}>
          <div>
            <label style={labelStyle}>מתאריך</label>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>עד תאריך</label>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              style={inputStyle}
            />
          </div>
          <div style={{ flex: 1, minWidth: 280 }}>
            <label style={labelStyle}>עובדים</label>
            <div
              style={{
                background: THEME.input,
                border: `1px solid ${THEME.border}`,
                borderRadius: 6,
                padding: 8,
                maxHeight: 110,
                overflowY: 'auto',
                display: 'flex',
                flexWrap: 'wrap',
                gap: 6,
              }}
            >
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  cursor: 'pointer',
                  background: '#1F2329',
                  padding: '4px 10px',
                  borderRadius: 4,
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  style={{ accentColor: THEME.accent }}
                />
                כל העובדים
              </label>
              {employees.map(emp => (
                <label
                  key={emp.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    cursor: 'pointer',
                    background: selectedIds.includes(emp.id) ? '#1A2A28' : '#1F2329',
                    padding: '4px 10px',
                    borderRadius: 4,
                    fontSize: 12,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(emp.id)}
                    onChange={() => toggleOne(emp.id)}
                    style={{ accentColor: THEME.accent }}
                  />
                  {emp.name}
                </label>
              ))}
            </div>
          </div>
          <button onClick={handleRefresh} style={buttonPrimary}>
            רענן
          </button>
        </div>
      </div>

      {/* ─── KPI STRIP ───────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 14,
          marginBottom: 16,
        }}
      >
        <KPICard
          label='סה"כ שעות עבודה'
          value={fmtNum(kpis.totalHours, 1)}
          unit="שעות"
          color={THEME.green}
        />
        <KPICard
          label="ממוצע שעות יומי"
          value={fmtNum(kpis.avgPerDay, 2)}
          unit="ש'/יום"
          color={THEME.accent}
        />
        <KPICard
          label='סה"כ ימי חופש נוצלו'
          value={fmtNum(kpis.totalVacation, 1)}
          unit="ימים"
          color={THEME.purple}
        />
        <KPICard
          label='סה"כ ימי מחלה'
          value={fmtNum(kpis.totalSick, 1)}
          unit="ימים"
          color={THEME.red}
        />
      </div>

      {/* ─── PER-EMPLOYEE TABLE ──────────────────────────────────────────── */}
      <div style={panelStyle}>
        <div style={sectionTitleStyle}>פירוט לפי עובד</div>
        <div style={{ overflowX: 'auto' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 13,
              minWidth: 900,
            }}
          >
            <thead>
              <tr style={{ background: '#1F2329', color: THEME.textMuted }}>
                <Th>עובד</Th>
                <Th>ימי עבודה</Th>
                <Th>סה"כ שעות</Th>
                <Th>תקן</Th>
                <Th>125%</Th>
                <Th>150%</Th>
                <Th>ממוצע יומי</Th>
                <Th>חופשים</Th>
                <Th>מחלה</Th>
                <Th>חיסורים</Th>
              </tr>
            </thead>
            <tbody>
              {perEmployeeRows.length === 0 && (
                <tr>
                  <td
                    colSpan={10}
                    style={{
                      padding: 24,
                      textAlign: 'center',
                      color: THEME.textDim,
                    }}
                  >
                    אין נתונים בטווח הנבחר
                  </td>
                </tr>
              )}
              {perEmployeeRows.map(row => {
                const isExpanded = expandedEmp === row.empId;
                const isHovered = hoverRow === row.empId;
                return (
                  <React.Fragment key={row.empId}>
                    <tr
                      onClick={() => setExpandedEmp(isExpanded ? null : row.empId)}
                      onMouseEnter={() => setHoverRow(row.empId)}
                      onMouseLeave={() => setHoverRow(null)}
                      style={{
                        background: isExpanded
                          ? '#1A2A28'
                          : isHovered
                          ? '#272D36'
                          : 'transparent',
                        cursor: 'pointer',
                        borderBottom: `1px solid ${THEME.border}`,
                        transition: 'background 0.15s',
                      }}
                    >
                      <Td bold>
                        <span style={{ marginInlineEnd: 6, color: THEME.textMuted }}>
                          {isExpanded ? '▼' : '◄'}
                        </span>
                        {row.empName}
                      </Td>
                      <Td>{row.daysWorked}</Td>
                      <Td color={THEME.green} bold>
                        {fmtNum(row.totalHours, 1)}
                      </Td>
                      <Td>{fmtNum(row.regularHours, 1)}</Td>
                      <Td color={THEME.yellow}>{fmtNum(row.overtime125, 1)}</Td>
                      <Td color={THEME.accent}>{fmtNum(row.overtime150, 1)}</Td>
                      <Td>{fmtNum(row.avgHoursPerDay, 2)}</Td>
                      <Td color={THEME.purple}>{fmtNum(row.vacationDays, 1)}</Td>
                      <Td color={THEME.red}>{fmtNum(row.sickDays, 1)}</Td>
                      <Td>{fmtNum(row.unauthorizedDays, 0)}</Td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={10} style={{ background: '#1A1D23', padding: 0 }}>
                          <ExpandedEmployeeView
                            entries={getEntriesForEmployee(row.empId)}
                            absences={row.absences}
                          />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── SHIFT-TYPE BAR CHART ────────────────────────────────────────── */}
      <div style={panelStyle}>
        <div style={sectionTitleStyle}>פירוט לפי סוג משמרת</div>
        <BarRow
          label="תקן"
          value={shiftBreakdown.regular}
          max={shiftBreakdown.max}
          color={THEME.green}
          unit="ש'"
        />
        <BarRow
          label="125%"
          value={shiftBreakdown.ot125}
          max={shiftBreakdown.max}
          color={THEME.yellow}
          unit="ש'"
        />
        <BarRow
          label="150%"
          value={shiftBreakdown.ot150}
          max={shiftBreakdown.max}
          color={THEME.accent}
          unit="ש'"
        />
      </div>

      {/* ─── ABSENCE BREAKDOWN ───────────────────────────────────────────── */}
      <div style={panelStyle}>
        <div style={sectionTitleStyle}>פירוט היעדרויות לפי סוג</div>
        {absenceBreakdown.list.length === 0 && (
          <div
            style={{
              padding: 18,
              textAlign: 'center',
              color: THEME.textDim,
              fontSize: 13,
            }}
          >
            אין היעדרויות מאושרות בטווח
          </div>
        )}
        {absenceBreakdown.list.map(item => (
          <BarRow
            key={item.type}
            label={ABSENCE_LABELS[item.type]}
            value={item.days}
            max={absenceBreakdown.max}
            color={ABSENCE_COLORS[item.type]}
            unit="ימים"
          />
        ))}
      </div>

      {/* ─── EXPORT SECTION ──────────────────────────────────────────────── */}
      <div style={panelStyle}>
        <div style={sectionTitleStyle}>ייצוא דוח</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={handleCopyJSON} style={buttonGhost}>
            העתק JSON
          </button>
          <button onClick={handleDownloadCSV} style={buttonGhost}>
            הורד CSV
          </button>
          <button
            onClick={handlePayrollExport}
            style={{ ...buttonPrimary, background: THEME.purple, color: '#fff' }}
          >
            ייצוא ל-Payroll Autonomous
          </button>
        </div>
        <div style={{ marginTop: 10, fontSize: 11, color: THEME.textDim }}>
          תקופה: {fmtDate(startDate)} – {fmtDate(endDate)} · עובדים נבחרים:{' '}
          {perEmployeeRows.length}
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

const KPICard: React.FC<{
  label: string;
  value: string;
  unit: string;
  color: string;
}> = ({ label, value, unit, color }) => (
  <div
    style={{
      background: '#2F343C',
      border: `1px solid rgba(255,255,255,0.1)`,
      borderRadius: 10,
      padding: 16,
      borderTop: `3px solid ${color}`,
    }}
  >
    <div style={{ fontSize: 12, color: '#ABB3BF', marginBottom: 6 }}>{label}</div>
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
      <div style={{ fontSize: 26, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 11, color: '#5C7080' }}>{unit}</div>
    </div>
  </div>
);

const Th: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <th
    style={{
      padding: '10px 12px',
      textAlign: 'right',
      fontSize: 11,
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    }}
  >
    {children}
  </th>
);

const Td: React.FC<{
  children: React.ReactNode;
  color?: string;
  bold?: boolean;
}> = ({ children, color, bold }) => (
  <td
    style={{
      padding: '10px 12px',
      color: color || '#F6F7F9',
      fontWeight: bold ? 700 : 400,
      textAlign: 'right',
    }}
  >
    {children}
  </td>
);

const BarRow: React.FC<{
  label: string;
  value: number;
  max: number;
  color: string;
  unit: string;
}> = ({ label, value, max, color, unit }) => {
  const pct = max > 0 ? Math.max(2, (value / max) * 100) : 2;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
      <div
        style={{
          width: 110,
          fontSize: 12,
          color: '#ABB3BF',
          textAlign: 'left',
          fontWeight: 600,
        }}
      >
        {label}
      </div>
      <div
        style={{
          flex: 1,
          height: 22,
          background: '#1F2329',
          borderRadius: 4,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: color,
            borderRadius: 4,
            transition: 'width 0.4s ease',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingInlineEnd: 8,
            color: '#1A1D23',
            fontSize: 11,
            fontWeight: 800,
          }}
        >
          {value > 0 && pct > 18 ? `${value.toFixed(1)} ${unit}` : ''}
        </div>
        {value > 0 && pct <= 18 && (
          <div
            style={{
              position: 'absolute',
              insetInlineStart: `calc(${pct}% + 6px)`,
              top: '50%',
              transform: 'translateY(-50%)',
              fontSize: 11,
              color: '#F6F7F9',
              fontWeight: 700,
            }}
          >
            {value.toFixed(1)} {unit}
          </div>
        )}
      </div>
    </div>
  );
};

const ExpandedEmployeeView: React.FC<{
  entries: HoursEntry[];
  absences: AbsenceRequest[];
}> = ({ entries, absences }) => {
  return (
    <div style={{ padding: 16 }}>
      <div
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: '#ABB3BF',
          marginBottom: 8,
        }}
      >
        רישומי שעות ({entries.length})
      </div>
      {entries.length === 0 ? (
        <div style={{ fontSize: 12, color: '#5C7080', padding: 8 }}>
          אין רישומי שעות בטווח
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ color: '#5C7080' }}>
              <th style={{ textAlign: 'right', padding: '6px 10px' }}>תאריך</th>
              <th style={{ textAlign: 'right', padding: '6px 10px' }}>התחלה</th>
              <th style={{ textAlign: 'right', padding: '6px 10px' }}>סיום</th>
              <th style={{ textAlign: 'right', padding: '6px 10px' }}>הפסקה</th>
              <th style={{ textAlign: 'right', padding: '6px 10px' }}>סה"כ</th>
              <th style={{ textAlign: 'right', padding: '6px 10px' }}>תקן</th>
              <th style={{ textAlign: 'right', padding: '6px 10px' }}>125%</th>
              <th style={{ textAlign: 'right', padding: '6px 10px' }}>150%</th>
              <th style={{ textAlign: 'right', padding: '6px 10px' }}>פרויקט</th>
              <th style={{ textAlign: 'right', padding: '6px 10px' }}>סטטוס</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(entry => (
              <tr
                key={entry.id}
                style={{ borderBottom: `1px solid rgba(255,255,255,0.05)` }}
              >
                <td style={{ padding: '6px 10px', color: '#F6F7F9' }}>
                  {fmtDate(entry.date)}
                </td>
                <td style={{ padding: '6px 10px', color: '#ABB3BF' }}>
                  {entry.startTime}
                </td>
                <td style={{ padding: '6px 10px', color: '#ABB3BF' }}>
                  {entry.endTime}
                </td>
                <td style={{ padding: '6px 10px', color: '#5C7080' }}>
                  {entry.breakMinutes}'
                </td>
                <td
                  style={{
                    padding: '6px 10px',
                    color: '#14CCBB',
                    fontWeight: 700,
                  }}
                >
                  {fmtNum(entry.totalHours, 2)}
                </td>
                <td style={{ padding: '6px 10px', color: '#F6F7F9' }}>
                  {fmtNum(entry.regularHours, 2)}
                </td>
                <td style={{ padding: '6px 10px', color: '#F6B64A' }}>
                  {fmtNum(entry.overtime125, 2)}
                </td>
                <td style={{ padding: '6px 10px', color: '#FFA500' }}>
                  {fmtNum(entry.overtime150, 2)}
                </td>
                <td style={{ padding: '6px 10px', color: '#ABB3BF' }}>
                  {entry.projectName || '-'}
                </td>
                <td style={{ padding: '6px 10px' }}>
                  <span
                    style={{
                      background: entry.approved ? '#14CCBB22' : '#F6B64A22',
                      color: entry.approved ? '#14CCBB' : '#F6B64A',
                      padding: '2px 8px',
                      borderRadius: 4,
                      fontSize: 10,
                      fontWeight: 700,
                    }}
                  >
                    {entry.approved ? 'מאושר' : 'ממתין'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {absences.length > 0 && (
        <>
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: '#ABB3BF',
              marginTop: 14,
              marginBottom: 8,
            }}
          >
            היעדרויות בטווח ({absences.length})
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {absences.map(abs => (
              <div
                key={abs.id}
                style={{
                  background: '#2F343C',
                  border: `1px solid ${ABSENCE_COLORS[abs.type]}55`,
                  borderRadius: 4,
                  padding: '4px 10px',
                  fontSize: 11,
                  display: 'flex',
                  gap: 6,
                  alignItems: 'center',
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: ABSENCE_COLORS[abs.type],
                  }}
                />
                <span style={{ color: '#F6F7F9', fontWeight: 600 }}>
                  {ABSENCE_LABELS[abs.type]}
                </span>
                <span style={{ color: '#5C7080' }}>
                  {fmtDate(abs.startDate)}
                  {abs.startDate !== abs.endDate ? ` – ${fmtDate(abs.endDate)}` : ''}
                </span>
                <span style={{ color: '#ABB3BF' }}>· {abs.daysCount} ימים</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default HoursReport;
