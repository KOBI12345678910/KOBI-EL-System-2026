import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Map,
  Lightbulb,
  Pencil,
  Wrench,
  FlaskConical,
  Rocket,
  Package,
  Clock,
  CheckCircle2,
  TrendingUp,
  CalendarDays,
  Users,
} from "lucide-react";

const phases = [
  { key: "concept", label: "קונספט", icon: Lightbulb, color: "bg-yellow-100 text-yellow-800", border: "border-yellow-300" },
  { key: "design", label: "עיצוב", icon: Pencil, color: "bg-blue-100 text-blue-800", border: "border-blue-300" },
  { key: "prototype", label: "אב-טיפוס", icon: Wrench, color: "bg-purple-100 text-purple-800", border: "border-purple-300" },
  { key: "testing", label: "בדיקות", icon: FlaskConical, color: "bg-orange-100 text-orange-800", border: "border-orange-300" },
  { key: "launch", label: "השקה", icon: Rocket, color: "bg-green-100 text-green-800", border: "border-green-300" },
];

const products = [
  { id: 1, name: "חלון אלומיניום תרמי דור 4", phase: "testing", quarter: "Q2", progress: 82, team: "צוות חלונות", priority: "גבוה" },
  { id: 2, name: "דלת כניסה חכמה עם נעילה ביומטרית", phase: "prototype", quarter: "Q2", progress: 55, team: "צוות דלתות", priority: "גבוה" },
  { id: 3, name: "ויטרינה זכוכית כפולה Low-E Pro", phase: "design", quarter: "Q3", progress: 35, team: "צוות זכוכית", priority: "בינוני" },
  { id: 4, name: "מעקה זכוכית ללא מסגרת דור 2", phase: "launch", quarter: "Q1", progress: 100, team: "צוות מעקות", priority: "גבוה" },
  { id: 5, name: "פרגולת אלומיניום מתכווננת", phase: "testing", quarter: "Q2", progress: 75, team: "צוות פרגולות", priority: "בינוני" },
  { id: 6, name: "תריס חשמלי שקט Ultra-Quiet", phase: "prototype", quarter: "Q3", progress: 45, team: "צוות תריסים", priority: "בינוני" },
  { id: 7, name: "חלון הזזה תרמי מסילה כפולה", phase: "concept", quarter: "Q3", progress: 15, team: "צוות חלונות", priority: "נמוך" },
  { id: 8, name: "דלת מרפסת פנורמית 4 מ'", phase: "design", quarter: "Q3", progress: 28, team: "צוות דלתות", priority: "בינוני" },
  { id: 9, name: "מערכת חזיתות מבודדת ECO", phase: "concept", quarter: "Q4", progress: 10, team: "צוות חזיתות", priority: "גבוה" },
  { id: 10, name: "חלון עגול אלומיניום מותאם", phase: "design", quarter: "Q4", progress: 20, team: "צוות חלונות", priority: "נמוך" },
  { id: 11, name: "דלת הזזה אוטומטית מסחרית", phase: "concept", quarter: "Q4", progress: 8, team: "צוות דלתות", priority: "גבוה" },
  { id: 12, name: "מעקה פלדה-זכוכית משולב", phase: "prototype", quarter: "Q2", progress: 60, team: "צוות מעקות", priority: "בינוני" },
];

const quarters = ["Q1", "Q2", "Q3", "Q4"];

const phaseColor = (phase: string) => {
  const p = phases.find((ph) => ph.key === phase);
  return p ? p.color : "bg-gray-100 text-gray-800";
};

const priorityColor = (priority: string) => {
  switch (priority) {
    case "גבוה": return "bg-red-100 text-red-800";
    case "בינוני": return "bg-yellow-100 text-yellow-800";
    case "נמוך": return "bg-green-100 text-green-800";
    default: return "bg-gray-100 text-gray-800";
  }
};

export default function ProductRoadmap() {
  const [tab, setTab] = useState("timeline");

  const totalProducts = products.length;
  const inProgress = products.filter((p) => p.phase !== "launch").length;
  const launched = products.filter((p) => p.phase === "launch").length;
  const avgProgress = Math.round(products.reduce((s, p) => s + p.progress, 0) / products.length);
  const highPriority = products.filter((p) => p.priority === "גבוה").length;

  const kpis = [
    { label: "מוצרים בפיתוח", value: totalProducts, icon: Package, color: "text-blue-600" },
    { label: "בתהליך", value: inProgress, icon: Clock, color: "text-orange-600" },
    { label: "הושקו", value: launched, icon: CheckCircle2, color: "text-green-600" },
    { label: "התקדמות ממוצעת", value: `${avgProgress}%`, icon: TrendingUp, color: "text-purple-600" },
    { label: "עדיפות גבוהה", value: highPriority, icon: Rocket, color: "text-red-600" },
  ];

  return (
    <div dir="rtl" className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">מפת דרכים - פיתוח מוצרים</h1>
          <p className="text-muted-foreground mt-1">טכנו-כל עוזי - תכנון מוצרים 2026</p>
        </div>
        <Button><Map className="h-4 w-4 ml-2" />ייצוא מפת דרכים</Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="p-4 text-center">
              <kpi.icon className={`h-8 w-8 mx-auto mb-2 ${kpi.color}`} />
              <div className="text-2xl font-bold">{kpi.value}</div>
              <div className="text-xs text-muted-foreground">{kpi.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="timeline">ציר זמן</TabsTrigger>
          <TabsTrigger value="phases">שלבי פיתוח</TabsTrigger>
          <TabsTrigger value="products">רשימת מוצרים</TabsTrigger>
        </TabsList>

        <TabsContent value="timeline" className="space-y-4">
          {quarters.map((q) => {
            const qProducts = products.filter((p) => p.quarter === q);
            if (qProducts.length === 0) return null;
            return (
              <Card key={q}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CalendarDays className="h-5 w-5" />
                    רבעון {q} - 2026
                    <Badge variant="outline">{qProducts.length} מוצרים</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {qProducts.map((p) => {
                      const phaseInfo = phases.find((ph) => ph.key === p.phase);
                      return (
                        <div key={p.id} className={`p-3 border-r-4 ${phaseInfo?.border || "border-gray-300"} bg-gray-50 rounded-lg`}>
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-3">
                              {phaseInfo && <phaseInfo.icon className="h-5 w-5" />}
                              <div>
                                <div className="font-semibold">{p.name}</div>
                                <div className="text-sm text-muted-foreground flex items-center gap-2">
                                  <Users className="h-3 w-3" />{p.team}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge className={phaseColor(p.phase)}>{phaseInfo?.label}</Badge>
                              <Badge className={priorityColor(p.priority)}>{p.priority}</Badge>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <Progress value={p.progress} className="flex-1 h-2" />
                            <span className="text-sm font-bold min-w-[40px]">{p.progress}%</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="phases" className="space-y-4">
          {phases.map((phase) => {
            const phaseProducts = products.filter((p) => p.phase === phase.key);
            return (
              <Card key={phase.key}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <phase.icon className="h-5 w-5" />
                    {phase.label}
                    <Badge className={phase.color}>{phaseProducts.length}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {phaseProducts.length === 0 ? (
                    <p className="text-muted-foreground text-sm">אין מוצרים בשלב זה</p>
                  ) : (
                    <div className="space-y-2">
                      {phaseProducts.map((p) => (
                        <div key={p.id} className="flex items-center justify-between p-3 border rounded-lg">
                          <div>
                            <div className="font-medium">{p.name}</div>
                            <div className="text-sm text-muted-foreground">{p.team} | {p.quarter}</div>
                          </div>
                          <div className="flex items-center gap-3">
                            <Badge className={priorityColor(p.priority)}>{p.priority}</Badge>
                            <div className="flex items-center gap-2 min-w-[120px]">
                              <Progress value={p.progress} className="h-2 flex-1" />
                              <span className="text-sm font-bold">{p.progress}%</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="products" className="space-y-3">
          {products.sort((a, b) => b.progress - a.progress).map((p) => {
            const phaseInfo = phases.find((ph) => ph.key === p.phase);
            return (
              <Card key={p.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      {phaseInfo && <phaseInfo.icon className="h-5 w-5" />}
                      <div>
                        <div className="font-semibold">{p.name}</div>
                        <div className="text-sm text-muted-foreground flex items-center gap-3">
                          <span className="flex items-center gap-1"><Users className="h-3 w-3" />{p.team}</span>
                          <span className="flex items-center gap-1"><CalendarDays className="h-3 w-3" />{p.quarter} 2026</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={phaseColor(p.phase)}>{phaseInfo?.label}</Badge>
                      <Badge className={priorityColor(p.priority)}>{p.priority}</Badge>
                    </div>
                  </div>
                  <Progress value={p.progress} className="h-3" />
                  <div className="text-sm text-muted-foreground mt-1 text-left">{p.progress}% הושלם</div>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>
      </Tabs>
    </div>
  );
}
