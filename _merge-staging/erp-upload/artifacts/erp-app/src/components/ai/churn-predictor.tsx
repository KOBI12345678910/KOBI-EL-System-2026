import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { AlertTriangle, TrendingDown, Users, Loader2, CheckCircle, LucideIcon } from "lucide-react";
import { motion } from "framer-motion";
import { entityList } from "@/lib/entity-api";
import { authFetch } from "@/lib/utils";

interface CustomerPrediction {
  customer_name: string;
  company: string;
  churn_risk_score: number;
  risk_level: "low" | "medium" | "high" | "critical";
  risk_factors?: string[];
  recommended_actions?: string[];
}

interface PredictionSummary {
  total_at_risk?: number;
  total_revenue_at_risk?: number;
  main_risk_factors?: string[];
}

interface PredictionsResult {
  predictions: CustomerPrediction[];
  summary: PredictionSummary;
}

export default function ChurnPredictor() {
  const [loading, setLoading] = useState(false);
  const [predictions, setPredictions] = useState<PredictionsResult | null>(null);

  useEffect(() => {
    predictChurn();
  }, []);

  const predictChurn = async () => {
    setLoading(true);
    try {
      const [customers, deals, activities, opportunities] = await Promise.all([
        entityList<Record<string, unknown>>("customers", "-created_date", 100).catch(() => []),
        entityList<Record<string, unknown>>("deals", "-created_date", 100).catch(() => []),
        entityList<Record<string, unknown>>("activities", "-created_date", 200).catch(() => []),
        entityList<Record<string, unknown>>("opportunities", "-created_date", 100).catch(() => []),
      ]);

      const customerData = customers.map((customer) => {
        const customerDeals = deals.filter((d) => d.customer_id === customer.id);
        const customerActivities = activities.filter((a) => a.related_id === customer.id);
        const customerOpportunities = opportunities.filter((o) => o.customer_id === customer.id);

        const lastActivityDate =
          customerActivities.length > 0
            ? new Date(
                Math.max(
                  ...customerActivities.map((a) => new Date(a.created_date as string).getTime())
                )
              )
            : null;

        const daysSinceLastActivity = lastActivityDate
          ? Math.floor((Date.now() - lastActivityDate.getTime()) / (1000 * 60 * 60 * 24))
          : 999;

        return {
          id: customer.id,
          name: customer.name,
          company: customer.company,
          total_revenue: customer.total_revenue || 0,
          health_score: customer.health_score || 100,
          status: customer.status,
          deals_count: customerDeals.length,
          activities_count: customerActivities.length,
          opportunities_count: customerOpportunities.length,
          days_since_last_activity: daysSinceLastActivity,
          last_deal_date: customerDeals.length > 0 ? customerDeals[0].created_date : null,
        };
      });

      const res = await authFetch("/api/ai/invoke-llm", {
        method: "POST",
        body: JSON.stringify({
          prompt: `
אתה מודל ML לחיזוי churn של לקוחות. נתח את הנתונים הבאים וחזה אילו לקוחות בסיכון לעזוב:

נתוני לקוחות:
${customerData
  .slice(0, 30)
  .map(
    (c) => `
- ${c.name} (${c.company || "N/A"}):
  * Revenue: ${c.total_revenue} \u20AA
  * Health Score: ${c.health_score}
  * Deals: ${c.deals_count}
  * Activities: ${c.activities_count}
  * ימים מאז פעילות אחרונה: ${c.days_since_last_activity}
`
  )
  .join("\n")}

לכל לקוח, חשב:
1. סיכון churn (0-100) - ככל שגבוה יותר, יותר בסיכון
2. גורמי סיכון עיקריים
3. פעולות מומלצות למניעה
`,
          response_json_schema: {
            type: "object",
            properties: {
              predictions: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    customer_name: { type: "string" },
                    company: { type: "string" },
                    churn_risk_score: { type: "number" },
                    risk_level: {
                      type: "string",
                      enum: ["low", "medium", "high", "critical"],
                    },
                    risk_factors: { type: "array", items: { type: "string" } },
                    recommended_actions: { type: "array", items: { type: "string" } },
                  },
                },
              },
              summary: {
                type: "object",
                properties: {
                  total_at_risk: { type: "number" },
                  total_revenue_at_risk: { type: "number" },
                  main_risk_factors: { type: "array", items: { type: "string" } },
                },
              },
            },
          },
        }),
      });
      const result: PredictionsResult = await res.json();
      setPredictions(result);
    } catch (error) {
      console.error("Churn prediction failed:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card className="p-12 text-center">
        <Loader2 className="w-12 h-12 animate-spin mx-auto text-purple-600 mb-4" />
        <p className="text-slate-600">מנתח ומחזה churn...</p>
      </Card>
    );
  }

  if (!predictions) return null;

  const { predictions: customerPredictions, summary } = predictions;
  const sortedPredictions =
    customerPredictions?.sort((a, b) => b.churn_risk_score - a.churn_risk_score) || [];

  const getRiskColor = (level: string) => {
    switch (level) {
      case "critical":
        return "red";
      case "high":
        return "orange";
      case "medium":
        return "yellow";
      default:
        return "green";
    }
  };

  const getRiskIcon = (level: string): LucideIcon => {
    switch (level) {
      case "critical":
      case "high":
        return AlertTriangle;
      case "medium":
        return TrendingDown;
      default:
        return CheckCircle;
    }
  };

  return (
    <div className="space-y-4">
      {/* Summary */}
      <Card className="bg-gradient-to-r from-purple-50 to-pink-50 border-purple-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-purple-700">
            <TrendingDown className="w-5 h-5" />
            סיכום חיזוי Churn
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white p-4 rounded-xl">
              <div className="text-sm text-slate-600 mb-1">לקוחות בסיכון</div>
              <div className="text-3xl font-bold text-red-600">
                {summary?.total_at_risk || 0}
              </div>
            </div>
            <div className="bg-white p-4 rounded-xl">
              <div className="text-sm text-slate-600 mb-1">הכנסות בסיכון</div>
              <div className="text-3xl font-bold text-orange-600">
                {(summary?.total_revenue_at_risk || 0).toLocaleString()} \u20AA
              </div>
            </div>
            <div className="bg-white p-4 rounded-xl">
              <div className="text-sm text-slate-600 mb-1">גורמי סיכון עיקריים</div>
              <div className="text-lg font-bold text-purple-600">
                {summary?.main_risk_factors?.length || 0}
              </div>
            </div>
          </div>
          {summary?.main_risk_factors && summary.main_risk_factors.length > 0 && (
            <div className="mt-4 space-y-1">
              <div className="text-sm font-semibold text-slate-700">גורמי סיכון:</div>
              {summary.main_risk_factors.map((factor, i) => (
                <div key={i} className="text-sm text-slate-600">
                  \u2022 {factor}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Customer Predictions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-600" />
            חיזוי לפי לקוח
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {sortedPredictions.map((pred, i) => {
              const RiskIcon = getRiskIcon(pred.risk_level);
              const color = getRiskColor(pred.risk_level);

              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className={`p-4 rounded-xl border-2 border-${color}-200 bg-${color}-50`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <RiskIcon className={`w-5 h-5 text-${color}-600`} />
                      <div>
                        <div className="font-bold">{pred.customer_name}</div>
                        <div className="text-xs text-slate-600">{pred.company}</div>
                      </div>
                    </div>
                    <Badge className={`bg-${color}-600 text-white`}>
                      {pred.churn_risk_score}% סיכון
                    </Badge>
                  </div>

                  <div className="mb-2">
                    <Progress value={pred.churn_risk_score} className="h-2" />
                  </div>

                  <div className="space-y-2 text-sm">
                    <div>
                      <div className="font-semibold text-slate-700">גורמי סיכון:</div>
                      <ul className="mr-4 mt-1 space-y-1">
                        {pred.risk_factors?.map((factor, j) => (
                          <li key={j} className="text-slate-600">
                            \u2022 {factor}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <div className="font-semibold text-slate-700">פעולות מומלצות:</div>
                      <ul className="mr-4 mt-1 space-y-1">
                        {pred.recommended_actions?.map((action, j) => (
                          <li key={j} className={`text-${color}-700 font-medium`}>
                            \u2192 {action}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="text-center">
        <Button onClick={predictChurn} variant="outline">
          רענן חיזוי
        </Button>
      </div>
    </div>
  );
}
