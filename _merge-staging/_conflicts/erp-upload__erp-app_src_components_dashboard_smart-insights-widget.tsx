import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Brain, Sparkles, Target, Eye } from "lucide-react";
import { Link } from "wouter";
import { createPageUrl } from "@/lib/route-map";
import { entityList, entityFilter } from "@/lib/entity-api";

interface InsightItem {
  title?: string;
  description?: string;
  priority?: string;
  recommendation_type?: string;
  confidence_score?: number;
}

export default function SmartInsightsWidget() {
  const { data: insights = [] } = useQuery({
    queryKey: ["ai-insights-top"],
    queryFn: () => entityList<InsightItem>("ai-insights", "-created_date", 5),
    refetchInterval: 30000,
  });

  const { data: recommendations = [] } = useQuery({
    queryKey: ["ai-recommendations-top"],
    queryFn: () => entityFilter<InsightItem>("ai-recommendations", { status: "pending" }),
    refetchInterval: 30000,
  });

  const topItems = [...insights, ...recommendations]
    .sort((a, b) => {
      const priorityOrder: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
      return (priorityOrder[b.priority || ""] || 0) - (priorityOrder[a.priority || ""] || 0);
    })
    .slice(0, 4);

  return (
    <Card className="border-0 shadow-2xl bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 text-white overflow-hidden relative">
      <div className="absolute top-0 left-0 w-64 h-64 bg-white/10 rounded-full blur-3xl" />
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-purple-400/10 rounded-full blur-3xl" />

      <CardHeader className="relative pb-3">
        <CardTitle className="text-xl font-bold flex items-center gap-3">
          <div className="relative">
            <div className="absolute inset-0 bg-white/30 rounded-2xl blur-md animate-pulse" />
            <div className="relative w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center shadow-lg">
              <Brain className="w-6 h-6 animate-pulse" />
            </div>
          </div>
          תובנות והמלצות AI
          <Badge className="bg-white/20 text-white border-white/30">
            <Sparkles className="w-3 h-3 ml-1" />
            Real-time
          </Badge>
        </CardTitle>
      </CardHeader>

      <CardContent className="relative space-y-3">
        {topItems.length === 0 ? (
          <div className="text-center py-8 text-white/70">
            <Brain className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p className="text-sm">אין תובנות חדשות כרגע</p>
          </div>
        ) : (
          topItems.map((item, idx) => {
            const isRecommendation = item.recommendation_type !== undefined;
            const Icon = isRecommendation ? Target : Sparkles;

            return (
              <div key={idx} className="p-4 bg-white/10 backdrop-blur-md rounded-xl border border-white/20 hover:bg-white/20 transition-all">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center flex-shrink-0">
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="font-semibold text-white">{item.title}</h4>
                      {item.priority && (
                        <Badge className={
                          item.priority === "critical" ? "bg-red-500 text-white" :
                          item.priority === "high" ? "bg-orange-400 text-white" :
                          "bg-white/20 text-white border-white/30"
                        }>
                          {item.priority === "critical" ? "קריטי" : item.priority === "high" ? "גבוה" : item.priority}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-white/90 mt-1">{item.description}</p>
                    {isRecommendation && item.confidence_score && (
                      <Badge className="bg-white/20 text-white border-white/30 mt-2 text-[10px]">
                        ביטחון: {item.confidence_score}%
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}

        <Link href={createPageUrl("AutomationCenter")}>
          <Button variant="secondary" className="w-full mt-4 bg-white/20 hover:bg-white/30 text-white border-white/30 backdrop-blur-sm">
            <Eye className="w-4 h-4 ml-2" />
            צפה בכל התובנות והאוטומציות
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}
