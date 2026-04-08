import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Calculator, Wind, Thermometer, Columns, CheckCircle2,
  Clock, AlertTriangle, TrendingUp, TrendingDown, Shield,
  Waves, Droplets, FileCheck, Search,
} from "lucide-react";

/* ── structural_calculations, wind_load, thermal_analysis, glass_thickness,
   acoustic_insulation, water_tightness, deflection_checks ── */
const calculations = [
  { id: "CALC-001", project: "מגדל מגורים תל אביב", type: "עומס רוח", desc: "חישוב לחץ רוח קיר מסך קומות 15-30", result: "1.82 kPa", status: "approved", engineer: "יוסי כהן" },
  { id: "CALC-002", project: "בניין משרדים רמת גן", type: "מוליכות תרמית", desc: "חישוב U-value חלון אלומיניום עם זיגוג כפול", result: "Uw=1.8 W/m²K", status: "approved", engineer: "שרה לוי" },
  { id: "CALC-003", project: "מרכז מסחרי באר שבע", type: "שקיעה מבנית", desc: "בדיקת שקיעה L/200 פרופיל 45x90 מפתח 2.4m", result: "6.2mm < 12mm", status: "approved", engineer: "דוד מזרחי" },
  { id: "CALC-004", project: "בית חולים אשדוד", type: "עובי זכוכית", desc: "חישוב עובי זכוכית בטיחותית חדר ניתוח", result: "10+16+8 mm", status: "pending", engineer: "רחל אברהם" },
  { id: "CALC-005", project: "מפעל תעופה לוד", type: "בידוד אקוסטי", desc: "חישוב Rw לחלון כפול עם גז ארגון", result: "Rw=42 dB", status: "approved", engineer: "מיכל ברק" },
  { id: "CALC-006", project: "קניון ירושלים", type: "אטימות מים", desc: "בדיקת אטימות לחץ מים 600Pa חלון pivot", result: "עובר E1050", status: "pending", engineer: "עומר חדד" },
  { id: "CALC-007", project: "מתחם ספורט נתניה", type: "חדירת אוויר", desc: "בדיקת חדירת אוויר דלת כניסה ראשית", result: "Class 4", status: "failed", engineer: "נועה פרידמן" },
  { id: "CALC-008", project: "מגדל מגורים תל אביב", type: "עומס רוח", desc: "חישוב לחץ רוח חזית מזרחית קומות 1-14", result: "1.35 kPa", status: "approved", engineer: "יוסי כהן" },
  { id: "CALC-009", project: "בניין משרדים רמת גן", type: "שקיעה מבנית", desc: "בדיקת מאמצים פרופיל ויטרינה 60x150", result: "σ=85 < 160 MPa", status: "approved", engineer: "שרה לוי" },
  { id: "CALC-010", project: "מרכז מסחרי באר שבע", type: "מוליכות תרמית", desc: "חישוב Uw דלת כניסה אלומיניום עם שבירת גשר", result: "Uw=2.1 W/m²K", status: "pending", engineer: "אלון גולדשטיין" },
  { id: "CALC-011", project: "בית חולים אשדוד", type: "עומס רוח", desc: "חישוב לחץ רוח פינות מבנה - אזור קריטי", result: "2.45 kPa", status: "approved", engineer: "רחל אברהם" },
  { id: "CALC-012", project: "מפעל תעופה לוד", type: "שקיעה מבנית", desc: "בדיקת שקיעה שער הזזה תעשייתי 6m", result: "18mm < 30mm", status: "failed", engineer: "מיכל ברק" },
];

const windZones = [
  { zone: "A", label: "אזור A - חוף", qb: 0.73 },
  { zone: "B", label: "אזור B - פנים", qb: 0.55 },
  { zone: "C", label: "אזור C - הרים", qb: 0.65 },
];
const thermalConfigs = [
  { id: 1, name: "חלון אלומיניום סטנדרטי - זיגוג בודד", uf: 5.8, ug: 5.7, psi: 0.08, af: 0.3, ag: 0.7, uw: "5.71" },
  { id: 2, name: "חלון אלומיניום - זיגוג כפול 4/16/4", uf: 5.8, ug: 2.7, psi: 0.08, af: 0.25, ag: 0.75, uw: "3.56" },
  { id: 3, name: "חלון שבירת גשר - זיגוג כפול 4/16/4", uf: 3.2, ug: 2.7, psi: 0.06, af: 0.25, ag: 0.75, uw: "2.87" },
  { id: 4, name: "חלון שבירת גשר - זיגוג כפול Low-E ארגון", uf: 3.2, ug: 1.1, psi: 0.06, af: 0.25, ag: 0.75, uw: "1.69" },
  { id: 5, name: "קיר מסך - זיגוג כפול Low-E ארגון", uf: 2.8, ug: 1.1, psi: 0.04, af: 0.15, ag: 0.85, uw: "1.41" },
  { id: 6, name: "חלון שבירת גשר - זיגוג משולש Low-E", uf: 3.2, ug: 0.6, psi: 0.04, af: 0.25, ag: 0.75, uw: "1.29" },
];
const structProfiles = [
  { name: "45x90", ix: 48.6, wx: 10.8, span: 2.4, load: 1.5, deflMax: 12.0, deflActual: 6.2, stress: 85, stressAllow: 160, pass: true },
  { name: "60x120", ix: 138.0, wx: 23.0, span: 3.0, load: 1.8, deflMax: 15.0, deflActual: 8.7, stress: 102, stressAllow: 160, pass: true },
  { name: "60x150", ix: 220.0, wx: 29.3, span: 3.5, load: 2.0, deflMax: 17.5, deflActual: 11.3, stress: 118, stressAllow: 160, pass: true },
  { name: "80x200", ix: 533.0, wx: 53.3, span: 5.0, load: 2.2, deflMax: 25.0, deflActual: 14.6, stress: 95, stressAllow: 160, pass: true },
  { name: "45x90 (שער 6m)", ix: 48.6, wx: 10.8, span: 6.0, load: 1.5, deflMax: 30.0, deflActual: 38.2, stress: 192, stressAllow: 160, pass: false },
  { name: "100x250", ix: 1302.0, wx: 104.2, span: 6.0, load: 2.5, deflMax: 30.0, deflActual: 12.1, stress: 78, stressAllow: 160, pass: true },
];

const calcStatusColor = (s: string) => s === "approved" ? "bg-green-500/20 text-green-300" : s === "pending" ? "bg-amber-500/20 text-amber-300" : "bg-red-500/20 text-red-300";
const calcStatusLabel = (s: string) => s === "approved" ? "מאושר" : s === "pending" ? "ממתין" : "נכשל";
const typeColor = (s: string) =>
  s === "עומס רוח" ? "bg-cyan-500/20 text-cyan-300" : s === "מוליכות תרמית" ? "bg-orange-500/20 text-orange-300"
  : s === "שקיעה מבנית" ? "bg-purple-500/20 text-purple-300" : s === "עובי זכוכית" ? "bg-blue-500/20 text-blue-300"
  : s === "בידוד אקוסטי" ? "bg-indigo-500/20 text-indigo-300" : s === "אטימות מים" ? "bg-teal-500/20 text-teal-300"
  : "bg-pink-500/20 text-pink-300";
const th = "p-3 text-right text-muted-foreground font-medium text-xs";
const td = "p-3 text-sm";

export default function EngineeringCalculationsPage() {
  const [tab, setTab] = useState("list");
  const [search, setSearch] = useState("");

  const [windHeight, setWindHeight] = useState("30");
  const [windZone, setWindZone] = useState("A");
  const [windExposure, setWindExposure] = useState("1.0");
  const [windTerrain, setWindTerrain] = useState("III");
  const approved = calculations.filter(c => c.status === "approved").length;
  const pending = calculations.filter(c => c.status === "pending").length;
  const windCount = calculations.filter(c => c.type === "עומס רוח").length;
  const thermalCount = calculations.filter(c => c.type === "מוליכות תרמית").length;
  const structCount = calculations.filter(c => c.type === "שקיעה מבנית").length;
  const kpis = [
    { label: "סה\"כ חישובים", value: calculations.length.toString(), icon: Calculator, color: "text-blue-400", trend: "+4", up: true },
    { label: "חישובים מאושרים", value: approved.toString(), icon: CheckCircle2, color: "text-green-400", trend: "+3", up: true },
    { label: "ממתינים לבדיקה", value: pending.toString(), icon: Clock, color: "text-amber-400", trend: "+2", up: false },
    { label: "פרויקטי עומס רוח", value: windCount.toString(), icon: Wind, color: "text-cyan-400", trend: "+1", up: true },
    { label: "פרויקטי תרמיקה", value: thermalCount.toString(), icon: Thermometer, color: "text-orange-400", trend: "0", up: true },
    { label: "פרויקטי מבנה", value: structCount.toString(), icon: Columns, color: "text-purple-400", trend: "+1", up: true },
  ];

  const terrainFactors: Record<string, number> = { I: 1.30, II: 1.15, III: 1.00, IV: 0.85 };
  const zoneQb = windZones.find(z => z.zone === windZone)?.qb ?? 0.55;
  const h = parseFloat(windHeight) || 10;
  const Ce = Math.min(2.5, 0.8 + 0.12 * Math.sqrt(h));
  const Ct = terrainFactors[windTerrain] ?? 1.0;
  const Cexp = parseFloat(windExposure) || 1.0;
  const windPressure = (zoneQb * Ce * Ct * Cexp).toFixed(2);
  const recommendedProfile = parseFloat(windPressure) > 2.0 ? "100x250" : parseFloat(windPressure) > 1.5 ? "80x200" : parseFloat(windPressure) > 1.0 ? "60x150" : "45x90";
  const filtered = calculations.filter(c => !search || c.id.includes(search) || c.project.includes(search) || c.type.includes(search) || c.engineer.includes(search));

  return (
    <div className="p-6 space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Calculator className="h-6 w-6 text-blue-400" />חישובים הנדסיים
          </h1>
          <p className="text-sm text-muted-foreground mt-1">טכנו-כל עוזי -- Structural Calculations for Windows, Doors & Curtain Walls</p>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map((k, i) => (
          <Card key={i} className="bg-card/80 border-border hover:border-border transition-colors">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[11px] text-muted-foreground">{k.label}</p>
                  <p className={`text-lg font-bold font-mono mt-1 ${k.color}`}>{k.value}</p>
                  <div className="flex items-center gap-1 mt-1">
                    {k.up ? <TrendingUp className="h-3 w-3 text-green-400" /> : <TrendingDown className="h-3 w-3 text-red-400" />}
                    <span className={`text-[10px] ${k.up ? "text-green-400" : "text-red-400"}`}>{k.trend}</span>
                  </div>
                </div>
                <k.icon className={`h-5 w-5 ${k.color} opacity-60`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Approval progress ── */}
      <Card className="bg-card/60 border-border">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">חישובים מאושרים -- יעד 95%</span>
            <span className="text-sm font-mono text-green-400">{Math.round((approved / calculations.length) * 100)}%</span>
          </div>
          <Progress value={(approved / calculations.length) * 100} className="h-2" />
        </CardContent>
      </Card>

      {/* ── Tabs ── */}
      <Tabs value={tab} onValueChange={setTab} dir="rtl">
        <TabsList className="bg-card/60 border border-border w-full justify-start gap-1 p-1 h-auto flex-wrap">
          <TabsTrigger value="list" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white gap-1.5 text-xs"><FileCheck className="h-3.5 w-3.5" />רשימת חישובים</TabsTrigger>
          <TabsTrigger value="wind" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white gap-1.5 text-xs"><Wind className="h-3.5 w-3.5" />מחשבון עומס רוח</TabsTrigger>
          <TabsTrigger value="thermal" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white gap-1.5 text-xs"><Thermometer className="h-3.5 w-3.5" />ניתוח תרמי</TabsTrigger>
          <TabsTrigger value="structural" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white gap-1.5 text-xs"><Columns className="h-3.5 w-3.5" />בדיקות מבניות</TabsTrigger>
        </TabsList>

        {/* ── Tab 1: Calculations List ── */}
        <TabsContent value="list">
          <Card className="bg-card/80 border-border">
            <CardContent className="p-4 pb-0">
              <div className="flex items-center gap-2 mb-4">
                <Search className="h-4 w-4 text-muted-foreground" />
                <Input placeholder="חיפוש לפי מזהה, פרויקט, סוג או מהנדס..." value={search} onChange={e => setSearch(e.target.value)} className="max-w-sm bg-background/50" />
              </div>
            </CardContent>
            <CardContent className="p-0"><div className="overflow-x-auto">
              <table className="w-full text-sm"><thead><tr className="border-b border-border bg-background/50">
                <th className={th}>מזהה</th><th className={th}>פרויקט</th><th className={th}>סוג חישוב</th>
                <th className={th}>תיאור</th><th className={th}>תוצאה</th><th className={th}>סטטוס</th><th className={th}>מהנדס</th>
              </tr></thead><tbody>
                {filtered.map((c, i) => (
                  <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                    <td className={`${td} font-mono text-blue-400 font-bold`}>{c.id}</td>
                    <td className={`${td} text-foreground font-medium`}>{c.project}</td>
                    <td className={td}><Badge className={`${typeColor(c.type)} border-0 text-xs`}>{c.type}</Badge></td>
                    <td className={`${td} text-muted-foreground text-xs max-w-[240px]`}>{c.desc}</td>
                    <td className={`${td} font-mono text-emerald-400 font-bold text-xs`}>{c.result}</td>
                    <td className={td}><Badge className={`${calcStatusColor(c.status)} border-0 text-xs`}>{calcStatusLabel(c.status)}</Badge></td>
                    <td className={`${td} text-muted-foreground`}>{c.engineer}</td>
                  </tr>
                ))}
              </tbody></table>
            </div></CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 2: Wind Load Calculator ── */}
        <TabsContent value="wind">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Input */}
            <Card className="bg-card/80 border-border">
              <CardContent className="p-5 space-y-4">
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2"><Wind className="h-4 w-4 text-cyan-400" />פרמטרים לחישוב עומס רוח (ת\"י 414)</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">גובה מעל פני הקרקע (m)</label>
                    <Input type="number" value={windHeight} onChange={e => setWindHeight(e.target.value)} className="bg-background/50 font-mono" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">אזור רוח</label>
                    <div className="flex gap-2">
                      {windZones.map(z => (
                        <Button key={z.zone} size="sm" variant={windZone === z.zone ? "default" : "outline"}
                          onClick={() => setWindZone(z.zone)} className={windZone === z.zone ? "bg-cyan-600 text-white" : ""}>
                          {z.zone}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">מקדם חשיפה</label>
                    <Input type="number" step="0.1" value={windExposure} onChange={e => setWindExposure(e.target.value)} className="bg-background/50 font-mono" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">קטגוריית שטח</label>
                    <div className="flex gap-2">
                      {["I", "II", "III", "IV"].map(t => (
                        <Button key={t} size="sm" variant={windTerrain === t ? "default" : "outline"}
                          onClick={() => setWindTerrain(t)} className={windTerrain === t ? "bg-cyan-600 text-white" : ""}>
                          {t}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="mt-2 text-xs text-muted-foreground space-y-1 bg-background/30 p-3 rounded">
                  <p>qb (לחץ בסיס) = {zoneQb} kPa | Ce (מקדם גובה) = {Ce.toFixed(3)}</p>
                  <p>Ct (מקדם שטח) = {Ct} | Cexp (מקדם חשיפה) = {Cexp}</p>
                  <p className="text-xs opacity-60">נוסחה: We = qb x Ce x Ct x Cexp</p>
                </div>
              </CardContent>
            </Card>

            {/* Output */}
            <Card className="bg-card/80 border-border">
              <CardContent className="p-5 space-y-4">
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2"><Shield className="h-4 w-4 text-green-400" />תוצאות חישוב</h3>
                <div className="grid grid-cols-2 gap-4">
                  <Card className="bg-cyan-500/10 border-cyan-500/30">
                    <CardContent className="p-4 text-center">
                      <p className="text-xs text-muted-foreground">לחץ רוח נדרש</p>
                      <p className="text-3xl font-bold font-mono text-cyan-400 mt-1">{windPressure}</p>
                      <p className="text-xs text-cyan-400/70">kPa</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-green-500/10 border-green-500/30">
                    <CardContent className="p-4 text-center">
                      <p className="text-xs text-muted-foreground">פרופיל מומלץ</p>
                      <p className="text-2xl font-bold font-mono text-green-400 mt-1">{recommendedProfile}</p>
                      <p className="text-xs text-green-400/70">אלומיניום</p>
                    </CardContent>
                  </Card>
                </div>
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-muted-foreground">טבלת ייחוס אזורי רוח -- ת"י 414</h4>
                  <table className="w-full text-xs"><thead><tr className="border-b border-border">
                    <th className="p-2 text-right text-muted-foreground">אזור</th>
                    <th className="p-2 text-right text-muted-foreground">תיאור</th>
                    <th className="p-2 text-right text-muted-foreground">qb (kPa)</th>
                  </tr></thead><tbody>
                    {windZones.map(z => (
                      <tr key={z.zone} className={`border-b border-border/50 ${z.zone === windZone ? "bg-cyan-500/10" : ""}`}>
                        <td className="p-2 font-mono font-bold text-cyan-400">{z.zone}</td>
                        <td className="p-2 text-muted-foreground">{z.label}</td>
                        <td className="p-2 font-mono">{z.qb}</td>
                      </tr>
                    ))}
                  </tbody></table>
                </div>
                <div className="text-xs text-muted-foreground bg-background/30 p-3 rounded space-y-1">
                  <p>קטגוריות שטח: I=פתוח (חוף) | II=פרבר | III=עירוני | IV=מרכז עיר</p>
                  <p>גובה {h}m, אזור {windZone}, שטח {windTerrain} = <span className="text-cyan-400 font-bold">{windPressure} kPa</span></p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Tab 3: Thermal Analysis ── */}
        <TabsContent value="thermal">
          <Card className="bg-card/80 border-border">
            <CardContent className="p-5">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2 mb-2">
                <Thermometer className="h-4 w-4 text-orange-400" />חישוב מוליכות תרמית Uw לפי EN 10077
              </h3>
              <p className="text-xs text-muted-foreground mb-4">נוסחה: Uw = (Af x Uf + Ag x Ug + lg x Ψg) / (Af + Ag) | Af=שטח מסגרת, Ag=שטח זיגוג, Uf=מוליכות מסגרת, Ug=מוליכות זיגוג, Ψg=גשר תרמי</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm"><thead><tr className="border-b border-border bg-background/50">
                  <th className={th}>תצורת חלון</th>
                  <th className={th}>Uf (W/m²K)</th>
                  <th className={th}>Ug (W/m²K)</th>
                  <th className={th}>Ψg (W/mK)</th>
                  <th className={th}>Af/At</th>
                  <th className={th}>Ag/At</th>
                  <th className={th}>Uw (W/m²K)</th>
                  <th className={th}>תקן ישראלי</th>
                </tr></thead><tbody>
                  {thermalConfigs.map((c) => {
                    const uwNum = parseFloat(c.uw);
                    const passIsrael = uwNum <= 2.1;
                    return (
                      <tr key={c.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                        <td className={`${td} text-foreground font-medium text-xs`}>{c.name}</td>
                        <td className={`${td} font-mono text-center`}>{c.uf}</td>
                        <td className={`${td} font-mono text-center`}>{c.ug}</td>
                        <td className={`${td} font-mono text-center`}>{c.psi}</td>
                        <td className={`${td} font-mono text-center text-muted-foreground`}>{(c.af * 100).toFixed(0)}%</td>
                        <td className={`${td} font-mono text-center text-muted-foreground`}>{(c.ag * 100).toFixed(0)}%</td>
                        <td className={`${td} font-mono text-center font-bold ${uwNum <= 1.5 ? "text-green-400" : uwNum <= 2.1 ? "text-amber-400" : "text-red-400"}`}>{c.uw}</td>
                        <td className={td}>
                          <Badge className={`${passIsrael ? "bg-green-500/20 text-green-300" : "bg-red-500/20 text-red-300"} border-0 text-xs`}>
                            {passIsrael ? "עובר" : "לא עובר"}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody></table>
              </div>
              <div className="grid grid-cols-3 gap-3 mt-4">
                <Card className="bg-green-500/10 border-green-500/30"><CardContent className="p-3 text-center">
                  <Waves className="h-4 w-4 text-green-400 mx-auto mb-1" />
                  <p className="text-lg font-bold font-mono text-green-400">Uw &le; 1.5</p>
                  <p className="text-[10px] text-green-400/60">ביצועים מעולים / בנייה ירוקה</p>
                </CardContent></Card>
                <Card className="bg-amber-500/10 border-amber-500/30"><CardContent className="p-3 text-center">
                  <Thermometer className="h-4 w-4 text-amber-400 mx-auto mb-1" />
                  <p className="text-lg font-bold font-mono text-amber-400">Uw &le; 2.1</p>
                  <p className="text-[10px] text-amber-400/60">עומד בתקן ת"י 1045</p>
                </CardContent></Card>
                <Card className="bg-red-500/10 border-red-500/30"><CardContent className="p-3 text-center">
                  <AlertTriangle className="h-4 w-4 text-red-400 mx-auto mb-1" />
                  <p className="text-lg font-bold font-mono text-red-400">Uw &gt; 2.1</p>
                  <p className="text-[10px] text-red-400/60">נדרש שדרוג זיגוג/מסגרת</p>
                </CardContent></Card>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 4: Structural Checks ── */}
        <TabsContent value="structural">
          <Card className="bg-card/80 border-border">
            <CardContent className="p-5">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2 mb-2">
                <Columns className="h-4 w-4 text-purple-400" />בדיקות שקיעה ומאמצים -- פרופילי אלומיניום
              </h3>
              <p className="text-xs text-muted-foreground mb-4">קריטריון שקיעה: L/200 (חלונות ודלתות) | מאמץ מותר: σ &le; 160 MPa (סגסוגת 6063-T5)</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm"><thead><tr className="border-b border-border bg-background/50">
                  <th className={th}>פרופיל</th>
                  <th className={th}>Ix (cm4)</th>
                  <th className={th}>Wx (cm3)</th>
                  <th className={th}>מפתח (m)</th>
                  <th className={th}>עומס (kPa)</th>
                  <th className={th}>שקיעה מותרת</th>
                  <th className={th}>שקיעה בפועל</th>
                  <th className={th}>ניצולת שקיעה</th>
                  <th className={th}>מאמץ (MPa)</th>
                  <th className={th}>ניצולת מאמץ</th>
                  <th className={th}>תוצאה</th>
                </tr></thead><tbody>
                  {structProfiles.map((p, i) => {
                    const deflUtil = ((p.deflActual / p.deflMax) * 100).toFixed(0);
                    const stressUtil = ((p.stress / p.stressAllow) * 100).toFixed(0);
                    return (
                      <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                        <td className={`${td} font-mono text-purple-400 font-bold`}>{p.name}</td>
                        <td className={`${td} font-mono text-center`}>{p.ix}</td>
                        <td className={`${td} font-mono text-center`}>{p.wx}</td>
                        <td className={`${td} font-mono text-center`}>{p.span}</td>
                        <td className={`${td} font-mono text-center`}>{p.load}</td>
                        <td className={`${td} font-mono text-center text-muted-foreground`}>{p.deflMax.toFixed(1)} mm</td>
                        <td className={`${td} font-mono text-center font-bold ${p.deflActual <= p.deflMax ? "text-green-400" : "text-red-400"}`}>{p.deflActual.toFixed(1)} mm</td>
                        <td className={td}>
                          <div className="flex items-center gap-2">
                            <Progress value={Math.min(parseFloat(deflUtil), 100)} className="h-1.5 flex-1" />
                            <span className={`text-xs font-mono ${parseFloat(deflUtil) <= 100 ? "text-green-400" : "text-red-400"}`}>{deflUtil}%</span>
                          </div>
                        </td>
                        <td className={`${td} font-mono text-center font-bold ${p.stress <= p.stressAllow ? "text-green-400" : "text-red-400"}`}>{p.stress}</td>
                        <td className={td}>
                          <div className="flex items-center gap-2">
                            <Progress value={Math.min(parseFloat(stressUtil), 100)} className="h-1.5 flex-1" />
                            <span className={`text-xs font-mono ${parseFloat(stressUtil) <= 100 ? "text-green-400" : "text-red-400"}`}>{stressUtil}%</span>
                          </div>
                        </td>
                        <td className={td}>
                          <Badge className={`${p.pass ? "bg-green-500/20 text-green-300" : "bg-red-500/20 text-red-300"} border-0 text-xs`}>
                            {p.pass ? "עובר" : "נכשל"}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody></table>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-4">
                <Card className="bg-purple-500/10 border-purple-500/30"><CardContent className="p-3">
                  <h4 className="text-xs font-bold text-purple-400 mb-2 flex items-center gap-1"><Droplets className="h-3 w-3" /> נוסחת שקיעה</h4>
                  <p className="text-xs text-muted-foreground font-mono">δ = (5 x q x L⁴) / (384 x E x I) | δmax = L/200 | E = 70,000 MPa</p>
                </CardContent></Card>
                <Card className="bg-purple-500/10 border-purple-500/30"><CardContent className="p-3">
                  <h4 className="text-xs font-bold text-purple-400 mb-2 flex items-center gap-1"><Shield className="h-3 w-3" /> בדיקת מאמצים</h4>
                  <p className="text-xs text-muted-foreground font-mono">σ = M / Wx | M = (q x L²) / 8 | σallow = 160 MPa (6063-T5)</p>
                </CardContent></Card>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}