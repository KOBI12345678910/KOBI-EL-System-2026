import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  GraduationCap, Users, CheckCircle2, Clock, AlertTriangle,
  Search, Plus, Download, Eye, Edit2, BookOpen, Award,
  Calendar, TrendingUp, UserCheck
} from "lucide-react";

const FALLBACK_COURSES = [
  { id: "ST-001", name: "הדרכת בטיחות כללית - עובדים חדשים", trainer: "רועי כהן", type: "חובה", duration: "8 שעות", nextDate: "2026-04-15", frequency: "בקבלה", enrolled: 12, completed: 0, certified: 0, total: 12, status: "מתוכננת", certExpiry: "—" },
  { id: "ST-002", name: "עבודה בגובה - הסמכה", trainer: "עמית ברק", type: "הסמכה", duration: "16 שעות", nextDate: "2026-05-01", frequency: "שנתי", enrolled: 28, completed: 24, certified: 24, total: 28, status: "בביצוע", certExpiry: "2027-05-01" },
  { id: "ST-003", name: "כיבוי אש ופינוי חירום", trainer: "כבאי מוסמך - חיצוני", type: "חובה", duration: "4 שעות", nextDate: "2026-04-20", frequency: "שנתי", enrolled: 148, completed: 145, certified: 145, total: 148, status: "הושלמה", certExpiry: "2027-04-20" },
  { id: "ST-004", name: "הפעלת מלגזות - רישיון", trainer: "בני גולן", type: "הסמכה", duration: "24 שעות", nextDate: "2026-06-10", frequency: "3 שנים", enrolled: 18, completed: 18, certified: 16, total: 18, status: "הושלמה", certExpiry: "2029-06-10" },
  { id: "ST-005", name: "חומרים מסוכנים וכימיקלים", trainer: "דנה לוי", type: "חובה", duration: "6 שעות", nextDate: "2026-05-15", frequency: "שנתי", enrolled: 42, completed: 35, certified: 35, total: 42, status: "בביצוע", certExpiry: "2027-05-15" },
  { id: "ST-006", name: "בטיחות חשמל - דרגה 1", trainer: "אלי שמש", type: "הסמכה", duration: "12 שעות", nextDate: "2026-07-01", frequency: "שנתי", enrolled: 22, completed: 0, certified: 0, total: 22, status: "מתוכננת", certExpiry: "—" },
  { id: "ST-007", name: "עזרה ראשונה", trainer: "מד\"א - חיצוני", type: "חובה", duration: "8 שעות", nextDate: "2026-04-28", frequency: "שנתי", enrolled: 45, completed: 45, certified: 42, total: 45, status: "הושלמה", certExpiry: "2027-04-28" },
  { id: "ST-008", name: "ריתוך ובטיחות אש בעבודה חמה", trainer: "אבי מזרחי", type: "הסמכה", duration: "10 שעות", nextDate: "2026-05-20", frequency: "שנתי", enrolled: 24, completed: 18, certified: 18, total: 24, status: "בביצוע", certExpiry: "2027-05-20" },
  { id: "ST-009", name: "ארגונומיה ומניעת פציעות", trainer: "שרה אברהם", type: "מומלצת", duration: "3 שעות", nextDate: "2026-06-05", frequency: "שנתי", enrolled: 80, completed: 0, certified: 0, total: 148, status: "מתוכננת", certExpiry: "—" },
  { id: "ST-010", name: "עבודה במקומות סגורים", trainer: "עמית ברק", type: "הסמכה", duration: "12 שעות", nextDate: "2026-04-10", frequency: "שנתי", enrolled: 16, completed: 12, certified: 10, total: 16, status: "בביצוע", certExpiry: "2027-04-10" },
];

const statusColors: Record<string, string> = {
  "מתוכננת": "bg-blue-500/20 text-blue-300 border-blue-500/30",
  "בביצוע": "bg-amber-500/20 text-amber-300 border-amber-500/30",
  "הושלמה": "bg-green-500/20 text-green-300 border-green-500/30",
  "בוטלה": "bg-red-500/20 text-red-300 border-red-500/30",
};

const typeColors: Record<string, string> = {
  "חובה": "bg-red-500/20 text-red-300",
  "הסמכה": "bg-purple-500/20 text-purple-300",
  "מומלצת": "bg-cyan-500/20 text-cyan-300",
};

export default function SafetyTraining() {
  const { data: safetytrainingData } = useQuery({
    queryKey: ["safety-training"],
    queryFn: () => authFetch("/api/safety/safety_training"),
    staleTime: 5 * 60 * 1000,
  });

  const courses = safetytrainingData ?? FALLBACK_COURSES;

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [activeTab, setActiveTab] = useState("all");

  const filtered = useMemo(() => {
    return courses.filter(r => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        return r.name.toLowerCase().includes(s) || r.trainer.toLowerCase().includes(s) || r.id.toLowerCase().includes(s);
      }
      return true;
    });
  }, [search, statusFilter]);

  const kpis = useMemo(() => {
    const totalEnrolled = courses.reduce((s, c) => s + c.enrolled, 0);
    const totalCompleted = courses.reduce((s, c) => s + c.completed, 0);
    const totalCertified = courses.reduce((s, c) => s + c.certified, 0);
    return {
      totalCourses: courses.length,
      completionRate: totalEnrolled > 0 ? Math.round((totalCompleted / totalEnrolled) * 100) : 0,
      certifiedWorkers: totalCertified,
      inProgress: courses.filter(c => c.status === "בביצוע").length,
      upcoming: courses.filter(c => c.status === "מתוכננת").length,
    };
  }, []);

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <GraduationCap className="h-7 w-7 text-indigo-400" />
            הדרכות בטיחות
          </h1>
          <p className="text-sm text-muted-foreground mt-1">ניהול הדרכות, הסמכות ותעודות בטיחות | טכנו-כל עוזי</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm"><Download className="w-4 h-4 ml-1" />ייצוא</Button>
          <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700"><Plus className="w-4 h-4 ml-1" />הדרכה חדשה</Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="bg-gradient-to-br from-slate-800 to-slate-900 border-slate-700">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400">סה״כ קורסים</p>
                <p className="text-2xl font-bold text-white">{kpis.totalCourses}</p>
              </div>
              <BookOpen className="h-8 w-8 text-slate-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-green-900/50 to-green-950 border-green-800/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-green-400">שיעור השלמה</p>
                <p className="text-2xl font-bold text-green-300">{kpis.completionRate}%</p>
              </div>
              <TrendingUp className="h-8 w-8 text-green-500" />
            </div>
            <Progress value={kpis.completionRate} className="mt-2 h-1.5" />
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-purple-900/50 to-purple-950 border-purple-800/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-purple-400">עובדים מוסמכים</p>
                <p className="text-2xl font-bold text-purple-300">{kpis.certifiedWorkers}</p>
              </div>
              <Award className="h-8 w-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-amber-900/50 to-amber-950 border-amber-800/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-amber-400">בביצוע כעת</p>
                <p className="text-2xl font-bold text-amber-300">{kpis.inProgress}</p>
              </div>
              <Clock className="h-8 w-8 text-amber-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-blue-900/50 to-blue-950 border-blue-800/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-blue-400">מתוכננות</p>
                <p className="text-2xl font-bold text-blue-300">{kpis.upcoming}</p>
              </div>
              <Calendar className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs + Table */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <TabsList className="bg-background/50">
            <TabsTrigger value="all">הכל ({kpis.totalCourses})</TabsTrigger>
            <TabsTrigger value="active">בביצוע ({kpis.inProgress})</TabsTrigger>
            <TabsTrigger value="planned">מתוכננות ({kpis.upcoming})</TabsTrigger>
            <TabsTrigger value="done">הושלמו</TabsTrigger>
          </TabsList>
          <div className="flex gap-2">
            <div className="relative">
              <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input placeholder="חיפוש הדרכה..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9 w-64 bg-background/50" />
            </div>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground">
              <option value="all">כל הסטטוסים</option>
              <option value="מתוכננת">מתוכננת</option>
              <option value="בביצוע">בביצוע</option>
              <option value="הושלמה">הושלמה</option>
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
                      <th className="text-right p-3 text-muted-foreground font-medium">שם ההדרכה</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">מדריך</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">סוג</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">משך</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">תאריך הבא</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">תדירות</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">השלמה</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">הוסמכו</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">סטטוס</th>
                      <th className="text-center p-3 text-muted-foreground font-medium w-24">פעולות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered
                      .filter(r => {
                        if (activeTab === "active") return r.status === "בביצוע";
                        if (activeTab === "planned") return r.status === "מתוכננת";
                        if (activeTab === "done") return r.status === "הושלמה";
                        return true;
                      })
                      .map((row) => {
                        const completionPct = row.enrolled > 0 ? Math.round((row.completed / row.enrolled) * 100) : 0;
                        return (
                          <tr key={row.id} className="border-b border-border/30 hover:bg-muted/20 transition-colors">
                            <td className="p-3 text-foreground font-mono text-xs">{row.id}</td>
                            <td className="p-3 text-foreground font-medium max-w-[220px]">{row.name}</td>
                            <td className="p-3 text-muted-foreground">
                              <div className="flex items-center gap-1">
                                <UserCheck className="w-3.5 h-3.5" />
                                {row.trainer}
                              </div>
                            </td>
                            <td className="p-3"><Badge className={typeColors[row.type] || ""}>{row.type}</Badge></td>
                            <td className="p-3 text-muted-foreground">{row.duration}</td>
                            <td className="p-3 text-muted-foreground">{row.nextDate}</td>
                            <td className="p-3 text-muted-foreground text-xs">{row.frequency}</td>
                            <td className="p-3">
                              <div className="flex items-center gap-2">
                                <Progress value={completionPct} className="h-2 w-16" />
                                <span className="text-xs text-muted-foreground">{row.completed}/{row.enrolled}</span>
                              </div>
                            </td>
                            <td className="p-3">
                              <div className="flex items-center gap-1">
                                <Award className="w-3.5 h-3.5 text-purple-400" />
                                <span className="text-foreground">{row.certified}</span>
                              </div>
                            </td>
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
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Certification Expiry Alerts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-card/50 border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Award className="w-4 h-4 text-purple-400" />
              סטטוס הסמכות לפי קורס
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {courses.filter(c => c.certified > 0).map(c => (
              <div key={c.id} className="flex items-center justify-between p-2 rounded bg-muted/20">
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">{c.name}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Progress value={(c.certified / c.enrolled) * 100} className="h-1.5 flex-1" />
                    <span className="text-xs text-muted-foreground">{c.certified}/{c.enrolled}</span>
                  </div>
                </div>
                <Badge variant="outline" className="mr-2 text-xs">{c.certExpiry}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Calendar className="w-4 h-4 text-blue-400" />
              הדרכות קרובות
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {courses
              .filter(c => c.status === "מתוכננת" || c.status === "בביצוע")
              .sort((a, b) => a.nextDate.localeCompare(b.nextDate))
              .map(c => (
                <div key={c.id} className="flex items-center justify-between p-2 rounded bg-muted/20">
                  <div>
                    <p className="text-sm font-medium text-foreground">{c.name}</p>
                    <p className="text-xs text-muted-foreground">מדריך: {c.trainer} | {c.duration}</p>
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-medium text-foreground">{c.nextDate}</p>
                    <p className="text-xs text-muted-foreground">{c.enrolled} משתתפים</p>
                  </div>
                </div>
              ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
