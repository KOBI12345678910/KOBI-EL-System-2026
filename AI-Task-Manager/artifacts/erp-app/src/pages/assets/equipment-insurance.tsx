import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  ShieldCheck, DollarSign, FileText, AlertTriangle, CalendarDays,
  Search, Download, Plus, Eye, Clock, Ban, CheckCircle2, XCircle,
  Building2, Truck, Wrench, Flame
} from "lucide-react";

const FALLBACK_POLICIES = [
  { id: "POL-001", name: "ביטוח מבנה מפעל", type: "רכוש", insurer: "הראל", premium: 42000, coverage: 8500000, start: "2025-07-01", end: "2026-06-30", status: "בתוקף", assets: "מבנה ראשי, אולמות A-D" },
  { id: "POL-002", name: "ביטוח ציוד כבד", type: "ציוד", insurer: "מגדל", premium: 28500, coverage: 3200000, start: "2025-09-01", end: "2026-08-31", status: "בתוקף", assets: "מסורים CNC, מרכזי עיבוד, כיפוף" },
  { id: "POL-003", name: "ביטוח אחריות מקצועית", type: "אחריות", insurer: "כלל", premium: 18000, coverage: 5000000, start: "2025-04-01", end: "2026-03-31", status: "פג תוקף", assets: "כיסוי צד ג׳ ומוצר" },
  { id: "POL-004", name: "ביטוח צי רכבים", type: "רכב", insurer: "הפניקס", premium: 35000, coverage: 1200000, start: "2026-01-01", end: "2026-12-31", status: "בתוקף", assets: "3 משאיות, 2 מלגזות, רכב שטח" },
  { id: "POL-005", name: "ביטוח תנורי ציפוי", type: "ציוד", insurer: "מגדל", premium: 15200, coverage: 615000, start: "2025-11-01", end: "2026-10-31", status: "בתוקף", assets: "תנור ציפוי אלקטרוסטטי, תנור חישול" },
  { id: "POL-006", name: "ביטוח שבר מכונות", type: "ציוד", insurer: "הראל", premium: 22000, coverage: 2100000, start: "2025-06-01", end: "2026-05-31", status: "לחידוש קרוב", assets: "כל ציוד CNC" },
  { id: "POL-007", name: "ביטוח אחריות מעבידים", type: "אחריות", insurer: "כלל", premium: 24000, coverage: 10000000, start: "2026-01-01", end: "2026-12-31", status: "בתוקף", assets: "כל העובדים - 85 עובדים" },
  { id: "POL-008", name: "ביטוח מלאי וחומרי גלם", type: "רכוש", insurer: "הפניקס", premium: 12800, coverage: 1800000, start: "2025-08-01", end: "2026-07-31", status: "בתוקף", assets: "מלאי אלומיניום, זכוכית, אביזרים" },
];

const FALLBACK_COVERAGE_GAPS = [
  { asset: "מלגזה דיזל Hyster 5T", value: 220000, risk: "גבוה", reason: "לא נכלל בפוליסת ציוד כבד" },
  { asset: "ג'יג הרכבה מודולרי #1", value: 45000, risk: "נמוך", reason: "מתחת לסף מינימום ביטוח" },
  { asset: "מדחס בורגי 30HP גיבוי", value: 78000, risk: "בינוני", reason: "נרכש לאחרונה, טרם עודכנה פוליסה" },
  { asset: "כלי חיתוך ותבניות", value: 165000, risk: "בינוני", reason: "אין כיסוי לכלים ותבניות ייצור" },
];

const FALLBACK_CLAIMS = [
  { id: "CLM-101", policy: "POL-002", description: "נזק למסור CNC מקצר חשמלי", date: "2025-11-20", amount: 45000, approved: 38000, status: "אושר" },
  { id: "CLM-102", policy: "POL-004", description: "תאונת מלגזה בחצר", date: "2026-01-15", amount: 28000, approved: 28000, status: "אושר" },
  { id: "CLM-103", policy: "POL-006", description: "שבר בציר מכונת כיפוף", date: "2026-03-02", amount: 62000, approved: 0, status: "בבדיקה" },
  { id: "CLM-104", policy: "POL-003", description: "תביעת צד ג׳ - חלון פגום", date: "2025-09-10", amount: 15000, approved: 15000, status: "אושר" },
  { id: "CLM-105", policy: "POL-005", description: "תקלה בתנור ציפוי", date: "2026-02-18", amount: 33000, approved: 0, status: "נדחה" },
];

const FALLBACK_RENEWAL_SCHEDULE = [
  { policy: "POL-003", name: "ביטוח אחריות מקצועית", end: "2026-03-31", daysLeft: -8, status: "פג תוקף", premium: 18000 },
  { policy: "POL-006", name: "ביטוח שבר מכונות", end: "2026-05-31", daysLeft: 53, status: "לחידוש קרוב", premium: 22000 },
  { policy: "POL-001", name: "ביטוח מבנה מפעל", end: "2026-06-30", daysLeft: 83, status: "לחידוש בקרוב", premium: 42000 },
  { policy: "POL-008", name: "ביטוח מלאי וחומרי גלם", end: "2026-07-31", daysLeft: 114, status: "תקין", premium: 12800 },
  { policy: "POL-002", name: "ביטוח ציוד כבד", end: "2026-08-31", daysLeft: 145, status: "תקין", premium: 28500 },
];

const statusColor: Record<string, string> = {
  "בתוקף": "bg-emerald-500/20 text-emerald-300",
  "פג תוקף": "bg-red-500/20 text-red-300",
  "לחידוש קרוב": "bg-amber-500/20 text-amber-300",
  "אושר": "bg-emerald-500/20 text-emerald-300",
  "בבדיקה": "bg-blue-500/20 text-blue-300",
  "נדחה": "bg-red-500/20 text-red-300",
  "תקין": "bg-emerald-500/20 text-emerald-300",
  "לחידוש בקרוב": "bg-amber-500/20 text-amber-300",
};

const riskColor: Record<string, string> = {
  "גבוה": "bg-red-500/20 text-red-300",
  "בינוני": "bg-amber-500/20 text-amber-300",
  "נמוך": "bg-blue-500/20 text-blue-300",
};

const typeIcon: Record<string, typeof Building2> = {
  "רכוש": Building2,
  "ציוד": Wrench,
  "אחריות": ShieldCheck,
  "רכב": Truck,
};

export default function EquipmentInsurance() {
  const { data: equipmentinsuranceData } = useQuery({
    queryKey: ["equipment-insurance"],
    queryFn: () => authFetch("/api/assets/equipment_insurance"),
    staleTime: 5 * 60 * 1000,
  });

  const policies = equipmentinsuranceData ?? FALLBACK_POLICIES;

  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("policies");

  const totalCoverage = policies.reduce((s, p) => s + p.coverage, 0);
  const annualPremium = policies.reduce((s, p) => s + p.premium, 0);
  const claimsFiled = claims.length;
  const policiesExpiring = policies.filter(p => p.status === "פג תוקף" || p.status === "לחידוש קרוב").length;

  const filteredPolicies = policies.filter(p =>
    p.name.includes(search) || p.insurer.includes(search) || p.type.includes(search) || p.id.includes(search)
  );

  const kpis = [
    { label: "נכסים מבוטחים", value: policies.length, icon: ShieldCheck, color: "text-emerald-400", bg: "bg-emerald-500/10" },
    { label: "סה\"כ כיסוי", value: `${(totalCoverage / 1000000).toFixed(1)}M ₪`, icon: DollarSign, color: "text-blue-400", bg: "bg-blue-500/10" },
    { label: "פרמיה שנתית", value: `${(annualPremium / 1000).toFixed(0)}K ₪`, icon: FileText, color: "text-orange-400", bg: "bg-orange-500/10" },
    { label: "תביעות שהוגשו", value: claimsFiled, icon: AlertTriangle, color: "text-red-400", bg: "bg-red-500/10" },
    { label: "פוליסות לחידוש", value: policiesExpiring, icon: CalendarDays, color: "text-amber-400", bg: "bg-amber-500/10" },
  ];

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <ShieldCheck className="w-7 h-7 text-emerald-400" />
            ביטוחי ציוד - טכנו-כל עוזי
          </h1>
          <p className="text-sm text-muted-foreground mt-1">ניהול פוליסות ביטוח, כיסויים, תביעות וחידושים</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm"><Download className="w-4 h-4 ml-1" />ייצוא</Button>
          <Button size="sm" className="bg-primary"><Plus className="w-4 h-4 ml-1" />פוליסה חדשה</Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {kpis.map(k => (
          <Card key={k.label} className="bg-card/50 border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{k.label}</p>
                  <p className="text-2xl font-bold text-foreground mt-1">{k.value}</p>
                </div>
                <div className={`p-2.5 rounded-lg ${k.bg}`}>
                  <k.icon className={`w-5 h-5 ${k.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-card/50 border border-border/50">
          <TabsTrigger value="policies">פוליסות</TabsTrigger>
          <TabsTrigger value="gaps">פערי כיסוי</TabsTrigger>
          <TabsTrigger value="claims">תביעות</TabsTrigger>
          <TabsTrigger value="renewals">לוח חידושים</TabsTrigger>
        </TabsList>

        {/* Tab 1: Policies */}
        <TabsContent value="policies" className="space-y-4">
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">פוליסות ביטוח ({policies.length})</CardTitle>
                <div className="relative w-64">
                  <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="חיפוש פוליסה..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9 bg-background/50" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-right p-3 text-muted-foreground font-medium">מזהה</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">פוליסה</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">סוג</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">מבטח</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">כיסוי ₪</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">פרמיה ₪</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">תוקף</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">סטטוס</th>
                      <th className="text-center p-3 text-muted-foreground font-medium">פעולות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPolicies.map(p => {
                      const Icon = typeIcon[p.type] || FileText;
                      return (
                        <tr key={p.id} className="border-b border-border/30 hover:bg-card/30 transition-colors">
                          <td className="p-3 text-foreground font-mono text-xs">{p.id}</td>
                          <td className="p-3 text-foreground font-medium">
                            <div className="flex items-center gap-2">
                              <Icon className="w-4 h-4 text-muted-foreground" />
                              {p.name}
                            </div>
                          </td>
                          <td className="p-3 text-muted-foreground">{p.type}</td>
                          <td className="p-3 text-foreground">{p.insurer}</td>
                          <td className="p-3 text-foreground">{p.coverage.toLocaleString()}</td>
                          <td className="p-3 text-foreground">{p.premium.toLocaleString()}</td>
                          <td className="p-3 text-muted-foreground text-xs">{p.start} — {p.end}</td>
                          <td className="p-3"><Badge className={statusColor[p.status] || "bg-gray-500/20 text-gray-300"}>{p.status}</Badge></td>
                          <td className="p-3 text-center">
                            <Button variant="ghost" size="sm"><Eye className="w-3.5 h-3.5" /></Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Coverage by type */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {["רכוש", "ציוד", "אחריות", "רכב"].map(type => {
              const typePolicies = policies.filter(p => p.type === type);
              const typeCoverage = typePolicies.reduce((s, p) => s + p.coverage, 0);
              const Icon = typeIcon[type] || FileText;
              return (
                <Card key={type} className="bg-card/50 border-border/50">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Icon className="w-4 h-4 text-muted-foreground" />
                      <p className="text-sm font-medium text-foreground">{type}</p>
                    </div>
                    <p className="text-lg font-bold text-foreground">{typePolicies.length} פוליסות</p>
                    <p className="text-xs text-muted-foreground">כיסוי: {typeCoverage.toLocaleString()} ₪</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* Tab 2: Coverage Gaps */}
        <TabsContent value="gaps" className="space-y-4">
          <Card className="bg-card/50 border-border/50 border-red-500/30">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Ban className="w-5 h-5 text-red-400" />
                נכסים ללא כיסוי ביטוחי ({coverageGaps.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {coverageGaps.map((g, i) => (
                  <div key={i} className="flex items-center justify-between p-4 rounded-lg bg-background/30 border border-border/30">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-foreground">{g.asset}</p>
                        <Badge className={riskColor[g.risk]}>{g.risk}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{g.reason}</p>
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-bold text-foreground">{g.value.toLocaleString()} ₪</p>
                      <p className="text-xs text-muted-foreground">שווי לא מבוטח</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 p-3 rounded-lg bg-red-500/5 border border-red-500/20">
                <p className="text-sm font-medium text-red-300">סה"כ חשיפה לא מבוטחת: {coverageGaps.reduce((s, g) => s + g.value, 0).toLocaleString()} ₪</p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <CardTitle className="text-lg">ניתוח כיסוי לפי קטגוריה</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {["ציוד CNC", "תנורים", "לוגיסטיקה", "מבנה", "מלאי"].map((cat, i) => {
                  const covered = [92, 100, 75, 100, 85][i];
                  return (
                    <div key={cat} className="flex items-center gap-4">
                      <div className="w-28 text-sm text-foreground">{cat}</div>
                      <div className="flex-1">
                        <Progress value={covered} className="h-2" />
                      </div>
                      <div className="w-16 text-left text-sm font-medium">
                        <span className={covered === 100 ? "text-emerald-400" : covered >= 85 ? "text-amber-400" : "text-red-400"}>{covered}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: Claims */}
        <TabsContent value="claims" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-card/50 border-border/50">
              <CardContent className="p-4 text-center">
                <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-400 mb-2" />
                <p className="text-2xl font-bold text-foreground">{claims.filter(c => c.status === "אושר").length}</p>
                <p className="text-sm text-muted-foreground">תביעות שאושרו</p>
                <p className="text-xs text-emerald-400 mt-1">{claims.filter(c => c.status === "אושר").reduce((s, c) => s + c.approved, 0).toLocaleString()} ₪</p>
              </CardContent>
            </Card>
            <Card className="bg-card/50 border-border/50">
              <CardContent className="p-4 text-center">
                <Clock className="w-8 h-8 mx-auto text-blue-400 mb-2" />
                <p className="text-2xl font-bold text-foreground">{claims.filter(c => c.status === "בבדיקה").length}</p>
                <p className="text-sm text-muted-foreground">בבדיקה</p>
                <p className="text-xs text-blue-400 mt-1">{claims.filter(c => c.status === "בבדיקה").reduce((s, c) => s + c.amount, 0).toLocaleString()} ₪</p>
              </CardContent>
            </Card>
            <Card className="bg-card/50 border-border/50">
              <CardContent className="p-4 text-center">
                <XCircle className="w-8 h-8 mx-auto text-red-400 mb-2" />
                <p className="text-2xl font-bold text-foreground">{claims.filter(c => c.status === "נדחה").length}</p>
                <p className="text-sm text-muted-foreground">נדחו</p>
                <p className="text-xs text-red-400 mt-1">{claims.filter(c => c.status === "נדחה").reduce((s, c) => s + c.amount, 0).toLocaleString()} ₪</p>
              </CardContent>
            </Card>
          </div>

          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-orange-400" />
                תביעות שהוגשו
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-right p-3 text-muted-foreground font-medium">מזהה</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">פוליסה</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">תיאור</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">תאריך</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">סכום ₪</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">אושר ₪</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">סטטוס</th>
                    </tr>
                  </thead>
                  <tbody>
                    {claims.map(c => (
                      <tr key={c.id} className="border-b border-border/30 hover:bg-card/30">
                        <td className="p-3 text-foreground font-mono text-xs">{c.id}</td>
                        <td className="p-3 text-muted-foreground">{c.policy}</td>
                        <td className="p-3 text-foreground">{c.description}</td>
                        <td className="p-3 text-muted-foreground">{c.date}</td>
                        <td className="p-3 text-foreground">{c.amount.toLocaleString()}</td>
                        <td className="p-3 text-foreground">{c.approved > 0 ? c.approved.toLocaleString() : "—"}</td>
                        <td className="p-3"><Badge className={statusColor[c.status] || "bg-gray-500/20 text-gray-300"}>{c.status}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 4: Renewal Schedule */}
        <TabsContent value="renewals" className="space-y-4">
          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <CalendarDays className="w-5 h-5 text-blue-400" />
                לוח חידוש פוליסות
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {renewalSchedule.map(r => (
                  <div key={r.policy} className={`flex items-center justify-between p-4 rounded-lg border ${r.daysLeft <= 0 ? "bg-red-500/5 border-red-500/20" : r.daysLeft <= 60 ? "bg-amber-500/5 border-amber-500/20" : "bg-background/30 border-border/30"}`}>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-foreground">{r.name}</p>
                        <Badge className={statusColor[r.status] || "bg-gray-500/20 text-gray-300"}>{r.status}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{r.policy} | פרמיה: {r.premium.toLocaleString()} ₪</p>
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-medium text-foreground">{r.end}</p>
                      <p className={`text-xs ${r.daysLeft <= 0 ? "text-red-400" : r.daysLeft <= 60 ? "text-amber-400" : "text-muted-foreground"}`}>
                        {r.daysLeft <= 0 ? `פג לפני ${Math.abs(r.daysLeft)} ימים` : `${r.daysLeft} ימים לחידוש`}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <CardTitle className="text-lg">סיכום שנתי</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex justify-between items-center p-3 rounded-lg bg-background/30">
                  <span className="text-sm text-muted-foreground">סה"כ פרמיות שנתיות</span>
                  <span className="text-lg font-bold text-foreground">{annualPremium.toLocaleString()} ₪</span>
                </div>
                <div className="flex justify-between items-center p-3 rounded-lg bg-background/30">
                  <span className="text-sm text-muted-foreground">סה"כ כיסוי</span>
                  <span className="text-lg font-bold text-blue-400">{totalCoverage.toLocaleString()} ₪</span>
                </div>
                <div className="flex justify-between items-center p-3 rounded-lg bg-background/30">
                  <span className="text-sm text-muted-foreground">יחס פרמיה/כיסוי</span>
                  <span className="text-lg font-bold text-emerald-400">{((annualPremium / totalCoverage) * 100).toFixed(2)}%</span>
                </div>
                <div className="flex justify-between items-center p-3 rounded-lg bg-background/30">
                  <span className="text-sm text-muted-foreground">תביעות שאושרו השנה</span>
                  <span className="text-lg font-bold text-orange-400">{claims.filter(c => c.status === "אושר").reduce((s, c) => s + c.approved, 0).toLocaleString()} ₪</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
