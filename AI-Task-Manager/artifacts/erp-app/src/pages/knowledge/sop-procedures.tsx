import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { FileText, CheckCircle2, AlertTriangle, XCircle, ShieldCheck, GraduationCap, Search, Plus, Download, ClipboardList, History, Eye } from "lucide-react";

const sops = [
  { id: 1, name: "חיתוך פרופילי אלומיניום", code: "SOP-PRD-001", version: "3.2", owner: "יוסי כהן", department: "ייצור", status: "פעיל", lastReview: "2026-03-15", nextReview: "2026-09-15", training: true },
  { id: 2, name: "טיפול וניקוי זכוכית מחוסמת", code: "SOP-PRD-002", version: "2.1", owner: "דוד לוי", department: "ייצור", status: "פעיל", lastReview: "2026-02-20", nextReview: "2026-08-20", training: true },
  { id: 3, name: "ציפוי אבקתי אלקטרוסטטי", code: "SOP-PRD-003", version: "4.0", owner: "משה אברהם", department: "ייצור", status: "פעיל", lastReview: "2026-04-01", nextReview: "2026-10-01", training: true },
  { id: 4, name: "ריתוך TIG אלומיניום", code: "SOP-PRD-004", version: "2.5", owner: "אבי מזרחי", department: "ייצור", status: "בסקירה", lastReview: "2025-12-10", nextReview: "2026-06-10", training: true },
  { id: 5, name: "הרכבת חלונות ודלתות", code: "SOP-ASM-001", version: "3.0", owner: "רון ביטון", department: "הרכבה", status: "פעיל", lastReview: "2026-01-25", nextReview: "2026-07-25", training: true },
  { id: 6, name: "בדיקת איכות — מוצר מוגמר", code: "SOP-QC-001", version: "5.1", owner: "שרה גולן", department: "בקרת איכות", status: "פעיל", lastReview: "2026-03-28", nextReview: "2026-09-28", training: true },
  { id: 7, name: "בדיקת איכות — חומרי גלם", code: "SOP-QC-002", version: "3.3", owner: "שרה גולן", department: "בקרת איכות", status: "פעיל", lastReview: "2026-02-15", nextReview: "2026-08-15", training: false },
  { id: 8, name: "אריזה ומשלוח מוצרים", code: "SOP-LOG-001", version: "2.0", owner: "יעקב שמש", department: "לוגיסטיקה", status: "פעיל", lastReview: "2026-03-01", nextReview: "2026-09-01", training: false },
  { id: 9, name: "בטיחות — עבודה עם מכונות חיתוך", code: "SOP-SAF-001", version: "4.2", owner: "אמיר רז", department: "בטיחות", status: "פעיל", lastReview: "2026-04-05", nextReview: "2026-10-05", training: true },
  { id: 10, name: "בטיחות — עבודה בגובה", code: "SOP-SAF-002", version: "3.1", owner: "אמיר רז", department: "בטיחות", status: "בסקירה", lastReview: "2025-11-20", nextReview: "2026-05-20", training: true },
  { id: 11, name: "תחזוקה מונעת — מכונת CNC", code: "SOP-MNT-001", version: "2.4", owner: "חיים דביר", department: "תחזוקה", status: "פג תוקף", lastReview: "2025-08-10", nextReview: "2026-02-10", training: false },
  { id: 12, name: "קליטת חומרי גלם למחסן", code: "SOP-LOG-002", version: "1.8", owner: "יעקב שמש", department: "לוגיסטיקה", status: "פעיל", lastReview: "2026-01-10", nextReview: "2026-07-10", training: false },
];

const departments = [
  { name: "ייצור", total: 4, compliant: 3, percent: 75 },
  { name: "הרכבה", total: 1, compliant: 1, percent: 100 },
  { name: "בקרת איכות", total: 2, compliant: 2, percent: 100 },
  { name: "לוגיסטיקה", total: 2, compliant: 2, percent: 100 },
  { name: "בטיחות", total: 2, compliant: 1, percent: 50 },
  { name: "תחזוקה", total: 1, compliant: 0, percent: 0 },
];

const trainingLinks = [
  { sop: "חיתוך פרופילי אלומיניום", code: "SOP-PRD-001", course: "הכשרת מפעיל מכונת חיתוך", duration: "8 שעות", certified: 12, required: 15 },
  { sop: "טיפול וניקוי זכוכית מחוסמת", code: "SOP-PRD-002", course: "טיפול בטוח בזכוכית", duration: "4 שעות", certified: 18, required: 18 },
  { sop: "ציפוי אבקתי אלקטרוסטטי", code: "SOP-PRD-003", course: "הפעלת קו ציפוי", duration: "12 שעות", certified: 6, required: 8 },
  { sop: "ריתוך TIG אלומיניום", code: "SOP-PRD-004", course: "הסמכת רתך TIG", duration: "40 שעות", certified: 4, required: 5 },
  { sop: "הרכבת חלונות ודלתות", code: "SOP-ASM-001", course: "הכשרת מרכיב", duration: "16 שעות", certified: 10, required: 12 },
  { sop: "בדיקת איכות — מוצר מוגמר", code: "SOP-QC-001", course: "בודק איכות מוסמך", duration: "24 שעות", certified: 5, required: 5 },
  { sop: "בטיחות — עבודה עם מכונות חיתוך", code: "SOP-SAF-001", course: "בטיחות מכונות", duration: "6 שעות", certified: 22, required: 25 },
  { sop: "בטיחות — עבודה בגובה", code: "SOP-SAF-002", course: "עבודה בגובה מוסמך", duration: "8 שעות", certified: 14, required: 14 },
];

const revisionHistory = [
  { code: "SOP-PRD-003", name: "ציפוי אבקתי אלקטרוסטטי", from: "3.5", to: "4.0", date: "2026-04-01", author: "משה אברהם", changes: "עדכון טמפרטורות ריפוי והוספת שלב בדיקה" },
  { code: "SOP-QC-001", name: "בדיקת איכות — מוצר מוגמר", from: "5.0", to: "5.1", date: "2026-03-28", author: "שרה גולן", changes: "הוספת בדיקת עמידות UV" },
  { code: "SOP-SAF-001", name: "בטיחות — עבודה עם מכונות חיתוך", from: "4.1", to: "4.2", date: "2026-04-05", author: "אמיר רז", changes: "עדכון דרישות ציוד מגן" },
  { code: "SOP-PRD-001", name: "חיתוך פרופילי אלומיניום", from: "3.1", to: "3.2", date: "2026-03-15", author: "יוסי כהן", changes: "שינוי מהירות חיתוך לפרופיל תרמי" },
  { code: "SOP-LOG-001", name: "אריזה ומשלוח מוצרים", from: "1.9", to: "2.0", date: "2026-03-01", author: "יעקב שמש", changes: "הוספת אריזה לזכוכית גדולה" },
  { code: "SOP-ASM-001", name: "הרכבת חלונות ודלתות", from: "2.9", to: "3.0", date: "2026-01-25", author: "רון ביטון", changes: "עדכון שלב איטום ובדיקת אטימות" },
];

const statusColor: Record<string, string> = {
  "פעיל": "bg-green-500/20 text-green-300",
  "בסקירה": "bg-yellow-500/20 text-yellow-300",
  "פג תוקף": "bg-red-500/20 text-red-300",
};

const kpis = [
  { label: "סה\"כ נהלים", value: "12", icon: FileText, color: "text-blue-400", bg: "bg-blue-500/10" },
  { label: "פעילים", value: "9", icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-500/10" },
  { label: "בסקירה", value: "2", icon: AlertTriangle, color: "text-yellow-400", bg: "bg-yellow-500/10" },
  { label: "פג תוקף", value: "1", icon: XCircle, color: "text-red-400", bg: "bg-red-500/10" },
  { label: "עמידה בנהלים", value: "87%", icon: ShieldCheck, color: "text-purple-400", bg: "bg-purple-500/10" },
  { label: "מקושרים להדרכה", value: "8", icon: GraduationCap, color: "text-cyan-400", bg: "bg-cyan-500/10" },
];

export default function SopProcedures() {
  const [search, setSearch] = useState("");

  const filtered = sops.filter(s =>
    !search || s.name.includes(search) || s.code.includes(search) || s.department.includes(search)
  );

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <ClipboardList className="h-7 w-7 text-blue-400" /> נוהלי עבודה — SOP
          </h1>
          <p className="text-sm text-muted-foreground mt-1">נוהלי עבודה תקניים — טכנו-כל עוזי</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm"><Download className="w-4 h-4 ml-1" />ייצוא</Button>
          <Button size="sm"><Plus className="w-4 h-4 ml-1" />נוהל חדש</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpis.map(k => (
          <Card key={k.label} className="bg-card/50 border-border/50">
            <CardContent className="p-4 text-center">
              <div className={`mx-auto w-10 h-10 rounded-lg ${k.bg} flex items-center justify-center mb-2`}>
                <k.icon className={`w-5 h-5 ${k.color}`} />
              </div>
              <div className="text-xl font-bold text-foreground">{k.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{k.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="list" className="space-y-4">
        <TabsList className="bg-card/50">
          <TabsTrigger value="list"><FileText className="w-4 h-4 ml-1" />רשימת נהלים</TabsTrigger>
          <TabsTrigger value="compliance"><ShieldCheck className="w-4 h-4 ml-1" />עמידה בנהלים</TabsTrigger>
          <TabsTrigger value="training"><GraduationCap className="w-4 h-4 ml-1" />הדרכות</TabsTrigger>
          <TabsTrigger value="revisions"><History className="w-4 h-4 ml-1" />היסטוריית שינויים</TabsTrigger>
        </TabsList>

        <TabsContent value="list">
          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="חיפוש נוהל..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9 bg-background/50" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-right p-3 text-muted-foreground font-medium">קוד</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">שם הנוהל</th>
                      <th className="text-center p-3 text-muted-foreground font-medium">גרסה</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">אחראי</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">מחלקה</th>
                      <th className="text-center p-3 text-muted-foreground font-medium">סטטוס</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">סקירה אחרונה</th>
                      <th className="text-center p-3 text-muted-foreground font-medium">פעולות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(s => (
                      <tr key={s.id} className="border-b border-border/30 hover:bg-card/80 transition-colors">
                        <td className="p-3 text-muted-foreground font-mono text-xs">{s.code}</td>
                        <td className="p-3 text-foreground font-medium">{s.name}</td>
                        <td className="p-3 text-center"><Badge variant="outline">v{s.version}</Badge></td>
                        <td className="p-3 text-muted-foreground">{s.owner}</td>
                        <td className="p-3 text-muted-foreground">{s.department}</td>
                        <td className="p-3 text-center"><Badge className={statusColor[s.status]}>{s.status}</Badge></td>
                        <td className="p-3 text-muted-foreground">{s.lastReview}</td>
                        <td className="p-3 text-center">
                          <Button variant="ghost" size="sm"><Eye className="w-3.5 h-3.5" /></Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="compliance">
          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <CardTitle className="text-lg">עמידה בנהלים לפי מחלקה</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {departments.map(d => (
                <div key={d.name} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-foreground">{d.name}</span>
                    <div className="flex items-center gap-3 text-sm">
                      <span className="text-muted-foreground">{d.compliant} מתוך {d.total} נהלים תקינים</span>
                      <Badge className={
                        d.percent >= 80 ? "bg-green-500/20 text-green-300" :
                        d.percent >= 50 ? "bg-yellow-500/20 text-yellow-300" :
                        "bg-red-500/20 text-red-300"
                      }>{d.percent}%</Badge>
                    </div>
                  </div>
                  <Progress value={d.percent} className="h-2" />
                </div>
              ))}
              <div className="mt-6 p-4 rounded-lg bg-background/30 border border-border/30">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-foreground">עמידה כוללת בנהלים</span>
                  <span className="text-2xl font-bold text-emerald-400">87%</span>
                </div>
                <Progress value={87} className="h-3 mt-2" />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="training">
          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <CardTitle className="text-lg">נהלים מקושרים להדרכות</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-right p-3 text-muted-foreground font-medium">קוד</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">נוהל</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">קורס הדרכה</th>
                      <th className="text-center p-3 text-muted-foreground font-medium">משך</th>
                      <th className="text-center p-3 text-muted-foreground font-medium">מוסמכים</th>
                      <th className="text-center p-3 text-muted-foreground font-medium">התקדמות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trainingLinks.map((t, idx) => {
                      const pct = Math.round((t.certified / t.required) * 100);
                      return (
                        <tr key={idx} className="border-b border-border/30 hover:bg-card/80 transition-colors">
                          <td className="p-3 text-muted-foreground font-mono text-xs">{t.code}</td>
                          <td className="p-3 text-foreground font-medium">{t.sop}</td>
                          <td className="p-3 text-muted-foreground">{t.course}</td>
                          <td className="p-3 text-center text-muted-foreground">{t.duration}</td>
                          <td className="p-3 text-center">{t.certified}/{t.required}</td>
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <Progress value={pct} className="h-2 flex-1" />
                              <Badge className={pct === 100 ? "bg-green-500/20 text-green-300" : "bg-yellow-500/20 text-yellow-300"}>{pct}%</Badge>
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

        <TabsContent value="revisions">
          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <History className="w-5 h-5 text-purple-400" /> היסטוריית שינויים אחרונה
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {revisionHistory.map((r, idx) => (
                  <div key={idx} className="p-4 rounded-lg bg-background/30 border border-border/30">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className="font-mono">{r.code}</Badge>
                        <span className="font-medium text-foreground">{r.name}</span>
                      </div>
                      <span className="text-sm text-muted-foreground">{r.date}</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <Badge className="bg-red-500/20 text-red-300">v{r.from}</Badge>
                      <span className="text-muted-foreground">→</span>
                      <Badge className="bg-green-500/20 text-green-300">v{r.to}</Badge>
                      <span className="text-muted-foreground">|</span>
                      <span className="text-muted-foreground">{r.author}</span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-2">{r.changes}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
