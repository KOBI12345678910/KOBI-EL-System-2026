import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Brain, Sparkles, AlertTriangle, CheckCircle2, XCircle,
  Clock, Zap, Shield, Search, ThumbsUp, ThumbsDown,
  BarChart3, Activity, Bot, TrendingUp, AlertCircle,
  ListChecks, Filter, RefreshCw, Play, Eye
} from "lucide-react";

interface Recommendation {
  id: number;
  agentSource: string;
  severity: "critical" | "high" | "medium" | "low";
  type: string;
  text: string;
  ownerRole: string;
  urgency: string;
  approvalRequired: boolean;
  approvalStatus: "pending" | "approved" | "rejected" | "auto";
  executionStatus: "waiting" | "in-progress" | "completed" | "failed" | "skipped";
  createdAt: string;
  result?: string;
}

const SEVERITY_CONFIG: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  critical: { label: "קריטי", color: "text-red-400", bg: "bg-red-500/15 border-red-500/30", icon: XCircle },
  high: { label: "גבוה", color: "text-orange-400", bg: "bg-orange-500/15 border-orange-500/30", icon: AlertTriangle },
  medium: { label: "בינוני", color: "text-amber-400", bg: "bg-amber-500/15 border-amber-500/30", icon: AlertCircle },
  low: { label: "נמוך", color: "text-blue-400", bg: "bg-blue-500/15 border-blue-500/30", icon: Activity },
};

const APPROVAL_CONFIG: Record<string, { label: string; color: string }> = {
  pending: { label: "ממתין", color: "bg-amber-500/20 text-amber-300 border-amber-500/30" },
  approved: { label: "מאושר", color: "bg-green-500/20 text-green-300 border-green-500/30" },
  rejected: { label: "נדחה", color: "bg-red-500/20 text-red-300 border-red-500/30" },
  auto: { label: "אוטומטי", color: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30" },
};

const EXEC_CONFIG: Record<string, { label: string; color: string }> = {
  waiting: { label: "ממתין", color: "text-slate-400" },
  "in-progress": { label: "בביצוע", color: "text-blue-400" },
  completed: { label: "הושלם", color: "text-green-400" },
  failed: { label: "נכשל", color: "text-red-400" },
  skipped: { label: "דולג", color: "text-slate-500" },
};

const MOCK_DATA: Recommendation[] = [
  { id: 1, agentSource: "סוכן מלאי", severity: "critical", type: "מלאי", text: "מלאי חומר גלם #A205 מתחת לרמת מינימום - יש להזמין מיידית", ownerRole: "מנהל מלאי", urgency: "מיידי", approvalRequired: true, approvalStatus: "pending", executionStatus: "waiting", createdAt: "2026-04-08 09:15" },
  { id: 2, agentSource: "סוכן מכירות", severity: "high", type: "מכירות", text: "הזדמנות Cross-sell ללקוח אלקטרו-טק בע\"מ - פוטנציאל ₪85,000", ownerRole: "מנהל מכירות", urgency: "תוך 24 שעות", approvalRequired: true, approvalStatus: "approved", executionStatus: "completed", createdAt: "2026-04-07 14:30", result: "נשלחה הצעת מחיר, לקוח אישר פגישה" },
  { id: 3, agentSource: "סוכן ייצור", severity: "critical", type: "ייצור", text: "קו ייצור 3 - ירידה של 18% ביעילות OEE, נדרשת תחזוקה מונעת", ownerRole: "מנהל ייצור", urgency: "מיידי", approvalRequired: true, approvalStatus: "pending", executionStatus: "waiting", createdAt: "2026-04-08 08:45" },
  { id: 4, agentSource: "סוכן פיננסי", severity: "medium", type: "פיננסים", text: "חשבונית #INV-2891 עם פער תזרים - מומלץ לעדכן תנאי תשלום", ownerRole: "מנהל כספים", urgency: "תוך 48 שעות", approvalRequired: false, approvalStatus: "auto", executionStatus: "completed", createdAt: "2026-04-07 11:00", result: "עודכנו תנאי תשלום אוטומטית" },
  { id: 5, agentSource: "סוכן איכות", severity: "high", type: "איכות", text: "מגמת עלייה בתלונות איכות על מוצר TK-500 - 12 תלונות השבוע", ownerRole: "מנהל איכות", urgency: "תוך 24 שעות", approvalRequired: true, approvalStatus: "rejected", executionStatus: "skipped", createdAt: "2026-04-06 16:20" },
  { id: 6, agentSource: "סוכן משאבי אנוש", severity: "low", type: "HR", text: "3 עובדים בתום חוזה בחודש הבא - מומלץ לפתוח דיון חידוש", ownerRole: "מנהל HR", urgency: "תוך שבוע", approvalRequired: false, approvalStatus: "auto", executionStatus: "completed", createdAt: "2026-04-05 10:00", result: "נשלחו תזכורות למנהלי מחלקות" },
  { id: 7, agentSource: "סוכן רכש", severity: "high", type: "רכש", text: "ספק מפתח מעלה מחירים ב-8% - מומלץ לנהל מו\"מ או לחפש חלופה", ownerRole: "מנהל רכש", urgency: "תוך 24 שעות", approvalRequired: true, approvalStatus: "pending", executionStatus: "waiting", createdAt: "2026-04-08 07:30" },
  { id: 8, agentSource: "סוכן מלאי", severity: "medium", type: "מלאי", text: "עודף מלאי בקטגוריית שסתומים - 45 יום מלאי מעל הנורמה", ownerRole: "מנהל מלאי", urgency: "תוך 48 שעות", approvalRequired: false, approvalStatus: "auto", executionStatus: "completed", createdAt: "2026-04-06 13:15", result: "הופחתה כמות הזמנה אוטומטית ב-30%" },
  { id: 9, agentSource: "סוכן מכירות", severity: "medium", type: "מכירות", text: "לקוח וולקן תעשיות לא הזמין 60 יום - סיכון נטישה", ownerRole: "נציג מכירות", urgency: "תוך 48 שעות", approvalRequired: true, approvalStatus: "approved", executionStatus: "in-progress", createdAt: "2026-04-07 09:00" },
  { id: 10, agentSource: "סוכן ייצור", severity: "low", type: "ייצור", text: "אופטימיזציה אפשרית - שינוי סדר הזמנות ייצור יחסוך 3 שעות", ownerRole: "מתכנן ייצור", urgency: "תוך שבוע", approvalRequired: false, approvalStatus: "auto", executionStatus: "completed", createdAt: "2026-04-05 15:45", result: "בוצע שינוי סדר אוטומטי, נחסכו 2.8 שעות" },
  { id: 11, agentSource: "סוכן פיננסי", severity: "critical", type: "פיננסים", text: "חריגה מתקציב מחלקת שיווק ב-22% - נדרש אישור חריג", ownerRole: "סמנכ\"ל כספים", urgency: "מיידי", approvalRequired: true, approvalStatus: "pending", executionStatus: "waiting", createdAt: "2026-04-08 10:00" },
  { id: 12, agentSource: "סוכן אבטחה", severity: "high", type: "אבטחה", text: "5 ניסיונות התחברות כושלים למשתמש admin@techno-kol.co.il", ownerRole: "מנהל IT", urgency: "תוך 24 שעות", approvalRequired: true, approvalStatus: "approved", executionStatus: "completed", createdAt: "2026-04-07 22:10", result: "חשבון ננעל, נשלח מייל איפוס" },
  { id: 13, agentSource: "סוכן רכש", severity: "low", type: "רכש", text: "הזדמנות לרכישת כמויות - הנחת 12% מספק טרנספורם בע\"מ", ownerRole: "מנהל רכש", urgency: "תוך שבוע", approvalRequired: true, approvalStatus: "pending", executionStatus: "waiting", createdAt: "2026-04-08 06:50" },
  { id: 14, agentSource: "סוכן איכות", severity: "medium", type: "איכות", text: "תעודת ISO עומדת לפוג בעוד 45 יום - נדרש חידוש", ownerRole: "מנהל איכות", urgency: "תוך 48 שעות", approvalRequired: false, approvalStatus: "auto", executionStatus: "in-progress", createdAt: "2026-04-06 08:30" },
  { id: 15, agentSource: "סוכן משאבי אנוש", severity: "medium", type: "HR", text: "מחלקת ייצור - שעות נוספות מעל הנורמה ב-35%, סיכון שחיקה", ownerRole: "מנהל HR", urgency: "תוך 48 שעות", approvalRequired: true, approvalStatus: "approved", executionStatus: "completed", createdAt: "2026-04-06 14:00", result: "הועברו 2 עובדים זמניים למחלקה" },
];

export default function Bash44Recommendations() {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("all");
  const [data, setData] = useState<Recommendation[]>(MOCK_DATA);

  const total = data.length;
  const pending = data.filter(r => r.approvalStatus === "pending").length;
  const approved = data.filter(r => r.approvalStatus === "approved").length;
  const rejected = data.filter(r => r.approvalStatus === "rejected").length;
  const autoExec = data.filter(r => r.approvalStatus === "auto").length;
  const critical = data.filter(r => r.severity === "critical").length;

  const filtered = data.filter(r => {
    if (search && !r.text.includes(search) && !r.agentSource.includes(search) && !r.type.includes(search)) return false;
    return true;
  });

  const pendingItems = filtered.filter(r => r.approvalStatus === "pending");
  const executedItems = filtered.filter(r => r.executionStatus === "completed");

  const handleApprove = (id: number) => {
    setData(prev => prev.map(r => r.id === id ? { ...r, approvalStatus: "approved" as const, executionStatus: "in-progress" as const } : r));
  };
  const handleReject = (id: number) => {
    setData(prev => prev.map(r => r.id === id ? { ...r, approvalStatus: "rejected" as const, executionStatus: "skipped" as const } : r));
  };

  const agentDist = data.reduce<Record<string, number>>((acc, r) => { acc[r.agentSource] = (acc[r.agentSource] || 0) + 1; return acc; }, {});
  const sevDist = { critical, high: data.filter(r => r.severity === "high").length, medium: data.filter(r => r.severity === "medium").length, low: data.filter(r => r.severity === "low").length };
  const typeDist = data.reduce<Record<string, number>>((acc, r) => { acc[r.type] = (acc[r.type] || 0) + 1; return acc; }, {});
  const approvalRate = total > 0 ? Math.round(((approved + autoExec) / total) * 100) : 0;

  const kpis = [
    { label: "סה\"כ המלצות", value: total, icon: ListChecks, color: "text-blue-400", bg: "bg-blue-500/10" },
    { label: "ממתינות לפעולה", value: pending, icon: Clock, color: "text-amber-400", bg: "bg-amber-500/10" },
    { label: "מאושרות", value: approved, icon: CheckCircle2, color: "text-green-400", bg: "bg-green-500/10" },
    { label: "נדחו", value: rejected, icon: XCircle, color: "text-red-400", bg: "bg-red-500/10" },
    { label: "בוצע אוטומטית", value: autoExec, icon: Zap, color: "text-cyan-400", bg: "bg-cyan-500/10" },
    { label: "קריטיות", value: critical, icon: AlertTriangle, color: "text-red-400", bg: "bg-red-500/10" },
  ];

  const renderRow = (r: Recommendation, showActions: boolean) => {
    const sev = SEVERITY_CONFIG[r.severity];
    const apr = APPROVAL_CONFIG[r.approvalStatus];
    const exec = EXEC_CONFIG[r.executionStatus];
    const SevIcon = sev.icon;
    return (
      <div key={r.id} className={`border rounded-lg p-4 ${r.severity === "critical" ? "border-red-500/40 bg-red-500/5" : "border-white/10 bg-white/[0.02]"} hover:bg-white/[0.04] transition-colors`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={sev.bg}>
                <SevIcon className="w-3 h-3 ml-1" />
                {sev.label}
              </Badge>
              <Badge variant="outline" className="bg-violet-500/15 text-violet-300 border-violet-500/30">
                <Bot className="w-3 h-3 ml-1" />
                {r.agentSource}
              </Badge>
              <Badge variant="outline" className="bg-slate-500/15 text-slate-300 border-slate-500/30">{r.type}</Badge>
              {r.approvalRequired && (
                <Badge variant="outline" className="bg-pink-500/15 text-pink-300 border-pink-500/30">
                  <Shield className="w-3 h-3 ml-1" />
                  דורש אישור
                </Badge>
              )}
            </div>
            <p className="text-sm text-slate-200 leading-relaxed">{r.text}</p>
            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400">
              <span>תפקיד: {r.ownerRole}</span>
              <span>דחיפות: {r.urgency}</span>
              <span>{r.createdAt}</span>
              <Badge variant="outline" className={apr.color}>{apr.label}</Badge>
              <span className={exec.color}>{exec.label}</span>
            </div>
            {r.result && (
              <div className="text-xs text-green-400/80 bg-green-500/5 border border-green-500/20 rounded px-3 py-1.5 mt-1">
                <CheckCircle2 className="w-3 h-3 inline ml-1" />
                {r.result}
              </div>
            )}
          </div>
          {showActions && r.approvalStatus === "pending" && (
            <div className="flex gap-2 shrink-0">
              <Button size="sm" variant="outline" className="border-green-500/30 text-green-400 hover:bg-green-500/10" onClick={() => handleApprove(r.id)}>
                <ThumbsUp className="w-3.5 h-3.5 ml-1" />
                אשר
              </Button>
              <Button size="sm" variant="outline" className="border-red-500/30 text-red-400 hover:bg-red-500/10" onClick={() => handleReject(r.id)}>
                <ThumbsDown className="w-3.5 h-3.5 ml-1" />
                דחה
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Brain className="w-7 h-7 text-violet-400" />
            ניהול המלצות AI - טכנו-כל עוזי
          </h1>
          <p className="text-slate-400 text-sm mt-1">המלצות חכמות מסוכני AI | אישור, דחייה וביצוע אוטומטי</p>
        </div>
        <Button variant="outline" className="border-white/10 text-slate-300 hover:bg-white/5">
          <RefreshCw className="w-4 h-4 ml-2" />
          רענון
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <Card key={i} className="bg-white/[0.03] border-white/10">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className={`p-2 rounded-lg ${kpi.bg}`}>
                    <Icon className={`w-4 h-4 ${kpi.color}`} />
                  </div>
                  <span className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</span>
                </div>
                <p className="text-xs text-slate-400">{kpi.label}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          placeholder="חיפוש המלצות..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pr-10 bg-white/[0.03] border-white/10 text-white placeholder:text-slate-500"
        />
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-white/[0.05] border border-white/10">
          <TabsTrigger value="all" className="data-[state=active]:bg-violet-600/30 data-[state=active]:text-violet-300">
            <ListChecks className="w-4 h-4 ml-1" />
            כל ההמלצות ({filtered.length})
          </TabsTrigger>
          <TabsTrigger value="pending" className="data-[state=active]:bg-amber-600/30 data-[state=active]:text-amber-300">
            <Clock className="w-4 h-4 ml-1" />
            ממתינות לאישור ({pendingItems.length})
          </TabsTrigger>
          <TabsTrigger value="executed" className="data-[state=active]:bg-green-600/30 data-[state=active]:text-green-300">
            <CheckCircle2 className="w-4 h-4 ml-1" />
            בוצעו ({executedItems.length})
          </TabsTrigger>
          <TabsTrigger value="analytics" className="data-[state=active]:bg-blue-600/30 data-[state=active]:text-blue-300">
            <BarChart3 className="w-4 h-4 ml-1" />
            אנליטיקה
          </TabsTrigger>
        </TabsList>

        {/* All Recommendations */}
        <TabsContent value="all" className="space-y-3 mt-4">
          {filtered.length === 0 ? (
            <Card className="bg-white/[0.03] border-white/10">
              <CardContent className="p-8 text-center text-slate-400">
                <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-50" />
                לא נמצאו המלצות
              </CardContent>
            </Card>
          ) : (
            filtered.map(r => renderRow(r, true))
          )}
        </TabsContent>

        {/* Pending Approval */}
        <TabsContent value="pending" className="space-y-3 mt-4">
          {pendingItems.length === 0 ? (
            <Card className="bg-white/[0.03] border-white/10">
              <CardContent className="p-8 text-center text-slate-400">
                <CheckCircle2 className="w-8 h-8 mx-auto mb-2 opacity-50" />
                אין המלצות ממתינות לאישור
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-amber-300 text-sm flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                {pendingItems.length} המלצות דורשות החלטה אנושית - אשר או דחה כל המלצה
              </div>
              {pendingItems.map(r => renderRow(r, true))}
            </>
          )}
        </TabsContent>

        {/* Executed */}
        <TabsContent value="executed" className="space-y-3 mt-4">
          {executedItems.length === 0 ? (
            <Card className="bg-white/[0.03] border-white/10">
              <CardContent className="p-8 text-center text-slate-400">
                <Play className="w-8 h-8 mx-auto mb-2 opacity-50" />
                אין המלצות שבוצעו
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3 text-green-300 text-sm flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                {executedItems.length} המלצות בוצעו בהצלחה עם תוצאות
              </div>
              {executedItems.map(r => renderRow(r, false))}
            </>
          )}
        </TabsContent>

        {/* Analytics */}
        <TabsContent value="analytics" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* By Agent */}
            <Card className="bg-white/[0.03] border-white/10">
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-white flex items-center gap-2">
                  <Bot className="w-4 h-4 text-violet-400" />
                  התפלגות לפי סוכן
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {Object.entries(agentDist).sort((a, b) => b[1] - a[1]).map(([agent, count]) => (
                  <div key={agent} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-300">{agent}</span>
                      <span className="text-violet-400 font-medium">{count}</span>
                    </div>
                    <Progress value={(count / total) * 100} className="h-2 bg-white/5 [&>div]:bg-violet-500" />
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* By Severity */}
            <Card className="bg-white/[0.03] border-white/10">
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-white flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-orange-400" />
                  התפלגות לפי חומרה
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {(["critical", "high", "medium", "low"] as const).map(sev => {
                  const conf = SEVERITY_CONFIG[sev];
                  const count = sevDist[sev];
                  const SIcon = conf.icon;
                  return (
                    <div key={sev} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className={`flex items-center gap-1 ${conf.color}`}>
                          <SIcon className="w-3.5 h-3.5" />
                          {conf.label}
                        </span>
                        <span className={`font-medium ${conf.color}`}>{count}</span>
                      </div>
                      <Progress value={(count / total) * 100} className={`h-2 bg-white/5 ${sev === "critical" ? "[&>div]:bg-red-500" : sev === "high" ? "[&>div]:bg-orange-500" : sev === "medium" ? "[&>div]:bg-amber-500" : "[&>div]:bg-blue-500"}`} />
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {/* By Type */}
            <Card className="bg-white/[0.03] border-white/10">
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-white flex items-center gap-2">
                  <Filter className="w-4 h-4 text-emerald-400" />
                  התפלגות לפי סוג
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {Object.entries(typeDist).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
                  <div key={type} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-300">{type}</span>
                      <span className="text-emerald-400 font-medium">{count}</span>
                    </div>
                    <Progress value={(count / total) * 100} className="h-2 bg-white/5 [&>div]:bg-emerald-500" />
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Approval Rates */}
            <Card className="bg-white/[0.03] border-white/10">
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-white flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-blue-400" />
                  שיעורי אישור
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-center">
                  <div className="text-4xl font-bold text-blue-400">{approvalRate}%</div>
                  <p className="text-xs text-slate-400 mt-1">שיעור אישור כולל (כולל אוטומטי)</p>
                </div>
                <div className="space-y-2">
                  {(["approved", "auto", "pending", "rejected"] as const).map(status => {
                    const conf = APPROVAL_CONFIG[status];
                    const count = data.filter(r => r.approvalStatus === status).length;
                    return (
                      <div key={status} className="flex items-center justify-between text-sm">
                        <Badge variant="outline" className={conf.color}>{conf.label}</Badge>
                        <div className="flex items-center gap-2">
                          <span className="text-slate-300 font-medium">{count}</span>
                          <span className="text-slate-500 text-xs">({total > 0 ? Math.round((count / total) * 100) : 0}%)</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="border-t border-white/10 pt-3 space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>זמן ממוצע לאישור</span>
                    <span className="text-white font-medium">2.4 שעות</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>ביצוע מוצלח</span>
                    <span className="text-green-400 font-medium">{data.filter(r => r.executionStatus === "completed").length}/{total}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>כשלונות ביצוע</span>
                    <span className="text-red-400 font-medium">{data.filter(r => r.executionStatus === "failed").length}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
