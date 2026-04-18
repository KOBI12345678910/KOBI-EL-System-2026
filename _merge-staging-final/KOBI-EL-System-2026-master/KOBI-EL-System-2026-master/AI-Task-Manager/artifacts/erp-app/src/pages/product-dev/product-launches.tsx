import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Rocket, Package, Calendar, TrendingUp, Star, Search,
  CheckCircle2, XCircle, Clock, BarChart3, MessageSquare,
  ShieldCheck, Users, Target, ThumbsUp, AlertTriangle
} from "lucide-react";

const stageMap: Record<string, { label: string; color: string }> = {
  "תכנון": { label: "תכנון", color: "bg-slate-500/20 text-slate-300" },
  "טרום-השקה": { label: "טרום-השקה", color: "bg-yellow-500/20 text-yellow-400" },
  "השקה": { label: "השקה", color: "bg-blue-500/20 text-blue-400" },
  "לאחר-השקה": { label: "לאחר-השקה", color: "bg-green-500/20 text-green-400" },
};

const FALLBACK_LAUNCHES = [
  { id: 1, name: "חלון אלומיניום תרמי 7000X", targetDate: "2026-06-15", stage: "טרום-השקה", readiness: 72, team: "הנדסה + שיווק" },
  { id: 2, name: "דלת זכוכית חכמה SmartEntry", targetDate: "2026-05-01", stage: "השקה", readiness: 95, team: "מוצר + מכירות" },
  { id: 3, name: "מערכת חיפוי אלומיניום ModularFace", targetDate: "2026-08-20", stage: "תכנון", readiness: 35, team: "הנדסה + ייצור" },
  { id: 4, name: "תריס ממונע SolarShade Pro", targetDate: "2026-07-10", stage: "טרום-השקה", readiness: 60, team: "מו\"מ + הנדסה" },
  { id: 5, name: "פרופיל אלומיניום UltraSlim 22", targetDate: "2026-04-01", stage: "לאחר-השקה", readiness: 100, team: "ייצור + QA" },
  { id: 6, name: "מעקה זכוכית FrameLess Elite", targetDate: "2026-09-15", stage: "תכנון", readiness: 20, team: "עיצוב + הנדסה" },
  { id: 7, name: "חלון הזזה כפול DualGlide", targetDate: "2026-03-10", stage: "לאחר-השקה", readiness: 100, team: "מכירות + שירות" },
  { id: 8, name: "דלת כניסה מאובטחת SecureMax", targetDate: "2026-10-01", stage: "טרום-השקה", readiness: 55, team: "אבטחה + הנדסה" },
];

const checklistData: Record<number, Record<string, boolean>> = {
  1: { engineering: true, certifications: false, bom: true, pricing: true, marketing: false, salesTraining: false, inventory: false, installGuide: false },
  2: { engineering: true, certifications: true, bom: true, pricing: true, marketing: true, salesTraining: true, inventory: true, installGuide: false },
  3: { engineering: false, certifications: false, bom: false, pricing: false, marketing: false, salesTraining: false, inventory: false, installGuide: false },
  4: { engineering: true, certifications: false, bom: true, pricing: false, marketing: true, salesTraining: false, inventory: false, installGuide: false },
  5: { engineering: true, certifications: true, bom: true, pricing: true, marketing: true, salesTraining: true, inventory: true, installGuide: true },
  6: { engineering: false, certifications: false, bom: false, pricing: false, marketing: false, salesTraining: false, inventory: false, installGuide: false },
  7: { engineering: true, certifications: true, bom: true, pricing: true, marketing: true, salesTraining: true, inventory: true, installGuide: true },
  8: { engineering: true, certifications: false, bom: true, pricing: false, marketing: false, salesTraining: false, inventory: true, installGuide: false },
};

const checklistLabels: Record<string, string> = {
  engineering: "הנדסה הושלמה",
  certifications: "תקנים והסמכות",
  bom: "BOM סופי",
  pricing: "תמחור נקבע",
  marketing: "חומרי שיווק",
  salesTraining: "הדרכת מכירות",
  inventory: "מלאי מוכן",
  installGuide: "מדריך התקנה",
};

const FALLBACK_FEEDBACK_DATA = [
  { productId: 5, product: "פרופיל UltraSlim 22", customerReaction: "מעולה - ביקוש גבוה מהצפוי", salesPerformance: "142% מהיעד", qualityIssues: "אין ליקויים משמעותיים", competitorResponse: "מתחרים הורידו מחירים ב-8%", rating: 4.8, reviewCount: 47 },
  { productId: 7, product: "חלון DualGlide", customerReaction: "חיובי - שיפור ניכר בתפקוד", salesPerformance: "118% מהיעד", qualityIssues: "2 דיווחים על רעש בהזזה", competitorResponse: "מתחרים השיקו מוצר דומה", rating: 4.5, reviewCount: 32 },
  { productId: 2, product: "דלת SmartEntry", customerReaction: "התלהבות מהטכנולוגיה החכמה", salesPerformance: "89% מהיעד (שבוע ראשון)", qualityIssues: "בעיית סנכרון אפליקציה - תוקנה", competitorResponse: "טרם הגיבו", rating: 4.3, reviewCount: 14 },
];

const FALLBACK_POST_LAUNCH_DATA = [
  { productId: 5, product: "פרופיל UltraSlim 22", salesVsForecast: 142, qualityScore: 97, satisfaction: 4.8, returnRate: 0.3, installTime: "ירידה של 22%", warranty: "0.5% תביעות" },
  { productId: 7, product: "חלון DualGlide", salesVsForecast: 118, qualityScore: 91, satisfaction: 4.5, returnRate: 1.2, installTime: "ירידה של 15%", warranty: "1.8% תביעות" },
];

const FALLBACK_KPIS = [
  { label: "מוצרים בהשקה", value: "8", icon: Rocket, color: "text-blue-400" },
  { label: "הושקו השנה", value: "3", icon: Package, color: "text-green-400" },
  { label: "זמן השקה ממוצע", value: "4.2", unit: "חודשים", icon: Calendar, color: "text-yellow-400" },
  { label: "שיעור הצלחת השקה", value: "87%", icon: TrendingUp, color: "text-emerald-400" },
  { label: "ציון משוב שוק", value: "4.6", unit: "/ 5", icon: Star, color: "text-amber-400" },
];

export default function ProductLaunchesPage() {
  const { data: productlaunchesData } = useQuery({
    queryKey: ["product-launches"],
    queryFn: () => authFetch("/api/product-dev/product_launches"),
    staleTime: 5 * 60 * 1000,
  });

  const launches = productlaunchesData ?? FALLBACK_LAUNCHES;
  const feedbackData = FALLBACK_FEEDBACK_DATA;
  const kpis = FALLBACK_KPIS;
  const postLaunchData = FALLBACK_POST_LAUNCH_DATA;

  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("all");

  const filtered = launches.filter(l => {
    const matchSearch = l.name.includes(search) || l.team.includes(search);
    const matchStage = stageFilter === "all" || l.stage === stageFilter;
    return matchSearch && matchStage;
  });

  return (
    <div dir="rtl" className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">ניהול השקות מוצרים</h1>
          <p className="text-muted-foreground text-sm mt-1">מעקב, תכנון והשקת מוצרים חדשים - טכנו-כל עוזי</p>
        </div>
        <Button variant="outline" size="sm" className="gap-2">
          <Package className="w-4 h-4" />השקה חדשה
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {kpis.map((k, i) => (
          <Card key={i} className="bg-muted/30 border-muted">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2 rounded-lg bg-muted/50 ${k.color}`}>
                <k.icon className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">{k.label}</div>
                <div className="text-lg font-bold">
                  {k.value}{k.unit && <span className="text-xs text-muted-foreground mr-1">{k.unit}</span>}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="launches" className="space-y-4">
        <TabsList className="bg-muted/50">
          <TabsTrigger value="launches" className="gap-1"><Rocket className="w-4 h-4" />השקות</TabsTrigger>
          <TabsTrigger value="checklist" className="gap-1"><ShieldCheck className="w-4 h-4" />רשימת בדיקה</TabsTrigger>
          <TabsTrigger value="feedback" className="gap-1"><MessageSquare className="w-4 h-4" />משוב שוק</TabsTrigger>
          <TabsTrigger value="postlaunch" className="gap-1"><BarChart3 className="w-4 h-4" />לאחר השקה</TabsTrigger>
        </TabsList>

        {/* Tab 1: Launches */}
        <TabsContent value="launches" className="space-y-4">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input placeholder="חיפוש מוצר או צוות..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9" />
            </div>
            <select className="bg-muted/50 border border-muted rounded-md px-3 py-2 text-sm" value={stageFilter} onChange={e => setStageFilter(e.target.value)}>
              <option value="all">כל השלבים</option>
              {Object.keys(stageMap).map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* Stage Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(stageMap).map(([key, val]) => {
              const count = launches.filter(l => l.stage === key).length;
              return (
                <div key={key} className={`rounded-lg p-3 text-center ${val.color} bg-opacity-10`}>
                  <div className="text-2xl font-bold">{count}</div>
                  <div className="text-xs mt-1">{val.label}</div>
                </div>
              );
            })}
          </div>

          <div className="grid gap-3">
            {filtered.map(launch => {
              const stage = stageMap[launch.stage];
              const completedItems = Object.values(checklistData[launch.id] || {}).filter(Boolean).length;
              const totalItems = Object.keys(checklistLabels).length;
              return (
                <Card key={launch.id} className="bg-muted/20 border-muted hover:border-muted-foreground/30 transition-colors">
                  <CardContent className="p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="p-2 rounded-lg bg-blue-500/10">
                          <Rocket className="w-5 h-5 text-blue-400" />
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-sm truncate">{launch.name}</div>
                          <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                            <Users className="w-3 h-3" />{launch.team}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 flex-wrap">
                        <div className="text-center">
                          <div className="text-xs text-muted-foreground">תאריך יעד</div>
                          <div className="text-sm font-medium">{new Date(launch.targetDate).toLocaleDateString("he-IL")}</div>
                        </div>
                        <Badge className={`${stage.color} text-xs`}>{stage.label}</Badge>
                        <div className="w-32">
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-muted-foreground">מוכנות</span>
                            <span className="font-medium">{launch.readiness}%</span>
                          </div>
                          <Progress value={launch.readiness} className="h-2" />
                        </div>
                        <div className="text-xs text-muted-foreground">{completedItems}/{totalItems} משימות</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            {filtered.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">לא נמצאו השקות מתאימות</div>
            )}
          </div>
        </TabsContent>

        {/* Tab 2: Checklist */}
        <TabsContent value="checklist" className="space-y-4">
          <p className="text-sm text-muted-foreground">רשימת בדיקה לכל מוצר - מעקב אחר השלמת כל שלבי ההשקה</p>
          <div className="grid gap-4">
            {launches.map(launch => {
              const cl = checklistData[launch.id] || {};
              const done = Object.values(cl).filter(Boolean).length;
              const total = Object.keys(checklistLabels).length;
              const pct = Math.round((done / total) * 100);
              return (
                <Card key={launch.id} className="bg-muted/20 border-muted">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Package className="w-4 h-4 text-blue-400" />
                        <span className="font-semibold text-sm">{launch.name}</span>
                        <Badge className={`${stageMap[launch.stage].color} text-xs`}>{launch.stage}</Badge>
                      </div>
                      <span className="text-sm font-medium">{done}/{total} ({pct}%)</span>
                    </div>
                    <Progress value={pct} className="h-2" />
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {Object.entries(checklistLabels).map(([key, label]) => (
                        <div key={key} className={`flex items-center gap-2 text-xs rounded-md px-2 py-1.5 ${cl[key] ? "bg-green-500/10 text-green-400" : "bg-muted/30 text-muted-foreground"}`}>
                          {cl[key] ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                          {label}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* Tab 3: Market Feedback */}
        <TabsContent value="feedback" className="space-y-4">
          <p className="text-sm text-muted-foreground">משוב שוק לאחר השקה - תגובות לקוחות, ביצועי מכירות ותגובת מתחרים</p>
          <div className="grid gap-4">
            {feedbackData.map((fb, i) => (
              <Card key={i} className="bg-muted/20 border-muted">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="w-4 h-4 text-purple-400" />
                      <span className="font-semibold text-sm">{fb.product}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1">
                        <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                        <span className="text-sm font-bold text-amber-400">{fb.rating}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">{fb.reviewCount} חוות דעת</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground flex items-center gap-1"><ThumbsUp className="w-3 h-3" />תגובת לקוחות</div>
                      <div className="text-sm bg-muted/30 rounded-md p-2">{fb.customerReaction}</div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground flex items-center gap-1"><TrendingUp className="w-3 h-3" />ביצועי מכירות</div>
                      <div className="text-sm bg-muted/30 rounded-md p-2">{fb.salesPerformance}</div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground flex items-center gap-1"><AlertTriangle className="w-3 h-3" />בעיות איכות</div>
                      <div className="text-sm bg-muted/30 rounded-md p-2">{fb.qualityIssues}</div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground flex items-center gap-1"><Target className="w-3 h-3" />תגובת מתחרים</div>
                      <div className="text-sm bg-muted/30 rounded-md p-2">{fb.competitorResponse}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Tab 4: Post-Launch */}
        <TabsContent value="postlaunch" className="space-y-4">
          <p className="text-sm text-muted-foreground">מעקב ביצועים לאחר השקה - מכירות מול תחזית, איכות ושביעות רצון</p>

          {/* Summary Row */}
          <Card className="bg-muted/20 border-muted">
            <CardContent className="p-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                <div>
                  <div className="text-xs text-muted-foreground">ממוצע מכירות מול תחזית</div>
                  <div className="text-xl font-bold text-green-400">130%</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">ממוצע ציון איכות</div>
                  <div className="text-xl font-bold text-blue-400">94</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">ממוצע שביעות רצון</div>
                  <div className="text-xl font-bold text-amber-400">4.65</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">ממוצע החזרות</div>
                  <div className="text-xl font-bold text-green-400">0.75%</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4">
            {postLaunchData.map((pl, i) => (
              <Card key={i} className="bg-muted/20 border-muted">
                <CardContent className="p-4 space-y-4">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-emerald-400" />
                    <span className="font-semibold text-sm">{pl.product}</span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div className="bg-muted/30 rounded-lg p-3 text-center">
                      <div className="text-xs text-muted-foreground mb-1">מכירות מול תחזית</div>
                      <div className={`text-xl font-bold ${pl.salesVsForecast >= 100 ? "text-green-400" : "text-yellow-400"}`}>
                        {pl.salesVsForecast}%
                      </div>
                      <Progress value={Math.min(pl.salesVsForecast, 150) / 1.5} className="h-1.5 mt-2" />
                    </div>
                    <div className="bg-muted/30 rounded-lg p-3 text-center">
                      <div className="text-xs text-muted-foreground mb-1">ציון איכות</div>
                      <div className={`text-xl font-bold ${pl.qualityScore >= 95 ? "text-green-400" : "text-blue-400"}`}>
                        {pl.qualityScore}
                      </div>
                      <Progress value={pl.qualityScore} className="h-1.5 mt-2" />
                    </div>
                    <div className="bg-muted/30 rounded-lg p-3 text-center">
                      <div className="text-xs text-muted-foreground mb-1">שביעות רצון</div>
                      <div className="text-xl font-bold text-amber-400">{pl.satisfaction}<span className="text-xs text-muted-foreground"> / 5</span></div>
                      <Progress value={pl.satisfaction * 20} className="h-1.5 mt-2" />
                    </div>
                    <div className="bg-muted/30 rounded-lg p-3 text-center">
                      <div className="text-xs text-muted-foreground mb-1">שיעור החזרות</div>
                      <div className={`text-xl font-bold ${pl.returnRate <= 1 ? "text-green-400" : "text-yellow-400"}`}>
                        {pl.returnRate}%
                      </div>
                    </div>
                    <div className="bg-muted/30 rounded-lg p-3 text-center">
                      <div className="text-xs text-muted-foreground mb-1">זמן התקנה</div>
                      <div className="text-sm font-bold text-blue-400">{pl.installTime}</div>
                    </div>
                    <div className="bg-muted/30 rounded-lg p-3 text-center">
                      <div className="text-xs text-muted-foreground mb-1">אחריות</div>
                      <div className="text-sm font-bold text-muted-foreground">{pl.warranty}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}