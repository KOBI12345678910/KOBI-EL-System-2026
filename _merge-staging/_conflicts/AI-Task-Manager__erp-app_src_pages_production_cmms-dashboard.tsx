import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import {
  Wrench, Cpu, AlertTriangle, Clock, TrendingUp, CheckCircle2, Plus, Settings,
  CalendarDays, Activity, DollarSign, BarChart3, X, Search, Filter, RefreshCw,
  ChevronDown, ChevronUp, Trash2, Edit, Eye, AlertCircle, Timer, Gauge, PieChart,
  ListChecks, FileText, Cog, ArrowUpDown, Package, MapPin, Building2, Users, Zap,
  QrCode, TreePine, Layers, Shield, Car, Weight, Bolt, Thermometer, Droplets,
  TrendingDown, CheckSquare, XSquare, Info, ClipboardCheck, Bell, Send, Camera,
  Radio, Heart, Lock, FileCheck, BadgeAlert,
  ShieldCheck, ShieldAlert, ShieldOff, CheckCircle, XCircle, PlayCircle,
  ShoppingCart, UserCheck, Wallet, Star, Phone, Mail, BadgeCheck, CircleDollarSign,
} from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, PieChart as RePieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area,
} from "recharts";

type Tab = "dashboard" | "equipment" | "asset-registry" | "pm-schedules" | "work-orders" | "downtime" | "kpi" | "requests" | "iot" | "safety" | "spare-parts" | "contractors" | "budget" | "analytics";

interface KpiCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
  subtitle?: string;
}

function KpiCard({ title, value, icon, color, subtitle }: KpiCardProps) {
  return (
    <div className={`rounded-xl border border-zinc-700/60 bg-zinc-900/80 p-4 flex items-start gap-3`}>
      <div className={`p-2.5 rounded-lg ${color}`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-xs text-zinc-400 truncate">{title}</p>
        <p className="text-xl font-bold text-zinc-100 mt-0.5">{value}</p>
        {subtitle && <p className="text-xs text-zinc-500 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-500/20 text-emerald-400",
  maintenance: "bg-amber-500/20 text-amber-400",
  down: "bg-red-500/20 text-red-400",
  retired: "bg-zinc-500/20 text-zinc-400",
  open: "bg-blue-500/20 text-blue-400",
  assigned: "bg-indigo-500/20 text-indigo-400",
  in_progress: "bg-amber-500/20 text-amber-400",
  completed: "bg-emerald-500/20 text-emerald-400",
  closed: "bg-teal-500/20 text-teal-400",
  waiting_parts: "bg-purple-500/20 text-purple-400",
  cancelled: "bg-zinc-500/20 text-zinc-400",
  pending: "bg-yellow-500/20 text-yellow-400",
};

const STATUS_LABELS: Record<string, string> = {
  active: "פעיל",
  maintenance: "בתחזוקה",
  down: "מושבת",
  retired: "פורק",
  open: "פתוח",
  assigned: "שויך",
  in_progress: "בביצוע",
  completed: "הושלם",
  closed: "סגור",
  waiting_parts: "ממתין לחלקים",
  cancelled: "בוטל",
  pending: "ממתין",
};

const PRIORITY_COLORS: Record<string, string> = {
  critical: "bg-red-500/20 text-red-400",
  high: "bg-orange-500/20 text-orange-400",
  medium: "bg-yellow-500/20 text-yellow-400",
  low: "bg-green-500/20 text-green-400",
};

const PRIORITY_LABELS: Record<string, string> = {
  critical: "קריטי",
  high: "גבוה",
  medium: "בינוני",
  low: "נמוך",
};

const DOWNTIME_REASON_LABELS: Record<string, string> = {
  mechanical: "מכני",
  electrical: "חשמלי",
  hydraulic: "הידראולי",
  pneumatic: "פנאומטי",
  software: "תוכנה",
  planned: "מתוכנן",
  operator_error: "שגיאת מפעיל",
  material: "חומר גלם",
  setup: "הכנה/כיוון",
  external: "חיצוני",
  other: "אחר",
};

const CHART_COLORS = ["#3b82f6", "#f59e0b", "#ef4444", "#10b981", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316"];

function Badge({ text, color }: { text: string; color: string }) {
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>{text}</span>;
}

function StatusBadge({ status }: { status: string }) {
  return <Badge text={STATUS_LABELS[status] || status} color={STATUS_COLORS[status] || "bg-zinc-600 text-zinc-300"} />;
}

function PriorityBadge({ priority }: { priority: string }) {
  return <Badge text={PRIORITY_LABELS[priority] || priority} color={PRIORITY_COLORS[priority] || "bg-zinc-600 text-zinc-300"} />;
}

function formatDate(d: string | null | undefined): string {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("he-IL"); } catch { return "—"; }
}

function formatDatetime(d: string | null | undefined): string {
  if (!d) return "—";
  try { return new Date(d).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }); } catch { return "—"; }
}

function formatCurrency(v: number | string | null): string {
  const n = Number(v || 0);
  return new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(n);
}

function formatNum(v: number | string | null, decimals = 1): string {
  return Number(v || 0).toFixed(decimals);
}

function parseJsonField<T>(raw: unknown, fallback: T): T {
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (Array.isArray(parsed) || (typeof parsed === "object" && parsed !== null)) return parsed as T;
  } catch { /* ignore */ }
  return fallback;
}

export default function CmmsDashboardPage() {
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const queryClient = useQueryClient();

  const { data: dashboard } = useQuery({
    queryKey: ["cmms-dashboard"],
    queryFn: async () => {
      const r = await authFetch("/api/cmms/dashboard");
      return r.json();
    },
    refetchInterval: 30000,
  });

  const seedMutation = useMutation({
    mutationFn: async () => {
      const r = await authFetch("/api/cmms/seed", { method: "POST" });
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cmms-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["cmms-equipment"] });
      queryClient.invalidateQueries({ queryKey: ["cmms-pm-schedules"] });
      queryClient.invalidateQueries({ queryKey: ["cmms-work-orders"] });
      queryClient.invalidateQueries({ queryKey: ["cmms-downtime"] });
      queryClient.invalidateQueries({ queryKey: ["cmms-requests"] });
    },
  });

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "dashboard", label: "לוח בקרה", icon: <Gauge className="w-4 h-4" /> },
    { id: "asset-registry", label: "מרשם נכסים", icon: <Layers className="w-4 h-4" /> },
    { id: "equipment", label: "ציוד ומכונות", icon: <Cpu className="w-4 h-4" /> },
    { id: "pm-schedules", label: "תחזוקה מונעת", icon: <CalendarDays className="w-4 h-4" /> },
    { id: "work-orders", label: "קריאות שירות", icon: <Wrench className="w-4 h-4" /> },
    { id: "downtime", label: "השבתות", icon: <AlertTriangle className="w-4 h-4" /> },
    { id: "kpi", label: "KPI", icon: <BarChart3 className="w-4 h-4" /> },
    { id: "requests", label: "בקשות תחזוקה", icon: <ClipboardCheck className="w-4 h-4" /> },
    { id: "iot", label: "ניטור IoT", icon: <Radio className="w-4 h-4" /> },
    { id: "safety", label: "בטיחות", icon: <ShieldCheck className="w-4 h-4" /> },
    { id: "spare-parts", label: "חלקי חילוף", icon: <Package className="w-4 h-4" /> },
    { id: "contractors", label: "קבלנים וספקים", icon: <UserCheck className="w-4 h-4" /> },
    { id: "budget", label: "תקציב תחזוקה", icon: <Wallet className="w-4 h-4" /> },
    { id: "analytics", label: "אנליטיקה", icon: <BarChart3 className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
            <Wrench className="w-7 h-7 text-blue-400" />
            מערכת CMMS — תחזוקת ציוד
          </h1>
          <p className="text-sm text-zinc-400 mt-1">ניהול תחזוקה ממוחשבת — ציוד, תחזוקה מונעת, קריאות שירות, השבתות ו-KPI</p>
        </div>
        <button
          onClick={() => seedMutation.mutate()}
          disabled={seedMutation.isPending}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-zinc-100 rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${seedMutation.isPending ? "animate-spin" : ""}`} />
          {seedMutation.isPending ? "מאתחל..." : "אתחל נתוני דמו"}
        </button>
      </div>

      <div className="flex gap-1 bg-zinc-800/50 rounded-lg p-1 border border-zinc-700/50 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === tab.id
                ? "bg-blue-600 text-zinc-100"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/50"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "dashboard" && <DashboardTab dashboard={dashboard} />}
      {activeTab === "asset-registry" && <AssetRegistryTab />}
      {activeTab === "equipment" && <EquipmentTab />}
      {activeTab === "pm-schedules" && <PMSchedulesTab />}
      {activeTab === "work-orders" && <WorkOrdersTab />}
      {activeTab === "downtime" && <DowntimeTab />}
      {activeTab === "kpi" && <KpiTab />}
      {activeTab === "requests" && <MaintenanceRequestsTab />}
      {activeTab === "iot" && <IoTTab />}
      {activeTab === "safety" && <SafetyTab />}
      {activeTab === "spare-parts" && <SparePartsTab />}
      {activeTab === "contractors" && <ContractorsTab />}
      {activeTab === "budget" && <BudgetTab />}
      {activeTab === "analytics" && <AnalyticsTab dashboard={dashboard} />}
    </div>
  );
}

function SparePartsTab() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<Record<string, unknown> | null>(null);
  const [filterLowStock, setFilterLowStock] = useState(false);

  const { data: parts = [] } = useQuery({
    queryKey: ["cmms-spare-parts", search, filterLowStock],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (filterLowStock) params.set("lowStock", "true");
      const r = await authFetch(`/api/cmms/spare-parts?${params}`);
      const j = await r.json();
      return Array.isArray(j) ? j : [];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const id = data.id;
      const r = await authFetch(id ? `/api/cmms/spare-parts/${id}` : "/api/cmms/spare-parts", {
        method: id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cmms-spare-parts"] });
      queryClient.invalidateQueries({ queryKey: ["cmms-spare-parts-low-stock"] });
      setShowForm(false);
      setEditItem(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await authFetch(`/api/cmms/spare-parts/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cmms-spare-parts"] });
      queryClient.invalidateQueries({ queryKey: ["cmms-spare-parts-low-stock"] });
    },
  });

  const purchaseRequestMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await authFetch(`/api/cmms/spare-parts/${id}/purchase-request`, { method: "POST" });
      return r.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["cmms-spare-parts"] });
      alert(`דרישת רכש נוצרה בהצלחה: ${data.purchaseRequestNumber}`);
    },
  });

  const partsData = parts as Record<string, unknown>[];
  const lowStockCount = partsData.filter(p => Number(p.current_stock) <= Number(p.minimum_stock)).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש חלקים..." className="bg-zinc-800 border border-zinc-700 rounded-lg pr-10 pl-4 py-2 text-sm text-zinc-200 placeholder:text-zinc-500 w-56" />
          </div>
          <button
            onClick={() => setFilterLowStock(!filterLowStock)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm border transition-colors ${filterLowStock ? "bg-orange-500/20 border-orange-500/50 text-orange-300" : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200"}`}
          >
            <AlertTriangle className="w-4 h-4" />
            מלאי נמוך {lowStockCount > 0 && <span className="bg-orange-500 text-foreground rounded-full px-1.5 text-xs">{lowStockCount}</span>}
          </button>
        </div>
        <button onClick={() => { setEditItem(null); setShowForm(true); }} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-zinc-100 rounded-lg text-sm font-medium flex items-center gap-2">
          <Plus className="w-4 h-4" /> הוסף חלק
        </button>
      </div>

      {showForm && (
        <SparePartForm
          item={editItem}
          onSave={d => saveMutation.mutate(d)}
          onCancel={() => { setShowForm(false); setEditItem(null); }}
          saving={saveMutation.isPending}
        />
      )}

      <div className="rounded-xl border border-zinc-700/60 bg-zinc-900/80 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-700/60 bg-zinc-800/50">
                <th className="text-right px-4 py-3 text-xs text-zinc-400 font-medium">מק"ט</th>
                <th className="text-right px-4 py-3 text-xs text-zinc-400 font-medium">שם החלק</th>
                <th className="text-right px-4 py-3 text-xs text-zinc-400 font-medium">קטגוריה</th>
                <th className="text-right px-4 py-3 text-xs text-zinc-400 font-medium">מיקום</th>
                <th className="text-right px-4 py-3 text-xs text-zinc-400 font-medium">מלאי נוכחי</th>
                <th className="text-right px-4 py-3 text-xs text-zinc-400 font-medium">מינימום</th>
                <th className="text-right px-4 py-3 text-xs text-zinc-400 font-medium">עלות יחידה</th>
                <th className="text-right px-4 py-3 text-xs text-zinc-400 font-medium">ספק</th>
                <th className="text-right px-4 py-3 text-xs text-zinc-400 font-medium">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {partsData.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-8 text-zinc-500">אין חלקי חילוף</td></tr>
              ) : partsData.map(part => {
                const isLow = Number(part.current_stock) <= Number(part.minimum_stock);
                return (
                  <tr key={String(part.id)} className={`border-b border-zinc-800/60 hover:bg-zinc-800/30 ${isLow ? "bg-orange-500/5" : ""}`}>
                    <td className="px-4 py-3 font-mono text-xs text-zinc-400">{String(part.part_number || "")}</td>
                    <td className="px-4 py-3 text-zinc-200 font-medium">
                      <div className="flex items-center gap-2">
                        {isLow && <AlertTriangle className="w-3.5 h-3.5 text-orange-400 shrink-0" />}
                        {String(part.name || "")}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-zinc-400">{String(part.category || "—")}</td>
                    <td className="px-4 py-3 text-zinc-400">{String(part.location_bin || "—")}</td>
                    <td className="px-4 py-3">
                      <span className={`font-bold ${isLow ? "text-orange-400" : "text-emerald-400"}`}>{String(part.current_stock || 0)}</span>
                    </td>
                    <td className="px-4 py-3 text-zinc-400">{String(part.minimum_stock || 0)}</td>
                    <td className="px-4 py-3 text-zinc-300">{formatCurrency(Number(part.unit_cost || 0))}</td>
                    <td className="px-4 py-3 text-zinc-400 text-xs">{String(part.supplier_name || "—")}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {isLow && (
                          <button
                            onClick={() => { if (confirm("ליצור דרישת רכש אוטומטית?")) purchaseRequestMutation.mutate(Number(part.id)); }}
                            className="p-1.5 rounded text-xs bg-blue-600/20 text-blue-400 hover:bg-blue-600/40 flex items-center gap-1"
                            title="צור דרישת רכש"
                          >
                            <ShoppingCart className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button onClick={() => { setEditItem(part); setShowForm(true); }} className="p-1.5 rounded hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200">
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => { if (confirm("למחוק חלק זה?")) deleteMutation.mutate(Number(part.id)); }} className="p-1.5 rounded hover:bg-red-500/20 text-zinc-400 hover:text-red-400">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SparePartForm({ item, onSave, onCancel, saving }: { item: Record<string, unknown> | null; onSave: (d: Record<string, unknown>) => void; onCancel: () => void; saving: boolean }) {
  const [form, setForm] = useState<Record<string, unknown>>({
    name: item?.name || "",
    description: item?.description || "",
    category: item?.category || "",
    locationBin: item?.location_bin || "",
    currentStock: item?.current_stock || 0,
    minimumStock: item?.minimum_stock || 0,
    reorderQty: item?.reorder_qty || 1,
    unitCost: item?.unit_cost || 0,
    supplierName: item?.supplier_name || "",
    notes: item?.notes || "",
    isActive: item?.is_active !== false,
  });

  const set = (k: string, v: unknown) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="rounded-xl border border-zinc-700/60 bg-zinc-900/80 p-6 space-y-4">
      <h3 className="text-base font-semibold text-zinc-100">{item ? "עריכת חלק חילוף" : "הוספת חלק חילוף"}</h3>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="md:col-span-2">
          <label className="block text-xs text-zinc-400 mb-1">שם החלק *</label>
          <input value={String(form.name)} onChange={e => set("name", e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">קטגוריה</label>
          <input value={String(form.category)} onChange={e => set("category", e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">מיקום (מדף/תא)</label>
          <input value={String(form.locationBin)} onChange={e => set("locationBin", e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">מלאי נוכחי</label>
          <input type="number" value={Number(form.currentStock)} onChange={e => set("currentStock", parseFloat(e.target.value))} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">מלאי מינימום</label>
          <input type="number" value={Number(form.minimumStock)} onChange={e => set("minimumStock", parseFloat(e.target.value))} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">כמות הזמנה</label>
          <input type="number" value={Number(form.reorderQty)} onChange={e => set("reorderQty", parseFloat(e.target.value))} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">עלות יחידה (₪)</label>
          <input type="number" value={Number(form.unitCost)} onChange={e => set("unitCost", parseFloat(e.target.value))} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" />
        </div>
        <div className="md:col-span-2">
          <label className="block text-xs text-zinc-400 mb-1">ספק מועדף</label>
          <input value={String(form.supplierName)} onChange={e => set("supplierName", e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" />
        </div>
        <div className="md:col-span-3">
          <label className="block text-xs text-zinc-400 mb-1">תיאור / הערות</label>
          <textarea value={String(form.description)} onChange={e => set("description", e.target.value)} rows={2} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" />
        </div>
      </div>
      <div className="flex justify-end gap-3">
        <button onClick={onCancel} className="px-4 py-2 rounded-lg border border-zinc-600 text-zinc-300 hover:bg-zinc-700 text-sm">ביטול</button>
        <button onClick={() => onSave({ ...form, ...(item ? { id: item.id } : {}) })} disabled={saving || !form.name} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-zinc-100 rounded-lg text-sm disabled:opacity-50">
          {saving ? "שומר..." : "שמור"}
        </button>
      </div>
    </div>
  );
}

function ContractorsTab() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<Record<string, unknown> | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const { data: contractors = [] } = useQuery({
    queryKey: ["cmms-contractors", search],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      const r = await authFetch(`/api/cmms/contractors?${params}`);
      const j = await r.json();
      return Array.isArray(j) ? j : [];
    },
  });

  const { data: slaData = [] } = useQuery({
    queryKey: ["cmms-contractors-sla"],
    queryFn: async () => {
      const r = await authFetch("/api/cmms/contractors/sla-compliance");
      const j = await r.json();
      return Array.isArray(j) ? j : [];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const id = data.id;
      const r = await authFetch(id ? `/api/cmms/contractors/${id}` : "/api/cmms/contractors", {
        method: id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cmms-contractors"] });
      queryClient.invalidateQueries({ queryKey: ["cmms-contractors-sla"] });
      setShowForm(false);
      setEditItem(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => { await authFetch(`/api/cmms/contractors/${id}`, { method: "DELETE" }); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cmms-contractors"] });
      queryClient.invalidateQueries({ queryKey: ["cmms-contractors-sla"] });
    },
  });

  const contractorsData = contractors as Record<string, unknown>[];
  const slaRows = slaData as Record<string, unknown>[];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="relative">
          <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש קבלן..." className="bg-zinc-800 border border-zinc-700 rounded-lg pr-10 pl-4 py-2 text-sm text-zinc-200 placeholder:text-zinc-500 w-56" />
        </div>
        <button onClick={() => { setEditItem(null); setShowForm(true); }} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-zinc-100 rounded-lg text-sm font-medium flex items-center gap-2">
          <Plus className="w-4 h-4" /> הוסף קבלן
        </button>
      </div>

      {showForm && (
        <ContractorForm
          item={editItem}
          onSave={d => saveMutation.mutate(d)}
          onCancel={() => { setShowForm(false); setEditItem(null); }}
          saving={saveMutation.isPending}
        />
      )}

      <div className="rounded-xl border border-zinc-700/60 bg-zinc-900/80 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-700/60 bg-zinc-800/50">
                <th className="text-right px-4 py-3 text-xs text-zinc-400 font-medium">חברה</th>
                <th className="text-right px-4 py-3 text-xs text-zinc-400 font-medium">איש קשר</th>
                <th className="text-right px-4 py-3 text-xs text-zinc-400 font-medium">התמחויות</th>
                <th className="text-right px-4 py-3 text-xs text-zinc-400 font-medium">תוקף חוזה</th>
                <th className="text-right px-4 py-3 text-xs text-zinc-400 font-medium">SLA מענה</th>
                <th className="text-right px-4 py-3 text-xs text-zinc-400 font-medium">עלות כוללת</th>
                <th className="text-right px-4 py-3 text-xs text-zinc-400 font-medium">דירוג</th>
                <th className="text-right px-4 py-3 text-xs text-zinc-400 font-medium">סטטוס</th>
                <th className="text-right px-4 py-3 text-xs text-zinc-400 font-medium">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {contractorsData.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-8 text-zinc-500">אין קבלנים</td></tr>
              ) : contractorsData.map(c => {
                const contractEnd = c.contract_end ? new Date(String(c.contract_end)) : null;
                const isExpired = contractEnd && contractEnd < new Date();
                const isExpiringSoon = contractEnd && !isExpired && contractEnd < new Date(Date.now() + 30 * 86400000);
                return (
                  <tr key={String(c.id)} className="border-b border-zinc-800/60 hover:bg-zinc-800/30 cursor-pointer" onClick={() => setSelectedId(selectedId === Number(c.id) ? null : Number(c.id))}>
                    <td className="px-4 py-3 text-zinc-200 font-medium">{String(c.company_name || "")}</td>
                    <td className="px-4 py-3">
                      <div className="text-zinc-300 text-xs">{String(c.contact_person || "—")}</div>
                      {c.phone && <div className="text-zinc-500 text-xs flex items-center gap-1"><Phone className="w-3 h-3" />{String(c.phone)}</div>}
                    </td>
                    <td className="px-4 py-3 text-zinc-400 text-xs max-w-[150px] truncate">{String(c.specializations || "—")}</td>
                    <td className="px-4 py-3">
                      {contractEnd ? (
                        <span className={`text-xs ${isExpired ? "text-red-400" : isExpiringSoon ? "text-amber-400" : "text-zinc-400"}`}>
                          {formatDate(String(c.contract_end))}
                          {isExpired && " (פג)"}
                          {isExpiringSoon && " (בקרוב)"}
                        </span>
                      ) : <span className="text-zinc-500">—</span>}
                    </td>
                    <td className="px-4 py-3 text-zinc-400 text-xs">{String(c.sla_response_hours || 24)} שעות</td>
                    <td className="px-4 py-3 text-zinc-300">{formatCurrency(Number(c.total_cost || 0))}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-0.5">
                        {[1,2,3,4,5].map(i => <Star key={i} className={`w-3 h-3 ${i <= Number(c.rating || 0) ? "text-amber-400 fill-amber-400" : "text-zinc-600"}`} />)}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge text={c.status === "active" ? "פעיל" : "לא פעיל"} color={c.status === "active" ? "bg-emerald-500/20 text-emerald-400" : "bg-zinc-500/20 text-zinc-400"} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                        <button onClick={() => { setEditItem(c); setShowForm(true); }} className="p-1.5 rounded hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200">
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => { if (confirm("למחוק קבלן זה?")) deleteMutation.mutate(Number(c.id)); }} className="p-1.5 rounded hover:bg-red-500/20 text-zinc-400 hover:text-red-400">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {slaRows.length > 0 && (
        <div className="rounded-xl border border-zinc-700/60 bg-zinc-900/80 p-5">
          <h3 className="text-base font-semibold text-zinc-100 mb-4 flex items-center gap-2">
            <BadgeCheck className="w-5 h-5 text-blue-400" />
            דוח עמידה ב-SLA
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-700/50">
                  <th className="text-right px-4 py-2 text-xs text-zinc-400">קבלן</th>
                  <th className="text-right px-4 py-2 text-xs text-zinc-400">סה"כ קריאות</th>
                  <th className="text-right px-4 py-2 text-xs text-zinc-400">מענה בזמן</th>
                  <th className="text-right px-4 py-2 text-xs text-zinc-400">סגירה בזמן</th>
                  <th className="text-right px-4 py-2 text-xs text-zinc-400">עלות כוללת</th>
                </tr>
              </thead>
              <tbody>
                {slaRows.map((r, i) => {
                  const total = Number(r.total || 0);
                  const responseMet = Number(r.response_met || 0);
                  const responseTotal = Number(r.responded || 0);
                  const resolutionMet = Number(r.resolution_met || 0);
                  const responsePct = responseTotal > 0 ? (responseMet / responseTotal * 100) : null;
                  const resolutionPct = total > 0 ? (resolutionMet / total * 100) : null;
                  return (
                    <tr key={i} className="border-b border-zinc-800/60">
                      <td className="px-4 py-2 text-zinc-200">{String(r.company_name)}</td>
                      <td className="px-4 py-2 text-zinc-400">{total}</td>
                      <td className="px-4 py-2">
                        {responsePct !== null ? (
                          <span className={`text-xs font-medium ${responsePct >= 90 ? "text-emerald-400" : responsePct >= 70 ? "text-amber-400" : "text-red-400"}`}>
                            {responsePct.toFixed(0)}%
                          </span>
                        ) : <span className="text-zinc-500">—</span>}
                      </td>
                      <td className="px-4 py-2">
                        {resolutionPct !== null ? (
                          <span className={`text-xs font-medium ${resolutionPct >= 90 ? "text-emerald-400" : resolutionPct >= 70 ? "text-amber-400" : "text-red-400"}`}>
                            {resolutionPct.toFixed(0)}%
                          </span>
                        ) : <span className="text-zinc-500">—</span>}
                      </td>
                      <td className="px-4 py-2 text-zinc-300">{formatCurrency(Number(r.total_cost || 0))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function ContractorForm({ item, onSave, onCancel, saving }: { item: Record<string, unknown> | null; onSave: (d: Record<string, unknown>) => void; onCancel: () => void; saving: boolean }) {
  const [form, setForm] = useState<Record<string, unknown>>({
    companyName: item?.company_name || "",
    contactPerson: item?.contact_person || "",
    phone: item?.phone || "",
    email: item?.email || "",
    specializations: item?.specializations || "",
    hourlyRate: item?.hourly_rate || 0,
    dailyRate: item?.daily_rate || 0,
    contractStart: item?.contract_start ? String(item.contract_start).slice(0, 10) : "",
    contractEnd: item?.contract_end ? String(item.contract_end).slice(0, 10) : "",
    slaResponseHours: item?.sla_response_hours || 24,
    slaResolutionHours: item?.sla_resolution_hours || 72,
    rating: item?.rating || 0,
    status: item?.status || "active",
    notes: item?.notes || "",
  });

  const set = (k: string, v: unknown) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="rounded-xl border border-zinc-700/60 bg-zinc-900/80 p-6 space-y-4">
      <h3 className="text-base font-semibold text-zinc-100">{item ? "עריכת קבלן" : "הוספת קבלן"}</h3>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="md:col-span-2">
          <label className="block text-xs text-zinc-400 mb-1">שם החברה *</label>
          <input value={String(form.companyName)} onChange={e => set("companyName", e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">סטטוס</label>
          <select value={String(form.status)} onChange={e => set("status", e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200">
            <option value="active">פעיל</option>
            <option value="inactive">לא פעיל</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">איש קשר</label>
          <input value={String(form.contactPerson)} onChange={e => set("contactPerson", e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">טלפון</label>
          <input value={String(form.phone)} onChange={e => set("phone", e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">אימייל</label>
          <input value={String(form.email)} onChange={e => set("email", e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" />
        </div>
        <div className="md:col-span-3">
          <label className="block text-xs text-zinc-400 mb-1">התמחויות</label>
          <input value={String(form.specializations)} onChange={e => set("specializations", e.target.value)} placeholder="CNC, הידראוליקה, חשמל..." className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">תעריף שעתי (₪)</label>
          <input type="number" value={Number(form.hourlyRate)} onChange={e => set("hourlyRate", parseFloat(e.target.value))} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">תחילת חוזה</label>
          <input type="date" value={String(form.contractStart)} onChange={e => set("contractStart", e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">סיום חוזה</label>
          <input type="date" value={String(form.contractEnd)} onChange={e => set("contractEnd", e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">SLA מענה (שעות)</label>
          <input type="number" value={Number(form.slaResponseHours)} onChange={e => set("slaResponseHours", parseFloat(e.target.value))} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">SLA סגירה (שעות)</label>
          <input type="number" value={Number(form.slaResolutionHours)} onChange={e => set("slaResolutionHours", parseFloat(e.target.value))} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">דירוג (0-5)</label>
          <input type="number" min={0} max={5} step={0.5} value={Number(form.rating)} onChange={e => set("rating", parseFloat(e.target.value))} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" />
        </div>
        <div className="md:col-span-3">
          <label className="block text-xs text-zinc-400 mb-1">הערות</label>
          <textarea value={String(form.notes)} onChange={e => set("notes", e.target.value)} rows={2} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" />
        </div>
      </div>
      <div className="flex justify-end gap-3">
        <button onClick={onCancel} className="px-4 py-2 rounded-lg border border-zinc-600 text-zinc-300 hover:bg-zinc-700 text-sm">ביטול</button>
        <button onClick={() => onSave({ ...form, ...(item ? { id: item.id } : {}) })} disabled={saving || !form.companyName} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-zinc-100 rounded-lg text-sm disabled:opacity-50">
          {saving ? "שומר..." : "שמור"}
        </button>
      </div>
    </div>
  );
}

function BudgetTab() {
  const queryClient = useQueryClient();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<Record<string, unknown> | null>(null);

  const { data: actualsData } = useQuery({
    queryKey: ["cmms-budget-actuals", year],
    queryFn: async () => {
      const r = await authFetch(`/api/cmms/maintenance-budgets/actuals?year=${year}`);
      return r.json();
    },
  });

  const { data: budgets = [] } = useQuery({
    queryKey: ["cmms-maintenance-budgets", year],
    queryFn: async () => {
      const r = await authFetch(`/api/cmms/maintenance-budgets?year=${year}`);
      const j = await r.json();
      return Array.isArray(j) ? j : [];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const id = data.id;
      const r = await authFetch(id ? `/api/cmms/maintenance-budgets/${id}` : "/api/cmms/maintenance-budgets", {
        method: id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cmms-maintenance-budgets"] });
      queryClient.invalidateQueries({ queryKey: ["cmms-budget-actuals"] });
      queryClient.invalidateQueries({ queryKey: ["cmms-budget-actuals-dashboard"] });
      setShowForm(false);
      setEditItem(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => { await authFetch(`/api/cmms/maintenance-budgets/${id}`, { method: "DELETE" }); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cmms-maintenance-budgets"] });
      queryClient.invalidateQueries({ queryKey: ["cmms-budget-actuals"] });
      queryClient.invalidateQueries({ queryKey: ["cmms-budget-actuals-dashboard"] });
    },
  });

  const budgetsData = budgets as Record<string, unknown>[];
  const totalBudget = actualsData ? Number(actualsData.totalBudget || 0) : 0;
  const totalActual = actualsData ? Number(actualsData.totalActual || 0) : 0;
  const variancePct = actualsData ? Number(actualsData.variancePct || 0) : 0;
  const forecastYearEnd = actualsData ? Number(actualsData.forecastYearEnd || 0) : 0;
  const monthlyChart = actualsData ? (Array.isArray(actualsData.monthlyChart) ? actualsData.monthlyChart : []) as Record<string, unknown>[] : [];
  const deptActuals = actualsData ? (Array.isArray(actualsData.deptActuals) ? actualsData.deptActuals : []) as Record<string, unknown>[] : [];

  const deptBudgetMap: Record<string, number> = {};
  budgetsData.forEach(b => {
    const dept = String(b.department || "כללי");
    deptBudgetMap[dept] = (deptBudgetMap[dept] || 0) + Number(b.budget_amount || 0);
  });

  const deptChartData = deptActuals.map(d => {
    const dept = String(d.department || "לא מוגדר");
    return {
      dept: dept.length > 10 ? dept.slice(0, 10) + "..." : dept,
      actual: Number(d.actual_cost || 0),
      budget: deptBudgetMap[dept] || 0,
    };
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <select value={year} onChange={e => setYear(Number(e.target.value))} className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200">
            {[currentYear - 1, currentYear, currentYear + 1].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <button onClick={() => { setEditItem(null); setShowForm(true); }} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-zinc-100 rounded-lg text-sm font-medium flex items-center gap-2">
          <Plus className="w-4 h-4" /> הוסף תקציב
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard title="תקציב שנתי" value={formatCurrency(totalBudget)} icon={<Wallet className="w-5 h-5 text-blue-400" />} color="bg-blue-500/10" />
        <KpiCard title="הוצאה בפועל" value={formatCurrency(totalActual)} icon={<DollarSign className="w-5 h-5 text-emerald-400" />} color="bg-emerald-500/10" />
        <KpiCard
          title="ניצול תקציב"
          value={`${variancePct.toFixed(1)}%`}
          icon={<BarChart3 className={`w-5 h-5 ${variancePct >= 100 ? "text-red-400" : variancePct >= 80 ? "text-amber-400" : "text-emerald-400"}`} />}
          color={variancePct >= 100 ? "bg-red-500/10" : variancePct >= 80 ? "bg-amber-500/10" : "bg-emerald-500/10"}
        />
        <KpiCard title="תחזית לסוף שנה" value={formatCurrency(forecastYearEnd)} icon={<TrendingUp className="w-5 h-5 text-purple-400" />} color="bg-purple-500/10" />
      </div>

      {variancePct >= 80 && (
        <div className={`rounded-xl border p-4 flex items-center gap-3 ${variancePct >= 100 ? "border-red-500/40 bg-red-500/5" : "border-amber-500/40 bg-amber-500/5"}`}>
          <AlertTriangle className={`w-5 h-5 shrink-0 ${variancePct >= 100 ? "text-red-400" : "text-amber-400"}`} />
          <div>
            <p className={`text-sm font-semibold ${variancePct >= 100 ? "text-red-400" : "text-amber-400"}`}>
              {variancePct >= 100 ? "חריגה מהתקציב!" : "התראת תקציב"}
            </p>
            <p className="text-xs text-zinc-400">
              {variancePct >= 100
                ? `חריגה של ${formatCurrency(totalActual - totalBudget)} מעל התקציב`
                : `${variancePct.toFixed(0)}% מהתקציב נוצל — תחזית לסוף שנה: ${formatCurrency(forecastYearEnd)}`}
            </p>
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-zinc-700/60 bg-zinc-900/80 p-5">
          <h3 className="text-base font-semibold text-zinc-100 mb-4">הוצאות חודשיות — {year}</h3>
          {monthlyChart.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={monthlyChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="month" tick={{ fill: "#9ca3af", fontSize: 10 }} />
                <YAxis tick={{ fill: "#9ca3af", fontSize: 10 }} />
                <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #3f3f46", borderRadius: "8px", direction: "rtl" }} formatter={(v: number) => formatCurrency(v)} />
                <Bar dataKey="actual" name="בפועל" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-zinc-500 text-sm text-center py-12">אין נתוני הוצאות לשנה זו</p>}
        </div>

        <div className="rounded-xl border border-zinc-700/60 bg-zinc-900/80 p-5">
          <h3 className="text-base font-semibold text-zinc-100 mb-4">תקציב מול בפועל — לפי מחלקה</h3>
          {deptChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={deptChartData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis type="number" tick={{ fill: "#9ca3af", fontSize: 10 }} />
                <YAxis dataKey="dept" type="category" tick={{ fill: "#9ca3af", fontSize: 10 }} width={90} />
                <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #3f3f46", borderRadius: "8px", direction: "rtl" }} formatter={(v: number) => formatCurrency(v)} />
                <Legend />
                <Bar dataKey="budget" name="תקציב" fill="#6366f1" radius={[0, 4, 4, 0]} />
                <Bar dataKey="actual" name="בפועל" fill="#3b82f6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-zinc-500 text-sm text-center py-12">אין נתוני תקציב למחלקות</p>}
        </div>
      </div>

      {showForm && (
        <BudgetForm
          item={editItem}
          year={year}
          onSave={d => saveMutation.mutate(d)}
          onCancel={() => { setShowForm(false); setEditItem(null); }}
          saving={saveMutation.isPending}
        />
      )}

      <div className="rounded-xl border border-zinc-700/60 bg-zinc-900/80 overflow-hidden">
        <div className="px-5 py-3 border-b border-zinc-700/50 bg-zinc-800/30 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-zinc-200">הקצאות תקציב — {year}</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-700/60 bg-zinc-800/50">
                <th className="text-right px-4 py-3 text-xs text-zinc-400 font-medium">מחלקה</th>
                <th className="text-right px-4 py-3 text-xs text-zinc-400 font-medium">קטגוריית נכס</th>
                <th className="text-right px-4 py-3 text-xs text-zinc-400 font-medium">סכום תקציב</th>
                <th className="text-right px-4 py-3 text-xs text-zinc-400 font-medium">הערות</th>
                <th className="text-right px-4 py-3 text-xs text-zinc-400 font-medium">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {budgetsData.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-8 text-zinc-500">אין הקצאות תקציב</td></tr>
              ) : budgetsData.map(b => (
                <tr key={String(b.id)} className="border-b border-zinc-800/60 hover:bg-zinc-800/30">
                  <td className="px-4 py-3 text-zinc-200">{String(b.department || "כללי")}</td>
                  <td className="px-4 py-3 text-zinc-400">{String(b.asset_category || "—")}</td>
                  <td className="px-4 py-3 text-zinc-300 font-medium">{formatCurrency(Number(b.budget_amount || 0))}</td>
                  <td className="px-4 py-3 text-zinc-400 text-xs">{String(b.notes || "—")}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => { setEditItem(b); setShowForm(true); }} className="p-1.5 rounded hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200">
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => { if (confirm("למחוק הקצאה זו?")) deleteMutation.mutate(Number(b.id)); }} className="p-1.5 rounded hover:bg-red-500/20 text-zinc-400 hover:text-red-400">
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
    </div>
  );
}

function BudgetForm({ item, year, onSave, onCancel, saving }: { item: Record<string, unknown> | null; year: number; onSave: (d: Record<string, unknown>) => void; onCancel: () => void; saving: boolean }) {
  const [form, setForm] = useState<Record<string, unknown>>({
    year: item?.year || year,
    department: item?.department || "",
    assetCategory: item?.asset_category || "",
    budgetAmount: item?.budget_amount || 0,
    notes: item?.notes || "",
  });

  const set = (k: string, v: unknown) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="rounded-xl border border-zinc-700/60 bg-zinc-900/80 p-6 space-y-4">
      <h3 className="text-base font-semibold text-zinc-100">{item ? "עריכת תקציב" : "הוספת תקציב"}</h3>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs text-zinc-400 mb-1">שנה</label>
          <input type="number" value={Number(form.year)} onChange={e => set("year", parseInt(e.target.value))} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">מחלקה</label>
          <input value={String(form.department)} onChange={e => set("department", e.target.value)} placeholder="חיתוך CNC, ריתוך..." className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">קטגוריית נכס</label>
          <input value={String(form.assetCategory)} onChange={e => set("assetCategory", e.target.value)} placeholder="CNC, רכבים..." className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">סכום תקציב (₪)</label>
          <input type="number" value={Number(form.budgetAmount)} onChange={e => set("budgetAmount", parseFloat(e.target.value))} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" />
        </div>
        <div className="md:col-span-2">
          <label className="block text-xs text-zinc-400 mb-1">הערות</label>
          <input value={String(form.notes)} onChange={e => set("notes", e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" />
        </div>
      </div>
      <div className="flex justify-end gap-3">
        <button onClick={onCancel} className="px-4 py-2 rounded-lg border border-zinc-600 text-zinc-300 hover:bg-zinc-700 text-sm">ביטול</button>
        <button onClick={() => onSave({ ...form, ...(item ? { id: item.id } : {}) })} disabled={saving} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-zinc-100 rounded-lg text-sm disabled:opacity-50">
          {saving ? "שומר..." : "שמור"}
        </button>
      </div>
    </div>
  );
}

function DashboardTab({ dashboard }: { dashboard: Record<string, unknown> | undefined }) {
  const { data: lowStockParts = [] } = useQuery({
    queryKey: ["cmms-spare-parts-low-stock"],
    queryFn: async () => {
      const r = await authFetch("/api/cmms/spare-parts/low-stock");
      const j = await r.json();
      return Array.isArray(j) ? j : [];
    },
    refetchInterval: 60000,
  });

  const { data: budgetActuals } = useQuery({
    queryKey: ["cmms-budget-actuals-dashboard"],
    queryFn: async () => {
      const r = await authFetch(`/api/cmms/maintenance-budgets/actuals?year=${new Date().getFullYear()}`);
      return r.json();
    },
    refetchInterval: 60000,
  });

  if (!dashboard) return <div className="text-center py-12 text-zinc-400">טוען...</div>;

  const eq = (dashboard.equipment || {}) as Record<string, unknown>;
  const wo = (dashboard.workOrders || {}) as Record<string, unknown>;
  const mtbf = Number(dashboard.mtbf || 0);
  const mttr = Number(dashboard.mttr || 0);
  const recentWo = (Array.isArray(dashboard.recentWorkOrders) ? dashboard.recentWorkOrders : []) as Record<string, unknown>[];
  const upcomingPm = (Array.isArray(dashboard.upcomingPm) ? dashboard.upcomingPm : []) as Record<string, unknown>[];
  const downEq = (Array.isArray(dashboard.downEquipment) ? dashboard.downEquipment : []) as Record<string, unknown>[];
  const monthlyCosts = (Array.isArray(dashboard.monthlyCosts) ? dashboard.monthlyCosts : []) as Record<string, unknown>[];
  const failureTypes = (Array.isArray(dashboard.failureTypes) ? dashboard.failureTypes : []) as Record<string, unknown>[];
  const todayCount = Number(dashboard.todayCount || 0);
  const thisWeekCount = Number(dashboard.thisWeekCount || 0);
  const weeklySchedule = (Array.isArray(dashboard.weeklySchedule) ? dashboard.weeklySchedule : []) as Record<string, unknown>[];
  const recentDowntime = (Array.isArray(dashboard.recentDowntime) ? dashboard.recentDowntime : []) as Record<string, unknown>[];
  const pendingRequests = (Array.isArray(dashboard.pendingRequests) ? dashboard.pendingRequests : []) as Record<string, unknown>[];
  const lowStock = (lowStockParts as Record<string, unknown>[]);
  const budgetVariancePct = budgetActuals ? Number(budgetActuals.variancePct || 0) : 0;
  const totalBudget = budgetActuals ? Number(budgetActuals.totalBudget || 0) : 0;
  const totalActual = budgetActuals ? Number(budgetActuals.totalActual || 0) : 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        <KpiCard title="ציוד פעיל" value={String(eq.active || 0)} icon={<Cpu className="w-5 h-5 text-emerald-400" />} color="bg-emerald-500/10" subtitle={`${eq.total_equipment || 0} סה״כ`} />
        <KpiCard title="בתחזוקה / מושבת" value={`${eq.in_maintenance || 0} / ${eq.down || 0}`} icon={<AlertTriangle className="w-5 h-5 text-amber-400" />} color="bg-amber-500/10" />
        <KpiCard title="תחזוקה היום" value={String(todayCount)} icon={<CalendarDays className="w-5 h-5 text-orange-400" />} color="bg-orange-500/10" />
        <KpiCard title="תחזוקה השבוע" value={String(thisWeekCount)} icon={<CalendarDays className="w-5 h-5 text-indigo-400" />} color="bg-indigo-500/10" />
        <KpiCard title="קריאות פתוחות" value={String(wo.open_work_orders || 0)} icon={<Wrench className="w-5 h-5 text-blue-400" />} color="bg-blue-500/10" subtitle={`${wo.critical_open || 0} קריטי`} />
        <KpiCard title="חלקים במלאי נמוך" value={String(lowStock.length)} icon={<Package className="w-5 h-5 text-orange-400" />} color={lowStock.length > 0 ? "bg-orange-500/20" : "bg-zinc-500/10"} subtitle="מתחת למינימום" />
        <KpiCard title="MTBF" value={`${formatNum(mtbf, 0)} שעות`} icon={<TrendingUp className="w-5 h-5 text-cyan-400" />} color="bg-cyan-500/10" subtitle="זמן ממוצע בין תקלות" />
        <KpiCard title="עלות חודשית" value={formatCurrency(Number(wo.monthly_cost || 0))} icon={<DollarSign className="w-5 h-5 text-green-400" />} color="bg-green-500/10" subtitle={`${formatNum(Number(wo.monthly_downtime || 0), 0)} שעות השבתה`} />
      </div>

      {(lowStock.length > 0 || budgetVariancePct >= 80) && (
        <div className="grid md:grid-cols-2 gap-4">
          {lowStock.length > 0 && (
            <div className="rounded-xl border border-orange-500/40 bg-orange-500/5 p-4">
              <h3 className="text-sm font-semibold text-orange-400 mb-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                התראות מלאי נמוך — חלקי חילוף ({lowStock.length})
              </h3>
              <div className="space-y-2 max-h-[180px] overflow-y-auto">
                {lowStock.slice(0, 6).map((part) => (
                  <div key={String(part.id)} className="flex items-center justify-between text-xs p-2 rounded bg-zinc-800/60">
                    <span className="text-zinc-200 font-medium">{String(part.name || "")}</span>
                    <span className="text-zinc-400 font-mono">{String(part.part_number || "")}</span>
                    <span className="text-orange-400">{String(part.current_stock || 0)} / {String(part.minimum_stock || 0)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {budgetVariancePct >= 80 && totalBudget > 0 && (
            <div className={`rounded-xl border p-4 ${budgetVariancePct >= 100 ? "border-red-500/40 bg-red-500/5" : "border-amber-500/40 bg-amber-500/5"}`}>
              <h3 className={`text-sm font-semibold mb-3 flex items-center gap-2 ${budgetVariancePct >= 100 ? "text-red-400" : "text-amber-400"}`}>
                <Wallet className="w-4 h-4" />
                התראת תקציב — {budgetVariancePct.toFixed(0)}% נוצל
              </h3>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-zinc-400">תקציב שנתי:</span>
                  <span className="text-zinc-200">{formatCurrency(totalBudget)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">בוצע בפועל:</span>
                  <span className={budgetVariancePct >= 100 ? "text-red-400" : "text-amber-400"}>{formatCurrency(totalActual)}</span>
                </div>
                <div className="w-full bg-zinc-700 rounded-full h-2 mt-2">
                  <div className={`h-2 rounded-full ${budgetVariancePct >= 100 ? "bg-red-500" : "bg-amber-500"}`} style={{ width: `${Math.min(budgetVariancePct, 100)}%` }} />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-xl border border-zinc-700/60 bg-zinc-900/80 p-5">
          <h3 className="text-base font-semibold text-zinc-100 mb-4 flex items-center gap-2">
            <Wrench className="w-5 h-5 text-blue-400" />
            קריאות שירות פתוחות
          </h3>
          {recentWo.length === 0 ? (
            <p className="text-zinc-500 text-sm text-center py-6">אין קריאות פתוחות</p>
          ) : (
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {recentWo.map((wo) => (
                <div key={String(wo.id)} className="flex items-center justify-between p-3 rounded-lg bg-zinc-800/60 border border-zinc-700/40">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="text-xs font-mono text-zinc-500">{String(wo.wo_number || "")}</div>
                    <div className="min-w-0">
                      <p className="text-sm text-zinc-200 truncate">{String(wo.title || "")}</p>
                      <p className="text-xs text-zinc-500">{String(wo.equipment_name || "—")}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <PriorityBadge priority={String(wo.priority || "medium")} />
                    <StatusBadge status={String(wo.status || "open")} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-zinc-700/60 bg-zinc-900/80 p-5">
            <h3 className="text-base font-semibold text-zinc-100 mb-3 flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-amber-400" />
              תחזוקה מונעת קרובה
            </h3>
            {upcomingPm.length === 0 ? (
              <p className="text-zinc-500 text-sm text-center py-4">אין תחזוקה מתוכננת</p>
            ) : (
              <div className="space-y-2 max-h-[160px] overflow-y-auto">
                {upcomingPm.map((pm) => {
                  const dueDate = new Date(String(pm.next_due));
                  const isOverdue = dueDate < new Date();
                  return (
                    <div key={String(pm.id)} className={`p-2.5 rounded-lg border ${isOverdue ? "border-red-500/40 bg-red-500/5" : "border-zinc-700/40 bg-zinc-800/60"}`}>
                      <p className="text-sm text-zinc-200 truncate">{String(pm.equipment_name || pm.title || "")}</p>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-xs text-zinc-500">{String(pm.assigned_to || "—")}</span>
                        <span className={`text-xs ${isOverdue ? "text-red-400 font-medium" : "text-zinc-400"}`}>
                          {formatDate(String(pm.next_due))}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {pendingRequests.length > 0 && (
            <div className="rounded-xl border border-yellow-500/30 bg-zinc-900/80 p-4">
              <h3 className="text-sm font-semibold text-yellow-400 mb-2 flex items-center gap-2">
                <Bell className="w-4 h-4" />
                בקשות תחזוקה ממתינות
              </h3>
              <div className="space-y-2">
                {pendingRequests.map((req) => (
                  <div key={String(req.id)} className="flex items-center justify-between p-2 rounded bg-zinc-800/60">
                    <div>
                      <p className="text-xs text-zinc-200">{String(req.title || "")}</p>
                      <p className="text-xs text-zinc-500">{String(req.equipment_name || "—")}</p>
                    </div>
                    <PriorityBadge priority={String(req.urgency || "medium")} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {downEq.length > 0 && (
            <div className="rounded-xl border border-red-500/30 bg-zinc-900/80 p-4">
              <h3 className="text-sm font-semibold text-red-400 mb-2 flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                ציוד מושבת
              </h3>
              <div className="space-y-2">
                {downEq.map((eq) => (
                  <div key={String(eq.id)} className="flex items-center justify-between p-2 rounded bg-zinc-800/60">
                    <div>
                      <p className="text-sm text-zinc-200">{String(eq.name || "")}</p>
                      <p className="text-xs text-zinc-500">{String(eq.location || "")}</p>
                    </div>
                    <StatusBadge status={String(eq.status || "down")} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {recentDowntime.length > 0 && (
        <div className="rounded-xl border border-zinc-700/60 bg-zinc-900/80 p-5">
          <h3 className="text-base font-semibold text-zinc-100 mb-4 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-400" />
            השבתות אחרונות
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-700/50">
                  <th className="text-right text-xs text-zinc-400 pb-2 px-2">מספר</th>
                  <th className="text-right text-xs text-zinc-400 pb-2 px-2">ציוד</th>
                  <th className="text-right text-xs text-zinc-400 pb-2 px-2">התחלה</th>
                  <th className="text-right text-xs text-zinc-400 pb-2 px-2">משך (דקות)</th>
                  <th className="text-right text-xs text-zinc-400 pb-2 px-2">סיבה</th>
                </tr>
              </thead>
              <tbody>
                {recentDowntime.map((dt) => (
                  <tr key={String(dt.id)} className="border-b border-zinc-800/50">
                    <td className="py-2 px-2 text-xs font-mono text-zinc-500">{String(dt.event_number || "")}</td>
                    <td className="py-2 px-2 text-zinc-200">{String(dt.equipment_name || "—")}</td>
                    <td className="py-2 px-2 text-zinc-400 text-xs">{formatDatetime(String(dt.start_time || ""))}</td>
                    <td className="py-2 px-2 text-zinc-400">{formatNum(Number(dt.duration_minutes || 0), 0)}</td>
                    <td className="py-2 px-2"><Badge text={DOWNTIME_REASON_LABELS[String(dt.reason_category)] || String(dt.reason_category)} color="bg-red-500/20 text-red-400" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-zinc-700/60 bg-zinc-900/80 p-5">
          <h3 className="text-base font-semibold text-zinc-100 mb-4">עלויות תחזוקה חודשיות</h3>
          {monthlyCosts.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={monthlyCosts}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="month" tick={{ fill: "#9ca3af", fontSize: 11 }} />
                <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} />
                <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #3f3f46", borderRadius: "8px", direction: "rtl" }} />
                <Area type="monotone" dataKey="cost" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.15} name="עלות (₪)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-zinc-500 text-sm text-center py-8">אין נתונים</p>
          )}
        </div>

        <div className="rounded-xl border border-zinc-700/60 bg-zinc-900/80 p-5">
          <h3 className="text-base font-semibold text-zinc-100 mb-4">התפלגות סוגי תקלות</h3>
          {failureTypes.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <RePieChart>
                <Pie
                  data={failureTypes.map((f, i) => ({ name: String(f.type), value: Number(f.count), fill: CHART_COLORS[i % CHART_COLORS.length] }))}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={85}
                  dataKey="value"
                >
                  {failureTypes.map((_f, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #3f3f46", borderRadius: "8px", direction: "rtl" }} />
                <Legend />
              </RePieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-zinc-500 text-sm text-center py-8">אין נתונים</p>
          )}
        </div>
      </div>

      {weeklySchedule.length > 0 && (
        <div className="rounded-xl border border-zinc-700/60 bg-zinc-900/80 p-5">
          <h3 className="text-base font-semibold text-zinc-100 mb-4 flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-indigo-400" />
            לוח תחזוקה שבועי
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-700/50">
                  <th className="text-right text-xs text-zinc-400 pb-2 px-2">מספר</th>
                  <th className="text-right text-xs text-zinc-400 pb-2 px-2">כותרת</th>
                  <th className="text-right text-xs text-zinc-400 pb-2 px-2">ציוד</th>
                  <th className="text-right text-xs text-zinc-400 pb-2 px-2">תאריך</th>
                  <th className="text-right text-xs text-zinc-400 pb-2 px-2">אחראי</th>
                  <th className="text-right text-xs text-zinc-400 pb-2 px-2">עדיפות</th>
                  <th className="text-right text-xs text-zinc-400 pb-2 px-2">סטטוס</th>
                </tr>
              </thead>
              <tbody>
                {weeklySchedule.map((wo) => (
                  <tr key={String(wo.id)} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                    <td className="py-2 px-2 text-xs font-mono text-zinc-500">{String(wo.wo_number || "")}</td>
                    <td className="py-2 px-2 text-zinc-200">{String(wo.title || "")}</td>
                    <td className="py-2 px-2 text-zinc-400">{String(wo.equipment_name || "—")}</td>
                    <td className="py-2 px-2 text-zinc-400">{formatDate(String(wo.scheduled_date || ""))}</td>
                    <td className="py-2 px-2 text-zinc-400">{String(wo.assigned_to || "—")}</td>
                    <td className="py-2 px-2"><PriorityBadge priority={String(wo.priority || "medium")} /></td>
                    <td className="py-2 px-2"><StatusBadge status={String(wo.status || "open")} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function EquipmentTab() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<Record<string, unknown> | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data: equipment = [] } = useQuery({
    queryKey: ["cmms-equipment"],
    queryFn: async () => {
      const r = await authFetch("/api/cmms/equipment");
      const j = await r.json();
      return Array.isArray(j) ? j : j.data || j.items || [];
    },
  });

  const { data: history } = useQuery({
    queryKey: ["cmms-equipment-history", expandedId],
    queryFn: async () => {
      if (!expandedId) return null;
      const r = await authFetch(`/api/cmms/equipment/${expandedId}/history`);
      return r.json();
    },
    enabled: !!expandedId,
  });

  const saveMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const id = data.id;
      const url = id ? `/api/cmms/equipment/${id}` : "/api/cmms/equipment";
      const r = await authFetch(url, { method: id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cmms-equipment"] });
      queryClient.invalidateQueries({ queryKey: ["cmms-dashboard"] });
      setShowForm(false);
      setEditItem(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await authFetch(`/api/cmms/equipment/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cmms-equipment"] });
      queryClient.invalidateQueries({ queryKey: ["cmms-dashboard"] });
    },
  });

  const filtered = (equipment as Record<string, unknown>[]).filter((eq) => {
    const matchSearch = !searchTerm || String(eq.name || "").includes(searchTerm) || String(eq.equipment_number || "").includes(searchTerm) || String(eq.manufacturer || "").includes(searchTerm);
    const matchStatus = statusFilter === "all" || eq.status === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="חיפוש ציוד..."
              className="bg-zinc-800 border border-zinc-700 rounded-lg pr-10 pl-4 py-2 text-sm text-zinc-200 placeholder:text-zinc-500 w-64"
            />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200">
            <option value="all">כל הסטטוסים</option>
            <option value="active">פעיל</option>
            <option value="maintenance">בתחזוקה</option>
            <option value="down">מושבת</option>
            <option value="retired">פורק</option>
          </select>
        </div>
        <button onClick={() => { setEditItem(null); setShowForm(true); }} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-zinc-100 rounded-lg text-sm font-medium flex items-center gap-2">
          <Plus className="w-4 h-4" /> הוסף ציוד
        </button>
      </div>

      {showForm && <EquipmentForm item={editItem} onSave={(d) => saveMutation.mutate(d)} onCancel={() => { setShowForm(false); setEditItem(null); }} saving={saveMutation.isPending} />}

      <div className="rounded-xl border border-zinc-700/60 bg-zinc-900/80 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-700/60 bg-zinc-800/50">
                <th className="text-right px-4 py-3 text-xs text-zinc-400 font-medium">מספר</th>
                <th className="text-right px-4 py-3 text-xs text-zinc-400 font-medium">שם</th>
                <th className="text-right px-4 py-3 text-xs text-zinc-400 font-medium">קטגוריה</th>
                <th className="text-right px-4 py-3 text-xs text-zinc-400 font-medium">יצרן / דגם</th>
                <th className="text-right px-4 py-3 text-xs text-zinc-400 font-medium">מיקום</th>
                <th className="text-right px-4 py-3 text-xs text-zinc-400 font-medium">קריטיות</th>
                <th className="text-right px-4 py-3 text-xs text-zinc-400 font-medium">סטטוס</th>
                <th className="text-right px-4 py-3 text-xs text-zinc-400 font-medium">תחזוקה הבאה</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((eq) => {
                const isExpanded = expandedId === Number(eq.id);
                const nextMaint = eq.next_maintenance_date ? new Date(String(eq.next_maintenance_date)) : null;
                const isOverdue = nextMaint && nextMaint < new Date();
                return (
                  <>
                    <tr key={String(eq.id)} className="border-b border-zinc-800/60 hover:bg-zinc-800/30 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : Number(eq.id))}>
                      <td className="px-4 py-3 font-mono text-xs text-zinc-400">{String(eq.equipment_number || "")}</td>
                      <td className="px-4 py-3 text-zinc-200 font-medium">{String(eq.name || "")}</td>
                      <td className="px-4 py-3 text-zinc-400">{String(eq.category || "—")}</td>
                      <td className="px-4 py-3 text-zinc-400 text-xs">{String(eq.manufacturer || "")} {String(eq.model || "")}</td>
                      <td className="px-4 py-3 text-zinc-400 text-xs">{String(eq.location || "—")}</td>
                      <td className="px-4 py-3"><PriorityBadge priority={String(eq.criticality || "medium")} /></td>
                      <td className="px-4 py-3"><StatusBadge status={String(eq.status || "active")} /></td>
                      <td className={`px-4 py-3 text-xs ${isOverdue ? "text-red-400 font-medium" : "text-zinc-400"}`}>
                        {formatDate(String(eq.next_maintenance_date || ""))}
                        {isOverdue && " ⚠"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <button onClick={() => { setEditItem(eq); setShowForm(true); }} className="p-1.5 rounded hover:bg-zinc-700/60 text-zinc-400 hover:text-zinc-200"><Edit className="w-3.5 h-3.5" /></button>
                          <button onClick={() => { if (confirm("למחוק ציוד זה?")) deleteMutation.mutate(Number(eq.id)); }} className="p-1.5 rounded hover:bg-zinc-700/60 text-zinc-400 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                          <button className="p-1.5 rounded hover:bg-zinc-700/60 text-zinc-400">{isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}</button>
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${eq.id}-expanded`}>
                        <td colSpan={9} className="bg-zinc-800/20 px-6 py-4">
                          <div className="grid md:grid-cols-4 gap-4">
                            <div>
                              <p className="text-xs text-zinc-500 mb-2 font-medium">פרטים טכניים</p>
                              <div className="space-y-1 text-xs">
                                <p className="text-zinc-300">מחלקה: <span className="text-zinc-400">{String(eq.department || "—")}</span></p>
                                <p className="text-zinc-300">קו ייצור: <span className="text-zinc-400">{String(eq.production_line || "—")}</span></p>
                                <p className="text-zinc-300">שעות: <span className="text-zinc-400">{formatNum(Number(eq.hours_used || 0), 0)}</span></p>
                                <p className="text-zinc-300">מחזורים: <span className="text-zinc-400">{formatNum(Number(eq.cycles_used || 0), 0)}</span></p>
                                <p className="text-zinc-300">עלות רכישה: <span className="text-zinc-400">{formatCurrency(Number(eq.purchase_cost || 0))}</span></p>
                              </div>
                            </div>
                            <div>
                              <p className="text-xs text-zinc-500 mb-2 font-medium">היסטוריית קריאות</p>
                              {history && Array.isArray((history as any).workOrders) ? (
                                <div className="space-y-1 max-h-[120px] overflow-y-auto">
                                  {((history as any).workOrders as any[]).slice(0, 4).map((wo: any) => (
                                    <div key={wo.id} className="flex items-center justify-between text-xs p-1.5 rounded bg-zinc-800/60">
                                      <span className="text-zinc-300 truncate">{wo.title || ""}</span>
                                      <StatusBadge status={String(wo.status || "")} />
                                    </div>
                                  ))}
                                  {(history as any).workOrders.length === 0 && <p className="text-zinc-500 text-xs">אין היסטוריה</p>}
                                </div>
                              ) : <p className="text-zinc-500 text-xs">טוען...</p>}
                            </div>
                            <div>
                              <p className="text-xs text-zinc-500 mb-2 font-medium">לוחות PM</p>
                              {history && Array.isArray((history as any).pmSchedules) ? (
                                <div className="space-y-1 max-h-[120px] overflow-y-auto">
                                  {((history as any).pmSchedules as any[]).map((pm: any) => (
                                    <div key={pm.id} className="text-xs p-1.5 rounded bg-zinc-800/60">
                                      <p className="text-zinc-300 truncate">{pm.title || ""}</p>
                                      <p className="text-zinc-500">הבא: {formatDate(pm.next_due)}</p>
                                    </div>
                                  ))}
                                  {(history as any).pmSchedules.length === 0 && <p className="text-zinc-500 text-xs">אין לוחות PM</p>}
                                </div>
                              ) : <p className="text-zinc-500 text-xs">טוען...</p>}
                            </div>
                            <div>
                              <p className="text-xs text-zinc-500 mb-2 font-medium">השבתות אחרונות</p>
                              {history && Array.isArray((history as any).downtime) ? (
                                <div className="space-y-1 max-h-[120px] overflow-y-auto">
                                  {((history as any).downtime as any[]).slice(0, 4).map((dt: any) => (
                                    <div key={dt.id} className="text-xs p-1.5 rounded bg-zinc-800/60">
                                      <p className="text-zinc-300">{DOWNTIME_REASON_LABELS[dt.reason_category] || dt.reason_category}</p>
                                      <p className="text-zinc-500">{formatNum(Number(dt.duration_minutes || 0), 0)} דקות</p>
                                    </div>
                                  ))}
                                  {(history as any).downtime.length === 0 && <p className="text-zinc-500 text-xs">אין השבתות</p>}
                                </div>
                              ) : <p className="text-zinc-500 text-xs">טוען...</p>}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={9} className="text-center py-12 text-zinc-500">אין ציוד</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function EquipmentForm({ item, onSave, onCancel, saving }: {
  item: Record<string, unknown> | null;
  onSave: (data: Record<string, unknown>) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<Record<string, unknown>>({
    id: item?.id || undefined,
    name: item?.name || "",
    category: item?.category || "",
    manufacturer: item?.manufacturer || "",
    model: item?.model || "",
    serialNumber: item?.serial_number || "",
    location: item?.location || "",
    department: item?.department || "",
    productionLine: item?.production_line || "",
    status: item?.status || "active",
    purchaseDate: item?.purchase_date ? String(item.purchase_date).slice(0, 10) : "",
    purchaseCost: item?.purchase_cost || 0,
    criticality: item?.criticality || "medium",
    hoursUsed: item?.hours_used || 0,
    cyclesUsed: item?.cycles_used || 0,
    nextMaintenanceDate: item?.next_maintenance_date ? String(item.next_maintenance_date).slice(0, 10) : "",
    notes: item?.notes || "",
  });

  const set = (k: string, v: unknown) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <div className="rounded-xl border border-zinc-700/60 bg-zinc-900/80 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-zinc-100">{item ? "עריכת ציוד" : "ציוד חדש"}</h3>
        <button onClick={onCancel} className="p-1 text-zinc-400 hover:text-zinc-200"><X className="w-5 h-5" /></button>
      </div>
      <div className="grid md:grid-cols-3 lg:grid-cols-4 gap-3">
        {[
          { label: "שם *", key: "name" },
          { label: "קטגוריה", key: "category" },
          { label: "יצרן", key: "manufacturer" },
          { label: "דגם", key: "model" },
          { label: "מספר סידורי", key: "serialNumber" },
          { label: "מיקום", key: "location" },
          { label: "מחלקה", key: "department" },
          { label: "קו ייצור", key: "productionLine" },
        ].map((f) => (
          <div key={f.key}>
            <label className="block text-xs text-zinc-400 mb-1">{f.label}</label>
            <input value={String(form[f.key] || "")} onChange={(e) => set(f.key, e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" />
          </div>
        ))}
        <div>
          <label className="block text-xs text-zinc-400 mb-1">סטטוס</label>
          <select value={String(form.status)} onChange={(e) => set("status", e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200">
            <option value="active">פעיל</option>
            <option value="maintenance">בתחזוקה</option>
            <option value="down">מושבת</option>
            <option value="retired">פורק</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">קריטיות</label>
          <select value={String(form.criticality)} onChange={(e) => set("criticality", e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200">
            <option value="low">נמוך</option>
            <option value="medium">בינוני</option>
            <option value="high">גבוה</option>
            <option value="critical">קריטי</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">עלות רכישה</label>
          <input type="number" value={Number(form.purchaseCost || 0)} onChange={(e) => set("purchaseCost", Number(e.target.value))} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">שעות שימוש</label>
          <input type="number" value={Number(form.hoursUsed || 0)} onChange={(e) => set("hoursUsed", Number(e.target.value))} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">מחזורים</label>
          <input type="number" value={Number(form.cyclesUsed || 0)} onChange={(e) => set("cyclesUsed", Number(e.target.value))} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">תאריך רכישה</label>
          <input type="date" value={String(form.purchaseDate || "")} onChange={(e) => set("purchaseDate", e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">תחזוקה הבאה</label>
          <input type="date" value={String(form.nextMaintenanceDate || "")} onChange={(e) => set("nextMaintenanceDate", e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" />
        </div>
      </div>
      <div>
        <label className="block text-xs text-zinc-400 mb-1">הערות</label>
        <textarea value={String(form.notes || "")} onChange={(e) => set("notes", e.target.value)} rows={2} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" />
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 rounded-lg text-sm">ביטול</button>
        <button onClick={() => onSave(form)} disabled={saving || !form.name} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-zinc-100 rounded-lg text-sm font-medium disabled:opacity-50">
          {saving ? "שומר..." : item ? "עדכן" : "צור"}
        </button>
      </div>
    </div>
  );
}

function PMSchedulesTab() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<Record<string, unknown> | null>(null);

  const { data: schedules = [] } = useQuery({
    queryKey: ["cmms-pm-schedules"],
    queryFn: async () => {
      const r = await authFetch("/api/cmms/pm-schedules");
      const j = await r.json();
      return Array.isArray(j) ? j : j.data || j.items || [];
    },
  });

  const { data: equipment = [] } = useQuery({
    queryKey: ["cmms-equipment"],
    queryFn: async () => {
      const r = await authFetch("/api/cmms/equipment");
      const j = await r.json();
      return Array.isArray(j) ? j : j.data || j.items || [];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const id = data.id;
      const url = id ? `/api/cmms/pm-schedules/${id}` : "/api/cmms/pm-schedules";
      const r = await authFetch(url, { method: id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cmms-pm-schedules"] });
      queryClient.invalidateQueries({ queryKey: ["cmms-dashboard"] });
      setShowForm(false);
      setEditItem(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await authFetch(`/api/cmms/pm-schedules/${id}`, { method: "DELETE" });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["cmms-pm-schedules"] }),
  });

  const checkMeterMutation = useMutation({
    mutationFn: async () => {
      const r = await authFetch("/api/cmms/pm-schedules/check-meter", { method: "POST" });
      return r.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["cmms-work-orders"] });
      queryClient.invalidateQueries({ queryKey: ["cmms-dashboard"] });
      alert(`בדיקת מד הושלמה: ${data.generated} קריאות שירות נוצרו`);
    },
  });

  const FREQ_LABELS: Record<string, string> = { daily: "יומי", weekly: "שבועי", monthly: "חודשי", quarterly: "רבעוני", yearly: "שנתי" };
  const METER_LABELS: Record<string, string> = { hours: "שעות", cycles: "מחזורים", km: "ק\"מ", units: "יחידות" };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h3 className="text-lg font-semibold text-zinc-100 flex items-center gap-2">
          <CalendarDays className="w-5 h-5 text-amber-400" />
          לוחות תחזוקה מונעת (PM)
        </h3>
        <div className="flex gap-2">
          <button
            onClick={() => checkMeterMutation.mutate()}
            disabled={checkMeterMutation.isPending}
            className="px-3 py-2 bg-amber-600/20 hover:bg-amber-600/30 text-amber-400 rounded-lg text-sm font-medium flex items-center gap-2"
          >
            <Gauge className="w-4 h-4" />
            {checkMeterMutation.isPending ? "בודק..." : "בדוק מדי שימוש"}
          </button>
          <button onClick={() => { setEditItem(null); setShowForm(true); }} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-zinc-100 rounded-lg text-sm font-medium flex items-center gap-2">
            <Plus className="w-4 h-4" /> לוח חדש
          </button>
        </div>
      </div>

      {showForm && (
        <PMScheduleForm
          item={editItem}
          equipment={equipment as Record<string, unknown>[]}
          onSave={(d) => saveMutation.mutate(d)}
          onCancel={() => { setShowForm(false); setEditItem(null); }}
          saving={saveMutation.isPending}
        />
      )}

      <div className="grid gap-3">
        {(schedules as Record<string, unknown>[]).map((pm) => {
          const nextDue = pm.next_due ? new Date(String(pm.next_due)) : null;
          const isOverdue = nextDue && nextDue < new Date();
          const daysUntil = nextDue ? Math.ceil((nextDue.getTime() - Date.now()) / 86400000) : null;
          let checklist: { task: string; done: boolean }[] = [];
          try { checklist = parseJsonField(pm.checklist, []); } catch { /* ignore */ }
          const hasMeter = pm.meter_type && pm.meter_threshold;

          return (
            <div key={String(pm.id)} className={`rounded-xl border ${isOverdue ? "border-red-500/40" : "border-zinc-700/60"} bg-zinc-900/80 p-4`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs text-zinc-500">{String(pm.schedule_number || "")}</span>
                    <h4 className="text-sm font-semibold text-zinc-200 truncate">{String(pm.title || "")}</h4>
                    <PriorityBadge priority={String(pm.priority || "medium")} />
                    {pm.is_active === false && <Badge text="לא פעיל" color="bg-zinc-600 text-zinc-300" />}
                    {hasMeter && <Badge text={`מד: כל ${pm.meter_threshold} ${METER_LABELS[String(pm.meter_type)] || String(pm.meter_type)}`} color="bg-cyan-500/20 text-cyan-400" />}
                  </div>
                  <div className="flex items-center gap-4 mt-2 text-xs text-zinc-400 flex-wrap">
                    <span className="flex items-center gap-1"><Cpu className="w-3.5 h-3.5" />{String(pm.equipment_name || "—")}</span>
                    <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{FREQ_LABELS[String(pm.frequency)] || pm.frequency} ({pm.frequency_days} ימים)</span>
                    <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" />{String(pm.assigned_to || "—")}</span>
                    <span className="flex items-center gap-1"><Timer className="w-3.5 h-3.5" />{formatNum(Number(pm.estimated_hours || 0))} שעות</span>
                  </div>
                  {checklist.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {checklist.slice(0, 4).map((c, i) => (
                        <span key={i} className="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700/50 flex items-center gap-1">
                          <ListChecks className="w-3 h-3" />{c.task}
                        </span>
                      ))}
                      {checklist.length > 4 && <span className="text-xs text-zinc-500">+{checklist.length - 4} נוספות</span>}
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <div className={`text-xs font-medium px-2 py-1 rounded ${isOverdue ? "bg-red-500/20 text-red-400" : daysUntil !== null && daysUntil <= 7 ? "bg-amber-500/20 text-amber-400" : "bg-zinc-700 text-zinc-300"}`}>
                    {isOverdue ? `באיחור (${Math.abs(daysUntil || 0)} ימים)` : daysUntil !== null ? `בעוד ${daysUntil} ימים` : "—"}
                  </div>
                  <p className="text-xs text-zinc-500">{formatDate(String(pm.next_due || ""))}</p>
                  <div className="flex items-center gap-1">
                    <button onClick={() => { setEditItem(pm); setShowForm(true); }} className="p-1.5 rounded hover:bg-zinc-700/60 text-zinc-400 hover:text-zinc-200"><Edit className="w-3.5 h-3.5" /></button>
                    <button onClick={() => { if (confirm("למחוק לוח תחזוקה זה?")) deleteMutation.mutate(Number(pm.id)); }} className="p-1.5 rounded hover:bg-zinc-700/60 text-zinc-400 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        {(schedules as Record<string, unknown>[]).length === 0 && (
          <div className="text-center py-12 text-zinc-500">אין לוחות תחזוקה מונעת</div>
        )}
      </div>
    </div>
  );
}

function PMScheduleForm({ item, equipment, onSave, onCancel, saving }: {
  item: Record<string, unknown> | null;
  equipment: Record<string, unknown>[];
  onSave: (data: Record<string, unknown>) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<Record<string, unknown>>({
    id: item?.id || undefined,
    equipmentId: item?.equipment_id || "",
    title: item?.title || "",
    description: item?.description || "",
    frequency: item?.frequency || "monthly",
    frequencyDays: item?.frequency_days || 30,
    meterType: item?.meter_type || "",
    meterThreshold: item?.meter_threshold || 0,
    currentMeterReading: item?.current_meter_reading || 0,
    assignedTo: item?.assigned_to || "",
    estimatedHours: item?.estimated_hours || 1,
    nextDue: item?.next_due ? String(item.next_due).slice(0, 10) : "",
    isActive: item?.is_active !== false,
    priority: item?.priority || "medium",
    checklist: parseJsonField<{ task: string; done: boolean }[]>(item?.checklist, []),
  });
  const [newTask, setNewTask] = useState("");

  const set = (k: string, v: unknown) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <div className="rounded-xl border border-zinc-700/60 bg-zinc-900/80 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-zinc-100">{item ? "עריכת לוח PM" : "לוח PM חדש"}</h3>
        <button onClick={onCancel} className="p-1 text-zinc-400 hover:text-zinc-200"><X className="w-5 h-5" /></button>
      </div>
      <div className="grid md:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs text-zinc-400 mb-1">כותרת *</label>
          <input value={String(form.title || "")} onChange={(e) => set("title", e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">ציוד</label>
          <select value={String(form.equipmentId || "")} onChange={(e) => set("equipmentId", e.target.value ? Number(e.target.value) : "")} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200">
            <option value="">— בחר ציוד —</option>
            {equipment.map((eq) => <option key={String(eq.id)} value={String(eq.id)}>{String(eq.name)}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">תדירות לוח שנה</label>
          <select value={String(form.frequency)} onChange={(e) => set("frequency", e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200">
            <option value="daily">יומי</option>
            <option value="weekly">שבועי</option>
            <option value="monthly">חודשי</option>
            <option value="quarterly">רבעוני</option>
            <option value="yearly">שנתי</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">כל (ימים)</label>
          <input type="number" value={Number(form.frequencyDays || 30)} onChange={(e) => set("frequencyDays", Number(e.target.value))} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">סוג מד שימוש</label>
          <select value={String(form.meterType || "")} onChange={(e) => set("meterType", e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200">
            <option value="">ללא מד</option>
            <option value="hours">שעות</option>
            <option value="cycles">מחזורים</option>
            <option value="km">ק"מ</option>
            <option value="units">יחידות</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">סף מד (ייצור WO)</label>
          <input type="number" value={Number(form.meterThreshold || 0)} onChange={(e) => set("meterThreshold", Number(e.target.value))} placeholder="0 = לא פעיל" className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600" />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">קריאת מד נוכחית</label>
          <input type="number" value={Number(form.currentMeterReading || 0)} onChange={(e) => set("currentMeterReading", Number(e.target.value))} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">אחראי</label>
          <input value={String(form.assignedTo || "")} onChange={(e) => set("assignedTo", e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">שעות מוערכות</label>
          <input type="number" step="0.5" value={Number(form.estimatedHours || 1)} onChange={(e) => set("estimatedHours", Number(e.target.value))} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">עדיפות</label>
          <select value={String(form.priority)} onChange={(e) => set("priority", e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200">
            <option value="low">נמוך</option>
            <option value="medium">בינוני</option>
            <option value="high">גבוה</option>
            <option value="critical">קריטי</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">תאריך הבא</label>
          <input type="date" value={String(form.nextDue || "")} onChange={(e) => set("nextDue", e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" />
        </div>
        <div className="flex items-center gap-2 mt-5">
          <input type="checkbox" checked={!!form.isActive} onChange={(e) => set("isActive", e.target.checked)} id="pm-active" className="rounded border-zinc-600" />
          <label htmlFor="pm-active" className="text-sm text-zinc-300">פעיל</label>
        </div>
      </div>
      <div>
        <label className="block text-xs text-zinc-400 mb-1">צ'ק ליסט</label>
        <div className="flex items-center gap-2 mb-2">
          <input value={newTask} onChange={(e) => setNewTask(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && newTask.trim()) { set("checklist", [...(form.checklist as any[]), { task: newTask.trim(), done: false }]); setNewTask(""); } }} placeholder="הוסף משימה..." className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-500" />
          <button onClick={() => { if (newTask.trim()) { set("checklist", [...(form.checklist as any[]), { task: newTask.trim(), done: false }]); setNewTask(""); } }} className="px-3 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-zinc-200 text-sm"><Plus className="w-4 h-4" /></button>
        </div>
        <div className="flex flex-wrap gap-2">
          {(form.checklist as { task: string; done: boolean }[]).map((c, i) => (
            <span key={i} className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-300">
              {c.task}
              <button onClick={() => set("checklist", (form.checklist as any[]).filter((_: any, idx: number) => idx !== i))} className="text-zinc-500 hover:text-red-400 ml-1"><X className="w-3 h-3" /></button>
            </span>
          ))}
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 rounded-lg text-sm">ביטול</button>
        <button onClick={() => onSave(form)} disabled={saving || !form.title} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-zinc-100 rounded-lg text-sm font-medium disabled:opacity-50">
          {saving ? "שומר..." : item ? "עדכן" : "צור"}
        </button>
      </div>
    </div>
  );
}

function WorkOrdersTab() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<Record<string, unknown> | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data: workOrders = [] } = useQuery({
    queryKey: ["cmms-work-orders", statusFilter],
    queryFn: async () => {
      const url = statusFilter !== "all" ? `/api/cmms/work-orders?status=${statusFilter}` : "/api/cmms/work-orders";
      const r = await authFetch(url);
      const j = await r.json();
      return Array.isArray(j) ? j : j.data || j.items || [];
    },
  });

  const { data: equipment = [] } = useQuery({
    queryKey: ["cmms-equipment"],
    queryFn: async () => {
      const r = await authFetch("/api/cmms/equipment");
      const j = await r.json();
      return Array.isArray(j) ? j : j.data || j.items || [];
    },
  });

  const { data: woStats } = useQuery({
    queryKey: ["cmms-wo-stats"],
    queryFn: async () => {
      const r = await authFetch("/api/cmms/work-orders/stats");
      return r.json();
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const id = data.id;
      const url = id ? `/api/cmms/work-orders/${id}` : "/api/cmms/work-orders";
      const r = await authFetch(url, { method: id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cmms-work-orders"] });
      queryClient.invalidateQueries({ queryKey: ["cmms-wo-stats"] });
      queryClient.invalidateQueries({ queryKey: ["cmms-dashboard"] });
      setShowForm(false);
      setEditItem(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await authFetch(`/api/cmms/work-orders/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cmms-work-orders"] });
      queryClient.invalidateQueries({ queryKey: ["cmms-wo-stats"] });
    },
  });

  const stats = woStats as Record<string, unknown> | undefined;
  const statusFlow = ["open", "assigned", "in_progress", "waiting_parts", "completed", "closed"];

  return (
    <div className="space-y-4">
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <KpiCard title="פתוחות" value={String(stats.open_count || 0)} icon={<AlertCircle className="w-5 h-5 text-blue-400" />} color="bg-blue-500/10" />
          <KpiCard title="שויכו" value={String(stats.assigned_count || 0)} icon={<Users className="w-5 h-5 text-indigo-400" />} color="bg-indigo-500/10" />
          <KpiCard title="בביצוע" value={String(stats.in_progress || 0)} icon={<Wrench className="w-5 h-5 text-amber-400" />} color="bg-amber-500/10" />
          <KpiCard title="ממתין לחלקים" value={String(stats.waiting_parts || 0)} icon={<Package className="w-5 h-5 text-purple-400" />} color="bg-purple-500/10" />
          <KpiCard title="הושלמו" value={String(stats.completed || 0)} icon={<CheckCircle2 className="w-5 h-5 text-emerald-400" />} color="bg-emerald-500/10" />
          <KpiCard title="מונעת / מתקנת" value={`${stats.preventive_count || 0} / ${stats.corrective_count || 0}`} icon={<BarChart3 className="w-5 h-5 text-cyan-400" />} color="bg-cyan-500/10" />
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          {["all", ...statusFlow].map((s) => (
            <button key={s} onClick={() => setStatusFilter(s)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${statusFilter === s ? "bg-blue-600 text-zinc-100" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"}`}>
              {s === "all" ? "הכל" : STATUS_LABELS[s] || s}
            </button>
          ))}
        </div>
        <button onClick={() => { setEditItem(null); setShowForm(true); }} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-zinc-100 rounded-lg text-sm font-medium flex items-center gap-2">
          <Plus className="w-4 h-4" /> קריאה חדשה
        </button>
      </div>

      {showForm && (
        <WorkOrderForm
          item={editItem}
          equipment={equipment as Record<string, unknown>[]}
          onSave={(d) => saveMutation.mutate(d)}
          onCancel={() => { setShowForm(false); setEditItem(null); }}
          saving={saveMutation.isPending}
        />
      )}

      <div className="space-y-2">
        {(workOrders as Record<string, unknown>[]).map((wo) => {
          const isExpanded = expandedId === Number(wo.id);
          const checklist = parseJsonField<{ task: string; done: boolean }[]>(wo.checklist, []);
          const partsConsumed = parseJsonField<{ name: string; partNumber?: string; quantity?: number; unitCost?: number }[]>(wo.parts_consumed, []);
          const laborLogs = parseJsonField<{ technician: string; hours: number; date: string; notes?: string }[]>(wo.labor_logs, []);

          return (
            <div key={String(wo.id)} className="rounded-xl border border-zinc-700/60 bg-zinc-900/80 overflow-hidden">
              <div className="p-4 flex items-start justify-between gap-3 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : Number(wo.id))}>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs text-zinc-500">{String(wo.wo_number || "")}</span>
                    <h4 className="text-sm font-semibold text-zinc-200 truncate">{String(wo.title || "")}</h4>
                    <PriorityBadge priority={String(wo.priority || "medium")} />
                    <StatusBadge status={String(wo.status || "open")} />
                  </div>
                  <div className="flex items-center gap-4 mt-1.5 text-xs text-zinc-400 flex-wrap">
                    <span className="flex items-center gap-1"><Cpu className="w-3.5 h-3.5" />{String(wo.equipment_name || "—")}</span>
                    <span>{wo.work_type === "corrective" ? "תיקון" : wo.work_type === "preventive" ? "מונעת" : "חירום"}</span>
                    <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" />{String(wo.assigned_to || "—")}</span>
                    {Number(wo.total_cost || 0) > 0 && <span>{formatCurrency(Number(wo.total_cost))}</span>}
                    {wo.started_at && <span className="flex items-center gap-1"><Timer className="w-3 h-3" />התחיל: {formatDate(String(wo.started_at))}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                  {wo.status === "open" && <button onClick={() => saveMutation.mutate({ id: wo.id, status: "assigned" })} className="px-2 py-1 bg-indigo-500/20 text-indigo-400 rounded text-xs hover:bg-indigo-500/30">שייך</button>}
                  {wo.status === "assigned" && <button onClick={() => saveMutation.mutate({ id: wo.id, status: "in_progress" })} className="px-2 py-1 bg-amber-500/20 text-amber-400 rounded text-xs hover:bg-amber-500/30">התחל</button>}
                  {wo.status === "in_progress" && (
                    <>
                      <button onClick={() => saveMutation.mutate({ id: wo.id, status: "waiting_parts" })} className="px-2 py-1 bg-purple-500/20 text-purple-400 rounded text-xs hover:bg-purple-500/30">ממתין</button>
                      <button onClick={() => saveMutation.mutate({ id: wo.id, status: "completed" })} className="px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded text-xs hover:bg-emerald-500/30">סיים</button>
                    </>
                  )}
                  {wo.status === "waiting_parts" && <button onClick={() => saveMutation.mutate({ id: wo.id, status: "in_progress" })} className="px-2 py-1 bg-amber-500/20 text-amber-400 rounded text-xs hover:bg-amber-500/30">חזור לביצוע</button>}
                  {wo.status === "completed" && <button onClick={() => saveMutation.mutate({ id: wo.id, status: "closed" })} className="px-2 py-1 bg-teal-500/20 text-teal-400 rounded text-xs hover:bg-teal-500/30">סגור</button>}
                  <button onClick={() => { setEditItem(wo); setShowForm(true); }} className="p-1.5 rounded hover:bg-zinc-700/60 text-zinc-400 hover:text-zinc-200"><Edit className="w-3.5 h-3.5" /></button>
                  <button onClick={() => { if (confirm("למחוק קריאה זו?")) deleteMutation.mutate(Number(wo.id)); }} className="p-1.5 rounded hover:bg-zinc-700/60 text-zinc-400 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>

              {isExpanded && (
                <div className="border-t border-zinc-700/40 bg-zinc-800/20 p-4 space-y-4">
                  <div className="grid md:grid-cols-3 gap-4 text-xs">
                    <div className="space-y-1">
                      <p className="text-zinc-500 font-medium mb-2">ציר הזמן</p>
                      {wo.created_at && <p className="text-zinc-400">נוצר: <span className="text-zinc-300">{formatDate(String(wo.created_at))}</span></p>}
                      {wo.assigned_at && <p className="text-zinc-400">שויך: <span className="text-zinc-300">{formatDate(String(wo.assigned_at))}</span></p>}
                      {wo.started_at && <p className="text-zinc-400">התחיל: <span className="text-zinc-300">{formatDate(String(wo.started_at))}</span></p>}
                      {wo.waiting_parts_at && <p className="text-zinc-400">ממתין לחלקים: <span className="text-zinc-300">{formatDate(String(wo.waiting_parts_at))}</span></p>}
                      {wo.completed_at && <p className="text-zinc-400">הושלם: <span className="text-zinc-300">{formatDate(String(wo.completed_at))}</span></p>}
                      {wo.closed_at && <p className="text-zinc-400">נסגר: <span className="text-zinc-300">{formatDate(String(wo.closed_at))}</span></p>}
                      <p className="text-zinc-400 mt-2">שעות מוערכות: <span className="text-zinc-300">{formatNum(Number(wo.estimated_hours || 0))}</span></p>
                      <p className="text-zinc-400">שעות בפועל: <span className="text-zinc-300">{formatNum(Number(wo.actual_hours || 0))}</span></p>
                      <p className="text-zinc-400">שעות השבתה: <span className="text-zinc-300">{formatNum(Number(wo.downtime_hours || 0))}</span></p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-zinc-500 font-medium mb-2">חלקים שנוצלו</p>
                      {partsConsumed.length === 0 ? <p className="text-zinc-500">אין חלקים</p> : partsConsumed.map((p, i) => (
                        <div key={i} className="flex items-center justify-between p-1.5 rounded bg-zinc-800/60">
                          <span className="text-zinc-300">{p.name} {p.partNumber && <span className="text-zinc-500">({p.partNumber})</span>}</span>
                          <span className="text-zinc-400">x{p.quantity || 1} · {p.unitCost ? formatCurrency(p.unitCost) : ""}</span>
                        </div>
                      ))}
                      <p className="text-zinc-500 font-medium mt-2 mb-1">עלויות</p>
                      <p className="text-zinc-400">חלקים: <span className="text-zinc-300">{formatCurrency(Number(wo.parts_cost || 0))}</span></p>
                      <p className="text-zinc-400">עבודה: <span className="text-zinc-300">{formatCurrency(Number(wo.labor_cost || 0))}</span></p>
                      <p className="text-zinc-300 font-medium">סה&quot;כ: {formatCurrency(Number(wo.total_cost || 0))}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-zinc-500 font-medium mb-2">יומן עבודה</p>
                      {laborLogs.length === 0 ? <p className="text-zinc-500">אין רשומות</p> : laborLogs.map((l, i) => (
                        <div key={i} className="p-1.5 rounded bg-zinc-800/60">
                          <p className="text-zinc-300">{l.technician} · {l.hours} שעות</p>
                          <p className="text-zinc-500 text-xs">{l.date}{l.notes && ` — ${l.notes}`}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  {checklist.length > 0 && (
                    <div>
                      <p className="text-xs text-zinc-500 font-medium mb-2">צ'ק ליסט ({checklist.filter(c => c.done).length}/{checklist.length})</p>
                      <div className="grid md:grid-cols-2 gap-1">
                        {checklist.map((c, i) => (
                          <label key={i} className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer p-1.5 rounded hover:bg-zinc-700/30">
                            <input
                              type="checkbox"
                              checked={c.done}
                              onChange={() => {
                                const updated = checklist.map((item, idx) => idx === i ? { ...item, done: !item.done } : item);
                                saveMutation.mutate({ id: wo.id, checklist: updated });
                              }}
                              className="rounded border-zinc-600"
                            />
                            <span className={c.done ? "line-through text-zinc-500" : ""}>{c.task}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                  {(wo.failure_description || wo.solution) && (
                    <div className="grid md:grid-cols-2 gap-4 text-xs">
                      {wo.failure_description && <div><p className="text-zinc-500 font-medium mb-1">תיאור תקלה</p><p className="text-zinc-300">{String(wo.failure_description)}</p></div>}
                      {wo.solution && <div><p className="text-zinc-500 font-medium mb-1">פתרון</p><p className="text-zinc-300">{String(wo.solution)}</p></div>}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {(workOrders as Record<string, unknown>[]).length === 0 && (
          <div className="text-center py-12 text-zinc-500">אין קריאות שירות</div>
        )}
      </div>
    </div>
  );
}

function WorkOrderForm({ item, equipment, onSave, onCancel, saving }: {
  item: Record<string, unknown> | null;
  equipment: Record<string, unknown>[];
  onSave: (data: Record<string, unknown>) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<Record<string, unknown>>({
    id: item?.id || undefined,
    equipmentId: item?.equipment_id || "",
    title: item?.title || "",
    description: item?.description || "",
    workType: item?.work_type || "corrective",
    priority: item?.priority || "medium",
    status: item?.status || "open",
    reportedBy: item?.reported_by || "",
    assignedTo: item?.assigned_to || "",
    failureType: item?.failure_type || "",
    failureDescription: item?.failure_description || "",
    solution: item?.solution || "",
    estimatedHours: item?.estimated_hours || 0,
    actualHours: item?.actual_hours || 0,
    downtimeHours: item?.downtime_hours || 0,
    partsCost: item?.parts_cost || 0,
    laborCost: item?.labor_cost || 0,
    totalCost: item?.total_cost || 0,
    scheduledDate: item?.scheduled_date ? String(item.scheduled_date).slice(0, 10) : "",
    notes: item?.notes || "",
    checklist: parseJsonField<{ task: string; done: boolean }[]>(item?.checklist, []),
    partsConsumed: parseJsonField<{ name: string; partNumber: string; quantity: number; unitCost: number }[]>(item?.parts_consumed, []),
    laborLogs: parseJsonField<{ technician: string; hours: number; date: string; notes: string }[]>(item?.labor_logs, []),
  });
  const [newTask, setNewTask] = useState("");
  const [newPart, setNewPart] = useState({ name: "", partNumber: "", quantity: 1, unitCost: 0 });
  const [newLabor, setNewLabor] = useState({ technician: "", hours: 1, date: new Date().toISOString().slice(0, 10), notes: "" });

  const set = (k: string, v: unknown) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <div className="rounded-xl border border-zinc-700/60 bg-zinc-900/80 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-zinc-100">{item ? "עריכת קריאה" : "קריאת שירות חדשה"}</h3>
        <button onClick={onCancel} className="p-1 text-zinc-400 hover:text-zinc-200"><X className="w-5 h-5" /></button>
      </div>
      <div className="grid md:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs text-zinc-400 mb-1">כותרת *</label>
          <input value={String(form.title || "")} onChange={(e) => set("title", e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">ציוד</label>
          <select value={String(form.equipmentId || "")} onChange={(e) => set("equipmentId", e.target.value ? Number(e.target.value) : "")} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200">
            <option value="">— בחר ציוד —</option>
            {equipment.map((eq) => <option key={String(eq.id)} value={String(eq.id)}>{String(eq.name)}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">סוג</label>
          <select value={String(form.workType)} onChange={(e) => set("workType", e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200">
            <option value="corrective">תיקון</option>
            <option value="preventive">מונעת</option>
            <option value="emergency">חירום</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">עדיפות</label>
          <select value={String(form.priority)} onChange={(e) => set("priority", e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200">
            <option value="low">נמוך</option>
            <option value="medium">בינוני</option>
            <option value="high">גבוה</option>
            <option value="critical">קריטי</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">סטטוס</label>
          <select value={String(form.status)} onChange={(e) => set("status", e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200">
            <option value="open">פתוח</option>
            <option value="assigned">שויך</option>
            <option value="in_progress">בביצוע</option>
            <option value="waiting_parts">ממתין לחלקים</option>
            <option value="completed">הושלם</option>
            <option value="closed">סגור</option>
            <option value="cancelled">בוטל</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">סוג תקלה</label>
          <select value={String(form.failureType || "")} onChange={(e) => set("failureType", e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200">
            <option value="">— בחר —</option>
            <option value="מכני">מכני</option>
            <option value="חשמלי">חשמלי</option>
            <option value="הידראולי">הידראולי</option>
            <option value="פנאומטי">פנאומטי</option>
            <option value="בלאי">בלאי</option>
            <option value="קליברציה">קליברציה</option>
            <option value="תוכנה">תוכנה</option>
            <option value="חימום">חימום</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">מדווח</label>
          <input value={String(form.reportedBy || "")} onChange={(e) => set("reportedBy", e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">אחראי</label>
          <input value={String(form.assignedTo || "")} onChange={(e) => set("assignedTo", e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">תאריך מתוכנן</label>
          <input type="date" value={String(form.scheduledDate || "")} onChange={(e) => set("scheduledDate", e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">שעות מוערכות</label>
          <input type="number" step="0.5" value={Number(form.estimatedHours || 0)} onChange={(e) => set("estimatedHours", Number(e.target.value))} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">שעות בפועל</label>
          <input type="number" step="0.5" value={Number(form.actualHours || 0)} onChange={(e) => set("actualHours", Number(e.target.value))} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">שעות השבתה</label>
          <input type="number" step="0.5" value={Number(form.downtimeHours || 0)} onChange={(e) => set("downtimeHours", Number(e.target.value))} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">עלות חלקים</label>
          <input type="number" value={Number(form.partsCost || 0)} onChange={(e) => set("partsCost", Number(e.target.value))} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">עלות עבודה</label>
          <input type="number" value={Number(form.laborCost || 0)} onChange={(e) => set("laborCost", Number(e.target.value))} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">עלות כוללת</label>
          <input type="number" value={Number(form.totalCost || 0)} onChange={(e) => set("totalCost", Number(e.target.value))} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" />
        </div>
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-zinc-400 mb-1">תיאור תקלה</label>
          <textarea value={String(form.failureDescription || "")} onChange={(e) => set("failureDescription", e.target.value)} rows={2} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">פתרון</label>
          <textarea value={String(form.solution || "")} onChange={(e) => set("solution", e.target.value)} rows={2} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" />
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs text-zinc-400 mb-1">חלקים שנוצלו</label>
          <div className="grid grid-cols-2 gap-1 mb-2">
            <input value={newPart.name} onChange={(e) => setNewPart(p => ({ ...p, name: e.target.value }))} placeholder="שם חלק" className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-500" />
            <input value={newPart.partNumber} onChange={(e) => setNewPart(p => ({ ...p, partNumber: e.target.value }))} placeholder={'מק"ט'} className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-500" />
            <input type="number" min={1} value={newPart.quantity} onChange={(e) => setNewPart(p => ({ ...p, quantity: Number(e.target.value) }))} placeholder="כמות" className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-zinc-200" />
            <div className="flex gap-1">
              <input type="number" value={newPart.unitCost} onChange={(e) => setNewPart(p => ({ ...p, unitCost: Number(e.target.value) }))} placeholder="מחיר יחידה" className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-zinc-200" />
              <button onClick={() => { if (newPart.name) { set("partsConsumed", [...(form.partsConsumed as any[]), { ...newPart }]); setNewPart({ name: "", partNumber: "", quantity: 1, unitCost: 0 }); } }} className="px-2 bg-zinc-700 rounded-lg text-zinc-200"><Plus className="w-3 h-3" /></button>
            </div>
          </div>
          {(form.partsConsumed as any[]).map((p: any, i: number) => (
            <div key={i} className="flex items-center justify-between p-1.5 rounded bg-zinc-800/60 mb-1 text-xs">
              <span className="text-zinc-300">{p.name} <span className="text-zinc-500">x{p.quantity}</span></span>
              <button onClick={() => set("partsConsumed", (form.partsConsumed as any[]).filter((_: any, idx: number) => idx !== i))} className="text-zinc-500 hover:text-red-400"><X className="w-3 h-3" /></button>
            </div>
          ))}
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">יומן עבודה</label>
          <div className="space-y-1 mb-2">
            <input value={newLabor.technician} onChange={(e) => setNewLabor(l => ({ ...l, technician: e.target.value }))} placeholder="טכנאי" className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-500" />
            <div className="flex gap-1">
              <input type="number" step="0.5" value={newLabor.hours} onChange={(e) => setNewLabor(l => ({ ...l, hours: Number(e.target.value) }))} placeholder="שעות" className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-zinc-200" />
              <input type="date" value={newLabor.date} onChange={(e) => setNewLabor(l => ({ ...l, date: e.target.value }))} className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-zinc-200" />
            </div>
            <div className="flex gap-1">
              <input value={newLabor.notes} onChange={(e) => setNewLabor(l => ({ ...l, notes: e.target.value }))} placeholder="הערות" className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-500" />
              <button onClick={() => { if (newLabor.technician) { set("laborLogs", [...(form.laborLogs as any[]), { ...newLabor }]); setNewLabor({ technician: "", hours: 1, date: new Date().toISOString().slice(0, 10), notes: "" }); } }} className="px-2 bg-zinc-700 rounded-lg text-zinc-200"><Plus className="w-3 h-3" /></button>
            </div>
          </div>
          {(form.laborLogs as any[]).map((l: any, i: number) => (
            <div key={i} className="flex items-center justify-between p-1.5 rounded bg-zinc-800/60 mb-1 text-xs">
              <span className="text-zinc-300">{l.technician} · {l.hours}h</span>
              <button onClick={() => set("laborLogs", (form.laborLogs as any[]).filter((_: any, idx: number) => idx !== i))} className="text-zinc-500 hover:text-red-400"><X className="w-3 h-3" /></button>
            </div>
          ))}
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">צ'ק ליסט</label>
          <div className="flex items-center gap-1 mb-2">
            <input value={newTask} onChange={(e) => setNewTask(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && newTask.trim()) { set("checklist", [...(form.checklist as any[]), { task: newTask.trim(), done: false }]); setNewTask(""); } }} placeholder="משימה..." className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-500" />
            <button onClick={() => { if (newTask.trim()) { set("checklist", [...(form.checklist as any[]), { task: newTask.trim(), done: false }]); setNewTask(""); } }} className="px-2 py-1.5 bg-zinc-700 rounded-lg text-zinc-200"><Plus className="w-3 h-3" /></button>
          </div>
          {(form.checklist as any[]).map((c: any, i: number) => (
            <div key={i} className="flex items-center justify-between p-1.5 rounded bg-zinc-800/60 mb-1 text-xs">
              <span className="text-zinc-300">{c.task}</span>
              <button onClick={() => set("checklist", (form.checklist as any[]).filter((_: any, idx: number) => idx !== i))} className="text-zinc-500 hover:text-red-400"><X className="w-3 h-3" /></button>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 rounded-lg text-sm">ביטול</button>
        <button onClick={() => onSave(form)} disabled={saving || !form.title} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-zinc-100 rounded-lg text-sm font-medium disabled:opacity-50">
          {saving ? "שומר..." : item ? "עדכן" : "צור"}
        </button>
      </div>
    </div>
  );
}

function QrCodeDisplay({ equipmentId, equipmentNumber, name }: { equipmentId: number; equipmentNumber: string; name: string }) {
  const [show, setShow] = useState(false);
  const size = 200;
  const qrValue = `CMMS:${equipmentNumber}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(qrValue)}&bgcolor=18181b&color=e4e4e7&margin=10`;
  return (
    <div>
      <button onClick={() => setShow(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-700/60 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs">
        <QrCode className="w-3.5 h-3.5" /> QR
      </button>
      {show && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={() => setShow(false)}>
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 space-y-4 max-w-xs w-full text-center" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center">
              <h3 className="text-base font-bold text-zinc-100 flex items-center gap-2"><QrCode className="w-4 h-4 text-blue-400" /> קוד QR</h3>
              <button onClick={() => setShow(false)}><X className="w-4 h-4 text-zinc-400" /></button>
            </div>
            <div className="bg-zinc-800 rounded-xl p-4 flex justify-center">
              <img src={qrUrl} alt={`QR for ${equipmentNumber}`} className="rounded-lg" width={size} height={size} />
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-200">{name}</p>
              <p className="text-xs font-mono text-zinc-400 mt-1">{qrValue}</p>
              <p className="text-xs text-zinc-500 mt-2">סרוק לגישה מהירה מהנייד</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function LifecycleTab({ equipmentId }: { equipmentId: number }) {
  const queryClient = useQueryClient();
  const [showThresholdEditor, setShowThresholdEditor] = useState(false);
  const [editThresholds, setEditThresholds] = useState<{ replace_threshold_pct: number; evaluate_threshold_pct: number } | null>(null);

  const { data: settings } = useQuery({
    queryKey: ["cmms-settings"],
    queryFn: async () => {
      const r = await authFetch("/api/cmms/settings");
      return r.json();
    },
  });

  const settingsMutation = useMutation({
    mutationFn: async (data: Record<string, number>) => {
      const r = await authFetch("/api/cmms/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cmms-settings"] });
      queryClient.invalidateQueries({ queryKey: ["cmms-tco", equipmentId] });
      setShowThresholdEditor(false);
    },
  });

  const { data: tco, isLoading } = useQuery({
    queryKey: ["cmms-tco", equipmentId],
    queryFn: async () => {
      const r = await authFetch(`/api/cmms/equipment/${equipmentId}/tco`);
      return r.json();
    },
    enabled: !!equipmentId,
  });

  if (isLoading) return <div className="text-center py-12 text-zinc-400">טוען נתוני מחזור חיים...</div>;
  if (!tco) return <div className="text-center py-8 text-zinc-500">אין נתונים</div>;

  const maintenanceRatio = Number(tco.maintenanceCostRatio || 0);
  const remainingLife = Number(tco.remainingLifeYears || 0);
  const ageYears = Number(tco.ageYears || 0);
  const expectedLife = Number(tco.expectedLifeYears || 10);
  const lifeUsedPct = expectedLife > 0 ? Math.min(100, (ageYears / expectedLife) * 100) : 0;
  const rec = String(tco.recommendation || "ok");
  const recColors = { ok: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400", evaluate: "border-amber-500/40 bg-amber-500/10 text-amber-400", replace: "border-red-500/40 bg-red-500/10 text-red-400" };
  const recIcons = { ok: <CheckSquare className="w-5 h-5 text-emerald-400" />, evaluate: <AlertTriangle className="w-5 h-5 text-amber-400" />, replace: <XSquare className="w-5 h-5 text-red-400" /> };
  const trend = (Array.isArray(tco.monthlyCostTrend) ? tco.monthlyCostTrend : []) as Record<string, unknown>[];

  return (
    <div className="space-y-6">
      <div className={`rounded-xl border p-4 flex items-center gap-4 ${recColors[rec as keyof typeof recColors] || recColors.ok}`}>
        {recIcons[rec as keyof typeof recIcons] || recIcons.ok}
        <div>
          <p className="text-sm font-semibold">{String(tco.recommendationText || "")}</p>
          <p className="text-xs mt-0.5 opacity-80">יחס עלות תחזוקה להחלפה: {maintenanceRatio.toFixed(1)}% | חיים שנותרו: {remainingLife.toFixed(1)} שנים</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl border border-zinc-700/60 bg-zinc-900/80 p-4">
          <p className="text-xs text-zinc-500 mb-1">עלות TCO כוללת</p>
          <p className="text-xl font-bold text-zinc-100">{formatCurrency(Number(tco.tco || 0))}</p>
        </div>
        <div className="rounded-xl border border-zinc-700/60 bg-zinc-900/80 p-4">
          <p className="text-xs text-zinc-500 mb-1">עלות רכישה</p>
          <p className="text-xl font-bold text-blue-400">{formatCurrency(Number(tco.purchaseCost || 0))}</p>
        </div>
        <div className="rounded-xl border border-zinc-700/60 bg-zinc-900/80 p-4">
          <p className="text-xs text-zinc-500 mb-1">עלות תחזוקה מצטברת</p>
          <p className="text-xl font-bold text-amber-400">{formatCurrency(Number(tco.totalMaintenanceCost || 0))}</p>
          <p className="text-xs text-zinc-500 mt-0.5">{Number(tco.totalWorkOrders || 0)} קריאות</p>
        </div>
        <div className="rounded-xl border border-zinc-700/60 bg-zinc-900/80 p-4">
          <p className="text-xs text-zinc-500 mb-1">עלות השבתה מצטברת</p>
          <p className="text-xl font-bold text-red-400">{formatCurrency(Number(tco.totalDowntimeCost || 0))}</p>
          <p className="text-xs text-zinc-500 mt-0.5">{formatNum(Number(tco.totalDowntimeHours || 0), 0)} שעות</p>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-700/60 bg-zinc-900/80 p-5">
        <h4 className="text-sm font-semibold text-zinc-100 mb-3 flex items-center gap-2">
          <Clock className="w-4 h-4 text-blue-400" /> חיי הנכס
        </h4>
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-zinc-400">
            <span>גיל נוכחי: {ageYears.toFixed(1)} שנים</span>
            <span>תוחלת חיים: {expectedLife} שנים</span>
          </div>
          <div className="h-3 bg-zinc-800 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all ${lifeUsedPct > 80 ? "bg-red-500" : lifeUsedPct > 60 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${lifeUsedPct}%` }} />
          </div>
          <div className="flex justify-between text-xs text-zinc-500">
            <span>{lifeUsedPct.toFixed(0)}% מחיי הנכס נוצלו</span>
            <span>נותרו {remainingLife.toFixed(1)} שנים</span>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="rounded-xl border border-zinc-700/60 bg-zinc-900/80 p-5">
          <h4 className="text-sm font-semibold text-zinc-100 mb-3 flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-green-400" /> פירוט עלויות TCO
          </h4>
          <div className="space-y-2">
            {[
              { label: "רכישה", value: Number(tco.purchaseCost || 0), color: "bg-blue-500" },
              { label: "חלקים", value: Number(tco.totalPartsCost || 0), color: "bg-amber-500" },
              { label: "עבודה", value: Number(tco.totalLaborCost || 0), color: "bg-orange-500" },
              { label: "השבתה", value: Number(tco.totalDowntimeCost || 0), color: "bg-red-500" },
              ...(Number(tco.childMaintenanceCost || 0) > 0 ? [{ label: "תתי-מערכות", value: Number(tco.childMaintenanceCost || 0), color: "bg-purple-500" }] : []),
            ].map((item) => {
              const total = Number(tco.tco || 1);
              const pct = total > 0 ? (item.value / total) * 100 : 0;
              return (
                <div key={item.label} className="space-y-0.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-zinc-400">{item.label}</span>
                    <span className="text-zinc-300 font-medium">{formatCurrency(item.value)} ({pct.toFixed(0)}%)</span>
                  </div>
                  <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${item.color}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border border-zinc-700/60 bg-zinc-900/80 p-5">
          <h4 className="text-sm font-semibold text-zinc-100 mb-1 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-blue-400" /> מגמת עלויות תחזוקה חודשית
          </h4>
          {trend.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="month" tick={{ fill: "#9ca3af", fontSize: 10 }} />
                <YAxis tick={{ fill: "#9ca3af", fontSize: 10 }} />
                <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #3f3f46", borderRadius: "8px", direction: "rtl" }} />
                <Area type="monotone" dataKey="maintenance_cost" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.15} name="תחזוקה (₪)" />
                <Area type="monotone" dataKey="downtime_cost" stroke="#ef4444" fill="#ef4444" fillOpacity={0.1} name="השבתה (₪)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-zinc-500 text-sm text-center py-8">אין היסטוריית עלויות</p>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-zinc-700/60 bg-zinc-900/80 p-5">
        <h4 className="text-sm font-semibold text-zinc-100 mb-3 flex items-center gap-2">
          <TrendingDown className="w-4 h-4 text-purple-400" /> ניתוח תיקון מול החלפה
        </h4>
        <div className="grid md:grid-cols-3 gap-4 text-xs">
          <div className="p-3 rounded-lg bg-zinc-800/60">
            <p className="text-zinc-500 mb-1">עלות החלפה משוערת</p>
            <p className="text-lg font-bold text-zinc-100">{formatCurrency(Number(tco.replacementCost || 0))}</p>
          </div>
          <div className="p-3 rounded-lg bg-zinc-800/60">
            <p className="text-zinc-500 mb-1">יחס עלות תחזוקה/החלפה</p>
            <p className={`text-lg font-bold ${maintenanceRatio >= 75 ? "text-red-400" : maintenanceRatio >= 50 ? "text-amber-400" : "text-emerald-400"}`}>{maintenanceRatio.toFixed(1)}%</p>
            <div className="mt-1 h-1.5 bg-zinc-700 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${maintenanceRatio >= 75 ? "bg-red-500" : maintenanceRatio >= 50 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${Math.min(100, maintenanceRatio)}%` }} />
            </div>
          </div>
          <div className="p-3 rounded-lg bg-zinc-800/60">
            <p className="text-zinc-500 mb-1">ערך שאריות</p>
            <p className="text-lg font-bold text-zinc-100">{formatCurrency(Number(tco.salvageValue || 0))}</p>
          </div>
        </div>
        <div className="mt-3 text-xs text-zinc-500">
          <p>* סף בחינה: {settings?.evaluate_threshold_pct ?? 50}% | סף החלפה חזקה: {settings?.replace_threshold_pct ?? 75}%</p>
        </div>
        <div className="mt-2 flex justify-end">
          <button
            onClick={() => {
              setEditThresholds({ replace_threshold_pct: settings?.replace_threshold_pct ?? 75, evaluate_threshold_pct: settings?.evaluate_threshold_pct ?? 50 });
              setShowThresholdEditor(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 rounded-lg text-xs"
          >
            <Settings className="w-3.5 h-3.5" /> ערוך ספי החלטה
          </button>
        </div>
      </div>

      {showThresholdEditor && editThresholds && (
        <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-5 space-y-4">
          <h4 className="text-sm font-semibold text-blue-300 flex items-center gap-2">
            <Settings className="w-4 h-4" /> הגדרות ספי החלטה — תיקון מול החלפה
          </h4>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-zinc-400 mb-1">סף בחינת החלפה (%)</label>
              <p className="text-xs text-zinc-500 mb-2">כאשר יחס עלות תחזוקה/החלפה חוצה סף זה — המערכת ממליצה לבחון החלפה</p>
              <input
                type="number"
                min={10} max={100}
                value={editThresholds.evaluate_threshold_pct}
                onChange={e => setEditThresholds(t => t ? { ...t, evaluate_threshold_pct: Number(e.target.value) } : t)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">סף החלפה חזקה (%)</label>
              <p className="text-xs text-zinc-500 mb-2">כאשר יחס עלות תחזוקה/החלפה חוצה סף זה — המערכת ממליצה בחוזקה להחליף</p>
              <input
                type="number"
                min={10} max={100}
                value={editThresholds.replace_threshold_pct}
                onChange={e => setEditThresholds(t => t ? { ...t, replace_threshold_pct: Number(e.target.value) } : t)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => settingsMutation.mutate({ replace_threshold_pct: editThresholds.replace_threshold_pct, evaluate_threshold_pct: editThresholds.evaluate_threshold_pct })}
              disabled={settingsMutation.isPending}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-foreground rounded-lg text-sm disabled:opacity-50"
            >
              {settingsMutation.isPending ? "שומר..." : "שמור הגדרות"}
            </button>
            <button onClick={() => setShowThresholdEditor(false)} className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 rounded-lg text-sm">ביטול</button>
          </div>
        </div>
      )}
    </div>
  );
}

function HierarchyNode({ node, level = 0 }: { node: Record<string, unknown>; level?: number }) {
  const [expanded, setExpanded] = useState(true);
  const children = (Array.isArray(node._children) ? node._children : []) as Record<string, unknown>[];
  const hasChildren = children.length > 0 || Number(node.child_count || 0) > 0;

  return (
    <div>
      <div
        className={`flex items-center justify-between p-2.5 rounded-lg border border-zinc-700/40 bg-zinc-800/40 hover:bg-zinc-800/60 cursor-pointer ${level > 0 ? "mr-4" : ""}`}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2 min-w-0">
          {hasChildren && (
            <ChevronDown className={`w-3.5 h-3.5 text-zinc-500 shrink-0 transition-transform ${expanded ? "" : "-rotate-90"}`} />
          )}
          {!hasChildren && <div className="w-3.5" />}
          <Layers className={`w-4 h-4 shrink-0 ${level === 0 ? "text-blue-400" : "text-zinc-500"}`} />
          <div className="min-w-0">
            <p className="text-sm font-medium text-zinc-200 truncate">{String(node.name || "")}</p>
            <p className="text-xs text-zinc-500">{String(node.equipment_number || "")} · {String(node.category || "")} · {String(node.location || "")}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {Number(node.purchase_cost || 0) > 0 && <span className="text-xs text-zinc-400">{formatCurrency(Number(node.purchase_cost))}</span>}
          <StatusBadge status={String(node.status || "active")} />
          <PriorityBadge priority={String(node.criticality || "medium")} />
        </div>
      </div>
      {expanded && children.length > 0 && (
        <div className="mt-1 space-y-1">
          {children.map(child => (
            <HierarchyNode key={String(child.id)} node={child} level={level + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

function ChildrenTab({ equipmentId, rootEquipment }: { equipmentId: number; rootEquipment: Record<string, unknown> }) {
  const { data: children = [], isLoading } = useQuery({
    queryKey: ["cmms-children", equipmentId],
    queryFn: async () => {
      const r = await authFetch(`/api/cmms/equipment/${equipmentId}/children`);
      const j = await r.json();
      return Array.isArray(j) ? j : [];
    },
    enabled: !!equipmentId,
  });

  if (isLoading) return <div className="text-center py-8 text-zinc-400">טוען...</div>;

  const childList = children as Record<string, unknown>[];
  const rootNode = { ...rootEquipment, _children: childList };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs text-zinc-500 p-2 rounded bg-zinc-800/30">
        <TreePine className="w-3.5 h-3.5 text-emerald-400" />
        <span>עץ היררכיה — נכס אב ורכיביו</span>
        <span className="mr-auto text-zinc-400">{childList.length} רכיבי בת ישירים</span>
      </div>

      {childList.length === 0 ? (
        <div className="text-center py-8 text-zinc-500 flex flex-col items-center gap-2">
          <TreePine className="w-8 h-8 opacity-30" />
          <p>אין רכיבי בת מקושרים לנכס זה</p>
          <p className="text-xs">ניתן לקשר רכיבי בת בעת יצירה/עריכה של נכס וקביעת "נכס אב"</p>
        </div>
      ) : (
        <div className="space-y-1">
          <HierarchyNode node={rootNode} />
        </div>
      )}

      {childList.length > 0 && (
        <div className="mt-3 p-3 rounded-lg bg-zinc-800/40 border border-zinc-700/30">
          <p className="text-xs text-zinc-500 mb-2 font-medium">סיכום שווי היררכיה</p>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div>
              <p className="text-zinc-500">עלות נכס אב</p>
              <p className="text-zinc-200 font-medium">{formatCurrency(Number(rootEquipment.purchase_cost || 0))}</p>
            </div>
            <div>
              <p className="text-zinc-500">עלות רכיבי בת</p>
              <p className="text-zinc-200 font-medium">{formatCurrency(childList.reduce((s, c) => s + Number(c.purchase_cost || 0), 0))}</p>
            </div>
            <div>
              <p className="text-zinc-500">שווי כולל</p>
              <p className="text-blue-400 font-bold">{formatCurrency(Number(rootEquipment.purchase_cost || 0) + childList.reduce((s, c) => s + Number(c.purchase_cost || 0), 0))}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AssetDetailDrawer({ eq, onClose }: { eq: Record<string, unknown>; onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<"specs" | "warranty" | "lifecycle" | "children" | "documents" | "history">("specs");

  const isVehicle = String(eq.category || "").toLowerCase() === "רכב";
  const tabs = [
    { id: "specs" as const, label: "מפרט", icon: <Info className="w-3.5 h-3.5" /> },
    { id: "warranty" as const, label: "אחריות", icon: <Shield className="w-3.5 h-3.5" /> },
    { id: "lifecycle" as const, label: "מחזור חיים & TCO", icon: <TrendingUp className="w-3.5 h-3.5" /> },
    { id: "children" as const, label: "רכיבי בת", icon: <TreePine className="w-3.5 h-3.5" /> },
    { id: "documents" as const, label: "מסמכים", icon: <FileText className="w-3.5 h-3.5" /> },
    { id: "history" as const, label: "היסטוריה", icon: <Clock className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="fixed inset-0 bg-black/60 flex items-start justify-end z-40" onClick={onClose}>
      <div className="h-full w-full max-w-2xl bg-zinc-900 border-r border-zinc-700/60 overflow-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-zinc-900 border-b border-zinc-700/60 p-4 flex items-start justify-between z-10">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded">{String(eq.equipment_number || "")}</span>
              {eq.asset_tag && <span className="font-mono text-xs text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded">{String(eq.asset_tag)}</span>}
              <StatusBadge status={String(eq.status || "active")} />
              <PriorityBadge priority={String(eq.criticality || "medium")} />
            </div>
            <h2 className="text-base font-bold text-zinc-100 mt-1">{String(eq.name || "")}</h2>
            <p className="text-xs text-zinc-400 mt-0.5">{String(eq.category || "")} · {String(eq.manufacturer || "")} {String(eq.model || "")}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <QrCodeDisplay equipmentId={Number(eq.id)} equipmentNumber={String(eq.equipment_number || "")} name={String(eq.name || "")} />
            <button onClick={onClose} className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400"><X className="w-5 h-5" /></button>
          </div>
        </div>

        <div className="flex border-b border-zinc-700/60 px-4 overflow-x-auto">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)} className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 whitespace-nowrap transition-colors ${activeTab === t.id ? "border-blue-500 text-blue-400" : "border-transparent text-zinc-400 hover:text-zinc-200"}`}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        <div className="p-5 space-y-4">
          {activeTab === "specs" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <SpecField label="מיקום" value={String(eq.location || "—")} icon={<MapPin className="w-3 h-3" />} />
                <SpecField label="מחלקה" value={String(eq.department || "—")} icon={<Building2 className="w-3 h-3" />} />
                <SpecField label="קו ייצור" value={String(eq.production_line || "—")} />
                <SpecField label="אחראי" value={String(eq.responsible_person || "—")} icon={<Users className="w-3 h-3" />} />
                <SpecField label="מספר סידורי" value={String(eq.serial_number || "—")} />
                <SpecField label="שנת ייצור" value={eq.year_of_manufacture ? String(eq.year_of_manufacture) : "—"} />
                <SpecField label="ארץ מקור" value={String(eq.country_of_origin || "—")} />
                <SpecField label="שיטת רכישה" value={acqMethodLabel(String(eq.acquisition_method || "purchase"))} />
              </div>

              {(eq.power_rating_kw || eq.voltage_v || eq.operating_pressure_bar || eq.operating_temp_c || eq.capacity) && (
                <div>
                  <p className="text-xs font-semibold text-zinc-400 mb-2 flex items-center gap-1"><Bolt className="w-3.5 h-3.5 text-yellow-400" /> פרמטרים טכניים</p>
                  <div className="grid grid-cols-2 gap-2">
                    {eq.power_rating_kw && <SpecField label="הספק חשמלי" value={`${eq.power_rating_kw} kW`} />}
                    {eq.voltage_v && <SpecField label="מתח חשמלי" value={`${eq.voltage_v}V`} />}
                    {eq.operating_pressure_bar && <SpecField label="לחץ עבודה" value={`${eq.operating_pressure_bar} בר`} />}
                    {eq.operating_temp_c && <SpecField label="טמפ. עבודה" value={`${eq.operating_temp_c}°C`} />}
                    {eq.capacity && <SpecField label="קיבולת / יכולת" value={String(eq.capacity)} />}
                  </div>
                </div>
              )}

              {(eq.weight_kg || eq.dimensions_length_mm) && (
                <div>
                  <p className="text-xs font-semibold text-zinc-400 mb-2 flex items-center gap-1"><Weight className="w-3.5 h-3.5 text-blue-400" /> מידות ומשקל</p>
                  <div className="grid grid-cols-2 gap-2">
                    {eq.weight_kg && <SpecField label="משקל" value={`${eq.weight_kg} ק\"ג`} />}
                    {(eq.dimensions_length_mm || eq.dimensions_width_mm || eq.dimensions_height_mm) && (
                      <SpecField label="מידות (א×ר×ג)" value={`${eq.dimensions_length_mm || '—'}×${eq.dimensions_width_mm || '—'}×${eq.dimensions_height_mm || '—'} מ"מ`} />
                    )}
                  </div>
                </div>
              )}

              {isVehicle && (
                <div>
                  <p className="text-xs font-semibold text-zinc-400 mb-2 flex items-center gap-1"><Car className="w-3.5 h-3.5 text-blue-400" /> פרטי רכב</p>
                  <div className="grid grid-cols-2 gap-2">
                    {eq.license_plate && <SpecField label="לוחית רישוי" value={String(eq.license_plate)} />}
                    {eq.fuel_type && <SpecField label="סוג דלק" value={String(eq.fuel_type)} />}
                    {eq.mileage_km && <SpecField label="קילומטראז'" value={`${Number(eq.mileage_km).toLocaleString('he-IL')} ק\"מ`} />}
                    {eq.registration_expiry && <SpecField label="תוקף רישיון" value={formatDate(String(eq.registration_expiry))} />}
                    {eq.insurance_expiry && <SpecField label="תוקף ביטוח" value={formatDate(String(eq.insurance_expiry))} />}
                    {eq.insurance_policy && <SpecField label="פוליסת ביטוח" value={String(eq.insurance_policy)} />}
                  </div>
                </div>
              )}

              <div>
                <p className="text-xs font-semibold text-zinc-400 mb-2">שעות שימוש ועלויות</p>
                <div className="grid grid-cols-2 gap-2">
                  <SpecField label="שעות שימוש" value={`${formatNum(Number(eq.hours_used || 0), 0)} שעות`} />
                  <SpecField label="עלות רכישה" value={formatCurrency(Number(eq.purchase_cost || 0))} />
                  <SpecField label="תאריך רכישה" value={formatDate(String(eq.purchase_date || ""))} />
                  <SpecField label="עלות השבתה/שעה" value={eq.downtime_cost_per_hour ? formatCurrency(Number(eq.downtime_cost_per_hour)) : "—"} />
                </div>
              </div>

              {eq.notes && (
                <div className="p-3 rounded-lg bg-zinc-800/60 border border-zinc-700/40">
                  <p className="text-xs text-zinc-500 mb-1">הערות</p>
                  <p className="text-sm text-zinc-300">{String(eq.notes)}</p>
                </div>
              )}
            </div>
          )}

          {activeTab === "warranty" && (
            <div className="space-y-4">
              <div className={`rounded-xl border p-4 ${warrantyStatusColor(String(eq.warranty_status || "unknown"))}`}>
                <div className="flex items-center gap-2">
                  <Shield className="w-5 h-5" />
                  <span className="font-semibold">{warrantyStatusLabel(String(eq.warranty_status || "unknown"))}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <SpecField label="תוקף אחריות" value={formatDate(String(eq.warranty_expiry || ""))} />
                <SpecField label="ספק אחריות" value={String(eq.warranty_provider || "—")} />
              </div>
              {eq.warranty_terms && (
                <div className="p-3 rounded-lg bg-zinc-800/60 border border-zinc-700/40">
                  <p className="text-xs text-zinc-500 mb-1">תנאי אחריות</p>
                  <p className="text-sm text-zinc-300">{String(eq.warranty_terms)}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <SpecField label="עלות החלפה" value={formatCurrency(Number(eq.replacement_cost || 0))} />
                <SpecField label="ערך שאריות" value={formatCurrency(Number(eq.salvage_value || 0))} />
                <SpecField label="תוחלת חיים" value={eq.expected_useful_life_years ? `${eq.expected_useful_life_years} שנים` : "—"} />
              </div>
            </div>
          )}

          {activeTab === "lifecycle" && (
            <LifecycleTab equipmentId={Number(eq.id)} />
          )}

          {activeTab === "children" && (
            <ChildrenTab equipmentId={Number(eq.id)} rootEquipment={eq} />
          )}

          {activeTab === "documents" && (
            <AssetDocumentsPanel equipmentId={Number(eq.id)} equipmentNumber={String(eq.equipment_number || "")} />
          )}

          {activeTab === "history" && (
            <EquipmentHistoryPanel equipmentId={Number(eq.id)} />
          )}
        </div>
      </div>
    </div>
  );
}

function AssetDocumentsPanel({ equipmentId, equipmentNumber }: { equipmentId: number; equipmentNumber: string }) {
  const docTypes = [
    { key: "manual", label: "מדריך הפעלה", icon: <FileText className="w-4 h-4 text-blue-400" /> },
    { key: "warranty", label: "תעודת אחריות", icon: <Shield className="w-4 h-4 text-emerald-400" /> },
    { key: "certificate", label: "תעודת כיול/בטיחות", icon: <CheckSquare className="w-4 h-4 text-amber-400" /> },
    { key: "purchase", label: "חשבונית רכישה", icon: <DollarSign className="w-4 h-4 text-purple-400" /> },
    { key: "drawing", label: "תרשים טכני", icon: <Layers className="w-4 h-4 text-cyan-400" /> },
    { key: "report", label: "דוח בדיקה", icon: <BarChart3 className="w-4 h-4 text-orange-400" /> },
  ];

  const [attachedDocs, setAttachedDocs] = useState<{ type: string; label: string; name: string; note: string }[]>([]);
  const [addingType, setAddingType] = useState<string | null>(null);
  const [docName, setDocName] = useState("");
  const [docNote, setDocNote] = useState("");

  const addDoc = (type: string, label: string) => {
    if (!docName.trim()) return;
    setAttachedDocs(prev => [...prev, { type, label, name: docName.trim(), note: docNote.trim() }]);
    setDocName("");
    setDocNote("");
    setAddingType(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-xs text-zinc-500 p-2 rounded bg-zinc-800/30">
        <FileText className="w-3.5 h-3.5 text-blue-400" />
        <span>מסמכים ואישורים מצורפים לנכס {equipmentNumber}</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        {docTypes.map(dt => (
          <button
            key={dt.key}
            onClick={() => setAddingType(addingType === dt.key ? null : dt.key)}
            className={`flex items-center gap-2 p-3 rounded-lg border text-right text-xs transition-colors ${addingType === dt.key ? "border-blue-500/50 bg-blue-500/10 text-blue-300" : "border-zinc-700/40 bg-zinc-800/40 text-zinc-300 hover:bg-zinc-800/70"}`}
          >
            {dt.icon}
            <span>{dt.label}</span>
            <Plus className="w-3 h-3 mr-auto text-zinc-500" />
          </button>
        ))}
      </div>

      {addingType && (
        <div className="p-3 rounded-lg border border-blue-500/30 bg-blue-500/5 space-y-2">
          <p className="text-xs font-medium text-blue-300">{docTypes.find(d => d.key === addingType)?.label} — הוסף מסמך</p>
          <input
            value={docName}
            onChange={e => setDocName(e.target.value)}
            placeholder="שם המסמך / מספר קובץ..."
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-500"
          />
          <input
            value={docNote}
            onChange={e => setDocNote(e.target.value)}
            placeholder="הערה (אופציונלי)..."
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-500"
          />
          <div className="flex gap-2">
            <button
              onClick={() => addDoc(addingType, docTypes.find(d => d.key === addingType)?.label || "")}
              disabled={!docName.trim()}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-foreground rounded-lg text-xs disabled:opacity-50"
            >
              הוסף
            </button>
            <button onClick={() => setAddingType(null)} className="px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 rounded-lg text-xs">ביטול</button>
          </div>
        </div>
      )}

      {attachedDocs.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-zinc-400">מסמכים מצורפים ({attachedDocs.length})</p>
          {attachedDocs.map((doc, i) => (
            <div key={i} className="flex items-center justify-between p-2.5 rounded-lg border border-zinc-700/40 bg-zinc-800/40">
              <div className="flex items-center gap-2">
                {docTypes.find(d => d.key === doc.type)?.icon}
                <div>
                  <p className="text-sm text-zinc-200">{doc.name}</p>
                  <p className="text-xs text-zinc-500">{doc.label}{doc.note ? ` · ${doc.note}` : ""}</p>
                </div>
              </div>
              <button onClick={() => setAttachedDocs(prev => prev.filter((_, idx) => idx !== i))} className="p-1 text-zinc-500 hover:text-red-400">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {attachedDocs.length === 0 && !addingType && (
        <div className="text-center py-8 text-zinc-500 flex flex-col items-center gap-2">
          <FileText className="w-8 h-8 opacity-30" />
          <p className="text-sm">לא צורפו מסמכים לנכס זה</p>
          <p className="text-xs">לחץ על סוג המסמך למעלה כדי להוסיף</p>
        </div>
      )}
    </div>
  );
}

function EquipmentHistoryPanel({ equipmentId }: { equipmentId: number }) {
  const { data: history, isLoading } = useQuery({
    queryKey: ["cmms-equipment-history", equipmentId],
    queryFn: async () => {
      if (!equipmentId) return null;
      const r = await authFetch(`/api/cmms/equipment/${equipmentId}/history`);
      return r.json();
    },
    enabled: !!equipmentId,
  });

  if (isLoading) return <div className="text-center py-8 text-zinc-400">טוען...</div>;

  const workOrders = Array.isArray(history?.workOrders) ? history.workOrders as Record<string, unknown>[] : [];
  const pmSchedules = Array.isArray(history?.pmSchedules) ? history.pmSchedules as Record<string, unknown>[] : [];

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold text-zinc-400 mb-2">קריאות שירות ({workOrders.length})</p>
        {workOrders.length === 0 ? <p className="text-zinc-500 text-xs">אין היסטוריה</p> : (
          <div className="space-y-1 max-h-60 overflow-y-auto">
            {workOrders.map(wo => (
              <div key={String(wo.id)} className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-800/50 border border-zinc-700/30 text-xs">
                <div className="min-w-0">
                  <p className="text-zinc-200 truncate">{String(wo.title || "")}</p>
                  <p className="text-zinc-500">{formatDate(String(wo.created_at || ""))} · {formatCurrency(Number(wo.total_cost || 0))}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <StatusBadge status={String(wo.status || "open")} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div>
        <p className="text-xs font-semibold text-zinc-400 mb-2">לוחות תחזוקה מונעת ({pmSchedules.length})</p>
        {pmSchedules.length === 0 ? <p className="text-zinc-500 text-xs">אין לוחות PM</p> : (
          <div className="space-y-1">
            {pmSchedules.map(pm => (
              <div key={String(pm.id)} className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-800/50 border border-zinc-700/30 text-xs">
                <p className="text-zinc-200 truncate">{String(pm.title || "")}</p>
                <p className="text-zinc-400">{formatDate(String(pm.next_due || ""))}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SpecField({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="p-2.5 rounded-lg bg-zinc-800/50 border border-zinc-700/30">
      <p className="text-xs text-zinc-500 flex items-center gap-1">{icon}{label}</p>
      <p className="text-sm font-medium text-zinc-200 mt-0.5 truncate">{value}</p>
    </div>
  );
}

function warrantyStatusColor(status: string): string {
  if (status === "active") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-400";
  if (status === "expired") return "border-red-500/40 bg-red-500/10 text-red-400";
  return "border-zinc-600/40 bg-zinc-700/20 text-zinc-400";
}

function warrantyStatusLabel(status: string): string {
  if (status === "active") return "אחריות פעילה";
  if (status === "expired") return "אחריות פגה";
  if (status === "none") return "ללא אחריות";
  return "מצב אחריות לא ידוע";
}

function acqMethodLabel(method: string): string {
  const map: Record<string, string> = { purchase: "רכישה", lease: "ליסינג", rent: "שכירות", donation: "תרומה", transfer: "העברה פנימית" };
  return map[method] || method;
}

function AssetRegistryTab() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterDept, setFilterDept] = useState("all");
  const [filterLocation, setFilterLocation] = useState("all");
  const [filterCriticality, setFilterCriticality] = useState("all");
  const [selectedAsset, setSelectedAsset] = useState<Record<string, unknown> | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<Record<string, unknown> | null>(null);

  const { data: equipment = [] } = useQuery({
    queryKey: ["cmms-equipment"],
    queryFn: async () => {
      const r = await authFetch("/api/cmms/equipment");
      const j = await r.json();
      return Array.isArray(j) ? j : j.data || [];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const id = data.id;
      const url = id ? `/api/cmms/equipment/${id}` : "/api/cmms/equipment";
      const r = await authFetch(url, { method: id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cmms-equipment"] });
      queryClient.invalidateQueries({ queryKey: ["cmms-dashboard"] });
      setShowForm(false);
      setEditItem(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await authFetch(`/api/cmms/equipment/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cmms-equipment"] });
    },
  });

  const eqList = equipment as Record<string, unknown>[];

  const categories = [...new Set(eqList.map(e => String(e.category || "")).filter(Boolean))].sort();
  const departments = [...new Set(eqList.map(e => String(e.department || "")).filter(Boolean))].sort();
  const locations = [...new Set(eqList.map(e => String(e.location || "")).filter(Boolean))].sort();

  const filtered = eqList.filter(eq => {
    if (filterStatus !== "all" && eq.status !== filterStatus) return false;
    if (filterCategory !== "all" && eq.category !== filterCategory) return false;
    if (filterDept !== "all" && eq.department !== filterDept) return false;
    if (filterLocation !== "all" && eq.location !== filterLocation) return false;
    if (filterCriticality !== "all" && eq.criticality !== filterCriticality) return false;
    if (search) {
      const s = search.toLowerCase();
      return String(eq.name || "").toLowerCase().includes(s) ||
        String(eq.equipment_number || "").toLowerCase().includes(s) ||
        String(eq.manufacturer || "").toLowerCase().includes(s) ||
        String(eq.serial_number || "").toLowerCase().includes(s) ||
        String(eq.location || "").toLowerCase().includes(s);
    }
    return true;
  });

  const totalValue = eqList.reduce((s, e) => s + Number(e.purchase_cost || 0), 0);
  const activeCount = eqList.filter(e => e.status === "active").length;
  const criticalCount = eqList.filter(e => e.criticality === "critical").length;
  const warrantyExpired = eqList.filter(e => e.warranty_expiry && new Date(String(e.warranty_expiry)) < new Date()).length;
  const vehicleCount = eqList.filter(e => String(e.category || "").toLowerCase() === "רכב").length;

  return (
    <div className="space-y-4">
      {showForm && <AssetRegistryForm item={editItem} equipment={eqList} onSave={(d) => saveMutation.mutate(d)} onCancel={() => { setShowForm(false); setEditItem(null); }} saving={saveMutation.isPending} />}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="rounded-xl border border-zinc-700/60 bg-zinc-900/80 p-4">
          <p className="text-xs text-zinc-500">סה"כ נכסים</p>
          <p className="text-2xl font-bold text-zinc-100">{eqList.length}</p>
          <p className="text-xs text-zinc-500">{activeCount} פעילים</p>
        </div>
        <div className="rounded-xl border border-zinc-700/60 bg-zinc-900/80 p-4">
          <p className="text-xs text-zinc-500">שווי נכסים</p>
          <p className="text-xl font-bold text-blue-400">{formatCurrency(totalValue)}</p>
        </div>
        <div className="rounded-xl border border-zinc-700/60 bg-zinc-900/80 p-4">
          <p className="text-xs text-zinc-500">ציוד קריטי</p>
          <p className="text-2xl font-bold text-red-400">{criticalCount}</p>
        </div>
        <div className="rounded-xl border border-zinc-700/60 bg-zinc-900/80 p-4">
          <p className="text-xs text-zinc-500">אחריות פגה</p>
          <p className="text-2xl font-bold text-amber-400">{warrantyExpired}</p>
        </div>
        <div className="rounded-xl border border-zinc-700/60 bg-zinc-900/80 p-4">
          <p className="text-xs text-zinc-500">רכבים ומלגזות</p>
          <p className="text-2xl font-bold text-emerald-400">{vehicleCount}</p>
        </div>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש לפי שם, מספר, יצרן, מיקום..." className="bg-zinc-800 border border-zinc-700 rounded-lg pr-10 pl-4 py-2 text-sm text-zinc-200 placeholder:text-zinc-500 w-72" />
          </div>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200">
            <option value="all">כל הסטטוסים</option>
            <option value="active">פעיל</option>
            <option value="maintenance">בתחזוקה</option>
            <option value="down">מושבת</option>
            <option value="retired">פורק</option>
          </select>
          <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200">
            <option value="all">כל הקטגוריות</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={filterDept} onChange={e => setFilterDept(e.target.value)} className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200">
            <option value="all">כל המחלקות</option>
            {departments.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <select value={filterLocation} onChange={e => setFilterLocation(e.target.value)} className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200">
            <option value="all">כל המיקומים</option>
            {locations.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
          <select value={filterCriticality} onChange={e => setFilterCriticality(e.target.value)} className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200">
            <option value="all">כל הקריטיות</option>
            <option value="critical">קריטי</option>
            <option value="high">גבוה</option>
            <option value="medium">בינוני</option>
            <option value="low">נמוך</option>
          </select>
          <span className="text-xs text-zinc-500">{filtered.length} נכסים</span>
        </div>
        <button onClick={() => { setEditItem(null); setShowForm(true); }} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-zinc-100 rounded-lg text-sm font-medium flex items-center gap-2">
          <Plus className="w-4 h-4" /> נכס חדש
        </button>
      </div>

      <div className="rounded-xl border border-zinc-700/60 bg-zinc-900/80 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-700/60 bg-zinc-800/50">
                <th className="text-right px-4 py-3 text-xs text-zinc-400 font-medium">מספר</th>
                <th className="text-right px-4 py-3 text-xs text-zinc-400 font-medium">שם נכס</th>
                <th className="text-right px-4 py-3 text-xs text-zinc-400 font-medium">קטגוריה</th>
                <th className="text-right px-4 py-3 text-xs text-zinc-400 font-medium">יצרן / דגם</th>
                <th className="text-right px-4 py-3 text-xs text-zinc-400 font-medium">מיקום / מחלקה</th>
                <th className="text-right px-4 py-3 text-xs text-zinc-400 font-medium">עלות רכישה</th>
                <th className="text-right px-4 py-3 text-xs text-zinc-400 font-medium">אחריות</th>
                <th className="text-right px-4 py-3 text-xs text-zinc-400 font-medium">קריטיות</th>
                <th className="text-right px-4 py-3 text-xs text-zinc-400 font-medium">סטטוס</th>
                <th className="px-4 py-3 text-xs text-zinc-400 font-medium text-right">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(eq => {
                const warrantyExpiry = eq.warranty_expiry ? new Date(String(eq.warranty_expiry)) : null;
                const isWarrantyExpired = warrantyExpiry && warrantyExpiry < new Date();
                const isVehicleRow = String(eq.category || "").toLowerCase() === "רכב";
                const hasChildren = Number(eq.child_count || 0) > 0;
                return (
                  <tr key={String(eq.id)} className="border-b border-zinc-800/60 hover:bg-zinc-800/30 cursor-pointer" onClick={() => setSelectedAsset(eq)}>
                    <td className="px-4 py-3 font-mono text-xs text-zinc-400">
                      <div className="flex items-center gap-1">
                        {String(eq.equipment_number || "")}
                        {hasChildren && <TreePine className="w-3 h-3 text-emerald-400 shrink-0" title="יש רכיבי בת" />}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-zinc-200 font-medium max-w-[200px]">
                      <div>
                        <p className="truncate">{String(eq.name || "")}</p>
                        {eq.parent_name && <p className="text-xs text-zinc-500 truncate">↳ {String(eq.parent_name)}</p>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-zinc-400 text-xs">
                      <div className="flex items-center gap-1">
                        {isVehicleRow && <Car className="w-3.5 h-3.5 text-blue-400" />}
                        {String(eq.category || "—")}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-zinc-400 text-xs">
                      <p>{String(eq.manufacturer || "—")}</p>
                      <p className="text-zinc-600">{String(eq.model || "")}</p>
                    </td>
                    <td className="px-4 py-3 text-zinc-400 text-xs">
                      <p>{String(eq.location || "—")}</p>
                      <p className="text-zinc-600">{String(eq.department || "")}</p>
                    </td>
                    <td className="px-4 py-3 text-zinc-300 text-xs font-medium">{formatCurrency(Number(eq.purchase_cost || 0))}</td>
                    <td className="px-4 py-3 text-xs">
                      {warrantyExpiry ? (
                        <span className={`px-1.5 py-0.5 rounded text-xs ${isWarrantyExpired ? "bg-red-500/20 text-red-400" : "bg-emerald-500/20 text-emerald-400"}`}>
                          {isWarrantyExpired ? "פגה" : "פעילה"}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3"><PriorityBadge priority={String(eq.criticality || "medium")} /></td>
                    <td className="px-4 py-3"><StatusBadge status={String(eq.status || "active")} /></td>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        <button onClick={() => setSelectedAsset(eq)} className="p-1.5 rounded hover:bg-zinc-700/60 text-zinc-400 hover:text-zinc-200"><Eye className="w-3.5 h-3.5" /></button>
                        <button onClick={() => { setEditItem(eq); setShowForm(true); }} className="p-1.5 rounded hover:bg-zinc-700/60 text-zinc-400 hover:text-blue-400"><Edit className="w-3.5 h-3.5" /></button>
                        <button onClick={() => { if (confirm("למחוק נכס זה?")) deleteMutation.mutate(Number(eq.id)); }} className="p-1.5 rounded hover:bg-zinc-700/60 text-zinc-400 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={10} className="py-12 text-center text-zinc-500">אין נכסים מתאימים לסינון</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedAsset && <AssetDetailDrawer eq={selectedAsset} onClose={() => setSelectedAsset(null)} />}
    </div>
  );
}

function AssetRegistryForm({ item, equipment, onSave, onCancel, saving }: {
  item: Record<string, unknown> | null;
  equipment: Record<string, unknown>[];
  onSave: (data: Record<string, unknown>) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<Record<string, unknown>>({
    id: item?.id,
    name: item?.name || "",
    category: item?.category || "",
    manufacturer: item?.manufacturer || "",
    model: item?.model || "",
    serialNumber: item?.serial_number || "",
    location: item?.location || "",
    department: item?.department || "",
    productionLine: item?.production_line || "",
    status: item?.status || "active",
    purchaseDate: item?.purchase_date ? String(item.purchase_date).slice(0, 10) : "",
    purchaseCost: item?.purchase_cost || 0,
    criticality: item?.criticality || "medium",
    hoursUsed: item?.hours_used || 0,
    nextMaintenanceDate: item?.next_maintenance_date ? String(item.next_maintenance_date).slice(0, 10) : "",
    warrantyExpiry: item?.warranty_expiry ? String(item.warranty_expiry).slice(0, 10) : "",
    warrantyProvider: item?.warranty_provider || "",
    warrantyStatus: item?.warranty_status || "unknown",
    warrantyTerms: item?.warranty_terms || "",
    expectedUsefulLifeYears: item?.expected_useful_life_years || "",
    replacementCost: item?.replacement_cost || 0,
    salvageValue: item?.salvage_value || 0,
    acquisitionMethod: item?.acquisition_method || "purchase",
    downtimeCostPerHour: item?.downtime_cost_per_hour || 0,
    weightKg: item?.weight_kg || "",
    powerRatingKw: item?.power_rating_kw || "",
    voltageV: item?.voltage_v || "",
    operatingPressureBar: item?.operating_pressure_bar || "",
    operatingTempC: item?.operating_temp_c || "",
    capacity: item?.capacity || "",
    yearOfManufacture: item?.year_of_manufacture || "",
    countryOfOrigin: item?.country_of_origin || "",
    fuelType: item?.fuel_type || "",
    licensePlate: item?.license_plate || "",
    mileageKm: item?.mileage_km || 0,
    insuranceExpiry: item?.insurance_expiry ? String(item.insurance_expiry).slice(0, 10) : "",
    insurancePolicy: item?.insurance_policy || "",
    registrationExpiry: item?.registration_expiry ? String(item.registration_expiry).slice(0, 10) : "",
    parentEquipmentId: item?.parent_equipment_id || "",
    assetTag: item?.asset_tag || "",
    responsiblePerson: item?.responsible_person || "",
    notes: item?.notes || "",
  });

  const set = (k: string, v: unknown) => setForm(p => ({ ...p, [k]: v }));
  const isVehicle = String(form.category || "").toLowerCase() === "רכב";
  const [formTab, setFormTab] = useState<"basic" | "specs" | "warranty" | "vehicle">("basic");

  const formTabs = [
    { id: "basic" as const, label: "בסיסי" },
    { id: "specs" as const, label: "מפרט טכני" },
    { id: "warranty" as const, label: "אחריות & מחזור חיים" },
    ...(isVehicle ? [{ id: "vehicle" as const, label: "פרטי רכב" }] : []),
  ];

  return (
    <div className="rounded-xl border border-zinc-700/60 bg-zinc-900/80 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-zinc-100">{item ? "עריכת נכס" : "נכס חדש"}</h3>
        <button onClick={onCancel} className="p-1 text-zinc-400 hover:text-zinc-200"><X className="w-5 h-5" /></button>
      </div>

      <div className="flex gap-1 border-b border-zinc-700/50 pb-1">
        {formTabs.map(t => (
          <button key={t.id} onClick={() => setFormTab(t.id)} className={`px-3 py-1.5 text-xs font-medium rounded-t-lg ${formTab === t.id ? "bg-blue-600 text-zinc-100" : "text-zinc-400 hover:text-zinc-200"}`}>{t.label}</button>
        ))}
      </div>

      {formTab === "basic" && (
        <div className="grid md:grid-cols-3 gap-3">
          <div className="md:col-span-2"><label className="block text-xs text-zinc-400 mb-1">שם נכס *</label><input value={String(form.name || "")} onChange={e => set("name", e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" /></div>
          <div><label className="block text-xs text-zinc-400 mb-1">קטגוריה</label><input value={String(form.category || "")} onChange={e => set("category", e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" /></div>
          <div><label className="block text-xs text-zinc-400 mb-1">יצרן</label><input value={String(form.manufacturer || "")} onChange={e => set("manufacturer", e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" /></div>
          <div><label className="block text-xs text-zinc-400 mb-1">דגם</label><input value={String(form.model || "")} onChange={e => set("model", e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" /></div>
          <div><label className="block text-xs text-zinc-400 mb-1">מספר סידורי</label><input value={String(form.serialNumber || "")} onChange={e => set("serialNumber", e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" /></div>
          <div><label className="block text-xs text-zinc-400 mb-1">מיקום</label><input value={String(form.location || "")} onChange={e => set("location", e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" /></div>
          <div><label className="block text-xs text-zinc-400 mb-1">מחלקה</label><input value={String(form.department || "")} onChange={e => set("department", e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" /></div>
          <div><label className="block text-xs text-zinc-400 mb-1">אחראי</label><input value={String(form.responsiblePerson || "")} onChange={e => set("responsiblePerson", e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" /></div>
          <div><label className="block text-xs text-zinc-400 mb-1">תג נכס</label><input value={String(form.assetTag || "")} onChange={e => set("assetTag", e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" /></div>
          <div><label className="block text-xs text-zinc-400 mb-1">סטטוס</label>
            <select value={String(form.status)} onChange={e => set("status", e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200">
              <option value="active">פעיל</option><option value="maintenance">בתחזוקה</option><option value="down">מושבת</option><option value="retired">פורק</option>
            </select>
          </div>
          <div><label className="block text-xs text-zinc-400 mb-1">קריטיות</label>
            <select value={String(form.criticality)} onChange={e => set("criticality", e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200">
              <option value="low">נמוך</option><option value="medium">בינוני</option><option value="high">גבוה</option><option value="critical">קריטי</option>
            </select>
          </div>
          <div><label className="block text-xs text-zinc-400 mb-1">עלות רכישה (₪)</label><input type="number" value={Number(form.purchaseCost || 0)} onChange={e => set("purchaseCost", Number(e.target.value))} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" /></div>
          <div><label className="block text-xs text-zinc-400 mb-1">תאריך רכישה</label><input type="date" value={String(form.purchaseDate || "")} onChange={e => set("purchaseDate", e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" /></div>
          <div><label className="block text-xs text-zinc-400 mb-1">שעות שימוש</label><input type="number" value={Number(form.hoursUsed || 0)} onChange={e => set("hoursUsed", Number(e.target.value))} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" /></div>
          <div><label className="block text-xs text-zinc-400 mb-1">נכס אב</label>
            <select value={String(form.parentEquipmentId || "")} onChange={e => set("parentEquipmentId", e.target.value ? Number(e.target.value) : "")} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200">
              <option value="">— ללא —</option>
              {equipment.filter(e => String(e.id) !== String(item?.id)).map(e => <option key={String(e.id)} value={String(e.id)}>{String(e.name)}</option>)}
            </select>
          </div>
          <div className="md:col-span-3"><label className="block text-xs text-zinc-400 mb-1">הערות</label><textarea value={String(form.notes || "")} onChange={e => set("notes", e.target.value)} rows={2} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" /></div>
        </div>
      )}

      {formTab === "specs" && (
        <div className="grid md:grid-cols-3 gap-3">
          <div><label className="block text-xs text-zinc-400 mb-1">הספק (kW)</label><input type="number" step="0.1" value={String(form.powerRatingKw || "")} onChange={e => set("powerRatingKw", e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" /></div>
          <div><label className="block text-xs text-zinc-400 mb-1">מתח (V)</label><input type="number" value={String(form.voltageV || "")} onChange={e => set("voltageV", e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" /></div>
          <div><label className="block text-xs text-zinc-400 mb-1">לחץ עבודה (בר)</label><input type="number" step="0.1" value={String(form.operatingPressureBar || "")} onChange={e => set("operatingPressureBar", e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" /></div>
          <div><label className="block text-xs text-zinc-400 mb-1">טמפ. עבודה (°C)</label><input type="number" step="0.1" value={String(form.operatingTempC || "")} onChange={e => set("operatingTempC", e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" /></div>
          <div><label className="block text-xs text-zinc-400 mb-1">קיבולת / יכולת</label><input value={String(form.capacity || "")} onChange={e => set("capacity", e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" /></div>
          <div><label className="block text-xs text-zinc-400 mb-1">משקל (ק"ג)</label><input type="number" value={String(form.weightKg || "")} onChange={e => set("weightKg", e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" /></div>
          <div><label className="block text-xs text-zinc-400 mb-1">שנת ייצור</label><input type="number" min={1950} max={2030} value={String(form.yearOfManufacture || "")} onChange={e => set("yearOfManufacture", e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" /></div>
          <div><label className="block text-xs text-zinc-400 mb-1">ארץ מקור</label><input value={String(form.countryOfOrigin || "")} onChange={e => set("countryOfOrigin", e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" /></div>
          <div><label className="block text-xs text-zinc-400 mb-1">שיטת רכישה</label>
            <select value={String(form.acquisitionMethod || "purchase")} onChange={e => set("acquisitionMethod", e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200">
              <option value="purchase">רכישה</option><option value="lease">ליסינג</option><option value="rent">שכירות</option><option value="donation">תרומה</option><option value="transfer">העברה פנימית</option>
            </select>
          </div>
        </div>
      )}

      {formTab === "warranty" && (
        <div className="grid md:grid-cols-3 gap-3">
          <div><label className="block text-xs text-zinc-400 mb-1">תוקף אחריות</label><input type="date" value={String(form.warrantyExpiry || "")} onChange={e => set("warrantyExpiry", e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" /></div>
          <div><label className="block text-xs text-zinc-400 mb-1">ספק אחריות</label><input value={String(form.warrantyProvider || "")} onChange={e => set("warrantyProvider", e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" /></div>
          <div><label className="block text-xs text-zinc-400 mb-1">מצב אחריות</label>
            <select value={String(form.warrantyStatus || "unknown")} onChange={e => set("warrantyStatus", e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200">
              <option value="active">פעילה</option><option value="expired">פגה</option><option value="none">ללא</option><option value="unknown">לא ידוע</option>
            </select>
          </div>
          <div><label className="block text-xs text-zinc-400 mb-1">תוחלת חיים (שנים)</label><input type="number" value={String(form.expectedUsefulLifeYears || "")} onChange={e => set("expectedUsefulLifeYears", e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" /></div>
          <div><label className="block text-xs text-zinc-400 mb-1">עלות החלפה (₪)</label><input type="number" value={Number(form.replacementCost || 0)} onChange={e => set("replacementCost", Number(e.target.value))} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" /></div>
          <div><label className="block text-xs text-zinc-400 mb-1">ערך שאריות (₪)</label><input type="number" value={Number(form.salvageValue || 0)} onChange={e => set("salvageValue", Number(e.target.value))} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" /></div>
          <div><label className="block text-xs text-zinc-400 mb-1">עלות השבתה/שעה (₪)</label><input type="number" value={Number(form.downtimeCostPerHour || 0)} onChange={e => set("downtimeCostPerHour", Number(e.target.value))} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" /></div>
          <div className="md:col-span-3"><label className="block text-xs text-zinc-400 mb-1">תנאי אחריות</label><textarea value={String(form.warrantyTerms || "")} onChange={e => set("warrantyTerms", e.target.value)} rows={2} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" /></div>
        </div>
      )}

      {formTab === "vehicle" && isVehicle && (
        <div className="grid md:grid-cols-3 gap-3">
          <div><label className="block text-xs text-zinc-400 mb-1">לוחית רישוי</label><input value={String(form.licensePlate || "")} onChange={e => set("licensePlate", e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" /></div>
          <div><label className="block text-xs text-zinc-400 mb-1">סוג דלק</label>
            <select value={String(form.fuelType || "")} onChange={e => set("fuelType", e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200">
              <option value="">— בחר —</option><option value="דיזל">דיזל</option><option value="בנזין">בנזין</option><option value="חשמלי">חשמלי</option><option value="גז">גז</option><option value="היברידי">היברידי</option>
            </select>
          </div>
          <div><label className="block text-xs text-zinc-400 mb-1">קילומטראז' (ק"מ)</label><input type="number" value={Number(form.mileageKm || 0)} onChange={e => set("mileageKm", Number(e.target.value))} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" /></div>
          <div><label className="block text-xs text-zinc-400 mb-1">תוקף רישיון רכב</label><input type="date" value={String(form.registrationExpiry || "")} onChange={e => set("registrationExpiry", e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" /></div>
          <div><label className="block text-xs text-zinc-400 mb-1">תוקף ביטוח</label><input type="date" value={String(form.insuranceExpiry || "")} onChange={e => set("insuranceExpiry", e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" /></div>
          <div><label className="block text-xs text-zinc-400 mb-1">פוליסת ביטוח</label><input value={String(form.insurancePolicy || "")} onChange={e => set("insurancePolicy", e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" /></div>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 rounded-lg text-sm">ביטול</button>
        <button onClick={() => onSave(form)} disabled={saving || !form.name} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-zinc-100 rounded-lg text-sm font-medium disabled:opacity-50">
          {saving ? "שומר..." : item ? "עדכן" : "צור"}
        </button>
      </div>
    </div>
  );
}

function AnalyticsTab({ dashboard }: { dashboard: Record<string, unknown> | undefined }) {
  if (!dashboard) return <div className="text-center py-12 text-zinc-400">טוען...</div>;
  return <div className="text-center py-12 text-zinc-400">ראה לשונית KPI לניתוח מפורט</div>;
}

function DowntimeTab() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<Record<string, unknown> | null>(null);

  const { data: events = [] } = useQuery({
    queryKey: ["cmms-downtime"],
    queryFn: async () => {
      const r = await authFetch("/api/cmms/downtime-events");
      const j = await r.json();
      return Array.isArray(j) ? j : [];
    },
  });

  const { data: dtStats } = useQuery({
    queryKey: ["cmms-downtime-stats"],
    queryFn: async () => {
      const r = await authFetch("/api/cmms/downtime-events/stats");
      return r.json();
    },
  });

  const { data: oeeData = [] } = useQuery({
    queryKey: ["cmms-oee"],
    queryFn: async () => {
      const r = await authFetch("/api/cmms/downtime-events/oee?months=6");
      const j = await r.json();
      return Array.isArray(j) ? j : [];
    },
  });

  const { data: equipment = [] } = useQuery({
    queryKey: ["cmms-equipment"],
    queryFn: async () => {
      const r = await authFetch("/api/cmms/equipment");
      const j = await r.json();
      return Array.isArray(j) ? j : [];
    },
  });

  const { data: workOrders = [] } = useQuery({
    queryKey: ["cmms-work-orders", "all"],
    queryFn: async () => {
      const r = await authFetch("/api/cmms/work-orders");
      const j = await r.json();
      return Array.isArray(j) ? j : [];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const id = data.id;
      const url = id ? `/api/cmms/downtime-events/${id}` : "/api/cmms/downtime-events";
      const r = await authFetch(url, { method: id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cmms-downtime"] });
      queryClient.invalidateQueries({ queryKey: ["cmms-downtime-stats"] });
      queryClient.invalidateQueries({ queryKey: ["cmms-oee"] });
      queryClient.invalidateQueries({ queryKey: ["cmms-dashboard"] });
      setShowForm(false);
      setEditItem(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await authFetch(`/api/cmms/downtime-events/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cmms-downtime"] });
      queryClient.invalidateQueries({ queryKey: ["cmms-downtime-stats"] });
    },
  });

  const s = dtStats as Record<string, unknown> | undefined;
  const totalHours = Number(s?.total_minutes || 0) / 60;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard title="סה״כ אירועים" value={String(s?.total_events || 0)} icon={<AlertTriangle className="w-5 h-5 text-red-400" />} color="bg-red-500/10" subtitle={`${s?.this_month || 0} החודש`} />
        <KpiCard title="סה״כ שעות השבתה" value={`${formatNum(totalHours, 0)} שעות`} icon={<Clock className="w-5 h-5 text-amber-400" />} color="bg-amber-500/10" />
        <KpiCard title="משך ממוצע" value={`${formatNum(Number(s?.avg_duration || 0), 0)} דקות`} icon={<Timer className="w-5 h-5 text-purple-400" />} color="bg-purple-500/10" />
        <KpiCard title="תקלות מכניות" value={String(s?.mechanical || 0)} icon={<Cog className="w-5 h-5 text-blue-400" />} color="bg-blue-500/10" subtitle={`${s?.electrical || 0} חשמליות`} />
      </div>

      {oeeData.length > 0 && (
        <div className="rounded-xl border border-zinc-700/60 bg-zinc-900/80 p-5">
          <h3 className="text-base font-semibold text-zinc-100 mb-4">מגמת זמינות OEE (6 חודשים אחרונים)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={oeeData as any[]}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="month" tick={{ fill: "#9ca3af", fontSize: 11 }} />
              <YAxis domain={[0, 100]} tick={{ fill: "#9ca3af", fontSize: 11 }} unit="%" />
              <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #3f3f46", borderRadius: "8px", direction: "rtl" }} formatter={(v: any) => [`${Number(v).toFixed(1)}%`, "זמינות"]} />
              <Line type="monotone" dataKey="availability" stroke="#10b981" strokeWidth={2} dot={{ fill: "#10b981" }} name="זמינות %" />
              <Line type="monotone" dataKey="event_count" stroke="#f59e0b" strokeWidth={1} strokeDasharray="4 4" dot={false} name="מספר אירועים" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-zinc-100">יומן השבתות</h3>
        <button onClick={() => { setEditItem(null); setShowForm(true); }} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-zinc-100 rounded-lg text-sm font-medium flex items-center gap-2">
          <Plus className="w-4 h-4" /> רשום השבתה
        </button>
      </div>

      {showForm && (
        <DowntimeForm
          item={editItem}
          equipment={equipment as any[]}
          workOrders={workOrders as any[]}
          onSave={(d) => saveMutation.mutate(d)}
          onCancel={() => { setShowForm(false); setEditItem(null); }}
          saving={saveMutation.isPending}
        />
      )}

      <div className="rounded-xl border border-zinc-700/60 bg-zinc-900/80 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-700/60 bg-zinc-800/50">
                <th className="text-right px-4 py-3 text-xs text-zinc-400 font-medium">מספר</th>
                <th className="text-right px-4 py-3 text-xs text-zinc-400 font-medium">ציוד</th>
                <th className="text-right px-4 py-3 text-xs text-zinc-400 font-medium">התחלה</th>
                <th className="text-right px-4 py-3 text-xs text-zinc-400 font-medium">סיום</th>
                <th className="text-right px-4 py-3 text-xs text-zinc-400 font-medium">משך (דקות)</th>
                <th className="text-right px-4 py-3 text-xs text-zinc-400 font-medium">סיבה</th>
                <th className="text-right px-4 py-3 text-xs text-zinc-400 font-medium">פרט</th>
                <th className="text-right px-4 py-3 text-xs text-zinc-400 font-medium">משמרת</th>
                <th className="text-right px-4 py-3 text-xs text-zinc-400 font-medium">יחידות שנפגעו</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {(events as any[]).map((ev) => (
                <tr key={ev.id} className="border-b border-zinc-800/60 hover:bg-zinc-800/30">
                  <td className="px-4 py-3 font-mono text-xs text-zinc-400">{ev.event_number}</td>
                  <td className="px-4 py-3 text-zinc-200">{ev.equipment_name || "—"}</td>
                  <td className="px-4 py-3 text-zinc-400 text-xs">{formatDatetime(ev.start_time)}</td>
                  <td className="px-4 py-3 text-zinc-400 text-xs">{ev.end_time ? formatDatetime(ev.end_time) : "—"}</td>
                  <td className="px-4 py-3 text-zinc-300">{formatNum(Number(ev.duration_minutes || 0), 0)}</td>
                  <td className="px-4 py-3"><Badge text={DOWNTIME_REASON_LABELS[ev.reason_category] || ev.reason_category} color="bg-red-500/20 text-red-400" /></td>
                  <td className="px-4 py-3 text-zinc-400 text-xs max-w-[140px] truncate">{ev.reason_detail || "—"}</td>
                  <td className="px-4 py-3 text-zinc-400">{ev.shift || "—"}</td>
                  <td className="px-4 py-3 text-zinc-400">{ev.units_lost || 0}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button onClick={() => { setEditItem(ev); setShowForm(true); }} className="p-1.5 rounded hover:bg-zinc-700/60 text-zinc-400 hover:text-zinc-200"><Edit className="w-3.5 h-3.5" /></button>
                      <button onClick={() => { if (confirm("למחוק?")) deleteMutation.mutate(ev.id); }} className="p-1.5 rounded hover:bg-zinc-700/60 text-zinc-400 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {(events as any[]).length === 0 && (
                <tr><td colSpan={10} className="text-center py-12 text-zinc-500">אין אירועי השבתה</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function DowntimeForm({ item, equipment, workOrders, onSave, onCancel, saving }: {
  item: Record<string, unknown> | null;
  equipment: any[];
  workOrders: any[];
  onSave: (data: Record<string, unknown>) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<Record<string, unknown>>({
    id: item?.id || undefined,
    equipmentId: item?.equipment_id || "",
    workOrderId: item?.work_order_id || "",
    startTime: item?.start_time ? String(item.start_time).slice(0, 16) : new Date().toISOString().slice(0, 16),
    endTime: item?.end_time ? String(item.end_time).slice(0, 16) : "",
    reasonCategory: item?.reason_category || "mechanical",
    reasonDetail: item?.reason_detail || "",
    productionImpact: item?.production_impact || "",
    unitsLost: item?.units_lost || 0,
    shift: item?.shift || "",
    reportedBy: item?.reported_by || "",
    notes: item?.notes || "",
  });

  const set = (k: string, v: unknown) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <div className="rounded-xl border border-red-500/30 bg-zinc-900/80 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-zinc-100 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-red-400" />{item ? "עריכת השבתה" : "השבתה חדשה"}</h3>
        <button onClick={onCancel} className="p-1 text-zinc-400 hover:text-zinc-200"><X className="w-5 h-5" /></button>
      </div>
      <div className="grid md:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs text-zinc-400 mb-1">ציוד *</label>
          <select value={String(form.equipmentId || "")} onChange={(e) => set("equipmentId", e.target.value ? Number(e.target.value) : "")} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200">
            <option value="">— בחר —</option>
            {equipment.map((eq) => <option key={eq.id} value={eq.id}>{eq.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">סיבת השבתה</label>
          <select value={String(form.reasonCategory)} onChange={(e) => set("reasonCategory", e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200">
            {Object.entries(DOWNTIME_REASON_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">קריאת שירות קשורה</label>
          <select value={String(form.workOrderId || "")} onChange={(e) => set("workOrderId", e.target.value ? Number(e.target.value) : "")} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200">
            <option value="">ללא</option>
            {workOrders.map((wo: any) => <option key={wo.id} value={wo.id}>{wo.wo_number} — {wo.title}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">תחילת השבתה *</label>
          <input type="datetime-local" value={String(form.startTime || "")} onChange={(e) => set("startTime", e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">סיום השבתה</label>
          <input type="datetime-local" value={String(form.endTime || "")} onChange={(e) => set("endTime", e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">פרט הסיבה</label>
          <input value={String(form.reasonDetail || "")} onChange={(e) => set("reasonDetail", e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">משמרת</label>
          <select value={String(form.shift || "")} onChange={(e) => set("shift", e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200">
            <option value="">— בחר —</option>
            <option value="א">משמרת א׳</option>
            <option value="ב">משמרת ב׳</option>
            <option value="ג">משמרת ג׳</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">יחידות שנפגעו</label>
          <input type="number" value={Number(form.unitsLost || 0)} onChange={(e) => set("unitsLost", Number(e.target.value))} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">מדווח</label>
          <input value={String(form.reportedBy || "")} onChange={(e) => set("reportedBy", e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" />
        </div>
      </div>
      <div>
        <label className="block text-xs text-zinc-400 mb-1">השפעה על הייצור</label>
        <textarea value={String(form.productionImpact || "")} onChange={(e) => set("productionImpact", e.target.value)} rows={2} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" />
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 rounded-lg text-sm">ביטול</button>
        <button onClick={() => onSave(form)} disabled={saving || !form.equipmentId} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-zinc-100 rounded-lg text-sm font-medium disabled:opacity-50">
          {saving ? "שומר..." : item ? "עדכן" : "רשום"}
        </button>
      </div>
    </div>
  );
}

function KpiTab() {
  const { data: kpi } = useQuery({
    queryKey: ["cmms-kpi"],
    queryFn: async () => {
      const r = await authFetch("/api/cmms/kpi");
      return r.json();
    },
  });

  if (!kpi) return <div className="text-center py-12 text-zinc-400">טוען...</div>;

  const mtbfData = (Array.isArray(kpi.mtbfPerEquipment) ? kpi.mtbfPerEquipment : []) as any[];
  const pvu = (kpi.plannedVsUnplanned || {}) as any;
  const costAsset = (Array.isArray(kpi.costPerAsset) ? kpi.costPerAsset : []) as any[];
  const oee = (Array.isArray(kpi.oeeAvailabilityTrend) ? kpi.oeeAvailabilityTrend : []) as any[];
  const topFailures = (Array.isArray(kpi.topFailureCauses) ? kpi.topFailureCauses : []) as any[];
  const mttrMonthly = (Array.isArray(kpi.mttrByMonth) ? kpi.mttrByMonth : []) as any[];

  const pvuData = [
    { name: "מתוכנן", value: Number(pvu.planned || 0), fill: "#10b981" },
    { name: "מתקן", value: Number(pvu.unplanned || 0), fill: "#f59e0b" },
    { name: "חירום", value: Number(pvu.emergency || 0), fill: "#ef4444" },
  ].filter(d => d.value > 0);

  const plannedRatio = pvu.total > 0 ? ((Number(pvu.planned || 0) / Number(pvu.total)) * 100).toFixed(0) : "0";

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard title="יחס מתוכנן" value={`${plannedRatio}%`} icon={<PieChart className="w-5 h-5 text-emerald-400" />} color="bg-emerald-500/10" subtitle="תחזוקה מונעת" />
        <KpiCard title="תחזוקה מתקנת" value={String(pvu.unplanned || 0)} icon={<Wrench className="w-5 h-5 text-amber-400" />} color="bg-amber-500/10" />
        <KpiCard title="חירום" value={String(pvu.emergency || 0)} icon={<Zap className="w-5 h-5 text-red-400" />} color="bg-red-500/10" />
        <KpiCard title="סה״כ קריאות" value={String(pvu.total || 0)} icon={<FileText className="w-5 h-5 text-blue-400" />} color="bg-blue-500/10" />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-zinc-700/60 bg-zinc-900/80 p-5">
          <h3 className="text-base font-semibold text-zinc-100 mb-4">תחזוקה מונעת מול מתקנת</h3>
          {pvuData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <RePieChart>
                <Pie data={pvuData} cx="50%" cy="50%" innerRadius={55} outerRadius={90} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {pvuData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #3f3f46", borderRadius: "8px", direction: "rtl" }} />
              </RePieChart>
            </ResponsiveContainer>
          ) : <p className="text-zinc-500 text-sm text-center py-8">אין נתונים</p>}
        </div>

        <div className="rounded-xl border border-zinc-700/60 bg-zinc-900/80 p-5">
          <h3 className="text-base font-semibold text-zinc-100 mb-4">מגמת זמינות OEE חודשית</h3>
          {oee.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={oee}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="month" tick={{ fill: "#9ca3af", fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fill: "#9ca3af", fontSize: 11 }} unit="%" />
                <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #3f3f46", borderRadius: "8px", direction: "rtl" }} formatter={(v: any) => [`${Number(v).toFixed(1)}%`, "זמינות"]} />
                <Area type="monotone" dataKey="availability" stroke="#10b981" fill="#10b981" fillOpacity={0.15} name="זמינות %" />
              </AreaChart>
            </ResponsiveContainer>
          ) : <p className="text-zinc-500 text-sm text-center py-8">אין נתוני OEE</p>}
        </div>

        <div className="rounded-xl border border-zinc-700/60 bg-zinc-900/80 p-5">
          <h3 className="text-base font-semibold text-zinc-100 mb-4">10 סיבות כשל מובילות</h3>
          {topFailures.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={topFailures.map((f: any) => ({ ...f, label: DOWNTIME_REASON_LABELS[f.category] || f.category }))} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis type="number" tick={{ fill: "#9ca3af", fontSize: 11 }} />
                <YAxis type="category" dataKey="label" tick={{ fill: "#9ca3af", fontSize: 11 }} width={80} />
                <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #3f3f46", borderRadius: "8px", direction: "rtl" }} />
                <Bar dataKey="count" fill="#f59e0b" name="מספר אירועים" />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-zinc-500 text-sm text-center py-8">אין נתונים</p>}
        </div>

        <div className="rounded-xl border border-zinc-700/60 bg-zinc-900/80 p-5">
          <h3 className="text-base font-semibold text-zinc-100 mb-4">מגמת MTTR חודשית</h3>
          {mttrMonthly.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={mttrMonthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="month" tick={{ fill: "#9ca3af", fontSize: 11 }} />
                <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} unit="h" />
                <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #3f3f46", borderRadius: "8px", direction: "rtl" }} formatter={(v: any) => [`${Number(v).toFixed(1)} שעות`, "MTTR ממוצע"]} />
                <Line type="monotone" dataKey="avg_mttr" stroke="#8b5cf6" strokeWidth={2} dot={{ fill: "#8b5cf6" }} name="MTTR (שעות)" />
              </LineChart>
            </ResponsiveContainer>
          ) : <p className="text-zinc-500 text-sm text-center py-8">אין נתונים</p>}
        </div>
      </div>

      <div className="rounded-xl border border-zinc-700/60 bg-zinc-900/80 p-5">
        <h3 className="text-base font-semibold text-zinc-100 mb-4">עלות תחזוקה לנכס</h3>
        {costAsset.length > 0 ? (
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={costAsset.slice(0, 10)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="name" tick={{ fill: "#9ca3af", fontSize: 10 }} angle={-30} textAnchor="end" height={60} />
              <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} />
              <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #3f3f46", borderRadius: "8px", direction: "rtl" }} formatter={(v: any) => [formatCurrency(v), "עלות תחזוקה"]} />
              <Bar dataKey="total_maintenance_cost" fill="#3b82f6" name="עלות תחזוקה (₪)" />
            </BarChart>
          </ResponsiveContainer>
        ) : <p className="text-zinc-500 text-sm text-center py-8">אין נתונים</p>}
      </div>

      {mtbfData.length > 0 && (
        <div className="rounded-xl border border-zinc-700/60 bg-zinc-900/80 p-5">
          <h3 className="text-base font-semibold text-zinc-100 mb-4">MTBF ו-MTTR לפי ציוד</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-700/60">
                  <th className="text-right px-4 py-2 text-xs text-zinc-400">ציוד</th>
                  <th className="text-right px-4 py-2 text-xs text-zinc-400">קריטיות</th>
                  <th className="text-right px-4 py-2 text-xs text-zinc-400">מספר תקלות</th>
                  <th className="text-right px-4 py-2 text-xs text-zinc-400">MTBF (שעות)</th>
                  <th className="text-right px-4 py-2 text-xs text-zinc-400">MTTR (שעות)</th>
                  <th className="text-right px-4 py-2 text-xs text-zinc-400">זמינות</th>
                  <th className="text-right px-4 py-2 text-xs text-zinc-400">עלות תחזוקה</th>
                </tr>
              </thead>
              <tbody>
                {mtbfData.map((eq: any, i: number) => {
                  const mtbfH = Number(eq.mtbf_hours || 0);
                  const mttrH = Number(eq.mttr_hours || 0);
                  const avail = mtbfH > 0 ? ((mtbfH / (mtbfH + mttrH)) * 100).toFixed(1) : null;
                  return (
                    <tr key={i} className="border-b border-zinc-800/60 hover:bg-zinc-800/30">
                      <td className="px-4 py-2 text-zinc-200">{eq.name}</td>
                      <td className="px-4 py-2"><PriorityBadge priority={eq.criticality || "medium"} /></td>
                      <td className="px-4 py-2 text-zinc-300">{eq.failure_count}</td>
                      <td className="px-4 py-2 text-zinc-300">{mtbfH ? formatNum(mtbfH, 0) : "—"}</td>
                      <td className="px-4 py-2 text-zinc-300">{formatNum(mttrH)}</td>
                      <td className="px-4 py-2">
                        {avail ? <span className={`text-xs font-medium ${Number(avail) >= 95 ? "text-emerald-400" : Number(avail) >= 85 ? "text-amber-400" : "text-red-400"}`}>{avail}%</span> : <span className="text-zinc-500">—</span>}
                      </td>
                      <td className="px-4 py-2 text-zinc-300">{formatCurrency(Number(eq.total_cost || 0))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function MaintenanceRequestsTab() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<Record<string, unknown> | null>(null);

  const { data: requests = [] } = useQuery({
    queryKey: ["cmms-requests"],
    queryFn: async () => {
      const r = await authFetch("/api/cmms/maintenance-requests");
      const j = await r.json();
      return Array.isArray(j) ? j : [];
    },
  });

  const { data: equipment = [] } = useQuery({
    queryKey: ["cmms-equipment"],
    queryFn: async () => {
      const r = await authFetch("/api/cmms/equipment");
      const j = await r.json();
      return Array.isArray(j) ? j : [];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const id = data.id;
      const url = id ? `/api/cmms/maintenance-requests/${id}` : "/api/cmms/maintenance-requests";
      const r = await authFetch(url, { method: id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cmms-requests"] });
      queryClient.invalidateQueries({ queryKey: ["cmms-dashboard"] });
      setShowForm(false);
      setEditItem(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await authFetch(`/api/cmms/maintenance-requests/${id}`, { method: "DELETE" });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["cmms-requests"] }),
  });

  const pendingCount = (requests as any[]).filter((r: any) => r.status === "pending").length;
  const assignedCount = (requests as any[]).filter((r: any) => r.status === "assigned" || r.status === "in_progress").length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard title="סה״כ בקשות" value={String((requests as any[]).length)} icon={<ClipboardCheck className="w-5 h-5 text-blue-400" />} color="bg-blue-500/10" />
        <KpiCard title="ממתינות" value={String(pendingCount)} icon={<Bell className="w-5 h-5 text-yellow-400" />} color="bg-yellow-500/10" />
        <KpiCard title="בטיפול" value={String(assignedCount)} icon={<Wrench className="w-5 h-5 text-amber-400" />} color="bg-amber-500/10" />
        <KpiCard title="הושלמו" value={String((requests as any[]).filter((r: any) => r.status === "completed").length)} icon={<CheckCircle2 className="w-5 h-5 text-emerald-400" />} color="bg-emerald-500/10" />
      </div>

      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-zinc-100 flex items-center gap-2">
          <ClipboardCheck className="w-5 h-5 text-blue-400" />
          בקשות תחזוקה מגורמי ייצור
        </h3>
        <button onClick={() => { setEditItem(null); setShowForm(true); }} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-zinc-100 rounded-lg text-sm font-medium flex items-center gap-2">
          <Plus className="w-4 h-4" /> בקשה חדשה
        </button>
      </div>

      {showForm && (
        <MaintenanceRequestForm
          item={editItem}
          equipment={equipment as any[]}
          onSave={(d) => saveMutation.mutate(d)}
          onCancel={() => { setShowForm(false); setEditItem(null); }}
          saving={saveMutation.isPending}
        />
      )}

      <div className="grid gap-3">
        {(requests as any[]).map((req) => (
          <div key={req.id} className={`rounded-xl border ${req.urgency === "critical" ? "border-red-500/40" : req.urgency === "high" ? "border-orange-500/30" : "border-zinc-700/60"} bg-zinc-900/80 p-4`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs text-zinc-500">{req.request_number}</span>
                  <h4 className="text-sm font-semibold text-zinc-200">{req.title}</h4>
                  <PriorityBadge priority={req.urgency || "medium"} />
                  <StatusBadge status={req.status || "pending"} />
                </div>
                <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">{req.description}</p>
                <div className="flex items-center gap-4 mt-2 text-xs text-zinc-500 flex-wrap">
                  {req.equipment_name && <span className="flex items-center gap-1"><Cpu className="w-3 h-3" />{req.equipment_name}</span>}
                  {req.requested_by && <span className="flex items-center gap-1"><Users className="w-3 h-3" />מגיש: {req.requested_by}</span>}
                  {req.department && <span className="flex items-center gap-1"><Building2 className="w-3 h-3" />{req.department}</span>}
                  {req.assigned_to && <span className="flex items-center gap-1"><Wrench className="w-3 h-3" />טכנאי: {req.assigned_to}</span>}
                  <span>{formatDate(req.created_at)}</span>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {req.status === "pending" && <button onClick={() => saveMutation.mutate({ id: req.id, status: "assigned" })} className="px-2 py-1 bg-indigo-500/20 text-indigo-400 rounded text-xs hover:bg-indigo-500/30">שייך</button>}
                {req.status === "assigned" && <button onClick={() => saveMutation.mutate({ id: req.id, status: "in_progress" })} className="px-2 py-1 bg-amber-500/20 text-amber-400 rounded text-xs hover:bg-amber-500/30">התחל</button>}
                {req.status === "in_progress" && <button onClick={() => saveMutation.mutate({ id: req.id, status: "completed" })} className="px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded text-xs hover:bg-emerald-500/30">סיים</button>}
                <button onClick={() => { setEditItem(req); setShowForm(true); }} className="p-1.5 rounded hover:bg-zinc-700/60 text-zinc-400 hover:text-zinc-200"><Edit className="w-3.5 h-3.5" /></button>
                <button onClick={() => { if (confirm("למחוק בקשה זו?")) deleteMutation.mutate(req.id); }} className="p-1.5 rounded hover:bg-zinc-700/60 text-zinc-400 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          </div>
        ))}
        {(requests as any[]).length === 0 && (
          <div className="text-center py-12 text-zinc-500">
            <ClipboardCheck className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>אין בקשות תחזוקה</p>
          </div>
        )}
      </div>
    </div>
  );
}

const SENSOR_LABELS: Record<string, string> = {
  vibration: "רטט (mm/s)",
  temperature: "טמפרטורה (°C)",
  pressure: "לחץ (bar)",
  current: "זרם (A)",
  humidity: "לחות (%)",
  rpm: "סיבובים (RPM)",
  voltage: "מתח (V)",
};

const SENSOR_COLORS: Record<string, string> = {
  vibration: "#f59e0b",
  temperature: "#ef4444",
  pressure: "#3b82f6",
  current: "#8b5cf6",
  humidity: "#06b6d4",
  rpm: "#10b981",
  voltage: "#ec4899",
};

function HealthScoreBadge({ score }: { score: number }) {
  const color = score >= 70 ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/30"
    : score >= 40 ? "text-amber-400 bg-amber-500/10 border-amber-500/30"
    : "text-red-400 bg-red-500/10 border-red-500/30";
  const icon = score >= 70 ? <Heart className="w-3 h-3" />
    : score >= 40 ? <ShieldAlert className="w-3 h-3" />
    : <ShieldOff className="w-3 h-3" />;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border ${color}`}>
      {icon} {score}
    </span>
  );
}

function IoTTab() {
  const queryClient = useQueryClient();
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<number | null>(null);
  const [selectedSensorType, setSelectedSensorType] = useState<string>("all");
  const [showThresholdForm, setShowThresholdForm] = useState(false);
  const [thresholdForm, setThresholdForm] = useState({ sensorType: "temperature", warningThreshold: "", criticalThreshold: "", unit: "", autoWorkOrder: false });
  const [seedingId, setSeedingId] = useState<number | null>(null);

  const { data: equipment = [] } = useQuery({
    queryKey: ["cmms-equipment"],
    queryFn: async () => { const r = await authFetch("/api/cmms/equipment"); const j = await r.json(); return Array.isArray(j) ? j : []; },
  });

  const { data: healthScores = [], refetch: refetchHealth } = useQuery({
    queryKey: ["cmms-health-scores"],
    queryFn: async () => { const r = await authFetch("/api/cmms/health-scores"); return r.json(); },
    refetchInterval: 60000,
  });

  const { data: sensorData } = useQuery({
    queryKey: ["cmms-sensor-readings", selectedEquipmentId, selectedSensorType],
    queryFn: async () => {
      if (!selectedEquipmentId) return [];
      const params = new URLSearchParams({ hours: "48", limit: "500" });
      if (selectedSensorType !== "all") params.append("sensorType", selectedSensorType);
      const r = await authFetch(`/api/cmms/sensors/${selectedEquipmentId}/readings?${params}`);
      return r.json();
    },
    enabled: !!selectedEquipmentId,
    refetchInterval: 30000,
  });

  const { data: latestData } = useQuery({
    queryKey: ["cmms-sensor-latest", selectedEquipmentId],
    queryFn: async () => {
      if (!selectedEquipmentId) return { latest: [], thresholds: [] };
      const r = await authFetch(`/api/cmms/sensors/${selectedEquipmentId}/latest`);
      return r.json();
    },
    enabled: !!selectedEquipmentId,
    refetchInterval: 30000,
  });

  const seedMutation = useMutation({
    mutationFn: async (eqId: number) => {
      setSeedingId(eqId);
      const r = await authFetch(`/api/cmms/sensors/seed/${eqId}`, { method: "POST" });
      return r.json();
    },
    onSuccess: () => {
      setSeedingId(null);
      queryClient.invalidateQueries({ queryKey: ["cmms-sensor-readings"] });
      queryClient.invalidateQueries({ queryKey: ["cmms-sensor-latest"] });
      queryClient.invalidateQueries({ queryKey: ["cmms-health-scores"] });
    },
    onError: () => setSeedingId(null),
  });

  const saveThresholdMutation = useMutation({
    mutationFn: async (data: typeof thresholdForm) => {
      if (!selectedEquipmentId) throw new Error("No equipment selected");
      const r = await authFetch(`/api/cmms/sensors/${selectedEquipmentId}/thresholds`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sensorType: data.sensorType, warningThreshold: Number(data.warningThreshold), criticalThreshold: Number(data.criticalThreshold), unit: data.unit, autoWorkOrder: data.autoWorkOrder }),
      });
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cmms-sensor-latest"] });
      setShowThresholdForm(false);
    },
  });

  const healthScoresArr = Array.isArray(healthScores) ? healthScores as Record<string, unknown>[] : [];
  const alerts = (Array.isArray(sensorData) ? sensorData as Record<string, unknown>[] : []).filter(r => r.is_alert);
  const latestReadings = (latestData as Record<string, unknown>)?.latest as Record<string, unknown>[] || [];
  const thresholds = (latestData as Record<string, unknown>)?.thresholds as Record<string, unknown>[] || [];

  const sensorsByType: Record<string, Record<string, unknown>[]> = {};
  if (Array.isArray(sensorData)) {
    for (const r of sensorData as Record<string, unknown>[]) {
      const t = String(r.sensor_type);
      if (!sensorsByType[t]) sensorsByType[t] = [];
      sensorsByType[t].push(r);
    }
  }

  const selectedEq = (equipment as Record<string, unknown>[]).find(e => Number(e.id) === selectedEquipmentId);
  const selectedHealth = healthScoresArr.find(h => Number(h.id) === selectedEquipmentId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
            <Radio className="w-5 h-5 text-cyan-400" /> ניטור IoT וניבוי תחזוקה
          </h2>
          <p className="text-sm text-zinc-400">ניתוח חיישנים, ציונים בריאותיים וניבוי כשלים</p>
        </div>
        <button onClick={() => refetchHealth()} className="px-3 py-2 bg-zinc-800 border border-zinc-700 text-zinc-300 rounded-lg text-sm flex items-center gap-2 hover:bg-zinc-700">
          <RefreshCw className="w-4 h-4" /> רענן
        </button>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-zinc-700/60 bg-zinc-900/80 p-5">
          <h3 className="text-sm font-semibold text-zinc-100 mb-4 flex items-center gap-2">
            <Heart className="w-4 h-4 text-red-400" /> ציון בריאות ציוד — כל הציוד
          </h3>
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {healthScoresArr.slice(0, 20).map((hs) => {
              const score = Number(hs.health_score || 0);
              const barColor = score >= 70 ? "bg-emerald-500" : score >= 40 ? "bg-amber-500" : "bg-red-500";
              return (
                <div
                  key={String(hs.id)}
                  onClick={() => setSelectedEquipmentId(Number(hs.id))}
                  className={`p-3 rounded-lg border cursor-pointer transition-colors ${selectedEquipmentId === Number(hs.id) ? "border-blue-500/50 bg-blue-500/5" : "border-zinc-700/40 bg-zinc-800/40 hover:border-zinc-600"}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs text-zinc-500 font-mono">{String(hs.equipment_number || "")}</span>
                      <span className="text-sm text-zinc-200 truncate">{String(hs.name || "")}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <HealthScoreBadge score={score} />
                      {Number(hs.predicted_days_to_failure || 0) < 30 && (
                        <span className="text-xs text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full border border-red-500/30">
                          {Number(hs.predicted_days_to_failure)}י׳ לכשל
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="w-full bg-zinc-700 rounded-full h-1.5 mt-1">
                    <div className={`h-1.5 rounded-full ${barColor}`} style={{ width: `${score}%` }} />
                  </div>
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-zinc-500">
                    <span>התראות: {String(hs.recent_alerts || 0)}</span>
                    <span>תקלות: {String(hs.recent_failures || 0)}</span>
                    <span>גיל: {String(hs.age_ratio_pct || 0)}%</span>
                  </div>
                </div>
              );
            })}
            {healthScoresArr.length === 0 && (
              <p className="text-zinc-500 text-sm text-center py-8">אין ציוד לניתוח</p>
            )}
          </div>
        </div>

        <div className="space-y-4">
          {selectedEquipmentId ? (
            <>
              <div className="rounded-xl border border-zinc-700/60 bg-zinc-900/80 p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-blue-400" /> {String(selectedEq?.name || "ציוד נבחר")}
                  </h3>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => seedMutation.mutate(selectedEquipmentId)}
                      disabled={seedMutation.isPending && seedingId === selectedEquipmentId}
                      className="px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded-lg text-xs flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <Zap className="w-3.5 h-3.5" />
                      {seedMutation.isPending && seedingId === selectedEquipmentId ? "מייצר..." : "צור נתוני דמו"}
                    </button>
                    <button onClick={() => setShowThresholdForm(!showThresholdForm)} className="px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded-lg text-xs flex items-center gap-1.5">
                      <Settings className="w-3.5 h-3.5" /> סף התראות
                    </button>
                  </div>
                </div>

                {selectedHealth && (
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <div className="bg-zinc-800/60 rounded-lg p-2 text-center">
                      <p className="text-xs text-zinc-500">ציון בריאות</p>
                      <HealthScoreBadge score={Number(selectedHealth.health_score || 0)} />
                    </div>
                    <div className="bg-zinc-800/60 rounded-lg p-2 text-center">
                      <p className="text-xs text-zinc-500">ימים לכשל</p>
                      <p className={`text-lg font-bold ${Number(selectedHealth.predicted_days_to_failure || 0) < 30 ? "text-red-400" : "text-zinc-100"}`}>
                        {String(selectedHealth.predicted_days_to_failure || "—")}
                      </p>
                    </div>
                    <div className="bg-zinc-800/60 rounded-lg p-2 text-center">
                      <p className="text-xs text-zinc-500">התראות (7י׳)</p>
                      <p className={`text-lg font-bold ${Number(selectedHealth.recent_alerts || 0) > 0 ? "text-amber-400" : "text-zinc-100"}`}>
                        {String(selectedHealth.recent_alerts || 0)}
                      </p>
                    </div>
                  </div>
                )}

                {showThresholdForm && (
                  <div className="p-3 bg-zinc-800/60 rounded-lg border border-zinc-700/40 mb-3 space-y-2">
                    <p className="text-xs font-semibold text-zinc-300">הגדרת סף התראות</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-zinc-500 block mb-0.5">סוג חיישן</label>
                        <select value={thresholdForm.sensorType} onChange={e => setThresholdForm(f => ({ ...f, sensorType: e.target.value }))} className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-200">
                          {["temperature","vibration","pressure","current","humidity","rpm","voltage"].map(t => <option key={t} value={t}>{SENSOR_LABELS[t] || t}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-zinc-500 block mb-0.5">יחידה</label>
                        <input value={thresholdForm.unit} onChange={e => setThresholdForm(f => ({ ...f, unit: e.target.value }))} placeholder="°C" className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-200" />
                      </div>
                      <div>
                        <label className="text-xs text-zinc-500 block mb-0.5">סף אזהרה</label>
                        <input type="number" value={thresholdForm.warningThreshold} onChange={e => setThresholdForm(f => ({ ...f, warningThreshold: e.target.value }))} className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-200" />
                      </div>
                      <div>
                        <label className="text-xs text-zinc-500 block mb-0.5">סף קריטי</label>
                        <input type="number" value={thresholdForm.criticalThreshold} onChange={e => setThresholdForm(f => ({ ...f, criticalThreshold: e.target.value }))} className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-200" />
                      </div>
                    </div>
                    <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                      <input type="checkbox" checked={thresholdForm.autoWorkOrder} onChange={e => setThresholdForm(f => ({ ...f, autoWorkOrder: e.target.checked }))} className="rounded" />
                      יצירת קריאה אוטומטית בחריגה
                    </label>
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => setShowThresholdForm(false)} className="px-3 py-1.5 bg-zinc-700 text-zinc-300 rounded text-xs">ביטול</button>
                      <button onClick={() => saveThresholdMutation.mutate(thresholdForm)} disabled={saveThresholdMutation.isPending} className="px-3 py-1.5 bg-blue-600 text-zinc-100 rounded text-xs disabled:opacity-50">שמור</button>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  {latestReadings.map((r) => {
                    const t = String(r.sensor_type);
                    const thresh = thresholds.find(th => String(th.sensor_type) === t);
                    const val = Number(r.value);
                    const critVal = thresh ? Number(thresh.critical_threshold) : null;
                    const warnVal = thresh ? Number(thresh.warning_threshold) : null;
                    const isCrit = critVal !== null && val >= critVal;
                    const isWarn = warnVal !== null && val >= warnVal && !isCrit;
                    return (
                      <div key={t} onClick={() => setSelectedSensorType(t)} className={`p-3 rounded-lg border cursor-pointer ${isCrit ? "border-red-500/50 bg-red-500/5" : isWarn ? "border-amber-500/50 bg-amber-500/5" : "border-zinc-700/40 bg-zinc-800/40"} ${selectedSensorType === t ? "ring-1 ring-blue-500/50" : ""}`}>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-zinc-400">{SENSOR_LABELS[t] || t}</span>
                          {isCrit && <AlertCircle className="w-3.5 h-3.5 text-red-400" />}
                          {isWarn && <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />}
                        </div>
                        <p className={`text-xl font-bold mt-1 ${isCrit ? "text-red-400" : isWarn ? "text-amber-400" : "text-zinc-100"}`}>
                          {val.toFixed(1)} <span className="text-xs font-normal text-zinc-400">{String(r.unit || "")}</span>
                        </p>
                        {thresh && (
                          <p className="text-xs text-zinc-500 mt-0.5">סף: {String(thresh.warning_threshold || "—")} / {String(thresh.critical_threshold || "—")}</p>
                        )}
                      </div>
                    );
                  })}
                  {latestReadings.length === 0 && (
                    <div className="col-span-2 text-center py-4 text-zinc-500 text-sm">
                      <p>אין נתוני חיישנים. לחץ "צור נתוני דמו" להוספת נתונים.</p>
                    </div>
                  )}
                </div>
              </div>

              {alerts.length > 0 && (
                <div className="rounded-xl border border-red-500/30 bg-zinc-900/80 p-4">
                  <h4 className="text-sm font-semibold text-red-400 mb-2 flex items-center gap-2">
                    <BadgeAlert className="w-4 h-4" /> התראות פעילות ({alerts.length})
                  </h4>
                  <div className="space-y-1 max-h-[150px] overflow-y-auto">
                    {alerts.slice(0, 10).map((a, i) => (
                      <div key={i} className="flex items-center justify-between text-xs p-2 rounded bg-red-500/5 border border-red-500/20">
                        <span className="text-zinc-300">{SENSOR_LABELS[String(a.sensor_type)] || String(a.sensor_type)}: {Number(a.value).toFixed(2)} {String(a.unit || "")}</span>
                        <span className="text-zinc-500">{formatDate(String(a.recorded_at || ""))}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="rounded-xl border border-zinc-700/60 bg-zinc-900/80 p-10 text-center">
              <Radio className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
              <p className="text-zinc-400">בחר ציוד מהרשימה משמאל לצפייה בנתוני חיישנים</p>
            </div>
          )}
        </div>
      </div>

      {selectedEquipmentId && Object.keys(sensorsByType).length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-400" /> גרפי מגמת חיישנים — 48 שעות אחרונות
            </h3>
            <select value={selectedSensorType} onChange={e => setSelectedSensorType(e.target.value)} className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-xs text-zinc-200">
              <option value="all">כל החיישנים</option>
              {Object.keys(sensorsByType).map(t => <option key={t} value={t}>{SENSOR_LABELS[t] || t}</option>)}
            </select>
          </div>
          <div className="grid lg:grid-cols-2 gap-4">
            {Object.entries(sensorsByType)
              .filter(([t]) => selectedSensorType === "all" || t === selectedSensorType)
              .map(([type, readings]) => {
                const color = SENSOR_COLORS[type] || "#3b82f6";
                const thresh = thresholds.find(th => String(th.sensor_type) === type);
                const warnVal = thresh ? Number(thresh.warning_threshold) : null;
                const critVal = thresh ? Number(thresh.critical_threshold) : null;
                const chartData = readings.slice().reverse().map((r) => ({
                  time: new Date(String(r.recorded_at)).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }),
                  value: Number(Number(r.value).toFixed(2)),
                }));
                return (
                  <div key={type} className="rounded-xl border border-zinc-700/60 bg-zinc-900/80 p-4">
                    <h4 className="text-sm font-medium text-zinc-200 mb-3" style={{ color }}>
                      {SENSOR_LABELS[type] || type}
                    </h4>
                    <ResponsiveContainer width="100%" height={180}>
                      <AreaChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                        <XAxis dataKey="time" tick={{ fill: "#6b7280", fontSize: 9 }} interval={11} />
                        <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} />
                        <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #3f3f46", borderRadius: "8px" }} />
                        {warnVal !== null && <Line type="monotone" dataKey={() => warnVal} stroke="#f59e0b" strokeDasharray="3 3" dot={false} name="אזהרה" />}
                        {critVal !== null && <Line type="monotone" dataKey={() => critVal} stroke="#ef4444" strokeDasharray="3 3" dot={false} name="קריטי" />}
                        <Area type="monotone" dataKey="value" stroke={color} fill={color} fillOpacity={0.1} name="ערך" dot={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-zinc-700/60 bg-zinc-900/80 p-5">
        <h3 className="text-sm font-semibold text-zinc-100 mb-4 flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-purple-400" /> סיכום ציוני בריאות
        </h3>
        {healthScoresArr.length > 0 ? (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={healthScoresArr.slice(0, 15).map(h => ({ name: String(h.name || "").slice(0, 20), score: Number(h.health_score), fill: Number(h.health_score) >= 70 ? "#10b981" : Number(h.health_score) >= 40 ? "#f59e0b" : "#ef4444" }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="name" tick={{ fill: "#6b7280", fontSize: 9 }} angle={-30} textAnchor="end" height={50} />
              <YAxis domain={[0, 100]} tick={{ fill: "#6b7280", fontSize: 10 }} />
              <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #3f3f46", borderRadius: "8px" }} />
              <Bar dataKey="score" name="ציון בריאות">
                {healthScoresArr.slice(0, 15).map((h, i) => (
                  <Cell key={i} fill={Number(h.health_score) >= 70 ? "#10b981" : Number(h.health_score) >= 40 ? "#f59e0b" : "#ef4444"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-zinc-500 text-sm text-center py-8">אין נתונים</p>
        )}
      </div>
    </div>
  );
}

function MaintenanceRequestForm({ item, equipment, onSave, onCancel, saving }: {
  item: Record<string, unknown> | null;
  equipment: any[];
  onSave: (data: Record<string, unknown>) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<Record<string, unknown>>({
    id: item?.id || undefined,
    equipmentId: item?.equipment_id || "",
    title: item?.title || "",
    description: item?.description || "",
    urgency: item?.urgency || "medium",
    status: item?.status || "pending",
    requestedBy: item?.requested_by || "",
    department: item?.department || "",
    assignedTo: item?.assigned_to || "",
    notes: item?.notes || "",
  });

  const set = (k: string, v: unknown) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <div className="rounded-xl border border-blue-500/30 bg-zinc-900/80 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-zinc-100 flex items-center gap-2">
          <ClipboardCheck className="w-4 h-4 text-blue-400" />
          {item ? "עריכת בקשה" : "בקשת תחזוקה חדשה"}
        </h3>
        <button onClick={onCancel} className="p-1 text-zinc-400 hover:text-zinc-200"><X className="w-5 h-5" /></button>
      </div>
      <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-xs text-blue-300">
        <p className="font-medium mb-1">פורטל בקשות תחזוקה לגורמי ייצור</p>
        <p>תיאור הבעיה ינותב אוטומטית לטכנאי האחראי על הציוד לפי לוחות ה-PM.</p>
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-zinc-400 mb-1">ציוד *</label>
          <select value={String(form.equipmentId || "")} onChange={(e) => set("equipmentId", e.target.value ? Number(e.target.value) : "")} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200">
            <option value="">— בחר ציוד —</option>
            {equipment.map((eq) => <option key={eq.id} value={eq.id}>{eq.name} ({eq.equipment_number})</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">דחיפות</label>
          <select value={String(form.urgency)} onChange={(e) => set("urgency", e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200">
            <option value="low">נמוכה — אינו מפריע לייצור</option>
            <option value="medium">בינונית — מפריע חלקית</option>
            <option value="high">גבוהה — פוגע בייצור</option>
            <option value="critical">קריטית — עוצר ייצור</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">כותרת *</label>
          <input value={String(form.title || "")} onChange={(e) => set("title", e.target.value)} placeholder="תאר בקצרה את הבעיה" className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-500" />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">מגיש הבקשה</label>
          <input value={String(form.requestedBy || "")} onChange={(e) => set("requestedBy", e.target.value)} placeholder="שמך" className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-500" />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">מחלקה</label>
          <input value={String(form.department || "")} onChange={(e) => set("department", e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" />
        </div>
        {item && (
          <>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">סטטוס</label>
              <select value={String(form.status)} onChange={(e) => set("status", e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200">
                <option value="pending">ממתין</option>
                <option value="assigned">שויך</option>
                <option value="in_progress">בביצוע</option>
                <option value="completed">הושלם</option>
                <option value="cancelled">בוטל</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">טכנאי אחראי</label>
              <input value={String(form.assignedTo || "")} onChange={(e) => set("assignedTo", e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" />
            </div>
          </>
        )}
      </div>
      <div>
        <label className="block text-xs text-zinc-400 mb-1">תיאור הבעיה *</label>
        <textarea value={String(form.description || "")} onChange={(e) => set("description", e.target.value)} rows={3} placeholder="תאר את הבעיה בפירוט: מה קורה, מתי התחיל, באיזה תנאים..." className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-500" />
      </div>
      <div>
        <label className="block text-xs text-zinc-400 mb-1">הערות נוספות</label>
        <textarea value={String(form.notes || "")} onChange={(e) => set("notes", e.target.value)} rows={2} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" />
      </div>
      <div className="flex items-center gap-2 p-3 rounded-lg bg-zinc-800/60 border border-zinc-700/40">
        <Camera className="w-4 h-4 text-zinc-500" />
        <span className="text-xs text-zinc-500">צרף תמונה — ניתן לצרף תמונה בעתיד דרך מערכת הניהול</span>
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 rounded-lg text-sm">ביטול</button>
        <button onClick={() => onSave(form)} disabled={saving || !form.title || !form.equipmentId || !form.description} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-zinc-100 rounded-lg text-sm font-medium disabled:opacity-50">
          <Send className="w-3.5 h-3.5 inline ml-1.5" />
          {saving ? "שולח..." : item ? "עדכן" : "שלח בקשה"}
        </button>
      </div>
    </div>
  );
}

const PERMIT_TYPE_LABELS: Record<string, string> = {
  hot_work: "עבודה חמה (ריתוך/חיתוך)",
  confined_space: "מרחב מוגבל",
  electrical: "עבודה חשמלית",
  mechanical: "עבודה מכנית",
  working_at_height: "עבודה בגובה",
  chemical: "חומרים מסוכנים",
};

const PERMIT_STATUS_LABELS: Record<string, string> = {
  requested: "ממתין לאישור",
  approved: "מאושר",
  in_progress: "בביצוע",
  closed: "סגור",
  rejected: "נדחה",
};

const PERMIT_STATUS_COLORS: Record<string, string> = {
  requested: "bg-blue-500/20 text-blue-400",
  approved: "bg-emerald-500/20 text-emerald-400",
  in_progress: "bg-amber-500/20 text-amber-400",
  closed: "bg-zinc-500/20 text-zinc-400",
  rejected: "bg-red-500/20 text-red-400",
};

function SafetyTab() {
  const queryClient = useQueryClient();
  const [safetySection, setSafetySection] = useState<"permits" | "loto" | "compliance">("compliance");
  const [showPermitForm, setShowPermitForm] = useState(false);
  const [showLotoForm, setShowLotoForm] = useState(false);
  const [editLoto, setEditLoto] = useState<Record<string, unknown> | null>(null);
  const [permitForm, setPermitForm] = useState({ equipmentId: "", permitType: "mechanical", requestedBy: "", hazards: "", precautions: "", startTime: "", endTime: "", notes: "" });
  const [lotoForm, setLotoForm] = useState({ name: "", equipmentCategory: "", notes: "", steps: [] as { step: string; done: boolean }[] });
  const [newStep, setNewStep] = useState("");
  const [approvingId, setApprovingId] = useState<number | null>(null);
  const [approveBy, setApproveBy] = useState("");

  const { data: equipment = [] } = useQuery({
    queryKey: ["cmms-equipment"],
    queryFn: async () => { const r = await authFetch("/api/cmms/equipment"); const j = await r.json(); return Array.isArray(j) ? j : []; },
  });

  const { data: permits = [] } = useQuery({
    queryKey: ["cmms-work-permits"],
    queryFn: async () => { const r = await authFetch("/api/cmms/work-permits"); return r.json(); },
    refetchInterval: 30000,
  });

  const { data: lotoTemplates = [] } = useQuery({
    queryKey: ["cmms-loto-templates"],
    queryFn: async () => { const r = await authFetch("/api/cmms/loto-templates"); return r.json(); },
  });

  const { data: compliance } = useQuery({
    queryKey: ["cmms-safety-compliance"],
    queryFn: async () => { const r = await authFetch("/api/cmms/safety-compliance"); return r.json(); },
    refetchInterval: 60000,
  });

  const seedLotoMutation = useMutation({
    mutationFn: async () => { const r = await authFetch("/api/cmms/loto-templates/seed", { method: "POST" }); return r.json(); },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["cmms-loto-templates"] }),
  });

  const createPermitMutation = useMutation({
    mutationFn: async (data: typeof permitForm) => {
      const r = await authFetch("/api/cmms/work-permits", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...data, equipmentId: data.equipmentId ? Number(data.equipmentId) : undefined }) });
      return r.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["cmms-work-permits"] }); setShowPermitForm(false); setPermitForm({ equipmentId: "", permitType: "mechanical", requestedBy: "", hazards: "", precautions: "", startTime: "", endTime: "", notes: "" }); },
  });

  const updatePermitMutation = useMutation({
    mutationFn: async ({ id, action, approvedBy }: { id: number; action: string; approvedBy?: string }) => {
      const url = `/api/cmms/work-permits/${id}/${action}`;
      const r = await authFetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ approvedBy }) });
      return r.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["cmms-work-permits"] }); setApprovingId(null); setApproveBy(""); },
  });

  const deletePermitMutation = useMutation({
    mutationFn: async (id: number) => { await authFetch(`/api/cmms/work-permits/${id}`, { method: "DELETE" }); },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["cmms-work-permits"] }),
  });

  const saveLotoMutation = useMutation({
    mutationFn: async (data: typeof lotoForm & { id?: number }) => {
      const id = data.id;
      const url = id ? `/api/cmms/loto-templates/${id}` : "/api/cmms/loto-templates";
      const r = await authFetch(url, { method: id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      return r.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["cmms-loto-templates"] }); setShowLotoForm(false); setEditLoto(null); setLotoForm({ name: "", equipmentCategory: "", notes: "", steps: [] }); },
  });

  const deleteLotoMutation = useMutation({
    mutationFn: async (id: number) => { await authFetch(`/api/cmms/loto-templates/${id}`, { method: "DELETE" }); },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["cmms-loto-templates"] }),
  });

  const permitsArr = Array.isArray(permits) ? permits as Record<string, unknown>[] : [];
  const lotoArr = Array.isArray(lotoTemplates) ? lotoTemplates as Record<string, unknown>[] : [];
  const comp = (compliance || {}) as Record<string, unknown>;
  const compPermits = (comp.permits || {}) as Record<string, unknown>;
  const compLoto = (comp.loto || {}) as Record<string, unknown>;
  const monthlyPermits = Array.isArray((comp as Record<string, unknown>).monthlyPermits) ? (comp as Record<string, unknown>).monthlyPermits as Record<string, unknown>[] : [];
  const recentPermits = Array.isArray((comp as Record<string, unknown>).recentPermits) ? (comp as Record<string, unknown>).recentPermits as Record<string, unknown>[] : [];

  const sections = [
    { id: "compliance" as const, label: "סיכום בטיחות", icon: <ShieldCheck className="w-4 h-4" /> },
    { id: "permits" as const, label: "היתרי עבודה", icon: <FileCheck className="w-4 h-4" /> },
    { id: "loto" as const, label: "נעילה/תיוג LOTO", icon: <Lock className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-400" /> ניהול בטיחות
          </h2>
          <p className="text-sm text-zinc-400">היתרי עבודה, נעילה/תיוג ועמידה בתקנים</p>
        </div>
      </div>

      <div className="flex gap-1 bg-zinc-800/50 rounded-lg p-1 border border-zinc-700/50">
        {sections.map(s => (
          <button key={s.id} onClick={() => setSafetySection(s.id)} className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${safetySection === s.id ? "bg-emerald-600 text-zinc-100" : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/50"}`}>
            {s.icon} {s.label}
          </button>
        ))}
      </div>

      {safetySection === "compliance" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard title="היתרים פתוחים" value={String(Number(compPermits.pending || 0) + Number(compPermits.approved || 0) + Number(compPermits.active || 0))} icon={<FileCheck className="w-5 h-5 text-blue-400" />} color="bg-blue-500/10" subtitle={`${compPermits.total || 0} סה״כ`} />
            <KpiCard title="היתרים ממתינים" value={String(compPermits.pending || 0)} icon={<Clock className="w-5 h-5 text-amber-400" />} color="bg-amber-500/10" subtitle="ממתין לאישור" />
            <KpiCard title="עמידת LOTO" value={`${compLoto.complianceRate || 0}%`} icon={<Lock className="w-5 h-5 text-emerald-400" />} color="bg-emerald-500/10" subtitle={`${compLoto.recentCompletions || 0} ביצועים אחרונים`} />
            <KpiCard title="היתרים פגי תוקף" value={String(compPermits.expired || 0)} icon={<ShieldAlert className="w-5 h-5 text-red-400" />} color="bg-red-500/10" />
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            <div className="rounded-xl border border-zinc-700/60 bg-zinc-900/80 p-5">
              <h3 className="text-sm font-semibold text-zinc-100 mb-4">מגמת היתרי עבודה חודשית</h3>
              {monthlyPermits.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={monthlyPermits.map(m => ({ month: String(m.month || ""), total: Number(m.total || 0), closed: Number(m.closed || 0) }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="month" tick={{ fill: "#6b7280", fontSize: 10 }} />
                    <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} />
                    <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #3f3f46", borderRadius: "8px", direction: "rtl" }} />
                    <Bar dataKey="total" fill="#3b82f6" name="סה״כ" />
                    <Bar dataKey="closed" fill="#10b981" name="סגורים" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-zinc-500 text-sm text-center py-8">אין נתוני היתרים</p>
              )}
            </div>

            <div className="rounded-xl border border-zinc-700/60 bg-zinc-900/80 p-5">
              <h3 className="text-sm font-semibold text-zinc-100 mb-4">סטטוס היתרים</h3>
              <div className="space-y-3">
                {Object.entries(PERMIT_STATUS_LABELS).map(([status, label]) => {
                  const count = Number(compPermits[status === "requested" ? "pending" : status === "in_progress" ? "active" : status] || 0);
                  const total = Number(compPermits.total || 1);
                  return (
                    <div key={status}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className={`px-2 py-0.5 rounded-full font-medium ${PERMIT_STATUS_COLORS[status]}`}>{label}</span>
                        <span className="text-zinc-400">{count}</span>
                      </div>
                      <div className="h-1.5 bg-zinc-700 rounded-full">
                        <div className="h-1.5 rounded-full bg-blue-500" style={{ width: `${total > 0 ? (count / total) * 100 : 0}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {recentPermits.length > 0 && (
            <div className="rounded-xl border border-zinc-700/60 bg-zinc-900/80 p-5">
              <h3 className="text-sm font-semibold text-zinc-100 mb-3">היתרים אחרונים</h3>
              <div className="space-y-2">
                {recentPermits.map(p => (
                  <div key={String(p.id)} className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-800/60 border border-zinc-700/40 text-sm">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="font-mono text-xs text-zinc-500">{String(p.permit_number || "")}</span>
                      <span className="text-zinc-300 text-xs">{PERMIT_TYPE_LABELS[String(p.permit_type || "")] || String(p.permit_type || "")}</span>
                      <span className="text-zinc-400 text-xs truncate">{String(p.equipment_name || "—")}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PERMIT_STATUS_COLORS[String(p.status || "requested")]}`}>
                        {PERMIT_STATUS_LABELS[String(p.status || "")] || String(p.status || "")}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {safetySection === "permits" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <FileCheck className="w-4 h-4 text-blue-400" /> היתרי עבודה
            </h3>
            <button onClick={() => setShowPermitForm(!showPermitForm)} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-zinc-100 rounded-lg text-sm font-medium flex items-center gap-2">
              <Plus className="w-4 h-4" /> בקשת היתר חדש
            </button>
          </div>

          {showPermitForm && (
            <div className="rounded-xl border border-zinc-700/60 bg-zinc-900/80 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-zinc-100">בקשת היתר עבודה</h4>
                <button onClick={() => setShowPermitForm(false)}><X className="w-4 h-4 text-zinc-400" /></button>
              </div>
              <div className="grid md:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-zinc-400 block mb-1">סוג היתר *</label>
                  <select value={permitForm.permitType} onChange={e => setPermitForm(f => ({ ...f, permitType: e.target.value }))} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200">
                    {Object.entries(PERMIT_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-zinc-400 block mb-1">ציוד</label>
                  <select value={permitForm.equipmentId} onChange={e => setPermitForm(f => ({ ...f, equipmentId: e.target.value }))} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200">
                    <option value="">— בחר ציוד —</option>
                    {(equipment as Record<string, unknown>[]).map(eq => <option key={String(eq.id)} value={String(eq.id)}>{String(eq.name)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-zinc-400 block mb-1">מבקש *</label>
                  <input value={permitForm.requestedBy} onChange={e => setPermitForm(f => ({ ...f, requestedBy: e.target.value }))} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" />
                </div>
                <div>
                  <label className="text-xs text-zinc-400 block mb-1">תחילת עבודה</label>
                  <input type="datetime-local" value={permitForm.startTime} onChange={e => setPermitForm(f => ({ ...f, startTime: e.target.value }))} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" />
                </div>
                <div>
                  <label className="text-xs text-zinc-400 block mb-1">סיום עבודה</label>
                  <input type="datetime-local" value={permitForm.endTime} onChange={e => setPermitForm(f => ({ ...f, endTime: e.target.value }))} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" />
                </div>
              </div>
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-zinc-400 block mb-1">סכנות</label>
                  <textarea value={permitForm.hazards} onChange={e => setPermitForm(f => ({ ...f, hazards: e.target.value }))} rows={2} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" />
                </div>
                <div>
                  <label className="text-xs text-zinc-400 block mb-1">אמצעי זהירות</label>
                  <textarea value={permitForm.precautions} onChange={e => setPermitForm(f => ({ ...f, precautions: e.target.value }))} rows={2} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowPermitForm(false)} className="px-4 py-2 bg-zinc-700 text-zinc-300 rounded-lg text-sm">ביטול</button>
                <button onClick={() => createPermitMutation.mutate(permitForm)} disabled={createPermitMutation.isPending || !permitForm.requestedBy} className="px-4 py-2 bg-blue-600 text-zinc-100 rounded-lg text-sm font-medium disabled:opacity-50">
                  {createPermitMutation.isPending ? "שולח..." : "שלח בקשה"}
                </button>
              </div>
            </div>
          )}

          <div className="space-y-3">
            {permitsArr.map(p => (
              <div key={String(p.id)} className="rounded-xl border border-zinc-700/60 bg-zinc-900/80 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3 flex-wrap mb-1">
                      <span className="font-mono text-xs text-zinc-500">{String(p.permit_number || "")}</span>
                      <span className="text-sm font-semibold text-zinc-200">{PERMIT_TYPE_LABELS[String(p.permit_type || "")] || String(p.permit_type || "")}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PERMIT_STATUS_COLORS[String(p.status || "requested")]}`}>
                        {PERMIT_STATUS_LABELS[String(p.status || "")] || String(p.status || "")}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-zinc-400 flex-wrap">
                      {p.equipment_name && <span className="flex items-center gap-1"><Cpu className="w-3 h-3" />{String(p.equipment_name)}</span>}
                      <span className="flex items-center gap-1"><Users className="w-3 h-3" />מבקש: {String(p.requested_by || "—")}</span>
                      {p.approved_by && <span className="flex items-center gap-1"><CheckCircle className="w-3 h-3 text-emerald-400" />אישר: {String(p.approved_by)}</span>}
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatDate(String(p.created_at || ""))}</span>
                    </div>
                    {p.hazards && <p className="text-xs text-zinc-500 mt-1">סכנות: {String(p.hazards)}</p>}

                    {approvingId === Number(p.id) && (
                      <div className="mt-2 flex items-center gap-2">
                        <input value={approveBy} onChange={e => setApproveBy(e.target.value)} placeholder="שם קצין בטיחות" className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 flex-1" />
                        <button onClick={() => updatePermitMutation.mutate({ id: Number(p.id), action: "approve", approvedBy: approveBy })} disabled={!approveBy} className="px-3 py-1 bg-emerald-600 text-zinc-100 rounded text-xs disabled:opacity-50">אשר</button>
                        <button onClick={() => setApprovingId(null)} className="px-3 py-1 bg-zinc-700 text-zinc-300 rounded text-xs">ביטול</button>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {String(p.status) === "requested" && (
                      <button onClick={() => setApprovingId(Number(p.id))} className="px-2 py-1 text-xs bg-emerald-500/20 text-emerald-400 rounded border border-emerald-500/30 hover:bg-emerald-500/30">
                        <CheckCircle className="w-3.5 h-3.5 inline ml-1" />אישור
                      </button>
                    )}
                    {String(p.status) === "approved" && (
                      <button onClick={() => updatePermitMutation.mutate({ id: Number(p.id), action: "start" })} className="px-2 py-1 text-xs bg-amber-500/20 text-amber-400 rounded border border-amber-500/30 hover:bg-amber-500/30">
                        <PlayCircle className="w-3.5 h-3.5 inline ml-1" />התחל
                      </button>
                    )}
                    {String(p.status) === "in_progress" && (
                      <button onClick={() => updatePermitMutation.mutate({ id: Number(p.id), action: "close" })} className="px-2 py-1 text-xs bg-zinc-500/20 text-zinc-300 rounded border border-zinc-500/30 hover:bg-zinc-500/30">
                        <XCircle className="w-3.5 h-3.5 inline ml-1" />סגור
                      </button>
                    )}
                    <button onClick={() => { if (confirm("למחוק היתר זה?")) deletePermitMutation.mutate(Number(p.id)); }} className="p-1.5 text-zinc-500 hover:text-red-400 rounded">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {permitsArr.length === 0 && (
              <div className="text-center py-10 text-zinc-500">
                <FileCheck className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p>אין היתרי עבודה</p>
              </div>
            )}
          </div>
        </div>
      )}

      {safetySection === "loto" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <Lock className="w-4 h-4 text-amber-400" /> תבניות נעילה/תיוג (LOTO)
            </h3>
            <div className="flex items-center gap-2">
              <button onClick={() => seedLotoMutation.mutate()} disabled={seedLotoMutation.isPending} className="px-3 py-2 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded-lg text-sm flex items-center gap-2 disabled:opacity-50">
                <RefreshCw className={`w-3.5 h-3.5 ${seedLotoMutation.isPending ? "animate-spin" : ""}`} /> טען תבניות דמו
              </button>
              <button onClick={() => { setEditLoto(null); setLotoForm({ name: "", equipmentCategory: "", notes: "", steps: [] }); setShowLotoForm(true); }} className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-zinc-100 rounded-lg text-sm font-medium flex items-center gap-2">
                <Plus className="w-4 h-4" /> תבנית חדשה
              </button>
            </div>
          </div>

          {showLotoForm && (
            <div className="rounded-xl border border-zinc-700/60 bg-zinc-900/80 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-zinc-100">{editLoto ? "עריכת תבנית LOTO" : "תבנית LOTO חדשה"}</h4>
                <button onClick={() => { setShowLotoForm(false); setEditLoto(null); }}><X className="w-4 h-4 text-zinc-400" /></button>
              </div>
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-zinc-400 block mb-1">שם תבנית *</label>
                  <input value={lotoForm.name} onChange={e => setLotoForm(f => ({ ...f, name: e.target.value }))} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" />
                </div>
                <div>
                  <label className="text-xs text-zinc-400 block mb-1">קטגוריית ציוד</label>
                  <input value={lotoForm.equipmentCategory} onChange={e => setLotoForm(f => ({ ...f, equipmentCategory: e.target.value }))} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" />
                </div>
              </div>
              <div>
                <label className="text-xs text-zinc-400 block mb-2">שלבי נעילה/תיוג</label>
                <div className="space-y-2 mb-2">
                  {lotoForm.steps.map((step, i) => (
                    <div key={i} className="flex items-center gap-2 p-2.5 rounded-lg bg-zinc-800/60 border border-zinc-700/40">
                      <span className="text-xs font-bold text-zinc-500 w-5">{i + 1}.</span>
                      <span className="text-sm text-zinc-300 flex-1">{step.step}</span>
                      <button onClick={() => setLotoForm(f => ({ ...f, steps: f.steps.filter((_, idx) => idx !== i) }))} className="text-zinc-500 hover:text-red-400">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input value={newStep} onChange={e => setNewStep(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && newStep.trim()) { setLotoForm(f => ({ ...f, steps: [...f.steps, { step: newStep.trim(), done: false }] })); setNewStep(""); } }} placeholder="הוסף שלב..." className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200" />
                  <button onClick={() => { if (newStep.trim()) { setLotoForm(f => ({ ...f, steps: [...f.steps, { step: newStep.trim(), done: false }] })); setNewStep(""); } }} className="px-3 py-2 bg-zinc-700 text-zinc-300 rounded-lg text-sm">
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => { setShowLotoForm(false); setEditLoto(null); }} className="px-4 py-2 bg-zinc-700 text-zinc-300 rounded-lg text-sm">ביטול</button>
                <button onClick={() => saveLotoMutation.mutate({ ...lotoForm, id: editLoto ? Number(editLoto.id) : undefined })} disabled={saveLotoMutation.isPending || !lotoForm.name} className="px-4 py-2 bg-amber-600 text-zinc-100 rounded-lg text-sm font-medium disabled:opacity-50">
                  {saveLotoMutation.isPending ? "שומר..." : editLoto ? "עדכן" : "צור"}
                </button>
              </div>
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-4">
            {lotoArr.map(t => {
              let steps: { step: string; done: boolean }[] = [];
              try { steps = typeof t.steps === "string" ? JSON.parse(t.steps) : t.steps || []; } catch { /* ignore */ }
              return (
                <div key={String(t.id)} className="rounded-xl border border-amber-500/20 bg-zinc-900/80 p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h4 className="text-sm font-semibold text-zinc-200">{String(t.name || "")}</h4>
                      {t.equipment_category && <p className="text-xs text-amber-400 mt-0.5">{String(t.equipment_category)}</p>}
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => { setEditLoto(t); setLotoForm({ name: String(t.name || ""), equipmentCategory: String(t.equipment_category || ""), notes: String(t.notes || ""), steps }); setShowLotoForm(true); }} className="p-1.5 text-zinc-400 hover:text-zinc-200 rounded">
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => { if (confirm("למחוק תבנית זו?")) deleteLotoMutation.mutate(Number(t.id)); }} className="p-1.5 text-zinc-400 hover:text-red-400 rounded">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    {steps.map((step, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs">
                        <span className="text-amber-500 font-bold w-4 shrink-0">{i + 1}.</span>
                        <span className="text-zinc-400">{step.step}</span>
                      </div>
                    ))}
                    {steps.length === 0 && <p className="text-zinc-600 text-xs">אין שלבים מוגדרים</p>}
                  </div>
                  <div className="mt-3 pt-3 border-t border-zinc-700/40 flex items-center justify-between text-xs">
                    <span className="text-zinc-500">{steps.length} שלבים</span>
                    <span className="text-zinc-600">{formatDate(String(t.updated_at || t.created_at || ""))}</span>
                  </div>
                </div>
              );
            })}
            {lotoArr.length === 0 && (
              <div className="col-span-2 text-center py-10 text-zinc-500">
                <Lock className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p>אין תבניות LOTO. לחץ "טען תבניות דמו" להוספה.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
