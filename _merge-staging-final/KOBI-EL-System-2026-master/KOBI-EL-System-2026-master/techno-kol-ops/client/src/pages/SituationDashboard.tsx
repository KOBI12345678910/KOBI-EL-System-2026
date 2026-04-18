/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║   SITUATION DASHBOARD — תמונת מצב חברה בזמן אמת                        ║
 * ║   Real-time company health visualization                                 ║
 * ║   Connects to: situationEngine.ts + dataFlowEngine.ts                    ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

import { useEffect, useState, type CSSProperties } from 'react';
import {
  Situation,
  wireSituationToDataFlow,
  seedSituationDemoData,
  type CompanySnapshot,
  type HealthScore,
  type HealthLevel,
  type Alert,
} from '../engines/situationEngine';
import { ensureDefaultConsumers } from '../engines/dataFlowEngine';

// ═══════════════════════════════════════════════════════════════════════════
// THEME TOKENS
// ═══════════════════════════════════════════════════════════════════════════

const C = {
  bgOuter: '#252A31',
  bgPanel: '#2F343C',
  bgInput: '#383E47',
  border: 'rgba(255,255,255,0.1)',
  text: '#F6F7F9',
  textSecondary: '#ABB3BF',
  textMuted: '#5C7080',
  orange: '#FFA500',
  green: '#14CCBB',
  yellow: '#F6B64A',
  red: '#FC8585',
  purple: '#8B7FFF',
  blue: '#4A9EFF',
  orangeSoft: '#FF9E66',
};

const LEVEL_COLORS: Record<HealthLevel, string> = {
  excellent: C.green,
  good: C.blue,
  fair: C.yellow,
  poor: C.orangeSoft,
  critical: C.red,
};

const LEVEL_LABELS_HE: Record<HealthLevel, string> = {
  excellent: 'מצוין',
  good: 'טוב',
  fair: 'בינוני',
  poor: 'חלש',
  critical: 'קריטי',
};

const TREND_LABELS: Record<HealthScore['trend'], { icon: string; label: string; color: string }> = {
  improving: { icon: '📈', label: 'במגמת שיפור', color: C.green },
  stable: { icon: '➡️', label: 'יציב', color: C.textSecondary },
  declining: { icon: '📉', label: 'במגמת ירידה', color: C.red },
};

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function fmtTime(ts: number): string {
  try {
    const d = new Date(ts);
    return d.toLocaleString('he-IL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return '—';
  }
}

function fmtMoney(n: number | undefined): string {
  if (n === undefined || n === null || isNaN(n)) return '—';
  if (Math.abs(n) >= 1_000_000) return `₪${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `₪${(n / 1_000).toFixed(1)}K`;
  return `₪${Math.round(n).toLocaleString('he-IL')}`;
}

function fmtNum(n: number | undefined, digits = 0): string {
  if (n === undefined || n === null || isNaN(n)) return '—';
  return n.toLocaleString('he-IL', { maximumFractionDigits: digits });
}

function fmtPercent(n: number | undefined, digits = 0): string {
  if (n === undefined || n === null || isNaN(n)) return '—';
  return `${n.toFixed(digits)}%`;
}

// ═══════════════════════════════════════════════════════════════════════════
// REUSABLE STYLES
// ═══════════════════════════════════════════════════════════════════════════

const styles: Record<string, CSSProperties> = {
  page: {
    direction: 'rtl',
    minHeight: '100vh',
    background: C.bgOuter,
    color: C.text,
    fontFamily: '"Segoe UI", "Heebo", system-ui, -apple-system, sans-serif',
    padding: '24px',
    boxSizing: 'border-box',
  },
  loading: {
    direction: 'rtl',
    minHeight: '100vh',
    background: C.bgOuter,
    color: C.text,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '20px',
    fontFamily: '"Segoe UI", "Heebo", system-ui, sans-serif',
  },
  panel: {
    background: C.bgPanel,
    border: `1px solid ${C.border}`,
    borderRadius: '12px',
    padding: '20px',
    boxSizing: 'border-box',
  },
  panelTitle: {
    fontSize: '14px',
    fontWeight: 600,
    color: C.textSecondary,
    marginBottom: '12px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  smallLabel: {
    fontSize: '11px',
    color: C.textMuted,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  statRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 0',
    borderBottom: `1px solid ${C.border}`,
    fontSize: '13px',
  },
  statLabel: { color: C.textSecondary },
  statValue: { color: C.text, fontWeight: 600 },
  badge: {
    display: 'inline-block',
    padding: '4px 10px',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: 700,
    textTransform: 'uppercase',
  },
  button: {
    background: C.orange,
    color: '#1a1d22',
    border: 'none',
    borderRadius: '8px',
    padding: '10px 18px',
    fontSize: '14px',
    fontWeight: 700,
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
    background: C.bgInput,
    color: C.textSecondary,
    fontSize: '11px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    borderBottom: `1px solid ${C.border}`,
  },
  td: {
    padding: '10px 12px',
    borderBottom: `1px solid ${C.border}`,
    color: C.text,
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

function HealthBadge({ level }: { level: HealthLevel }) {
  const color = LEVEL_COLORS[level];
  return (
    <span
      style={{
        ...styles.badge,
        background: `${color}22`,
        color,
        border: `1px solid ${color}55`,
      }}
    >
      {LEVEL_LABELS_HE[level]}
    </span>
  );
}

function ProgressBar({ score, level }: { score: number; level: HealthLevel }) {
  const color = LEVEL_COLORS[level];
  const w = Math.max(0, Math.min(100, score));
  return (
    <div
      style={{
        width: '100%',
        height: '8px',
        background: C.bgInput,
        borderRadius: '4px',
        overflow: 'hidden',
        marginTop: '12px',
      }}
    >
      <div
        style={{
          width: `${w}%`,
          height: '100%',
          background: color,
          borderRadius: '4px',
          transition: 'width 0.4s ease',
        }}
      />
    </div>
  );
}

function CircularGauge({ score, level }: { score: number; level: HealthLevel }) {
  const size = 220;
  const stroke = 18;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, score));
  const dashOffset = circumference - (clamped / 100) * circumference;
  const color = LEVEL_COLORS[level];

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={C.bgInput}
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          style={{ transition: 'stroke-dashoffset 0.6s ease, stroke 0.4s ease' }}
        />
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: '64px', fontWeight: 800, color, lineHeight: 1 }}>
          {Math.round(clamped)}
        </div>
        <div style={{ fontSize: '12px', color: C.textMuted, marginTop: '4px' }}>מתוך 100</div>
        <div style={{ marginTop: '8px' }}>
          <HealthBadge level={level} />
        </div>
      </div>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.statRow}>
      <span style={styles.statLabel}>{label}</span>
      <span style={styles.statValue}>{value}</span>
    </div>
  );
}

function DomainPanel({
  title,
  health,
  rows,
}: {
  title: string;
  health: HealthScore;
  rows: Array<{ label: string; value: string }>;
}) {
  return (
    <div style={styles.panel}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '8px',
        }}
      >
        <div style={{ fontSize: '16px', fontWeight: 700, color: C.text }}>{title}</div>
        <HealthBadge level={health.level} />
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: '6px',
          marginBottom: '4px',
        }}
      >
        <span
          style={{
            fontSize: '36px',
            fontWeight: 800,
            color: LEVEL_COLORS[health.level],
            lineHeight: 1,
          }}
        >
          {Math.round(health.score)}
        </span>
        <span style={{ fontSize: '13px', color: C.textMuted }}>/ 100</span>
      </div>

      <ProgressBar score={health.score} level={health.level} />

      <div style={{ marginTop: '14px' }}>
        {rows.map((r, i) => (
          <StatRow key={i} label={r.label} value={r.value} />
        ))}
      </div>
    </div>
  );
}

function BigNumber({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div
      style={{
        flex: 1,
        background: C.bgInput,
        borderRadius: '10px',
        padding: '18px',
        textAlign: 'center',
        border: `1px solid ${color}33`,
      }}
    >
      <div style={{ fontSize: '42px', fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: '12px', color: C.textSecondary, marginTop: '8px' }}>{label}</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function SituationDashboard() {
  const [snapshot, setSnapshot] = useState<CompanySnapshot | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        ensureDefaultConsumers();
        wireSituationToDataFlow();
        seedSituationDemoData();
        const initial = await Situation.computeSnapshot();
        if (!cancelled) setSnapshot(initial);
      } catch (err) {
        console.error('[SituationDashboard] init error', err);
      }
    })();

    Situation.startAutoRefresh(60000);
    const unsubscribe = Situation.subscribe((s: CompanySnapshot) => {
      if (!cancelled) setSnapshot(s);
    });

    return () => {
      cancelled = true;
      unsubscribe();
      Situation.stopAutoRefresh();
    };
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const s = await Situation.computeSnapshot();
      setSnapshot(s);
    } catch (err) {
      console.error('[SituationDashboard] refresh error', err);
    } finally {
      setRefreshing(false);
    }
  };

  if (!snapshot) {
    return (
      <div style={styles.loading}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>⏳</div>
          <div style={{ fontSize: '18px', color: C.textSecondary }}>טוען תמונת מצב...</div>
        </div>
      </div>
    );
  }

  const { companyHealth, financial, operations, workforce, clients, alerts, topIssues, topOpportunities } = snapshot;
  const trend = TREND_LABELS[companyHealth.trend];

  // Build domain rows
  const finRows = [
    { label: 'הכנסות החודש', value: fmtMoney(financial.snapshot.revenue.thisMonth) },
    { label: 'רווח החודש', value: fmtMoney(financial.snapshot.profit.thisMonth) },
    { label: 'אחוז רווח', value: fmtPercent(financial.snapshot.profit.margin, 1) },
    { label: 'Runway (ימים)', value: fmtNum(financial.snapshot.cashflow.runway) },
  ];

  const opsRows = [
    { label: 'פרויקטים פעילים', value: fmtNum(operations.snapshot.activeProjects) },
    { label: 'בזמן', value: fmtNum(operations.snapshot.projectsOnTrack) },
    { label: 'באיחור', value: fmtNum(operations.snapshot.projectsDelayed) },
    { label: 'חריגה מתקציב', value: fmtNum(operations.snapshot.projectsOverBudget) },
  ];

  const wfRows = [
    { label: 'משימות פתוחות', value: fmtNum(workforce.snapshot.openTasks) },
    { label: 'משימות באיחור', value: fmtNum(workforce.snapshot.overdueTasks) },
    { label: 'קבלני משנה פעילים', value: fmtNum(workforce.snapshot.activeSubcontractors) },
    { label: 'דירוג קבלנים ממוצע', value: fmtNum(workforce.snapshot.avgSubcontractorRating, 1) },
  ];

  const clRows = [
    { label: 'לקוחות פעילים', value: fmtNum(clients.snapshot.activeClients) },
    { label: 'שביעות רצון', value: fmtNum(clients.snapshot.avgSatisfaction, 1) },
    { label: 'תלונות פתוחות', value: fmtNum(clients.snapshot.complaintsOpen) },
    { label: 'אחוז המרה', value: fmtPercent(clients.snapshot.conversionRate, 0) },
  ];

  // Collect all factors for the detailed table
  const allFactors = [
    ...financial.health.factors.map(f => ({ domain: 'פיננסי', f })),
    ...operations.health.factors.map(f => ({ domain: 'תפעולי', f })),
    ...workforce.health.factors.map(f => ({ domain: 'כח אדם', f })),
    ...clients.health.factors.map(f => ({ domain: 'לקוחות', f })),
  ];

  return (
    <div style={styles.page}>
      {/* ─────────── HEADER STRIP ─────────── */}
      <div
        style={{
          ...styles.panel,
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '24px',
          flexWrap: 'wrap',
        }}
      >
        {/* Title + meta */}
        <div style={{ flex: '1 1 320px', minWidth: 0 }}>
          <div
            style={{
              fontSize: '28px',
              fontWeight: 800,
              color: C.text,
              marginBottom: '6px',
            }}
          >
            תמונת מצב חברה בזמן אמת
          </div>
          <div style={{ fontSize: '13px', color: C.textSecondary }}>
            עודכן לאחרונה: <span style={{ color: C.text }}>{fmtTime(snapshot.timestamp)}</span>
          </div>
          <div
            style={{
              marginTop: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              flexWrap: 'wrap',
            }}
          >
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                background: C.bgInput,
                padding: '8px 14px',
                borderRadius: '20px',
                border: `1px solid ${trend.color}55`,
              }}
            >
              <span style={{ fontSize: '20px' }}>{trend.icon}</span>
              <span style={{ color: trend.color, fontSize: '13px', fontWeight: 600 }}>
                {trend.label}
              </span>
            </div>
            <button
              style={{
                ...styles.button,
                opacity: refreshing ? 0.6 : 1,
                cursor: refreshing ? 'wait' : 'pointer',
              }}
              onClick={handleRefresh}
              disabled={refreshing}
            >
              {refreshing ? 'מרענן...' : '🔄 רענן עכשיו'}
            </button>
          </div>
        </div>

        {/* Big circular gauge */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '12px',
          }}
        >
          <CircularGauge score={companyHealth.score} level={companyHealth.level} />
        </div>
      </div>

      {/* ─────────── 4-COLUMN DOMAIN GRID ─────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: '16px',
          marginBottom: '20px',
        }}
      >
        <DomainPanel title="פיננסי" health={financial.health} rows={finRows} />
        <DomainPanel title="תפעולי" health={operations.health} rows={opsRows} />
        <DomainPanel title="כח אדם" health={workforce.health} rows={wfRows} />
        <DomainPanel title="לקוחות" health={clients.health} rows={clRows} />
      </div>

      {/* ─────────── ISSUES + OPPORTUNITIES + ALERTS ─────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '16px',
          marginBottom: '20px',
        }}
      >
        {/* Top Issues - red border */}
        <div
          style={{
            ...styles.panel,
            border: `1px solid ${C.red}55`,
            borderInlineStart: `4px solid ${C.red}`,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '12px',
            }}
          >
            <div style={{ fontSize: '16px', fontWeight: 700, color: C.red }}>בעיות מרכזיות</div>
            <span
              style={{
                ...styles.badge,
                background: `${C.red}22`,
                color: C.red,
                border: `1px solid ${C.red}55`,
              }}
            >
              {topIssues.length}
            </span>
          </div>
          {topIssues.length === 0 ? (
            <div style={{ color: C.textMuted, fontSize: '13px', padding: '12px 0' }}>
              לא נמצאו בעיות חריגות 🎉
            </div>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {topIssues.slice(0, 5).map((issue, i) => (
                <li
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    padding: '10px 0',
                    borderBottom: i < Math.min(4, topIssues.length - 1) ? `1px solid ${C.border}` : 'none',
                    color: C.text,
                    fontSize: '13px',
                    lineHeight: 1.5,
                  }}
                >
                  <span style={{ fontSize: '16px', flexShrink: 0 }}>⚠️</span>
                  <span>{issue}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Top Opportunities - green border */}
        <div
          style={{
            ...styles.panel,
            border: `1px solid ${C.green}55`,
            borderInlineStart: `4px solid ${C.green}`,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '12px',
            }}
          >
            <div style={{ fontSize: '16px', fontWeight: 700, color: C.green }}>חוזקות</div>
            <span
              style={{
                ...styles.badge,
                background: `${C.green}22`,
                color: C.green,
                border: `1px solid ${C.green}55`,
              }}
            >
              {topOpportunities.length}
            </span>
          </div>
          {topOpportunities.length === 0 ? (
            <div style={{ color: C.textMuted, fontSize: '13px', padding: '12px 0' }}>
              אין כרגע נקודות חוזק חריגות
            </div>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {topOpportunities.slice(0, 3).map((opp, i) => (
                <li
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    padding: '10px 0',
                    borderBottom: i < Math.min(2, topOpportunities.length - 1) ? `1px solid ${C.border}` : 'none',
                    color: C.text,
                    fontSize: '13px',
                    lineHeight: 1.5,
                  }}
                >
                  <span style={{ fontSize: '16px', flexShrink: 0 }}>💪</span>
                  <span>{opp}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Active Alerts panel */}
        <div style={styles.panel}>
          <div style={{ fontSize: '16px', fontWeight: 700, color: C.text, marginBottom: '14px' }}>
            התראות פעילות
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <BigNumber value={alerts.active} label="פעילות" color={C.orange} />
            <BigNumber value={alerts.critical} label="קריטיות" color={C.red} />
            <BigNumber value={alerts.unacknowledged} label="לא טופלו" color={C.yellow} />
          </div>
        </div>
      </div>

      {/* ─────────── COLLAPSIBLE FULL DETAILS ─────────── */}
      <div style={styles.panel}>
        <button
          onClick={() => setDetailsOpen(o => !o)}
          style={{
            background: 'transparent',
            border: 'none',
            color: C.text,
            cursor: 'pointer',
            fontSize: '16px',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: 0,
            fontFamily: 'inherit',
            width: '100%',
            justifyContent: 'space-between',
          }}
        >
          <span>פירוט מלא — כל הגורמים</span>
          <span style={{ color: C.textSecondary, fontSize: '14px' }}>
            {detailsOpen ? '▲ סגור' : '▼ פתח'} ({allFactors.length} גורמים)
          </span>
        </button>

        {detailsOpen && (
          <div style={{ marginTop: '16px', overflowX: 'auto' }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>תחום</th>
                  <th style={styles.th}>שם הגורם</th>
                  <th style={styles.th}>ציון</th>
                  <th style={styles.th}>סטטוס</th>
                  <th style={styles.th}>פירוט</th>
                  <th style={styles.th}>המלצה</th>
                </tr>
              </thead>
              <tbody>
                {allFactors.map((row, i) => {
                  const color = LEVEL_COLORS[row.f.status];
                  return (
                    <tr key={i}>
                      <td style={{ ...styles.td, color: C.textSecondary, whiteSpace: 'nowrap' }}>
                        {row.domain}
                      </td>
                      <td style={{ ...styles.td, fontWeight: 600 }}>{row.f.name}</td>
                      <td style={{ ...styles.td, color, fontWeight: 700, whiteSpace: 'nowrap' }}>
                        {Math.round(row.f.score)}
                      </td>
                      <td style={styles.td}>
                        <HealthBadge level={row.f.status} />
                      </td>
                      <td style={{ ...styles.td, color: C.textSecondary, fontSize: '12px' }}>
                        {row.f.detail}
                      </td>
                      <td style={{ ...styles.td, color: C.textMuted, fontSize: '12px' }}>
                        {row.f.recommendation || '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ─────────── FOOTER ─────────── */}
      <div
        style={{
          marginTop: '20px',
          textAlign: 'center',
          color: C.textMuted,
          fontSize: '11px',
        }}
      >
        Techno-Kol Ops · Situation Awareness Engine · רענון אוטומטי כל 60 שניות
      </div>
    </div>
  );
}

// Re-export type for consumers that import alongside the component
export type { Alert };
