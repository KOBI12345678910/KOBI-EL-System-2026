import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  LayoutTemplate, Layers, Package, ClipboardList, TrendingUp, Search,
  Plus, Copy, Settings2, CheckCircle2, ArrowLeft, ArrowRight, Ruler, Calculator
} from "lucide-react";

const templates = [
  { id: 1, name: "חלון אלומיניום סטנדרטי 100x120", category: "חלונות", components: 18, levels: 3, baseCost: 1250, products: 34, status: "active", updated: "2026-04-01" },
  { id: 2, name: "דלת זכוכית כפולה", category: "דלתות", components: 24, levels: 4, baseCost: 3800, products: 12, status: "active", updated: "2026-03-28" },
  { id: 3, name: "מעקה פלדה 1 מטר", category: "מעקות", components: 14, levels: 2, baseCost: 890, products: 21, status: "active", updated: "2026-03-25" },
  { id: 4, name: "קיר מסך אלומיניום", category: "קירות מסך", components: 42, levels: 5, baseCost: 8500, products: 6, status: "active", updated: "2026-04-03" },
  { id: 5, name: "חלון הזזה כפול 200x150", category: "חלונות", components: 22, levels: 3, baseCost: 2100, products: 18, status: "active", updated: "2026-03-30" },
  { id: 6, name: "צוהר גג פירמידלי", category: "צוהרים", components: 31, levels: 4, baseCost: 5200, products: 4, status: "draft", updated: "2026-04-05" },
  { id: 7, name: "דלת כניסה מפוארת", category: "דלתות", components: 28, levels: 4, baseCost: 6200, products: 8, status: "active", updated: "2026-03-20" },
  { id: 8, name: "מסגרת פלדה תעשייתית", category: "מסגרות", components: 16, levels: 2, baseCost: 1800, products: 15, status: "active", updated: "2026-03-18" },
  { id: 9, name: "חלון ויטרינה 300x250", category: "חלונות", components: 26, levels: 3, baseCost: 4100, products: 7, status: "deprecated", updated: "2026-02-10" },
  { id: 10, name: "מעקה זכוכית מודרני", category: "מעקות", components: 20, levels: 3, baseCost: 2400, products: 11, status: "active", updated: "2026-04-06" },
];

const families = [
  { name: "חלונות אלומיניום", templates: 3, variants: 24, sharedPct: 72, complexity: "בינוני", icon: "🪟", color: "bg-blue-500/10 text-blue-700" },
  { name: "דלתות זכוכית", templates: 2, variants: 16, sharedPct: 65, complexity: "גבוה", icon: "🚪", color: "bg-purple-500/10 text-purple-700" },
  { name: "מסגרות פלדה", templates: 1, variants: 10, sharedPct: 80, complexity: "נמוך", icon: "🔩", color: "bg-gray-500/10 text-gray-700" },
  { name: "קירות מסך", templates: 1, variants: 8, sharedPct: 58, complexity: "גבוה מאוד", icon: "🏗️", color: "bg-amber-500/10 text-amber-700" },
  { name: "צוהרים", templates: 1, variants: 6, sharedPct: 45, complexity: "גבוה", icon: "☀️", color: "bg-yellow-500/10 text-yellow-700" },
  { name: "מעקות", templates: 2, variants: 14, sharedPct: 70, complexity: "בינוני", icon: "🛡️", color: "bg-green-500/10 text-green-700" },
];

const variants = [
  { size: "60x60", dimChange: "-40x-60", addedParts: 0, costDelta: -480, timeDelta: -15 },
  { size: "80x100", dimChange: "-20x-20", addedParts: 0, costDelta: -210, timeDelta: -8 },
  { size: "100x120", dimChange: "בסיס", addedParts: 0, costDelta: 0, timeDelta: 0 },
  { size: "120x140", dimChange: "+20x+20", addedParts: 1, costDelta: 280, timeDelta: 10 },
  { size: "140x160", dimChange: "+40x+40", addedParts: 2, costDelta: 520, timeDelta: 18 },
  { size: "160x180", dimChange: "+60x+60", addedParts: 3, costDelta: 780, timeDelta: 25 },
  { size: "180x200", dimChange: "+80x+80", addedParts: 4, costDelta: 1050, timeDelta: 32 },
  { size: "200x220", dimChange: "+100x+100", addedParts: 5, costDelta: 1340, timeDelta: 40 },
];

const statusBadge = (s: string) => {
  if (s === "active") return <Badge className="bg-green-500/15 text-green-700">פעיל</Badge>;
  if (s === "draft") return <Badge className="bg-amber-500/15 text-amber-700">טיוטה</Badge>;
  return <Badge className="bg-red-500/15 text-red-600">הוצא משימוש</Badge>;
};

export default function BomTemplatesPage() {
  const [search, setSearch] = useState("");
  const [wizardStep, setWizardStep] = useState(0);
  const [selectedTemplate, setSelectedTemplate] = useState(templates[0]);
  const [customW, setCustomW] = useState("120");
  const [customH, setCustomH] = useState("150");

  const totalTemplates = templates.length;
  const activeTemplates = templates.filter(t => t.status === "active").length;
  const totalProducts = templates.reduce((s, t) => s + t.products, 0);
  const avgComponents = Math.round(templates.reduce((s, t) => s + t.components, 0) / totalTemplates);
  const utilization = Math.round((totalProducts / (totalTemplates * 20)) * 100);

  const kpis = [
    { label: "סה״כ תבניות", value: totalTemplates, icon: LayoutTemplate, color: "text-blue-600", bg: "bg-blue-50" },
    { label: "תבניות פעילות", value: activeTemplates, icon: CheckCircle2, color: "text-green-600", bg: "bg-green-50" },
    { label: "מוצרים שנוצרו", value: totalProducts, icon: Package, color: "text-purple-600", bg: "bg-purple-50" },
    { label: "ממוצע רכיבים", value: avgComponents, icon: Layers, color: "text-amber-600", bg: "bg-amber-50" },
    { label: "ניצולת תבניות", value: `${utilization}%`, icon: TrendingUp, color: "text-cyan-600", bg: "bg-cyan-50" },
  ];

  const filtered = templates.filter(t => t.name.includes(search) || t.category.includes(search));

  const wizardCost = () => {
    const w = parseInt(customW) || 100;
    const h = parseInt(customH) || 120;
    const base = selectedTemplate.baseCost;
    const factor = (w * h) / (100 * 120);
    return Math.round(base * factor);
  };

  const steps = ["בחירת תבנית", "התאמת מידות", "סקירת רכיבים", "חישוב עלות"];

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <LayoutTemplate className="h-7 w-7 text-blue-600" />
          ניהול תבניות BOM - טכנו-כל עוזי
        </h1>
        <Button className="gap-2"><Plus className="h-4 w-4" /> תבנית חדשה</Button>
      </div>

      <div className="grid grid-cols-5 gap-4">
        {kpis.map((k, i) => (
          <Card key={i}>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-lg ${k.bg}`}>
                  <k.icon className={`h-5 w-5 ${k.color}`} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{k.label}</p>
                  <p className="text-xl font-bold">{k.value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="templates" className="space-y-4">
        <TabsList>
          <TabsTrigger value="templates">תבניות</TabsTrigger>
          <TabsTrigger value="families">משפחות מוצרים</TabsTrigger>
          <TabsTrigger value="variants">וריאנטים</TabsTrigger>
          <TabsTrigger value="create">יצירה מתבנית</TabsTrigger>
        </TabsList>

        {/* --- Tab 1: Templates --- */}
        <TabsContent value="templates" className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="חיפוש תבנית..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9" />
            </div>
            <Badge variant="outline">{filtered.length} תבניות</Badge>
          </div>
          <div className="grid gap-3">
            {filtered.map(t => (
              <Card key={t.id} className="hover:shadow-md transition-shadow">
                <CardContent className="py-4 flex items-center gap-6">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold truncate">{t.name}</span>
                      {statusBadge(t.status)}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span>קטגוריה: {t.category}</span>
                      <span>עודכן: {t.updated}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-5 text-sm shrink-0">
                    {[
                      { l: "רכיבים", v: t.components },
                      { l: "שכבות", v: t.levels },
                      { l: "עלות בסיס", v: `₪${t.baseCost.toLocaleString()}` },
                      { l: "מוצרים", v: t.products },
                    ].map((s, si) => (
                      <div key={si} className="text-center">
                        <p className="text-muted-foreground text-xs">{s.l}</p>
                        <p className="font-bold text-lg">{s.v}</p>
                      </div>
                    ))}
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon"><Copy className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon"><Settings2 className="h-4 w-4" /></Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* --- Tab 2: Product Families --- */}
        <TabsContent value="families" className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            {families.map((f, i) => (
              <Card key={i} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <span className="text-xl">{f.icon}</span> {f.name}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-y-2 text-sm">
                    <span className="text-muted-foreground">תבניות:</span>
                    <span className="font-semibold">{f.templates}</span>
                    <span className="text-muted-foreground">וריאנטים:</span>
                    <span className="font-semibold">{f.variants}</span>
                    <span className="text-muted-foreground">מורכבות:</span>
                    <Badge className={f.color}>{f.complexity}</Badge>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted-foreground">רכיבים משותפים</span>
                      <span className="font-semibold">{f.sharedPct}%</span>
                    </div>
                    <Progress value={f.sharedPct} className="h-2" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* --- Tab 3: Variants --- */}
        <TabsContent value="variants" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Ruler className="h-5 w-5 text-blue-600" />
                וריאנטים - חלון אלומיניום סטנדרטי (בסיס: 100x120 ס״מ | ₪1,250)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3">
                {variants.map((v, i) => {
                  const finalCost = 1250 + v.costDelta;
                  const isBase = v.costDelta === 0;
                  return (
                    <div key={i} className={`flex items-center gap-4 p-3 rounded-lg border ${isBase ? "bg-blue-50 border-blue-200" : "bg-background"}`}>
                      <div className="w-24 text-center">
                        <p className="font-bold text-lg">{v.size}</p>
                        <p className="text-xs text-muted-foreground">ס״מ</p>
                      </div>
                      <div className="flex-1 grid grid-cols-4 gap-4 text-sm">
                        <div>
                          <p className="text-muted-foreground text-xs">שינוי מידות</p>
                          <p className={`font-semibold ${isBase ? "text-blue-700" : ""}`}>{v.dimChange}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground text-xs">רכיבים נוספים</p>
                          <p className="font-semibold">{v.addedParts === 0 ? "-" : `+${v.addedParts}`}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground text-xs">הפרש עלות</p>
                          <p className={`font-semibold ${v.costDelta > 0 ? "text-red-600" : v.costDelta < 0 ? "text-green-600" : ""}`}>
                            {v.costDelta === 0 ? "בסיס" : `${v.costDelta > 0 ? "+" : ""}₪${v.costDelta}`}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground text-xs">שינוי זמן ייצור</p>
                          <p className={`font-semibold ${v.timeDelta > 0 ? "text-amber-600" : v.timeDelta < 0 ? "text-green-600" : ""}`}>
                            {v.timeDelta === 0 ? "בסיס" : `${v.timeDelta > 0 ? "+" : ""}${v.timeDelta} דק׳`}
                          </p>
                        </div>
                      </div>
                      <div className="w-28 text-center">
                        <p className="text-xs text-muted-foreground">עלות סופית</p>
                        <p className="font-bold text-lg">₪{finalCost.toLocaleString()}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* --- Tab 4: Create from Template --- */}
        <TabsContent value="create" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <ClipboardList className="h-5 w-5 text-purple-600" />
                אשף יצירת מוצר מתבנית
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Stepper */}
              <div className="flex items-center gap-2 justify-center mb-4">
                {steps.map((s, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                      i < wizardStep ? "bg-green-600 text-white" : i === wizardStep ? "bg-blue-600 text-white" : "bg-muted text-muted-foreground"
                    }`}>{i + 1}</div>
                    <span className={`text-sm ${i === wizardStep ? "font-bold" : "text-muted-foreground"}`}>{s}</span>
                    {i < steps.length - 1 && <div className="w-12 h-0.5 bg-muted mx-1" />}
                  </div>
                ))}
              </div>

              {/* Step Content */}
              {wizardStep === 0 && (
                <div className="grid grid-cols-2 gap-3">
                  {templates.filter(t => t.status === "active").map(t => (
                    <div
                      key={t.id}
                      onClick={() => setSelectedTemplate(t)}
                      className={`p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                        selectedTemplate.id === t.id ? "border-blue-500 bg-blue-50" : "border-border hover:border-blue-300"
                      }`}
                    >
                      <p className="font-semibold">{t.name}</p>
                      <div className="flex gap-4 mt-1 text-sm text-muted-foreground">
                        <span>{t.components} רכיבים</span>
                        <span>₪{t.baseCost.toLocaleString()}</span>
                        <span>{t.category}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {wizardStep === 1 && (
                <div className="max-w-md mx-auto space-y-4">
                  <p className="text-sm text-muted-foreground">תבנית נבחרת: <span className="font-semibold text-foreground">{selectedTemplate.name}</span></p>
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="text-sm font-medium mb-1 block">רוחב (ס״מ)</label>
                      <Input type="number" value={customW} onChange={e => setCustomW(e.target.value)} /></div>
                    <div><label className="text-sm font-medium mb-1 block">גובה (ס״מ)</label>
                      <Input type="number" value={customH} onChange={e => setCustomH(e.target.value)} /></div>
                  </div>
                  <div className="p-3 bg-muted rounded-lg text-sm">
                    <p>שטח מחושב: <span className="font-bold">{((parseInt(customW) || 0) * (parseInt(customH) || 0) / 10000).toFixed(2)} מ״ר</span></p>
                  </div>
                </div>
              )}

              {wizardStep === 2 && (
                <div className="space-y-2 max-w-lg mx-auto">
                  <p className="text-sm text-muted-foreground mb-3">רכיבים עבור {selectedTemplate.name} ({customW}x{customH} ס״מ):</p>
                  {[
                    { name: "פרופיל אלומיניום ראשי", qty: 4, unit: "יח׳" },
                    { name: "זכוכית מחוסמת כפולה", qty: 1, unit: "יח׳" },
                    { name: "גומיית איטום EPDM", qty: 3.2, unit: "מטר" },
                    { name: "ברגי נירוסטה M6", qty: 16, unit: "יח׳" },
                    { name: "ידית אלומיניום", qty: 1, unit: "יח׳" },
                    { name: "ציר נסתר", qty: 2, unit: "יח׳" },
                    { name: "מנעול רב-נקודתי", qty: 1, unit: "יח׳" },
                    { name: "סף תחתון מבודד", qty: 1, unit: "יח׳" },
                  ].map((c, i) => (
                    <div key={i} className="flex items-center justify-between p-2 rounded border text-sm">
                      <span>{c.name}</span>
                      <span className="font-semibold">{c.qty} {c.unit}</span>
                    </div>
                  ))}
                </div>
              )}

              {wizardStep === 3 && (
                <div className="max-w-md mx-auto space-y-4 text-center">
                  <Calculator className="h-12 w-12 mx-auto text-green-600" />
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">תבנית: {selectedTemplate.name}</p>
                    <p className="text-sm text-muted-foreground">מידות: {customW}x{customH} ס״מ</p>
                    <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                      <p className="text-sm text-green-700">עלות מחושבת</p>
                      <p className="text-3xl font-bold text-green-800">₪{wizardCost().toLocaleString()}</p>
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-sm">
                      <div className="p-2 bg-muted rounded">
                        <p className="text-muted-foreground text-xs">רכיבים</p>
                        <p className="font-bold">{selectedTemplate.components}</p>
                      </div>
                      <div className="p-2 bg-muted rounded">
                        <p className="text-muted-foreground text-xs">זמן ייצור</p>
                        <p className="font-bold">~45 דק׳</p>
                      </div>
                      <div className="p-2 bg-muted rounded">
                        <p className="text-muted-foreground text-xs">שכבות BOM</p>
                        <p className="font-bold">{selectedTemplate.levels}</p>
                      </div>
                    </div>
                  </div>
                  <Button className="gap-2 w-full"><CheckCircle2 className="h-4 w-4" /> אשר ויצור מוצר</Button>
                </div>
              )}

              {/* Navigation */}
              <div className="flex items-center justify-between pt-4 border-t">
                <Button variant="outline" disabled={wizardStep === 0} onClick={() => setWizardStep(p => p - 1)} className="gap-1">
                  <ArrowRight className="h-4 w-4" /> הקודם
                </Button>
                <span className="text-sm text-muted-foreground">שלב {wizardStep + 1} מתוך {steps.length}</span>
                <Button disabled={wizardStep === steps.length - 1} onClick={() => setWizardStep(p => p + 1)} className="gap-1">
                  הבא <ArrowLeft className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
