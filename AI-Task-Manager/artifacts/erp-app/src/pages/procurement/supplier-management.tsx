import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Truck, Users, Star, ShieldAlert, TrendingUp, AlertTriangle,
  ShoppingCart, Award, Ban, BarChart3, Phone, Mail, FileText, Calendar,
} from "lucide-react";

const fmt = (v: number) =>
  new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(v);

type SupplierStatus = "פעיל" | "מושהה" | "חסום";
type Category = "אלומיניום" | "זכוכית" | "ברזל" | "חומרי גלם" | "אביזרים";

interface Supplier {
  id: string;
  name: string;
  category: Category;
  status: SupplierStatus;
  riskScore: number;
  performanceScore: number;
  openOrders: number;
  totalVolume: number;
  lastDelivery: string;
  preferred: boolean;
  blacklisted: boolean;
  contact: string;
  phone: string;
  email: string;
}

const FALLBACK_SUPPLIERS: Supplier[] = [
  { id: "SUP-001", name: "אלומיניום ישראל בע\"מ", category: "אלומיניום", status: "פעיל", riskScore: 12, performanceScore: 94, openOrders: 5, totalVolume: 4850000, lastDelivery: "2026-04-06", preferred: true, blacklisted: false, contact: "רונן כהן", phone: "04-8551234", email: "ronen@alum-il.co.il" },
  { id: "SUP-002", name: "זכוכית הגליל", category: "זכוכית", status: "פעיל", riskScore: 18, performanceScore: 89, openOrders: 3, totalVolume: 3200000, lastDelivery: "2026-04-04", preferred: true, blacklisted: false, contact: "יעל לוי", phone: "04-9823456", email: "yael@galil-glass.co.il" },
  { id: "SUP-003", name: "פלדת צפון", category: "ברזל", status: "פעיל", riskScore: 25, performanceScore: 82, openOrders: 4, totalVolume: 2750000, lastDelivery: "2026-04-03", preferred: false, blacklisted: false, contact: "משה אברהם", phone: "04-6721234", email: "moshe@plada-zafon.co.il" },
  { id: "SUP-004", name: "חומרי בניין השרון", category: "חומרי גלם", status: "פעיל", riskScore: 30, performanceScore: 78, openOrders: 2, totalVolume: 1980000, lastDelivery: "2026-03-30", preferred: false, blacklisted: false, contact: "אבי דוד", phone: "09-7451234", email: "avi@sharon-mat.co.il" },
  { id: "SUP-005", name: "אביזרי מתכת בע\"מ", category: "אביזרים", status: "פעיל", riskScore: 15, performanceScore: 91, openOrders: 6, totalVolume: 1450000, lastDelivery: "2026-04-07", preferred: true, blacklisted: false, contact: "דנה שמש", phone: "03-5671234", email: "dana@metal-acc.co.il" },
  { id: "SUP-006", name: "זכוכית מחוסמת בע\"מ", category: "זכוכית", status: "מושהה", riskScore: 62, performanceScore: 55, openOrders: 1, totalVolume: 890000, lastDelivery: "2026-03-15", preferred: false, blacklisted: false, contact: "עמית גל", phone: "08-9281234", email: "amit@tempered.co.il" },
  { id: "SUP-007", name: "אל-פרופיל תעשיות", category: "אלומיניום", status: "פעיל", riskScore: 20, performanceScore: 86, openOrders: 3, totalVolume: 3600000, lastDelivery: "2026-04-05", preferred: true, blacklisted: false, contact: "טל ברק", phone: "04-8331234", email: "tal@el-profile.co.il" },
  { id: "SUP-008", name: "ברזל דרום בע\"מ", category: "ברזל", status: "חסום", riskScore: 85, performanceScore: 32, openOrders: 0, totalVolume: 520000, lastDelivery: "2025-12-20", preferred: false, blacklisted: true, contact: "ניר חלפון", phone: "08-6231234", email: "nir@iron-south.co.il" },
  { id: "SUP-009", name: "נירוסטה פלוס", category: "ברזל", status: "פעיל", riskScore: 22, performanceScore: 80, openOrders: 2, totalVolume: 1670000, lastDelivery: "2026-04-02", preferred: false, blacklisted: false, contact: "רותם שלום", phone: "03-9121234", email: "rotem@niro-plus.co.il" },
  { id: "SUP-010", name: "ידיות ומנעולים בע\"מ", category: "אביזרים", status: "חסום", riskScore: 78, performanceScore: 38, openOrders: 0, totalVolume: 310000, lastDelivery: "2026-01-10", preferred: false, blacklisted: true, contact: "שלמה כץ", phone: "02-5431234", email: "shlomo@handles.co.il" },
];

const kpis = {
  total: suppliers.length,
  active: suppliers.filter((s) => s.status === "פעיל").length,
  preferred: suppliers.filter((s) => s.preferred).length,
  blacklisted: suppliers.filter((s) => s.blacklisted).length,
  avgPerformance: Math.round(suppliers.reduce((a, s) => a + s.performanceScore, 0) / suppliers.length),
  avgRisk: Math.round(suppliers.reduce((a, s) => a + s.riskScore, 0) / suppliers.length),
  openOrders: suppliers.reduce((a, s) => a + s.openOrders, 0),
};

const statusColor = (s: SupplierStatus) => {
  switch (s) {
    case "פעיל": return "bg-emerald-500/20 text-emerald-300 border-emerald-500/30";
    case "מושהה": return "bg-amber-500/20 text-amber-300 border-amber-500/30";
    case "חסום": return "bg-red-500/20 text-red-300 border-red-500/30";
  }
};

const riskColor = (score: number) => {
  if (score <= 25) return "text-emerald-400";
  if (score <= 50) return "text-amber-400";
  if (score <= 75) return "text-orange-400";
  return "text-red-400";
};

const riskBg = (score: number) => {
  if (score <= 25) return "bg-emerald-500/20 text-emerald-300";
  if (score <= 50) return "bg-amber-500/20 text-amber-300";
  if (score <= 75) return "bg-orange-500/20 text-orange-300";
  return "bg-red-500/20 text-red-300";
};

const perfBarColor = (score: number) => {
  if (score >= 80) return "[&>div]:bg-emerald-500";
  if (score >= 60) return "[&>div]:bg-amber-500";
  return "[&>div]:bg-red-500";
};

const categoryColor = (c: Category) => {
  switch (c) {
    case "אלומיניום": return "bg-blue-500/20 text-blue-300 border-blue-500/30";
    case "זכוכית": return "bg-cyan-500/20 text-cyan-300 border-cyan-500/30";
    case "ברזל": return "bg-slate-500/20 text-slate-300 border-slate-500/30";
    case "חומרי גלם": return "bg-amber-500/20 text-amber-300 border-amber-500/30";
    case "אביזרים": return "bg-purple-500/20 text-purple-300 border-purple-500/30";
  }
};

function SupplierTable({ data, showContact }: { data: Supplier[]; showContact?: boolean }) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="border-slate-700 hover:bg-transparent">
          <TableHead className="text-slate-400 text-xs">ספק</TableHead>
          <TableHead className="text-slate-400 text-xs">קטגוריה</TableHead>
          <TableHead className="text-slate-400 text-xs">סטטוס</TableHead>
          <TableHead className="text-slate-400 text-xs text-center">סיכון</TableHead>
          <TableHead className="text-slate-400 text-xs w-[160px]">ביצועים</TableHead>
          <TableHead className="text-slate-400 text-xs text-center">הזמנות פתוחות</TableHead>
          <TableHead className="text-slate-400 text-xs">מחזור כולל</TableHead>
          <TableHead className="text-slate-400 text-xs">אספקה אחרונה</TableHead>
          {showContact && <TableHead className="text-slate-400 text-xs">איש קשר</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((s) => (
          <TableRow key={s.id} className="border-slate-700/50 hover:bg-slate-700/30">
            <TableCell>
              <div className="flex items-center gap-2">
                {s.preferred && <Star className="h-3.5 w-3.5 text-yellow-400 fill-yellow-400" />}
                {s.blacklisted && <Ban className="h-3.5 w-3.5 text-red-400" />}
                <span className="text-white font-medium text-sm">{s.name}</span>
              </div>
              <span className="text-[10px] text-slate-500">{s.id}</span>
            </TableCell>
            <TableCell>
              <Badge variant="outline" className={`text-[10px] ${categoryColor(s.category)}`}>{s.category}</Badge>
            </TableCell>
            <TableCell>
              <Badge variant="outline" className={`text-[10px] ${statusColor(s.status)}`}>{s.status}</Badge>
            </TableCell>
            <TableCell className="text-center">
              <span className={`font-mono font-bold text-sm px-2 py-0.5 rounded ${riskBg(s.riskScore)}`}>
                {s.riskScore}
              </span>
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-2">
                <Progress value={s.performanceScore} className={`h-2 bg-slate-700 ${perfBarColor(s.performanceScore)}`} />
                <span className={`font-mono text-xs font-bold min-w-[28px] ${riskColor(100 - s.performanceScore)}`}>
                  {s.performanceScore}
                </span>
              </div>
            </TableCell>
            <TableCell className="text-center">
              <span className="font-mono text-sm text-white">{s.openOrders}</span>
            </TableCell>
            <TableCell>
              <span className="font-mono text-sm text-slate-200">{fmt(s.totalVolume)}</span>
            </TableCell>
            <TableCell>
              <span className="text-xs text-slate-400">{s.lastDelivery}</span>
            </TableCell>
            {showContact && (
              <TableCell>
                <div className="text-xs text-slate-300">{s.contact}</div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <Phone className="h-2.5 w-2.5 text-slate-500" />
                  <span className="text-[10px] text-slate-500" dir="ltr">{s.phone}</span>
                </div>
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default function SupplierManagement() {
  const { data: suppliermanagementData } = useQuery({
    queryKey: ["supplier-management"],
    queryFn: () => authFetch("/api/procurement/supplier_management"),
    staleTime: 5 * 60 * 1000,
  });

  const suppliers = suppliermanagementData ?? FALLBACK_SUPPLIERS;

  const preferred = suppliers.filter((s) => s.preferred);
  const blacklisted = suppliers.filter((s) => s.blacklisted);
  const ranked = [...suppliers].sort((a, b) => b.performanceScore - a.performanceScore);

  return (
    <div className="p-6 space-y-5 bg-slate-900 min-h-screen" dir="rtl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2 text-white">
          <Truck className="h-7 w-7 text-blue-400" /> ניהול ספקים — 360°
        </h1>
        <p className="text-sm text-slate-400 mt-0.5">
          ספקים | ביצועים | סיכונים | מחירים | חוזים — טכנו-כל עוזי
        </p>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-7 gap-3">
        {[
          { label: "סה\"כ ספקים", value: String(kpis.total), icon: Users, color: "text-blue-400", border: "border-blue-500/30" },
          { label: "פעילים", value: String(kpis.active), icon: TrendingUp, color: "text-emerald-400", border: "border-emerald-500/30" },
          { label: "מועדפים", value: String(kpis.preferred), icon: Star, color: "text-yellow-400", border: "border-yellow-500/30" },
          { label: "חסומים", value: String(kpis.blacklisted), icon: ShieldAlert, color: "text-red-400", border: "border-red-500/30" },
          { label: "ביצועים ממוצע", value: String(kpis.avgPerformance), icon: Award, color: "text-purple-400", border: "border-purple-500/30" },
          { label: "סיכון ממוצע", value: String(kpis.avgRisk), icon: AlertTriangle, color: "text-orange-400", border: "border-orange-500/30" },
          { label: "הזמנות פתוחות", value: String(kpis.openOrders), icon: ShoppingCart, color: "text-cyan-400", border: "border-cyan-500/30" },
        ].map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <Card key={i} className={`bg-slate-800/50 ${kpi.border} border shadow-lg`}>
              <CardContent className="pt-3 pb-2 text-center px-2">
                <Icon className={`h-5 w-5 mx-auto ${kpi.color} mb-1`} />
                <p className="text-[10px] text-slate-400 leading-tight">{kpi.label}</p>
                <p className={`text-lg font-bold font-mono ${kpi.color}`}>{kpi.value}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Main Supplier Table */}
      <Card className="bg-slate-800/50 border-slate-700 shadow-lg">
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-white flex items-center gap-2">
            <FileText className="h-4 w-4 text-blue-400" /> רשימת ספקים — כל הספקים
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <SupplierTable data={suppliers} showContact />
        </CardContent>
      </Card>

      {/* Bottom Tabs */}
      <Tabs defaultValue="preferred" dir="rtl">
        <TabsList className="bg-slate-800 border border-slate-700">
          <TabsTrigger value="preferred" className="data-[state=active]:bg-yellow-500/20 data-[state=active]:text-yellow-300 text-slate-400 gap-1">
            <Star className="h-3.5 w-3.5" /> מועדפים
          </TabsTrigger>
          <TabsTrigger value="blacklisted" className="data-[state=active]:bg-red-500/20 data-[state=active]:text-red-300 text-slate-400 gap-1">
            <Ban className="h-3.5 w-3.5" /> חסומים
          </TabsTrigger>
          <TabsTrigger value="performance" className="data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-300 text-slate-400 gap-1">
            <BarChart3 className="h-3.5 w-3.5" /> ביצועים
          </TabsTrigger>
        </TabsList>

        {/* Preferred Suppliers */}
        <TabsContent value="preferred">
          <Card className="bg-slate-800/50 border-slate-700 shadow-lg">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-yellow-300 flex items-center gap-2">
                <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" /> ספקים מועדפים ({preferred.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <SupplierTable data={preferred} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Blacklisted Suppliers */}
        <TabsContent value="blacklisted">
          <Card className="bg-slate-800/50 border-slate-700 shadow-lg">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-red-300 flex items-center gap-2">
                <Ban className="h-4 w-4 text-red-400" /> ספקים חסומים ({blacklisted.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700 hover:bg-transparent">
                    <TableHead className="text-slate-400 text-xs">ספק</TableHead>
                    <TableHead className="text-slate-400 text-xs">קטגוריה</TableHead>
                    <TableHead className="text-slate-400 text-xs text-center">ציון סיכון</TableHead>
                    <TableHead className="text-slate-400 text-xs text-center">ציון ביצועים</TableHead>
                    <TableHead className="text-slate-400 text-xs">אספקה אחרונה</TableHead>
                    <TableHead className="text-slate-400 text-xs">מחזור</TableHead>
                    <TableHead className="text-slate-400 text-xs">סיבת חסימה</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {blacklisted.map((s) => (
                    <TableRow key={s.id} className="border-slate-700/50 hover:bg-slate-700/30">
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Ban className="h-3.5 w-3.5 text-red-400" />
                          <span className="text-white font-medium text-sm">{s.name}</span>
                        </div>
                        <span className="text-[10px] text-slate-500">{s.id}</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[10px] ${categoryColor(s.category)}`}>{s.category}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="font-mono font-bold text-sm px-2 py-0.5 rounded bg-red-500/20 text-red-300">{s.riskScore}</span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="font-mono font-bold text-sm px-2 py-0.5 rounded bg-red-500/20 text-red-300">{s.performanceScore}</span>
                      </TableCell>
                      <TableCell className="text-xs text-slate-400">{s.lastDelivery}</TableCell>
                      <TableCell className="font-mono text-sm text-slate-200">{fmt(s.totalVolume)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px] bg-red-500/10 text-red-300 border-red-500/30">
                          {s.id === "SUP-008" ? "איכות לקויה חוזרת" : "אי עמידה בלו\"ז"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Performance Ranking */}
        <TabsContent value="performance">
          <Card className="bg-slate-800/50 border-slate-700 shadow-lg">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-purple-300 flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-purple-400" /> דירוג ביצועים — כל הספקים
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700 hover:bg-transparent">
                    <TableHead className="text-slate-400 text-xs w-[40px] text-center">#</TableHead>
                    <TableHead className="text-slate-400 text-xs">ספק</TableHead>
                    <TableHead className="text-slate-400 text-xs">קטגוריה</TableHead>
                    <TableHead className="text-slate-400 text-xs w-[200px]">ציון ביצועים</TableHead>
                    <TableHead className="text-slate-400 text-xs text-center">סיכון</TableHead>
                    <TableHead className="text-slate-400 text-xs">מחזור</TableHead>
                    <TableHead className="text-slate-400 text-xs text-center">הזמנות</TableHead>
                    <TableHead className="text-slate-400 text-xs">סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ranked.map((s, i) => (
                    <TableRow key={s.id} className="border-slate-700/50 hover:bg-slate-700/30">
                      <TableCell className="text-center">
                        {i < 3 ? (
                          <span className={`font-bold text-sm ${i === 0 ? "text-yellow-400" : i === 1 ? "text-slate-300" : "text-amber-600"}`}>
                            {i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉"}
                          </span>
                        ) : (
                          <span className="text-slate-500 font-mono text-xs">{i + 1}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {s.preferred && <Star className="h-3 w-3 text-yellow-400 fill-yellow-400" />}
                          {s.blacklisted && <Ban className="h-3 w-3 text-red-400" />}
                          <span className="text-white font-medium text-sm">{s.name}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[10px] ${categoryColor(s.category)}`}>{s.category}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={s.performanceScore} className={`h-2.5 bg-slate-700 flex-1 ${perfBarColor(s.performanceScore)}`} />
                          <span className={`font-mono text-xs font-bold min-w-[28px] ${s.performanceScore >= 80 ? "text-emerald-400" : s.performanceScore >= 60 ? "text-amber-400" : "text-red-400"}`}>
                            {s.performanceScore}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className={`font-mono font-bold text-xs px-2 py-0.5 rounded ${riskBg(s.riskScore)}`}>
                          {s.riskScore}
                        </span>
                      </TableCell>
                      <TableCell className="font-mono text-sm text-slate-200">{fmt(s.totalVolume)}</TableCell>
                      <TableCell className="text-center font-mono text-sm text-white">{s.openOrders}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[10px] ${statusColor(s.status)}`}>{s.status}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
