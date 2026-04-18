import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Palette, Search, Droplets, Sun, TreePine, Sparkles, Star,
  Shield, CheckCircle2, AlertTriangle, Eye, Copy, Filter,
  Download, Plus, Layers, Award, Paintbrush, Pipette, Zap
} from "lucide-react";

const FALLBACK_COLORCATALOG = [
  { code: "RAL 9010", name: "לבן טהור", type: "RAL", texture: "מאט", hex: "#F1ECE1", stock: "במלאי", premium: 0, popularity: 98 },
  { code: "RAL 7016", name: "אנטרציט", type: "RAL", texture: "מאט", hex: "#383E42", stock: "במלאי", premium: 0, popularity: 95 },
  { code: "RAL 8017", name: "חום שוקולד", type: "RAL", texture: "סאטן", hex: "#44322D", stock: "במלאי", premium: 5, popularity: 82 },
  { code: "RAL 9005", name: "שחור עמוק", type: "RAL", texture: "גלוס", hex: "#0A0A0D", stock: "במלאי", premium: 0, popularity: 91 },
  { code: "RAL 1015", name: "שנהב בהיר", type: "RAL", texture: "מאט", hex: "#E6D2B5", stock: "במלאי", premium: 0, popularity: 76 },
  { code: "RAL 7035", name: "אפור בהיר", type: "RAL", texture: "סאטן", hex: "#CBD0CC", stock: "במלאי", premium: 0, popularity: 88 },
  { code: "RAL 3000", name: "אדום אש", type: "RAL", texture: "גלוס", hex: "#A72920", stock: "הזמנה מיוחדת", premium: 12, popularity: 45 },
  { code: "RAL 5010", name: "כחול גנטיאן", type: "RAL", texture: "מאט", hex: "#004F7C", stock: "במלאי", premium: 8, popularity: 52 },
  { code: "RAL 6005", name: "ירוק אשוח", type: "RAL", texture: "סאטן", hex: "#0F4336", stock: "במלאי", premium: 8, popularity: 61 },
  { code: "ANO-NAT", name: "אנודייז טבעי", type: "אנודייז", texture: "סאטן", hex: "#C0C0C0", stock: "במלאי", premium: 15, popularity: 89 },
  { code: "ANO-BRZ", name: "אנודייז ברונזה", type: "אנודייז", texture: "סאטן", hex: "#8B6914", stock: "במלאי", premium: 18, popularity: 84 },
  { code: "ANO-BLK", name: "אנודייז שחור", type: "אנודייז", texture: "מאט", hex: "#1C1C1C", stock: "במלאי", premium: 20, popularity: 86 },
  { code: "ANO-CHP", name: "אנודייז שמפניה", type: "אנודייז", texture: "סאטן", hex: "#D4AF37", stock: "במלאי", premium: 18, popularity: 78 },
  { code: "ANO-GLD", name: "אנודייז זהב", type: "אנודייז", texture: "גלוס", hex: "#FFD700", stock: "הזמנה מיוחדת", premium: 25, popularity: 55 },
  { code: "WD-OAK", name: "אלון אירופאי", type: "אפקט עץ", texture: "מאט", hex: "#B8860B", stock: "במלאי", premium: 30, popularity: 92 },
  { code: "WD-WLN", name: "אגוז אמריקאי", type: "אפקט עץ", texture: "מאט", hex: "#5C4033", stock: "במלאי", premium: 30, popularity: 87 },
  { code: "WD-MHG", name: "מהגוני", type: "אפקט עץ", texture: "סאטן", hex: "#C04000", stock: "במלאי", premium: 32, popularity: 68 },
  { code: "WD-TEK", name: "טיק", type: "אפקט עץ", texture: "מאט", hex: "#9E7C0C", stock: "הזמנה מיוחדת", premium: 35, popularity: 58 },
  { code: "WD-CHR", name: "דובדבן", type: "אפקט עץ", texture: "סאטן", hex: "#DE3163", stock: "הזמנה מיוחדת", premium: 32, popularity: 49 },
  { code: "CUS-001", name: "צבע מותאם אישית", type: "מותאם", texture: "לבחירה", hex: "#999999", stock: "הזמנה מיוחדת", premium: 45, popularity: 30 },
];

const FALLBACK_FINISHTYPES = [
  { name: "צביעה אלקטרוסטטית", nameEn: "Powder Coating", description: "ציפוי אבקה יבש המוקשה בתנור בטמפרטורה גבוהה", thickness: "60-120 מיקרון", durability: 95, curing: "200°C / 15 דקות", colors: "RAL מלא + מותאם", applications: "חלונות, דלתות, חזיתות", warranty: "25 שנה", marketShare: 62 },
  { name: "אנודייז", nameEn: "Anodizing", description: "תהליך אלקטרוכימי המייצר שכבת תחמוצת מגנה", thickness: "15-25 מיקרון", durability: 98, curing: "אלקטרוליזה בחומצה", colors: "טבעי, ברונזה, שחור, שמפניה, זהב", applications: "חזיתות, ויטרינות, מעקות", warranty: "30 שנה", marketShare: 22 },
  { name: "צבע רטוב", nameEn: "Wet Paint", description: "ציפוי נוזלי בריסוס עם שכבות מרובות", thickness: "40-80 מיקרון", durability: 82, curing: "60°C / 30 דקות", colors: "ללא הגבלה", applications: "תיקונים, פרויקטים מיוחדים", warranty: "15 שנה", marketShare: 8 },
  { name: "סובלימציה", nameEn: "Sublimation", description: "הדפסת דוגמת עץ/אבן בטכנולוגיית העברה תרמית", thickness: "ציפוי בסיס + הדפסה", durability: 90, curing: "180°C / 8 דקות ואקום", colors: "אלון, אגוז, מהגוני, טיק, דובדבן", applications: "חלונות, דלתות, פרגולות", warranty: "20 שנה", marketShare: 6 },
  { name: "אלקטרופורזיס", nameEn: "Electrophoresis", description: "ציפוי בסיסי בשיטה אלקטרוכימית לפני צביעה", thickness: "20-30 מיקרון", durability: 88, curing: "טבילה אלקטרוכימית", colors: "בסיס שקוף/שחור", applications: "שכבת בסיס לצביעה כפולה", warranty: "35 שנה (משולב)", marketShare: 2 },
];

const FALLBACK_QUALITYSTANDARDS = [
  { name: "Qualicoat", logo: "QC", level: "Seaside Class 3", description: "תקן בינלאומי לציפויי אבקה על אלומיניום", requirements: ["עמידות UV: 3000+ שעות", "עמידות לחות: 1000+ שעות", "אדהזיה: GT0-GT1", "עמידות מורפלין: ללא חדירה", "מראה: Delta E < 1.5"], status: "מאושר", lastAudit: "2025-11-15", nextAudit: "2026-11-15", compliance: 100 },
  { name: "Qualanod", logo: "QA", level: "Class 20", description: "תקן בינלאומי לאנודייז על אלומיניום", requirements: ["עובי שכבה: 20+ מיקרון", "בדיקת Sealing: < 20 mg/dm2", "עמידות חומצה: תקין", "עמידות אור: Level 8", "קשיות: > 300 HV"], status: "מאושר", lastAudit: "2025-09-20", nextAudit: "2026-09-20", compliance: 100 },
  { name: "GSB International", logo: "GSB", level: "Master Premium", description: "תקן גרמני לציפויים על מתכות", requirements: ["עמידות מזג אוויר: Florida Test 3 שנים", "עמידות UV: Delta E < 1.0", "אדהזיה: חיתוך צלב 100%", "גמישות: כיפוף 5 מ\"מ ללא סדק", "עמידות כימית: חומצה + בסיס"], status: "מאושר", lastAudit: "2026-01-10", nextAudit: "2027-01-10", compliance: 98 },
  { name: "ISO 12944", logo: "ISO", level: "C5-M (ימי)", description: "תקן הגנה מפני קורוזיה לסביבה ימית", requirements: ["עמידות ערפל מלח: 1500+ שעות", "שכבת ציפוי מינימלית: 80 מיקרון", "הכנת משטח: SA 2.5", "בדיקת Pull-off: > 5 MPa", "תיעוד תהליך מלא"], status: "בהתאמה", lastAudit: "2026-02-28", nextAudit: "2026-08-28", compliance: 87 },
];

const FALLBACK_MATCHINGPROJECTS = [
  { project: "מגדלי הים התיכון", colors: ["RAL 7016", "ANO-NAT", "RAL 9010"], units: 450, status: "בייצור" },
  { project: "קניון רמת אביב", colors: ["ANO-BRZ", "WD-OAK", "RAL 9005"], units: 280, status: "מאושר" },
  { project: "בנייני משרדים הרצליה", colors: ["RAL 7035", "ANO-BLK", "RAL 9010"], units: 620, status: "בייצור" },
  { project: "מלון רויאל אילת", colors: ["ANO-GLD", "WD-MHG", "RAL 1015"], units: 340, status: "תכנון" },
  { project: "שכונת הפארק ירושלים", colors: ["RAL 8017", "WD-WLN", "RAL 9010"], units: 890, status: "בייצור" },
  { project: "מרכז רפואי שיבא", colors: ["RAL 7016", "RAL 9010", "ANO-NAT"], units: 510, status: "מאושר" },
];

const stockBadge = (s: string) => s === "במלאי"
  ? "bg-green-500/20 text-green-300" : "bg-amber-500/20 text-amber-300";
const statusBadge = (s: string) =>
  s === "מאושר" ? "bg-green-500/20 text-green-300"
  : s === "בהתאמה" ? "bg-amber-500/20 text-amber-300"
  : "bg-blue-500/20 text-blue-300";
const projectStatus = (s: string) =>
  s === "בייצור" ? "bg-blue-500/20 text-blue-300"
  : s === "מאושר" ? "bg-green-500/20 text-green-300"
  : "bg-purple-500/20 text-purple-300";

export default function FabFinishesColors() {
  const { data: apifinishTypes } = useQuery({
    queryKey: ["/api/fabrication/fab-finishes-colors/finishtypes"],
    queryFn: () => authFetch("/api/fabrication/fab-finishes-colors/finishtypes").then(r => r.json()).catch(() => null),
  });
  const finishTypes = Array.isArray(apifinishTypes) ? apifinishTypes : (apifinishTypes?.data ?? apifinishTypes?.items ?? FALLBACK_FINISHTYPES);


  const { data: apiqualityStandards } = useQuery({
    queryKey: ["/api/fabrication/fab-finishes-colors/qualitystandards"],
    queryFn: () => authFetch("/api/fabrication/fab-finishes-colors/qualitystandards").then(r => r.json()).catch(() => null),
  });
  const qualityStandards = Array.isArray(apiqualityStandards) ? apiqualityStandards : (apiqualityStandards?.data ?? apiqualityStandards?.items ?? FALLBACK_QUALITYSTANDARDS);


  const { data: apimatchingProjects } = useQuery({
    queryKey: ["/api/fabrication/fab-finishes-colors/matchingprojects"],
    queryFn: () => authFetch("/api/fabrication/fab-finishes-colors/matchingprojects").then(r => r.json()).catch(() => null),
  });
  const matchingProjects = Array.isArray(apimatchingProjects) ? apimatchingProjects : (apimatchingProjects?.data ?? apimatchingProjects?.items ?? FALLBACK_MATCHINGPROJECTS);

  const { data: apicolorCatalog } = useQuery({
    queryKey: ["/api/fabrication/fab-finishes-colors/colorcatalog"],
    queryFn: () => authFetch("/api/fabrication/fab-finishes-colors/colorcatalog").then(r => r.json()).catch(() => null),
  });
  const colorCatalog = Array.isArray(apicolorCatalog) ? apicolorCatalog : (apicolorCatalog?.data ?? apicolorCatalog?.items ?? FALLBACK_COLORCATALOG);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [matchSearch, setMatchSearch] = useState("");

  const totalFinishes = colorCatalog.length;
  const ralColors = colorCatalog.filter(c => c.type === "RAL").length;
  const anodizeColors = colorCatalog.filter(c => c.type === "אנודייז").length;
  const woodColors = colorCatalog.filter(c => c.type === "אפקט עץ").length;
  const customColors = colorCatalog.filter(c => c.type === "מותאם").length;
  const popularFinish = colorCatalog.reduce((a, b) => a.popularity > b.popularity ? a : b);

  const kpis = [
    { label: "סה\"כ גמרים", value: totalFinishes, icon: Palette, color: "text-blue-400" },
    { label: "צבעי RAL", value: ralColors, icon: Droplets, color: "text-cyan-400" },
    { label: "גוני אנודייז", value: anodizeColors, icon: Sun, color: "text-amber-400" },
    { label: "אפקט עץ", value: woodColors, icon: TreePine, color: "text-green-400" },
    { label: "צבעים מותאמים", value: customColors, icon: Sparkles, color: "text-purple-400" },
    { label: "הפופולרי ביותר", value: popularFinish.name, icon: Star, color: "text-yellow-400", sub: popularFinish.code },
  ];

  const filteredColors = useMemo(() => {
    return colorCatalog.filter(c => {
      if (typeFilter !== "all" && c.type !== typeFilter) return false;
      if (search && !(c.code + c.name + c.type).includes(search)) return false;
      return true;
    });
  }, [search, typeFilter]);

  const matchedProjects = useMemo(() => {
    if (!matchSearch) return matchingProjects;
    return matchingProjects.filter(p =>
      p.project.includes(matchSearch) || p.colors.some(c => c.includes(matchSearch))
    );
  }, [matchSearch]);

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">גמרים וצבעים</h1>
          <p className="text-sm text-muted-foreground mt-1">ניהול קטלוג גמרי משטח, צבעים ותקני איכות</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm"><Download className="w-4 h-4 ml-1" />יצוא קטלוג</Button>
          <Button size="sm" className="bg-primary"><Plus className="w-4 h-4 ml-1" />צבע חדש</Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpis.map(k => (
          <Card key={k.label} className="bg-card/50 border-border/50">
            <CardContent className="p-4 text-center">
              <k.icon className={`w-5 h-5 mx-auto mb-2 ${k.color}`} />
              <div className="text-xl font-bold text-foreground">{k.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{k.label}</div>
              {k.sub && <div className="text-[10px] text-muted-foreground/70 mt-0.5">{k.sub}</div>}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="catalog" className="space-y-4">
        <TabsList className="bg-card/50 border border-border/50">
          <TabsTrigger value="catalog"><Palette className="w-4 h-4 ml-1" />קטלוג צבעים</TabsTrigger>
          <TabsTrigger value="finishes"><Layers className="w-4 h-4 ml-1" />סוגי גמר</TabsTrigger>
          <TabsTrigger value="quality"><Shield className="w-4 h-4 ml-1" />תקני איכות</TabsTrigger>
          <TabsTrigger value="matching"><Pipette className="w-4 h-4 ml-1" />התאמת צבעים</TabsTrigger>
        </TabsList>

        {/* Tab 1 - Color Catalog */}
        <TabsContent value="catalog" className="space-y-4">
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="חיפוש לפי קוד, שם או סוג..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9 bg-background/50" />
                </div>
                <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground">
                  <option value="all">כל הסוגים</option>
                  <option value="RAL">RAL</option>
                  <option value="אנודייז">אנודייז</option>
                  <option value="אפקט עץ">אפקט עץ</option>
                  <option value="מותאם">מותאם אישית</option>
                </select>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-right p-3 text-muted-foreground font-medium">צבע</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">קוד</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">שם</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">סוג</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">טקסטורה</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">מלאי</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">פרמיה %</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">פופולריות</th>
                      <th className="text-center p-3 text-muted-foreground font-medium w-20">פעולות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredColors.map(c => (
                      <tr key={c.code} className="border-b border-border/30 hover:bg-card/30">
                        <td className="p-3">
                          <div className="w-8 h-8 rounded border border-border/50" style={{ backgroundColor: c.hex }} />
                        </td>
                        <td className="p-3 text-foreground font-mono text-xs">{c.code}</td>
                        <td className="p-3 text-foreground font-medium">{c.name}</td>
                        <td className="p-3"><Badge variant="outline" className="text-xs">{c.type}</Badge></td>
                        <td className="p-3 text-muted-foreground">{c.texture}</td>
                        <td className="p-3"><Badge className={stockBadge(c.stock) + " text-xs"}>{c.stock}</Badge></td>
                        <td className="p-3 text-foreground">{c.premium > 0 ? `+${c.premium}%` : "-"}</td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <Progress value={c.popularity} className="h-1.5 flex-1" />
                            <span className="text-xs text-muted-foreground w-8">{c.popularity}%</span>
                          </div>
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button variant="ghost" size="sm"><Eye className="w-3.5 h-3.5" /></Button>
                            <Button variant="ghost" size="sm"><Copy className="w-3.5 h-3.5" /></Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="text-xs text-muted-foreground mt-3 pt-3 border-t border-border/30">
                מציג {filteredColors.length} מתוך {colorCatalog.length} צבעים
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2 - Finish Types */}
        <TabsContent value="finishes" className="space-y-4">
          {finishTypes.map(f => (
            <Card key={f.name} className="bg-card/50 border-border/50">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Paintbrush className="w-5 h-5 text-blue-400" />
                    <div>
                      <CardTitle className="text-base">{f.name}</CardTitle>
                      <span className="text-xs text-muted-foreground">{f.nameEn}</span>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-xs">נתח שוק: {f.marketShare}%</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">{f.description}</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <div className="bg-background/30 rounded-lg p-3">
                    <div className="text-xs text-muted-foreground">עובי ציפוי</div>
                    <div className="text-sm font-medium text-foreground mt-1">{f.thickness}</div>
                  </div>
                  <div className="bg-background/30 rounded-lg p-3">
                    <div className="text-xs text-muted-foreground">הקשיה</div>
                    <div className="text-sm font-medium text-foreground mt-1">{f.curing}</div>
                  </div>
                  <div className="bg-background/30 rounded-lg p-3">
                    <div className="text-xs text-muted-foreground">מגוון צבעים</div>
                    <div className="text-sm font-medium text-foreground mt-1">{f.colors}</div>
                  </div>
                  <div className="bg-background/30 rounded-lg p-3">
                    <div className="text-xs text-muted-foreground">אחריות</div>
                    <div className="text-sm font-medium text-foreground mt-1">{f.warranty}</div>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 flex-1">
                    <span className="text-xs text-muted-foreground">עמידות:</span>
                    <Progress value={f.durability} className="h-2 flex-1 max-w-[200px]" />
                    <span className="text-xs font-medium text-foreground">{f.durability}%</span>
                  </div>
                  <div className="text-xs text-muted-foreground">שימושים: {f.applications}</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* Tab 3 - Quality Standards */}
        <TabsContent value="quality" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {qualityStandards.map(q => (
              <Card key={q.name} className="bg-card/50 border-border/50">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                        <span className="text-xs font-bold text-blue-300">{q.logo}</span>
                      </div>
                      <div>
                        <CardTitle className="text-base">{q.name}</CardTitle>
                        <span className="text-xs text-muted-foreground">{q.level}</span>
                      </div>
                    </div>
                    <Badge className={statusBadge(q.status) + " text-xs"}>{q.status}</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-3">{q.description}</p>
                  <div className="space-y-1.5 mb-4">
                    {q.requirements.map((r, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" />
                        <span className="text-foreground">{r}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between pt-3 border-t border-border/30">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">עמידה בתקן:</span>
                      <Progress value={q.compliance} className="h-2 w-24" />
                      <span className="text-xs font-medium text-foreground">{q.compliance}%</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      ביקורת הבאה: {q.nextAudit}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Award className="w-5 h-5 text-amber-400" />
                סיכום הסמכות
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-background/30 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-green-400">{qualityStandards.filter(q => q.status === "מאושר").length}</div>
                  <div className="text-xs text-muted-foreground mt-1">תקנים מאושרים</div>
                </div>
                <div className="bg-background/30 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-amber-400">{qualityStandards.filter(q => q.status === "בהתאמה").length}</div>
                  <div className="text-xs text-muted-foreground mt-1">בתהליך התאמה</div>
                </div>
                <div className="bg-background/30 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-blue-400">{Math.round(qualityStandards.reduce((s, q) => s + q.compliance, 0) / qualityStandards.length)}%</div>
                  <div className="text-xs text-muted-foreground mt-1">עמידה ממוצעת</div>
                </div>
                <div className="bg-background/30 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-foreground">{qualityStandards.length}</div>
                  <div className="text-xs text-muted-foreground mt-1">סה"כ תקנים</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 4 - Color Matching */}
        <TabsContent value="matching" className="space-y-4">
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Pipette className="w-5 h-5 text-purple-400" />
                  התאמת צבעים לפרויקטים
                </CardTitle>
                <div className="relative w-64">
                  <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="חיפוש פרויקט או צבע..." value={matchSearch} onChange={e => setMatchSearch(e.target.value)} className="pr-9 bg-background/50" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {matchedProjects.map(p => (
                  <div key={p.project} className="bg-background/30 rounded-lg p-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex-1 min-w-[180px]">
                      <div className="font-medium text-foreground">{p.project}</div>
                      <div className="text-xs text-muted-foreground mt-1">{p.units} יחידות</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {p.colors.map(code => {
                        const color = colorCatalog.find(c => c.code === code);
                        return (
                          <div key={code} className="flex items-center gap-1.5 bg-card/50 rounded px-2 py-1 border border-border/30">
                            <div className="w-4 h-4 rounded-sm border border-border/50" style={{ backgroundColor: color?.hex || "#999" }} />
                            <span className="text-xs text-foreground">{code}</span>
                          </div>
                        );
                      })}
                    </div>
                    <Badge className={projectStatus(p.status) + " text-xs"}>{p.status}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="w-5 h-5 text-amber-400" />
                שילובי צבעים פופולריים
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  { name: "קלאסי מודרני", combo: ["RAL 7016", "RAL 9010", "ANO-NAT"], uses: 42 },
                  { name: "חם טבעי", combo: ["WD-OAK", "RAL 1015", "ANO-BRZ"], uses: 31 },
                  { name: "אלגנטי כהה", combo: ["RAL 9005", "ANO-BLK", "RAL 7035"], uses: 28 },
                ].map(s => (
                  <div key={s.name} className="bg-background/30 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-medium text-foreground">{s.name}</span>
                      <span className="text-xs text-muted-foreground">{s.uses} פרויקטים</span>
                    </div>
                    <div className="flex gap-2">
                      {s.combo.map(code => {
                        const color = colorCatalog.find(c => c.code === code);
                        return (
                          <div key={code} className="flex-1 text-center">
                            <div className="h-10 rounded border border-border/50 mb-1" style={{ backgroundColor: color?.hex || "#999" }} />
                            <span className="text-[10px] text-muted-foreground">{code}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
