import { useMemo } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Target } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface LeadData {
  id: number;
  name: string;
  engagement: number;
  company_fit: number;
  budget_alignment: number;
  previous_deals?: number;
}

interface ScoredLead extends LeadData {
  ai_score: number;
  priority: string;
  conversion_probability: number;
}

interface PredictiveLeadScorerProps {
  leads?: LeadData[];
}

export default function PredictiveLeadScorer({ leads = [] }: PredictiveLeadScorerProps) {
  const mockLeads: LeadData[] =
    leads.length === 0
      ? [
          { id: 1, name: "Lead A", engagement: 8, company_fit: 9, budget_alignment: 7, previous_deals: 5 },
          { id: 2, name: "Lead B", engagement: 6, company_fit: 4, budget_alignment: 8, previous_deals: 2 },
          { id: 3, name: "Lead C", engagement: 9, company_fit: 8, budget_alignment: 9, previous_deals: 8 },
          { id: 4, name: "Lead D", engagement: 4, company_fit: 6, budget_alignment: 5, previous_deals: 1 },
        ]
      : leads;

  const scoredLeads = useMemo<ScoredLead[]>(() => {
    return mockLeads
      .map((lead) => {
        const aiScore = Math.round(
          (lead.engagement * 0.35 +
            lead.company_fit * 0.3 +
            lead.budget_alignment * 0.2 +
            (lead.previous_deals || 0) * 1.5) /
            10
        );

        return {
          ...lead,
          ai_score: Math.min(aiScore, 100),
          priority: aiScore >= 80 ? "High" : aiScore >= 60 ? "Medium" : "Low",
          conversion_probability: Math.round(20 + aiScore * 0.8),
        };
      })
      .sort((a, b) => b.ai_score - a.ai_score);
  }, [mockLeads]);

  const scoreBreakdown = useMemo(() => {
    return scoredLeads.map((lead) => ({
      name: lead.name.substring(0, 10),
      score: lead.ai_score,
      probability: lead.conversion_probability,
    }));
  }, [scoredLeads]);

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="w-5 h-5 text-amber-600" />
          AI Predictive Lead Scoring
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Chart */}
        <div className="w-full h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={scoreBreakdown}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="score" fill="#f59e0b" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Leads List */}
        <div className="space-y-2">
          {scoredLeads.map((lead, idx) => (
            <div key={lead.id} className="p-3 border border-slate-200 rounded-lg hover:shadow-md">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="font-semibold text-slate-900">
                    {idx + 1}. {lead.name}
                  </p>
                  <p className="text-xs text-slate-500">
                    Engagement: {lead.engagement}/10 | Fit: {lead.company_fit}/10
                  </p>
                </div>
                <Badge
                  className={
                    lead.priority === "High"
                      ? "bg-emerald-100 text-emerald-700"
                      : lead.priority === "Medium"
                      ? "bg-amber-100 text-amber-700"
                      : "bg-slate-100 text-slate-700"
                  }
                >
                  {lead.priority} Priority
                </Badge>
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-600">AI Score</span>
                  <span className="text-sm font-bold text-amber-600">{lead.ai_score}/100</span>
                </div>
                <Progress value={lead.ai_score} className="h-2" />
                <p className="text-xs text-slate-600 mt-2">
                  Conversion Probability: <strong>{lead.conversion_probability}%</strong>
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* AI Insights */}
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-xs text-amber-700">
            <strong>AI Recommendation:</strong> Focus on top{" "}
            {Math.ceil(scoredLeads.length * 0.3)} leads.{" "}
            {scoredLeads[0] &&
              `Start with ${scoredLeads[0].name} (${scoredLeads[0].ai_score}% fit).`}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
