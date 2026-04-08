import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertTriangle, FileWarning, CheckCircle2, Clock, RotateCcw, Wallet,
  Users, Search, ArrowUpRight, ArrowDownRight, BarChart3, Shield,
  Wrench, Truck, CreditCard, Package, ListChecks, TrendingDown
} from "lucide-react";

const kpis = [
  { label: "תלונות פתוחות", value: 14, icon: FileWarning, color: "text-red-500", bg: "bg-red-50", change: "+2", up: true },
  { label: "נפתרו החודש", value: 38, icon: CheckCircle2, color: "text-green-500", bg: "bg-green-50", change: "+8", up: true },
  { label: "ימי פתרון ממוצע", value: "3.2", icon: Clock, color: "text-amber-500", bg: "bg-amber-50", change: "-0.5", up: false },
  { label: "תלונות חוזרות", value: 4, icon: RotateCcw, color: "text-purple-500", bg: "bg-purple-50", change: "-1", up: false },
  { label: "פיצויים ₪", value: "18,400", icon: Wallet, color: "text-orange-500", bg: "bg-orange-50", change: "+2,100", up: true },
  { label: "שימור לקוחות", value: "96.5%", icon: Users, color: "text-teal-500", bg: "bg-teal-50", change: "+0.3%", up: true },
];

const complaints = [
  { id: "CMP-301", customer: "אלומיניום הצפון בע\"מ", product: "פרופיל אלומיניום 6063", type: "פגם במוצר", severity: "קריטי", status: "בטיפול", assigned: "דנה כהן", opened: "05/04/2026", sla: 2 },
  { id: "CMP-302", customer: "זגוגית השרון", product: "זכוכית מחוסמת 10 מ\"מ", type: "איחור באספקה", severity: "גבוה", status: "פתוח", assigned: "יוסי לוי", opened: "06/04/2026", sla: 4 },
  { id: "CMP-303", customer: "בניין ירוק בע\"מ", product: "חלון הזזה כפול", type: "בעיית התקנה", severity: "בינוני", status: "ממתין ללקוח", assigned: "מיכל אברהם", opened: "04/04/2026", sla: 1 },
  { id: "CMP-304", customer: "מתכת פלוס", product: "פח גלוון 0.5 מ\"מ", type: "חיוב שגוי", severity: "נמוך", status: "נפתר", assigned: "שרה מזרחי", opened: "02/04/2026", sla: 0 },
  { id: "CMP-305", customer: "פרויקט מגדלי ים", product: "מעקה אלומיניום", type: "פגם במוצר", severity: "קריטי", status: "הסלמה", assigned: "דנה כהן", opened: "07/04/2026", sla: 5 },
  { id: "CMP-306", customer: "קבלן שמעון אלון", product: "דלת כניסה מפלדה", type: "איחור באספקה", severity: "גבוה", status: "בטיפול", assigned: "רועי דוד", opened: "03/04/2026", sla: 3 },
  { id: "CMP-307", customer: "סטודיו אדריכלים לב", product: "ויטרינה חנות", type: "בעיית התקנה", severity: "בינוני", status: "פתוח", assigned: "אמיר חסן", opened: "07/04/2026", sla: 6 },
  { id: "CMP-308", customer: "חברת בנייה אופק", product: "תריס חשמלי", type: "פגם במוצר", severity: "גבוה", status: "בטיפול", assigned: "יוסי לוי", opened: "06/04/2026", sla: 3 },
  { id: "CMP-309", customer: "אלומטל תעשיות", product: "פרופיל תרמי", type: "חיוב שגוי", severity: "נמוך", status: "נפתר", assigned: "שרה מזרחי", opened: "01/04/2026", sla: 0 },
  { id: "CMP-310", customer: "זכוכית אילת", product: "זכוכית למינציה", type: "איחור באספקה", severity: "בינוני", status: "ממתין ללקוח", assigned: "מיכל אברהם", opened: "05/04/2026", sla: 2 },
  { id: "CMP-311", customer: "מפעלי גולן מתכת", product: "ריתוך נירוסטה", type: "פגם במוצר", severity: "קריטי", status: "הסלמה", assigned: "רועי דוד", opened: "07/04/2026", sla: 5 },
  { id: "CMP-312", customer: "קליל תעשיות", product: "חלון ציר 70 סדרה", type: "בעיית התקנה", severity: "גבוה", status: "פתוח", assigned: "אמיר חסן", opened: "08/04/2026", sla: 7 },
];

const rootCauseData = [
  { category: "פגם במוצר", count: 18, pct: 35, color: "bg-red-500", icon: Package },
  { category: "איחור באספקה", count: 14, pct: 27, color: "bg-amber-500", icon: Truck },
  { category: "בעיית התקנה", count: 11, pct: 22, color: "bg-blue-500", icon: Wrench },
  { category: "חיוב שגוי", count: 8, pct: 16, color: "bg-purple-500", icon: CreditCard },
];

const resolutionTimeline = [
  { stage: "קליטת תלונה", target: "0-2 שעות", actual: "1.5 שעות", compliance: 96 },
  { stage: "הקצאה לטיפול", target: "2-4 שעות", actual: "3 שעות", compliance: 92 },
  { stage: "בירור ראשוני", target: "1 יום", actual: "0.8 ימים", compliance: 94 },
  { stage: "הצעת פתרון", target: "2 ימים", actual: "1.8 ימים", compliance: 90 },
  { stage: "ביצוע תיקון", target: "3 ימים", actual: "2.5 ימים", compliance: 88 },
  { stage: "אישור לקוח וסגירה", target: "1 יום", actual: "1.2 ימים", compliance: 85 },
];

const correctiveActions = [
  { id: "CA-101", complaint: "CMP-301", action: "שדרוג בקרת איכות קו פרופילים", responsible: "מנהל ייצור", dueDate: "15/04/2026", status: "בביצוע", priority: "גבוה" },
  { id: "CA-102", complaint: "CMP-302", action: "תיקון תזמון משלוחים במערכת", responsible: "מנהל לוגיסטיקה", dueDate: "12/04/2026", status: "ממתין", priority: "בינוני" },
  { id: "CA-103", complaint: "CMP-305", action: "הכשרה מחדש צוות ריתוך מעקות", responsible: "מנהל ייצור", dueDate: "20/04/2026", status: "בביצוע", priority: "קריטי" },
  { id: "CA-104", complaint: "CMP-306", action: "הוספת התראת איחור אוטומטית", responsible: "מנהל IT", dueDate: "18/04/2026", status: "הושלם", priority: "בינוני" },
  { id: "CA-105", complaint: "CMP-307", action: "עדכון מדריך התקנה ויטרינות", responsible: "מהנדס שטח", dueDate: "25/04/2026", status: "ממתין", priority: "נמוך" },
  { id: "CA-106", complaint: "CMP-311", action: "החלפת חומר גלם ספק נירוסטה", responsible: "מנהל רכש", dueDate: "22/04/2026", status: "בביצוע", priority: "קריטי" },
];

const severityColor: Record<string, string> = {
  "קריטי": "bg-red-100 text-red-700 border-red-300",
  "גבוה": "bg-orange-100 text-orange-700 border-orange-300",
  "בינוני": "bg-amber-100 text-amber-700 border-amber-300",
  "נמוך": "bg-gray-100 text-gray-600 border-gray-300",
};

const statusColor: Record<string, string> = {
  "פתוח": "bg-blue-100 text-blue-700",
  "בטיפול": "bg-amber-100 text-amber-700",
  "ממתין ללקוח": "bg-purple-100 text-purple-700",
  "הסלמה": "bg-red-100 text-red-700",
  "נפתר": "bg-green-100 text-green-700",
};

const actionStatusColor: Record<string, string> = {
  "בביצוע": "bg-blue-100 text-blue-700",
  "ממתין": "bg-amber-100 text-amber-700",
  "הושלם": "bg-green-100 text-green-700",
};

export default function Complaints() {
  const [search, setSearch] = useState("");

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <AlertTriangle className="h-7 w-7 text-red-500" />
            ניהול תלונות לקוחות - טכנו-כל עוזי
          </h1>
          <p className="text-sm text-muted-foreground mt-1">מעקב, ניתוח ופתרון תלונות</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm"><BarChart3 className="h-4 w-4 ml-1" />דוחות</Button>
          <Button size="sm"><FileWarning className="h-4 w-4 ml-1" />תלונה חדשה</Button>
        </div>
      </div>

      {/* 6 KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpis.map((k, i) => {
          const Icon = k.icon;
          return (
            <Card key={i}>
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center justify-between mb-2">
                  <div className={`p-2 rounded-lg ${k.bg}`}><Icon className={`h-5 w-5 ${k.color}`} /></div>
                  <span className={`text-xs font-medium flex items-center gap-0.5 ${k.up && !["ימי פתרון ממוצע","תלונות חוזרות"].includes(k.label) ? "text-green-600" : !k.up ? "text-green-600" : "text-red-600"}`}>
                    {k.label === "פיצויים ₪" || k.label === "תלונות פתוחות" ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                    {k.change}
                  </span>
                </div>
                <p className="text-2xl font-bold">{k.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{k.label}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="complaints" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="complaints">תלונות</TabsTrigger>
          <TabsTrigger value="rootcause">ניתוח שורש</TabsTrigger>
          <TabsTrigger value="resolution">מעקב פתרון</TabsTrigger>
          <TabsTrigger value="corrective">פעולות מתקנות</TabsTrigger>
        </TabsList>

        {/* Complaints Tab */}
        <TabsContent value="complaints" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">רשימת תלונות</CardTitle>
                <div className="relative w-64">
                  <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="חיפוש תלונה..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-right p-3 font-medium text-muted-foreground">מזהה</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">לקוח</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">מוצר</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">סוג</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">חומרה</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">סטטוס</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">אחראי</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">נפתח</th>
                    </tr>
                  </thead>
                  <tbody>
                    {complaints
                      .filter(c => !search || Object.values(c).some(v => String(v).includes(search)))
                      .map((c, i) => (
                        <tr key={i} className="border-b hover:bg-muted/50 transition-colors">
                          <td className="p-3 font-mono text-xs font-bold">{c.id}</td>
                          <td className="p-3 font-medium">{c.customer}</td>
                          <td className="p-3 text-sm">{c.product}</td>
                          <td className="p-3">{c.type}</td>
                          <td className="p-3"><Badge variant="outline" className={severityColor[c.severity]}>{c.severity}</Badge></td>
                          <td className="p-3"><Badge className={statusColor[c.status]}>{c.status}</Badge></td>
                          <td className="p-3">{c.assigned}</td>
                          <td className="p-3 text-xs text-muted-foreground">{c.opened}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Root Cause Tab */}
        <TabsContent value="rootcause" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-lg flex items-center gap-2"><TrendingDown className="h-5 w-5 text-red-500" />ניתוח פארטו - סיבות עיקריות</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {rootCauseData.map((r, i) => {
                  const Icon = r.icon;
                  const cumPct = rootCauseData.slice(0, i + 1).reduce((sum, x) => sum + x.pct, 0);
                  return (
                    <div key={i} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{r.category}</span>
                        </div>
                        <div className="flex items-center gap-3 text-sm">
                          <span className="text-muted-foreground">{r.count} תלונות</span>
                          <span className="font-bold">{r.pct}%</span>
                          <Badge variant="outline" className="text-xs">מצטבר: {cumPct}%</Badge>
                        </div>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-3">
                        <div className={`h-3 rounded-full ${r.color}`} style={{ width: `${r.pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-lg">פירוט לפי קטגוריה</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {rootCauseData.map((r, i) => {
                  const Icon = r.icon;
                  return (
                    <Card key={i} className="border">
                      <CardContent className="pt-4 pb-3">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg ${i === 0 ? "bg-red-50" : i === 1 ? "bg-amber-50" : i === 2 ? "bg-blue-50" : "bg-purple-50"}`}>
                            <Icon className={`h-5 w-5 ${i === 0 ? "text-red-500" : i === 1 ? "text-amber-500" : i === 2 ? "text-blue-500" : "text-purple-500"}`} />
                          </div>
                          <div className="flex-1">
                            <p className="font-bold">{r.category}</p>
                            <p className="text-sm text-muted-foreground">{r.count} תלונות - {r.pct}% מהכלל</p>
                          </div>
                          <Badge variant="outline" className={i < 2 ? "border-red-300 text-red-600" : "border-amber-300 text-amber-600"}>
                            {i < 2 ? "פעולה נדרשת" : "מעקב"}
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Resolution Tracking Tab */}
        <TabsContent value="resolution" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2"><Clock className="h-5 w-5 text-amber-500" />מעקב זמני פתרון - SLA</CardTitle>
                <Badge className="bg-green-100 text-green-700">עמידה כוללת: 91%</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-right p-3 font-medium text-muted-foreground">שלב</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">יעד</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">ביצוע בפועל</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">עמידה</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">סטטוס</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resolutionTimeline.map((r, i) => (
                      <tr key={i} className="border-b hover:bg-muted/50">
                        <td className="p-3 font-medium">{r.stage}</td>
                        <td className="p-3">{r.target}</td>
                        <td className="p-3">{r.actual}</td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <Progress value={r.compliance} className="h-2 flex-1" />
                            <span className="font-bold text-sm w-12">{r.compliance}%</span>
                          </div>
                        </td>
                        <td className="p-3">
                          <Badge className={r.compliance >= 93 ? "bg-green-100 text-green-700" : r.compliance >= 89 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}>
                            {r.compliance >= 93 ? "תקין" : r.compliance >= 89 ? "אזהרה" : "חריגה"}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Corrective Actions Tab */}
        <TabsContent value="corrective" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2"><ListChecks className="h-5 w-5 text-blue-500" />פעולות מתקנות</CardTitle>
                <Button size="sm"><Wrench className="h-4 w-4 ml-1" />הוסף פעולה</Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-right p-3 font-medium text-muted-foreground">מזהה</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">תלונה</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">פעולה</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">אחראי</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">תאריך יעד</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">עדיפות</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">סטטוס</th>
                    </tr>
                  </thead>
                  <tbody>
                    {correctiveActions.map((a, i) => (
                      <tr key={i} className="border-b hover:bg-muted/50 transition-colors">
                        <td className="p-3 font-mono text-xs font-bold">{a.id}</td>
                        <td className="p-3 font-mono text-xs">{a.complaint}</td>
                        <td className="p-3 font-medium">{a.action}</td>
                        <td className="p-3">{a.responsible}</td>
                        <td className="p-3 text-xs">{a.dueDate}</td>
                        <td className="p-3"><Badge variant="outline" className={severityColor[a.priority] || ""}>{a.priority}</Badge></td>
                        <td className="p-3"><Badge className={actionStatusColor[a.status]}>{a.status}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-5 text-center">
                <Shield className="h-8 w-8 mx-auto text-blue-500 mb-2" />
                <p className="text-3xl font-bold">6</p>
                <p className="text-sm text-muted-foreground">פעולות מתקנות פעילות</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 text-center">
                <CheckCircle2 className="h-8 w-8 mx-auto text-green-500 mb-2" />
                <p className="text-3xl font-bold text-green-600">1</p>
                <p className="text-sm text-muted-foreground">הושלמו החודש</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 text-center">
                <AlertTriangle className="h-8 w-8 mx-auto text-red-500 mb-2" />
                <p className="text-3xl font-bold text-red-600">2</p>
                <p className="text-sm text-muted-foreground">קריטיות - דורשות טיפול מיידי</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
