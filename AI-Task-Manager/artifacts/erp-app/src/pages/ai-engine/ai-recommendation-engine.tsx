import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain, Sparkles, TrendingUp, Package, Users, Factory, DollarSign,
  CheckCircle2, X, RefreshCw, ArrowRight, AlertTriangle, Zap,
  BarChart3, Target, Lightbulb, Clock, ChevronDown, ChevronUp,
  Star, AlertCircle, ArrowUpRight,
} from "lucide-react";
import { authFetch } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

const API = "/api";
const token = () => localStorage.getItem("erp_token") || "";
const headers = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token()}` });

interface Recommendation {
  id: number;
  category: string;
  module: string;
  priority: string;
  title: string;
  description: string;
  reasoning: string;
  expected_impact: string;
  impact_value: number | null;
  impact_unit: string;
  action_label: string;
  action_type: string;
  status: string;
  created_at: string;
}

const PRIORITY_CONFIG: Record<string, { label: string; color: string; bg: string; border: string; icon: any }> = {
  critical: { label: "קריטי", color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/30", icon: AlertCircle },
  high: { label: "גבוה", color: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/30", icon: AlertTriangle },
  medium: { label: "בינוני", color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/30", icon: Star },
  low: { label: "נמוך", color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/30", icon: Lightbulb },
};

const CATEGORY_CONFIG: Record<string, { label: string; icon: any; color: string }> = {
  "מלאי": { label: "מלאי", icon: Package, color: "text-emerald-400" },
  "מכירות": { label: "מכירות", icon: TrendingUp, color: "text-blue-400" },
  "ספקים": { label: "ספקים", icon: Users, color: "text-violet-400" },
  "ייצור": { label: "ייצור", icon: Factory, color: "text-amber-400" },
  "פיננסים": { label: "פיננסים", icon: DollarSign, color: "text-green-400" },
  "כללי": { label: "כללי", icon: Brain, color: "text-cyan-400" },
};

const MODULE_LINKS: Record<string, string> = {
  "raw-materials": "/raw-materials",
  "sales": "/sales",
  "suppliers": "/suppliers",
  "production": "/production/dashboard",
  "finance": "/finance",
};

function fmt(n: number | null | undefined, unit: string) {
  if (n === null || n === undefined) return "—";
  if (unit === "ILS") return new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(n);
  if (unit === "%") return `${n}%`;
  return `${n} ${unit}`;
}

function RecommendationCard({ rec, onAccept, onDismiss }: {
  rec: Recommendation;
  onAccept: (id: number) => void;
  onDismiss: (id: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const priority = PRIORITY_CONFIG[rec.priority] || PRIORITY_CONFIG.medium;
  const category = CATEGORY_CONFIG[rec.category] || CATEGORY_CONFIG["כללי"];
  const PriorityIcon = priority.icon;
  const CategoryIcon = category.icon;
  const moduleLink = MODULE_LINKS[rec.module];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={`bg-card border ${priority.border} rounded-2xl overflow-hidden`}
    >
      <div className="p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className={`p-2 rounded-xl ${priority.bg} flex-shrink-0`}>
              <PriorityIcon className={`w-4 h-4 ${priority.color}`} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${priority.bg} ${priority.color} font-semibold`}>
                  {priority.label}
                </span>
                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <CategoryIcon className={`w-3 h-3 ${category.color}`} />
                  {category.label}
                </span>
              </div>
              <h3 className="font-bold text-foreground text-sm leading-snug">{rec.title}</h3>
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => onDismiss(rec.id)}
              className="p-1.5 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
              title="דחה"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <p className="text-sm text-muted-foreground mb-3 leading-relaxed">{rec.description}</p>

        {rec.impact_value !== null && (
          <div className="flex items-center gap-2 mb-3 p-2.5 bg-emerald-500/5 border border-emerald-500/20 rounded-xl">
            <ArrowUpRight className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <div>
              <span className="text-xs text-muted-foreground">השפעה צפויה: </span>
              <span className="text-sm font-bold text-emerald-400">{fmt(rec.impact_value, rec.impact_unit)}</span>
              {rec.expected_impact && <span className="text-xs text-muted-foreground mr-1">— {rec.expected_impact}</span>}
            </div>
          </div>
        )}

        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-3"
        >
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          {expanded ? "הסתר נימוק" : "הצג נימוק"}
        </button>

        <AnimatePresence>
          {expanded && rec.reasoning && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden mb-3"
            >
              <div className="p-3 bg-muted/10 rounded-xl border border-border/50 text-xs text-muted-foreground leading-relaxed">
                <p className="font-semibold text-foreground mb-1">נימוק:</p>
                <p>{rec.reasoning}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onAccept(rec.id)}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-xl text-xs font-semibold transition-colors"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            אישור
          </button>
          {moduleLink && (
            <Link href={moduleLink}>
              <button className="flex items-center gap-1.5 px-3 py-2 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 rounded-xl text-xs font-semibold transition-colors">
                <ArrowRight className="w-3.5 h-3.5" />
                {rec.action_label || "פעל"}
              </button>
            </Link>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export default function AIRecommendationEngine() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [generating, setGenerating] = useState(false);

  const { data: recommendations = [], isLoading } = useQuery<Recommendation[]>({
    queryKey: ["ai-recommendations"],
    queryFn: async () => {
      const r = await authFetch(`${API}/ai-biz-auto/recommendations`, { headers: headers() });
      if (!r.ok) return [];
      return r.json();
    },
    refetchInterval: 60000,
  });

  const { data: stats } = useQuery<any>({
    queryKey: ["ai-recommendation-stats"],
    queryFn: async () => {
      const r = await authFetch(`${API}/ai-biz-auto/recommendations/stats`, { headers: headers() });
      if (!r.ok) return {};
      return r.json();
    },
  });

  const acceptMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await authFetch(`${API}/ai-biz-auto/recommendations/${id}/accept`, {
        method: "PATCH",
        headers: headers(),
      });
      if (!r.ok) throw new Error("Failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-recommendations"] });
      queryClient.invalidateQueries({ queryKey: ["ai-recommendation-stats"] });
      toast({ title: "אושר", description: "המלצה אושרה ובוצעה" });
    },
  });

  const dismissMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await authFetch(`${API}/ai-biz-auto/recommendations/${id}/dismiss`, {
        method: "PATCH",
        headers: headers(),
      });
      if (!r.ok) throw new Error("Failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-recommendations"] });
      queryClient.invalidateQueries({ queryKey: ["ai-recommendation-stats"] });
      toast({ title: "נדחה", description: "המלצה נדחתה" });
    },
  });

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const r = await authFetch(`${API}/ai-biz-auto/recommendations/generate`, {
        method: "POST",
        headers: headers(),
      });
      if (!r.ok) throw new Error("Generation failed");
      const data = await r.json();
      queryClient.invalidateQueries({ queryKey: ["ai-recommendations"] });
      queryClient.invalidateQueries({ queryKey: ["ai-recommendation-stats"] });
      toast({ title: "הושלם", description: `${data.generated} המלצות נוצרו בהצלחה` });
    } catch {
      toast({ title: "שגיאה", description: "יצירת המלצות נכשלה", variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const categories = ["all", ...Array.from(new Set(recommendations.map(r => r.category)))];
  const filtered = activeCategory === "all" ? recommendations : recommendations.filter(r => r.category === activeCategory);

  const criticalCount = recommendations.filter(r => r.priority === "critical").length;
  const highCount = recommendations.filter(r => r.priority === "high").length;

  return (
    <div className="space-y-6 pb-8" dir="rtl">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-500/20 to-indigo-500/20 border border-violet-500/30 flex items-center justify-center">
            <Brain className="w-5 h-5 text-violet-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">מנוע המלצות AI</h1>
            <p className="text-xs text-muted-foreground">ניתוח אוטומטי והמלצות עסקיות מבוססות-נתונים</p>
          </div>
        </div>
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="flex items-center gap-2 px-4 py-2 bg-violet-500/10 hover:bg-violet-500/20 text-violet-400 border border-violet-500/30 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
        >
          {generating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {generating ? "מנתח..." : "נתח & צור המלצות"}
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "המלצות פעילות", value: stats?.active_count || 0, icon: Target, color: "text-violet-400", bg: "bg-violet-500/10" },
          { label: "קריטיות", value: stats?.critical_count || 0, icon: AlertCircle, color: "text-red-400", bg: "bg-red-500/10" },
          { label: "גבוהות", value: stats?.high_count || 0, icon: AlertTriangle, color: "text-orange-400", bg: "bg-orange-500/10" },
          { label: "השפעה מצטברת", value: stats?.accepted_impact ? `₪${Math.round(Number(stats.accepted_impact) / 1000)}K` : "—", icon: DollarSign, color: "text-emerald-400", bg: "bg-emerald-500/10" },
        ].map((s, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
            className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
            <div className={`p-2 rounded-xl ${s.bg}`}>
              <s.icon className={`w-4 h-4 ${s.color}`} />
            </div>
            <div>
              <div className="text-xl font-bold text-foreground">{s.value}</div>
              <div className="text-xs text-muted-foreground">{s.label}</div>
            </div>
          </motion.div>
        ))}
      </div>

      {(criticalCount > 0 || highCount > 0) && (
        <div className="flex items-center gap-2 p-3 bg-red-500/5 border border-red-500/20 rounded-xl">
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
          <p className="text-sm text-red-300">
            {criticalCount > 0 && `${criticalCount} המלצות קריטיות`}
            {criticalCount > 0 && highCount > 0 && " ו-"}
            {highCount > 0 && `${highCount} המלצות עדיפות גבוהה`} דורשות תשומת לב מיידית
          </p>
        </div>
      )}

      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              activeCategory === cat
                ? "bg-violet-500/20 text-violet-300 border border-violet-500/40"
                : "bg-muted/20 text-muted-foreground hover:bg-muted/40 border border-transparent"
            }`}
          >
            {cat === "all" ? "הכל" : cat}
            <span className="mr-1 opacity-60">
              ({cat === "all" ? recommendations.length : recommendations.filter(r => r.category === cat).length})
            </span>
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="bg-card border border-border rounded-2xl p-5 animate-pulse space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-muted/20" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 w-1/3 rounded bg-muted/20" />
                  <div className="h-4 w-2/3 rounded bg-muted/20" />
                </div>
              </div>
              <div className="h-3 w-full rounded bg-muted/15" />
              <div className="h-3 w-4/5 rounded bg-muted/10" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <Brain className="w-12 h-12 text-muted-foreground/20 mx-auto mb-4" />
          <h3 className="text-base font-semibold text-muted-foreground mb-2">אין המלצות פעילות</h3>
          <p className="text-sm text-muted-foreground mb-4">לחץ על "נתח & צור המלצות" כדי לנתח את הנתונים ולקבל המלצות AI</p>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="px-6 py-2.5 bg-violet-500/10 hover:bg-violet-500/20 text-violet-400 border border-violet-500/30 rounded-xl text-sm font-semibold transition-colors"
          >
            <Sparkles className="w-4 h-4 inline ml-1" />
            התחל ניתוח
          </button>
        </div>
      ) : (
        <AnimatePresence>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filtered.map(rec => (
              <RecommendationCard
                key={rec.id}
                rec={rec}
                onAccept={id => acceptMutation.mutate(id)}
                onDismiss={id => dismissMutation.mutate(id)}
              />
            ))}
          </div>
        </AnimatePresence>
      )}
    </div>
  );
}
