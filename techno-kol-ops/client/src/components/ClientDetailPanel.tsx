import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Callout,
  Drawer,
  DrawerSize,
  Intent,
  Position,
  Spinner,
  Tab,
  Tabs,
  Tag,
} from '@blueprintjs/core';
import { AgGridReact } from 'ag-grid-react';
import type { ColDef, ValueFormatterParams } from 'ag-grid-community';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { apiGet } from '../hooks/useApi';
import { theme } from '../styles/theme';

// ─────────────────────────────────────
// Types
// ─────────────────────────────────────
interface Client {
  id: string;
  name: string;
  type: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  credit_limit: string;
  balance_due: string;
  total_revenue: string;
  is_active: boolean;
  created_at: string;
}

interface ClientOrder {
  id: string;
  product: string;
  category: string;
  material_primary: string;
  price: string;
  status: string;
  progress: number;
  priority: string;
  open_date: string;
  delivery_date: string;
  delivered_date: string | null;
}

interface ClientPayment {
  id: string;
  order_id: string | null;
  type: string;
  category: string | null;
  amount: string;
  description: string | null;
  date: string;
  is_paid: boolean;
  paid_at: string | null;
  reference: string | null;
}

interface ClientDetail {
  client: Client;
  orders: ClientOrder[];
  payments: ClientPayment[];
  balance_due: string;
}

interface ClientDetailPanelProps {
  clientId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

// ─────────────────────────────────────
// Formatters
// ─────────────────────────────────────
function formatCurrency(value: number | string | null | undefined): string {
  const n = typeof value === 'string' ? Number(value) : value ?? 0;
  if (!Number.isFinite(n)) return '₪0';
  return `₪${Math.round(n).toLocaleString('he-IL')}`;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
}

const STATUS_INTENT: Record<string, Intent> = {
  pending: Intent.NONE,
  production: Intent.PRIMARY,
  finishing: Intent.WARNING,
  ready: Intent.SUCCESS,
  delivered: Intent.SUCCESS,
  cancelled: Intent.DANGER,
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'ממתין',
  production: 'בייצור',
  finishing: 'גימור',
  ready: 'מוכן',
  delivered: 'נמסר',
  cancelled: 'בוטל',
};

const TYPE_LABELS: Record<string, string> = {
  contractor: 'קבלן',
  developer: 'יזם',
  hotel: 'מלון',
  corporate: 'חברה',
};

// ─────────────────────────────────────
// Component
// ─────────────────────────────────────
const ClientDetailPanel: React.FC<ClientDetailPanelProps> = ({ clientId, isOpen, onClose }) => {
  const [detail, setDetail] = useState<ClientDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>('orders');

  useEffect(() => {
    if (!isOpen || !clientId) return;

    let cancelled = false;
    setLoading(true);
    setError(null);
    setDetail(null);

    apiGet<ClientDetail>(`/api/clients/${clientId}`)
      .then((data) => {
        if (!cancelled) {
          setDetail(data);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'שגיאה בטעינה');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [clientId, isOpen]);

  // Computed metrics
  const metrics = useMemo(() => {
    if (!detail) return null;
    const orders = detail.orders || [];
    const openOrders = orders.filter(
      (o) => o.status !== 'delivered' && o.status !== 'cancelled'
    ).length;
    return {
      totalRevenue: Number(detail.client.total_revenue) || 0,
      balanceDue: Number(detail.balance_due) || 0,
      openOrders,
      lifetimeOrders: orders.length,
    };
  }, [detail]);

  // Build 12-month revenue trend from payments
  const trendData = useMemo(() => {
    if (!detail) return [];
    const now = new Date();
    const buckets: { key: string; label: string; revenue: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(-2)}`;
      buckets.push({ key, label, revenue: 0 });
    }
    for (const p of detail.payments || []) {
      if (p.type !== 'income' && p.type !== 'advance') continue;
      const d = new Date(p.date);
      if (Number.isNaN(d.getTime())) continue;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const bucket = buckets.find((b) => b.key === key);
      if (bucket) bucket.revenue += Number(p.amount) || 0;
    }
    return buckets;
  }, [detail]);

  // Orders Grid columns
  const orderColumns = useMemo<ColDef<ClientOrder>[]>(
    () => [
      { headerName: 'מספר', field: 'id', width: 100, cellStyle: { fontWeight: 600 } },
      { headerName: 'מוצר', field: 'product', flex: 2, minWidth: 140 },
      { headerName: 'קטגוריה', field: 'category', width: 110 },
      {
        headerName: 'מחיר',
        field: 'price',
        width: 110,
        valueFormatter: (p: ValueFormatterParams<ClientOrder>) => formatCurrency(p.value),
        cellStyle: { fontWeight: 600, color: theme.accent.success },
      },
      {
        headerName: 'סטטוס',
        field: 'status',
        width: 110,
        cellRenderer: (p: { value?: string }) => {
          const v = p.value ?? '';
          return (
            <Tag intent={STATUS_INTENT[v] ?? Intent.NONE} minimal style={{ borderRadius: 2 }}>
              {STATUS_LABELS[v] ?? v}
            </Tag>
          );
        },
      },
      {
        headerName: 'התקדמות',
        field: 'progress',
        width: 100,
        valueFormatter: (p: ValueFormatterParams<ClientOrder>) => `${p.value ?? 0}%`,
      },
      {
        headerName: 'פתיחה',
        field: 'open_date',
        width: 90,
        valueFormatter: (p: ValueFormatterParams<ClientOrder>) => formatDate(p.value as string),
      },
      {
        headerName: 'מסירה',
        field: 'delivery_date',
        width: 90,
        valueFormatter: (p: ValueFormatterParams<ClientOrder>) => formatDate(p.value as string),
      },
    ],
    []
  );

  const defaultColDef = useMemo<ColDef>(
    () => ({ resizable: true, sortable: true }),
    []
  );

  const handleTabChange = useCallback((id: string) => {
    setActiveTab(id);
  }, []);

  const drawerTitle = detail?.client.name ?? (loading ? 'טוען...' : 'לקוח');

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      position={Position.LEFT}
      size={DrawerSize.LARGE}
      title={drawerTitle}
      icon="person"
      hasBackdrop
      canOutsideClickClose
      canEscapeKeyClose
      style={{
        direction: 'rtl',
        background: theme.bg.panel,
        borderRadius: 2,
      }}
    >
      <div
        dir="rtl"
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          overflow: 'hidden',
          background: theme.bg.panel,
          color: theme.text.primary,
        }}
      >
        {loading && (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <Spinner size={32} intent={Intent.PRIMARY} />
            <div style={{ color: theme.text.secondary, fontSize: 12 }}>טוען נתוני לקוח...</div>
          </div>
        )}

        {error && (
          <div style={{ padding: 16 }}>
            <Callout intent={Intent.DANGER} icon="error" style={{ borderRadius: 2 }}>
              {error}
            </Callout>
          </div>
        )}

        {!loading && !error && detail && metrics && (
          <>
            {/* Profile */}
            <div
              style={{
                padding: 16,
                borderBottom: `1px solid ${theme.border}`,
                background: theme.bg.sidebar,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  marginBottom: 12,
                }}
              >
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: theme.text.primary }}>
                    {detail.client.name}
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                    <Tag minimal style={{ borderRadius: 2 }}>
                      {TYPE_LABELS[detail.client.type] ?? detail.client.type}
                    </Tag>
                    <Tag
                      intent={detail.client.is_active ? Intent.SUCCESS : Intent.NONE}
                      minimal
                      style={{ borderRadius: 2 }}
                    >
                      {detail.client.is_active ? 'פעיל' : 'לא פעיל'}
                    </Tag>
                  </div>
                </div>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 8,
                  fontSize: 12,
                }}
              >
                <div>
                  <div style={{ color: theme.text.secondary, fontSize: 10, textTransform: 'uppercase' }}>
                    איש קשר
                  </div>
                  <div>{detail.client.contact_name || '-'}</div>
                </div>
                <div>
                  <div style={{ color: theme.text.secondary, fontSize: 10, textTransform: 'uppercase' }}>
                    טלפון
                  </div>
                  <div>{detail.client.phone || '-'}</div>
                </div>
                <div>
                  <div style={{ color: theme.text.secondary, fontSize: 10, textTransform: 'uppercase' }}>
                    אימייל
                  </div>
                  <div style={{ direction: 'ltr', textAlign: 'right' }}>
                    {detail.client.email || '-'}
                  </div>
                </div>
                <div>
                  <div style={{ color: theme.text.secondary, fontSize: 10, textTransform: 'uppercase' }}>
                    כתובת
                  </div>
                  <div>{detail.client.address || '-'}</div>
                </div>
              </div>
            </div>

            {/* Metrics row */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 8,
                padding: 12,
                borderBottom: `1px solid ${theme.border}`,
              }}
            >
              <MetricBox
                label="הכנסות"
                value={formatCurrency(metrics.totalRevenue)}
                color={theme.accent.success}
              />
              <MetricBox
                label="יתרה לתשלום"
                value={formatCurrency(metrics.balanceDue)}
                color={
                  metrics.balanceDue > Number(detail.client.credit_limit)
                    ? theme.accent.danger
                    : theme.text.primary
                }
              />
              <MetricBox
                label="הזמנות פתוחות"
                value={String(metrics.openOrders)}
                color={theme.accent.primary}
              />
              <MetricBox
                label='סה"כ הזמנות'
                value={String(metrics.lifetimeOrders)}
                color={theme.text.primary}
              />
            </div>

            {/* Tabs */}
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <Tabs
                id="client-detail-tabs"
                selectedTabId={activeTab}
                onChange={(newTabId) => handleTabChange(String(newTabId))}
                renderActiveTabPanelOnly
                className="client-detail-tabs"
              >
                <Tab
                  id="orders"
                  title={`הזמנות (${detail.orders.length})`}
                  panel={
                    <div
                      className="ag-theme-quartz-dark"
                      style={{ width: '100%', height: 420 }}
                    >
                      <AgGridReact<ClientOrder>
                        rowData={detail.orders}
                        columnDefs={orderColumns}
                        defaultColDef={defaultColDef}
                        enableRtl
                        rowHeight={34}
                        headerHeight={32}
                        suppressCellFocus
                      />
                    </div>
                  }
                />
                <Tab
                  id="payments"
                  title={`תשלומים (${detail.payments.length})`}
                  panel={
                    <div
                      style={{
                        maxHeight: 420,
                        overflow: 'auto',
                        padding: '4px 0',
                      }}
                    >
                      {detail.payments.length === 0 ? (
                        <div
                          style={{
                            padding: 24,
                            textAlign: 'center',
                            color: theme.text.secondary,
                            fontSize: 12,
                          }}
                        >
                          אין תשלומים
                        </div>
                      ) : (
                        detail.payments.map((p) => (
                          <div
                            key={p.id}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              padding: '10px 16px',
                              borderBottom: `1px solid ${theme.border}`,
                              fontSize: 12,
                            }}
                          >
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 600 }}>
                                {p.description ?? p.category ?? p.type}
                              </div>
                              <div
                                style={{
                                  color: theme.text.secondary,
                                  fontSize: 10,
                                  marginTop: 2,
                                }}
                              >
                                {formatDate(p.date)} · {p.type}
                                {p.reference ? ` · ${p.reference}` : ''}
                              </div>
                            </div>
                            <div style={{ textAlign: 'left', direction: 'ltr' }}>
                              <div
                                style={{
                                  fontWeight: 700,
                                  color:
                                    p.type === 'income' || p.type === 'advance'
                                      ? theme.accent.success
                                      : theme.accent.warning,
                                }}
                              >
                                {formatCurrency(p.amount)}
                              </div>
                              <Tag
                                intent={p.is_paid ? Intent.SUCCESS : Intent.WARNING}
                                minimal
                                style={{ borderRadius: 2, marginTop: 2 }}
                              >
                                {p.is_paid ? 'שולם' : 'פתוח'}
                              </Tag>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  }
                />
                <Tab
                  id="trend"
                  title="מגמה"
                  panel={
                    <div style={{ padding: 12, height: 420 }}>
                      <div
                        style={{
                          fontSize: 11,
                          color: theme.text.secondary,
                          marginBottom: 8,
                          textTransform: 'uppercase',
                        }}
                      >
                        הכנסות ב-12 החודשים האחרונים
                      </div>
                      <ResponsiveContainer width="100%" height={360}>
                        <LineChart data={trendData}>
                          <CartesianGrid strokeDasharray="3 3" stroke={theme.border} />
                          <XAxis
                            dataKey="label"
                            stroke={theme.text.secondary}
                            fontSize={10}
                            reversed
                          />
                          <YAxis
                            stroke={theme.text.secondary}
                            fontSize={10}
                            tickFormatter={(v: number) =>
                              `₪${Math.round(v / 1000)}K`
                            }
                            orientation="right"
                          />
                          <Tooltip
                            contentStyle={{
                              background: theme.bg.sidebar,
                              border: `1px solid ${theme.border}`,
                              borderRadius: 2,
                              fontSize: 11,
                            }}
                            labelStyle={{ color: theme.text.primary }}
                            formatter={(v: number) => formatCurrency(v)}
                          />
                          <Line
                            type="monotone"
                            dataKey="revenue"
                            stroke={theme.accent.primary}
                            strokeWidth={2}
                            dot={{ fill: theme.accent.primary, r: 3 }}
                            activeDot={{ r: 5 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  }
                />
              </Tabs>
            </div>
          </>
        )}
      </div>
    </Drawer>
  );
};

// ─────────────────────────────────────
// Metric Box
// ─────────────────────────────────────
interface MetricBoxProps {
  label: string;
  value: string;
  color: string;
}

const MetricBox: React.FC<MetricBoxProps> = ({ label, value, color }) => (
  <div
    style={{
      background: theme.bg.main,
      border: `1px solid ${theme.border}`,
      borderRadius: 2,
      padding: '10px 12px',
    }}
  >
    <div
      style={{
        fontSize: 9,
        color: theme.text.secondary,
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
      }}
    >
      {label}
    </div>
    <div
      style={{
        fontSize: 16,
        fontWeight: 700,
        color,
        marginTop: 4,
      }}
    >
      {value}
    </div>
  </div>
);

export default ClientDetailPanel;
