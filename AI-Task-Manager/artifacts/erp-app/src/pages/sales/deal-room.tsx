import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  FileText, Users, DollarSign, Calendar, Clock, CheckCircle,
  AlertTriangle, Paperclip, MessageSquare, Target, Zap, Phone,
  Mail, TrendingUp, Shield, Award, ChevronRight, Plus, Send
} from "lucide-react";

// Single Deal Deep View
const deal = {
  id: 1,
  name: "פרויקט מגדל A — שלב ב'",
  number: "OPP-000042",
  customer: "קבוצת אלון",
  contact: "אבי כהן",
  contactRole: "מנהל רכש",
  owner: "דני כהן",
  value: 850000,
  weightedValue: 552500,
  stage: "משא ומתן",
  probability: 65,
  predictedClose: "2026-05-15",
  daysInStage: 12,
  totalDaysOpen: 58,
  source: "הפניה",
  competitors: ["אלומיל", "פרופילון"],
  nextAction: "פגישת סיכום מחירים עם CFO",
  nextActionDate: "2026-04-12",

  // Scenarios
  bestCase: 920000,
  expectedCase: 750000,
  worstCase: 450000,

  // AI Insights
  winProbability: 65,
  aiRecommendation: "הצע הנחת 5% על חתימה תוך שבוע — momentum חיובי",
  riskFactors: ["מתחרה אלומיל הגיש הצעה נמוכה ב-8%", "CFO דורש אישור דירקטוריון"],
  positiveSignals: ["סנטימנט חיובי בשיחה אחרונה", "מבקש פגישת סיכום", "שואל על תנאי אחריות"],
  stuckRisk: false,

  // Timeline
  activities: [
    { date: "2026-04-08 10:30", type: "call", summary: "שיחה עם אבי - דן על מחיר סופי, חיובי", sentiment: 0.72, by: "דני כהן" },
    { date: "2026-04-05 14:00", type: "email", summary: "נשלחה הצעה מעודכנת v3 עם 5% הנחה", sentiment: 0, by: "דני כהן" },
    { date: "2026-04-02 09:00", type: "meeting", summary: "סיור באתר מגדל A - מדידות נוספות", sentiment: 0.65, by: "דני כהן" },
    { date: "2026-03-28 16:00", type: "call", summary: "אבי עדכן על מתחרה - אלומיל הציע ₪780K", sentiment: -0.15, by: "דני כהן" },
    { date: "2026-03-20 11:00", type: "proposal", summary: "הצעה v2 נשלחה - ₪880K", sentiment: 0, by: "דני כהן" },
    { date: "2026-03-10 10:00", type: "meeting", summary: "פגישת היכרות ראשונה - הצגת portfolio", sentiment: 0.55, by: "דני כהן" },
    { date: "2026-02-10 09:00", type: "lead", summary: "ליד התקבל מהפניה של דוד שמיר (אמות)", sentiment: 0, by: "system" },
  ],

  // Documents
  documents: [
    { name: "הצעת מחיר v3", type: "proposal", date: "2026-04-05", size: "2.4MB" },
    { name: "הצעת מחיר v2", type: "proposal", date: "2026-03-20", size: "2.1MB" },
    { name: "מפרט טכני מגדל A", type: "spec", date: "2026-03-02", size: "5.8MB" },
    { name: "סיכום סיור באתר", type: "notes", date: "2026-04-02", size: "180KB" },
  ],

  // Stakeholders
  stakeholders: [
    { name: "אבי כהן", role: "מנהל רכש", influence: 85, isDecisionMaker: true, sentiment: "positive", lastContact: "2026-04-08" },
    { name: "משה כהן", role: "CFO", influence: 90, isDecisionMaker: true, sentiment: "neutral", lastContact: "2026-03-28" },
    { name: "יוסי לוי", role: "מהנדס ראשי", influence: 60, isDecisionMaker: false, sentiment: "positive", lastContact: "2026-04-02" },
  ],

  // Line items
  lineItems: [
    { description: "פרופילי אלומיניום דגם Pro-X", qty: 450, unit: "מ\"ר", price: 680, total: 306000 },
    { description: "זכוכית מחוסמת 8mm", qty: 320, unit: "מ\"ר", price: 520, total: 166400 },
    { description: "אביזרי הרכבה premium", qty: 1, unit: "חבילה", price: 45000, total: 45000 },
    { description: "עבודות התקנה", qty: 450, unit: "מ\"ר", price: 280, total: 126000 },
    { description: "שילוח והובלה", qty: 1, unit: "פאושלי", price: 18000, total: 18000 },
    { description: "אחריות מורחבת 5 שנים", qty: 1, unit: "חבילה", price: 35000, total: 35000 },
  ],
};

const fmt = (v: number) => v >= 1000000 ? `₪${(v / 1000000).toFixed(2)}M` : v >= 1000 ? `₪${(v / 1000).toFixed(0)}K` : `₪${v.toLocaleString()}`;

const activityIcon = (type: string) => {
  switch (type) {
    case "call": return <Phone className="h-3.5 w-3.5 text-blue-500" />;
    case "email": return <Mail className="h-3.5 w-3.5 text-purple-500" />;
    case "meeting": return <Users className="h-3.5 w-3.5 text-amber-500" />;
    case "proposal": return <FileText className="h-3.5 w-3.5 text-indigo-500" />;
    case "lead": return <Zap className="h-3.5 w-3.5 text-emerald-500" />;
    default: return <Clock className="h-3.5 w-3.5 text-gray-400" />;
  }
};

export default function DealRoom() {
  return (
    <div className="p-6 space-y-5" dir="rtl">
      {/* Deal Header */}
      <Card className="border-primary/20">
        <CardContent className="pt-5">
          <div className="flex items-start gap-5">
            <div className={`w-16 h-16 rounded-xl flex items-center justify-center text-lg font-bold text-white ${deal.probability >= 70 ? "bg-emerald-500" : deal.probability >= 40 ? "bg-blue-500" : "bg-amber-500"}`}>
              {deal.probability}%
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-bold">{deal.name}</h1>
                <Badge variant="outline" className="font-mono">{deal.number}</Badge>
                <Badge className="bg-purple-100 text-purple-700">{deal.stage}</Badge>
              </div>
              <div className="flex items-center gap-6 mt-2 text-sm text-muted-foreground">
                <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{deal.customer}</span>
                <span className="flex items-center gap-1"><Target className="h-3.5 w-3.5" />{deal.owner}</span>
                <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />Close: {deal.predictedClose}</span>
                <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{deal.totalDaysOpen}d open | {deal.daysInStage}d in stage</span>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-[10px] text-emerald-600">Best</p>
                <p className="text-lg font-bold font-mono">{fmt(deal.bestCase)}</p>
              </div>
              <div>
                <p className="text-[10px] text-blue-600">Expected</p>
                <p className="text-lg font-bold font-mono text-primary">{fmt(deal.expectedCase)}</p>
              </div>
              <div>
                <p className="text-[10px] text-red-600">Worst</p>
                <p className="text-lg font-bold font-mono">{fmt(deal.worstCase)}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* AI Insight Bar */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="pt-3 pb-3">
          <div className="flex items-center gap-3">
            <Zap className="h-5 w-5 text-primary shrink-0" />
            <p className="text-sm font-medium text-primary flex-1">{deal.aiRecommendation}</p>
            <Button size="sm"><CheckCircle className="h-3.5 w-3.5 ml-1" /> בצע</Button>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="timeline">
        <TabsList className="grid grid-cols-6 w-full">
          <TabsTrigger value="timeline" className="text-xs gap-1"><Activity className="h-3 w-3" /> Timeline</TabsTrigger>
          <TabsTrigger value="stakeholders" className="text-xs gap-1"><Users className="h-3 w-3" /> Stakeholders</TabsTrigger>
          <TabsTrigger value="proposal" className="text-xs gap-1"><FileText className="h-3 w-3" /> הצעה</TabsTrigger>
          <TabsTrigger value="docs" className="text-xs gap-1"><Paperclip className="h-3 w-3" /> מסמכים</TabsTrigger>
          <TabsTrigger value="competition" className="text-xs gap-1"><Shield className="h-3 w-3" /> מתחרים</TabsTrigger>
          <TabsTrigger value="signals" className="text-xs gap-1"><Brain className="h-3 w-3" /> AI Signals</TabsTrigger>
        </TabsList>

        {/* Timeline */}
        <TabsContent value="timeline">
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm">היסטוריית פעילות</CardTitle>
              <Button size="sm"><Plus className="h-3.5 w-3.5 ml-1" /> פעילות חדשה</Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {deal.activities.map((a, i) => (
                  <div key={i} className="flex gap-4 border-r-2 border-primary/20 pr-4 relative">
                    <div className="absolute -right-[5px] top-1 h-2.5 w-2.5 rounded-full bg-primary" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        {activityIcon(a.type)}
                        <Badge variant="outline" className="text-[8px]">{a.type}</Badge>
                        <span className="text-[10px] text-muted-foreground">{a.date}</span>
                        <span className="text-[10px] text-muted-foreground mr-auto">{a.by}</span>
                        {a.sentiment !== 0 && (
                          <Badge className={`text-[8px] ${a.sentiment > 0 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                            {a.sentiment > 0 ? "😊" : "😟"} {a.sentiment > 0 ? "+" : ""}{a.sentiment.toFixed(2)}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs mt-1">{a.summary}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Quick note */}
              <div className="mt-4 flex gap-2">
                <Textarea placeholder="הוסף הערה מהירה..." className="h-10 text-xs" />
                <Button size="sm"><Send className="h-3.5 w-3.5" /></Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Stakeholders */}
        <TabsContent value="stakeholders">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-right text-[10px] font-semibold">שם</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">תפקיד</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">השפעה</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">מחליט?</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">סנטימנט</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">מגע אחרון</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deal.stakeholders.map((s, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium text-xs">{s.name}</TableCell>
                      <TableCell className="text-xs">{s.role}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Progress value={s.influence} className="h-2 w-14" />
                          <span className="text-[9px] font-mono">{s.influence}%</span>
                        </div>
                      </TableCell>
                      <TableCell>{s.isDecisionMaker ? <Award className="h-4 w-4 text-amber-500" /> : <span className="text-[10px] text-muted-foreground">—</span>}</TableCell>
                      <TableCell>
                        <Badge className={`text-[9px] ${s.sentiment === "positive" ? "bg-emerald-100 text-emerald-700" : s.sentiment === "negative" ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-700"}`}>
                          {s.sentiment === "positive" ? "😊 חיובי" : s.sentiment === "negative" ? "😟 שלילי" : "😐 ניטרלי"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-[10px] text-muted-foreground">{s.lastContact}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Proposal / Line Items */}
        <TabsContent value="proposal">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">שורות הצעה — {deal.name}</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-right text-[10px] font-semibold">תיאור</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">כמות</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">יחידה</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">מחיר יחידה</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">סה"כ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deal.lineItems.map((li, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs font-medium">{li.description}</TableCell>
                      <TableCell className="font-mono text-[10px]">{li.qty}</TableCell>
                      <TableCell className="text-[10px]">{li.unit}</TableCell>
                      <TableCell className="font-mono text-[10px]">{fmt(li.price)}</TableCell>
                      <TableCell className="font-mono text-[10px] font-bold">{fmt(li.total)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-primary/5 font-bold border-t-2">
                    <TableCell colSpan={4} className="text-xs">סה"כ לפני מע"מ</TableCell>
                    <TableCell className="font-mono text-xs">{fmt(deal.lineItems.reduce((s, li) => s + li.total, 0))}</TableCell>
                  </TableRow>
                  <TableRow className="bg-primary/5">
                    <TableCell colSpan={4} className="text-xs text-muted-foreground">מע"מ 17%</TableCell>
                    <TableCell className="font-mono text-[10px] text-muted-foreground">{fmt(deal.lineItems.reduce((s, li) => s + li.total, 0) * 0.17)}</TableCell>
                  </TableRow>
                  <TableRow className="bg-primary/10 font-bold border-t-2">
                    <TableCell colSpan={4} className="text-sm">סה"כ כולל מע"מ</TableCell>
                    <TableCell className="font-mono text-sm">{fmt(deal.lineItems.reduce((s, li) => s + li.total, 0) * 1.17)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Documents */}
        <TabsContent value="docs">
          <Card>
            <CardContent className="pt-4">
              <div className="space-y-2">
                {deal.documents.map((doc, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-lg border hover:bg-accent cursor-pointer">
                    <FileText className="h-5 w-5 text-primary shrink-0" />
                    <div className="flex-1">
                      <p className="text-xs font-medium">{doc.name}</p>
                      <p className="text-[10px] text-muted-foreground">{doc.date} | {doc.size}</p>
                    </div>
                    <Badge variant="outline" className="text-[8px]">{doc.type}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Competition */}
        <TabsContent value="competition">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Shield className="h-4 w-4 text-red-500" /> מתחרים בעסקה</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-3">
                {deal.competitors.map((comp, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-lg border border-red-200 bg-red-50/20">
                    <Shield className="h-5 w-5 text-red-500 shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-bold">{comp}</p>
                      {comp === "אלומיל" && <p className="text-xs text-red-600 mt-0.5">הגישו הצעה נמוכה ב-8% (₪780K לעומת ₪850K)</p>}
                    </div>
                    <Badge className="bg-red-100 text-red-700 text-[9px]">מתחרה פעיל</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* AI Signals */}
        <TabsContent value="signals">
          <div className="grid grid-cols-2 gap-4">
            <Card className="border-emerald-200">
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="h-4 w-4 text-emerald-500" /> סיגנלים חיוביים</CardTitle></CardHeader>
              <CardContent>
                {deal.positiveSignals.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 py-1.5 border-b last:border-0">
                    <CheckCircle className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                    <span className="text-xs">{s}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card className="border-red-200">
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-red-500" /> גורמי סיכון</CardTitle></CardHeader>
              <CardContent>
                {deal.riskFactors.map((r, i) => (
                  <div key={i} className="flex items-center gap-2 py-1.5 border-b last:border-0">
                    <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                    <span className="text-xs">{r}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
