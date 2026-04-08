import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import {
  Activity, Calendar, Users, Layers, AlertTriangle, Search, FileText,
  DollarSign, CheckCircle2, ArrowUpDown, TrendingUp, Clock, User,
  BarChart3, Zap, Shield
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";

const EVENT_TYPES: Record<string, { label: string; color: string; icon: any }> = {
  created: { label: "נוצר", color: "bg-blue-500/20 text-blue-400", icon: FileText },
  updated: { label: "עודכן", color: "bg-amber-500/20 text-amber-400", icon: ArrowUpDown },
  stage_changed: { label: "שלב שונה", color: "bg-purple-500/20 text-purple-400", icon: Layers },
  budget_approved: { label: "תקציב אושר", color: "bg-emerald-500/20 text-emerald-400", icon: DollarSign },
  risk_created: { label: "סיכון נוצר", color: "bg-red-500/20 text-red-400", icon: AlertTriangle },
  task_completed: { label: "משימה הושלמה", color: "bg-green-500/20 text-green-400", icon: CheckCircle2 },
  invoice_issued: { label: "חשבונית הופקה", color: "bg-cyan-500/20 text-cyan-400", icon: FileText },
  payment_received: { label: "תשלום התקבל", color: "bg-teal-500/20 text-teal-400", icon: DollarSign },
};

const ENTITY_TYPES = ["פרויקט", "משימה", "תקציב", "סיכון", "חשבונית", "תשלום", "אבן דרך", "מסמך"];

const PROJECTS = [
  "חלונות אלומיניום - מגדלי הים", "דלתות זכוכית - מרכז רפואי שערי צדק",
  "מעקות מתכת - פרויקט נאות אשלים", "חזיתות זכוכית - מגדל אופיס פארק",
  "פרגולות אלומיניום - שכונת הפרחים", "תריסים חשמליים - מלון ים המלח",
];

const ACTORS = [
  "עוזי כהן", "מיכל לוי", "דוד אברהמי", "רחל מזרחי",
  "יוסי בן דוד", "שרה גולדשטיין", "אבי נחמיאס", "נועה ברק",
];

function generateEvents() {
  const events: any[] = [];
  const types = Object.keys(EVENT_TYPES);
  const descriptions: Record<string, string[]> = {
    created: ["נוצר פרויקט חדש במערכת", "נפתח רשומה חדשה", "נוספה ישות חדשה למעקב"],
    updated: ["עודכנו פרטי הפרויקט", "שונה תיאור המשימה", "עודכן לוח זמנים"],
    stage_changed: ["הפרויקט עבר לשלב ביצוע", "שלב התכנון הושלם", "מעבר לשלב בדיקות"],
    budget_approved: ["תקציב בסך 450,000 ש\"ח אושר", "אושר תקציב נוסף", "תקציב שלב ב' אושר"],
    risk_created: ["זוהה סיכון באספקת חומרים", "נוסף סיכון עיכוב לוח זמנים", "סיכון תקציבי חדש"],
    task_completed: ["הושלמה התקנת חלונות קומה 3", "סיום עבודות ריתוך", "בדיקת איכות הושלמה"],
    invoice_issued: ["הופקה חשבונית מס' 1847", "חשבונית חלקית הופקה", "חשבונית סופית הופקה"],
    payment_received: ["התקבל תשלום ע\"ס 125,000 ש\"ח", "תשלום חלקי התקבל", "מקדמה התקבלה"],
  };
  const baseDate = new Date(2026, 3, 8);
  for (let i = 0; i < 20; i++) {
    const type = types[i % types.length];
    const hoursAgo = i * 3 + Math.floor(Math.random() * 4);
    const ts = new Date(baseDate.getTime() - hoursAgo * 3600000);
    events.push({
      id: i + 1,
      timestamp: ts.toISOString(),
      project: PROJECTS[i % PROJECTS.length],
      eventType: type,
      entityType: ENTITY_TYPES[i % ENTITY_TYPES.length],
      actor: ACTORS[i % ACTORS.length],
      description: descriptions[type][i % descriptions[type].length],
      isCritical: type === "risk_created" || (type === "budget_approved" && i % 3 === 0),
    });
  }
  return events;
}

const FALLBACK_EVENTS = generateEvents();

function KpiCard({ title, value, icon: Icon, color, sub }: any) {
  return (
    <Card className="bg-background border-border"><CardContent className="p-4">
      <div className="flex items-center justify-between mb-2"><span className="text-xs text-muted-foreground">{title}</span><div className={`p-1.5 rounded-lg ${color}`}><Icon size={14} /></div></div>
      <div className="text-2xl font-bold text-foreground">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </CardContent></Card>
  );
}

function EventTypeBadge({ type }: { type: string }) {
  const cfg = EVENT_TYPES[type];
  if (!cfg) return <Badge variant="outline">{type}</Badge>;
  const Icon = cfg.icon;
  return (<span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}><Icon size={11} />{cfg.label}</span>);
}

function TimelineRow({ ev }: { ev: any }) {
  const ts = new Date(ev.timestamp);
  const dateStr = ts.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" });
  const timeStr = ts.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
  return (
    <div className={`flex items-start gap-3 p-3 rounded-lg border transition-colors hover:bg-muted/30 ${ev.isCritical ? "border-red-500/40 bg-red-500/5" : "border-border"}`}>
      <div className="text-center min-w-[52px] pt-0.5">
        <div className="text-xs font-medium text-foreground">{dateStr}</div>
        <div className="text-[10px] text-muted-foreground">{timeStr}</div>
      </div>
      <div className="w-px h-10 bg-border self-center" />
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <EventTypeBadge type={ev.eventType} />
          <Badge variant="outline" className="text-[10px]">{ev.entityType}</Badge>
          {ev.isCritical && (
            <span className="flex items-center gap-0.5 text-[10px] text-red-400 font-medium">
              <Shield size={10} /> קריטי
            </span>
          )}
        </div>
        <div className="text-sm text-foreground font-medium truncate">{ev.description}</div>
        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><Layers size={10} />{ev.project}</span>
          <span className="flex items-center gap-1"><User size={10} />{ev.actor}</span>
        </div>
      </div>
    </div>
  );
}

export default function ProjectEventsAuditPage() {
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("timeline");
  const [typeFilter, setTypeFilter] = useState("all");

  const { data: apiEvents } = useQuery({
    queryKey: ["project-events-audit"],
    queryFn: async () => { const r = await authFetch("/api/projects/events-audit"); return r.json(); },
  });
  const ALL_EVENTS: any[] = Array.isArray(apiEvents) ? apiEvents : (apiEvents?.data ?? FALLBACK_EVENTS);

  const filtered = useMemo(() => {
    let res = ALL_EVENTS;
    if (search) {
      const s = search.toLowerCase();
      res = res.filter(e =>
        e.project.toLowerCase().includes(s) || e.actor.toLowerCase().includes(s) ||
        e.description.toLowerCase().includes(s)
      );
    }
    if (typeFilter !== "all") res = res.filter(e => e.eventType === typeFilter);
    return res;
  }, [search, typeFilter, ALL_EVENTS]);

  const todayStr = new Date(2026, 3, 8).toDateString();
  const todayEvents = ALL_EVENTS.filter(e => new Date(e.timestamp).toDateString() === todayStr);
  const uniqueActors = new Set(ALL_EVENTS.map(e => e.actor)).size;
  const uniqueEntities = new Set(ALL_EVENTS.map(e => e.entityType)).size;
  const criticalCount = ALL_EVENTS.filter(e => e.isCritical).length;

  const byProject = useMemo(() => {
    const map: Record<string, any[]> = {};
    filtered.forEach(e => { (map[e.project] ||= []).push(e); });
    return Object.entries(map).sort((a, b) => b[1].length - a[1].length);
  }, [filtered]);

  const byType = useMemo(() => {
    const map: Record<string, any[]> = {};
    filtered.forEach(e => { (map[e.eventType] ||= []).push(e); });
    return Object.entries(map).sort((a, b) => b[1].length - a[1].length);
  }, [filtered]);

  const actorStats = useMemo(() => {
    const map: Record<string, number> = {};
    ALL_EVENTS.forEach(e => { map[e.actor] = (map[e.actor] || 0) + 1; });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, []);

  const hourlyVolume = useMemo(() => {
    const hours = Array.from({ length: 24 }, (_, i) => ({ hour: i, count: 0 }));
    ALL_EVENTS.forEach(e => { hours[new Date(e.timestamp).getHours()].count++; });
    return hours;
  }, []);
  const maxHourly = Math.max(...hourlyVolume.map(h => h.count), 1);

  return (
    <div dir="rtl" className="min-h-screen bg-background p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Activity className="text-blue-400" size={24} />
            מעקב אירועים וביקורת פרויקטים
          </h1>
          <p className="text-sm text-muted-foreground mt-1">יומן אירועים מלא, מעקב שינויים וניתוח פעילות</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="חיפוש אירועים..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pr-8 w-56 h-9 text-sm bg-background border-border"
            />
          </div>
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="h-9 px-3 rounded-md border border-border bg-background text-foreground text-sm"
          >
            <option value="all">כל הסוגים</option>
            {Object.entries(EVENT_TYPES).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <KpiCard title="סה״כ אירועים" value={ALL_EVENTS.length} icon={Activity} color="bg-blue-500/20 text-blue-400" sub="ב-7 ימים אחרונים" />
        <KpiCard title="אירועים היום" value={todayEvents.length} icon={Calendar} color="bg-emerald-500/20 text-emerald-400" sub={`מתוך ${ALL_EVENTS.length} סה״כ`} />
        <KpiCard title="משתמשים פעילים" value={uniqueActors} icon={Users} color="bg-purple-500/20 text-purple-400" sub="שחקנים ייחודיים" />
        <KpiCard title="סוגי ישויות" value={uniqueEntities} icon={Layers} color="bg-amber-500/20 text-amber-400" sub="קטגוריות שונות" />
        <KpiCard title="אירועים קריטיים" value={criticalCount} icon={AlertTriangle} color="bg-red-500/20 text-red-400" sub="דורשים תשומת לב" />
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-muted/30 border border-border">
          <TabsTrigger value="timeline" className="text-xs gap-1"><Clock size={12} />ציר זמן</TabsTrigger>
          <TabsTrigger value="byProject" className="text-xs gap-1"><Layers size={12} />לפי פרויקט</TabsTrigger>
          <TabsTrigger value="byType" className="text-xs gap-1"><BarChart3 size={12} />לפי סוג</TabsTrigger>
          <TabsTrigger value="analytics" className="text-xs gap-1"><TrendingUp size={12} />אנליטיקה</TabsTrigger>
        </TabsList>

        {/* Tab 1: Timeline */}
        <TabsContent value="timeline" className="mt-4 space-y-2">
          {filtered.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">לא נמצאו אירועים</div>
          )}
          {filtered.map(ev => <TimelineRow key={ev.id} ev={ev} />)}
        </TabsContent>

        {/* Tab 2: By Project */}
        <TabsContent value="byProject" className="mt-4 space-y-4">
          {byProject.map(([proj, evts]) => (
            <Card key={proj} className="bg-background border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center justify-between">
                  <span className="flex items-center gap-2"><Layers size={14} className="text-blue-400" />{proj}</span>
                  <Badge variant="outline">{evts.length} אירועים</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {evts.map((ev: any) => (
                  <div key={ev.id} className="flex items-center gap-3 text-sm py-1.5 border-b border-border/50 last:border-0">
                    <span className="text-xs text-muted-foreground min-w-[40px]">
                      {new Date(ev.timestamp).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <EventTypeBadge type={ev.eventType} />
                    <span className="text-foreground truncate flex-1">{ev.description}</span>
                    <span className="text-xs text-muted-foreground flex items-center gap-1"><User size={10} />{ev.actor}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* Tab 3: By Type */}
        <TabsContent value="byType" className="mt-4 space-y-4">
          {byType.map(([type, evts]) => {
            const cfg = EVENT_TYPES[type];
            const Icon = cfg?.icon || Activity;
            const pct = ((evts.length / ALL_EVENTS.length) * 100).toFixed(0);
            return (
              <Card key={type} className="bg-background border-border">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <div className={`p-1 rounded ${cfg?.color || "bg-muted"}`}><Icon size={12} /></div>
                      <EventTypeBadge type={type} />
                    </span>
                    <div className="flex items-center gap-3">
                      <Progress value={Number(pct)} className="h-1.5 w-16" />
                      <span className="text-xs text-muted-foreground">{evts.length} ({pct}%)</span>
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1">
                  {evts.map((ev: any) => (
                    <div key={ev.id} className="flex items-center gap-3 text-sm py-1 border-b border-border/50 last:border-0">
                      <span className="text-xs text-muted-foreground min-w-[70px]">
                        {new Date(ev.timestamp).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" })} {new Date(ev.timestamp).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      <span className="text-foreground truncate flex-1">{ev.description}</span>
                      <span className="text-xs text-muted-foreground">{ev.project}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        {/* Tab 4: Analytics */}
        <TabsContent value="analytics" className="mt-4 space-y-4">
          <Card className="bg-background border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2"><TrendingUp size={14} className="text-blue-400" />נפח אירועים לפי שעה</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-1 h-28">
                {hourlyVolume.map(h => (
                  <div key={h.hour} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full bg-blue-500/60 rounded-t transition-all hover:bg-blue-400/80" style={{ height: `${(h.count / maxHourly) * 100}%`, minHeight: h.count > 0 ? 4 : 0 }} title={`${h.hour}:00 - ${h.count} אירועים`} />
                    {h.hour % 4 === 0 && <span className="text-[9px] text-muted-foreground">{h.hour}:00</span>}
                  </div>))}
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="bg-background border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><Zap size={14} className="text-amber-400" />פרויקטים הכי פעילים</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {byProject.slice(0, 5).map(([proj, evts]) => (
                  <div key={proj}>
                    <div className="flex items-center justify-between text-sm mb-1"><span className="text-foreground truncate flex-1">{proj}</span><span className="text-xs text-muted-foreground mr-2">{evts.length} אירועים</span></div>
                    <Progress value={(evts.length / ALL_EVENTS.length) * 100} className="h-1.5" />
                  </div>))}
              </CardContent>
            </Card>

            {/* Busiest Actors */}
            <Card className="bg-background border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><Users size={14} className="text-purple-400" />משתמשים הכי פעילים</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {actorStats.slice(0, 5).map(([actor, count], idx) => (
                  <div key={actor} className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-purple-500/20 flex items-center justify-center text-[10px] font-bold text-purple-400">{idx + 1}</div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between text-sm"><span className="text-foreground">{actor}</span><span className="text-xs text-muted-foreground">{count} פעולות</span></div>
                      <Progress value={(count / ALL_EVENTS.length) * 100} className="h-1 mt-1" />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Event Type Distribution */}
          <Card className="bg-background border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2"><BarChart3 size={14} className="text-emerald-400" />התפלגות סוגי אירועים</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {byType.map(([type, evts]) => {
                  const cfg = EVENT_TYPES[type]; const Icon = cfg?.icon || Activity;
                  return (
                    <div key={type} className="flex items-center gap-2 p-2 rounded-lg border border-border">
                      <div className={`p-1.5 rounded ${cfg?.color || "bg-muted"}`}><Icon size={12} /></div>
                      <div><div className="text-xs font-medium text-foreground">{cfg?.label || type}</div>
                        <div className="text-[10px] text-muted-foreground">{evts.length} ({((evts.length / ALL_EVENTS.length) * 100).toFixed(0)}%)</div></div>
                    </div>);
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
