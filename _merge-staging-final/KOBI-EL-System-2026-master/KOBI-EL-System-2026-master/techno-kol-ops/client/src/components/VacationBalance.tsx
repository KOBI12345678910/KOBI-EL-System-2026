/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║   VACATION BALANCE — יתרות חופש / מחלה / חיסורים                        ║
 * ║                                                                          ║
 * ║   • הצגת יתרות חופש ומחלה לעובד או לכל העובדים                          ║
 * ║   • מד התקדמות חזותי עם צבעי אזהרה (ירוק → צהוב → אדום)                 ║
 * ║   • עריכה inline של ימים מנוצלים / זכאים                                ║
 * ║   • צבירה חודשית פר עובד או לכל העובדים                                 ║
 * ║   • העברת יתרות לשנה הבאה                                                ║
 * ║   • ניווט בין שנים (קריאה בלבד עבור שנים קודמות)                       ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

import React, { useState, useMemo } from 'react';
import {
  BalanceStore,
  DEFAULT_ACCRUAL_RULES,
  type EmployeeBalance,
  type AccrualRules,
} from '../engines/hoursAttendanceEngine';

// ═══════════════════════════════════════════════════════════════════════════
// THEME COLORS
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
  purple: '#8B7FFF',
};

// ═══════════════════════════════════════════════════════════════════════════
// PROPS
// ═══════════════════════════════════════════════════════════════════════════

interface VacationBalanceProps {
  employees: Array<{ id: string; name: string }>;
  employeeId?: string;
  year?: number;
  editable?: boolean;
  onBalanceChange?: (balance: EmployeeBalance) => void;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/** קבע צבע פס התקדמות לפי אחוז ניצול */
function progressColor(usage: number): string {
  if (usage < 0.5) return COLORS.green;
  if (usage < 0.8) return COLORS.yellow;
  return COLORS.red;
}

/** עיגול לעשירית */
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// ═══════════════════════════════════════════════════════════════════════════
// PROGRESS BAR COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

interface ProgressBarProps {
  used: number;
  total: number;
  color: string;
}

const ProgressBar: React.FC<ProgressBarProps> = ({ used, total, color }) => {
  const safeTotal = Math.max(total, 0.01);
  const percent = Math.min(100, Math.max(0, (used / safeTotal) * 100));

  return (
    <div
      style={{
        width: '100%',
        height: 10,
        background: COLORS.input,
        borderRadius: 5,
        overflow: 'hidden',
        border: `1px solid ${COLORS.border}`,
        marginTop: 6,
        marginBottom: 6,
      }}
    >
      <div
        style={{
          width: `${percent}%`,
          height: '100%',
          background: color,
          transition: 'width 0.3s ease, background 0.3s ease',
          boxShadow: `0 0 8px ${color}55`,
        }}
      />
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// INLINE EDIT BLOCK
// ═══════════════════════════════════════════════════════════════════════════

interface EditBlockProps {
  initialUsed: number;
  initialEntitled: number;
  onSave: (used: number, entitled: number) => void;
  onCancel: () => void;
}

const EditBlock: React.FC<EditBlockProps> = ({
  initialUsed,
  initialEntitled,
  onSave,
  onCancel,
}) => {
  const [used, setUsed] = useState<string>(String(initialUsed));
  const [entitled, setEntitled] = useState<string>(String(initialEntitled));

  const inputStyle: React.CSSProperties = {
    width: 60,
    background: COLORS.input,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 4,
    color: COLORS.text,
    padding: '4px 8px',
    fontSize: 13,
    textAlign: 'center',
    outline: 'none',
  };

  const btnStyle: React.CSSProperties = {
    padding: '4px 10px',
    fontSize: 12,
    border: 'none',
    borderRadius: 4,
    cursor: 'pointer',
    fontWeight: 600,
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        marginTop: 4,
        flexWrap: 'wrap',
      }}
    >
      <input
        type="number"
        step="0.5"
        value={used}
        onChange={(e) => setUsed(e.target.value)}
        style={inputStyle}
        title="ימים מנוצלים"
      />
      <span style={{ color: COLORS.textMuted, fontSize: 13 }}>/</span>
      <input
        type="number"
        step="0.5"
        value={entitled}
        onChange={(e) => setEntitled(e.target.value)}
        style={inputStyle}
        title="ימים זכאים"
      />
      <button
        onClick={() => onSave(parseFloat(used) || 0, parseFloat(entitled) || 0)}
        style={{
          ...btnStyle,
          background: COLORS.green,
          color: COLORS.bg,
        }}
      >
        שמור
      </button>
      <button
        onClick={onCancel}
        style={{
          ...btnStyle,
          background: COLORS.input,
          color: COLORS.text,
          border: `1px solid ${COLORS.border}`,
        }}
      >
        בטל
      </button>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// EMPLOYEE BALANCE CARD
// ═══════════════════════════════════════════════════════════════════════════

interface BalanceCardProps {
  balance: EmployeeBalance;
  rules: AccrualRules;
  editable: boolean;
  wide: boolean;
  isPastYear: boolean;
  onBalanceChange?: (balance: EmployeeBalance) => void;
  onRefresh: () => void;
}

const BalanceCard: React.FC<BalanceCardProps> = ({
  balance,
  rules,
  editable,
  wide,
  isPastYear,
  onBalanceChange,
  onRefresh,
}) => {
  const [editingVacation, setEditingVacation] = useState(false);
  const [editingSick, setEditingSick] = useState(false);

  const vacationTotal = balance.vacationEntitled + balance.vacationCarryForward;
  const sickTotal = balance.sickEntitled + balance.sickAccumulated;
  const vacationUsage = vacationTotal > 0 ? balance.vacationUsed / vacationTotal : 0;
  const sickUsage = sickTotal > 0 ? balance.sickUsed / sickTotal : 0;

  const vacationColor = progressColor(vacationUsage);
  const sickColor = progressColor(sickUsage);

  const canEdit = editable && !isPastYear;

  function saveBalance(updated: EmployeeBalance): void {
    BalanceStore.save(updated);
    onBalanceChange?.(updated);
    onRefresh();
  }

  function handleVacationSave(used: number, entitled: number): void {
    const updated: EmployeeBalance = {
      ...balance,
      vacationUsed: used,
      vacationEntitled: entitled,
      vacationRemaining: entitled + balance.vacationCarryForward - used,
      lastUpdated: new Date().toISOString(),
    };
    saveBalance(updated);
    setEditingVacation(false);
  }

  function handleSickSave(used: number, entitled: number): void {
    const updated: EmployeeBalance = {
      ...balance,
      sickUsed: used,
      sickEntitled: entitled,
      sickRemaining: entitled + balance.sickAccumulated - used,
      lastUpdated: new Date().toISOString(),
    };
    saveBalance(updated);
    setEditingSick(false);
  }

  function handleAccrue(): void {
    BalanceStore.accrueMonthly(balance.employeeId, balance.employeeName);
    const refreshed = BalanceStore.getForEmployee(balance.employeeId, balance.year);
    if (refreshed) onBalanceChange?.(refreshed);
    onRefresh();
  }

  const sectionLabelStyle: React.CSSProperties = {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: 600,
    marginTop: 14,
    marginBottom: 4,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  };

  const numbersStyle: React.CSSProperties = {
    color: COLORS.textMuted,
    fontSize: 13,
    fontWeight: 500,
    cursor: canEdit ? 'pointer' : 'default',
    padding: '2px 6px',
    borderRadius: 3,
    background: canEdit ? 'rgba(255,165,0,0.08)' : 'transparent',
    border: canEdit ? `1px dashed ${COLORS.accent}55` : '1px dashed transparent',
    display: 'inline-block',
  };

  const remainingStyle: React.CSSProperties = {
    color: COLORS.text,
    fontSize: 13,
    marginTop: 2,
  };

  const subInfoStyle: React.CSSProperties = {
    color: COLORS.textDim,
    fontSize: 11,
    marginTop: 2,
    fontStyle: 'italic',
  };

  return (
    <div
      style={{
        background: COLORS.panel,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 8,
        padding: 16,
        boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
        gridColumn: wide ? '1 / -1' : 'auto',
        opacity: isPastYear ? 0.85 : 1,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingBottom: 10,
          borderBottom: `1px solid ${COLORS.border}`,
        }}
      >
        <div
          style={{
            color: COLORS.text,
            fontSize: 16,
            fontWeight: 700,
          }}
        >
          {balance.employeeName}
        </div>
        <div
          style={{
            color: COLORS.accent,
            fontSize: 14,
            fontWeight: 600,
            background: 'rgba(255,165,0,0.1)',
            padding: '3px 10px',
            borderRadius: 4,
            border: `1px solid ${COLORS.accent}55`,
          }}
        >
          {balance.year}
          {isPastYear && (
            <span style={{ marginInlineStart: 6, color: COLORS.textDim, fontSize: 11 }}>
              (קריאה בלבד)
            </span>
          )}
        </div>
      </div>

      {/* Vacation Section */}
      <div style={sectionLabelStyle}>
        <span style={{ fontSize: 18 }}>🌴</span>
        <span>חופש</span>
      </div>
      <ProgressBar
        used={balance.vacationUsed}
        total={vacationTotal}
        color={vacationColor}
      />
      {!editingVacation && (
        <div>
          <span
            style={numbersStyle}
            onClick={() => canEdit && setEditingVacation(true)}
            title={canEdit ? 'לחץ לעריכה' : ''}
          >
            {round1(balance.vacationUsed)}/{round1(balance.vacationEntitled)} ימים
          </span>
        </div>
      )}
      {editingVacation && canEdit && (
        <EditBlock
          initialUsed={balance.vacationUsed}
          initialEntitled={balance.vacationEntitled}
          onSave={handleVacationSave}
          onCancel={() => setEditingVacation(false)}
        />
      )}
      <div style={remainingStyle}>
        נותרו: <span style={{ fontWeight: 600, color: vacationColor }}>{round1(balance.vacationRemaining)}</span> ימים
      </div>
      {balance.vacationCarryForward > 0 && (
        <div style={subInfoStyle}>
          ─ כולל העברה משנה קודמת: {round1(balance.vacationCarryForward)}
        </div>
      )}

      {/* Sick Section */}
      <div style={sectionLabelStyle}>
        <span style={{ fontSize: 18 }}>🤒</span>
        <span>מחלה</span>
      </div>
      <ProgressBar
        used={balance.sickUsed}
        total={sickTotal}
        color={sickColor}
      />
      {!editingSick && (
        <div>
          <span
            style={numbersStyle}
            onClick={() => canEdit && setEditingSick(true)}
            title={canEdit ? 'לחץ לעריכה' : ''}
          >
            {round1(balance.sickUsed)}/{round1(balance.sickEntitled)} ימים
          </span>
        </div>
      )}
      {editingSick && canEdit && (
        <EditBlock
          initialUsed={balance.sickUsed}
          initialEntitled={balance.sickEntitled}
          onSave={handleSickSave}
          onCancel={() => setEditingSick(false)}
        />
      )}
      <div style={remainingStyle}>
        נותרו: <span style={{ fontWeight: 600, color: sickColor }}>{round1(balance.sickRemaining)}</span> ימים
      </div>
      {balance.sickAccumulated > 0 && (
        <div style={subInfoStyle}>
          ─ צבירה משנים קודמות: {round1(balance.sickAccumulated)}
        </div>
      )}

      {/* Military / Unauthorized strip */}
      <div
        style={{
          marginTop: 14,
          paddingTop: 12,
          borderTop: `1px solid ${COLORS.border}`,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 13,
            color: COLORS.text,
          }}
        >
          <span style={{ fontSize: 16 }}>🎖️</span>
          <span>מילואים:</span>
          <span style={{ color: COLORS.purple, fontWeight: 600 }}>
            {round1(balance.militaryDaysUsed)} ימים
          </span>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 13,
            color: balance.unauthorizedDays > 0 ? COLORS.red : COLORS.textMuted,
          }}
        >
          <span style={{ fontSize: 16 }}>⚠️</span>
          <span>חיסורים לא מוצדקים:</span>
          <span style={{ fontWeight: 600 }}>
            {round1(balance.unauthorizedDays)}{' '}
            {balance.unauthorizedDays === 1 ? 'יום' : 'ימים'}
          </span>
        </div>
      </div>

      {/* Per-card actions */}
      {canEdit && (
        <div
          style={{
            marginTop: 14,
            paddingTop: 12,
            borderTop: `1px solid ${COLORS.border}`,
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          <button
            onClick={handleAccrue}
            style={{
              padding: '6px 12px',
              fontSize: 12,
              background: COLORS.input,
              color: COLORS.accent,
              border: `1px solid ${COLORS.accent}55`,
              borderRadius: 4,
              cursor: 'pointer',
              fontWeight: 600,
            }}
            title="הוסף צבירה חודשית רגילה"
          >
            ＋ צבירה חודשית
          </button>
        </div>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export const VacationBalance: React.FC<VacationBalanceProps> = ({
  employees,
  employeeId,
  year,
  editable = true,
  onBalanceChange,
}) => {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(year ?? currentYear);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = () => setRefreshKey((k) => k + 1);

  const isPastYear = selectedYear < currentYear;
  const rules = useMemo(() => BalanceStore.getAccrualRules(), []);

  // Build the list of (employee, balance) tuples
  const visibleEmployees = useMemo(() => {
    if (employeeId) {
      const emp = employees.find((e) => e.id === employeeId);
      return emp ? [emp] : [];
    }
    return employees;
  }, [employees, employeeId]);

  const balances = useMemo(() => {
    return visibleEmployees.map((emp) => ({
      employee: emp,
      balance: BalanceStore.getOrCreate(emp.id, emp.name, selectedYear),
    }));
    // refreshKey forces re-read from storage
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleEmployees, selectedYear, refreshKey]);

  // Aggregate stats for top bar
  const stats = useMemo(() => {
    const totalVacRemaining = balances.reduce(
      (s, b) => s + b.balance.vacationRemaining,
      0,
    );
    const totalSickRemaining = balances.reduce(
      (s, b) => s + b.balance.sickRemaining,
      0,
    );
    const totalUnauthorized = balances.reduce(
      (s, b) => s + b.balance.unauthorizedDays,
      0,
    );
    const totalMilitary = balances.reduce(
      (s, b) => s + b.balance.militaryDaysUsed,
      0,
    );
    return {
      totalVacRemaining: round1(totalVacRemaining),
      totalSickRemaining: round1(totalSickRemaining),
      totalUnauthorized: round1(totalUnauthorized),
      totalMilitary: round1(totalMilitary),
      employeeCount: balances.length,
    };
  }, [balances]);

  // Top-level: accrue all employees
  function handleAccrueAll(): void {
    if (!editable || isPastYear) return;
    if (!window.confirm(`להוסיף צבירה חודשית ל-${visibleEmployees.length} עובדים?`)) return;
    for (const emp of visibleEmployees) {
      BalanceStore.accrueMonthly(emp.id, emp.name);
      const refreshed = BalanceStore.getForEmployee(emp.id, selectedYear);
      if (refreshed) onBalanceChange?.(refreshed);
    }
    refresh();
  }

  // Top-level: carry forward balances
  function handleCarryForward(): void {
    if (!editable || isPastYear) return;
    const fromYear = selectedYear;
    const toYear = selectedYear + 1;
    if (
      !window.confirm(
        `להעביר יתרות חופש ומחלה מ-${fromYear} ל-${toYear} עבור ${visibleEmployees.length} עובדים?`,
      )
    )
      return;
    for (const emp of visibleEmployees) {
      BalanceStore.carryForward(emp.id, fromYear, toYear);
      const refreshed = BalanceStore.getForEmployee(emp.id, toYear);
      if (refreshed) onBalanceChange?.(refreshed);
    }
    refresh();
    window.alert(`היתרות הועברו בהצלחה לשנת ${toYear}`);
  }

  // Year selector — show last 3 + current + next
  const yearOptions = useMemo(() => {
    const arr: number[] = [];
    for (let y = currentYear - 3; y <= currentYear + 1; y++) arr.push(y);
    return arr;
  }, [currentYear]);

  const isSingleView = !!employeeId;

  return (
    <div
      dir="rtl"
      style={{
        background: COLORS.bg,
        color: COLORS.text,
        padding: 20,
        fontFamily: '"Segoe UI", "Heebo", "Arial", sans-serif',
        minHeight: '100%',
      }}
    >
      {/* Top Toolbar */}
      <div
        style={{
          background: COLORS.panel,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 8,
          padding: 16,
          marginBottom: 16,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        {/* Title + year selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h2
            style={{
              margin: 0,
              fontSize: 18,
              color: COLORS.text,
              fontWeight: 700,
            }}
          >
            🌴 יתרות חופש ומחלה
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <label style={{ color: COLORS.textMuted, fontSize: 13 }}>שנה:</label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
              style={{
                background: COLORS.input,
                color: COLORS.text,
                border: `1px solid ${COLORS.border}`,
                borderRadius: 4,
                padding: '5px 10px',
                fontSize: 13,
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                  {y === currentYear ? ' (נוכחית)' : ''}
                  {y < currentYear ? ' (קריאה בלבד)' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Action buttons */}
        {!isSingleView && editable && !isPastYear && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              onClick={handleAccrueAll}
              style={{
                padding: '8px 14px',
                background: COLORS.accent,
                color: COLORS.bg,
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: 13,
              }}
            >
              ＋ צבירה כללית לכל העובדים
            </button>
            <button
              onClick={handleCarryForward}
              style={{
                padding: '8px 14px',
                background: COLORS.purple,
                color: COLORS.text,
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: 13,
              }}
            >
              ⇒ העבר יתרות לשנה הבאה
            </button>
          </div>
        )}
      </div>

      {/* Aggregate stats */}
      {!isSingleView && balances.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 10,
            marginBottom: 16,
          }}
        >
          <StatTile
            icon="👥"
            label="עובדים"
            value={String(stats.employeeCount)}
            color={COLORS.accent}
          />
          <StatTile
            icon="🌴"
            label='סה"כ יתרת חופש'
            value={`${stats.totalVacRemaining} ימים`}
            color={COLORS.green}
          />
          <StatTile
            icon="🤒"
            label='סה"כ יתרת מחלה'
            value={`${stats.totalSickRemaining} ימים`}
            color={COLORS.yellow}
          />
          <StatTile
            icon="🎖️"
            label="ימי מילואים"
            value={`${stats.totalMilitary} ימים`}
            color={COLORS.purple}
          />
          <StatTile
            icon="⚠️"
            label="חיסורים"
            value={`${stats.totalUnauthorized} ימים`}
            color={stats.totalUnauthorized > 0 ? COLORS.red : COLORS.textMuted}
          />
        </div>
      )}

      {/* Empty state */}
      {balances.length === 0 && (
        <div
          style={{
            background: COLORS.panel,
            border: `1px dashed ${COLORS.border}`,
            borderRadius: 8,
            padding: 40,
            textAlign: 'center',
            color: COLORS.textMuted,
          }}
        >
          אין עובדים להצגה
        </div>
      )}

      {/* Cards grid */}
      {balances.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isSingleView
              ? '1fr'
              : 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: 16,
          }}
        >
          {balances.map(({ employee, balance }) => (
            <BalanceCard
              key={`${employee.id}_${selectedYear}_${refreshKey}`}
              balance={balance}
              rules={rules}
              editable={editable}
              wide={isSingleView}
              isPastYear={isPastYear}
              onBalanceChange={onBalanceChange}
              onRefresh={refresh}
            />
          ))}
        </div>
      )}

      {/* Footer / legend */}
      <div
        style={{
          marginTop: 20,
          padding: 12,
          background: COLORS.panel,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 6,
          fontSize: 11,
          color: COLORS.textDim,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 14,
          alignItems: 'center',
        }}
      >
        <span>מקרא צבעי ניצול:</span>
        <LegendDot color={COLORS.green} label="פחות מ-50%" />
        <LegendDot color={COLORS.yellow} label="50-80%" />
        <LegendDot color={COLORS.red} label="מעל 80%" />
        <span style={{ marginInlineStart: 'auto' }}>
          כללי צבירה: {DEFAULT_ACCRUAL_RULES.vacationDaysPerMonth} ימי חופש /
          חודש · {DEFAULT_ACCRUAL_RULES.sickDaysPerMonth} ימי מחלה / חודש
        </span>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// SMALL HELPERS
// ═══════════════════════════════════════════════════════════════════════════

const StatTile: React.FC<{
  icon: string;
  label: string;
  value: string;
  color: string;
}> = ({ icon, label, value, color }) => (
  <div
    style={{
      background: COLORS.panel,
      border: `1px solid ${COLORS.border}`,
      borderRadius: 6,
      padding: 12,
      display: 'flex',
      alignItems: 'center',
      gap: 10,
    }}
  >
    <div style={{ fontSize: 24 }}>{icon}</div>
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontSize: 11, color: COLORS.textMuted }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color }}>{value}</div>
    </div>
  </div>
);

const LegendDot: React.FC<{ color: string; label: string }> = ({ color, label }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
    <span
      style={{
        width: 10,
        height: 10,
        borderRadius: '50%',
        background: color,
        display: 'inline-block',
      }}
    />
    <span>{label}</span>
  </span>
);

export default VacationBalance;
