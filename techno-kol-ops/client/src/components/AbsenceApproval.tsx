/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║   ABSENCE APPROVAL — Manager Panel                                      ║
 * ║   אישור בקשות היעדרות — מסך מנהל                                       ║
 * ║                                                                          ║
 * ║   • רשימת בקשות ממתינות עם פירוט מלא                                   ║
 * ║   • אישור / דחייה אינדיבידואלי או מרובה                                ║
 * ║   • תצוגה מקדימה של השפעת הבקשה על יתרת העובד                          ║
 * ║   • רענון אוטומטי כל 5 שניות                                            ║
 * ║   • הסטוריית בקשות שטופלו לאחרונה                                       ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  AbsenceStore,
  BalanceStore,
  ABSENCE_LABELS,
  ABSENCE_COLORS,
  STATUS_LABELS,
  STATUS_COLORS,
  type AbsenceRequest,
  type AbsenceType,
} from '../engines/hoursAttendanceEngine';

// ═══════════════════════════════════════════════════════════════════════════
// THEME
// ═══════════════════════════════════════════════════════════════════════════

const C = {
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

interface AbsenceApprovalProps {
  managerName?: string;
  onAction?: (req: AbsenceRequest, action: 'approved' | 'rejected') => void;
  autoRefresh?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function timeAgo(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diff = Math.max(0, now - then);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'כעת';
  if (minutes < 60) return `לפני ${minutes} דקות`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `לפני ${hours} שעות`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `לפני ${days} ימים`;
  const months = Math.floor(days / 30);
  return `לפני ${months} חודשים`;
}

function formatDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatDateTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('he-IL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export const AbsenceApproval: React.FC<AbsenceApprovalProps> = ({
  managerName = 'מנהל',
  onAction,
  autoRefresh = true,
}) => {
  const [requests, setRequests] = useState<AbsenceRequest[]>([]);
  const [recentlyHandled, setRecentlyHandled] = useState<AbsenceRequest[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filterType, setFilterType] = useState<AbsenceType | 'all'>('all');
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<string>('');
  const [expandedDetails, setExpandedDetails] = useState<Set<string>>(new Set());
  const [tick, setTick] = useState(0);

  // ─── Refresh data ──────────────────────────────────────────────────────
  const refresh = () => {
    setRequests(AbsenceStore.getByStatus('pending'));
    const all = AbsenceStore.getAll();
    const handled = all
      .filter(r => r.status === 'approved' || r.status === 'rejected')
      .sort((a, b) => {
        const at = new Date(a.approvedAt || a.submittedAt).getTime();
        const bt = new Date(b.approvedAt || b.submittedAt).getTime();
        return bt - at;
      })
      .slice(0, 10);
    setRecentlyHandled(handled);
  };

  useEffect(() => {
    refresh();
  }, [tick]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      setTick(t => t + 1);
    }, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh]);

  // ─── Filtered requests ─────────────────────────────────────────────────
  const filteredRequests = useMemo(() => {
    if (filterType === 'all') return requests;
    return requests.filter(r => r.type === filterType);
  }, [requests, filterType]);

  // ─── Selection handlers ────────────────────────────────────────────────
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredRequests.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredRequests.map(r => r.id)));
    }
  };

  const toggleDetails = (id: string) => {
    setExpandedDetails(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ─── Action handlers ───────────────────────────────────────────────────
  const handleApprove = (req: AbsenceRequest) => {
    const updated = AbsenceStore.approve(req.id, managerName);
    if (updated && onAction) onAction(updated, 'approved');
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.delete(req.id);
      return next;
    });
    setTick(t => t + 1);
  };

  const handleStartReject = (id: string) => {
    setRejectingId(id);
    setRejectReason('');
  };

  const handleConfirmReject = (req: AbsenceRequest) => {
    if (!rejectReason.trim()) {
      alert('יש להזין סיבת דחייה');
      return;
    }
    const updated = AbsenceStore.reject(req.id, rejectReason.trim(), managerName);
    if (updated && onAction) onAction(updated, 'rejected');
    setRejectingId(null);
    setRejectReason('');
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.delete(req.id);
      return next;
    });
    setTick(t => t + 1);
  };

  const handleCancelReject = () => {
    setRejectingId(null);
    setRejectReason('');
  };

  const handleBulkApprove = () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`לאשר ${selectedIds.size} בקשות?`)) return;
    selectedIds.forEach(id => {
      const req = requests.find(r => r.id === id);
      if (req) {
        const updated = AbsenceStore.approve(id, managerName);
        if (updated && onAction) onAction(updated, 'approved');
      }
    });
    setSelectedIds(new Set());
    setTick(t => t + 1);
  };

  const handleBulkReject = () => {
    if (selectedIds.size === 0) return;
    const reason = prompt(`סיבת דחייה ל-${selectedIds.size} בקשות:`);
    if (!reason || !reason.trim()) return;
    selectedIds.forEach(id => {
      const req = requests.find(r => r.id === id);
      if (req) {
        const updated = AbsenceStore.reject(id, reason.trim(), managerName);
        if (updated && onAction) onAction(updated, 'rejected');
      }
    });
    setSelectedIds(new Set());
    setTick(t => t + 1);
  };

  // ═══════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════

  return (
    <div
      dir="rtl"
      style={{
        background: C.bg,
        color: C.text,
        padding: 20,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Heebo", sans-serif',
        minHeight: '100vh',
      }}
    >
      {/* ═══ HEADER BAR ═══════════════════════════════════════════════════ */}
      <div
        style={{
          background: C.panel,
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          marginBottom: 16,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 250 }}>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: C.text }}>
            אישור בקשות היעדרות
          </h2>
          <span
            style={{
              background: requests.length > 0 ? C.red : C.textDim,
              color: '#FFF',
              padding: '4px 12px',
              borderRadius: 999,
              fontSize: 13,
              fontWeight: 700,
              minWidth: 28,
              textAlign: 'center',
            }}
          >
            {requests.length}
          </span>
        </div>

        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value as AbsenceType | 'all')}
          style={{
            background: C.input,
            color: C.text,
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            padding: '8px 14px',
            fontSize: 14,
            cursor: 'pointer',
            outline: 'none',
          }}
        >
          <option value="all">כל סוגי ההיעדרות</option>
          {(Object.keys(ABSENCE_LABELS) as AbsenceType[]).map(t => (
            <option key={t} value={t}>
              {ABSENCE_LABELS[t]}
            </option>
          ))}
        </select>

        <button
          onClick={() => setTick(t => t + 1)}
          style={{
            background: C.input,
            color: C.text,
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            padding: '8px 18px',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          רענן
        </button>
      </div>

      {/* ═══ BULK ACTIONS BAR ═════════════════════════════════════════════ */}
      {filteredRequests.length > 0 && (
        <div
          style={{
            background: C.panel,
            border: `1px solid ${C.border}`,
            borderRadius: 12,
            padding: '12px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            marginBottom: 16,
            flexWrap: 'wrap',
          }}
        >
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              cursor: 'pointer',
              userSelect: 'none',
              color: C.text,
              fontSize: 14,
            }}
          >
            <input
              type="checkbox"
              checked={selectedIds.size === filteredRequests.length && filteredRequests.length > 0}
              onChange={toggleSelectAll}
              style={{
                width: 18,
                height: 18,
                cursor: 'pointer',
                accentColor: C.accent,
              }}
            />
            בחר הכל
          </label>

          <span style={{ color: C.textMuted, fontSize: 13 }}>
            {selectedIds.size > 0 ? `נבחרו ${selectedIds.size} בקשות` : 'לא נבחרו בקשות'}
          </span>

          <div style={{ flex: 1 }} />

          <button
            onClick={handleBulkApprove}
            disabled={selectedIds.size === 0}
            style={{
              background: selectedIds.size > 0 ? C.green : C.input,
              color: selectedIds.size > 0 ? '#0B1014' : C.textDim,
              border: 'none',
              borderRadius: 8,
              padding: '8px 18px',
              fontSize: 14,
              fontWeight: 700,
              cursor: selectedIds.size > 0 ? 'pointer' : 'not-allowed',
              opacity: selectedIds.size > 0 ? 1 : 0.6,
            }}
          >
            אשר בחרו ({selectedIds.size})
          </button>

          <button
            onClick={handleBulkReject}
            disabled={selectedIds.size === 0}
            style={{
              background: selectedIds.size > 0 ? C.red : C.input,
              color: selectedIds.size > 0 ? '#FFF' : C.textDim,
              border: 'none',
              borderRadius: 8,
              padding: '8px 18px',
              fontSize: 14,
              fontWeight: 700,
              cursor: selectedIds.size > 0 ? 'pointer' : 'not-allowed',
              opacity: selectedIds.size > 0 ? 1 : 0.6,
            }}
          >
            דחה בחרו ({selectedIds.size})
          </button>
        </div>
      )}

      {/* ═══ PENDING REQUESTS LIST ════════════════════════════════════════ */}
      {filteredRequests.length === 0 ? (
        <div
          style={{
            background: C.panel,
            border: `1px solid ${C.border}`,
            borderRadius: 12,
            padding: 60,
            textAlign: 'center',
            color: C.textMuted,
            fontSize: 18,
          }}
        >
          <div style={{ fontSize: 48, marginBottom: 12 }}>✓</div>
          אין בקשות ממתינות
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filteredRequests.map(req => {
            const isSelected = selectedIds.has(req.id);
            const isExpanded = expandedDetails.has(req.id);
            const isRejecting = rejectingId === req.id;
            const stripColor = ABSENCE_COLORS[req.type];
            const balance = BalanceStore.getForEmployee(req.employeeId);

            // Compute balance impact
            let balancePct = 0;
            let balanceBefore = 0;
            let balanceAfter = 0;
            let balanceLabel = '';
            if (req.type === 'vacation' && balance) {
              balanceBefore = balance.vacationRemaining;
              balanceAfter = balanceBefore - req.daysCount;
              balancePct = balanceBefore > 0 ? Math.round((req.daysCount / balanceBefore) * 100) : 100;
              balanceLabel = 'יתרת חופש';
            } else if ((req.type === 'sick' || req.type === 'sick_family') && balance) {
              balanceBefore = balance.sickRemaining;
              balanceAfter = balanceBefore - req.daysCount;
              balancePct = balanceBefore > 0 ? Math.round((req.daysCount / balanceBefore) * 100) : 100;
              balanceLabel = 'יתרת מחלה';
            }

            return (
              <div
                key={req.id}
                style={{
                  background: C.panel,
                  border: `1px solid ${isSelected ? C.accent : C.border}`,
                  borderRadius: 12,
                  padding: 0,
                  display: 'flex',
                  overflow: 'hidden',
                  transition: 'border-color 0.2s',
                }}
              >
                {/* Colored strip on the right (RTL) */}
                <div
                  style={{
                    width: 6,
                    background: stripColor,
                    flexShrink: 0,
                  }}
                />

                <div style={{ flex: 1, padding: 18 }}>
                  {/* Top row: checkbox + employee + type badge + timestamp */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      marginBottom: 12,
                      flexWrap: 'wrap',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(req.id)}
                      style={{
                        width: 18,
                        height: 18,
                        cursor: 'pointer',
                        accentColor: C.accent,
                      }}
                    />
                    <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>
                      {req.employeeName}
                    </div>
                    <span
                      style={{
                        background: stripColor + '22',
                        color: stripColor,
                        border: `1px solid ${stripColor}55`,
                        padding: '4px 12px',
                        borderRadius: 999,
                        fontSize: 12,
                        fontWeight: 700,
                      }}
                    >
                      {ABSENCE_LABELS[req.type]}
                    </span>
                    <span
                      style={{
                        background: STATUS_COLORS.pending + '22',
                        color: STATUS_COLORS.pending,
                        border: `1px solid ${STATUS_COLORS.pending}55`,
                        padding: '4px 10px',
                        borderRadius: 999,
                        fontSize: 11,
                        fontWeight: 600,
                      }}
                    >
                      {STATUS_LABELS.pending}
                    </span>
                    <div style={{ flex: 1 }} />
                    <span style={{ fontSize: 12, color: C.textDim }}>
                      הוגש {timeAgo(req.submittedAt)}
                    </span>
                  </div>

                  {/* Middle: dates + days + half day + balance pct */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 16,
                      marginBottom: 10,
                      flexWrap: 'wrap',
                      fontSize: 14,
                      color: C.textMuted,
                    }}
                  >
                    <div>
                      <span style={{ color: C.textDim, marginLeft: 6 }}>תאריכים:</span>
                      <span style={{ color: C.text, fontWeight: 600 }}>
                        {formatDate(req.startDate)} – {formatDate(req.endDate)}
                      </span>
                    </div>
                    <div>
                      <span style={{ color: C.textDim, marginLeft: 6 }}>ימים:</span>
                      <span style={{ color: C.text, fontWeight: 600 }}>{req.daysCount}</span>
                    </div>
                    {req.halfDay && (
                      <span
                        style={{
                          background: C.yellow + '22',
                          color: C.yellow,
                          padding: '2px 10px',
                          borderRadius: 999,
                          fontSize: 11,
                          fontWeight: 600,
                        }}
                      >
                        חצי יום
                      </span>
                    )}
                    {balanceLabel && (
                      <span
                        style={{
                          color: balancePct > 50 ? C.red : balancePct > 25 ? C.yellow : C.green,
                          fontWeight: 600,
                        }}
                      >
                        זה חוצה {balancePct}% מהיתרה
                      </span>
                    )}
                  </div>

                  {/* Reason */}
                  {req.reason && (
                    <div
                      style={{
                        fontStyle: 'italic',
                        color: C.textMuted,
                        fontSize: 14,
                        marginBottom: 10,
                        padding: '8px 12px',
                        background: C.input,
                        borderRadius: 8,
                        borderRight: `3px solid ${stripColor}`,
                      }}
                    >
                      "{req.reason}"
                    </div>
                  )}

                  {/* Document link */}
                  {req.documentUrl && (
                    <div style={{ marginBottom: 10 }}>
                      <a
                        href={req.documentUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          color: C.accent,
                          textDecoration: 'none',
                          fontSize: 13,
                          fontWeight: 600,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        📎 מסמך מצורף
                      </a>
                    </div>
                  )}

                  {/* Balance preview */}
                  {balanceLabel && balance && (
                    <div
                      style={{
                        background: C.input,
                        border: `1px solid ${C.border}`,
                        borderRadius: 8,
                        padding: '10px 14px',
                        marginBottom: 12,
                        fontSize: 13,
                        color: C.textMuted,
                      }}
                    >
                      <span style={{ color: C.textDim, marginLeft: 6 }}>{balanceLabel}:</span>
                      <span style={{ color: C.text, fontWeight: 700 }}>{balanceBefore.toFixed(1)}</span>
                      <span style={{ color: C.textDim, margin: '0 6px' }}>→</span>
                      <span
                        style={{
                          color: balanceAfter < 0 ? C.red : C.green,
                          fontWeight: 700,
                        }}
                      >
                        {balanceAfter.toFixed(1)}
                      </span>
                      <span style={{ color: C.textDim, marginRight: 6 }}>(אחרי אישור)</span>
                    </div>
                  )}

                  {/* Inline reject textarea */}
                  {isRejecting && (
                    <div
                      style={{
                        background: C.input,
                        border: `1px solid ${C.red}55`,
                        borderRadius: 8,
                        padding: 12,
                        marginBottom: 12,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 13,
                          color: C.textMuted,
                          marginBottom: 8,
                          fontWeight: 600,
                        }}
                      >
                        סיבת דחייה:
                      </div>
                      <textarea
                        value={rejectReason}
                        onChange={e => setRejectReason(e.target.value)}
                        placeholder="פרט את הסיבה לדחייה..."
                        rows={3}
                        style={{
                          width: '100%',
                          background: C.bg,
                          color: C.text,
                          border: `1px solid ${C.border}`,
                          borderRadius: 6,
                          padding: 10,
                          fontSize: 13,
                          fontFamily: 'inherit',
                          resize: 'vertical',
                          outline: 'none',
                          boxSizing: 'border-box',
                        }}
                      />
                      <div
                        style={{
                          display: 'flex',
                          gap: 8,
                          marginTop: 10,
                          justifyContent: 'flex-start',
                        }}
                      >
                        <button
                          onClick={() => handleConfirmReject(req)}
                          style={{
                            background: C.red,
                            color: '#FFF',
                            border: 'none',
                            borderRadius: 6,
                            padding: '8px 16px',
                            fontSize: 13,
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          אישור דחייה
                        </button>
                        <button
                          onClick={handleCancelReject}
                          style={{
                            background: C.input,
                            color: C.text,
                            border: `1px solid ${C.border}`,
                            borderRadius: 6,
                            padding: '8px 16px',
                            fontSize: 13,
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          ביטול
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Details JSON */}
                  {isExpanded && (
                    <pre
                      style={{
                        background: C.bg,
                        border: `1px solid ${C.border}`,
                        borderRadius: 8,
                        padding: 12,
                        fontSize: 11,
                        color: C.textMuted,
                        overflow: 'auto',
                        maxHeight: 240,
                        marginBottom: 12,
                        direction: 'ltr',
                        textAlign: 'left',
                      }}
                    >
                      {JSON.stringify(req, null, 2)}
                    </pre>
                  )}

                  {/* Action buttons */}
                  <div
                    style={{
                      display: 'flex',
                      gap: 10,
                      marginTop: 8,
                      flexWrap: 'wrap',
                    }}
                  >
                    <button
                      onClick={() => handleApprove(req)}
                      disabled={isRejecting}
                      style={{
                        background: C.green,
                        color: '#0B1014',
                        border: 'none',
                        borderRadius: 8,
                        padding: '10px 24px',
                        fontSize: 15,
                        fontWeight: 700,
                        cursor: isRejecting ? 'not-allowed' : 'pointer',
                        opacity: isRejecting ? 0.5 : 1,
                      }}
                    >
                      אשר
                    </button>

                    {!isRejecting && (
                      <button
                        onClick={() => handleStartReject(req.id)}
                        style={{
                          background: C.red,
                          color: '#FFF',
                          border: 'none',
                          borderRadius: 8,
                          padding: '10px 20px',
                          fontSize: 14,
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        דחה
                      </button>
                    )}

                    <button
                      onClick={() => toggleDetails(req.id)}
                      style={{
                        background: C.input,
                        color: C.text,
                        border: `1px solid ${C.border}`,
                        borderRadius: 8,
                        padding: '10px 18px',
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: 'pointer',
                        marginRight: 'auto',
                      }}
                    >
                      {isExpanded ? 'הסתר פרטים' : 'פרטים'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ═══ RECENTLY HANDLED ═════════════════════════════════════════════ */}
      {recentlyHandled.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <h3
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: C.text,
              margin: '0 0 12px 0',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            טופלו לאחרונה
            <span
              style={{
                background: C.input,
                color: C.textMuted,
                padding: '2px 10px',
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              {recentlyHandled.length}
            </span>
          </h3>

          <div
            style={{
              background: C.panel,
              border: `1px solid ${C.border}`,
              borderRadius: 12,
              overflow: 'hidden',
            }}
          >
            {recentlyHandled.map((req, idx) => {
              const stripColor = ABSENCE_COLORS[req.type];
              const statusColor = STATUS_COLORS[req.status];
              return (
                <div
                  key={req.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '12px 16px',
                    borderBottom:
                      idx < recentlyHandled.length - 1 ? `1px solid ${C.border}` : 'none',
                  }}
                >
                  <div
                    style={{
                      width: 4,
                      height: 32,
                      background: stripColor,
                      borderRadius: 2,
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        fontSize: 14,
                        color: C.text,
                        fontWeight: 600,
                      }}
                    >
                      {req.employeeName}
                      <span
                        style={{
                          fontSize: 11,
                          color: stripColor,
                          fontWeight: 500,
                        }}
                      >
                        · {ABSENCE_LABELS[req.type]}
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          color: C.textDim,
                        }}
                      >
                        · {req.daysCount} ימים
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: C.textDim,
                        marginTop: 2,
                      }}
                    >
                      {formatDate(req.startDate)} – {formatDate(req.endDate)}
                      {req.approvedBy && ` · על ידי ${req.approvedBy}`}
                      {req.approvedAt && ` · ${formatDateTime(req.approvedAt)}`}
                    </div>
                  </div>
                  <span
                    style={{
                      background: statusColor + '22',
                      color: statusColor,
                      border: `1px solid ${statusColor}55`,
                      padding: '4px 12px',
                      borderRadius: 999,
                      fontSize: 11,
                      fontWeight: 700,
                      flexShrink: 0,
                    }}
                  >
                    {STATUS_LABELS[req.status]}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══ FOOTER ═══════════════════════════════════════════════════════ */}
      <div
        style={{
          marginTop: 24,
          padding: 12,
          textAlign: 'center',
          fontSize: 11,
          color: C.textDim,
        }}
      >
        {autoRefresh && 'מתעדכן אוטומטית כל 5 שניות · '}
        מנהל: {managerName}
      </div>
    </div>
  );
};

export default AbsenceApproval;
