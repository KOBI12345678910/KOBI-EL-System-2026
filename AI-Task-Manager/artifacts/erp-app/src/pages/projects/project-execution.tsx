import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Rocket, Ruler, Factory, Truck, Wrench, ClipboardCheck, HardHat, Users,
  AlertTriangle, CheckCircle, Calendar, FileCheck, Eye, PackageCheck, Phone
} from "lucide-react";

const stages = [
  { key: "offer", label: "הצעה", color: "bg-slate-500", icon: "📋" },
  { key: "measurement", label: "מדידה", color: "bg-blue-500", icon: "📐" },
  { key: "engineering", label: "הנדסה", color: "bg-violet-500", icon: "⚙️" },
  { key: "production", label: "ייצור", color: "bg-amber-500", icon: "🏭" },
  { key: "delivery", label: "אספקה", color: "bg-cyan-500", icon: "🚚" },
  { key: "installation", label: "התקנה", color: "bg-green-500", icon: "🔧" },
  { key: "handover", label: "מסירה", color: "bg-emerald-500", icon: "✅" },
];
const projects = [
  { id: "EX-1001", name: "חלונות אלומיניום — מגדל הים חיפה", client: "גולדשטיין נדל\"ן", pm: "אורי כהן", stage: "installation", pct: 82, value: 920000, due: "2026-05-10" },
  { id: "EX-1002", name: "זכוכית חזיתית — קניון עזריאלי", client: "עזריאלי קבוצה", pm: "דנה לוי", stage: "production", pct: 55, value: 1450000, due: "2026-06-20" },
  { id: "EX-1003", name: "דלתות פלדה — בית ספר אורט", client: "משרד החינוך", pm: "יוסי מרקוביץ", stage: "engineering", pct: 30, value: 380000, due: "2026-07-01" },
  { id: "EX-1004", name: "מעקות בטיחות — שיכון נוף", client: "שיכון ובינוי", pm: "מירי אביטל", stage: "measurement", pct: 15, value: 260000, due: "2026-08-15" },
  { id: "EX-1005", name: "פרגולות מתכת — סינמה סיטי", client: "סינמה סיטי בע\"מ", pm: "אורי כהן", stage: "delivery", pct: 72, value: 185000, due: "2026-04-25" },
  { id: "EX-1006", name: "שערי חניון — מגדל רמת גן", client: "אלקטרה נדל\"ן", pm: "דנה לוי", stage: "handover", pct: 96, value: 410000, due: "2026-04-12" },
  { id: "EX-1007", name: "חלונות עץ-אלומיניום — וילה פרטית", client: "משפחת בן דוד", pm: "מירי אביטל", stage: "offer", pct: 5, value: 145000, due: "2026-09-30" },
  { id: "EX-1008", name: "קירות מסך — משרדים הרצליה", client: "אמות השקעות", pm: "יוסי מרקוביץ", stage: "production", pct: 48, value: 2100000, due: "2026-07-15" },
];
const measurements = [
  { id: "M-301", project: "EX-1004", site: "שיכון נוף, רחוב 12", date: "2026-04-10", time: "08:00", surveyor: "רמי דהן", status: "scheduled" },
  { id: "M-302", project: "EX-1007", site: "וילה בן דוד, כפר שמריהו", date: "2026-04-14", time: "10:00", surveyor: "אלי פרץ", status: "scheduled" },
  { id: "M-303", project: "EX-1001", site: "מגדל הים, חיפה", date: "2026-03-20", time: "09:00", surveyor: "רמי דהן", status: "completed" },
  { id: "M-304", project: "EX-1003", site: "אורט נתניה", date: "2026-03-25", time: "14:00", surveyor: "אלי פרץ", status: "completed" },
  { id: "M-305", project: "EX-1008", site: "משרדים הרצליה", date: "2026-04-11", time: "07:30", surveyor: "רמי דהן", status: "scheduled" },
];
const releases = [
  { id: "REL-501", project: "EX-1003", type: "engineering", desc: "שחרור שרטוטי דלתות — גרסה 2", eng: "נועם גולן", date: "2026-04-09", status: "pending" },
  { id: "REL-502", project: "EX-1008", type: "engineering", desc: "תכנית קירות מסך — בלוק A", eng: "נועם גולן", date: "2026-04-07", status: "approved" },
  { id: "REL-503", project: "EX-1002", type: "production", desc: "זכוכית מחוסמת 12 מ\"מ", eng: "שרה אבידן", date: "2026-04-06", status: "approved" },
  { id: "REL-504", project: "EX-1008", type: "production", desc: "פרופיל אלומיניום מיוחד", eng: "שרה אבידן", date: "2026-04-10", status: "pending" },
  { id: "REL-505", project: "EX-1003", type: "production", desc: "דלתות פלדה דגם A4", eng: "נועם גולן", date: "2026-04-12", status: "waiting" },
];
const installs = [
  { id: "INS-701", project: "EX-1001", loc: "מגדל הים, קומות 8-14", team: "צוות אלפא", start: "2026-04-08", end: "2026-04-18", status: "in_progress" },
  { id: "INS-702", project: "EX-1005", loc: "סינמה סיטי — חיצוני", team: "צוות בטא", start: "2026-04-20", end: "2026-04-24", status: "scheduled" },
  { id: "INS-703", project: "EX-1006", loc: "רמת גן — חניון B2-B4", team: "צוות אלפא", start: "2026-03-28", end: "2026-04-05", status: "completed" },
];
const teams = [
  { name: "צוות אלפא", leader: "חיים ביטון", members: 6, cur: "EX-1001", status: "active" },
  { name: "צוות בטא", leader: "משה דיין", members: 4, cur: "—", status: "available" },
  { name: "צוות גמא", leader: "עמוס רז", members: 5, cur: "EX-1006", status: "finishing" },
];
const snags = [
  { id: "SNG-01", project: "EX-1001", desc: "שריטה בזכוכית — חלון קומה 10", sev: "medium", team: "צוות אלפא", date: "2026-04-05", status: "open" },
  { id: "SNG-02", project: "EX-1006", desc: "שער חניון — חיישן לא מגיב", sev: "high", team: "צוות גמא", date: "2026-04-04", status: "in_progress" },
  { id: "SNG-03", project: "EX-1001", desc: "אטימות לקויה — חלון חדר שינה", sev: "high", team: "צוות אלפא", date: "2026-04-06", status: "open" },
  { id: "SNG-04", project: "EX-1006", desc: "גימור צבע לא אחיד — שער ראשי", sev: "low", team: "צוות גמא", date: "2026-04-02", status: "resolved" },
  { id: "SNG-05", project: "EX-1001", desc: "ידית חלון רופפת — קומה 12", sev: "low", team: "צוות אלפא", date: "2026-04-07", status: "open" },
];
const handovers = [
  { id: "HND-01", project: "EX-1006", client: "אלקטרה נדל\"ן", date: "2026-04-12", inspect: true, approved: false, closed: 2, total: 3, status: "pending_approval" },
  { id: "HND-02", project: "EX-1001", client: "גולדשטיין נדל\"ן", date: "2026-05-15", inspect: false, approved: false, closed: 0, total: 3, status: "not_ready" },
];
const postService = [
  { id: "SVC-01", project: "EX-1006", type: "אחריות", desc: "בדיקת שערים — 3 חודשים", next: "2026-07-12", status: "scheduled" },
  { id: "SVC-02", project: "EX-1001", type: "תחזוקה", desc: "בדיקת אטימות חלונות שנתית", next: "2026-05-20", status: "pending" },
];

/* helpers */
const stgBadge: Record<string, string> = { offer: "bg-slate-500/20 text-slate-400", measurement: "bg-blue-500/20 text-blue-400", engineering: "bg-violet-500/20 text-violet-400", production: "bg-amber-500/20 text-amber-400", delivery: "bg-cyan-500/20 text-cyan-400", installation: "bg-green-500/20 text-green-400", handover: "bg-emerald-500/20 text-emerald-400" };
const stgLabel = (s: string) => stages.find(x => x.key === s)?.label || s;
const sevBadge = (s: string) => s === "high" ? "bg-red-500/20 text-red-400" : s === "medium" ? "bg-amber-500/20 text-amber-400" : "bg-slate-500/20 text-slate-400";
const sevLabel = (s: string) => s === "high" ? "גבוהה" : s === "medium" ? "בינונית" : "נמוכה";
const relBadge = (s: string) => s === "approved" ? "bg-emerald-500/20 text-emerald-400" : s === "pending" ? "bg-amber-500/20 text-amber-400" : "bg-blue-500/20 text-blue-400";
const relLabel = (s: string) => ({ approved: "מאושר", pending: "ממתין", waiting: "ממתין לתנאי" }[s] || s);
const insBadge = (s: string) => s === "in_progress" ? "bg-green-500/20 text-green-400" : s === "completed" ? "bg-emerald-500/20 text-emerald-400" : "bg-blue-500/20 text-blue-400";
const insLabel = (s: string) => ({ in_progress: "בביצוע", scheduled: "מתוכנן", completed: "הושלם" }[s] || s);
const sngBadge = (s: string) => s === "open" ? "bg-red-500/20 text-red-400" : s === "in_progress" ? "bg-amber-500/20 text-amber-400" : "bg-emerald-500/20 text-emerald-400";
const sngLabel = (s: string) => ({ open: "פתוח", in_progress: "בטיפול", resolved: "נסגר" }[s] || s);
const fmt = (n: number) => "₪" + new Intl.NumberFormat("he-IL").format(n);
const kpis = [
  { label: "פרויקטים פעילים", value: projects.filter(p => p.stage !== "offer").length, icon: Rocket, color: "text-blue-400" },
  { label: "במדידה", value: projects.filter(p => p.stage === "measurement").length, icon: Ruler, color: "text-violet-400" },
  { label: "בייצור", value: projects.filter(p => p.stage === "production").length, icon: Factory, color: "text-amber-400" },
  { label: "מוכן לאספקה", value: projects.filter(p => p.stage === "delivery").length, icon: Truck, color: "text-cyan-400" },
  { label: "בהתקנה", value: projects.filter(p => p.stage === "installation").length, icon: HardHat, color: "text-green-400" },
  { label: "ממתין למסירה", value: projects.filter(p => p.stage === "handover").length, icon: ClipboardCheck, color: "text-emerald-400" },
];

export default function ProjectExecution() {
  const [tab, setTab] = useState("stages");
  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Rocket className="w-7 h-7 text-blue-400" /> ביצוע פרויקטים — מכירה עד מסירה
        </h1>
        <p className="text-sm text-slate-400 mt-1">טכנו-כל עוזי — מעקב שלבי פרויקט, מדידות, שחרורים, התקנה, ליקויים ומסירה</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpis.map(k => (
          <Card key={k.label} className="bg-[#1e293b] border-slate-700">
            <CardContent className="p-4 flex items-center gap-3">
              <k.icon className={`w-8 h-8 ${k.color}`} />
              <div><p className="text-2xl font-bold text-white">{k.value}</p><p className="text-xs text-slate-400">{k.label}</p></div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-[#1e293b] border border-slate-700">
          <TabsTrigger value="stages">שלבים</TabsTrigger>
          <TabsTrigger value="measurements">מדידות</TabsTrigger>
          <TabsTrigger value="releases">שחרורים</TabsTrigger>
          <TabsTrigger value="installation">התקנה</TabsTrigger>
          <TabsTrigger value="snags">ליקויים</TabsTrigger>
          <TabsTrigger value="handover">מסירה</TabsTrigger>
        </TabsList>

        {/* שלבים — project_stages pipeline */}
        <TabsContent value="stages" className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            {stages.map(st => {
              const sp = projects.filter(p => p.stage === st.key);
              return (
                <Card key={st.key} className="bg-[#1e293b] border-slate-700">
                  <CardHeader className="pb-2 pt-3 px-3">
                    <CardTitle className="text-sm font-semibold text-slate-300 flex items-center gap-1">
                      <span>{st.icon}</span> {st.label}
                      <Badge className={`${st.color} text-white text-xs mr-auto`}>{sp.length}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-3 pb-3 space-y-2">
                    {sp.length === 0 && <p className="text-xs text-slate-600 text-center">—</p>}
                    {sp.map(p => (
                      <div key={p.id} className="bg-slate-800/60 rounded p-2 space-y-1">
                        <p className="text-xs font-bold text-white truncate">{p.name}</p>
                        <p className="text-[10px] text-slate-400">{p.client}</p>
                        <Progress value={p.pct} className="h-1.5" />
                        <div className="flex justify-between text-[10px] text-slate-500"><span>{p.pct}%</span><span>{fmt(p.value)}</span></div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              );
            })}
          </div>
          <Card className="bg-[#1e293b] border-slate-700">
            <CardHeader><CardTitle className="text-white text-base">כל הפרויקטים</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow className="border-slate-700">
                  {["מס׳","פרויקט","לקוח","מנהל","שלב","התקדמות","ערך","יעד"].map(h=><TableHead key={h} className="text-slate-400">{h}</TableHead>)}
                </TableRow></TableHeader>
                <TableBody>
                  {projects.map(p => (
                    <TableRow key={p.id} className="border-slate-700/50">
                      <TableCell className="text-slate-300 font-mono text-xs">{p.id}</TableCell>
                      <TableCell className="text-white font-medium text-sm">{p.name}</TableCell>
                      <TableCell className="text-slate-300 text-sm">{p.client}</TableCell>
                      <TableCell className="text-slate-300 text-sm">{p.pm}</TableCell>
                      <TableCell><Badge className={`${stgBadge[p.stage]} text-xs`}>{stgLabel(p.stage)}</Badge></TableCell>
                      <TableCell><div className="flex items-center gap-2"><Progress value={p.pct} className="h-2 w-16"/><span className="text-xs text-slate-400">{p.pct}%</span></div></TableCell>
                      <TableCell className="text-slate-300 text-sm">{fmt(p.value)}</TableCell>
                      <TableCell className="text-slate-400 text-xs">{p.due}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* מדידות — site_visits + measurements */}
        <TabsContent value="measurements">
          <Card className="bg-[#1e293b] border-slate-700">
            <CardHeader><CardTitle className="text-white text-base flex items-center gap-2"><Ruler className="w-5 h-5 text-violet-400"/> לוח מדידות וביקורי אתר</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow className="border-slate-700">
                  {["מס׳","פרויקט","אתר","תאריך","שעה","מודד","סטטוס"].map(h=><TableHead key={h} className="text-slate-400">{h}</TableHead>)}
                </TableRow></TableHeader>
                <TableBody>
                  {measurements.map(m => (
                    <TableRow key={m.id} className="border-slate-700/50">
                      <TableCell className="text-slate-300 font-mono text-xs">{m.id}</TableCell>
                      <TableCell className="text-white text-sm">{m.project}</TableCell>
                      <TableCell className="text-slate-300 text-sm">{m.site}</TableCell>
                      <TableCell className="text-slate-300 text-sm">{m.date}</TableCell>
                      <TableCell className="text-slate-300 text-sm">{m.time}</TableCell>
                      <TableCell className="text-slate-300 text-sm">{m.surveyor}</TableCell>
                      <TableCell><Badge className={`text-xs ${m.status==="completed"?"bg-emerald-500/20 text-emerald-400":"bg-blue-500/20 text-blue-400"}`}>{m.status==="completed"?"בוצע":"מתוכנן"}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* שחרורים — engineering_release + production_release */}
        <TabsContent value="releases" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(["engineering","production"] as const).map(type => (
              <Card key={type} className="bg-[#1e293b] border-slate-700">
                <CardHeader><CardTitle className="text-white text-base flex items-center gap-2">
                  {type==="engineering"?<FileCheck className="w-5 h-5 text-violet-400"/>:<Factory className="w-5 h-5 text-amber-400"/>}
                  {type==="engineering"?"שחרורי הנדסה":"שחרורי ייצור"}
                </CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {releases.filter(r=>r.type===type).map(r=>(
                    <div key={r.id} className="bg-slate-800/60 rounded p-3 flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-white">{r.desc}</p>
                        <p className="text-xs text-slate-400">{r.project} &middot; {r.eng} &middot; {r.date}</p>
                      </div>
                      <Badge className={`${relBadge(r.status)} text-xs shrink-0`}>{relLabel(r.status)}</Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* התקנה — installation_schedule + installation_teams */}
        <TabsContent value="installation" className="space-y-4">
          <Card className="bg-[#1e293b] border-slate-700">
            <CardHeader><CardTitle className="text-white text-base flex items-center gap-2"><Calendar className="w-5 h-5 text-green-400"/> לוח זמנים התקנות</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow className="border-slate-700">
                  {["מס׳","פרויקט","מיקום","צוות","התחלה","סיום","סטטוס"].map(h=><TableHead key={h} className="text-slate-400">{h}</TableHead>)}
                </TableRow></TableHeader>
                <TableBody>
                  {installs.map(i=>(
                    <TableRow key={i.id} className="border-slate-700/50">
                      <TableCell className="text-slate-300 font-mono text-xs">{i.id}</TableCell>
                      <TableCell className="text-white text-sm">{i.project}</TableCell>
                      <TableCell className="text-slate-300 text-sm">{i.loc}</TableCell>
                      <TableCell className="text-slate-300 text-sm">{i.team}</TableCell>
                      <TableCell className="text-slate-300 text-sm">{i.start}</TableCell>
                      <TableCell className="text-slate-300 text-sm">{i.end}</TableCell>
                      <TableCell><Badge className={`${insBadge(i.status)} text-xs`}>{insLabel(i.status)}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <Card className="bg-[#1e293b] border-slate-700">
            <CardHeader><CardTitle className="text-white text-base flex items-center gap-2"><Users className="w-5 h-5 text-green-400"/> צוותי התקנה</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow className="border-slate-700">
                  {["צוות","ראש צוות","חברים","פרויקט נוכחי","סטטוס"].map(h=><TableHead key={h} className="text-slate-400">{h}</TableHead>)}
                </TableRow></TableHeader>
                <TableBody>
                  {teams.map(t=>(
                    <TableRow key={t.name} className="border-slate-700/50">
                      <TableCell className="text-white font-medium text-sm">{t.name}</TableCell>
                      <TableCell className="text-slate-300 text-sm">{t.leader}</TableCell>
                      <TableCell className="text-slate-300 text-sm">{t.members}</TableCell>
                      <TableCell className="text-slate-300 font-mono text-sm">{t.cur}</TableCell>
                      <TableCell><Badge className={`text-xs ${t.status==="active"?"bg-green-500/20 text-green-400":t.status==="available"?"bg-blue-500/20 text-blue-400":"bg-amber-500/20 text-amber-400"}`}>{t.status==="active"?"פעיל":t.status==="available"?"זמין":"מסיים"}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ליקויים — snag_list */}
        <TabsContent value="snags" className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            {[{ l:"ליקויים פתוחים",v:snags.filter(s=>s.status==="open").length,ic:AlertTriangle,c:"text-red-400" },
              { l:"בטיפול",v:snags.filter(s=>s.status==="in_progress").length,ic:Wrench,c:"text-amber-400" },
              { l:"נסגרו",v:snags.filter(s=>s.status==="resolved").length,ic:CheckCircle,c:"text-emerald-400" }].map(k=>(
              <Card key={k.l} className="bg-[#1e293b] border-slate-700">
                <CardContent className="p-4 flex items-center gap-3">
                  <k.ic className={`w-8 h-8 ${k.c}`}/>
                  <div><p className="text-2xl font-bold text-white">{k.v}</p><p className="text-xs text-slate-400">{k.l}</p></div>
                </CardContent>
              </Card>
            ))}
          </div>
          <Card className="bg-[#1e293b] border-slate-700">
            <CardHeader><CardTitle className="text-white text-base flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-red-400"/> רשימת ליקויים</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow className="border-slate-700">
                  {["מס׳","פרויקט","תיאור","חומרה","אחראי","דווח","סטטוס"].map(h=><TableHead key={h} className="text-slate-400">{h}</TableHead>)}
                </TableRow></TableHeader>
                <TableBody>
                  {snags.map(s=>(
                    <TableRow key={s.id} className="border-slate-700/50">
                      <TableCell className="text-slate-300 font-mono text-xs">{s.id}</TableCell>
                      <TableCell className="text-white text-sm">{s.project}</TableCell>
                      <TableCell className="text-slate-300 text-sm">{s.desc}</TableCell>
                      <TableCell><Badge className={`${sevBadge(s.sev)} text-xs`}>{sevLabel(s.sev)}</Badge></TableCell>
                      <TableCell className="text-slate-300 text-sm">{s.team}</TableCell>
                      <TableCell className="text-slate-400 text-xs">{s.date}</TableCell>
                      <TableCell><Badge className={`${sngBadge(s.status)} text-xs`}>{sngLabel(s.status)}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* מסירה — handover_protocol + completion_approval + post_installation_service */}
        <TabsContent value="handover" className="space-y-4">
          <Card className="bg-[#1e293b] border-slate-700">
            <CardHeader><CardTitle className="text-white text-base flex items-center gap-2"><ClipboardCheck className="w-5 h-5 text-emerald-400"/> פרוטוקול מסירה ואישור השלמה</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {handovers.map(h=>(
                <div key={h.id} className="bg-slate-800/60 rounded p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div><p className="text-sm font-bold text-white">{h.project} — {h.client}</p><p className="text-xs text-slate-400">מסירה: {h.date}</p></div>
                    <Badge className={`text-xs ${h.status==="pending_approval"?"bg-amber-500/20 text-amber-400":"bg-slate-500/20 text-slate-400"}`}>{h.status==="pending_approval"?"ממתין לאישור":"לא מוכן"}</Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-xs">
                    <div className="flex items-center gap-1"><Eye className="w-4 h-4 text-slate-400"/><span className="text-slate-400">בדיקה:</span><span className={h.inspect?"text-emerald-400":"text-red-400"}>{h.inspect?"בוצעה":"טרם"}</span></div>
                    <div className="flex items-center gap-1"><PackageCheck className="w-4 h-4 text-slate-400"/><span className="text-slate-400">אישור לקוח:</span><span className={h.approved?"text-emerald-400":"text-red-400"}>{h.approved?"מאושר":"טרם"}</span></div>
                    <div className="flex items-center gap-1"><AlertTriangle className="w-4 h-4 text-slate-400"/><span className="text-slate-400">ליקויים:</span><span className="text-white">{h.closed}/{h.total} נסגרו</span></div>
                  </div>
                  <Progress value={(h.closed/h.total)*100} className="h-1.5"/>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card className="bg-[#1e293b] border-slate-700">
            <CardHeader><CardTitle className="text-white text-base flex items-center gap-2"><Phone className="w-5 h-5 text-blue-400"/> שירות לאחר התקנה</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow className="border-slate-700">
                  {["מס׳","פרויקט","סוג","תיאור","תאריך הבא","סטטוס"].map(h=><TableHead key={h} className="text-slate-400">{h}</TableHead>)}
                </TableRow></TableHeader>
                <TableBody>
                  {postService.map(s=>(
                    <TableRow key={s.id} className="border-slate-700/50">
                      <TableCell className="text-slate-300 font-mono text-xs">{s.id}</TableCell>
                      <TableCell className="text-white text-sm">{s.project}</TableCell>
                      <TableCell className="text-slate-300 text-sm">{s.type}</TableCell>
                      <TableCell className="text-slate-300 text-sm">{s.desc}</TableCell>
                      <TableCell className="text-slate-300 text-sm">{s.next}</TableCell>
                      <TableCell><Badge className={`text-xs ${s.status==="scheduled"?"bg-blue-500/20 text-blue-400":"bg-amber-500/20 text-amber-400"}`}>{s.status==="scheduled"?"מתוכנן":"ממתין"}</Badge></TableCell>
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