/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║   VACATION REQUEST FORM — Reusable Embeddable Form                    ║
 * ║   טופס בקשת חופשה / מחלה / היעדרות                                    ║
 * ║                                                                        ║
 * ║   Standalone, RTL Hebrew, dark-theme inline-styled form that can be    ║
 * ║   dropped into any page. Uses AbsenceStore from hoursAttendanceEngine. ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

import React, { useState, useMemo } from 'react';
import {
  AbsenceStore,
  workingDaysBetween,
  ABSENCE_LABELS,
  ABSENCE_COLORS,
  type AbsenceType,
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
};

// ═══════════════════════════════════════════════════════════════════════════
// PROPS
// ═══════════════════════════════════════════════════════════════════════════

interface VacationRequestFormProps {
  employees: Array<{ id: string; name: string }>;
  defaultEmployeeId?: string;
  onSubmitted?: (req: AbsenceRequest) => void;
  onCancel?: () => void;
  compact?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

const REASON_REQUIRED_TYPES: AbsenceType[] = ['vacation', 'sick', 'personal'];

const ABSENCE_ICONS: Record<AbsenceType, string> = {
  vacation: '🌴',
  sick: '🤒',
  sick_family: '👨‍👩‍👧',
  bereavement: '🕯️',
  military: '🪖',
  maternity: '👶',
  study: '📚',
  personal: '👤',
  unpaid: '💸',
  unauthorized: '⚠️',
};

function formatDateHebrew(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

async function fileToDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export const VacationRequestForm: React.FC<VacationRequestFormProps> = ({
  employees,
  defaultEmployeeId,
  onSubmitted,
  onCancel,
  compact = false,
}) => {
  // ─── STATE ──────────────────────────────────────────────────────────────
  const initialEmpId = defaultEmployeeId ?? employees[0]?.id ?? '';
  const [employeeId, setEmployeeId] = useState<string>(initialEmpId);
  const [type, setType] = useState<AbsenceType>('vacation');
  const [startDate, setStartDate] = useState<string>(todayISO());
  const [endDate, setEndDate] = useState<string>(todayISO());
  const [halfDay, setHalfDay] = useState<boolean>(false);
  const [reason, setReason] = useState<string>('');
  const [documentUrl, setDocumentUrl] = useState<string>('');
  const [documentName, setDocumentName] = useState<string>('');
  const [isImage, setIsImage] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // ─── DERIVED ────────────────────────────────────────────────────────────
  const effectiveEnd = halfDay ? startDate : endDate;
  const reasonRequired = REASON_REQUIRED_TYPES.includes(type);

  const daysCount = useMemo(() => {
    if (halfDay) return 0.5;
    if (!startDate || !effectiveEnd) return 0;
    if (startDate > effectiveEnd) return 0;
    return workingDaysBetween(startDate, effectiveEnd);
  }, [startDate, effectiveEnd, halfDay]);

  const dateRangeLabel = useMemo(() => {
    if (!startDate) return '';
    if (halfDay || startDate === effectiveEnd) {
      return `${formatDateHebrew(startDate)}${halfDay ? ' (חצי יום)' : ''}`;
    }
    return `מ-${formatDateHebrew(startDate)} עד ${formatDateHebrew(effectiveEnd)}`;
  }, [startDate, effectiveEnd, halfDay]);

  const selectedEmployee = useMemo(
    () => employees.find(e => e.id === employeeId),
    [employees, employeeId],
  );

  // ─── HANDLERS ───────────────────────────────────────────────────────────
  const handleHalfDayChange = (checked: boolean) => {
    setHalfDay(checked);
    if (checked) setEndDate(startDate);
  };

  const handleStartDateChange = (val: string) => {
    setStartDate(val);
    if (halfDay) setEndDate(val);
    if (val > endDate) setEndDate(val);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await fileToDataURL(file);
      setDocumentUrl(dataUrl);
      setDocumentName(file.name);
      setIsImage(file.type.startsWith('image/'));
    } catch {
      setError('שגיאה בטעינת הקובץ');
    }
  };

  const resetForm = () => {
    setEmployeeId(initialEmpId);
    setType('vacation');
    setStartDate(todayISO());
    setEndDate(todayISO());
    setHalfDay(false);
    setReason('');
    setDocumentUrl('');
    setDocumentName('');
    setIsImage(false);
    setError('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // ─── VALIDATION ──────────────────────────────────────────────────────
    if (!employeeId) {
      setError('יש לבחור עובד');
      return;
    }
    if (!startDate || !effectiveEnd) {
      setError('יש לבחור תאריכים');
      return;
    }
    if (startDate > effectiveEnd) {
      setError('תאריך התחלה חייב להיות לפני תאריך סיום');
      return;
    }
    if (reasonRequired && !reason.trim()) {
      setError(`נדרשת סיבה עבור ${ABSENCE_LABELS[type]}`);
      return;
    }

    const employee = employees.find(e => e.id === employeeId);
    if (!employee) {
      setError('עובד לא נמצא');
      return;
    }

    // ─── SUBMIT ──────────────────────────────────────────────────────────
    setSubmitting(true);
    try {
      const newRequest = AbsenceStore.submit({
        employeeId,
        employeeName: employee.name,
        type,
        startDate,
        endDate: effectiveEnd,
        halfDay,
        reason: reason.trim(),
        documentUrl: documentUrl || undefined,
      });

      setSuccess(true);
      onSubmitted?.(newRequest);

      setTimeout(() => {
        setSuccess(false);
        resetForm();
      }, 2000);
    } catch (err) {
      setError('שגיאה בשליחת הבקשה');
    } finally {
      setSubmitting(false);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════
  // STYLES
  // ═══════════════════════════════════════════════════════════════════════

  const padding = compact ? 16 : 24;
  const fieldGap = compact ? 12 : 16;
  const fontSize = compact ? 13 : 14;

  const containerStyle: React.CSSProperties = {
    direction: 'rtl',
    background: THEME.panel,
    border: `1px solid ${THEME.border}`,
    borderRadius: 8,
    padding,
    color: THEME.text,
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Arial, sans-serif',
    fontSize,
    maxWidth: compact ? 480 : 720,
  };

  const headerStyle: React.CSSProperties = {
    fontSize: compact ? 16 : 20,
    fontWeight: 700,
    marginBottom: 4,
    color: THEME.text,
  };

  const subHeaderStyle: React.CSSProperties = {
    fontSize: 12,
    color: THEME.textMuted,
    marginBottom: padding,
  };

  const gridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: compact ? '1fr' : '1fr 1fr',
    gap: fieldGap,
    marginBottom: fieldGap,
  };

  const fieldStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 600,
    color: THEME.textMuted,
  };

  const inputStyle: React.CSSProperties = {
    background: THEME.input,
    border: `1px solid ${THEME.border}`,
    borderRadius: 6,
    padding: compact ? '8px 10px' : '10px 12px',
    color: THEME.text,
    fontSize,
    fontFamily: 'inherit',
    outline: 'none',
    direction: 'rtl',
  };

  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    cursor: 'pointer',
    appearance: 'none',
    backgroundImage:
      'url("data:image/svg+xml;charset=US-ASCII,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'8\' viewBox=\'0 0 12 8\'%3E%3Cpath fill=\'%23ABB3BF\' d=\'M6 8L0 0h12z\'/%3E%3C/svg%3E")',
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'left 12px center',
    paddingLeft: 32,
  };

  const textareaStyle: React.CSSProperties = {
    ...inputStyle,
    minHeight: compact ? 60 : 80,
    resize: 'vertical',
    fontFamily: 'inherit',
  };

  const checkboxRowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 0',
  };

  const fullSpan: React.CSSProperties = {
    gridColumn: compact ? 'auto' : '1 / -1',
  };

  const summaryPanelStyle: React.CSSProperties = {
    background: THEME.bg,
    border: `1px solid ${THEME.border}`,
    borderRadius: 6,
    padding: compact ? 12 : 16,
    marginTop: fieldGap,
    marginBottom: fieldGap,
  };

  const summaryRowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '6px 0',
    fontSize: 13,
  };

  const chipStyle = (color: string): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    background: `${color}22`,
    color,
    border: `1px solid ${color}55`,
    borderRadius: 12,
    padding: '4px 10px',
    fontSize: 12,
    fontWeight: 600,
  });

  const buttonRowStyle: React.CSSProperties = {
    display: 'flex',
    gap: 10,
    marginTop: fieldGap,
  };

  const submitButtonStyle: React.CSSProperties = {
    flex: 1,
    background: success ? THEME.green : THEME.accent,
    color: '#1a1a1a',
    border: 'none',
    borderRadius: 6,
    padding: compact ? '10px 16px' : '12px 20px',
    fontSize: compact ? 14 : 15,
    fontWeight: 700,
    cursor: submitting ? 'not-allowed' : 'pointer',
    opacity: submitting ? 0.6 : 1,
    transition: 'background 0.2s, opacity 0.2s',
    fontFamily: 'inherit',
  };

  const cancelButtonStyle: React.CSSProperties = {
    background: THEME.input,
    color: THEME.textMuted,
    border: `1px solid ${THEME.border}`,
    borderRadius: 6,
    padding: compact ? '10px 16px' : '12px 20px',
    fontSize: compact ? 14 : 15,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
  };

  const errorStyle: React.CSSProperties = {
    background: `${THEME.red}22`,
    border: `1px solid ${THEME.red}55`,
    color: THEME.red,
    padding: '8px 12px',
    borderRadius: 6,
    fontSize: 13,
    marginBottom: fieldGap,
  };

  const successStyle: React.CSSProperties = {
    background: `${THEME.green}22`,
    border: `1px solid ${THEME.green}55`,
    color: THEME.green,
    padding: '8px 12px',
    borderRadius: 6,
    fontSize: 13,
    marginBottom: fieldGap,
    textAlign: 'center',
    fontWeight: 600,
  };

  const fileInputWrapperStyle: React.CSSProperties = {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  };

  const fileButtonStyle: React.CSSProperties = {
    background: THEME.input,
    border: `1px dashed ${THEME.border}`,
    borderRadius: 6,
    padding: '10px 14px',
    color: THEME.textMuted,
    fontSize: 13,
    cursor: 'pointer',
    flex: 1,
    textAlign: 'center',
    fontFamily: 'inherit',
  };

  const previewStyle: React.CSSProperties = {
    maxWidth: 80,
    maxHeight: 80,
    borderRadius: 4,
    border: `1px solid ${THEME.border}`,
    objectFit: 'cover',
  };

  // ═══════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════

  return (
    <form onSubmit={handleSubmit} style={containerStyle}>
      <div style={headerStyle}>בקשת היעדרות</div>
      <div style={subHeaderStyle}>הגש בקשה לחופש, מחלה או היעדרות אחרת</div>

      {/* Error / Success Messages */}
      {error && <div style={errorStyle}>⚠ {error}</div>}
      {success && <div style={successStyle}>הבקשה נשלחה לאישור ✓</div>}

      {/* Row 1: Employee + Type */}
      <div style={gridStyle}>
        <div style={fieldStyle}>
          <label style={labelStyle}>עובד *</label>
          <select
            style={selectStyle}
            value={employeeId}
            onChange={e => setEmployeeId(e.target.value)}
            disabled={submitting}
          >
            <option value="">-- בחר עובד --</option>
            {employees.map(emp => (
              <option key={emp.id} value={emp.id}>
                {emp.name}
              </option>
            ))}
          </select>
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>סוג היעדרות *</label>
          <select
            style={selectStyle}
            value={type}
            onChange={e => setType(e.target.value as AbsenceType)}
            disabled={submitting}
          >
            {(Object.keys(ABSENCE_LABELS) as AbsenceType[]).map(key => (
              <option key={key} value={key}>
                {ABSENCE_ICONS[key]}  {ABSENCE_LABELS[key]}
              </option>
            ))}
          </select>
          <div style={{ marginTop: 4 }}>
            <span style={chipStyle(ABSENCE_COLORS[type])}>
              <span>{ABSENCE_ICONS[type]}</span>
              <span>{ABSENCE_LABELS[type]}</span>
            </span>
          </div>
        </div>
      </div>

      {/* Row 2: Start + End Dates */}
      <div style={gridStyle}>
        <div style={fieldStyle}>
          <label style={labelStyle}>תאריך התחלה *</label>
          <input
            type="date"
            style={inputStyle}
            value={startDate}
            onChange={e => handleStartDateChange(e.target.value)}
            disabled={submitting}
          />
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>
            תאריך סיום * {halfDay && <span style={{ color: THEME.textDim }}>(נעול - חצי יום)</span>}
          </label>
          <input
            type="date"
            style={{ ...inputStyle, opacity: halfDay ? 0.5 : 1 }}
            value={effectiveEnd}
            min={startDate}
            onChange={e => setEndDate(e.target.value)}
            disabled={halfDay || submitting}
          />
        </div>
      </div>

      {/* Row 3: Half day */}
      <div style={checkboxRowStyle}>
        <input
          type="checkbox"
          id="halfDay"
          checked={halfDay}
          onChange={e => handleHalfDayChange(e.target.checked)}
          disabled={submitting}
          style={{
            width: 16,
            height: 16,
            accentColor: THEME.accent,
            cursor: 'pointer',
          }}
        />
        <label
          htmlFor="halfDay"
          style={{ fontSize: 13, color: THEME.text, cursor: 'pointer', userSelect: 'none' }}
        >
          חצי יום בלבד
        </label>
      </div>

      {/* Reason - Full Width */}
      <div style={{ ...fieldStyle, ...fullSpan, marginBottom: fieldGap }}>
        <label style={labelStyle}>
          סיבה {reasonRequired && <span style={{ color: THEME.red }}>*</span>}
          {!reasonRequired && <span style={{ color: THEME.textDim }}> (אופציונלי)</span>}
        </label>
        <textarea
          style={textareaStyle}
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder={reasonRequired ? 'נא לפרט את סיבת ההיעדרות...' : 'הערות נוספות...'}
          disabled={submitting}
        />
      </div>

      {/* Upload - Full Width */}
      <div style={{ ...fieldStyle, ...fullSpan, marginBottom: fieldGap }}>
        <label style={labelStyle}>
          מסמך מצורף {type === 'sick' && <span style={{ color: THEME.textDim }}>(אישור רפואי)</span>}
        </label>
        <div style={fileInputWrapperStyle}>
          <label style={fileButtonStyle}>
            <input
              type="file"
              accept="image/*,application/pdf"
              onChange={handleFileChange}
              style={{ display: 'none' }}
              disabled={submitting}
            />
            {documentName ? `📎 ${documentName}` : '📎 לחץ להעלאת קובץ (תמונה / PDF)'}
          </label>
          {isImage && documentUrl && (
            <img src={documentUrl} alt="preview" style={previewStyle} />
          )}
        </div>
      </div>

      {/* Live Summary Panel */}
      <div style={summaryPanelStyle}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: THEME.textDim,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            marginBottom: 8,
          }}
        >
          סיכום בקשה
        </div>

        <div style={summaryRowStyle}>
          <span style={{ color: THEME.textMuted }}>עובד</span>
          <span style={{ fontWeight: 600 }}>
            {selectedEmployee?.name ?? <span style={{ color: THEME.textDim }}>לא נבחר</span>}
          </span>
        </div>

        <div style={summaryRowStyle}>
          <span style={{ color: THEME.textMuted }}>סוג</span>
          <span style={chipStyle(ABSENCE_COLORS[type])}>
            <span>{ABSENCE_ICONS[type]}</span>
            <span>{ABSENCE_LABELS[type]}</span>
          </span>
        </div>

        <div style={summaryRowStyle}>
          <span style={{ color: THEME.textMuted }}>תאריכים</span>
          <span style={{ fontWeight: 600, color: THEME.text }}>{dateRangeLabel}</span>
        </div>

        <div style={{ ...summaryRowStyle, borderTop: `1px solid ${THEME.border}`, marginTop: 6, paddingTop: 10 }}>
          <span style={{ color: THEME.textMuted }}>ימי עבודה</span>
          <span style={{ fontWeight: 700, color: THEME.accent, fontSize: 16 }}>
            {daysCount} {daysCount === 1 ? 'יום' : daysCount === 0.5 ? 'יום' : 'ימים'}
          </span>
        </div>
      </div>

      {/* Buttons */}
      <div style={buttonRowStyle}>
        <button type="submit" style={submitButtonStyle} disabled={submitting}>
          {submitting ? 'שולח...' : success ? '✓ נשלח' : 'שלח בקשה'}
        </button>
        {onCancel && (
          <button type="button" style={cancelButtonStyle} onClick={onCancel} disabled={submitting}>
            ביטול
          </button>
        )}
      </div>
    </form>
  );
};

export default VacationRequestForm;
