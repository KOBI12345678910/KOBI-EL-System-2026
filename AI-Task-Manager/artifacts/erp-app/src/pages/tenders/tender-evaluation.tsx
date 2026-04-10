import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  ClipboardCheck, BarChart3, Target, Trophy, Clock, Search,
  ThumbsUp, ThumbsDown, AlertTriangle, Shield, Users, TrendingUp,
  Star, Lightbulb, Eye, ChevronDown, ChevronUp, Swords, BookOpen
} from "lucide-react";

const FALLBACK_CRITERIA = [
  { key: "technical", label: "יכולת טכנית", weight: 30 },
  { key: "price", label: "תחרותיות מחיר", weight: 25 },
  { key: "experience", label: "ניסיון", weight: 20 },
  { key: "timeline", label: "לוח זמנים", weight: 15 },
  { key: "team", label: "צוות", weight: 10 },
] as const;

const FALLBACK_TENDERS_EVAL = [
  { id: "TND-041", name: "חלונות אלומיניום - בי\"ס ממלכתי חיפה", client: "עיריית חיפה", deadline: "2026-04-20", scores: { technical: 88, price: 72, experience: 90, timeline: 85, team: 78 } },
  { id: "TND-042", name: "מעטפת זכוכית - מגדל משרדים ת\"א", client: "אזורים בנייה", deadline: "2026-04-25", scores: { technical: 92, price: 65, experience: 85, timeline: 70, team: 90 } },
  { id: "TND-043", name: "דלתות מתכת - מפעל תעשייתי", client: "נשר מפעלים", deadline: "2026-05-01", scores: { technical: 75, price: 88, experience: 70, timeline: 92, team: 82 } },
  { id: "TND-044", name: "פסקל אלומיניום - פרויקט מגורים", client: "אפריקה ישראל", deadline: "2026-05-05", scores: { technical: 80, price: 90, experience: 65, timeline: 80, team: 75 } },
  { id: "TND-045", name: "חזיתות זכוכית - מרכז מסחרי", client: "עזריאלי קבוצה", deadline: "2026-05-10", scores: { technical: 95, price: 60, experience: 92, timeline: 78, team: 88 } },
  { id: "TND-046", name: "מחיצות פנים - בניין ממשלתי", client: "משרד הביטחון", deadline: "2026-05-15", scores: { technical: 70, price: 82, experience: 78, timeline: 88, team: 70 } },
];

const FALLBACK_GO_NOGO = [
  { id: "OPP-101", name: "מכרז ציבורי - 400 חלונות אלומיניום", value: 1800000, risk: "בינוני", reward: "גבוה", fit: 88, resources: 72, winProb: 65, decision: "go" },
  { id: "OPP-102", name: "מגדל מגורים - מעטפת זכוכית מלאה", value: 4200000, risk: "גבוה", reward: "גבוה מאוד", fit: 92, resources: 55, winProb: 45, decision: "pending" },
  { id: "OPP-103", name: "שיפוץ מבנה היסטורי - דלתות מתכת", value: 650000, risk: "נמוך", reward: "בינוני", fit: 75, resources: 90, winProb: 80, decision: "go" },
  { id: "OPP-104", name: "מפעל חדש - חלונות תעשייתיים", value: 2100000, risk: "בינוני", reward: "גבוה", fit: 82, resources: 68, winProb: 55, decision: "pending" },
  { id: "OPP-105", name: "פרויקט בוטיק - ויטרינות זכוכית", value: 380000, risk: "נמוך", reward: "נמוך", fit: 60, resources: 95, winProb: 85, decision: "nogo" },
  { id: "OPP-106", name: "בית חולים - חלונות אטומים", value: 3500000, risk: "גבוה", reward: "גבוה מאוד", fit: 90, resources: 45, winProb: 40, decision: "pending" },
  { id: "OPP-107", name: "מלון 5 כוכבים - חזיתות מעוצבות", value: 5800000, risk: "גבוה מאוד", reward: "גבוה מאוד", fit: 95, resources: 35, winProb: 30, decision: "pending" },
  { id: "OPP-108", name: "מרכז לוגיסטי - שערים ודלתות", value: 920000, risk: "נמוך", reward: "בינוני", fit: 70, resources: 88, winProb: 75, decision: "go" },
];

const FALLBACK_COMPETITORS = [
  { tender: "TND-041", competitors: [
    { name: "אלומטל בע\"מ", strengths: "מחירים נמוכים, נוכחות מקומית", weaknesses: "איכות נמוכה יותר, אין תעודת ISO", position: "מתחרה ישיר" },
    { name: "זכוכית הגליל", strengths: "ניסיון במוסדות חינוך", weaknesses: "לוחות זמנים ארוכים, מחיר גבוה", position: "מתחרה עקיף" },
  ]},
  { tender: "TND-042", competitors: [
    { name: "קריסטל מערכות", strengths: "מומחיות בחזיתות מגדלים, פורטפוליו עשיר", weaknesses: "עומס עבודה נוכחי, מחירים גבוהים", position: "מתחרה מוביל" },
    { name: "אלום-טק", strengths: "טכנולוגיה מתקדמת, צוות מנוסה", weaknesses: "חברה חדשה יחסית, אין רפרנסים מקומיים", position: "מתחרה חדש" },
    { name: "פנורמה זכוכית", strengths: "מותג חזק, אחריות מורחבת", weaknesses: "זמני תגובה איטיים, בירוקרטיה", position: "מתחרה ישיר" },
  ]},
  { tender: "TND-045", competitors: [
    { name: "קריסטל מערכות", strengths: "קשרים עם עזריאלי, ניסיון קודם", weaknesses: "תמחור גבוה, תלות בספקי משנה", position: "מתחרה מועדף" },
    { name: "ויטרו ישראל", strengths: "מומחיות בזכוכית מיוחדת", weaknesses: "אין ניסיון בפרויקטים בסדר גודל זה", position: "מתחרה חדש" },
  ]},
  { tender: "TND-046", competitors: [
    { name: "מגן מתכת", strengths: "ניסיון ביטחוני רב, סיווג בטחוני", weaknesses: "מחירים גבוהים מאוד", position: "מתחרה מוביל" },
    { name: "פלדור", strengths: "מחירים תחרותיים, זמינות מיידית", weaknesses: "חסר ניסיון במבני ממשל", position: "מתחרה ישיר" },
  ]},
];

const FALLBACK_LESSONS = [
  { id: 1, tender: "TND-032", outcome: "זכייה", title: "פרויקט מגורים - רמת גן", lesson: "תמחור אגרסיבי בשילוב הוכחת ניסיון דומה הביא לזכייה. ההצעה הטכנית המפורטת עם לוח זמנים ריאליסטי היו היתרון המרכזי.", category: "תמחור", date: "2026-02-15" },
  { id: 2, tender: "TND-028", outcome: "הפסד", title: "מגדל משרדים - הרצליה", lesson: "הפסדנו בשל חוסר ניסיון ספציפי בחזיתות מעל 20 קומות. יש לבנות פורטפוליו בתחום זה דרך שותפויות.", category: "ניסיון", date: "2026-01-20" },
  { id: 3, tender: "TND-025", outcome: "זכייה", title: "בית ספר - נתניה", lesson: "הקשר האישי עם מנהל הפרויקט ותגובה מהירה לשאלות הבהרה היו גורם מכריע. ביקור באתר לפני ההגשה יצר אמון.", category: "יחסים", date: "2025-12-10" },
  { id: 4, tender: "TND-019", outcome: "הפסד", title: "מרכז מסחרי - באר שבע", lesson: "התמחור היה גבוה ב-18% מהמתחרה הזוכה. יש לבחון מחדש את עלויות ייצור דלתות מתכת ולשפר יעילות.", category: "תמחור", date: "2025-11-05" },
  { id: 5, tender: "TND-035", outcome: "זכייה", title: "משרדי ממשלה - ירושלים", lesson: "עמידה בכל דרישות התקינה הישראלית (ת\"י 23, ת\"י 1530) ומסמכי איכות מסודרים הפכו אותנו למועדפים.", category: "תקנים", date: "2026-03-01" },
  { id: 6, tender: "TND-030", outcome: "ביטול", title: "פרויקט תיירות - אילת", lesson: "המכרז בוטל עקב חוסר תקציב. בעתיד יש לבדוק את מצבו הפיננסי של הלקוח לפני השקעת משאבים בהכנת הצעה.", category: "סינון", date: "2026-01-02" },
];


const CRITERIA = FALLBACK_CRITERIA;

const calcWeighted = (scores: Record<string, number>) =>
  CRITERIA.reduce((sum, c) => sum + (scores[c.key] * c.weight) / 100, 0);

const riskColor = (r: string) => {
  if (r === "נמוך") return "bg-green-500/20 text-green-400";
  if (r === "בינוני") return "bg-yellow-500/20 text-yellow-400";
  if (r === "גבוה") return "bg-orange-500/20 text-orange-400";
  return "bg-red-500/20 text-red-400";
};

const decisionBadge = (d: string) => {
  if (d === "go") return <Badge className="bg-green-500/20 text-green-400">GO</Badge>;
  if (d === "nogo") return <Badge className="bg-red-500/20 text-red-400">NO-GO</Badge>;
  return <Badge className="bg-yellow-500/20 text-yellow-400">ממתין להחלטה</Badge>;
};

export default function TenderEvaluationPage() {
  const { data: CRITERIA = FALLBACK_CRITERIA } = useQuery<any>({
    queryKey: ["tenders-criteria"],
    queryFn: async () => {
      const res = await authFetch("/api/tenders/tender-evaluation/criteria");
      if (!res.ok) return FALLBACK_CRITERIA;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_CRITERIA;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: TENDERS_EVAL = FALLBACK_TENDERS_EVAL } = useQuery<any[]>({
    queryKey: ["tenders-tenders-eval"],
    queryFn: async () => {
      const res = await authFetch("/api/tenders/tender-evaluation/tenders");
      if (!res.ok) return FALLBACK_TENDERS_EVAL;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_TENDERS_EVAL;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: GO_NOGO = FALLBACK_GO_NOGO } = useQuery<any[]>({
    queryKey: ["tenders-go-nogo"],
    queryFn: async () => {
      const res = await authFetch("/api/tenders/tender-evaluation/go-nogo");
      if (!res.ok) return FALLBACK_GO_NOGO;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_GO_NOGO;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: COMPETITORS = FALLBACK_COMPETITORS } = useQuery<any[]>({
    queryKey: ["tenders-competitors"],
    queryFn: async () => {
      const res = await authFetch("/api/tenders/tender-evaluation/competitors");
      if (!res.ok) return FALLBACK_COMPETITORS;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_COMPETITORS;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: LESSONS = FALLBACK_LESSONS } = useQuery<any[]>({
    queryKey: ["tenders-lessons"],
    queryFn: async () => {
      const res = await authFetch("/api/tenders/tender-evaluation/lessons");
      if (!res.ok) return FALLBACK_LESSONS;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_LESSONS;
    },
    staleTime: 30_000,
    retry: 1,
  });


  const [activeTab, setActiveTab] = useState("matrix");
  const [search, setSearch] = useState("");
  const [expandedTender, setExpandedTender] = useState<string | null>(null);

  const avgScore = Math.round(TENDERS_EVAL.reduce((s, t) => s + calcWeighted(t.scores), 0) / TENDERS_EVAL.length);
  const highestRated = TENDERS_EVAL.reduce((best, t) => calcWeighted(t.scores) > calcWeighted(best.scores) ? t : best);
  const pendingDecisions = GO_NOGO.filter(o => o.decision === "pending").length;

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardCheck className="h-7 w-7 text-primary" /> הערכת מכרזים וניקוד
          </h1>
          <p className="text-sm text-muted-foreground mt-1">מערכת הערכה, ניקוד ומעקב אחר מכרזים - טכנו-כל עוזי</p>
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input placeholder="חיפוש מכרז..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9 w-64 bg-background/50" />
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { icon: ClipboardCheck, label: "מכרזים להערכה", value: TENDERS_EVAL.length, color: "text-blue-400", bg: "bg-blue-500/10" },
          { icon: BarChart3, label: "הוערכו החודש", value: 14, color: "text-green-400", bg: "bg-green-500/10" },
          { icon: Target, label: "ציון ממוצע", value: avgScore, color: "text-purple-400", bg: "bg-purple-500/10" },
          { icon: Trophy, label: "מדורג הגבוה ביותר", value: highestRated.id, color: "text-amber-400", bg: "bg-amber-500/10" },
          { icon: Clock, label: "ממתינים להחלטה", value: pendingDecisions, color: "text-orange-400", bg: "bg-orange-500/10" },
        ].map((kpi, i) => (
          <Card key={i} className="bg-card/50 border-border/50">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2.5 rounded-lg ${kpi.bg}`}>
                <kpi.icon className={`h-5 w-5 ${kpi.color}`} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{kpi.label}</p>
                <p className="text-lg font-bold">{kpi.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-4 w-full">
          <TabsTrigger value="matrix" className="flex items-center gap-1"><BarChart3 className="h-4 w-4" />מטריצת הערכה</TabsTrigger>
          <TabsTrigger value="gonogo" className="flex items-center gap-1"><Target className="h-4 w-4" />החלטות Go/No-Go</TabsTrigger>
          <TabsTrigger value="competitors" className="flex items-center gap-1"><Swords className="h-4 w-4" />ניתוח מתחרים</TabsTrigger>
          <TabsTrigger value="lessons" className="flex items-center gap-1"><BookOpen className="h-4 w-4" />לקחים נלמדים</TabsTrigger>
        </TabsList>

        {/* Tab 1: Evaluation Matrix */}
        <TabsContent value="matrix" className="space-y-4">
          <div className="flex items-center gap-4 mb-2">
            <p className="text-sm text-muted-foreground">קריטריונים:</p>
            {CRITERIA.map(c => (
              <Badge key={c.key} variant="outline" className="text-xs">{c.label} ({c.weight}%)</Badge>
            ))}
          </div>
          {TENDERS_EVAL.filter(t => !search || t.name.includes(search) || t.id.includes(search)).map(tender => {
            const weighted = calcWeighted(tender.scores);
            const isExpanded = expandedTender === tender.id;
            return (
              <Card key={tender.id} className="bg-card/50 border-border/50 hover:border-primary/30 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between cursor-pointer" onClick={() => setExpandedTender(isExpanded ? null : tender.id)}>
                    <div className="flex items-center gap-3">
                      <div className={`w-12 h-12 rounded-lg flex items-center justify-center text-sm font-bold ${weighted >= 80 ? "bg-green-500/20 text-green-400" : weighted >= 65 ? "bg-yellow-500/20 text-yellow-400" : "bg-red-500/20 text-red-400"}`}>
                        {Math.round(weighted)}
                      </div>
                      <div>
                        <p className="font-semibold">{tender.name}</p>
                        <p className="text-xs text-muted-foreground">{tender.id} | {tender.client} | מועד אחרון: {tender.deadline}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={weighted >= 80 ? "bg-green-500/20 text-green-400" : weighted >= 65 ? "bg-yellow-500/20 text-yellow-400" : "bg-red-500/20 text-red-400"}>
                        {weighted >= 80 ? "מומלץ" : weighted >= 65 ? "סביר" : "חלש"}
                      </Badge>
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="mt-4 space-y-3 border-t border-border/50 pt-4">
                      {CRITERIA.map(c => (
                        <div key={c.key} className="flex items-center gap-4">
                          <span className="text-sm w-32 text-muted-foreground">{c.label} ({c.weight}%)</span>
                          <div className="flex-1">
                            <Progress value={tender.scores[c.key]} className="h-3" />
                          </div>
                          <span className="text-sm font-mono w-12 text-left">{tender.scores[c.key]}/100</span>
                          <span className="text-xs text-muted-foreground w-16 text-left">{((tender.scores[c.key] * c.weight) / 100).toFixed(1)} נק'</span>
                        </div>
                      ))}
                      <div className="flex items-center justify-between pt-2 border-t border-border/30">
                        <span className="font-semibold">ציון משוקלל סופי</span>
                        <span className="text-lg font-bold text-primary">{weighted.toFixed(1)} / 100</span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        {/* Tab 2: Go/No-Go Decisions */}
        <TabsContent value="gonogo" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {GO_NOGO.filter(o => !search || o.name.includes(search) || o.id.includes(search)).map(opp => (
              <Card key={opp.id} className="bg-card/50 border-border/50">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold">{opp.name}</CardTitle>
                    {decisionBadge(opp.decision)}
                  </div>
                  <p className="text-xs text-muted-foreground">{opp.id} | שווי: {(opp.value / 1000000).toFixed(1)}M ש"ח</p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground flex items-center gap-1"><AlertTriangle className="h-3 w-3" />סיכון</span>
                    <Badge className={riskColor(opp.risk)}>{opp.risk}</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground flex items-center gap-1"><TrendingUp className="h-3 w-3" />תגמול</span>
                    <span className="text-sm font-medium">{opp.reward}</span>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground flex items-center gap-1"><Shield className="h-3 w-3" />התאמה אסטרטגית</span>
                      <span className="font-medium">{opp.fit}%</span>
                    </div>
                    <Progress value={opp.fit} className="h-2" />
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground flex items-center gap-1"><Users className="h-3 w-3" />זמינות משאבים</span>
                      <span className="font-medium">{opp.resources}%</span>
                    </div>
                    <Progress value={opp.resources} className="h-2" />
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground flex items-center gap-1"><Star className="h-3 w-3" />סיכויי זכייה</span>
                      <span className="font-medium">{opp.winProb}%</span>
                    </div>
                    <Progress value={opp.winProb} className="h-2" />
                  </div>
                  {opp.decision === "pending" && (
                    <div className="flex gap-2 pt-2">
                      <Button size="sm" className="flex-1 bg-green-600 hover:bg-green-700"><ThumbsUp className="h-3.5 w-3.5 ml-1" />GO</Button>
                      <Button size="sm" variant="destructive" className="flex-1"><ThumbsDown className="h-3.5 w-3.5 ml-1" />NO-GO</Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Tab 3: Competitor Analysis */}
        <TabsContent value="competitors" className="space-y-4">
          {COMPETITORS.filter(g => !search || g.tender.includes(search)).map(group => {
            const tender = TENDERS_EVAL.find(t => t.id === group.tender);
            return (
              <Card key={group.tender} className="bg-card/50 border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Eye className="h-4 w-4 text-primary" />
                    {group.tender} - {tender?.name || "מכרז"}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">{group.competitors.length} מתחרים מזוהים</p>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {group.competitors.map((comp, idx) => (
                      <div key={idx} className="p-3 rounded-lg bg-background/40 border border-border/30">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-semibold text-sm">{comp.name}</span>
                          <Badge variant="outline" className="text-xs">{comp.position}</Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <p className="text-green-400 font-medium mb-1 flex items-center gap-1"><ThumbsUp className="h-3 w-3" />חוזקות</p>
                            <p className="text-muted-foreground">{comp.strengths}</p>
                          </div>
                          <div>
                            <p className="text-red-400 font-medium mb-1 flex items-center gap-1"><ThumbsDown className="h-3 w-3" />חולשות</p>
                            <p className="text-muted-foreground">{comp.weaknesses}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        {/* Tab 4: Lessons Learned */}
        <TabsContent value="lessons" className="space-y-4">
          <div className="grid grid-cols-3 gap-4 mb-4">
            {[
              { label: "זכיות", count: LESSONS.filter(l => l.outcome === "זכייה").length, color: "text-green-400", bg: "bg-green-500/10", icon: Trophy },
              { label: "הפסדים", count: LESSONS.filter(l => l.outcome === "הפסד").length, color: "text-red-400", bg: "bg-red-500/10", icon: AlertTriangle },
              { label: "ביטולים", count: LESSONS.filter(l => l.outcome === "ביטול").length, color: "text-gray-400", bg: "bg-gray-500/10", icon: Clock },
            ].map((stat, i) => (
              <Card key={i} className="bg-card/50 border-border/50">
                <CardContent className="p-3 flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${stat.bg}`}><stat.icon className={`h-4 w-4 ${stat.color}`} /></div>
                  <div>
                    <p className="text-xs text-muted-foreground">{stat.label}</p>
                    <p className="text-xl font-bold">{stat.count}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          {LESSONS.filter(l => !search || l.title.includes(search) || l.tender.includes(search)).map(lesson => (
            <Card key={lesson.id} className="bg-card/50 border-border/50">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg mt-0.5 ${lesson.outcome === "זכייה" ? "bg-green-500/10" : lesson.outcome === "הפסד" ? "bg-red-500/10" : "bg-gray-500/10"}`}>
                    <Lightbulb className={`h-5 w-5 ${lesson.outcome === "זכייה" ? "text-green-400" : lesson.outcome === "הפסד" ? "text-red-400" : "text-gray-400"}`} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <p className="font-semibold">{lesson.title}</p>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">{lesson.category}</Badge>
                        <Badge className={lesson.outcome === "זכייה" ? "bg-green-500/20 text-green-400" : lesson.outcome === "הפסד" ? "bg-red-500/20 text-red-400" : "bg-gray-500/20 text-gray-400"}>
                          {lesson.outcome}
                        </Badge>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mb-2">{lesson.tender} | {lesson.date}</p>
                    <p className="text-sm text-muted-foreground leading-relaxed">{lesson.lesson}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
