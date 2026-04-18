import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import {
  Package, Truck, AlertTriangle, Clock,
  Loader2, ArrowRight, ShoppingCart, Settings,
} from "lucide-react";

const API = "/api";

interface VmiSupplierItem {
  id: number;
  supplier_id: number;
  supplier_name: string;
  supplier_number: string;
  is_vmi: boolean;
  vmi_contract_number: string;
  replenishment_lead_days: number;
  managed_items_count?: number;
}

interface ManagedItem {
  id: number;
  material_id: number;
  material_name: string;
  material_number: string;
  unit: string;
  current_stock: string;
  min_threshold: string;
  max_threshold: string;
  target_level: string;
  replenishment_qty: string;
  stock_status: "out_of_stock" | "below_min" | "low" | "ok" | "at_max";
  last_replenishment_date: string;
  warehouse_location: string;
  notes: string;
}

interface ReplenishParams {
  vmiItemId: number;
  quantity: string;
  expectedDeliveryDate?: string;
  notes?: string;
}

interface ThresholdParams {
  itemId: number;
  minThreshold: string;
  maxThreshold: string;
  targetLevel?: string;
  replenishmentQty?: string;
  notes?: string;
}

interface PortalData {
  supplier: {
    id: number;
    supplier_name: string;
    supplier_number: string;
    email: string;
    phone: string;
    replenishment_lead_days: number;
    review_frequency_days: number;
    vmi_contract_number: string;
    performance_score: string;
    last_review_date: string;
  };
  managedItems: Array<{
    id: number;
    material_id: number;
    material_name: string;
    material_number: string;
    unit: string;
    current_stock: string;
    min_threshold: string;
    max_threshold: string;
    target_level: string;
    replenishment_qty: string;
    stock_status: "out_of_stock" | "below_min" | "low" | "ok" | "at_max";
    last_replenishment_date: string;
    warehouse_location: string;
    notes: string;
  }>;
  recentOrders: Array<{
    id: number;
    order_number: string;
    material_name: string;
    quantity: string;
    unit: string;
    status: string;
    expected_delivery_date: string;
    actual_delivery_date: string;
    created_at: string;
  }>;
  alerts: {
    itemsNeedingReplenishment: number;
    criticalItems: Array<{ id: number; material_name: string; stock_status: string; current_stock: string; min_threshold: string }>;
  };
}

const stockStatusColor: Record<string, string> = {
  out_of_stock: "bg-red-100 text-red-800 border-red-300",
  below_min: "bg-orange-100 text-orange-800 border-orange-300",
  low: "bg-yellow-100 text-yellow-800 border-yellow-300",
  ok: "bg-green-100 text-green-800 border-green-300",
  at_max: "bg-blue-100 text-blue-800 border-blue-300",
};

const stockStatusLabel: Record<string, string> = {
  out_of_stock: "חוסר מלאי",
  below_min: "מתחת למינימום",
  low: "מלאי נמוך",
  ok: "תקין",
  at_max: "מלאי מקסימלי",
};

const orderStatusLabel: Record<string, string> = {
  pending: "ממתין",
  confirmed: "אושר",
  shipped: "נשלח",
  delivered: "נמסר",
  cancelled: "בוטל",
};

export default function VmiSupplierPortalPage() {
  const qc = useQueryClient();
  const [selectedSupplierId, setSelectedSupplierId] = useState<number | null>(null);
  const [replenishItem, setReplenishItem] = useState<{ id: number; name: string; repQty: string } | null>(null);
  const [replenishQty, setReplenishQty] = useState("");
  const [replenishDate, setReplenishDate] = useState("");
  const [replenishNote, setReplenishNote] = useState("");

  const [thresholdItem, setThresholdItem] = useState<{ id: number; name: string } | null>(null);
  const [threshMin, setThreshMin] = useState("");
  const [threshMax, setThreshMax] = useState("");
  const [threshTarget, setThreshTarget] = useState("");
  const [threshRepQty, setThreshRepQty] = useState("");
  const [threshNote, setThreshNote] = useState("");

  const { data: vmiSuppliers = [], isLoading: loadingSuppliers } = useQuery<VmiSupplierItem[]>({
    queryKey: ["vmi-suppliers"],
    queryFn: () => authFetch(`${API}/vmi/suppliers`).then(r => r.json()),
  });

  const { data: portal, isLoading: loadingPortal } = useQuery<PortalData>({
    queryKey: ["vmi-portal", selectedSupplierId],
    queryFn: () => authFetch(`${API}/vmi/supplier-portal/${selectedSupplierId}`).then(r => r.json()),
    enabled: !!selectedSupplierId,
  });

  const replenishMut = useMutation({
    mutationFn: ({ vmiItemId, quantity, expectedDeliveryDate, notes }: ReplenishParams) =>
      authFetch(`${API}/vmi/supplier-portal/${selectedSupplierId}/replenish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vmiItemId, quantity, expectedDeliveryDate, notes }),
      }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vmi-portal", selectedSupplierId] });
      setReplenishItem(null);
      setReplenishQty("");
      setReplenishDate("");
      setReplenishNote("");
    },
  });

  const thresholdMut = useMutation({
    mutationFn: ({ itemId, minThreshold, maxThreshold, targetLevel, replenishmentQty, notes }: ThresholdParams) =>
      authFetch(`${API}/vmi/supplier-portal/${selectedSupplierId}/items/${itemId}/thresholds`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ minThreshold, maxThreshold, targetLevel, replenishmentQty, notes }),
      }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vmi-portal", selectedSupplierId] });
      setThresholdItem(null);
    },
  });

  function openThreshold(item: ManagedItem) {
    setThresholdItem({ id: item.id, name: item.material_name });
    setThreshMin(item.min_threshold || "");
    setThreshMax(item.max_threshold || "");
    setThreshTarget(item.target_level || "");
    setThreshRepQty(item.replenishment_qty || "");
    setThreshNote(item.notes || "");
  }

  function submitThreshold() {
    if (!thresholdItem || !threshMin || !threshMax) return;
    thresholdMut.mutate({
      itemId: thresholdItem.id,
      minThreshold: threshMin,
      maxThreshold: threshMax,
      targetLevel: threshTarget || undefined,
      replenishmentQty: threshRepQty || undefined,
      notes: threshNote || undefined,
    });
  }

  function openReplenish(item: ManagedItem) {
    setReplenishItem({ id: item.id, name: item.material_name, repQty: item.replenishment_qty || "" });
    setReplenishQty(item.replenishment_qty || "");
    setReplenishDate("");
    setReplenishNote("");
  }

  function submitReplenish() {
    if (!replenishItem || !replenishQty) return;
    replenishMut.mutate({
      vmiItemId: replenishItem.id,
      quantity: replenishQty,
      expectedDeliveryDate: replenishDate || undefined,
      notes: replenishNote || undefined,
    });
  }

  const fillPct = (item: ManagedItem) => {
    const stock = parseFloat(item.current_stock || "0");
    const max = parseFloat(item.max_threshold || "1");
    return max > 0 ? Math.min(100, Math.round((stock / max) * 100)) : 0;
  };

  return (
    <div className="p-6 max-w-7xl mx-auto" dir="rtl">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 rounded-lg bg-indigo-100">
          <Truck className="w-6 h-6 text-indigo-700" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">פורטל ספק VMI</h1>
          <p className="text-sm text-gray-500">ניהול מלאי מנוהל ספק — תצוגת ספק וחידוש מלאי</p>
        </div>
      </div>

      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">בחר ספק VMI</label>
        {loadingSuppliers ? (
          <div className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> טוען ספקים...</div>
        ) : (
          <select
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-72 bg-white"
            value={selectedSupplierId || ""}
            onChange={e => setSelectedSupplierId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">-- בחר ספק --</option>
            {vmiSuppliers.map((s: VmiSupplierItem) => (
              <option key={s.id} value={s.supplier_id}>
                {s.supplier_name} ({s.managed_items_count} פריטים)
              </option>
            ))}
          </select>
        )}
      </div>

      {!selectedSupplierId && (
        <div className="text-center py-16 text-gray-400">
          <Truck className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p className="text-lg">בחר ספק VMI לצפייה בפורטל שלו</p>
        </div>
      )}

      {selectedSupplierId && loadingPortal && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        </div>
      )}

      {portal && !loadingPortal && (
        <div className="space-y-6">
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-900">{portal.supplier.supplier_name}</h2>
                <p className="text-sm text-gray-500 mt-1">
                  מספר ספק: {portal.supplier.supplier_number}
                  {portal.supplier.vmi_contract_number && ` · חוזה: ${portal.supplier.vmi_contract_number}`}
                </p>
                <div className="flex gap-4 mt-2 text-sm text-gray-600">
                  {portal.supplier.email && <span>✉ {portal.supplier.email}</span>}
                  {portal.supplier.phone && <span>📞 {portal.supplier.phone}</span>}
                </div>
              </div>
              <div className="flex gap-4 text-center">
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-2xl font-bold text-indigo-700">{portal.managedItems.length}</p>
                  <p className="text-xs text-gray-500">פריטים מנוהלים</p>
                </div>
                <div className={`rounded-lg p-3 ${portal.alerts.itemsNeedingReplenishment > 0 ? "bg-red-50" : "bg-green-50"}`}>
                  <p className={`text-2xl font-bold ${portal.alerts.itemsNeedingReplenishment > 0 ? "text-red-700" : "text-green-700"}`}>
                    {portal.alerts.itemsNeedingReplenishment}
                  </p>
                  <p className="text-xs text-gray-500">דורשים חידוש</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-2xl font-bold text-gray-800">{portal.supplier.replenishment_lead_days || "-"}</p>
                  <p className="text-xs text-gray-500">ימי אספקה</p>
                </div>
                {portal.supplier.performance_score && (
                  <div className="bg-blue-50 rounded-lg p-3">
                    <p className="text-2xl font-bold text-blue-700">{parseFloat(portal.supplier.performance_score).toFixed(0)}%</p>
                    <p className="text-xs text-gray-500">ביצועים</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {portal.alerts.criticalItems.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="w-5 h-5 text-red-600" />
                <h3 className="font-semibold text-red-800">פריטים קריטיים הדורשים חידוש מיידי</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {portal.alerts.criticalItems.map((item) => (
                  <span key={item.id} className="bg-red-100 text-red-800 border border-red-300 rounded-full px-3 py-1 text-sm font-medium">
                    {item.material_name} — {stockStatusLabel[item.stock_status] || item.stock_status}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div>
            <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <Package className="w-5 h-5 text-indigo-600" />
              פריטים מנוהלים ({portal.managedItems.length})
            </h3>
            <div className="grid gap-3">
              {portal.managedItems.map(item => {
                const pct = fillPct(item);
                const barColor = item.stock_status === "out_of_stock" ? "bg-red-500"
                  : item.stock_status === "below_min" ? "bg-orange-500"
                  : item.stock_status === "low" ? "bg-yellow-500"
                  : item.stock_status === "at_max" ? "bg-blue-500"
                  : "bg-green-500";
                return (
                  <div key={item.id} className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-gray-900">{item.material_name}</span>
                        <span className="text-xs text-gray-400">{item.material_number}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${stockStatusColor[item.stock_status]}`}>
                          {stockStatusLabel[item.stock_status] || item.stock_status}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-gray-500 mb-2">
                        <span>מלאי: <strong className="text-gray-800">{parseFloat(item.current_stock || "0").toFixed(1)}</strong> {item.unit}</span>
                        <span>מינימום: {parseFloat(item.min_threshold).toFixed(1)}</span>
                        <span>מקסימום: {parseFloat(item.max_threshold).toFixed(1)}</span>
                        {item.target_level && <span>יעד: {parseFloat(item.target_level).toFixed(1)}</span>}
                        {item.warehouse_location && <span>מיקום: {item.warehouse_location}</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-gray-200 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full transition-all ${barColor}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-500 w-10 text-left">{pct}%</span>
                      </div>
                      {item.last_replenishment_date && (
                        <p className="text-xs text-gray-400 mt-1">
                          חידוש אחרון: {new Date(item.last_replenishment_date).toLocaleDateString("he-IL")}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col gap-2">
                      <button
                        onClick={() => openReplenish(item)}
                        className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-foreground text-sm rounded-lg hover:bg-indigo-700 transition-colors"
                      >
                        <ShoppingCart className="w-4 h-4" />
                        חדש מלאי
                      </button>
                      <button
                        onClick={() => openThreshold(item)}
                        className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        <Settings className="w-4 h-4" />
                        עדכן סף
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <Clock className="w-5 h-5 text-indigo-600" />
              הזמנות חידוש אחרונות
            </h3>
            {portal.recentOrders.length === 0 ? (
              <div className="bg-gray-50 rounded-xl p-6 text-center text-gray-400 text-sm">אין הזמנות חידוש</div>
            ) : (
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-right px-4 py-3 text-gray-600 font-medium">מספר הזמנה</th>
                      <th className="text-right px-4 py-3 text-gray-600 font-medium">חומר</th>
                      <th className="text-right px-4 py-3 text-gray-600 font-medium">כמות</th>
                      <th className="text-right px-4 py-3 text-gray-600 font-medium">סטטוס</th>
                      <th className="text-right px-4 py-3 text-gray-600 font-medium">תאריך אספקה</th>
                      <th className="text-right px-4 py-3 text-gray-600 font-medium">נוצר</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {portal.recentOrders.map(order => (
                      <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 font-mono text-xs text-indigo-600">{order.order_number}</td>
                        <td className="px-4 py-3 text-gray-800">{order.material_name}</td>
                        <td className="px-4 py-3 text-gray-800">{parseFloat(order.quantity).toFixed(1)} {order.unit}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            order.status === "delivered" ? "bg-green-100 text-green-800" :
                            order.status === "shipped" ? "bg-blue-100 text-blue-800" :
                            order.status === "cancelled" ? "bg-red-100 text-red-800" :
                            "bg-yellow-100 text-yellow-800"
                          }`}>
                            {orderStatusLabel[order.status] || order.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-600 text-xs">
                          {order.expected_delivery_date ? new Date(order.expected_delivery_date).toLocaleDateString("he-IL") : "—"}
                        </td>
                        <td className="px-4 py-3 text-gray-400 text-xs">
                          {new Date(order.created_at).toLocaleDateString("he-IL")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {replenishItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md" dir="rtl">
            <h3 className="text-lg font-bold text-gray-900 mb-1">הזמנת חידוש מלאי</h3>
            <p className="text-sm text-gray-500 mb-4">{replenishItem.name}</p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">כמות לחידוש</label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  className="border border-gray-300 rounded-lg px-3 py-2 w-full text-sm"
                  value={replenishQty}
                  onChange={e => setReplenishQty(e.target.value)}
                  placeholder={replenishItem.repQty || "הזן כמות"}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">תאריך אספקה צפוי</label>
                <input
                  type="date"
                  className="border border-gray-300 rounded-lg px-3 py-2 w-full text-sm"
                  value={replenishDate}
                  onChange={e => setReplenishDate(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">הערות</label>
                <textarea
                  className="border border-gray-300 rounded-lg px-3 py-2 w-full text-sm"
                  rows={2}
                  value={replenishNote}
                  onChange={e => setReplenishNote(e.target.value)}
                  placeholder="הערות אופציונליות"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setReplenishItem(null)}
                className="flex-1 border border-gray-300 text-gray-700 rounded-lg px-4 py-2 text-sm hover:bg-gray-50"
              >
                ביטול
              </button>
              <button
                onClick={submitReplenish}
                disabled={!replenishQty || replenishMut.isPending}
                className="flex-1 bg-indigo-600 text-foreground rounded-lg px-4 py-2 text-sm hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {replenishMut.isPending ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> שולח...</>
                ) : (
                  <><ArrowRight className="w-4 h-4" /> שלח הזמנה</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {thresholdItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md" dir="rtl">
            <h3 className="text-lg font-bold text-gray-900 mb-1">עדכון ספי מלאי</h3>
            <p className="text-sm text-gray-500 mb-4">{thresholdItem.name}</p>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">מינימום *</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="border border-gray-300 rounded-lg px-3 py-2 w-full text-sm"
                    value={threshMin}
                    onChange={e => setThreshMin(e.target.value)}
                    placeholder="מינימום"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">מקסימום *</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="border border-gray-300 rounded-lg px-3 py-2 w-full text-sm"
                    value={threshMax}
                    onChange={e => setThreshMax(e.target.value)}
                    placeholder="מקסימום"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">יעד</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="border border-gray-300 rounded-lg px-3 py-2 w-full text-sm"
                    value={threshTarget}
                    onChange={e => setThreshTarget(e.target.value)}
                    placeholder="כמות יעד"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">כמות חידוש</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="border border-gray-300 rounded-lg px-3 py-2 w-full text-sm"
                    value={threshRepQty}
                    onChange={e => setThreshRepQty(e.target.value)}
                    placeholder="כמות לחידוש"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">הערות</label>
                <textarea
                  className="border border-gray-300 rounded-lg px-3 py-2 w-full text-sm"
                  rows={2}
                  value={threshNote}
                  onChange={e => setThreshNote(e.target.value)}
                  placeholder="הערות אופציונליות"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setThresholdItem(null)}
                className="flex-1 border border-gray-300 text-gray-700 rounded-lg px-4 py-2 text-sm hover:bg-gray-50"
              >
                ביטול
              </button>
              <button
                onClick={submitThreshold}
                disabled={!threshMin || !threshMax || thresholdMut.isPending}
                className="flex-1 bg-indigo-600 text-foreground rounded-lg px-4 py-2 text-sm hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {thresholdMut.isPending ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> שומר...</>
                ) : (
                  <><ArrowRight className="w-4 h-4" /> שמור ספים</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
