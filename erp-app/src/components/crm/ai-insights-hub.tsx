import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Brain, Zap, AlertCircle, TrendingUp, Lightbulb, type LucideIcon } from "lucide-react";

interface Insight {
  type: string;
  icon: LucideIcon;
  title: string;
  desc: string;
  confidence: number;
}

export default function AIInsightsHub() {
  const insights: Insight[] = [
    {
      type: "recommendation",
      icon: Lightbulb,
      title: "Contact דינה עכשיו",
      desc: "היא לא הגיבה 2 ימים - דרוש follow-up",
      confidence: 94,
    },
    {
      type: "alert",
      icon: AlertCircle,
      title: "עסקה בסכנה",
      desc: "Deal B עלול להיסגר באובדן - risk 72%",
      confidence: 87,
    },
    {
      type: "prediction",
      icon: TrendingUp,
      title: "Lead זה יתן חתימה",
      desc: "Based on engagement - probability 89%",
      confidence: 89,
    },
    {
      type: "opportunity",
      icon: Zap,
      title: "Cross-sell opportunity",
      desc: "לקוח זה יכול לקנות 3 products נוספים",
      confidence: 76,
    },
  ];

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Brain className="w-5 h-5 text-purple-600" />
          AI Insights & Recommendations
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {insights.map((insight, idx) => {
          const Icon = insight.icon;
          return (
            <div key={idx} className="p-3 border border-slate-200 rounded-lg bg-slate-50 hover:shadow-md">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-4 h-4 text-purple-600" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-slate-900 text-sm">{insight.title}</p>
                  <p className="text-xs text-slate-600 mt-1">{insight.desc}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="w-20 bg-slate-200 rounded-full h-1.5">
                      <div
                        className="bg-purple-600 h-1.5 rounded-full"
                        style={{ width: `${insight.confidence}%` }}
                      />
                    </div>
                    <span className="text-xs font-semibold text-slate-700">{insight.confidence}%</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
