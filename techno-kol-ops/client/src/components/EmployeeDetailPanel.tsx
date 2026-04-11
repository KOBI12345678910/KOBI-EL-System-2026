import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Drawer, Icon, Spinner, Tab, Tabs, Tag } from '@blueprintjs/core';
import { ResponsiveContainer, Tooltip, XAxis, YAxis, ScatterChart, Scatter, Cell } from 'recharts';
import { useApi } from '../hooks/useApi';
import { theme } from '../styles/theme';

type AttendanceStatus = 'present' | 'field' | 'absent';

interface EmployeeDetail {
  id: string | number;
  name: string;
  role: string;
  department: string;
  phone: string;
  email?: string;
  salary: number;
  employment_type: string;
  start_date: string;
  photo_url?: string;
  today_status?: AttendanceStatus;
  current_order_id?: string | number;
  current_order_name?: string;
  location?: string;
  month_hours?: number;
  month_cost?: number;
  month_revenue?: number;
  expected_month_hours?: number;
}

interface AttendanceRecord {
  date: string;
  status: AttendanceStatus;
  location?: string;
  hours?: number;
}

interface EmployeeDetailPanelProps {
  employeeId: string | number | null;
  isOpen: boolean;
  onClose: () => void;
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function statusColor(status?: AttendanceStatus): string {
  switch (status) {
    case 'present':
      return theme.accent.success;
    case 'field':
      return theme.accent.warning;
    case 'absent':
      return theme.accent.danger;
    default:
      return '#404854';
  }
}

function statusLabel(s?: AttendanceStatus): string {
  switch (s) {
    case 'present':
      return 'נוכח';
    case 'field':
      return 'בשטח';
    case 'absent':
      return 'נעדר';
    default:
      return '—';
  }
}

const EmployeeDetailPanel: React.FC<EmployeeDetailPanelProps> = ({ employeeId, isOpen, onClose }) => {
  const api = useApi();
  const [detail, setDetail] = useState<EmployeeDetail | null>(null);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>('overview');

  const load = useCallback(async () => {
    if (employeeId == null) return;
    setLoading(true);
    setError(null);
    try {
      const now = new Date();
      const from = new Date(now);
      from.setDate(from.getDate() - 89);
      const [d, att] = await Promise.all([
        api.get<EmployeeDetail>(`/api/employees/${employeeId}`),
        api.get<AttendanceRecord[]>(
          `/api/attendance?employee_id=${employeeId}&from=${toISODate(from)}&to=${toISODate(now)}`
        ),
      ]);
      setDetail(d);
      setAttendance(Array.isArray(att) ? att : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בטעינת פרטי עובד');
    } finally {
      setLoading(false);
    }
  }, [api, employeeId]);

  useEffect(() => {
    if (isOpen && employeeId != null) {
      load();
    } else {
      setDetail(null);
      setAttendance([]);
      setActiveTab('overview');
    }
  }, [isOpen, employeeId, load]);

  const heatmapData = useMemo(() => {
    const map = new Map<string, AttendanceRecord>();
    attendance.forEach((a) => map.set(a.date.slice(0, 10), a));
    const result: { x: number; y: number; date: string; status?: AttendanceStatus; location?: string }[] = [];
    const today = new Date();
    const start = new Date(today);
    start.setDate(start.getDate() - 89);
    for (let i = 0; i < 90; i += 1) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const iso = toISODate(d);
      const rec = map.get(iso);
      const week = Math.floor(i / 7);
      const day = d.getDay();
      result.push({
        x: week,
        y: day,
        date: iso,
        status: rec?.status,
        location: rec?.location,
      });
    }
    return result;
  }, [attendance]);

  const monthSummary = useMemo(() => {
    const hours = detail?.month_hours ?? 0;
    const expected = detail?.expected_month_hours ?? 160;
    const cost = detail?.month_cost ?? 0;
    const revenue = detail?.month_revenue ?? 0;
    const roi = hours > 0 ? revenue / hours : 0;
    const pct = expected > 0 ? Math.min(100, (hours / expected) * 100) : 0;
    return { hours, expected, cost, revenue, roi, pct };
  }, [detail]);

  const attendanceSummary = useMemo(() => {
    let present = 0;
    let field = 0;
    let absent = 0;
    for (const r of attendance) {
      if (r.status === 'present') present += 1;
      else if (r.status === 'field') field += 1;
      else if (r.status === 'absent') absent += 1;
    }
    return { present, field, absent };
  }, [attendance]);

  const renderOverview = () => {
    if (!detail) return null;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 16 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              background: '#404854',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: theme.text.primary,
              fontSize: 22,
              fontWeight: 700,
              border: `1px solid ${theme.border}`,
            }}
          >
            {detail.name.charAt(0)}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: theme.text.primary }}>{detail.name}</div>
            <div style={{ fontSize: 12, color: theme.text.secondary }}>
              {detail.role} · {detail.department}
            </div>
            <div style={{ marginTop: 6, display: 'flex', gap: 12, fontSize: 11, color: theme.text.secondary }}>
              <span>
                <Icon icon="phone" size={10} /> {detail.phone}
              </span>
              {detail.email && (
                <span>
                  <Icon icon="envelope" size={10} /> {detail.email}
                </span>
              )}
            </div>
          </div>
        </div>

        <div
          style={{
            background: theme.bg.main,
            border: `1px solid ${theme.border}`,
            borderRadius: 2,
            padding: 12,
          }}
        >
          <div style={{ fontSize: 11, color: theme.text.secondary, marginBottom: 8, textTransform: 'uppercase' }}>
            היום
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 12, color: theme.text.secondary }}>סטטוס נוכחות</span>
            <Tag
              intent={
                detail.today_status === 'present'
                  ? 'success'
                  : detail.today_status === 'field'
                  ? 'warning'
                  : detail.today_status === 'absent'
                  ? 'danger'
                  : 'none'
              }
              minimal
              style={{ borderRadius: 2 }}
            >
              {statusLabel(detail.today_status)}
            </Tag>
          </div>
          {detail.current_order_name && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 12, color: theme.text.secondary }}>משימה פעילה</span>
              <span style={{ fontSize: 12, color: theme.text.primary }}>{detail.current_order_name}</span>
            </div>
          )}
          {detail.location && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, color: theme.text.secondary }}>מיקום</span>
              <span style={{ fontSize: 12, color: theme.text.primary }}>
                <Icon icon="map-marker" size={10} /> {detail.location}
              </span>
            </div>
          )}
        </div>

        <div
          style={{
            background: theme.bg.main,
            border: `1px solid ${theme.border}`,
            borderRadius: 2,
            padding: 12,
          }}
        >
          <div style={{ fontSize: 11, color: theme.text.secondary, marginBottom: 8, textTransform: 'uppercase' }}>
            חודש נוכחי
          </div>
          <div style={{ fontSize: 12, color: theme.text.secondary, marginBottom: 4 }}>
            שעות עבודה: {monthSummary.hours.toFixed(0)} / {monthSummary.expected}
          </div>
          <div
            style={{
              height: 6,
              background: 'rgba(255,255,255,0.08)',
              borderRadius: 2,
              overflow: 'hidden',
              marginBottom: 10,
            }}
          >
            <div
              style={{
                width: `${monthSummary.pct}%`,
                height: '100%',
                background: theme.accent.primary,
              }}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 11 }}>
            <div>
              <div style={{ color: theme.text.secondary }}>עלות</div>
              <div style={{ color: theme.text.primary, fontSize: 13, fontWeight: 600 }}>
                ₪{monthSummary.cost.toLocaleString('he-IL')}
              </div>
            </div>
            <div>
              <div style={{ color: theme.text.secondary }}>הכנסות</div>
              <div style={{ color: theme.text.primary, fontSize: 13, fontWeight: 600 }}>
                ₪{monthSummary.revenue.toLocaleString('he-IL')}
              </div>
            </div>
          </div>
          <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
            <span style={{ color: theme.text.secondary }}>נוכח</span>
            <span style={{ color: theme.accent.success }}>{attendanceSummary.present}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
            <span style={{ color: theme.text.secondary }}>בשטח</span>
            <span style={{ color: theme.accent.warning }}>{attendanceSummary.field}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
            <span style={{ color: theme.text.secondary }}>נעדר</span>
            <span style={{ color: theme.accent.danger }}>{attendanceSummary.absent}</span>
          </div>
        </div>

        <div
          style={{
            background: theme.bg.main,
            border: `1px solid ${theme.border}`,
            borderRadius: 2,
            padding: 12,
          }}
        >
          <div style={{ fontSize: 11, color: theme.text.secondary, marginBottom: 4, textTransform: 'uppercase' }}>
            ROI
          </div>
          <div style={{ fontSize: 18, fontWeight: 600, color: theme.accent.primary }}>
            ₪{monthSummary.roi.toFixed(0)} / שעה
          </div>
          <div style={{ fontSize: 11, color: theme.text.secondary }}>הכנסה ממוצעת לשעת עבודה</div>
        </div>
      </div>
    );
  };

  const renderHeatmap = () => (
    <div style={{ padding: 16 }}>
      <div
        style={{
          background: theme.bg.main,
          border: `1px solid ${theme.border}`,
          borderRadius: 2,
          padding: 12,
        }}
      >
        <div style={{ fontSize: 11, color: theme.text.secondary, marginBottom: 8, textTransform: 'uppercase' }}>
          נוכחות 90 יום
        </div>
        <div style={{ height: 180, width: '100%' }}>
          <ResponsiveContainer>
            <ScatterChart margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
              <XAxis type="number" dataKey="x" hide domain={[-0.5, 13.5]} />
              <YAxis type="number" dataKey="y" hide domain={[-0.5, 6.5]} reversed />
              <Tooltip
                cursor={{ stroke: theme.border }}
                contentStyle={{
                  background: theme.bg.panel,
                  border: `1px solid ${theme.border}`,
                  borderRadius: 2,
                  fontSize: 11,
                }}
                formatter={(_v, _n, p: { payload?: { date: string; status?: AttendanceStatus; location?: string } }) => {
                  const d = p?.payload;
                  if (!d) return '';
                  return `${d.date} · ${statusLabel(d.status)}${d.location ? ` · ${d.location}` : ''}`;
                }}
              />
              <Scatter data={heatmapData} shape="square">
                {heatmapData.map((entry, i) => (
                  <Cell key={i} fill={statusColor(entry.status)} />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 10, color: theme.text.secondary }}>
          <span>
            <span
              style={{
                display: 'inline-block',
                width: 10,
                height: 10,
                background: theme.accent.success,
                marginLeft: 4,
                verticalAlign: 'middle',
              }}
            />
            נוכח
          </span>
          <span>
            <span
              style={{
                display: 'inline-block',
                width: 10,
                height: 10,
                background: theme.accent.warning,
                marginLeft: 4,
                verticalAlign: 'middle',
              }}
            />
            בשטח
          </span>
          <span>
            <span
              style={{
                display: 'inline-block',
                width: 10,
                height: 10,
                background: theme.accent.danger,
                marginLeft: 4,
                verticalAlign: 'middle',
              }}
            />
            נעדר
          </span>
        </div>
      </div>
    </div>
  );

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      position="left"
      size={420}
      title="פרטי עובד"
      className="bp5-dark"
      style={{ background: theme.bg.panel, direction: 'rtl' }}
    >
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
          <Spinner size={30} />
        </div>
      ) : error ? (
        <div
          style={{
            margin: 16,
            padding: 12,
            border: `1px solid ${theme.accent.danger}`,
            borderRadius: 2,
            color: theme.accent.danger,
            fontSize: 12,
          }}
        >
          {error}
        </div>
      ) : detail ? (
        <Tabs
          id="employee-detail-tabs"
          selectedTabId={activeTab}
          onChange={(id) => setActiveTab(String(id))}
          renderActiveTabPanelOnly
        >
          <Tab id="overview" title="סקירה" panel={renderOverview() ?? <div />} />
          <Tab id="attendance" title="יומן נוכחות" panel={renderHeatmap()} />
        </Tabs>
      ) : (
        <div style={{ padding: 16, color: theme.text.secondary }}>בחר עובד להצגת פרטים</div>
      )}
    </Drawer>
  );
};

export default EmployeeDetailPanel;
