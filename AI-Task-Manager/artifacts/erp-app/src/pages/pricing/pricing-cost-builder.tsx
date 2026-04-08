import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Layers, Calculator, TrendingUp, AlertTriangle, ShieldCheck, Target,
  DollarSign, Truck, Factory, Paintbrush, Package, Wrench, HardHat,
  FileBarChart, ChevronDown, ChevronUp, RotateCcw, ArrowRight
} from "lucide-react";

/* ──────────── types ──────────── */
type CostSource = "stock" | "supplier" | "import" | "manual";

interface CostRow {
  key: string;
  label: string;
  amount: number;
  source: CostSource;
  icon: React.ReactNode;
  group: string;
}

/* ──────────── projects ──────────── */
const PROJECTS = [
  { id: "PRJ-2401", name: "שער חשמלי דגם פרימיום - וילה כהן", value: 48500 },
  { id: "PRJ-2402", name: "גדר אלומיניום 120 מ׳ - מפעל צפון", value: 87200 },
  { id: "PRJ-2403", name: "פרגולה מתקפלת - מלון ים המלח", value: 62000 },
  { id: "PRJ-2404", name: "מעקות בטיחות - בניין מגורים ת״א", value: 34800 },
  { id: "PRJ-2405", name: "שערים חשמליים x8 - קיבוץ גבעת ברנר", value: 156000 },
];

/* ──────────── 19 cost categories ──────────── */
const buildInitialCosts = (): CostRow[] => [
  { key: "raw_material",         label: "חומר גלם",             amount: 12400, source: "stock",    icon: <Package className="w-4 h-4" />,       group: "חומרים" },
  { key: "import",               label: "ייבוא / מכס",          amount: 3200,  source: "import",   icon: <Truck className="w-4 h-4" />,         group: "חומרים" },
  { key: "cutting",              label: "חיתוך",                amount: 1850,  source: "manual",   icon: <Factory className="w-4 h-4" />,       group: "ייצור" },
  { key: "welding",              label: "ריתוך",                amount: 2600,  source: "manual",   icon: <Factory className="w-4 h-4" />,       group: "ייצור" },
  { key: "finishing",            label: "גימור / שיוף",         amount: 980,   source: "manual",   icon: <Paintbrush className="w-4 h-4" />,    group: "ייצור" },
  { key: "powder_coating",       label: "צביעה אלקטרוסטטית",    amount: 2100,  source: "supplier", icon: <Paintbrush className="w-4 h-4" />,    group: "גימור" },
  { key: "galvanization",        label: "גלוון חם",             amount: 1750,  source: "supplier", icon: <ShieldCheck className="w-4 h-4" />,   group: "גימור" },
  { key: "glass",                label: "זכוכית",               amount: 3400,  source: "supplier", icon: <Layers className="w-4 h-4" />,        group: "גימור" },
  { key: "hardware",             label: "פרזול / אביזרים",      amount: 1640,  source: "stock",    icon: <Wrench className="w-4 h-4" />,        group: "גימור" },
  { key: "motors",               label: "מנועים / אלקטרוניקה",  amount: 4200,  source: "import",   icon: <Factory className="w-4 h-4" />,       group: "גימור" },
  { key: "subcontractor",        label: "קבלני משנה",           amount: 2800,  source: "supplier", icon: <HardHat className="w-4 h-4" />,       group: "שירותים" },
  { key: "packaging",            label: "אריזה",                amount: 650,   source: "stock",    icon: <Package className="w-4 h-4" />,       group: "לוגיסטיקה" },
  { key: "transport",            label: "הובלה",                amount: 1200,  source: "supplier", icon: <Truck className="w-4 h-4" />,         group: "לוגיסטיקה" },
  { key: "installation",         label: "התקנה באתר",           amount: 3500,  source: "manual",   icon: <HardHat className="w-4 h-4" />,       group: "לוגיסטיקה" },
  { key: "engineering",          label: "הנדסה / תכנון",        amount: 2200,  source: "manual",   icon: <FileBarChart className="w-4 h-4" />,  group: "ניהול" },
  { key: "project_management",   label: "ניהול פרויקט",         amount: 1800,  source: "manual",   icon: <Target className="w-4 h-4" />,        group: "ניהול" },
  { key: "overhead",             label: "תקורה כללית",          amount: 2400,  source: "manual",   icon: <Calculator className="w-4 h-4" />,    group: "ניהול" },
  { key: "warranty",             label: "אחריות / שירות",       amount: 900,   source: "manual",   icon: <ShieldCheck className="w-4 h-4" />,   group: "ניהול" },
  { key: "risk_markup",          label: "תוספת סיכון",          amount: 1500,  source: "manual",   icon: <AlertTriangle className="w-4 h-4" />, group: "ניהול" },
];

const SOURCE_LABELS: Record<CostSource, string> = { stock: "מלאי", supplier: "ספק", import: "ייבוא", manual: "ידני" };
const SOURCE_COLORS: Record<CostSource, string> = {
  stock: "bg-emerald-500/20 text-emerald-300",
  supplier: "bg-blue-500/20 text-blue-300",
  import: "bg-amber-500/20 text-amber-300",
  manual: "bg-slate-500/20 text-slate-300",
};

const GROUP_COLORS: Record<string, string> = {
  "חומרים": "border-r-blue-500",
  "ייצור": "border-r-orange-500",
  "גימור": "border-r-purple-500",
  "לוגיסטיקה": "border-r-emerald-500",
  "שירותים": "border-r-pink-500",
  "ניהול": "border-r-amber-500",
};

const fmt = (v: number) => v.toLocaleString("he-IL");
const fmtCurrency = (v: number) => `₪${fmt(v)}`;

/* ──────────── flow steps ──────────── */
const FLOW_STEPS = [
  "בחירת פרויקט", "שליפת חומרים", "בדיקת מלאי", "מחירי רכש",
  "עלות נחיתה", "בחירת מקור", "הוספת פחת", "עבודה ועלויות נלוות",
  "תקורה", "תוספת סיכון", "חישוב מחיר", "השוואה למרווח יעד",
];

/* ══════════════════════════════════════════════════════════
   COMPONENT
   ══════════════════════════════════════════════════════════ */
export default function PricingCostBuilder() {
  const [selectedProject, setSelectedProject] = useState(PROJECTS[0].id);
  const [costs, setCosts] = useState<CostRow[]>(buildInitialCosts);
  const [wastePct, setWastePct] = useState(5);
  const [riskPct, setRiskPct] = useState(3);
  const [targetMargin, setTargetMargin] = useState(30);
  const [activeStep, setActiveStep] = useState(10);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

  const project = PROJECTS.find(p => p.id === selectedProject)!;

  /* derived calculations */
  const totalDirect = useMemo(() => costs.reduce((s, c) => s + c.amount, 0), [costs]);
  const wasteAmount = useMemo(() => Math.round(totalDirect * wastePct / 100), [totalDirect, wastePct]);
  const riskAmount = useMemo(() => Math.round(totalDirect * riskPct / 100), [totalDirect, riskPct]);
  const totalCost = totalDirect + wasteAmount + riskAmount;
  const minPrice = Math.round(totalCost * 1.05);
  const targetPrice = Math.round(totalCost / (1 - targetMargin / 100));
  const recommendedPrice = Math.round((minPrice + targetPrice) / 2);
  const actualMargin = targetPrice > 0 ? ((targetPrice - totalCost) / targetPrice * 100).toFixed(1) : "0";

  /* group costs */
  const groups = useMemo(() => {
    const g: Record<string, CostRow[]> = {};
    costs.forEach(c => { (g[c.group] ??= []).push(c); });
    return g;
  }, [costs]);

  const groupTotals = useMemo(() => {
    const t: Record<string, number> = {};
    Object.entries(groups).forEach(([k, rows]) => { t[k] = rows.reduce((s, r) => s + r.amount, 0); });
    return t;
  }, [groups]);

  /* handlers */
  const updateCostAmount = (key: string, val: number) => {
    setCosts(prev => prev.map(c => c.key === key ? { ...c, amount: Math.max(0, val) } : c));
  };

  const updateCostSource = (key: string, src: CostSource) => {
    setCosts(prev => prev.map(c => c.key === key ? { ...c, source: src } : c));
  };

  const resetCosts = () => {
    setCosts(buildInitialCosts());
    setWastePct(5);
    setRiskPct(3);
    setTargetMargin(30);
    setActiveStep(10);
  };

  /* comparison bar ratios */
  const maxBar = Math.max(totalCost, targetPrice, recommendedPrice, project.value);
  const barPct = (v: number) => Math.max(2, (v / maxBar) * 100);

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* ── header ── */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center">
            <Layers className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">בונה עלויות פרויקט</h1>
            <p className="text-sm text-muted-foreground">טכנו-כל עוזי — מנוע תמחור 12 שלבים</p>
          </div>
        </div>
        <button onClick={resetCosts} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-muted/40 text-sm text-muted-foreground hover:bg-muted/60 transition">
          <RotateCcw className="w-4 h-4" /> איפוס
        </button>
      </div>

      {/* ── 12-step flow ── */}
      <Card className="bg-card/50 border-border/50">
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground mb-3 font-medium">תהליך תמחור — 12 שלבים</p>
          <div className="flex flex-wrap gap-1.5">
            {FLOW_STEPS.map((step, i) => (
              <button
                key={i}
                onClick={() => setActiveStep(i)}
                className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md transition font-medium ${
                  i <= activeStep
                    ? "bg-violet-500/20 text-violet-300 ring-1 ring-violet-500/30"
                    : "bg-muted/20 text-muted-foreground"
                } ${i === activeStep ? "ring-2 ring-violet-400" : ""}`}
              >
                <span className="w-4 h-4 rounded-full bg-current/20 flex items-center justify-center text-[10px]">{i + 1}</span>
                {step}
              </button>
            ))}
          </div>
          <Progress value={(activeStep + 1) / FLOW_STEPS.length * 100} className="mt-3 h-1.5" />
        </CardContent>
      </Card>

      {/* ── project selector ── */}
      <Card className="bg-card/50 border-border/50">
        <CardContent className="p-4">
          <label className="text-xs font-medium text-muted-foreground block mb-2">פרויקט נבחר</label>
          <select
            value={selectedProject}
            onChange={e => setSelectedProject(e.target.value)}
            className="w-full bg-background/50 border border-border rounded-lg px-4 py-2.5 text-sm text-foreground focus:ring-2 focus:ring-violet-500/40 focus:outline-none"
          >
            {PROJECTS.map(p => (
              <option key={p.id} value={p.id}>{p.id} — {p.name} ({fmtCurrency(p.value)})</option>
            ))}
          </select>
          <div className="flex gap-4 mt-3 text-xs text-muted-foreground">
            <span>מזהה: <span className="text-foreground font-medium">{project.id}</span></span>
            <span>ערך הזמנה: <span className="text-foreground font-medium">{fmtCurrency(project.value)}</span></span>
          </div>
        </CardContent>
      </Card>

      {/* ── cost breakdown table ── */}
      <Card className="bg-card/50 border-border/50">
        <CardContent className="p-0">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
            <h2 className="text-sm font-semibold text-foreground">פירוט עלויות — 19 קטגוריות</h2>
            <Badge className="bg-violet-500/20 text-violet-300">{costs.length} שורות</Badge>
          </div>

          {/* table header */}
          <div className="grid grid-cols-[2fr_1fr_80px_100px_80px] gap-2 px-4 py-2 border-b border-border/30 text-xs text-muted-foreground font-medium">
            <span>קטגוריה</span>
            <span className="text-left">סכום ₪</span>
            <span className="text-center">% מסה״כ</span>
            <span className="text-center">מקור</span>
            <span className="text-center">בר</span>
          </div>

          {/* grouped rows */}
          {Object.entries(groups).map(([groupName, rows]) => {
            const isExpanded = expandedGroup === null || expandedGroup === groupName;
            return (
              <div key={groupName}>
                {/* group header */}
                <button
                  onClick={() => setExpandedGroup(expandedGroup === groupName ? null : groupName)}
                  className={`w-full grid grid-cols-[2fr_1fr_80px_100px_80px] gap-2 px-4 py-2 bg-muted/10 border-b border-border/20 hover:bg-muted/20 transition text-xs ${GROUP_COLORS[groupName] || ""} border-r-2`}
                >
                  <span className="flex items-center gap-2 font-semibold text-foreground">
                    {expandedGroup === groupName ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    {groupName}
                    <Badge variant="outline" className="text-[10px] px-1.5">{rows.length}</Badge>
                  </span>
                  <span className="text-left text-foreground font-semibold">{fmtCurrency(groupTotals[groupName])}</span>
                  <span className="text-center text-foreground font-semibold">
                    {totalDirect > 0 ? (groupTotals[groupName] / totalDirect * 100).toFixed(1) : 0}%
                  </span>
                  <span />
                  <span />
                </button>

                {/* rows */}
                {isExpanded && rows.map(row => {
                  const pct = totalDirect > 0 ? (row.amount / totalDirect * 100) : 0;
                  return (
                    <div
                      key={row.key}
                      className="grid grid-cols-[2fr_1fr_80px_100px_80px] gap-2 px-4 py-2 border-b border-border/10 hover:bg-muted/10 transition items-center text-sm"
                    >
                      {/* category name + icon */}
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">{row.icon}</span>
                        <span className="text-foreground">{row.label}</span>
                      </div>

                      {/* editable amount */}
                      <div className="text-left">
                        <input
                          type="number"
                          value={row.amount}
                          onChange={e => updateCostAmount(row.key, Number(e.target.value))}
                          className="w-full bg-background/40 border border-border/40 rounded px-2 py-1 text-sm text-foreground text-left focus:ring-1 focus:ring-violet-500/40 focus:outline-none"
                          min={0}
                          dir="ltr"
                        />
                      </div>

                      {/* % of total */}
                      <div className="text-center text-xs text-muted-foreground">{pct.toFixed(1)}%</div>

                      {/* source selector */}
                      <div className="flex justify-center">
                        <select
                          value={row.source}
                          onChange={e => updateCostSource(row.key, e.target.value as CostSource)}
                          className="text-[11px] px-1.5 py-1 rounded bg-background/40 border border-border/40 text-foreground"
                        >
                          {(Object.keys(SOURCE_LABELS) as CostSource[]).map(s => (
                            <option key={s} value={s}>{SOURCE_LABELS[s]}</option>
                          ))}
                        </select>
                      </div>

                      {/* mini progress bar */}
                      <div className="flex justify-center">
                        <div className="w-full bg-muted/20 rounded-full h-1.5">
                          <div
                            className="h-full rounded-full bg-violet-500/60"
                            style={{ width: `${Math.min(100, pct * 3)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}

          {/* total row */}
          <div className="grid grid-cols-[2fr_1fr_80px_100px_80px] gap-2 px-4 py-3 bg-violet-500/10 border-t border-violet-500/30 font-bold text-sm">
            <span className="text-foreground">סה״כ עלות ישירה</span>
            <span className="text-left text-violet-300">{fmtCurrency(totalDirect)}</span>
            <span className="text-center text-violet-300">100%</span>
            <span />
            <span />
          </div>
        </CardContent>
      </Card>

      {/* ── adjustments: waste & risk ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <AlertTriangle className="w-4 h-4 text-amber-400" /> התאמת פחת / בזבוז
            </div>
            <div className="flex items-center gap-3">
              <input
                type="range" min={0} max={15} step={0.5} value={wastePct}
                onChange={e => setWastePct(Number(e.target.value))}
                className="flex-1 accent-amber-500"
              />
              <span className="text-lg font-bold text-amber-300 w-14 text-left">{wastePct}%</span>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>סכום פחת:</span>
              <span className="text-amber-300 font-medium">{fmtCurrency(wasteAmount)}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <ShieldCheck className="w-4 h-4 text-red-400" /> חיץ סיכון
            </div>
            <div className="flex items-center gap-3">
              <input
                type="range" min={0} max={15} step={0.5} value={riskPct}
                onChange={e => setRiskPct(Number(e.target.value))}
                className="flex-1 accent-red-500"
              />
              <span className="text-lg font-bold text-red-300 w-14 text-left">{riskPct}%</span>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>סכום סיכון:</span>
              <span className="text-red-300 font-medium">{fmtCurrency(riskAmount)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── summary cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: "עלות כוללת", value: fmtCurrency(totalCost), color: "text-foreground", bg: "bg-muted/30" },
          { label: "התאמת פחת", value: fmtCurrency(wasteAmount), color: "text-amber-300", bg: "bg-amber-500/10" },
          { label: "חיץ סיכון", value: fmtCurrency(riskAmount), color: "text-red-300", bg: "bg-red-500/10" },
          { label: "מחיר מינימום", value: fmtCurrency(minPrice), color: "text-orange-300", bg: "bg-orange-500/10" },
          { label: "מחיר יעד", value: fmtCurrency(targetPrice), color: "text-emerald-300", bg: "bg-emerald-500/10" },
          { label: "מחיר מומלץ", value: fmtCurrency(recommendedPrice), color: "text-violet-300", bg: "bg-violet-500/10" },
        ].map(c => (
          <Card key={c.label} className={`${c.bg} border-border/40`}>
            <CardContent className="p-3 text-center">
              <div className="text-[11px] text-muted-foreground mb-1">{c.label}</div>
              <div className={`text-lg font-bold ${c.color}`}>{c.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── margin calculator ── */}
      <Card className="bg-card/50 border-border/50">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-4">
            <Target className="w-5 h-5 text-emerald-400" />
            <h2 className="text-sm font-semibold text-foreground">מחשבון מרווח — יעד מרווח → מחיר מכירה</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">אחוז מרווח יעד</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={targetMargin}
                  onChange={e => setTargetMargin(Math.max(1, Math.min(80, Number(e.target.value))))}
                  className="w-full bg-background/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:ring-2 focus:ring-emerald-500/40 focus:outline-none"
                  min={1} max={80}
                  dir="ltr"
                />
                <span className="text-foreground font-bold">%</span>
              </div>
            </div>
            <div className="text-center">
              <div className="text-xs text-muted-foreground mb-1">עלות כוללת</div>
              <div className="text-lg font-bold text-foreground">{fmtCurrency(totalCost)}</div>
            </div>
            <div className="flex items-center justify-center">
              <ArrowRight className="w-5 h-5 text-muted-foreground" />
            </div>
            <div className="text-center">
              <div className="text-xs text-muted-foreground mb-1">מחיר מכירה מחושב</div>
              <div className="text-2xl font-bold text-emerald-400">{fmtCurrency(targetPrice)}</div>
              <div className="text-xs text-muted-foreground mt-1">מרווח בפועל: <span className="text-emerald-300 font-medium">{actualMargin}%</span></div>
            </div>
          </div>
          {/* quick margin buttons */}
          <div className="flex gap-2 mt-4">
            {[15, 20, 25, 30, 35, 40].map(m => (
              <button
                key={m}
                onClick={() => setTargetMargin(m)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                  targetMargin === m
                    ? "bg-emerald-500/30 text-emerald-300 ring-1 ring-emerald-500/40"
                    : "bg-muted/20 text-muted-foreground hover:bg-muted/40"
                }`}
              >
                {m}%
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── cost vs price vs margin comparison ── */}
      <Card className="bg-card/50 border-border/50">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5 text-blue-400" />
            <h2 className="text-sm font-semibold text-foreground">השוואה: עלות ← מחיר ← מרווח</h2>
          </div>

          <div className="space-y-3">
            {[
              { label: "עלות כוללת", value: totalCost, color: "bg-slate-500" },
              { label: "מחיר מינימום (+5%)", value: minPrice, color: "bg-orange-500" },
              { label: "מחיר מומלץ", value: recommendedPrice, color: "bg-violet-500" },
              { label: "מחיר יעד", value: targetPrice, color: "bg-emerald-500" },
              { label: "ערך הזמנה מקורי", value: project.value, color: "bg-blue-500" },
            ].map(b => (
              <div key={b.label} className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-36 shrink-0 text-left">{b.label}</span>
                <div className="flex-1 bg-muted/20 rounded-full h-6 relative overflow-hidden">
                  <div
                    className={`h-full ${b.color}/60 rounded-full transition-all duration-500 flex items-center justify-end px-2`}
                    style={{ width: `${barPct(b.value)}%` }}
                  >
                    <span className="text-[11px] font-bold text-white drop-shadow-sm whitespace-nowrap">
                      {fmtCurrency(b.value)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* delta indicators */}
          <div className="grid grid-cols-3 gap-4 mt-5 pt-4 border-t border-border/30">
            <div className="text-center">
              <div className="text-xs text-muted-foreground">רווח גולמי</div>
              <div className={`text-lg font-bold ${targetPrice - totalCost >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {fmtCurrency(targetPrice - totalCost)}
              </div>
            </div>
            <div className="text-center">
              <div className="text-xs text-muted-foreground">מרווח (%)</div>
              <div className="text-lg font-bold text-violet-300">{actualMargin}%</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-muted-foreground">פער מהזמנה</div>
              <div className={`text-lg font-bold ${project.value - targetPrice >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {fmtCurrency(project.value - targetPrice)}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── source breakdown badges ── */}
      <Card className="bg-card/50 border-border/50">
        <CardContent className="p-4">
          <h2 className="text-sm font-semibold text-foreground mb-3">פילוח לפי מקור</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {(Object.keys(SOURCE_LABELS) as CostSource[]).map(src => {
              const srcTotal = costs.filter(c => c.source === src).reduce((s, c) => s + c.amount, 0);
              const srcPct = totalDirect > 0 ? (srcTotal / totalDirect * 100).toFixed(1) : "0";
              const count = costs.filter(c => c.source === src).length;
              return (
                <div key={src} className="bg-muted/10 rounded-lg p-3 border border-border/30">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge className={SOURCE_COLORS[src]}>{SOURCE_LABELS[src]}</Badge>
                    <span className="text-xs text-muted-foreground">{count} פריטים</span>
                  </div>
                  <div className="text-lg font-bold text-foreground">{fmtCurrency(srcTotal)}</div>
                  <div className="text-xs text-muted-foreground">{srcPct}% מהעלות</div>
                  <Progress value={Number(srcPct)} className="mt-2 h-1" />
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* ── footer ── */}
      <div className="text-center text-xs text-muted-foreground pb-4">
        <DollarSign className="w-3 h-3 inline -mt-0.5 ml-1" />
        מנוע תמחור טכנו-כל עוזי — {costs.length} קטגוריות עלות &bull; {FLOW_STEPS.length} שלבי תהליך &bull; מרווח יעד {targetMargin}%
      </div>
    </div>
  );
}
