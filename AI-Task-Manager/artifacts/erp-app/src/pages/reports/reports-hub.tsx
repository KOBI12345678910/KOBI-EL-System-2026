import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "wouter";
import {
  BarChart3, TrendingUp, Shield, Target, Funnel, Activity,
  Search, Star, FileText, ChevronLeft, DollarSign, AlertTriangle,
  Users, Gauge, ArrowUpRight, Clock, ShoppingCart, Factory, Package
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { authJson } from "@/lib/utils";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";

const API = "/api";

const REPORT_CATEGORIES = [
  {
    id: "financial",
    title: "דוחות פיננסיים",
    description: "רווח והפסד, מאזן, תזרים מזומנים, ניתוח רווחיות",
    icon: DollarSign,
    href: "/reports/financial",
    color: "from-green-500/20 to-emerald-500/10",
    borderColor: "border-green-500/30",
    iconColor: "text-green-400",
  },
  {
    id: "risks",
    title: "ניתוחי סיכונים וגידורים",
    description: "חשיפה למט\"ח, ריכוזיות לקוחות/ספקים, סיכוני אשראי, נזילות",
    icon: Shield,
    href: "/reports/risks",
    color: "from-red-500/20 to-orange-500/10",
    borderColor: "border-red-500/30",
    iconColor: "text-red-400",
  },
  {
    id: "kpis",
    title: "KPI Dashboard",
    description: "מדדי ביצוע מכל חלקי המערכת עם מגמות וצבעי התראה",
    icon: Target,
    href: "/reports/kpis",
    color: "from-blue-500/20 to-cyan-500/10",
    borderColor: "border-blue-500/30",
    iconColor: "text-blue-400",
  },
  {
    id: "funnel",
    title: "יחסי המרה ומשפך מכירות",
    description: "Funnel analysis מלא, יחסי המרה לפי תקופה/סוכן/מקור",
    icon: Funnel,
    href: "/reports/funnel",
    color: "from-purple-500/20 to-violet-500/10",
    borderColor: "border-purple-500/30",
    iconColor: "text-purple-400",
  },
  {
    id: "operational",
    title: "דוחות תפעוליים",
    description: "סקירת פעילות מערכת, ביצועי מודולים, משימות ואישורים",
    icon: Activity,
    href: "/reports/operational",
    color: "from-amber-500/20 to-yellow-500/10",
    borderColor: "border-amber-500/30",
    iconColor: "text-amber-400",
  },
  {
    id: "builder",
    title: "בונה דוחות",
    description: "בניית דוחות מותאמים אישית עם סינון, קיבוץ ותצוגות",
    icon: FileText,
    href: "/report-builder",
    color: "from-slate-500/20 to-gray-500/10",
    borderColor: "border-slate-500/30",
    iconColor: "text-muted-foreground",
  },
];

const BI_CATEGORIES = [
  {
    id: "bi-financial",
    title: "דוחות כספיים — BI",
    description: "P&L, מאזן, תזרים מזומנים, מאזן בוחן עם קידוח לרשומות והשוואה לתקופה קודמת",
    icon: DollarSign,
    href: "/reports/bi/financial-statements",
    color: "from-emerald-500/20 to-green-500/10",
    borderColor: "border-emerald-500/30",
    iconColor: "text-emerald-400",
    badge: "חדש",
  },
  {
    id: "bi-sales",
    title: "ניתוח מכירות — BI",
    description: "מכירות לפי לקוח, מוצר, נציג ומגמות חודשיות עם YoY השוואה",
    icon: ShoppingCart,
    href: "/reports/bi/sales",
    color: "from-blue-500/20 to-cyan-500/10",
    borderColor: "border-blue-500/30",
    iconColor: "text-blue-400",
    badge: "חדש",
  },
  {
    id: "bi-production",
    title: "ניתוח ייצור — BI",
    description: "OEE, יעילות, פסולת, עלויות ופירוט לפי מכונה ומפעיל",
    icon: Factory,
    href: "/reports/bi/production",
    color: "from-amber-500/20 to-yellow-500/10",
    borderColor: "border-amber-500/30",
    iconColor: "text-amber-400",
    badge: "חדש",
  },
  {
    id: "bi-inventory",
    title: "ניתוח מלאי — BI",
    description: "שווי מלאי, הזדקנות, מלאי דומם, התראות הזמנה מחדש",
    icon: Package,
    href: "/reports/bi/inventory",
    color: "from-cyan-500/20 to-teal-500/10",
    borderColor: "border-cyan-500/30",
    iconColor: "text-cyan-400",
    badge: "חדש",
  },
  {
    id: "bi-hr",
    title: "ניתוח משאבי אנוש — BI",
    description: "ראשי כוח אדם, תחלופה, שעות נוספות, היעדרויות ועלויות שכר",
    icon: Users,
    href: "/reports/bi/hr",
    color: "from-pink-500/20 to-rose-500/10",
    borderColor: "border-pink-500/30",
    iconColor: "text-pink-400",
    badge: "חדש",
  },
];

const QUICK_LINKS = [
  { label: "דוחות מנהלים", href: "/finance/reports", icon: BarChart3 },
  { label: "מאזן ודוחות", href: "/finance/balance-sheet", icon: DollarSign },
  { label: "דוח הכנ׳ והוצ׳", href: "/finance/income-expenses-report", icon: TrendingUp },
  { label: "גבייה וסיכונים", href: "/crm/collections", icon: AlertTriangle },
  { label: "רווחיות יומית", href: "/crm/profitability", icon: Gauge },
  { label: "שווי עובד", href: "/hr/employee-value", icon: Users },
];

export default function ReportsHub() {
  const [search, setSearch] = useState("");

  const { data: hubData } = useQuery({
    queryKey: ["reports-hub"],
    queryFn: async () => {
      try {
        return await authJson(`${API}/reports-center/hub`);
      } catch {
        return { stats: {} };
      }
    },
  });

  const stats = hubData?.stats || {};

  const filtered = search
    ? REPORT_CATEGORIES.filter(
        (c) =>
          c.title.includes(search) ||
          c.description.includes(search)
      )
    : REPORT_CATEGORIES;

  return (
    <div className="space-y-4 sm:space-y-6" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2">
            <BarChart3 className="w-7 h-7 text-violet-400" />
            מרכז דוחות וניתוחים
          </h1>
          <p className="text-muted-foreground mt-1">
            כל הדוחות והניתוחים של המערכת במקום אחד
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {[
          { label: "חשבוניות", value: stats.invoices || 0, icon: FileText, color: "text-blue-400" },
          { label: "הוצאות", value: stats.expenses || 0, icon: DollarSign, color: "text-red-400" },
          { label: "לקוחות", value: stats.customers || 0, icon: Users, color: "text-green-400" },
          { label: "עובדים", value: stats.employees || 0, icon: Users, color: "text-purple-400" },
          { label: "אישורים פתוחים", value: stats.openTasks || 0, icon: Clock, color: "text-amber-400" },
          { label: "פעילות (7 ימים)", value: stats.recentActivity || 0, icon: Activity, color: "text-cyan-400" },
        ].map((stat, idx) => (
          <Card key={idx} className="bg-slate-900/50 border-slate-700/50">
            <CardContent className="p-3 text-center">
              <stat.icon className={`w-5 h-5 mx-auto ${stat.color} mb-1`} />
              <p className="text-lg font-bold text-foreground">{stat.value}</p>
              <p className="text-[10px] text-muted-foreground">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="חפש דוח..."
          className="pr-10 bg-slate-800 border-slate-700"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((cat) => (
          <Link key={cat.id} href={cat.href}>
            <Card
              className={`bg-gradient-to-br ${cat.color} ${cat.borderColor} hover:scale-[1.02] transition-all cursor-pointer group h-full`}
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="p-2.5 rounded-xl bg-slate-800/50">
                    <cat.icon className={`w-6 h-6 ${cat.iconColor}`} />
                  </div>
                  <ArrowUpRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <h3 className="text-base font-bold text-foreground mb-1">
                  {cat.title}
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {cat.description}
                </p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="mt-2">
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 className="w-5 h-5 text-violet-400" />
          <h2 className="text-base font-bold text-foreground">BI — דוחות עסקיים מתקדמים</h2>
          <Badge className="bg-violet-500/20 text-violet-400 text-[10px]">חדש</Badge>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {BI_CATEGORIES.map((cat) => (
            <Link key={cat.id} href={cat.href}>
              <Card
                className={`bg-gradient-to-br ${cat.color} ${cat.borderColor} hover:scale-[1.02] transition-all cursor-pointer group h-full`}
              >
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="p-2.5 rounded-xl bg-slate-800/50">
                      <cat.icon className={`w-6 h-6 ${cat.iconColor}`} />
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className="bg-violet-500/20 text-violet-400 text-[9px]">{cat.badge}</Badge>
                      <ArrowUpRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                  <h3 className="text-base font-bold text-foreground mb-1">{cat.title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{cat.description}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      <Card className="bg-slate-900/50 border-slate-700/50">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Star className="w-4 h-4 text-yellow-400" />
            גישה מהירה לדוחות קיימים
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
            {QUICK_LINKS.map((link, idx) => (
              <Link key={idx} href={link.href}>
                <div className="flex items-center gap-2 p-3 rounded-lg bg-slate-800/50 hover:bg-slate-700/50 transition-colors cursor-pointer text-center">
                  <link.icon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <span className="text-xs text-slate-300">{link.label}</span>
                </div>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <ActivityLog entityType="reports-hub" entityId="all" />
        <RelatedRecords entityType="reports-hub" entityId="all" />
      </div>
    </div>
  );
}