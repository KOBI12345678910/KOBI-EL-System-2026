import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Calculator, Weight, Ruler, Package, DollarSign, Percent,
  Layers, CircleDot, SquareSlash, Minus, Info, RefreshCw
} from "lucide-react";

// ============================================================
// TYPES & CONSTANTS
// ============================================================

type ProfileType = "square_tube" | "round_tube" | "angle" | "flat_sheet" | "u_channel" | "i_beam";
type MaterialType = "iron" | "aluminum" | "stainless" | "glass";

const VAT_RATE = 0.17;

const PROFILES: { key: ProfileType; label: string; icon: typeof Layers }[] = [
  { key: "square_tube", label: "צינור מרובע", icon: SquareSlash },
  { key: "round_tube", label: "צינור עגול", icon: CircleDot },
  { key: "angle", label: "זווית", icon: Minus },
  { key: "flat_sheet", label: "פח שטוח", icon: Layers },
  { key: "u_channel", label: "פרופיל U", icon: Layers },
  { key: "i_beam", label: "I-beam", icon: Layers },
];

const MATERIALS: { key: MaterialType; label: string; density: number; color: string }[] = [
  { key: "iron", label: "ברזל / פלדה", density: 7.85, color: "bg-gray-500" },
  { key: "aluminum", label: "אלומיניום", density: 2.70, color: "bg-blue-500" },
  { key: "stainless", label: "נירוסטה", density: 7.93, color: "bg-slate-400" },
  { key: "glass", label: "זכוכית", density: 2.50, color: "bg-cyan-400" },
];

const fmt = (v: number, decimals = 2) =>
  new Intl.NumberFormat("he-IL", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(v);
const fmtCurrency = (v: number) => "\u20AA" + fmt(v);

// ============================================================
// FORMULA HELPERS
// ============================================================

/** Cross-section area in mm^2 by profile type */
function crossSectionArea(
  profile: ProfileType,
  width: number,
  height: number,
  thickness: number
): number {
  switch (profile) {
    case "square_tube":
      // outer rect minus inner rect
      return width * height - (width - 2 * thickness) * (height - 2 * thickness);
    case "round_tube": {
      const outerR = width / 2;
      const innerR = outerR - thickness;
      return Math.PI * (outerR * outerR - innerR * innerR);
    }
    case "angle":
      // L-shape: two legs
      return width * thickness + (height - thickness) * thickness;
    case "flat_sheet":
      return width * thickness;
    case "u_channel":
      // base + 2 flanges
      return width * thickness + 2 * (height - thickness) * thickness;
    case "i_beam":
      // top flange + bottom flange + web
      return 2 * (width * thickness) + (height - 2 * thickness) * thickness;
    default:
      return 0;
  }
}

function formulaDescription(profile: ProfileType): string {
  switch (profile) {
    case "square_tube":
      return "שטח חתך = (רוחב × גובה) − (רוחב − 2×עובי) × (גובה − 2×עובי)";
    case "round_tube":
      return "שטח חתך = π × (R² − r²)  כאשר R = קוטר/2, r = R − עובי";
    case "angle":
      return "שטח חתך = (רוחב × עובי) + (גובה − עובי) × עובי";
    case "flat_sheet":
      return "שטח חתך = רוחב × עובי";
    case "u_channel":
      return "שטח חתך = (רוחב × עובי) + 2 × (גובה − עובי) × עובי";
    case "i_beam":
      return "שטח חתך = 2 × (רוחב × עובי) + (גובה − 2×עובי) × עובי";
    default:
      return "";
  }
}

// ============================================================
// COMPONENT
// ============================================================

export default function WeightCalculator() {
  // Inputs
  const [profile, setProfile] = useState<ProfileType>("square_tube");
  const [material, setMaterial] = useState<MaterialType>("iron");
  const [widthMm, setWidthMm] = useState<number>(50);
  const [heightMm, setHeightMm] = useState<number>(50);
  const [thicknessMm, setThicknessMm] = useState<number>(2);
  const [lengthM, setLengthM] = useState<number>(6);
  const [quantity, setQuantity] = useState<number>(10);
  const [pricePerMeter, setPricePerMeter] = useState<number>(28);
  const [wastePercent, setWastePercent] = useState<number>(8);

  // Derived
  const density = MATERIALS.find((m) => m.key === material)!.density;
  const area = crossSectionArea(profile, widthMm, heightMm, thicknessMm); // mm^2
  const kgPerMeter = (area / 1_000_000) * 1000 * density; // area m^2 × 1m × density
  const totalKg = kgPerMeter * lengthM * quantity;
  const costBeforeVat = pricePerMeter * lengthM * quantity;
  const costAfterVat = costBeforeVat * (1 + VAT_RATE);
  const costPerPiece = pricePerMeter * lengthM;
  const wasteFactor = 1 + wastePercent / 100;
  const wasteAdjustedCost = costBeforeVat * wasteFactor;
  const wasteAdjustedCostVat = wasteAdjustedCost * (1 + VAT_RATE);
  const costPerKg = totalKg > 0 ? costBeforeVat / totalKg : 0;

  const handleNum = (setter: (v: number) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    if (!isNaN(v) && v >= 0) setter(v);
  };

  // --------------------------------------------------------
  // RENDER
  // --------------------------------------------------------
  return (
    <div dir="rtl" className="p-6 space-y-6">
      {/* HEADER */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center">
          <Calculator className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">מחשבון משקל ועלות חומרי גלם</h1>
          <p className="text-slate-400 text-sm">טכנו-כל עוזי — מתכת / אלומיניום / זכוכית</p>
        </div>
        <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30 mr-auto">6 מחשבונים</Badge>
      </div>

      {/* MATERIAL & PROFILE SELECTORS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Material */}
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-slate-200 flex items-center gap-2">
              <Layers className="w-4 h-4 text-blue-400" /> סוג חומר
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {MATERIALS.map((m) => (
                <button
                  key={m.key}
                  onClick={() => setMaterial(m.key)}
                  className={`rounded-lg p-3 text-sm text-center transition-all border ${
                    material === m.key
                      ? "border-orange-500 bg-orange-500/15 text-orange-300"
                      : "border-slate-600 bg-slate-700/40 text-slate-300 hover:border-slate-500"
                  }`}
                >
                  <div className={`w-3 h-3 rounded-full ${m.color} mx-auto mb-1`} />
                  <div className="font-medium">{m.label}</div>
                  <div className="text-xs text-slate-400 mt-0.5">צפיפות {m.density} g/cm³</div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Profile */}
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-slate-200 flex items-center gap-2">
              <Package className="w-4 h-4 text-purple-400" /> סוג פרופיל
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {PROFILES.map((p) => {
                const Icon = p.icon;
                return (
                  <button
                    key={p.key}
                    onClick={() => setProfile(p.key)}
                    className={`rounded-lg p-3 text-sm text-center transition-all border ${
                      profile === p.key
                        ? "border-purple-500 bg-purple-500/15 text-purple-300"
                        : "border-slate-600 bg-slate-700/40 text-slate-300 hover:border-slate-500"
                    }`}
                  >
                    <Icon className="w-4 h-4 mx-auto mb-1" />
                    <div className="font-medium">{p.label}</div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* INPUT FIELDS */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-slate-200 flex items-center gap-2">
            <Ruler className="w-4 h-4 text-emerald-400" /> מידות וכמויות
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {[
              { label: "רוחב (מ\"מ)", value: widthMm, set: setWidthMm, icon: Ruler, hint: profile === "round_tube" ? "= קוטר חיצוני" : undefined },
              { label: "גובה (מ\"מ)", value: heightMm, set: setHeightMm, icon: Ruler, disabled: profile === "flat_sheet" },
              { label: "עובי דופן (מ\"מ)", value: thicknessMm, set: setThicknessMm, icon: Ruler },
              { label: "אורך (מטר)", value: lengthM, set: setLengthM, icon: Ruler },
              { label: "כמות יחידות", value: quantity, set: setQuantity, icon: Package },
              { label: "מחיר למטר (\u20AA)", value: pricePerMeter, set: setPricePerMeter, icon: DollarSign },
              { label: "אחוז פחת / בזבוז (%)", value: wastePercent, set: setWastePercent, icon: Percent },
            ].map((field) => {
              const Icon = field.icon;
              return (
                <div key={field.label} className="space-y-1.5">
                  <label className="text-xs text-slate-400 flex items-center gap-1">
                    <Icon className="w-3 h-3" /> {field.label}
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={field.value}
                    onChange={handleNum(field.set)}
                    disabled={field.disabled}
                    className={`w-full rounded-md border border-slate-600 bg-slate-700/60 text-white text-sm px-3 py-2 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500/30 ${
                      field.disabled ? "opacity-40 cursor-not-allowed" : ""
                    }`}
                  />
                  {field.hint && <span className="text-[10px] text-slate-500">{field.hint}</span>}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* OUTPUT CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          { label: "משקל למטר", badge: "weight_by_meter", Icon: Weight, iconColor: "text-blue-400", badgeCls: "bg-blue-500/20 text-blue-300 border-blue-500/30",
            main: `${fmt(kgPerMeter)} `, unit: "ק״ג/מ׳", sub: `שטח חתך: ${fmt(area, 1)} מ״מ²` },
          { label: "משקל ליחידה", badge: "weight_by_profile", Icon: Package, iconColor: "text-purple-400", badgeCls: "bg-purple-500/20 text-purple-300 border-purple-500/30",
            main: `${fmt(kgPerMeter * lengthM)} `, unit: "ק״ג", sub: `${fmt(kgPerMeter)} ק״ג/מ׳ × ${lengthM} מ׳` },
          { label: "משקל כולל", badge: "total_weight", Icon: Layers, iconColor: "text-emerald-400", badgeCls: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
            main: `${fmt(totalKg)} `, unit: "ק״ג", sub: `${fmt(kgPerMeter * lengthM)} ק״ג × ${quantity} יח׳` },
          { label: "עלות למטר", badge: "cost_by_meter", Icon: DollarSign, iconColor: "text-amber-400", badgeCls: "bg-amber-500/20 text-amber-300 border-amber-500/30",
            main: `${fmtCurrency(pricePerMeter)} `, unit: "/מ׳", sub: `עלות לק״ג: ${fmtCurrency(costPerKg)}` },
        ].map((c) => (
          <Card key={c.badge} className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-slate-400 flex items-center gap-1"><c.Icon className={`w-3.5 h-3.5 ${c.iconColor}`} /> {c.label}</span>
                <Badge className={`${c.badgeCls} text-[10px]`}>{c.badge}</Badge>
              </div>
              <div className="text-3xl font-bold text-white">{c.main}<span className="text-base text-slate-400">{c.unit}</span></div>
              <p className="text-xs text-slate-500 mt-1">{c.sub}</p>
            </CardContent>
          </Card>
        ))}
        {/* 5. Cost total with VAT */}
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-slate-400 flex items-center gap-1"><DollarSign className="w-3.5 h-3.5 text-cyan-400" /> עלות כוללת</span>
              <Badge className="bg-cyan-500/20 text-cyan-300 border-cyan-500/30 text-[10px]">cost_by_weight</Badge>
            </div>
            <div className="text-2xl font-bold text-white">{fmtCurrency(costBeforeVat)}</div>
            <div className="text-lg font-semibold text-emerald-400 mt-1">{fmtCurrency(costAfterVat)} <span className="text-xs text-slate-400">כולל מע״מ 17%</span></div>
            <p className="text-xs text-slate-500 mt-1">עלות ליחידה: {fmtCurrency(costPerPiece)}</p>
          </CardContent>
        </Card>
        {/* 6. Waste-adjusted */}
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-slate-400 flex items-center gap-1"><Percent className="w-3.5 h-3.5 text-red-400" /> עלות בתוספת פחת</span>
              <Badge className="bg-red-500/20 text-red-300 border-red-500/30 text-[10px]">waste_adjusted</Badge>
            </div>
            <div className="text-2xl font-bold text-white">{fmtCurrency(wasteAdjustedCost)}</div>
            <div className="text-lg font-semibold text-red-400 mt-1">{fmtCurrency(wasteAdjustedCostVat)} <span className="text-xs text-slate-400">כולל מע״מ</span></div>
            <p className="text-xs text-slate-500 mt-1">פחת {wastePercent}% — תוספת {fmtCurrency(wasteAdjustedCost - costBeforeVat)}</p>
          </CardContent>
        </Card>
      </div>

      {/* SUMMARY TABLE */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-slate-200 flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-orange-400" /> סיכום חישוב
          </CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-slate-400">
                <th className="text-right py-2 px-3 font-medium">פרמטר</th>
                <th className="text-right py-2 px-3 font-medium">ערך</th>
                <th className="text-right py-2 px-3 font-medium">יחידה</th>
              </tr>
            </thead>
            <tbody className="text-slate-300">
              {[
                ["חומר", MATERIALS.find((m) => m.key === material)!.label, `צפיפות ${density}`],
                ["פרופיל", PROFILES.find((p) => p.key === profile)!.label, ""],
                ["מידות", `${widthMm} × ${heightMm} × ${thicknessMm}`, "מ״מ"],
                ["שטח חתך", fmt(area, 1), "מ״מ²"],
                ["משקל למטר", fmt(kgPerMeter), "ק״ג/מ׳"],
                ["משקל כולל", fmt(totalKg), "ק״ג"],
                ["עלות לפני מע״מ", fmtCurrency(costBeforeVat), ""],
                ["עלות אחרי מע״מ", fmtCurrency(costAfterVat), ""],
                ["עלות ליחידה", fmtCurrency(costPerPiece), ""],
                ["עלות + פחת + מע״מ", fmtCurrency(wasteAdjustedCostVat), "סופי"],
              ].map(([param, val, unit], i) => (
                <tr key={i} className={`border-b border-slate-700/50 ${i >= 6 ? "font-semibold" : ""}`}>
                  <td className="py-2 px-3">{param}</td>
                  <td className="py-2 px-3">{val}</td>
                  <td className="py-2 px-3 text-slate-500">{unit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* FORMULA DISPLAY */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-slate-200 flex items-center gap-2">
            <Info className="w-4 h-4 text-sky-400" /> נוסחאות חישוב
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-slate-900/50 rounded-lg p-4 space-y-2 font-mono text-xs leading-relaxed">
            <p className="text-slate-400 font-sans text-sm font-medium mb-2">
              {PROFILES.find((p) => p.key === profile)!.label} — {MATERIALS.find((m) => m.key === material)!.label}
            </p>
            <p><span className="text-sky-400">1.</span> {formulaDescription(profile)}</p>
            <p><span className="text-sky-400">2.</span> משקל_למטר = שטח_חתך(מ²) &times; 1מ׳ &times; צפיפות(ק״ג/מ³)</p>
            <p className="text-slate-500 mr-4">= {fmt(area, 1)} &divide; 1,000,000 &times; 1,000 &times; {density} = <span className="text-white">{fmt(kgPerMeter)} ק״ג/מ׳</span></p>
            <p><span className="text-sky-400">3.</span> משקל_כולל = {fmt(kgPerMeter)} &times; {lengthM} &times; {quantity} = <span className="text-white">{fmt(totalKg)} ק״ג</span></p>
            <p><span className="text-sky-400">4.</span> עלות = {fmtCurrency(pricePerMeter)} &times; {lengthM} &times; {quantity} = <span className="text-white">{fmtCurrency(costBeforeVat)}</span></p>
            <p><span className="text-sky-400">5.</span> + מע״מ = {fmtCurrency(costBeforeVat)} &times; 1.17 = <span className="text-emerald-400">{fmtCurrency(costAfterVat)}</span></p>
            <p><span className="text-sky-400">6.</span> + פחת = {fmtCurrency(costBeforeVat)} &times; {fmt(wasteFactor)} &times; 1.17 = <span className="text-red-400">{fmtCurrency(wasteAdjustedCostVat)}</span></p>
          </div>
        </CardContent>
      </Card>

      {/* DENSITY REFERENCE */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-slate-200 flex items-center gap-2">
            <Layers className="w-4 h-4 text-violet-400" /> טבלת צפיפויות חומרים
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {MATERIALS.map((m) => (
              <div key={m.key} className={`rounded-lg p-3 border text-center ${material === m.key ? "border-orange-500 bg-orange-500/10" : "border-slate-700 bg-slate-900/30"}`}>
                <div className={`w-4 h-4 rounded-full ${m.color} mx-auto mb-2`} />
                <div className="text-sm font-medium text-slate-200">{m.label}</div>
                <div className="text-2xl font-bold text-white mt-1">{m.density}</div>
                <div className="text-[10px] text-slate-500">g/cm³ = טון/מ³</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
