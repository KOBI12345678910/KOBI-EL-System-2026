import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Truck, Package, Clock, AlertTriangle, DollarSign, CheckCircle2,
  TrendingUp, Link2, BarChart3, Layers, Search, ArrowLeft,
  Shield, Warehouse, Gauge, ExternalLink, Bell, XCircle,
  Factory, ClipboardList, Eye
} from "lucide-react";
import { useLocation } from "wouter";

const FALLBACK_ALERTS = [
  { id: 1, type: "critical", message: "חוסר מלאי - פרופיל אלומיניום 6063-T5", source: "מחסן ראשי", time: "לפני 15 דקות" },
  { id: 2, type: "warning", message: "עיכוב משלוח - Foshan Glass Co. (3 ימים)", source: "ספק סין", time: "לפני שעה" },
  { id: 3, type: "info", message: "הזמנה #PO-4521 נקלטה במחסן", source: "קליטת סחורה", time: "לפני 2 שעות" },
  { id: 4, type: "warning", message: "עלייה ב-8% במחיר אלומיניום גולמי", source: "LME מטאלס", time: "לפני 3 שעות" },
  { id: 5, type: "critical", message: "ספק Schuco - אי עמידה באיכות, משלוח #SH-892", source: "בקרת איכות", time: "לפני 5 שעות" },
];

const FALLBACK_QUICKLINKS = [
  { title: "מרכז פיקוד שרשרת אספקה", desc: "תצוגה מרכזית וניהול בזמן אמת", icon: Gauge, href: "/supply-chain/command-center", color: "text-emerald-400", bg: "bg-emerald-500/10" },
  { title: "תכנון ביקושים", desc: "תחזיות וניתוח צרכים עתידיים", icon: BarChart3, href: "/supply-chain/demand-planning", color: "text-blue-400", bg: "bg-blue-500/10" },
  { title: "נראות שרשרת אספקה", desc: "מעקב משלוחים ומפת ספקים", icon: Eye, href: "/supply-chain/visibility", color: "text-purple-400", bg: "bg-purple-500/10" },
  { title: "מרכז BOM", desc: "ניהול עצי מוצר ורכיבים", icon: Layers, href: "/supply-chain/bom-center", color: "text-amber-400", bg: "bg-amber-500/10" },
  { title: "אנליטיקה ודוחות", desc: "ביצועי שרשרת אספקה ומגמות", icon: TrendingUp, href: "/supply-chain/analytics", color: "text-cyan-400", bg: "bg-cyan-500/10" },
];

const FALLBACK_TOPSUPPLIERS = [
  { name: "Schuco International", category: "פרופילי אלומיניום", fillRate: 94, leadTime: 12, onTime: 91 },
  { name: "Foshan Glass Co.", category: "זכוכית מחוסמת", fillRate: 88, leadTime: 21, onTime: 82 },
  { name: "קבוצת אלומיל", category: "אלומיניום מקומי", fillRate: 97, leadTime: 5, onTime: 96 },
  { name: "MetalPro Turkey", category: "פלדת אל-חלד", fillRate: 91, leadTime: 14, onTime: 87 },
  { name: "Saint-Gobain", category: "זכוכית מיוחדת", fillRate: 95, leadTime: 18, onTime: 93 },
];

const alertColors: Record<string, { badge: string; icon: string }> = {
  critical: { badge: "bg-red-500/20 text-red-400", icon: "text-red-400" },
  warning: { badge: "bg-amber-500/20 text-amber-400", icon: "text-amber-400" },
  info: { badge: "bg-blue-500/20 text-blue-400", icon: "text-blue-400" },
};

export default function SupplyChainDashboard() {
  const { data: apialerts } = useQuery({
    queryKey: ["/api/supply-chain/supply-chain-dashboard/alerts"],
    queryFn: () => authFetch("/api/supply-chain/supply-chain-dashboard/alerts").then(r => r.json()).catch(() => null),
  });
  const alerts = Array.isArray(apialerts) ? apialerts : (apialerts?.data ?? apialerts?.items ?? FALLBACK_ALERTS);


  const { data: apiquickLinks } = useQuery({
    queryKey: ["/api/supply-chain/supply-chain-dashboard/quicklinks"],
    queryFn: () => authFetch("/api/supply-chain/supply-chain-dashboard/quicklinks").then(r => r.json()).catch(() => null),
  });
  const quickLinks = Array.isArray(apiquickLinks) ? apiquickLinks : (apiquickLinks?.data ?? apiquickLinks?.items ?? FALLBACK_QUICKLINKS);


  const { data: apitopSuppliers } = useQuery({
    queryKey: ["/api/supply-chain/supply-chain-dashboard/topsuppliers"],
    queryFn: () => authFetch("/api/supply-chain/supply-chain-dashboard/topsuppliers").then(r => r.json()).catch(() => null),
  });
  const topSuppliers = Array.isArray(apitopSuppliers) ? apitopSuppliers : (apitopSuppliers?.data ?? apitopSuppliers?.items ?? FALLBACK_TOPSUPPLIERS);

  const [, navigate] = useLocation();

  const kpis = [
    { label: "משלוחים פעילים", value: "23", icon: Truck, color: "text-blue-400", bg: "bg-blue-500/10" },
    { label: "שיעור מילוי ספקים", value: "93%", icon: Package, color: "text-emerald-400", bg: "bg-emerald-500/10" },
    { label: "זמן אספקה ממוצע", value: "14 ימים", icon: Clock, color: "text-amber-400", bg: "bg-amber-500/10" },
    { label: "חוסרי מלאי", value: "3", icon: AlertTriangle, color: "text-red-400", bg: "bg-red-500/10" },
    { label: "הוצאות רכש", value: "₪4.2M", icon: DollarSign, color: "text-purple-400", bg: "bg-purple-500/10" },
    { label: "אספקה בזמן", value: "89%", icon: CheckCircle2, color: "text-cyan-400", bg: "bg-cyan-500/10" },
  ];

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Link2 className="h-7 w-7 text-emerald-400" />
            שרשרת אספקה - טכנו-כל עוזי
          </h1>
          <p className="text-sm text-muted-foreground mt-1">סקירה כללית, התראות וגישה מהירה למרכזי ניהול</p>
        </div>
        <Button
          onClick={() => navigate("/supply-chain/command-center")}
          className="bg-emerald-600 hover:bg-emerald-700"
        >
          <Gauge className="w-4 h-4 ml-1" />
          מרכז פיקוד
          <ExternalLink className="w-3.5 h-3.5 mr-1" />
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpis.map((kpi, i) => (
          <Card key={i} className="bg-card/80 border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${kpi.bg}`}>
                  <kpi.icon className={`h-5 w-5 ${kpi.color}`} />
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground leading-tight">{kpi.label}</p>
                  <p className={`text-lg font-bold font-mono ${kpi.color}`}>{kpi.value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Links */}
      <Card className="bg-card/60 border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Layers className="h-5 w-5 text-purple-400" />
            גישה מהירה
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {quickLinks.map((link, idx) => (
              <button
                key={idx}
                onClick={() => navigate(link.href)}
                className="p-4 bg-muted/20 rounded-lg border border-border/30 hover:border-border/60 hover:bg-muted/40 transition-all text-right"
              >
                <div className={`p-2 rounded-lg ${link.bg} w-fit mb-2`}>
                  <link.icon className={`h-5 w-5 ${link.color}`} />
                </div>
                <h3 className="text-sm font-medium text-foreground">{link.title}</h3>
                <p className="text-[11px] text-muted-foreground mt-1">{link.desc}</p>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Alerts */}
        <Card className="bg-card/60 border-border/50">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Bell className="h-5 w-5 text-amber-400" />
                התראות אחרונות
              </CardTitle>
              <Badge variant="outline" className="text-red-400 border-red-500/30">
                {alerts.filter((a) => a.type === "critical").length} קריטיות
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className="flex items-start gap-3 p-3 bg-muted/20 rounded-lg border border-border/30"
              >
                {alert.type === "critical" && <XCircle className={`h-5 w-5 mt-0.5 ${alertColors.critical.icon} shrink-0`} />}
                {alert.type === "warning" && <AlertTriangle className={`h-5 w-5 mt-0.5 ${alertColors.warning.icon} shrink-0`} />}
                {alert.type === "info" && <CheckCircle2 className={`h-5 w-5 mt-0.5 ${alertColors.info.icon} shrink-0`} />}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground">{alert.message}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge className={alertColors[alert.type].badge + " text-[10px]"}>{alert.source}</Badge>
                    <span className="text-[10px] text-muted-foreground">{alert.time}</span>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Top Suppliers */}
        <Card className="bg-card/60 border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Factory className="h-5 w-5 text-blue-400" />
              ביצועי ספקים מובילים
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {topSuppliers.map((s, idx) => (
              <div key={idx} className="p-3 bg-muted/20 rounded-lg border border-border/30">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h4 className="text-sm font-medium text-foreground">{s.name}</h4>
                    <p className="text-[11px] text-muted-foreground">{s.category}</p>
                  </div>
                  <Badge variant="outline" className="text-xs">{s.leadTime} ימים</Badge>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="flex justify-between text-[10px] mb-1">
                      <span className="text-muted-foreground">שיעור מילוי</span>
                      <span className={`font-mono ${s.fillRate >= 95 ? "text-green-400" : s.fillRate >= 90 ? "text-amber-400" : "text-red-400"}`}>{s.fillRate}%</span>
                    </div>
                    <Progress value={s.fillRate} className="h-1.5" />
                  </div>
                  <div>
                    <div className="flex justify-between text-[10px] mb-1">
                      <span className="text-muted-foreground">אספקה בזמן</span>
                      <span className={`font-mono ${s.onTime >= 95 ? "text-green-400" : s.onTime >= 85 ? "text-amber-400" : "text-red-400"}`}>{s.onTime}%</span>
                    </div>
                    <Progress value={s.onTime} className="h-1.5" />
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
