import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Brain, TrendingUp, AlertCircle, CheckCircle2, Zap, type LucideIcon } from "lucide-react";

interface Lead {
  email?: string;
  phone?: string;
  estimated_value?: number;
  engagement_score?: number;
  status?: string;
  product_interest?: string;
  company?: string;
}

interface AdvancedLeadQualificationProps {
  lead: Lead | null;
}

export default function AdvancedLeadQualification({ lead }: AdvancedLeadQualificationProps) {
  if (!lead) return null;

  // AI Lead Score Calculation
  const leadScore = Math.min(
    100,
    (lead.email ? 10 : 0) +
      (lead.phone ? 10 : 0) +
      (lead.estimated_value ? Math.min(30, (lead.estimated_value / 10000) * 30) : 0) +
      (lead.engagement_score || 0) +
      (lead.status === "qualified" ? 25 : lead.status === "contacted" ? 15 : 0) +
      (lead.product_interest ? 10 : 0)
  );

  const qualificationMetrics = {
    email: lead.email ? 1 : 0,
    phone: lead.phone ? 1 : 0,
    company: lead.company ? 1 : 0,
    value: lead.estimated_value ? Math.min(1, lead.estimated_value / 50000) : 0,
    engagement: (lead.engagement_score || 0) / 100,
  };

  const completenessScore = Math.round(
    (Object.values(qualificationMetrics).reduce((a, b) => a + b, 0) /
      Object.keys(qualificationMetrics).length) *
      100
  );

  const getRecommendation = (): { text: string; color: string; icon: LucideIcon } => {
    if (leadScore >= 80) return { text: "Ready for Sales", color: "text-emerald-500", icon: CheckCircle2 };
    if (leadScore >= 60) return { text: "Nurture & Qualify", color: "text-amber-500", icon: Zap };
    return { text: "Need More Info", color: "text-red-500", icon: AlertCircle };
  };

  const recommendation = getRecommendation();
  const RecIcon = recommendation.icon;

  return (
    <div className="space-y-4">
      {/* Lead Score Card */}
      <Card className="border-0 shadow-sm bg-gradient-to-br from-indigo-50 to-purple-50">
        <CardContent className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <Brain className="w-6 h-6 text-purple-600" />
              <div>
                <p className="text-sm text-slate-600 font-medium">AI Lead Score</p>
                <p className="text-3xl font-bold text-purple-600">{Math.round(leadScore)}</p>
              </div>
            </div>
            <Badge className="bg-purple-100 text-purple-700">
              {leadScore >= 80 ? "High Priority" : leadScore >= 60 ? "Medium" : "Low"}
            </Badge>
          </div>
          <Progress value={leadScore} className="h-2" />
          <p className="text-xs text-slate-500 mt-2">Score calculated from completeness + engagement + value</p>
        </CardContent>
      </Card>

      {/* Qualification Metrics */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-sm">Qualification Metrics</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <div className="flex justify-between mb-1">
              <span className="text-xs font-medium text-slate-600">Profile Completeness</span>
              <span className="text-xs font-bold text-slate-900">{completenessScore}%</span>
            </div>
            <Progress value={completenessScore} className="h-1.5" />
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            {[
              { label: "Email", value: qualificationMetrics.email },
              { label: "Phone", value: qualificationMetrics.phone },
              { label: "Company", value: qualificationMetrics.company },
              { label: "Value Est.", value: qualificationMetrics.value },
            ].map((metric) => (
              <div key={metric.label} className="p-2 bg-slate-50 rounded-lg">
                <p className="text-xs text-slate-600">{metric.label}</p>
                <div className="w-full bg-slate-200 rounded-full h-1.5 mt-1">
                  <div
                    className="bg-indigo-600 h-1.5 rounded-full transition-all"
                    style={{ width: `${metric.value * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* AI Recommendation */}
      <Card className="border-0 shadow-sm bg-gradient-to-r from-blue-50 to-cyan-50">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <RecIcon className={`w-5 h-5 ${recommendation.color}`} />
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-900">{recommendation.text}</p>
              <p className="text-xs text-slate-600 mt-1">
                {leadScore >= 80
                  ? "Hand off to sales immediately"
                  : leadScore >= 60
                    ? "Send educational content and schedule follow-up"
                    : "Collect more qualification data before contact"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Next Best Actions */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-600" />
            Next Best Actions
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {leadScore >= 80 && (
            <>
              <Button variant="outline" size="sm" className="w-full justify-start">Send proposal</Button>
              <Button variant="outline" size="sm" className="w-full justify-start">Schedule call</Button>
            </>
          )}
          {leadScore >= 60 && leadScore < 80 && (
            <>
              <Button variant="outline" size="sm" className="w-full justify-start">Send nurture email</Button>
              <Button variant="outline" size="sm" className="w-full justify-start">Request missing info</Button>
            </>
          )}
          {leadScore < 60 && (
            <>
              <Button variant="outline" size="sm" className="w-full justify-start">Add to nurture sequence</Button>
              <Button variant="outline" size="sm" className="w-full justify-start">View engagement history</Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
