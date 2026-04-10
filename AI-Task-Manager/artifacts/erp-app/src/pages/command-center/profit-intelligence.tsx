/**
 * Profit Intelligence — deep financial truth engine.
 *
 * Shows the real P&L impact of every autonomous decision the system has made,
 * plus the cumulative profit contribution of AI actions to the business.
 */

import { useProfitSummary, useDecisions, useLearningStats } from "@/hooks/useRealtime";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import {
  DollarSign, TrendingUp, TrendingDown, BarChart3, PieChart,
  Target, Zap, Activity, ArrowUpRight, ArrowDownRight, Coins
} from "lucide-react";

export default function ProfitIntelligence() {
  const { data: summary } = useProfitSummary();
  const { data: decisions = [] } = useDecisions({});
  const { data: learning } = useLearningStats();

  const executedDecisions = decisions.filter(d => d.status === "executed");
  const totalRevenueImpact = executedDecisions.reduce((sum, d) => sum + (d.estimatedRevenueImpact ?? 0), 0);
  const totalCostImpact = executedDecisions.reduce((sum, d) => sum + (d.estimatedCostImpact ?? 0), 0);
  const totalProfitImpact = executedDecisions.reduce((sum, d) => sum + (d.estimatedProfitImpact ?? 0), 0);

  const byCategory: Record<string, { count: number; revenue: number; cost: number; profit: number }> = {};
  for (const d of executedDecisions) {
    const cat = d.category || "other";
    if (!byCategory[cat]) byCategory[cat] = { count: 0, revenue: 0, cost: 0, profit: 0 };
    byCategory[cat].count++;
    byCategory[cat].revenue += d.estimatedRevenueImpact ?? 0;
    byCategory[cat].cost += d.estimatedCostImpact ?? 0;
    byCategory[cat].profit += d.estimatedProfitImpact ?? 0;
  }

  const topContributors = executedDecisions
    .filter(d => (d.estimatedProfitImpact ?? 0) > 0)
    .sort((a, b) => (b.estimatedProfitImpact ?? 0) - (a.estimatedProfitImpact ?? 0))
    .slice(0, 10);

  const avgProfitPerDecision = executedDecisions.length > 0 ? totalProfitImpact / executedDecisions.length : 0;

  return (
    <div dir="rtl" className="min-h-screen bg-[#0a0e1a] text-white p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-3">
          <DollarSign className="w-7 h-7 text-green-400" />
          אינטליגנציית רווח
        </h1>
        <p className="text-white/60 text-sm mt-1">
          מנוע האמת הפיננסי — השפעה רווחית של כל החלטה אוטונומית, בהצטברות ולפי קטגוריה
        </p>
      </div>

      {/* Top KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-green-500/10 to-emerald-500/5 border-green-500/20">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-2">
              <TrendingUp className="w-5 h-5 text-green-400" />
              <Badge variant="outline" className="border-green-500/40 text-green-300 text-[10px]">
                הכנסה
              </Badge>
            </div>
            <div className="text-3xl font-bold text-green-400">
              ₪{(totalRevenueImpact / 1000).toFixed(0)}K
            </div>
            <div className="text-xs text-white/60 mt-1">השפעת הכנסה כוללת</div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-orange-500/10 to-red-500/5 border-orange-500/20">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-2">
              <TrendingDown className="w-5 h-5 text-orange-400" />
              <Badge variant="outline" className="border-orange-500/40 text-orange-300 text-[10px]">
                עלות
              </Badge>
            </div>
            <div className="text-3xl font-bold text-orange-400">
              ₪{(totalCostImpact / 1000).toFixed(0)}K
            </div>
            <div className="text-xs text-white/60 mt-1">השפעת עלות כוללת</div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-cyan-500/10 to-blue-500/5 border-cyan-500/20">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-2">
              <Coins className="w-5 h-5 text-cyan-400" />
              <Badge variant="outline" className="border-cyan-500/40 text-cyan-300 text-[10px]">
                רווח נטו
              </Badge>
            </div>
            <div className={`text-3xl font-bold ${totalProfitImpact >= 0 ? "text-cyan-400" : "text-red-400"}`}>
              {totalProfitImpact >= 0 ? "+" : ""}₪{(totalProfitImpact / 1000).toFixed(0)}K
            </div>
            <div className="text-xs text-white/60 mt-1">השפעת רווח כוללת מ-AI</div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-500/10 to-pink-500/5 border-purple-500/20">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-2">
              <Target className="w-5 h-5 text-purple-400" />
              <Badge variant="outline" className="border-purple-500/40 text-purple-300 text-[10px]">
                ממוצע
              </Badge>
            </div>
            <div className="text-3xl font-bold text-purple-400">
              ₪{(avgProfitPerDecision / 1000).toFixed(1)}K
            </div>
            <div className="text-xs text-white/60 mt-1">רווח ממוצע להחלטה</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* By Category */}
        <Card className="bg-[#0f1420] border-white/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PieChart className="w-5 h-5 text-cyan-400" />
              פילוח לפי קטגוריה
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(byCategory).length === 0 ? (
                <div className="text-center py-8 text-white/40 text-sm">
                  אין נתונים
                </div>
              ) : (
                Object.entries(byCategory)
                  .sort((a, b) => b[1].profit - a[1].profit)
                  .map(([cat, data]) => {
                    const maxProfit = Math.max(...Object.values(byCategory).map(c => Math.abs(c.profit)));
                    const widthPct = maxProfit > 0 ? (Math.abs(data.profit) / maxProfit) * 100 : 0;
                    return (
                      <div key={cat} className="space-y-1">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold">{cat}</span>
                            <Badge variant="outline" className="text-[10px]">
                              {data.count} החלטות
                            </Badge>
                          </div>
                          <div className={`text-sm font-bold ${data.profit >= 0 ? "text-green-400" : "text-red-400"}`}>
                            {data.profit >= 0 ? "+" : ""}₪{(data.profit / 1000).toFixed(1)}K
                          </div>
                        </div>
                        <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                          <div
                            className={`h-full ${data.profit >= 0 ? "bg-green-500" : "bg-red-500"}`}
                            style={{ width: `${widthPct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })
              )}
            </div>
          </CardContent>
        </Card>

        {/* Top Contributors */}
        <Card className="bg-[#0f1420] border-white/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-green-400" />
              החלטות המובילות לרווח
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[320px] pr-2">
              {topContributors.length === 0 ? (
                <div className="text-center py-8 text-white/40 text-sm">אין נתונים</div>
              ) : (
                <div className="space-y-2">
                  {topContributors.map((d, i) => (
                    <div key={d.id} className="p-3 rounded-lg bg-white/5 border border-white/10">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center font-bold text-green-400 text-sm">
                          {i + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold truncate">{d.title}</div>
                          <div className="text-xs text-white/60 truncate">{d.summary}</div>
                        </div>
                        <div className="text-left">
                          <div className="text-sm font-bold text-green-400">
                            +₪{((d.estimatedProfitImpact ?? 0) / 1000).toFixed(1)}K
                          </div>
                          <div className="text-[10px] text-white/50">{d.category}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Rule Effectiveness */}
      {learning && learning.ruleStats.length > 0 && (
        <Card className="bg-[#0f1420] border-white/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-yellow-400" />
              אפקטיביות כללי החלטה
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {learning.ruleStats.slice(0, 10).map((rule) => (
                <div key={rule.ruleId} className="p-3 rounded-lg bg-white/5 border border-white/10">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold truncate">{rule.ruleName}</div>
                      <div className="text-xs text-white/60">
                        {rule.triggered} הפעלות · {rule.successful}/{rule.executed} הצליחו
                      </div>
                    </div>
                    <div className="text-left">
                      <div className={`text-lg font-bold ${
                        rule.effectivenessScore >= 70 ? "text-green-400" :
                        rule.effectivenessScore >= 40 ? "text-yellow-400" :
                        "text-red-400"
                      }`}>
                        {rule.effectivenessScore.toFixed(0)}
                      </div>
                      <div className="text-[10px] text-white/50">effectiveness</div>
                    </div>
                  </div>
                  <Progress
                    value={rule.effectivenessScore}
                    className="h-1.5"
                  />
                  {rule.totalProfitImpact !== 0 && (
                    <div className="text-xs mt-2 flex items-center justify-between">
                      <span className="text-white/60">סך רווח: </span>
                      <span className={`font-bold ${rule.totalProfitImpact > 0 ? "text-green-400" : "text-red-400"}`}>
                        {rule.totalProfitImpact > 0 ? "+" : ""}₪{(rule.totalProfitImpact / 1000).toFixed(1)}K
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
