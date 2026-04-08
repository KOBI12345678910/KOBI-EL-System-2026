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
  TrendingUp, Users, Search, Plus, Download, Eye, Edit2,
  CheckCircle2, Clock, AlertTriangle, Target, Star, Award,
  ArrowUpRight, Handshake, BarChart3
} from "lucide-react";

const FALLBACK_SUPPLIERS = [
  { id: "SD-001", name: "אלומיניום הצפון בע\"מ", category: "חומרי גלם", program: "שיפור איכות פרופילים", startDate: "2025-10-01", endDate: "2026-09-30", progress: 72, kpiScore: 88, qualityBefore: 94.2, qualityTarget: 98, qualityCurrent: 96.8, deliveryBefore: 89, deliveryCurrent: 94, status: "פעיל", milestones: 5, completedMilestones: 3 },
  { id: "SD-002", name: "זכוכית ים תיכון", category: "חומרי גלם", program: "הסמכת ISO 9001", startDate: "2026-01-15", endDate: "2026-12-31", progress: 35, kpiScore: 76, qualityBefore: 91.5, qualityTarget: 97, qualityCurrent: 93.2, deliveryBefore: 85, deliveryCurrent: 90, status: "פעיל", milestones: 8, completedMilestones: 3 },
  { id: "SD-003", name: "פלדת אביב תעשיות", category: "חומרי גלם", program: "צמצום זמני אספקה", startDate: "2025-07-01", endDate: "2026-06-30", progress: 85, kpiScore: 92, qualityBefore: 96.1, qualityTarget: 97, qualityCurrent: 97.3, deliveryBefore: 78, deliveryCurrent: 93, status: "פעיל", milestones: 6, completedMilestones: 5 },
  { id: "SD-004", name: "סרביס-טק תחזוקה", category: "שירותים", program: "שיפור SLA תגובה", startDate: "2026-02-01", endDate: "2026-08-31", progress: 45, kpiScore: 71, qualityBefore: 87.0, qualityTarget: 95, qualityCurrent: 90.5, deliveryBefore: 82, deliveryCurrent: 88, status: "פעיל", milestones: 4, completedMilestones: 2 },
  { id: "SD-005", name: "גז-טכני ישראל", category: "אספקה", program: "אופטימיזציית עלויות", startDate: "2025-04-01", endDate: "2026-03-31", progress: 100, kpiScore: 95, qualityBefore: 99.0, qualityTarget: 99.5, qualityCurrent: 99.7, deliveryBefore: 95, deliveryCurrent: 98, status: "הושלם", milestones: 4, completedMilestones: 4 },
  { id: "SD-006", name: "אינסולייט מערכות", category: "חומרי גלם", program: "פיתוח חומר בידוד חדש", startDate: "2026-03-01", endDate: "2027-02-28", progress: 15, kpiScore: 65, qualityBefore: 88.0, qualityTarget: 95, qualityCurrent: 88.5, deliveryBefore: 80, deliveryCurrent: 82, status: "בתכנון", milestones: 7, completedMilestones: 1 },
  { id: "SD-007", name: "מדיד-טק מעבדות", category: "שירותים", program: "הרחבת שירותי כיול", startDate: "2025-11-01", endDate: "2026-10-31", progress: 60, kpiScore: 84, qualityBefore: 97.0, qualityTarget: 99, qualityCurrent: 98.1, deliveryBefore: 90, deliveryCurrent: 95, status: "פעיל", milestones: 5, completedMilestones: 3 },
  { id: "SD-008", name: "טרנספורט גליל", category: "לוגיסטיקה", program: "שיפור דיוק משלוחים", startDate: "2025-09-01", endDate: "2026-08-31", progress: 55, kpiScore: 69, qualityBefore: 85.0, qualityTarget: 95, qualityCurrent: 89.0, deliveryBefore: 76, deliveryCurrent: 84, status: "מעוכב", milestones: 6, completedMilestones: 3 },
];

const statusColors: Record<string, string> = {
  "פעיל": "bg-green-500/20 text-green-300 border-green-500/30",
  "בתכנון": "bg-blue-500/20 text-blue-300 border-blue-500/30",
  "הושלם": "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  "מעוכב": "bg-red-500/20 text-red-300 border-red-500/30",
};

export default function SupplierDevelopment() {
  const { data: supplierdevelopmentData } = useQuery({
    queryKey: ["supplier-development"],
    queryFn: () => authFetch("/api/supplier-mgmt/supplier_development"),
    staleTime: 5 * 60 * 1000,
  });

  const suppliers = supplierdevelopmentData ?? FALLBACK_SUPPLIERS;

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [activeTab, setActiveTab] = useState("overview");

  const filtered = useMemo(() => {
    return suppliers.filter(r => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        return r.name.toLowerCase().includes(s) || r.program.toLowerCase().includes(s);
      }
      return true;
    });
  }, [search, statusFilter]);

  const kpis = useMemo(() => {
    const avgProgress = Math.round(suppliers.reduce((s, sp) => s + sp.progress, 0) / suppliers.length);
    const avgKpi = Math.round(suppliers.reduce((s, sp) => s + sp.kpiScore, 0) / suppliers.length);
    return {
      totalPrograms: suppliers.length,
      activePrograms: suppliers.filter(s => s.status === "פעיל").length,
      avgProgress,
      avgKpiScore: avgKpi,
      delayed: suppliers.filter(s => s.status === "מעוכב").length,
    };
  }, []);

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Handshake className="h-7 w-7 text-teal-400" />
            פיתוח ספקים
          </h1>
          <p className="text-sm text-muted-foreground mt-1">תוכניות שיפור, KPI ומעקב התקדמות | טכנו-כל עוזי</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm"><Download className="w-4 h-4 ml-1" />ייצוא</Button>
          <Button size="sm" className="bg-teal-600 hover:bg-teal-700"><Plus className="w-4 h-4 ml-1" />תוכנית חדשה</Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="bg-gradient-to-br from-slate-800 to-slate-900 border-slate-700">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400">סה״כ תוכניות</p>
                <p className="text-2xl font-bold text-white">{kpis.totalPrograms}</p>
              </div>
              <Target className="h-8 w-8 text-slate-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-green-900/50 to-green-950 border-green-800/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-green-400">תוכניות פעילות</p>
                <p className="text-2xl font-bold text-green-300">{kpis.activePrograms}</p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-teal-900/50 to-teal-950 border-teal-800/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-teal-400">התקדמות ממוצעת</p>
                <p className="text-2xl font-bold text-teal-300">{kpis.avgProgress}%</p>
              </div>
              <TrendingUp className="h-8 w-8 text-teal-500" />
            </div>
            <Progress value={kpis.avgProgress} className="mt-2 h-1.5" />
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-amber-900/50 to-amber-950 border-amber-800/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-amber-400">ציון KPI ממוצע</p>
                <p className="text-2xl font-bold text-amber-300">{kpis.avgKpiScore}</p>
              </div>
              <Star className="h-8 w-8 text-amber-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-red-900/50 to-red-950 border-red-800/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-red-400">מעוכבים</p>
                <p className="text-2xl font-bold text-red-300">{kpis.delayed}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-red-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <TabsList className="bg-background/50">
            <TabsTrigger value="overview">סקירה כללית</TabsTrigger>
            <TabsTrigger value="details">טבלת פירוט</TabsTrigger>
          </TabsList>
          <div className="flex gap-2">
            <div className="relative">
              <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input placeholder="חיפוש ספק / תוכנית..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9 w-64 bg-background/50" />
            </div>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground">
              <option value="all">כל הסטטוסים</option>
              <option value="פעיל">פעיל</option>
              <option value="בתכנון">בתכנון</option>
              <option value="הושלם">הושלם</option>
              <option value="מעוכב">מעוכב</option>
            </select>
          </div>
        </div>

        {/* Overview Cards */}
        <TabsContent value="overview" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filtered.map(sp => (
              <Card key={sp.id} className="bg-card/50 border-border/50 hover:border-teal-800/50 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-bold text-foreground">{sp.name}</h3>
                      <p className="text-xs text-muted-foreground">{sp.program}</p>
                    </div>
                    <Badge className={statusColors[sp.status] || ""}>{sp.status}</Badge>
                  </div>

                  <div className="space-y-3">
                    {/* Progress */}
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-muted-foreground">התקדמות כללית</span>
                        <span className="text-foreground font-bold">{sp.progress}%</span>
                      </div>
                      <Progress value={sp.progress} className="h-2" />
                      <p className="text-xs text-muted-foreground mt-1">אבני דרך: {sp.completedMilestones}/{sp.milestones}</p>
                    </div>

                    {/* KPIs */}
                    <div className="grid grid-cols-3 gap-2">
                      <div className="p-2 rounded bg-muted/20 text-center">
                        <p className="text-xs text-muted-foreground">ציון KPI</p>
                        <p className={`text-lg font-bold ${sp.kpiScore >= 85 ? "text-green-400" : sp.kpiScore >= 70 ? "text-amber-400" : "text-red-400"}`}>
                          {sp.kpiScore}
                        </p>
                      </div>
                      <div className="p-2 rounded bg-muted/20 text-center">
                        <p className="text-xs text-muted-foreground">איכות</p>
                        <p className="text-sm font-bold text-foreground">{sp.qualityCurrent}%</p>
                        <div className="flex items-center justify-center text-xs">
                          <ArrowUpRight className="w-3 h-3 text-green-400" />
                          <span className="text-green-400">+{(sp.qualityCurrent - sp.qualityBefore).toFixed(1)}</span>
                        </div>
                      </div>
                      <div className="p-2 rounded bg-muted/20 text-center">
                        <p className="text-xs text-muted-foreground">אספקה</p>
                        <p className="text-sm font-bold text-foreground">{sp.deliveryCurrent}%</p>
                        <div className="flex items-center justify-center text-xs">
                          <ArrowUpRight className="w-3 h-3 text-green-400" />
                          <span className="text-green-400">+{sp.deliveryCurrent - sp.deliveryBefore}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{sp.startDate} - {sp.endDate}</span>
                      <Badge variant="outline" className="text-xs">{sp.category}</Badge>
                    </div>
                  </div>

                  <div className="flex gap-1 mt-3">
                    <Button variant="outline" size="sm" className="flex-1 text-xs"><Eye className="w-3 h-3 ml-1" />פרטים</Button>
                    <Button variant="outline" size="sm" className="flex-1 text-xs"><Edit2 className="w-3 h-3 ml-1" />עדכון</Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Details Table */}
        <TabsContent value="details" className="mt-4">
          <Card className="bg-card/50 border-border/50">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50 bg-muted/30">
                      <th className="text-right p-3 text-muted-foreground font-medium">ספק</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">תוכנית</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">קטגוריה</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">התקדמות</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">KPI</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">איכות (לפני/אחרי)</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">אספקה (לפני/אחרי)</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">אבני דרך</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">סטטוס</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(sp => (
                      <tr key={sp.id} className="border-b border-border/30 hover:bg-muted/20 transition-colors">
                        <td className="p-3 text-foreground font-medium">{sp.name}</td>
                        <td className="p-3 text-muted-foreground">{sp.program}</td>
                        <td className="p-3"><Badge variant="outline" className="text-xs">{sp.category}</Badge></td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <Progress value={sp.progress} className="h-2 w-16" />
                            <span className="text-xs text-foreground">{sp.progress}%</span>
                          </div>
                        </td>
                        <td className="p-3">
                          <span className={`font-bold ${sp.kpiScore >= 85 ? "text-green-400" : sp.kpiScore >= 70 ? "text-amber-400" : "text-red-400"}`}>
                            {sp.kpiScore}
                          </span>
                        </td>
                        <td className="p-3 text-xs">
                          <span className="text-muted-foreground">{sp.qualityBefore}%</span>
                          <span className="mx-1 text-muted-foreground">&rarr;</span>
                          <span className="text-green-400 font-bold">{sp.qualityCurrent}%</span>
                        </td>
                        <td className="p-3 text-xs">
                          <span className="text-muted-foreground">{sp.deliveryBefore}%</span>
                          <span className="mx-1 text-muted-foreground">&rarr;</span>
                          <span className="text-green-400 font-bold">{sp.deliveryCurrent}%</span>
                        </td>
                        <td className="p-3 text-foreground">{sp.completedMilestones}/{sp.milestones}</td>
                        <td className="p-3"><Badge className={statusColors[sp.status] || ""}>{sp.status}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
