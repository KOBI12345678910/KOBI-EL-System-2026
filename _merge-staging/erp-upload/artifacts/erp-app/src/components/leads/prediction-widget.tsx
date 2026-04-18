import { useEffect, useState } from "react";
import { entityFilter } from "@/lib/entity-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, AlertCircle, CheckCircle2 } from "lucide-react";

interface PredictionWidgetProps {
  leadId: string;
}

export default function PredictionWidget({ leadId }: PredictionWidgetProps) {
  const [prediction, setPrediction] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPrediction = async () => {
      try {
        const predictions = await entityFilter<any>("lead-predictions", { lead_id: leadId });
        // Sort by created_date desc and take first
        const sorted = predictions.sort((a: any, b: any) =>
          new Date(b.created_date).getTime() - new Date(a.created_date).getTime()
        );
        if (sorted.length > 0) {
          setPrediction(sorted[0]);
        }
      } catch (error) {
        console.error("Error fetching prediction:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchPrediction();
  }, [leadId]);

  if (loading) return null;
  if (!prediction) return null;

  const { close_probability, churn_risk, factors, recommendations } = prediction;

  const getProbabilityColor = (prob: number) => {
    if (prob >= 75) return "text-green-600 bg-green-50";
    if (prob >= 50) return "text-blue-600 bg-blue-50";
    if (prob >= 25) return "text-yellow-600 bg-yellow-50";
    return "text-red-600 bg-red-50";
  };

  const getRiskBadgeVariant = (risk: number): "destructive" | "secondary" | "default" => {
    if (risk >= 75) return "destructive";
    if (risk >= 50) return "secondary";
    return "default";
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5" />
          AI Prediction
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Close Probability */}
        <div className={`p-4 rounded-lg ${getProbabilityColor(close_probability)}`}>
          <p className="text-sm font-medium opacity-75">Close Probability</p>
          <p className="text-3xl font-bold">{close_probability}%</p>
        </div>

        {/* Churn Risk */}
        <div>
          <p className="text-sm font-medium text-slate-600 mb-2">Churn Risk</p>
          <Badge variant={getRiskBadgeVariant(churn_risk)} className="text-sm">
            {churn_risk}%
          </Badge>
        </div>

        {/* Key Factors */}
        {factors && (
          <div>
            <p className="text-sm font-medium text-slate-600 mb-3">Influencing Factors</p>
            <div className="space-y-2">
              {Object.entries(factors).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between text-sm">
                  <span className="text-slate-600 capitalize">{key.replace(/_/g, " ")}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-2 bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-600"
                        style={{ width: `${value}%` }}
                      />
                    </div>
                    <span className="font-semibold text-slate-900 w-8 text-right">
                      {Math.round(value as number)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recommendations */}
        {recommendations && recommendations.length > 0 && (
          <div className="pt-4 border-t">
            <p className="text-sm font-medium text-slate-600 mb-3">Recommendations</p>
            <div className="space-y-2">
              {recommendations.map((rec: string, idx: number) => (
                <div key={idx} className="flex gap-2 text-sm">
                  {close_probability >= 60 ? (
                    <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                  )}
                  <p className="text-slate-700">{rec}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
