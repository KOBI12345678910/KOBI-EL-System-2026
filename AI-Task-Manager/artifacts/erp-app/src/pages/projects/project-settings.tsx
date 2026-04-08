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
  Settings, Hash, ListChecks, GitBranch, Bell, Link2, ShieldCheck,
  ArrowLeftRight, CheckCircle2, AlertTriangle, Clock, Users, Save,
  ChevronLeft, FileText, Factory, Truck, Wallet, FolderOpen
} from "lucide-react";

const FALLBACK_ROLES = [
  { id: "admin", label: "מנהל מערכת" }, { id: "manager", label: "מנהל כללי" },
  { id: "estimator", label: "אומדן / הצעות מחיר" }, { id: "pm", label: "מנהל פרויקט" },
  { id: "procurement", label: "רכש" }, { id: "production", label: "ייצור" },
  { id: "installation", label: "התקנות" }, { id: "finance", label: "כספים" },
  { id: "viewer", label: "צופה בלבד" },
];
const FALLBACK_PERMISSIONS = [
  { id: "create", label: "יצירת פרויקט" }, { id: "edit", label: "עריכה" },
  { id: "delete", label: "מחיקה" }, { id: "assign", label: "הקצאת משאבים" },
  { id: "budget", label: "צפייה בתקציב" }, { id: "approve", label: "אישור שלבים" },
  { id: "docs", label: "ניהול מסמכים" },
];
const FALLBACK_DEFAULT_PERMS: Record<string, string[]> = {
  admin: ["create","edit","delete","assign","budget","approve","docs"],
  manager: ["create","edit","assign","budget","approve","docs"],
  estimator: ["create","edit","docs"], pm: ["create","edit","assign","budget","approve","docs"],
  procurement: ["edit","budget","docs"], production: ["edit","docs"],
  installation: ["edit","docs"], finance: ["budget","docs"], viewer: [],
};
const FALLBACK_SETTINGS_STAGES: { id: string; label: string; color: string }[] = [
  { id: "quote", label: "הצעת מחיר", color: "bg-blue-500/20 text-blue-400" },
  { id: "planning", label: "תכנון", color: "bg-indigo-500/20 text-indigo-400" },
  { id: "procurement", label: "רכש חומרים", color: "bg-amber-500/20 text-amber-400" },
  { id: "production", label: "ייצור", color: "bg-orange-500/20 text-orange-400" },
  { id: "quality", label: "בקרת איכות", color: "bg-cyan-500/20 text-cyan-400" },
  { id: "delivery", label: "משלוח", color: "bg-teal-500/20 text-teal-400" },
  { id: "installation", label: "התקנה", color: "bg-green-500/20 text-green-400" },
  { id: "acceptance", label: "מסירה ואישור", color: "bg-emerald-500/20 text-emerald-400" },
  { id: "billing", label: "חיוב", color: "bg-purple-500/20 text-purple-400" }];
const FALLBACK_TRANSITIONS = [
  { from: "הצעת מחיר", to: "תכנון", approval: "מנהל כללי", auto: false },
  { from: "תכנון", to: "רכש חומרים", approval: "מנהל פרויקט", auto: true },
  { from: "רכש חומרים", to: "ייצור", approval: "רכש", auto: false },
  { from: "ייצור", to: "בקרת איכות", approval: "מנהל ייצור", auto: true },
  { from: "בקרת איכות", to: "משלוח", approval: "בקרת איכות", auto: false },
  { from: "משלוח", to: "התקנה", approval: "לוגיסטיקה", auto: true },
  { from: "התקנה", to: "מסירה ואישור", approval: "מנהל התקנות", auto: false },
  { from: "מסירה ואישור", to: "חיוב", approval: "מנהל כללי", auto: false }];
const FALLBACK_SETTINGS_ALERTS = [
  { event: "פרויקט חדש נוצר", channels: ["אימייל", "מערכת"], delay: "מיידי" },
  { event: "שלב הושלם", channels: ["אימייל", "מערכת", "SMS"], delay: "מיידי" },
  { event: "חריגה מתקציב", channels: ["אימייל", "מערכת"], delay: "מיידי" },
  { event: "עיכוב בלוח זמנים", channels: ["אימייל", "SMS"], delay: "שעה" },
  { event: "אישור נדרש", channels: ["אימייל", "מערכת", "SMS"], delay: "מיידי" },
  { event: "תזכורת אבן דרך", channels: ["אימייל"], delay: "48 שעות לפני" },
  { event: "משימה לא הושלמה בזמן", channels: ["מערכת"], delay: "שעתיים" }];
const FALLBACK_INTEGRATIONS = [
  { module: "CRM", icon: Users, status: "active", synced: 1240, desc: "סנכרון לקוחות, הצעות מחיר, הזדמנויות" },
  { module: "רכש", icon: FolderOpen, status: "active", synced: 890, desc: "הזמנות רכש, ספקים, מעקב אספקה" },
  { module: "ייצור", icon: Factory, status: "active", synced: 2100, desc: "פקודות עבודה, תכניות ייצור, OEE" },
  { module: "התקנות", icon: Truck, status: "warning", synced: 340, desc: "צוותי התקנה, לוחות זמנים, דוחות שטח" },
  { module: "כספים", icon: Wallet, status: "active", synced: 4500, desc: "חשבוניות, תקציבים, דוחות רווח/הפסד" },
  { module: "מסמכים", icon: FileText, status: "active", synced: 6200, desc: "שרטוטים, מפרטים, חוזים, תמונות" }];

export default function ProjectSettingsPage() {
  const [activeTab, setActiveTab] = useState("general");

  const { data: apiSettings } = useQuery({
    queryKey: ["project-settings"],
    queryFn: async () => { const r = await authFetch("/api/projects/settings"); return r.json(); },
  });
  const roles = apiSettings?.roles ?? apiSettings?.data?.roles ?? FALLBACK_ROLES;
  const permissions = apiSettings?.permissions ?? apiSettings?.data?.permissions ?? FALLBACK_PERMISSIONS;
  const defaultPerms = apiSettings?.defaultPerms ?? apiSettings?.data?.defaultPerms ?? FALLBACK_DEFAULT_PERMS;
  const stages = apiSettings?.stages ?? apiSettings?.data?.stages ?? FALLBACK_SETTINGS_STAGES;
  const transitions = apiSettings?.transitions ?? apiSettings?.data?.transitions ?? FALLBACK_TRANSITIONS;
  const alerts = apiSettings?.alerts ?? apiSettings?.data?.alerts ?? FALLBACK_SETTINGS_ALERTS;
  const integrations = apiSettings?.integrations ?? apiSettings?.data?.integrations ?? FALLBACK_INTEGRATIONS;
  const [prefix, setPrefix] = useState("PRJ");
  const [nextNum, setNextNum] = useState("2026-0184");
  const [autoFromQuote, setAutoFromQuote] = useState(true);
  const [permMatrix, setPermMatrix] = useState<Record<string, string[]>>(defaultPerms);
  const togglePerm = (role: string, perm: string) => {
    setPermMatrix(prev => {
      const cur = prev[role] || [];
      return { ...prev, [role]: cur.includes(perm) ? cur.filter(p => p !== perm) : [...cur, perm] };
    });
  };

  return (
    <div dir="rtl" className="min-h-screen bg-background text-foreground p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
            <Settings className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">הגדרות מודול פרויקטים</h1>
            <p className="text-sm text-muted-foreground">טכנו-כל עוזי | קונפיגורציה ותצורה</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-left">
            <span className="text-xs text-muted-foreground">שלמות הגדרות</span>
            <div className="flex items-center gap-2">
              <Progress value={82} className="w-28 h-2" />
              <span className="text-sm font-semibold text-violet-400">82%</span>
            </div>
          </div>
          <Button className="bg-violet-600 hover:bg-violet-700 gap-2"><Save className="w-4 h-4" />שמור הגדרות</Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-muted/30 border border-border/50 p-1 gap-1">
          <TabsTrigger value="general" className="gap-2 data-[state=active]:bg-violet-500/20 data-[state=active]:text-violet-400"><Hash className="w-4 h-4" />כללי</TabsTrigger>
          <TabsTrigger value="roles" className="gap-2 data-[state=active]:bg-violet-500/20 data-[state=active]:text-violet-400"><ShieldCheck className="w-4 h-4" />תפקידים והרשאות</TabsTrigger>
          <TabsTrigger value="workflow" className="gap-2 data-[state=active]:bg-violet-500/20 data-[state=active]:text-violet-400"><GitBranch className="w-4 h-4" />תהליך עבודה</TabsTrigger>
          <TabsTrigger value="notifications" className="gap-2 data-[state=active]:bg-violet-500/20 data-[state=active]:text-violet-400"><Bell className="w-4 h-4" />התראות</TabsTrigger>
          <TabsTrigger value="integrations" className="gap-2 data-[state=active]:bg-violet-500/20 data-[state=active]:text-violet-400"><Link2 className="w-4 h-4" />אינטגרציות</TabsTrigger>
        </TabsList>

        {/* General Tab */}
        <TabsContent value="general" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="bg-card border-border/50">
              <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Hash className="w-4 h-4 text-violet-400" />מספור פרויקטים</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-3">
                  <div className="flex-1"><label className="text-xs text-muted-foreground">קידומת</label><Input value={prefix} onChange={e => setPrefix(e.target.value)} className="mt-1" /></div>
                  <div className="flex-1"><label className="text-xs text-muted-foreground">מספר הבא</label><Input value={nextNum} onChange={e => setNextNum(e.target.value)} className="mt-1" /></div>
                </div>
                <p className="text-xs text-muted-foreground">תצוגה מקדימה: <Badge variant="outline" className="text-violet-400">{prefix}-{nextNum}</Badge></p>
              </CardContent>
            </Card>
            <Card className="bg-card border-border/50">
              <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><ListChecks className="w-4 h-4 text-violet-400" />יצירה אוטומטית</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between bg-muted/20 p-3 rounded-lg">
                  <span className="text-sm">יצירת פרויקט אוטומטית מהצעת מחיר מאושרת</span>
                  <button onClick={() => setAutoFromQuote(!autoFromQuote)} className={`w-11 h-6 rounded-full transition-colors ${autoFromQuote ? "bg-violet-500" : "bg-muted"} relative`}>
                    <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-all ${autoFromQuote ? "right-0.5" : "right-[22px]"}`} />
                  </button>
                </div>
                <div className="text-xs text-muted-foreground">כאשר הצעת מחיר מאושרת ב-CRM, פרויקט חדש ייווצר אוטומטית עם תבנית ברירת מחדל</div>
              </CardContent>
            </Card>
          </div>
          <Card className="bg-card border-border/50">
            <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><ArrowLeftRight className="w-4 h-4 text-violet-400" />שלבי ברירת מחדל</CardTitle></CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 flex-wrap">
                {stages.map((s, i) => (
                  <div key={s.id} className="flex items-center gap-2">
                    <Badge className={`${s.color} text-xs`}>{s.label}</Badge>
                    {i < stages.length - 1 && <ChevronLeft className="w-3 h-3 text-muted-foreground" />}
                  </div>
                ))}
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {["תבנית אלומיניום סטנדרטית", "תבנית זכוכית מרובת שלבים", "תבנית שירות מהיר"].map(t => (
                  <div key={t} className="bg-muted/20 border border-border/30 rounded-lg p-2 text-xs text-center cursor-pointer hover:border-violet-500/50 transition-colors">{t}</div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Roles & Permissions Tab */}
        <TabsContent value="roles" className="mt-4">
          <Card className="bg-card border-border/50">
            <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-violet-400" />מטריצת הרשאות</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-border/50">
                    <th className="text-right p-2 text-muted-foreground font-medium">תפקיד</th>
                    {permissions.map(p => <th key={p.id} className="p-2 text-center text-muted-foreground font-medium text-xs">{p.label}</th>)}
                  </tr></thead>
                  <tbody>{roles.map(r => (
                    <tr key={r.id} className="border-b border-border/30 hover:bg-muted/10">
                      <td className="p-2 font-medium">{r.label}</td>
                      {permissions.map(p => (
                        <td key={p.id} className="p-2 text-center">
                          <button onClick={() => togglePerm(r.id, p.id)}
                            className={`w-6 h-6 rounded-md border transition-colors flex items-center justify-center ${(permMatrix[r.id] || []).includes(p.id) ? "bg-violet-500 border-violet-500 text-white" : "border-border/50 text-transparent hover:border-violet-500/50"}`}>
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      ))}
                    </tr>
                  ))}</tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground mt-3">* לחץ על תא כדי לשנות הרשאה. שינויים נשמרים עם לחיצה על &quot;שמור הגדרות&quot;.</p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Workflow Tab */}
        <TabsContent value="workflow" className="space-y-4 mt-4">
          <Card className="bg-card border-border/50">
            <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><GitBranch className="w-4 h-4 text-violet-400" />חוקי מעבר בין שלבים</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {transitions.map((t, i) => (
                <div key={i} className="flex items-center gap-3 bg-muted/10 border border-border/30 rounded-lg p-3">
                  <Badge variant="outline" className="text-xs shrink-0">{t.from}</Badge>
                  <ChevronLeft className="w-4 h-4 text-violet-400 shrink-0" />
                  <Badge variant="outline" className="text-xs shrink-0">{t.to}</Badge>
                  <div className="flex-1" />
                  <div className="flex items-center gap-2 text-xs">
                    <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                    <span className="text-muted-foreground">אישור:</span>
                    <span className="font-medium">{t.approval}</span>
                  </div>
                  <Badge className={`text-[10px] ${t.auto ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400"}`}>
                    {t.auto ? "אוטומטי" : "ידני"}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card className="bg-card border-border/50">
            <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-400" />תנאים נדרשים לאישור שלב</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                {[
                  { stage: "תכנון", cond: "שרטוט מאושר + מפרט טכני מצורף" },
                  { stage: "רכש חומרים", cond: "תקציב מאושר + רשימת חומרים סופית" },
                  { stage: "ייצור", cond: "כל החומרים במלאי / בדרך + פקודת עבודה" },
                  { stage: "בקרת איכות", cond: "דוח ייצור מלא + צ׳קליסט איכות" },
                  { stage: "התקנה", cond: "אישור לקוח + צוות התקנה מוקצה" },
                  { stage: "חיוב", cond: "פרוטוקול מסירה חתום + אישור לקוח" },
                ].map(c => (
                  <div key={c.stage} className="flex items-start gap-2 bg-muted/10 rounded-lg p-2.5">
                    <Badge variant="outline" className="text-[10px] shrink-0 mt-0.5">{c.stage}</Badge>
                    <span className="text-xs text-muted-foreground">{c.cond}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notifications Tab */}
        <TabsContent value="notifications" className="space-y-4 mt-4">
          <Card className="bg-card border-border/50">
            <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Bell className="w-4 h-4 text-violet-400" />ערוצי התראות ותזמון</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {alerts.map((n, i) => (
                <div key={i} className="flex items-center gap-3 bg-muted/10 border border-border/30 rounded-lg p-3">
                  <span className="text-sm font-medium flex-1">{n.event}</span>
                  <div className="flex gap-1.5">
                    {n.channels.map(ch => <Badge key={ch} className="text-[10px] bg-violet-500/20 text-violet-400">{ch}</Badge>)}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground min-w-[90px]">
                    <Clock className="w-3 h-3" />{n.delay}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card className="bg-card border-border/50">
            <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-400" />כללי אסקלציה</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {[
                { rule: "משימה באיחור של 24 שעות", action: "התראה למנהל פרויקט", level: "רגיל" },
                { rule: "משימה באיחור של 48 שעות", action: "התראה למנהל כללי + מנהל פרויקט", level: "גבוה" },
                { rule: "חריגת תקציב מעל 10%", action: "התראה למנהל כספים + מנהל כללי", level: "קריטי" },
                { rule: "אישור ממתין מעל 72 שעות", action: "תזכורת אוטומטית + העברה למנהל בכיר", level: "גבוה" },
              ].map((e, i) => (
                <div key={i} className="flex items-center gap-3 bg-muted/10 rounded-lg p-3">
                  <Badge className={`text-[10px] shrink-0 ${e.level === "קריטי" ? "bg-red-500/20 text-red-400" : e.level === "גבוה" ? "bg-amber-500/20 text-amber-400" : "bg-blue-500/20 text-blue-400"}`}>{e.level}</Badge>
                  <span className="font-medium flex-1">{e.rule}</span>
                  <ChevronLeft className="w-3 h-3 text-muted-foreground" />
                  <span className="text-muted-foreground text-xs">{e.action}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Integrations Tab */}
        <TabsContent value="integrations" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {integrations.map(ig => {
              const Icon = ig.icon;
              return (
                <Card key={ig.module} className="bg-card border-border/50">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-lg bg-violet-500/20 flex items-center justify-center"><Icon className="w-4 h-4 text-violet-400" /></div>
                        <span className="font-bold">{ig.module}</span>
                      </div>
                      <Badge className={`text-[10px] ${ig.status === "active" ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400"}`}>
                        {ig.status === "active" ? "פעיל" : "חלקי"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{ig.desc}</p>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{ig.synced.toLocaleString()} רשומות מסונכרנות</span>
                      <Button variant="ghost" size="sm" className="h-7 text-xs text-violet-400 hover:text-violet-300">הגדרות</Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
          <Card className="bg-card border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-sm">סטטוס סנכרון כללי</h3>
                  <p className="text-xs text-muted-foreground mt-1">סנכרון אחרון: היום, 08:42 | הבא: היום, 09:42</p>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <div className="text-center"><div className="text-lg font-bold text-emerald-400">5</div><div className="text-muted-foreground">מודולים פעילים</div></div>
                  <div className="text-center"><div className="text-lg font-bold text-amber-400">1</div><div className="text-muted-foreground">דורש בדיקה</div></div>
                  <div className="text-center"><div className="text-lg font-bold text-violet-400">15.3K</div><div className="text-muted-foreground">סה״כ רשומות</div></div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}