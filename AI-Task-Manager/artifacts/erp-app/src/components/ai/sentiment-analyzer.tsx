import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Brain, MessageSquare } from "lucide-react";

interface Communication {
  id: number;
  type: string;
  from: string;
  text: string;
}

interface SentimentResult {
  sentiment: "positive" | "negative" | "neutral";
  score: number;
}

interface SentimentAnalyzerProps {
  communications?: Communication[];
}

export default function SentimentAnalyzer({ communications = [] }: SentimentAnalyzerProps) {
  const [selectedComm, setSelectedComm] = useState<Communication | null>(null);

  const analyzeSentiment = (text: string): SentimentResult => {
    const positiveWords = [
      "great",
      "excellent",
      "amazing",
      "love",
      "perfect",
      "wonderful",
      "satisfied",
      "happy",
    ];
    const negativeWords = [
      "bad",
      "terrible",
      "hate",
      "awful",
      "poor",
      "disappointed",
      "angry",
      "frustrated",
    ];

    const lower = text.toLowerCase();
    const positiveCount = positiveWords.filter((w) => lower.includes(w)).length;
    const negativeCount = negativeWords.filter((w) => lower.includes(w)).length;

    if (positiveCount > negativeCount)
      return { sentiment: "positive", score: Math.min(80 + positiveCount * 5, 100) };
    if (negativeCount > positiveCount)
      return { sentiment: "negative", score: Math.max(40 - negativeCount * 10, 0) };
    return { sentiment: "neutral", score: 50 };
  };

  const mockCommunications: Communication[] =
    communications.length === 0
      ? [
          {
            id: 1,
            type: "email",
            from: "\u05DE\u05E9\u05D4 \u05DB\u05D4\u05DF",
            text: "\u05EA\u05D5\u05D3\u05D4 \u05E8\u05D1\u05D4 \u05E2\u05DC \u05D4\u05D4\u05E6\u05E2\u05D4 \u05D4\u05DE\u05E2\u05D5\u05DC\u05D4! \u05D6\u05D4 \u05D1\u05D3\u05D9\u05D5\u05E7 \u05DE\u05D4 \u05E9\u05D7\u05D9\u05E4\u05E9\u05E0\u05D5.",
          },
          {
            id: 2,
            type: "call",
            from: "\u05D3\u05D9\u05E0\u05D4 \u05E8\u05D5\u05D6\u05E0\u05D1\u05E8\u05D2",
            text: "\u05D4\u05D9\u05D9\u05EA\u05D9 \u05DE\u05E2\u05D8 \u05DE\u05D0\u05D5\u05DB\u05D6\u05D1 \u05D1\u05D0\u05D9\u05DB\u05D5\u05EA \u05D4\u05E9\u05D9\u05E8\u05D5\u05EA \u05D1\u05D7\u05D5\u05D3\u05E9\u05D9\u05DD \u05D4\u05D0\u05D7\u05E8\u05D5\u05E0\u05D9\u05DD.",
          },
          {
            id: 3,
            type: "message",
            from: "\u05D0\u05DC\u05D9 \u05D9\u05E9\u05E8\u05D0\u05DC\u05D9",
            text: "\u05D4\u05DB\u05DC \u05D1\u05E1\u05D3\u05E8, \u05EA\u05D5\u05D3\u05D4 \u05E2\u05DC \u05D4\u05E2\u05D6\u05E8\u05D4.",
          },
        ]
      : communications;

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Brain className="w-5 h-5 text-purple-600" />
          AI Sentiment Analysis
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          {mockCommunications.map((comm) => {
            const { sentiment, score } = analyzeSentiment(comm.text);
            const sentimentColor =
              sentiment === "positive"
                ? "bg-emerald-50 border-emerald-200"
                : sentiment === "negative"
                ? "bg-red-50 border-red-200"
                : "bg-amber-50 border-amber-200";
            const badgeClass =
              sentiment === "positive"
                ? "bg-emerald-100 text-emerald-700"
                : sentiment === "negative"
                ? "bg-red-100 text-red-700"
                : "bg-amber-100 text-amber-700";

            return (
              <div
                key={comm.id}
                className={`p-3 border rounded-lg cursor-pointer hover:shadow-md transition-all ${sentimentColor}`}
                onClick={() => setSelectedComm(comm)}
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <MessageSquare className="w-4 h-4 text-slate-600" />
                      <p className="font-medium text-sm text-slate-900">{comm.from}</p>
                      <Badge className="text-xs" variant="outline">
                        {comm.type}
                      </Badge>
                    </div>
                  </div>
                  <Badge className={`text-xs ${badgeClass}`}>{sentiment}</Badge>
                </div>
                <p className="text-xs text-slate-700 mb-2">{comm.text}</p>
                <div className="flex items-center gap-2">
                  <Progress value={score} className="h-1.5 flex-1" />
                  <span className="text-xs font-bold text-slate-700">{score}%</span>
                </div>
              </div>
            );
          })}
        </div>

        {selectedComm && (
          <div className="p-3 bg-slate-100 rounded-lg border border-slate-300">
            <p className="text-xs text-slate-600 mb-1 font-semibold">Analysis Details:</p>
            <p className="text-xs text-slate-700">
              This communication shows a{" "}
              <strong>{analyzeSentiment(selectedComm.text).sentiment}</strong> sentiment with{" "}
              {analyzeSentiment(selectedComm.text).score}% confidence. Consider{" "}
              {analyzeSentiment(selectedComm.text).sentiment === "negative"
                ? "prioritizing follow-up"
                : "nurturing this relationship"}
              .
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
