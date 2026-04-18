import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { entityUpdate } from '@/lib/entity-api';
import { authFetch } from '@/lib/utils';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Brain, TrendingUp, Mail, Zap, Target, AlertCircle,
  CheckCircle2, Sparkles, RefreshCw, Copy
} from 'lucide-react';

interface Lead {
  id: string;
  first_name?: string;
  last_name?: string;
  company_name?: string;
  status?: string;
  interested_product?: string;
  problem_to_solve?: string;
  deal_value?: number;
  grade?: string;
  last_contacted_at?: string;
  stage?: string;
  urgency?: string;
  expected_close_date?: string;
  industry?: string;
  metadata?: Record<string, any>;
}

interface AIInsightsPanelProps {
  lead: Lead;
}

export default function AIInsightsPanel({ lead }: AIInsightsPanelProps) {
  const [generating, setGenerating] = useState(false);

  const calculateHeatScore = (): number => {
    let score = 0;

    if ((lead.deal_value ?? 0) > 100000) score += 30;
    else if ((lead.deal_value ?? 0) > 50000) score += 20;
    else if ((lead.deal_value ?? 0) > 10000) score += 10;

    if (lead.grade === 'hot') score += 25;
    else if (lead.grade === 'warm') score += 15;
    else if (lead.grade === 'cold') score += 5;

    if (lead.last_contacted_at) {
      const daysSinceContact = Math.floor((Date.now() - new Date(lead.last_contacted_at).getTime()) / (1000 * 60 * 60 * 24));
      if (daysSinceContact < 1) score += 20;
      else if (daysSinceContact < 3) score += 15;
      else if (daysSinceContact < 7) score += 10;
      else if (daysSinceContact < 14) score += 5;
    }

    if (lead.stage === 'negotiation') score += 15;
    else if (lead.stage === 'proposal') score += 12;
    else if (lead.stage === 'qualified') score += 8;
    else if (lead.stage === 'contacted') score += 5;

    if (lead.urgency === 'urgent') score += 10;
    else if (lead.urgency === 'high') score += 7;
    else if (lead.urgency === 'medium') score += 4;

    return Math.min(score, 100);
  };

  const heatScore = calculateHeatScore();

  const getHeatColor = (score: number): string => {
    if (score >= 80) return 'from-red-500 to-orange-500';
    if (score >= 60) return 'from-orange-500 to-yellow-500';
    if (score >= 40) return 'from-yellow-500 to-green-500';
    return 'from-blue-500 to-cyan-500';
  };

  const getHeatLabel = (score: number): string => {
    if (score >= 80) return 'hot-very';
    if (score >= 60) return 'hot';
    if (score >= 40) return 'warm';
    return 'cold';
  };

  const calculateWinProbability = (): number => {
    let probability = 50;

    if (lead.stage === 'negotiation') probability += 20;
    else if (lead.stage === 'proposal') probability += 10;
    else if (lead.stage === 'qualified') probability += 5;

    if (lead.grade === 'hot') probability += 15;
    else if (lead.grade === 'warm') probability += 5;
    else if (lead.grade === 'cold') probability -= 10;

    if (lead.urgency === 'urgent') probability += 10;

    if (lead.expected_close_date) {
      const daysToClose = Math.floor((new Date(lead.expected_close_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      if (daysToClose < 7) probability += 10;
      else if (daysToClose < 30) probability += 5;
    }

    return Math.max(0, Math.min(100, probability));
  };

  const winProbability = calculateWinProbability();

  const draftEmailMutation = useMutation({
    mutationFn: async () => {
      const prompt = `
You are a professional sales agent. Write a professional and personal email to the following client:

Name: ${lead.first_name} ${lead.last_name}
Company: ${lead.company_name || 'Not specified'}
Status: ${lead.status}
Interested in: ${lead.interested_product || 'Not specified'}
Problem to solve: ${lead.problem_to_solve || 'Not specified'}

Write a short, professional email (up to 150 words).
      `;
      const res = await authFetch("/api/ai/invoke-llm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt })
      });
      return res.json();
    },
    onSuccess: (result: any) => {
      navigator.clipboard.writeText(result?.text || result);
      toast.success('Email copied to clipboard');
    },
    onError: () => {
      toast.error('Error generating email');
    }
  });

  const enrichDataMutation = useMutation({
    mutationFn: async () => {
      const res = await authFetch("/api/ai/invoke-llm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: `Research the following company on Google:\n\nCompany name: ${lead.company_name}\nIndustry: ${lead.industry || 'Unknown'}\n\nReturn JSON with:\n{\n  "company_size_estimate": "1-10 / 11-50 / 51-200 / 201-500 / 500+",\n  "revenue_estimate": "Estimated annual revenue",\n  "key_competitors": ["Competitor 1", "Competitor 2"],\n  "market_position": "Brief market position description",\n  "recent_news": "Relevant recent news if any"\n}`,
          add_context_from_internet: true
        })
      });
      const result = await res.json();

      await entityUpdate<Lead>("leads", lead.id, {
        metadata: {
          ...lead.metadata,
          enrichment: result,
          enriched_at: new Date().toISOString()
        }
      } as Partial<Lead>);

      return result;
    },
    onSuccess: () => {
      toast.success('Data enriched successfully');
    },
    onError: () => {
      toast.error('Error enriching data');
    }
  });

  return (
    <div className="space-y-4">
      {/* Heat Score */}
      <Card className="border-0 shadow-xl overflow-hidden">
        <CardHeader className={`bg-gradient-to-r ${getHeatColor(heatScore)} text-white pb-4`}>
          <CardTitle className="text-lg font-bold flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <Zap className="w-5 h-5" />
            </div>
            Heat Score
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <div className="text-center">
            <div className="text-6xl font-bold text-slate-900 mb-2">
              {heatScore}
            </div>
            <div className="text-2xl font-semibold text-slate-700 mb-4">
              {getHeatLabel(heatScore)}
            </div>
            <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
              <div
                className={`h-full bg-gradient-to-r ${getHeatColor(heatScore)} transition-all duration-500`}
                style={{ width: `${heatScore}%` }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Win Probability */}
      <Card className="border-0 shadow-lg">
        <CardHeader className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white pb-4">
          <CardTitle className="text-base font-bold flex items-center gap-2">
            <Target className="w-5 h-5" />
            Win Probability
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-3xl font-bold text-slate-900">
                {winProbability}%
              </div>
              <div className="text-sm text-slate-600 mt-1">
                Close probability
              </div>
            </div>
            <div className={`p-3 rounded-xl ${winProbability >= 70 ? 'bg-green-100' : winProbability >= 40 ? 'bg-yellow-100' : 'bg-red-100'}`}>
              {winProbability >= 70 ? (
                <CheckCircle2 className="w-8 h-8 text-green-600" />
              ) : winProbability >= 40 ? (
                <TrendingUp className="w-8 h-8 text-yellow-600" />
              ) : (
                <AlertCircle className="w-8 h-8 text-red-600" />
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* AI Actions */}
      <Card className="border-0 shadow-lg">
        <CardHeader className="bg-gradient-to-r from-purple-600 to-pink-600 text-white pb-4">
          <CardTitle className="text-base font-bold flex items-center gap-2">
            <Brain className="w-5 h-5" />
            AI Actions
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 space-y-3">
          <Button
            onClick={() => draftEmailMutation.mutate()}
            disabled={draftEmailMutation.isPending}
            className="w-full gap-2 bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600"
          >
            {draftEmailMutation.isPending ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Mail className="w-4 h-4" />
            )}
            Draft Email
          </Button>

          {lead.company_name && (
            <Button
              onClick={() => enrichDataMutation.mutate()}
              disabled={enrichDataMutation.isPending}
              variant="outline"
              className="w-full gap-2"
            >
              {enrichDataMutation.isPending ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              Enrich Data from Web
            </Button>
          )}

          {lead.metadata?.enrichment && (
            <div className="mt-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
              <div className="text-xs font-semibold text-slate-700 mb-2">
                Enriched Data:
              </div>
              <div className="space-y-2 text-xs text-slate-600">
                {lead.metadata.enrichment.market_position && (
                  <div>
                    <span className="font-semibold">Market Position:</span> {lead.metadata.enrichment.market_position}
                  </div>
                )}
                {lead.metadata.enrichment.recent_news && (
                  <div>
                    <span className="font-semibold">News:</span> {lead.metadata.enrichment.recent_news}
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Insights */}
      <Card className="border-0 shadow-lg">
        <CardHeader className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white pb-4">
          <CardTitle className="text-base font-bold flex items-center gap-2">
            <Sparkles className="w-5 h-5" />
            Quick Insights
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <div className="space-y-2 text-sm">
            {!lead.last_contacted_at && (
              <div className="flex items-start gap-2 text-red-600">
                <AlertCircle className="w-4 h-4 mt-0.5" />
                <div>No contact yet - reach out immediately!</div>
              </div>
            )}

            {lead.expected_close_date && new Date(lead.expected_close_date) < new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) && (
              <div className="flex items-start gap-2 text-orange-600">
                <AlertCircle className="w-4 h-4 mt-0.5" />
                <div>Close date approaching - increase efforts</div>
              </div>
            )}

            {heatScore >= 80 && (
              <div className="flex items-start gap-2 text-green-600">
                <CheckCircle2 className="w-4 h-4 mt-0.5" />
                <div>Very hot lead - high priority!</div>
              </div>
            )}

            {!lead.deal_value && (
              <div className="flex items-start gap-2 text-blue-600">
                <TrendingUp className="w-4 h-4 mt-0.5" />
                <div>Add estimated deal value</div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
