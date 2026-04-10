import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { duplicateRecord } from "@/lib/duplicate-record";
import {
  Award, Star, TrendingUp, TrendingDown, BarChart3, Users,
  Search, Plus, Edit2, Trash2, X, Save, ChevronDown, ChevronUp,
  Clock, Package, ShieldCheck, DollarSign, Headphones, CheckCircle2,
  AlertTriangle, Eye, Calendar, Target, Zap, ThumbsUp, ThumbsDown, Minus, Copy
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import AttachmentsSection from "@/components/attachments-section";
import { useFormValidation, FormFieldError, RequiredMark } from "@/hooks/use-form-validation";

const API = "/api";

interface Evaluation {
  id: number;
  supplierId: number;
  evaluationDate: string;
  evaluator: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  deliveryScore: string;
  qualityScore: string;
  pricingScore: string;
  serviceScore: string;
  reliabilityScore: string;
  overallScore: string;
  deliveryNotes: string | null;
  qualityNotes: string | null;
  pricingNotes: string | null;
  serviceNotes: string | null;
  reliabilityNotes: string | null;
  generalNotes: string | null;
  totalOrders: number | null;
  onTimeDeliveries: number | null;
  qualityRejections: number | null;
  priceCompliancePct: string | null;
  responseTimeAvg: string | null;
  recommendation: string | null;
  status: string;
  createdAt: string;
}

interface Supplier {
  id: number;
  supplierName: string;
  contactPerson: string | null;
  status: string;
}

const SCORE_CATEGORIES = [
  { key: "deliveryScore", label: "משלוח בזמן", icon: Clock, color: "text-blue-400", notesKey: "deliveryNotes" },
  { key: "qualityScore", label: "איכות", icon: ShieldCheck, color: "text-green-400", notesKey: "qualityNotes" },
  { key: "pricingScore", label: "תמחור", icon: DollarSign, color: "text-amber-400", notesKey: "pricingNotes" },
  { key: "serviceScore", label: "שירות", icon: Headphones, color: "text-purple-400", notesKey: "serviceNotes" },
  { key: "reliabilityScore", label: "אמינות", icon: Target, color: "text-red-400", notesKey: "reliabilityNotes" },
] as const;

const RECOMMENDATIONS = ["ממשיך", "מומלץ", "לשיפור", "להפסקה", "חדש"];
const STATUSES = ["פעיל", "טיוטה", "בוטל"];

type ViewMode = "dashboard" | "list" | "comparison" | "history";

function scoreColor(s: number): string {
  if (s >= 4) return "text-green-400";
  if (s >= 3) return "text-amber-400";
  if (s >= 2) return "text-orange-400";
  return "text-red-400";
}

function scoreBg(s: number): string {
  if (s >= 4) return "bg-green-500/20 border-green-500/30";
  if (s >= 3) return "bg-amber-500/20 border-amber-500/30";
  if (s >= 2) return "bg-orange-500/20 border-orange-500/30";
  return "bg-red-500/20 border-red-500/30";
}

function ScoreBar({ score, max = 5, label, color }: { score: number; max?: number; label: string; color: string }) {
  const pct = Math.min((score / max) * 100, 100);
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground w-20 text-right">{label}</span>
      <div className="flex-1 h-2.5 bg-muted rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className={`h-full rounded-full ${color}`}
        />
      </div>
      <span className={`text-xs font-bold w-8 ${scoreColor(score)}`}>{score.toFixed(1)}</span>
    </div>
  );
}

function StarRating({ value, onChange, size = 20 }: { value: number; onChange?: (v: number) => void; size?: number }) {
  return (
    <div className="flex gap-0.5" dir="ltr">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={size}
          className={`${i <= value ? "text-amber-400 fill-amber-400" : "text-muted-foreground"} ${onChange ? "cursor-pointer hover:text-amber-300" : ""}`}
          onClick={() => onChange?.(i)}
        />
      ))}
    </div>
  );
}


const load: any[] = [];
export default function SupplierEvaluationsPage() {
  const qc = useQueryClient();
  const [viewMode, setViewMode] = useState<ViewMode>("dashboard");
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [search, setSearch] = useState("");
  const [recFilter, setRecFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editingEval, setEditingEval] = useState<Evaluation | null>(null);
  const [selectedEval, setSelectedEval] = useState<Evaluation | null>(null);
  const [detailTab, setDetailTab] = useState("details");
  const bulk = useBulkSelection();
  const formValidation = useFormValidation({ supplierId: { required: true, message: "ספק נדרש" }, evaluator: { required: true, message: "מעריך נדרש" } });
  const [compareIds, setCompareIds] = useState<number[]>([]);
  const [expandedSupplier, setExpandedSupplier] = useState<number | null>(null);

  const { data: evalsRaw, isLoading } = useQuery({
    queryKey: ["supplier-evaluations"],
    queryFn: async () => { const r = await authFetch(`${API}/supplier-evaluations`); return r.json(); },
  });
  const evaluations: Evaluation[] = Array.isArray(evalsRaw) ? evalsRaw : (evalsRaw?.data || evalsRaw?.items || []);

  const { data: suppliersRaw } = useQuery({
    queryKey: ["suppliers-for-eval"],
    queryFn: async () => { const r = await authFetch(`${API}/suppliers`); return r.json(); },
  });
  const suppliers: Supplier[] = Array.isArray(suppliersRaw) ? suppliersRaw : (suppliersRaw?.data || suppliersRaw?.items || []);

  const supplierMap = useMemo(() => {
    const m: Record<number, Supplier> = {};
    suppliers.forEach(s => { m[s.id] = s; });
    return m;
  }, [suppliers]);

  const filtered = useMemo(() => {
    return evaluations.filter(e => {
      const sn = supplierMap[e.supplierId]?.supplierName || "";
      const matchSearch = !search || sn.includes(search) || (e.evaluator || "").includes(search);
      const matchRec = recFilter === "all" || e.recommendation === recFilter;
      return matchSearch && matchRec;
    });
  }, [evaluations, search, recFilter, supplierMap]);

  const latestBySupplier = useMemo(() => {
    const map: Record<number, Evaluation> = {};
    evaluations.forEach(e => {
      if (!map[e.supplierId] || e.evaluationDate > map[e.supplierId].evaluationDate) {
        map[e.supplierId] = e;
      }
    });
    return Object.values(map);
  }, [evaluations]);

  const kpis = useMemo(() => {
    const latest = latestBySupplier;
    const avgOverall = latest.length ? latest.reduce((s, e) => s + parseFloat(e.overallScore), 0) / latest.length : 0;
    const excellent = latest.filter(e => parseFloat(e.overallScore) >= 4).length;
    const needsImproval = latest.filter(e => parseFloat(e.overallScore) < 3).length;
    const totalEvals = evaluations.length;
    const avgDelivery = latest.length ? latest.reduce((s, e) => s + parseFloat(e.deliveryScore), 0) / latest.length : 0;
    const avgQuality = latest.length ? latest.reduce((s, e) => s + parseFloat(e.qualityScore), 0) / latest.length : 0;
    const avgPricing = latest.length ? latest.reduce((s, e) => s + parseFloat(e.pricingScore), 0) / latest.length : 0;
    const avgService = latest.length ? latest.reduce((s, e) => s + parseFloat(e.serviceScore), 0) / latest.length : 0;
    return { avgOverall, excellent, needsImproval, totalEvals, avgDelivery, avgQuality, avgPricing, avgService, uniqueSuppliers: latest.length };
  }, [evaluations, latestBySupplier]);

  const supplierHistory = useMemo(() => {
    const map: Record<number, Evaluation[]> = {};
    evaluations.forEach(e => {
      if (!map[e.supplierId]) map[e.supplierId] = [];
      map[e.supplierId].push(e);
    });
    Object.values(map).forEach(arr => arr.sort((a, b) => a.evaluationDate.localeCompare(b.evaluationDate)));
    return map;
  }, [evaluations]);

  const saveMutation = useMutation({
    mutationFn: async (data: any) => {
      const url = data.id ? `${API}/supplier-evaluations/${data.id}` : `${API}/supplier-evaluations`;
      const method = data.id ? "PUT" : "POST";
      const r = await authFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      if (!r.ok) throw new Error((await r.json()).message);
      return r.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["supplier-evaluations"] }); setShowForm(false); setEditingEval(null); },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await authFetch(`${API}/supplier-evaluations/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("Delete failed");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["supplier-evaluations"] }),
  });

  const [form, setForm] = useState<any>({
    supplierId: "", evaluationDate: new Date().toISOString().split("T")[0],
    evaluator: "", periodStart: "", periodEnd: "",
    deliveryScore: "3", qualityScore: "3", pricingScore: "3", serviceScore: "3", reliabilityScore: "3",
    deliveryNotes: "", qualityNotes: "", pricingNotes: "", serviceNotes: "", reliabilityNotes: "",
    generalNotes: "", totalOrders: "", onTimeDeliveries: "", qualityRejections: "",
    priceCompliancePct: "", responseTimeAvg: "", recommendation: "ממשיך", status: "פעיל",
  });

  function openForm(ev?: Evaluation) {
    if (ev) {
      setEditingEval(ev);
      setForm({
        supplierId: ev.supplierId, evaluationDate: ev.evaluationDate || "",
        evaluator: ev.evaluator || "", periodStart: ev.periodStart || "", periodEnd: ev.periodEnd || "",
        deliveryScore: ev.deliveryScore, qualityScore: ev.qualityScore,
        pricingScore: ev.pricingScore, serviceScore: ev.serviceScore, reliabilityScore: ev.reliabilityScore,
        deliveryNotes: ev.deliveryNotes || "", qualityNotes: ev.qualityNotes || "",
        pricingNotes: ev.pricingNotes || "", serviceNotes: ev.serviceNotes || "",
        reliabilityNotes: ev.reliabilityNotes || "", generalNotes: ev.generalNotes || "",
        totalOrders: ev.totalOrders ?? "", onTimeDeliveries: ev.onTimeDeliveries ?? "",
        qualityRejections: ev.qualityRejections ?? "", priceCompliancePct: ev.priceCompliancePct || "",
        responseTimeAvg: ev.responseTimeAvg || "", recommendation: ev.recommendation || "ממשיך",
        status: ev.status,
      });
    } else {
      setEditingEval(null);
      setForm({
        supplierId: "", evaluationDate: new Date().toISOString().split("T")[0],
        evaluator: "", periodStart: "", periodEnd: "",
        deliveryScore: "3", qualityScore: "3", pricingScore: "3", serviceScore: "3", reliabilityScore: "3",
        deliveryNotes: "", qualityNotes: "", pricingNotes: "", serviceNotes: "", reliabilityNotes: "",
        generalNotes: "", totalOrders: "", onTimeDeliveries: "", qualityRejections: "",
        priceCompliancePct: "", responseTimeAvg: "", recommendation: "ממשיך", status: "פעיל",
      });
    }
    setShowForm(true);
  }

  function handleSubmit() {
    const payload = { ...form };
    if (editingEval) payload.id = editingEval.id;
    saveMutation.mutate(payload);
  }

  const tabs: { key: ViewMode; label: string; icon: any }[] = [
    { key: "dashboard", label: "דשבורד", icon: BarChart3 },
    { key: "list", label: "רשימת הערכות", icon: Award },
    { key: "comparison", label: "השוואת ספקים", icon: Users },
    { key: "history", label: "מגמות היסטוריות", icon: TrendingUp },
  ];

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 text-foreground p-4 md:p-6" dir="rtl">
      <div className="max-w-[1600px] mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-amber-500/20 rounded-xl border border-amber-500/30">
              <Award className="text-amber-400" size={28} />
            </div>
            <div>
              <h1 className="text-lg sm:text-2xl font-bold">הערכת ספקים</h1>
              <p className="text-muted-foreground text-sm">מערכת דירוג, מעקב ביצועים והשוואת ספקים</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => openForm()} className="flex items-center gap-2 px-4 py-2.5 bg-amber-600 hover:bg-amber-500 rounded-lg font-medium transition-colors">
              <Plus size={18} /> הערכה חדשה
            </button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          {[
            { label: "ציון ממוצע", value: kpis.avgOverall.toFixed(1), icon: Star, color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
            { label: "ספקים מוערכים", value: kpis.uniqueSuppliers, icon: Users, color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20" },
            { label: "סה\"כ הערכות", value: kpis.totalEvals, icon: Award, color: "text-purple-400", bg: "bg-purple-500/10 border-purple-500/20" },
            { label: "מצוינים (4+)", value: kpis.excellent, icon: ThumbsUp, color: "text-green-400", bg: "bg-green-500/10 border-green-500/20" },
            { label: "לשיפור (<3)", value: kpis.needsImproval, icon: AlertTriangle, color: "text-red-400", bg: "bg-red-500/10 border-red-500/20" },
            { label: "ממוצע משלוח", value: kpis.avgDelivery.toFixed(1), icon: Clock, color: "text-cyan-400", bg: "bg-cyan-500/10 border-cyan-500/20" },
            { label: "ממוצע איכות", value: kpis.avgQuality.toFixed(1), icon: ShieldCheck, color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
            { label: "ממוצע תמחור", value: kpis.avgPricing.toFixed(1), icon: DollarSign, color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/20" },
          ].map((k, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
              className={`${k.bg} border rounded-xl p-3 text-center`}>
              <k.icon className={`${k.color} mx-auto mb-1`} size={20} />
              <div className={`text-xl font-bold ${k.color}`}>{k.value}</div>
              <div className="text-[10px] text-muted-foreground">{k.label}</div>
            </motion.div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-muted/50 rounded-xl p-1 border border-border/50 w-fit">
          {tabs.map(t => (
            <button key={t.key} onClick={() => setViewMode(t.key)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${viewMode === t.key ? "bg-amber-600 text-foreground shadow-lg" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"}`}>
              <t.icon size={16} /> {t.label}
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-0 sm:min-w-[200px] max-w-md">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש ספק או מעריך..."
              className="w-full bg-muted/60 border border-border rounded-lg pr-10 pl-4 py-2.5 text-sm text-foreground placeholder-gray-500 focus:border-amber-500/50 focus:outline-none" />
          </div>
          <select value={recFilter} onChange={e => setRecFilter(e.target.value)}
            className="bg-muted/60 border border-border rounded-lg px-3 py-2.5 text-sm text-gray-300 focus:border-amber-500/50 focus:outline-none">
            <option value="all">כל ההמלצות</option>
            {RECOMMENDATIONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>

        {/* Content */}
        <AnimatePresence mode="wait">
          {viewMode === "dashboard" && (
            <motion.div key="dashboard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4 sm:space-y-6">
              {/* Top & Bottom Suppliers */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-muted/40 border border-border/50 rounded-xl p-5">
                  <h3 className="text-lg font-bold mb-4 flex items-center gap-2"><ThumbsUp className="text-green-400" size={20} /> ספקים מובילים</h3>
                  <div className="space-y-3">
                    {latestBySupplier.sort((a, b) => parseFloat(b.overallScore) - parseFloat(a.overallScore)).slice(0, 5).map((ev, i) => {
                      const score = parseFloat(ev.overallScore);
                      return (
                        <div key={ev.id} className="flex items-center gap-3 p-3 bg-background/50 rounded-lg border border-border/30">
                          <span className={`w-7 h-7 flex items-center justify-center rounded-full text-xs font-bold ${i === 0 ? "bg-amber-500 text-foreground" : i === 1 ? "bg-gray-300 text-foreground" : i === 2 ? "bg-amber-700 text-foreground" : "bg-muted text-gray-300"}`}>{i + 1}</span>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate">{supplierMap[ev.supplierId]?.supplierName || `ספק #${ev.supplierId}`}</div>
                            <div className="text-xs text-muted-foreground">{ev.recommendation}</div>
                          </div>
                          <div className={`text-lg font-bold ${scoreColor(score)}`}>{score.toFixed(1)}</div>
                          <StarRating value={Math.round(score)} size={14} />
                        </div>
                      );
                    })}
                    {latestBySupplier.length === 0 && <p className="text-muted-foreground text-sm text-center py-4">אין הערכות עדיין</p>}
                  </div>
                </div>

                <div className="bg-muted/40 border border-border/50 rounded-xl p-5">
                  <h3 className="text-lg font-bold mb-4 flex items-center gap-2"><BarChart3 className="text-blue-400" size={20} /> ממוצע ציונים לפי קטגוריה</h3>
                  <div className="space-y-4 mt-6">
                    {SCORE_CATEGORIES.map(cat => {
                      const avg = latestBySupplier.length
                        ? latestBySupplier.reduce((s, e) => s + parseFloat((e as any)[cat.key] || "0"), 0) / latestBySupplier.length : 0;
                      return (
                        <ScoreBar key={cat.key} score={avg} label={cat.label}
                          color={avg >= 4 ? "bg-green-500" : avg >= 3 ? "bg-amber-500" : avg >= 2 ? "bg-orange-500" : "bg-red-500"} />
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Recommendation Distribution */}
              <div className="bg-muted/40 border border-border/50 rounded-xl p-5">
                <h3 className="text-lg font-bold mb-4 flex items-center gap-2"><Target className="text-purple-400" size={20} /> התפלגות המלצות</h3>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  {RECOMMENDATIONS.map(rec => {
                    const count = latestBySupplier.filter(e => e.recommendation === rec).length;
                    const pct = latestBySupplier.length ? (count / latestBySupplier.length * 100).toFixed(0) : "0";
                    const colors: Record<string, string> = {
                      "מומלץ": "bg-green-500/20 border-green-500/30 text-green-400",
                      "ממשיך": "bg-blue-500/20 border-blue-500/30 text-blue-400",
                      "לשיפור": "bg-amber-500/20 border-amber-500/30 text-amber-400",
                      "להפסקה": "bg-red-500/20 border-red-500/30 text-red-400",
                      "חדש": "bg-muted/20 border-gray-500/30 text-muted-foreground",
                    };
                    return (
                      <div key={rec} className={`${colors[rec] || "bg-muted/30 border-border/30 text-gray-300"} border rounded-xl p-4 text-center`}>
                        <div className="text-lg sm:text-2xl font-bold">{count}</div>
                        <div className="text-sm font-medium">{rec}</div>
                        <div className="text-xs opacity-60">{pct}%</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Recent Evaluations */}
              <div className="bg-muted/40 border border-border/50 rounded-xl p-5">
                <h3 className="text-lg font-bold mb-4 flex items-center gap-2"><Calendar className="text-cyan-400" size={20} /> הערכות אחרונות</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/50">
                        <th className="text-right py-3 px-2 text-muted-foreground font-medium">ספק</th>
                        <th className="text-center py-3 px-2 text-muted-foreground font-medium">תאריך</th>
                        <th className="text-center py-3 px-2 text-muted-foreground font-medium">משלוח</th>
                        <th className="text-center py-3 px-2 text-muted-foreground font-medium">איכות</th>
                        <th className="text-center py-3 px-2 text-muted-foreground font-medium">תמחור</th>
                        <th className="text-center py-3 px-2 text-muted-foreground font-medium">שירות</th>
                        <th className="text-center py-3 px-2 text-muted-foreground font-medium">אמינות</th>
                        <th className="text-center py-3 px-2 text-muted-foreground font-medium">כולל</th>
                        <th className="text-center py-3 px-2 text-muted-foreground font-medium">המלצה</th>
                        <th className="text-center py-3 px-2 text-muted-foreground font-medium">פעולות</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.slice(0, 10).map(ev => {
                        const os = parseFloat(ev.overallScore);
                        return (
                          <tr key={ev.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                            <td className="py-3 px-2 font-medium">{supplierMap[ev.supplierId]?.supplierName || `ספק #${ev.supplierId}`}</td>
                            <td className="py-3 px-2 text-center text-gray-300">{ev.evaluationDate}</td>
                            {SCORE_CATEGORIES.map(cat => {
                              const v = parseFloat((ev as any)[cat.key]);
                              return <td key={cat.key} className={`py-3 px-2 text-center font-bold ${scoreColor(v)}`}>{v.toFixed(1)}</td>;
                            })}
                            <td className="py-3 px-2 text-center">
                              <span className={`px-2 py-1 rounded-full text-xs font-bold border ${scoreBg(os)} ${scoreColor(os)}`}>{os.toFixed(1)}</span>
                            </td>
                            <td className="py-3 px-2 text-center text-xs">{ev.recommendation}</td>
                            <td className="py-3 px-2 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <button onClick={() => setSelectedEval(ev)} className="p-1.5 hover:bg-muted rounded-lg transition-colors"><Eye size={14} className="text-muted-foreground" /></button>
                                <button onClick={() => openForm(ev)} className="p-1.5 hover:bg-muted rounded-lg transition-colors"><Edit2 size={14} className="text-blue-400" /></button> <button title="שכפול" onClick={async () => { const res = await duplicateRecord(`${API}/supplier-evaluations`, ev.id); if (res.ok) { load(); } else { alert("שגיאה בשכפול: " + res.error); } }} className="p-1.5 hover:bg-muted rounded-lg"><Copy className="w-3.5 h-3.5 text-slate-400" /></button>
                                {isSuperAdmin && <button onClick={async () => { const ok = await globalConfirm("למחוק הערכה זו?", { itemName: ev.evaluation_period || ev.title || String(ev.id), entityType: "הערכת ספק" }); if (ok) deleteMutation.mutate(ev.id); }} className="p-1.5 hover:bg-muted rounded-lg transition-colors"><Trash2 size={14} className="text-red-400" /></button>}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {filtered.length === 0 && <p className="text-muted-foreground text-sm text-center py-8">אין הערכות</p>}
                </div>
              </div>
            </motion.div>
          )}

          {viewMode === "list" && (
            <motion.div key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
              <BulkActions bulk={bulk} actions={defaultBulkActions} entityName="הערכות" />
              {filtered.map(ev => {
                const os = parseFloat(ev.overallScore);
                return (
                  <motion.div key={ev.id} layout className={`bg-muted/40 border border-border/50 rounded-xl p-4 hover:border-amber-500/30 transition-all ${bulk.isSelected(ev.id) ? "ring-1 ring-primary/50 bg-primary/5" : ""}`}>
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div onClick={e => e.stopPropagation()}><BulkCheckbox bulk={bulk} id={ev.id} /></div>
                        <div className={`p-2.5 rounded-xl border ${scoreBg(os)}`}>
                          <Award className={scoreColor(os)} size={22} />
                        </div>
                        <div className="min-w-0">
                          <div className="font-bold truncate">{supplierMap[ev.supplierId]?.supplierName || `ספק #${ev.supplierId}`}</div>
                          <div className="text-xs text-muted-foreground flex items-center gap-2">
                            <Calendar size={12} /> {ev.evaluationDate}
                            {ev.evaluator && <><span className="text-muted-foreground">|</span> {ev.evaluator}</>}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="hidden md:flex gap-2">
                          {SCORE_CATEGORIES.map(cat => {
                            const v = parseFloat((ev as any)[cat.key]);
                            return (
                              <div key={cat.key} className="text-center">
                                <cat.icon size={14} className={cat.color + " mx-auto mb-0.5"} />
                                <div className={`text-xs font-bold ${scoreColor(v)}`}>{v.toFixed(1)}</div>
                              </div>
                            );
                          })}
                        </div>
                        <div className={`text-xl font-bold ${scoreColor(os)} min-w-[40px] text-center`}>{os.toFixed(1)}</div>
                        <StarRating value={Math.round(os)} size={14} />
                        <span className={`px-2 py-1 rounded-full text-xs border ${ev.recommendation === "מומלץ" ? "bg-green-500/20 border-green-500/30 text-green-400" : ev.recommendation === "להפסקה" ? "bg-red-500/20 border-red-500/30 text-red-400" : "bg-muted/50 border-border/30 text-gray-300"}`}>{ev.recommendation}</span>
                        <div className="flex gap-1">
                          <button onClick={() => setSelectedEval(ev)} className="p-1.5 hover:bg-muted rounded-lg"><Eye size={15} className="text-muted-foreground" /></button>
                          <button onClick={() => openForm(ev)} className="p-1.5 hover:bg-muted rounded-lg"><Edit2 size={15} className="text-blue-400" /></button> <button title="שכפול" onClick={async () => { const res = await duplicateRecord(`${API}/supplier-evaluations`, ev.id); if (res.ok) { load(); } else { alert("שגיאה בשכפול: " + res.error); } }} className="p-1.5 hover:bg-muted rounded-lg"><Copy className="w-3.5 h-3.5 text-slate-400" /></button>
                          {isSuperAdmin && <button onClick={async () => { const ok = await globalConfirm("למחוק הערכה זו?", { itemName: ev.evaluation_period || ev.title || String(ev.id), entityType: "הערכת ספק" }); if (ok) deleteMutation.mutate(ev.id); }} className="p-1.5 hover:bg-muted rounded-lg"><Trash2 size={15} className="text-red-400" /></button>}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
              {filtered.length === 0 && <p className="text-muted-foreground text-center py-12">אין הערכות</p>}
            </motion.div>
          )}

          {viewMode === "comparison" && (
            <motion.div key="comparison" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
              <p className="text-muted-foreground text-sm">השוואה בין הציונים האחרונים של כל ספק מוערך</p>
              {latestBySupplier.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/50">
                        <th className="text-right py-3 px-3 text-muted-foreground font-medium sticky right-0 bg-background/80 backdrop-blur-sm z-10">ספק</th>
                        {SCORE_CATEGORIES.map(cat => (
                          <th key={cat.key} className="text-center py-3 px-3 text-muted-foreground font-medium">
                            <cat.icon size={14} className={`${cat.color} mx-auto mb-0.5`} />
                            <div>{cat.label}</div>
                          </th>
                        ))}
                        <th className="text-center py-3 px-3 text-muted-foreground font-medium">ציון כולל</th>
                        <th className="text-center py-3 px-3 text-muted-foreground font-medium">המלצה</th>
                      </tr>
                    </thead>
                    <tbody>
                      {latestBySupplier.sort((a, b) => parseFloat(b.overallScore) - parseFloat(a.overallScore)).map(ev => {
                        const os = parseFloat(ev.overallScore);
                        return (
                          <tr key={ev.id} className="border-b border-border/50 hover:bg-muted/30">
                            <td className="py-3 px-3 font-medium sticky right-0 bg-background/80 backdrop-blur-sm z-10">{supplierMap[ev.supplierId]?.supplierName || `ספק #${ev.supplierId}`}</td>
                            {SCORE_CATEGORIES.map(cat => {
                              const v = parseFloat((ev as any)[cat.key]);
                              const isMax = latestBySupplier.every(e => parseFloat((e as any)[cat.key]) <= v);
                              const isMin = latestBySupplier.every(e => parseFloat((e as any)[cat.key]) >= v);
                              return (
                                <td key={cat.key} className={`py-3 px-3 text-center font-bold ${scoreColor(v)} ${isMax && latestBySupplier.length > 1 ? "bg-green-500/10" : ""} ${isMin && latestBySupplier.length > 1 ? "bg-red-500/10" : ""}`}>
                                  {v.toFixed(1)}
                                  {isMax && latestBySupplier.length > 1 && <TrendingUp size={10} className="inline mr-1 text-green-400" />}
                                  {isMin && latestBySupplier.length > 1 && <TrendingDown size={10} className="inline mr-1 text-red-400" />}
                                </td>
                              );
                            })}
                            <td className="py-3 px-3 text-center">
                              <span className={`px-3 py-1 rounded-full text-sm font-bold border ${scoreBg(os)} ${scoreColor(os)}`}>{os.toFixed(1)}</span>
                            </td>
                            <td className="py-3 px-3 text-center text-xs">{ev.recommendation}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-12">אין ספקים מוערכים</p>
              )}
            </motion.div>
          )}

          {viewMode === "history" && (
            <motion.div key="history" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
              <p className="text-muted-foreground text-sm">מעקב מגמות ציונים לאורך זמן לכל ספק</p>
              {Object.entries(supplierHistory).map(([sid, evals]) => {
                const supplierId = parseInt(sid);
                const supplier = supplierMap[supplierId];
                const latest = evals[evals.length - 1];
                const prev = evals.length > 1 ? evals[evals.length - 2] : null;
                const latestOs = parseFloat(latest.overallScore);
                const prevOs = prev ? parseFloat(prev.overallScore) : null;
                const trend = prevOs !== null ? latestOs - prevOs : 0;
                const isExpanded = expandedSupplier === supplierId;

                return (
                  <div key={sid} className="bg-muted/40 border border-border/50 rounded-xl overflow-hidden">
                    <button onClick={() => setExpandedSupplier(isExpanded ? null : supplierId)}
                      className="w-full flex items-center justify-between p-4 hover:bg-muted/60 transition-colors text-right">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg border ${scoreBg(latestOs)}`}>
                          <Award className={scoreColor(latestOs)} size={20} />
                        </div>
                        <div>
                          <div className="font-bold">{supplier?.supplierName || `ספק #${supplierId}`}</div>
                          <div className="text-xs text-muted-foreground">{evals.length} הערכות</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className={`text-lg font-bold ${scoreColor(latestOs)}`}>{latestOs.toFixed(1)}</div>
                        {trend !== 0 && (
                          <span className={`flex items-center gap-0.5 text-xs font-bold ${trend > 0 ? "text-green-400" : "text-red-400"}`}>
                            {trend > 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                            {Math.abs(trend).toFixed(1)}
                          </span>
                        )}
                        {isExpanded ? <ChevronUp size={18} className="text-muted-foreground" /> : <ChevronDown size={18} className="text-muted-foreground" />}
                      </div>
                    </button>
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
                          <div className="px-4 pb-4 space-y-3">
                            {/* Score Timeline */}
                            <div className="flex gap-2 overflow-x-auto pb-2">
                              {evals.map((ev, i) => {
                                const os = parseFloat(ev.overallScore);
                                const prevEv = i > 0 ? parseFloat(evals[i - 1].overallScore) : os;
                                const diff = os - prevEv;
                                return (
                                  <div key={ev.id} className="flex-shrink-0 bg-background/60 border border-border/30 rounded-lg p-3 min-w-[120px] text-center">
                                    <div className="text-xs text-muted-foreground mb-1">{ev.evaluationDate}</div>
                                    <div className={`text-xl font-bold ${scoreColor(os)}`}>{os.toFixed(1)}</div>
                                    {i > 0 && (
                                      <div className={`text-xs flex items-center justify-center gap-0.5 ${diff > 0 ? "text-green-400" : diff < 0 ? "text-red-400" : "text-muted-foreground"}`}>
                                        {diff > 0 ? <TrendingUp size={10} /> : diff < 0 ? <TrendingDown size={10} /> : <Minus size={10} />}
                                        {diff !== 0 ? Math.abs(diff).toFixed(1) : "ללא שינוי"}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                            {/* Latest scores breakdown */}
                            <div className="bg-background/40 rounded-lg p-3 space-y-2">
                              <div className="text-xs text-muted-foreground mb-2">ציונים אחרונים ({latest.evaluationDate})</div>
                              {SCORE_CATEGORIES.map(cat => (
                                <ScoreBar key={cat.key} score={parseFloat((latest as any)[cat.key])} label={cat.label}
                                  color={parseFloat((latest as any)[cat.key]) >= 4 ? "bg-green-500" : parseFloat((latest as any)[cat.key]) >= 3 ? "bg-amber-500" : "bg-red-500"} />
                              ))}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
              {Object.keys(supplierHistory).length === 0 && <p className="text-muted-foreground text-center py-12">אין היסטוריה</p>}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Detail Modal */}
        <AnimatePresence>
          {selectedEval && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setSelectedEval(null)}>
              <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
                className="bg-background border border-border rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-bold flex items-center gap-2">
                    <Award className="text-amber-400" size={22} />
                    פרטי הערכה — {supplierMap[selectedEval.supplierId]?.supplierName || `ספק #${selectedEval.supplierId}`}
                  </h3>
                  <button onClick={() => setSelectedEval(null)} className="p-2 hover:bg-muted rounded-lg"><X size={20} /></button>
                </div>

                <div className="flex border-b border-border mb-6">
                  {[{key:"details",label:"פרטים"},{key:"related",label:"רשומות קשורות"},{key:"docs",label:"מסמכים"},{key:"history",label:"היסטוריה"}].map(t => (
                    <button key={t.key} onClick={() => setDetailTab(t.key)} className={`px-4 py-2.5 text-sm font-medium border-b-2 ${detailTab === t.key ? "border-amber-500 text-amber-400" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t.label}</button>
                  ))}
                </div>

                {detailTab === "details" && (<>
                <div className="grid grid-cols-2 gap-3 mb-6 text-sm">
                  <div className="bg-muted/50 rounded-lg p-3"><span className="text-muted-foreground">תאריך הערכה:</span> <span className="font-medium mr-2">{selectedEval.evaluationDate}</span></div>
                  <div className="bg-muted/50 rounded-lg p-3"><span className="text-muted-foreground">מעריך:</span> <span className="font-medium mr-2">{selectedEval.evaluator || "—"}</span></div>
                  <div className="bg-muted/50 rounded-lg p-3"><span className="text-muted-foreground">תקופה:</span> <span className="font-medium mr-2">{selectedEval.periodStart || "—"} — {selectedEval.periodEnd || "—"}</span></div>
                  <div className="bg-muted/50 rounded-lg p-3"><span className="text-muted-foreground">המלצה:</span> <span className="font-medium mr-2">{selectedEval.recommendation}</span></div>
                </div>

                <div className="mb-6 text-center">
                  <div className={`text-4xl font-bold ${scoreColor(parseFloat(selectedEval.overallScore))}`}>{parseFloat(selectedEval.overallScore).toFixed(1)}</div>
                  <div className="text-muted-foreground text-sm">ציון כולל</div>
                  <StarRating value={Math.round(parseFloat(selectedEval.overallScore))} size={24} />
                </div>

                <div className="space-y-4 mb-6">
                  {SCORE_CATEGORIES.map(cat => {
                    const v = parseFloat((selectedEval as any)[cat.key]);
                    const notes = (selectedEval as any)[cat.notesKey];
                    return (
                      <div key={cat.key} className="bg-muted/40 rounded-lg p-3">
                        <ScoreBar score={v} label={cat.label} color={v >= 4 ? "bg-green-500" : v >= 3 ? "bg-amber-500" : "bg-red-500"} />
                        {notes && <p className="text-xs text-muted-foreground mt-1 pr-24">{notes}</p>}
                      </div>
                    );
                  })}
                </div>

                {(selectedEval.totalOrders || selectedEval.onTimeDeliveries || selectedEval.qualityRejections) && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
                    <div className="bg-muted/50 rounded-lg p-3 text-center">
                      <div className="text-xl font-bold text-blue-400">{selectedEval.totalOrders ?? 0}</div>
                      <div className="text-xs text-muted-foreground">סה"כ הזמנות</div>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-3 text-center">
                      <div className="text-xl font-bold text-green-400">{selectedEval.onTimeDeliveries ?? 0}</div>
                      <div className="text-xs text-muted-foreground">משלוחים בזמן</div>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-3 text-center">
                      <div className="text-xl font-bold text-red-400">{selectedEval.qualityRejections ?? 0}</div>
                      <div className="text-xs text-muted-foreground">פסילות איכות</div>
                    </div>
                  </div>
                )}

                {selectedEval.generalNotes && (
                  <div className="bg-muted/40 rounded-lg p-3">
                    <div className="text-sm text-muted-foreground mb-1">הערות כלליות</div>
                    <p className="text-sm">{selectedEval.generalNotes}</p>
                  </div>
                )}
                </>)}

                {detailTab === "related" && (
                  <RelatedRecords entityType="supplier-evaluations" entityId={selectedEval.id} relations={[
                    { key: "suppliers", label: "ספקים", endpoint: "/api/suppliers" },
                  ]} />
                )}
                {detailTab === "docs" && (
                  <AttachmentsSection entityType="supplier-evaluations" entityId={selectedEval.id} />
                )}
                {detailTab === "history" && (
                  <ActivityLog entityType="supplier-evaluations" entityId={selectedEval.id} />
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Form Modal */}
        <AnimatePresence>
          {showForm && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
              <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
                className="bg-background border border-border rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-bold">{editingEval ? "עריכת הערכה" : "הערכת ספק חדשה"}</h3>
                  <button onClick={() => setShowForm(false)} className="p-2 hover:bg-muted rounded-lg"><X size={20} /></button>
                </div>

                <div className="space-y-5">
                  {/* Basic Info */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">ספק *</label>
                      <select value={form.supplierId} onChange={e => setForm({ ...form, supplierId: e.target.value })}
                        className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm focus:border-amber-500/50 focus:outline-none">
                        <option value="">בחר ספק...</option>
                        {suppliers.map(s => <option key={s.id} value={s.id}>{s.supplierName}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">תאריך הערכה</label>
                      <input type="date" value={form.evaluationDate} onChange={e => setForm({ ...form, evaluationDate: e.target.value })}
                        className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm focus:border-amber-500/50 focus:outline-none" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">מעריך</label>
                      <input value={form.evaluator} onChange={e => setForm({ ...form, evaluator: e.target.value })} placeholder="שם המעריך"
                        className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm focus:border-amber-500/50 focus:outline-none" />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">תחילת תקופה</label>
                      <input type="date" value={form.periodStart} onChange={e => setForm({ ...form, periodStart: e.target.value })}
                        className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm focus:border-amber-500/50 focus:outline-none" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">סיום תקופה</label>
                      <input type="date" value={form.periodEnd} onChange={e => setForm({ ...form, periodEnd: e.target.value })}
                        className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm focus:border-amber-500/50 focus:outline-none" />
                    </div>
                  </div>

                  {/* Scores */}
                  <div className="bg-muted/40 rounded-xl p-4 border border-border/50">
                    <h4 className="font-bold mb-4 flex items-center gap-2"><Star className="text-amber-400" size={18} /> ציונים (1-5)</h4>
                    <div className="space-y-4">
                      {SCORE_CATEGORIES.map(cat => (
                        <div key={cat.key} className="flex items-center gap-3">
                          <cat.icon size={18} className={cat.color} />
                          <span className="text-sm w-20">{cat.label}</span>
                          <StarRating value={parseInt(form[cat.key] || "3")} onChange={v => setForm({ ...form, [cat.key]: v.toString() })} size={22} />
                          <input value={form[cat.notesKey] || ""} onChange={e => setForm({ ...form, [cat.notesKey]: e.target.value })} placeholder={`הערות ${cat.label}...`}
                            className="flex-1 bg-background/60 border border-border/50 rounded-lg px-3 py-1.5 text-xs focus:border-amber-500/50 focus:outline-none" />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Metrics */}
                  <div className="bg-muted/40 rounded-xl p-4 border border-border/50">
                    <h4 className="font-bold mb-4 flex items-center gap-2"><BarChart3 className="text-blue-400" size={18} /> מדדים כמותיים</h4>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                      {[
                        { key: "totalOrders", label: "סה\"כ הזמנות", type: "number" },
                        { key: "onTimeDeliveries", label: "משלוחים בזמן", type: "number" },
                        { key: "qualityRejections", label: "פסילות איכות", type: "number" },
                        { key: "priceCompliancePct", label: "עמידה במחיר (%)", type: "text" },
                        { key: "responseTimeAvg", label: "זמן תגובה (שעות)", type: "text" },
                      ].map(f => (
                        <div key={f.key}>
                          <label className="text-xs text-muted-foreground mb-1 block">{f.label}</label>
                          <input type={f.type} value={form[f.key] || ""} onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                            className="w-full bg-background/60 border border-border/50 rounded-lg px-3 py-2 text-sm focus:border-amber-500/50 focus:outline-none" />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Recommendation & Notes */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">המלצה</label>
                      <select value={form.recommendation} onChange={e => setForm({ ...form, recommendation: e.target.value })}
                        className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm focus:border-amber-500/50 focus:outline-none">
                        {RECOMMENDATIONS.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">סטטוס</label>
                      <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}
                        className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm focus:border-amber-500/50 focus:outline-none">
                        {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">הערות כלליות</label>
                    <textarea rows={3} value={form.generalNotes} onChange={e => setForm({ ...form, generalNotes: e.target.value })}
                      className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm focus:border-amber-500/50 focus:outline-none resize-none" />
                  </div>

                  {/* Submit */}
                  <div className="flex justify-end gap-3 pt-2">
                    <button onClick={() => setShowForm(false)} className="px-5 py-2.5 border border-border rounded-lg text-gray-300 hover:bg-muted transition-colors">ביטול</button>
                    <button onClick={handleSubmit} disabled={saveMutation.isPending || !form.supplierId}
                      className="flex items-center gap-2 px-6 py-2.5 bg-amber-600 hover:bg-amber-500 disabled:bg-muted disabled:text-muted-foreground rounded-lg font-medium transition-colors">
                      <Save size={16} /> {saveMutation.isPending ? "שומר..." : editingEval ? "עדכון" : "שמירה"}
                    </button>
                  </div>
                  {saveMutation.isError && <p className="text-red-400 text-sm text-center">{(saveMutation.error as Error).message}</p>}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
