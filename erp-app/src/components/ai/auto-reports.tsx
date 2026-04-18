import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Download, Calendar, Send, Loader2, TrendingUp } from "lucide-react";
import { motion } from "framer-motion";
import { entityList } from "@/lib/entity-api";
import { authFetch } from "@/lib/utils";

interface KeyMetrics {
  new_leads?: number;
  new_deals?: number;
  total_deal_value?: number;
  activities_completed?: number;
  conversion_rate?: number;
}

interface Report {
  title: string;
  period: string;
  executive_summary: string;
  key_metrics?: KeyMetrics;
  highlights?: string[];
  challenges?: string[];
  trends?: string[];
  recommendations?: string[];
  top_performers?: string[];
}

export default function AutoReports() {
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [reportType, setReportType] = useState("daily");

  const generateReport = async (type: string) => {
    setLoading(true);
    setReportType(type);

    try {
      const today = new Date();
      const startDate = new Date();

      if (type === "daily") {
        startDate.setDate(today.getDate() - 1);
      } else if (type === "weekly") {
        startDate.setDate(today.getDate() - 7);
      }

      const [leads, deals, opportunities, activities, _customers] = await Promise.all([
        entityList<Record<string, unknown>>("leads", "-created_date", 100).catch(() => []),
        entityList<Record<string, unknown>>("deals", "-created_date", 100).catch(() => []),
        entityList<Record<string, unknown>>("opportunities", "-created_date", 100).catch(() => []),
        entityList<Record<string, unknown>>("activities", "-created_date", 200).catch(() => []),
        entityList<Record<string, unknown>>("customers", "-created_date", 100).catch(() => []),
      ]);

      const inRange = (dateStr: string) => {
        const date = new Date(dateStr);
        return date >= startDate && date <= today;
      };

      const recentLeads = leads.filter((l) => inRange(l.created_date as string));
      const recentDeals = deals.filter((d) => inRange(d.created_date as string));
      const recentOpps = opportunities.filter((o) => inRange(o.created_date as string));
      const recentActivities = activities.filter((a) => inRange(a.created_date as string));

      const res = await authFetch("/api/ai/invoke-llm", {
        method: "POST",
        body: JSON.stringify({
          prompt: `
צור דוח סיכום ${type === "daily" ? "יומי" : "שבועי"} מקצועי לצוות CRM.

נתונים:
- לידים חדשים: ${recentLeads.length}
- עסקאות חדשות: ${recentDeals.length}
- הזדמנויות חדשות: ${recentOpps.length}
- פעילויות: ${recentActivities.length}

פרטי לידים:
${recentLeads
  .slice(0, 10)
  .map(
    (l) =>
      `- ${l.name} (${l.company || "N/A"}): ${l.status}, ערך: ${l.estimated_value || 0}`
  )
  .join("\n")}

פרטי עסקאות:
${recentDeals
  .slice(0, 10)
  .map((d) => `- ${d.name}: ${d.status}, ${d.deal_value || 0} \u20AA`)
  .join("\n")}

פעילויות לפי סוג:
${Object.entries(
  recentActivities.reduce<Record<string, number>>((acc, a) => {
    const t = a.type as string;
    acc[t] = (acc[t] || 0) + 1;
    return acc;
  }, {})
)
  .map(([t, count]) => `- ${t}: ${count}`)
  .join("\n")}

צור דוח מובנה עם:
1. סיכום ביצועים (executive summary)
2. מטריקות מפתח
3. הישגים בולטים
4. אתגרים ובעיות
5. מגמות
6. המלצות לשבוע/יום הבא
`,
          response_json_schema: {
            type: "object",
            properties: {
              title: { type: "string" },
              period: { type: "string" },
              executive_summary: { type: "string" },
              key_metrics: {
                type: "object",
                properties: {
                  new_leads: { type: "number" },
                  new_deals: { type: "number" },
                  total_deal_value: { type: "number" },
                  activities_completed: { type: "number" },
                  conversion_rate: { type: "number" },
                },
              },
              highlights: { type: "array", items: { type: "string" } },
              challenges: { type: "array", items: { type: "string" } },
              trends: { type: "array", items: { type: "string" } },
              recommendations: { type: "array", items: { type: "string" } },
              top_performers: { type: "array", items: { type: "string" } },
            },
          },
        }),
      });
      const result: Report = await res.json();
      setReport(result);
    } catch (error) {
      console.error("Report generation failed:", error);
    } finally {
      setLoading(false);
    }
  };

  const downloadReport = () => {
    if (!report) return;

    const content = `
${report.title}
${report.period}

סיכום מנהלים:
${report.executive_summary}

מטריקות מפתח:
- לידים חדשים: ${report.key_metrics?.new_leads || 0}
- עסקאות חדשות: ${report.key_metrics?.new_deals || 0}
- ערך עסקאות: ${(report.key_metrics?.total_deal_value || 0).toLocaleString()} \u20AA
- פעילויות: ${report.key_metrics?.activities_completed || 0}
- שיעור המרה: ${(report.key_metrics?.conversion_rate || 0).toFixed(1)}%

הישגים בולטים:
${report.highlights?.map((h) => `\u2022 ${h}`).join("\n")}

אתגרים:
${report.challenges?.map((c) => `\u2022 ${c}`).join("\n")}

מגמות:
${report.trends?.map((t) => `\u2022 ${t}`).join("\n")}

המלצות:
${report.recommendations?.map((r) => `\u2192 ${r}`).join("\n")}

מצטיינים:
${report.top_performers?.map((p) => `\u2B50 ${p}`).join("\n")}
    `;

    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `\u05D3\u05D5\u05D7-${reportType}-${new Date().toISOString().split("T")[0]}.txt`;
    a.click();
  };

  const sendReport = async () => {
    alert("\u05D4\u05D3\u05D5\u05D7 \u05D9\u05D9\u05E9\u05DC\u05D7 \u05DC\u05DE\u05D9\u05D9\u05DC \u05E9\u05DC \u05D4\u05E6\u05D5\u05D5\u05EA");
  };

  return (
    <div className="space-y-4">
      <Card className="bg-gradient-to-r from-indigo-50 to-blue-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-indigo-600" />
            דוחות סיכום אוטומטיים
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <Button
              onClick={() => generateReport("daily")}
              disabled={loading}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700"
            >
              <Calendar className="w-4 h-4 ml-2" />
              דוח יומי
            </Button>
            <Button
              onClick={() => generateReport("weekly")}
              disabled={loading}
              className="flex-1 bg-purple-600 hover:bg-purple-700"
            >
              <Calendar className="w-4 h-4 ml-2" />
              דוח שבועי
            </Button>
          </div>
        </CardContent>
      </Card>

      {loading && (
        <Card className="p-12 text-center">
          <Loader2 className="w-12 h-12 animate-spin mx-auto text-indigo-600 mb-4" />
          <p className="text-slate-600">יוצר דוח מקצועי...</p>
        </Card>
      )}

      {report && !loading && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          {/* Header */}
          <Card className="bg-gradient-to-r from-blue-600 to-purple-600 text-white">
            <CardHeader>
              <CardTitle className="text-2xl">{report.title}</CardTitle>
              <p className="text-blue-100">{report.period}</p>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Button onClick={downloadReport} variant="secondary" size="sm">
                  <Download className="w-4 h-4 ml-2" />
                  הורד דוח
                </Button>
                <Button onClick={sendReport} variant="secondary" size="sm">
                  <Send className="w-4 h-4 ml-2" />
                  שלח במייל
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Executive Summary */}
          <Card>
            <CardHeader>
              <CardTitle>סיכום מנהלים</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-slate-700 leading-relaxed">{report.executive_summary}</p>
            </CardContent>
          </Card>

          {/* Key Metrics */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-blue-600" />
                מטריקות מפתח
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="text-center p-3 bg-blue-50 rounded-xl">
                  <div className="text-2xl font-bold text-blue-600">
                    {report.key_metrics?.new_leads || 0}
                  </div>
                  <div className="text-xs text-slate-600">לידים חדשים</div>
                </div>
                <div className="text-center p-3 bg-green-50 rounded-xl">
                  <div className="text-2xl font-bold text-green-600">
                    {report.key_metrics?.new_deals || 0}
                  </div>
                  <div className="text-xs text-slate-600">עסקאות</div>
                </div>
                <div className="text-center p-3 bg-purple-50 rounded-xl">
                  <div className="text-2xl font-bold text-purple-600">
                    {(report.key_metrics?.total_deal_value || 0).toLocaleString()} \u20AA
                  </div>
                  <div className="text-xs text-slate-600">ערך עסקאות</div>
                </div>
                <div className="text-center p-3 bg-orange-50 rounded-xl">
                  <div className="text-2xl font-bold text-orange-600">
                    {report.key_metrics?.activities_completed || 0}
                  </div>
                  <div className="text-xs text-slate-600">פעילויות</div>
                </div>
                <div className="text-center p-3 bg-pink-50 rounded-xl">
                  <div className="text-2xl font-bold text-pink-600">
                    {(report.key_metrics?.conversion_rate || 0).toFixed(1)}%
                  </div>
                  <div className="text-xs text-slate-600">המרה</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Highlights */}
            <Card className="bg-green-50">
              <CardHeader>
                <CardTitle className="text-green-700">הישגים בולטים</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {report.highlights?.map((h, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-green-600">\u2713</span>
                      <span className="text-sm">{h}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            {/* Challenges */}
            <Card className="bg-orange-50">
              <CardHeader>
                <CardTitle className="text-orange-700">אתגרים</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {report.challenges?.map((c, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-orange-600">!</span>
                      <span className="text-sm">{c}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>

          {/* Recommendations */}
          <Card className="bg-gradient-to-r from-purple-50 to-pink-50">
            <CardHeader>
              <CardTitle className="text-purple-700">המלצות לתקופה הבאה</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {report.recommendations?.map((r, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-purple-600 font-bold">\u2192</span>
                    <span className="text-sm font-medium">{r}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {/* Top Performers */}
          {report.top_performers && report.top_performers.length > 0 && (
            <Card className="bg-gradient-to-r from-yellow-50 to-amber-50">
              <CardHeader>
                <CardTitle className="text-amber-700">מצטיינים</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {report.top_performers.map((p, i) => (
                    <div key={i} className="flex items-center gap-2 p-2 bg-white rounded-lg">
                      <span className="text-2xl">\u2B50</span>
                      <span className="font-medium">{p}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </motion.div>
      )}
    </div>
  );
}
