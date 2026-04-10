import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Headset, PhoneCall, ShieldCheck, RotateCcw, Wrench, Clock,
  TrendingUp, TrendingDown, Package, AlertTriangle, CalendarCheck,
  CircleDollarSign, Truck, CheckCircle, Timer, Users
} from "lucide-react";

const fmt = (v: number) => `₪${v.toLocaleString("he-IL")}`;

type SvcStatus = "open" | "in_progress" | "resolved" | "closed";
type WrtStatus = "active" | "claimed" | "expired" | "approved" | "rejected";
type UrgencyLevel = "low" | "medium" | "high" | "critical";

const svcStatusCfg: Record<SvcStatus, { label: string; cls: string }> = {
  open: { label: "פתוחה", cls: "bg-blue-500/20 text-blue-400" },
  in_progress: { label: "בטיפול", cls: "bg-amber-500/20 text-amber-400" },
  resolved: { label: "טופלה", cls: "bg-emerald-500/20 text-emerald-400" },
  closed: { label: "סגורה", cls: "bg-zinc-500/20 text-zinc-400" },
};

const wrtStatusCfg: Record<WrtStatus, { label: string; cls: string }> = {
  active: { label: "פעילה", cls: "bg-emerald-500/20 text-emerald-400" },
  claimed: { label: "תביעה", cls: "bg-amber-500/20 text-amber-400" },
  expired: { label: "פגה", cls: "bg-zinc-500/20 text-zinc-400" },
  approved: { label: "אושרה", cls: "bg-blue-500/20 text-blue-400" },
  rejected: { label: "נדחתה", cls: "bg-red-500/20 text-red-400" },
};

const urgencyCfg: Record<UrgencyLevel, { label: string; cls: string }> = {
  low: { label: "נמוכה", cls: "bg-zinc-500/20 text-zinc-400" },
  medium: { label: "בינונית", cls: "bg-blue-500/20 text-blue-400" },
  high: { label: "גבוהה", cls: "bg-amber-500/20 text-amber-400" },
  critical: { label: "קריטית", cls: "bg-red-500/20 text-red-400" },
};

const FALLBACK_SERVICE_CALLS = [
  { id: "SVC-301", customer: "אלון מערכות בע\"מ", product: "שער חשמלי דגם Premium", issue: "מנוע לא מגיב לשלט", reported: "2026-04-01", technician: "יוסי כהן", status: "open" as SvcStatus },
  { id: "SVC-302", customer: "נדל\"ן צפון", product: "חלון אלומיניום כפול", issue: "רטיבות חודרת מהמסגרת", reported: "2026-03-28", technician: "מוטי לוי", status: "in_progress" as SvcStatus },
  { id: "SVC-303", customer: "קיבוץ דגניה", product: "מעקה נירוסטה 12 מ'", issue: "חלודה בנקודות ריתוך", reported: "2026-03-25", technician: "אבי דוד", status: "resolved" as SvcStatus },
  { id: "SVC-304", customer: "עיריית חיפה", product: "גדר מתכת דקורטיבית", issue: "דופן מתרופפת ברוח", reported: "2026-04-03", technician: "יוסי כהן", status: "open" as SvcStatus },
  { id: "SVC-305", customer: "מפעלי הדרום", product: "תריס גלילה חשמלי", issue: "מנגנון גלילה תקוע", reported: "2026-03-30", technician: "רפי אזולאי", status: "in_progress" as SvcStatus },
  { id: "SVC-306", customer: "רשת סופר-בית", product: "דלת כניסה מפלדה", issue: "ציר עליון שבור", reported: "2026-04-05", technician: "מוטי לוי", status: "open" as SvcStatus },
  { id: "SVC-307", customer: "בית ספר אורט", product: "פרגולה אלומיניום 4x5", issue: "בד הצללה קרוע", reported: "2026-03-20", technician: "אבי דוד", status: "closed" as SvcStatus },
  { id: "SVC-308", customer: "משרד הביטחון", product: "שער חשמלי דגם ProX", issue: "בקר אלקטרוני כבוי", reported: "2026-04-06", technician: "רפי אזולאי", status: "open" as SvcStatus },
];

const FALLBACK_WARRANTY_CASES = [
  { id: "WRT-101", product: "שער חשמלי דגם Premium", installed: "2024-08-15", expiry: "2026-08-15", claim: "מנוע שרוף — אחריות מקורית", status: "claimed" as WrtStatus },
  { id: "WRT-102", product: "חלון אלומיניום כפול", installed: "2025-01-10", expiry: "2027-01-10", claim: "—", status: "active" as WrtStatus },
  { id: "WRT-103", product: "מעקה נירוסטה 12 מ'", installed: "2023-06-20", expiry: "2025-06-20", claim: "חלודה בנקודות ריתוך", status: "expired" as WrtStatus },
  { id: "WRT-104", product: "דלת כניסה מפלדה", installed: "2025-05-02", expiry: "2027-05-02", claim: "ציר מתעוות", status: "approved" as WrtStatus },
  { id: "WRT-105", product: "פרגולה אלומיניום 4x5", installed: "2024-11-18", expiry: "2026-11-18", claim: "צבע מתקלף", status: "claimed" as WrtStatus },
  { id: "WRT-106", product: "תריס גלילה חשמלי", installed: "2025-09-05", expiry: "2027-09-05", claim: "—", status: "active" as WrtStatus },
  { id: "WRT-107", product: "גדר מתכת דקורטיבית", installed: "2023-12-01", expiry: "2025-12-01", claim: "שחיקה לא סבירה", status: "rejected" as WrtStatus },
  { id: "WRT-108", product: "שער חשמלי דגם ProX", installed: "2025-03-22", expiry: "2028-03-22", claim: "—", status: "active" as WrtStatus },
];

const FALLBACK_RETURN_VISITS = [
  { id: "RV-01", serviceCall: "SVC-302", customer: "נדל\"ן צפון", product: "חלון אלומיניום כפול", scheduledDate: "2026-04-10", technician: "מוטי לוי", reason: "המשך איטום מסגרת", status: "scheduled" },
  { id: "RV-02", serviceCall: "SVC-305", customer: "מפעלי הדרום", product: "תריס גלילה חשמלי", scheduledDate: "2026-04-12", technician: "רפי אזולאי", reason: "החלפת מנגנון גלילה", status: "scheduled" },
  { id: "RV-03", serviceCall: "SVC-301", customer: "אלון מערכות בע\"מ", product: "שער חשמלי דגם Premium", scheduledDate: "2026-04-08", technician: "יוסי כהן", reason: "בדיקת מנוע חלופי", status: "today" },
  { id: "RV-04", serviceCall: "SVC-303", customer: "קיבוץ דגניה", product: "מעקה נירוסטה 12 מ'", scheduledDate: "2026-04-15", technician: "אבי דוד", reason: "ביקורת סופית לאחר תיקון", status: "scheduled" },
  { id: "RV-05", serviceCall: "SVC-306", customer: "רשת סופר-בית", product: "דלת כניסה מפלדה", scheduledDate: "2026-04-09", technician: "מוטי לוי", reason: "התקנת ציר חדש", status: "scheduled" },
  { id: "RV-06", serviceCall: "SVC-304", customer: "עיריית חיפה", product: "גדר מתכת דקורטיבית", scheduledDate: "2026-04-14", technician: "יוסי כהן", reason: "חיזוק עוגנים", status: "scheduled" },
];

const FALLBACK_SPARE_PARTS = [
  { id: "SP-01", part: "מנוע 24V DC 350W", qty: 2, forProduct: "שער חשמלי דגם Premium", urgency: "high" as UrgencyLevel, status: "pending" },
  { id: "SP-02", part: "גומיית איטום 5x3000mm", qty: 8, forProduct: "חלון אלומיניום כפול", urgency: "medium" as UrgencyLevel, status: "ordered" },
  { id: "SP-03", part: "ציר כבד 120mm נירוסטה", qty: 4, forProduct: "דלת כניסה מפלדה", urgency: "high" as UrgencyLevel, status: "pending" },
  { id: "SP-04", part: "מנגנון גלילה סטנדרט", qty: 1, forProduct: "תריס גלילה חשמלי", urgency: "critical" as UrgencyLevel, status: "pending" },
  { id: "SP-05", part: "עוגן בטון M12x150", qty: 12, forProduct: "גדר מתכת דקורטיבית", urgency: "medium" as UrgencyLevel, status: "in_stock" },
  { id: "SP-06", part: "בקר אלקטרוני ProX-V2", qty: 1, forProduct: "שער חשמלי דגם ProX", urgency: "critical" as UrgencyLevel, status: "ordered" },
  { id: "SP-07", part: "בד הצללה 280gr שחור", qty: 3, forProduct: "פרגולה אלומיניום 4x5", urgency: "low" as UrgencyLevel, status: "in_stock" },
  { id: "SP-08", part: "שלט רחוק 433MHz", qty: 5, forProduct: "שער חשמלי דגם Premium", urgency: "low" as UrgencyLevel, status: "ordered" },
];

const spareStatusCfg: Record<string, { label: string; cls: string }> = {
  pending: { label: "ממתין", cls: "bg-amber-500/20 text-amber-400" },
  ordered: { label: "הוזמן", cls: "bg-blue-500/20 text-blue-400" },
  in_stock: { label: "במלאי", cls: "bg-emerald-500/20 text-emerald-400" },
};

const FALLBACK_COST_DATA = [
  { id: "SVC-301", customer: "אלון מערכות בע\"מ", product: "שער חשמלי Premium", laborCost: 450, partsCost: 1200, travelCost: 120, total: 1770 },
  { id: "SVC-302", customer: "נדל\"ן צפון", product: "חלון אלומיניום כפול", laborCost: 300, partsCost: 85, travelCost: 180, total: 565 },
  { id: "SVC-303", customer: "קיבוץ דגניה", product: "מעקה נירוסטה 12 מ'", laborCost: 600, partsCost: 320, travelCost: 250, total: 1170 },
  { id: "SVC-304", customer: "עיריית חיפה", product: "גדר מתכת דקורטיבית", laborCost: 350, partsCost: 180, travelCost: 90, total: 620 },
  { id: "SVC-305", customer: "מפעלי הדרום", product: "תריס גלילה חשמלי", laborCost: 250, partsCost: 680, travelCost: 200, total: 1130 },
  { id: "SVC-306", customer: "רשת סופר-בית", product: "דלת כניסה מפלדה", laborCost: 200, partsCost: 340, travelCost: 60, total: 600 },
  { id: "SVC-307", customer: "בית ספר אורט", product: "פרגולה אלומיניום 4x5", laborCost: 150, partsCost: 95, travelCost: 80, total: 325 },
  { id: "SVC-308", customer: "משרד הביטחון", product: "שער חשמלי ProX", laborCost: 500, partsCost: 2400, travelCost: 150, total: 3050 },
];


const costData = FALLBACK_COST_DATA;
const returnVisits = FALLBACK_RETURN_VISITS;
const serviceCalls = FALLBACK_SERVICE_CALLS;
const spareParts = FALLBACK_SPARE_PARTS;
const warrantyCases = FALLBACK_WARRANTY_CASES;

const totalServiceCost = costData.reduce((s, c) => s + c.total, 0);
const openCalls = serviceCalls.filter(s => s.status === "open").length;
const activeWarranties = warrantyCases.filter(w => w.status === "active").length;
const scheduledVisits = returnVisits.filter(v => v.status === "scheduled" || v.status === "today").length;
const pendingParts = spareParts.filter(p => p.status === "pending").length;

export default function ServiceWarranty() {
  const { data: servicewarrantyData } = useQuery({
    queryKey: ["service-warranty"],
    queryFn: () => authFetch("/api/service/service_warranty"),
    staleTime: 5 * 60 * 1000,
  });

  const serviceCalls = servicewarrantyData ?? FALLBACK_SERVICE_CALLS;
  const costData = FALLBACK_COST_DATA;
  const returnVisits = FALLBACK_RETURN_VISITS;
  const spareParts = FALLBACK_SPARE_PARTS;
  const warrantyCases = FALLBACK_WARRANTY_CASES;

  const [activeTab, setActiveTab] = useState("calls");

  return (
    <div className="p-6 space-y-5" dir="rtl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Headset className="h-7 w-7 text-cyan-400" /> שירות ואחריות
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          טכנו-כל עוזי — קריאות שירות, אחריות, ביקורים חוזרים, חלקי חילוף ומעקב עלויות
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: "קריאות שירות פתוחות", value: `${openCalls}`, color: "text-blue-400", icon: PhoneCall, trend: "+2", up: false },
          { label: "אחריות פעילות", value: `${activeWarranties}`, color: "text-emerald-400", icon: ShieldCheck, trend: "יציב", up: true },
          { label: "ביקורים מתוכננים", value: `${scheduledVisits}`, color: "text-amber-400", icon: CalendarCheck, trend: "+3", up: false },
          { label: "זמן תגובה ממוצע", value: "4.2 שעות", color: "text-purple-400", icon: Timer, trend: "-12%", up: true },
          { label: "חלפים ממתינים", value: `${pendingParts}`, color: "text-red-400", icon: Package, trend: "+1", up: false },
          { label: "עלות שירות החודש", value: fmt(totalServiceCost), color: "text-cyan-400", icon: CircleDollarSign, trend: "-8%", up: true },
        ].map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <Card key={i} className="bg-card/80 border-border hover:border-border/80 transition-colors">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[11px] text-muted-foreground">{kpi.label}</p>
                    <p className={`text-lg font-bold font-mono mt-1 ${kpi.color}`}>{kpi.value}</p>
                    <div className="flex items-center gap-1 mt-1">
                      {kpi.up ? <TrendingUp className="h-3 w-3 text-emerald-400" /> : <TrendingDown className="h-3 w-3 text-red-400" />}
                      <span className={`text-[10px] ${kpi.up ? "text-emerald-400" : "text-red-400"}`}>{kpi.trend}</span>
                    </div>
                  </div>
                  <Icon className={`h-5 w-5 ${kpi.color} opacity-40`} />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-5 w-full max-w-3xl">
          <TabsTrigger value="calls" className="text-xs gap-1"><PhoneCall className="h-3.5 w-3.5" /> קריאות שירות</TabsTrigger>
          <TabsTrigger value="warranty" className="text-xs gap-1"><ShieldCheck className="h-3.5 w-3.5" /> אחריות</TabsTrigger>
          <TabsTrigger value="visits" className="text-xs gap-1"><RotateCcw className="h-3.5 w-3.5" /> ביקורים</TabsTrigger>
          <TabsTrigger value="parts" className="text-xs gap-1"><Package className="h-3.5 w-3.5" /> חלקי חילוף</TabsTrigger>
          <TabsTrigger value="costs" className="text-xs gap-1"><CircleDollarSign className="h-3.5 w-3.5" /> עלויות</TabsTrigger>
        </TabsList>

        {/* Tab 1: Service Calls */}
        <TabsContent value="calls" className="mt-4">
          <Card className="bg-card/80 border-border">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-border bg-background/50">
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">מספר</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">לקוח</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">מוצר</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">תקלה</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">תאריך דיווח</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">טכנאי</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">סטטוס</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {serviceCalls.map(c => (
                      <TableRow key={c.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                        <TableCell className="font-mono text-xs text-blue-400">{c.id}</TableCell>
                        <TableCell className="text-xs font-medium text-foreground">{c.customer}</TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[160px] truncate">{c.product}</TableCell>
                        <TableCell className="text-xs text-foreground max-w-[180px] truncate">{c.issue}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{c.reported}</TableCell>
                        <TableCell className="text-xs text-foreground flex items-center gap-1"><Users className="h-3 w-3 text-muted-foreground" />{c.technician}</TableCell>
                        <TableCell><Badge className={`text-[10px] ${svcStatusCfg[c.status].cls}`}>{svcStatusCfg[c.status].label}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Warranty Cases */}
        <TabsContent value="warranty" className="mt-4">
          <Card className="bg-card/80 border-border">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-border bg-background/50">
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">מספר</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">מוצר</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">תאריך התקנה</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">תפוגת אחריות</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">תביעה</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">סטטוס</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">נותר</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {warrantyCases.map(w => {
                      const expiryDate = new Date(w.expiry);
                      const now = new Date();
                      const daysLeft = Math.round((expiryDate.getTime() - now.getTime()) / 86400000);
                      const totalDays = Math.round((expiryDate.getTime() - new Date(w.installed).getTime()) / 86400000);
                      const elapsed = Math.max(0, Math.min(100, ((totalDays - Math.max(0, daysLeft)) / totalDays) * 100));
                      return (
                        <TableRow key={w.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                          <TableCell className="font-mono text-xs text-blue-400">{w.id}</TableCell>
                          <TableCell className="text-xs font-medium text-foreground">{w.product}</TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">{w.installed}</TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">{w.expiry}</TableCell>
                          <TableCell className="text-xs text-foreground max-w-[180px] truncate">{w.claim}</TableCell>
                          <TableCell><Badge className={`text-[10px] ${wrtStatusCfg[w.status].cls}`}>{wrtStatusCfg[w.status].label}</Badge></TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1 min-w-[90px]">
                              <Progress value={elapsed} className="h-1.5" />
                              <span className={`text-[10px] font-mono ${daysLeft <= 0 ? "text-red-400" : daysLeft < 90 ? "text-amber-400" : "text-emerald-400"}`}>
                                {daysLeft <= 0 ? "פגה" : `${daysLeft} ימים`}
                              </span>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: Return Visits */}
        <TabsContent value="visits" className="mt-4">
          <Card className="bg-card/80 border-border">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-border bg-background/50">
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">מספר</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">קריאה</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">לקוח</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">מוצר</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">תאריך מתוכנן</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">טכנאי</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">סיבה</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">סטטוס</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {returnVisits.map(v => (
                      <TableRow key={v.id} className={`border-b border-border/50 hover:bg-muted/30 transition-colors ${v.status === "today" ? "bg-cyan-500/5" : ""}`}>
                        <TableCell className="font-mono text-xs text-blue-400">{v.id}</TableCell>
                        <TableCell className="font-mono text-xs text-purple-400">{v.serviceCall}</TableCell>
                        <TableCell className="text-xs font-medium text-foreground">{v.customer}</TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[150px] truncate">{v.product}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{v.scheduledDate}</TableCell>
                        <TableCell className="text-xs text-foreground">{v.technician}</TableCell>
                        <TableCell className="text-xs text-foreground max-w-[160px] truncate">{v.reason}</TableCell>
                        <TableCell>
                          <Badge className={`text-[10px] ${v.status === "today" ? "bg-cyan-500/20 text-cyan-400" : "bg-blue-500/20 text-blue-400"}`}>
                            {v.status === "today" ? "היום" : "מתוכנן"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 4: Spare Parts */}
        <TabsContent value="parts" className="mt-4">
          <Card className="bg-card/80 border-border">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-border bg-background/50">
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">מק"ט</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">חלק</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">כמות</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">עבור מוצר</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">דחיפות</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">סטטוס</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {spareParts.map(p => (
                      <TableRow key={p.id} className={`border-b border-border/50 hover:bg-muted/30 transition-colors ${p.urgency === "critical" ? "bg-red-500/5" : ""}`}>
                        <TableCell className="font-mono text-xs text-blue-400">{p.id}</TableCell>
                        <TableCell className="text-xs font-medium text-foreground">{p.part}</TableCell>
                        <TableCell className="font-mono text-xs text-foreground">{p.qty}</TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[160px] truncate">{p.forProduct}</TableCell>
                        <TableCell><Badge className={`text-[10px] ${urgencyCfg[p.urgency].cls}`}>{urgencyCfg[p.urgency].label}</Badge></TableCell>
                        <TableCell><Badge className={`text-[10px] ${spareStatusCfg[p.status].cls}`}>{spareStatusCfg[p.status].label}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 5: Service Costs */}
        <TabsContent value="costs" className="mt-4">
          <Card className="bg-card/80 border-border">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-border bg-background/50">
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">קריאה</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">לקוח</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">מוצר</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">עבודה</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">חלקים</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">נסיעות</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">סה"כ</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">חלק מהכלל</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {costData.map(c => {
                      const pct = (c.total / totalServiceCost) * 100;
                      return (
                        <TableRow key={c.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                          <TableCell className="font-mono text-xs text-blue-400">{c.id}</TableCell>
                          <TableCell className="text-xs font-medium text-foreground">{c.customer}</TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[150px] truncate">{c.product}</TableCell>
                          <TableCell className="font-mono text-xs text-cyan-300">{fmt(c.laborCost)}</TableCell>
                          <TableCell className="font-mono text-xs text-amber-300">{fmt(c.partsCost)}</TableCell>
                          <TableCell className="font-mono text-xs text-purple-300">{fmt(c.travelCost)}</TableCell>
                          <TableCell className="font-mono text-xs font-semibold text-emerald-400">{fmt(c.total)}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2 min-w-[80px]">
                              <Progress value={pct} className="h-1.5 flex-1" />
                              <span className="text-[10px] font-mono text-muted-foreground">{pct.toFixed(1)}%</span>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    <TableRow className="border-t-2 border-border bg-background/50">
                      <TableCell colSpan={3} className="text-xs font-bold text-foreground">סה"כ</TableCell>
                      <TableCell className="font-mono text-xs font-bold text-cyan-400">{fmt(costData.reduce((s, c) => s + c.laborCost, 0))}</TableCell>
                      <TableCell className="font-mono text-xs font-bold text-amber-400">{fmt(costData.reduce((s, c) => s + c.partsCost, 0))}</TableCell>
                      <TableCell className="font-mono text-xs font-bold text-purple-400">{fmt(costData.reduce((s, c) => s + c.travelCost, 0))}</TableCell>
                      <TableCell className="font-mono text-xs font-bold text-emerald-400">{fmt(totalServiceCost)}</TableCell>
                      <TableCell className="font-mono text-xs font-bold text-muted-foreground">100%</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}