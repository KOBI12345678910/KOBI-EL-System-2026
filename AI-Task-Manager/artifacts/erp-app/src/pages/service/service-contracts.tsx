import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  FileText, ShieldCheck, Users, TrendingUp, Clock,
  CircleDollarSign, Award, Calendar, AlertTriangle, CheckCircle
} from "lucide-react";

const fmt = (v: number) => `₪${v.toLocaleString("he-IL")}`;

type ContractStatus = "active" | "expiring" | "expired" | "draft";
type ContractType = "basic_warranty" | "extended_warranty" | "service_contract" | "maintenance_contract";
type SlaTier = "platinum" | "gold" | "silver";

const statusCfg: Record<ContractStatus, { label: string; cls: string }> = {
  active: { label: "פעיל", cls: "bg-emerald-500/20 text-emerald-400" },
  expiring: { label: "מתקרב לסיום", cls: "bg-amber-500/20 text-amber-400" },
  expired: { label: "פג", cls: "bg-red-500/20 text-red-400" },
  draft: { label: "טיוטה", cls: "bg-zinc-500/20 text-zinc-400" },
};

const typeCfg: Record<ContractType, { label: string; cls: string }> = {
  basic_warranty: { label: "אחריות בסיסית", cls: "bg-blue-500/20 text-blue-400" },
  extended_warranty: { label: "אחריות מורחבת", cls: "bg-purple-500/20 text-purple-400" },
  service_contract: { label: "חוזה שירות", cls: "bg-cyan-500/20 text-cyan-400" },
  maintenance_contract: { label: "חוזה תחזוקה", cls: "bg-amber-500/20 text-amber-400" },
};

const tierCfg: Record<SlaTier, { label: string; cls: string }> = {
  platinum: { label: "Platinum", cls: "bg-purple-500/20 text-purple-400" },
  gold: { label: "Gold", cls: "bg-amber-500/20 text-amber-400" },
  silver: { label: "Silver", cls: "bg-zinc-500/20 text-zinc-300" },
};

const FALLBACK_CONTRACTS = [
  { id: "CNT-001", customer: "אלון מערכות בע\"מ", project: "שער חשמלי Premium — מפעל ראשי", type: "extended_warranty" as ContractType, start: "2025-01-15", end: "2027-01-15", slaHours: 4, coverage: "חלקים+עבודה", value: 24000, status: "active" as ContractStatus },
  { id: "CNT-002", customer: "נדל\"ן צפון", project: "חלונות אלומיניום — פרויקט הגליל", type: "basic_warranty" as ContractType, start: "2025-06-01", end: "2026-06-01", slaHours: 24, coverage: "עבודה בלבד", value: 8500, status: "expiring" as ContractStatus },
  { id: "CNT-003", customer: "עיריית חיפה", project: "גדרות מתכת — פארק הכרמל", type: "maintenance_contract" as ContractType, start: "2025-03-01", end: "2027-03-01", slaHours: 8, coverage: "מלא", value: 36000, status: "active" as ContractStatus },
  { id: "CNT-004", customer: "קיבוץ דגניה", project: "מעקות נירוסטה — בריכה ומועדון", type: "service_contract" as ContractType, start: "2024-09-10", end: "2026-09-10", slaHours: 8, coverage: "חלקים+עבודה", value: 18500, status: "active" as ContractStatus },
  { id: "CNT-005", customer: "מפעלי הדרום", project: "תריסי גלילה — קו ייצור B", type: "extended_warranty" as ContractType, start: "2025-07-20", end: "2027-07-20", slaHours: 4, coverage: "מלא", value: 29000, status: "active" as ContractStatus },
  { id: "CNT-006", customer: "רשת סופר-בית", project: "דלתות כניסה מפלדה — 5 סניפים", type: "service_contract" as ContractType, start: "2024-11-01", end: "2026-05-01", slaHours: 8, coverage: "חלקים+עבודה", value: 42000, status: "expiring" as ContractStatus },
  { id: "CNT-007", customer: "בית ספר אורט", project: "פרגולות אלומיניום — חצר בית ספר", type: "basic_warranty" as ContractType, start: "2024-03-15", end: "2026-03-15", slaHours: 24, coverage: "עבודה בלבד", value: 6200, status: "expired" as ContractStatus },
  { id: "CNT-008", customer: "משרד הביטחון", project: "שערי חשמל ProX — בסיס צפוני", type: "maintenance_contract" as ContractType, start: "2025-02-01", end: "2028-02-01", slaHours: 4, coverage: "מלא", value: 58000, status: "active" as ContractStatus },
  { id: "CNT-009", customer: "מלון דן כרמל", project: "מערכת גידור חכמה — חזית מלון", type: "extended_warranty" as ContractType, start: "2025-10-01", end: "2027-10-01", slaHours: 4, coverage: "חלקים+עבודה", value: 32000, status: "active" as ContractStatus },
  { id: "CNT-010", customer: "חברת נמלי ישראל", project: "שערים תעשייתיים — נמל חיפה", type: "service_contract" as ContractType, start: "2026-01-01", end: "2026-12-31", slaHours: 8, coverage: "מלא", value: 15000, status: "draft" as ContractStatus },
];

const FALLBACK_SLA_TIERS = [
  { tier: "platinum" as SlaTier, responseHours: 4, resolutionHours: 12, uptime: "99.5%", coverageHours: "24/7", price: "₪3,200/חודש", includes: "חלקים+עבודה+נסיעות, עדיפות מקסימלית, מנהל לקוח ייעודי" },
  { tier: "gold" as SlaTier, responseHours: 8, resolutionHours: 24, uptime: "99%", coverageHours: "א'-ה' 07:00-20:00", price: "₪1,800/חודש", includes: "חלקים+עבודה, עדיפות גבוהה, דוחות רבעוניים" },
  { tier: "silver" as SlaTier, responseHours: 24, resolutionHours: 48, uptime: "97%", coverageHours: "א'-ה' 08:00-17:00", price: "₪850/חודש", includes: "עבודה בלבד, תגובה רגילה, דוח שנתי" },
];

const FALLBACK_WARRANTY_PROJECTS = [
  { project: "שער חשמלי Premium — מפעל ראשי", customer: "אלון מערכות", start: "2025-01-15", end: "2027-01-15", daysRemaining: 282, claims: 1 },
  { project: "חלונות אלומיניום — פרויקט הגליל", customer: "נדל\"ן צפון", start: "2025-06-01", end: "2026-06-01", daysRemaining: 54, claims: 2 },
  { project: "גדרות מתכת — פארק הכרמל", customer: "עיריית חיפה", start: "2025-03-01", end: "2027-03-01", daysRemaining: 692, claims: 0 },
  { project: "מעקות נירוסטה — בריכה ומועדון", customer: "קיבוץ דגניה", start: "2024-09-10", end: "2026-09-10", daysRemaining: 155, claims: 3 },
  { project: "תריסי גלילה — קו ייצור B", customer: "מפעלי הדרום", start: "2025-07-20", end: "2027-07-20", daysRemaining: 468, claims: 0 },
  { project: "דלתות כניסה — 5 סניפים", customer: "רשת סופר-בית", start: "2024-11-01", end: "2026-05-01", daysRemaining: 23, claims: 4 },
  { project: "פרגולות אלומיניום — חצר בית ספר", customer: "בית ספר אורט", start: "2024-03-15", end: "2026-03-15", daysRemaining: 0, claims: 1 },
  { project: "שערי חשמל ProX — בסיס צפוני", customer: "משרד הביטחון", start: "2025-02-01", end: "2028-02-01", daysRemaining: 694, claims: 0 },
];

const FALLBACK_REVENUE_BY_TYPE = [
  { type: "חוזה שירות", contracts: 3, annual: 75500, pctOfTotal: 28 },
  { type: "אחריות מורחבת", contracts: 3, annual: 85000, pctOfTotal: 31 },
  { type: "חוזה תחזוקה", contracts: 2, annual: 94000, pctOfTotal: 35 },
  { type: "אחריות בסיסית", contracts: 2, annual: 14700, pctOfTotal: 6 },
];

const activeContracts = contracts.filter(c => c.status === "active").length;
const warrantyCustomers = 89;
const slaCompliance = 87;
const annualRevenue = 180000;

export default function ServiceContracts() {
  const { data: servicecontractsData } = useQuery({
    queryKey: ["service-contracts"],
    queryFn: () => authFetch("/api/service/service_contracts"),
    staleTime: 5 * 60 * 1000,
  });

  const contracts = servicecontractsData ?? FALLBACK_CONTRACTS;

  const [activeTab, setActiveTab] = useState("contracts");

  return (
    <div className="p-6 space-y-5" dir="rtl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <FileText className="h-7 w-7 text-cyan-400" /> חוזי שירות ו-SLA
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          טכנו-כל עוזי — ניהול חוזי שירות, הסכמי SLA, מעקב אחריות והכנסות שירות
        </p>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "חוזים פעילים", value: `${activeContracts}`, color: "text-emerald-400", icon: FileText },
          { label: "לקוחות באחריות", value: `${warrantyCustomers}`, color: "text-blue-400", icon: Users },
          { label: "SLA עמידה", value: `${slaCompliance}%`, color: "text-purple-400", icon: Award },
          { label: "הכנסה משירות", value: `${fmt(annualRevenue)}/שנה`, color: "text-cyan-400", icon: CircleDollarSign },
        ].map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <Card key={i} className="bg-card/80 border-border hover:border-border/80 transition-colors">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[11px] text-muted-foreground">{kpi.label}</p>
                    <p className={`text-lg font-bold font-mono mt-1 ${kpi.color}`}>{kpi.value}</p>
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
        <TabsList className="grid grid-cols-4 w-full max-w-2xl">
          <TabsTrigger value="contracts" className="text-xs gap-1"><FileText className="h-3.5 w-3.5" /> חוזים</TabsTrigger>
          <TabsTrigger value="sla" className="text-xs gap-1"><Award className="h-3.5 w-3.5" /> הגדרות SLA</TabsTrigger>
          <TabsTrigger value="warranty" className="text-xs gap-1"><ShieldCheck className="h-3.5 w-3.5" /> מעקב אחריות</TabsTrigger>
          <TabsTrigger value="revenue" className="text-xs gap-1"><CircleDollarSign className="h-3.5 w-3.5" /> הכנסות</TabsTrigger>
        </TabsList>

        {/* Tab 1: Contracts Table */}
        <TabsContent value="contracts" className="mt-4">
          <Card className="bg-card/80 border-border">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-border bg-background/50">
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">מספר</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">לקוח</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">פרויקט</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">סוג</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">תחילה</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">סיום</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">SLA (שעות)</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">כיסוי</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">ערך חוזה</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">סטטוס</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contracts.map(c => (
                      <TableRow key={c.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                        <TableCell className="font-mono text-xs text-blue-400">{c.id}</TableCell>
                        <TableCell className="text-xs font-medium text-foreground">{c.customer}</TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[180px] truncate">{c.project}</TableCell>
                        <TableCell><Badge className={`text-[10px] ${typeCfg[c.type].cls}`}>{typeCfg[c.type].label}</Badge></TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{c.start}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{c.end}</TableCell>
                        <TableCell className="font-mono text-xs text-foreground flex items-center gap-1"><Clock className="h-3 w-3 text-muted-foreground" />{c.slaHours}h</TableCell>
                        <TableCell className="text-xs text-foreground">{c.coverage}</TableCell>
                        <TableCell className="font-mono text-xs font-semibold text-emerald-400">{fmt(c.value)}</TableCell>
                        <TableCell><Badge className={`text-[10px] ${statusCfg[c.status].cls}`}>{statusCfg[c.status].label}</Badge></TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="border-t-2 border-border bg-background/50">
                      <TableCell colSpan={8} className="text-xs font-bold text-foreground">סה"כ ערך חוזים</TableCell>
                      <TableCell className="font-mono text-xs font-bold text-emerald-400">{fmt(contracts.reduce((s, c) => s + c.value, 0))}</TableCell>
                      <TableCell />
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: SLA Definitions */}
        <TabsContent value="sla" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {slaTiers.map(s => (
              <Card key={s.tier} className="bg-card/80 border-border hover:border-border/80 transition-colors">
                <CardContent className="p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <Badge className={`text-xs font-bold px-3 py-1 ${tierCfg[s.tier].cls}`}>{tierCfg[s.tier].label}</Badge>
                    <span className="text-sm font-bold font-mono text-emerald-400">{s.price}</span>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> זמן תגובה</span>
                      <span className="text-sm font-bold font-mono text-foreground">{s.responseHours} שעות</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground flex items-center gap-1"><CheckCircle className="h-3.5 w-3.5" /> זמן פתרון</span>
                      <span className="text-sm font-bold font-mono text-foreground">{s.resolutionHours} שעות</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground flex items-center gap-1"><TrendingUp className="h-3.5 w-3.5" /> זמינות</span>
                      <span className="text-sm font-bold font-mono text-foreground">{s.uptime}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> שעות כיסוי</span>
                      <span className="text-xs font-medium text-foreground">{s.coverageHours}</span>
                    </div>
                  </div>
                  <div className="border-t border-border pt-3">
                    <p className="text-[11px] text-muted-foreground">כולל:</p>
                    <p className="text-xs text-foreground mt-1">{s.includes}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Tab 3: Warranty Tracker */}
        <TabsContent value="warranty" className="mt-4">
          <Card className="bg-card/80 border-border">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-border bg-background/50">
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">פרויקט</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">לקוח</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">תחילת אחריות</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">סיום אחריות</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">ימים שנותרו</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">תביעות</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {warrantyProjects.map((w, i) => {
                      const totalDays = Math.round((new Date(w.end).getTime() - new Date(w.start).getTime()) / 86400000);
                      const elapsed = totalDays > 0 ? Math.max(0, Math.min(100, ((totalDays - w.daysRemaining) / totalDays) * 100)) : 100;
                      return (
                        <TableRow key={i} className={`border-b border-border/50 hover:bg-muted/30 transition-colors ${w.daysRemaining === 0 ? "bg-red-500/5" : w.daysRemaining < 60 ? "bg-amber-500/5" : ""}`}>
                          <TableCell className="text-xs font-medium text-foreground max-w-[200px] truncate">{w.project}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{w.customer}</TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">{w.start}</TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">{w.end}</TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1 min-w-[100px]">
                              <Progress value={elapsed} className="h-1.5" />
                              <span className={`text-[10px] font-mono ${w.daysRemaining === 0 ? "text-red-400" : w.daysRemaining < 60 ? "text-amber-400" : "text-emerald-400"}`}>
                                {w.daysRemaining === 0 ? "פגה" : `${w.daysRemaining} ימים`}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className={`font-mono text-xs font-bold ${w.claims > 2 ? "text-red-400" : w.claims > 0 ? "text-amber-400" : "text-emerald-400"}`}>
                              {w.claims > 0 && <AlertTriangle className="h-3 w-3 inline ml-1" />}
                              {w.claims}
                            </span>
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

        {/* Tab 4: Revenue Breakdown */}
        <TabsContent value="revenue" className="mt-4 space-y-4">
          <Card className="bg-card/80 border-border">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-border bg-background/50">
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">סוג חוזה</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">מספר חוזים</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">הכנסה שנתית</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">אחוז מסה"כ</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {revenueByType.map((r, i) => (
                      <TableRow key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                        <TableCell className="text-xs font-medium text-foreground">{r.type}</TableCell>
                        <TableCell className="font-mono text-xs text-foreground">{r.contracts}</TableCell>
                        <TableCell className="font-mono text-xs font-semibold text-emerald-400">{fmt(r.annual)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 min-w-[100px]">
                            <Progress value={r.pctOfTotal} className="h-1.5 flex-1" />
                            <span className="text-[10px] font-mono text-muted-foreground">{r.pctOfTotal}%</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="border-t-2 border-border bg-background/50">
                      <TableCell className="text-xs font-bold text-foreground">סה"כ</TableCell>
                      <TableCell className="font-mono text-xs font-bold text-foreground">{revenueByType.reduce((s, r) => s + r.contracts, 0)}</TableCell>
                      <TableCell className="font-mono text-xs font-bold text-emerald-400">{fmt(revenueByType.reduce((s, r) => s + r.annual, 0))}</TableCell>
                      <TableCell className="font-mono text-xs font-bold text-muted-foreground">100%</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Revenue summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="bg-card/80 border-border">
              <CardContent className="p-4">
                <p className="text-[11px] text-muted-foreground">הכנסה חודשית ממוצעת</p>
                <p className="text-lg font-bold font-mono text-cyan-400 mt-1">{fmt(15000)}</p>
              </CardContent>
            </Card>
            <Card className="bg-card/80 border-border">
              <CardContent className="p-4">
                <p className="text-[11px] text-muted-foreground">חוזים לחידוש (90 יום)</p>
                <p className="text-lg font-bold font-mono text-amber-400 mt-1">3</p>
              </CardContent>
            </Card>
            <Card className="bg-card/80 border-border">
              <CardContent className="p-4">
                <p className="text-[11px] text-muted-foreground">שיעור חידוש חוזים</p>
                <p className="text-lg font-bold font-mono text-emerald-400 mt-1">92%</p>
              </CardContent>
            </Card>
            <Card className="bg-card/80 border-border">
              <CardContent className="p-4">
                <p className="text-[11px] text-muted-foreground">ערך חוזה ממוצע</p>
                <p className="text-lg font-bold font-mono text-purple-400 mt-1">{fmt(26920)}</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
