import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Shield, AlertTriangle, TrendingUp, Target, Layers, BarChart3,
  CheckCircle2, Percent, DollarSign, Zap, CloudRain, Users,
  Truck, Factory, Package, CreditCard, ArrowLeft
} from "lucide-react";

const fmt = (v: number) => "₪" + v.toLocaleString("he-IL");
const pct = (v: number) => v.toFixed(1) + "%";

interface RiskFactor {
  id: string;
  label: string;
  icon: React.ElementType;
  score: number;
  weight: number;
  description: string;
}

const FALLBACK_DEFAULT_RISK_FACTORS: RiskFactor[] = [
  { id: "material", label: "תנודתיות מחירי חומרים", icon: Package, score: 4, weight: 25, description: "סיכון לשינויי מחיר אלומיניום, ברזל, זכוכית" },
  { id: "supplier", label: "אמינות ספקים", icon: Truck, score: 2, weight: 20, description: "זמינות ספק, עמידה בלו\"ז, חלופות" },
  { id: "complexity", label: "מורכבות פרויקט", icon: Factory, score: 3, weight: 20, description: "מורכבות טכנית, מפרט מיוחד, התאמות" },
  { id: "installation", label: "סיכון התקנה", icon: Zap, score: 3, weight: 15, description: "תנאי אתר, גישה, צורך בעגורן, קומות" },
  { id: "weather", label: "מזג אוויר / אתר", icon: CloudRain, score: 2, weight: 10, description: "חשיפה לגשם, רוח, תנאי שטח" },
  { id: "payment", label: "סיכון תשלום לקוח", icon: CreditCard, score: 2, weight: 10, description: "היסטוריית תשלומים, תנאי אשראי, ביטחונות" },
];

const FALLBACK_PROJECTS = [
  { id: "PRJ-1048", name: "שער כניסה Premium", client: "קבוצת אלון", totalCost: 150200, status: "פעיל" },
  { id: "PRJ-1052", name: "שער חשמלי כפול", client: "נכסי אריאל", totalCost: 178400, status: "פעיל" },
  { id: "PRJ-1055", name: "גדר אלומיניום מעוצבת", client: "גולדן הום", totalCost: 92600, status: "הצעה" },
];

export default function RiskMarginTarget() {

  const { data: apiData } = useQuery({
    queryKey: ["risk_margin_target"],
    queryFn: () => authFetch("/api/pricing/risk-margin-target").then(r => r.json()),
    staleTime: 60_000,
    retry: 1,
  });
  const defaultRiskFactors = apiData?.defaultRiskFactors ?? FALLBACK_DEFAULT_RISK_FACTORS;
  const projects = apiData?.projects ?? FALLBACK_PROJECTS;
  const [selectedProject, setSelectedProject] = useState(projects[0]);
  const [riskFactors, setRiskFactors] = useState<RiskFactor[]>(defaultRiskFactors);
  const [companyTargetMargin, setCompanyTargetMargin] = useState(25);
  const [projectAdjustment, setProjectAdjustment] = useState(3);
  const [strategicDiscount, setStrategicDiscount] = useState(2);
  const [minAcceptableMargin, setMinAcceptableMargin] = useState(15);

  const updateScore = (id: string, score: number) => {
    setRiskFactors(prev => prev.map(f => f.id === id ? { ...f, score: Math.min(5, Math.max(1, score)) } : f));
  };

  const updateWeight = (id: string, weight: number) => {
    setRiskFactors(prev => prev.map(f => f.id === id ? { ...f, weight: Math.min(100, Math.max(0, weight)) } : f));
  };

  const totalWeight = riskFactors.reduce((s, f) => s + f.weight, 0);
  const weightedRiskScore = riskFactors.reduce((s, f) => s + (f.score * f.weight) / 100, 0);
  const totalRiskMarkup = +(weightedRiskScore * 2.8).toFixed(1);

  const effectiveTargetMargin = companyTargetMargin + projectAdjustment - strategicDiscount;
  const riskBuffer = +(selectedProject.totalCost * totalRiskMarkup / 100).toFixed(0);
  const marginAmount = +((selectedProject.totalCost + riskBuffer) * effectiveTargetMargin / 100).toFixed(0);
  const recommendedPrice = selectedProject.totalCost + riskBuffer + marginAmount;
  const effectiveMarginPct = +((recommendedPrice - selectedProject.totalCost) / recommendedPrice * 100).toFixed(1);

  const companyAvgMargin = 23.4;
  const categoryAvgMargin = 21.8;

  const scoreColor = (s: number) =>
    s <= 2 ? "text-emerald-400" : s <= 3 ? "text-amber-400" : "text-red-400";
  const scoreBg = (s: number) =>
    s <= 2 ? "bg-emerald-500/20" : s <= 3 ? "bg-amber-500/20" : "bg-red-500/20";

  return (
    <div dir="rtl" className="min-h-screen bg-background text-foreground p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">ניהול סיכון ומרווח יעד</h1>
            <p className="text-sm text-muted-foreground">טכנו-כל עוזי — ניתוח סיכונים ותמחור יעד</p>
          </div>
        </div>
        <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30 text-sm px-3 py-1">
          <Shield className="w-3.5 h-3.5 ml-1.5" /> Risk & Margin
        </Badge>
      </div>

      {/* Project Selector */}
      <Card className="bg-card border-border">
        <CardContent className="p-4">
          <div className="flex items-center gap-3 mb-3">
            <Layers className="w-4 h-4 text-violet-400" />
            <span className="text-sm font-medium text-muted-foreground">בחר פרויקט:</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {projects.map(p => (
              <button
                key={p.id}
                onClick={() => setSelectedProject(p)}
                className={`p-3 rounded-lg border text-right transition-all ${
                  selectedProject.id === p.id
                    ? "bg-orange-500/10 border-orange-500/40 ring-1 ring-orange-500/30"
                    : "bg-muted/10 border-border hover:bg-muted/20"
                }`}
              >
                <div className="font-semibold text-sm">{p.name}</div>
                <div className="text-xs text-muted-foreground mt-1">{p.id} &middot; {p.client}</div>
                <div className="text-xs text-muted-foreground mt-0.5">עלות כוללת: {fmt(p.totalCost)}</div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Risk Factors Table */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-orange-400" /> גורמי סיכון — {selectedProject.id}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="text-right py-2 px-3 font-medium w-8"></th>
                  <th className="text-right py-2 px-3 font-medium">גורם סיכון</th>
                  <th className="text-right py-2 px-3 font-medium">תיאור</th>
                  <th className="text-center py-2 px-3 font-medium">ציון (1-5)</th>
                  <th className="text-center py-2 px-3 font-medium">משקל %</th>
                  <th className="text-center py-2 px-3 font-medium">תרומה לסיכון</th>
                </tr>
              </thead>
              <tbody>
                {riskFactors.map(f => {
                  const contribution = +((f.score * f.weight / 100) * 2.8).toFixed(1);
                  return (
                    <tr key={f.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <td className="py-2.5 px-3">
                        <div className={`w-7 h-7 rounded flex items-center justify-center ${scoreBg(f.score)}`}>
                          <f.icon className={`w-3.5 h-3.5 ${scoreColor(f.score)}`} />
                        </div>
                      </td>
                      <td className="py-2.5 px-3 font-medium">{f.label}</td>
                      <td className="py-2.5 px-3 text-muted-foreground text-xs">{f.description}</td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center justify-center gap-1">
                          {[1, 2, 3, 4, 5].map(n => (
                            <button
                              key={n}
                              onClick={() => updateScore(f.id, n)}
                              className={`w-7 h-7 rounded text-xs font-bold transition-all ${
                                n <= f.score
                                  ? n <= 2 ? "bg-emerald-500/30 text-emerald-400 border border-emerald-500/40"
                                    : n <= 3 ? "bg-amber-500/30 text-amber-400 border border-amber-500/40"
                                    : "bg-red-500/30 text-red-400 border border-red-500/40"
                                  : "bg-muted/20 text-muted-foreground border border-border"
                              }`}
                            >
                              {n}
                            </button>
                          ))}
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center justify-center gap-1">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={f.weight}
                            onChange={e => updateWeight(f.id, +e.target.value)}
                            className="w-14 h-7 text-center text-sm bg-muted/20 border border-border rounded px-1"
                          />
                          <span className="text-xs text-muted-foreground">%</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <Badge className={
                          contribution <= 2 ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                          : contribution <= 4 ? "bg-amber-500/20 text-amber-400 border-amber-500/30"
                          : "bg-red-500/20 text-red-400 border-red-500/30"
                        }>
                          {pct(contribution)}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Risk Summary */}
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-3 rounded-lg bg-muted/20 border border-border text-center">
              <div className="text-xs text-muted-foreground">סה"כ משקלות</div>
              <div className={`text-xl font-bold mt-1 ${totalWeight === 100 ? "text-emerald-400" : "text-red-400"}`}>
                {totalWeight}%
              </div>
              {totalWeight !== 100 && <div className="text-xs text-red-400">נדרש 100%</div>}
            </div>
            <div className="p-3 rounded-lg bg-muted/20 border border-border text-center">
              <div className="text-xs text-muted-foreground">ציון סיכון משוקלל</div>
              <div className={`text-xl font-bold mt-1 ${scoreColor(weightedRiskScore)}`}>
                {weightedRiskScore.toFixed(2)} / 5
              </div>
            </div>
            <div className="p-3 rounded-lg bg-orange-500/10 border border-orange-500/20 text-center">
              <div className="text-xs text-muted-foreground">סה"כ תוספת סיכון</div>
              <div className="text-xl font-bold text-orange-400 mt-1">{pct(totalRiskMarkup)}</div>
              <div className="text-xs text-orange-400">{fmt(riskBuffer)}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Margin Target Section */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="w-4 h-4 text-blue-400" /> יעדי מרווח
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-lg bg-muted/20 border border-border">
              <div className="flex items-center gap-2 mb-2">
                <Percent className="w-4 h-4 text-blue-400" />
                <span className="text-sm text-muted-foreground">מרווח יעד חברה</span>
              </div>
              <input
                type="number"
                value={companyTargetMargin}
                onChange={e => setCompanyTargetMargin(+e.target.value)}
                className="w-full h-9 text-lg font-bold text-center bg-muted/20 border border-border rounded px-2"
              />
              <div className="text-xs text-muted-foreground text-center mt-1">יעד ברמת החברה</div>
            </div>
            <div className="p-4 rounded-lg bg-muted/20 border border-border">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                <span className="text-sm text-muted-foreground">התאמת פרויקט</span>
              </div>
              <input
                type="number"
                value={projectAdjustment}
                onChange={e => setProjectAdjustment(+e.target.value)}
                className="w-full h-9 text-lg font-bold text-center bg-muted/20 border border-border rounded px-2"
              />
              <div className="text-xs text-muted-foreground text-center mt-1">+/- התאמה לפרויקט</div>
            </div>
            <div className="p-4 rounded-lg bg-muted/20 border border-border">
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-4 h-4 text-violet-400" />
                <span className="text-sm text-muted-foreground">הנחת לקוח אסטרטגי</span>
              </div>
              <input
                type="number"
                value={strategicDiscount}
                onChange={e => setStrategicDiscount(+e.target.value)}
                className="w-full h-9 text-lg font-bold text-center bg-muted/20 border border-border rounded px-2"
              />
              <div className="text-xs text-muted-foreground text-center mt-1">הנחה % ללקוח אסטרטגי</div>
            </div>
            <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-4 h-4 text-red-400" />
                <span className="text-sm text-muted-foreground">מרווח מינימלי</span>
              </div>
              <input
                type="number"
                value={minAcceptableMargin}
                onChange={e => setMinAcceptableMargin(+e.target.value)}
                className="w-full h-9 text-lg font-bold text-center bg-muted/20 border border-border rounded px-2"
              />
              <div className="text-xs text-red-400 text-center mt-1">מתחת לערך זה — נדרש אישור</div>
            </div>
          </div>

          <div className="mt-4 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center gap-3">
            <Target className="w-5 h-5 text-blue-400 shrink-0" />
            <div className="text-sm">
              <span className="text-muted-foreground">מרווח יעד אפקטיבי: </span>
              <span className="font-bold text-blue-400">{pct(effectiveTargetMargin)}</span>
              <span className="text-muted-foreground mx-2">=</span>
              <span className="text-xs text-muted-foreground">{companyTargetMargin}% יעד</span>
              <span className="text-xs text-emerald-400 mx-1">+{projectAdjustment}% התאמה</span>
              <span className="text-xs text-red-400">-{strategicDiscount}% הנחה</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Price Calculation */}
      <Card className="bg-gradient-to-br from-emerald-600/10 to-teal-900/10 border-emerald-500/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-emerald-400" /> חישוב מחיר מומלץ — {selectedProject.id}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-32 text-sm text-muted-foreground shrink-0">עלות כוללת</div>
            <div className="flex-1 bg-muted/30 rounded-full h-6 relative overflow-hidden">
              <div className="bg-blue-500 h-full rounded-full" style={{ width: `${(selectedProject.totalCost / recommendedPrice) * 100}%` }} />
            </div>
            <div className="w-28 text-sm font-medium text-left">{fmt(selectedProject.totalCost)}</div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-32 text-sm text-muted-foreground shrink-0">+ חיץ סיכון ({pct(totalRiskMarkup)})</div>
            <div className="flex-1 bg-muted/30 rounded-full h-6 relative overflow-hidden">
              <div className="bg-orange-500 h-full rounded-full" style={{ width: `${(riskBuffer / recommendedPrice) * 100}%` }} />
            </div>
            <div className="w-28 text-sm font-medium text-orange-400 text-left">{fmt(riskBuffer)}</div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-32 text-sm text-muted-foreground shrink-0">+ מרווח יעד ({pct(effectiveTargetMargin)})</div>
            <div className="flex-1 bg-muted/30 rounded-full h-6 relative overflow-hidden">
              <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${(marginAmount / recommendedPrice) * 100}%` }} />
            </div>
            <div className="w-28 text-sm font-medium text-emerald-400 text-left">{fmt(marginAmount)}</div>
          </div>
          <div className="border-t border-emerald-500/20 pt-3 flex items-center gap-3">
            <div className="w-32 text-sm font-bold shrink-0">= מחיר מומלץ</div>
            <div className="flex-1 flex items-center justify-center">
              <ArrowLeft className="w-5 h-5 text-emerald-400" />
            </div>
            <div className="w-28 text-xl font-bold text-emerald-400 text-left">{fmt(recommendedPrice)}</div>
          </div>
          <div className="mt-2 flex items-center gap-4 text-sm text-muted-foreground">
            <span>מרווח אפקטיבי כולל: <span className={`font-bold ${effectiveMarginPct >= minAcceptableMargin ? "text-emerald-400" : "text-red-400"}`}>{pct(effectiveMarginPct)}</span></span>
            <span>רווח גולמי: <span className="font-bold text-emerald-400">{fmt(recommendedPrice - selectedProject.totalCost)}</span></span>
            {effectiveMarginPct < minAcceptableMargin && (
              <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
                <AlertTriangle className="w-3 h-3 ml-1" /> מתחת למינימום!
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Comparison */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-cyan-400" /> השוואת מרווח
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-lg bg-muted/20 border border-border text-center">
              <div className="text-xs text-muted-foreground">פרויקט נוכחי</div>
              <div className="text-2xl font-bold text-emerald-400 mt-1">{pct(effectiveMarginPct)}</div>
              <div className="text-xs text-muted-foreground">{selectedProject.name}</div>
            </div>
            <div className="p-4 rounded-lg bg-muted/20 border border-border text-center">
              <div className="text-xs text-muted-foreground">ממוצע חברה</div>
              <div className="text-2xl font-bold text-blue-400 mt-1">{pct(companyAvgMargin)}</div>
              <div className="text-xs text-muted-foreground">כל הפרויקטים 12 חודשים</div>
            </div>
            <div className="p-4 rounded-lg bg-muted/20 border border-border text-center">
              <div className="text-xs text-muted-foreground">ממוצע קטגוריה</div>
              <div className="text-2xl font-bold text-violet-400 mt-1">{pct(categoryAvgMargin)}</div>
              <div className="text-xs text-muted-foreground">שערים ומעקות Premium</div>
            </div>
          </div>

          <div className="space-y-3">
            {[
              { label: "פרויקט נוכחי", value: effectiveMarginPct, color: "bg-emerald-500", textColor: "text-emerald-400" },
              { label: "ממוצע חברה", value: companyAvgMargin, color: "bg-blue-500", textColor: "text-blue-400" },
              { label: "ממוצע קטגוריה", value: categoryAvgMargin, color: "bg-violet-500", textColor: "text-violet-400" },
              { label: "מרווח מינימלי", value: minAcceptableMargin, color: "bg-red-500", textColor: "text-red-400" },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-3">
                <div className="w-28 text-sm text-muted-foreground shrink-0">{item.label}</div>
                <div className="flex-1 bg-muted/30 rounded-full h-5 relative overflow-hidden">
                  <div className={`${item.color} h-full rounded-full transition-all`} style={{ width: `${item.value * 2.2}%` }} />
                </div>
                <div className={`w-14 text-sm font-semibold text-left ${item.textColor}`}>{pct(item.value)}</div>
              </div>
            ))}
          </div>

          <div className="mt-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
            <div className="text-sm text-emerald-300">
              {effectiveMarginPct >= companyAvgMargin
                ? `המרווח בפרויקט זה (${pct(effectiveMarginPct)}) עולה על ממוצע החברה (${pct(companyAvgMargin)}) ב-${pct(effectiveMarginPct - companyAvgMargin)}.`
                : `המרווח בפרויקט זה (${pct(effectiveMarginPct)}) נמוך מממוצע החברה (${pct(companyAvgMargin)}) ב-${pct(companyAvgMargin - effectiveMarginPct)}.`
              }
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
