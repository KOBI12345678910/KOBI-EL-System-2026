import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sparkles, Send, Loader } from "lucide-react";

interface ReportResult {
  title: string;
  summary?: string;
  data?: Array<{ period: string; value: number }>;
  count?: number;
  value?: number;
  deals?: Array<{ name: string; value: string; date: string }>;
  reps?: Array<{ name: string; deals: number; revenue: string; performance: number }>;
}

export default function NLQueryBuilder() {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<ReportResult | null>(null);
  const [loading, setLoading] = useState(false);

  const suggestedQueries = [
    "Show me revenue trend for Q1 2026",
    "Which deals are closing this month?",
    "Top 5 sales reps by performance",
    "Compare customer acquisition cost by channel",
    "List all deals at negotiation stage over 100K",
  ];

  const generateReport = async () => {
    if (!query.trim()) return;
    setLoading(true);

    setTimeout(() => {
      const mockResults: Record<string, ReportResult> = {
        "revenue trend": {
          title: "Revenue Trend Analysis",
          data: [
            { period: "Jan 2026", value: 450000 },
            { period: "Feb 2026", value: 520000 },
            { period: "Mar 2026", value: 480000 },
          ],
          summary:
            "Revenue peaked in February with \u20AA520K, representing 15% growth from January.",
        },
        "deals closing": {
          title: "Deals Closing This Month",
          count: 12,
          value: 2400000,
          deals: [
            { name: "Enterprise Package - ABC Corp", value: "\u20AA500K", date: "Feb 15" },
            { name: "Custom Solution - XYZ Inc", value: "\u20AA300K", date: "Feb 20" },
          ],
        },
        "top sales": {
          title: "Top 5 Sales Representatives",
          reps: [
            { name: "\u05D3\u05D5\u05E8 \u05D1\u05DF \u05D0\u05D5\u05E8", deals: 8, revenue: "\u20AA1.2M", performance: 95 },
            { name: "\u05E9\u05E8\u05D4 \u05DC\u05D5\u05D9", deals: 6, revenue: "\u20AA980K", performance: 88 },
            { name: "\u05D0\u05DC\u05D9 \u05D9\u05E9\u05E8\u05D0\u05DC\u05D9", deals: 5, revenue: "\u20AA850K", performance: 82 },
          ],
        },
      };

      const key = Object.keys(mockResults).find((k) => query.toLowerCase().includes(k));
      setResult(
        mockResults[key!] || {
          title: "Custom Report",
          summary: `Report generated for: "${query}"`,
        }
      );
      setLoading(false);
    }, 1500);
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-purple-600" />
          Natural Language Report Builder
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Query Input */}
        <div className="flex gap-2">
          <Input
            placeholder="Ask anything about your CRM data... (e.g., 'Show me revenue trends')"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && generateReport()}
            className="flex-1"
          />
          <Button
            onClick={generateReport}
            disabled={loading}
            className="bg-purple-600 hover:bg-purple-700"
          >
            {loading ? <Loader className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>

        {/* Suggested Queries */}
        <div>
          <p className="text-xs text-slate-600 mb-2 font-semibold">Suggested Queries:</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {suggestedQueries.map((q, idx) => (
              <button
                key={idx}
                onClick={() => {
                  setQuery(q);
                  setTimeout(() => generateReport(), 100);
                }}
                className="text-left p-2 bg-slate-50 hover:bg-purple-50 border border-slate-200 rounded-lg text-xs text-slate-700 hover:text-purple-700 transition-colors"
              >
                {q}
              </button>
            ))}
          </div>
        </div>

        {/* Results */}
        {result && (
          <div className="space-y-3 p-4 bg-gradient-to-br from-purple-50 to-blue-50 rounded-lg border border-purple-200">
            <h3 className="font-bold text-slate-900">{result.title}</h3>

            {result.summary && <p className="text-sm text-slate-700">{result.summary}</p>}

            {result.data && (
              <div className="space-y-1">
                {result.data.map((item, idx) => (
                  <div key={idx} className="flex justify-between text-sm">
                    <span className="text-slate-700">{item.period}</span>
                    <span className="font-bold text-purple-600">
                      \u20AA{item.value.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {result.count && (
              <div className="p-2 bg-white rounded border border-purple-200">
                <p className="text-xs text-slate-600">Total Deals:</p>
                <p className="text-2xl font-bold text-purple-600">{result.count}</p>
                <p className="text-xs text-slate-600">
                  Combined Value: \u20AA{((result.value || 0) / 1000000).toFixed(1)}M
                </p>
              </div>
            )}

            {result.reps && (
              <div className="space-y-1">
                {result.reps.map((rep, idx) => (
                  <div key={idx} className="p-2 bg-white rounded border-l-4 border-purple-400">
                    <div className="flex justify-between items-center">
                      <span className="font-medium text-sm">{rep.name}</span>
                      <Badge className="bg-purple-100 text-purple-700 text-xs">
                        {rep.performance}%
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-600">
                      {rep.deals} deals \u2022 {rep.revenue}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {result.deals && (
              <div className="space-y-1">
                {result.deals.map((deal, idx) => (
                  <div key={idx} className="p-2 bg-white rounded text-sm">
                    <div className="flex justify-between">
                      <span className="font-medium text-slate-900">{deal.name}</span>
                      <span className="text-purple-600 font-bold">{deal.value}</span>
                    </div>
                    <p className="text-xs text-slate-500">Closing: {deal.date}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
