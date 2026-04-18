import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Database, TrendingUp, Users, DollarSign, Clock } from "lucide-react";
import { entityList } from "@/lib/entity-api";
import { authFetch } from "@/lib/utils";

interface RAGMetrics {
  total_leads?: number;
  total_deals?: number;
  avg_deal_value?: number;
  conversion_rate?: number;
}

interface RelevantRecord {
  type: string;
  id: string;
  name: string;
  relevance: number;
}

interface RAGResult {
  answer: string;
  findings?: string[];
  metrics?: RAGMetrics;
  recommendations?: string[];
  relevant_records?: RelevantRecord[];
  raw_data?: Record<string, unknown>;
}

interface RAGSearchProps {
  query?: string;
  onResults?: (result: RAGResult) => void;
}

export default function RAGSearch({ query, onResults }: RAGSearchProps) {
  const [_loading, setLoading] = useState(false);
  const [results, setResults] = useState<RAGResult | null>(null);

  const searchCRMData = async (searchQuery: string) => {
    setLoading(true);
    try {
      const [leads, deals, opportunities, customers, activities] = await Promise.all([
        entityList<Record<string, unknown>>("leads", "-created_date", 50).catch(() => []),
        entityList<Record<string, unknown>>("deals", "-created_date", 50).catch(() => []),
        entityList<Record<string, unknown>>("opportunities", "-created_date", 50).catch(() => []),
        entityList<Record<string, unknown>>("customers", "-created_date", 50).catch(() => []),
        entityList<Record<string, unknown>>("activities", "-created_date", 100).catch(() => []),
      ]);

      const contextStr = buildContext({ leads, deals, opportunities, customers, activities });

      const res = await authFetch("/api/ai/invoke-llm", {
        method: "POST",
        body: JSON.stringify({
          prompt: `
אתה מנתח נתוני CRM מקצועי. יש לך גישה למאגר נתונים מלא של CRM Pro.

שאלת המשתמש: "${searchQuery}"

נתונים זמינים:
${contextStr}

משימתך:
1. מצא את הנתונים הרלוונטיים ביותר לשאלה
2. נתח את הנתונים וזהה patterns וtrends
3. תן תשובה מפורטת עם insights אקציונביליים
4. הוסף מספרים קונקרטיים וסטטיסטיקות
5. המלץ על צעדים הבאים

פורמט התשובה:
- תשובה ראשית (2-3 משפטים)
- ממצאים עיקריים (bullet points)
- מספרים ומטריקות
- המלצות פעולה
`,
          response_json_schema: {
            type: "object",
            properties: {
              answer: { type: "string" },
              findings: { type: "array", items: { type: "string" } },
              metrics: {
                type: "object",
                properties: {
                  total_leads: { type: "number" },
                  total_deals: { type: "number" },
                  avg_deal_value: { type: "number" },
                  conversion_rate: { type: "number" },
                },
              },
              recommendations: { type: "array", items: { type: "string" } },
              relevant_records: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    type: { type: "string" },
                    id: { type: "string" },
                    name: { type: "string" },
                    relevance: { type: "number" },
                  },
                },
              },
            },
          },
        }),
      });
      const aiResponse = await res.json();

      const result: RAGResult = {
        ...aiResponse,
        raw_data: { leads, deals, opportunities, customers, activities },
      };

      setResults(result);
      if (onResults) onResults(result);
      return result;
    } catch (error) {
      console.error("RAG Search failed:", error);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const buildContext = (data: Record<string, Record<string, unknown>[]>): string => {
    const { leads, deals, opportunities, customers, activities } = data;

    let ctx = `### \u05E1\u05D8\u05D8\u05D9\u05E1\u05D8\u05D9\u05E7\u05D5\u05EA \u05DB\u05DC\u05DC\u05D9\u05D5\u05EA:\n`;
    ctx += `- \u05E1\u05D4"\u05DB \u05DC\u05D9\u05D3\u05D9\u05DD: ${leads?.length || 0}\n`;
    ctx += `- \u05E1\u05D4"\u05DB \u05E2\u05E1\u05E7\u05D0\u05D5\u05EA: ${deals?.length || 0}\n`;
    ctx += `- \u05E1\u05D4"\u05DB \u05D4\u05D6\u05D3\u05DE\u05E0\u05D5\u05D9\u05D5\u05EA: ${opportunities?.length || 0}\n`;
    ctx += `- \u05E1\u05D4"\u05DB \u05DC\u05E7\u05D5\u05D7\u05D5\u05EA: ${customers?.length || 0}\n`;
    ctx += `- \u05E1\u05D4"\u05DB \u05E4\u05E2\u05D9\u05DC\u05D5\u05D9\u05D5\u05EA: ${activities?.length || 0}\n\n`;

    if (leads?.length > 0) {
      ctx += `### \u05DC\u05D9\u05D3\u05D9\u05DD \u05D0\u05D7\u05E8\u05D5\u05E0\u05D9\u05DD:\n`;
      leads.slice(0, 10).forEach((lead) => {
        ctx += `- ${lead.name} (${lead.company || "N/A"}): ${lead.status}, ${lead.source || "N/A"}, \u05E2\u05E8\u05DA \u05DE\u05E9\u05D5\u05E2\u05E8: ${lead.estimated_value || 0}\n`;
      });
      ctx += "\n";
    }

    if (deals?.length > 0) {
      ctx += `### \u05E2\u05E1\u05E7\u05D0\u05D5\u05EA \u05D0\u05D7\u05E8\u05D5\u05E0\u05D5\u05EA:\n`;
      const totalValue = deals.reduce((sum, d) => sum + ((d.deal_value as number) || 0), 0);
      ctx += `\u05E1\u05D4"\u05DB \u05E2\u05E8\u05DA \u05E2\u05E1\u05E7\u05D0\u05D5\u05EA: ${totalValue.toLocaleString()} \u20AA\n`;
      deals.slice(0, 10).forEach((deal) => {
        ctx += `- ${deal.name}: ${deal.status}, ${((deal.deal_value as number) || 0).toLocaleString()} \u20AA\n`;
      });
      ctx += "\n";
    }

    if (opportunities?.length > 0) {
      ctx += `### \u05D4\u05D6\u05D3\u05DE\u05E0\u05D5\u05D9\u05D5\u05EA \u05E4\u05E2\u05D9\u05DC\u05D5\u05EA:\n`;
      opportunities.slice(0, 10).forEach((opp) => {
        ctx += `- ${opp.name}: ${opp.status}, ${opp.probability_percentage || 0}% \u05D4\u05E1\u05EA\u05D1\u05E8\u05D5\u05EA, ${opp.estimated_value || 0} \u20AA\n`;
      });
      ctx += "\n";
    }

    if (customers?.length > 0) {
      ctx += `### \u05DC\u05E7\u05D5\u05D7\u05D5\u05EA:\n`;
      customers.slice(0, 10).forEach((cust) => {
        ctx += `- ${cust.name} (${cust.company || ""}): ${cust.status}, revenue: ${cust.total_revenue || 0} \u20AA\n`;
      });
      ctx += "\n";
    }

    if (activities?.length > 0) {
      const activityTypes = activities.reduce<Record<string, number>>((acc, act) => {
        const t = act.type as string;
        acc[t] = (acc[t] || 0) + 1;
        return acc;
      }, {});
      ctx += `### \u05E4\u05E2\u05D9\u05DC\u05D5\u05D9\u05D5\u05EA \u05DC\u05E4\u05D9 \u05E1\u05D5\u05D2:\n`;
      Object.entries(activityTypes).forEach(([type, count]) => {
        ctx += `- ${type}: ${count}\n`;
      });
    }

    return ctx;
  };

  useEffect(() => {
    if (query) {
      searchCRMData(query);
    }
  }, [query]);

  if (!results) return null;

  return (
    <div className="space-y-4">
      {/* Main Answer */}
      <Card className="p-6 bg-gradient-to-r from-blue-50 to-purple-50 border-blue-200">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
            <Search className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-lg mb-2">תשובה מבוססת נתונים</h3>
            <p className="text-slate-700 leading-relaxed">{results.answer}</p>
          </div>
        </div>
      </Card>

      {/* Metrics */}
      {results.metrics && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Users className="w-4 h-4 text-blue-600" />
              <span className="text-xs text-slate-500">לידים</span>
            </div>
            <div className="text-2xl font-bold">{results.metrics.total_leads || 0}</div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="w-4 h-4 text-green-600" />
              <span className="text-xs text-slate-500">עסקאות</span>
            </div>
            <div className="text-2xl font-bold">{results.metrics.total_deals || 0}</div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-4 h-4 text-purple-600" />
              <span className="text-xs text-slate-500">ערך ממוצע</span>
            </div>
            <div className="text-2xl font-bold">
              {(results.metrics.avg_deal_value || 0).toLocaleString()} \u20AA
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Database className="w-4 h-4 text-orange-600" />
              <span className="text-xs text-slate-500">המרה</span>
            </div>
            <div className="text-2xl font-bold">
              {(results.metrics.conversion_rate || 0).toFixed(1)}%
            </div>
          </Card>
        </div>
      )}

      {/* Findings */}
      {results.findings && results.findings.length > 0 && (
        <Card className="p-6">
          <h4 className="font-bold mb-3 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-blue-600" />
            ממצאים עיקריים
          </h4>
          <ul className="space-y-2">
            {results.findings.map((finding, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-blue-600 mt-1">\u2022</span>
                <span className="text-slate-700">{finding}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Recommendations */}
      {results.recommendations && results.recommendations.length > 0 && (
        <Card className="p-6 bg-gradient-to-r from-green-50 to-emerald-50 border-green-200">
          <h4 className="font-bold mb-3 flex items-center gap-2">
            <Clock className="w-5 h-5 text-green-600" />
            המלצות לפעולה
          </h4>
          <ul className="space-y-2">
            {results.recommendations.map((rec, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-green-600 font-bold mt-1">\u2192</span>
                <span className="text-slate-700">{rec}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Relevant Records */}
      {results.relevant_records && results.relevant_records.length > 0 && (
        <Card className="p-6">
          <h4 className="font-bold mb-3">רשומות רלוונטיות</h4>
          <ScrollArea className="h-48">
            <div className="space-y-2">
              {results.relevant_records.map((record, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-2 bg-slate-50 rounded"
                >
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{record.type}</Badge>
                    <span className="text-sm">{record.name}</span>
                  </div>
                  <Badge className="bg-blue-100 text-blue-700">
                    {(record.relevance * 100).toFixed(0)}% רלוונטיות
                  </Badge>
                </div>
              ))}
            </div>
          </ScrollArea>
        </Card>
      )}
    </div>
  );
}
