import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Package, Plus, Search, Filter, Download, Upload, AlertTriangle, CheckCircle } from "lucide-react";
import { EmptyState } from "@/components/ui/unified-states";

interface RawMaterialStockItem {
  id: number;
  material_id: number;
  warehouse_id: number;
  location_code: string;
  batch_number: string;
  lot_number: string;
  quantity: number;
  reserved_quantity: number;
  available_quantity: number;
  unit_cost: number;
  total_value: number;
  received_date: string;
  expiry_date: string;
  supplier_id: number;
  purchase_order_id: number;
  quality_status: string;
  certificate_of_conformity: string;
  notes: string;
  created_at: string;
}

export default function RawMaterialStockPage() {
  const [items, setItems] = useState<RawMaterialStockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    material_id: "",
    warehouse_id: "",
    location_code: "",
    batch_number: "",
    lot_number: "",
    quantity: "",
    unit_cost: "",
    received_date: "",
    expiry_date: "",
    supplier_id: "",
    quality_status: "pending",
    notes: "",
  });

  const token = localStorage.getItem("erp_token");

  useEffect(() => {
    fetchItems();
  }, []);

  async function fetchItems() {
    try {
      setLoading(true);
      const res = await fetch("/api/raw-material-stock", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await fetch("/api/raw-material-stock", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          material_id: Number(form.material_id) || null,
          warehouse_id: Number(form.warehouse_id) || null,
          location_code: form.location_code,
          batch_number: form.batch_number,
          lot_number: form.lot_number,
          quantity: Number(form.quantity) || 0,
          unit_cost: Number(form.unit_cost) || 0,
          received_date: form.received_date || null,
          expiry_date: form.expiry_date || null,
          supplier_id: Number(form.supplier_id) || null,
          quality_status: form.quality_status,
          notes: form.notes,
        }),
      });
      if (!res.ok) throw new Error("Failed to create");
      setShowForm(false);
      setForm({ material_id: "", warehouse_id: "", location_code: "", batch_number: "", lot_number: "", quantity: "", unit_cost: "", received_date: "", expiry_date: "", supplier_id: "", quality_status: "pending", notes: "" });
      fetchItems();
    } catch (e: any) {
      setError(e.message);
    }
  }

  const filtered = items.filter(
    (i) =>
      (i.batch_number || "").toLowerCase().includes(search.toLowerCase()) ||
      (i.lot_number || "").toLowerCase().includes(search.toLowerCase()) ||
      (i.location_code || "").toLowerCase().includes(search.toLowerCase())
  );

  const totalQuantity = items.reduce((s, i) => s + (Number(i.quantity) || 0), 0);
  const totalValue = items.reduce((s, i) => s + (Number(i.total_value) || 0), 0);
  const lowStockItems = items.filter((i) => Number(i.available_quantity) <= 0).length;
  const pendingQC = items.filter((i) => i.quality_status === "pending").length;

  const getStatusColor = (status: string) => {
    switch (status) {
      case "approved": return "text-green-400 bg-green-400/10";
      case "rejected": return "text-red-400 bg-red-400/10";
      case "pending": return "text-yellow-400 bg-yellow-400/10";
      default: return "text-muted-foreground bg-gray-400/10";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "approved": return "מאושר";
      case "rejected": return "נדחה";
      case "pending": return "ממתין";
      default: return status;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0a0e1a] to-[#1a1f35] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0e1a] to-[#1a1f35] text-foreground p-6" dir="rtl">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <Package className="text-blue-400" />
              מלאי חומרי גלם
            </h1>
            <p className="text-muted-foreground mt-1">ניהול ומעקב אחר מלאי חומרי גלם במחסנים</p>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg transition-colors"
          >
            <Plus size={18} />
            הוסף מלאי
          </button>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[
            { label: "פריטים במלאי", value: items.length.toLocaleString(), icon: Package, color: "blue" },
            { label: "כמות כוללת", value: totalQuantity.toLocaleString(), icon: Download, color: "green" },
            { label: 'שווי כולל (₪)', value: totalValue.toLocaleString(), icon: Upload, color: "purple" },
            { label: "ממתין לבדיקת איכות", value: pendingQC.toString(), icon: AlertTriangle, color: "yellow" },
          ].map((kpi, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
              className={`bg-card/5 border border-white/10 rounded-xl p-4`}
            >
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg bg-${kpi.color}-400/10`}>
                  <kpi.icon className={`text-${kpi.color}-400`} size={20} />
                </div>
                <div>
                  <p className="text-muted-foreground text-sm">{kpi.label}</p>
                  <p className="text-xl font-bold">{kpi.value}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {showForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="bg-card/5 border border-white/10 rounded-xl p-6"
          >
            <h3 className="text-lg font-bold mb-4">הוספת חומר גלם למלאי</h3>
            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <input className="bg-card/5 border border-white/10 rounded-lg p-2 text-foreground" placeholder="מזהה חומר" value={form.material_id} onChange={(e) => setForm({ ...form, material_id: e.target.value })} />
              <input className="bg-card/5 border border-white/10 rounded-lg p-2 text-foreground" placeholder="מזהה מחסן" value={form.warehouse_id} onChange={(e) => setForm({ ...form, warehouse_id: e.target.value })} />
              <input className="bg-card/5 border border-white/10 rounded-lg p-2 text-foreground" placeholder="קוד מיקום" value={form.location_code} onChange={(e) => setForm({ ...form, location_code: e.target.value })} />
              <input className="bg-card/5 border border-white/10 rounded-lg p-2 text-foreground" placeholder="מספר אצווה" value={form.batch_number} onChange={(e) => setForm({ ...form, batch_number: e.target.value })} />
              <input className="bg-card/5 border border-white/10 rounded-lg p-2 text-foreground" placeholder="מספר LOT" value={form.lot_number} onChange={(e) => setForm({ ...form, lot_number: e.target.value })} />
              <input className="bg-card/5 border border-white/10 rounded-lg p-2 text-foreground" placeholder="כמות" type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
              <input className="bg-card/5 border border-white/10 rounded-lg p-2 text-foreground" placeholder="עלות ליחידה (₪)" type="number" value={form.unit_cost} onChange={(e) => setForm({ ...form, unit_cost: e.target.value })} />
              <input className="bg-card/5 border border-white/10 rounded-lg p-2 text-foreground" placeholder="תאריך קבלה" type="date" value={form.received_date} onChange={(e) => setForm({ ...form, received_date: e.target.value })} />
              <input className="bg-card/5 border border-white/10 rounded-lg p-2 text-foreground" placeholder="תאריך תפוגה" type="date" value={form.expiry_date} onChange={(e) => setForm({ ...form, expiry_date: e.target.value })} />
              <select className="bg-card/5 border border-white/10 rounded-lg p-2 text-foreground" value={form.quality_status} onChange={(e) => setForm({ ...form, quality_status: e.target.value })}>
                <option value="pending">ממתין לבדיקה</option>
                <option value="approved">מאושר</option>
                <option value="rejected">נדחה</option>
              </select>
              <textarea className="bg-card/5 border border-white/10 rounded-lg p-2 text-foreground md:col-span-2" placeholder="הערות" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              <div className="flex gap-2">
                <button type="submit" className="bg-blue-600 hover:bg-blue-700 px-6 py-2 rounded-lg transition-colors">שמור</button>
                <button type="button" onClick={() => setShowForm(false)} className="bg-muted hover:bg-muted px-6 py-2 rounded-lg transition-colors">ביטול</button>
              </div>
            </form>
          </motion.div>
        )}

        <div className="bg-card/5 border border-white/10 rounded-xl p-4">
          <div className="flex items-center gap-4 mb-4">
            <div className="flex-1 relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
              <input
                className="w-full bg-card/5 border border-white/10 rounded-lg pl-4 pr-10 py-2 text-foreground"
                placeholder="חיפוש לפי אצווה, LOT, מיקום..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              icon={Package}
              title="עדיין אין פריטי מלאי חומרי גלם"
              subtitle="הוסף את הפריט הראשון ותתחיל לנהל את מלאי חומרי הגלם במחסן"
              ctaLabel="➕ הוסף פריט ראשון"
              onCtaClick={() => setShowForm(true)}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-muted-foreground">
                    <th className="text-right p-3">#</th>
                    <th className="text-right p-3">אצווה</th>
                    <th className="text-right p-3">LOT</th>
                    <th className="text-right p-3">מיקום</th>
                    <th className="text-right p-3">כמות</th>
                    <th className="text-right p-3">זמין</th>
                    <th className="text-right p-3">עלות</th>
                    <th className="text-right p-3">תאריך קבלה</th>
                    <th className="text-right p-3">סטטוס איכות</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item) => (
                    <tr key={item.id} className="border-b border-white/5 hover:bg-card/5">
                      <td className="p-3">{item.id}</td>
                      <td className="p-3 font-mono">{item.batch_number || "-"}</td>
                      <td className="p-3 font-mono">{item.lot_number || "-"}</td>
                      <td className="p-3">{item.location_code || "-"}</td>
                      <td className="p-3">{Number(item.quantity).toLocaleString()}</td>
                      <td className="p-3">{Number(item.available_quantity).toLocaleString()}</td>
                      <td className="p-3">{"₪"}{Number(item.unit_cost).toLocaleString()}</td>
                      <td className="p-3">{item.received_date ? new Date(item.received_date).toLocaleDateString("he-IL") : "-"}</td>
                      <td className="p-3">
                        <span className={`px-2 py-1 rounded-full text-xs ${getStatusColor(item.quality_status)}`}>
                          {getStatusLabel(item.quality_status)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}