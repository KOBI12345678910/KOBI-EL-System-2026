import { useState, useEffect, useCallback } from "react";
import {
  Calculator, Plus, Trash2, RefreshCw, Target, TrendingUp, TrendingDown,
  DollarSign, BarChart3, Eye, Lightbulb, GitCompare, Layers, Package,
  Users, Truck, Search, Gauge
} from "lucide-react";
import { authFetch } from "@/lib/utils";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid
} from "recharts";

const API = "/api/project-cost";
const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4"];

interface Sheet {
  id: number;
  project_name: string;
  customer_name: string;
  total_selling_price: string;
  total_selling_price_vat: string;
  total_meters: string;
  price_per_meter: string;
  total_cost: string;
  gross_profit: string;
  gross_margin_pct: number;
  target_margin_pct: number;
  margin_status: string;
  status: string;
}

export default function ProjectCostCalculator() {
  const [tab, setTab] = useState<"dashboard" | "sheets" | "builder">("dashboard");
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [dashboard, setDashboard] = useState<any>(null);
  const [selectedSheet, setSelectedSheet] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [labor, setLabor] = useState<any[]>([]);
  const [overhead, setOverhead] = useState<any[]>([]);
  const [scenarios, setScenarios] = useState<any[]>([]);
  const [breakdown, setBreakdown] = useState<any>(null);
  const [laborComparison, setLaborComparison] = useState<any>(null);
  const [optimizeSuggestions, setOptimizeSuggestions] = useState<any>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<any>({});
  const [addItemForm, setAddItemForm] = useState<any>({});
  const [addLaborForm, setAddLaborForm] = useState<any>({});
  const [addOverheadForm, setAddOverheadForm] = useState<any>({});
  const [showAddItem, setShowAddItem] = useState(false);
  const [showAddLabor, setShowAddLabor] = useState(false);
  const [showAddOverhead, setShowAddOverhead] = useState(false);
  const [scenarioForm, setScenarioForm] = useState<any>({});
  const [showScenario, setShowScenario] = useState(false);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  const fmt = (n: any) => Number(n || 0).toLocaleString("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 });

  const loadSheets = useCallback(async () => {
    try {
      const r = await authFetch(`${API}/sheets?search=${search}`);
      const d = await r.json();
      setSheets(d.sheets || []);
    } catch { /* */ }
  }, [search]);

  const loadDashboard = useCallback(async () => {
    try {
      const r = await authFetch(`${API}/dashboard`);
      setDashboard(await r.json());
    } catch { /* */ }
  }, []);

  useEffect(() => { loadSheets(); loadDashboard(); }, [loadSheets, loadDashboard]);

  const selectSheet = async (id: number) => {
    try {
      const [sheetR, breakdownR, compareR] = await Promise.all([
        authFetch(`${API}/sheets/${id}`),
        authFetch(`${API}/sheets/${id}/breakdown`),
        authFetch(`${API}/compare-labor-models/${id}`),
      ]);
      const [sheetD, breakdownD, compareD] = await Promise.all([sheetR.json(), breakdownR.json(), compareR.json()]);
      setSelectedSheet(sheetD.sheet);
      setItems(sheetD.items || []);
      setLabor(sheetD.labor || []);
      setOverhead(sheetD.overhead || []);
      setScenarios(sheetD.scenarios || []);
      setBreakdown(breakdownD);
      setLaborComparison(compareD);
      setTab("builder");
    } catch { /* */ }
  };

  const createSheet = async () => {
    try {
      const r = await authFetch(`${API}/sheets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createForm),
      });
      const d = await r.json();
      setShowCreate(false);
      setCreateForm({});
      loadSheets();
      if (d.sheet) selectSheet(d.sheet.id);
    } catch { /* */ }
  };

  const recalculate = async () => {
    if (!selectedSheet) return;
    setLoading(true);
    try {
      await authFetch(`${API}/sheets/${selectedSheet.id}/calculate`, { method: "POST" });
      await selectSheet(selectedSheet.id);
    } catch { /* */ }
    setLoading(false);
  };

  const addItem = async () => {
    if (!selectedSheet) return;
    try {
      await authFetch(`${API}/sheets/${selectedSheet.id}/add-item`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(addItemForm),
      });
      setAddItemForm({});
      setShowAddItem(false);
      await recalculate();
    } catch { /* */ }
  };

  const addLaborEntry = async () => {
    if (!selectedSheet) return;
    try {
      await authFetch(`${API}/sheets/${selectedSheet.id}/add-labor`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(addLaborForm),
      });
      setAddLaborForm({});
      setShowAddLabor(false);
      await recalculate();
    } catch { /* */ }
  };

  const addOverheadEntry = async () => {
    if (!selectedSheet) return;
    try {
      await authFetch(`${API}/sheets/${selectedSheet.id}/add-overhead`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(addOverheadForm),
      });
      setAddOverheadForm({});
      setShowAddOverhead(false);
      await recalculate();
    } catch { /* */ }
  };

  const createScenario = async () => {
    if (!selectedSheet) return;
    try {
      await authFetch(`${API}/sheets/${selectedSheet.id}/scenario`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenario_name: scenarioForm.name,
          changes: {
            selling_change_pct: scenarioForm.selling_change_pct,
            cost_change_pct: scenarioForm.cost_change_pct,
            cost_change_abs: scenarioForm.cost_change_abs,
          },
        }),
      });
      setScenarioForm({});
      setShowScenario(false);
      await selectSheet(selectedSheet.id);
    } catch { /* */ }
  };

  const optimize = async () => {
    if (!selectedSheet) return;
    try {
      const r = await authFetch(`${API}/sheets/${selectedSheet.id}/optimize`, { method: "POST" });
      setOptimizeSuggestions(await r.json());
    } catch { /* */ }
  };

  const marginColor = (status: string) => {
    switch (status) {
      case "above_target": return "text-green-600 bg-green-50 border-green-200";
      case "on_target": return "text-blue-600 bg-blue-50 border-blue-200";
      case "below_target": return "text-yellow-600 bg-yellow-50 border-yellow-200";
      case "negative": return "text-red-600 bg-red-50 border-red-200";
      default: return "text-gray-600 bg-gray-50 border-gray-200";
    }
  };

  const marginLabel = (status: string) => {
    switch (status) {
      case "above_target": return "מעל יעד";
      case "on_target": return "ביעד";
      case "below_target": return "מתחת ליעד";
      case "negative": return "שלילי";
      default: return status;
    }
  };

  return (
    <div dir="rtl" className="p-4 space-y-4 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">מחשבון תמחור פרויקט</h1>
          <p className="text-sm text-gray-500">חישוב עלויות, רווחיות ותרחישים לכל פרויקט</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowCreate(true)} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">
            + גיליון חדש
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white rounded-lg p-1 border shadow-sm w-fit">
        {[
          { key: "dashboard", label: "דשבורד", icon: <BarChart3 className="w-4 h-4" /> },
          { key: "sheets", label: "גיליונות", icon: <Layers className="w-4 h-4" /> },
          { key: "builder", label: "בונה תמחור", icon: <Calculator className="w-4 h-4" /> },
        ].map((t) => (
          <button key={t.key} onClick={() => setTab(t.key as any)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition ${tab === t.key ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-100"}`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Dashboard */}
      {tab === "dashboard" && dashboard && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "ממוצע מרווח", value: `${Number(dashboard.summary.avg_margin || 0).toFixed(0)}%`, icon: <Target className="w-5 h-5" />, color: "blue" },
              { label: "רווח כולל", value: fmt(dashboard.summary.total_profit), icon: <DollarSign className="w-5 h-5" />, color: "green" },
              { label: "מעל יעד", value: dashboard.summary.above_target, icon: <TrendingUp className="w-5 h-5" />, color: "emerald" },
              { label: "שלילי", value: dashboard.summary.negative, icon: <TrendingDown className="w-5 h-5" />, color: "red" },
            ].map((kpi, i) => (
              <div key={i} className="bg-white rounded-xl border p-4 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-500">{kpi.label}</span>
                  <div className={`text-${kpi.color}-600`}>{kpi.icon}</div>
                </div>
                <div className="text-2xl font-bold text-gray-800">{kpi.value}</div>
              </div>
            ))}
          </div>

          {/* Margin distribution */}
          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border p-4 shadow-sm">
              <h3 className="font-semibold mb-3">התפלגות מרווח</h3>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={[
                    { name: "מעל יעד", value: Number(dashboard.summary.above_target) },
                    { name: "ביעד", value: Number(dashboard.summary.on_target) },
                    { name: "מתחת ליעד", value: Number(dashboard.summary.below_target) },
                    { name: "שלילי", value: Number(dashboard.summary.negative) },
                  ].filter((d) => d.value > 0)} cx="50%" cy="50%" outerRadius={80} dataKey="value" label>
                    {[0, 1, 2, 3].map((i) => <Cell key={i} fill={["#10b981", "#3b82f6", "#f59e0b", "#ef4444"][i]} />)}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white rounded-xl border p-4 shadow-sm">
              <h3 className="font-semibold mb-3">פרויקטים רווחיים ביותר</h3>
              <div className="space-y-2">
                {(dashboard.topProfitable || []).map((p: any, i: number) => (
                  <div key={i} className="flex items-center justify-between bg-gray-50 rounded-lg p-2 border text-sm cursor-pointer hover:bg-gray-100"
                    onClick={() => selectSheet(p.id)}>
                    <div>
                      <span className="font-medium">{p.project_name}</span>
                      <span className="text-gray-400 mx-1">|</span>
                      <span className="text-gray-500">{p.customer_name}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-green-600 font-bold">{fmt(p.gross_profit)}</span>
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                        {Number(p.gross_margin_pct).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sheets List */}
      {tab === "sheets" && (
        <div className="space-y-3">
          <div className="relative w-72">
            <Search className="w-4 h-4 absolute right-3 top-2.5 text-gray-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="חיפוש..." className="pr-9 pl-3 py-2 border rounded-lg text-sm w-full" />
          </div>

          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-right px-4 py-3 font-medium">פרויקט</th>
                  <th className="text-right px-4 py-3 font-medium">לקוח</th>
                  <th className="text-right px-4 py-3 font-medium">מחיר מכירה</th>
                  <th className="text-right px-4 py-3 font-medium">עלות</th>
                  <th className="text-right px-4 py-3 font-medium">רווח גולמי</th>
                  <th className="text-right px-4 py-3 font-medium">מרווח %</th>
                  <th className="text-right px-4 py-3 font-medium">סטטוס</th>
                  <th className="text-center px-4 py-3 font-medium">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {sheets.map((s) => (
                  <tr key={s.id} className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => selectSheet(s.id)}>
                    <td className="px-4 py-3 font-medium">{s.project_name}</td>
                    <td className="px-4 py-3">{s.customer_name}</td>
                    <td className="px-4 py-3">{fmt(s.total_selling_price)}</td>
                    <td className="px-4 py-3">{fmt(s.total_cost)}</td>
                    <td className="px-4 py-3 font-bold">{fmt(s.gross_profit)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded-full border ${marginColor(s.margin_status)}`}>
                        {Number(s.gross_margin_pct).toFixed(0)}% - {marginLabel(s.margin_status)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs">{s.status === "draft" ? "טיוטה" : s.status === "calculated" ? "מחושב" : s.status === "approved" ? "מאושר" : "נעול"}</td>
                    <td className="px-4 py-3 text-center">
                      <button className="text-blue-600 hover:text-blue-800"><Eye className="w-4 h-4 inline" /></button>
                    </td>
                  </tr>
                ))}
                {sheets.length === 0 && (
                  <tr><td colSpan={8} className="text-center py-8 text-gray-400">אין גיליונות</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Builder */}
      {tab === "builder" && selectedSheet && (
        <div className="space-y-4">
          {/* Summary bar */}
          <div className="bg-white rounded-xl border p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold">{selectedSheet.project_name} - {selectedSheet.customer_name}</h2>
              <div className="flex gap-2">
                <button onClick={recalculate} disabled={loading}
                  className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 flex items-center gap-1">
                  <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} /> חשב מחדש
                </button>
                <button onClick={optimize} className="px-3 py-1.5 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 flex items-center gap-1">
                  <Lightbulb className="w-3 h-3" /> אופטימיזציה
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
              <div className="text-center p-2 bg-blue-50 rounded-lg border border-blue-200">
                <div className="text-xs text-gray-500">מכירה (לפני מע"מ)</div>
                <div className="text-lg font-bold text-blue-600">{fmt(selectedSheet.total_selling_price)}</div>
              </div>
              <div className="text-center p-2 bg-blue-50 rounded-lg border border-blue-200">
                <div className="text-xs text-gray-500">מכירה + 18% מע"מ</div>
                <div className="text-lg font-bold text-blue-700">{fmt(selectedSheet.total_selling_price_vat)}</div>
              </div>
              <div className="text-center p-2 bg-red-50 rounded-lg border border-red-200">
                <div className="text-xs text-gray-500">סה"כ עלות</div>
                <div className="text-lg font-bold text-red-600">{fmt(selectedSheet.total_cost)}</div>
              </div>
              <div className="text-center p-2 bg-green-50 rounded-lg border border-green-200">
                <div className="text-xs text-gray-500">רווח גולמי</div>
                <div className="text-lg font-bold text-green-600">{fmt(selectedSheet.gross_profit)}</div>
              </div>
              <div className={`text-center p-2 rounded-lg border ${marginColor(selectedSheet.margin_status)}`}>
                <div className="text-xs text-gray-500">מרווח %</div>
                <div className="text-lg font-bold">{Number(selectedSheet.gross_margin_pct).toFixed(0)}%</div>
              </div>
              <div className="text-center p-2 bg-gray-50 rounded-lg border">
                <div className="text-xs text-gray-500">מטרים | מחיר/מ'</div>
                <div className="text-lg font-bold">{Number(selectedSheet.total_meters).toFixed(1)} | {fmt(selectedSheet.price_per_meter)}</div>
              </div>
            </div>

            {/* Margin gauge */}
            <div className="mt-3">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>0%</span>
                <span className="font-medium text-blue-600">יעד: {selectedSheet.target_margin_pct}%</span>
                <span>300%</span>
              </div>
              <div className="h-4 bg-gray-200 rounded-full overflow-hidden relative">
                <div className="absolute h-full w-0.5 bg-blue-600 z-10"
                  style={{ right: `${Math.min(100, (selectedSheet.target_margin_pct / 300) * 100)}%` }} />
                <div className={`h-full rounded-full ${Number(selectedSheet.gross_margin_pct) >= selectedSheet.target_margin_pct ? "bg-green-500" : Number(selectedSheet.gross_margin_pct) >= 0 ? "bg-yellow-500" : "bg-red-500"}`}
                  style={{ width: `${Math.min(100, Math.max(0, (Number(selectedSheet.gross_margin_pct) / 300) * 100))}%` }} />
              </div>
            </div>
          </div>

          {/* Cost breakdown chart */}
          {breakdown && (
            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-white rounded-xl border p-4 shadow-sm">
                <h3 className="font-semibold mb-3">פירוט עלויות</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie data={breakdown.breakdown.filter((b: any) => b.amount > 0)}
                      cx="50%" cy="50%" outerRadius={80} dataKey="amount" nameKey="category" label>
                      {breakdown.breakdown.map((_: any, i: number) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: any) => fmt(v)} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="bg-white rounded-xl border p-4 shadow-sm">
                <h3 className="font-semibold mb-3">אחוז מהעלות</h3>
                <div className="space-y-2">
                  {breakdown.breakdown.filter((b: any) => b.amount > 0).map((b: any, i: number) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                      <span className="text-sm flex-1">{b.category}</span>
                      <span className="text-sm font-medium">{fmt(b.amount)}</span>
                      <span className="text-xs text-gray-500 w-12 text-left">{b.pct.toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Raw Materials */}
          <div className="bg-white rounded-xl border p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold flex items-center gap-2"><Package className="w-4 h-4" /> חומרי גלם ופריטים</h3>
              <button onClick={() => setShowAddItem(true)} className="px-3 py-1 bg-blue-600 text-white rounded-lg text-xs hover:bg-blue-700 flex items-center gap-1">
                <Plus className="w-3 h-3" /> הוסף פריט
              </button>
            </div>
            {items.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-4">לא נוספו פריטים</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-xs text-gray-500 border-b">
                  <tr>
                    <th className="text-right py-2">סוג</th>
                    <th className="text-right py-2">שם</th>
                    <th className="text-right py-2">יחידה</th>
                    <th className="text-right py-2">כמות</th>
                    <th className="text-right py-2">מחיר יח'</th>
                    <th className="text-right py-2">סה"כ</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it: any) => (
                    <tr key={it.id} className="border-b">
                      <td className="py-2">{it.item_type}</td>
                      <td className="py-2 font-medium">{it.item_name}</td>
                      <td className="py-2">{it.unit}</td>
                      <td className="py-2">{Number(it.quantity).toFixed(2)}</td>
                      <td className="py-2">{fmt(it.unit_price)}</td>
                      <td className="py-2 font-bold">{fmt(it.total_price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Labor */}
          <div className="bg-white rounded-xl border p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold flex items-center gap-2"><Users className="w-4 h-4" /> עבודה</h3>
              <button onClick={() => setShowAddLabor(true)} className="px-3 py-1 bg-blue-600 text-white rounded-lg text-xs hover:bg-blue-700 flex items-center gap-1">
                <Plus className="w-3 h-3" /> הוסף עובד
              </button>
            </div>
            {labor.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-4">לא נוספו עובדים</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-xs text-gray-500 border-b">
                  <tr>
                    <th className="text-right py-2">תפקיד</th>
                    <th className="text-right py-2">שם</th>
                    <th className="text-right py-2">מודל תשלום</th>
                    <th className="text-right py-2">שיעור</th>
                    <th className="text-right py-2">סכום מחושב</th>
                  </tr>
                </thead>
                <tbody>
                  {labor.map((l: any) => (
                    <tr key={l.id} className="border-b">
                      <td className="py-2">{l.labor_type === "manufacturer" ? "יצרן" : l.labor_type === "installer" ? "מתקין" : l.labor_type === "sales_agent" ? "סוכן" : "מהנדס"}</td>
                      <td className="py-2 font-medium">{l.worker_name}</td>
                      <td className="py-2">{l.payment_model === "percentage" ? "אחוזים" : l.payment_model === "per_meter" ? "למטר" : "קבוע"}</td>
                      <td className="py-2">{l.payment_model === "percentage" ? `${Number(l.rate).toFixed(1)}%` : fmt(l.rate)}</td>
                      <td className="py-2 font-bold">{fmt(l.calculated_amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* Labor comparison */}
            {laborComparison && laborComparison.comparisons?.length > 0 && (
              <div className="mt-4 pt-4 border-t">
                <h4 className="text-sm font-semibold mb-2 flex items-center gap-1">
                  <GitCompare className="w-4 h-4 text-purple-600" /> השוואת מודלים (אחוזים מול למטר)
                </h4>
                <div className="space-y-1">
                  {laborComparison.comparisons.map((c: any, i: number) => (
                    <div key={i} className="flex items-center justify-between text-sm bg-gray-50 rounded-lg p-2 border">
                      <span className="font-medium">{c.worker}</span>
                      <div className="flex gap-4 items-center">
                        <span className={c.recommendation === "percentage" ? "font-bold text-green-600" : "text-gray-500"}>
                          אחוזים: {fmt(c.percentageAmount)}
                        </span>
                        <span className={c.recommendation === "per_meter" ? "font-bold text-green-600" : "text-gray-500"}>
                          למטר: {fmt(c.perMeterAmount)}
                        </span>
                        <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                          מומלץ: {c.recommendation === "percentage" ? "אחוזים" : "למטר"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Overhead */}
          <div className="bg-white rounded-xl border p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold flex items-center gap-2"><Truck className="w-4 h-4" /> תקורות</h3>
              <button onClick={() => setShowAddOverhead(true)} className="px-3 py-1 bg-blue-600 text-white rounded-lg text-xs hover:bg-blue-700 flex items-center gap-1">
                <Plus className="w-3 h-3" /> הוסף תקורה
              </button>
            </div>
            {overhead.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-4">לא נוספו תקורות</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-xs text-gray-500 border-b">
                  <tr>
                    <th className="text-right py-2">סוג</th>
                    <th className="text-right py-2">תיאור</th>
                    <th className="text-right py-2">שיטת חישוב</th>
                    <th className="text-right py-2">סכום</th>
                  </tr>
                </thead>
                <tbody>
                  {overhead.map((o: any) => (
                    <tr key={o.id} className="border-b">
                      <td className="py-2">{o.overhead_type}</td>
                      <td className="py-2">{o.description}</td>
                      <td className="py-2">{o.calculation_method === "per_meter" ? "למטר" : o.calculation_method === "percentage" ? "אחוזים" : "קבוע"}</td>
                      <td className="py-2 font-bold">{fmt(o.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Scenarios */}
          <div className="bg-white rounded-xl border p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">תרחישים (What-If)</h3>
              <button onClick={() => setShowScenario(true)} className="px-3 py-1 bg-purple-600 text-white rounded-lg text-xs hover:bg-purple-700 flex items-center gap-1">
                <Plus className="w-3 h-3" /> תרחיש חדש
              </button>
            </div>
            {scenarios.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-4">לא נוצרו תרחישים</p>
            ) : (
              <div className="space-y-2">
                {scenarios.map((s: any) => (
                  <div key={s.id} className="flex items-center justify-between bg-gray-50 rounded-lg p-3 border text-sm">
                    <span className="font-medium">{s.scenario_name}</span>
                    <div className="flex gap-4">
                      <span>רווח: <strong className={Number(s.resulting_profit) >= 0 ? "text-green-600" : "text-red-600"}>{fmt(s.resulting_profit)}</strong></span>
                      <span>מרווח: <strong>{Number(s.resulting_margin).toFixed(0)}%</strong></span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Optimization Suggestions */}
          {optimizeSuggestions && (
            <div className="bg-purple-50 rounded-xl border border-purple-200 p-4">
              <h3 className="font-semibold text-purple-800 mb-3 flex items-center gap-2">
                <Lightbulb className="w-4 h-4" /> המלצות אופטימיזציה
              </h3>
              <div className="grid md:grid-cols-3 gap-3 mb-3">
                <div className="bg-white rounded-lg p-3 border text-center">
                  <div className="text-xs text-gray-500">מרווח נוכחי</div>
                  <div className="text-xl font-bold">{Number(optimizeSuggestions.currentMargin).toFixed(0)}%</div>
                </div>
                <div className="bg-white rounded-lg p-3 border text-center">
                  <div className="text-xs text-gray-500">יעד מרווח</div>
                  <div className="text-xl font-bold text-blue-600">{optimizeSuggestions.targetMargin}%</div>
                </div>
                <div className="bg-white rounded-lg p-3 border text-center">
                  <div className="text-xs text-gray-500">הפחתת עלות נדרשת</div>
                  <div className="text-xl font-bold text-red-600">{fmt(optimizeSuggestions.costReductionNeeded)}</div>
                </div>
              </div>
              <ul className="space-y-1">
                {optimizeSuggestions.suggestions?.map((s: string, i: number) => (
                  <li key={i} className="text-sm text-purple-800 flex items-start gap-2">
                    <span className="text-purple-500 mt-0.5">&#8226;</span> {s}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {tab === "builder" && !selectedSheet && (
        <div className="bg-white rounded-xl border p-8 text-center text-gray-400">
          בחר גיליון תמחור מהרשימה או צור חדש
        </div>
      )}

      {/* Create Sheet Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold">גיליון תמחור חדש</h2>
            {[
              { key: "project_name", label: "שם פרויקט", type: "text" },
              { key: "customer_name", label: "שם לקוח", type: "text" },
              { key: "total_selling_price", label: "מחיר מכירה (לפני מע\"מ)", type: "number" },
              { key: "total_meters", label: "סה\"כ מטרים", type: "number" },
              { key: "target_margin_pct", label: "יעד מרווח %", type: "number" },
            ].map((f) => (
              <div key={f.key}>
                <label className="block text-sm font-medium text-gray-700 mb-1">{f.label}</label>
                <input type={f.type} value={createForm[f.key] || ""}
                  onChange={(e) => setCreateForm({ ...createForm, [f.key]: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm" placeholder={f.key === "target_margin_pct" ? "200" : ""} />
              </div>
            ))}
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 border rounded-lg text-sm">ביטול</button>
              <button onClick={createSheet} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">צור גיליון</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Item Modal */}
      {showAddItem && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowAddItem(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold">הוסף פריט</h2>
            <div>
              <label className="block text-sm font-medium mb-1">סוג</label>
              <select value={addItemForm.item_type || ""} onChange={(e) => setAddItemForm({ ...addItemForm, item_type: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="">בחר...</option>
                <option value="raw_material">חומר גלם</option>
                <option value="accessory">אביזר</option>
                <option value="consumable">מתכלה</option>
                <option value="glass">זכוכית</option>
                <option value="hardware">ברזל/חומרה</option>
              </select>
            </div>
            {[
              { key: "item_name", label: "שם פריט", type: "text" },
              { key: "unit", label: "יחידה", type: "text" },
              { key: "quantity", label: "כמות", type: "number" },
              { key: "unit_price", label: "מחיר ליחידה", type: "number" },
            ].map((f) => (
              <div key={f.key}>
                <label className="block text-sm font-medium mb-1">{f.label}</label>
                <input type={f.type} value={addItemForm[f.key] || ""}
                  onChange={(e) => setAddItemForm({ ...addItemForm, [f.key]: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
            ))}
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowAddItem(false)} className="px-4 py-2 border rounded-lg text-sm">ביטול</button>
              <button onClick={addItem} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm">הוסף</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Labor Modal */}
      {showAddLabor && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowAddLabor(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold">הוסף עובד</h2>
            <div>
              <label className="block text-sm font-medium mb-1">תפקיד</label>
              <select value={addLaborForm.labor_type || ""} onChange={(e) => setAddLaborForm({ ...addLaborForm, labor_type: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="">בחר...</option>
                <option value="manufacturer">יצרן</option>
                <option value="installer">מתקין</option>
                <option value="sales_agent">סוכן מכירות (7.5% + 2.5% בונוס)</option>
                <option value="engineer">מהנדס</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">שם</label>
              <input type="text" value={addLaborForm.worker_name || ""}
                onChange={(e) => setAddLaborForm({ ...addLaborForm, worker_name: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">מודל תשלום</label>
              <select value={addLaborForm.payment_model || ""} onChange={(e) => setAddLaborForm({ ...addLaborForm, payment_model: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="">בחר...</option>
                <option value="percentage">אחוזים מהפרויקט</option>
                <option value="per_meter">למטר רץ</option>
                <option value="fixed">סכום קבוע</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                {addLaborForm.payment_model === "percentage" ? "אחוז %" : addLaborForm.payment_model === "per_meter" ? "מחיר למטר" : "סכום קבוע"}
              </label>
              <input type="number" value={addLaborForm.rate || ""}
                onChange={(e) => setAddLaborForm({ ...addLaborForm, rate: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm"
                placeholder={addLaborForm.labor_type === "sales_agent" ? "7.5 (או השאר ריק לברירת מחדל)" : ""} />
            </div>
            {addLaborForm.labor_type === "sales_agent" && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={addLaborForm.target_met || false}
                  onChange={(e) => setAddLaborForm({ ...addLaborForm, target_met: e.target.checked })} />
                עמד ביעד (בונוס 2.5%)
              </label>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowAddLabor(false)} className="px-4 py-2 border rounded-lg text-sm">ביטול</button>
              <button onClick={addLaborEntry} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm">הוסף</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Overhead Modal */}
      {showAddOverhead && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowAddOverhead(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold">הוסף תקורה</h2>
            <div>
              <label className="block text-sm font-medium mb-1">סוג</label>
              <select value={addOverheadForm.overhead_type || ""} onChange={(e) => setAddOverheadForm({ ...addOverheadForm, overhead_type: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="">בחר...</option>
                <option value="paint_oven">צביעה - תנור</option>
                <option value="transport">הובלה</option>
                <option value="electricity">חשמל</option>
                <option value="rent">שכירות</option>
                <option value="insurance">ביטוח</option>
                <option value="other">אחר</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">תיאור</label>
              <input type="text" value={addOverheadForm.description || ""}
                onChange={(e) => setAddOverheadForm({ ...addOverheadForm, description: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">שיטת חישוב</label>
              <select value={addOverheadForm.calculation_method || ""} onChange={(e) => setAddOverheadForm({ ...addOverheadForm, calculation_method: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="fixed">סכום קבוע</option>
                <option value="per_meter">למטר</option>
                <option value="percentage">אחוז מהמכירה</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                {addOverheadForm.calculation_method === "fixed" || !addOverheadForm.calculation_method ? "סכום" : "שיעור"}
              </label>
              <input type="number" value={addOverheadForm.calculation_method === "fixed" || !addOverheadForm.calculation_method ? (addOverheadForm.amount || "") : (addOverheadForm.rate || "")}
                onChange={(e) => {
                  const key = addOverheadForm.calculation_method === "fixed" || !addOverheadForm.calculation_method ? "amount" : "rate";
                  setAddOverheadForm({ ...addOverheadForm, [key]: e.target.value });
                }}
                className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowAddOverhead(false)} className="px-4 py-2 border rounded-lg text-sm">ביטול</button>
              <button onClick={addOverheadEntry} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm">הוסף</button>
            </div>
          </div>
        </div>
      )}

      {/* Scenario Modal */}
      {showScenario && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowScenario(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold">תרחיש What-If</h2>
            <div>
              <label className="block text-sm font-medium mb-1">שם תרחיש</label>
              <input type="text" value={scenarioForm.name || ""}
                onChange={(e) => setScenarioForm({ ...scenarioForm, name: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">שינוי מחיר מכירה %</label>
              <input type="number" value={scenarioForm.selling_change_pct || ""}
                onChange={(e) => setScenarioForm({ ...scenarioForm, selling_change_pct: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="+10 או -5" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">שינוי עלויות %</label>
              <input type="number" value={scenarioForm.cost_change_pct || ""}
                onChange={(e) => setScenarioForm({ ...scenarioForm, cost_change_pct: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="+10 או -5" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">שינוי עלויות (סכום קבוע)</label>
              <input type="number" value={scenarioForm.cost_change_abs || ""}
                onChange={(e) => setScenarioForm({ ...scenarioForm, cost_change_abs: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="1000 או -500" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowScenario(false)} className="px-4 py-2 border rounded-lg text-sm">ביטול</button>
              <button onClick={createScenario} className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm">חשב תרחיש</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
