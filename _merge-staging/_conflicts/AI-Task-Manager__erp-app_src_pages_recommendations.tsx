import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { useLocation } from "wouter";
import { authFetch } from "@/lib/utils";
import {
  Star, Check, X, ArrowLeft, Search, Filter,
  Lightbulb, TrendingUp, Shield, Wrench, Zap,
  AlertTriangle, CheckCircle2, XCircle, Brain,
  Factory, Package, Users, DollarSign, Clock,
} from "lucide-react";

const API = "/api";

interface Recommendation {
  id: number;
  modelId: number | null;
  title: string;
  description: string | null;
  category: string;
  confidence: string | null;
  status: string;
  isApplied: boolean;
  metadata: string | null;
  createdAt: string;
  updatedAt: string;
  recommendationType: string | null;
  entityType: string | null;
}

const CATEGORY_CONFIG: Record<string, { icon: typeof Star; color: string; bg: string; label: string }> = {
  production: { icon: Factory, color: "text-blue-400", bg: "bg-blue-500/10", label: "ייצור" },
  quality: { icon: Shield, color: "text-emerald-400", bg: "bg-emerald-500/10", label: "בקרת איכות" },
  inventory: { icon: Package, color: "text-orange-400", bg: "bg-orange-500/10", label: "מלאי" },
  demand: { icon: TrendingUp, color: "text-violet-400", bg: "bg-violet-500/10", label: "ביקוש" },
  logistics: { icon: Clock, color: "text-cyan-400", bg: "bg-cyan-500/10", label: "לוגיסטיקה" },
  cost: { icon: DollarSign, color: "text-green-400", bg: "bg-green-500/10", label: "עלויות" },
  procurement: { icon: Wrench, color: "text-amber-400", bg: "bg-amber-500/10", label: "רכש" },
  hr: { icon: Users, color: "text-pink-400", bg: "bg-pink-500/10", label: "משאבי אנוש" },
  integration: { icon: Zap, color: "text-indigo-400", bg: "bg-indigo-500/10", label: "אינטגרציה" },
  sustainability: { icon: Lightbulb, color: "text-lime-400", bg: "bg-lime-500/10", label: "קיימות" },
  sales: { icon: TrendingUp, color: "text-rose-400", bg: "bg-rose-500/10", label: "מכירות" },
  maintenance: { icon: AlertTriangle, color: "text-red-400", bg: "bg-red-500/10", label: "תחזוקה" },
};

export default function RecommendationsPage() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const queryClient = useQueryClient();

  const { data: recommendations = [], isLoading, isError } = useQuery<Recommendation[]>({
    queryKey: ["ai-recommendations"],
    queryFn: async () => {
      const r = await authFetch(`${API}/ai-recommendations`);
      if (!r.ok) throw new Error("Failed");
      const data = await r.json();
      return Array.isArray(data) ? data : [];
    },
    staleTime: 60000,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, status, isApplied }: { id: number; status: string; isApplied: boolean }) => {
      const r = await authFetch(`${API}/ai-recommendations/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, isApplied }),
      });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ai-recommendations"] }),
  });

  const filtered = recommendations.filter(rec => {
    const matchSearch = !search || rec.title.includes(search) || (rec.description || "").includes(search);
    const matchStatus = statusFilter === "all" || rec.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const pendingCount = recommendations.filter(r => r.status === "pending").length;
  const appliedCount = recommendations.filter(r => r.status === "applied").length;
  const rejectedCount = recommendations.filter(r => r.status === "rejected").length;
  const avgConfidence = recommendations.length > 0
    ? (recommendations.reduce((sum, r) => sum + parseFloat(r.confidence || "0"), 0) / recommendations.length * 100).toFixed(0)
    : "0";

  return (
    <div className="min-h-screen bg-background text-foreground" dir="rtl">
      <div className="fixed inset-0 pointer-events-none" style={{
        backgroundImage: "linear-gradient(rgba(139, 92, 246, 0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(139, 92, 246, 0.02) 1px, transparent 1px)",
        backgroundSize: "50px 50px",
      }} />

      <div className="relative z-10 max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/30">
                <Lightbulb className="w-5 h-5 text-foreground" />
              </div>
              <div>
                <h1 className="text-2xl font-black text-foreground tracking-tight">המלצות AI</h1>
                <p className="text-muted-foreground text-xs">תובנות והמלצות חכמות לשיפור ביצועי המפעל — טכנו-כל עוזי</p>
              </div>
            </div>
          </div>
          <button onClick={() => setLocation("/hi-tech-dashboard")} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-600/20 border border-purple-500/30 text-purple-400 hover:bg-purple-600/30 transition-colors text-sm">
            <Brain className="w-4 h-4" /> דאשבורד AI <ArrowLeft className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "ממתינות לטיפול", value: pendingCount, icon: Clock, color: "text-amber-400", bg: "bg-amber-400/10" },
            { label: "יושמו", value: appliedCount, icon: CheckCircle2, color: "text-green-400", bg: "bg-green-400/10" },
            { label: "נדחו", value: rejectedCount, icon: XCircle, color: "text-red-400", bg: "bg-red-400/10" },
            { label: "ביטחון ממוצע", value: `${avgConfidence}%`, icon: Star, color: "text-violet-400", bg: "bg-violet-400/10" },
          ].map((stat, i) => {
            const Icon = stat.icon;
            return (
              <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }} className="bg-card border border-border rounded-2xl p-4">
                <div className={`w-8 h-8 rounded-lg ${stat.bg} flex items-center justify-center mb-3`}>
                  <Icon className={`w-4 h-4 ${stat.color}`} />
                </div>
                <div className="font-black text-xl text-foreground mb-0.5">{stat.value}</div>
                <div className="text-muted-foreground text-xs">{stat.label}</div>
              </motion.div>
            );
          })}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input type="text" placeholder="חיפוש המלצה..." value={search} onChange={e => setSearch(e.target.value)} className="bg-card border border-border rounded-xl pr-9 pl-4 py-2 text-sm text-foreground placeholder-gray-500 focus:outline-none focus:border-purple-500/50 w-64" />
          </div>
          <div className="flex gap-1.5">
            {[
              { key: "all", label: "הכל" },
              { key: "pending", label: "ממתינות" },
              { key: "applied", label: "יושמו" },
              { key: "rejected", label: "נדחו" },
            ].map(f => (
              <button key={f.key} onClick={() => setStatusFilter(f.key)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${statusFilter === f.key ? "bg-purple-600/20 text-purple-400 border border-purple-500/40" : "bg-card text-muted-foreground border border-border hover:border-border"}`}>
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {isError && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm flex items-center gap-2">
            <XCircle className="w-4 h-4" /> שגיאה בטעינת המלצות
          </div>
        )}

        {isLoading ? (
          <div className="text-center py-20"><Lightbulb className="w-8 h-8 text-amber-400 mx-auto animate-pulse mb-4" /><p className="text-muted-foreground">טוען המלצות AI...</p></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 bg-card border border-border rounded-2xl"><Lightbulb className="w-12 h-12 text-muted-foreground mx-auto mb-4" /><h3 className="text-foreground font-bold mb-2">אין המלצות</h3><p className="text-muted-foreground text-sm">שנה את הסינון או חכה להמלצות חדשות</p></div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((rec, i) => {
              const cat = CATEGORY_CONFIG[rec.category] || CATEGORY_CONFIG.production;
              const CatIcon = cat.icon;
              const confidence = parseFloat(rec.confidence || "0") * 100;
              return (
                <motion.div key={rec.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className={`bg-card border border-border rounded-2xl overflow-hidden ${rec.status !== "pending" ? "opacity-70" : ""}`}>
                  <div className={`flex items-center justify-between px-4 py-3 ${cat.bg} border-b border-border`}>
                    <div className="flex items-center gap-2">
                      <CatIcon className={`w-4 h-4 ${cat.color}`} />
                      <span className={`text-xs font-bold ${cat.color}`}>{cat.label}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span>ביטחון: <span className="text-foreground font-bold">{confidence.toFixed(0)}%</span></span>
                    </div>
                  </div>

                  <div className="px-4 py-3">
                    <h3 className="font-bold text-foreground text-sm mb-2">{rec.title}</h3>
                    <p className="text-muted-foreground text-xs leading-relaxed">{rec.description}</p>

                    <div className="mt-3 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${confidence >= 90 ? "bg-emerald-500" : confidence >= 80 ? "bg-blue-500" : confidence >= 70 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${confidence}%` }} />
                    </div>

                    {rec.recommendationType && (
                      <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground">
                        <span className="px-1.5 py-0.5 rounded bg-muted">{rec.recommendationType}</span>
                        {rec.entityType && <span className="px-1.5 py-0.5 rounded bg-muted">{rec.entityType}</span>}
                      </div>
                    )}
                  </div>

                  <div className="px-4 py-3 border-t border-border bg-black/20">
                    {rec.status === "pending" ? (
                      <div className="flex gap-2">
                        <button onClick={() => updateMutation.mutate({ id: rec.id, status: "applied", isApplied: true })} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 transition-colors text-xs font-medium">
                          <Check className="w-3.5 h-3.5" /> יישם
                        </button>
                        <button onClick={() => updateMutation.mutate({ id: rec.id, status: "rejected", isApplied: false })} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-red-600/20 text-red-400 hover:bg-red-600/30 transition-colors text-xs font-medium">
                          <X className="w-3.5 h-3.5" /> דחה
                        </button>
                      </div>
                    ) : (
                      <div className="text-center text-xs font-medium">
                        {rec.status === "applied" ? <span className="text-emerald-400 flex items-center justify-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> יושם בהצלחה</span> : <span className="text-red-400 flex items-center justify-center gap-1"><XCircle className="w-3.5 h-3.5" /> נדחה</span>}
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
