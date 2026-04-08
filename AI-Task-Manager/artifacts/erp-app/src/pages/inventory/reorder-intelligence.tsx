import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import {
  Brain, TrendingUp, TrendingDown, CheckCircle2, X, Edit2, Loader2,
  AlertTriangle, Info, ChevronDown, ChevronUp, RefreshCw, BarChart3,
  Calendar, Package, Zap, ArrowRight, Star
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, ReferenceLine, Legend
} from "recharts";

const API = "/api";

interface ReorderSuggestion {
  id: number;
  material_id: number;
  material_name: string;
  material_number: string;
  current_stock: string;
  unit: string;
  category: string;
  warehouse_location: string;
  current_reorder_point: string;
  suggested_reorder_point: string;
  current_safety_stock: string;
  suggested_safety_stock: string;
  suggested_eoq: string;
  confidence_score: string;
  reasoning: string;
  seasonal_pattern_detected: boolean;
  peak_months: string;
  avg_daily_demand: string;
  demand_variability: string;
  lead_time_days: number;
  status: string;
  user_action: string;
  generated_at: string;
}

interface ConsumptionHistory {
  month: string;
  consumed: string;
  received: string;
  transactions: string;
}

const CONFIDENCE_COLORS: Record<string, string> = {
  high: "text-green-400 bg-green-500/10",
  medium: "text-yellow-400 bg-yellow-500/10",
  low: "text-red-400 bg-red-500/10",
};

function getConfidenceLevel(score: number): "high" | "medium" | "low" {
  if (score >= 70) return "high";
  if (score >= 40) return "medium";
  return "low";
}

function getConfidenceLabel(score: number): string {
  if (score >= 70) return "גבוה";
  if (score >= 40) return "בינוני";
  return "נמוך";
}

const MONTH_NAMES: Record<number, string> = {
  1: "ינואר", 2: "פברואר", 3: "מרץ", 4: "אפריל", 5: "מאי", 6: "יוני",
  7: "יולי", 8: "אוגוסט", 9: "ספטמבר", 10: "אוקטובר", 11: "נובמבר", 12: "דצמבר",
};

export default function ReorderIntelligencePage() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [overrideModal, setOverrideModal] = useState<ReorderSuggestion | null>(null);
  const [overrideValues, setOverrideValues] = useState({ reorderPoint: "", safetyStock: "", feedback: "" });
  const [historyMaterial, setHistoryMaterial] = useState<number | null>(null);
  const [generating, setGenerating] = useState(false);

  const { data: suggestions = [], isLoading, refetch } = useQuery<ReorderSuggestion[]>({
    queryKey: ["reorder-suggestions"],
    queryFn: async () => {
      const r = await authFetch(`${API}/warehouse-intelligence/reorder-suggestions`);
      return r.json();
    },
  });

  const { data: historyData = [] } = useQuery<ConsumptionHistory[]>({
    queryKey: ["consumption-history", historyMaterial],
    queryFn: async () => {
      if (!historyMaterial) return [];
      const r = await authFetch(`${API}/warehouse-intelligence/consumption-history/${historyMaterial}`);
      return r.json();
    },
    enabled: !!historyMaterial,
  });

  const acceptMut = useMutation({
    mutationFn: async (id: number) => {
      const r = await authFetch(`${API}/warehouse-intelligence/reorder-suggestions/${id}/accept`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionBy: "ניהול מלאי" }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message); }
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reorder-suggestions"] }),
  });

  const overrideMut = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: typeof overrideValues }) => {
      const r = await authFetch(`${API}/warehouse-intelligence/reorder-suggestions/${id}/override`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          overrideReorderPoint: data.reorderPoint,
          overrideSafetyStock: data.safetyStock,
          feedback: data.feedback,
          actionBy: "ניהול מלאי",
        }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message); }
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reorder-suggestions"] });
      setOverrideModal(null);
    },
  });

  const dismissMut = useMutation({
    mutationFn: async (id: number) => {
      const r = await authFetch(`${API}/warehouse-intelligence/reorder-suggestions/${id}/dismiss`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reorder-suggestions"] }),
  });

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      await authFetch(`${API}/warehouse-intelligence/generate-forecasts`, { method: "POST" });
      await refetch();
    } finally {
      setGenerating(false);
    }
  };

  const filtered = suggestions.filter(s =>
    statusFilter === "all" ? true : s.status === statusFilter
  );

  const stats = {
    pending: suggestions.filter(s => s.status === "pending").length,
    accepted: suggestions.filter(s => s.status === "accepted").length,
    overridden: suggestions.filter(s => s.status === "overridden").length,
    dismissed: suggestions.filter(s => s.status === "dismissed").length,
    highConfidence: suggestions.filter(s => parseFloat(s.confidence_score) >= 70).length,
  };

  const chartData = historyData.slice().reverse().map(h => ({
    month: new Date(h.month).toLocaleDateString("he-IL", { month: "short", year: "2-digit" }),
    consumed: Math.round(parseFloat(h.consumed || "0")),
    received: Math.round(parseFloat(h.received || "0")),
  }));

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center">
              <Brain className="w-6 h-6 text-foreground" />
            </div>
            בינה מלאכותית — נקודות הזמנה חכמות
          </h1>
          <p className="text-sm text-muted-foreground mt-1">ניתוח תצרוכת היסטורית, זיהוי עונתיות, וחישוב נקודות הזמנה אופטימליות</p>
        </div>
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-foreground rounded-xl font-medium transition-colors disabled:opacity-60"
        >
          {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
          {generating ? "מחשב..." : "הפעל ניתוח AI"}
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {[
          { label: "ממתינות לאישור", value: stats.pending, color: "text-blue-400", bg: "bg-blue-500/10" },
          { label: "אושרו", value: stats.accepted, color: "text-green-400", bg: "bg-green-500/10" },
          { label: "עם שינוי ידני", value: stats.overridden, color: "text-amber-400", bg: "bg-amber-500/10" },
          { label: "נדחו", value: stats.dismissed, color: "text-red-400", bg: "bg-red-500/10" },
          { label: "ביטחון גבוה", value: stats.highConfidence, color: "text-purple-400", bg: "bg-purple-500/10" },
        ].map(s => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-3">
            <p className="text-muted-foreground text-xs">{s.label}</p>
            <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {["all", "pending", "accepted", "overridden", "dismissed"].map(f => (
          <button
            key={f}
            onClick={() => setStatusFilter(f)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${statusFilter === f ? "bg-purple-600 text-foreground" : "bg-card border border-border text-muted-foreground hover:text-foreground"}`}
          >
            {{ all: "הכל", pending: "ממתין", accepted: "אושר", overridden: "שונה", dismissed: "נדחה" }[f]}
            {f === "pending" && stats.pending > 0 && <span className="mr-2 bg-blue-500 text-foreground text-xs rounded-full px-1.5">{stats.pending}</span>}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-10 h-10 animate-spin text-purple-400" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 bg-card rounded-xl border border-border">
          <Brain className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <p className="text-lg text-muted-foreground">
            {statusFilter === "pending" ? "אין המלצות ממתינות — לחץ 'הפעל ניתוח AI' לחישוב" : "אין המלצות בסטטוס זה"}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(s => {
            const conf = parseFloat(s.confidence_score);
            const confLevel = getConfidenceLevel(conf);
            const isExpanded = expandedId === s.id;
            const currentRP = parseFloat(s.current_reorder_point || "0");
            const suggestedRP = parseFloat(s.suggested_reorder_point || "0");
            const rpChange = currentRP > 0 ? ((suggestedRP - currentRP) / currentRP) * 100 : 0;
            const peakMonthNums = s.peak_months ? s.peak_months.split(",").filter(Boolean).map(Number) : [];

            return (
              <div key={s.id} className={`bg-card border rounded-xl overflow-hidden transition-colors ${s.status === "pending" ? "border-border hover:border-border" : "border-border opacity-80"}`}>
                <div
                  className="p-4 cursor-pointer"
                  onClick={() => {
                    setExpandedId(isExpanded ? null : s.id);
                    setHistoryMaterial(s.material_id);
                  }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center flex-shrink-0">
                        <Package className="w-5 h-5 text-purple-400" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground truncate">{s.material_name}</p>
                        <p className="text-xs text-muted-foreground">{s.material_number} · {s.category} · {s.warehouse_location}</p>
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CONFIDENCE_COLORS[confLevel]}`}>
                            <Star className="w-3 h-3 inline mr-1" />ביטחון: {getConfidenceLabel(conf)} ({Math.round(conf)}%)
                          </span>
                          {s.seasonal_pattern_detected && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-400">
                              <Calendar className="w-3 h-3 inline mr-1" />עונתיות
                            </span>
                          )}
                          {s.status !== "pending" && (
                            <span className={`text-xs px-2 py-0.5 rounded-full ${s.status === "accepted" ? "bg-green-500/10 text-green-400" : s.status === "overridden" ? "bg-amber-500/10 text-amber-400" : "bg-gray-500/10 text-gray-400"}`}>
                              {{ accepted: "אושר", overridden: "שונה ידנית", dismissed: "נדחה" }[s.status] || s.status}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 flex-shrink-0">
                      <div className="hidden sm:grid grid-cols-3 gap-4 text-center text-xs">
                        <div>
                          <p className="text-muted-foreground">נקודת הזמנה נוכחית</p>
                          <p className="text-gray-300 font-mono font-medium mt-0.5">{parseFloat(s.current_reorder_point || "0").toFixed(1)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">מוצע</p>
                          <p className="text-purple-400 font-mono font-bold mt-0.5">{parseFloat(s.suggested_reorder_point || "0").toFixed(1)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">שינוי</p>
                          <p className={`font-mono font-medium mt-0.5 flex items-center justify-center gap-0.5 ${rpChange > 0 ? "text-amber-400" : rpChange < 0 ? "text-green-400" : "text-gray-400"}`}>
                            {rpChange > 0 ? <TrendingUp className="w-3 h-3" /> : rpChange < 0 ? <TrendingDown className="w-3 h-3" /> : null}
                            {rpChange !== 0 ? `${Math.abs(rpChange).toFixed(0)}%` : "—"}
                          </p>
                        </div>
                      </div>

                      {s.status === "pending" && (
                        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => acceptMut.mutate(s.id)}
                            disabled={acceptMut.isPending}
                            className="flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-foreground rounded-lg text-xs font-medium transition-colors"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />אשר
                          </button>
                          <button
                            onClick={() => { setOverrideModal(s); setOverrideValues({ reorderPoint: s.suggested_reorder_point, safetyStock: s.suggested_safety_stock, feedback: "" }); }}
                            className="flex items-center gap-1 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-foreground rounded-lg text-xs font-medium transition-colors"
                          >
                            <Edit2 className="w-3.5 h-3.5" />שנה
                          </button>
                          <button
                            onClick={() => dismissMut.mutate(s.id)}
                            className="p-1.5 text-muted-foreground hover:text-red-400 transition-colors rounded-lg"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      )}

                      {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-border p-4 space-y-4">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {[
                        { label: "מלאי בטחון נוכחי", value: parseFloat(s.current_safety_stock || "0").toFixed(1), unit: s.unit },
                        { label: "מלאי בטחון מוצע", value: parseFloat(s.suggested_safety_stock || "0").toFixed(1), unit: s.unit, highlight: true },
                        { label: "כמות הזמנה כלכלית", value: parseFloat(s.suggested_eoq || "0").toFixed(1), unit: s.unit, highlight: true },
                        { label: "ממוצע צריכה יומי", value: parseFloat(s.avg_daily_demand || "0").toFixed(2), unit: s.unit + "/יום" },
                      ].map(item => (
                        <div key={item.label} className={`rounded-lg p-3 ${item.highlight ? "bg-purple-500/10 border border-purple-500/20" : "bg-card"}`}>
                          <p className="text-xs text-muted-foreground">{item.label}</p>
                          <p className={`text-lg font-bold font-mono mt-1 ${item.highlight ? "text-purple-400" : "text-foreground"}`}>
                            {item.value}
                            <span className="text-xs text-muted-foreground font-normal ml-1">{item.unit}</span>
                          </p>
                        </div>
                      ))}
                    </div>

                    {peakMonthNums.length > 0 && (
                      <div className="flex items-start gap-2 bg-orange-500/10 border border-orange-500/20 rounded-lg p-3">
                        <Calendar className="w-4 h-4 text-orange-400 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs font-medium text-orange-300">עונתיות מזוהה</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            חודשי שיא: {peakMonthNums.map(m => MONTH_NAMES[m]).join(", ")} — מומלץ להגדיל מלאי מראש
                          </p>
                        </div>
                      </div>
                    )}

                    <div className="flex items-start gap-2 bg-card rounded-lg p-3">
                      <Info className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-muted-foreground leading-relaxed">{s.reasoning}</p>
                    </div>

                    {chartData.length > 0 && historyMaterial === s.material_id && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                          <BarChart3 className="w-3.5 h-3.5" />היסטוריית צריכה וקבלות (24 חודשים)
                        </p>
                        <ResponsiveContainer width="100%" height={160}>
                          <BarChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                            <XAxis dataKey="month" tick={{ fill: "#6b7280", fontSize: 10 }} />
                            <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} />
                            <Tooltip contentStyle={{ background: "#1a1d23", border: "1px solid #374151", borderRadius: "8px" }} />
                            <Legend />
                            <Bar dataKey="consumed" name="תצרוכת" fill="#7c3aed" radius={[2, 2, 0, 0]} />
                            <Bar dataKey="received" name="קבלות" fill="#0891b2" radius={[2, 2, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {overrideModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setOverrideModal(null)}>
          <div className="bg-card border border-border rounded-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="font-bold text-foreground flex items-center gap-2"><Edit2 className="w-4 h-4 text-amber-400" />שינוי ידני — {overrideModal.material_name}</h2>
              <button onClick={() => setOverrideModal(null)} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">נקודת הזמנה (המלצה: {parseFloat(overrideModal.suggested_reorder_point).toFixed(1)})</label>
                <input
                  type="number"
                  value={overrideValues.reorderPoint}
                  onChange={e => setOverrideValues(prev => ({ ...prev, reorderPoint: e.target.value }))}
                  className="w-full bg-card border border-border rounded-lg px-3 py-2 text-foreground focus:border-purple-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">מלאי בטחון (המלצה: {parseFloat(overrideModal.suggested_safety_stock).toFixed(1)})</label>
                <input
                  type="number"
                  value={overrideValues.safetyStock}
                  onChange={e => setOverrideValues(prev => ({ ...prev, safetyStock: e.target.value }))}
                  className="w-full bg-card border border-border rounded-lg px-3 py-2 text-foreground focus:border-purple-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">סיבת השינוי (לשיפור מודל ה-AI)</label>
                <textarea
                  value={overrideValues.feedback}
                  onChange={e => setOverrideValues(prev => ({ ...prev, feedback: e.target.value }))}
                  rows={3}
                  placeholder="למה שינית את המלצת ה-AI?"
                  className="w-full bg-card border border-border rounded-lg px-3 py-2 text-foreground focus:border-purple-500 focus:outline-none resize-none text-sm"
                />
              </div>
            </div>
            <div className="flex items-center gap-2 p-4 border-t border-border justify-end">
              <button onClick={() => setOverrideModal(null)} className="px-4 py-2 border border-border text-muted-foreground hover:text-foreground rounded-lg text-sm">ביטול</button>
              <button
                onClick={() => overrideMut.mutate({ id: overrideModal.id, data: overrideValues })}
                disabled={overrideMut.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-foreground rounded-lg text-sm font-medium"
              >
                {overrideMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                שמור שינוי
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
