import { useQuery } from "@tanstack/react-query";
import { entityFilter } from "@/lib/entity-api";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  TrendingUp, Activity, Clock, Target, AlertCircle,
  ThermometerSun, Heart, MessageCircle, BarChart3,
} from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { format, differenceInDays, differenceInHours } from "date-fns";
import { he } from "date-fns/locale";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface LeadRecord {
  id: string;
  sales_status?: string;
  created_date?: string;
  risk_score?: number;
  sentiment_score?: number;
  probability_to_close?: number;
  sla_status?: string;
  [key: string]: unknown;
}

interface LeadAnalyticsModuleProps {
  leadId: string;
  lead?: LeadRecord;
}

interface InteractionRecord {
  id: string;
  interaction_type: string;
  sentiment?: string;
  created_date: string;
  [key: string]: unknown;
}

interface EventRecord {
  id: string;
  created_date: string;
  [key: string]: unknown;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function LeadAnalyticsModule({ leadId, lead }: LeadAnalyticsModuleProps) {
  const { data: interactions = [] } = useQuery<InteractionRecord[]>({
    queryKey: ["leadInteractions", leadId],
    queryFn: () => entityFilter<InteractionRecord>("lead-interactions", { lead_id: leadId }),
  });

  const { data: events = [] } = useQuery<EventRecord[]>({
    queryKey: ["leadEvents", leadId],
    queryFn: () => entityFilter<EventRecord>("lead-events", { lead_id: leadId }),
  });

  const calculateMetrics = () => {
    const allActivities = [...interactions, ...events].sort(
      (a, b) => new Date(a.created_date).getTime() - new Date(b.created_date).getTime()
    );

    // Activity timeline
    const activityTimeline = allActivities.reduce<Array<{ date: string; count: number }>>(
      (acc, activity) => {
        const date = format(new Date(activity.created_date), "dd/MM");
        const existing = acc.find((item) => item.date === date);
        if (existing) {
          existing.count++;
        } else {
          acc.push({ date, count: 1 });
        }
        return acc;
      },
      []
    );

    // Average time between actions
    let totalTimeBetween = 0;
    for (let i = 1; i < allActivities.length; i++) {
      const diff = differenceInHours(
        new Date(allActivities[i].created_date),
        new Date(allActivities[i - 1].created_date)
      );
      totalTimeBetween += diff;
    }
    const avgTimeBetweenActions =
      allActivities.length > 1
        ? Math.round(totalTimeBetween / (allActivities.length - 1))
        : 0;

    // Time to win
    let timeToWin: number | null = null;
    if (lead?.sales_status === "won" && lead.created_date) {
      timeToWin = differenceInDays(new Date(), new Date(lead.created_date));
    }

    // Heat score
    const recentActivities = allActivities.filter((a) => {
      const daysSince = differenceInDays(new Date(), new Date(a.created_date));
      return daysSince <= 7;
    });
    const heatScore = Math.min(100, recentActivities.length * 10);

    // Risk score
    const riskScore = lead?.risk_score ?? calculateRiskScore(lead, allActivities);

    // Sentiment score
    const sentimentScore = lead?.sentiment_score ?? calculateSentiment(interactions);

    // Activity by type
    const activityByType = interactions.reduce<Array<{ type: string; count: number }>>(
      (acc, interaction) => {
        const type = interaction.interaction_type;
        const existing = acc.find((item) => item.type === getTypeLabel(type));
        if (existing) {
          existing.count++;
        } else {
          acc.push({ type: getTypeLabel(type), count: 1 });
        }
        return acc;
      },
      []
    );

    return {
      activityTimeline,
      avgTimeBetweenActions,
      timeToWin,
      heatScore,
      riskScore,
      sentimentScore,
      activityByType,
      totalActivities: allActivities.length,
      totalInteractions: interactions.length,
    };
  };

  const calculateRiskScore = (
    lead: LeadRecord | undefined,
    activities: Array<{ created_date: string }>
  ): number => {
    if (!lead) return 0;
    let score = 0;

    const lastActivity = activities[activities.length - 1];
    if (lastActivity) {
      const daysSinceLastActivity = differenceInDays(
        new Date(),
        new Date(lastActivity.created_date)
      );
      if (daysSinceLastActivity > 7) score += 30;
      else if (daysSinceLastActivity > 3) score += 15;
    }

    if (lead.created_date) {
      const daysSinceCreation = differenceInDays(new Date(), new Date(lead.created_date));
      if (daysSinceCreation > 14 && lead.sales_status === "new_lead") score += 25;
    }

    if ((lead.probability_to_close ?? 50) < 30) score += 20;
    if (lead.sla_status === "breached") score += 25;

    return Math.min(100, score);
  };

  const calculateSentiment = (interactions: InteractionRecord[]): number => {
    const sentiments = interactions
      .filter((i) => i.sentiment)
      .map((i) => {
        if (i.sentiment === "positive") return 1;
        if (i.sentiment === "negative") return -1;
        return 0;
      });

    if (sentiments.length === 0) return 0;
    const avg = sentiments.reduce((a, b) => a + b, 0) / sentiments.length;
    return Math.round(avg * 100) / 100;
  };

  const getTypeLabel = (type: string): string => {
    const labels: Record<string, string> = {
      phone_call: "\u05E9\u05D9\u05D7\u05D5\u05EA",
      email: "\u05DE\u05D9\u05D9\u05DC\u05D9\u05DD",
      whatsapp: "\u05D5\u05D5\u05D0\u05D8\u05E1\u05D0\u05E4",
      meeting: "\u05E4\u05D2\u05D9\u05E9\u05D5\u05EA",
    };
    return labels[type] || type;
  };

  const metrics = calculateMetrics();

  const getHeatColor = (score: number): string => {
    if (score >= 70) return "text-red-600 bg-red-100 border-red-200";
    if (score >= 40) return "text-orange-600 bg-orange-100 border-orange-200";
    return "text-blue-600 bg-blue-100 border-blue-200";
  };

  const getRiskColor = (score: number): string => {
    if (score >= 70) return "text-red-600 bg-red-100 border-red-200";
    if (score >= 40) return "text-orange-600 bg-orange-100 border-orange-200";
    return "text-green-600 bg-green-100 border-green-200";
  };

  const getSentimentColor = (score: number): string => {
    if (score > 0.3) return "text-green-600 bg-green-100 border-green-200";
    if (score < -0.3) return "text-red-600 bg-red-100 border-red-200";
    return "text-slate-600 bg-slate-100 border-slate-200";
  };

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2">
              <ThermometerSun className="w-8 h-8 text-orange-600" />
              <Badge className={`border ${getHeatColor(metrics.heatScore)}`}>
                {metrics.heatScore}%
              </Badge>
            </div>
            <h3 className="text-sm font-medium text-slate-600">\u05E6\u05D9\u05D5\u05DF \u05D7\u05D5\u05DD</h3>
            <p className="text-2xl font-bold text-slate-900">{metrics.heatScore}</p>
            <p className="text-xs text-slate-500 mt-1">\u05E4\u05E2\u05D9\u05DC\u05D5\u05EA \u05D1\u05E9\u05D1\u05D5\u05E2 \u05D4\u05D0\u05D7\u05E8\u05D5\u05DF</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2">
              <AlertCircle className="w-8 h-8 text-red-600" />
              <Badge className={`border ${getRiskColor(metrics.riskScore)}`}>
                {metrics.riskScore}%
              </Badge>
            </div>
            <h3 className="text-sm font-medium text-slate-600">\u05DE\u05D3\u05D3 \u05E1\u05D9\u05DB\u05D5\u05DF</h3>
            <p className="text-2xl font-bold text-slate-900">{metrics.riskScore}</p>
            <p className="text-xs text-slate-500 mt-1">\u05E1\u05D9\u05DB\u05D5\u05DF \u05DC\u05D0\u05D9\u05D1\u05D5\u05D3</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2">
              <MessageCircle className="w-8 h-8 text-purple-600" />
              <Badge className={`border ${getSentimentColor(metrics.sentimentScore)}`}>
                {metrics.sentimentScore > 0 ? "+" : ""}
                {metrics.sentimentScore}
              </Badge>
            </div>
            <h3 className="text-sm font-medium text-slate-600">\u05E6\u05D9\u05D5\u05DF \u05E1\u05E0\u05D8\u05D9\u05DE\u05E0\u05D8</h3>
            <p className="text-2xl font-bold text-slate-900">
              {metrics.sentimentScore > 0
                ? "\u05D7\u05D9\u05D5\u05D1\u05D9"
                : metrics.sentimentScore < 0
                ? "\u05E9\u05DC\u05D9\u05DC\u05D9"
                : "\u05E0\u05D9\u05D9\u05D8\u05E8\u05DC\u05D9"}
            </p>
            <p className="text-xs text-slate-500 mt-1">\u05DE\u05EA\u05D5\u05DA \u05E0\u05D9\u05EA\u05D5\u05D7 \u05E9\u05D9\u05D7\u05D5\u05EA</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2">
              <Clock className="w-8 h-8 text-blue-600" />
              <Badge variant="outline">{metrics.avgTimeBetweenActions}h</Badge>
            </div>
            <h3 className="text-sm font-medium text-slate-600">\u05DE\u05DE\u05D5\u05E6\u05E2 \u05D6\u05DE\u05DF \u05D1\u05D9\u05DF \u05E4\u05E2\u05D5\u05DC\u05D5\u05EA</h3>
            <p className="text-2xl font-bold text-slate-900">{metrics.avgTimeBetweenActions}</p>
            <p className="text-xs text-slate-500 mt-1">\u05E9\u05E2\u05D5\u05EA</p>
          </CardContent>
        </Card>
      </div>

      {/* Time to Win */}
      {metrics.timeToWin !== null && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="w-5 h-5 text-green-600" />
              \u05D6\u05DE\u05DF \u05E2\u05D3 \u05D6\u05DB\u05D9\u05D9\u05D4
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center">
              <p className="text-4xl font-bold text-green-600">{metrics.timeToWin}</p>
              <p className="text-slate-600 mt-2">\u05D9\u05DE\u05D9\u05DD \u05DE\u05D9\u05E6\u05D9\u05E8\u05EA \u05D4\u05DC\u05D9\u05D3 \u05E2\u05D3 \u05E1\u05D2\u05D9\u05E8\u05EA \u05D4\u05E2\u05E1\u05E7\u05D4</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Activity Timeline Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-indigo-600" />
            \u05D2\u05E8\u05E3 \u05E4\u05E2\u05D9\u05DC\u05D5\u05EA \u05DC\u05D0\u05D5\u05E8\u05DA \u05D6\u05DE\u05DF
          </CardTitle>
        </CardHeader>
        <CardContent>
          {metrics.activityTimeline.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={metrics.activityTimeline}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="#6366f1"
                  strokeWidth={2}
                  name="\u05E4\u05E2\u05D9\u05DC\u05D5\u05D9\u05D5\u05EA"
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-center py-8 text-slate-500">\u05D0\u05D9\u05DF \u05E0\u05EA\u05D5\u05E0\u05D9 \u05E4\u05E2\u05D9\u05DC\u05D5\u05EA</div>
          )}
        </CardContent>
      </Card>

      {/* Activity by Type */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-purple-600" />
            \u05E4\u05E2\u05D9\u05DC\u05D5\u05EA \u05DC\u05E4\u05D9 \u05E1\u05D5\u05D2
          </CardTitle>
        </CardHeader>
        <CardContent>
          {metrics.activityByType.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={metrics.activityByType}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="type" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#8b5cf6" name="\u05DB\u05DE\u05D5\u05EA" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-center py-8 text-slate-500">\u05D0\u05D9\u05DF \u05D0\u05D9\u05E0\u05D8\u05E8\u05D0\u05E7\u05E6\u05D9\u05D5\u05EA</div>
          )}
        </CardContent>
      </Card>

      {/* Summary Stats */}
      <Card>
        <CardHeader>
          <CardTitle>\u05E1\u05D8\u05D8\u05D9\u05E1\u05D8\u05D9\u05E7\u05D5\u05EA \u05DB\u05DC\u05DC\u05D9\u05D5\u05EA</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-slate-600">\u05E1\u05DA \u05E4\u05E2\u05D9\u05DC\u05D5\u05D9\u05D5\u05EA</p>
              <p className="text-2xl font-bold text-slate-900">{metrics.totalActivities}</p>
            </div>
            <div>
              <p className="text-sm text-slate-600">\u05D0\u05D9\u05E0\u05D8\u05E8\u05D0\u05E7\u05E6\u05D9\u05D5\u05EA</p>
              <p className="text-2xl font-bold text-slate-900">{metrics.totalInteractions}</p>
            </div>
            <div>
              <p className="text-sm text-slate-600">\u05D9\u05DE\u05D9\u05DD \u05D1\u05DE\u05E2\u05E8\u05DB\u05EA</p>
              <p className="text-2xl font-bold text-slate-900">
                {lead?.created_date
                  ? differenceInDays(new Date(), new Date(lead.created_date))
                  : 0}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
