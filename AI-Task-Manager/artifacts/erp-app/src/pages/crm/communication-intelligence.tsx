import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  MessageSquare, Phone, Mail, Video, Smile, Frown, Meh,
  AlertTriangle, Lightbulb, TrendingUp, TrendingDown, Clock,
  Shield, Target, Zap, Brain, Activity, Eye, Flag
} from "lucide-react";

const communications = [
  { id: 1, date: "2026-04-08 10:30", channel: "call", direction: "outbound", customer: "קבוצת אלון", contact: "אבי כהן", agent: "דני כהן", duration: 480,
    sentiment: 0.72, sentimentLabel: "positive", intent: "negotiate", objection: null, urgency: "medium",
    riskFlag: false, opportunityFlag: true, followup: "שלח הצעה מעודכנת עד יום ראשון",
    summary: "הלקוח מעוניין בהרחבת הפרויקט. ביקש הצעה עם 8% הנחת נפח. אווירה חיובית." },
  { id: 2, date: "2026-04-08 09:15", channel: "whatsapp", direction: "inbound", customer: "שיכון ובינוי", contact: "רונית לוי", agent: "מיכל לוי", duration: 0,
    sentiment: -0.35, sentimentLabel: "negative", intent: "complain", objection: "timing", urgency: "high",
    riskFlag: true, opportunityFlag: false, followup: "שיחת הרגעה + פגישת סטטוס דחופה",
    summary: "הלקוחה מתלוננת על עיכוב באספקה. מאיימת בביטול הזמנה אם לא מגיע עד סוף השבוע." },
  { id: 3, date: "2026-04-07 16:00", channel: "meeting", direction: "outbound", customer: "אמות השקעות", contact: "דוד שמיר", agent: "דני כהן", duration: 2700,
    sentiment: 0.85, sentimentLabel: "positive", intent: "buy", objection: null, urgency: "low",
    riskFlag: false, opportunityFlag: true, followup: "שלח חוזה לחתימה",
    summary: "פגישת סיכום מוצלחת. הלקוח אישר עקרונית. מחכה לחוזה חתום." },
  { id: 4, date: "2026-04-07 11:00", channel: "email", direction: "inbound", customer: "עיריית חולון", contact: "שרה אברהם", agent: "יוסי אברהם", duration: 0,
    sentiment: -0.15, sentimentLabel: "neutral", intent: "inquire", objection: "budget", urgency: "low",
    riskFlag: false, opportunityFlag: false, followup: "המתנה לאישור תקציבי - follow up בעוד שבוע",
    summary: "מייל בירור על תקציב. העירייה בתהליך אישור. לא דחוף." },
  { id: 5, date: "2026-04-07 09:30", channel: "call", direction: "outbound", customer: "סופרגז אנרגיה", contact: "יוסי כהן", agent: "שרה כהן", duration: 120,
    sentiment: -0.68, sentimentLabel: "negative", intent: "cancel", objection: "budget_issue", urgency: "critical",
    riskFlag: true, opportunityFlag: false, followup: "העבר לגבייה משפטית + דוח CFO",
    summary: "הלקוח לא עונה. שיחה קצרה - אמר שאין תקציב. חשד לחדלות פירעון." },
  { id: 6, date: "2026-04-06 14:00", channel: "call", direction: "outbound", customer: "BIG מרכזי קניות", contact: "יעל גולדן", agent: "דני כהן", duration: 900,
    sentiment: 0.45, sentimentLabel: "positive", intent: "inquire", objection: "price", urgency: "medium",
    riskFlag: false, opportunityFlag: true, followup: "הכן הצעה ראשונית + סיור באתר",
    summary: "שיחת היכרות ראשונה. לקוח מתעניין אבל בודק מתחרים. שאל על מחירים." },
];

const sentimentStats = {
  positive: communications.filter(c => c.sentimentLabel === "positive").length,
  neutral: communications.filter(c => c.sentimentLabel === "neutral").length,
  negative: communications.filter(c => c.sentimentLabel === "negative").length,
  riskFlags: communications.filter(c => c.riskFlag).length,
  oppFlags: communications.filter(c => c.opportunityFlag).length,
};

const channelIcon = (ch: string) => {
  switch (ch) {
    case "call": return <Phone className="h-3.5 w-3.5 text-blue-500" />;
    case "whatsapp": return <MessageSquare className="h-3.5 w-3.5 text-green-500" />;
    case "email": return <Mail className="h-3.5 w-3.5 text-purple-500" />;
    case "meeting": return <Video className="h-3.5 w-3.5 text-amber-500" />;
    default: return null;
  }
};

const sentimentIcon = (label: string) => {
  if (label === "positive") return <Smile className="h-4 w-4 text-emerald-500" />;
  if (label === "negative") return <Frown className="h-4 w-4 text-red-500" />;
  return <Meh className="h-4 w-4 text-gray-400" />;
};

const formatDuration = (sec: number) => {
  if (sec === 0) return "—";
  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec / 60)}m`;
};

export default function CommunicationIntelligence() {
  return (
    <div className="p-6 space-y-5" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Brain className="h-7 w-7 text-primary" /> Communication Intelligence
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">ניתוח סנטימנט | זיהוי כוונות | התנגדויות | דחיפות | risk/opportunity flags</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-5 gap-3">
        <Card className="border-emerald-200 bg-emerald-50/30">
          <CardContent className="pt-3 pb-2 text-center">
            <Smile className="h-5 w-5 mx-auto text-emerald-500 mb-1" />
            <p className="text-[10px] text-emerald-700">חיובי</p>
            <p className="text-2xl font-bold text-emerald-800">{sentimentStats.positive}</p>
          </CardContent>
        </Card>
        <Card className="border-gray-200 bg-gray-50/30">
          <CardContent className="pt-3 pb-2 text-center">
            <Meh className="h-5 w-5 mx-auto text-gray-400 mb-1" />
            <p className="text-[10px] text-gray-600">ניטרלי</p>
            <p className="text-2xl font-bold text-gray-700">{sentimentStats.neutral}</p>
          </CardContent>
        </Card>
        <Card className="border-red-200 bg-red-50/30">
          <CardContent className="pt-3 pb-2 text-center">
            <Frown className="h-5 w-5 mx-auto text-red-500 mb-1" />
            <p className="text-[10px] text-red-700">שלילי</p>
            <p className="text-2xl font-bold text-red-800">{sentimentStats.negative}</p>
          </CardContent>
        </Card>
        <Card className="border-red-300 bg-red-50/30">
          <CardContent className="pt-3 pb-2 text-center">
            <Flag className="h-5 w-5 mx-auto text-red-600 mb-1" />
            <p className="text-[10px] text-red-700">Risk Flags</p>
            <p className="text-2xl font-bold text-red-800">{sentimentStats.riskFlags}</p>
          </CardContent>
        </Card>
        <Card className="border-emerald-300 bg-emerald-50/30">
          <CardContent className="pt-3 pb-2 text-center">
            <Lightbulb className="h-5 w-5 mx-auto text-emerald-600 mb-1" />
            <p className="text-[10px] text-emerald-700">Opportunity Flags</p>
            <p className="text-2xl font-bold text-emerald-800">{sentimentStats.oppFlags}</p>
          </CardContent>
        </Card>
      </div>

      {/* Communications Feed */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">תקשורת אחרונה — ניתוח AI</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="max-h-[600px]">
            <div className="space-y-3">
              {communications.map(comm => (
                <div key={comm.id} className={`p-4 rounded-lg border ${
                  comm.riskFlag ? "border-red-300 bg-red-50/30" :
                  comm.opportunityFlag ? "border-emerald-300 bg-emerald-50/10" :
                  "border-border"
                }`}>
                  {/* Header */}
                  <div className="flex items-center gap-3 mb-2">
                    {channelIcon(comm.channel)}
                    <span className="text-xs font-medium">{comm.customer}</span>
                    <Badge variant="outline" className="text-[8px]">{comm.contact}</Badge>
                    <span className="text-[10px] text-muted-foreground">{comm.agent}</span>
                    <span className="text-[10px] text-muted-foreground mr-auto">{comm.date}</span>
                    {comm.duration > 0 && <Badge variant="secondary" className="text-[8px]">{formatDuration(comm.duration)}</Badge>}
                    <Badge variant="outline" className="text-[8px]">{comm.direction === "inbound" ? "נכנס" : "יוצא"}</Badge>
                  </div>

                  {/* AI Summary */}
                  <p className="text-xs text-muted-foreground mb-2">{comm.summary}</p>

                  {/* Analysis Row */}
                  <div className="flex items-center gap-3 flex-wrap">
                    {/* Sentiment */}
                    <div className="flex items-center gap-1">
                      {sentimentIcon(comm.sentimentLabel)}
                      <span className="text-[10px] font-mono">{comm.sentiment > 0 ? "+" : ""}{comm.sentiment.toFixed(2)}</span>
                    </div>

                    {/* Intent */}
                    <Badge className={`text-[8px] ${
                      comm.intent === "buy" ? "bg-emerald-100 text-emerald-700" :
                      comm.intent === "negotiate" ? "bg-blue-100 text-blue-700" :
                      comm.intent === "complain" ? "bg-red-100 text-red-700" :
                      comm.intent === "cancel" ? "bg-red-200 text-red-800" :
                      "bg-gray-100 text-gray-700"
                    }`}>
                      Intent: {comm.intent}
                    </Badge>

                    {/* Objection */}
                    {comm.objection && (
                      <Badge className="bg-amber-100 text-amber-700 text-[8px]">
                        Objection: {comm.objection}
                      </Badge>
                    )}

                    {/* Urgency */}
                    <Badge className={`text-[8px] ${
                      comm.urgency === "critical" ? "bg-red-100 text-red-700" :
                      comm.urgency === "high" ? "bg-orange-100 text-orange-700" :
                      comm.urgency === "medium" ? "bg-amber-100 text-amber-700" :
                      "bg-gray-100 text-gray-700"
                    }`}>
                      {comm.urgency}
                    </Badge>

                    {/* Flags */}
                    {comm.riskFlag && <Badge className="bg-red-200 text-red-800 text-[8px]"><AlertTriangle className="h-2.5 w-2.5 ml-0.5" />Risk</Badge>}
                    {comm.opportunityFlag && <Badge className="bg-emerald-200 text-emerald-800 text-[8px]"><Lightbulb className="h-2.5 w-2.5 ml-0.5" />Opportunity</Badge>}
                  </div>

                  {/* Followup Recommendation */}
                  <div className="mt-2 p-2 rounded bg-primary/5 border border-primary/20">
                    <div className="flex items-center gap-2">
                      <Zap className="h-3.5 w-3.5 text-primary shrink-0" />
                      <p className="text-[11px] text-primary font-medium">{comm.followup}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
