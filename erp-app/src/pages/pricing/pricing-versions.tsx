import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import {
  History, FileText, Clock, CheckCircle2, XCircle, TrendingUp,
  Layers, AlertTriangle, ArrowLeftRight, ThumbsUp, ThumbsDown,
  User, Calendar, DollarSign, BarChart3
} from "lucide-react";

const fmtC = (n: number) =>
  new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", minimumFractionDigits: 0 }).format(n);

const statusMap: Record<string, { label: string; color: string }> = {
  draft: { label: "טיוטה", color: "bg-muted/20 text-muted-foreground" },
  pending: { label: "ממתין לאישור", color: "bg-yellow-500/20 text-yellow-400" },
  approved: { label: "מאושר", color: "bg-green-500/20 text-green-400" },
  rejected: { label: "נדחה", color: "bg-red-500/20 text-red-400" },
};

const urgencyMap: Record<string, { label: string; color: string }> = {
  low: { label: "נמוכה", color: "bg-muted/20 text-muted-foreground" },
  medium: { label: "בינונית", color: "bg-blue-500/20 text-blue-400" },
  high: { label: "גבוהה", color: "bg-orange-500/20 text-orange-400" },
  critical: { label: "קריטית", color: "bg-red-500/20 text-red-400" },
};

const FALLBACK_VERSIONS = [
  { id: 1, project: "מכסה פלסטיק TK-200", version: 1, createdBy: "יוסי כהן", date: "2026-03-15", totalCost: 12400, recommendedPrice: 18600, margin: 33.3, status: "approved", changes: "—" },
  { id: 2, project: "מכסה פלסטיק TK-200", version: 2, createdBy: "יוסי כהן", date: "2026-03-22", totalCost: 11800, recommendedPrice: 17700, margin: 33.3, status: "approved", changes: "הפחתת חומר גלם ב-5%" },
  { id: 3, project: "מכסה פלסטיק TK-200", version: 3, createdBy: "דנה לוי", date: "2026-04-01", totalCost: 12100, recommendedPrice: 18150, margin: 33.3, status: "pending", changes: "תוספת אריזה מיוחדת" },
  { id: 4, project: "בורג נירוסטה M8", version: 1, createdBy: "אבי מזרחי", date: "2026-03-10", totalCost: 3200, recommendedPrice: 4800, margin: 33.3, status: "approved", changes: "—" },
  { id: 5, project: "בורג נירוסטה M8", version: 2, createdBy: "אבי מזרחי", date: "2026-03-28", totalCost: 3450, recommendedPrice: 5175, margin: 33.3, status: "rejected", changes: "עליית מחיר ספק" },
  { id: 6, project: "תושבת אלומיניום AL-50", version: 1, createdBy: "רונית שמש", date: "2026-02-20", totalCost: 28500, recommendedPrice: 42750, margin: 33.3, status: "approved", changes: "—" },
  { id: 7, project: "תושבת אלומיניום AL-50", version: 2, createdBy: "רונית שמש", date: "2026-03-18", totalCost: 27900, recommendedPrice: 41850, margin: 33.3, status: "approved", changes: "אופטימיזציית תהליך ייצור" },
  { id: 8, project: "צינור גומי FL-12", version: 1, createdBy: "מיכל אברהם", date: "2026-04-03", totalCost: 8750, recommendedPrice: 13125, margin: 33.3, status: "pending", changes: "—" },
  { id: 9, project: "אטם סיליקון SG-7", version: 1, createdBy: "דנה לוי", date: "2026-03-25", totalCost: 5600, recommendedPrice: 8400, margin: 33.3, status: "approved", changes: "—" },
  { id: 10, project: "אטם סיליקון SG-7", version: 2, createdBy: "יוסי כהן", date: "2026-04-05", totalCost: 5900, recommendedPrice: 8260, margin: 28.6, status: "pending", changes: "שינוי ספק + הנחת כמות" },
];

const pendingApprovals = FALLBACK_VERSIONS.filter(v => v.status === "pending").map(v => ({
  ...v,
  urgency: v.project.includes("TK-200") ? "high" : v.project.includes("SG-7") ? "critical" : "medium",
}));

const FALLBACK_HISTORY_ITEMS = [
  { id: 1, project: "מכסה פלסטיק TK-200", version: 1, action: "approved", by: "עוזי טכנוכל", date: "2026-03-16", notes: "מחיר סביר, מאושר לייצור" },
  { id: 2, project: "מכסה פלסטיק TK-200", version: 2, action: "approved", by: "עוזי טכנוכל", date: "2026-03-23", notes: "חיסכון בחומר גלם מצוין" },
  { id: 3, project: "בורג נירוסטה M8", version: 1, action: "approved", by: "עוזי טכנוכל", date: "2026-03-11", notes: "מותאם למחירון הספק" },
  { id: 4, project: "בורג נירוסטה M8", version: 2, action: "rejected", by: "עוזי טכנוכל", date: "2026-03-29", notes: "עלייה גבוהה מדי - לחפש ספק חלופי" },
  { id: 5, project: "תושבת אלומיניום AL-50", version: 1, action: "approved", by: "שרה מנהלת", date: "2026-02-21", notes: "אושר לפרויקט מגה-טק" },
  { id: 6, project: "תושבת אלומיניום AL-50", version: 2, action: "approved", by: "עוזי טכנוכל", date: "2026-03-19", notes: "שיפור תהליך מוצדק" },
  { id: 7, project: "אטם סיליקון SG-7", version: 1, action: "approved", by: "שרה מנהלת", date: "2026-03-26", notes: "מחיר תחרותי" },
];

const FALLBACK_COMPARISON_CATEGORIES = [
  { category: "חומרי גלם", v1: 6200, v2: 5900, change: -4.8 },
  { category: "עבודה ישירה", v1: 2800, v2: 2800, change: 0 },
  { category: "אריזה", v1: 400, v2: 950, change: 137.5 },
  { category: "תקורות ייצור", v1: 1600, v2: 1600, change: 0 },
  { category: "הובלה ולוגיסטיקה", v1: 500, v2: 550, change: 10.0 },
  { category: "בדיקות איכות", v1: 300, v2: 300, change: 0 },
];

const FALLBACK_KPIS = [
  { label: "סה\"כ גרסאות", value: "10", icon: Layers, color: "text-blue-400" },
  { label: "ממוצע גרסאות לפרויקט", value: "2.0", icon: BarChart3, color: "text-purple-400" },
  { label: "ממתינים לאישור", value: "3", icon: Clock, color: "text-yellow-400" },
  { label: "אושרו היום", value: "1", icon: CheckCircle2, color: "text-green-400" },
  { label: "נדחו", value: "1", icon: XCircle, color: "text-red-400" },
  { label: "זמן אישור ממוצע", value: "1.3 ימים", icon: TrendingUp, color: "text-cyan-400" },
];

export default function PricingVersions() {

  const { data: apiData } = useQuery({
    queryKey: ["pricing_versions"],
    queryFn: () => authFetch("/api/pricing/pricing-versions").then(r => r.json()),
    staleTime: 60_000,
    retry: 1,
  });
  const versions = apiData?.versions ?? FALLBACK_VERSIONS;
  const historyItems = apiData?.historyItems ?? FALLBACK_HISTORY_ITEMS;
  const comparisonCategories = apiData?.comparisonCategories ?? FALLBACK_COMPARISON_CATEGORIES;
  const kpis = apiData?.kpis ?? FALLBACK_KPIS;
  const [tab, setTab] = useState("versions");
  const [compProject] = useState("מכסה פלסטיק TK-200");
  const [compV1] = useState(2);
  const [compV2] = useState(3);

  return (
    <div dir="rtl" className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500/20 to-blue-500/20 flex items-center justify-center">
          <History className="w-5 h-5 text-purple-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">גרסאות תמחור ואישורים</h1>
          <p className="text-sm text-muted-foreground">טכנו-כל עוזי — מעקב גרסאות, אישורים והשוואות</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpis.map((k) => (
          <Card key={k.label} className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <k.icon className={`w-5 h-5 ${k.color}`} />
                <span className="text-xs text-muted-foreground">{k.label}</span>
              </div>
              <p className="text-2xl font-bold text-foreground">{k.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-muted/30">
          <TabsTrigger value="versions" className="gap-1.5"><FileText className="w-4 h-4" />גרסאות</TabsTrigger>
          <TabsTrigger value="pending" className="gap-1.5"><Clock className="w-4 h-4" />אישורים ממתינים</TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5"><History className="w-4 h-4" />היסטוריה</TabsTrigger>
          <TabsTrigger value="compare" className="gap-1.5"><ArrowLeftRight className="w-4 h-4" />השוואת גרסאות</TabsTrigger>
        </TabsList>

        {/* Tab 1: Versions */}
        <TabsContent value="versions">
          <Card className="bg-card border-border">
            <CardHeader><CardTitle className="text-lg">כל הגרסאות</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">פרויקט</TableHead>
                    <TableHead className="text-center">גרסה</TableHead>
                    <TableHead className="text-right">נוצר ע\"י</TableHead>
                    <TableHead className="text-center">תאריך</TableHead>
                    <TableHead className="text-left">עלות כוללת</TableHead>
                    <TableHead className="text-left">מחיר מומלץ</TableHead>
                    <TableHead className="text-center">מרווח %</TableHead>
                    <TableHead className="text-center">סטטוס</TableHead>
                    <TableHead className="text-right">שינויים מגרסה קודמת</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {versions.map((v) => {
                    const s = statusMap[v.status];
                    return (
                      <TableRow key={v.id}>
                        <TableCell className="font-medium text-foreground">{v.project}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className="text-xs">v{v.version}</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{v.createdBy}</TableCell>
                        <TableCell className="text-center text-muted-foreground">{v.date}</TableCell>
                        <TableCell className="text-left font-mono">{fmtC(v.totalCost)}</TableCell>
                        <TableCell className="text-left font-mono">{fmtC(v.recommendedPrice)}</TableCell>
                        <TableCell className="text-center">
                          <span className={v.margin >= 30 ? "text-green-400" : "text-yellow-400"}>{v.margin}%</span>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge className={`${s.color} text-xs`}>{s.label}</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm max-w-[200px] truncate">{v.changes}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Pending Approvals */}
        <TabsContent value="pending">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-yellow-400" />
                אישורים ממתינים ({pendingApprovals.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {pendingApprovals.map((a) => {
                const u = urgencyMap[a.urgency];
                return (
                  <Card key={a.id} className="bg-muted/10 border-border">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="space-y-2 flex-1">
                          <div className="flex items-center gap-3">
                            <h3 className="font-semibold text-foreground">{a.project}</h3>
                            <Badge variant="outline" className="text-xs">v{a.version}</Badge>
                            <Badge className={`${u.color} text-xs`}>{u.label}</Badge>
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                              <User className="w-3.5 h-3.5" />
                              <span>מבקש: {a.createdBy}</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                              <Calendar className="w-3.5 h-3.5" />
                              <span>{a.date}</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                              <DollarSign className="w-3.5 h-3.5" />
                              <span>עלות: {fmtC(a.totalCost)}</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                              <TrendingUp className="w-3.5 h-3.5" />
                              <span>מחיר: {fmtC(a.recommendedPrice)}</span>
                            </div>
                          </div>
                          {a.changes !== "—" && (
                            <p className="text-xs text-muted-foreground bg-muted/20 rounded px-2 py-1 inline-block">
                              שינוי: {a.changes}
                            </p>
                          )}
                        </div>
                        <div className="flex gap-2 mr-4">
                          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-green-500/20 text-green-400 hover:bg-green-500/30 text-sm transition-colors">
                            <ThumbsUp className="w-3.5 h-3.5" />אשר
                          </button>
                          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-red-500/20 text-red-400 hover:bg-red-500/30 text-sm transition-colors">
                            <ThumbsDown className="w-3.5 h-3.5" />דחה
                          </button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: History */}
        <TabsContent value="history">
          <Card className="bg-card border-border">
            <CardHeader><CardTitle className="text-lg">היסטוריית אישורים ודחיות</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">פרויקט</TableHead>
                    <TableHead className="text-center">גרסה</TableHead>
                    <TableHead className="text-center">פעולה</TableHead>
                    <TableHead className="text-right">ע\"י</TableHead>
                    <TableHead className="text-center">תאריך</TableHead>
                    <TableHead className="text-right">הערות</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historyItems.map((h) => (
                    <TableRow key={h.id}>
                      <TableCell className="font-medium text-foreground">{h.project}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="text-xs">v{h.version}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        {h.action === "approved" ? (
                          <Badge className="bg-green-500/20 text-green-400 text-xs gap-1">
                            <CheckCircle2 className="w-3 h-3" />אושר
                          </Badge>
                        ) : (
                          <Badge className="bg-red-500/20 text-red-400 text-xs gap-1">
                            <XCircle className="w-3 h-3" />נדחה
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{h.by}</TableCell>
                      <TableCell className="text-center text-muted-foreground">{h.date}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{h.notes}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 4: Version Comparison */}
        <TabsContent value="compare">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <ArrowLeftRight className="w-5 h-5 text-blue-400" />
                השוואה: {compProject} — גרסה {compV1} מול גרסה {compV2}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="bg-muted/10 border-blue-500/30">
                  <CardContent className="p-4">
                    <h4 className="font-semibold text-blue-400 mb-2">גרסה {compV1} (מאושר)</h4>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between"><span className="text-muted-foreground">עלות כוללת:</span><span className="font-mono">{fmtC(11800)}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">מחיר מומלץ:</span><span className="font-mono">{fmtC(17700)}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">מרווח:</span><span className="text-green-400">33.3%</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">נוצר ע\"י:</span><span>יוסי כהן</span></div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-muted/10 border-yellow-500/30">
                  <CardContent className="p-4">
                    <h4 className="font-semibold text-yellow-400 mb-2">גרסה {compV2} (ממתין לאישור)</h4>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between"><span className="text-muted-foreground">עלות כוללת:</span><span className="font-mono">{fmtC(12100)}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">מחיר מומלץ:</span><span className="font-mono">{fmtC(18150)}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">מרווח:</span><span className="text-green-400">33.3%</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">נוצר ע\"י:</span><span>דנה לוי</span></div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Category Breakdown */}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">קטגוריית עלות</TableHead>
                    <TableHead className="text-left">גרסה {compV1}</TableHead>
                    <TableHead className="text-left">גרסה {compV2}</TableHead>
                    <TableHead className="text-center">שינוי</TableHead>
                    <TableHead className="w-[200px]">השפעה</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {comparisonCategories.map((c) => (
                    <TableRow key={c.category}>
                      <TableCell className="font-medium text-foreground">{c.category}</TableCell>
                      <TableCell className="font-mono text-muted-foreground">{fmtC(c.v1)}</TableCell>
                      <TableCell className="font-mono text-foreground">{fmtC(c.v2)}</TableCell>
                      <TableCell className="text-center">
                        {c.change === 0 ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <span className={c.change > 0 ? "text-red-400" : "text-green-400"}>
                            {c.change > 0 ? "+" : ""}{c.change.toFixed(1)}%
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Progress
                          value={Math.min(Math.abs(c.change), 100)}
                          className={`h-2 ${c.change > 0 ? "[&>div]:bg-red-500" : c.change < 0 ? "[&>div]:bg-green-500" : "[&>div]:bg-muted"}`}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Total Difference */}
              <div className="flex items-center justify-between bg-muted/10 rounded-lg p-4 border border-border">
                <div className="flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-yellow-400" />
                  <span className="text-foreground font-semibold">הפרש עלות כולל:</span>
                </div>
                <span className="text-lg font-bold text-red-400">+{fmtC(300)} (+2.5%)</span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
