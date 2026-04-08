import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Ticket, CheckCircle2, Clock, ShieldCheck, Smile, RefreshCw,
  Search, Plus, Download, Wrench, AlertTriangle, Package, BarChart3
} from "lucide-react";

const priorityColors: Record<string, string> = {
  "קריטי": "bg-red-500/20 text-red-300 border-red-500/30",
  "גבוה": "bg-orange-500/20 text-orange-300 border-orange-500/30",
  "בינוני": "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  "נמוך": "bg-green-500/20 text-green-300 border-green-500/30",
};

const statusColors: Record<string, string> = {
  "פתוח": "bg-red-500/20 text-red-300",
  "מוקצה": "bg-blue-500/20 text-blue-300",
  "בטיפול": "bg-amber-500/20 text-amber-300",
  "נפתר": "bg-green-500/20 text-green-300",
};

const issueTypeLabels: Record<string, string> = {
  "תקלת-חומרה": "תקלת חומרה",
  "סדק-זכוכית": "סדק בזכוכית",
  "כשל-איטום": "כשל איטום",
  "בעיית-יישור": "בעיית יישור",
  "נזילה": "נזילה",
};

const tickets = [
  { id: "SRV-4001", customer: "אלומיניום הצפון בע\"מ", product: "חלון ציר 180x120", issueType: "תקלת-חומרה", priority: "קריטי", status: "פתוח", assignedTo: "יוסי כהן", slaHours: 4 },
  { id: "SRV-4002", customer: "זגגות המרכז", product: "דלת הזזה 240x220", issueType: "סדק-זכוכית", priority: "גבוה", status: "מוקצה", assignedTo: "דני לוי", slaHours: 8 },
  { id: "SRV-4003", customer: "קבלן בניין עוז", product: "חלון קיפ 100x60", issueType: "כשל-איטום", priority: "בינוני", status: "בטיפול", assignedTo: "שרה מזרחי", slaHours: 18 },
  { id: "SRV-4004", customer: "פרויקט מגדלי הים", product: "קיר מסך 300x400", issueType: "נזילה", priority: "קריטי", status: "בטיפול", assignedTo: "יוסי כהן", slaHours: 2 },
  { id: "SRV-4005", customer: "יזמות השרון", product: "חלון ציר 140x100", issueType: "בעיית-יישור", priority: "נמוך", status: "נפתר", assignedTo: "דני לוי", slaHours: 0 },
  { id: "SRV-4006", customer: "בנייה ירוקה בע\"מ", product: "דלת כניסה 110x210", issueType: "תקלת-חומרה", priority: "גבוה", status: "פתוח", assignedTo: "אבי רוזן", slaHours: 6 },
  { id: "SRV-4007", customer: "חברת נדל\"ן ים-תיכון", product: "חלון קיפ 80x50", issueType: "סדק-זכוכית", priority: "בינוני", status: "מוקצה", assignedTo: "שרה מזרחי", slaHours: 22 },
  { id: "SRV-4008", customer: "אלומיניום הצפון בע\"מ", product: "תריס גלילה 160x140", issueType: "תקלת-חומרה", priority: "גבוה", status: "בטיפול", assignedTo: "יוסי כהן", slaHours: 3 },
  { id: "SRV-4009", customer: "פרויקט מגדלי הים", product: "חלון ציר 200x150", issueType: "נזילה", priority: "קריטי", status: "פתוח", assignedTo: "דני לוי", slaHours: 5 },
  { id: "SRV-4010", customer: "זגגות המרכז", product: "דלת הזזה 180x220", issueType: "כשל-איטום", priority: "בינוני", status: "נפתר", assignedTo: "אבי רוזן", slaHours: 0 },
  { id: "SRV-4011", customer: "קבלן בניין עוז", product: "קיר מסך 250x350", issueType: "בעיית-יישור", priority: "נמוך", status: "מוקצה", assignedTo: "שרה מזרחי", slaHours: 36 },
  { id: "SRV-4012", customer: "יזמות השרון", product: "חלון קיפ 120x80", issueType: "סדק-זכוכית", priority: "גבוה", status: "פתוח", assignedTo: "יוסי כהן", slaHours: 10 },
];

const warrantyClaims = [
  { id: "WR-801", ticket: "SRV-4001", customer: "אלומיניום הצפון בע\"מ", type: "אחריות", product: "חלון ציר 180x120", cost: 0, status: "מאושר" },
  { id: "WR-802", ticket: "SRV-4002", customer: "זגגות המרכז", type: "מחוץ לאחריות", product: "דלת הזזה 240x220", cost: 1250, status: "ממתין לאישור" },
  { id: "WR-803", ticket: "SRV-4004", customer: "פרויקט מגדלי הים", type: "אחריות", product: "קיר מסך 300x400", cost: 0, status: "בבדיקה" },
  { id: "WR-804", ticket: "SRV-4006", customer: "בנייה ירוקה בע\"מ", type: "מחוץ לאחריות", product: "דלת כניסה 110x210", cost: 870, status: "ממתין לאישור" },
  { id: "WR-805", ticket: "SRV-4008", customer: "אלומיניום הצפון בע\"מ", type: "אחריות", product: "תריס גלילה 160x140", cost: 0, status: "מאושר" },
  { id: "WR-806", ticket: "SRV-4009", customer: "פרויקט מגדלי הים", type: "אחריות", product: "חלון ציר 200x150", cost: 0, status: "בבדיקה" },
  { id: "WR-807", ticket: "SRV-4012", customer: "יזמות השרון", type: "מחוץ לאחריות", product: "חלון קיפ 120x80", cost: 650, status: "ממתין לאישור" },
];

const rootCauses = [
  { category: "פגם בחומר גלם", count: 28, pct: 32 },
  { category: "שגיאת הרכבה", count: 22, pct: 25 },
  { category: "בלאי טבעי", count: 15, pct: 17 },
  { category: "התקנה לקויה", count: 12, pct: 14 },
  { category: "נזק שינוע", count: 7, pct: 8 },
  { category: "אחר", count: 4, pct: 4 },
];

const spareParts = [
  { partNo: "SP-101", name: "ידית אלומיניום 28 מ\"מ", category: "ידיות", stock: 145, minStock: 50, usedThisMonth: 32 },
  { partNo: "SP-102", name: "גומיית איטום EPDM 6 מ\"מ", category: "איטום", stock: 12, minStock: 100, usedThisMonth: 88 },
  { partNo: "SP-103", name: "נעילת ביטחון רב-נקודתית", category: "נעילה", stock: 67, minStock: 30, usedThisMonth: 18 },
  { partNo: "SP-104", name: "זכוכית מחוסמת 4 מ\"מ", category: "זכוכית", stock: 8, minStock: 20, usedThisMonth: 14 },
  { partNo: "SP-105", name: "ציר נסתר 120 ק\"ג", category: "צירים", stock: 53, minStock: 25, usedThisMonth: 9 },
  { partNo: "SP-106", name: "גלגלון הזזה עליון", category: "הזזה", stock: 38, minStock: 20, usedThisMonth: 22 },
  { partNo: "SP-107", name: "פרופיל חיבור 40x20", category: "פרופילים", stock: 5, minStock: 40, usedThisMonth: 35 },
  { partNo: "SP-108", name: "בורג נירוסטה M6x30", category: "חיבורים", stock: 420, minStock: 200, usedThisMonth: 160 },
];

const warrantyStatusColors: Record<string, string> = {
  "מאושר": "bg-green-500/20 text-green-300",
  "ממתין לאישור": "bg-yellow-500/20 text-yellow-300",
  "בבדיקה": "bg-blue-500/20 text-blue-300",
};

export default function FabServiceTickets() {
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("tickets");

  const openTickets = tickets.filter(t => t.status !== "נפתר").length;
  const resolvedToday = tickets.filter(t => t.status === "נפתר").length;
  const avgResolution = "4.2 שעות";
  const warrantyCases = warrantyClaims.filter(w => w.type === "אחריות").length;
  const satisfaction = 94.2;
  const repeatIssues = 3;

  const kpis = [
    { label: "קריאות פתוחות", value: openTickets, icon: Ticket, color: "text-red-400", bg: "bg-red-500/10" },
    { label: "נפתרו היום", value: resolvedToday, icon: CheckCircle2, color: "text-green-400", bg: "bg-green-500/10" },
    { label: "זמן פתרון ממוצע", value: avgResolution, icon: Clock, color: "text-blue-400", bg: "bg-blue-500/10" },
    { label: "תביעות אחריות", value: warrantyCases, icon: ShieldCheck, color: "text-purple-400", bg: "bg-purple-500/10" },
    { label: "שביעות רצון", value: `${satisfaction}%`, icon: Smile, color: "text-amber-400", bg: "bg-amber-500/10" },
    { label: "תקלות חוזרות", value: repeatIssues, icon: RefreshCw, color: "text-orange-400", bg: "bg-orange-500/10" },
  ];

  const filteredTickets = tickets.filter(t =>
    !search || t.id.includes(search) || t.customer.includes(search) || t.product.includes(search)
  );

  const totalWarrantyCost = warrantyClaims.reduce((s, w) => s + w.cost, 0);
  const paretoAccum = rootCauses.reduce<{ category: string; count: number; pct: number; cumPct: number }[]>((acc, rc) => {
    const prev = acc.length > 0 ? acc[acc.length - 1].cumPct : 0;
    acc.push({ ...rc, cumPct: prev + rc.pct });
    return acc;
  }, []);

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">קריאות שירות ואחריות</h1>
          <p className="text-sm text-muted-foreground mt-1">ניהול תקלות, אחריות, ניתוח שורש בעיה וחלקי חילוף</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm"><Download className="w-4 h-4 ml-1" />יצוא</Button>
          <Button size="sm" className="bg-primary"><Plus className="w-4 h-4 ml-1" />קריאה חדשה</Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpis.map(k => (
          <Card key={k.label} className="bg-card/50 border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${k.bg}`}>
                  <k.icon className={`w-5 h-5 ${k.color}`} />
                </div>
                <div>
                  <div className="text-xl font-bold text-foreground">{k.value}</div>
                  <div className="text-xs text-muted-foreground">{k.label}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-card/50 border border-border/50">
          <TabsTrigger value="tickets" className="gap-1"><Wrench className="w-4 h-4" />קריאות שירות</TabsTrigger>
          <TabsTrigger value="warranty" className="gap-1"><ShieldCheck className="w-4 h-4" />אחריות</TabsTrigger>
          <TabsTrigger value="rootcause" className="gap-1"><BarChart3 className="w-4 h-4" />ניתוח שורש</TabsTrigger>
          <TabsTrigger value="spareparts" className="gap-1"><Package className="w-4 h-4" />חלקי חילוף</TabsTrigger>
        </TabsList>

        {/* Tab 1: Tickets */}
        <TabsContent value="tickets" className="space-y-4">
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">רשימת קריאות ({filteredTickets.length})</CardTitle>
                <div className="relative w-64">
                  <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="חיפוש קריאה, לקוח, מוצר..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9 bg-background/50" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-right p-3 text-muted-foreground font-medium">קריאה</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">לקוח</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">מוצר</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">סוג תקלה</th>
                      <th className="text-center p-3 text-muted-foreground font-medium">עדיפות</th>
                      <th className="text-center p-3 text-muted-foreground font-medium">סטטוס</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">מוקצה ל</th>
                      <th className="text-center p-3 text-muted-foreground font-medium">SLA נותר</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTickets.map(t => (
                      <tr key={t.id} className="border-b border-border/30 hover:bg-muted/30 transition-colors">
                        <td className="p-3 font-mono text-sm font-semibold text-foreground">{t.id}</td>
                        <td className="p-3 text-foreground">{t.customer}</td>
                        <td className="p-3 text-muted-foreground text-xs">{t.product}</td>
                        <td className="p-3"><Badge variant="outline" className="text-xs">{issueTypeLabels[t.issueType]}</Badge></td>
                        <td className="p-3 text-center"><Badge className={`text-xs ${priorityColors[t.priority]}`}>{t.priority}</Badge></td>
                        <td className="p-3 text-center"><Badge className={`text-xs ${statusColors[t.status]}`}>{t.status}</Badge></td>
                        <td className="p-3 text-foreground">{t.assignedTo}</td>
                        <td className="p-3 text-center">
                          {t.slaHours === 0 ? (
                            <span className="text-green-400 text-xs font-medium">הושלם</span>
                          ) : (
                            <span className={`text-xs font-medium ${t.slaHours <= 4 ? "text-red-400" : t.slaHours <= 12 ? "text-amber-400" : "text-muted-foreground"}`}>
                              {t.slaHours} שעות
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Warranty Claims */}
        <TabsContent value="warranty" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-card/50 border-border/50">
              <CardContent className="p-4 text-center">
                <div className="text-3xl font-bold text-green-400">{warrantyClaims.filter(w => w.type === "אחריות").length}</div>
                <div className="text-sm text-muted-foreground mt-1">תביעות אחריות</div>
              </CardContent>
            </Card>
            <Card className="bg-card/50 border-border/50">
              <CardContent className="p-4 text-center">
                <div className="text-3xl font-bold text-orange-400">{warrantyClaims.filter(w => w.type === "מחוץ לאחריות").length}</div>
                <div className="text-sm text-muted-foreground mt-1">מחוץ לאחריות</div>
              </CardContent>
            </Card>
            <Card className="bg-card/50 border-border/50">
              <CardContent className="p-4 text-center">
                <div className="text-3xl font-bold text-red-400">{totalWarrantyCost.toLocaleString()} &#8362;</div>
                <div className="text-sm text-muted-foreground mt-1">עלות תיקונים (ללא אחריות)</div>
              </CardContent>
            </Card>
          </div>
          <Card className="bg-card/50 border-border/50">
            <CardHeader><CardTitle className="text-lg">תביעות אחריות</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-right p-3 text-muted-foreground font-medium">מס' תביעה</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">קריאה</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">לקוח</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">מוצר</th>
                      <th className="text-center p-3 text-muted-foreground font-medium">סוג</th>
                      <th className="text-center p-3 text-muted-foreground font-medium">עלות</th>
                      <th className="text-center p-3 text-muted-foreground font-medium">סטטוס</th>
                    </tr>
                  </thead>
                  <tbody>
                    {warrantyClaims.map(w => (
                      <tr key={w.id} className="border-b border-border/30 hover:bg-muted/30 transition-colors">
                        <td className="p-3 font-mono font-semibold text-foreground">{w.id}</td>
                        <td className="p-3 font-mono text-muted-foreground">{w.ticket}</td>
                        <td className="p-3 text-foreground">{w.customer}</td>
                        <td className="p-3 text-muted-foreground text-xs">{w.product}</td>
                        <td className="p-3 text-center">
                          <Badge className={w.type === "אחריות" ? "bg-green-500/20 text-green-300" : "bg-orange-500/20 text-orange-300"}>
                            {w.type}
                          </Badge>
                        </td>
                        <td className="p-3 text-center font-medium text-foreground">
                          {w.cost === 0 ? <span className="text-green-400">---</span> : `${w.cost.toLocaleString()} \u20AA`}
                        </td>
                        <td className="p-3 text-center"><Badge className={`text-xs ${warrantyStatusColors[w.status]}`}>{w.status}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: Root Cause Analysis */}
        <TabsContent value="rootcause" className="space-y-4">
          <Card className="bg-card/50 border-border/50">
            <CardHeader><CardTitle className="text-lg">ניתוח שורש בעיה - תרשים פארטו</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {paretoAccum.map(rc => (
                <div key={rc.category} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-foreground font-medium">{rc.category}</span>
                    <div className="flex items-center gap-4">
                      <span className="text-muted-foreground">{rc.count} מקרים</span>
                      <span className="text-muted-foreground w-12 text-left">{rc.pct}%</span>
                      <span className={`text-xs w-16 text-left ${rc.cumPct >= 80 ? "text-muted-foreground" : "text-amber-400 font-semibold"}`}>
                        מצטבר: {rc.cumPct}%
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Progress value={rc.pct} className="h-3 flex-1" />
                    {rc.cumPct <= 80 && <AlertTriangle className="w-4 h-4 text-amber-400" />}
                  </div>
                </div>
              ))}
              <div className="mt-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <p className="text-sm text-amber-300">
                  <AlertTriangle className="w-4 h-4 inline ml-1" />
                  80% מהתקלות נגרמות מ-3 גורמים עיקריים: פגם בחומר גלם, שגיאת הרכבה ובלאי טבעי. מומלץ לשפר בקרת איכות בקבלת חומרים ובתהליך ההרכבה.
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="bg-card/50 border-border/50">
              <CardHeader><CardTitle className="text-base">פילוח לפי סוג תקלה</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {Object.entries(issueTypeLabels).map(([key, label]) => {
                  const count = tickets.filter(t => t.issueType === key).length;
                  return (
                    <div key={key} className="flex items-center justify-between">
                      <span className="text-sm text-foreground">{label}</span>
                      <div className="flex items-center gap-2">
                        <Progress value={(count / tickets.length) * 100} className="h-2 w-24" />
                        <span className="text-sm font-medium text-muted-foreground w-6 text-left">{count}</span>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
            <Card className="bg-card/50 border-border/50">
              <CardHeader><CardTitle className="text-base">תקלות חוזרות - לקוחות מובילים</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {["אלומיניום הצפון בע\"מ", "פרויקט מגדלי הים", "זגגות המרכז"].map(c => {
                  const count = tickets.filter(t => t.customer === c).length;
                  return (
                    <div key={c} className="flex items-center justify-between p-2 rounded bg-muted/20">
                      <span className="text-sm text-foreground">{c}</span>
                      <Badge variant="outline" className="text-xs">{count} קריאות</Badge>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Tab 4: Spare Parts */}
        <TabsContent value="spareparts" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-card/50 border-border/50">
              <CardContent className="p-4 text-center">
                <div className="text-3xl font-bold text-foreground">{spareParts.length}</div>
                <div className="text-sm text-muted-foreground mt-1">פריטי חילוף פעילים</div>
              </CardContent>
            </Card>
            <Card className="bg-card/50 border-border/50">
              <CardContent className="p-4 text-center">
                <div className="text-3xl font-bold text-red-400">{spareParts.filter(p => p.stock < p.minStock).length}</div>
                <div className="text-sm text-muted-foreground mt-1">מתחת למינימום</div>
              </CardContent>
            </Card>
            <Card className="bg-card/50 border-border/50">
              <CardContent className="p-4 text-center">
                <div className="text-3xl font-bold text-blue-400">{spareParts.reduce((s, p) => s + p.usedThisMonth, 0)}</div>
                <div className="text-sm text-muted-foreground mt-1">שימוש החודש</div>
              </CardContent>
            </Card>
          </div>
          <Card className="bg-card/50 border-border/50">
            <CardHeader><CardTitle className="text-lg">מלאי חלקי חילוף</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-right p-3 text-muted-foreground font-medium">מק"ט</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">פריט</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">קטגוריה</th>
                      <th className="text-center p-3 text-muted-foreground font-medium">מלאי</th>
                      <th className="text-center p-3 text-muted-foreground font-medium">מינימום</th>
                      <th className="text-center p-3 text-muted-foreground font-medium">שימוש החודש</th>
                      <th className="text-center p-3 text-muted-foreground font-medium">מצב</th>
                    </tr>
                  </thead>
                  <tbody>
                    {spareParts.map(p => {
                      const isLow = p.stock < p.minStock;
                      const stockPct = Math.min((p.stock / p.minStock) * 100, 100);
                      return (
                        <tr key={p.partNo} className={`border-b border-border/30 hover:bg-muted/30 transition-colors ${isLow ? "bg-red-500/5" : ""}`}>
                          <td className="p-3 font-mono font-semibold text-foreground">{p.partNo}</td>
                          <td className="p-3 text-foreground">{p.name}</td>
                          <td className="p-3 text-muted-foreground">{p.category}</td>
                          <td className={`p-3 text-center font-bold ${isLow ? "text-red-400" : "text-foreground"}`}>{p.stock}</td>
                          <td className="p-3 text-center text-muted-foreground">{p.minStock}</td>
                          <td className="p-3 text-center text-muted-foreground">{p.usedThisMonth}</td>
                          <td className="p-3">
                            <div className="flex items-center gap-2 justify-center">
                              <Progress value={stockPct} className={`h-2 w-16 ${isLow ? "[&>div]:bg-red-500" : ""}`} />
                              {isLow && <AlertTriangle className="w-4 h-4 text-red-400" />}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
