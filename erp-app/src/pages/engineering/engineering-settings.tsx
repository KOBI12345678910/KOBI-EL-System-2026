import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Settings, Hash, Ruler, ShieldCheck, Users, Monitor, FileType,
  Image, BookOpen, ClipboardCheck, CalendarClock, Bell, Megaphone,
  Timer, Link2, Factory, ShoppingCart, CheckCircle2, FolderArchive,
  Save, ToggleRight,
} from "lucide-react";

/* ── sub-modules: engineering_settings, cad_integration,
   standards_library, notification_rules, system_integrations ── */

const FALLBACK_NUMBERINGSCHEMES = [
  { label: "תבנית מספור שרטוטים", value: "DWG-{PROJECT}-{SEQ:4}", desc: "קידומת פרויקט + מספר רץ 4 ספרות" },
  { label: "סכמת רוויזיות", value: "A → B → C → …", desc: "אותיות לטיניות עוקבות, P1/P2 לטיוטה" },
  { label: "יחידות ברירת מחדל", value: "מילימטרים (mm)", desc: "כל השרטוטים והמפרטים ב-mm" },
];
const FALLBACK_TOLERANCECLASSES = [
  { name: "מתכת (אלומיניום)", standard: "±0.5 mm", fine: "±0.2 mm", ultra: "±0.1 mm" },
  { name: "זכוכית", standard: "±1.0 mm", fine: "±0.5 mm", ultra: "±0.3 mm" },
  { name: "פרזול והרכבה", standard: "±0.3 mm", fine: "±0.15 mm", ultra: "±0.05 mm" },
];
const FALLBACK_APPROVALCHAIN = [
  { step: 1, role: "מהנדס מתכנן", sla: "2 שעות" },
  { step: 2, role: "ראש צוות הנדסה", sla: "4 שעות" },
  { step: 3, role: "מנהל הנדסה", sla: "8 שעות" },
  { step: 4, role: "מנהל איכות (אם נדרש)", sla: "12 שעות" },
];
const FALLBACK_CADSOFTWARE = [
  { name: "SolidWorks 2026", status: "מחובר", version: "SP3.1", license: "פעילה" },
  { name: "AutoCAD LT 2026", status: "מחובר", version: "2026.1", license: "פעילה" },
  { name: "Inventor Professional", status: "לא פעיל", version: "—", license: "ממתין" },
];
const FALLBACK_FILEFORMATS = [
  { format: "DWG", use: "שרטוטי ייצור", auto: true },
  { format: "DXF", use: "חיתוך CNC", auto: true },
  { format: "STEP", use: "חילופי תלת-ממד", auto: false },
  { format: "PDF", use: "אישורי לקוח", auto: true },
  { format: "IFC", use: "BIM שיתוף", auto: false },
];
const FALLBACK_STANDARDSLIBRARY = [
  { code: "ISO 2768-1", name: "סובלנויות כלליות — ממדים ליניאריים", pct: 100 },
  { code: "EN 14351-1", name: "חלונות ודלתות — תקן מוצר", pct: 95 },
  { code: "ת\"י 23", name: "אלומיניום — פרופילים לבנייה", pct: 100 },
  { code: "EN 13830", name: "קירות מסך — תקן מוצר", pct: 88 },
  { code: "ISO 9001", name: "ניהול איכות — דרישות", pct: 92 },
];
const FALLBACK_ALERTCHANNELS = [
  { channel: "דוא\"ל", on: true, targets: "כל צוות ההנדסה" },
  { channel: "SMS דחוף", on: true, targets: "מנהלי צוותים בלבד" },
  { channel: "הודעת מערכת", on: true, targets: "כל המשתמשים" },
  { channel: "Webhook חיצוני", on: false, targets: "—" },
];
const FALLBACK_ESCALATIONRULES = [
  { trigger: "שרטוט לא אושר תוך 24 שעות", action: "אסקלציה לראש צוות", p: "גבוהה" },
  { trigger: "ECO פתוח מעל 48 שעות", action: "התראה למנהל הנדסה", p: "בינונית" },
  { trigger: "כשל בדיקת תקן", action: "חסימת שחרור + התראה לאיכות", p: "קריטית" },
  { trigger: "תזכורת ביקורת רוויזיה", action: "תזכורת יומית למהנדס", p: "רגילה" },
];
const FALLBACK_SYSTEMS = [
  { system: "ייצור", status: "מחובר", sync: "דו-כיווני", last: "08/04/2026 09:15", hp: 98, icon: Factory, clr: "text-orange-600" },
  { system: "רכש", status: "מחובר", sync: "חד-כיווני", last: "08/04/2026 08:50", hp: 95, icon: ShoppingCart, clr: "text-purple-600" },
  { system: "איכות", status: "מחובר", sync: "דו-כיווני", last: "08/04/2026 09:10", hp: 100, icon: ShieldCheck, clr: "text-green-600" },
  { system: "ניהול מסמכים (DMS)", status: "מחובר", sync: "דו-כיווני", last: "08/04/2026 09:00", hp: 92, icon: FolderArchive, clr: "text-blue-600" },
  { system: "תמחור", status: "חלקי", sync: "חד-כיווני", last: "07/04/2026 23:00", hp: 78, icon: Hash, clr: "text-amber-600" },
];

export default function EngineeringSettingsPage() {
  const { data: apinumberingSchemes } = useQuery({
    queryKey: ["/api/engineering/engineering-settings/numberingschemes"],
    queryFn: () => authFetch("/api/engineering/engineering-settings/numberingschemes").then(r => r.json()).catch(() => null),
  });
  const numberingSchemes = Array.isArray(apinumberingSchemes) ? apinumberingSchemes : (apinumberingSchemes?.data ?? apinumberingSchemes?.items ?? FALLBACK_NUMBERINGSCHEMES);


  const { data: apitoleranceClasses } = useQuery({
    queryKey: ["/api/engineering/engineering-settings/toleranceclasses"],
    queryFn: () => authFetch("/api/engineering/engineering-settings/toleranceclasses").then(r => r.json()).catch(() => null),
  });
  const toleranceClasses = Array.isArray(apitoleranceClasses) ? apitoleranceClasses : (apitoleranceClasses?.data ?? apitoleranceClasses?.items ?? FALLBACK_TOLERANCECLASSES);


  const { data: apiapprovalChain } = useQuery({
    queryKey: ["/api/engineering/engineering-settings/approvalchain"],
    queryFn: () => authFetch("/api/engineering/engineering-settings/approvalchain").then(r => r.json()).catch(() => null),
  });
  const approvalChain = Array.isArray(apiapprovalChain) ? apiapprovalChain : (apiapprovalChain?.data ?? apiapprovalChain?.items ?? FALLBACK_APPROVALCHAIN);


  const { data: apicadSoftware } = useQuery({
    queryKey: ["/api/engineering/engineering-settings/cadsoftware"],
    queryFn: () => authFetch("/api/engineering/engineering-settings/cadsoftware").then(r => r.json()).catch(() => null),
  });
  const cadSoftware = Array.isArray(apicadSoftware) ? apicadSoftware : (apicadSoftware?.data ?? apicadSoftware?.items ?? FALLBACK_CADSOFTWARE);


  const { data: apifileFormats } = useQuery({
    queryKey: ["/api/engineering/engineering-settings/fileformats"],
    queryFn: () => authFetch("/api/engineering/engineering-settings/fileformats").then(r => r.json()).catch(() => null),
  });
  const fileFormats = Array.isArray(apifileFormats) ? apifileFormats : (apifileFormats?.data ?? apifileFormats?.items ?? FALLBACK_FILEFORMATS);


  const { data: apistandardsLibrary } = useQuery({
    queryKey: ["/api/engineering/engineering-settings/standardslibrary"],
    queryFn: () => authFetch("/api/engineering/engineering-settings/standardslibrary").then(r => r.json()).catch(() => null),
  });
  const standardsLibrary = Array.isArray(apistandardsLibrary) ? apistandardsLibrary : (apistandardsLibrary?.data ?? apistandardsLibrary?.items ?? FALLBACK_STANDARDSLIBRARY);


  const { data: apialertChannels } = useQuery({
    queryKey: ["/api/engineering/engineering-settings/alertchannels"],
    queryFn: () => authFetch("/api/engineering/engineering-settings/alertchannels").then(r => r.json()).catch(() => null),
  });
  const alertChannels = Array.isArray(apialertChannels) ? apialertChannels : (apialertChannels?.data ?? apialertChannels?.items ?? FALLBACK_ALERTCHANNELS);


  const { data: apiescalationRules } = useQuery({
    queryKey: ["/api/engineering/engineering-settings/escalationrules"],
    queryFn: () => authFetch("/api/engineering/engineering-settings/escalationrules").then(r => r.json()).catch(() => null),
  });
  const escalationRules = Array.isArray(apiescalationRules) ? apiescalationRules : (apiescalationRules?.data ?? apiescalationRules?.items ?? FALLBACK_ESCALATIONRULES);


  const { data: apisystems } = useQuery({
    queryKey: ["/api/engineering/engineering-settings/systems"],
    queryFn: () => authFetch("/api/engineering/engineering-settings/systems").then(r => r.json()).catch(() => null),
  });
  const systems = Array.isArray(apisystems) ? apisystems : (apisystems?.data ?? apisystems?.items ?? FALLBACK_SYSTEMS);

  const [tab, setTab] = useState("general");

  return (
    <div dir="rtl" className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Settings className="h-7 w-7 text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold">הגדרות מחלקת הנדסה</h1>
            <p className="text-muted-foreground text-sm">ניהול תצורה, תקנים, התראות וחיבורי מערכות — טכנו-כל עוזי</p>
          </div>
        </div>
        <Button className="gap-2"><Save className="h-4 w-4" />שמור שינויים</Button>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid grid-cols-5 w-full">
          <TabsTrigger value="general" className="gap-1"><Hash className="h-4 w-4" />כללי</TabsTrigger>
          <TabsTrigger value="cad" className="gap-1"><Monitor className="h-4 w-4" />אינטגרציית CAD</TabsTrigger>
          <TabsTrigger value="standards" className="gap-1"><BookOpen className="h-4 w-4" />תקנים</TabsTrigger>
          <TabsTrigger value="notifications" className="gap-1"><Bell className="h-4 w-4" />התראות</TabsTrigger>
          <TabsTrigger value="integrations" className="gap-1"><Link2 className="h-4 w-4" />חיבורים</TabsTrigger>
        </TabsList>

        {/* ───── General ───── */}
        <TabsContent value="general" className="space-y-4 mt-4">
          <Card><CardContent className="p-5 space-y-4">
            <h2 className="font-semibold text-lg flex items-center gap-2"><Hash className="h-5 w-5" />מספור ותבניות</h2>
            {numberingSchemes.map((s, i) => (
              <div key={i} className="flex items-center justify-between border rounded-lg p-3">
                <div><p className="font-medium">{s.label}</p><p className="text-xs text-muted-foreground">{s.desc}</p></div>
                <Input className="w-64 text-left font-mono text-sm" defaultValue={s.value} dir="ltr" />
              </div>
            ))}
          </CardContent></Card>

          <Card><CardContent className="p-5">
            <h2 className="font-semibold text-lg flex items-center gap-2 mb-3"><Ruler className="h-5 w-5" />טבלת סובלנויות</h2>
            <table className="w-full text-sm">
              <thead><tr className="border-b text-muted-foreground">
                <th className="text-right p-2">חומר</th><th className="p-2">Standard</th><th className="p-2">Fine</th><th className="p-2">Ultra</th>
              </tr></thead>
              <tbody>{toleranceClasses.map((t, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="p-2 font-medium">{t.name}</td>
                  <td className="p-2 text-center">{t.standard}</td>
                  <td className="p-2 text-center">{t.fine}</td>
                  <td className="p-2 text-center">{t.ultra}</td>
                </tr>
              ))}</tbody>
            </table>
          </CardContent></Card>

          <Card><CardContent className="p-5">
            <h2 className="font-semibold text-lg flex items-center gap-2 mb-3"><Users className="h-5 w-5" />שרשרת אישורים</h2>
            <div className="space-y-2">{approvalChain.map((a) => (
              <div key={a.step} className="flex items-center gap-3 border rounded-lg p-3">
                <Badge variant="outline" className="w-8 justify-center">{a.step}</Badge>
                <span className="font-medium flex-1">{a.role}</span>
                <span className="text-xs text-muted-foreground">SLA: {a.sla}</span>
              </div>
            ))}</div>
          </CardContent></Card>
        </TabsContent>

        {/* ───── CAD Integration ───── */}
        <TabsContent value="cad" className="space-y-4 mt-4">
          <Card><CardContent className="p-5">
            <h2 className="font-semibold text-lg flex items-center gap-2 mb-3"><Monitor className="h-5 w-5" />תוכנות CAD מחוברות</h2>
            <div className="space-y-2">{cadSoftware.map((c, i) => (
              <div key={i} className="flex items-center justify-between border rounded-lg p-3">
                <div className="flex items-center gap-3">
                  <Badge variant={c.status === "מחובר" ? "default" : "secondary"}>{c.status}</Badge>
                  <span className="font-medium">{c.name}</span>
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span>גרסה: {c.version}</span>
                  <Badge variant={c.license === "פעילה" ? "default" : "outline"}>{c.license}</Badge>
                </div>
              </div>
            ))}</div>
          </CardContent></Card>

          <Card><CardContent className="p-5">
            <h2 className="font-semibold text-lg flex items-center gap-2 mb-3"><FileType className="h-5 w-5" />פורמטי קבצים וייצוא</h2>
            <table className="w-full text-sm">
              <thead><tr className="border-b text-muted-foreground">
                <th className="text-right p-2">פורמט</th><th className="text-right p-2">שימוש</th><th className="p-2">ייצוא אוטומטי</th>
              </tr></thead>
              <tbody>{fileFormats.map((f, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="p-2 font-mono font-bold">{f.format}</td>
                  <td className="p-2">{f.use}</td>
                  <td className="p-2 text-center"><Badge variant={f.auto ? "default" : "outline"}>{f.auto ? "פעיל" : "כבוי"}</Badge></td>
                </tr>
              ))}</tbody>
            </table>
          </CardContent></Card>

          <Card><CardContent className="p-5">
            <h2 className="font-semibold text-lg flex items-center gap-2 mb-3"><Image className="h-5 w-5" />רינדור ותצוגה מקדימה</h2>
            <div className="grid grid-cols-3 gap-3">
              {[{ label: "רזולוציית תצוגה", value: "1920×1080" }, { label: "איכות PDF", value: "300 DPI" }, { label: "רקע שרטוט", value: "לבן (#FFFFFF)" }].map((r, i) => (
                <div key={i} className="border rounded-lg p-3 text-center">
                  <p className="text-xs text-muted-foreground mb-1">{r.label}</p>
                  <Input className="text-center text-sm font-mono" defaultValue={r.value} dir="ltr" />
                </div>
              ))}
            </div>
          </CardContent></Card>
        </TabsContent>

        {/* ───── Standards ───── */}
        <TabsContent value="standards" className="space-y-4 mt-4">
          <Card><CardContent className="p-5">
            <h2 className="font-semibold text-lg flex items-center gap-2 mb-3"><BookOpen className="h-5 w-5" />ספריית תקנים</h2>
            <div className="space-y-3">{standardsLibrary.map((s, i) => (
              <div key={i} className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="font-mono">{s.code}</Badge>
                    <span className="font-medium">{s.name}</span>
                  </div>
                  <span className="text-sm font-semibold">{s.pct}%</span>
                </div>
                <Progress value={s.pct} className="h-2" />
              </div>
            ))}</div>
          </CardContent></Card>

          <div className="grid grid-cols-2 gap-4">
            <Card><CardContent className="p-5">
              <h2 className="font-semibold flex items-center gap-2 mb-3"><ClipboardCheck className="h-5 w-5" />דרישות תאימות</h2>
              {["בדיקת תקן לפני שחרור שרטוט", "חתימה דיגיטלית על כל רוויזיה", "תיעוד חריגות סובלנות", "אישור בטיחות לשרטוטי התקנה"].map((r, i) => (
                <div key={i} className="flex items-center gap-2 py-1.5">
                  <CheckCircle2 className="h-4 w-4 text-green-600" /><span className="text-sm">{r}</span>
                </div>
              ))}
            </CardContent></Card>
            <Card><CardContent className="p-5">
              <h2 className="font-semibold flex items-center gap-2 mb-3"><CalendarClock className="h-5 w-5" />תדירות ביקורות</h2>
              {[{ l: "ביקורת תקנים פנימית", f: "חודשי" }, { l: "ביקורת ISO חיצונית", f: "שנתי" }, { l: "סקירת סובלנויות", f: "רבעוני" }, { l: "עדכון ספריית תקנים", f: "חצי-שנתי" }].map((a, i) => (
                <div key={i} className="flex items-center justify-between py-1.5">
                  <span className="text-sm">{a.l}</span><Badge variant="secondary">{a.f}</Badge>
                </div>
              ))}
            </CardContent></Card>
          </div>
        </TabsContent>

        {/* ───── Notifications ───── */}
        <TabsContent value="notifications" className="space-y-4 mt-4">
          <Card><CardContent className="p-5">
            <h2 className="font-semibold text-lg flex items-center gap-2 mb-3"><Megaphone className="h-5 w-5" />ערוצי התראות</h2>
            <div className="space-y-2">{alertChannels.map((c, i) => (
              <div key={i} className="flex items-center justify-between border rounded-lg p-3">
                <div className="flex items-center gap-3">
                  <ToggleRight className={`h-5 w-5 ${c.on ? "text-green-600" : "text-muted-foreground"}`} />
                  <span className="font-medium">{c.channel}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground">{c.targets}</span>
                  <Badge variant={c.on ? "default" : "outline"}>{c.on ? "פעיל" : "כבוי"}</Badge>
                </div>
              </div>
            ))}</div>
          </CardContent></Card>

          <Card><CardContent className="p-5">
            <h2 className="font-semibold text-lg flex items-center gap-2 mb-3"><Timer className="h-5 w-5" />כללי אסקלציה ותזכורות</h2>
            <div className="space-y-2">{escalationRules.map((r, i) => (
              <div key={i} className="border rounded-lg p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-sm">{r.trigger}</span>
                  <Badge variant={r.p === "קריטית" ? "destructive" : r.p === "גבוהה" ? "default" : "secondary"}>{r.p}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">פעולה: {r.action}</p>
              </div>
            ))}</div>
          </CardContent></Card>
        </TabsContent>

        {/* ───── Integrations ───── */}
        <TabsContent value="integrations" className="space-y-4 mt-4">
          <Card><CardContent className="p-5">
            <h2 className="font-semibold text-lg flex items-center gap-2 mb-3"><Link2 className="h-5 w-5" />מערכות מחוברות</h2>
            <div className="space-y-3">{systems.map((s, i) => {
              const Icon = s.icon;
              return (
                <div key={i} className="border rounded-lg p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Icon className={`h-5 w-5 ${s.clr}`} />
                      <span className="font-semibold">{s.system}</span>
                      <Badge variant={s.status === "מחובר" ? "default" : "secondary"}>{s.status}</Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">סנכרון אחרון: {s.last}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-xs text-muted-foreground">כיוון: {s.sync}</span>
                    <div className="flex-1"><Progress value={s.hp} className="h-2" /></div>
                    <span className="text-xs font-semibold">{s.hp}% תקינות</span>
                  </div>
                </div>
              );
            })}</div>
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}