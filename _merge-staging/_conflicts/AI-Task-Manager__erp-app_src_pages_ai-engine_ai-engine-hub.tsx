import { Link } from "wouter";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { authFetch } from "@/lib/utils";
import {
  Brain, Target, Phone, TrendingUp, Bot,
  Sparkles, BarChart3, Activity, Zap, ArrowLeft,
  CheckCircle2, AlertTriangle, Star, Moon, MessageSquare, Clock,
  Shield, Settings, Cpu, Search, ShieldAlert, FileText, Lightbulb, FileSpreadsheet
} from "lucide-react";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";

const API = "/api";
const token = () => localStorage.getItem("erp_token") || document.cookie.match(/token=([^;]+)/)?.[1] || "";
const headers = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token()}` });

export default function AIEngineHub() {
  const [leadStats, setLeadStats] = useState<any>({});
  const [callStats, setCallStats] = useState<any>({});
  const [monthlyStats, setMonthlyStats] = useState<any>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      authFetch(`${API}/crm/leads/scored`, { headers: headers() }).then(r => r.json()).catch(() => ({})),
      authFetch(`${API}/crm/calls`, { headers: headers() }).then(r => r.json()).catch(() => ({})),
      authFetch(`${API}/crm/analytics/monthly`, { headers: headers() }).then(r => r.json()).catch(() => ({})),
    ]).then(([leads, calls, monthly]) => {
      setLeadStats({
        hotCount: leads.hotCount || 0,
        warmCount: leads.warmCount || 0,
        coldCount: leads.coldCount || 0,
        avgScore: leads.avgScore || 0,
        totalLeads: (leads.leads || []).length,
      });
      setCallStats({
        total: calls.total || 0,
        avgSentiment: calls.avgSentiment || 0,
        avgIntent: calls.avgIntent || 0,
        highIntentCount: calls.highIntentCount || 0,
      });
      const thisMonth = Number((monthly.revenueStats || {}).this_month_revenue || 0);
      setMonthlyStats({
        thisMonthRevenue: thisMonth,
        totalLeads: (monthly.leadStats || {}).total_leads || (leads.leads || []).length,
        hotCount: leads.hotCount || 0,
      });
    }).finally(() => setLoading(false));
  }, []);

  const AI_MODULES = [
    {
      title: "Lead Scoring",
      titleHe: "דירוג לידים AI",
      description: "מודל ML מבוסס-כללים המדרג לידים 0-100 לפי מקור, תקציב, פעילות והתנהגות.",
      icon: Target,
      href: "/ai-engine/lead-scoring",
      color: "from-blue-500/20 to-cyan-500/20",
      borderColor: "border-blue-500/30",
      iconColor: "text-blue-400",
      badge: "ML Model",
      stats: [
        { label: "Hot Leads", value: loading ? "..." : String(leadStats.hotCount ?? 0), icon: Zap },
        { label: "ציון ממוצע", value: loading ? "..." : String(leadStats.avgScore ?? 0), icon: Star },
      ],
    },
    {
      title: "Call NLP Analysis",
      titleHe: "ניתוח שיחות NLP",
      description: "ניתוח אוטומטי של שיחות: סנטימנט, כוונת קנייה, מילות מפתח וסיכום.",
      icon: Phone,
      href: "/ai-engine/call-nlp",
      color: "from-violet-500/20 to-purple-500/20",
      borderColor: "border-violet-500/30",
      iconColor: "text-violet-400",
      badge: "NLP Engine",
      stats: [
        { label: "שיחות מנותחות", value: loading ? "..." : String(callStats.total ?? 0), icon: Activity },
        { label: "כוונה גבוהה", value: loading ? "..." : String(callStats.highIntentCount ?? 0), icon: TrendingUp },
      ],
    },
    {
      title: "Predictive Analytics",
      titleHe: "ניתוח חיזויי",
      description: "חיזוי סגירת עסקאות, Churn Risk, תחזית הכנסות, וציר זמן לסגירה.",
      icon: TrendingUp,
      href: "/ai-engine/predictive",
      color: "from-emerald-500/20 to-green-500/20",
      borderColor: "border-emerald-500/30",
      iconColor: "text-emerald-400",
      badge: "Predictive",
      stats: [
        { label: "לידים בצנרת", value: loading ? "..." : String(monthlyStats.totalLeads ?? 0), icon: CheckCircle2 },
        { label: "הכנסות החודש", value: loading ? "..." : (monthlyStats.thisMonthRevenue > 0 ? `₪${Math.round(monthlyStats.thisMonthRevenue / 1000)}K` : "—"), icon: AlertTriangle },
      ],
    },
    {
      title: "AI Chatbot Settings",
      titleHe: "הגדרות בוט AI",
      description: "הגדרות GPT-4, WhatsApp, תגובות אוטומטיות, הדרכת הבוט ולוג שיחות.",
      icon: Bot,
      href: "/ai-engine/chatbot",
      color: "from-amber-500/20 to-orange-500/20",
      borderColor: "border-amber-500/30",
      iconColor: "text-amber-400",
      badge: "GPT-4 Turbo",
      stats: [],
    },
    {
      title: "Kimi AI Terminal",
      titleHe: "טרמינל Kimi / Moonshot AI",
      description: "ממשק צ'אט ישיר עם Kimi 2 (Moonshot AI) — תמיכה בהיסטוריה ובחירת מודל.",
      icon: Moon,
      href: "/ai-engine/kimi",
      color: "from-cyan-500/20 to-blue-500/20",
      borderColor: "border-cyan-500/30",
      iconColor: "text-cyan-400",
      badge: "Moonshot AI",
      stats: [],
    },
    {
      title: "Super Agent Dashboard",
      titleHe: "דשבורד Super Agent",
      description: "ניהול מלא של Cross-Module — 9 תהליכים, 23 מודולים, הפעלה ישירה, מעקב עסקאות וסטטיסטיקות.",
      icon: Zap,
      href: "/ai-engine/super-agent-dashboard",
      color: "from-purple-500/20 to-violet-500/20",
      borderColor: "border-purple-500/30",
      iconColor: "text-purple-400",
      badge: "Cross-Module",
      stats: [],
    },
    {
      title: "Cross-Module Transactions",
      titleHe: "מעקב עסקאות בין מודולים",
      description: "היסטוריית כל העסקאות Cross-Module — מעקב אוטומטי אחרי כל פעולה, סטטיסטיקות וסינון.",
      icon: Activity,
      href: "/ai-engine/transactions",
      color: "from-teal-500/20 to-cyan-500/20",
      borderColor: "border-teal-500/30",
      iconColor: "text-teal-400",
      badge: "Audit Trail",
      stats: [],
    },
    {
      title: "AI Audit Log",
      titleHe: "יומן ביקורת AI",
      description: "לוג מלא של כל בקשות ה-AI — ספק, מודל, טוקנים, זמן תגובה, שגיאות, analytics ויצוא CSV.",
      icon: Shield,
      href: "/ai-engine/ai-audit-log",
      color: "from-violet-500/20 to-indigo-500/20",
      borderColor: "border-violet-500/30",
      iconColor: "text-violet-400",
      badge: "Compliance",
      stats: [],
    },
    {
      title: "ML Training Pipeline",
      titleHe: "ML Training Pipeline",
      description: "הגדר ואמן מודלי ML על נתוני ה-ERP — תחזיות מכירות, זיהוי חריגים, דירוג לקוחות ועוד.",
      icon: Cpu,
      href: "/ai-engine/ml-pipeline",
      color: "from-blue-500/20 to-cyan-500/20",
      borderColor: "border-blue-500/30",
      iconColor: "text-blue-400",
      badge: "AutoML",
      stats: [],
    },
    {
      title: "AI Admin Settings",
      titleHe: "הגדרות מנוע AI",
      description: "נהל ספקים, עדיפויות, תקציבים ומודלים מועדפים — Claude, OpenAI, Gemini, Kimi.",
      icon: Settings,
      href: "/ai-engine/admin-settings",
      color: "from-orange-500/20 to-amber-500/20",
      borderColor: "border-orange-500/30",
      iconColor: "text-orange-400",
      badge: "Multi-Model",
      stats: [],
    },
    {
      title: "Hebrew NL Query",
      titleHe: "שאילתות בעברית",
      description: "שאל שאלות עסקיות בעברית וקבל תשובות מיידיות עם גרפים — מתרגם לSQL ומריץ על הנתונים האמיתיים.",
      icon: Search,
      href: "/ai-engine/nl-query",
      color: "from-blue-500/20 to-cyan-500/20",
      borderColor: "border-blue-500/30",
      iconColor: "text-blue-400",
      badge: "NL-to-SQL",
      stats: [],
    },
    {
      title: "Anomaly Detection",
      titleHe: "זיהוי חריגות אוטומטי",
      description: "סריקה אוטומטית של מדדים עסקיים — Z-Score וIQR, חריגות בפועל על מלאי, כספים, ייצור, CRM ותמיכה.",
      icon: ShieldAlert,
      href: "/ai-engine/anomaly-detection",
      color: "from-red-500/20 to-orange-500/20",
      borderColor: "border-red-500/30",
      iconColor: "text-red-400",
      badge: "Real-Time",
      stats: [],
    },
    {
      title: "Employee Chatbot",
      titleHe: "צ'אטבוט ERP לעובדים",
      description: "שיחה טבעית בעברית עם מערכת ה-ERP — שאל שאלות, בדוק מלאי, צור הזמנות עם אישור פעולה.",
      icon: MessageSquare,
      href: "/ai-engine/employee-chatbot",
      color: "from-violet-500/20 to-purple-500/20",
      borderColor: "border-violet-500/30",
      iconColor: "text-violet-400",
      badge: "Claude AI",
      stats: [],
    },
    {
      title: "Sentiment Analysis",
      titleHe: "ניתוח סנטימנט AI",
      description: "ניתוח אוטומטי של משוב לקוחות, הערות CRM, פניות תמיכה וסקרי עובדים — מגמות ונושאים.",
      icon: BarChart3,
      href: "/ai-engine/sentiment-analysis",
      color: "from-blue-500/20 to-sky-500/20",
      borderColor: "border-blue-500/30",
      iconColor: "text-blue-400",
      badge: "NLP Analysis",
      stats: [],
    },
    {
      title: "Recommendation Engine",
      titleHe: "מנוע המלצות AI",
      description: "המלצות עסקיות אוטומטיות — נקודות הזמנה מחדש, התאמת מחירים, ספקים חלופיים ואופטימיזציה תפעולית.",
      icon: Lightbulb,
      href: "/ai-engine/recommendations",
      color: "from-violet-500/20 to-purple-500/20",
      borderColor: "border-violet-500/30",
      iconColor: "text-violet-400",
      badge: "Business AI",
      stats: [],
    },
    {
      title: "Automated Reports",
      titleHe: "דוחות אוטומטיים AI",
      description: "הגדר תזמון דוחות יומי/שבועי/חודשי. דוחות עם תובנות AI בעברית, ניתוח KPI ופריטי פעולה. ייצוא PDF.",
      icon: FileSpreadsheet,
      href: "/ai-engine/automated-reports",
      color: "from-blue-500/20 to-cyan-500/20",
      borderColor: "border-blue-500/30",
      iconColor: "text-blue-400",
      badge: "Auto Reports",
      stats: [],
    },
  ];

  const AI_STATS = [
    { label: "לידים מדורגים", value: loading ? "..." : String(leadStats.totalLeads ?? 0), icon: Target, color: "text-blue-400", bg: "bg-blue-500/10" },
    { label: "ציון ממוצע לידים", value: loading ? "..." : String(leadStats.avgScore ?? 0), icon: Brain, color: "text-violet-400", bg: "bg-violet-500/10" },
    { label: "Hot Leads", value: loading ? "..." : String(leadStats.hotCount ?? 0), icon: Phone, color: "text-cyan-400", bg: "bg-cyan-500/10" },
    { label: "שיחות מנותחות", value: loading ? "..." : String(callStats.total ?? 0), icon: Activity, color: "text-emerald-400", bg: "bg-emerald-500/10" },
    { label: "כוונת קנייה גבוהה", value: loading ? "..." : String(callStats.highIntentCount ?? 0), icon: TrendingUp, color: "text-amber-400", bg: "bg-amber-500/10" },
    { label: "מודולי AI פעילים", value: String(AI_MODULES.length), icon: BarChart3, color: "text-green-400", bg: "bg-green-500/10" },
  ];

  return (
    <div className="space-y-8" dir="rtl">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500/20 to-indigo-500/20 border border-violet-500/30 flex items-center justify-center">
          <Brain className="w-6 h-6 text-violet-400" />
        </div>
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground">AI Engine Hub</h1>
          <p className="text-muted-foreground text-sm">מרכז הבינה המלאכותית — Lead Scoring, NLP, חיזוי ובוט</p>
        </div>
        <div className="mr-auto flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/30 rounded-full">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-emerald-400 text-xs font-medium">מנועי AI פעילים</span>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {AI_STATS.map((stat, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="bg-card border border-border rounded-xl p-3 text-center"
          >
            <div className={`w-9 h-9 rounded-xl ${stat.bg} flex items-center justify-center mx-auto mb-2`}>
              <stat.icon className={`w-4 h-4 ${stat.color}`} />
            </div>
            <div className="text-xl font-bold text-foreground">{stat.value}</div>
            <div className="text-xs text-muted-foreground mt-0.5 leading-tight">{stat.label}</div>
          </motion.div>
        ))}
      </div>

      <div>
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="w-4 h-4 text-violet-400" />
          <h2 className="text-base font-semibold text-foreground">מודולי AI Engine</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {AI_MODULES.map((mod, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.07 }}
            >
              <Link href={mod.href}>
                <div className={`bg-gradient-to-br ${mod.color} border ${mod.borderColor} rounded-2xl p-5 cursor-pointer hover:scale-[1.01] transition-transform group`}>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-black/20 flex items-center justify-center">
                        <mod.icon className={`w-5 h-5 ${mod.iconColor}`} />
                      </div>
                      <div>
                        <h3 className="font-bold text-foreground text-base">{mod.title}</h3>
                        <p className="text-xs text-foreground/60">{mod.titleHe}</p>
                      </div>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full bg-black/20 ${mod.iconColor} border border-white/10`}>
                      {mod.badge}
                    </span>
                  </div>
                  <p className="text-sm text-foreground/70 mb-4 leading-relaxed">{mod.description}</p>
                  <div className="flex items-center justify-between">
                    <div className="flex gap-4">
                      {mod.stats.map((s, si) => (
                        <div key={si} className="flex items-center gap-1.5">
                          <s.icon className={`w-3.5 h-3.5 ${mod.iconColor}`} />
                          <span className="text-foreground/80 text-xs font-medium">{s.value}</span>
                          <span className="text-foreground/40 text-[10px]">{s.label}</span>
                        </div>
                      ))}
                    </div>
                    <ArrowLeft className={`w-4 h-4 ${mod.iconColor} opacity-0 group-hover:opacity-100 transition-opacity`} />
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="w-4 h-4 text-blue-400" />
          <h2 className="text-base font-semibold text-foreground">פעילות AI — סיכום נוכחי</h2>
        </div>
        {loading ? (
          <div className="text-sm text-muted-foreground text-center py-8">טוען נתונים...</div>
        ) : leadStats.totalLeads === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-8">
            <Brain className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p>אין נתונים עדיין. הוסף לידים כדי לראות פעילות AI.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { label: "Hot Leads", value: leadStats.hotCount || 0, pct: leadStats.totalLeads > 0 ? Math.round((leadStats.hotCount / leadStats.totalLeads) * 100) : 0, color: "bg-red-500" },
              { label: "Warm Leads", value: leadStats.warmCount || 0, pct: leadStats.totalLeads > 0 ? Math.round((leadStats.warmCount / leadStats.totalLeads) * 100) : 0, color: "bg-amber-500" },
              { label: "Cold Leads", value: leadStats.coldCount || 0, pct: leadStats.totalLeads > 0 ? Math.round((leadStats.coldCount / leadStats.totalLeads) * 100) : 0, color: "bg-blue-500" },
            ].map((row, i) => (
              <div key={i} className="text-center">
                <div className="text-lg sm:text-2xl font-bold text-foreground">{row.value}</div>
                <div className="text-xs text-muted-foreground mb-2">{row.label}</div>
                <div className="h-2 bg-muted/30 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${row.color}`} style={{ width: `${row.pct}%` }} />
                </div>
                <div className="text-xs text-muted-foreground mt-1">{row.pct}%</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <ActivityLog entityType="ai-engine" />
        <RelatedRecords entityType="ai-engine" />
      </div>
    </div>
  );
}
