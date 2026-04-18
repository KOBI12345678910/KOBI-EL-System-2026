import { useState, useEffect } from "react";
import { Users, Award, Star, TrendingUp, DollarSign, RefreshCw, BarChart3, ArrowUpRight, ArrowDownRight, Loader2 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { authFetch } from "@/lib/utils";

const API = "/api";
const getHeaders = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("erp_token") || ""}` });
const fmt = (n: number) => new Intl.NumberFormat("he-IL").format(Math.round(Number(n) || 0));
const fmtC = (n: number) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", minimumFractionDigits: 0 }).format(Number(n) || 0);

const TIER_COLORS: Record<string, { bg: string; text: string; border: string; badge: string }> = {
  VIP: { bg: "from-purple-900/40 to-purple-800/20", text: "text-purple-300", border: "border-purple-500/30", badge: "bg-purple-500/20 text-purple-300" },
  Gold: { bg: "from-amber-900/40 to-amber-800/20", text: "text-amber-300", border: "border-amber-500/30", badge: "bg-amber-500/20 text-amber-300" },
  Silver: { bg: "from-slate-800/40 to-slate-700/20", text: "text-slate-300", border: "border-slate-400/30", badge: "bg-slate-400/20 text-slate-300" },
  Bronze: { bg: "from-amber-900/40 to-amber-800/20", text: "text-amber-700", border: "border-amber-800/30", badge: "bg-amber-900/20 text-amber-700" },
};

function TierIcon({ tier }: { tier: string }) {
  if (tier === "VIP") return <Award className="w-5 h-5" />;
  return <Star className="w-5 h-5" />;
}

export default function SegmentationDashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);

  const load = () => {
    setLoading(true);
    authFetch(`${API}/crm/segmentation/dashboard`, { headers: getHeaders() })
      .then(r => r.json()).then(setData).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const calculate = async () => {
    setCalculating(true);
    try {
      await authFetch(`${API}/crm/rfm/calculate`, { method: "POST", headers: getHeaders() });
      load();
    } catch (e) {}
    setCalculating(false);
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-6 h-6 animate-spin text-primary" />
    </div>
  );

  const tiers: any[] = data?.tier_distribution || [];
  const topCustomers: any[] = data?.top_customers || [];
  const migrations: any[] = data?.tier_migrations || [];
  const overall = data?.overall || {};
  const chartData: any[] = data?.chart_data || [];

  const totalCustomers = tiers.reduce((s: number, t: any) => s + Number(t.count || 0), 0);
  const totalRevenue = tiers.reduce((s: number, t: any) => s + Number(t.total_revenue || 0), 0);

  return (
    <div className="p-3 sm:p-6 space-y-5" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-primary" />
            דשבורד סגמנטציה — RFM
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">ניתוח רמות לקוחות לפי Recency, Frequency, Monetary</p>
        </div>
        <button onClick={calculate} disabled={calculating} className="btn btn-outline btn-sm flex items-center gap-2">
          {calculating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          חשב RFM
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "סה\"כ לקוחות מדורגים", value: fmt(totalCustomers), icon: Users, color: "text-blue-400" },
          { label: "הכנסה כוללת", value: fmtC(totalRevenue), icon: DollarSign, color: "text-green-400" },
          { label: "לקוחות VIP", value: fmt(tiers.find((t: any) => t.tier === "VIP")?.count || 0), icon: Award, color: "text-purple-400" },
          { label: "לקוחות זהב", value: fmt(tiers.find((t: any) => t.tier === "Gold")?.count || 0), icon: Star, color: "text-amber-400" },
        ].map((k, i) => (
          <div key={i} className="bg-card border rounded-lg p-3 text-center">
            <k.icon className={`w-5 h-5 mx-auto mb-1 ${k.color}`} />
            <div className="text-lg font-bold">{k.value}</div>
            <div className="text-xs text-muted-foreground">{k.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {["VIP", "Gold", "Silver", "Bronze"].map(tier => {
          const tierData = tiers.find((t: any) => t.tier === tier) || { count: 0, total_revenue: 0, avg_rfm: 0 };
          const colors = TIER_COLORS[tier];
          const pct = totalCustomers > 0 ? ((Number(tierData.count) / totalCustomers) * 100).toFixed(1) : "0";
          return (
            <div key={tier} className={`rounded-xl border ${colors.border} bg-gradient-to-br ${colors.bg} p-4`}>
              <div className={`flex items-center gap-2 mb-3 ${colors.text}`}>
                <TierIcon tier={tier} />
                <h3 className="font-bold text-base">{tier}</h3>
                <span className={`mr-auto text-xs px-2 py-0.5 rounded-full ${colors.badge}`}>{pct}%</span>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">לקוחות</span>
                  <span className={`font-bold ${colors.text}`}>{fmt(tierData.count)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">הכנסה</span>
                  <span className="font-medium">{fmtC(tierData.total_revenue)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">ממוצע RFM</span>
                  <span className="font-medium">{Number(tierData.avg_rfm || 0).toFixed(1)}</span>
                </div>
                <div className="mt-2 bg-black/20 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${colors.text.replace("text-", "bg-").replace("-300", "-500").replace("-400", "-500")}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-card border rounded-xl p-4">
          <h3 className="font-semibold mb-3 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-primary" />מעברים בין רמות</h3>
          {migrations.length === 0 ? (
            <div className="text-center text-muted-foreground py-8 text-sm">אין מעברים זוהו עדיין<br /><span className="text-xs">חשב RFM כדי לאתר מעברים</span></div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {migrations.map((m: any, i: number) => {
                const prevColors = TIER_COLORS[m.previous_tier] || TIER_COLORS.Bronze;
                const newColors = TIER_COLORS[m.new_tier] || TIER_COLORS.Bronze;
                const isUpgrade = ["VIP", "Gold", "Silver", "Bronze"].indexOf(m.new_tier) < ["VIP", "Gold", "Silver", "Bronze"].indexOf(m.previous_tier);
                return (
                  <div key={i} className="flex items-center gap-2 text-sm p-2 rounded-lg hover:bg-muted/20">
                    <span className={`px-2 py-0.5 rounded text-xs ${prevColors.badge}`}>{m.previous_tier}</span>
                    {isUpgrade ? <ArrowUpRight className="w-4 h-4 text-green-400" /> : <ArrowDownRight className="w-4 h-4 text-red-400" />}
                    <span className={`px-2 py-0.5 rounded text-xs ${newColors.badge}`}>{m.new_tier}</span>
                    <span className="mr-auto text-muted-foreground">{fmt(m.count)} לקוחות</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="bg-card border rounded-xl p-4">
          <h3 className="font-semibold mb-3 flex items-center gap-2"><Award className="w-4 h-4 text-amber-400" />לקוחות מובילים</h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {topCustomers.slice(0, 10).map((c: any, i: number) => {
              const tierColors = TIER_COLORS[c.tier] || TIER_COLORS.Bronze;
              return (
                <div key={i} className="flex items-center gap-2 text-sm p-2 rounded-lg hover:bg-muted/20">
                  <span className="text-muted-foreground w-5 text-right">{i + 1}.</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{c.customer_name}</div>
                    <div className="text-xs text-muted-foreground">RFM: {c.rfm_total || "-"} | {fmtC(c.monetary_total)}</div>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-xs ${tierColors.badge}`}>{c.tier}</span>
                </div>
              );
            })}
            {topCustomers.length === 0 && (
              <div className="text-center text-muted-foreground py-8 text-sm">אין נתונים<br /><span className="text-xs">לחץ על "חשב RFM" כדי לאתחל</span></div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-card border rounded-xl p-4">
        <h3 className="font-semibold mb-3 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary" />מגמת סגמנטים לאורך זמן
        </h3>
        {chartData.length === 0 ? (
          <div className="text-center text-muted-foreground py-10 text-sm">
            אין נתוני מגמה עדיין<br /><span className="text-xs">לחץ על "חשב RFM" פעמיים לצפות במגמה</span>
          </div>
        ) : (
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#94a3b8" }} />
                <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: "#e2e8f0" }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="VIP" fill="#a855f7" radius={[2, 2, 0, 0]} />
                <Bar dataKey="Gold" fill="#f59e0b" radius={[2, 2, 0, 0]} />
                <Bar dataKey="Silver" fill="#94a3b8" radius={[2, 2, 0, 0]} />
                <Bar dataKey="Bronze" fill="#92400e" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="bg-card border rounded-xl p-4">
        <h3 className="font-semibold mb-4 flex items-center gap-2"><BarChart3 className="w-4 h-4 text-primary" />מדריך ציוני RFM</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
            <div className="font-semibold text-blue-400 mb-2">R — עדכניות (Recency)</div>
            <div className="space-y-1 text-xs text-muted-foreground">
              <div>5 — עד 30 יום</div>
              <div>4 — 31–60 יום</div>
              <div>3 — 61–90 יום</div>
              <div>2 — 91–180 יום</div>
              <div>1 — מעל 180 יום</div>
            </div>
          </div>
          <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3">
            <div className="font-semibold text-green-400 mb-2">F — תדירות (Frequency)</div>
            <div className="space-y-1 text-xs text-muted-foreground">
              <div>5 — 20+ הזמנות</div>
              <div>4 — 10–19 הזמנות</div>
              <div>3 — 5–9 הזמנות</div>
              <div>2 — 2–4 הזמנות</div>
              <div>1 — הזמנה אחת</div>
            </div>
          </div>
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
            <div className="font-semibold text-amber-400 mb-2">M — כספי (Monetary)</div>
            <div className="space-y-1 text-xs text-muted-foreground">
              <div>5 — מעל ₪500,000</div>
              <div>4 — ₪100,000–500,000</div>
              <div>3 — ₪50,000–100,000</div>
              <div>2 — ₪10,000–50,000</div>
              <div>1 — פחות מ-₪10,000</div>
            </div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="px-2 py-1 rounded bg-purple-500/20 text-purple-300">VIP: סכום ≥ 13</span>
          <span className="px-2 py-1 rounded bg-amber-500/20 text-amber-300">זהב: 10–12</span>
          <span className="px-2 py-1 rounded bg-slate-400/20 text-slate-300">כסף: 7–9</span>
          <span className="px-2 py-1 rounded bg-amber-900/20 text-amber-700">ברונזה: 3–6</span>
        </div>
      </div>
    </div>
  );
}
