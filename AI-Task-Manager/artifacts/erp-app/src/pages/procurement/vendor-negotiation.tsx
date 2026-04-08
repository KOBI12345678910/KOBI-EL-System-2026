import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Handshake, TrendingUp, TrendingDown, Target, Users, Trophy,
  BarChart3, MessageSquare, Brain, ArrowDownRight, Repeat,
  CheckCircle2, Clock, AlertTriangle, Zap, Shield
} from "lucide-react";

const fmt = (v: number) => new Intl.NumberFormat("he-IL").format(v);
const fmtCurrency = (v: number) => "\u20AA" + fmt(v);
const fmtPct = (v: number) => v.toFixed(1) + "%";

// ============================================================
// NEGOTIATION SESSIONS (Active)
// ============================================================
const FALLBACK_NEGOTIATION_SESSIONS = [
  { id: "NEG-2026-041", supplier: "Alumil SA", material: "פרופיל אלומיניום 100mm", initialPrice: 55.0, targetPrice: 44.0, currentOffer: 47.5, rounds: 4, discountPct: 13.6, status: "במו\"מ", urgency: "גבוהה", startDate: "2026-03-15", volume: "12,000 מ' רץ" },
  { id: "NEG-2026-042", supplier: "Foshan Glass Co.", material: "זכוכית מחוסמת 10mm", initialPrice: 220.0, targetPrice: 185.0, currentOffer: 195.0, rounds: 3, discountPct: 11.4, status: "המתנה להצעה", urgency: "בינונית", startDate: "2026-03-22", volume: '800 מ"ר' },
  { id: "NEG-2026-043", supplier: "מפעלי ברזל השרון", material: 'ברזל T-45 מגולוון', initialPrice: 14.5, targetPrice: 11.0, currentOffer: 12.8, rounds: 2, discountPct: 11.7, status: "במו\"מ", urgency: "גבוהה", startDate: "2026-04-01", volume: '25,000 ק"ג' },
  { id: "NEG-2026-044", supplier: "Schüco International", material: "מערכת חלונות ASS 77 PD", initialPrice: 3200.0, targetPrice: 2700.0, currentOffer: 2950.0, rounds: 5, discountPct: 7.8, status: "קרוב לסגירה", urgency: "נמוכה", startDate: "2026-02-28", volume: "150 יחידות" },
  { id: "NEG-2026-045", supplier: "Tremco Illbruck", material: "אטם EPDM פרימיום", initialPrice: 11.5, targetPrice: 8.0, currentOffer: 9.2, rounds: 3, discountPct: 20.0, status: "במו\"מ", urgency: "בינונית", startDate: "2026-03-18", volume: "6,000 מ' רץ" },
  { id: "NEG-2026-046", supplier: "Würth Israel", material: "ברגי נירוסטה A4 (מגוון)", initialPrice: 2.40, targetPrice: 1.60, currentOffer: 1.90, rounds: 2, discountPct: 20.8, status: "המתנה להצעה", urgency: "נמוכה", startDate: "2026-04-05", volume: "50,000 יחידות" },
  { id: "NEG-2026-047", supplier: "אלומיניום הגליל", material: "פח אלומיניום 3mm", initialPrice: 115.0, targetPrice: 88.0, currentOffer: 98.0, rounds: 3, discountPct: 14.8, status: "במו\"מ", urgency: "גבוהה", startDate: "2026-03-10", volume: '2,500 מ"ר' },
  { id: "NEG-2026-048", supplier: "AGC Glass Europe", material: "זכוכית שכבתית Low-E", initialPrice: 340.0, targetPrice: 280.0, currentOffer: 305.0, rounds: 4, discountPct: 10.3, status: "קרוב לסגירה", urgency: "בינונית", startDate: "2026-03-05", volume: '600 מ"ר' },
];

// ============================================================
// NEGOTIATION HISTORY (Completed)
// ============================================================
const FALLBACK_NEGOTIATION_HISTORY = [
  { id: "NEG-2026-031", supplier: "Alumil SA", material: "פרופיל אלומיניום 80mm", initialPrice: 42.0, finalPrice: 35.5, targetPrice: 34.0, discountPct: 15.5, rounds: 6, outcome: "הצלחה", savings: 39000, closedDate: "2026-02-28" },
  { id: "NEG-2026-028", supplier: "Foshan Glass Co.", material: "זכוכית מחוסמת 8mm", initialPrice: 195.0, finalPrice: 178.0, targetPrice: 170.0, discountPct: 8.7, rounds: 4, outcome: "הצלחה חלקית", savings: 13600, closedDate: "2026-02-15" },
  { id: "NEG-2026-025", supplier: "מפעלי ברזל השרון", material: "ברזל T-30", initialPrice: 11.0, finalPrice: 9.8, targetPrice: 9.5, discountPct: 10.9, rounds: 3, outcome: "הצלחה", savings: 18000, closedDate: "2026-02-01" },
  { id: "NEG-2026-022", supplier: "Sika AG", material: "דבק אפוקסי תעשייתי", initialPrice: 85.0, finalPrice: 72.0, targetPrice: 70.0, discountPct: 15.3, rounds: 5, outcome: "הצלחה", savings: 7800, closedDate: "2026-01-20" },
  { id: "NEG-2026-019", supplier: "Hilti Israel", material: "מקדחי SDS-Plus (סט)", initialPrice: 450.0, finalPrice: 420.0, targetPrice: 380.0, discountPct: 6.7, rounds: 2, outcome: "נכשל", savings: 1800, closedDate: "2026-01-10" },
  { id: "NEG-2026-015", supplier: "Würth Israel", material: "דיבלים כימיים (ארגז)", initialPrice: 320.0, finalPrice: 265.0, targetPrice: 260.0, discountPct: 17.2, rounds: 4, outcome: "הצלחה", savings: 11000, closedDate: "2025-12-28" },
  { id: "NEG-2025-098", supplier: "Novelis", material: "פח אלומיניום 2mm", initialPrice: 102.0, finalPrice: 89.5, targetPrice: 85.0, discountPct: 12.3, rounds: 5, outcome: "הצלחה חלקית", savings: 25000, closedDate: "2025-12-15" },
];

// ============================================================
// PRICE TARGET VS ACTUAL COMPARISON
// ============================================================
const FALLBACK_PRICE_COMPARISONS = [
  { material: "פרופיל אלומיניום 100mm", supplier: "Alumil SA", initialPrice: 55.0, targetPrice: 44.0, currentOffer: 47.5, gap: 3.5, gapPct: 8.0, achievedPct: 68.2 },
  { material: "זכוכית מחוסמת 10mm", supplier: "Foshan Glass Co.", initialPrice: 220.0, targetPrice: 185.0, currentOffer: 195.0, gap: 10.0, gapPct: 5.4, achievedPct: 71.4 },
  { material: 'ברזל T-45 מגולוון', supplier: "מפעלי ברזל השרון", initialPrice: 14.5, targetPrice: 11.0, currentOffer: 12.8, gap: 1.8, gapPct: 16.4, achievedPct: 48.6 },
  { material: "מערכת חלונות ASS 77 PD", supplier: "Schüco International", initialPrice: 3200.0, targetPrice: 2700.0, currentOffer: 2950.0, gap: 250.0, gapPct: 9.3, achievedPct: 50.0 },
  { material: "אטם EPDM פרימיום", supplier: "Tremco Illbruck", initialPrice: 11.5, targetPrice: 8.0, currentOffer: 9.2, gap: 1.2, gapPct: 15.0, achievedPct: 65.7 },
  { material: "ברגי נירוסטה A4", supplier: "Würth Israel", initialPrice: 2.40, targetPrice: 1.60, currentOffer: 1.90, gap: 0.30, gapPct: 18.8, achievedPct: 62.5 },
  { material: "פח אלומיניום 3mm", supplier: "אלומיניום הגליל", initialPrice: 115.0, targetPrice: 88.0, currentOffer: 98.0, gap: 10.0, gapPct: 11.4, achievedPct: 63.0 },
  { material: "זכוכית שכבתית Low-E", supplier: "AGC Glass Europe", initialPrice: 340.0, targetPrice: 280.0, currentOffer: 305.0, gap: 25.0, gapPct: 8.9, achievedPct: 58.3 },
];

// ============================================================
// AI STRATEGY RECOMMENDATIONS
// ============================================================
const FALLBACK_AI_STRATEGIES = [
  { id: "NEG-2026-041", supplier: "Alumil SA", material: "פרופיל אלומיניום 100mm", confidence: 87, recommendation: "הגדל נפח הזמנה ל-15,000 מ' רץ ודרוש הנחת כמות נוספת. ספק זה רגיש במיוחד לנפח — היסטורית הציע הנחות של 3-5% נוספים בהזמנות מעל 14,000. המלצה: הצע חוזה שנתי עם התחייבות כמותית.", strategy: "הנחת כמות + חוזה שנתי", risk: "נמוכה", expectedDiscount: "16-18%" },
  { id: "NEG-2026-042", supplier: "Foshan Glass Co.", material: "זכוכית מחוסמת 10mm", confidence: 72, recommendation: "הצג הצעה מתחרה מ-AGC Glass כמנוף לחץ. ספק זה הוריד מחירים ב-4 מתוך 5 מו\"מ קודמים כשהוצגה הצעה חלופית. שקול גם תשלום מוקדם (30 יום במקום 60) כתמריץ להנחה נוספת.", strategy: "הצעה מתחרה + תנאי תשלום", risk: "בינונית", expectedDiscount: "13-15%" },
  { id: "NEG-2026-043", supplier: "מפעלי ברזל השרון", material: 'ברזל T-45 מגולוון', confidence: 65, recommendation: "מחירי הברזל בשוק העולמי ירדו ב-8% ברבעון האחרון. הצג נתוני שוק עדכניים ודרוש התאמת מחיר. ספק זה לרוב מגיב לנתוני שוק תוך סבב אחד. טקטיקה: הצג גרף מחירי LME.", strategy: "מינוף נתוני שוק", risk: "נמוכה", expectedDiscount: "14-16%" },
  { id: "NEG-2026-044", supplier: "Schüco International", material: "מערכת חלונות ASS 77 PD", confidence: 91, recommendation: "ספק זה קרוב לסגירת רבעון ויש לו יעדי מכירות לעמוד בהם. נצל חלון הזדמנויות זה — הצע סגירה מיידית בתמורה להנחה נוספת של 5%. היסטורית, Schüco נתן הנחות סוף רבעון ב-78% מהמקרים.", strategy: "מינוף סוף רבעון", risk: "נמוכה", expectedDiscount: "10-12%" },
  { id: "NEG-2026-045", supplier: "Tremco Illbruck", material: "אטם EPDM פרימיום", confidence: 78, recommendation: "הצע עסקת חבילה — שלב הזמנת אטמים עם דבקי איטום (חוסך לספק עלויות משלוח ולוגיסטיקה). בעסקאות חבילה קודמות, ספק זה הציע הנחה ממוצעת של 22%. שקול גם מעבר לאטם גנרי כחלופה.", strategy: "עסקת חבילה", risk: "בינונית", expectedDiscount: "22-25%" },
  { id: "NEG-2026-047", supplier: "אלומיניום הגליל", material: "פח אלומיניום 3mm", confidence: 83, recommendation: "ספק מקומי עם זמני אספקה קצרים — זה היתרון שלו. הצע חוזה שנתי בלעדי (ללא מתחרים מקומיים) בתמורה למחיר מטרה. היסטורית, חוזי בלעדיות הניבו הנחה ממוצעת של 18%.", strategy: "בלעדיות + חוזה ארוך", risk: "בינונית", expectedDiscount: "17-19%" },
];

const statusColors: Record<string, string> = {
  'במו"מ': "bg-blue-500/20 text-blue-400 border-blue-500/30",
  "המתנה להצעה": "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  "קרוב לסגירה": "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
};

const outcomeColors: Record<string, string> = {
  "הצלחה": "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  "הצלחה חלקית": "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  "נכשל": "bg-red-500/20 text-red-400 border-red-500/30",
};

const urgencyColors: Record<string, string> = {
  "גבוהה": "bg-red-500/20 text-red-400",
  "בינונית": "bg-yellow-500/20 text-yellow-400",
  "נמוכה": "bg-gray-500/20 text-gray-400",
};

const riskColors: Record<string, string> = {
  "נמוכה": "text-emerald-400",
  "בינונית": "text-yellow-400",
  "גבוהה": "text-red-400",
};

export default function VendorNegotiation() {
  const { data: vendornegotiationData } = useQuery({
    queryKey: ["vendor-negotiation"],
    queryFn: () => authFetch("/api/procurement/vendor_negotiation"),
    staleTime: 5 * 60 * 1000,
  });

  const negotiationSessions = vendornegotiationData ?? FALLBACK_NEGOTIATION_SESSIONS;

  const [activeTab, setActiveTab] = useState("active");

  const totalActive = negotiationSessions.length;
  const completedThisMonth = negotiationHistory.filter(n => n.closedDate >= "2026-03-01").length;
  const avgDiscount = negotiationHistory.reduce((s, n) => s + n.discountPct, 0) / negotiationHistory.length;
  const totalSavings = negotiationHistory.reduce((s, n) => s + n.savings, 0);
  const winRate = (negotiationHistory.filter(n => n.outcome === "הצלחה" || n.outcome === "הצלחה חלקית").length / negotiationHistory.length) * 100;
  const avgRounds = Math.round(negotiationHistory.reduce((s, n) => s + n.rounds, 0) / negotiationHistory.length);

  return (
    <div dir="rtl" className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-gradient-to-br from-amber-500/20 to-orange-500/20 rounded-xl border border-amber-500/30">
          <Handshake className="w-6 h-6 text-amber-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">ניהול מו״מ עם ספקים</h1>
          <p className="text-sm text-muted-foreground">ניטור משאים ומתנים, השוואת מחירים, ואסטרטגיות AI</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card className="bg-slate-800/50 border-slate-700/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <MessageSquare className="w-4 h-4 text-blue-400" />
              <span className="text-xs text-muted-foreground">מו״מ פעילים</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{totalActive}</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-800/50 border-slate-700/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span className="text-xs text-muted-foreground">הושלמו החודש</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{completedThisMonth}</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-800/50 border-slate-700/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingDown className="w-4 h-4 text-green-400" />
              <span className="text-xs text-muted-foreground">הנחה ממוצעת</span>
            </div>
            <p className="text-2xl font-bold text-green-400">{fmtPct(avgDiscount)}</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-800/50 border-slate-700/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <BarChart3 className="w-4 h-4 text-cyan-400" />
              <span className="text-xs text-muted-foreground">סה״כ חיסכון</span>
            </div>
            <p className="text-2xl font-bold text-cyan-400">{fmtCurrency(totalSavings)}</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-800/50 border-slate-700/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Trophy className="w-4 h-4 text-amber-400" />
              <span className="text-xs text-muted-foreground">אחוז הצלחה</span>
            </div>
            <p className="text-2xl font-bold text-amber-400">{fmtPct(winRate)}</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-800/50 border-slate-700/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Repeat className="w-4 h-4 text-purple-400" />
              <span className="text-xs text-muted-foreground">סבבים ממוצע</span>
            </div>
            <p className="text-2xl font-bold text-purple-400">{avgRounds}</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-slate-800/70 border border-slate-700/50">
          <TabsTrigger value="active">מו״מ פעיל</TabsTrigger>
          <TabsTrigger value="history">היסטוריה</TabsTrigger>
          <TabsTrigger value="compare">השוואה</TabsTrigger>
          <TabsTrigger value="strategy">אסטרטגיה</TabsTrigger>
        </TabsList>

        {/* Active Negotiations */}
        <TabsContent value="active">
          <Card className="bg-slate-800/50 border-slate-700/50">
            <CardHeader><CardTitle className="text-lg flex items-center gap-2"><MessageSquare className="w-5 h-5 text-blue-400" />משאים ומתנים פעילים</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700/50">
                    <TableHead className="text-right">מזהה</TableHead>
                    <TableHead className="text-right">ספק</TableHead>
                    <TableHead className="text-right">חומר / מוצר</TableHead>
                    <TableHead className="text-right">מחיר פתיחה</TableHead>
                    <TableHead className="text-right">מחיר מטרה</TableHead>
                    <TableHead className="text-right">הצעה נוכחית</TableHead>
                    <TableHead className="text-center">סבבים</TableHead>
                    <TableHead className="text-center">הנחה %</TableHead>
                    <TableHead className="text-center">דחיפות</TableHead>
                    <TableHead className="text-center">סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {negotiationSessions.map((n) => (
                    <TableRow key={n.id} className="border-slate-700/30 hover:bg-slate-700/20">
                      <TableCell className="font-mono text-xs text-blue-400">{n.id}</TableCell>
                      <TableCell className="font-medium">{n.supplier}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{n.material}</TableCell>
                      <TableCell className="text-sm">{fmtCurrency(n.initialPrice)}</TableCell>
                      <TableCell className="text-sm text-emerald-400">{fmtCurrency(n.targetPrice)}</TableCell>
                      <TableCell className="text-sm font-semibold">{fmtCurrency(n.currentOffer)}</TableCell>
                      <TableCell className="text-center"><Badge variant="outline" className="bg-slate-700/50">{n.rounds}</Badge></TableCell>
                      <TableCell className="text-center text-green-400 font-medium">{fmtPct(n.discountPct)}</TableCell>
                      <TableCell className="text-center"><Badge className={`${urgencyColors[n.urgency]} border-0 text-xs`}>{n.urgency}</Badge></TableCell>
                      <TableCell className="text-center"><Badge className={`${statusColors[n.status] || "bg-gray-500/20 text-gray-400"} border text-xs`}>{n.status}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* History */}
        <TabsContent value="history">
          <Card className="bg-slate-800/50 border-slate-700/50">
            <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Clock className="w-5 h-5 text-purple-400" />היסטוריית מו״מ</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700/50">
                    <TableHead className="text-right">מזהה</TableHead>
                    <TableHead className="text-right">ספק</TableHead>
                    <TableHead className="text-right">חומר</TableHead>
                    <TableHead className="text-right">מחיר פתיחה</TableHead>
                    <TableHead className="text-right">מחיר סופי</TableHead>
                    <TableHead className="text-center">סבבים</TableHead>
                    <TableHead className="text-center">הנחה %</TableHead>
                    <TableHead className="text-right">חיסכון</TableHead>
                    <TableHead className="text-center">תוצאה</TableHead>
                    <TableHead className="text-right">תאריך סגירה</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {negotiationHistory.map((n) => (
                    <TableRow key={n.id} className="border-slate-700/30 hover:bg-slate-700/20">
                      <TableCell className="font-mono text-xs text-purple-400">{n.id}</TableCell>
                      <TableCell className="font-medium">{n.supplier}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{n.material}</TableCell>
                      <TableCell className="text-sm line-through text-red-400/70">{fmtCurrency(n.initialPrice)}</TableCell>
                      <TableCell className="text-sm font-semibold text-emerald-400">{fmtCurrency(n.finalPrice)}</TableCell>
                      <TableCell className="text-center">{n.rounds}</TableCell>
                      <TableCell className="text-center text-green-400 font-medium">{fmtPct(n.discountPct)}</TableCell>
                      <TableCell className="text-sm text-cyan-400">{fmtCurrency(n.savings)}</TableCell>
                      <TableCell className="text-center"><Badge className={`${outcomeColors[n.outcome] || "bg-gray-500/20 text-gray-400"} border text-xs`}>{n.outcome}</Badge></TableCell>
                      <TableCell className="text-sm text-muted-foreground">{n.closedDate}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Price Comparison: Target vs Actual */}
        <TabsContent value="compare">
          <Card className="bg-slate-800/50 border-slate-700/50">
            <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Target className="w-5 h-5 text-cyan-400" />השוואת מחיר מטרה מול הצעה נוכחית</CardTitle></CardHeader>
            <CardContent className="space-y-5">
              {priceComparisons.map((c, i) => (
                <div key={i} className="p-4 rounded-xl bg-slate-900/50 border border-slate-700/30 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-foreground">{c.material}</p>
                      <p className="text-xs text-muted-foreground">{c.supplier}</p>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-muted-foreground">פתיחה: <span className="text-red-400">{fmtCurrency(c.initialPrice)}</span></span>
                      <span className="text-muted-foreground">מטרה: <span className="text-emerald-400">{fmtCurrency(c.targetPrice)}</span></span>
                      <span className="text-muted-foreground">נוכחי: <span className="text-foreground font-bold">{fmtCurrency(c.currentOffer)}</span></span>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">התקדמות לעבר מחיר מטרה</span>
                      <span className={`font-medium ${c.achievedPct >= 70 ? "text-emerald-400" : c.achievedPct >= 50 ? "text-yellow-400" : "text-red-400"}`}>{fmtPct(c.achievedPct)}</span>
                    </div>
                    <Progress value={c.achievedPct} className="h-2 bg-slate-700" />
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <AlertTriangle className="w-3 h-3 text-yellow-400" />
                    <span>פער מהמטרה: {fmtCurrency(c.gap)} ({fmtPct(c.gapPct)})</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* AI Strategy Recommendations */}
        <TabsContent value="strategy">
          <div className="space-y-4">
            <Card className="bg-gradient-to-r from-purple-900/30 to-blue-900/30 border-purple-500/30">
              <CardContent className="p-4 flex items-center gap-3">
                <Brain className="w-6 h-6 text-purple-400" />
                <div>
                  <p className="font-semibold text-foreground">המלצות אסטרטגיה מבוססות AI</p>
                  <p className="text-xs text-muted-foreground">ניתוח היסטוריית מו״מ, מגמות שוק, והתנהגות ספקים — עודכן אוטומטית</p>
                </div>
              </CardContent>
            </Card>
            {aiStrategies.map((s) => (
              <Card key={s.id} className="bg-slate-800/50 border-slate-700/50">
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-purple-400">{s.id}</span>
                        <span className="font-semibold text-foreground">{s.supplier}</span>
                      </div>
                      <p className="text-sm text-muted-foreground">{s.material}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-center">
                        <p className="text-xs text-muted-foreground">ביטחון</p>
                        <p className={`text-lg font-bold ${s.confidence >= 80 ? "text-emerald-400" : s.confidence >= 60 ? "text-yellow-400" : "text-red-400"}`}>{s.confidence}%</p>
                      </div>
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-700/30">
                    <div className="flex items-center gap-2 mb-2">
                      <Zap className="w-4 h-4 text-amber-400" />
                      <span className="text-sm font-medium text-amber-400">{s.strategy}</span>
                    </div>
                    <p className="text-sm text-gray-300 leading-relaxed">{s.recommendation}</p>
                  </div>
                  <div className="flex items-center gap-6 text-sm">
                    <div className="flex items-center gap-1.5">
                      <Shield className="w-3.5 h-3.5" />
                      <span className="text-muted-foreground">סיכון:</span>
                      <span className={`font-medium ${riskColors[s.risk]}`}>{s.risk}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <ArrowDownRight className="w-3.5 h-3.5 text-green-400" />
                      <span className="text-muted-foreground">הנחה צפויה:</span>
                      <span className="font-medium text-green-400">{s.expectedDiscount}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
