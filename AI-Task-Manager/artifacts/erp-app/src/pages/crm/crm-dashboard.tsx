import { useState, useEffect } from "react";
import { Link } from "wouter";
import { authFetch } from "@/lib/utils";
import RelatedRecords from "@/components/related-records";
import ActivityLog from "@/components/activity-log";
import AttachmentsSection from "@/components/attachments-section";
import {
  Brain, Shield, Zap, BarChart3, Plug,
  Star, Target, TrendingUp, AlertTriangle,
  Lock, Key, FileText, Activity,
  Bell, RefreshCw, Smartphone, BarChart2,
  Filter, PieChart, Users,
  Globe, Cloud, Code2,
  Building2, Briefcase, ChevronRight,
  Mail, MessageSquare, Search, CheckSquare,
  DollarSign, CreditCard, MapPin, Percent,
  UserPlus, BarChart, Layers,
  type LucideIcon
} from "lucide-react";

const API = "/api";
const getHeaders = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("erp_token") || ""}` });
const fmt = (n: number) => new Intl.NumberFormat("he-IL").format(n);
const fmtC = (n: number) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", minimumFractionDigits: 0 }).format(n);

const TABS = ["Features", "Communication", "Analytics", "Security", "Integrations"] as const;
type Tab = typeof TABS[number];

interface FeatureItem {
  title: string;
  desc: string;
  icon: LucideIcon;
  href: string;
  badge?: string;
}

interface CategoryGroup {
  title: string;
  icon: LucideIcon;
  gradient: string;
  features: FeatureItem[];
}

const CATEGORIES: Record<Tab, CategoryGroup[]> = {
  Features: [
    {
      title: "AI-Native Intelligence",
      icon: Brain,
      gradient: "from-purple-600/20 to-indigo-600/10 border-purple-500/30",
      features: [
        { title: "Lead Scoring AI", desc: "ציון לידים אוטומטי עם ML — מזהה הלידים הכי חמים", icon: Star, href: "/crm/lead-quality", badge: "AI" },
        { title: "Next Best Action", desc: "AI ממליץ על הפעולה הבאה האידיאלית לכל לקוח", icon: Target, href: "/crm/ai-insights", badge: "AI" },
        { title: "Predictive Analytics", desc: "חיזוי מגמות מכירות ודפוסי לקוחות", icon: TrendingUp, href: "/crm/predictive-analytics", badge: "AI" },
        { title: "Anomaly Detection", desc: "זיהוי חריגות בזמן אמת והתראות אוטומטיות", icon: AlertTriangle, href: "/crm/ai-insights", badge: "AI" },
      ]
    },
    {
      title: "Real-Time Operations",
      icon: Zap,
      gradient: "from-amber-600/20 to-orange-600/10 border-amber-500/30",
      features: [
        { title: "Live Feeds", desc: "עדכונים חיים מכל הפעילות בצנרת המכירות", icon: Activity, href: "/crm/realtime-feed" },
        { title: "Instant Notifications", desc: "התראות מיידיות על כל אירוע קריטי", icon: Bell, href: "/crm/realtime-feed" },
        { title: "Trigger-Based Actions", desc: "אוטומציות חכמות מבוססות טריגרים ואירועים", icon: Zap, href: "/crm/realtime-feed" },
        { title: "Sync Across Devices", desc: "סנכרון מלא בין כל המכשירים בזמן אמת", icon: RefreshCw, href: "/crm/realtime-feed" },
      ]
    },
  ],
  Communication: [
    {
      title: "Email & Messaging",
      icon: Mail,
      gradient: "from-blue-600/20 to-violet-600/10 border-blue-500/30",
      features: [
        { title: "Email Sync", desc: "סנכרון Gmail/Outlook עם תבניות, חתימות וחיבור לעסקאות", icon: Mail, href: "/crm/email-sync", badge: "NEW" },
        { title: "WhatsApp Business", desc: "הודעות WhatsApp ו-SMS ישירות ללידים ולקוחות", icon: MessageSquare, href: "/crm/whatsapp-sms", badge: "NEW" },
        { title: "Advanced Search", desc: "חיפוש מתקדם חוצה-מודולים על לידים, עסקאות, מיילים ומסמכים", icon: Search, href: "/crm/advanced-search", badge: "NEW" },
        { title: "Collaboration", desc: "הערות עם @אזכורים, משימות צוות ולוח פעילות", icon: CheckSquare, href: "/crm/collaboration", badge: "NEW" },
      ]
    },
  ],
  Analytics: [
    {
      title: "Advanced Analytics",
      icon: BarChart3,
      gradient: "from-blue-600/20 to-cyan-600/10 border-blue-500/30",
      features: [
        { title: "Custom Reports", desc: "בנה דוחות מותאמים אישית עם drag & drop", icon: BarChart2, href: "/crm/predictive-analytics" },
        { title: "Trend Analysis", desc: "ניתוח מגמות עמוק על ציר הזמן", icon: TrendingUp, href: "/crm/predictive-analytics" },
        { title: "Cohort Analysis", desc: "חלוקת לקוחות לקבוצות וניתוח הבדלים", icon: PieChart, href: "/crm/predictive-analytics" },
        { title: "Advanced Filters", desc: "סינון מתקדם רב-ממדי על כל הנתונים", icon: Filter, href: "/crm/advanced-search" },
      ]
    },
  ],
  Security: [
    {
      title: "Enterprise Security",
      icon: Shield,
      gradient: "from-green-600/20 to-emerald-600/10 border-green-500/30",
      features: [
        { title: "SSO/SAML", desc: "כניסה מאובטחת לארגונים עם SSO ו-SAML 2.0", icon: Key, href: "/settings" },
        { title: "Field-Level Encryption", desc: "הצפנה ברמת שדה לנתונים רגישים", icon: Lock, href: "/settings" },
        { title: "Row-Level Security", desc: "בידוד Multi-tenant ברמת שורה", icon: Shield, href: "/settings" },
        { title: "Audit Trail", desc: "יומן פעולות מלא עם כל שינוי ופעולה", icon: FileText, href: "/settings" },
      ]
    },
  ],
  Integrations: [
    {
      title: "Integrations Hub",
      icon: Plug,
      gradient: "from-rose-600/20 to-pink-600/10 border-rose-500/30",
      features: [
        { title: "REST API", desc: "API מלא עם תיעוד Swagger ומפתחות גישה", icon: Code2, href: "/settings" },
        { title: "Mobile Sync", desc: "סנכרון מובייל לכל הפלטפורמות", icon: Smartphone, href: "/settings" },
        { title: "Cloud Storage", desc: "חיבור לשירותי ענן: AWS, GCP, Azure", icon: Cloud, href: "/settings" },
        { title: "Webhooks", desc: "חיבור למערכות third-party עם webhooks", icon: Globe, href: "/settings" },
      ]
    },
  ],
};

const QUICK_NAV = [
  { label: "Customer 360", href: "/sales/customers", icon: Building2, color: "border-blue-500/30 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20" },
  { label: "דשבורד מודולרי", href: "/crm/leads", icon: Users, color: "border-purple-500/30 bg-purple-500/10 text-purple-400 hover:bg-purple-500/20" },
  { label: "מודול עסקאות", href: "/sales/pipeline", icon: Briefcase, color: "border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20" },
  { label: "מודול לידים", href: "/crm/leads", icon: Star, color: "border-green-500/30 bg-green-500/10 text-green-400 hover:bg-green-500/20" },
];

const FEATURE_BADGES = [
  { label: "Auto Lead Scoring", color: "bg-blue-500/20 text-blue-300 border-blue-500/30" },
  { label: "Real-Time Sync", color: "bg-green-500/20 text-green-300 border-green-500/30" },
  { label: "Mobile App Native", color: "bg-purple-500/20 text-purple-300 border-purple-500/30" },
  { label: "Field-Level Encryption", color: "bg-red-500/20 text-red-300 border-red-500/30" },
  { label: "AI Next Best Action", color: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30" },
  { label: "Predictive Analytics", color: "bg-amber-500/20 text-amber-300 border-amber-500/30" },
  { label: "API + Webhooks", color: "bg-indigo-500/20 text-indigo-300 border-indigo-500/30" },
  { label: "Custom Dashboards", color: "bg-pink-500/20 text-pink-300 border-pink-500/30" },
  { label: "Custom Workflows", color: "bg-teal-500/20 text-teal-300 border-teal-500/30" },
  { label: "Document Mgmt", color: "bg-orange-500/20 text-orange-300 border-orange-500/30" },
  { label: "Email Sync", color: "bg-violet-500/20 text-violet-300 border-violet-500/30" },
  { label: "WhatsApp Business", color: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" },
  { label: "Advanced Search", color: "bg-indigo-500/20 text-indigo-300 border-indigo-500/30" },
  { label: "Team Collaboration", color: "bg-teal-500/20 text-teal-300 border-teal-500/30" },
];

const STATS_BADGES = [
  { label: "Analytics", value: "Advanced", color: "bg-blue-500/20 text-blue-300", icon: BarChart3 },
  { label: "Integrations", value: "12+", color: "bg-green-500/20 text-green-300", icon: Layers },
  { label: "AI Capabilities", value: "5 AI Tools", color: "bg-purple-500/20 text-purple-300", icon: Brain },
  { label: "Features", value: "50+", color: "bg-amber-500/20 text-amber-300", icon: Zap },
];

export default function CrmDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>("Features");
  const [dash, setDash] = useState<any>({});
  const [detailTab, setDetailTab] = useState("details");
  const [dashDetailTab, setDashDetailTab] = useState("related");

  useEffect(() => {
    authFetch(`${API}/crm-enterprise/dashboard`, { headers: getHeaders() }).then(r => r.json()).then(setDash).catch(() => {});
  }, []);

  const topKpis = [
    { label: "סה\"כ לידים", value: fmt(dash.leads?.total || 0), icon: Users, color: "text-blue-400" },
    { label: "ערך צנרת", value: fmtC(dash.leads?.pipeline_value || 0), icon: DollarSign, color: "text-green-400" },
    { label: "חוב פתוח", value: fmtC(dash.collections?.outstanding || 0), icon: CreditCard, color: "text-red-400" },
    { label: "בסיכון", value: fmt(dash.collections?.at_risk || 0), icon: AlertTriangle, color: "text-orange-400" },
    { label: "סוכנים פעילים", value: fmt(dash.agents?.total || 0), icon: MapPin, color: "text-purple-400" },
    { label: "מכירות חודשי", value: fmtC(dash.agents?.mtd_sales || 0), icon: TrendingUp, color: "text-cyan-400" },
    { label: "כללי תמחור", value: fmt(dash.pricing?.active_count || 0), icon: Percent, color: "text-indigo-400" },
    { label: "הומרו", value: fmt(dash.leads?.converted || 0), icon: Star, color: "text-amber-400" },
  ];

  const categories = CATEGORIES[activeTab];

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Ultra Pro Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-900/50 via-purple-900/30 to-cyan-900/40 border border-blue-500/20 p-6">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 to-purple-500/5" />
        <div className="relative z-10">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                <Activity className="w-5 h-5 text-foreground" />
              </div>
              <div>
                <h1 className="text-xl sm:text-3xl font-bold bg-gradient-to-r from-blue-300 to-purple-300 bg-clip-text text-transparent">CRM Ultra Pro</h1>
                <p className="text-sm text-blue-300/70">Enterprise CRM Platform — Powered by AI</p>
              </div>
            </div>
            <div className="text-left">
              <div className="text-xs text-muted-foreground mb-1">Enterprise Tier</div>
              <div className="bg-gradient-to-r from-blue-500 to-purple-600 text-foreground text-xs px-3 py-1 rounded-full font-bold">ULTRA PRO</div>
            </div>
          </div>
          <div className="flex gap-3 mt-4 flex-wrap">
            {STATS_BADGES.map((b, i) => (
              <div key={i} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${b.color} bg-card/5`}>
                <b.icon className="w-4 h-4" />
                <span className="text-xs">{b.label}: <strong>{b.value}</strong></span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-4 md:grid-cols-8 gap-3">
        {topKpis.map((k, i) => (
          <div key={i} className="bg-card border rounded-lg p-3 text-center">
            <k.icon className={`w-5 h-5 mx-auto mb-1 ${k.color}`} />
            <div className="text-lg font-bold">{k.value}</div>
            <div className="text-xs text-muted-foreground">{k.label}</div>
          </div>
        ))}
      </div>

      {/* Quick Nav */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {QUICK_NAV.map((n, i) => (
          <Link key={i} href={n.href}>
            <div className={`border rounded-xl p-4 cursor-pointer transition-all flex items-center gap-3 ${n.color}`}>
              <n.icon className="w-5 h-5" />
              <span className="text-sm font-medium">{n.label}</span>
              <ChevronRight className="w-4 h-4 mr-auto" />
            </div>
          </Link>
        ))}
      </div>

      {/* Tabbed Features */}
      <div>
        <div className="flex gap-1 border-b mb-4 overflow-x-auto">
          {TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5 ${activeTab === tab ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              {tab === "Features" && <Zap className="w-4 h-4" />}
              {tab === "Communication" && <Mail className="w-4 h-4" />}
              {tab === "Analytics" && <BarChart3 className="w-4 h-4" />}
              {tab === "Security" && <Shield className="w-4 h-4" />}
              {tab === "Integrations" && <Plug className="w-4 h-4" />}
              {tab}
            </button>
          ))}
        </div>

        <div className="space-y-4 sm:space-y-6">
          {categories.map((cat, ci) => (
            <div key={ci}>
              <div className="flex items-center gap-2 mb-3">
                <cat.icon className="w-5 h-5 text-muted-foreground" />
                <h3 className="font-semibold">{cat.title}</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {cat.features.map((feat, fi) => (
                  <Link key={fi} href={feat.href}>
                    <div className={`border rounded-xl p-4 cursor-pointer hover:shadow-md transition-all bg-gradient-to-br ${cat.gradient}`}>
                      <div className="flex items-start justify-between mb-2">
                        <feat.icon className="w-6 h-6" />
                        {feat.badge && (
                          <span className={`text-xs px-1.5 py-0.5 rounded font-bold ${feat.badge === "AI" ? "bg-purple-500/30 text-purple-300" : feat.badge === "NEW" ? "bg-green-500/30 text-green-300" : "bg-muted"}`}>{feat.badge}</span>
                        )}
                      </div>
                      <div className="font-medium text-sm mb-1">{feat.title}</div>
                      <div className="text-xs text-muted-foreground leading-relaxed">{feat.desc}</div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Feature Badges Strip */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground mb-3">Ultra Pro Feature Set</h2>
        <div className="flex flex-wrap gap-2">
          {FEATURE_BADGES.map((b, i) => (
            <span key={i} className={`text-xs px-3 py-1.5 rounded-full border font-medium ${b.color}`}>{b.label}</span>
          ))}
        </div>
      </div>

      <div className="bg-card border rounded-xl p-5 space-y-4">
        <h3 className="font-semibold flex items-center gap-2"><Activity className="w-4 h-4 text-primary" />רשומות קשורות והיסטוריה</h3>
        <div className="flex border-b border-border/50">
          {[{key:"related",label:"רשומות קשורות"},{key:"docs",label:"מסמכים מצורפים"},{key:"history",label:"היסטוריית פעילות"}].map(t => (
            <button key={t.key} onClick={() => setDashDetailTab(t.key)} className={`px-4 py-2.5 text-sm font-medium border-b-2 ${dashDetailTab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t.label}</button>
          ))}
        </div>
        {dashDetailTab === "related" && (
          <RelatedRecords tabs={[{key:"leads",label:"לידים אחרונים",endpoint:`${API}/crm-leads?limit=10`,columns:[{key:"first_name",label:"שם"},{key:"company",label:"חברה"},{key:"status",label:"סטטוס"}]},{key:"deals",label:"עסקאות אחרונות",endpoint:`${API}/deals?limit=10`,columns:[{key:"title",label:"כותרת"},{key:"amount",label:"סכום"},{key:"stage",label:"שלב"}]},{key:"tickets",label:"פניות אחרונות",endpoint:`${API}/tickets?limit=10`,columns:[{key:"subject",label:"נושא"},{key:"status",label:"סטטוס"},{key:"priority",label:"עדיפות"}]}]} />
        )}
        {dashDetailTab === "docs" && (
          <AttachmentsSection entityType="crm-dashboard" entityId={0} />
        )}
        {dashDetailTab === "history" && (
          <ActivityLog entityType="crm-dashboard" />
        )}
      </div>
    </div>
  );
}
