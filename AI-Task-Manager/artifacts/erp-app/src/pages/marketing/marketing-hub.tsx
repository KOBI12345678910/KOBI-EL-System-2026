import { useState, useEffect } from "react";
import { Link } from "wouter";
import { authFetch } from "@/lib/utils";
import ActivityLog from "@/components/activity-log";
import BulkActions, { useBulkSelection, BulkCheckbox } from "@/components/bulk-actions";
import {
  Megaphone, DollarSign, Users, TrendingUp, Target, ArrowUpRight, ArrowDownRight,
  Search, Filter, Plus, RefreshCw, Plug, BarChart3, ChevronRight, Activity,
  Globe, Mail, Share2, CalendarDays
} from "lucide-react";

const API = "/api";
const token = () => localStorage.getItem("erp_token") || localStorage.getItem("erp_token") || "";
const h = () => ({ Authorization: `Bearer ${token()}`, "Content-Type": "application/json" });
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const fmtMoney = (v: any) => `₪${fmt(v)}`;

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  "פעיל": { label: "פעיל", color: "bg-green-500/20 text-green-400 border-green-500/30" },
  "מושהה": { label: "מושהה", color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
  "הסתיים": { label: "הסתיים", color: "bg-muted/20 text-muted-foreground border-gray-500/30" },
  "טיוטה": { label: "טיוטה", color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  "active": { label: "פעיל", color: "bg-green-500/20 text-green-400 border-green-500/30" },
  "paused": { label: "מושהה", color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
  "completed": { label: "הסתיים", color: "bg-muted/20 text-muted-foreground border-gray-500/30" },
  "draft": { label: "טיוטה", color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
};

const CHANNEL_ICONS: Record<string, React.ReactNode> = {
  "גוגל": <Globe size={14} />,
  "פייסבוק": <Share2 size={14} />,
  "אינסטגרם": <Share2 size={14} />,
  "אימייל": <Mail size={14} />,
  "email": <Mail size={14} />,
  "social": <Share2 size={14} />,
  "digital": <Globe size={14} />,
};

export default function MarketingHubPage() {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [budgetStats, setBudgetStats] = useState<any>({});
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const { selectedIds, toggle, toggleAll, clear, isSelected } = useBulkSelection();

  const load = async () => {
    setLoading(true);
    try {
      const [campRes, statsRes, budgetRes] = await Promise.all([
        authFetch(`${API}/marketing/campaigns`, { headers: h() }),
        authFetch(`${API}/marketing/campaigns/stats`, { headers: h() }),
        authFetch(`${API}/marketing/budget/stats`, { headers: h() }),
      ]);
      const campData = await campRes.json();
      const statsData = await statsRes.json();
      const budgetData = await budgetRes.json();
      setCampaigns(Array.isArray(campData) ? campData : []);
      setStats(statsData || {});
      setBudgetStats(budgetData || {});
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = campaigns.filter(c => {
    if (filterStatus !== "all" && c.status !== filterStatus) return false;
    if (search && !c.campaign_name?.toLowerCase().includes(search.toLowerCase()) &&
        !c.name?.toLowerCase().includes(search.toLowerCase()) &&
        !c.channel?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const kpis = [
    {
      label: "הוצאה כוללת",
      value: fmtMoney(stats.total_spend || budgetStats.total_spent),
      sub: `מתוך ${fmtMoney(budgetStats.total_budget)} תקציב`,
      icon: DollarSign,
      color: "text-blue-400",
      bg: "bg-blue-500/10 border-blue-500/20",
      trend: null,
    },
    {
      label: "סה\"כ לידים",
      value: fmt(stats.total_leads),
      sub: "מכלל הקמפיינים",
      icon: Users,
      color: "text-purple-400",
      bg: "bg-purple-500/10 border-purple-500/20",
      trend: null,
    },
    {
      label: "המרות",
      value: fmt(stats.total_conversions),
      sub: `${stats.total_leads > 0 ? ((stats.total_conversions / stats.total_leads) * 100).toFixed(1) : 0}% מהלידים`,
      icon: Target,
      color: "text-green-400",
      bg: "bg-green-500/10 border-green-500/20",
      trend: null,
    },
    {
      label: "ROI ממוצע",
      value: `${fmt(stats.avg_roi)}%`,
      sub: "על פני כל הקמפיינים",
      icon: TrendingUp,
      color: Number(stats.avg_roi) >= 0 ? "text-emerald-400" : "text-red-400",
      bg: Number(stats.avg_roi) >= 0 ? "bg-emerald-500/10 border-emerald-500/20" : "bg-red-500/10 border-red-500/20",
      trend: Number(stats.avg_roi) >= 0 ? "up" : "down",
    },
    {
      label: "קמפיינים פעילים",
      value: fmt(stats.active),
      sub: `מתוך ${fmt(stats.total)} סה"כ`,
      icon: Megaphone,
      color: "text-orange-400",
      bg: "bg-orange-500/10 border-orange-500/20",
      trend: null,
    },
  ];

  return (
    <div dir="rtl" className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Megaphone className="text-purple-400" size={28} />
            <h1 className="text-lg sm:text-2xl font-bold text-foreground">Marketing Hub</h1>
          </div>
          <p className="text-muted-foreground text-sm mt-1 mr-10">מרכז שיווק מרכזי — ניהול קמפיינים, פלטפורמות וביצועים</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="flex items-center gap-2 px-3 py-2 bg-muted hover:bg-muted text-foreground rounded-lg text-sm">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />רענון
          </button>
          <Link href="/marketing/integrations">
            <button className="flex items-center gap-2 px-3 py-2 bg-muted hover:bg-muted text-foreground rounded-lg text-sm">
              <Plug size={14} />פלטפורמות מחוברות
            </button>
          </Link>
          <Link href="/marketing/analytics">
            <button className="flex items-center gap-2 px-3 py-2 bg-muted hover:bg-muted text-foreground rounded-lg text-sm">
              <BarChart3 size={14} />אנליטיקס
            </button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {kpis.map((kpi, i) => (
          <div key={i} className={`${kpi.bg} border rounded-xl p-4`}>
            <div className="flex items-center justify-between mb-2">
              <kpi.icon className={kpi.color} size={20} />
              {kpi.trend === "up" && <ArrowUpRight size={16} className="text-emerald-400" />}
              {kpi.trend === "down" && <ArrowDownRight size={16} className="text-red-400" />}
            </div>
            <div className={`text-xl font-bold ${kpi.color}`}>{kpi.value}</div>
            <div className="text-xs text-muted-foreground mt-1">{kpi.label}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{kpi.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        {[
          { href: "/marketing/campaigns", label: "קמפיינים", icon: Megaphone, color: "text-purple-400", desc: "ניהול קמפיינים שיווקיים" },
          { href: "/marketing/content-calendar", label: "לוח תוכן", icon: CalendarDays, color: "text-indigo-400", desc: "תכנון ופרסום תוכן" },
          { href: "/marketing/social-media", label: "רשתות חברתיות", icon: Share2, color: "text-pink-400", desc: "מדדי מדיה חברתית" },
          { href: "/marketing/email-campaigns", label: "דיוור אלקטרוני", icon: Mail, color: "text-teal-400", desc: "קמפייני אימייל" },
        ].map((item, i) => (
          <Link key={i} href={item.href}>
            <div className="bg-muted/50 border border-border rounded-xl p-4 hover:bg-muted/50 cursor-pointer transition-colors group">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <item.icon className={item.color} size={20} />
                  <div>
                    <div className="text-foreground font-medium text-sm">{item.label}</div>
                    <div className="text-muted-foreground text-xs">{item.desc}</div>
                  </div>
                </div>
                <ChevronRight size={16} className="text-muted-foreground group-hover:text-gray-300 transition-colors" />
              </div>
            </div>
          </Link>
        ))}
      </div>

      <div className="bg-background border border-border rounded-xl">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Activity size={18} className="text-purple-400" />
            <h2 className="text-foreground font-semibold">קמפיינים</h2>
            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{filtered.length}</span>
          </div>
          <div className="flex gap-2">
            <div className="relative">
              <Search className="absolute right-3 top-2 text-muted-foreground" size={14} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="חיפוש..."
                className="bg-muted border border-border rounded-lg pr-9 pl-3 py-1.5 text-sm text-foreground w-48"
              />
            </div>
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="bg-muted border border-border rounded-lg px-3 py-1.5 text-sm text-foreground"
            >
              <option value="all">כל הסטטוסים</option>
              <option value="פעיל">פעיל</option>
              <option value="מושהה">מושהה</option>
              <option value="הסתיים">הסתיים</option>
              <option value="טיוטה">טיוטה</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="completed">Completed</option>
            </select>
            <Link href="/marketing/campaigns">
              <button className="flex items-center gap-1 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-foreground rounded-lg text-sm">
                <Plus size={14} />חדש
              </button>
            </Link>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="p-3 w-10"><BulkCheckbox checked={selectedIds.length === filtered.length && filtered.length > 0} onChange={() => toggleAll(filtered.map((r: any) => r.id))} /></th>
                <th className="text-right p-3">שם קמפיין</th>
                <th className="text-right p-3">ערוץ</th>
                <th className="text-right p-3">תקציב</th>
                <th className="text-right p-3">הוצאה</th>
                <th className="text-right p-3">לידים</th>
                <th className="text-right p-3">המרות</th>
                <th className="text-right p-3">ROI</th>
                <th className="text-right p-3">תאריך סיום</th>
                <th className="text-right p-3">סטטוס</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">טוען...</td></tr>
              )}
              {!loading && filtered.map((c: any) => {
                const status = STATUS_MAP[c.status] || { label: c.status, color: "bg-muted/20 text-muted-foreground border-gray-500/30" };
                const name = c.campaign_name || c.name || "-";
                const channel = c.channel || c.channels || "-";
                const budget = c.budget || "0";
                const spend = c.actual_spend || c.spent || "0";
                const leads = c.leads_count || "0";
                const conv = c.conversions || "0";
                const roi = c.roi || "0";
                const endDate = c.end_date || c.endDate || null;
                const channelIcon = CHANNEL_ICONS[channel];
                return (
                  <tr key={c.id} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="p-3"><BulkCheckbox checked={isSelected(c.id)} onChange={() => toggle(c.id)} /></td>
                    <td className="p-3 text-foreground font-medium">{name}</td>
                    <td className="p-3 text-gray-300">
                      <div className="flex items-center gap-1.5">
                        {channelIcon && <span className="text-muted-foreground">{channelIcon}</span>}
                        {channel}
                      </div>
                    </td>
                    <td className="p-3 text-gray-300">{fmtMoney(budget)}</td>
                    <td className="p-3 text-gray-300">{fmtMoney(spend)}</td>
                    <td className="p-3 text-gray-300">{fmt(leads)}</td>
                    <td className="p-3 text-gray-300">{fmt(conv)}</td>
                    <td className="p-3">
                      <span className={Number(roi) >= 0 ? "text-emerald-400" : "text-red-400"}>
                        {fmt(roi)}%
                      </span>
                    </td>
                    <td className="p-3 text-muted-foreground text-xs">{endDate || "-"}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs border ${status.color}`}>
                        {status.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">אין קמפיינים</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
