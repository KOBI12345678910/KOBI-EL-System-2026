import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Activity, Brain, TrendingUp, TrendingDown, Clock, Eye,
  MessageSquare, Phone, Mail, Zap, Target, AlertTriangle,
  Smile, Frown, Meh, ThumbsUp, ThumbsDown, Gauge, Heart,
  ArrowUpRight, ArrowDownRight, Calendar, Shield
} from "lucide-react";
import { authFetch } from "@/lib/utils";

// ============================================================
// BEHAVIORAL DATA PER CUSTOMER
// ============================================================
const FALLBACK_CUSTOMER_BEHAVIOR = [
  {
    id: 1, name: "קבוצת אלון", segment: "VIP",
    // Signals
    avgResponseTimeHours: 2.5, responseTimeTrend: "improving",
    avgMessageLength: 185, messageLengthTrend: "stable",
    sentimentAvg: 0.72, sentimentTrend: "improving",
    engagementFrequency: 4.2, engagementTrend: "stable", // interactions per week
    // Outputs
    interestLevel: 82, hesitationLevel: 15, urgencyLevel: 45, buyingIntentScore: 78,
    // Patterns
    preferredChannel: "phone", preferredTime: "בוקר (9-11)", preferredDay: "ראשון-שלישי",
    decisionSpeed: "fast", pricesSensitivity: "low", relationshipType: "partnership",
    // AI recommendations
    recommendedTone: "מקצועי-ידידותי, ישיר, ממוקד ערך",
    recommendedStrategy: "הגדל נפח, הצע חבילות שנתיות, בנה תלות חיובית",
    riskSignals: [],
    opportunitySignals: ["תגובות מהירות", "שואל שאלות מפורטות", "מזכיר תוכניות עתידיות"],
  },
  {
    id: 2, name: "שיכון ובינוי", segment: "Enterprise",
    avgResponseTimeHours: 18, responseTimeTrend: "worsening",
    avgMessageLength: 42, messageLengthTrend: "declining",
    sentimentAvg: -0.35, sentimentTrend: "declining",
    engagementFrequency: 1.2, engagementTrend: "declining",
    interestLevel: 35, hesitationLevel: 68, urgencyLevel: 72, buyingIntentScore: 25,
    preferredChannel: "whatsapp", preferredTime: "אחה\"צ (14-16)", preferredDay: "שני-רביעי",
    decisionSpeed: "slow", pricesSensitivity: "high", relationshipType: "transactional",
    recommendedTone: "רגוע ומרגיע, אמפתי, פתרון-ממוקד",
    recommendedStrategy: "טיפול בחששות, פגישה פנים אל פנים, פיצוי על עיכוב",
    riskSignals: ["תגובות קצרות ומאוחרות", "סנטימנט שלילי", "הפסקת שאילת שאלות"],
    opportunitySignals: [],
  },
  {
    id: 3, name: "אמות השקעות", segment: "Enterprise",
    avgResponseTimeHours: 1.5, responseTimeTrend: "stable",
    avgMessageLength: 220, messageLengthTrend: "growing",
    sentimentAvg: 0.85, sentimentTrend: "improving",
    engagementFrequency: 3.8, engagementTrend: "improving",
    interestLevel: 92, hesitationLevel: 5, urgencyLevel: 30, buyingIntentScore: 90,
    preferredChannel: "meeting", preferredTime: "בוקר (8-10)", preferredDay: "ראשון",
    decisionSpeed: "fast", pricesSensitivity: "low", relationshipType: "strategic",
    recommendedTone: "מקצועי, אסטרטגי, חשיבה ארוכת טווח",
    recommendedStrategy: "חוזה חתימה מיידית, הצע partnership לטווח ארוך",
    riskSignals: [],
    opportunitySignals: ["מאד מעורב", "שואל על חידושים", "מזמין לפגישות יזומות", "buying intent=90%"],
  },
  {
    id: 4, name: "עיריית חולון", segment: "Public",
    avgResponseTimeHours: 72, responseTimeTrend: "worsening",
    avgMessageLength: 15, messageLengthTrend: "declining",
    sentimentAvg: -0.10, sentimentTrend: "declining",
    engagementFrequency: 0.2, engagementTrend: "declining",
    interestLevel: 12, hesitationLevel: 82, urgencyLevel: 8, buyingIntentScore: 5,
    preferredChannel: "email", preferredTime: "—", preferredDay: "—",
    decisionSpeed: "very_slow", pricesSensitivity: "medium", relationshipType: "bureaucratic",
    recommendedTone: "פורמלי ומכבד, סבלני, עם follow-up עקבי",
    recommendedStrategy: "פגישת הנהלה בכירה, הצג ROI, הצע פיילוט קטן",
    riskSignals: ["לא עונה 60 ימים", "הודעות קצרצרות", "אין שאלות", "engagement כמעט 0"],
    opportunitySignals: [],
  },
  {
    id: 5, name: "סופרגז אנרגיה", segment: "SMB",
    avgResponseTimeHours: 999, responseTimeTrend: "dead",
    avgMessageLength: 0, messageLengthTrend: "dead",
    sentimentAvg: -0.80, sentimentTrend: "dead",
    engagementFrequency: 0, engagementTrend: "dead",
    interestLevel: 0, hesitationLevel: 100, urgencyLevel: 0, buyingIntentScore: 0,
    preferredChannel: "—", preferredTime: "—", preferredDay: "—",
    decisionSpeed: "n/a", pricesSensitivity: "n/a", relationshipType: "lost",
    recommendedTone: "פורמלי, גבייה משפטית",
    recommendedStrategy: "העבר לגבייה, הפסק השקעת משאבי מכירות",
    riskSignals: ["אפס תקשורת 90+ ימים", "חוב פתוח", "חשד חדלות פירעון"],
    opportunitySignals: [],
  },
];

const sentimentEmoji = (s: number) => s > 0.3 ? <Smile className="h-4 w-4 text-emerald-500" /> : s < -0.3 ? <Frown className="h-4 w-4 text-red-500" /> : <Meh className="h-4 w-4 text-gray-400" />;
const trendArrow = (t: string) => t === "improving" || t === "growing" ? <ArrowUpRight className="h-3 w-3 text-emerald-500" /> : t === "declining" || t === "worsening" ? <ArrowDownRight className="h-3 w-3 text-red-500" /> : t === "dead" ? <span className="text-[8px] text-red-600">💀</span> : <span className="text-[8px] text-gray-400">→</span>;

const intentBar = (score: number) => (
  <div className="flex items-center gap-1.5">
    <div className={`w-16 h-3 rounded-full overflow-hidden ${score === 0 ? "bg-gray-200" : "bg-gray-100"}`}>
      <div className={`h-full rounded-full ${score >= 70 ? "bg-emerald-500" : score >= 40 ? "bg-amber-500" : score >= 10 ? "bg-orange-500" : "bg-red-500"}`} style={{ width: `${score}%` }} />
    </div>
    <span className="text-[9px] font-mono font-bold">{score}</span>
  </div>
);

export default function BehavioralAnalytics() {
  const { data: apiBehavior } = useQuery<typeof FALLBACK_CUSTOMER_BEHAVIOR>({
    queryKey: ["crm-behavioral-analytics"],
    queryFn: async () => { const res = await authFetch("/api/crm/analytics/behavioral"); if (!res.ok) throw new Error("API error"); return res.json(); },
  });
  const customerBehavior = apiBehavior ?? FALLBACK_CUSTOMER_BEHAVIOR;

  return (
    <div className="p-6 space-y-5" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Activity className="h-7 w-7 text-primary" /> Behavioral CRM Analytics
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            סיגנלים התנהגותיים | זמני תגובה | סנטימנט | buying intent | AI strategy
          </p>
        </div>
      </div>

      {/* Behavioral Matrix */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">מטריצת התנהגות לקוחות — Signals & Outputs</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="max-h-[600px]">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="text-right text-[9px] font-bold w-[130px] sticky right-0 bg-muted/50 z-10">לקוח</TableHead>
                  <TableHead className="text-center text-[9px] font-bold">Response Time</TableHead>
                  <TableHead className="text-center text-[9px] font-bold">Msg Length</TableHead>
                  <TableHead className="text-center text-[9px] font-bold">Sentiment</TableHead>
                  <TableHead className="text-center text-[9px] font-bold">Engagement/wk</TableHead>
                  <TableHead className="text-center text-[9px] font-bold">Interest</TableHead>
                  <TableHead className="text-center text-[9px] font-bold">Hesitation</TableHead>
                  <TableHead className="text-center text-[9px] font-bold">Urgency</TableHead>
                  <TableHead className="text-center text-[9px] font-bold">Buying Intent</TableHead>
                  <TableHead className="text-center text-[9px] font-bold">Channel</TableHead>
                  <TableHead className="text-center text-[9px] font-bold">Speed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customerBehavior.map(c => (
                  <TableRow key={c.id} className={`hover:bg-accent ${c.buyingIntentScore === 0 ? "opacity-50" : c.buyingIntentScore >= 70 ? "bg-emerald-50/10" : c.riskSignals.length > 2 ? "bg-red-50/10" : ""}`}>
                    <TableCell className="sticky right-0 bg-background z-10">
                      <div>
                        <p className="text-xs font-bold">{c.name}</p>
                        <Badge variant="outline" className="text-[7px]">{c.segment}</Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <span className={`text-[10px] font-mono ${c.avgResponseTimeHours <= 4 ? "text-emerald-600" : c.avgResponseTimeHours <= 24 ? "text-amber-600" : "text-red-600"}`}>
                          {c.avgResponseTimeHours >= 100 ? "∞" : c.avgResponseTimeHours < 1 ? `${(c.avgResponseTimeHours * 60).toFixed(0)}m` : `${c.avgResponseTimeHours.toFixed(0)}h`}
                        </span>
                        {trendArrow(c.responseTimeTrend)}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <span className={`text-[10px] font-mono ${c.avgMessageLength >= 100 ? "text-emerald-600" : c.avgMessageLength >= 30 ? "text-amber-600" : "text-red-600"}`}>
                          {c.avgMessageLength} chars
                        </span>
                        {trendArrow(c.messageLengthTrend)}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        {sentimentEmoji(c.sentimentAvg)}
                        <span className="text-[9px] font-mono">{c.sentimentAvg > 0 ? "+" : ""}{c.sentimentAvg.toFixed(2)}</span>
                        {trendArrow(c.sentimentTrend)}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <span className={`text-[10px] font-mono ${c.engagementFrequency >= 3 ? "text-emerald-600" : c.engagementFrequency >= 1 ? "text-amber-600" : "text-red-600"}`}>
                          {c.engagementFrequency.toFixed(1)}/wk
                        </span>
                        {trendArrow(c.engagementTrend)}
                      </div>
                    </TableCell>
                    <TableCell className="p-1">{intentBar(c.interestLevel)}</TableCell>
                    <TableCell className="p-1">{intentBar(c.hesitationLevel)}</TableCell>
                    <TableCell className="p-1">{intentBar(c.urgencyLevel)}</TableCell>
                    <TableCell className="p-1">{intentBar(c.buyingIntentScore)}</TableCell>
                    <TableCell className="text-center">
                      {c.preferredChannel === "phone" ? <Phone className="h-3.5 w-3.5 text-blue-500 mx-auto" />
                        : c.preferredChannel === "whatsapp" ? <MessageSquare className="h-3.5 w-3.5 text-green-500 mx-auto" />
                        : c.preferredChannel === "email" ? <Mail className="h-3.5 w-3.5 text-purple-500 mx-auto" />
                        : c.preferredChannel === "meeting" ? <Calendar className="h-3.5 w-3.5 text-amber-500 mx-auto" />
                        : <span className="text-[9px] text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge className={`text-[8px] ${
                        c.decisionSpeed === "fast" ? "bg-emerald-100 text-emerald-700"
                        : c.decisionSpeed === "slow" ? "bg-amber-100 text-amber-700"
                        : c.decisionSpeed === "very_slow" ? "bg-red-100 text-red-700"
                        : "bg-gray-100 text-gray-700"
                      }`}>
                        {c.decisionSpeed === "fast" ? "⚡" : c.decisionSpeed === "slow" ? "🐌" : c.decisionSpeed === "very_slow" ? "🐢" : "—"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Per-Customer Strategy Cards */}
      <div className="space-y-3">
        {customerBehavior.filter(c => c.buyingIntentScore > 0 || c.riskSignals.length > 0).map(c => (
          <Card key={c.id} className={`border-r-4 ${
            c.buyingIntentScore >= 70 ? "border-r-emerald-500" :
            c.riskSignals.length > 2 ? "border-r-red-500" :
            c.buyingIntentScore >= 30 ? "border-r-amber-400" : "border-r-gray-300"
          }`}>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-start gap-4">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0 ${
                  c.buyingIntentScore >= 70 ? "bg-emerald-500" : c.buyingIntentScore >= 30 ? "bg-amber-500" : "bg-red-500"
                }`}>
                  {c.buyingIntentScore}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-sm">{c.name}</h3>
                    <Badge variant="outline" className="text-[8px]">{c.segment}</Badge>
                    <Badge className={`text-[8px] ${c.relationshipType === "partnership" || c.relationshipType === "strategic" ? "bg-emerald-100 text-emerald-700" : c.relationshipType === "lost" ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"}`}>
                      {c.relationshipType}
                    </Badge>
                    <span className="text-[9px] text-muted-foreground mr-auto">
                      ⏰ {c.preferredTime} | 📅 {c.preferredDay} | 💰 Price sensitivity: {c.pricesSensitivity}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mt-3">
                    {/* Strategy */}
                    <div className="p-2.5 rounded-lg bg-primary/5 border border-primary/20">
                      <div className="flex items-start gap-1.5">
                        <Brain className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                        <div>
                          <p className="text-[10px] font-medium text-primary">אסטרטגיה מומלצת</p>
                          <p className="text-[9px] text-muted-foreground mt-0.5">{c.recommendedStrategy}</p>
                        </div>
                      </div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-blue-50 border border-blue-200">
                      <div className="flex items-start gap-1.5">
                        <MessageSquare className="h-3.5 w-3.5 text-blue-600 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-[10px] font-medium text-blue-700">טון מומלץ</p>
                          <p className="text-[9px] text-muted-foreground mt-0.5">{c.recommendedTone}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Signals */}
                  {(c.riskSignals.length > 0 || c.opportunitySignals.length > 0) && (
                    <div className="flex gap-1.5 mt-2 flex-wrap">
                      {c.riskSignals.map((s, i) => (
                        <Badge key={`r-${i}`} className="bg-red-100 text-red-700 text-[7px]"><AlertTriangle className="h-2 w-2 ml-0.5" />{s}</Badge>
                      ))}
                      {c.opportunitySignals.map((s, i) => (
                        <Badge key={`o-${i}`} className="bg-emerald-100 text-emerald-700 text-[7px]"><ThumbsUp className="h-2 w-2 ml-0.5" />{s}</Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
