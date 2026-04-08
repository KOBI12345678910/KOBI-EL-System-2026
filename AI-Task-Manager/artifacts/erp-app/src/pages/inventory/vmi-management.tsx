import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import {
  Truck, Plus, X, Edit2, Loader2, AlertTriangle, CheckCircle2,
  Package, BarChart3, Clock, TrendingUp, TrendingDown, Bell, Trash2,
  ChevronDown, ChevronUp, RefreshCw, ArrowRight
} from "lucide-react";

const API = "/api";

interface VmiSupplier {
  id: number;
  supplier_id: number;
  supplier_name: string;
  supplier_number: string;
  is_vmi: boolean;
  vmi_contract_number: string;
  replenishment_lead_days: number;
  review_frequency_days: number;
  managed_items_count: number;
  performance_score: string;
  notes: string;
  created_at: string;
}

interface VmiItem {
  id: number;
  vmi_supplier_id: number;
  material_id: number;
  material_name: string;
  material_number: string;
  current_stock: string;
  unit: string;
  category: string;
  warehouse_location: string;
  min_threshold: string;
  max_threshold: string;
  target_level: string;
  replenishment_qty: string;
  status: string;
  stock_status: string;
  fill_percent: string;
  last_replenishment_date: string;
  supplier_name: string;
}

interface ReplenishmentOrder {
  id: number;
  order_number: string;
  material_name: string;
  supplier_name: string;
  quantity: string;
  unit: string;
  status: string;
  expected_delivery_date: string;
  actual_delivery_date: string;
  created_at: string;
  stock_level_at_order: string;
}

interface SupplierOption {
  id: number;
  supplier_name: string;
  supplier_number: string;
}

interface MaterialOption {
  id: number;
  materialName: string;
  materialNumber: string;
}

interface VmiPerformanceRow {
  supplier_name: string;
  managed_items: number | string;
  total_orders: number | string;
  items_below_min: number | string;
}

interface TraditionalPerformance {
  total_orders: number | string;
  received_orders: number | string;
  avg_delivery_variance_days: string | null;
}

interface PerfReport {
  vmiPerformance?: VmiPerformanceRow[];
  traditionalPerformance?: TraditionalPerformance;
}

interface VmiAlert {
  id: number;
  material_name: string;
  material_number: string;
  current_stock: string;
  unit: string;
  min_threshold: string;
  supplier_name: string;
  alert_type: string;
  overdue: boolean;
  replenishment_due_date: string;
}

const STOCK_STATUS_COLORS: Record<string, string> = {
  out_of_stock: "text-red-400 bg-red-500/10 border-red-500/20",
  below_min: "text-orange-400 bg-orange-500/10 border-orange-500/20",
  low: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
  ok: "text-green-400 bg-green-500/10 border-green-500/20",
  above_max: "text-blue-400 bg-blue-500/10 border-blue-500/20",
};

const STOCK_STATUS_LABELS: Record<string, string> = {
  out_of_stock: "אזל",
  below_min: "מתחת למינימום",
  low: "נמוך",
  ok: "תקין",
  above_max: "מעל המקסימום",
};

const ORDER_STATUS_COLORS: Record<string, string> = {
  pending: "text-blue-400 bg-blue-500/10",
  confirmed: "text-cyan-400 bg-cyan-500/10",
  in_transit: "text-amber-400 bg-amber-500/10",
  delivered: "text-green-400 bg-green-500/10",
  cancelled: "text-red-400 bg-red-500/10",
};

export default function VmiManagementPage() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<"dashboard" | "suppliers" | "items" | "orders" | "report">("dashboard");
  const [showAddSupplier, setShowAddSupplier] = useState(false);
  const [showAddItem, setShowAddItem] = useState(false);
  const [showReplenishModal, setShowReplenishModal] = useState<VmiItem | null>(null);
  const [supplierForm, setSupplierForm] = useState({ supplierId: "", replenishmentLeadDays: "3", reviewFrequencyDays: "7", vmiContractNumber: "", notes: "" });
  const [itemForm, setItemForm] = useState({ vmiSupplierId: "", materialId: "", minThreshold: "", maxThreshold: "", targetLevel: "", replenishmentQty: "", notes: "" });
  const [replenishForm, setReplenishForm] = useState({ quantity: "", expectedDeliveryDate: "", notes: "" });

  const { data: vmiSuppliers = [] } = useQuery<VmiSupplier[]>({
    queryKey: ["vmi-suppliers"],
    queryFn: async () => {
      const r = await authFetch(`${API}/vmi/suppliers`);
      return r.json();
    },
  });

  const { data: vmiItems = [] } = useQuery<VmiItem[]>({
    queryKey: ["vmi-items"],
    queryFn: async () => {
      const r = await authFetch(`${API}/vmi/items`);
      return r.json();
    },
  });

  const { data: orders = [] } = useQuery<ReplenishmentOrder[]>({
    queryKey: ["vmi-orders"],
    queryFn: async () => {
      const r = await authFetch(`${API}/vmi/replenishment-orders`);
      return r.json();
    },
  });

  const { data: alerts = [] } = useQuery<VmiAlert[]>({
    queryKey: ["vmi-alerts"],
    queryFn: async () => {
      const r = await authFetch(`${API}/vmi/alerts`);
      return r.json();
    },
    refetchInterval: 60000,
  });

  const { data: suppliersRaw = [] } = useQuery<SupplierOption[]>({
    queryKey: ["suppliers-list"],
    queryFn: async () => { const r = await authFetch(`${API}/suppliers`); return r.json(); },
  });

  const { data: materialsRaw = [] } = useQuery<MaterialOption[]>({
    queryKey: ["materials-list"],
    queryFn: async () => { const r = await authFetch(`${API}/raw-materials`); return r.json(); },
  });

  const { data: perfReport } = useQuery<PerfReport>({
    queryKey: ["vmi-performance"],
    queryFn: async () => {
      const r = await authFetch(`${API}/vmi/performance-report`);
      return r.json();
    },
    enabled: activeTab === "report",
  });

  const addSupplierMut = useMutation({
    mutationFn: async (data: typeof supplierForm) => {
      const r = await authFetch(`${API}/vmi/suppliers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId: parseInt(data.supplierId),
          replenishmentLeadDays: parseInt(data.replenishmentLeadDays),
          reviewFrequencyDays: parseInt(data.reviewFrequencyDays),
          vmiContractNumber: data.vmiContractNumber,
          notes: data.notes,
        }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message); }
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vmi-suppliers"] });
      setShowAddSupplier(false);
      setSupplierForm({ supplierId: "", replenishmentLeadDays: "3", reviewFrequencyDays: "7", vmiContractNumber: "", notes: "" });
    },
  });

  const addItemMut = useMutation({
    mutationFn: async (data: typeof itemForm) => {
      const r = await authFetch(`${API}/vmi/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vmiSupplierId: parseInt(data.vmiSupplierId),
          materialId: parseInt(data.materialId),
          minThreshold: data.minThreshold,
          maxThreshold: data.maxThreshold,
          targetLevel: data.targetLevel || null,
          replenishmentQty: data.replenishmentQty || null,
          notes: data.notes,
        }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message); }
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vmi-items"] });
      setShowAddItem(false);
      setItemForm({ vmiSupplierId: "", materialId: "", minThreshold: "", maxThreshold: "", targetLevel: "", replenishmentQty: "", notes: "" });
    },
  });

  const deleteSupplierMut = useMutation({
    mutationFn: async (id: number) => {
      await authFetch(`${API}/vmi/suppliers/${id}`, { method: "DELETE" });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vmi-suppliers", "vmi-items"] }),
  });

  const deleteItemMut = useMutation({
    mutationFn: async (id: number) => {
      await authFetch(`${API}/vmi/items/${id}`, { method: "DELETE" });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vmi-items"] }),
  });

  const replenishMut = useMutation({
    mutationFn: async ({ item, form }: { item: VmiItem; form: typeof replenishForm }) => {
      const vmiSupplier = vmiSuppliers.find(s => s.id === item.vmi_supplier_id);
      const r = await authFetch(`${API}/vmi/replenishment-orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vmiItemId: item.id,
          materialId: item.material_id,
          supplierId: vmiSupplier?.supplier_id,
          quantity: form.quantity,
          unit: item.unit,
          expectedDeliveryDate: form.expectedDeliveryDate || null,
          notes: form.notes,
          createdBy: "VMI",
        }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message); }
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vmi-orders", "vmi-items", "vmi-alerts"] });
      setShowReplenishModal(null);
      setReplenishForm({ quantity: "", expectedDeliveryDate: "", notes: "" });
    },
  });

  const dashboardStats = {
    totalSuppliers: vmiSuppliers.length,
    totalItems: vmiItems.length,
    belowMin: vmiItems.filter(i => i.stock_status === "below_min" || i.stock_status === "out_of_stock").length,
    pendingOrders: orders.filter(o => o.status === "pending" || o.status === "confirmed").length,
    alerts: alerts.length,
  };

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center">
              <Truck className="w-6 h-6 text-foreground" />
            </div>
            VMI — ניהול מלאי על ידי ספקים
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Vendor Managed Inventory — ספקים מנהלים את מלאי הפריטים שלהם</p>
        </div>
        {alerts.length > 0 && (
          <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2">
            <Bell className="w-4 h-4 text-red-400 animate-pulse" />
            <span className="text-red-400 text-sm font-medium">{alerts.length} התראות VMI פעילות</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {[
          { label: "ספקי VMI", value: dashboardStats.totalSuppliers, color: "text-teal-400", bg: "bg-teal-500/10" },
          { label: "פריטים מנוהלים", value: dashboardStats.totalItems, color: "text-cyan-400", bg: "bg-cyan-500/10" },
          { label: "מתחת למינימום", value: dashboardStats.belowMin, color: "text-red-400", bg: "bg-red-500/10" },
          { label: "הזמנות פעילות", value: dashboardStats.pendingOrders, color: "text-blue-400", bg: "bg-blue-500/10" },
          { label: "התראות", value: dashboardStats.alerts, color: "text-orange-400", bg: "bg-orange-500/10" },
        ].map(s => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-3">
            <p className="text-muted-foreground text-xs">{s.label}</p>
            <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {alerts.length > 0 && (
        <div className="bg-card border border-red-500/30 rounded-xl p-4">
          <h3 className="font-semibold text-red-400 flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4" />התראות VMI — פריטים הדורשים פעולה
          </h3>
          <div className="space-y-2">
            {alerts.slice(0, 5).map(alert => (
              <div key={alert.id} className="flex items-center justify-between bg-card rounded-lg p-3">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${alert.alert_type === "out_of_stock" ? "bg-red-400" : "bg-orange-400"} animate-pulse`} />
                  <div>
                    <p className="text-foreground text-sm font-medium">{alert.material_name}</p>
                    <p className="text-muted-foreground text-xs">{alert.supplier_name} · מלאי: {parseFloat(alert.current_stock || "0").toFixed(1)} (מינ׳: {parseFloat(alert.min_threshold).toFixed(1)}) {alert.unit}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {alert.overdue && <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full">באיחור</span>}
                  <span className={`text-xs px-2 py-0.5 rounded-full ${alert.alert_type === "out_of_stock" ? "bg-red-500/20 text-red-400" : "bg-orange-500/20 text-orange-400"}`}>
                    {alert.alert_type === "out_of_stock" ? "אזל מהמלאי" : "מתחת למינימום"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {([ 
          { key: "dashboard", label: "מבט כולל" },
          { key: "suppliers", label: "ספקי VMI" },
          { key: "items", label: "פריטים מנוהלים" },
          { key: "orders", label: "הזמנות חידוש" },
          { key: "report", label: "דוח ביצועים" },
        ] as Array<{ key: "dashboard" | "suppliers" | "items" | "orders" | "report"; label: string }>).map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === tab.key ? "bg-teal-600 text-foreground" : "bg-card border border-border text-muted-foreground hover:text-foreground"}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "dashboard" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-card border border-border rounded-xl p-4">
            <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
              <Package className="w-4 h-4 text-teal-400" />מצב פריטי VMI
            </h3>
            <div className="space-y-2">
              {vmiItems.slice(0, 8).map(item => (
                <div key={item.id} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <p className="text-sm text-foreground truncate">{item.material_name}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${STOCK_STATUS_COLORS[item.stock_status] || "text-gray-400 bg-gray-500/10 border-gray-500/20"}`}>
                        {STOCK_STATUS_LABELS[item.stock_status] || item.stock_status}
                      </span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-1.5">
                      <div
                        className={`h-1.5 rounded-full transition-all ${parseFloat(item.fill_percent) <= 0 ? "bg-red-500" : parseFloat(item.fill_percent) < 30 ? "bg-orange-500" : parseFloat(item.fill_percent) < 60 ? "bg-yellow-500" : "bg-green-500"}`}
                        style={{ width: `${Math.min(100, Math.max(0, parseFloat(item.fill_percent || "0")))}%` }}
                      />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground w-10 text-left flex-shrink-0">
                    {parseFloat(item.fill_percent || "0").toFixed(0)}%
                  </p>
                </div>
              ))}
              {vmiItems.length === 0 && <p className="text-muted-foreground text-sm text-center py-4">אין פריטי VMI</p>}
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl p-4">
            <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4 text-cyan-400" />הזמנות חידוש אחרונות
            </h3>
            <div className="space-y-2">
              {orders.slice(0, 6).map(order => (
                <div key={order.id} className="flex items-center justify-between bg-card rounded-lg p-2.5">
                  <div>
                    <p className="text-sm text-foreground">{order.material_name}</p>
                    <p className="text-xs text-muted-foreground">{order.order_number} · {order.supplier_name}</p>
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-medium text-teal-400">{parseFloat(order.quantity).toFixed(0)} {order.unit}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${ORDER_STATUS_COLORS[order.status] || "text-gray-400 bg-gray-500/10"}`}>
                      {order.status}
                    </span>
                  </div>
                </div>
              ))}
              {orders.length === 0 && <p className="text-muted-foreground text-sm text-center py-4">אין הזמנות חידוש</p>}
            </div>
          </div>
        </div>
      )}

      {activeTab === "suppliers" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={() => setShowAddSupplier(true)}
              className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-foreground rounded-xl font-medium text-sm"
            >
              <Plus className="w-4 h-4" />הוסף ספק VMI
            </button>
          </div>

          {vmiSuppliers.length === 0 ? (
            <div className="text-center py-16 bg-card rounded-xl border border-border">
              <Truck className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">אין ספקי VMI — לחץ "הוסף ספק VMI" להתחלה</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {vmiSuppliers.map(s => (
                <div key={s.id} className="bg-card border border-border rounded-xl p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-foreground">{s.supplier_name}</p>
                      <p className="text-xs text-muted-foreground">{s.supplier_number}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs bg-teal-500/10 text-teal-400 border border-teal-500/20 px-2 py-0.5 rounded-full">VMI</span>
                      <button onClick={() => deleteSupplierMut.mutate(s.id)} className="p-1.5 text-muted-foreground hover:text-red-400 rounded-lg transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3 mt-3">
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground">פריטים</p>
                      <p className="text-lg font-bold text-teal-400 mt-0.5">{s.managed_items_count}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground">זמן אספקה</p>
                      <p className="text-lg font-bold text-foreground mt-0.5">{s.replenishment_lead_days}י׳</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground">סקירה כל</p>
                      <p className="text-lg font-bold text-foreground mt-0.5">{s.review_frequency_days}י׳</p>
                    </div>
                  </div>
                  {s.vmi_contract_number && (
                    <p className="text-xs text-muted-foreground mt-2">חוזה: {s.vmi_contract_number}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "items" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={() => setShowAddItem(true)}
              className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-foreground rounded-xl font-medium text-sm"
            >
              <Plus className="w-4 h-4" />הוסף פריט VMI
            </button>
          </div>

          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm text-right">
              <thead><tr className="border-b border-border bg-card">
                <th className="p-3 text-muted-foreground font-medium">חומר</th>
                <th className="p-3 text-muted-foreground font-medium">ספק</th>
                <th className="p-3 text-muted-foreground font-medium">מלאי נוכחי</th>
                <th className="p-3 text-muted-foreground font-medium">מינ׳</th>
                <th className="p-3 text-muted-foreground font-medium">מקס׳</th>
                <th className="p-3 text-muted-foreground font-medium">סטטוס</th>
                <th className="p-3 text-muted-foreground font-medium text-center">פעולות</th>
              </tr></thead>
              <tbody>
                {vmiItems.length === 0 ? (
                  <tr><td colSpan={7} className="p-12 text-center text-muted-foreground">אין פריטי VMI</td></tr>
                ) : vmiItems.map(item => (
                  <tr key={item.id} className="border-b border-border/50 hover:bg-muted">
                    <td className="p-3">
                      <p className="text-foreground font-medium">{item.material_name}</p>
                      <p className="text-xs text-muted-foreground">{item.material_number}</p>
                    </td>
                    <td className="p-3 text-muted-foreground">{item.supplier_name}</td>
                    <td className="p-3 text-cyan-400 font-mono">{parseFloat(item.current_stock || "0").toFixed(1)} {item.unit}</td>
                    <td className="p-3 text-muted-foreground font-mono">{parseFloat(item.min_threshold).toFixed(1)}</td>
                    <td className="p-3 text-muted-foreground font-mono">{parseFloat(item.max_threshold).toFixed(1)}</td>
                    <td className="p-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${STOCK_STATUS_COLORS[item.stock_status] || "text-gray-400 bg-gray-500/10 border-gray-500/20"}`}>
                        {STOCK_STATUS_LABELS[item.stock_status] || item.stock_status}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => { setShowReplenishModal(item); setReplenishForm({ quantity: item.replenishment_qty || "", expectedDeliveryDate: "", notes: "" }); }}
                          className="text-xs px-2 py-1 bg-teal-600/20 text-teal-400 rounded-lg hover:bg-teal-600/40 transition-colors"
                        >
                          חדש מלאי
                        </button>
                        <button onClick={() => deleteItemMut.mutate(item.id)} className="p-1 text-muted-foreground hover:text-red-400 rounded transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === "orders" && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm text-right">
            <thead><tr className="border-b border-border bg-card">
              <th className="p-3 text-muted-foreground font-medium">מספר הזמנה</th>
              <th className="p-3 text-muted-foreground font-medium">חומר</th>
              <th className="p-3 text-muted-foreground font-medium">ספק</th>
              <th className="p-3 text-muted-foreground font-medium">כמות</th>
              <th className="p-3 text-muted-foreground font-medium">אספקה צפויה</th>
              <th className="p-3 text-muted-foreground font-medium">סטטוס</th>
            </tr></thead>
            <tbody>
              {orders.length === 0 ? (
                <tr><td colSpan={6} className="p-12 text-center text-muted-foreground">אין הזמנות חידוש</td></tr>
              ) : orders.map(order => (
                <tr key={order.id} className="border-b border-border/50 hover:bg-muted">
                  <td className="p-3 text-teal-400 font-mono text-xs">{order.order_number}</td>
                  <td className="p-3 text-foreground">{order.material_name}</td>
                  <td className="p-3 text-muted-foreground">{order.supplier_name}</td>
                  <td className="p-3 text-cyan-400 font-mono">{parseFloat(order.quantity).toFixed(1)} {order.unit}</td>
                  <td className="p-3 text-muted-foreground text-xs">{order.expected_delivery_date ? new Date(order.expected_delivery_date).toLocaleDateString("he-IL") : "—"}</td>
                  <td className="p-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${ORDER_STATUS_COLORS[order.status] || "text-gray-400 bg-gray-500/10"}`}>
                      {order.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === "report" && perfReport && (
        <div className="space-y-4">
          <h3 className="font-semibold text-foreground">השוואת ביצועים: VMI לעומת רכש מסורתי</h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-card border border-border rounded-xl p-4">
              <h4 className="text-sm font-medium text-teal-400 mb-3 flex items-center gap-2"><Truck className="w-4 h-4" />ספקי VMI</h4>
              {perfReport.vmiPerformance?.length === 0 ? (
                <p className="text-muted-foreground text-sm">אין נתוני VMI עדיין</p>
              ) : (
                <div className="space-y-3">
                  {(perfReport.vmiPerformance || []).map((v: VmiPerformanceRow, i: number) => (
                    <div key={i} className="bg-card rounded-lg p-3">
                      <p className="font-medium text-foreground">{v.supplier_name}</p>
                      <div className="grid grid-cols-3 gap-2 mt-2 text-xs">
                        <div><p className="text-muted-foreground">פריטים</p><p className="text-teal-400 font-mono">{v.managed_items}</p></div>
                        <div><p className="text-muted-foreground">הזמנות</p><p className="text-cyan-400 font-mono">{v.total_orders}</p></div>
                        <div><p className="text-muted-foreground">מתחת למינ׳</p><p className={`font-mono ${parseInt(v.items_below_min) > 0 ? "text-red-400" : "text-green-400"}`}>{v.items_below_min}</p></div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="bg-card border border-border rounded-xl p-4">
              <h4 className="text-sm font-medium text-blue-400 mb-3 flex items-center gap-2"><Package className="w-4 h-4" />רכש מסורתי (6 חודשים אחרונים)</h4>
              <div className="space-y-3">
                {[
                  { label: "סה״כ הזמנות", value: perfReport.traditionalPerformance?.total_orders || 0, color: "text-blue-400" },
                  { label: "התקבלו", value: perfReport.traditionalPerformance?.received_orders || 0, color: "text-green-400" },
                  { label: "סטייה ממוצעת אספקה", value: perfReport.traditionalPerformance?.avg_delivery_variance_days ? `${parseFloat(perfReport.traditionalPerformance.avg_delivery_variance_days).toFixed(1)} ימים` : "—", color: "text-amber-400" },
                ].map(item => (
                  <div key={item.label} className="flex items-center justify-between bg-card rounded-lg p-3">
                    <p className="text-sm text-muted-foreground">{item.label}</p>
                    <p className={`text-sm font-bold font-mono ${item.color}`}>{item.value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {showAddSupplier && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setShowAddSupplier(false)}>
          <div className="bg-card border border-border rounded-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="font-bold text-foreground">הוסף ספק VMI</h2>
              <button onClick={() => setShowAddSupplier(false)}><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">ספק *</label>
                <select value={supplierForm.supplierId} onChange={e => setSupplierForm(f => ({ ...f, supplierId: e.target.value }))}
                  className="w-full bg-card border border-border rounded-lg px-3 py-2 text-foreground focus:border-teal-500 focus:outline-none text-sm">
                  <option value="">בחר ספק...</option>
                  {(Array.isArray(suppliersRaw) ? suppliersRaw : []).map((s: SupplierOption) => (
                    <option key={s.id} value={s.id}>{s.supplier_name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">זמן אספקה (ימים)</label>
                  <input type="number" value={supplierForm.replenishmentLeadDays} onChange={e => setSupplierForm(f => ({ ...f, replenishmentLeadDays: e.target.value }))}
                    className="w-full bg-card border border-border rounded-lg px-3 py-2 text-foreground focus:border-teal-500 focus:outline-none text-sm" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">תדירות סקירה (ימים)</label>
                  <input type="number" value={supplierForm.reviewFrequencyDays} onChange={e => setSupplierForm(f => ({ ...f, reviewFrequencyDays: e.target.value }))}
                    className="w-full bg-card border border-border rounded-lg px-3 py-2 text-foreground focus:border-teal-500 focus:outline-none text-sm" />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">מספר חוזה VMI</label>
                <input type="text" value={supplierForm.vmiContractNumber} onChange={e => setSupplierForm(f => ({ ...f, vmiContractNumber: e.target.value }))}
                  className="w-full bg-card border border-border rounded-lg px-3 py-2 text-foreground focus:border-teal-500 focus:outline-none text-sm" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">הערות</label>
                <textarea rows={2} value={supplierForm.notes} onChange={e => setSupplierForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full bg-card border border-border rounded-lg px-3 py-2 text-foreground focus:border-teal-500 focus:outline-none text-sm resize-none" />
              </div>
            </div>
            <div className="flex items-center gap-2 p-4 border-t border-border justify-end">
              <button onClick={() => setShowAddSupplier(false)} className="px-4 py-2 border border-border text-muted-foreground rounded-lg text-sm">ביטול</button>
              <button
                onClick={() => addSupplierMut.mutate(supplierForm)}
                disabled={!supplierForm.supplierId || addSupplierMut.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-foreground rounded-lg text-sm font-medium disabled:opacity-60"
              >
                {addSupplierMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                הוסף
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddItem && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setShowAddItem(false)}>
          <div className="bg-card border border-border rounded-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="font-bold text-foreground">הוסף פריט VMI</h2>
              <button onClick={() => setShowAddItem(false)}><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">ספק VMI *</label>
                <select value={itemForm.vmiSupplierId} onChange={e => setItemForm(f => ({ ...f, vmiSupplierId: e.target.value }))}
                  className="w-full bg-card border border-border rounded-lg px-3 py-2 text-foreground focus:border-teal-500 focus:outline-none text-sm">
                  <option value="">בחר ספק VMI...</option>
                  {vmiSuppliers.map(s => <option key={s.id} value={s.id}>{s.supplier_name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">חומר *</label>
                <select value={itemForm.materialId} onChange={e => setItemForm(f => ({ ...f, materialId: e.target.value }))}
                  className="w-full bg-card border border-border rounded-lg px-3 py-2 text-foreground focus:border-teal-500 focus:outline-none text-sm">
                  <option value="">בחר חומר...</option>
                  {(Array.isArray(materialsRaw) ? materialsRaw : []).map((m: MaterialOption) => (
                    <option key={m.id} value={m.id}>{m.materialName} ({m.materialNumber})</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">רמת מינימום *</label>
                  <input type="number" value={itemForm.minThreshold} onChange={e => setItemForm(f => ({ ...f, minThreshold: e.target.value }))}
                    className="w-full bg-card border border-border rounded-lg px-3 py-2 text-foreground focus:border-teal-500 focus:outline-none text-sm" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">רמת מקסימום *</label>
                  <input type="number" value={itemForm.maxThreshold} onChange={e => setItemForm(f => ({ ...f, maxThreshold: e.target.value }))}
                    className="w-full bg-card border border-border rounded-lg px-3 py-2 text-foreground focus:border-teal-500 focus:outline-none text-sm" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">כמות חידוש</label>
                  <input type="number" value={itemForm.replenishmentQty} onChange={e => setItemForm(f => ({ ...f, replenishmentQty: e.target.value }))}
                    className="w-full bg-card border border-border rounded-lg px-3 py-2 text-foreground focus:border-teal-500 focus:outline-none text-sm" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">רמת יעד</label>
                  <input type="number" value={itemForm.targetLevel} onChange={e => setItemForm(f => ({ ...f, targetLevel: e.target.value }))}
                    className="w-full bg-card border border-border rounded-lg px-3 py-2 text-foreground focus:border-teal-500 focus:outline-none text-sm" />
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 p-4 border-t border-border justify-end">
              <button onClick={() => setShowAddItem(false)} className="px-4 py-2 border border-border text-muted-foreground rounded-lg text-sm">ביטול</button>
              <button
                onClick={() => addItemMut.mutate(itemForm)}
                disabled={!itemForm.vmiSupplierId || !itemForm.materialId || !itemForm.minThreshold || !itemForm.maxThreshold || addItemMut.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-foreground rounded-lg text-sm font-medium disabled:opacity-60"
              >
                {addItemMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                הוסף פריט
              </button>
            </div>
          </div>
        </div>
      )}

      {showReplenishModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setShowReplenishModal(null)}>
          <div className="bg-card border border-border rounded-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="font-bold text-foreground">הזמנת חידוש מלאי — {showReplenishModal.material_name}</h2>
              <button onClick={() => setShowReplenishModal(null)}><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>
            <div className="p-4 space-y-3">
              <div className="bg-card rounded-lg p-3 text-xs text-muted-foreground">
                מלאי נוכחי: <span className="text-cyan-400">{parseFloat(showReplenishModal.current_stock || "0").toFixed(1)} {showReplenishModal.unit}</span> · מינ׳: {parseFloat(showReplenishModal.min_threshold).toFixed(1)} · מקס׳: {parseFloat(showReplenishModal.max_threshold).toFixed(1)}
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">כמות להזמנה *</label>
                <input type="number" value={replenishForm.quantity} onChange={e => setReplenishForm(f => ({ ...f, quantity: e.target.value }))}
                  className="w-full bg-card border border-border rounded-lg px-3 py-2 text-foreground focus:border-teal-500 focus:outline-none" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">תאריך אספקה צפוי</label>
                <input type="date" value={replenishForm.expectedDeliveryDate} onChange={e => setReplenishForm(f => ({ ...f, expectedDeliveryDate: e.target.value }))}
                  className="w-full bg-card border border-border rounded-lg px-3 py-2 text-foreground focus:border-teal-500 focus:outline-none" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">הערות</label>
                <textarea rows={2} value={replenishForm.notes} onChange={e => setReplenishForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full bg-card border border-border rounded-lg px-3 py-2 text-foreground focus:border-teal-500 focus:outline-none resize-none text-sm" />
              </div>
            </div>
            <div className="flex items-center gap-2 p-4 border-t border-border justify-end">
              <button onClick={() => setShowReplenishModal(null)} className="px-4 py-2 border border-border text-muted-foreground rounded-lg text-sm">ביטול</button>
              <button
                onClick={() => replenishMut.mutate({ item: showReplenishModal, form: replenishForm })}
                disabled={!replenishForm.quantity || replenishMut.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-foreground rounded-lg text-sm font-medium disabled:opacity-60"
              >
                {replenishMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Truck className="w-3.5 h-3.5" />}
                שלח הזמנת חידוש
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
