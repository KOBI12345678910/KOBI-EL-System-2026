import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  BarChart3, HardDrive, FileText, Clock, TrendingUp, TrendingDown,
  Download, Eye, Share2, Upload, CheckCircle2, XCircle, Users, Lightbulb,
  FolderOpen, ArrowUpRight, ArrowDownRight, Minus,
} from "lucide-react";

/* ── KPI Data ── */
const FALLBACK_KPIS = [
  { label: "סה\"כ מסמכים", value: "3,847", icon: FileText, color: "text-blue-600", bg: "bg-blue-50" },
  { label: "נוצרו החודש", value: "142", icon: Upload, color: "text-green-600", bg: "bg-green-50" },
  { label: "אחסון בשימוש", value: "389GB / 500GB", icon: HardDrive, color: "text-purple-600", bg: "bg-purple-50", progress: 77.8 },
  { label: "ממוצע גודל", value: "2.1MB", icon: FolderOpen, color: "text-orange-600", bg: "bg-orange-50" },
  { label: "זמן אישור ממוצע", value: "4.2 שעות", icon: Clock, color: "text-cyan-600", bg: "bg-cyan-50" },
  { label: "שיעור דחייה", value: "3.2%", icon: XCircle, color: "text-red-600", bg: "bg-red-50" },
];

/* ── Storage by Department ── */
const FALLBACK_STORAGE_DEPTS = [
  { dept: "רכש", used: 98.5, docs: 1347, pct: 25.3 },
  { dept: "הנדסה", used: 72.3, docs: 624, pct: 18.6 },
  { dept: "איכות", used: 58.1, docs: 498, pct: 14.9 },
  { dept: "כספים", used: 51.7, docs: 412, pct: 13.3 },
  { dept: "מכירות", used: 39.2, docs: 356, pct: 10.1 },
  { dept: "לוגיסטיקה", used: 31.8, docs: 287, pct: 8.2 },
  { dept: "משאבי אנוש", used: 22.4, docs: 198, pct: 5.8 },
  { dept: "תפעול", used: 15.0, docs: 125, pct: 3.8 },
];

/* ── Monthly Trends (6 months) ── */
const FALLBACK_MONTHLY_TRENDS = [
  { month: "נובמבר 2025", uploads: 118, downloads: 2340, approvals: 95, rejections: 4, uploadTrend: "up", downloadTrend: "up" },
  { month: "דצמבר 2025", uploads: 104, downloads: 2180, approvals: 88, rejections: 3, uploadTrend: "down", downloadTrend: "down" },
  { month: "ינואר 2026", uploads: 131, downloads: 2520, approvals: 107, rejections: 5, uploadTrend: "up", downloadTrend: "up" },
  { month: "פברואר 2026", uploads: 127, downloads: 2410, approvals: 102, rejections: 4, uploadTrend: "down", downloadTrend: "down" },
  { month: "מרץ 2026", uploads: 138, downloads: 2680, approvals: 115, rejections: 3, uploadTrend: "up", downloadTrend: "up" },
  { month: "אפריל 2026", uploads: 142, downloads: 2750, approvals: 119, rejections: 5, uploadTrend: "up", downloadTrend: "up" },
];

/* ── Top Documents ── */
const FALLBACK_MOST_DOWNLOADED = [
  { name: "מפרט טכני מסגרת T-400", dept: "הנדסה", count: 342, type: "PDF" },
  { name: "חוזה מסגרת ספקים 2026", dept: "רכש", count: 287, type: "DOCX" },
  { name: "טבלת מחירונים עדכנית", dept: "מכירות", count: 264, type: "XLSX" },
  { name: "נוהל בטיחות מפעל", dept: "איכות", count: 231, type: "PDF" },
  { name: "שרטוט ציר הנעה SH-40", dept: "הנדסה", count: 198, type: "DWG" },
  { name: "דו\"ח כספי רבעוני Q1", dept: "כספים", count: 176, type: "PDF" },
  { name: "קטלוג מוצרים 2026", dept: "מכירות", count: 165, type: "PDF" },
  { name: "תעודת ISO 9001", dept: "איכות", count: 154, type: "PDF" },
  { name: "הסכם סודיות NDA כללי", dept: "משפטי", count: 143, type: "DOCX" },
  { name: "מדריך הדרכת עובדים חדשים", dept: "משאבי אנוש", count: 131, type: "PDF" },
];

const FALLBACK_MOST_VIEWED = [
  { name: "לוח זמנים ייצור שבועי", dept: "תפעול", count: 1240, type: "XLSX" },
  { name: "מפרט טכני מסגרת T-400", dept: "הנדסה", count: 1087, type: "PDF" },
  { name: "נוהל בטיחות מפעל", dept: "איכות", count: 945, type: "PDF" },
  { name: "טבלת מחירונים עדכנית", dept: "מכירות", count: 876, type: "XLSX" },
  { name: "דו\"ח מלאי יומי", dept: "לוגיסטיקה", count: 812, type: "XLSX" },
  { name: "תקנון פנימי חברה", dept: "משאבי אנוש", count: 654, type: "PDF" },
  { name: "רשימת ספקים מאושרים", dept: "רכש", count: 598, type: "XLSX" },
  { name: "חוזה מסגרת ספקים 2026", dept: "רכש", count: 543, type: "DOCX" },
  { name: "מדריך ERP למשתמש", dept: "IT", count: 487, type: "PDF" },
  { name: "נהלי פינוי חירום", dept: "בטיחות", count: 421, type: "PDF" },
];

const FALLBACK_MOST_SHARED = [
  { name: "קטלוג מוצרים 2026", dept: "מכירות", count: 89, type: "PDF" },
  { name: "הצעת מחיר תבנית", dept: "מכירות", count: 76, type: "DOCX" },
  { name: "מפרט טכני מסגרת T-400", dept: "הנדסה", count: 64, type: "PDF" },
  { name: "חוזה מסגרת ספקים 2026", dept: "רכש", count: 58, type: "DOCX" },
  { name: "תעודת ISO 9001", dept: "איכות", count: 52, type: "PDF" },
  { name: "דו\"ח כספי רבעוני Q1", dept: "כספים", count: 47, type: "PDF" },
  { name: "מדריך הדרכת עובדים חדשים", dept: "משאבי אנוש", count: 41, type: "PDF" },
  { name: "הסכם סודיות NDA כללי", dept: "משפטי", count: 38, type: "DOCX" },
  { name: "טבלת מחירונים עדכנית", dept: "מכירות", count: 35, type: "XLSX" },
  { name: "רשימת ספקים מאושרים", dept: "רכש", count: 29, type: "XLSX" },
];

/* ── Document Type Distribution ── */
const FALLBACK_DOC_TYPES = [
  { type: "PDF", count: 1245, pct: 32.4 },
  { type: "DOCX", count: 812, pct: 21.1 },
  { type: "XLSX", count: 634, pct: 16.5 },
  { type: "DWG (שרטוטים)", count: 387, pct: 10.1 },
  { type: "תמונות (JPG/PNG)", count: 298, pct: 7.7 },
  { type: "PPTX", count: 156, pct: 4.1 },
  { type: "ZIP/RAR", count: 112, pct: 2.9 },
  { type: "TXT/CSV", count: 89, pct: 2.3 },
  { type: "HTML/XML", count: 67, pct: 1.7 },
  { type: "אחר", count: 47, pct: 1.2 },
];

/* ── User Activity ── */
const FALLBACK_TOP_USERS = [
  { name: "יוסי כהן", dept: "רכש", uploads: 87, downloads: 412, approvals: 64 },
  { name: "שרה מזרחי", dept: "מכירות", uploads: 72, downloads: 356, approvals: 41 },
  { name: "אלון גולדשטיין", dept: "הנדסה", uploads: 68, downloads: 534, approvals: 58 },
  { name: "דוד לוי", dept: "כספים", uploads: 54, downloads: 298, approvals: 72 },
  { name: "רחל אברהם", dept: "איכות", uploads: 51, downloads: 276, approvals: 53 },
  { name: "נועה פרידמן", dept: "תפעול", uploads: 48, downloads: 487, approvals: 35 },
  { name: "מיכל ברק", dept: "בטיחות", uploads: 43, downloads: 198, approvals: 29 },
  { name: "עומר חדד", dept: "לוגיסטיקה", uploads: 39, downloads: 321, approvals: 22 },
  { name: "דוד מזרחי", dept: "הנדסה", uploads: 36, downloads: 245, approvals: 31 },
  { name: "ליאור שמעוני", dept: "משאבי אנוש", uploads: 31, downloads: 187, approvals: 18 },
];

/* ── AI Insights ── */
const FALLBACK_INSIGHTS = [
  { text: "מחלקת רכש מייצרת 35% מהמסמכים — גבוה פי 2 מהממוצע. מומלץ לבדוק אם ניתן לאחד תבניות חוזים.", icon: TrendingUp, color: "text-blue-600", bg: "bg-blue-50" },
  { text: "ממוצע זמן אישור עלה ב-12% ברבעון האחרון (מ-3.7 ל-4.2 שעות). צוואר בקבוק זוהה באישורי מנהל כספים.", icon: Clock, bg: "bg-amber-50", color: "text-amber-600" },
  { text: "15 מסמכים לא נגישו מעולם מאז העלאתם — כולל 3 חוזים ו-4 מפרטים. מומלץ לסמן לארכיון או מחיקה.", icon: Lightbulb, bg: "bg-purple-50", color: "text-purple-600" },
];

function TrendIcon({ trend }: { trend: string }) {
  if (trend === "up") return <ArrowUpRight className="w-4 h-4 text-green-500 inline" />;
  if (trend === "down") return <ArrowDownRight className="w-4 h-4 text-red-500 inline" />;
  return <Minus className="w-4 h-4 text-muted-foreground inline" />;
}

const typeBadgeColor: Record<string, string> = {
  PDF: "bg-red-100 text-red-700",
  DOCX: "bg-blue-100 text-blue-700",
  XLSX: "bg-green-100 text-green-700",
  DWG: "bg-orange-100 text-orange-700",
};

export default function DocumentAnalyticsPage() {

  const { data: apiData } = useQuery({
    queryKey: ["document_analytics"],
    queryFn: () => authFetch("/api/documents/document-analytics").then(r => r.json()),
    staleTime: 60_000,
    retry: 1,
  });
  const kpis = apiData?.kpis ?? FALLBACK_KPIS;
  const storageDepts = apiData?.storageDepts ?? FALLBACK_STORAGE_DEPTS;
  const monthlyTrends = apiData?.monthlyTrends ?? FALLBACK_MONTHLY_TRENDS;
  const mostDownloaded = apiData?.mostDownloaded ?? FALLBACK_MOST_DOWNLOADED;
  const mostViewed = apiData?.mostViewed ?? FALLBACK_MOST_VIEWED;
  const mostShared = apiData?.mostShared ?? FALLBACK_MOST_SHARED;
  const docTypes = apiData?.docTypes ?? FALLBACK_DOC_TYPES;
  const topUsers = apiData?.topUsers ?? FALLBACK_TOP_USERS;
  const insights = apiData?.insights ?? FALLBACK_INSIGHTS;
  const [mainTab, setMainTab] = useState("storage");
  const [docsSubTab, setDocsSubTab] = useState("downloaded");

  return (
    <div dir="rtl" className="p-6 space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-indigo-100">
          <BarChart3 className="w-6 h-6 text-indigo-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">אנליטיקת מסמכים</h1>
          <p className="text-sm text-muted-foreground">טכנו-כל עוזי — ניתוח שימוש ואחסון מערכת ניהול מסמכים</p>
        </div>
      </div>

      {/* ── KPI Strip ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpis.map((k) => (
          <Card key={k.label} className="relative overflow-hidden">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground">{k.label}</span>
                <div className={`p-1.5 rounded-md ${k.bg}`}>
                  <k.icon className={`w-4 h-4 ${k.color}`} />
                </div>
              </div>
              <p className="text-lg font-bold">{k.value}</p>
              {k.progress !== undefined && (
                <Progress value={k.progress} className="mt-2 h-1.5" />
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── AI Insights ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {insights.map((ins, i) => (
          <Card key={i} className={`border ${ins.bg}`}>
            <CardContent className="p-4 flex gap-3 items-start">
              <div className={`p-2 rounded-lg ${ins.bg}`}>
                <ins.icon className={`w-5 h-5 ${ins.color}`} />
              </div>
              <div>
                <Badge variant="outline" className="mb-1 text-xs">תובנת AI</Badge>
                <p className="text-sm leading-relaxed">{ins.text}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Main Tabs ── */}
      <Tabs value={mainTab} onValueChange={setMainTab}>
        <TabsList className="grid grid-cols-4 w-full max-w-xl">
          <TabsTrigger value="storage"><HardDrive className="w-4 h-4 ml-1" />אחסון</TabsTrigger>
          <TabsTrigger value="trends"><TrendingUp className="w-4 h-4 ml-1" />מגמות</TabsTrigger>
          <TabsTrigger value="popular"><Download className="w-4 h-4 ml-1" />מסמכים פופולריים</TabsTrigger>
          <TabsTrigger value="users"><Users className="w-4 h-4 ml-1" />פעילות משתמשים</TabsTrigger>
        </TabsList>

        {/* ─── Storage Tab ─── */}
        <TabsContent value="storage" className="space-y-4 mt-4">
          <Card>
            <CardContent className="p-0">
              <div className="p-4 border-b">
                <h3 className="font-semibold flex items-center gap-2"><HardDrive className="w-4 h-4" />ניתוח אחסון לפי מחלקה</h3>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">מחלקה</TableHead>
                    <TableHead className="text-right">אחסון (GB)</TableHead>
                    <TableHead className="text-right">מסמכים</TableHead>
                    <TableHead className="text-right w-[200px]">אחוז מסה\"כ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {storageDepts.map((d) => (
                    <TableRow key={d.dept}>
                      <TableCell className="font-medium">{d.dept}</TableCell>
                      <TableCell>{d.used.toFixed(1)}</TableCell>
                      <TableCell>{d.docs.toLocaleString()}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={d.pct} className="h-2 flex-1" />
                          <span className="text-xs text-muted-foreground w-10">{d.pct}%</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Document Type Distribution */}
          <Card>
            <CardContent className="p-0">
              <div className="p-4 border-b">
                <h3 className="font-semibold flex items-center gap-2"><FileText className="w-4 h-4" />התפלגות סוגי מסמכים</h3>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">סוג קובץ</TableHead>
                    <TableHead className="text-right">כמות</TableHead>
                    <TableHead className="text-right w-[220px]">אחוז</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {docTypes.map((dt) => (
                    <TableRow key={dt.type}>
                      <TableCell className="font-medium">{dt.type}</TableCell>
                      <TableCell>{dt.count.toLocaleString()}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={dt.pct} className="h-2 flex-1" />
                          <span className="text-xs text-muted-foreground w-12">{dt.pct}%</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Trends Tab ─── */}
        <TabsContent value="trends" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <div className="p-4 border-b">
                <h3 className="font-semibold flex items-center gap-2"><TrendingUp className="w-4 h-4" />מגמות חודשיות — 6 חודשים אחרונים</h3>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">חודש</TableHead>
                    <TableHead className="text-right">העלאות</TableHead>
                    <TableHead className="text-right">הורדות</TableHead>
                    <TableHead className="text-right">אישורים</TableHead>
                    <TableHead className="text-right">דחיות</TableHead>
                    <TableHead className="text-right">מגמה</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monthlyTrends.map((m) => (
                    <TableRow key={m.month}>
                      <TableCell className="font-medium">{m.month}</TableCell>
                      <TableCell>{m.uploads}</TableCell>
                      <TableCell>{m.downloads.toLocaleString()}</TableCell>
                      <TableCell>
                        <span className="flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                          {m.approvals}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="flex items-center gap-1">
                          <XCircle className="w-3.5 h-3.5 text-red-400" />
                          {m.rejections}
                        </span>
                      </TableCell>
                      <TableCell>
                        <TrendIcon trend={m.uploadTrend} />
                        <TrendIcon trend={m.downloadTrend} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Popular Documents Tab ─── */}
        <TabsContent value="popular" className="mt-4 space-y-4">
          <Tabs value={docsSubTab} onValueChange={setDocsSubTab}>
            <TabsList>
              <TabsTrigger value="downloaded"><Download className="w-4 h-4 ml-1" />הורדות</TabsTrigger>
              <TabsTrigger value="viewed"><Eye className="w-4 h-4 ml-1" />צפיות</TabsTrigger>
              <TabsTrigger value="shared"><Share2 className="w-4 h-4 ml-1" />שיתופים</TabsTrigger>
            </TabsList>

            {[
              { key: "downloaded", data: mostDownloaded, label: "הורדות", icon: Download },
              { key: "viewed", data: mostViewed, label: "צפיות", icon: Eye },
              { key: "shared", data: mostShared, label: "שיתופים", icon: Share2 },
            ].map((tab) => (
              <TabsContent key={tab.key} value={tab.key}>
                <Card>
                  <CardContent className="p-0">
                    <div className="p-4 border-b">
                      <h3 className="font-semibold flex items-center gap-2">
                        <tab.icon className="w-4 h-4" />
                        10 המסמכים המובילים — {tab.label}
                      </h3>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-right w-8">#</TableHead>
                          <TableHead className="text-right">שם מסמך</TableHead>
                          <TableHead className="text-right">מחלקה</TableHead>
                          <TableHead className="text-right">סוג</TableHead>
                          <TableHead className="text-right">{tab.label}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {tab.data.map((doc, idx) => (
                          <TableRow key={doc.name}>
                            <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                            <TableCell className="font-medium">{doc.name}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{doc.dept}</Badge>
                            </TableCell>
                            <TableCell>
                              <Badge className={typeBadgeColor[doc.type] || "bg-gray-100 text-gray-700"}>
                                {doc.type}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-semibold">{doc.count.toLocaleString()}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </TabsContent>
            ))}
          </Tabs>
        </TabsContent>

        {/* ─── User Activity Tab ─── */}
        <TabsContent value="users" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <div className="p-4 border-b">
                <h3 className="font-semibold flex items-center gap-2"><Users className="w-4 h-4" />10 המשתמשים הפעילים ביותר</h3>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right w-8">#</TableHead>
                    <TableHead className="text-right">שם</TableHead>
                    <TableHead className="text-right">מחלקה</TableHead>
                    <TableHead className="text-right">
                      <span className="flex items-center gap-1"><Upload className="w-3.5 h-3.5" />העלאות</span>
                    </TableHead>
                    <TableHead className="text-right">
                      <span className="flex items-center gap-1"><Download className="w-3.5 h-3.5" />הורדות</span>
                    </TableHead>
                    <TableHead className="text-right">
                      <span className="flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" />אישורים</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topUsers.map((u, idx) => (
                    <TableRow key={u.name}>
                      <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                      <TableCell className="font-medium">{u.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{u.dept}</Badge>
                      </TableCell>
                      <TableCell>{u.uploads}</TableCell>
                      <TableCell>{u.downloads}</TableCell>
                      <TableCell>{u.approvals}</TableCell>
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