import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Smile, Frown, Meh, TrendingUp, AlertTriangle, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { entityList } from "@/lib/entity-api";
import { authFetch } from "@/lib/utils";

interface OverallSentiment {
  positive: number;
  negative: number;
  neutral: number;
}

interface CustomerSentiment {
  customer_name: string;
  sentiment: string;
  score: number;
  concerns?: string[];
}

interface SentimentResult {
  overall_sentiment: OverallSentiment;
  sentiment_by_customer?: CustomerSentiment[];
  trends?: string[];
  at_risk_customers?: string[];
  recurring_topics?: string[];
  recommendations?: string[];
}

export default function SentimentAnalysis() {
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<SentimentResult | null>(null);

  useEffect(() => {
    analyzeSentiment();
  }, []);

  const analyzeSentiment = async () => {
    setLoading(true);
    try {
      const [activities, notes] = await Promise.all([
        entityList<Record<string, unknown>>("activities", "-created_date", 100).catch(() => []),
        entityList<Record<string, unknown>>("crm-notes", "-created_date", 100).catch(() => []),
      ]);

      const allTexts = [
        ...activities.map((a) => ({
          text: `${a.subject || ""} ${a.description || ""}`,
          date: a.created_date,
          type: "activity",
          related: a.related_name || a.related_to,
        })),
        ...notes.map((n) => ({
          text: n.content as string,
          date: n.created_date,
          type: "note",
          related: n.related_to_name || n.related_to_type,
        })),
      ].filter((item) => item.text?.trim());

      const res = await authFetch("/api/ai/invoke-llm", {
        method: "POST",
        body: JSON.stringify({
          prompt: `
נתח את הסנטימנט של כל השיחות והפעילויות הבאות עם לקוחות:

${allTexts
  .slice(0, 50)
  .map((item) => `[${item.type}] ${(item.text || "").substring(0, 200)}`)
  .join("\n")}

ספק ניתוח sentiment מקיף:
1. סיווג כל פעילות: חיובי, שלילי, או ניטרלי
2. מגמות כלליות
3. לקוחות שמראים סימני אי-שביעות רצון
4. נושאים חוזרים
5. המלצות לשיפור
`,
          response_json_schema: {
            type: "object",
            properties: {
              overall_sentiment: {
                type: "object",
                properties: {
                  positive: { type: "number" },
                  negative: { type: "number" },
                  neutral: { type: "number" },
                },
              },
              sentiment_by_customer: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    customer_name: { type: "string" },
                    sentiment: { type: "string" },
                    score: { type: "number" },
                    concerns: { type: "array", items: { type: "string" } },
                  },
                },
              },
              trends: { type: "array", items: { type: "string" } },
              at_risk_customers: { type: "array", items: { type: "string" } },
              recurring_topics: { type: "array", items: { type: "string" } },
              recommendations: { type: "array", items: { type: "string" } },
            },
          },
        }),
      });
      const result: SentimentResult = await res.json();
      setAnalysis(result);
    } catch (error) {
      console.error("Sentiment analysis failed:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card className="p-12 text-center">
        <Loader2 className="w-12 h-12 animate-spin mx-auto text-blue-600 mb-4" />
        <p className="text-slate-600">מנתח סנטימנט משיחות...</p>
      </Card>
    );
  }

  if (!analysis) return null;

  const {
    overall_sentiment,
    trends,
    at_risk_customers,
    recurring_topics,
    recommendations,
  } = analysis;

  const total =
    (overall_sentiment.positive || 0) +
    (overall_sentiment.negative || 0) +
    (overall_sentiment.neutral || 0);

  return (
    <div className="space-y-4">
      {/* Overall Sentiment */}
      <Card className="bg-gradient-to-r from-blue-50 to-purple-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-blue-600" />
            סנטימנט כללי
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="text-center p-4 bg-white rounded-xl"
            >
              <Smile className="w-8 h-8 text-green-600 mx-auto mb-2" />
              <div className="text-3xl font-bold text-green-600">
                {total > 0 ? Math.round((overall_sentiment.positive / total) * 100) : 0}%
              </div>
              <div className="text-sm text-slate-600">חיובי</div>
            </motion.div>
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.1 }}
              className="text-center p-4 bg-white rounded-xl"
            >
              <Meh className="w-8 h-8 text-slate-400 mx-auto mb-2" />
              <div className="text-3xl font-bold text-slate-600">
                {total > 0 ? Math.round((overall_sentiment.neutral / total) * 100) : 0}%
              </div>
              <div className="text-sm text-slate-600">ניטרלי</div>
            </motion.div>
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2 }}
              className="text-center p-4 bg-white rounded-xl"
            >
              <Frown className="w-8 h-8 text-red-600 mx-auto mb-2" />
              <div className="text-3xl font-bold text-red-600">
                {total > 0 ? Math.round((overall_sentiment.negative / total) * 100) : 0}%
              </div>
              <div className="text-sm text-slate-600">שלילי</div>
            </motion.div>
          </div>
        </CardContent>
      </Card>

      {/* At Risk Customers */}
      {at_risk_customers && at_risk_customers.length > 0 && (
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-700">
              <AlertTriangle className="w-5 h-5" />
              לקוחות בסיכון ({at_risk_customers.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {at_risk_customers.map((customer, i) => (
                <div
                  key={i}
                  className="bg-white p-3 rounded-lg flex items-center justify-between"
                >
                  <span className="font-medium">{customer}</span>
                  <Badge variant="destructive">דחוף</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Trends */}
        <Card>
          <CardHeader>
            <CardTitle>מגמות</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-48">
              <ul className="space-y-2">
                {trends?.map((trend, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-blue-600">\u2022</span>
                    <span className="text-sm">{trend}</span>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Recurring Topics */}
        <Card>
          <CardHeader>
            <CardTitle>נושאים חוזרים</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-48">
              <div className="flex flex-wrap gap-2">
                {recurring_topics?.map((topic, i) => (
                  <Badge key={i} variant="outline">
                    {topic}
                  </Badge>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Recommendations */}
      <Card className="bg-gradient-to-r from-green-50 to-emerald-50">
        <CardHeader>
          <CardTitle className="text-green-700">המלצות לפעולה</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {recommendations?.map((rec, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-green-600 font-bold">\u2192</span>
                <span className="text-sm">{rec}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <div className="text-center">
        <Button onClick={analyzeSentiment} variant="outline">
          רענן ניתוח
        </Button>
      </div>
    </div>
  );
}
