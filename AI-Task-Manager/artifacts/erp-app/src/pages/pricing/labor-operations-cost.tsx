import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Wrench, Factory, Truck, HardHat, Calculator, Shield,
  Clock, ChevronsUp, Paintbrush, Package, AlertTriangle,
  FileBarChart, Target, Layers, RotateCcw
} from "lucide-react";

/* ──────────── helpers ──────────── */
const fmt = (v: number) => v.toLocaleString("he-IL");
const fmtCurrency = (v: number) => `₪${fmt(Math.round(v))}`;

/* ──────────── projects ──────────── */
const PROJECTS = [
  { id: "PRJ-2601", name: "שער חשמלי דגם פרימיום — וילה כהן" },
  { id: "PRJ-2602", name: "גדר אלומיניום 120 מ׳ — מפעל צפון" },
  { id: "PRJ-2603", name: "פרגולה מתקפלת — מלון ים המלח" },
  { id: "PRJ-2604", name: "מעקות בטיחות — בניין מגורים ת״א" },
  { id: "PRJ-2605", name: "מבנה פלדה — מחסן לוגיסטי שופרסל" },
];

/* ──────────── default rates ──────────── */
const defaultProduction = () => ({
  cutting:  { hours: 6,  rate: 160, label: "חיתוך" },
  welding:  { hours: 14, rate: 190, label: "ריתוך" },
  grinding: { hours: 4,  rate: 140, label: "שיוף / גימור" },
  painting: { hours: 0,  rate: 2800, label: "צביעה אלקטרוסטטית (קבלן)" },
  assembly: { hours: 8,  rate: 150, label: "הרכבה במפעל" },
});

const defaultField = () => ({
  transport:    { days: 1, rate: 1800, label: "הובלה לאתר", enabled: true },
  crane:        { days: 1, rate: 3500, label: "מנוף באתר", enabled: false },
  installation: { days: 3, rate: 1400, label: "צוות התקנה (יום)", enabled: true },
  adjustment:   { days: 1, rate: 950,  label: "התאמה / תיקון באתר", enabled: true },
});

const defaultIndirect = () => ({
  overhead:   { pct: 12, label: "תקורה כללית" },
  engineering:{ hours: 6, rate: 220, label: "הנדסה / תכנון" },
  pm:         { hours: 8, rate: 200, label: "ניהול פרויקט" },
  warranty:   { pct: 3,  label: "אחריות / שירות" },
  risk:       { pct: 4,  label: "חיץ סיכון" },
});

type Production = ReturnType<typeof defaultProduction>;
type Field      = ReturnType<typeof defaultField>;
type Indirect   = ReturnType<typeof defaultIndirect>;

/* ══════════════════════════════════════════════════════════
   COMPONENT
   ══════════════════════════════════════════════════════════ */
export default function LaborOperationsCost() {
  const [selectedProject, setSelectedProject] = useState(PROJECTS[0].id);
  const [production, setProduction] = useState<Production>(defaultProduction);
  const [field, setField]           = useState<Field>(defaultField);
  const [indirect, setIndirect]     = useState<Indirect>(defaultIndirect);

  /* ── production helpers ── */
  const updateProd = (key: keyof Production, prop: "hours" | "rate", val: number) =>
    setProduction(prev => ({ ...prev, [key]: { ...prev[key], [prop]: Math.max(0, val) } }));

  const prodCost = (k: keyof Production) => {
    const r = production[k];
    return k === "painting" ? r.rate : r.hours * r.rate;
  };

  const totalProduction = useMemo(
    () => (Object.keys(production) as (keyof Production)[]).reduce((s, k) => s + prodCost(k), 0),
    [production]
  );

  /* ── field helpers ── */
  const updateField = (key: keyof Field, prop: "days" | "rate", val: number) =>
    setField(prev => ({ ...prev, [key]: { ...prev[key], [prop]: Math.max(0, val) } }));

  const toggleField = (key: keyof Field) =>
    setField(prev => ({ ...prev, [key]: { ...prev[key], enabled: !prev[key].enabled } }));

  const fieldCost = (k: keyof Field) => field[k].enabled ? field[k].days * field[k].rate : 0;

  const totalField = useMemo(
    () => (Object.keys(field) as (keyof Field)[]).reduce((s, k) => s + fieldCost(k), 0),
    [field]
  );

  /* ── indirect helpers ── */
  const updateIndirect = (key: keyof Indirect, prop: string, val: number) =>
    setIndirect(prev => ({ ...prev, [key]: { ...prev[key], [prop]: Math.max(0, val) } }));

  const directTotal = totalProduction + totalField;

  const indirectCost = (k: keyof Indirect): number => {
    const r = indirect[k] as any;
    if (r.pct !== undefined) return Math.round(directTotal * r.pct / 100);
    return (r.hours || 0) * (r.rate || 0);
  };

  const totalIndirect = useMemo(
    () => (Object.keys(indirect) as (keyof Indirect)[]).reduce((s, k) => s + indirectCost(k), 0),
    [indirect, directTotal]
  );

  const grandTotal = directTotal + totalIndirect;

  const project = PROJECTS.find(p => p.id === selectedProject)!;

  /* ── reset ── */
  const reset = () => {
    setProduction(defaultProduction());
    setField(defaultField());
    setIndirect(defaultIndirect());
  };

  /* ── production icons ── */
  const prodIcons: Record<string, React.ReactNode> = {
    cutting:  <Factory className="w-4 h-4" />,
    welding:  <Wrench className="w-4 h-4" />,
    grinding: <Layers className="w-4 h-4" />,
    painting: <Paintbrush className="w-4 h-4" />,
    assembly: <Package className="w-4 h-4" />,
  };

  /* ── field icons ── */
  const fieldIcons: Record<string, React.ReactNode> = {
    transport:    <Truck className="w-4 h-4" />,
    crane:        <ChevronsUp className="w-4 h-4" />,
    installation: <HardHat className="w-4 h-4" />,
    adjustment:   <Wrench className="w-4 h-4" />,
  };

  /* ── indirect icons ── */
  const indirectIcons: Record<string, React.ReactNode> = {
    overhead:    <Calculator className="w-4 h-4" />,
    engineering: <FileBarChart className="w-4 h-4" />,
    pm:          <Target className="w-4 h-4" />,
    warranty:    <Shield className="w-4 h-4" />,
    risk:        <AlertTriangle className="w-4 h-4" />,
  };

  /* ── shared input classes ── */
  const inp = "w-20 bg-background/40 border border-border/40 rounded px-2 py-1.5 text-sm text-foreground text-left focus:ring-1 focus:ring-orange-500/40 focus:outline-none";

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* ── header ── */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-orange-500 to-red-700 flex items-center justify-center">
            <Wrench className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">עלויות עבודה וביצוע לתמחור</h1>
            <p className="text-sm text-muted-foreground">טכנו-כל עוזי — עלויות ייצור, שטח ועקיפות</p>
          </div>
        </div>
        <button onClick={reset} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-muted/40 text-sm text-muted-foreground hover:bg-muted/60 transition">
          <RotateCcw className="w-4 h-4" /> איפוס
        </button>
      </div>

      {/* ── project selector ── */}
      <Card className="bg-card/50 border-border/50">
        <CardContent className="p-4">
          <label className="text-xs font-medium text-muted-foreground block mb-2">פרויקט נבחר</label>
          <select
            value={selectedProject}
            onChange={e => setSelectedProject(e.target.value)}
            className="w-full bg-background/50 border border-border rounded-lg px-4 py-2.5 text-sm text-foreground focus:ring-2 focus:ring-orange-500/40 focus:outline-none"
          >
            {PROJECTS.map(p => (
              <option key={p.id} value={p.id}>{p.id} — {p.name}</option>
            ))}
          </select>
          <div className="mt-2 text-xs text-muted-foreground">
            מזהה: <span className="text-foreground font-medium">{project.id}</span>
          </div>
        </CardContent>
      </Card>

      {/* ════════════ 1. ייצור ════════════ */}
      <Card className="bg-card/50 border-border/50 border-r-2 border-r-orange-500">
        <CardContent className="p-0">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
            <div className="flex items-center gap-2">
              <Factory className="w-5 h-5 text-orange-400" />
              <h2 className="text-sm font-semibold text-foreground">ייצור</h2>
            </div>
            <Badge className="bg-orange-500/20 text-orange-300">{fmtCurrency(totalProduction)}</Badge>
          </div>

          {/* header row */}
          <div className="grid grid-cols-[2fr_90px_20px_90px_20px_100px] gap-2 px-4 py-2 border-b border-border/30 text-xs text-muted-foreground font-medium">
            <span>פעולה</span><span className="text-center">שעות / כמות</span><span /><span className="text-center">תעריף ₪</span><span /><span className="text-center">עלות</span>
          </div>

          {(Object.keys(production) as (keyof Production)[]).map(k => {
            const r = production[k];
            const isPaint = k === "painting";
            const cost = prodCost(k);
            return (
              <div key={k} className="grid grid-cols-[2fr_90px_20px_90px_20px_100px] gap-2 px-4 py-2.5 border-b border-border/10 hover:bg-muted/10 transition items-center text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">{prodIcons[k]}</span>
                  <span className="text-foreground">{r.label}</span>
                </div>
                {isPaint ? (
                  <>
                    <span className="text-center text-xs text-muted-foreground">קבלן</span>
                    <span />
                    <input type="number" value={r.rate} onChange={e => updateProd(k, "rate", +e.target.value)} className={inp} dir="ltr" min={0} />
                    <span />
                  </>
                ) : (
                  <>
                    <input type="number" value={r.hours} onChange={e => updateProd(k, "hours", +e.target.value)} className={inp} dir="ltr" min={0} />
                    <span className="text-muted-foreground text-center text-xs">&times;</span>
                    <input type="number" value={r.rate} onChange={e => updateProd(k, "rate", +e.target.value)} className={inp} dir="ltr" min={0} />
                    <span className="text-muted-foreground text-center text-xs">=</span>
                  </>
                )}
                <span className="text-center font-semibold text-orange-300">{fmtCurrency(cost)}</span>
              </div>
            );
          })}

          {/* total */}
          <div className="grid grid-cols-[2fr_90px_20px_90px_20px_100px] gap-2 px-4 py-3 bg-orange-500/10 border-t border-orange-500/30 font-bold text-sm">
            <span className="text-foreground">סה״כ ייצור</span><span /><span /><span /><span />
            <span className="text-center text-orange-300">{fmtCurrency(totalProduction)}</span>
          </div>
        </CardContent>
      </Card>

      {/* ════════════ 2. שטח ════════════ */}
      <Card className="bg-card/50 border-border/50 border-r-2 border-r-emerald-500">
        <CardContent className="p-0">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
            <div className="flex items-center gap-2">
              <Truck className="w-5 h-5 text-emerald-400" />
              <h2 className="text-sm font-semibold text-foreground">שטח</h2>
            </div>
            <Badge className="bg-emerald-500/20 text-emerald-300">{fmtCurrency(totalField)}</Badge>
          </div>

          <div className="grid grid-cols-[20px_2fr_90px_20px_90px_20px_100px] gap-2 px-4 py-2 border-b border-border/30 text-xs text-muted-foreground font-medium">
            <span /><span>פעולה</span><span className="text-center">ימים</span><span /><span className="text-center">תעריף ₪</span><span /><span className="text-center">עלות</span>
          </div>

          {(Object.keys(field) as (keyof Field)[]).map(k => {
            const r = field[k];
            const cost = fieldCost(k);
            return (
              <div key={k} className="grid grid-cols-[20px_2fr_90px_20px_90px_20px_100px] gap-2 px-4 py-2.5 border-b border-border/10 hover:bg-muted/10 transition items-center text-sm">
                <input type="checkbox" checked={r.enabled} onChange={() => toggleField(k)} className="accent-emerald-500 w-4 h-4" />
                <div className="flex items-center gap-2">
                  <span className={r.enabled ? "text-muted-foreground" : "text-muted-foreground/40"}>{fieldIcons[k]}</span>
                  <span className={r.enabled ? "text-foreground" : "text-muted-foreground/50 line-through"}>{r.label}</span>
                </div>
                <input type="number" value={r.days} onChange={e => updateField(k, "days", +e.target.value)} className={`${inp} ${!r.enabled && "opacity-40"}`} dir="ltr" min={0} disabled={!r.enabled} />
                <span className="text-muted-foreground text-center text-xs">&times;</span>
                <input type="number" value={r.rate} onChange={e => updateField(k, "rate", +e.target.value)} className={`${inp} ${!r.enabled && "opacity-40"}`} dir="ltr" min={0} disabled={!r.enabled} />
                <span className="text-muted-foreground text-center text-xs">=</span>
                <span className={`text-center font-semibold ${r.enabled ? "text-emerald-300" : "text-muted-foreground/40"}`}>{fmtCurrency(cost)}</span>
              </div>
            );
          })}

          <div className="grid grid-cols-[20px_2fr_90px_20px_90px_20px_100px] gap-2 px-4 py-3 bg-emerald-500/10 border-t border-emerald-500/30 font-bold text-sm">
            <span /><span className="text-foreground">סה״כ שטח</span><span /><span /><span /><span />
            <span className="text-center text-emerald-300">{fmtCurrency(totalField)}</span>
          </div>
        </CardContent>
      </Card>

      {/* ════════════ 3. עקיף ════════════ */}
      <Card className="bg-card/50 border-border/50 border-r-2 border-r-violet-500">
        <CardContent className="p-0">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
            <div className="flex items-center gap-2">
              <Calculator className="w-5 h-5 text-violet-400" />
              <h2 className="text-sm font-semibold text-foreground">עקיף</h2>
            </div>
            <Badge className="bg-violet-500/20 text-violet-300">{fmtCurrency(totalIndirect)}</Badge>
          </div>

          <div className="grid grid-cols-[2fr_90px_90px_100px] gap-2 px-4 py-2 border-b border-border/30 text-xs text-muted-foreground font-medium">
            <span>סעיף</span><span className="text-center">ערך</span><span className="text-center">בסיס</span><span className="text-center">עלות</span>
          </div>

          {(Object.keys(indirect) as (keyof Indirect)[]).map(k => {
            const r = indirect[k] as any;
            const cost = indirectCost(k);
            const isPct = r.pct !== undefined;
            return (
              <div key={k} className="grid grid-cols-[2fr_90px_90px_100px] gap-2 px-4 py-2.5 border-b border-border/10 hover:bg-muted/10 transition items-center text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">{indirectIcons[k]}</span>
                  <span className="text-foreground">{r.label}</span>
                </div>
                {isPct ? (
                  <>
                    <div className="flex items-center justify-center gap-1">
                      <input type="number" value={r.pct} onChange={e => updateIndirect(k, "pct", +e.target.value)} className={inp} dir="ltr" min={0} max={50} step={0.5} />
                      <span className="text-muted-foreground text-xs">%</span>
                    </div>
                    <span className="text-center text-xs text-muted-foreground">מתוך ישיר ({fmtCurrency(directTotal)})</span>
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-center gap-1">
                      <input type="number" value={r.hours} onChange={e => updateIndirect(k, "hours", +e.target.value)} className={inp} dir="ltr" min={0} />
                      <span className="text-muted-foreground text-xs">×</span>
                      <input type="number" value={r.rate} onChange={e => updateIndirect(k, "rate", +e.target.value)} className={inp} dir="ltr" min={0} />
                    </div>
                    <span className="text-center text-xs text-muted-foreground">{r.hours} שעות</span>
                  </>
                )}
                <span className="text-center font-semibold text-violet-300">{fmtCurrency(cost)}</span>
              </div>
            );
          })}

          <div className="grid grid-cols-[2fr_90px_90px_100px] gap-2 px-4 py-3 bg-violet-500/10 border-t border-violet-500/30 font-bold text-sm">
            <span className="text-foreground">סה״כ עקיף</span><span /><span />
            <span className="text-center text-violet-300">{fmtCurrency(totalIndirect)}</span>
          </div>
        </CardContent>
      </Card>

      {/* ════════════ summary ════════════ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "ייצור",  value: totalProduction, color: "text-orange-300",  bg: "bg-orange-500/10" },
          { label: "שטח",    value: totalField,      color: "text-emerald-300", bg: "bg-emerald-500/10" },
          { label: "עקיף",   value: totalIndirect,   color: "text-violet-300",  bg: "bg-violet-500/10" },
          { label: "סה״כ כולל", value: grandTotal,   color: "text-white",       bg: "bg-gradient-to-br from-orange-500/20 to-violet-500/20" },
        ].map(c => (
          <Card key={c.label} className={`${c.bg} border-border/40`}>
            <CardContent className="p-4 text-center">
              <div className="text-[11px] text-muted-foreground mb-1">{c.label}</div>
              <div className={`text-xl font-bold ${c.color}`}>{fmtCurrency(c.value)}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Grand total bar ── */}
      <Card className="bg-card/50 border-border/50">
        <CardContent className="p-4 space-y-3">
          <h2 className="text-sm font-semibold text-foreground mb-2">התפלגות עלויות</h2>
          {[
            { label: "ייצור",  value: totalProduction, color: "bg-orange-500/70" },
            { label: "שטח",    value: totalField,      color: "bg-emerald-500/70" },
            { label: "עקיף",   value: totalIndirect,   color: "bg-violet-500/70" },
          ].map(b => {
            const pct = grandTotal > 0 ? (b.value / grandTotal * 100) : 0;
            return (
              <div key={b.label} className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-16 shrink-0">{b.label}</span>
                <div className="flex-1 bg-muted/20 rounded-full h-5 relative overflow-hidden">
                  <div className={`h-full ${b.color} rounded-full transition-all duration-500 flex items-center justify-end px-2`} style={{ width: `${Math.max(2, pct)}%` }}>
                    <span className="text-[11px] font-bold text-white drop-shadow-sm whitespace-nowrap">{fmtCurrency(b.value)} ({pct.toFixed(1)}%)</span>
                  </div>
                </div>
              </div>
            );
          })}
          <div className="flex items-center gap-3 pt-2 border-t border-border/30">
            <span className="text-xs font-bold text-foreground w-16 shrink-0">סה״כ</span>
            <div className="flex-1 bg-muted/20 rounded-full h-6 relative overflow-hidden">
              <div className="h-full bg-gradient-to-l from-orange-500/80 via-emerald-500/80 to-violet-500/80 rounded-full flex items-center justify-center">
                <span className="text-sm font-bold text-white drop-shadow-sm">{fmtCurrency(grandTotal)}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── footer ── */}
      <div className="text-center text-xs text-muted-foreground pb-4">
        <Clock className="w-3 h-3 inline -mt-0.5 ml-1" />
        עלויות עבודה וביצוע — טכנו-כל עוזי &bull; ייצור + שטח + עקיף = {fmtCurrency(grandTotal)}
      </div>
    </div>
  );
}
