import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Brain, Zap, Activity, AlertTriangle, CheckCircle, XCircle,
  Clock, Users, Target, Shield, Send, Bell, UserCog,
  ArrowRight, DollarSign, Pause, RotateCcw, Eye
} from "lucide-react";

const recentDecisions = [
  { id: 1, time: "2026-04-08 11:45", trigger: "deal_stuck", entity: "חיפוי מגורים רמת גן", decision: "escalate", detail: "עסקה תקועה 18 ימים - escalation למנהל צוות", confidence: 0.88, status: "executed", overridden: false },
  { id: 2, time: "2026-04-08 10:30", trigger: "risk_increase", entity: "סופרגז אנרגיה", decision: "block_deal", detail: "חסמה עסקאות חדשות - סיכון אשראי קריטי", confidence: 0.95, status: "executed", overridden: false },
  { id: 3, time: "2026-04-08 09:15", trigger: "negative_interaction", entity: "שיכון ובינוי", decision: "notify_manager", detail: "אינטראקציה שלילית - העברה לטיפול מנהל", confidence: 0.82, status: "executed", overridden: false },
  { id: 4, time: "2026-04-08 08:00", trigger: "lead_created", entity: "ליד חדש - חברת ABC", decision: "auto_reassign", detail: "שויך לדני כהן (Win Rate 42%, תפוסה 78%)", confidence: 0.91, status: "executed", overridden: false },
  { id: 5, time: "2026-04-07 16:00", trigger: "no_activity", entity: "עיריית חולון", decision: "create_task", detail: "נוצרה משימת follow-up - אין פעילות 14 ימים", confidence: 0.76, status: "executed", overridden: false },
  { id: 6, time: "2026-04-07 14:30", trigger: "payment_delay", entity: "חברת אלומיניום ישראל", decision: "send_message", detail: "נשלחה תזכורת תשלום אוטומטית", confidence: 0.85, status: "executed", overridden: false },
  { id: 7, time: "2026-04-07 11:00", trigger: "lead_created", entity: "ליד חדש - קבוצת XYZ", decision: "suggest_discount", detail: "הומלץ 5% הנחת היכרות - לקוח enterprise", confidence: 0.68, status: "pending", overridden: false },
  { id: 8, time: "2026-04-07 09:00", trigger: "deal_stuck", entity: "בית ספר חולון", decision: "change_priority", detail: "שונה לעדיפות נמוכה - P(Win) ירד מ-40% ל-25%", confidence: 0.79, status: "overridden", overridden: true },
];

const aiRecommendations = [
  { customer: "קבוצת אלון", action: "שלח הצעה מורחבת למגדל B", reason: "P(Close) = 72%, buying intent עולה", who: "דני כהן", when: "היום", offer: "הנחת 8% על חבילה שנתית", confidence: 0.88 },
  { customer: "אמות השקעות", action: "תאם חתימת חוזה", reason: "עסקה באישור סופי, P(Win) = 85%", who: "דני כהן", when: "מחר", offer: "ביטוח מורחב חינם", confidence: 0.92 },
  { customer: "BIG מרכזי קניות", action: "סיור באתר + הצגת portfolio", reason: "ליד חדש בעל ערך גבוה ₪1.2M", who: "דני כהן", when: "השבוע", offer: "פגישה עם מנכ\"ל", confidence: 0.75 },
  { customer: "שיכון ובינוי", action: "פגישת הרגעה + פיצוי", reason: "סנטימנט שלילי, איום ביטול", who: "מנהל + מיכל", when: "מיידי", offer: "הנחה 3% + אספקה מזורזת", confidence: 0.80 },
];

const triggerIcon = (t: string) => {
  switch (t) {
    case "lead_created": return <Users className="h-3.5 w-3.5 text-blue-500" />;
    case "deal_stuck": return <Clock className="h-3.5 w-3.5 text-amber-500" />;
    case "no_activity": return <Pause className="h-3.5 w-3.5 text-gray-500" />;
    case "risk_increase": return <Shield className="h-3.5 w-3.5 text-red-500" />;
    case "payment_delay": return <DollarSign className="h-3.5 w-3.5 text-orange-500" />;
    case "negative_interaction": return <AlertTriangle className="h-3.5 w-3.5 text-red-500" />;
    default: return <Activity className="h-3.5 w-3.5" />;
  }
};

const decisionIcon = (d: string) => {
  switch (d) {
    case "create_task": return "📋";
    case "send_message": return "📧";
    case "escalate": return "⬆️";
    case "change_priority": return "🔄";
    case "suggest_discount": return "💰";
    case "block_deal": return "🚫";
    case "notify_manager": return "🔔";
    case "auto_reassign": return "👤";
    default: return "⚡";
  }
};

export default function DecisionEngine() {
  const executed = recentDecisions.filter(d => d.status === "executed").length;
  const pending = recentDecisions.filter(d => d.status === "pending").length;
  const overridden = recentDecisions.filter(d => d.overridden).length;
  const avgConfidence = (recentDecisions.reduce((s, d) => s + d.confidence, 0) / recentDecisions.length * 100);

  return (
    <div className="p-6 space-y-5" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Brain className="h-7 w-7 text-primary" /> Decision Engine
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">המערכת מחליטה לפני המשתמש | 6 triggers | 8 actions | AI decisions</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-3">
        <Card className="border-emerald-200 bg-emerald-50/30">
          <CardContent className="pt-3 pb-2 text-center">
            <CheckCircle className="h-5 w-5 mx-auto text-emerald-600 mb-1" />
            <p className="text-[10px] text-emerald-700">בוצעו</p>
            <p className="text-2xl font-bold text-emerald-800">{executed}</p>
          </CardContent>
        </Card>
        <Card className="border-amber-200 bg-amber-50/30">
          <CardContent className="pt-3 pb-2 text-center">
            <Clock className="h-5 w-5 mx-auto text-amber-600 mb-1" />
            <p className="text-[10px] text-amber-700">ממתין לאישור</p>
            <p className="text-2xl font-bold text-amber-800">{pending}</p>
          </CardContent>
        </Card>
        <Card className="border-purple-200 bg-purple-50/30">
          <CardContent className="pt-3 pb-2 text-center">
            <RotateCcw className="h-5 w-5 mx-auto text-purple-600 mb-1" />
            <p className="text-[10px] text-purple-700">דרסו ידנית</p>
            <p className="text-2xl font-bold text-purple-800">{overridden}</p>
          </CardContent>
        </Card>
        <Card className="border-blue-200 bg-blue-50/30">
          <CardContent className="pt-3 pb-2 text-center">
            <Target className="h-5 w-5 mx-auto text-blue-600 mb-1" />
            <p className="text-[10px] text-blue-700">AI Confidence ממוצע</p>
            <p className="text-2xl font-bold text-blue-800">{avgConfidence.toFixed(0)}%</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="decisions">
        <TabsList className="grid grid-cols-3 w-full max-w-md">
          <TabsTrigger value="decisions" className="text-xs gap-1"><Activity className="h-3.5 w-3.5" /> החלטות ({recentDecisions.length})</TabsTrigger>
          <TabsTrigger value="recommendations" className="text-xs gap-1"><Zap className="h-3.5 w-3.5" /> AI המלצות ({aiRecommendations.length})</TabsTrigger>
          <TabsTrigger value="config" className="text-xs gap-1"><UserCog className="h-3.5 w-3.5" /> הגדרות</TabsTrigger>
        </TabsList>

        {/* Recent Decisions */}
        <TabsContent value="decisions">
          <Card>
            <CardContent className="pt-4">
              <ScrollArea className="max-h-[500px]">
                <div className="space-y-2">
                  {recentDecisions.map(dec => (
                    <div key={dec.id} className={`flex items-start gap-3 p-3 rounded-lg border ${
                      dec.status === "overridden" ? "border-purple-200 bg-purple-50/20" :
                      dec.status === "pending" ? "border-amber-200 bg-amber-50/20" : "border-border"
                    }`}>
                      <div className="pt-0.5">{triggerIcon(dec.trigger)}</div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium">{decisionIcon(dec.decision)} {dec.entity}</span>
                          <Badge variant="outline" className="text-[8px]">{dec.trigger.replace("_", " ")}</Badge>
                          <span className="text-[10px] text-muted-foreground mr-auto">{dec.time}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">{dec.detail}</p>
                        <div className="flex items-center gap-3 mt-1.5">
                          <Badge className={`text-[8px] ${
                            dec.status === "executed" ? "bg-emerald-100 text-emerald-700" :
                            dec.status === "pending" ? "bg-amber-100 text-amber-700" :
                            "bg-purple-100 text-purple-700"
                          }`}>
                            {dec.status === "executed" ? "בוצע" : dec.status === "pending" ? "ממתין" : "נדרס ידנית"}
                          </Badge>
                          <span className="text-[9px] text-muted-foreground">Confidence: {(dec.confidence * 100).toFixed(0)}%</span>
                        </div>
                      </div>
                      {dec.status === "pending" && (
                        <div className="flex gap-1 shrink-0">
                          <Button variant="outline" size="sm" className="h-6 text-[9px]"><CheckCircle className="h-3 w-3 ml-0.5" />אשר</Button>
                          <Button variant="ghost" size="sm" className="h-6 text-[9px]"><XCircle className="h-3 w-3 ml-0.5" />דחה</Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* AI Recommendations */}
        <TabsContent value="recommendations">
          <div className="space-y-3">
            {aiRecommendations.map((rec, i) => (
              <Card key={i} className="border-r-4 border-r-primary">
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-start gap-4">
                    <div className="p-2 rounded-lg bg-primary/10 shrink-0">
                      <Zap className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-sm">{rec.customer}</h3>
                        <Badge className="bg-blue-100 text-blue-700 text-[9px]">Confidence: {(rec.confidence * 100).toFixed(0)}%</Badge>
                      </div>
                      <div className="mt-2 p-2.5 rounded-lg bg-primary/5 border border-primary/20">
                        <p className="text-sm font-medium text-primary">{rec.action}</p>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1.5">{rec.reason}</p>
                      <div className="flex items-center gap-4 mt-2 text-[10px] text-muted-foreground">
                        <span>👤 {rec.who}</span>
                        <span>📅 {rec.when}</span>
                        {rec.offer && <span>🎁 {rec.offer}</span>}
                      </div>
                    </div>
                    <Button size="sm" className="shrink-0"><CheckCircle className="h-3.5 w-3.5 ml-1" /> בצע</Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Configuration */}
        <TabsContent value="config">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">הגדרות Decision Engine</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {[
                { label: "שיוך לידים אוטומטי", desc: "AI מחליט לאיזה סוכן לשלוח ליד חדש", enabled: true },
                { label: "Escalation אוטומטי", desc: "העברה אוטומטית למנהל כשעסקה תקועה", enabled: true },
                { label: "חסימת עסקאות בסיכון", desc: "חסימת עסקאות חדשות עם לקוחות בסיכון גבוה", enabled: true },
                { label: "שליחת תזכורות אוטומטית", desc: "תזכורות תשלום ו-follow-up", enabled: true },
                { label: "שינוי עדיפות אוטומטי", desc: "AI משנה עדיפות עסקאות לפי P(Win)", enabled: false },
                { label: "המלצת הנחה אוטומטית", desc: "AI מציע הנחות לפי פרופיל לקוח", enabled: false },
                { label: "שיוך מחדש אוטומטי", desc: "העברת לידים מסוכנים שלא מטפלים", enabled: true },
                { label: "התראות מנהל", desc: "התראות real-time על אירועים קריטיים", enabled: true },
              ].map((setting, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div>
                    <p className="text-sm font-medium">{setting.label}</p>
                    <p className="text-[10px] text-muted-foreground">{setting.desc}</p>
                  </div>
                  <Switch defaultChecked={setting.enabled} />
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
