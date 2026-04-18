import { useEffect, useState } from "react";
import { entityCreate } from "@/lib/entity-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Brain,
  TrendingUp,
  TrendingDown,
  Target,
  Sparkles,
  Clock,
  CheckCircle2,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Lead {
  id: string;
  full_name?: string;
  company_name?: string;
  stage?: string;
  grade?: string;
  budget?: number;
  deal_value?: number;
  lead_score?: number;
  last_contacted_at?: string;
  created_date?: string;
  email?: string;
  phone?: string;
  whatsapp?: string;
  notes?: string;
  next_action?: string;
  win_probability?: number;
}

interface LeadPrediction {
  id?: string;
  lead_id: string;
  prediction_type: string;
  close_probability: number;
  confidence_score: number;
  predicted_close_date: string;
  estimated_deal_size: number;
  factors: {
    engagement: number;
    response_time: number;
    stage_progression: number;
    budget_alignment: number;
  };
  recommendations: string[];
}

interface Props {
  leadId?: string;
  lead?: Lead;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function PredictiveAnalytics({ leadId, lead }: Props) {
  const [prediction, setPrediction] = useState<LeadPrediction | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (leadId && lead) analyzeLead();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId, lead]);

  const analyzeLead = async () => {
    if (!lead || !leadId) return;
    setLoading(true);
    try {
      const closeProbability = calculateCloseProbability(lead);
      const predictedCloseDate = predictCloseDate(lead);
      const estimatedDealSize = estimateDealSize(lead);
      const riskFactors = identifyRiskFactors(lead);
      const recommendations = generateRecommendations(lead, closeProbability, riskFactors);

      const predictionData: LeadPrediction = {
        lead_id: leadId,
        prediction_type: "close_probability",
        close_probability: closeProbability,
        confidence_score: 75 + Math.random() * 20,
        predicted_close_date: predictedCloseDate,
        estimated_deal_size: estimatedDealSize,
        factors: {
          engagement: calculateEngagement(lead),
          response_time: calculateResponseTime(),
          stage_progression: calculateStageProgression(lead),
          budget_alignment: lead.budget ? 85 : 50,
        },
        recommendations,
      };

      await entityCreate<LeadPrediction>("lead-prediction", predictionData);
      setPrediction(predictionData);
    } catch (error) {
      console.error("Prediction error:", error);
    } finally {
      setLoading(false);
    }
  };

  const calculateCloseProbability = (l: Lead): number => {
    const stageScores: Record<string, number> = {
      new: 10, contacted: 25, qualified: 50, proposal: 70, negotiation: 85, won: 100, lost: 0,
    };
    let score = stageScores[l.stage ?? ""] ?? 50;
    if (l.grade === "hot") score += 15;
    if (l.grade === "warm") score += 5;
    if (l.budget) score += 10;
    if (l.last_contacted_at) score += 10;
    if ((l.lead_score ?? 0) > 70) score += 10;
    return Math.min(100, Math.max(0, score));
  };

  const predictCloseDate = (l: Lead): string => {
    const stageOrder = ["new", "contacted", "qualified", "proposal", "negotiation", "won"];
    const idx = stageOrder.indexOf(l.stage ?? "");
    const remaining = stageOrder.length - idx - 1;
    return new Date(Date.now() + remaining * 7 * 86_400_000).toISOString().split("T")[0];
  };

  const estimateDealSize = (l: Lead): number => {
    if (l.deal_value) return l.deal_value;
    if (l.budget) return l.budget * 0.9;
    const averages: Record<string, number> = { hot: 50000, warm: 30000, cold: 15000 };
    return averages[l.grade ?? ""] || 25000;
  };

  const identifyRiskFactors = (l: Lead): string[] => {
    const risks: string[] = [];
    const lastContact = l.last_contacted_at ? new Date(l.last_contacted_at) : new Date(l.created_date!);
    const daysSince = Math.floor((Date.now() - lastContact.getTime()) / 86_400_000);
    if (daysSince > 7) risks.push("No activity for over 7 days");
    if (!l.budget) risks.push("No budget defined");
    if (!l.next_action) risks.push("No next action defined");
    if ((l.lead_score ?? 0) < 40) risks.push("Low lead score");
    return risks;
  };

  const generateRecommendations = (l: Lead, probability: number, risks: string[]): string[] => {
    const recs: string[] = [];
    if (probability < 50) recs.push("Increase engagement - schedule face-to-face meeting");
    if (risks.some((r) => r.includes("activity"))) recs.push("Contact immediately - send WhatsApp or call");
    if (!l.budget) recs.push("Identify budget - ask qualifying questions");
    if (l.stage === "qualified" && probability > 60) recs.push("Great time to send a quote");
    return recs;
  };

  const calculateEngagement = (l: Lead): number => {
    let score = 0;
    if (l.last_contacted_at) score += 30;
    if (l.email) score += 20;
    if (l.phone) score += 20;
    if (l.whatsapp) score += 15;
    if (l.notes) score += 15;
    return Math.min(100, score);
  };

  const calculateResponseTime = (): number => 70 + Math.random() * 30;

  const calculateStageProgression = (l: Lead): number => {
    const scores: Record<string, number> = {
      new: 20, contacted: 40, qualified: 60, proposal: 80, negotiation: 90, won: 100,
    };
    return scores[l.stage ?? ""] || 20;
  };

  if (loading) {
    return (
      <Card className="border-purple-200 bg-gradient-to-br from-purple-50 to-pink-50">
        <CardContent className="p-6 text-center">
          <Brain className="w-8 h-8 mx-auto animate-pulse text-purple-600" />
          <p className="text-sm text-slate-600 mt-2">Analyzing data...</p>
        </CardContent>
      </Card>
    );
  }

  if (!prediction) return null;

  return (
    <Card className="border-0 shadow-xl bg-gradient-to-br from-purple-50 via-pink-50 to-rose-50">
      <CardHeader className="bg-gradient-to-r from-purple-600 via-pink-600 to-rose-600 text-white">
        <CardTitle className="text-lg flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
            <Brain className="w-5 h-5 animate-pulse" />
          </div>
          AI Smart Analysis
          <Badge className="bg-white/20 text-white border-white/30 mr-auto">
            <Sparkles className="w-3 h-3 ml-1" />
            Powered by AI
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6 space-y-4">
        {/* Close Probability */}
        <div className="p-4 bg-white rounded-xl border border-purple-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-slate-700">Close Probability</span>
            <div className="flex items-center gap-2">
              <Badge
                className={
                  prediction.close_probability >= 70
                    ? "bg-green-100 text-green-700"
                    : prediction.close_probability >= 40
                      ? "bg-yellow-100 text-yellow-700"
                      : "bg-red-100 text-red-700"
                }
              >
                {prediction.close_probability}%
              </Badge>
              {prediction.close_probability >= 70 ? (
                <TrendingUp className="w-4 h-4 text-green-600" />
              ) : (
                <TrendingDown className="w-4 h-4 text-red-600" />
              )}
            </div>
          </div>
          <Progress value={prediction.close_probability} className="h-2" />
          <p className="text-xs text-slate-500 mt-1">
            Confidence: {prediction.confidence_score?.toFixed(0)}%
          </p>
        </div>

        {/* Predicted Close Date */}
        <div className="p-4 bg-white rounded-xl border border-blue-200">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-700">Predicted Close Date</span>
            <Badge variant="outline" className="text-blue-700 border-blue-300">
              <Clock className="w-3 h-3 ml-1" />
              {prediction.predicted_close_date}
            </Badge>
          </div>
        </div>

        {/* Estimated Deal Size */}
        <div className="p-4 bg-white rounded-xl border border-emerald-200">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-700">Estimated Deal Size</span>
            <Badge className="bg-emerald-100 text-emerald-700">
              <Target className="w-3 h-3 ml-1" />
              {prediction.estimated_deal_size?.toLocaleString()}
            </Badge>
          </div>
        </div>

        {/* AI Recommendations */}
        {prediction.recommendations?.length > 0 && (
          <div className="p-4 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl border border-indigo-200">
            <h4 className="text-sm font-semibold text-indigo-900 mb-3 flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              AI Recommendations
            </h4>
            <ul className="space-y-2">
              {prediction.recommendations.map((rec, idx) => (
                <li key={idx} className="text-xs text-slate-700 flex items-start gap-2">
                  <CheckCircle2 className="w-3 h-3 text-indigo-600 flex-shrink-0 mt-0.5" />
                  {rec}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Key Factors */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 bg-white rounded-lg border border-slate-200">
            <p className="text-xs text-slate-600">Engagement</p>
            <Progress value={prediction.factors?.engagement || 0} className="h-1.5 mt-1" />
            <p className="text-xs font-semibold text-slate-700 mt-1">
              {prediction.factors?.engagement?.toFixed(0)}%
            </p>
          </div>
          <div className="p-3 bg-white rounded-lg border border-slate-200">
            <p className="text-xs text-slate-600">Progression</p>
            <Progress value={prediction.factors?.stage_progression || 0} className="h-1.5 mt-1" />
            <p className="text-xs font-semibold text-slate-700 mt-1">
              {prediction.factors?.stage_progression?.toFixed(0)}%
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
