import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { authFetch } from "@/lib/utils";
import {
  Share2, Search, Plus, Edit2, Trash2, X, Save, Eye, ArrowUpDown, AlertTriangle,
  Facebook, Instagram, Youtube, Linkedin, Globe, Target, TrendingUp, Users, MessageSquare,
  Heart, Send, Clock, BarChart3, Megaphone, UserPlus, DollarSign, Calendar, Filter,
  ChevronDown, RefreshCw, Zap, Play, Pause
} from "lucide-react";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (n: any) => Number(n || 0).toLocaleString("he-IL");
const fmtC = (n: any) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", minimumFractionDigits: 0 }).format(Number(n || 0));

const PLATFORMS = [
  { key: "facebook", label: "פייסבוק", icon: Facebook, color: "text-blue-500", bg: "bg-blue-500/10" },
  { key: "instagram", label: "אינסטגרם", icon: Instagram, color: "text-pink-500", bg: "bg-pink-500/10" },
  { key: "tiktok", label: "טיקטוק", icon: Zap, color: "text-cyan-400", bg: "bg-cyan-400/10" },
  { key: "youtube", label: "יוטיוב", icon: Youtube, color: "text-red-500", bg: "bg-red-500/10" },
  { key: "linkedin", label: "לינקדאין", icon: Linkedin, color: "text-blue-400", bg: "bg-blue-400/10" },
  { key: "google_business", label: "גוגל עסקי", icon: Globe, color: "text-green-500", bg: "bg-green-500/10" },
];
const PLATFORM_MAP = Object.fromEntries(PLATFORMS.map(p => [p.key, p]));

const POST_TYPES = ["image", "video", "carousel", "story", "reel"];
const POST_STATUSES = [
  { key: "draft", label: "טיוטה", color: "text-gray-400", bg: "bg-gray-500/10" },
  { key: "scheduled", label: "מתוזמן", color: "text-amber-400", bg: "bg-amber-500/10" },
  { key: "published", label: "פורסם", color: "text-green-400", bg: "bg-green-500/10" },
  { key: "failed", label: "נכשל", color: "text-red-400", bg: "bg-red-500/10" },
];
const STATUS_MAP = Object.fromEntries(POST_STATUSES.map(s => [s.key, s]));

const CAMPAIGN_GOALS = [
  { key: "brand_awareness", label: "מודעות למותג" },
  { key: "lead_generation", label: "יצירת לידים" },
  { key: "engagement", label: "מעורבות" },
  { key: "sales", label: "מכירות" },
];
const CAMPAIGN_STATUSES = ["planning", "active", "paused", "completed"];
const CAMPAIGN_STATUS_MAP: Record<string, { label: string; color: string }> = {
  planning: { label: "תכנון", color: "text-gray-400" },
  active: { label: "פעיל", color: "text-green-400" },
  paused: { label: "מושהה", color: "text-amber-400" },
  completed: { label: "הושלם", color: "text-blue-400" },
};

const LEAD_STATUSES = [
  { key: "new", label: "חדש", color: "text-blue-400", bg: "bg-blue-500/10" },
  { key: "contacted", label: "נוצר קשר", color: "text-amber-400", bg: "bg-amber-500/10" },
  { key: "qualified", label: "מוסמך", color: "text-purple-400", bg: "bg-purple-500/10" },
  { key: "converted", label: "הומר", color: "text-green-400", bg: "bg-green-500/10" },
];
const LEAD_STATUS_MAP = Object.fromEntries(LEAD_STATUSES.map(s => [s.key, s]));

type Tab = "dashboard" | "accounts" | "posts" | "campaigns" | "leads";

export default function SocialMarketing() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [dashboard, setDashboard] = useState<any>({});
  const [accounts, setAccounts] = useState<any[]>([]);
  const [posts, setPosts] = useState<any[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [formType, setFormType] = useState<"account" | "post" | "campaign" | "lead">("post");
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const [dRes, aRes, pRes, cRes, lRes] = await Promise.all([
        authFetch(`${API}/social/dashboard`).catch(() => null),
        authFetch(`${API}/social/accounts`),
        authFetch(`${API}/social/posts`),
        authFetch(`${API}/social/campaigns`),
        authFetch(`${API}/social/leads`),
      ]);
      if (dRes?.ok) setDashboard(await dRes.json());
      if (aRes.ok) setAccounts(safeArray(await aRes.json()));
      if (pRes.ok) setPosts(safeArray(await pRes.json()));
      if (cRes.ok) setCampaigns(safeArray(await cRes.json()));
      if (lRes.ok) setLeads(safeArray(await lRes.json()));
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const openCreate = (type: typeof formType) => {
    setFormType(type); setEditing(null);
    if (type === "account") setForm({ platform: "facebook", status: "connected" });
    else if (type === "post") setForm({ postType: "image", status: "draft" });
    else if (type === "campaign") setForm({ goal: "brand_awareness", status: "planning", platforms: [] });
    else setForm({ status: "new" });
    setShowForm(true);
  };
  const openEdit = (type: typeof formType, r: any) => {
    setFormType(type); setEditing(r);
    if (type === "account") setForm({ platform: r.platform, accountName: r.account_name, accountId: r.account_id, status: r.status, followersCount: r.followers_count });
    else if (type === "post") setForm({ accountId: r.account_id, campaignId: r.campaign_id, content: r.content, postType: r.post_type, scheduledAt: r.scheduled_at?.slice(0, 16), status: r.status });
    else if (type === "campaign") setForm({ name: r.name, goal: r.goal, platforms: r.platforms || [], budget: r.budget, spent: r.spent, leadsTarget: r.leads_target, status: r.status, startDate: r.start_date?.slice(0, 10), endDate: r.end_date?.slice(0, 10) });
    else setForm({ campaignId: r.campaign_id, platform: r.platform, name: r.name, phone: r.phone, email: r.email, message: r.message, status: r.status });
    setShowForm(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const endpoints: Record<string, string> = { account: "social/accounts", post: "social/posts", campaign: "social/campaigns", lead: "social/leads" };
      const url = editing ? `${API}/${endpoints[formType]}/${editing.id}` : `${API}/${endpoints[formType]}`;
      await authFetch(url, { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      setShowForm(false); load();
    } catch {} setSaving(false);
  };

  const remove = async (type: string, id: number) => {
    const endpoints: Record<string, string> = { account: "social/accounts", post: "social/posts", campaign: "social/campaigns", lead: "social/leads" };
    await authFetch(`${API}/${endpoints[type]}/${id}`, { method: "DELETE" }); load();
  };

  const publishPost = async (id: number) => {
    await authFetch(`${API}/social/posts/${id}/publish`, { method: "POST" }); load();
  };

  const schedulePost = async (id: number) => {
    await authFetch(`${API}/social/posts/${id}/schedule`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) }); load();
  };

  const dash = dashboard;
  const kpis = [
    { label: "חשבונות מחוברים", value: fmt(dash.accounts?.connected || 0), sub: `${fmt(dash.accounts?.total_followers || 0)} עוקבים`, icon: Share2, color: "text-blue-400" },
    { label: "פוסטים שפורסמו", value: fmt(dash.posts?.published || 0), sub: `${fmt(dash.posts?.scheduled || 0)} מתוזמנים`, icon: Send, color: "text-green-400" },
    { label: "קמפיינים פעילים", value: fmt(dash.campaigns?.active || 0), sub: fmtC(dash.campaigns?.total_spent || 0) + " הוצאה", icon: Megaphone, color: "text-purple-400" },
    { label: "לידים חדשים", value: fmt(dash.leads?.new_leads || 0), sub: `${fmt(dash.leads?.converted || 0)} הומרו`, icon: UserPlus, color: "text-amber-400" },
  ];

  const tabs: { key: Tab; label: string; icon: any }[] = [
    { key: "dashboard", label: "דשבורד", icon: BarChart3 },
    { key: "accounts", label: "חשבונות", icon: Share2 },
    { key: "posts", label: "פוסטים", icon: MessageSquare },
    { key: "campaigns", label: "קמפיינים", icon: Megaphone },
    { key: "leads", label: "לידים", icon: UserPlus },
  ];

  const filteredPosts = posts.filter(p => !search || [p.content, p.platform, p.account_name].some(f => f?.toLowerCase().includes(search.toLowerCase())));
  const filteredLeads = leads.filter(l => !search || [l.name, l.phone, l.email, l.platform].some(f => f?.toLowerCase().includes(search.toLowerCase())));

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-white flex items-center gap-2"><Share2 className="text-blue-400 w-6 h-6" /> שיווק אוטומטי ברשתות חברתיות</h1>
          <p className="text-sm text-muted-foreground mt-1">ניהול חשבונות, פוסטים, קמפיינים ולידים מרשתות חברתיות</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={load} className="flex items-center gap-1.5 bg-card border border-border text-muted-foreground px-3 py-2 rounded-xl text-sm hover:bg-muted"><RefreshCw className="w-4 h-4" /></button>
          {tab === "accounts" && <button onClick={() => openCreate("account")} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl hover:bg-primary/90 shadow-lg text-sm font-medium"><Plus className="w-4 h-4" /> חשבון חדש</button>}
          {tab === "posts" && <button onClick={() => openCreate("post")} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl hover:bg-primary/90 shadow-lg text-sm font-medium"><Plus className="w-4 h-4" /> פוסט חדש</button>}
          {tab === "campaigns" && <button onClick={() => openCreate("campaign")} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl hover:bg-primary/90 shadow-lg text-sm font-medium"><Plus className="w-4 h-4" /> קמפיין חדש</button>}
          {tab === "leads" && <button onClick={() => openCreate("lead")} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl hover:bg-primary/90 shadow-lg text-sm font-medium"><Plus className="w-4 h-4" /> ליד חדש</button>}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpis.map((kpi, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="bg-card border border-border/50 rounded-2xl p-4">
            <kpi.icon className={`${kpi.color} w-5 h-5 mb-2`} /><div className="text-xl font-bold text-white">{kpi.value}</div><div className="text-xs text-muted-foreground">{kpi.label}</div>
            <div className="text-[10px] text-muted-foreground/70 mt-1">{kpi.sub}</div>
          </motion.div>
        ))}
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 bg-card border border-border/50 rounded-xl p-1 overflow-x-auto">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm whitespace-nowrap transition-colors ${tab === t.key ? "bg-primary text-primary-foreground font-medium" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"}`}>
            <t.icon className="w-4 h-4" />{t.label}
          </button>
        ))}
      </div>

      {/* Search */}
      {tab !== "dashboard" && (
        <div className="relative max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש..." className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
        </div>
      )}

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-16 bg-card border border-border/50 rounded-xl animate-pulse" />)}</div>
      ) : error ? (
        <div className="text-center py-16 text-red-400"><AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-50" /><p>{error}</p><button onClick={load} className="mt-4 px-4 py-2 bg-primary/20 text-primary rounded-lg text-sm">נסה שנית</button></div>
      ) : (
        <>
          {/* DASHBOARD TAB */}
          {tab === "dashboard" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Platform breakdown */}
                <div className="bg-card border border-border/50 rounded-2xl p-4">
                  <h3 className="font-bold text-white mb-3 flex items-center gap-2"><Share2 className="w-4 h-4 text-blue-400" /> חשבונות לפי פלטפורמה</h3>
                  <div className="space-y-2">
                    {accounts.length === 0 ? <p className="text-sm text-muted-foreground">אין חשבונות מחוברים</p> : accounts.map((a, i) => {
                      const pl = PLATFORM_MAP[a.platform];
                      const Icon = pl?.icon || Globe;
                      return (
                        <div key={i} className={`flex items-center justify-between p-2 rounded-lg ${pl?.bg || "bg-muted/10"}`}>
                          <div className="flex items-center gap-2"><Icon className={`w-4 h-4 ${pl?.color || ""}`} /><span className="text-sm text-white">{a.account_name || a.platform}</span></div>
                          <div className="flex items-center gap-3"><span className="text-xs text-muted-foreground">{fmt(a.followers_count)} עוקבים</span><Badge className={`text-[10px] ${a.status === 'connected' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>{a.status === 'connected' ? 'מחובר' : 'מנותק'}</Badge></div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                {/* Recent posts */}
                <div className="bg-card border border-border/50 rounded-2xl p-4">
                  <h3 className="font-bold text-white mb-3 flex items-center gap-2"><MessageSquare className="w-4 h-4 text-green-400" /> פוסטים אחרונים</h3>
                  <div className="space-y-2">
                    {(dash.recentPosts || []).length === 0 ? <p className="text-sm text-muted-foreground">אין פוסטים</p> : (dash.recentPosts || []).slice(0, 5).map((p: any, i: number) => {
                      const st = STATUS_MAP[p.status];
                      return (
                        <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-muted/10">
                          <div className="flex-1 min-w-0"><div className="text-sm text-white truncate">{p.content?.slice(0, 50) || "---"}</div><div className="text-[10px] text-muted-foreground">{p.platform} - {p.post_type}</div></div>
                          <Badge className={`text-[10px] ${st?.bg || ""} ${st?.color || ""}`}>{st?.label || p.status}</Badge>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
              {/* Engagement summary */}
              <div className="bg-card border border-border/50 rounded-2xl p-4">
                <h3 className="font-bold text-white mb-3 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-purple-400" /> סיכום מעורבות</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: "לייקים", value: fmt(dash.posts?.total_likes || 0), icon: Heart, color: "text-red-400" },
                    { label: "תגובות", value: fmt(dash.posts?.total_comments || 0), icon: MessageSquare, color: "text-blue-400" },
                    { label: "שיתופים", value: fmt(dash.posts?.total_shares || 0), icon: Share2, color: "text-green-400" },
                    { label: "חשיפה", value: fmt(dash.posts?.total_reach || 0), icon: Eye, color: "text-amber-400" },
                  ].map((m, i) => (
                    <div key={i} className="text-center p-3 bg-muted/10 rounded-xl">
                      <m.icon className={`w-5 h-5 mx-auto mb-1 ${m.color}`} /><div className="text-lg font-bold text-white">{m.value}</div><div className="text-xs text-muted-foreground">{m.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ACCOUNTS TAB */}
          {tab === "accounts" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {accounts.length === 0 ? (
                <div className="col-span-full text-center py-16 text-muted-foreground"><Share2 className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>אין חשבונות</p><button onClick={() => openCreate("account")} className="mt-4 px-5 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-medium mx-auto flex items-center gap-2"><Plus className="w-4 h-4" />חשבון חדש</button></div>
              ) : accounts.map(a => {
                const pl = PLATFORM_MAP[a.platform];
                const Icon = pl?.icon || Globe;
                return (
                  <div key={a.id} className={`bg-card border border-border/50 rounded-2xl p-4 hover:border-primary/30 transition-colors`}>
                    <div className="flex items-start justify-between mb-3">
                      <div className={`p-2 rounded-xl ${pl?.bg || "bg-muted/10"}`}><Icon className={`w-6 h-6 ${pl?.color || ""}`} /></div>
                      <div className="flex gap-1">
                        <button onClick={() => openEdit("account", a)} className="p-1.5 hover:bg-muted rounded-lg"><Edit2 className="w-3.5 h-3.5 text-muted-foreground" /></button>
                        <button onClick={() => remove("account", a.id)} className="p-1.5 hover:bg-red-500/10 rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                      </div>
                    </div>
                    <div className="text-white font-medium">{a.account_name || "---"}</div>
                    <div className="text-xs text-muted-foreground mt-1">{pl?.label || a.platform}</div>
                    <div className="flex items-center justify-between mt-3">
                      <span className="text-sm text-white font-bold">{fmt(a.followers_count)} <span className="text-xs font-normal text-muted-foreground">עוקבים</span></span>
                      <Badge className={`text-[10px] ${a.status === 'connected' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>{a.status === 'connected' ? 'מחובר' : 'מנותק'}</Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* POSTS TAB */}
          {tab === "posts" && (
            <div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30 border-b border-border/50">
                    <tr>
                      {["פלטפורמה", "תוכן", "סוג", "קמפיין", "סטטוס", "לייקים", "תגובות", "חשיפה", "פעולות"].map(h => (
                        <th key={h} className="px-3 py-3 text-right text-xs font-medium text-muted-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPosts.length === 0 ? (
                      <tr><td colSpan={99} className="text-center py-12 text-muted-foreground">אין פוסטים</td></tr>
                    ) : filteredPosts.map(p => {
                      const pl = PLATFORM_MAP[p.platform];
                      const Icon = pl?.icon || Globe;
                      const st = STATUS_MAP[p.status];
                      return (
                        <tr key={p.id} className="border-b border-border/20 hover:bg-muted/10">
                          <td className="px-3 py-2"><div className="flex items-center gap-1.5"><Icon className={`w-4 h-4 ${pl?.color || ""}`} /><span className="text-xs">{p.account_name || pl?.label || p.platform}</span></div></td>
                          <td className="px-3 py-2 max-w-[200px]"><div className="text-white truncate">{p.content?.slice(0, 60) || "---"}</div></td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">{p.post_type}</td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">{p.campaign_name || "---"}</td>
                          <td className="px-3 py-2"><Badge className={`text-[10px] ${st?.bg || ""} ${st?.color || ""}`}>{st?.label || p.status}</Badge></td>
                          <td className="px-3 py-2 text-xs">{fmt(p.likes)}</td>
                          <td className="px-3 py-2 text-xs">{fmt(p.comments)}</td>
                          <td className="px-3 py-2 text-xs">{fmt(p.reach)}</td>
                          <td className="px-3 py-2">
                            <div className="flex gap-1">
                              {p.status === "draft" && <button onClick={() => publishPost(p.id)} className="p-1 hover:bg-green-500/10 rounded" title="פרסם"><Play className="w-3.5 h-3.5 text-green-400" /></button>}
                              {p.status === "draft" && <button onClick={() => schedulePost(p.id)} className="p-1 hover:bg-amber-500/10 rounded" title="תזמן"><Clock className="w-3.5 h-3.5 text-amber-400" /></button>}
                              <button onClick={() => openEdit("post", p)} className="p-1 hover:bg-muted rounded"><Edit2 className="w-3.5 h-3.5 text-muted-foreground" /></button>
                              <button onClick={() => remove("post", p.id)} className="p-1 hover:bg-red-500/10 rounded"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* CAMPAIGNS TAB */}
          {tab === "campaigns" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {campaigns.length === 0 ? (
                <div className="col-span-full text-center py-16 text-muted-foreground"><Megaphone className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>אין קמפיינים</p></div>
              ) : campaigns.map(c => {
                const cs = CAMPAIGN_STATUS_MAP[c.status] || { label: c.status, color: "text-gray-400" };
                const progress = c.budget > 0 ? Math.min(100, (Number(c.spent) / Number(c.budget)) * 100) : 0;
                const leadsProgress = c.leads_target > 0 ? Math.min(100, (Number(c.leads_actual) / c.leads_target) * 100) : 0;
                return (
                  <div key={c.id} className="bg-card border border-border/50 rounded-2xl p-4 hover:border-primary/30 transition-colors">
                    <div className="flex items-start justify-between mb-2">
                      <div><div className="text-white font-bold">{c.name}</div><div className="text-xs text-muted-foreground">{CAMPAIGN_GOALS.find(g => g.key === c.goal)?.label || c.goal}</div></div>
                      <div className="flex items-center gap-2"><Badge className={`text-[10px] ${cs.color}`}>{cs.label}</Badge>
                        <button onClick={() => openEdit("campaign", c)} className="p-1 hover:bg-muted rounded"><Edit2 className="w-3.5 h-3.5 text-muted-foreground" /></button>
                        <button onClick={() => remove("campaign", c.id)} className="p-1 hover:bg-red-500/10 rounded"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                      <div className="bg-muted/10 rounded-lg p-2"><div className="text-xs text-muted-foreground">תקציב</div><div className="text-sm font-bold text-white">{fmtC(c.budget)}</div></div>
                      <div className="bg-muted/10 rounded-lg p-2"><div className="text-xs text-muted-foreground">הוצאה</div><div className="text-sm font-bold text-white">{fmtC(c.spent)}</div></div>
                      <div className="bg-muted/10 rounded-lg p-2"><div className="text-xs text-muted-foreground">לידים</div><div className="text-sm font-bold text-white">{c.leads_actual}/{c.leads_target}</div></div>
                    </div>
                    <div className="mt-3 space-y-1">
                      <div className="flex justify-between text-[10px] text-muted-foreground"><span>תקציב</span><span>{progress.toFixed(0)}%</span></div>
                      <div className="h-1.5 bg-muted/20 rounded-full overflow-hidden"><div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${progress}%` }} /></div>
                      <div className="flex justify-between text-[10px] text-muted-foreground"><span>לידים</span><span>{leadsProgress.toFixed(0)}%</span></div>
                      <div className="h-1.5 bg-muted/20 rounded-full overflow-hidden"><div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${leadsProgress}%` }} /></div>
                    </div>
                    <div className="flex gap-1 mt-2 flex-wrap">{(c.platforms || []).map((p: string, i: number) => { const pl = PLATFORM_MAP[p]; return <Badge key={i} className={`text-[10px] ${pl?.bg || "bg-muted/10"} ${pl?.color || ""}`}>{pl?.label || p}</Badge>; })}</div>
                    {c.start_date && <div className="text-[10px] text-muted-foreground mt-2">{c.start_date?.slice(0, 10)} - {c.end_date?.slice(0, 10) || "---"}</div>}
                  </div>
                );
              })}
            </div>
          )}

          {/* LEADS TAB */}
          {tab === "leads" && (
            <div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30 border-b border-border/50">
                    <tr>{["שם", "טלפון", "אימייל", "פלטפורמה", "קמפיין", "הודעה", "סטטוס", "תאריך", "פעולות"].map(h => <th key={h} className="px-3 py-3 text-right text-xs font-medium text-muted-foreground">{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {filteredLeads.length === 0 ? (
                      <tr><td colSpan={99} className="text-center py-12 text-muted-foreground">אין לידים</td></tr>
                    ) : filteredLeads.map(l => {
                      const ls = LEAD_STATUS_MAP[l.status];
                      return (
                        <tr key={l.id} className="border-b border-border/20 hover:bg-muted/10">
                          <td className="px-3 py-2 text-white font-medium">{l.name || "---"}</td>
                          <td className="px-3 py-2 text-xs">{l.phone || "---"}</td>
                          <td className="px-3 py-2 text-xs">{l.email || "---"}</td>
                          <td className="px-3 py-2 text-xs">{PLATFORM_MAP[l.platform]?.label || l.platform || "---"}</td>
                          <td className="px-3 py-2 text-xs">{l.campaign_name || "---"}</td>
                          <td className="px-3 py-2 max-w-[150px]"><div className="text-xs truncate">{l.message || "---"}</div></td>
                          <td className="px-3 py-2"><Badge className={`text-[10px] ${ls?.bg || ""} ${ls?.color || ""}`}>{ls?.label || l.status}</Badge></td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">{l.created_at?.slice(0, 10)}</td>
                          <td className="px-3 py-2">
                            <div className="flex gap-1">
                              <button onClick={() => openEdit("lead", l)} className="p-1 hover:bg-muted rounded"><Edit2 className="w-3.5 h-3.5 text-muted-foreground" /></button>
                              <button onClick={() => remove("lead", l.id)} className="p-1 hover:bg-red-500/10 rounded"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* FORM MODAL */}
      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-card border border-border rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center p-4 border-b border-border/50">
                <h2 className="font-bold text-white">{editing ? "עריכה" : "יצירה"} - {formType === "account" ? "חשבון" : formType === "post" ? "פוסט" : formType === "campaign" ? "קמפיין" : "ליד"}</h2>
                <button onClick={() => setShowForm(false)} className="p-1.5 hover:bg-muted rounded-lg"><X className="w-4 h-4" /></button>
              </div>
              <div className="p-4 space-y-3">
                {formType === "account" && (<>
                  <div><label className="text-xs text-muted-foreground">פלטפורמה</label><select value={form.platform || ""} onChange={e => setForm({ ...form, platform: e.target.value })} className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm mt-1">{PLATFORMS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}</select></div>
                  <div><label className="text-xs text-muted-foreground">שם חשבון</label><input value={form.accountName || ""} onChange={e => setForm({ ...form, accountName: e.target.value })} className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm mt-1" /></div>
                  <div><label className="text-xs text-muted-foreground">מזהה חשבון</label><input value={form.accountId || ""} onChange={e => setForm({ ...form, accountId: e.target.value })} className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm mt-1" /></div>
                  <div><label className="text-xs text-muted-foreground">עוקבים</label><input type="number" value={form.followersCount || ""} onChange={e => setForm({ ...form, followersCount: e.target.value })} className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm mt-1" /></div>
                  <div><label className="text-xs text-muted-foreground">סטטוס</label><select value={form.status || "connected"} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm mt-1"><option value="connected">מחובר</option><option value="disconnected">מנותק</option><option value="error">שגיאה</option></select></div>
                </>)}
                {formType === "post" && (<>
                  <div><label className="text-xs text-muted-foreground">חשבון</label><select value={form.accountId || ""} onChange={e => setForm({ ...form, accountId: e.target.value })} className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm mt-1"><option value="">בחר חשבון</option>{accounts.map(a => <option key={a.id} value={a.id}>{a.account_name} ({PLATFORM_MAP[a.platform]?.label || a.platform})</option>)}</select></div>
                  <div><label className="text-xs text-muted-foreground">קמפיין</label><select value={form.campaignId || ""} onChange={e => setForm({ ...form, campaignId: e.target.value })} className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm mt-1"><option value="">ללא קמפיין</option>{campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
                  <div><label className="text-xs text-muted-foreground">תוכן</label><textarea value={form.content || ""} onChange={e => setForm({ ...form, content: e.target.value })} rows={4} className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm mt-1" /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-xs text-muted-foreground">סוג פוסט</label><select value={form.postType || "image"} onChange={e => setForm({ ...form, postType: e.target.value })} className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm mt-1">{POST_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                    <div><label className="text-xs text-muted-foreground">סטטוס</label><select value={form.status || "draft"} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm mt-1">{POST_STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}</select></div>
                  </div>
                  <div><label className="text-xs text-muted-foreground">תזמון</label><input type="datetime-local" value={form.scheduledAt || ""} onChange={e => setForm({ ...form, scheduledAt: e.target.value })} className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm mt-1" /></div>
                </>)}
                {formType === "campaign" && (<>
                  <div><label className="text-xs text-muted-foreground">שם קמפיין</label><input value={form.name || ""} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm mt-1" /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-xs text-muted-foreground">מטרה</label><select value={form.goal || ""} onChange={e => setForm({ ...form, goal: e.target.value })} className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm mt-1">{CAMPAIGN_GOALS.map(g => <option key={g.key} value={g.key}>{g.label}</option>)}</select></div>
                    <div><label className="text-xs text-muted-foreground">סטטוס</label><select value={form.status || "planning"} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm mt-1">{CAMPAIGN_STATUSES.map(s => <option key={s} value={s}>{CAMPAIGN_STATUS_MAP[s]?.label || s}</option>)}</select></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-xs text-muted-foreground">תקציב</label><input type="number" value={form.budget || ""} onChange={e => setForm({ ...form, budget: e.target.value })} className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm mt-1" /></div>
                    <div><label className="text-xs text-muted-foreground">יעד לידים</label><input type="number" value={form.leadsTarget || ""} onChange={e => setForm({ ...form, leadsTarget: e.target.value })} className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm mt-1" /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-xs text-muted-foreground">תאריך התחלה</label><input type="date" value={form.startDate || ""} onChange={e => setForm({ ...form, startDate: e.target.value })} className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm mt-1" /></div>
                    <div><label className="text-xs text-muted-foreground">תאריך סיום</label><input type="date" value={form.endDate || ""} onChange={e => setForm({ ...form, endDate: e.target.value })} className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm mt-1" /></div>
                  </div>
                  <div><label className="text-xs text-muted-foreground">פלטפורמות</label>
                    <div className="flex gap-2 flex-wrap mt-1">{PLATFORMS.map(p => {
                      const sel = (form.platforms || []).includes(p.key);
                      return <button key={p.key} type="button" onClick={() => setForm({ ...form, platforms: sel ? (form.platforms || []).filter((x: string) => x !== p.key) : [...(form.platforms || []), p.key] })} className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs border ${sel ? `${p.bg} ${p.color} border-current` : "border-border text-muted-foreground"}`}><p.icon className="w-3 h-3" />{p.label}</button>;
                    })}</div>
                  </div>
                </>)}
                {formType === "lead" && (<>
                  <div><label className="text-xs text-muted-foreground">שם</label><input value={form.name || ""} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm mt-1" /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-xs text-muted-foreground">טלפון</label><input value={form.phone || ""} onChange={e => setForm({ ...form, phone: e.target.value })} className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm mt-1" /></div>
                    <div><label className="text-xs text-muted-foreground">אימייל</label><input value={form.email || ""} onChange={e => setForm({ ...form, email: e.target.value })} className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm mt-1" /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-xs text-muted-foreground">פלטפורמה</label><select value={form.platform || ""} onChange={e => setForm({ ...form, platform: e.target.value })} className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm mt-1"><option value="">בחר</option>{PLATFORMS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}</select></div>
                    <div><label className="text-xs text-muted-foreground">סטטוס</label><select value={form.status || "new"} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm mt-1">{LEAD_STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}</select></div>
                  </div>
                  <div><label className="text-xs text-muted-foreground">קמפיין</label><select value={form.campaignId || ""} onChange={e => setForm({ ...form, campaignId: e.target.value })} className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm mt-1"><option value="">ללא</option>{campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
                  <div><label className="text-xs text-muted-foreground">הודעה</label><textarea value={form.message || ""} onChange={e => setForm({ ...form, message: e.target.value })} rows={3} className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm mt-1" /></div>
                </>)}
              </div>
              <div className="flex justify-end gap-2 p-4 border-t border-border/50">
                <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-muted-foreground hover:bg-muted rounded-lg">ביטול</button>
                <button onClick={save} disabled={saving} className="flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50"><Save className="w-4 h-4" />{saving ? "שומר..." : "שמור"}</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
