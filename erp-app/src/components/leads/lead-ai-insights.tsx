import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { authFetch } from '@/lib/utils';
import { AlertCircle, Zap, TrendingUp, Brain } from 'lucide-react';

interface Lead {
  name?: string;
  company?: string;
  email?: string;
  phone?: string;
  source?: string;
  status?: string;
  value?: number;
}

interface Insights {
  conversion_probability: number;
  strengths?: string[];
  improvement_tips?: string[];
  next_steps?: string[];
  recommended_services?: string[];
}

interface LeadAIInsightsProps {
  lead: Lead;
}

export default function LeadAIInsights({ lead }: LeadAIInsightsProps) {
  const [insights, setInsights] = useState<Insights | null>(null);
  const [loading, setLoading] = useState(false);

  const generateInsights = async () => {
    setLoading(true);
    try {
      const res = await authFetch("/api/ai/invoke-llm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: `Analyze this lead and provide AI insights to improve conversion chances:
          Name: ${lead.name}
          Company: ${lead.company}
          Email: ${lead.email}
          Phone: ${lead.phone}
          Source: ${lead.source}
          Status: ${lead.status}
          Value: ${lead.value}`,
          response_json_schema: {
            type: 'object',
            properties: {
              conversion_probability: { type: 'number' },
              strengths: { type: 'array', items: { type: 'string' } },
              improvement_tips: { type: 'array', items: { type: 'string' } },
              next_steps: { type: 'array', items: { type: 'string' } },
              recommended_services: { type: 'array', items: { type: 'string' } }
            }
          }
        })
      });
      const result = await res.json();
      setInsights(result.output || result);
    } catch (error) {
      console.error('Error generating insights:', error);
    }
    setLoading(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Brain className="w-5 h-5 text-purple-600" />AI Insights
        </h3>
        <Button onClick={generateInsights} disabled={loading} size="sm" className="gap-2">
          <Zap className="w-4 h-4" />{loading ? 'Analyzing...' : 'Analyze'}
        </Button>
      </div>

      {insights && (
        <div className="space-y-4">
          <Card className="border-purple-200 bg-purple-50">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-purple-600">Conversion Probability</p>
                  <p className="text-3xl font-bold text-purple-900">{insights.conversion_probability}%</p>
                </div>
                <div className="w-24 h-24 rounded-full bg-white flex items-center justify-center border-4 border-purple-300">
                  <div className="text-center">
                    <TrendingUp className="w-8 h-8 text-purple-600 mx-auto mb-1" />
                    <span className="text-sm font-bold text-purple-600">{insights.conversion_probability}%</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {insights.strengths && insights.strengths.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Strengths</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {insights.strengths.map((strength, idx) => (
                  <div key={idx} className="flex gap-2 text-sm">
                    <span className="text-green-600 font-bold">&#10003;</span>
                    <span className="text-slate-700">{strength}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {insights.improvement_tips && insights.improvement_tips.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Improvement Tips</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {insights.improvement_tips.map((tip, idx) => (
                  <div key={idx} className="flex gap-2 text-sm">
                    <span className="text-blue-600">*</span>
                    <span className="text-slate-700">{tip}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {insights.next_steps && insights.next_steps.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Recommended Next Steps</CardTitle></CardHeader>
              <CardContent>
                <ol className="space-y-2">
                  {insights.next_steps.map((step, idx) => (
                    <li key={idx} className="flex gap-2 text-sm">
                      <span className="text-orange-600 font-bold">{idx + 1}</span>
                      <span className="text-slate-700">{step}</span>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          )}

          {insights.recommended_services && insights.recommended_services.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Recommended Services</CardTitle></CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {insights.recommended_services.map((service, idx) => (
                  <Badge key={idx} className="bg-indigo-100 text-indigo-800">{service}</Badge>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
