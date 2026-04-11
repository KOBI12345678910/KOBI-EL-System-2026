import React, { useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  DataFlow,
  ensureDefaultConsumers,
  onFlowUpdate,
  type DataFlowStats,
  type DataPacket,
  type DataCategory,
} from '../engines/dataFlowEngine';

// ═══════════════════════════════════════════════════════════════════════════
// THEME — Onyx dark palette
// ═══════════════════════════════════════════════════════════════════════════

const COLORS = {
  bg: '#252A31',
  panel: '#2F343C',
  panelAlt: '#383E47',
  input: '#383E47',
  border: 'rgba(255,255,255,0.1)',
  borderStrong: 'rgba(255,255,255,0.18)',
  text: '#F6F7F9',
  textMuted: '#ABB3BF',
  textDim: '#5C7080',
  accent: '#FFA500',
  green: '#14CCBB',
  yellow: '#F6B64A',
  red: '#FC8585',
  purple: '#8B7FFF',
  blue: '#48AFF0',
};

const CATEGORY_COLORS: Record<string, string> = {
  project: '#FFA500',
  client: '#48AFF0',
  subcontractor: '#8B7FFF',
  financial: '#14CCBB',
  work_order: '#F6B64A',
  measurement: '#9D4EDD',
  material: '#FF7B47',
  schedule: '#48AFF0',
  communication: '#14CCBB',
  document: '#5C7080',
  employee: '#F6B64A',
  decision: '#8B7FFF',
  alert: '#FC8585',
  metric: '#48AFF0',
  inventory: '#FF7B47',
  quality: '#14CCBB',
  task: '#FFA500',
  crm: '#48AFF0',
  seo: '#8B7FFF',
  real_estate: '#F6B64A',
  system: '#5C7080',
};

const CATEGORY_LABELS: Record<string, string> = {
  project: 'פרויקט',
  client: 'לקוח',
  subcontractor: 'קבלן משנה',
  financial: 'פיננסי',
  work_order: 'הזמנת עבודה',
  measurement: 'מדידה',
  material: 'חומר',
  schedule: 'לוח זמנים',
  communication: 'תקשורת',
  document: 'מסמך',
  employee: 'עובד',
  decision: 'החלטה',
  alert: 'התראה',
  metric: 'מדד',
  inventory: 'מלאי',
  quality: 'איכות',
  task: 'משימה',
  crm: 'CRM',
  seo: 'SEO',
  real_estate: 'נדל"ן',
  system: 'מערכת',
};

const ALL_CATEGORIES: DataCategory[] = [
  'project', 'client', 'subcontractor', 'financial', 'work_order',
  'measurement', 'material', 'schedule', 'communication', 'document',
  'employee', 'decision', 'alert', 'metric', 'inventory', 'quality',
  'task', 'crm', 'seo', 'real_estate', 'system',
];

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════

const styles: Record<string, CSSProperties> = {
  page: {
    direction: 'rtl',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Heebo", sans-serif',
    background: COLORS.bg,
    color: COLORS.text,
    minHeight: '100vh',
    padding: 20,
    boxSizing: 'border-box',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
    paddingBottom: 16,
    borderBottom: `1px solid ${COLORS.border}`,
  },
  headerTitleWrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  title: {
    fontSize: 26,
    fontWeight: 700,
    color: COLORS.text,
    margin: 0,
    letterSpacing: 0.2,
  },
  subtitle: {
    fontSize: 13,
    color: COLORS.textMuted,
    margin: 0,
  },
  testButton: {
    background: COLORS.accent,
    color: '#1a1a1a',
    border: 'none',
    padding: '10px 18px',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(255,165,0,0.25)',
    transition: 'transform 0.1s ease',
  },
  kpiStrip: {
    display: 'flex',
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
    flexWrap: 'wrap',
  },
  kpiCard: {
    flex: '1 1 180px',
    background: COLORS.panel,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 10,
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    minWidth: 160,
  },
  kpiLabel: {
    fontSize: 12,
    color: COLORS.textMuted,
    fontWeight: 500,
    letterSpacing: 0.2,
  },
  kpiValue: {
    fontSize: 28,
    fontWeight: 700,
    color: COLORS.text,
    lineHeight: 1.1,
  },
  kpiHint: {
    fontSize: 11,
    color: COLORS.textDim,
  },
  panel: {
    background: COLORS.panel,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 10,
    padding: 18,
    marginBottom: 16,
  },
  panelHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  panelTitle: {
    fontSize: 16,
    fontWeight: 600,
    color: COLORS.text,
    margin: 0,
  },
  panelMeta: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 13,
  },
  thead: {
    background: COLORS.panelAlt,
  },
  th: {
    textAlign: 'right' as const,
    padding: '10px 12px',
    fontSize: 11,
    fontWeight: 600,
    color: COLORS.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    borderBottom: `1px solid ${COLORS.border}`,
  },
  td: {
    padding: '10px 12px',
    color: COLORS.text,
    borderBottom: `1px solid ${COLORS.border}`,
  },
  twoCol: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 16,
    marginBottom: 16,
  },
  barRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  barLabel: {
    width: 110,
    fontSize: 12,
    color: COLORS.textMuted,
    textAlign: 'right' as const,
  },
  barTrack: {
    flex: 1,
    height: 18,
    background: COLORS.panelAlt,
    borderRadius: 4,
    overflow: 'hidden',
    position: 'relative',
  },
  barFill: {
    height: '100%',
    background: COLORS.accent,
    borderRadius: 4,
    transition: 'width 0.4s ease',
  },
  barCount: {
    width: 50,
    fontSize: 12,
    fontWeight: 600,
    color: COLORS.text,
    textAlign: 'left' as const,
  },
  packetRow: {
    display: 'grid',
    gridTemplateColumns: '90px 110px 1fr 120px 60px 80px',
    gap: 10,
    alignItems: 'center',
    padding: '10px 12px',
    borderBottom: `1px solid ${COLORS.border}`,
    fontSize: 12,
  },
  chip: {
    display: 'inline-block',
    padding: '3px 9px',
    borderRadius: 12,
    fontSize: 11,
    fontWeight: 600,
    color: '#1a1a1a',
  },
  pill: {
    display: 'inline-block',
    padding: '2px 7px',
    margin: '2px 2px 2px 0',
    borderRadius: 10,
    fontSize: 10,
    background: COLORS.panelAlt,
    color: COLORS.textMuted,
    border: `1px solid ${COLORS.border}`,
  },
  select: {
    background: COLORS.input,
    color: COLORS.text,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 6,
    padding: '8px 12px',
    fontSize: 13,
    fontFamily: 'inherit',
    cursor: 'pointer',
    minWidth: 200,
  },
  filterRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  filterLabel: {
    fontSize: 13,
    color: COLORS.textMuted,
  },
  eventLog: {
    background: '#1a1d22',
    border: `1px solid ${COLORS.border}`,
    borderRadius: 8,
    padding: 12,
    maxHeight: 300,
    overflowY: 'auto',
    fontFamily: '"SF Mono", "Monaco", "Consolas", monospace',
    fontSize: 11,
    lineHeight: 1.6,
  },
  eventLine: {
    color: COLORS.textMuted,
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-word' as const,
  },
  emptyState: {
    padding: 24,
    textAlign: 'center' as const,
    color: COLORS.textDim,
    fontSize: 13,
  },
  liveDot: {
    display: 'inline-block',
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: COLORS.green,
    marginLeft: 6,
    boxShadow: `0 0 6px ${COLORS.green}`,
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function relativeTime(ts: number): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 5) return 'הרגע';
  if (diffSec < 60) return `לפני ${diffSec} שניות`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `לפני ${diffMin} דקות`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `לפני ${diffH} שעות`;
  const diffD = Math.floor(diffH / 24);
  return `לפני ${diffD} ימים`;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function categoryLabel(cat: string): string {
  return CATEGORY_LABELS[cat] ?? cat;
}

function categoryColor(cat: string): string {
  return CATEGORY_COLORS[cat] ?? COLORS.accent;
}

function formatNumber(n: number): string {
  return n.toLocaleString('he-IL');
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function DataFlowMonitor() {
  const [stats, setStats] = useState<DataFlowStats | null>(null);
  const [consumers, setConsumers] = useState<ReturnType<typeof DataFlow.getConsumerStats>>([]);
  const [packets, setPackets] = useState<DataPacket[]>([]);
  const [eventLog, setEventLog] = useState<ReturnType<typeof DataFlow.getEventLog>>([]);
  const [selectedCategory, setSelectedCategory] = useState<DataCategory | 'all'>('all');
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const [testButtonHover, setTestButtonHover] = useState(false);

  // ─── Initial mount: register defaults + subscribe + start polling ─────
  useEffect(() => {
    ensureDefaultConsumers();

    // Initial snapshot
    setStats(DataFlow.getStats());
    setConsumers(DataFlow.getConsumerStats());
    setPackets(DataFlow.getRecentPackets(50));
    setEventLog(DataFlow.getEventLog(100));

    // Live subscription for stats
    const unsubscribe = onFlowUpdate((s) => {
      setStats(s);
    });

    // Polling every 2 seconds for packets / consumers / event log
    const interval = setInterval(() => {
      setStats(DataFlow.getStats());
      setConsumers(DataFlow.getConsumerStats());
      setPackets(DataFlow.getRecentPackets(50));
      setEventLog(DataFlow.getEventLog(100));
    }, 2000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, []);

  // ─── Computed: max counts for bar charts ──────────────────────────────
  const maxCategoryCount = useMemo(() => {
    if (!stats) return 1;
    const values = Object.values(stats.byCategory);
    return values.length === 0 ? 1 : Math.max(...values, 1);
  }, [stats]);

  const maxSourceCount = useMemo(() => {
    if (!stats) return 1;
    const values = Object.values(stats.bySource);
    return values.length === 0 ? 1 : Math.max(...values, 1);
  }, [stats]);

  const sortedCategories = useMemo(() => {
    if (!stats) return [] as Array<[string, number]>;
    return Object.entries(stats.byCategory).sort((a, b) => b[1] - a[1]);
  }, [stats]);

  const sortedSources = useMemo(() => {
    if (!stats) return [] as Array<[string, number]>;
    return Object.entries(stats.bySource).sort((a, b) => b[1] - a[1]);
  }, [stats]);

  // ─── Filtered packets for the live stream ─────────────────────────────
  const filteredPackets = useMemo(() => {
    const filtered = selectedCategory === 'all'
      ? packets
      : packets.filter(p => p.category === selectedCategory);
    return filtered.slice(0, 20);
  }, [packets, selectedCategory]);

  // ─── Test event handler ───────────────────────────────────────────────
  const handleTestEvent = async () => {
    await DataFlow.ingest({
      category: 'system',
      payload: { test: true, note: 'אירוע בדיקה מהמוניטור' },
      source: { name: 'Monitor UI' },
    });
    // Force a quick refresh after the test event
    setStats(DataFlow.getStats());
    setConsumers(DataFlow.getConsumerStats());
    setPackets(DataFlow.getRecentPackets(50));
    setEventLog(DataFlow.getEventLog(100));
  };

  // ─── Derived KPI values ───────────────────────────────────────────────
  const kpiTotalIngested = stats ? formatNumber(stats.totalPacketsIngested) : '—';
  const kpiPerMinute = stats ? stats.packetsPerMinute.toFixed(1) : '—';
  const kpiAvgRouting = stats ? stats.avgRoutingTimeMs.toFixed(1) + 'ms' : '—';
  const kpiDeliveries = stats ? formatNumber(stats.totalDeliveries) : '—';
  const kpiFailures = stats
    ? formatNumber(stats.totalFailedDeliveries + stats.totalDropped)
    : '—';

  // ═══════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════

  return (
    <div style={styles.page}>
      {/* HEADER */}
      <div style={styles.header}>
        <div style={styles.headerTitleWrap}>
          <h1 style={styles.title}>
            זרימת נתונים — מוניטור זמן אמת
            <span style={styles.liveDot}></span>
          </h1>
          <p style={styles.subtitle}>
            מעקב חי אחר חבילות נתונים, צרכנים ופעילות מערכת
          </p>
        </div>
        <button
          style={{
            ...styles.testButton,
            transform: testButtonHover ? 'translateY(-1px)' : 'translateY(0)',
          }}
          onMouseEnter={() => setTestButtonHover(true)}
          onMouseLeave={() => setTestButtonHover(false)}
          onClick={handleTestEvent}
        >
          + צור אירוע בדיקה
        </button>
      </div>

      {/* KPI STRIP */}
      <div style={styles.kpiStrip}>
        <div style={{ ...styles.kpiCard, borderTop: `3px solid ${COLORS.accent}` }}>
          <div style={styles.kpiLabel}>סה"כ נתונים שנכנסו</div>
          <div style={styles.kpiValue}>{kpiTotalIngested}</div>
          <div style={styles.kpiHint}>חבילות שעברו ניתוב</div>
        </div>
        <div style={{ ...styles.kpiCard, borderTop: `3px solid ${COLORS.blue}` }}>
          <div style={styles.kpiLabel}>נתונים / דקה</div>
          <div style={styles.kpiValue}>{kpiPerMinute}</div>
          <div style={styles.kpiHint}>תפוקה ממוצעת</div>
        </div>
        <div style={{ ...styles.kpiCard, borderTop: `3px solid ${COLORS.purple}` }}>
          <div style={styles.kpiLabel}>זמן ניתוב ממוצע</div>
          <div style={styles.kpiValue}>{kpiAvgRouting}</div>
          <div style={styles.kpiHint}>פר חבילה</div>
        </div>
        <div style={{ ...styles.kpiCard, borderTop: `3px solid ${COLORS.green}` }}>
          <div style={styles.kpiLabel}>משלוחים מוצלחים</div>
          <div style={styles.kpiValue}>{kpiDeliveries}</div>
          <div style={styles.kpiHint}>שהגיעו ליעדם</div>
        </div>
        <div style={{ ...styles.kpiCard, borderTop: `3px solid ${COLORS.red}` }}>
          <div style={styles.kpiLabel}>נכשלו / נשמטו</div>
          <div style={styles.kpiValue}>{kpiFailures}</div>
          <div style={styles.kpiHint}>שגיאות + queue full</div>
        </div>
      </div>

      {/* CONSUMERS PANEL */}
      <div style={styles.panel}>
        <div style={styles.panelHeader}>
          <h2 style={styles.panelTitle}>צרכנים פעילים</h2>
          <span style={styles.panelMeta}>
            {consumers.filter(c => c.active).length} פעילים מתוך {consumers.length}
          </span>
        </div>
        {consumers.length === 0 ? (
          <div style={styles.emptyState}>אין צרכנים רשומים עדיין</div>
        ) : (
          <table style={styles.table}>
            <thead style={styles.thead}>
              <tr>
                <th style={styles.th}>שם</th>
                <th style={styles.th}>תיאור</th>
                <th style={{ ...styles.th, width: 80 }}>סטטוס</th>
                <th style={{ ...styles.th, width: 90, textAlign: 'left' }}>התקבלו</th>
                <th style={{ ...styles.th, width: 90, textAlign: 'left' }}>עובדו</th>
                <th style={{ ...styles.th, width: 80, textAlign: 'left' }}>נכשלו</th>
                <th style={{ ...styles.th, width: 80, textAlign: 'left' }}>נשמטו</th>
                <th style={{ ...styles.th, width: 110, textAlign: 'left' }}>זמן ממוצע</th>
              </tr>
            </thead>
            <tbody>
              {consumers.map((c) => {
                const isHover = hoveredRow === c.id;
                return (
                  <tr
                    key={c.id}
                    style={{
                      background: isHover ? COLORS.panelAlt : 'transparent',
                      transition: 'background 0.15s ease',
                      cursor: 'default',
                    }}
                    onMouseEnter={() => setHoveredRow(c.id)}
                    onMouseLeave={() => setHoveredRow(null)}
                  >
                    <td style={{ ...styles.td, fontWeight: 600 }}>{c.name}</td>
                    <td style={{ ...styles.td, color: COLORS.textMuted, fontSize: 12 }}>
                      {c.description}
                    </td>
                    <td style={styles.td}>
                      {c.active ? (
                        <span style={{ color: COLORS.green }}>🟢 פעיל</span>
                      ) : (
                        <span style={{ color: COLORS.red }}>🔴 כבוי</span>
                      )}
                    </td>
                    <td style={{ ...styles.td, textAlign: 'left', fontVariantNumeric: 'tabular-nums' }}>
                      {formatNumber(c.stats.received)}
                    </td>
                    <td style={{ ...styles.td, textAlign: 'left', fontVariantNumeric: 'tabular-nums', color: COLORS.green }}>
                      {formatNumber(c.stats.processed)}
                    </td>
                    <td style={{ ...styles.td, textAlign: 'left', fontVariantNumeric: 'tabular-nums', color: c.stats.failed > 0 ? COLORS.red : COLORS.textDim }}>
                      {formatNumber(c.stats.failed)}
                    </td>
                    <td style={{ ...styles.td, textAlign: 'left', fontVariantNumeric: 'tabular-nums', color: c.stats.dropped > 0 ? COLORS.yellow : COLORS.textDim }}>
                      {formatNumber(c.stats.dropped)}
                    </td>
                    <td style={{ ...styles.td, textAlign: 'left', fontVariantNumeric: 'tabular-nums', color: COLORS.textMuted }}>
                      {c.stats.avgProcessingMs.toFixed(1)} ms
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* TWO COLUMN: CATEGORIES + SOURCES */}
      <div style={styles.twoCol}>
        {/* CATEGORY BREAKDOWN */}
        <div style={styles.panel}>
          <div style={styles.panelHeader}>
            <h2 style={styles.panelTitle}>פילוח לפי קטגוריה</h2>
            <span style={styles.panelMeta}>{sortedCategories.length} קטגוריות</span>
          </div>
          {sortedCategories.length === 0 ? (
            <div style={styles.emptyState}>עדיין אין נתונים לפילוח</div>
          ) : (
            <div>
              {sortedCategories.map(([cat, count]) => {
                const pct = (count / maxCategoryCount) * 100;
                return (
                  <div key={cat} style={styles.barRow}>
                    <div style={styles.barLabel}>{categoryLabel(cat)}</div>
                    <div style={styles.barTrack}>
                      <div
                        style={{
                          ...styles.barFill,
                          width: `${pct}%`,
                          background: categoryColor(cat),
                        }}
                      />
                    </div>
                    <div style={styles.barCount}>{formatNumber(count)}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* SOURCE BREAKDOWN */}
        <div style={styles.panel}>
          <div style={styles.panelHeader}>
            <h2 style={styles.panelTitle}>פילוח לפי מקור</h2>
            <span style={styles.panelMeta}>{sortedSources.length} מקורות</span>
          </div>
          {sortedSources.length === 0 ? (
            <div style={styles.emptyState}>עדיין אין נתונים לפילוח</div>
          ) : (
            <div>
              {sortedSources.map(([src, count]) => {
                const pct = (count / maxSourceCount) * 100;
                return (
                  <div key={src} style={styles.barRow}>
                    <div style={styles.barLabel}>{src}</div>
                    <div style={styles.barTrack}>
                      <div
                        style={{
                          ...styles.barFill,
                          width: `${pct}%`,
                          background: COLORS.blue,
                        }}
                      />
                    </div>
                    <div style={styles.barCount}>{formatNumber(count)}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* RECENT PACKETS — LIVE STREAM */}
      <div style={styles.panel}>
        <div style={styles.panelHeader}>
          <h2 style={styles.panelTitle}>חבילות אחרונות</h2>
          <span style={styles.panelMeta}>
            מציג {filteredPackets.length} חבילות (חי)
          </span>
        </div>

        {/* CATEGORY FILTER */}
        <div style={styles.filterRow}>
          <span style={styles.filterLabel}>סנן לפי קטגוריה:</span>
          <select
            style={styles.select}
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value as DataCategory | 'all')}
          >
            <option value="all">כל הקטגוריות</option>
            {ALL_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {categoryLabel(cat)}
              </option>
            ))}
          </select>
        </div>

        {/* PACKET HEADER ROW */}
        <div
          style={{
            ...styles.packetRow,
            background: COLORS.panelAlt,
            color: COLORS.textMuted,
            fontSize: 11,
            fontWeight: 600,
            textTransform: 'uppercase' as const,
            letterSpacing: 0.5,
            borderBottom: `1px solid ${COLORS.borderStrong}`,
          }}
        >
          <div>זמן</div>
          <div>קטגוריה</div>
          <div>תגיות</div>
          <div>מקור</div>
          <div style={{ textAlign: 'left' }}>עדיפות</div>
          <div style={{ textAlign: 'left' }}>ניתוב</div>
        </div>

        {/* PACKET ROWS */}
        {filteredPackets.length === 0 ? (
          <div style={styles.emptyState}>
            {selectedCategory === 'all'
              ? 'עדיין לא עברו חבילות במערכת'
              : `אין חבילות בקטגוריה "${categoryLabel(selectedCategory)}"`}
          </div>
        ) : (
          filteredPackets.map((p) => {
            const isHover = hoveredRow === p.id;
            const targetCount = p.distribution.targetConsumers.length;
            const deliveredCount = p.distribution.deliveredTo.length;
            const successFull = deliveredCount === targetCount && targetCount > 0;
            return (
              <div
                key={p.id}
                style={{
                  ...styles.packetRow,
                  background: isHover ? COLORS.panelAlt : 'transparent',
                  transition: 'background 0.15s ease',
                }}
                onMouseEnter={() => setHoveredRow(p.id)}
                onMouseLeave={() => setHoveredRow(null)}
              >
                <div style={{ color: COLORS.textMuted, fontSize: 11 }}>
                  {relativeTime(p.timestamp)}
                </div>
                <div>
                  <span
                    style={{
                      ...styles.chip,
                      background: categoryColor(p.category),
                    }}
                  >
                    {categoryLabel(p.category)}
                  </span>
                </div>
                <div>
                  {p.tags.length === 0 ? (
                    <span style={{ color: COLORS.textDim, fontSize: 11 }}>—</span>
                  ) : (
                    p.tags.slice(0, 5).map((tag, i) => (
                      <span key={`${p.id}-tag-${i}`} style={styles.pill}>
                        {String(tag)}
                      </span>
                    ))
                  )}
                </div>
                <div style={{ color: COLORS.text, fontSize: 12 }}>
                  {p.source.name}
                </div>
                <div style={{ textAlign: 'left', color: COLORS.textMuted, fontVariantNumeric: 'tabular-nums' }}>
                  {p.metadata.priority}
                </div>
                <div
                  style={{
                    textAlign: 'left',
                    fontVariantNumeric: 'tabular-nums',
                    color: successFull ? COLORS.green : (deliveredCount > 0 ? COLORS.yellow : COLORS.red),
                    fontWeight: 600,
                  }}
                >
                  {targetCount} → {deliveredCount}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* EVENT LOG (TERMINAL STYLE) */}
      <div style={styles.panel}>
        <div style={styles.panelHeader}>
          <h2 style={styles.panelTitle}>יומן אירועים</h2>
          <span style={styles.panelMeta}>50 הרשומות האחרונות</span>
        </div>
        <div style={styles.eventLog}>
          {eventLog.length === 0 ? (
            <div style={{ ...styles.eventLine, color: COLORS.textDim }}>
              [אין אירועים עדיין — צור אירוע בדיקה כדי לראות פעילות]
            </div>
          ) : (
            eventLog.slice(0, 50).map((ev, idx) => {
              const typeColor =
                ev.type === 'ingested' ? COLORS.green :
                ev.type === 'error' ? COLORS.red :
                ev.type === 'warning' ? COLORS.yellow :
                COLORS.blue;
              return (
                <div key={`${ev.packetId}-${idx}`} style={styles.eventLine}>
                  <span style={{ color: COLORS.textDim }}>[{formatTime(ev.timestamp)}]</span>
                  {' '}
                  <span style={{ color: typeColor, fontWeight: 600 }}>{ev.type.toUpperCase()}</span>
                  {' '}
                  <span style={{ color: COLORS.purple }}>{ev.packetId}</span>
                  {' '}
                  <span style={{ color: COLORS.text }}>{ev.detail}</span>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* FOOTER */}
      <div
        style={{
          textAlign: 'center',
          color: COLORS.textDim,
          fontSize: 11,
          marginTop: 20,
          paddingTop: 16,
          borderTop: `1px solid ${COLORS.border}`,
        }}
      >
        Techno-Kol Ops · Data Flow Monitor · רענון אוטומטי כל 2 שניות
      </div>
    </div>
  );
}

export default DataFlowMonitor;
