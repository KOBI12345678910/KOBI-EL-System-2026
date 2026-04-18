import { useState, useEffect, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Search, Wrench, Plus, Edit2, X, Download, RefreshCw, Eye, AlertTriangle,
  CheckCircle, Clock, Settings, Activity, TrendingUp, Loader2, Trash2, Save,
  ArrowLeftRight, Truck, Shield, Gauge, Calendar, BarChart3, Package, Zap
} from "lucide-react";
import { authFetch } from "@/lib/utils";

const API = "/api/equipment";
const safeArr = (d: any) => (Array.isArray(d) ? d : d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL");
const fmtCur = (v: any) => Number(v || 0).toLocaleString("he-IL", { minimumFractionDigits: 0 });

const categoryMap: Record<string, { label: string; icon: string }> = {
  machine: { label: "מכונה", icon: "bg-blue-500/20 text-blue-400" },
  power_tool: { label: "כלי חשמלי", icon: "bg-yellow-500/20 text-yellow-400" },
  hand_tool: { label: "כלי יד", icon: "bg-green-500/20 text-green-400" },
  welding_equipment: { label: "ציוד ריתוך", icon: "bg-orange-500/20 text-orange-400" },
  cutting_tool: { label: "כלי חיתוך", icon: "bg-red-500/20 text-red-400" },
  measuring_instrument: { label: "מכשיר מדידה", icon: "bg-cyan-500/20 text-cyan-400" },
  safety_equipment: { label: "ציוד בטיחות", icon: "bg-emerald-500/20 text-emerald-400" },
  vehicle: { label: "רכב", icon: "bg-indigo-500/20 text-indigo-400" },
  crane: { label: "מנוף", icon: "bg-purple-500/20 text-purple-400" },
  forklift: { label: "מלגזה", icon: "bg-pink-500/20 text-pink-400" },
  compressor: { label: "מדחס", icon: "bg-teal-500/20 text-teal-400" },
  generator: { label: "גנרטור", icon: "bg-amber-500/20 text-amber-400" },
};

const statusMap: Record<string, { label: string; color: string }> = {
  available: { label: "זמין", color: "bg-green-500/20 text-green-400" },
  in_use: { label: "בשימוש", color: "bg-blue-500/20 text-blue-400" },
  maintenance: { label: "בתחזוקה", color: "bg-yellow-500/20 text-yellow-400" },
  calibration: { label: "בכיול", color: "bg-cyan-500/20 text-cyan-400" },
  retired: { label: "הושבת", color: "bg-gray-500/20 text-gray-400" },
  lost: { label: "אבד", color: "bg-red-500/20 text-red-400" },
};

const conditionMap: Record<string, { label: string; color: string }> = {
  excellent: { label: "מצוין", color: "bg-green-500/20 text-green-400" },
  good: { label: "טוב", color: "bg-blue-500/20 text-blue-400" },
  fair: { label: "סביר", color: "bg-yellow-500/20 text-yellow-400" },
  poor: { label: "גרוע", color: "bg-orange-500/20 text-orange-400" },
  broken: { label: "שבור", color: "bg-red-500/20 text-red-400" },
};

const tabs = [
  { id: "dashboard", label: "לוח בקרה", icon: BarChart3 },
  { id: "registry", label: "רישום ציוד", icon: Package },
  { id: "checkouts", label: "השאלות", icon: ArrowLeftRight },
  { id: "maintenance", label: "תחזוקה", icon: Wrench },
  { id: "calibration", label: "כיול", icon: Gauge },
];

export default function ToolEquipmentPage() {
  const [tab, setTab] = useState("dashboard");
  const [items, setItems] = useState<any[]>([]);
  const [dashboard, setDashboard] = useState<any>({});
  const [checkouts, setCheckouts] = useState<any[]>([]);
  const [maintenance, setMaintenance] = useState<any[]>([]);
  const [calibrations, setCalibrations] = useState<any[]>([]);
  const [overdue, setOverdue] = useState<any[]>([]);
  const [maintDue, setMaintDue] = useState<any[]>([]);
  const [calDue, setCalDue] = useState<any[]>([]);
  const [utilization, setUtilization] = useState<any>({});
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [showMaintForm, setShowMaintForm] = useState(false);
  const [showCalForm, setShowCalForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({});

  const load = async () => {
    setLoading(true);
    try {
      const [eq, dash, co, mnt, cal, od, md, cd, ut] = await Promise.all([
        authFetch(API).then(r => r.json()),
        authFetch(`${API}/dashboard`).then(r => r.json()),
        authFetch(`${API}/checkouts/active`).then(r => r.json()),
        authFetch(`${API}/maintenance`).then(r => r.json()),
        authFetch(`${API}/calibration`).then(r => r.json()),
        authFetch(`${API}/overdue-returns`).then(r => r.json()),
        authFetch(`${API}/maintenance-due`).then(r => r.json()),
        authFetch(`${API}/calibration-due`).then(r => r.json()),
        authFetch(`${API}/utilization-report`).then(r => r.json()),
      ]);
      setItems(safeArr(eq)); setDashboard(dash); setCheckouts(safeArr(co));
      setMaintenance(safeArr(mnt)); setCalibrations(safeArr(cal));
      setOverdue(safeArr(od)); setMaintDue(safeArr(md)); setCalDue(safeArr(cd));
      setUtilization(ut);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => items.filter(i => {
    if (search && !`${i.name} ${i.asset_code} ${i.brand}`.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterCat && i.category !== filterCat) return false;
    if (filterStatus && i.status !== filterStatus) return false;
    return true;
  }), [items, search, filterCat, filterStatus]);

  const saveEquipment = async () => {
    const method = editing?.id ? "PUT" : "POST";
    const url = editing?.id ? `${API}/${editing.id}` : API;
    await authFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setShowForm(false); setEditing(null); setForm({}); load();
  };

  const doCheckout = async () => {
    await authFetch(`${API}/checkout`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setShowCheckout(false); setForm({}); load();
  };

  const doReturn = async (checkoutId: number) => {
    await authFetch(`${API}/return/${checkoutId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ condition_at_return: "good" }) });
    load();
  };

  const saveMaint = async () => {
    const method = editing?.id ? "PUT" : "POST";
    const url = editing?.id ? `${API}/maintenance/${editing.id}` : `${API}/maintenance`;
    await authFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setShowMaintForm(false); setEditing(null); setForm({}); load();
  };

  const saveCal = async () => {
    const method = editing?.id ? "PUT" : "POST";
    const url = editing?.id ? `${API}/calibration/${editing.id}` : `${API}/calibration`;
    await authFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setShowCalForm(false); setEditing(null); setForm({}); load();
  };

  const del = async (id: number) => {
    await authFetch(`${API}/${id}`, { method: "DELETE" }); load();
  };

  const s = dashboard.summary || {};

  return (
    <div dir="rtl" className="p-6 space-y-6 bg-gradient-to-br from-[#0a0a1a] to-[#1a1a3a] min-h-screen text-white">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-l from-blue-400 to-cyan-400 bg-clip-text text-transparent">
            ניהול כלים, מכונות וציוד
          </h1>
          <p className="text-gray-400 mt-1">מעקב ציוד, השאלות, תחזוקה וכיול - מפעל מתכת</p>
        </div>
        <Button onClick={load} variant="outline" size="sm" className="border-gray-700">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          <span className="mr-2">רענון</span>
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto">
        {tabs.map(t => (
          <Button key={t.id} variant={tab === t.id ? "default" : "outline"} size="sm"
            className={tab === t.id ? "bg-blue-600" : "border-gray-700 text-gray-300"}
            onClick={() => setTab(t.id)}>
            <t.icon className="w-4 h-4 ml-1" /> {t.label}
          </Button>
        ))}
      </div>

      {/* ═══ DASHBOARD ═══ */}
      {tab === "dashboard" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
            {[
              { label: "סה\"כ ציוד", val: s.total, color: "text-white", icon: Package },
              { label: "זמין", val: s.available, color: "text-green-400", icon: CheckCircle },
              { label: "בשימוש", val: s.in_use, color: "text-blue-400", icon: Activity },
              { label: "בתחזוקה", val: s.in_maintenance, color: "text-yellow-400", icon: Wrench },
              { label: "החזרות באיחור", val: dashboard.overdue_returns, color: "text-red-400", icon: AlertTriangle },
              { label: "תחזוקה קרובה", val: dashboard.maintenance_due, color: "text-orange-400", icon: Calendar },
              { label: "כיול קרוב", val: dashboard.calibration_due, color: "text-cyan-400", icon: Gauge },
              { label: "שבורים", val: s.broken, color: "text-red-400", icon: X },
            ].map((c, i) => (
              <Card key={i} className="bg-white/5 border-white/10">
                <CardContent className="p-3 text-center">
                  <c.icon className={`w-5 h-5 mx-auto mb-1 ${c.color}`} />
                  <div className={`text-2xl font-bold ${c.color}`}>{fmt(c.val)}</div>
                  <div className="text-xs text-gray-400">{c.label}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Utilization */}
          <div className="grid md:grid-cols-2 gap-4">
            <Card className="bg-white/5 border-white/10">
              <CardContent className="p-4">
                <h3 className="font-semibold text-lg mb-3 flex items-center gap-2"><TrendingUp className="w-5 h-5 text-green-400" /> ניצולת ציוד</h3>
                <div className="text-4xl font-bold text-green-400 mb-2">{utilization.utilization_rate || 0}%</div>
                <div className="w-full bg-gray-700 rounded-full h-3 mb-3">
                  <div className="bg-green-500 rounded-full h-3 transition-all" style={{ width: `${utilization.utilization_rate || 0}%` }} />
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><span className="text-gray-400">עלות רכישה כוללת:</span> <span className="text-white font-semibold">{fmtCur(utilization.total_purchase_cost)} &#8362;</span></div>
                  <div><span className="text-gray-400">שווי נוכחי:</span> <span className="text-white font-semibold">{fmtCur(utilization.total_current_value)} &#8362;</span></div>
                  <div><span className="text-gray-400">ממוצע ימי השאלה:</span> <span className="text-white font-semibold">{utilization.avg_checkout_days || 0}</span></div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-white/5 border-white/10">
              <CardContent className="p-4">
                <h3 className="font-semibold text-lg mb-3 flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-red-400" /> התראות</h3>
                <div className="space-y-2">
                  {overdue.length > 0 && overdue.map((o: any, i: number) => (
                    <div key={i} className="flex justify-between items-center bg-red-500/10 rounded p-2 text-sm">
                      <span className="text-red-300">{o.equipment_name} - {o.checked_out_by_name}</span>
                      <Badge className="bg-red-500/20 text-red-400">איחור</Badge>
                    </div>
                  ))}
                  {maintDue.map((m: any, i: number) => (
                    <div key={`m${i}`} className="flex justify-between items-center bg-yellow-500/10 rounded p-2 text-sm">
                      <span className="text-yellow-300">{m.name} - תחזוקה</span>
                      <Badge className="bg-yellow-500/20 text-yellow-400">בקרוב</Badge>
                    </div>
                  ))}
                  {calDue.map((c: any, i: number) => (
                    <div key={`c${i}`} className="flex justify-between items-center bg-cyan-500/10 rounded p-2 text-sm">
                      <span className="text-cyan-300">{c.name} - כיול</span>
                      <Badge className="bg-cyan-500/20 text-cyan-400">נדרש</Badge>
                    </div>
                  ))}
                  {overdue.length === 0 && maintDue.length === 0 && calDue.length === 0 && (
                    <div className="text-center text-gray-500 py-4">אין התראות פעילות</div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Category breakdown */}
          {utilization.by_category && (
            <Card className="bg-white/5 border-white/10">
              <CardContent className="p-4">
                <h3 className="font-semibold text-lg mb-3">פירוט לפי קטגוריה</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {safeArr(utilization.by_category).map((c: any, i: number) => (
                    <div key={i} className="bg-white/5 rounded p-2 text-sm">
                      <div className="font-semibold">{categoryMap[c.category]?.label || c.category}</div>
                      <div className="text-gray-400">סה"כ: {c.count} | בשימוש: {c.in_use}</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ═══ REGISTRY ═══ */}
      {tab === "registry" && (
        <div className="space-y-4">
          <div className="flex gap-3 flex-wrap items-end">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute right-3 top-2.5 w-4 h-4 text-gray-400" />
              <Input className="pr-10 bg-white/5 border-white/10" placeholder="חיפוש ציוד..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <select className="bg-white/5 border border-white/10 rounded px-3 py-2 text-sm" value={filterCat} onChange={e => setFilterCat(e.target.value)}>
              <option value="">כל הקטגוריות</option>
              {Object.entries(categoryMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <select className="bg-white/5 border border-white/10 rounded px-3 py-2 text-sm" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="">כל הסטטוסים</option>
              {Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <Button onClick={() => { setEditing(null); setForm({}); setShowForm(true); }} className="bg-blue-600 hover:bg-blue-700">
              <Plus className="w-4 h-4 ml-1" /> ציוד חדש
            </Button>
          </div>

          <div className="text-sm text-gray-400">{filtered.length} פריטים</div>

          <div className="grid gap-3">
            {filtered.map((item: any) => (
              <Card key={item.id} className="bg-white/5 border-white/10 hover:bg-white/8 transition">
                <CardContent className="p-4">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-bold text-lg">{item.name}</span>
                        <Badge className={categoryMap[item.category]?.icon || "bg-gray-500/20"}>{categoryMap[item.category]?.label || item.category}</Badge>
                        <Badge className={statusMap[item.status]?.color || "bg-gray-500/20"}>{statusMap[item.status]?.label || item.status}</Badge>
                        <Badge className={conditionMap[item.condition]?.color || "bg-gray-500/20"}>{conditionMap[item.condition]?.label || item.condition}</Badge>
                      </div>
                      <div className="text-sm text-gray-400 flex gap-4 flex-wrap">
                        <span>קוד: {item.asset_code}</span>
                        <span>מותג: {item.brand} {item.model}</span>
                        <span>מיקום: {item.location}</span>
                        <span>מחלקה: {item.assigned_to_department}</span>
                        {item.purchase_cost > 0 && <span>עלות: {fmtCur(item.purchase_cost)} &#8362;</span>}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      {item.status === "available" && (
                        <Button size="sm" variant="outline" className="border-green-500/30 text-green-400 text-xs"
                          onClick={() => { setForm({ equipment_id: item.id }); setShowCheckout(true); }}>
                          <ArrowLeftRight className="w-3 h-3 ml-1" /> השאלה
                        </Button>
                      )}
                      <Button size="sm" variant="outline" className="border-white/20 text-xs"
                        onClick={() => { setEditing(item); setForm(item); setShowForm(true); }}>
                        <Edit2 className="w-3 h-3" />
                      </Button>
                      <Button size="sm" variant="outline" className="border-red-500/30 text-red-400 text-xs"
                        onClick={() => del(item.id)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ═══ CHECKOUTS ═══ */}
      {tab === "checkouts" && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold flex items-center gap-2"><ArrowLeftRight className="w-5 h-5 text-blue-400" /> השאלות פעילות</h2>
          {checkouts.length === 0 ? (
            <div className="text-center text-gray-500 py-10">אין השאלות פעילות</div>
          ) : (
            <div className="grid gap-3">
              {checkouts.map((c: any) => (
                <Card key={c.id} className="bg-white/5 border-white/10">
                  <CardContent className="p-4 flex justify-between items-center">
                    <div>
                      <div className="font-semibold">{c.equipment_name} ({c.asset_code})</div>
                      <div className="text-sm text-gray-400">
                        הושאל ל: {c.checked_out_by_name} | פרויקט: {c.project_name || "-"}
                        | תאריך: {c.checkout_date?.split("T")[0]} | החזרה צפויה: {c.expected_return?.split("T")[0] || "-"}
                      </div>
                    </div>
                    <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => doReturn(c.id)}>
                      <CheckCircle className="w-4 h-4 ml-1" /> החזרה
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          {overdue.length > 0 && (
            <>
              <h2 className="text-xl font-semibold flex items-center gap-2 text-red-400"><AlertTriangle className="w-5 h-5" /> החזרות באיחור</h2>
              <div className="grid gap-3">
                {overdue.map((o: any) => (
                  <Card key={o.id} className="bg-red-500/5 border-red-500/20">
                    <CardContent className="p-4 flex justify-between items-center">
                      <div>
                        <div className="font-semibold text-red-300">{o.equipment_name}</div>
                        <div className="text-sm text-gray-400">{o.checked_out_by_name} | צפוי: {o.expected_return?.split("T")[0]}</div>
                      </div>
                      <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => doReturn(o.id)}>החזרה</Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ═══ MAINTENANCE ═══ */}
      {tab === "maintenance" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold flex items-center gap-2"><Wrench className="w-5 h-5 text-yellow-400" /> יומן תחזוקה</h2>
            <Button onClick={() => { setEditing(null); setForm({}); setShowMaintForm(true); }} className="bg-yellow-600 hover:bg-yellow-700">
              <Plus className="w-4 h-4 ml-1" /> תחזוקה חדשה
            </Button>
          </div>
          <div className="grid gap-3">
            {maintenance.map((m: any) => (
              <Card key={m.id} className="bg-white/5 border-white/10">
                <CardContent className="p-4 flex justify-between items-center">
                  <div>
                    <div className="font-semibold">{m.equipment_name} ({m.asset_code})</div>
                    <div className="text-sm text-gray-400">
                      סוג: {m.maintenance_type} | ביצוע: {m.performed_by || "-"} | עלות: {fmtCur(m.cost)} &#8362;
                      | זמן השבתה: {m.downtime_hours || 0} שעות
                    </div>
                    {m.description && <div className="text-xs text-gray-500 mt-1">{m.description}</div>}
                  </div>
                  <Badge className={m.status === "completed" ? "bg-green-500/20 text-green-400" : m.status === "in_progress" ? "bg-yellow-500/20 text-yellow-400" : "bg-gray-500/20 text-gray-400"}>
                    {m.status === "completed" ? "הושלם" : m.status === "in_progress" ? "בביצוע" : "מתוכנן"}
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ═══ CALIBRATION ═══ */}
      {tab === "calibration" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold flex items-center gap-2"><Gauge className="w-5 h-5 text-cyan-400" /> רישום כיולים</h2>
            <Button onClick={() => { setEditing(null); setForm({}); setShowCalForm(true); }} className="bg-cyan-600 hover:bg-cyan-700">
              <Plus className="w-4 h-4 ml-1" /> כיול חדש
            </Button>
          </div>
          {calDue.length > 0 && (
            <Card className="bg-cyan-500/5 border-cyan-500/20">
              <CardContent className="p-3">
                <div className="text-sm font-semibold text-cyan-300 mb-1">ציוד הדורש כיול קרוב:</div>
                {calDue.map((c: any, i: number) => (
                  <div key={i} className="text-sm text-gray-400">{c.name} - כיול עד {c.calibration_due}</div>
                ))}
              </CardContent>
            </Card>
          )}
          <div className="grid gap-3">
            {calibrations.map((c: any) => (
              <Card key={c.id} className="bg-white/5 border-white/10">
                <CardContent className="p-4 flex justify-between items-center">
                  <div>
                    <div className="font-semibold">{c.equipment_name} ({c.asset_code})</div>
                    <div className="text-sm text-gray-400">
                      תאריך: {c.calibration_date} | ביצוע: {c.performed_by || "-"} | תעודה: {c.certificate_number || "-"}
                    </div>
                  </div>
                  <Badge className={c.result === "pass" ? "bg-green-500/20 text-green-400" : c.result === "adjusted" ? "bg-yellow-500/20 text-yellow-400" : "bg-red-500/20 text-red-400"}>
                    {c.result === "pass" ? "עבר" : c.result === "adjusted" ? "כוונן" : "נכשל"}
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ═══ EQUIPMENT FORM MODAL ═══ */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <Card className="bg-[#1a1a3a] border-white/10 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <CardContent className="p-6 space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold">{editing?.id ? "עריכת ציוד" : "ציוד חדש"}</h3>
                <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}><X className="w-4 h-4" /></Button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>קוד נכס</Label><Input className="bg-white/5 border-white/10" value={form.asset_code || ""} onChange={e => setForm({ ...form, asset_code: e.target.value })} /></div>
                <div><Label>שם</Label><Input className="bg-white/5 border-white/10" value={form.name || ""} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
                <div><Label>קטגוריה</Label>
                  <select className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm" value={form.category || ""} onChange={e => setForm({ ...form, category: e.target.value })}>
                    <option value="">בחר</option>
                    {Object.entries(categoryMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div><Label>מותג</Label><Input className="bg-white/5 border-white/10" value={form.brand || ""} onChange={e => setForm({ ...form, brand: e.target.value })} /></div>
                <div><Label>דגם</Label><Input className="bg-white/5 border-white/10" value={form.model || ""} onChange={e => setForm({ ...form, model: e.target.value })} /></div>
                <div><Label>מס' סידורי</Label><Input className="bg-white/5 border-white/10" value={form.serial_number || ""} onChange={e => setForm({ ...form, serial_number: e.target.value })} /></div>
                <div><Label>עלות רכישה</Label><Input type="number" className="bg-white/5 border-white/10" value={form.purchase_cost || ""} onChange={e => setForm({ ...form, purchase_cost: e.target.value })} /></div>
                <div><Label>מיקום</Label>
                  <select className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm" value={form.location || ""} onChange={e => setForm({ ...form, location: e.target.value })}>
                    {["workshop","yard","warehouse","field","maintenance"].map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
                <div><Label>מחלקה</Label><Input className="bg-white/5 border-white/10" value={form.assigned_to_department || ""} onChange={e => setForm({ ...form, assigned_to_department: e.target.value })} /></div>
                <div><Label>מצב</Label>
                  <select className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm" value={form.condition || "good"} onChange={e => setForm({ ...form, condition: e.target.value })}>
                    {Object.entries(conditionMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-2 pt-6">
                  <input type="checkbox" checked={form.calibration_required || false} onChange={e => setForm({ ...form, calibration_required: e.target.checked })} />
                  <Label>דורש כיול</Label>
                </div>
              </div>
              <div><Label>הערות</Label><Input className="bg-white/5 border-white/10" value={form.notes || ""} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
              <Button onClick={saveEquipment} className="w-full bg-blue-600 hover:bg-blue-700"><Save className="w-4 h-4 ml-1" /> שמירה</Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* CHECKOUT MODAL */}
      {showCheckout && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <Card className="bg-[#1a1a3a] border-white/10 w-full max-w-md">
            <CardContent className="p-6 space-y-4">
              <div className="flex justify-between"><h3 className="text-xl font-bold">השאלת ציוד</h3><Button size="sm" variant="ghost" onClick={() => setShowCheckout(false)}><X className="w-4 h-4" /></Button></div>
              <div><Label>שם המשאיל</Label><Input className="bg-white/5 border-white/10" value={form.checked_out_by_name || ""} onChange={e => setForm({ ...form, checked_out_by_name: e.target.value })} /></div>
              <div><Label>שם פרויקט</Label><Input className="bg-white/5 border-white/10" value={form.project_name || ""} onChange={e => setForm({ ...form, project_name: e.target.value })} /></div>
              <div><Label>תאריך החזרה צפוי</Label><Input type="date" className="bg-white/5 border-white/10" value={form.expected_return || ""} onChange={e => setForm({ ...form, expected_return: e.target.value })} /></div>
              <Button onClick={doCheckout} className="w-full bg-green-600 hover:bg-green-700"><ArrowLeftRight className="w-4 h-4 ml-1" /> בצע השאלה</Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* MAINTENANCE FORM MODAL */}
      {showMaintForm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <Card className="bg-[#1a1a3a] border-white/10 w-full max-w-md">
            <CardContent className="p-6 space-y-4">
              <div className="flex justify-between"><h3 className="text-xl font-bold">תחזוקה חדשה</h3><Button size="sm" variant="ghost" onClick={() => setShowMaintForm(false)}><X className="w-4 h-4" /></Button></div>
              <div><Label>ציוד</Label>
                <select className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm" value={form.equipment_id || ""} onChange={e => setForm({ ...form, equipment_id: e.target.value })}>
                  <option value="">בחר ציוד</option>
                  {items.map(i => <option key={i.id} value={i.id}>{i.name} ({i.asset_code})</option>)}
                </select>
              </div>
              <div><Label>סוג תחזוקה</Label>
                <select className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm" value={form.maintenance_type || ""} onChange={e => setForm({ ...form, maintenance_type: e.target.value })}>
                  <option value="">בחר</option>
                  <option value="preventive">מונעת</option>
                  <option value="corrective">מתקנת</option>
                  <option value="emergency">חירום</option>
                  <option value="calibration">כיול</option>
                </select>
              </div>
              <div><Label>תיאור</Label><Input className="bg-white/5 border-white/10" value={form.description || ""} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
              <div><Label>מבצע</Label><Input className="bg-white/5 border-white/10" value={form.performed_by || ""} onChange={e => setForm({ ...form, performed_by: e.target.value })} /></div>
              <div><Label>עלות</Label><Input type="number" className="bg-white/5 border-white/10" value={form.cost || ""} onChange={e => setForm({ ...form, cost: e.target.value })} /></div>
              <div><Label>סטטוס</Label>
                <select className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm" value={form.status || "scheduled"} onChange={e => setForm({ ...form, status: e.target.value })}>
                  <option value="scheduled">מתוכנן</option>
                  <option value="in_progress">בביצוע</option>
                  <option value="completed">הושלם</option>
                </select>
              </div>
              <Button onClick={saveMaint} className="w-full bg-yellow-600 hover:bg-yellow-700"><Save className="w-4 h-4 ml-1" /> שמירה</Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* CALIBRATION FORM MODAL */}
      {showCalForm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <Card className="bg-[#1a1a3a] border-white/10 w-full max-w-md">
            <CardContent className="p-6 space-y-4">
              <div className="flex justify-between"><h3 className="text-xl font-bold">כיול חדש</h3><Button size="sm" variant="ghost" onClick={() => setShowCalForm(false)}><X className="w-4 h-4" /></Button></div>
              <div><Label>ציוד</Label>
                <select className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm" value={form.equipment_id || ""} onChange={e => setForm({ ...form, equipment_id: e.target.value })}>
                  <option value="">בחר ציוד</option>
                  {items.filter(i => i.calibration_required).map(i => <option key={i.id} value={i.id}>{i.name} ({i.asset_code})</option>)}
                </select>
              </div>
              <div><Label>תאריך כיול</Label><Input type="date" className="bg-white/5 border-white/10" value={form.calibration_date || ""} onChange={e => setForm({ ...form, calibration_date: e.target.value })} /></div>
              <div><Label>מבצע</Label><Input className="bg-white/5 border-white/10" value={form.performed_by || ""} onChange={e => setForm({ ...form, performed_by: e.target.value })} /></div>
              <div><Label>מספר תעודה</Label><Input className="bg-white/5 border-white/10" value={form.certificate_number || ""} onChange={e => setForm({ ...form, certificate_number: e.target.value })} /></div>
              <div><Label>תוצאה</Label>
                <select className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm" value={form.result || ""} onChange={e => setForm({ ...form, result: e.target.value })}>
                  <option value="">בחר</option>
                  <option value="pass">עבר</option>
                  <option value="fail">נכשל</option>
                  <option value="adjusted">כוונן</option>
                </select>
              </div>
              <div><Label>כיול הבא</Label><Input type="date" className="bg-white/5 border-white/10" value={form.next_calibration || ""} onChange={e => setForm({ ...form, next_calibration: e.target.value })} /></div>
              <Button onClick={saveCal} className="w-full bg-cyan-600 hover:bg-cyan-700"><Save className="w-4 h-4 ml-1" /> שמירה</Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
