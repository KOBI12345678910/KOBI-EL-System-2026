import React, { useState, useMemo } from 'react';
import {
  HoursStore,
  AbsenceStore,
  ABSENCE_LABELS,
  ABSENCE_COLORS,
  type HoursEntry,
  type AbsenceRequest,
  type AbsenceType,
} from '../engines/hoursAttendanceEngine';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface AttendanceCalendarProps {
  employees: Array<{ id: string; name: string }>;
  employeeId?: string;
  month?: number;
  year?: number;
  onDayClick?: (date: string, employeeId?: string) => void;
  compact?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const HEBREW_MONTHS = [
  'ינואר',
  'פברואר',
  'מרץ',
  'אפריל',
  'מאי',
  'יוני',
  'יולי',
  'אוגוסט',
  'ספטמבר',
  'אוקטובר',
  'נובמבר',
  'דצמבר',
];

const HEBREW_WEEKDAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

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
  purple: '#8B7FFF',
};

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function formatDateStr(year: number, month: number, day: number): string {
  const m = String(month + 1).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${year}-${m}-${d}`;
}

function isToday(year: number, month: number, day: number): boolean {
  const t = new Date();
  return (
    t.getFullYear() === year && t.getMonth() === month && t.getDate() === day
  );
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstWeekday(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export const AttendanceCalendar: React.FC<AttendanceCalendarProps> = ({
  employees,
  employeeId,
  month,
  year,
  onDayClick,
  compact = false,
}) => {
  const now = new Date();
  const [currentMonth, setCurrentMonth] = useState<number>(
    typeof month === 'number' ? month : now.getMonth(),
  );
  const [currentYear, setCurrentYear] = useState<number>(
    typeof year === 'number' ? year : now.getFullYear(),
  );
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>(
    employeeId ?? 'all',
  );

  const cellHeight = compact ? 60 : 80;

  // ─── month range string ───────────────────────────────────────────────
  const monthStartStr = formatDateStr(currentYear, currentMonth, 1);
  const monthEndStr = formatDateStr(
    currentYear,
    currentMonth,
    getDaysInMonth(currentYear, currentMonth),
  );

  // ─── data fetch ───────────────────────────────────────────────────────
  const monthData = useMemo(() => {
    const filterByEmp =
      selectedEmployeeId !== 'all' ? selectedEmployeeId : null;

    // Hours
    const allHours: HoursEntry[] = HoursStore.getByDateRange(
      monthStartStr,
      monthEndStr,
    );
    const hours = filterByEmp
      ? allHours.filter(h => h.employeeId === filterByEmp)
      : allHours;

    // Absences
    const allAbsences: AbsenceRequest[] = AbsenceStore.getAbsencesForDateRange(
      monthStartStr,
      monthEndStr,
    );
    const absences = filterByEmp
      ? allAbsences.filter(a => a.employeeId === filterByEmp)
      : allAbsences;

    return { hours, absences };
  }, [monthStartStr, monthEndStr, selectedEmployeeId]);

  // ─── per-day index ────────────────────────────────────────────────────
  const dayIndex = useMemo(() => {
    const map: Record<
      string,
      { hours: HoursEntry[]; absences: AbsenceRequest[] }
    > = {};

    monthData.hours.forEach(h => {
      if (!map[h.date]) map[h.date] = { hours: [], absences: [] };
      map[h.date].hours.push(h);
    });

    monthData.absences.forEach(a => {
      const start = new Date(a.startDate);
      const end = new Date(a.endDate);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const ds = formatDateStr(d.getFullYear(), d.getMonth(), d.getDate());
        if (!map[ds]) map[ds] = { hours: [], absences: [] };
        map[ds].absences.push(a);
      }
    });

    return map;
  }, [monthData]);

  // ─── summary stats ────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const uniqueDatesWithHours = new Set(monthData.hours.map(h => h.date));

    let vacationDays = 0;
    let sickDays = 0;
    let unauthorizedDays = 0;
    let militaryDays = 0;

    monthData.absences.forEach(a => {
      const start = new Date(a.startDate);
      const end = new Date(a.endDate);
      let days = 0;
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = formatDateStr(
          d.getFullYear(),
          d.getMonth(),
          d.getDate(),
        );
        if (dateStr >= monthStartStr && dateStr <= monthEndStr) {
          days++;
        }
      }
      if (a.type === 'vacation') vacationDays += days;
      else if (a.type === 'sick') sickDays += days;
      else if (a.type === 'unauthorized') unauthorizedDays += days;
      else if (a.type === 'military') militaryDays += days;
    });

    return {
      workDays: uniqueDatesWithHours.size,
      vacationDays,
      sickDays,
      unauthorizedDays,
      militaryDays,
    };
  }, [monthData, monthStartStr, monthEndStr]);

  // ─── absence types appearing this month (for legend) ─────────────────
  const absenceTypesInMonth = useMemo(() => {
    const set = new Set<AbsenceType>();
    monthData.absences.forEach(a => set.add(a.type));
    return Array.from(set);
  }, [monthData]);

  // ─── grid cells (6 weeks × 7 days = 42 cells) ────────────────────────
  const gridCells = useMemo(() => {
    const firstWeekday = getFirstWeekday(currentYear, currentMonth);
    const daysInMonth = getDaysInMonth(currentYear, currentMonth);
    const prevMonthDays = getDaysInMonth(
      currentMonth === 0 ? currentYear - 1 : currentYear,
      currentMonth === 0 ? 11 : currentMonth - 1,
    );

    const cells: Array<{
      day: number;
      month: number;
      year: number;
      inMonth: boolean;
      dateStr: string;
      weekday: number;
    }> = [];

    // Previous month tail
    for (let i = firstWeekday - 1; i >= 0; i--) {
      const d = prevMonthDays - i;
      const m = currentMonth === 0 ? 11 : currentMonth - 1;
      const y = currentMonth === 0 ? currentYear - 1 : currentYear;
      cells.push({
        day: d,
        month: m,
        year: y,
        inMonth: false,
        dateStr: formatDateStr(y, m, d),
        weekday: new Date(y, m, d).getDay(),
      });
    }

    // Current month
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({
        day: d,
        month: currentMonth,
        year: currentYear,
        inMonth: true,
        dateStr: formatDateStr(currentYear, currentMonth, d),
        weekday: new Date(currentYear, currentMonth, d).getDay(),
      });
    }

    // Next month head
    while (cells.length < 42) {
      const idx = cells.length - (firstWeekday + daysInMonth) + 1;
      const m = currentMonth === 11 ? 0 : currentMonth + 1;
      const y = currentMonth === 11 ? currentYear + 1 : currentYear;
      cells.push({
        day: idx,
        month: m,
        year: y,
        inMonth: false,
        dateStr: formatDateStr(y, m, idx),
        weekday: new Date(y, m, idx).getDay(),
      });
    }

    return cells;
  }, [currentMonth, currentYear]);

  // ─── handlers ─────────────────────────────────────────────────────────
  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(currentYear - 1);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  };

  const handleCellClick = (dateStr: string) => {
    if (onDayClick) {
      onDayClick(
        dateStr,
        selectedEmployeeId !== 'all' ? selectedEmployeeId : undefined,
      );
    }
  };

  // ═════════════════════════════════════════════════════════════════════
  // RENDER
  // ═════════════════════════════════════════════════════════════════════

  return (
    <div
      dir="rtl"
      style={{
        background: COLORS.panel,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 8,
        padding: 16,
        color: COLORS.text,
        fontFamily: 'Segoe UI, Arial, sans-serif',
      }}
    >
      {/* ─── TOP FILTER ROW ─── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        {/* Employee dropdown */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontSize: 13, color: COLORS.textMuted }}>עובד:</label>
          <select
            value={selectedEmployeeId}
            onChange={e => setSelectedEmployeeId(e.target.value)}
            style={{
              background: COLORS.input,
              color: COLORS.text,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 6,
              padding: '6px 10px',
              fontSize: 13,
              minWidth: 160,
            }}
          >
            <option value="all">כל העובדים</option>
            {employees.map(emp => (
              <option key={emp.id} value={emp.id}>
                {emp.name}
              </option>
            ))}
          </select>
        </div>

        {/* Month nav */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={handlePrevMonth}
            style={{
              background: COLORS.input,
              color: COLORS.text,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 6,
              padding: '6px 12px',
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            ►
          </button>
          <div
            style={{
              fontSize: 16,
              fontWeight: 600,
              color: COLORS.text,
              minWidth: 140,
              textAlign: 'center',
            }}
          >
            {HEBREW_MONTHS[currentMonth]} {currentYear}
          </div>
          <button
            onClick={handleNextMonth}
            style={{
              background: COLORS.input,
              color: COLORS.text,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 6,
              padding: '6px 12px',
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            ◄
          </button>
        </div>
      </div>

      {/* ─── SUMMARY STATS ─── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: 8,
          marginBottom: 12,
        }}
      >
        <StatBox
          label="ימי עבודה רשומים"
          value={stats.workDays}
          color={COLORS.green}
        />
        <StatBox
          label="חופשים"
          value={stats.vacationDays}
          color={COLORS.green}
        />
        <StatBox label="מחלה" value={stats.sickDays} color={COLORS.red} />
        <StatBox
          label="חיסורים"
          value={stats.unauthorizedDays}
          color={COLORS.yellow}
        />
        <StatBox
          label="מילואים"
          value={stats.militaryDays}
          color={COLORS.purple}
        />
      </div>

      {/* ─── WEEKDAY HEADERS ─── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: 4,
          marginBottom: 4,
        }}
      >
        {HEBREW_WEEKDAYS.map((wd, idx) => (
          <div
            key={wd}
            style={{
              textAlign: 'center',
              fontSize: 12,
              fontWeight: 600,
              color: idx === 6 || idx === 5 ? COLORS.textDim : COLORS.textMuted,
              padding: '6px 0',
            }}
          >
            {wd}
          </div>
        ))}
      </div>

      {/* ─── CALENDAR GRID ─── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: 4,
        }}
      >
        {gridCells.map((cell, idx) => {
          const dayData = dayIndex[cell.dateStr];
          const hasHours = dayData?.hours.length > 0;
          const hasAbsences = dayData?.absences.length > 0;
          const isWeekend = cell.weekday === 5 || cell.weekday === 6;
          const today = isToday(cell.year, cell.month, cell.day);
          const totalHoursDay = dayData
            ? dayData.hours.reduce((s, h) => s + h.totalHours, 0)
            : 0;

          // background
          let bg = COLORS.input;
          if (!cell.inMonth) bg = COLORS.bg;
          else if (hasHours || hasAbsences) bg = '#3A4049';
          if (isWeekend && cell.inMonth) bg = '#33363D';

          return (
            <div
              key={`${cell.dateStr}-${idx}`}
              onClick={() => handleCellClick(cell.dateStr)}
              style={{
                background: bg,
                border: today
                  ? `2px solid ${COLORS.accent}`
                  : `1px solid ${COLORS.border}`,
                borderRadius: 6,
                height: cellHeight,
                padding: 4,
                cursor: 'pointer',
                opacity: cell.inMonth ? 1 : 0.35,
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                transition: 'background 0.15s ease',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLDivElement).style.background = '#454C57';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLDivElement).style.background = bg;
              }}
            >
              {/* Day number (top-right for RTL) */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                }}
              >
                <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                  {hasHours && (
                    <div
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: COLORS.green,
                      }}
                      title={`${totalHoursDay.toFixed(1)} שעות`}
                    />
                  )}
                </div>
                <div
                  style={{
                    fontSize: compact ? 11 : 13,
                    fontWeight: today ? 700 : 500,
                    color: today
                      ? COLORS.accent
                      : cell.inMonth
                        ? COLORS.text
                        : COLORS.textDim,
                  }}
                >
                  {cell.day}
                </div>
              </div>

              {/* Hours badge */}
              {hasHours && !compact && totalHoursDay > 0 && (
                <div
                  style={{
                    fontSize: 9,
                    color: COLORS.green,
                    fontWeight: 600,
                    textAlign: 'right',
                    lineHeight: 1,
                  }}
                >
                  h:{totalHoursDay.toFixed(1)}
                </div>
              )}

              {/* Absence dots / stripes */}
              {hasAbsences && (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2,
                    marginTop: 'auto',
                  }}
                >
                  {selectedEmployeeId === 'all' &&
                  dayData.absences.length > 1 ? (
                    // Multi-employee: show stacked dots (up to 3)
                    <div
                      style={{
                        display: 'flex',
                        gap: 2,
                        justifyContent: 'flex-end',
                      }}
                    >
                      {dayData.absences.slice(0, 3).map((a, i) => (
                        <div
                          key={`${a.id}-${i}`}
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: '50%',
                            background: ABSENCE_COLORS[a.type],
                          }}
                          title={`${a.employeeName}: ${ABSENCE_LABELS[a.type]}`}
                        />
                      ))}
                      {dayData.absences.length > 3 && (
                        <div
                          style={{
                            fontSize: 8,
                            color: COLORS.textMuted,
                            lineHeight: '6px',
                          }}
                        >
                          +{dayData.absences.length - 3}
                        </div>
                      )}
                    </div>
                  ) : (
                    // Single absence: colored stripe
                    <div
                      style={{
                        width: '100%',
                        height: 6,
                        borderRadius: 3,
                        background: ABSENCE_COLORS[dayData.absences[0].type],
                      }}
                      title={ABSENCE_LABELS[dayData.absences[0].type]}
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ─── LEGEND ─── */}
      <div
        style={{
          marginTop: 14,
          paddingTop: 12,
          borderTop: `1px solid ${COLORS.border}`,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          alignItems: 'center',
          fontSize: 11,
          color: COLORS.textMuted,
        }}
      >
        <LegendItem
          color={COLORS.green}
          label="✓ שעות נרשמו"
          shape="dot"
        />
        {absenceTypesInMonth.map(type => (
          <LegendItem
            key={type}
            color={ABSENCE_COLORS[type]}
            label={ABSENCE_LABELS[type]}
            shape="chip"
          />
        ))}
        <LegendItem color="#33363D" label='🏠 סופ"ש' shape="chip" />
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

interface StatBoxProps {
  label: string;
  value: number;
  color: string;
}

const StatBox: React.FC<StatBoxProps> = ({ label, value, color }) => (
  <div
    style={{
      background: COLORS.input,
      border: `1px solid ${COLORS.border}`,
      borderRadius: 6,
      padding: '8px 10px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-end',
    }}
  >
    <div style={{ fontSize: 10, color: COLORS.textMuted, marginBottom: 2 }}>
      {label}
    </div>
    <div style={{ fontSize: 18, fontWeight: 700, color }}>{value}</div>
  </div>
);

interface LegendItemProps {
  color: string;
  label: string;
  shape: 'dot' | 'chip';
}

const LegendItem: React.FC<LegendItemProps> = ({ color, label, shape }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
    <div
      style={{
        width: shape === 'dot' ? 8 : 14,
        height: shape === 'dot' ? 8 : 8,
        borderRadius: shape === 'dot' ? '50%' : 3,
        background: color,
      }}
    />
    <span>{label}</span>
  </div>
);

export default AttendanceCalendar;
