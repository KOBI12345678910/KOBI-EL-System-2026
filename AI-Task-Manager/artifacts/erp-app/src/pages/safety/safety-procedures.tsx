import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ShieldAlert, Flame, Zap, FlaskConical, ArrowUpFromLine, Cog,
  HardHat, Search, Plus, Download, Eye, Edit2, CheckCircle2,
  AlertTriangle, Clock, FileText, ClipboardCheck
} from "lucide-react";

const procedures = [
  { id: "SP-001", name: "נוהל כיבוי אש וחירום", category: "אש", icon: "flame", dept: "כל המפעל", version: "4.2", lastReview: "2026-02-15", nextReview: "2026-08-15", compliance: 98, status: "פעיל", responsible: "רועי כהן", trained: 145, totalStaff: 148 },
  { id: "SP-002", name: "בטיחות חשמל ומתח גבוה", category: "חשמל", icon: "zap", dept: "תחזוקה / ייצור", version: "3.1", lastReview: "2026-01-10", nextReview: "2026-07-10", compliance: 95, status: "פעיל", responsible: "אלי שמש", trained: 62, totalStaff: 65 },
  { id: "SP-003", name: "טיפול בחומרים כימיים", category: "כימי", icon: "flask", dept: "ייצור / מעבדה", version: "2.8", lastReview: "2025-11-20", nextReview: "2026-05-20", compliance: 92, status: "לעדכון", responsible: "דנה לוי", trained: 38, totalStaff: 42 },
  { id: "SP-004", name: "עבודה בגובה", category: "גובה", icon: "arrow", dept: "התקנות / בנייה", version: "5.0", lastReview: "2026-03-01", nextReview: "2026-09-01", compliance: 100, status: "פעיל", responsible: "עמית ברק", trained: 28, totalStaff: 28 },
  { id: "SP-005", name: "הפעלת מכונות תעשייתיות", category: "מכונות", icon: "cog", dept: "ייצור", version: "3.5", lastReview: "2025-12-10", nextReview: "2026-06-10", compliance: 88, status: "לעדכון", responsible: "משה דוד", trained: 51, totalStaff: 58 },
  { id: "SP-006", name: "ציוד מגן אישי - PPE", category: "PPE", icon: "hat", dept: "כל המפעל", version: "2.3", lastReview: "2026-01-05", nextReview: "2026-07-05", compliance: 96, status: "פעיל", responsible: "שרה אברהם", trained: 142, totalStaff: 148 },
  { id: "SP-007", name: "נוהל חומרים מסוכנים - MSDS", category: "כימי", icon: "flask", dept: "מחסן / ייצור", version: "3.0", lastReview: "2025-10-15", nextReview: "2026-04-15", compliance: 85, status: "דחוף - לעדכון", responsible: "יוסי פרץ", trained: 35, totalStaff: 42 },
  { id: "SP-008", name: "נהיגת מלגזות ומנופים", category: "מכונות", icon: "cog", dept: "מחסן / לוגיסטיקה", version: "4.1", lastReview: "2026-02-20", nextReview: "2026-08-20", compliance: 100, status: "פעיל", responsible: "בני גולן", trained: 18, totalStaff: 18 },
  { id: "SP-009", name: "בטיחות ריתוך וחיתוך", category: "אש", icon: "flame", dept: "ייצור מתכות", version: "3.7", lastReview: "2026-01-25", nextReview: "2026-07-25", compliance: 94, status: "פעיל", responsible: "אבי מזרחי", trained: 22, totalStaff: 24 },
  { id: "SP-010", name: "פינוי מבנה וחירום", category: "חירום", icon: "flame", dept: "כל המפעל", version: "5.1", lastReview: "2026-03-10", nextReview: "2026-09-10", compliance: 97, status: "פעיל", responsible: "רועי כהן", trained: 144, totalStaff: 148 },
  { id: "SP-011", name: "עבודה במקומות סגורים", category: "גובה", icon: "arrow", dept: "תחזוקה", version: "2.5", lastReview: "2025-09-01", nextReview: "2026-03-01", compliance: 78, status: "דחוף - לעדכון", responsible: "עמית ברק", trained: 12, totalStaff: 16 },
  { id: "SP-012", name: "ארגונומיה ומניעת פגיעות", category: "PPE", icon: "hat", dept: "משרדים / ייצור", version: "1.8", lastReview: "2025-08-15", nextReview: "2026-02-15", compliance: 82, status: "לעדכון", responsible: "דנה לוי", trained: 98, totalStaff: 148 },
];

const statusColors: Record<string, string> = {
  "פעיל": "bg-green-500/20 text-green-300 border-green-500/30",
  "לעדכון": "bg-amber-500/20 text-amber-300 border-amber-500/30",
  "דחוף - לעדכון": "bg-red-500/20 text-red-300 border-red-500/30",
  "טיוטה": "bg-blue-500/20 text-blue-300 border-blue-500/30",
};

const categoryIcons: Record<string, JSX.Element> = {
  "אש": <Flame className="w-4 h-4 text-orange-400" />,
  "חשמל": <Zap className="w-4 h-4 text-yellow-400" />,
  "כימי": <FlaskConical className="w-4 h-4 text-purple-400" />,
  "גובה": <ArrowUpFromLine className="w-4 h-4 text-blue-400" />,
  "מכונות": <Cog className="w-4 h-4 text-slate-400" />,
  "PPE": <HardHat className="w-4 h-4 text-cyan-400" />,
  "חירום": <ShieldAlert className="w-4 h-4 text-red-400" />,
};

export default function SafetyProcedures() {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [activeTab, setActiveTab] = useState("all");

  const filtered = useMemo(() => {
    return procedures.filter(r => {
      if (categoryFilter !== "all" && r.category !== categoryFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        return r.name.toLowerCase().includes(s) || r.dept.toLowerCase().includes(s) || r.id.toLowerCase().includes(s);
      }
      return true;
    });
  }, [search, categoryFilter]);

  const kpis = useMemo(() => {
    const avgCompliance = (procedures.reduce((sum, p) => sum + p.compliance, 0) / procedures.length).toFixed(1);
    const totalTrained = procedures.reduce((sum, p) => sum + p.trained, 0);
    const totalStaff = 148;
    return {
      total: procedures.length,
      active: procedures.filter(p => p.status === "פעיל").length,
      needUpdate: procedures.filter(p => p.status.includes("לעדכון")).length,
      avgCompliance,
      urgent: procedures.filter(p => p.status === "דחוף - לעדכון").length,
    };
  }, []);

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <ShieldAlert className="h-7 w-7 text-red-400" />
            נוהלי בטיחות
          </h1>
          <p className="text-sm text-muted-foreground mt-1">ניהול ומעקב נוהלי בטיחות במפעל | טכנו-כל עוזי</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm"><Download className="w-4 h-4 ml-1" />ייצוא</Button>
          <Button size="sm" className="bg-red-600 hover:bg-red-700"><Plus className="w-4 h-4 ml-1" />נוהל חדש</Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="bg-gradient-to-br from-slate-800 to-slate-900 border-slate-700">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400">סה״כ נהלים</p>
                <p className="text-2xl font-bold text-white">{kpis.total}</p>
              </div>
              <FileText className="h-8 w-8 text-slate-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-green-900/50 to-green-950 border-green-800/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-green-400">פעילים ומעודכנים</p>
                <p className="text-2xl font-bold text-green-300">{kpis.active}</p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-green-500" />
            </div>
            <Progress value={(kpis.active / kpis.total) * 100} className="mt-2 h-1.5" />
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-amber-900/50 to-amber-950 border-amber-800/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-amber-400">דורשים עדכון</p>
                <p className="text-2xl font-bold text-amber-300">{kpis.needUpdate}</p>
              </div>
              <Clock className="h-8 w-8 text-amber-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-red-900/50 to-red-950 border-red-800/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-red-400">דחופים</p>
                <p className="text-2xl font-bold text-red-300">{kpis.urgent}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-red-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-cyan-900/50 to-cyan-950 border-cyan-800/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-cyan-400">ציות ממוצע</p>
                <p className="text-2xl font-bold text-cyan-300">{kpis.avgCompliance}%</p>
              </div>
              <ClipboardCheck className="h-8 w-8 text-cyan-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters + Procedures Table */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <TabsList className="bg-background/50">
            <TabsTrigger value="all">כל הנהלים</TabsTrigger>
            <TabsTrigger value="active">פעילים</TabsTrigger>
            <TabsTrigger value="update">לעדכון</TabsTrigger>
            <TabsTrigger value="urgent">דחופים</TabsTrigger>
          </TabsList>
          <div className="flex gap-2">
            <div className="relative">
              <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input placeholder="חיפוש נוהל..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9 w-64 bg-background/50" />
            </div>
            <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className="bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground">
              <option value="all">כל הקטגוריות</option>
              <option value="אש">אש וחירום</option>
              <option value="חשמל">חשמל</option>
              <option value="כימי">חומרים כימיים</option>
              <option value="גובה">עבודה בגובה</option>
              <option value="מכונות">מכונות</option>
              <option value="PPE">ציוד מגן</option>
            </select>
          </div>
        </div>

        <TabsContent value={activeTab} className="mt-4">
          <Card className="bg-card/50 border-border/50">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50 bg-muted/30">
                      <th className="text-right p-3 text-muted-foreground font-medium">מס׳</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">נוהל</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">קטגוריה</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">מחלקה</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">גרסה</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">סקירה אחרונה</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">סקירה הבאה</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">ציות</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">הוכשרו</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">סטטוס</th>
                      <th className="text-center p-3 text-muted-foreground font-medium w-24">פעולות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered
                      .filter(r => {
                        if (activeTab === "active") return r.status === "פעיל";
                        if (activeTab === "update") return r.status.includes("לעדכון");
                        if (activeTab === "urgent") return r.status === "דחוף - לעדכון";
                        return true;
                      })
                      .map((row) => (
                      <tr key={row.id} className="border-b border-border/30 hover:bg-muted/20 transition-colors">
                        <td className="p-3 text-foreground font-mono text-xs">{row.id}</td>
                        <td className="p-3">
                          <p className="text-foreground font-medium">{row.name}</p>
                          <p className="text-xs text-muted-foreground">אחראי: {row.responsible}</p>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-1.5">
                            {categoryIcons[row.category]}
                            <span className="text-foreground text-xs">{row.category}</span>
                          </div>
                        </td>
                        <td className="p-3 text-muted-foreground text-xs">{row.dept}</td>
                        <td className="p-3 text-foreground font-mono">{row.version}</td>
                        <td className="p-3 text-muted-foreground">{row.lastReview}</td>
                        <td className="p-3 text-muted-foreground">{row.nextReview}</td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <Progress value={row.compliance} className="h-2 w-16" />
                            <span className={`text-xs font-bold ${row.compliance >= 95 ? "text-green-400" : row.compliance >= 85 ? "text-amber-400" : "text-red-400"}`}>
                              {row.compliance}%
                            </span>
                          </div>
                        </td>
                        <td className="p-3 text-muted-foreground text-xs">{row.trained}/{row.totalStaff}</td>
                        <td className="p-3">
                          <Badge className={statusColors[row.status] || "bg-gray-500/20 text-gray-300"}>{row.status}</Badge>
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button variant="ghost" size="sm" title="צפייה"><Eye className="w-3.5 h-3.5" /></Button>
                            <Button variant="ghost" size="sm" title="עריכה"><Edit2 className="w-3.5 h-3.5" /></Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Compliance by Category */}
      <Card className="bg-card/50 border-border/50">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <ClipboardCheck className="w-4 h-4 text-cyan-400" />
            ציות לפי קטגוריה
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {Object.entries(categoryIcons).map(([cat, icon]) => {
              const catProcs = procedures.filter(p => p.category === cat);
              if (catProcs.length === 0) return null;
              const avg = Math.round(catProcs.reduce((s, p) => s + p.compliance, 0) / catProcs.length);
              return (
                <div key={cat} className="p-3 rounded-lg bg-muted/20 border border-border/30 text-center">
                  <div className="flex justify-center mb-2">{icon}</div>
                  <p className="text-xs text-muted-foreground mb-1">{cat}</p>
                  <p className={`text-lg font-bold ${avg >= 95 ? "text-green-400" : avg >= 85 ? "text-amber-400" : "text-red-400"}`}>{avg}%</p>
                  <Progress value={avg} className="h-1.5 mt-1" />
                  <p className="text-xs text-muted-foreground mt-1">{catProcs.length} נהלים</p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
