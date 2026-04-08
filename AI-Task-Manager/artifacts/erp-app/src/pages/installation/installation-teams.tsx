import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Users, Star, MapPin, Clock, Award, Shield,
  Wrench, CheckCircle, CalendarDays, TrendingUp,
  Ruler, Zap, Eye, Flame, Target, Trophy
} from "lucide-react";

/* ── Static mock data ─────────────────────────────────────────── */

const FALLBACK_TEAMS = [
  {
    name: "צוות אלפא",
    leader: "יוסי כהן",
    members: ["יוסי כהן", "מוחמד עבד", "אלכס פטרוב", "דוד מזרחי"],
    skills: ["אלומיניום", "זכוכית", "מעקות", "ויטרינות"],
    currentProject: "מגדלי הים — חיפה",
    currentLocation: "שד' הנשיא 45, חיפה",
    performanceScore: 4.8,
    installationsThisMonth: 12,
    avgInstallTime: "4.2 שעות",
    qualityScore: 96,
    customerRating: 4.9,
    status: "באתר",
  },
  {
    name: "צוות בטא",
    leader: "שרה לוי",
    members: ["שרה לוי", "עומר חדד", "נועה פרידמן", "סרגיי קוזלוב", "אחמד חוסייני"],
    skills: ["ברזל", "ריתוך", "דלתות", "מעקות", "אלומיניום"],
    currentProject: "פארק המדע — רחובות",
    currentLocation: "רח' הרצל 12, רחובות",
    performanceScore: 4.5,
    installationsThisMonth: 10,
    avgInstallTime: "5.1 שעות",
    qualityScore: 93,
    customerRating: 4.7,
    status: "באתר",
  },
  {
    name: "צוות גמא",
    leader: "רחל אברהם",
    members: ["רחל אברהם", "איתן רוזנברג", "תמר שלום"],
    skills: ["זכוכית", "ויטרינות", "איטום"],
    currentProject: "בניין מגורים — נתניה",
    currentLocation: "רח' שמואלי 22, נתניה",
    performanceScore: 4.2,
    installationsThisMonth: 8,
    avgInstallTime: "5.8 שעות",
    qualityScore: 89,
    customerRating: 4.4,
    status: "באתר",
  },
  {
    name: "צוות דלתא",
    leader: "מיכל ברק",
    members: ["מיכל ברק", "אורי דהן", "גל שפירא", "ויקטור מלניק"],
    skills: ["אלומיניום", "ברזל", "דלתות", "מעקות"],
    currentProject: "—",
    currentLocation: "—",
    performanceScore: 4.6,
    installationsThisMonth: 11,
    avgInstallTime: "4.5 שעות",
    qualityScore: 94,
    customerRating: 4.8,
    status: "במפעל",
  },
];

const FALLBACK_SKILLS_MATRIX: { name: string; team: string; skills: Record<string, string> }[] = [
  { name: "יוסי כהן", team: "אלפא", skills: { חיתוך: "מומחה", הרכבה: "מומחה", ריתוך: "מיומן", "התקנת זכוכית": "מיומן", איטום: "מומחה", חשמל: "בסיסי", גובה: "מומחה", מדידות: "מומחה" } },
  { name: "מוחמד עבד", team: "אלפא", skills: { חיתוך: "מומחה", הרכבה: "מיומן", ריתוך: "מומחה", "התקנת זכוכית": "בסיסי", איטום: "מיומן", חשמל: "—", גובה: "מיומן", מדידות: "מיומן" } },
  { name: "אלכס פטרוב", team: "אלפא", skills: { חיתוך: "מיומן", הרכבה: "מומחה", ריתוך: "מומחה", "התקנת זכוכית": "מיומן", איטום: "בסיסי", חשמל: "מיומן", גובה: "מומחה", מדידות: "מיומן" } },
  { name: "דוד מזרחי", team: "אלפא", skills: { חיתוך: "מיומן", הרכבה: "מיומן", ריתוך: "בסיסי", "התקנת זכוכית": "מומחה", איטום: "מומחה", חשמל: "מומחה", גובה: "בסיסי", מדידות: "מומחה" } },
  { name: "שרה לוי", team: "בטא", skills: { חיתוך: "מיומן", הרכבה: "מומחה", ריתוך: "בסיסי", "התקנת זכוכית": "מיומן", איטום: "מיומן", חשמל: "מומחה", גובה: "מיומן", מדידות: "מומחה" } },
  { name: "עומר חדד", team: "בטא", skills: { חיתוך: "מומחה", הרכבה: "מיומן", ריתוך: "מומחה", "התקנת זכוכית": "—", איטום: "מיומן", חשמל: "בסיסי", גובה: "מומחה", מדידות: "מיומן" } },
  { name: "נועה פרידמן", team: "בטא", skills: { חיתוך: "בסיסי", הרכבה: "מיומן", ריתוך: "—", "התקנת זכוכית": "מומחה", איטום: "מומחה", חשמל: "מיומן", גובה: "בסיסי", מדידות: "מומחה" } },
  { name: "סרגיי קוזלוב", team: "בטא", skills: { חיתוך: "מומחה", הרכבה: "מומחה", ריתוך: "מומחה", "התקנת זכוכית": "מיומן", איטום: "בסיסי", חשמל: "—", גובה: "מומחה", מדידות: "מיומן" } },
  { name: "אחמד חוסייני", team: "בטא", skills: { חיתוך: "מיומן", הרכבה: "בסיסי", ריתוך: "מיומן", "התקנת זכוכית": "מיומן", איטום: "מומחה", חשמל: "מיומן", גובה: "מיומן", מדידות: "בסיסי" } },
  { name: "רחל אברהם", team: "גמא", skills: { חיתוך: "מיומן", הרכבה: "מומחה", ריתוך: "—", "התקנת זכוכית": "מומחה", איטום: "מומחה", חשמל: "בסיסי", גובה: "בסיסי", מדידות: "מומחה" } },
  { name: "איתן רוזנברג", team: "גמא", skills: { חיתוך: "מומחה", הרכבה: "מיומן", ריתוך: "מיומן", "התקנת זכוכית": "בסיסי", איטום: "מיומן", חשמל: "מומחה", גובה: "מומחה", מדידות: "מיומן" } },
  { name: "תמר שלום", team: "גמא", skills: { חיתוך: "בסיסי", הרכבה: "מיומן", ריתוך: "—", "התקנת זכוכית": "מומחה", איטום: "מיומן", חשמל: "מיומן", גובה: "—", מדידות: "מומחה" } },
  { name: "מיכל ברק", team: "דלתא", skills: { חיתוך: "מומחה", הרכבה: "מומחה", ריתוך: "מיומן", "התקנת זכוכית": "מיומן", איטום: "מיומן", חשמל: "מומחה", גובה: "מיומן", מדידות: "מומחה" } },
  { name: "אורי דהן", team: "דלתא", skills: { חיתוך: "מיומן", הרכבה: "מיומן", ריתוך: "מומחה", "התקנת זכוכית": "בסיסי", איטום: "בסיסי", חשמל: "בסיסי", גובה: "מומחה", מדידות: "מיומן" } },
  { name: "גל שפירא", team: "דלתא", skills: { חיתוך: "בסיסי", הרכבה: "מומחה", ריתוך: "מיומן", "התקנת זכוכית": "מומחה", איטום: "מומחה", חשמל: "מיומן", גובה: "מיומן", מדידות: "בסיסי" } },
  { name: "ויקטור מלניק", team: "דלתא", skills: { חיתוך: "מומחה", הרכבה: "מיומן", ריתוך: "מומחה", "התקנת זכוכית": "מיומן", איטום: "—", חשמל: "—", גובה: "מומחה", מדידות: "מיומן" } },
];

const FALLBACK_SKILL_COLUMNS = ["חיתוך", "הרכבה", "ריתוך", "התקנת זכוכית", "איטום", "חשמל", "גובה", "מדידות"];

const FALLBACK_AVAILABILITY: { name: string; team: string; sun: string; mon: string; tue: string; wed: string; thu: string; fri: string }[] = [
  { name: "יוסי כהן", team: "אלפא", sun: "באתר", mon: "באתר", tue: "באתר", wed: "באתר", thu: "זמין", fri: "—" },
  { name: "מוחמד עבד", team: "אלפא", sun: "באתר", mon: "באתר", tue: "הדרכה", wed: "באתר", thu: "באתר", fri: "—" },
  { name: "אלכס פטרוב", team: "אלפא", sun: "באתר", mon: "באתר", tue: "באתר", wed: "זמין", thu: "באתר", fri: "—" },
  { name: "דוד מזרחי", team: "אלפא", sun: "חופש", mon: "חופש", tue: "באתר", wed: "באתר", thu: "באתר", fri: "—" },
  { name: "שרה לוי", team: "בטא", sun: "באתר", mon: "באתר", tue: "באתר", wed: "באתר", thu: "באתר", fri: "—" },
  { name: "עומר חדד", team: "בטא", sun: "באתר", mon: "הדרכה", tue: "באתר", wed: "באתר", thu: "זמין", fri: "—" },
  { name: "נועה פרידמן", team: "בטא", sun: "זמין", mon: "באתר", tue: "באתר", wed: "באתר", thu: "באתר", fri: "—" },
  { name: "סרגיי קוזלוב", team: "בטא", sun: "באתר", mon: "באתר", tue: "באתר", wed: "הדרכה", thu: "באתר", fri: "—" },
  { name: "אחמד חוסייני", team: "בטא", sun: "באתר", mon: "באתר", tue: "זמין", wed: "באתר", thu: "באתר", fri: "—" },
  { name: "רחל אברהם", team: "גמא", sun: "באתר", mon: "באתר", tue: "באתר", wed: "זמין", thu: "באתר", fri: "—" },
  { name: "איתן רוזנברג", team: "גמא", sun: "באתר", mon: "באתר", tue: "חופש", wed: "חופש", thu: "באתר", fri: "—" },
  { name: "תמר שלום", team: "גמא", sun: "הדרכה", mon: "באתר", tue: "באתר", wed: "באתר", thu: "זמין", fri: "—" },
  { name: "מיכל ברק", team: "דלתא", sun: "זמין", mon: "באתר", tue: "באתר", wed: "באתר", thu: "באתר", fri: "—" },
  { name: "אורי דהן", team: "דלתא", sun: "באתר", mon: "באתר", tue: "באתר", wed: "באתר", thu: "הדרכה", fri: "—" },
  { name: "גל שפירא", team: "דלתא", sun: "באתר", mon: "זמין", tue: "באתר", wed: "באתר", thu: "באתר", fri: "—" },
  { name: "ויקטור מלניק", team: "דלתא", sun: "באתר", mon: "באתר", tue: "באתר", wed: "זמין", thu: "באתר", fri: "—" },
];

const FALLBACK_DAY_LABELS = [
  { key: "sun" as const, label: "ראשון" },
  { key: "mon" as const, label: "שני" },
  { key: "tue" as const, label: "שלישי" },
  { key: "wed" as const, label: "רביעי" },
  { key: "thu" as const, label: "חמישי" },
  { key: "fri" as const, label: "שישי" },
];

/* ── Helpers ──────────────────────────────────────────────────── */

function profBadge(level: string) {
  if (level === "מומחה") return <Badge className="bg-emerald-600 text-white text-xs">{level}</Badge>;
  if (level === "מיומן") return <Badge className="bg-blue-600 text-white text-xs">{level}</Badge>;
  if (level === "בסיסי") return <Badge variant="outline" className="text-xs">{level}</Badge>;
  return <span className="text-muted-foreground text-xs">—</span>;
}

function availBadge(status: string) {
  if (status === "באתר") return <Badge className="bg-orange-600 text-white text-xs">{status}</Badge>;
  if (status === "זמין") return <Badge className="bg-emerald-600 text-white text-xs">{status}</Badge>;
  if (status === "חופש") return <Badge className="bg-red-500 text-white text-xs">{status}</Badge>;
  if (status === "הדרכה") return <Badge className="bg-purple-600 text-white text-xs">{status}</Badge>;
  return <span className="text-muted-foreground text-xs">—</span>;
}

function renderStars(score: number) {
  const full = Math.floor(score);
  const half = score - full >= 0.5;
  return (
    <span className="flex items-center gap-0.5">
      {Array.from({ length: full }).map((_, i) => (
        <Star key={i} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
      ))}
      {half && <Star className="h-4 w-4 fill-yellow-400/50 text-yellow-400" />}
      <span className="mr-1 text-sm font-medium">{score}</span>
    </span>
  );
}

/* ── Page ─────────────────────────────────────────────────────── */

export default function InstallationTeamsPage() {
  const { data: teams = FALLBACK_TEAMS } = useQuery({
    queryKey: ["installation-teams"],
    queryFn: async () => {
      const res = await authFetch("/api/installation/installation-teams/teams");
      if (!res.ok) return FALLBACK_TEAMS;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_TEAMS;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: skillsMatrix = FALLBACK_SKILLS_MATRIX } = useQuery({
    queryKey: ["installation-skills-matrix"],
    queryFn: async () => {
      const res = await authFetch("/api/installation/installation-teams/skills-matrix");
      if (!res.ok) return FALLBACK_SKILLS_MATRIX;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_SKILLS_MATRIX;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: skillColumns = FALLBACK_SKILL_COLUMNS } = useQuery({
    queryKey: ["installation-skill-columns"],
    queryFn: async () => {
      const res = await authFetch("/api/installation/installation-teams/skill-columns");
      if (!res.ok) return FALLBACK_SKILL_COLUMNS;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_SKILL_COLUMNS;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: availability = FALLBACK_AVAILABILITY } = useQuery({
    queryKey: ["installation-availability"],
    queryFn: async () => {
      const res = await authFetch("/api/installation/installation-teams/availability");
      if (!res.ok) return FALLBACK_AVAILABILITY;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_AVAILABILITY;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: dayLabels = FALLBACK_DAY_LABELS } = useQuery({
    queryKey: ["installation-day-labels"],
    queryFn: async () => {
      const res = await authFetch("/api/installation/installation-teams/day-labels");
      if (!res.ok) return FALLBACK_DAY_LABELS;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_DAY_LABELS;
    },
    staleTime: 30_000,
    retry: 1,
  });


  return (
    <div dir="rtl" className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Users className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">צוותי התקנה</h1>
          <p className="text-muted-foreground text-sm">טכנו-כל עוזי — ניהול צוותים, כישורים וזמינות</p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 flex items-center gap-3">
            <Shield className="h-8 w-8 text-blue-500" />
            <div>
              <p className="text-2xl font-bold">4</p>
              <p className="text-xs text-muted-foreground">צוותים פעילים</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 flex items-center gap-3">
            <Users className="h-8 w-8 text-emerald-500" />
            <div>
              <p className="text-2xl font-bold">16</p>
              <p className="text-xs text-muted-foreground">חברי צוות</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 flex items-center gap-3">
            <CheckCircle className="h-8 w-8 text-green-500" />
            <div>
              <p className="text-2xl font-bold">12</p>
              <p className="text-xs text-muted-foreground">פעילים היום</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 flex items-center gap-3">
            <CalendarDays className="h-8 w-8 text-red-400" />
            <div>
              <p className="text-2xl font-bold">2</p>
              <p className="text-xs text-muted-foreground">בחופשה</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="teams" className="space-y-4">
        <TabsList>
          <TabsTrigger value="teams">צוותים</TabsTrigger>
          <TabsTrigger value="skills">מטריצת כישורים</TabsTrigger>
          <TabsTrigger value="availability">זמינות שבועית</TabsTrigger>
          <TabsTrigger value="performance">ביצועים</TabsTrigger>
        </TabsList>

        {/* ── Teams Tab ────────────────────────────────── */}
        <TabsContent value="teams">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {teams.map((t) => (
              <Card key={t.name}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{t.name}</CardTitle>
                    <Badge className={t.status === "באתר" ? "bg-orange-600 text-white" : "bg-emerald-600 text-white"}>
                      {t.status}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">ראש צוות: {t.leader} &middot; {t.members.length} חברים</p>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Skills */}
                  <div className="flex flex-wrap gap-1.5">
                    {t.skills.map((s) => (
                      <Badge key={s} variant="outline" className="text-xs">{s}</Badge>
                    ))}
                  </div>

                  {/* Current assignment */}
                  <div className="flex items-center gap-2 text-sm">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span>{t.currentProject !== "—" ? `${t.currentProject} — ${t.currentLocation}` : "ללא משימה נוכחית"}</span>
                  </div>

                  {/* Metrics grid */}
                  <div className="grid grid-cols-2 gap-3 pt-2 border-t">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Award className="h-3.5 w-3.5" /> דירוג ביצועים
                      </div>
                      {renderStars(t.performanceScore)}
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Wrench className="h-3.5 w-3.5" /> התקנות החודש
                      </div>
                      <p className="text-lg font-semibold">{t.installationsThisMonth}</p>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" /> זמן התקנה ממוצע
                      </div>
                      <p className="text-lg font-semibold">{t.avgInstallTime}</p>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Target className="h-3.5 w-3.5" /> איכות
                      </div>
                      <div className="flex items-center gap-2">
                        <Progress value={t.qualityScore} className="flex-1 h-2" />
                        <span className="text-sm font-medium">{t.qualityScore}%</span>
                      </div>
                    </div>
                  </div>

                  {/* Customer rating */}
                  <div className="flex items-center gap-2 pt-2 border-t text-sm">
                    <Eye className="h-4 w-4 text-muted-foreground" />
                    <span>דירוג לקוחות:</span>
                    {renderStars(t.customerRating)}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* ── Skills Matrix Tab ────────────────────────── */}
        <TabsContent value="skills">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Ruler className="h-5 w-5" /> מטריצת כישורים — 16 עובדים &times; 8 מיומנויות
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right min-w-[120px]">שם</TableHead>
                    <TableHead className="text-right min-w-[70px]">צוות</TableHead>
                    {skillColumns.map((s) => (
                      <TableHead key={s} className="text-center min-w-[90px]">{s}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {skillsMatrix.map((w) => (
                    <TableRow key={w.name}>
                      <TableCell className="font-medium">{w.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{w.team}</Badge>
                      </TableCell>
                      {skillColumns.map((s) => (
                        <TableCell key={s} className="text-center">
                          {profBadge(w.skills[s])}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Availability Tab ─────────────────────────── */}
        <TabsContent value="availability">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarDays className="h-5 w-5" /> זמינות שבועית — שבוע 08/04/2026
              </CardTitle>
              <div className="flex flex-wrap gap-2 pt-2">
                {availBadge("באתר")} {availBadge("זמין")} {availBadge("חופש")} {availBadge("הדרכה")}
              </div>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right min-w-[120px]">שם</TableHead>
                    <TableHead className="text-right min-w-[70px]">צוות</TableHead>
                    {dayLabels.map((d) => (
                      <TableHead key={d.key} className="text-center min-w-[80px]">{d.label}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {availability.map((w) => (
                    <TableRow key={w.name}>
                      <TableCell className="font-medium">{w.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{w.team}</Badge>
                      </TableCell>
                      {dayLabels.map((d) => (
                        <TableCell key={d.key} className="text-center">
                          {availBadge(w[d.key])}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Performance Tab ──────────────────────────── */}
        <TabsContent value="performance">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Best Team */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Trophy className="h-5 w-5 text-yellow-500" /> צוות מצטיין
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">צוות אלפא</p>
                <p className="text-sm text-muted-foreground">ציון ביצועים כולל: 4.8/5 &middot; ראש צוות: יוסי כהן</p>
                <div className="mt-3 space-y-2">
                  <div className="flex justify-between text-sm"><span>התקנות החודש</span><span className="font-semibold">12</span></div>
                  <div className="flex justify-between text-sm"><span>ציון איכות</span><span className="font-semibold">96%</span></div>
                  <div className="flex justify-between text-sm"><span>דירוג לקוחות</span><span className="font-semibold">4.9/5</span></div>
                </div>
              </CardContent>
            </Card>

            {/* Best Worker */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Star className="h-5 w-5 text-yellow-500" /> עובד מצטיין
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">יוסי כהן</p>
                <p className="text-sm text-muted-foreground">צוות אלפא &middot; 7 מיומנויות ברמת מומחה/מיומן</p>
                <div className="mt-3 space-y-2">
                  <div className="flex justify-between text-sm"><span>התקנות אישיות</span><span className="font-semibold">6</span></div>
                  <div className="flex justify-between text-sm"><span>אפס תקלות</span><Badge className="bg-emerald-600 text-white text-xs">ללא ליקויים</Badge></div>
                  <div className="flex justify-between text-sm"><span>דירוג לקוחות אישי</span><span className="font-semibold">5.0/5</span></div>
                </div>
              </CardContent>
            </Card>

            {/* Most Installations */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <TrendingUp className="h-5 w-5 text-blue-500" /> הכי הרבה התקנות
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">דירוג</TableHead>
                      <TableHead className="text-right">צוות</TableHead>
                      <TableHead className="text-right">התקנות</TableHead>
                      <TableHead className="text-right">ציון איכות</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...teams].sort((a, b) => b.installationsThisMonth - a.installationsThisMonth).map((t, i) => (
                      <TableRow key={t.name}>
                        <TableCell>
                          {i === 0 ? <Badge className="bg-yellow-500 text-white">1</Badge> : i + 1}
                        </TableCell>
                        <TableCell className="font-medium">{t.name}</TableCell>
                        <TableCell>{t.installationsThisMonth}</TableCell>
                        <TableCell>{t.qualityScore}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Fastest & Highest Quality */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Flame className="h-5 w-5 text-orange-500" /> מהירות ואיכות
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground mb-1 flex items-center gap-1"><Zap className="h-3.5 w-3.5" /> זמן התקנה ממוצע הנמוך ביותר</p>
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-bold">צוות אלפא</span>
                    <Badge className="bg-blue-600 text-white">4.2 שעות</Badge>
                  </div>
                </div>
                <div className="border-t pt-3">
                  <p className="text-sm text-muted-foreground mb-1 flex items-center gap-1"><Target className="h-3.5 w-3.5" /> ציון איכות גבוה ביותר</p>
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-bold">צוות אלפא</span>
                    <Badge className="bg-emerald-600 text-white">96%</Badge>
                  </div>
                </div>
                <div className="border-t pt-3">
                  <p className="text-sm text-muted-foreground mb-1 flex items-center gap-1"><Star className="h-3.5 w-3.5" /> דירוג לקוחות גבוה ביותר</p>
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-bold">צוות אלפא</span>
                    <Badge className="bg-yellow-500 text-white">4.9/5</Badge>
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
