import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  PieChart, TrendingUp, DollarSign, FileText, CheckCircle2,
  XCircle, Target, Clock, ArrowLeft, ChevronDown, Calendar,
  Filter, Award, Layers, BarChart3, AlertTriangle
} from "lucide-react";

const pipelineStages = [
  { name: "זוהה", count: 14, value: 28500000, color: "bg-gray-500", textColor: "text-gray-400" },
  { name: "הוכשר", count: 11, value: 22800000, color: "bg-blue-500", textColor: "text-blue-400" },
  { name: "בהכנה", count: 8, value: 18200000, color: "bg-amber-500", textColor: "text-amber-400" },
  { name: "הוגש", count: 6, value: 14500000, color: "bg-purple-500", textColor: "text-purple-400" },
  { name: "בהערכה", count: 4, value: 9800000, color: "bg-cyan-500", textColor: "text-cyan-400" },
  { name: "נמסר", count: 3, value: 7200000, color: "bg-green-500", textColor: "text-green-400" },
];

const monthlyTrends = [
  { month: "אוק׳ 2025", submitted: 4, won: 2, lost: 1, value: 3200000 },
  { month: "נוב׳ 2025", submitted: 6, won: 3, lost: 2, value: 5800000 },
  { month: "דצמ׳ 2025", submitted: 3, won: 1, lost: 1, value: 2100000 },
  { month: "ינו׳ 2026", submitted: 5, won: 2, lost: 2, value: 4500000 },
  { month: "פבר׳ 2026", submitted: 7, won: 4, lost: 1, value: 6200000 },
  { month: "מרץ 2026", submitted: 8, won: 3, lost: 2, value: 7800000 },
];

const recentActivity = [
  { tender: "חלונות אלומיניום - מגדלי הים", action: "הוגשה הצעה", time: "לפני 2 שעות", type: "submit" },
  { tender: "מעטפת זכוכית - עזריאלי", action: "עודכן מפרט טכני", time: "לפני 5 שעות", type: "update" },
  { tender: "דלתות מאובטחות - משהב״ט", action: "זכינו!", time: "אתמול", type: "won" },
  { tender: "חיפוי מתכת - קניון", action: "אושר תקציב", time: "אתמול", type: "update" },
  { tender: "מסגרות פלדה - גשר", action: "מועד אחרון בעוד 3 ימים", time: "היום", type: "alert" },
];

export default function TenderDashboard() {
  const totalPipeline = pipelineStages.reduce((s, st) => s + st.value, 0);
  const activeCount = pipelineStages.slice(1, 5).reduce((s, st) => s + st.count, 0);
  const submittedCount = pipelineStages[3].count + pipelineStages[4].count;
  const wonCount = pipelineStages[5].count;
  const lostTotal = 5;
  const winRate = Math.round((wonCount / (wonCount + lostTotal)) * 100);

  const kpis = [
    { label: "שווי צנרת", value: `₪${(totalPipeline / 1000000).toFixed(1)}M`, icon: DollarSign, color: "text-emerald-400", bg: "bg-emerald-500/10" },
    { label: "פעילים", value: activeCount.toString(), icon: FileText, color: "text-blue-400", bg: "bg-blue-500/10" },
    { label: "הוגשו", value: submittedCount.toString(), icon: CheckCircle2, color: "text-purple-400", bg: "bg-purple-500/10" },
    { label: "זכינו", value: wonCount.toString(), icon: Award, color: "text-green-400", bg: "bg-green-500/10" },
    { label: "הפסדנו", value: lostTotal.toString(), icon: XCircle, color: "text-red-400", bg: "bg-red-500/10" },
    { label: "אחוז זכייה", value: `${winRate}%`, icon: Target, color: "text-amber-400", bg: "bg-amber-500/10" },
  ];

  const maxFunnelCount = pipelineStages[0].count;

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Layers className="h-7 w-7 text-purple-400" />
            דשבורד מכרזים - טכנו-כל עוזי
          </h1>
          <p className="text-sm text-muted-foreground mt-1">סקירת צנרת מכרזים, מגמות הגשה וביצועים</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            <Calendar className="w-4 h-4 ml-1" />
            Q1 2026
          </Button>
          <Button variant="outline" size="sm">
            <Filter className="w-4 h-4 ml-1" />
            סינון
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpis.map((kpi, i) => (
          <Card key={i} className="bg-card/80 border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${kpi.bg}`}>
                  <kpi.icon className={`h-5 w-5 ${kpi.color}`} />
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground leading-tight">{kpi.label}</p>
                  <p className={`text-lg font-bold font-mono ${kpi.color}`}>{kpi.value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pipeline Funnel */}
        <Card className="bg-card/60 border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <PieChart className="h-5 w-5 text-purple-400" />
              משפך מכרזים
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {pipelineStages.map((stage, idx) => {
              const widthPct = Math.max(20, (stage.count / maxFunnelCount) * 100);
              return (
                <div key={idx} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className={`font-medium ${stage.textColor}`}>{stage.name}</span>
                      <Badge variant="outline" className="text-xs font-mono">{stage.count}</Badge>
                    </div>
                    <span className="text-xs font-mono text-muted-foreground">₪{(stage.value / 1000000).toFixed(1)}M</span>
                  </div>
                  <div className="w-full flex justify-center">
                    <div
                      className={`${stage.color} h-8 rounded-md flex items-center justify-center transition-all`}
                      style={{ width: `${widthPct}%` }}
                    >
                      <span className="text-white text-xs font-bold">{stage.count} מכרזים</span>
                    </div>
                  </div>
                  {idx < pipelineStages.length - 1 && (
                    <div className="flex justify-center">
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    </div>
                  )}
                </div>
              );
            })}
            <div className="mt-4 pt-3 border-t border-border/30 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">שיעור המרה כולל</span>
              <span className="text-lg font-bold font-mono text-green-400">
                {((pipelineStages[5].count / pipelineStages[0].count) * 100).toFixed(0)}%
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Monthly Trends */}
        <Card className="bg-card/60 border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-blue-400" />
              מגמות הגשה חודשיות
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {monthlyTrends.map((m, idx) => {
              const maxSubmitted = Math.max(...monthlyTrends.map((t) => t.submitted));
              return (
                <div key={idx} className="p-3 bg-muted/20 rounded-lg border border-border/30">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-medium text-foreground">{m.month}</h4>
                    <span className="text-xs font-mono text-muted-foreground">₪{(m.value / 1000000).toFixed(1)}M</span>
                  </div>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="flex-1">
                      <div className="flex h-5 rounded-full overflow-hidden bg-muted/30">
                        <div className="bg-blue-500 flex items-center justify-center" style={{ width: `${(m.submitted / maxSubmitted) * 100}%` }}>
                          <span className="text-[10px] text-white font-bold">{m.submitted}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-background/50 rounded p-1">
                      <p className="text-[10px] text-muted-foreground">הוגשו</p>
                      <p className="text-sm font-bold font-mono text-blue-400">{m.submitted}</p>
                    </div>
                    <div className="bg-background/50 rounded p-1">
                      <p className="text-[10px] text-muted-foreground">זכינו</p>
                      <p className="text-sm font-bold font-mono text-green-400">{m.won}</p>
                    </div>
                    <div className="bg-background/50 rounded p-1">
                      <p className="text-[10px] text-muted-foreground">הפסדנו</p>
                      <p className="text-sm font-bold font-mono text-red-400">{m.lost}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card className="bg-card/60 border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Clock className="h-5 w-5 text-amber-400" />
            פעילות אחרונה
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {recentActivity.map((a, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 bg-muted/20 rounded-lg border border-border/30">
                <div className="flex items-center gap-3">
                  {a.type === "submit" && <CheckCircle2 className="h-5 w-5 text-purple-400" />}
                  {a.type === "update" && <FileText className="h-5 w-5 text-blue-400" />}
                  {a.type === "won" && <Award className="h-5 w-5 text-green-400" />}
                  {a.type === "alert" && <AlertTriangle className="h-5 w-5 text-red-400" />}
                  <div>
                    <p className="text-sm font-medium text-foreground">{a.tender}</p>
                    <p className="text-xs text-muted-foreground">{a.action}</p>
                  </div>
                </div>
                <Badge variant="outline" className="text-xs text-muted-foreground">{a.time}</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
