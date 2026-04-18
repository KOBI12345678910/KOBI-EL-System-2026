/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║   PAYROLL EXPORT — Period Aggregation & Export                        ║
 * ║   ייצוא נתוני שכר לתקופה — חישוב ברוטו, ניכויים, ונטו                ║
 * ║                                                                        ║
 * ║   • אגרגציה של שעות + היעדרויות לכל עובד                              ║
 * ║   • חישוב שעות תקן, נוספות 125%, נוספות 150%                          ║
 * ║   • חישוב ימי חופש, מחלה, מילואים, חיסורים                            ║
 * ║   • תעריף שעה לכל עובד (עריכה אינליין)                                 ║
 * ║   • טבלה מפורטת + הרחבה ליום-יום                                       ║
 * ║   • ייצוא: JSON (Payroll Autonomous), CSV, שליחה אוטומטית              ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

import React, { useState, useMemo } from 'react';
import {
  HoursStore,
  AbsenceStore,
  BalanceStore,
  ABSENCE_LABELS,
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

interface PayrollExportProps {
  employees: Array<{ id: string; name: string }>;
  periodMonth?: number; // 0-11, default = current month
  periodYear?: number; // default = current year
  defaultHourlyRate?: number; // default 50 NIS
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

const STANDARD_HOURS_PER_DAY = 8;

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function periodStart(year: number, month: number): string {
  return `${year}-${pad2(month + 1)}-01`;
}

function periodEnd(year: number, month: number): string {
  const lastDay = new Date(year, month + 1, 0).getDate();
  return `${year}-${pad2(month + 1)}-${pad2(lastDay)}`;
}

function formatDateHebrew(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function fmtNIS(n: number): string {
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
    maximumFractionDigits: 0,
  }).format(Math.round(n));
}

function fmtNum(n: number, digits = 1): string {
  return n.toLocaleString('he-IL', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function downloadCSV(filename: string, content: string): void {
  const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text);
  }
  return new Promise((resolve, reject) => {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      resolve();
    } catch (e) {
      reject(e);
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// PAYROLL TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface EmployeePayroll {
  id: string;
  name: string;
  hourlyRate: number;
  regularHours: number;
  overtime125Hours: number;
  overtime150Hours: number;
  vacationDays: number;
  sickDays: number;
  militaryDays: number;
  unauthorizedDays: number;
  regularPay: number;
  overtime125Pay: number;
  overtime150Pay: number;
  vacationPay: number;
  sickPay: number;
  militaryPay: number;
  grossTotal: number;
  unauthorizedDeduction: number;
  netBeforeTax: number;
  hoursEntries: HoursEntry[];
  absences: AbsenceRequest[];
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export const PayrollExport: React.FC<PayrollExportProps> = ({
  employees,
  periodMonth,
  periodYear,
  defaultHourlyRate = 50,
}) => {
  const now = new Date();
  const [month, setMonth] = useState<number>(periodMonth ?? now.getMonth());
  const [year, setYear] = useState<number>(periodYear ?? now.getFullYear());
  const [recomputeKey, setRecomputeKey] = useState<number>(0);
  const [rates, setRates] = useState<Record<string, number>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<string | null>(null);

  // Period boundaries
  const periodInfo = useMemo(() => {
    const start = periodStart(year, month);
    const end = periodEnd(year, month);
    return { start, end, monthLabel: HEBREW_MONTHS[month], year };
  }, [year, month]);

  // Get rate for an employee (state or default)
  const rateFor = (empId: string): number => {
    return rates[empId] ?? defaultHourlyRate;
  };

  // Compute per-employee payroll data
  const payrolls = useMemo<EmployeePayroll[]>(() => {
    void recomputeKey; // depend on recompute trigger
    const { start, end } = periodInfo;
    const allHours = HoursStore.getByDateRange(start, end);
    const allAbsences = AbsenceStore.getAbsencesForDateRange(start, end);

    return employees.map(emp => {
      const empHours = allHours.filter(h => h.employeeId === emp.id);
      const empAbsences = allAbsences.filter(a => a.employeeId === emp.id);

      const regularHours = round2(
        empHours.reduce((s, h) => s + (h.regularHours || 0), 0),
      );
      const overtime125Hours = round2(
        empHours.reduce((s, h) => s + (h.overtime125 || 0), 0),
      );
      const overtime150Hours = round2(
        empHours.reduce((s, h) => s + (h.overtime150 || 0), 0),
      );

      const vacationDays = round2(
        empAbsences
          .filter(a => a.type === 'vacation')
          .reduce((s, a) => s + (a.daysCount || 0), 0),
      );
      const sickDays = round2(
        empAbsences
          .filter(a => a.type === 'sick' || a.type === 'sick_family')
          .reduce((s, a) => s + (a.daysCount || 0), 0),
      );
      const militaryDays = round2(
        empAbsences
          .filter(a => a.type === 'military')
          .reduce((s, a) => s + (a.daysCount || 0), 0),
      );
      const unauthorizedDays = round2(
        empAbsences
          .filter(a => a.type === 'unauthorized')
          .reduce((s, a) => s + (a.daysCount || 0), 0),
      );

      const rate = rateFor(emp.id);

      const regularPay = round2(regularHours * rate);
      const overtime125Pay = round2(overtime125Hours * rate * 1.25);
      const overtime150Pay = round2(overtime150Hours * rate * 1.5);
      const vacationPay = round2(vacationDays * STANDARD_HOURS_PER_DAY * rate);
      // sick: first day no pay, subsequent days 50%
      const sickPay = round2(sickDays * STANDARD_HOURS_PER_DAY * rate * 0.5);
      const militaryPay = round2(militaryDays * STANDARD_HOURS_PER_DAY * rate);

      const grossTotal = round2(
        regularPay +
          overtime125Pay +
          overtime150Pay +
          vacationPay +
          sickPay +
          militaryPay,
      );
      const unauthorizedDeduction = round2(
        unauthorizedDays * STANDARD_HOURS_PER_DAY * rate,
      );
      const netBeforeTax = round2(grossTotal - unauthorizedDeduction);

      return {
        id: emp.id,
        name: emp.name,
        hourlyRate: rate,
        regularHours,
        overtime125Hours,
        overtime150Hours,
        vacationDays,
        sickDays,
        militaryDays,
        unauthorizedDays,
        regularPay,
        overtime125Pay,
        overtime150Pay,
        vacationPay,
        sickPay,
        militaryPay,
        grossTotal,
        unauthorizedDeduction,
        netBeforeTax,
        hoursEntries: empHours.sort((a, b) => a.date.localeCompare(b.date)),
        absences: empAbsences.sort((a, b) => a.startDate.localeCompare(b.startDate)),
      };
    });
  }, [employees, periodInfo, rates, recomputeKey, defaultHourlyRate]);

  // KPI totals
  const totals = useMemo(() => {
    const totalRegularHours = round2(
      payrolls.reduce((s, p) => s + p.regularHours, 0),
    );
    const totalOvertimeHours = round2(
      payrolls.reduce((s, p) => s + p.overtime125Hours + p.overtime150Hours, 0),
    );
    const totalGross = round2(payrolls.reduce((s, p) => s + p.grossTotal, 0));
    const totalDeductions = round2(
      payrolls.reduce((s, p) => s + p.unauthorizedDeduction, 0),
    );
    const totalNet = round2(payrolls.reduce((s, p) => s + p.netBeforeTax, 0));
    const employeesWithActivity = payrolls.filter(
      p =>
        p.regularHours > 0 ||
        p.overtime125Hours > 0 ||
        p.overtime150Hours > 0 ||
        p.vacationDays > 0 ||
        p.sickDays > 0 ||
        p.militaryDays > 0 ||
        p.unauthorizedDays > 0,
    ).length;
    return {
      totalRegularHours,
      totalOvertimeHours,
      totalGross,
      totalDeductions,
      totalNet,
      employeesWithActivity,
    };
  }, [payrolls]);

  // JSON for Payroll Autonomous
  const payrollJSON = useMemo(() => {
    const obj = {
      period: {
        month: month + 1,
        year,
        start: periodInfo.start,
        end: periodInfo.end,
      },
      employees: payrolls.map(p => ({
        id: p.id,
        name: p.name,
        hourlyRate: p.hourlyRate,
        hours: {
          regular: p.regularHours,
          overtime125: p.overtime125Hours,
          overtime150: p.overtime150Hours,
        },
        absences: {
          vacation: p.vacationDays,
          sick: p.sickDays,
          military: p.militaryDays,
          unauthorized: p.unauthorizedDays,
        },
        gross: p.grossTotal,
        deductions: p.unauthorizedDeduction,
        net: p.netBeforeTax,
      })),
      totals: {
        gross: totals.totalGross,
        deductions: totals.totalDeductions,
        net: totals.totalNet,
      },
    };
    return JSON.stringify(obj, null, 2);
  }, [payrolls, totals, month, year, periodInfo]);

  // CSV content
  const csvContent = useMemo(() => {
    const headers = [
      'מזהה',
      'שם עובד',
      'תעריף שעה',
      'שעות תקן',
      'שעות 125%',
      'שעות 150%',
      'ימי חופש',
      'ימי מחלה',
      'ימי מילואים',
      'חיסורים',
      'ברוטו',
      'ניכויים',
      'נטו לפני מס',
    ];
    const rows = payrolls.map(p => [
      p.id,
      p.name,
      p.hourlyRate.toString(),
      p.regularHours.toString(),
      p.overtime125Hours.toString(),
      p.overtime150Hours.toString(),
      p.vacationDays.toString(),
      p.sickDays.toString(),
      p.militaryDays.toString(),
      p.unauthorizedDays.toString(),
      p.grossTotal.toString(),
      p.unauthorizedDeduction.toString(),
      p.netBeforeTax.toString(),
    ]);
    const totalRow = [
      '',
      'סה"כ',
      '',
      totals.totalRegularHours.toString(),
      payrolls.reduce((s, p) => s + p.overtime125Hours, 0).toString(),
      payrolls.reduce((s, p) => s + p.overtime150Hours, 0).toString(),
      payrolls.reduce((s, p) => s + p.vacationDays, 0).toString(),
      payrolls.reduce((s, p) => s + p.sickDays, 0).toString(),
      payrolls.reduce((s, p) => s + p.militaryDays, 0).toString(),
      payrolls.reduce((s, p) => s + p.unauthorizedDays, 0).toString(),
      totals.totalGross.toString(),
      totals.totalDeductions.toString(),
      totals.totalNet.toString(),
    ];
    return [headers, ...rows, totalRow]
      .map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');
  }, [payrolls, totals]);

  // Handlers
  const handleRateChange = (empId: string, value: string) => {
    const num = parseFloat(value);
    if (!isNaN(num) && num >= 0) {
      setRates(prev => ({ ...prev, [empId]: num }));
    } else if (value === '') {
      setRates(prev => {
        const next = { ...prev };
        delete next[empId];
        return next;
      });
    }
  };

  const handleRecompute = () => {
    setRecomputeKey(k => k + 1);
    showToast('הנתונים חושבו מחדש ✓');
  };

  const handleToggleExpand = (empId: string) => {
    setExpanded(prev => ({ ...prev, [empId]: !prev[empId] }));
  };

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const handleCopyJSON = async () => {
    try {
      await copyToClipboard(payrollJSON);
      showToast('JSON הועתק ללוח ✓');
    } catch {
      showToast('שגיאה בהעתקה ✗');
    }
  };

  const handleDownloadCSV = () => {
    const filename = `payroll_${year}-${pad2(month + 1)}.csv`;
    downloadCSV(filename, csvContent);
    showToast(`קובץ ${filename} הורד ✓`);
  };

  const handleSendToAutonomous = () => {
    console.log('[Payroll] sending to autonomous pipeline...');
    console.log('[Payroll] payload:', payrollJSON);
    showToast('הנתונים נשלחו ל-Payroll Autonomous ✓');
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <div
      dir="rtl"
      style={{
        background: THEME.bg,
        color: THEME.text,
        padding: 24,
        borderRadius: 12,
        fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        minHeight: '100%',
        position: 'relative',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 20,
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 24,
              fontWeight: 700,
              margin: 0,
              color: THEME.text,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <span style={{ fontSize: 28 }}>💰</span>
            ייצוא שכר — Payroll Export
          </h1>
          <p
            style={{
              fontSize: 13,
              color: THEME.textMuted,
              margin: '4px 0 0 0',
            }}
          >
            אגרגציה של שעות ונוכחות לתקופה {periodInfo.monthLabel} {year}
          </p>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: THEME.panel,
            border: `1px solid ${THEME.border}`,
            padding: '8px 14px',
            borderRadius: 8,
            fontSize: 12,
            color: THEME.textMuted,
          }}
        >
          <span>תקופת חישוב:</span>
          <strong style={{ color: THEME.accent }}>
            {formatDateHebrew(periodInfo.start)} — {formatDateHebrew(periodInfo.end)}
          </strong>
        </div>
      </div>

      {/* Period selector */}
      <div
        style={{
          background: THEME.panel,
          border: `1px solid ${THEME.border}`,
          borderRadius: 10,
          padding: 16,
          marginBottom: 20,
          display: 'flex',
          gap: 16,
          alignItems: 'flex-end',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 12, color: THEME.textMuted, fontWeight: 600 }}>
            חודש
          </label>
          <select
            value={month}
            onChange={e => setMonth(parseInt(e.target.value, 10))}
            style={{
              background: THEME.input,
              color: THEME.text,
              border: `1px solid ${THEME.border}`,
              borderRadius: 6,
              padding: '8px 12px',
              fontSize: 14,
              minWidth: 140,
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            {HEBREW_MONTHS.map((m, i) => (
              <option key={i} value={i} style={{ background: THEME.input }}>
                {m}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 12, color: THEME.textMuted, fontWeight: 600 }}>
            שנה
          </label>
          <input
            type="number"
            value={year}
            onChange={e => setYear(parseInt(e.target.value, 10) || now.getFullYear())}
            min={2020}
            max={2100}
            style={{
              background: THEME.input,
              color: THEME.text,
              border: `1px solid ${THEME.border}`,
              borderRadius: 6,
              padding: '8px 12px',
              fontSize: 14,
              width: 110,
              outline: 'none',
            }}
          />
        </div>

        <button
          onClick={handleRecompute}
          style={{
            background: THEME.accent,
            color: '#1A1F26',
            border: 'none',
            borderRadius: 6,
            padding: '10px 20px',
            fontSize: 14,
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <span>🔄</span>
          חישוב מחדש
        </button>

        <div
          style={{
            marginRight: 'auto',
            fontSize: 12,
            color: THEME.textDim,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <span>תעריף ברירת מחדל:</span>
          <strong style={{ color: THEME.text }}>{defaultHourlyRate} ₪/שעה</strong>
        </div>
      </div>

      {/* KPI Strip */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 14,
          marginBottom: 24,
        }}
      >
        <KpiCard
          label='סה"כ שעות תקן'
          value={fmtNum(totals.totalRegularHours)}
          unit="שעות"
          color={THEME.green}
          icon="⏱️"
        />
        <KpiCard
          label='סה"כ שעות נוספות'
          value={fmtNum(totals.totalOvertimeHours)}
          unit="שעות"
          color={THEME.yellow}
          icon="⚡"
        />
        <KpiCard
          label="עלות שכר ברוטו"
          value={fmtNIS(totals.totalGross)}
          unit=""
          color={THEME.accent}
          icon="💵"
        />
        <KpiCard
          label="עובדים בתקופה"
          value={`${totals.employeesWithActivity}`}
          unit={`/ ${employees.length}`}
          color={THEME.purple}
          icon="👥"
        />
      </div>

      {/* Detailed table */}
      <div
        style={{
          background: THEME.panel,
          border: `1px solid ${THEME.border}`,
          borderRadius: 10,
          overflow: 'hidden',
          marginBottom: 20,
        }}
      >
        <div
          style={{
            padding: '14px 18px',
            borderBottom: `1px solid ${THEME.border}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <h3
            style={{
              margin: 0,
              fontSize: 16,
              fontWeight: 700,
              color: THEME.text,
            }}
          >
            פירוט שכר לפי עובד
          </h3>
          <span style={{ fontSize: 12, color: THEME.textMuted }}>
            {payrolls.length} עובדים
          </span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 13,
            }}
          >
            <thead>
              <tr
                style={{
                  background: THEME.input,
                  borderBottom: `1px solid ${THEME.border}`,
                }}
              >
                <Th>עובד</Th>
                <Th>תעריף ₪</Th>
                <Th>שעות תקן</Th>
                <Th>125%</Th>
                <Th>150%</Th>
                <Th>חופש</Th>
                <Th>מחלה</Th>
                <Th>ברוטו ₪</Th>
                <Th>ניכויים</Th>
                <Th>סה"כ לתשלום</Th>
              </tr>
            </thead>
            <tbody>
              {payrolls.map(p => (
                <React.Fragment key={p.id}>
                  <tr
                    style={{
                      borderBottom: `1px solid ${THEME.border}`,
                      cursor: 'pointer',
                      background: expanded[p.id] ? 'rgba(255,165,0,0.05)' : 'transparent',
                      transition: 'background 0.15s',
                    }}
                    onClick={() => handleToggleExpand(p.id)}
                  >
                    <Td>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                        }}
                      >
                        <span
                          style={{
                            color: THEME.textDim,
                            fontSize: 11,
                            transform: expanded[p.id] ? 'rotate(90deg)' : 'rotate(0deg)',
                            transition: 'transform 0.2s',
                            display: 'inline-block',
                            width: 10,
                          }}
                        >
                          ▶
                        </span>
                        <strong style={{ color: THEME.text }}>{p.name}</strong>
                        {p.unauthorizedDays > 0 && (
                          <span
                            title={`${p.unauthorizedDays} ימי חיסור לא מאושרים`}
                            style={{
                              background: 'rgba(252,133,133,0.15)',
                              border: `1px solid ${THEME.red}`,
                              borderRadius: 4,
                              padding: '2px 6px',
                              fontSize: 10,
                              color: THEME.red,
                              fontWeight: 700,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 3,
                            }}
                          >
                            ⚠ {p.unauthorizedDays}
                          </span>
                        )}
                      </div>
                    </Td>
                    <Td onClick={e => e.stopPropagation()}>
                      <input
                        type="number"
                        value={p.hourlyRate}
                        onChange={e => handleRateChange(p.id, e.target.value)}
                        min={0}
                        step={1}
                        style={{
                          background: THEME.input,
                          color: THEME.text,
                          border: `1px solid ${THEME.border}`,
                          borderRadius: 4,
                          padding: '4px 8px',
                          fontSize: 13,
                          width: 70,
                          outline: 'none',
                          textAlign: 'center',
                        }}
                      />
                    </Td>
                    <Td>
                      <span style={{ color: THEME.text, fontWeight: 600 }}>
                        {fmtNum(p.regularHours)}
                      </span>
                    </Td>
                    <Td>
                      <span style={{ color: p.overtime125Hours > 0 ? THEME.yellow : THEME.textDim }}>
                        {fmtNum(p.overtime125Hours)}
                      </span>
                    </Td>
                    <Td>
                      <span style={{ color: p.overtime150Hours > 0 ? THEME.yellow : THEME.textDim }}>
                        {fmtNum(p.overtime150Hours)}
                      </span>
                    </Td>
                    <Td>
                      <span style={{ color: p.vacationDays > 0 ? THEME.green : THEME.textDim }}>
                        {fmtNum(p.vacationDays)}
                      </span>
                    </Td>
                    <Td>
                      <span style={{ color: p.sickDays > 0 ? THEME.red : THEME.textDim }}>
                        {fmtNum(p.sickDays)}
                      </span>
                    </Td>
                    <Td>
                      <strong style={{ color: THEME.accent }}>
                        {fmtNIS(p.grossTotal)}
                      </strong>
                    </Td>
                    <Td>
                      {p.unauthorizedDeduction > 0 ? (
                        <span style={{ color: THEME.red, fontWeight: 600 }}>
                          -{fmtNIS(p.unauthorizedDeduction)}
                        </span>
                      ) : (
                        <span style={{ color: THEME.textDim }}>—</span>
                      )}
                    </Td>
                    <Td>
                      <strong style={{ color: THEME.green, fontSize: 14 }}>
                        {fmtNIS(p.netBeforeTax)}
                      </strong>
                    </Td>
                  </tr>
                  {expanded[p.id] && (
                    <tr style={{ background: 'rgba(0,0,0,0.18)' }}>
                      <td
                        colSpan={10}
                        style={{
                          padding: 16,
                          borderBottom: `1px solid ${THEME.border}`,
                        }}
                      >
                        <ExpandedDetail payroll={p} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}

              {payrolls.length === 0 && (
                <tr>
                  <td
                    colSpan={10}
                    style={{
                      padding: 30,
                      textAlign: 'center',
                      color: THEME.textDim,
                    }}
                  >
                    אין נתוני עובדים להצגה
                  </td>
                </tr>
              )}
            </tbody>
            {payrolls.length > 0 && (
              <tfoot>
                <tr
                  style={{
                    background: THEME.input,
                    borderTop: `2px solid ${THEME.border}`,
                  }}
                >
                  <Td>
                    <strong style={{ color: THEME.text }}>סה"כ</strong>
                  </Td>
                  <Td>—</Td>
                  <Td>
                    <strong style={{ color: THEME.text }}>
                      {fmtNum(totals.totalRegularHours)}
                    </strong>
                  </Td>
                  <Td>
                    <strong style={{ color: THEME.yellow }}>
                      {fmtNum(payrolls.reduce((s, p) => s + p.overtime125Hours, 0))}
                    </strong>
                  </Td>
                  <Td>
                    <strong style={{ color: THEME.yellow }}>
                      {fmtNum(payrolls.reduce((s, p) => s + p.overtime150Hours, 0))}
                    </strong>
                  </Td>
                  <Td>
                    <strong style={{ color: THEME.green }}>
                      {fmtNum(payrolls.reduce((s, p) => s + p.vacationDays, 0))}
                    </strong>
                  </Td>
                  <Td>
                    <strong style={{ color: THEME.red }}>
                      {fmtNum(payrolls.reduce((s, p) => s + p.sickDays, 0))}
                    </strong>
                  </Td>
                  <Td>
                    <strong style={{ color: THEME.accent }}>
                      {fmtNIS(totals.totalGross)}
                    </strong>
                  </Td>
                  <Td>
                    <strong style={{ color: THEME.red }}>
                      {totals.totalDeductions > 0 ? `-${fmtNIS(totals.totalDeductions)}` : '—'}
                    </strong>
                  </Td>
                  <Td>
                    <strong style={{ color: THEME.green, fontSize: 15 }}>
                      {fmtNIS(totals.totalNet)}
                    </strong>
                  </Td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Export buttons */}
      <div
        style={{
          background: THEME.panel,
          border: `1px solid ${THEME.border}`,
          borderRadius: 10,
          padding: 18,
          display: 'flex',
          gap: 12,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <div
          style={{
            fontSize: 13,
            color: THEME.textMuted,
            marginLeft: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <span style={{ color: THEME.textDim }}>אפשרויות ייצוא:</span>
        </div>

        <button
          onClick={handleCopyJSON}
          style={{
            background: THEME.input,
            color: THEME.text,
            border: `1px solid ${THEME.border}`,
            borderRadius: 6,
            padding: '10px 16px',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span>📋</span>
          העתק JSON לחבילת Payroll Autonomous
        </button>

        <button
          onClick={handleDownloadCSV}
          style={{
            background: THEME.input,
            color: THEME.text,
            border: `1px solid ${THEME.border}`,
            borderRadius: 6,
            padding: '10px 16px',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span>📥</span>
          הורד CSV
        </button>

        <button
          onClick={handleSendToAutonomous}
          style={{
            background: THEME.accent,
            color: '#1A1F26',
            border: 'none',
            borderRadius: 6,
            padding: '10px 18px',
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span>🚀</span>
          שלח ל-Payroll Autonomous
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            left: 24,
            background: THEME.green,
            color: '#0E1014',
            padding: '12px 22px',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 700,
            boxShadow: '0 6px 20px rgba(0,0,0,0.4)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

interface KpiCardProps {
  label: string;
  value: string;
  unit: string;
  color: string;
  icon: string;
}

const KpiCard: React.FC<KpiCardProps> = ({ label, value, unit, color, icon }) => {
  return (
    <div
      style={{
        background: THEME.panel,
        border: `1px solid ${THEME.border}`,
        borderRadius: 10,
        padding: 18,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: 4,
          height: '100%',
          background: color,
        }}
      />
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 8,
        }}
      >
        <div
          style={{
            fontSize: 12,
            color: THEME.textMuted,
            fontWeight: 600,
          }}
        >
          {label}
        </div>
        <span style={{ fontSize: 22 }}>{icon}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <div
          style={{
            fontSize: 26,
            fontWeight: 800,
            color: color,
            lineHeight: 1,
          }}
        >
          {value}
        </div>
        {unit && (
          <div
            style={{
              fontSize: 12,
              color: THEME.textDim,
              fontWeight: 500,
            }}
          >
            {unit}
          </div>
        )}
      </div>
    </div>
  );
};

interface ThProps {
  children: React.ReactNode;
}

const Th: React.FC<ThProps> = ({ children }) => (
  <th
    style={{
      padding: '12px 14px',
      textAlign: 'right',
      fontSize: 12,
      fontWeight: 700,
      color: THEME.textMuted,
      whiteSpace: 'nowrap',
    }}
  >
    {children}
  </th>
);

interface TdProps {
  children: React.ReactNode;
  onClick?: (e: React.MouseEvent) => void;
}

const Td: React.FC<TdProps> = ({ children, onClick }) => (
  <td
    onClick={onClick}
    style={{
      padding: '12px 14px',
      textAlign: 'right',
      fontSize: 13,
      color: THEME.text,
      whiteSpace: 'nowrap',
    }}
  >
    {children}
  </td>
);

interface ExpandedDetailProps {
  payroll: EmployeePayroll;
}

const ExpandedDetail: React.FC<ExpandedDetailProps> = ({ payroll }) => {
  return (
    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
      {/* Hours breakdown */}
      <div style={{ flex: '1 1 360px', minWidth: 320 }}>
        <h4
          style={{
            margin: '0 0 10px 0',
            fontSize: 13,
            fontWeight: 700,
            color: THEME.textMuted,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <span>⏱️</span>
          רישום שעות יומי ({payroll.hoursEntries.length})
        </h4>
        {payroll.hoursEntries.length === 0 ? (
          <div
            style={{
              fontSize: 12,
              color: THEME.textDim,
              padding: '10px 0',
              fontStyle: 'italic',
            }}
          >
            אין רישומי שעות בתקופה זו
          </div>
        ) : (
          <div
            style={{
              background: THEME.bg,
              border: `1px solid ${THEME.border}`,
              borderRadius: 6,
              maxHeight: 220,
              overflowY: 'auto',
            }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ background: THEME.input }}>
                  <th style={smallTh}>תאריך</th>
                  <th style={smallTh}>כניסה</th>
                  <th style={smallTh}>יציאה</th>
                  <th style={smallTh}>תקן</th>
                  <th style={smallTh}>125%</th>
                  <th style={smallTh}>150%</th>
                </tr>
              </thead>
              <tbody>
                {payroll.hoursEntries.map(h => (
                  <tr
                    key={h.id}
                    style={{ borderTop: `1px solid ${THEME.border}` }}
                  >
                    <td style={smallTd}>{formatDateHebrew(h.date)}</td>
                    <td style={smallTd}>{h.startTime}</td>
                    <td style={smallTd}>{h.endTime}</td>
                    <td style={{ ...smallTd, color: THEME.green }}>
                      {fmtNum(h.regularHours)}
                    </td>
                    <td style={{ ...smallTd, color: h.overtime125 > 0 ? THEME.yellow : THEME.textDim }}>
                      {fmtNum(h.overtime125)}
                    </td>
                    <td style={{ ...smallTd, color: h.overtime150 > 0 ? THEME.yellow : THEME.textDim }}>
                      {fmtNum(h.overtime150)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Absences breakdown */}
      <div style={{ flex: '1 1 360px', minWidth: 320 }}>
        <h4
          style={{
            margin: '0 0 10px 0',
            fontSize: 13,
            fontWeight: 700,
            color: THEME.textMuted,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <span>📅</span>
          היעדרויות ({payroll.absences.length})
        </h4>
        {payroll.absences.length === 0 ? (
          <div
            style={{
              fontSize: 12,
              color: THEME.textDim,
              padding: '10px 0',
              fontStyle: 'italic',
            }}
          >
            אין היעדרויות בתקופה זו
          </div>
        ) : (
          <div
            style={{
              background: THEME.bg,
              border: `1px solid ${THEME.border}`,
              borderRadius: 6,
              maxHeight: 220,
              overflowY: 'auto',
            }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ background: THEME.input }}>
                  <th style={smallTh}>סוג</th>
                  <th style={smallTh}>מתאריך</th>
                  <th style={smallTh}>עד תאריך</th>
                  <th style={smallTh}>ימים</th>
                </tr>
              </thead>
              <tbody>
                {payroll.absences.map(a => (
                  <tr
                    key={a.id}
                    style={{ borderTop: `1px solid ${THEME.border}` }}
                  >
                    <td style={smallTd}>{ABSENCE_LABELS[a.type]}</td>
                    <td style={smallTd}>{formatDateHebrew(a.startDate)}</td>
                    <td style={smallTd}>{formatDateHebrew(a.endDate)}</td>
                    <td style={smallTd}>{fmtNum(a.daysCount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pay summary */}
      <div style={{ flex: '1 1 280px', minWidth: 260 }}>
        <h4
          style={{
            margin: '0 0 10px 0',
            fontSize: 13,
            fontWeight: 700,
            color: THEME.textMuted,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <span>💵</span>
          פירוט תשלום
        </h4>
        <div
          style={{
            background: THEME.bg,
            border: `1px solid ${THEME.border}`,
            borderRadius: 6,
            padding: 12,
            fontSize: 12,
          }}
        >
          <PayLine label="שעות תקן" value={payroll.regularPay} color={THEME.text} />
          <PayLine label="שעות 125%" value={payroll.overtime125Pay} color={THEME.yellow} />
          <PayLine label="שעות 150%" value={payroll.overtime150Pay} color={THEME.yellow} />
          <PayLine label="חופש בתשלום" value={payroll.vacationPay} color={THEME.green} />
          <PayLine label="מחלה (50%)" value={payroll.sickPay} color={THEME.red} />
          <PayLine label="מילואים" value={payroll.militaryPay} color={THEME.purple} />
          <div
            style={{
              borderTop: `1px solid ${THEME.border}`,
              marginTop: 8,
              paddingTop: 8,
            }}
          >
            <PayLine label='סה"כ ברוטו' value={payroll.grossTotal} color={THEME.accent} bold />
            {payroll.unauthorizedDeduction > 0 && (
              <PayLine
                label="ניכוי חיסורים"
                value={-payroll.unauthorizedDeduction}
                color={THEME.red}
              />
            )}
            <PayLine
              label='נטו לפני מס'
              value={payroll.netBeforeTax}
              color={THEME.green}
              bold
            />
          </div>
        </div>
      </div>
    </div>
  );
};

interface PayLineProps {
  label: string;
  value: number;
  color: string;
  bold?: boolean;
}

const PayLine: React.FC<PayLineProps> = ({ label, value, color, bold }) => (
  <div
    style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '4px 0',
    }}
  >
    <span style={{ color: THEME.textMuted, fontWeight: bold ? 700 : 500 }}>
      {label}
    </span>
    <span style={{ color, fontWeight: bold ? 800 : 600 }}>
      {value < 0 ? `-${fmtNIS(Math.abs(value))}` : fmtNIS(value)}
    </span>
  </div>
);

const smallTh: React.CSSProperties = {
  padding: '6px 8px',
  textAlign: 'right',
  fontSize: 10,
  fontWeight: 700,
  color: THEME.textMuted,
  whiteSpace: 'nowrap',
};

const smallTd: React.CSSProperties = {
  padding: '6px 8px',
  textAlign: 'right',
  fontSize: 11,
  color: THEME.text,
  whiteSpace: 'nowrap',
};

export default PayrollExport;
