import { useState, useEffect } from "react";
import { BarChart3, TrendingUp, DollarSign, Target, RefreshCw, Filter } from "lucide-react";
import { authFetch } from "@/lib/utils";
import ActivityLog from "@/components/activity-log";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from "recharts";

const API = "/api";
const token = () => localStorage.getItem("erp_token") || localStorage.getItem("erp_token") || "";
const h = () => ({ Authorization: `Bearer ${token()}` });
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const fmtMoney = (v: any) => `₪${fmt(v)}`;

const COLORS = ["#8b5cf6", "#06b6d4", "#10b981", "#f59e0b", "#ef4444", "#ec4899"];

const MONTHS_HE = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];

function buildMonthlyData(campaigns: any[], budgetLines: any[]) {
  const byMonth: Record<string, any> = {};
  for (let m = 0; m < 12; m++) {
    const key = MONTHS_HE[m];
    byMonth[key] = { month: key, spend: 0, leads: 0, conversions: 0, roi: 0, count: 0 };
  }
  campaigns.forEach(c => {
    const month = c.start_date ? MONTHS_HE[new Date(c.start_date).getMonth()] : null;
    if (month && byMonth[month]) {
      byMonth[month].spend += Number(c.actual_spend || 0);
      byMonth[month].leads += Number(c.leads_count || 0);
      byMonth[month].conversions += Number(c.conversions || 0);
      byMonth[month].roi += Number(c.roi || 0);
      byMonth[month].count++;
    }
  });
  budgetLines.forEach(b => {
    const month = b.month;
    if (month && byMonth[month]) {
      if (!campaigns.length) {
        byMonth[month].spend += Number(b.actual_spend || 0);
      }
    }
  });
  return Object.values(byMonth).map(m => ({
    ...m,
    roi: m.count > 0 ? (m.roi / m.count) : 0,
    costPerLead: m.leads > 0 ? m.spend / m.leads : 0,
  }));
}

function buildChannelData(campaigns: any[]) {
  const byChannel: Record<string, any> = {};
  campaigns.forEach(c => {
    const ch = c.channel || c.channels || "אחר";
    if (!byChannel[ch]) byChannel[ch] = { channel: ch, spend: 0, leads: 0, conversions: 0, count: 0 };
    byChannel[ch].spend += Number(c.actual_spend || c.spent || 0);
    byChannel[ch].leads += Number(c.leads_count || 0);
    byChannel[ch].conversions += Number(c.conversions || 0);
    byChannel[ch].count++;
  });
  return Object.values(byChannel).map(c => ({
    ...c,
    costPerLead: c.leads > 0 ? c.spend / c.leads : 0,
    conversionRate: c.leads > 0 ? ((c.conversions / c.leads) * 100) : 0,
  }));
}

function buildPlatformData(campaigns: any[]) {
  const byChannel: Record<string, number> = {};
  campaigns.forEach(c => {
    const ch = c.channel || c.channels || "אחר";
    byChannel[ch] = (byChannel[ch] || 0) + Number(c.actual_spend || c.spent || 0);
  });
  return Object.entries(byChannel).map(([name, value]) => ({ name, value }));
}

export default function MarketingAnalyticsPage() {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [budgetLines, setBudgetLines] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("year");

  const load = async () => {
    setLoading(true);
    try {
      const [campRes, budgetRes, statsRes] = await Promise.all([
        authFetch(`${API}/marketing/campaigns`, { headers: h() }),
        authFetch(`${API}/marketing/budget`, { headers: h() }),
        authFetch(`${API}/marketing/campaigns/stats`, { headers: h() }),
      ]);
      setCampaigns(Array.isArray(await campRes.clone().json()) ? await campRes.json() : []);
      setBudgetLines(Array.isArray(await budgetRes.clone().json()) ? await budgetRes.json() : []);
      setStats(await statsRes.json() || {});
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const monthlyData = buildMonthlyData(campaigns, budgetLines);
  const channelData = buildChannelData(campaigns);
  const platformData = buildPlatformData(campaigns);

  const kpis = [
    { label: "ROI ממוצע", value: `${fmt(stats.avg_roi)}%`, color: "text-green-400", icon: TrendingUp },
    { label: "עלות-ליד ממוצעת", value: fmtMoney(stats.total_spend && stats.total_leads ? (Number(stats.total_spend) / Number(stats.total_leads)) : 0), color: "text-blue-400", icon: DollarSign },
    { label: "שיעור המרה", value: `${stats.total_leads > 0 ? ((stats.total_conversions / stats.total_leads) * 100).toFixed(1) : 0}%`, color: "text-purple-400", icon: Target },
    { label: "הכנסות כוללות", value: fmtMoney(stats.total_revenue), color: "text-emerald-400", icon: BarChart3 },
  ];

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-muted border border-border rounded-lg p-3 text-sm">
        <p className="text-gray-300 font-medium mb-1">{label}</p>
        {payload.map((p: any, i: number) => (
          <p key={i} style={{ color: p.color }}>
            {p.name}: {typeof p.value === "number" && p.value > 1000 ? fmtMoney(p.value) : fmt(p.value)}
          </p>
        ))}
      </div>
    );
  };

  return (
    <div dir="rtl" className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <BarChart3 className="text-purple-400" size={28} />
            <h1 className="text-lg sm:text-2xl font-bold text-foreground">אנליטיקס שיווקי</h1>
          </div>
          <p className="text-muted-foreground text-sm mt-1 mr-10">ניתוח ביצועי קמפיינים, ערוצים ופלטפורמות</p>
        </div>
        <div className="flex gap-2">
          <select
            value={period}
            onChange={e => setPeriod(e.target.value)}
            className="bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground"
          >
            <option value="year">שנה נוכחית</option>
            <option value="quarter">רבעון נוכחי</option>
            <option value="month">חודש נוכחי</option>
          </select>
          <button onClick={load} className="flex items-center gap-2 px-3 py-2 bg-muted hover:bg-muted text-foreground rounded-lg text-sm">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />רענון
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpis.map((kpi, i) => (
          <div key={i} className="bg-background border border-border rounded-xl p-4">
            <kpi.icon className={`${kpi.color} mb-2`} size={20} />
            <div className={`text-lg sm:text-2xl font-bold ${kpi.color}`}>{kpi.value}</div>
            <div className="text-muted-foreground text-xs mt-1">{kpi.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-background border border-border rounded-xl p-5">
          <h3 className="text-foreground font-semibold mb-4 flex items-center gap-2">
            <TrendingUp size={16} className="text-green-400" />ROI לאורך זמן
          </h3>
          {loading ? (
            <div className="h-48 flex items-center justify-center text-muted-foreground">טוען...</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="month" tick={{ fill: "#9ca3af", fontSize: 11 }} />
                <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} unit="%" />
                <Tooltip content={<CustomTooltip />} />
                <Line type="monotone" dataKey="roi" stroke="#10b981" strokeWidth={2} dot={{ r: 3, fill: "#10b981" }} name="ROI%" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-background border border-border rounded-xl p-5">
          <h3 className="text-foreground font-semibold mb-4 flex items-center gap-2">
            <DollarSign size={16} className="text-blue-400" />עלות-ליד לפי ערוץ
          </h3>
          {loading ? (
            <div className="h-48 flex items-center justify-center text-muted-foreground">טוען...</div>
          ) : channelData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-muted-foreground">אין נתונים</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={channelData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis type="number" tick={{ fill: "#9ca3af", fontSize: 11 }} />
                <YAxis dataKey="channel" type="category" tick={{ fill: "#9ca3af", fontSize: 11 }} width={70} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="costPerLead" fill="#8b5cf6" radius={[0, 4, 4, 0]} name="עלות/ליד" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-background border border-border rounded-xl p-5">
          <h3 className="text-foreground font-semibold mb-4 flex items-center gap-2">
            <BarChart3 size={16} className="text-purple-400" />התפלגות הוצאות לפי ערוץ
          </h3>
          {loading ? (
            <div className="h-48 flex items-center justify-center text-muted-foreground">טוען...</div>
          ) : platformData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-muted-foreground">אין נתונים</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={platformData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={90}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {platformData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: any) => fmtMoney(v)} />
                <Legend formatter={(v: string) => <span style={{ color: "#9ca3af", fontSize: "12px" }}>{v}</span>} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-background border border-border rounded-xl p-5">
          <h3 className="text-foreground font-semibold mb-4 flex items-center gap-2">
            <Target size={16} className="text-orange-400" />השוואת ביצועי פלטפורמות
          </h3>
          {loading ? (
            <div className="h-48 flex items-center justify-center text-muted-foreground">טוען...</div>
          ) : channelData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-muted-foreground">אין נתונים</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={channelData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="channel" tick={{ fill: "#9ca3af", fontSize: 11 }} />
                <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend formatter={(v: string) => <span style={{ color: "#9ca3af", fontSize: "12px" }}>{v}</span>} />
                <Bar dataKey="leads" fill="#8b5cf6" radius={[4, 4, 0, 0]} name="לידים" />
                <Bar dataKey="conversions" fill="#10b981" radius={[4, 4, 0, 0]} name="המרות" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="bg-background border border-border rounded-xl p-5">
        <h3 className="text-foreground font-semibold mb-4 flex items-center gap-2">
          <DollarSign size={16} className="text-yellow-400" />מגמות חודשיות — הוצאות ולידים
        </h3>
        {loading ? (
          <div className="h-48 flex items-center justify-center text-muted-foreground">טוען...</div>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="month" tick={{ fill: "#9ca3af", fontSize: 11 }} />
              <YAxis yAxisId="left" tick={{ fill: "#9ca3af", fontSize: 11 }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fill: "#9ca3af", fontSize: 11 }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend formatter={(v: string) => <span style={{ color: "#9ca3af", fontSize: "12px" }}>{v}</span>} />
              <Line yAxisId="left" type="monotone" dataKey="spend" stroke="#8b5cf6" strokeWidth={2} dot={false} name="הוצאה (₪)" />
              <Line yAxisId="right" type="monotone" dataKey="leads" stroke="#f59e0b" strokeWidth={2} dot={false} name="לידים" />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="bg-background border border-border rounded-xl overflow-hidden">
        <div className="p-4 border-b border-border">
          <h3 className="text-foreground font-semibold flex items-center gap-2">
            <BarChart3 size={16} className="text-purple-400" />ביצועי ערוצים בפירוט
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="text-right p-3">ערוץ</th>
                <th className="text-right p-3">קמפיינים</th>
                <th className="text-right p-3">הוצאה</th>
                <th className="text-right p-3">לידים</th>
                <th className="text-right p-3">המרות</th>
                <th className="text-right p-3">עלות/ליד</th>
                <th className="text-right p-3">שיעור המרה</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">טוען...</td></tr>
              ) : channelData.length === 0 ? (
                <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">אין נתונים</td></tr>
              ) : channelData.map((ch, i) => (
                <tr key={i} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="p-3 text-foreground font-medium">{ch.channel}</td>
                  <td className="p-3 text-gray-300">{ch.count}</td>
                  <td className="p-3 text-gray-300">{fmtMoney(ch.spend)}</td>
                  <td className="p-3 text-gray-300">{fmt(ch.leads)}</td>
                  <td className="p-3 text-gray-300">{fmt(ch.conversions)}</td>
                  <td className="p-3 text-blue-400">{fmtMoney(ch.costPerLead)}</td>
                  <td className="p-3">
                    <span className={ch.conversionRate > 5 ? "text-green-400" : ch.conversionRate > 2 ? "text-yellow-400" : "text-red-400"}>
                      {fmt(ch.conversionRate)}%
                    </span>
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
