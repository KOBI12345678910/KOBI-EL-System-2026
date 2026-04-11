// ─────────────────────────────────────────────────────────────
// OrderDetailPanel.tsx
//
// Blueprint Drawer that shows the full detail of a WorkOrder.
// It is opened from both Dashboard.tsx and WorkOrders.tsx when
// the user clicks a row in the orders grid.
//
// Tabs:
//   1. Details    — editable form, saves via PUT /api/work-orders/:id
//   2. Employees  — list + assign new employees
//   3. Materials  — material_movements filtered to this order
//   4. Timeline   — order_events vertical timeline
//   5. Financial  — financial_transactions list + totals + margin
//
// Progress slider sits in the drawer header (above the tabs) and
// updates optimistically via PUT /api/work-orders/:id/progress.
// ─────────────────────────────────────────────────────────────
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  Drawer,
  DrawerSize,
  Tabs,
  Tab,
  Button,
  Intent,
  FormGroup,
  InputGroup,
  TextArea,
  HTMLSelect,
  Slider,
  Spinner,
  Tag,
  NonIdealState,
  Callout,
  Divider,
  HTMLTable,
  MenuItem,
} from '@blueprintjs/core';
import { useApi } from '../hooks/useApi';
import { theme } from '../styles/theme';
import type {
  WorkOrder,
  WorkOrderEmployee,
  MaterialMovement,
  OrderEvent,
  FinancialTransaction,
  Employee,
} from '../../../src/types';

// ─── helpers ─────────────────────────────────────────────────
const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const fmtIls = (v: unknown) => {
  const n = typeof v === 'string' ? parseFloat(v) : (v as number);
  if (!Number.isFinite(n)) return '₪0';
  return '₪' + nf.format(Math.round(n));
};
const fmtDate = (d: string | null | undefined) => {
  if (!d) return '—';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return '—';
  const dd = String(dt.getDate()).padStart(2, '0');
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const yy = String(dt.getFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
};
const fmtDateTime = (d: string | null | undefined) => {
  if (!d) return '—';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return '—';
  return `${fmtDate(d)} ${String(dt.getHours()).padStart(2, '0')}:${String(
    dt.getMinutes()
  ).padStart(2, '0')}`;
};

const STATUS_INTENT: Record<string, Intent> = {
  pending: Intent.NONE,
  production: Intent.PRIMARY,
  finishing: Intent.WARNING,
  ready: Intent.SUCCESS,
  delivered: Intent.SUCCESS,
  cancelled: Intent.DANGER,
};

const STATUS_OPTIONS = [
  'pending',
  'production',
  'finishing',
  'ready',
  'delivered',
  'cancelled',
];
const PRIORITY_OPTIONS = ['low', 'normal', 'high', 'urgent'];
const MATERIAL_OPTIONS = [
  'iron',
  'aluminum',
  'stainless',
  'glass',
  'mixed',
];
const CATEGORY_OPTIONS = [
  'railings',
  'gates',
  'fences',
  'pergolas',
  'stairs',
  'glass',
];

// ─── props ───────────────────────────────────────────────────
export interface OrderDetailPanelProps {
  /** Order id to show. When null/undefined the drawer is hidden. */
  orderId: string | null;
  /** Called when the drawer requests to close. */
  onClose: () => void;
  /** Called after a successful save so parents can refresh grid rows. */
  onSaved?: (updated: WorkOrder) => void;
}

// ─── component ───────────────────────────────────────────────
export const OrderDetailPanel: React.FC<OrderDetailPanelProps> = ({
  orderId,
  onClose,
  onSaved,
}) => {
  const api = useApi();
  const [activeTab, setActiveTab] = useState<string>('details');
  const [order, setOrder] = useState<WorkOrder | null>(null);
  const [draft, setDraft] = useState<Partial<WorkOrder>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<number>(0);

  // Tab-specific collections
  const [employees, setEmployees] = useState<
    Array<WorkOrderEmployee & { name?: string }>
  >([]);
  const [allEmployees, setAllEmployees] = useState<Employee[]>([]);
  const [movements, setMovements] = useState<
    Array<MaterialMovement & { item_name?: string }>
  >([]);
  const [events, setEvents] = useState<OrderEvent[]>([]);
  const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);

  // ─── load order detail + related collections ──────────────
  const loadAll = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    setError(null);
    try {
      const [o, emps, allEmps, mvmts, evts, txns] = await Promise.all([
        api.get<WorkOrder>(`/api/work-orders/${orderId}`),
        api
          .get<Array<WorkOrderEmployee & { name?: string }>>(
            `/api/work-orders/${orderId}/employees`
          )
          .catch(() => [] as Array<WorkOrderEmployee & { name?: string }>),
        api.get<Employee[]>(`/api/employees`).catch(() => [] as Employee[]),
        api
          .get<Array<MaterialMovement & { item_name?: string }>>(
            `/api/work-orders/${orderId}/materials`
          )
          .catch(
            () => [] as Array<MaterialMovement & { item_name?: string }>
          ),
        api
          .get<OrderEvent[]>(`/api/work-orders/${orderId}/events`)
          .catch(() => [] as OrderEvent[]),
        api
          .get<FinancialTransaction[]>(
            `/api/work-orders/${orderId}/financial`
          )
          .catch(() => [] as FinancialTransaction[]),
      ]);
      setOrder(o);
      setDraft(o ?? {});
      setProgress(o?.progress ?? 0);
      setEmployees(emps);
      setAllEmployees(allEmps);
      setMovements(mvmts);
      setEvents(evts);
      setTransactions(txns);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load order detail');
    } finally {
      setLoading(false);
    }
  }, [api, orderId]);

  useEffect(() => {
    if (orderId) loadAll();
  }, [orderId, loadAll]);

  // ─── save handlers ────────────────────────────────────────
  const handleSave = async () => {
    if (!order) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await api.put<WorkOrder>(
        `/api/work-orders/${order.id}`,
        draft
      );
      setOrder(updated);
      setDraft(updated);
      onSaved?.(updated);
    } catch (e: any) {
      setError(e?.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleProgressCommit = async (val: number) => {
    if (!order) return;
    setProgress(val);
    try {
      const updated = await api.put<WorkOrder>(
        `/api/work-orders/${order.id}/progress`,
        { progress: val }
      );
      setOrder(updated);
      setDraft((prev) => ({ ...prev, progress: val }));
      onSaved?.(updated);
    } catch (e: any) {
      setError(e?.message ?? 'Progress update failed');
    }
  };

  const handleAssignEmployee = async (employeeId: string) => {
    if (!order) return;
    try {
      await api.post(`/api/work-orders/${order.id}/employees`, {
        employee_id: employeeId,
      });
      const emps = await api.get<
        Array<WorkOrderEmployee & { name?: string }>
      >(`/api/work-orders/${order.id}/employees`);
      setEmployees(emps);
    } catch (e: any) {
      setError(e?.message ?? 'Assignment failed');
    }
  };

  // ─── derived financials ───────────────────────────────────
  const financialTotals = useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const t of transactions) {
      const amt = parseFloat(String(t.amount));
      if (!Number.isFinite(amt)) continue;
      if (t.type === 'income' || t.type === 'advance') income += amt;
      else expense += amt;
    }
    const price = parseFloat(String(order?.price ?? '0')) || 0;
    const costActual = parseFloat(String(order?.cost_actual ?? '0')) || 0;
    const margin = price > 0 ? ((price - costActual) / price) * 100 : 0;
    return { income, expense, margin };
  }, [transactions, order]);

  const unassignedEmployees = useMemo(() => {
    const assignedIds = new Set(employees.map((e) => e.employee_id));
    return allEmployees.filter(
      (e) => e.is_active && !assignedIds.has(e.id)
    );
  }, [allEmployees, employees]);

  // ─── render helpers for each tab ──────────────────────────
  const renderDetails = () => {
    if (!order) return null;
    const d = draft as WorkOrder;
    return (
      <div style={{ padding: 16, overflowY: 'auto' }}>
        <FormGroup label="Order ID">
          <InputGroup value={order.id} disabled />
        </FormGroup>
        <FormGroup label="Product">
          <InputGroup
            value={d.product ?? ''}
            onChange={(e) =>
              setDraft({ ...draft, product: e.currentTarget.value })
            }
          />
        </FormGroup>
        <FormGroup label="Description">
          <TextArea
            fill
            value={d.description ?? ''}
            onChange={(e) =>
              setDraft({ ...draft, description: e.currentTarget.value })
            }
          />
        </FormGroup>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <FormGroup label="Category">
            <HTMLSelect
              fill
              value={d.category ?? ''}
              onChange={(e) =>
                setDraft({ ...draft, category: e.currentTarget.value })
              }
            >
              {CATEGORY_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </HTMLSelect>
          </FormGroup>
          <FormGroup label="Material">
            <HTMLSelect
              fill
              value={d.material_primary ?? ''}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  material_primary: e.currentTarget.value,
                })
              }
            >
              {MATERIAL_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </HTMLSelect>
          </FormGroup>
          <FormGroup label="Quantity">
            <InputGroup
              value={String(d.quantity ?? '')}
              onChange={(e) =>
                setDraft({ ...draft, quantity: e.currentTarget.value })
              }
            />
          </FormGroup>
          <FormGroup label="Unit">
            <InputGroup
              value={d.unit ?? ''}
              onChange={(e) =>
                setDraft({ ...draft, unit: e.currentTarget.value })
              }
            />
          </FormGroup>
          <FormGroup label="Price (₪)">
            <InputGroup
              value={String(d.price ?? '')}
              onChange={(e) =>
                setDraft({ ...draft, price: e.currentTarget.value })
              }
            />
          </FormGroup>
          <FormGroup label="Cost estimate (₪)">
            <InputGroup
              value={String(d.cost_estimate ?? '')}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  cost_estimate: e.currentTarget.value,
                })
              }
            />
          </FormGroup>
          <FormGroup label="Status">
            <HTMLSelect
              fill
              value={d.status ?? ''}
              onChange={(e) =>
                setDraft({ ...draft, status: e.currentTarget.value })
              }
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </HTMLSelect>
          </FormGroup>
          <FormGroup label="Priority">
            <HTMLSelect
              fill
              value={d.priority ?? ''}
              onChange={(e) =>
                setDraft({ ...draft, priority: e.currentTarget.value })
              }
            >
              {PRIORITY_OPTIONS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </HTMLSelect>
          </FormGroup>
          <FormGroup label="Open date">
            <InputGroup
              type="date"
              value={d.open_date ?? ''}
              onChange={(e) =>
                setDraft({ ...draft, open_date: e.currentTarget.value })
              }
            />
          </FormGroup>
          <FormGroup label="Delivery date">
            <InputGroup
              type="date"
              value={d.delivery_date ?? ''}
              onChange={(e) =>
                setDraft({ ...draft, delivery_date: e.currentTarget.value })
              }
            />
          </FormGroup>
        </div>
        <FormGroup label="Notes">
          <TextArea
            fill
            value={d.notes ?? ''}
            onChange={(e) =>
              setDraft({ ...draft, notes: e.currentTarget.value })
            }
          />
        </FormGroup>
        <Button
          intent={Intent.PRIMARY}
          icon="floppy-disk"
          loading={saving}
          onClick={handleSave}
        >
          Save changes
        </Button>
      </div>
    );
  };

  const renderEmployees = () => (
    <div style={{ padding: 16, overflowY: 'auto' }}>
      {employees.length === 0 ? (
        <NonIdealState
          icon="people"
          title="No employees assigned"
          description="Click + Assign to add an employee to this order."
        />
      ) : (
        <HTMLTable compact striped style={{ width: '100%' }}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Role on order</th>
              <th style={{ textAlign: 'right' }}>Hours</th>
              <th>Assigned</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((e) => (
              <tr key={e.id}>
                <td>{e.name ?? e.employee_id}</td>
                <td>{e.role_on_order ?? '—'}</td>
                <td style={{ textAlign: 'right' }}>{nf.format(parseFloat(String(e.hours_logged)) || 0)}</td>
                <td>{fmtDateTime(e.assigned_at)}</td>
              </tr>
            ))}
          </tbody>
        </HTMLTable>
      )}
      <Divider style={{ margin: '16px 0' }} />
      <FormGroup label="Assign employee">
        <div style={{ display: 'flex', gap: 8 }}>
          <HTMLSelect
            fill
            defaultValue=""
            onChange={(e) => {
              const val = e.currentTarget.value;
              if (val) handleAssignEmployee(val);
              e.currentTarget.value = '';
            }}
          >
            <option value="">+ Assign employee…</option>
            {unassignedEmployees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.name} ({emp.role})
              </option>
            ))}
          </HTMLSelect>
        </div>
      </FormGroup>
    </div>
  );

  const renderMaterials = () => (
    <div style={{ padding: 16, overflowY: 'auto' }}>
      {movements.length === 0 ? (
        <NonIdealState
          icon="box"
          title="No material movements"
          description="No materials have been consumed on this order yet."
        />
      ) : (
        <HTMLTable compact striped style={{ width: '100%' }}>
          <thead>
            <tr>
              <th>Date</th>
              <th>Item</th>
              <th>Type</th>
              <th style={{ textAlign: 'right' }}>Qty</th>
              <th style={{ textAlign: 'right' }}>Cost/unit</th>
            </tr>
          </thead>
          <tbody>
            {movements.map((m) => (
              <tr key={m.id}>
                <td>{fmtDate(m.created_at)}</td>
                <td>{m.item_name ?? m.item_id}</td>
                <td>
                  <Tag
                    minimal
                    intent={
                      m.type === 'consume' ? Intent.WARNING : Intent.PRIMARY
                    }
                  >
                    {m.type}
                  </Tag>
                </td>
                <td style={{ textAlign: 'right' }}>{nf.format(parseFloat(String(m.qty)) || 0)}</td>
                <td style={{ textAlign: 'right' }}>
                  {m.cost_per_unit != null ? fmtIls(m.cost_per_unit) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </HTMLTable>
      )}
    </div>
  );

  const renderTimeline = () => (
    <div style={{ padding: 16, overflowY: 'auto' }}>
      {events.length === 0 ? (
        <NonIdealState
          icon="history"
          title="No events"
          description="No events recorded for this order yet."
        />
      ) : (
        <div style={{ position: 'relative', paddingLeft: 24 }}>
          <div
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: 10,
              width: 2,
              background:
                ((theme as any)?.colors?.border as string) ??
                'rgba(0,0,0,0.15)',
            }}
          />
          {events.map((ev) => (
            <div
              key={ev.id}
              style={{ position: 'relative', padding: '6px 0 12px 14px' }}
            >
              <div
                style={{
                  position: 'absolute',
                  left: -17,
                  top: 10,
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background:
                    ((theme as any)?.colors?.primary as string) ?? '#3366FF',
                  border: '2px solid #fff',
                }}
              />
              <div style={{ fontSize: 11, color: '#999' }}>
                {fmtDateTime(ev.created_at)}
              </div>
              <div style={{ fontWeight: 600 }}>{ev.event_type}</div>
              <div style={{ fontSize: 13 }}>{ev.description}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderFinancial = () => (
    <div style={{ padding: 16, overflowY: 'auto' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: 12,
          marginBottom: 16,
        }}
      >
        <Callout intent={Intent.SUCCESS} title="Income">
          {fmtIls(financialTotals.income)}
        </Callout>
        <Callout intent={Intent.DANGER} title="Expense">
          {fmtIls(financialTotals.expense)}
        </Callout>
        <Callout
          intent={
            financialTotals.margin > 20
              ? Intent.SUCCESS
              : financialTotals.margin > 0
              ? Intent.WARNING
              : Intent.DANGER
          }
          title="Margin"
        >
          {financialTotals.margin.toFixed(1)}%
        </Callout>
      </div>
      {transactions.length === 0 ? (
        <NonIdealState
          icon="dollar"
          title="No transactions"
          description="No financial transactions recorded for this order yet."
        />
      ) : (
        <HTMLTable compact striped style={{ width: '100%' }}>
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Description</th>
              <th style={{ textAlign: 'right' }}>Amount</th>
              <th>Paid</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((t) => (
              <tr key={t.id}>
                <td>{fmtDate(t.date)}</td>
                <td>
                  <Tag minimal>{t.type}</Tag>
                </td>
                <td>{t.description ?? '—'}</td>
                <td style={{ textAlign: 'right' }}>{fmtIls(t.amount)}</td>
                <td>
                  <Tag
                    minimal
                    intent={t.is_paid ? Intent.SUCCESS : Intent.WARNING}
                  >
                    {t.is_paid ? 'paid' : 'open'}
                  </Tag>
                </td>
              </tr>
            ))}
          </tbody>
        </HTMLTable>
      )}
    </div>
  );

  // ─── render ──────────────────────────────────────────────
  const titleNode = order ? (
    <span>
      {order.id} ·{' '}
      <Tag
        minimal
        intent={STATUS_INTENT[order.status] ?? Intent.NONE}
        style={{ marginLeft: 6 }}
      >
        {order.status}
      </Tag>
    </span>
  ) : (
    'Work order'
  );

  return (
    <Drawer
      isOpen={Boolean(orderId)}
      onClose={onClose}
      size={DrawerSize.LARGE}
      title={titleNode}
      icon="clipboard"
      position="right"
      canOutsideClickClose
      canEscapeKeyClose
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          overflow: 'hidden',
        }}
      >
        {loading && (
          <div style={{ flex: 1, display: 'grid', placeItems: 'center' }}>
            <Spinner />
          </div>
        )}
        {error && (
          <Callout
            intent={Intent.DANGER}
            title="Error"
            style={{ margin: 12 }}
          >
            {error}
          </Callout>
        )}
        {!loading && order && (
          <>
            {/* Progress slider */}
            <div
              style={{
                padding: '14px 20px 4px',
                borderBottom:
                  '1px solid ' +
                  (((theme as any)?.colors?.border as string) ??
                    'rgba(0,0,0,0.1)'),
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: 6,
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 600 }}>
                  Progress
                </span>
                <span style={{ fontSize: 12, color: '#888' }}>
                  Client: {(order as any).client_name ?? order.client_id}
                </span>
              </div>
              <Slider
                min={0}
                max={100}
                stepSize={5}
                labelStepSize={25}
                value={progress}
                onChange={setProgress}
                onRelease={handleProgressCommit}
              />
            </div>
            <Tabs
              id="order-detail-tabs"
              selectedTabId={activeTab}
              onChange={(newTab) => setActiveTab(String(newTab))}
              renderActiveTabPanelOnly
              large
            >
              <Tab id="details" title="Details" panel={renderDetails()} />
              <Tab id="employees" title="Employees" panel={renderEmployees()} />
              <Tab id="materials" title="Materials" panel={renderMaterials()} />
              <Tab id="timeline" title="Timeline" panel={renderTimeline()} />
              <Tab id="financial" title="Financial" panel={renderFinancial()} />
            </Tabs>
          </>
        )}
      </div>
    </Drawer>
  );
};

export default OrderDetailPanel;
// unused import guards (kept for compatibility)
void MenuItem;
