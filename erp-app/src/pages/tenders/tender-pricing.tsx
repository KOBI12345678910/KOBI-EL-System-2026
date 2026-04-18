import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { DollarSign, Percent, TrendingUp, BarChart3, Calculator, Target, Download, Save, RefreshCw, ChevronDown, ChevronUp, AlertTriangle, CheckCircle2, ArrowUpRight, ArrowDownRight, History, Scale } from "lucide-react";

const FALLBACK_TABS = ["כתב כמויות ותמחור", "ניתוח עלויות", "אסטרטגיית תמחור", "היסטוריית מחירים"] as const;
const FALLBACK_BOQ_DATA = [
  { id: 1, item: "חלון אלומיניום 120x150", desc: "חלון דו-כנפי עם תריס", unit: "יח׳", qty: 48, material: 1850, labor: 420, overhead: 185, margin: 18 },
  { id: 2, item: "דלת כניסה פלדלת", desc: "דלת מעוצבת עם מנעול רב-בריחי", unit: "יח׳", qty: 12, material: 3200, labor: 680, overhead: 320, margin: 22 },
  { id: 3, item: "מעקה זכוכית", desc: "מעקה זכוכית מחוסמת 12 מ״מ", unit: "מ״א", qty: 85, material: 2400, labor: 550, overhead: 240, margin: 20 },
  { id: 4, item: "חיפוי אלומיניום", desc: "חיפוי חזית ACM קומפוזיט", unit: "מ״ר", qty: 320, material: 380, labor: 160, overhead: 54, margin: 15 },
  { id: 5, item: "תריס חשמלי", desc: "תריס גלילה חשמלי + שלט", unit: "יח׳", qty: 48, material: 1200, labor: 350, overhead: 120, margin: 17 },
  { id: 6, item: "ויטרינה חנות", desc: "ויטרינה זכוכית מחוסמת 10 מ״מ", unit: "יח׳", qty: 6, material: 4800, labor: 920, overhead: 480, margin: 25 },
  { id: 7, item: "פרגולת אלומיניום", desc: "פרגולה עם להבים מתכווננים", unit: "מ״ר", qty: 45, material: 650, labor: 280, overhead: 93, margin: 19 },
  { id: 8, item: "מחיצת משרד", desc: "מחיצה זכוכית + אלומיניום", unit: "מ״א", qty: 60, material: 1100, labor: 380, overhead: 148, margin: 16 },
  { id: 9, item: "סורג ביטחון", desc: "סורג פלדה צבוע אלקטרוסטטי", unit: "יח׳", qty: 30, material: 780, labor: 220, overhead: 78, margin: 14 },
  { id: 10, item: "דלת הזזה", desc: "דלת הזזה אוטומטית דו-כנפית", unit: "יח׳", qty: 4, material: 8500, labor: 1800, overhead: 850, margin: 23 },
];
const FALLBACK_PRICE_HISTORY = [
  { tender: "מגדלי הים התיכון", date: "2025-11", value: 2850000, margin: 19.2, result: "זכייה" },
  { tender: "פארק הייטק נתניה", date: "2025-09", value: 1920000, margin: 16.8, result: "הפסד" },
  { tender: "מרכז מסחרי לוד", date: "2025-07", value: 3400000, margin: 21.5, result: "זכייה" },
  { tender: "מלון ים המלח", date: "2025-05", value: 4100000, margin: 23.1, result: "זכייה" },
  { tender: "בית ספר הרצליה", date: "2025-03", value: 1100000, margin: 14.2, result: "הפסד" },
  { tender: "בניין משרדים ר״ג", date: "2025-01", value: 2200000, margin: 17.9, result: "זכייה" },
  { tender: "שיכון דיור חיפה", date: "2024-11", value: 5600000, margin: 18.5, result: "זכייה" },
  { tender: "קניון אשדוד", date: "2024-09", value: 3800000, margin: 15.1, result: "הפסד" },
];
const FALLBACK_COMPETITORS = [
  { name: "אלוטק בע״מ", avgMargin: 14.5, winRate: 38, priceIndex: 0.96, strength: "מחירים נמוכים", weakness: "איכות בינונית" },
  { name: "זכוכית ישראל", avgMargin: 17.2, winRate: 42, priceIndex: 1.02, strength: "מומחיות זכוכית", weakness: "זמני אספקה ארוכים" },
  { name: "מסגריית השרון", avgMargin: 12.8, winRate: 35, priceIndex: 0.91, strength: "מחיר אגרסיבי", weakness: "קיבולת מוגבלת" },
  { name: "אלומטל תעשיות", avgMargin: 19.1, winRate: 45, priceIndex: 1.08, strength: "מוניטין חזק", weakness: "מחירים גבוהים" },
];
const FALLBACK_COST_BREAKDOWN = [
  { cat: "חומרי גלם - אלומיניום", std: 520000, actual: 498000, diff: -4.2 },
  { cat: "חומרי גלם - זכוכית", std: 310000, actual: 325000, diff: 4.8 },
  { cat: "חומרי גלם - פלדה", std: 85000, actual: 82000, diff: -3.5 },
  { cat: "אביזרים וחומרי עזר", std: 120000, actual: 132000, diff: 10.0 },
  { cat: "עבודה - ייצור", std: 280000, actual: 265000, diff: -5.4 },
  { cat: "עבודה - התקנה", std: 195000, actual: 210000, diff: 7.7 },
  { cat: "תקורה - תחבורה", std: 65000, actual: 68000, diff: 4.6 },
  { cat: "תקורה - ביטוח וערבויות", std: 42000, actual: 42000, diff: 0 },
];
function fmt(n: number) { return n.toLocaleString("he-IL"); }
function fmtC(n: number) { return "₪" + n.toLocaleString("he-IL"); }

export default function TenderPricingPage() {
  const { data: TABS = FALLBACK_TABS } = useQuery({
    queryKey: ["tenders-t-a-b-s"],
    queryFn: async () => {
      const res = await authFetch("/api/tenders/tender-pricing/t-a-b-s");
      if (!res.ok) return FALLBACK_TABS;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_TABS;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: boqData = FALLBACK_BOQ_DATA } = useQuery({
    queryKey: ["tenders-boq-data"],
    queryFn: async () => {
      const res = await authFetch("/api/tenders/tender-pricing/boq-data");
      if (!res.ok) return FALLBACK_BOQ_DATA;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_BOQ_DATA;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: priceHistory = FALLBACK_PRICE_HISTORY } = useQuery({
    queryKey: ["tenders-price-history"],
    queryFn: async () => {
      const res = await authFetch("/api/tenders/tender-pricing/price-history");
      if (!res.ok) return FALLBACK_PRICE_HISTORY;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_PRICE_HISTORY;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: competitors = FALLBACK_COMPETITORS } = useQuery({
    queryKey: ["tenders-competitors"],
    queryFn: async () => {
      const res = await authFetch("/api/tenders/tender-pricing/competitors");
      if (!res.ok) return FALLBACK_COMPETITORS;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_COMPETITORS;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: costBreakdown = FALLBACK_COST_BREAKDOWN } = useQuery({
    queryKey: ["tenders-cost-breakdown"],
    queryFn: async () => {
      const res = await authFetch("/api/tenders/tender-pricing/cost-breakdown");
      if (!res.ok) return FALLBACK_COST_BREAKDOWN;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_COST_BREAKDOWN;
    },
    staleTime: 30_000,
    retry: 1,
  });


  const [tab, setTab] = useState<typeof TABS[number]>(TABS[0]);
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const calcLine = (r: typeof boqData[0]) => {
    const cost = r.material + r.labor + r.overhead;
    const total = cost * (1 + r.margin / 100);
    return { cost, total: Math.round(total), lineTotal: Math.round(total * r.qty) };
  };
  const summary = boqData.reduce((acc, r) => {
    const c = calcLine(r);
    acc.matl += r.material * r.qty; acc.labr += r.labor * r.qty; acc.ovhd += r.overhead * r.qty;
    acc.cost += c.cost * r.qty; acc.bid += c.lineTotal; return acc;
  }, { matl: 0, labr: 0, ovhd: 0, cost: 0, bid: 0 });
  const avgMargin = summary.cost > 0 ? ((summary.bid - summary.cost) / summary.cost * 100) : 0;
  const matlR = summary.cost > 0 ? (summary.matl / summary.cost * 100) : 0;
  const labrR = summary.cost > 0 ? (summary.labr / summary.cost * 100) : 0;
  const ovhdR = summary.cost > 0 ? (summary.ovhd / summary.cost * 100) : 0;
  const kpis = [
    { label: "תמחורים פעילים", value: "8", icon: Calculator, color: "text-blue-400", bg: "bg-blue-500/10" },
    { label: "מרווח ממוצע %", value: avgMargin.toFixed(1) + "%", icon: Percent, color: "text-emerald-400", bg: "bg-emerald-500/10" },
    { label: "סה״כ ערך הצעה", value: fmtC(summary.bid), icon: DollarSign, color: "text-amber-400", bg: "bg-amber-500/10" },
    { label: "יחס עלות חומרים %", value: matlR.toFixed(1) + "%", icon: BarChart3, color: "text-purple-400", bg: "bg-purple-500/10" },
    { label: "יחס עלות עבודה %", value: labrR.toFixed(1) + "%", icon: Target, color: "text-rose-400", bg: "bg-rose-500/10" },
    { label: "מדד מחיר תחרותי", value: "1.04", icon: Scale, color: "text-cyan-400", bg: "bg-cyan-500/10" },
  ];
  const toggleSort = (col: string) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("asc"); }
  };

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">תמחור מכרזים</h1>
          <p className="text-sm text-muted-foreground mt-1">ניהול תמחור, עלויות ואסטרטגיית הצעות מחיר</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm"><RefreshCw className="w-4 h-4 ml-1" />רענון</Button>
          <Button variant="outline" size="sm"><Download className="w-4 h-4 ml-1" />ייצוא</Button>
          <Button size="sm" className="bg-primary"><Save className="w-4 h-4 ml-1" />שמירה</Button>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpis.map(k => (
          <Card key={k.label} className="bg-card/50 border-border/50">
            <CardContent className="p-4">
              <div className={`p-2 rounded-lg ${k.bg} w-fit mb-2`}><k.icon className={`w-4 h-4 ${k.color}`} /></div>
              <div className="text-xl font-bold text-foreground">{k.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{k.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="flex gap-1 bg-card/50 p-1 rounded-lg border border-border/50 overflow-x-auto">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>{t}</button>
        ))}
      </div>

      {tab === TABS[0] && (<>
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-6 text-sm">
                <div><span className="text-muted-foreground">מכרז:</span> <span className="font-medium text-foreground">פרויקט מגדלי אופק - שלב ב׳</span></div>
                <div><span className="text-muted-foreground">מזמין:</span> <span className="font-medium text-foreground">אפריקה ישראל מגורים</span></div>
                <div><span className="text-muted-foreground">תאריך הגשה:</span> <span className="font-medium text-foreground">15/04/2026</span></div>
              </div>
              <Badge className="bg-blue-500/20 text-blue-300">בעבודה</Badge>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 bg-muted/30">
                  {["#","פריט","תיאור","יחידה","כמות","חומר ₪","עבודה ₪","תקורה ₪","מרווח %","סה״כ ליחידה ₪","סה״כ שורה ₪"].map(h => (
                    <th key={h} className="px-3 py-3 text-right text-xs font-semibold text-muted-foreground cursor-pointer hover:text-foreground" onClick={() => toggleSort(h)}>
                      <span className="flex items-center gap-1">{h}{sortCol === h && (sortDir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {boqData.map((r, i) => { const c = calcLine(r); return (
                  <tr key={r.id} className="border-b border-border/30 hover:bg-muted/20">
                    <td className="px-3 py-2.5 text-muted-foreground">{i + 1}</td>
                    <td className="px-3 py-2.5 font-medium text-foreground">{r.item}</td>
                    <td className="px-3 py-2.5 text-muted-foreground text-xs">{r.desc}</td>
                    <td className="px-3 py-2.5 text-center">{r.unit}</td>
                    <td className="px-3 py-2.5 text-center font-medium">{fmt(r.qty)}</td>
                    <td className="px-3 py-2.5 text-left font-mono">{fmtC(r.material)}</td>
                    <td className="px-3 py-2.5 text-left font-mono">{fmtC(r.labor)}</td>
                    <td className="px-3 py-2.5 text-left font-mono">{fmtC(r.overhead)}</td>
                    <td className="px-3 py-2.5 text-center">
                      <Badge className={r.margin >= 20 ? "bg-emerald-500/20 text-emerald-300" : r.margin >= 15 ? "bg-amber-500/20 text-amber-300" : "bg-rose-500/20 text-rose-300"}>{r.margin}%</Badge>
                    </td>
                    <td className="px-3 py-2.5 text-left font-mono font-medium">{fmtC(c.total)}</td>
                    <td className="px-3 py-2.5 text-left font-mono font-bold text-foreground">{fmtC(c.lineTotal)}</td>
                  </tr>
                ); })}
              </tbody>
              <tfoot>
                <tr className="bg-primary/10 font-bold">
                  <td className="px-3 py-3" colSpan={5}>סה״כ</td>
                  <td className="px-3 py-3 font-mono">{fmtC(summary.matl)}</td>
                  <td className="px-3 py-3 font-mono">{fmtC(summary.labr)}</td>
                  <td className="px-3 py-3 font-mono">{fmtC(summary.ovhd)}</td>
                  <td className="px-3 py-3 text-center"><Badge className="bg-blue-500/20 text-blue-300">{avgMargin.toFixed(1)}%</Badge></td>
                  <td className="px-3 py-3 font-mono">{fmtC(summary.cost)}</td>
                  <td className="px-3 py-3 font-mono text-foreground">{fmtC(summary.bid)}</td>
                </tr>
              </tfoot>
            </table>
          </CardContent>
        </Card>
      </>)}

      {tab === TABS[1] && (<div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[{ label: "חומרי גלם", val: summary.matl, pct: matlR, tc: "text-blue-400" },
            { label: "עבודה", val: summary.labr, pct: labrR, tc: "text-emerald-400" },
            { label: "תקורה", val: summary.ovhd, pct: ovhdR, tc: "text-amber-400" }].map(c => (
            <Card key={c.label} className="bg-card/50 border-border/50"><CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-foreground">{c.label}</span>
                <span className={`text-lg font-bold ${c.tc}`}>{c.pct.toFixed(1)}%</span>
              </div>
              <Progress value={c.pct} className="h-2 mb-2" />
              <div className="text-sm text-muted-foreground">{fmtC(c.val)}</div>
            </CardContent></Card>
          ))}
        </div>
        <Card className="bg-card/50 border-border/50"><CardContent className="p-5">
          <h3 className="text-lg font-semibold text-foreground mb-4">השוואה לעלויות תקן</h3>
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border/50">
              {["קטגוריה","עלות תקן ₪","עלות בפועל ₪","סטייה %","סטטוס"].map(h => <th key={h} className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground">{h}</th>)}
            </tr></thead>
            <tbody>{costBreakdown.map(c => (
              <tr key={c.cat} className="border-b border-border/30 hover:bg-muted/20">
                <td className="px-3 py-2.5 font-medium">{c.cat}</td>
                <td className="px-3 py-2.5 font-mono text-muted-foreground">{fmtC(c.std)}</td>
                <td className="px-3 py-2.5 font-mono">{fmtC(c.actual)}</td>
                <td className="px-3 py-2.5 text-center">
                  <span className={`flex items-center justify-center gap-1 ${c.diff < 0 ? "text-emerald-400" : c.diff > 5 ? "text-rose-400" : "text-amber-400"}`}>
                    {c.diff < 0 ? <ArrowDownRight className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />}{Math.abs(c.diff).toFixed(1)}%
                  </span>
                </td>
                <td className="px-3 py-2.5 text-center">
                  {Math.abs(c.diff) <= 3 ? <CheckCircle2 className="w-4 h-4 text-emerald-400 mx-auto" /> : <AlertTriangle className={`w-4 h-4 mx-auto ${c.diff > 5 ? "text-rose-400" : "text-amber-400"}`} />}
                </td>
              </tr>
            ))}</tbody>
          </table>
        </CardContent></Card>
        <Card className="bg-card/50 border-border/50"><CardContent className="p-5">
          <h3 className="text-lg font-semibold text-foreground mb-4">הקצאת סיכונים וגרירות</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[{ risk: "עליית מחירי חומרי גלם", pct: 3, amount: Math.round(summary.matl * 0.03), level: "בינוני" },
              { risk: "עיכוב בלוח זמנים", pct: 2, amount: Math.round(summary.bid * 0.02), level: "נמוך" },
              { risk: "שינויי תכנון", pct: 5, amount: Math.round(summary.bid * 0.05), level: "גבוה" },
              { risk: "תנודות שער מט״ח", pct: 2.5, amount: Math.round(summary.matl * 0.025), level: "בינוני" },
            ].map(r => (
              <div key={r.risk} className="flex items-center justify-between p-3 rounded-lg bg-muted/20 border border-border/30">
                <div><div className="text-sm font-medium text-foreground">{r.risk}</div><div className="text-xs text-muted-foreground mt-0.5">הקצאה: {r.pct}%</div></div>
                <div className="text-left">
                  <div className="font-mono font-medium">{fmtC(r.amount)}</div>
                  <Badge className={r.level === "גבוה" ? "bg-rose-500/20 text-rose-300" : r.level === "בינוני" ? "bg-amber-500/20 text-amber-300" : "bg-emerald-500/20 text-emerald-300"}>{r.level}</Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent></Card>
      </div>)}

      {tab === TABS[2] && (<div className="space-y-6">
        <Card className="bg-card/50 border-border/50"><CardContent className="p-5">
          <h3 className="text-lg font-semibold text-foreground mb-4">השוואת מחירי שוק</h3>
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border/50">
              {["פריט","מחיר שלנו ₪","ממוצע שוק ₪","מיקום","המלצה"].map(h => <th key={h} className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground">{h}</th>)}
            </tr></thead>
            <tbody>{boqData.slice(0, 6).map(r => {
              const c = calcLine(r); const mkt = Math.round(c.total * (0.95 + (r.id * 0.02))); const diff = ((c.total - mkt) / mkt * 100);
              return (<tr key={r.id} className="border-b border-border/30 hover:bg-muted/20">
                <td className="px-3 py-2.5 font-medium">{r.item}</td>
                <td className="px-3 py-2.5 font-mono">{fmtC(c.total)}</td>
                <td className="px-3 py-2.5 font-mono text-muted-foreground">{fmtC(mkt)}</td>
                <td className="px-3 py-2.5 text-center">
                  <Badge className={diff > 5 ? "bg-rose-500/20 text-rose-300" : diff < -3 ? "bg-emerald-500/20 text-emerald-300" : "bg-blue-500/20 text-blue-300"}>{diff > 0 ? "+" : ""}{diff.toFixed(1)}%</Badge>
                </td>
                <td className="px-3 py-2.5 text-center text-xs text-muted-foreground">{diff > 5 ? "הורד מרווח" : diff < -3 ? "העלה מרווח" : "שמור"}</td>
              </tr>);
            })}</tbody>
          </table>
        </CardContent></Card>
        <Card className="bg-card/50 border-border/50"><CardContent className="p-5">
          <h3 className="text-lg font-semibold text-foreground mb-4">מודיעין תחרותי</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {competitors.map(c => (
              <div key={c.name} className="p-4 rounded-lg bg-muted/20 border border-border/30">
                <div className="flex items-center justify-between mb-3">
                  <span className="font-medium text-foreground">{c.name}</span>
                  <Badge className="bg-purple-500/20 text-purple-300">מדד: {c.priceIndex.toFixed(2)}</Badge>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-muted-foreground">מרווח ממוצע</span>
                    <div className="font-medium mt-0.5">{c.avgMargin}%</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">אחוז זכייה</span>
                    <div className="font-medium mt-0.5">{c.winRate}%</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">חוזקה</span>
                    <div className="font-medium mt-0.5 text-emerald-400">{c.strength}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">חולשה</span>
                    <div className="font-medium mt-0.5 text-rose-400">{c.weakness}</div>
                  </div>
                </div>
                <Progress value={c.winRate} className="h-1.5 mt-3" />
              </div>
            ))}
          </div>
        </CardContent></Card>
        <Card className="bg-card/50 border-border/50"><CardContent className="p-5">
          <h3 className="text-lg font-semibold text-foreground mb-4">אופטימיזציית מרווח</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[{ scenario: "מרווח אגרסיבי", margin: 12, winProb: 75, bid: Math.round(summary.cost * 1.12), tag: "סיכוי גבוה" },
              { scenario: "מרווח מאוזן", margin: 18, winProb: 55, bid: Math.round(summary.cost * 1.18), tag: "מומלץ" },
              { scenario: "מרווח פרימיום", margin: 25, winProb: 30, bid: Math.round(summary.cost * 1.25), tag: "רווח מקסימלי" }].map(s => (
              <div key={s.scenario} className={`p-4 rounded-lg border ${s.scenario === "מרווח מאוזן" ? "border-primary bg-primary/5" : "border-border/30 bg-muted/20"}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-foreground">{s.scenario}</span>
                  <Badge className={s.scenario === "מרווח מאוזן" ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}>{s.tag}</Badge>
                </div>
                <div className="space-y-2 text-sm mt-3">
                  <div className="flex justify-between"><span className="text-muted-foreground">מרווח</span><span className="font-medium">{s.margin}%</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">הצעת מחיר</span><span className="font-mono">{fmtC(s.bid)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">סיכוי זכייה</span><span className="font-medium">{s.winProb}%</span></div>
                  <Progress value={s.winProb} className="h-1.5" />
                </div>
              </div>
            ))}
          </div>
        </CardContent></Card>
      </div>)}

      {tab === TABS[3] && (<div className="space-y-6">
        <Card className="bg-card/50 border-border/50"><CardContent className="p-5">
          <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2"><History className="w-5 h-5" />היסטוריית מכרזים דומים</h3>
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border/50">
              {["מכרז","תאריך","ערך הצעה ₪","מרווח %","תוצאה"].map(h => <th key={h} className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground">{h}</th>)}
            </tr></thead>
            <tbody>{priceHistory.map((h, i) => (
              <tr key={i} className="border-b border-border/30 hover:bg-muted/20">
                <td className="px-3 py-2.5 font-medium">{h.tender}</td>
                <td className="px-3 py-2.5 text-center text-muted-foreground">{h.date}</td>
                <td className="px-3 py-2.5 font-mono">{fmtC(h.value)}</td>
                <td className="px-3 py-2.5 text-center">{h.margin}%</td>
                <td className="px-3 py-2.5 text-center"><Badge className={h.result === "זכייה" ? "bg-emerald-500/20 text-emerald-300" : "bg-rose-500/20 text-rose-300"}>{h.result}</Badge></td>
              </tr>
            ))}</tbody>
          </table>
        </CardContent></Card>
        <Card className="bg-card/50 border-border/50"><CardContent className="p-5">
          <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2"><TrendingUp className="w-5 h-5" />מתאם זכייה/הפסד מול מחיר</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-emerald-400">זכיות - מאפיינים משותפים</h4>
              {[{ l: "מרווח ממוצע בזכיות", v: "19.8%" }, { l: "ערך הצעה ממוצע", v: fmtC(3630000) }, { l: "יחס חומרים/עבודה", v: "2.4:1" }, { l: "אחוז זכייה כולל", v: "62.5%" }].map(s => (
                <div key={s.l} className="flex items-center justify-between p-2 rounded bg-emerald-500/5 border border-emerald-500/20">
                  <span className="text-sm text-muted-foreground">{s.l}</span><span className="font-medium text-emerald-400">{s.v}</span>
                </div>
              ))}
            </div>
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-rose-400">הפסדים - מאפיינים משותפים</h4>
              {[{ l: "מרווח ממוצע בהפסדים", v: "15.4%" }, { l: "ערך הצעה ממוצע", v: fmtC(2273000) }, { l: "סיבה עיקרית", v: "מחיר גבוה מדי" }, { l: "פער ממחיר זוכה", v: "+8.2%" }].map(s => (
                <div key={s.l} className="flex items-center justify-between p-2 rounded bg-rose-500/5 border border-rose-500/20">
                  <span className="text-sm text-muted-foreground">{s.l}</span><span className="font-medium text-rose-400">{s.v}</span>
                </div>
              ))}
            </div>
          </div>
        </CardContent></Card>
        <Card className="bg-card/50 border-border/50"><CardContent className="p-5">
          <h3 className="text-lg font-semibold text-foreground mb-4">תובנות ומסקנות</h3>
          <div className="space-y-3">
            {[{ icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-500/10", text: "מרווח בטווח 18-22% מניב את שיעור הזכייה הגבוה ביותר (72%)" },
              { icon: TrendingUp, color: "text-blue-400", bg: "bg-blue-500/10", text: "מכרזים בהיקף מעל ₪2,500,000 מראים מרווח גבוה יותר ב-3.2% בממוצע" },
              { icon: AlertTriangle, color: "text-amber-400", bg: "bg-amber-500/10", text: "מחירי אלומיניום עלו ב-7% ברבעון האחרון - יש לעדכן תעריפי בסיס" },
              { icon: Target, color: "text-purple-400", bg: "bg-purple-500/10", text: "ההצעה הנוכחית ממוקמת 4% מעל ממוצע השוק - בטווח הזכייה" },
            ].map((ins, i) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-muted/20 border border-border/30">
                <div className={`p-1.5 rounded ${ins.bg}`}><ins.icon className={`w-4 h-4 ${ins.color}`} /></div>
                <span className="text-sm text-foreground">{ins.text}</span>
              </div>
            ))}
          </div>
        </CardContent></Card>
      </div>)}
    </div>
  );
}