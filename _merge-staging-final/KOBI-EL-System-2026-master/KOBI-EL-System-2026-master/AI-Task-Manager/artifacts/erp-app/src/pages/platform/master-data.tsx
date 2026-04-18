import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Database, Package, Ruler, FolderTree, Palette, Hash,
  ShieldCheck, AlertTriangle, CheckCircle, Search, Copy,
  FileText, Layers, Settings2, Ban, Fingerprint
} from "lucide-react";

/* ───── KPIs ───── */
const FALLBACK_KPIS = [
  { label: "סה\"כ פריטים", value: "4,218", icon: Package, color: "text-blue-600", bg: "bg-blue-50" },
  { label: "קטגוריות", value: "37", icon: FolderTree, color: "text-purple-600", bg: "bg-purple-50" },
  { label: "יחידות מידה", value: "24", icon: Ruler, color: "text-indigo-600", bg: "bg-indigo-50" },
  { label: "קודי צבע", value: "86", icon: Palette, color: "text-amber-600", bg: "bg-amber-50" },
  { label: "כפילויות שנמצאו", value: "3", icon: Copy, color: "text-red-600", bg: "bg-red-50" },
  { label: "ציון איכות דאטה", value: "96.4%", icon: ShieldCheck, color: "text-emerald-600", bg: "bg-emerald-50" },
];

/* ───── Items Master ───── */
const FALLBACK_ITEMS = [
  { code: "ITM-10001", name: "פרופיל אלומיניום T-60", category: "פרופילים", unit: 'מ"א', status: "active" },
  { code: "ITM-10002", name: "זכוכית מחוסמת 8mm שקוף", category: "זכוכית", unit: "יחידה", status: "active" },
  { code: "ITM-10003", name: "בורג נירוסטה M8x25", category: "חומרי חיבור", unit: "קופסה", status: "active" },
  { code: "ITM-10004", name: "חותם EPDM 12mm", category: "אטמים", unit: 'מ"א', status: "active" },
  { code: "ITM-10005", name: "ציר כבד 120mm נירוסטה", category: "אביזרים", unit: "יחידה", status: "active" },
  { code: "ITM-10006", name: "ידית Push-Lock כרום", category: "אביזרים", unit: "יחידה", status: "inactive" },
  { code: "ITM-10007", name: "פנל PVC 18mm לבן", category: "פנלים", unit: 'מ"ר', status: "active" },
  { code: "ITM-10008", name: "צבע אפוקסי RAL-7016", category: "צבעים", unit: "ליטר", status: "active" },
];

/* ───── Units of Measure ───── */
const FALLBACK_UNITS = [
  { code: "MTR", name: 'מטר (מ"א)', type: "אורך", conversion: "1 מטר = 100 ס\"מ" },
  { code: "SQM", name: 'מ"ר', type: "שטח", conversion: '1 מ"ר = 10,000 סמ"ר' },
  { code: "PCS", name: "יחידה", type: "כמות", conversion: "בסיס" },
  { code: "BOX", name: "קופסה (100 יח')", type: "כמות", conversion: "1 קופסה = 100 PCS" },
  { code: "KG", name: 'ק"ג', type: "משקל", conversion: '1 ק"ג = 1,000 גרם' },
  { code: "LTR", name: "ליטר", type: "נפח", conversion: '1 ליטר = 1,000 מ"ל' },
  { code: "PAL", name: "משטח", type: "אריזה", conversion: "1 משטח = 48 קופסאות" },
  { code: "TON", name: "טון", type: "משקל", conversion: '1 טון = 1,000 ק"ג' },
];

/* ───── Category Tree ───── */
const categories = [
  { parent: "—", name: "חומרי גלם", children: 5, items: 1420 },
  { parent: "חומרי גלם", name: "פרופילים", children: 3, items: 640 },
  { parent: "חומרי גלם", name: "זכוכית", children: 2, items: 380 },
  { parent: "—", name: "חומרי חיבור", children: 4, items: 520 },
  { parent: "—", name: "אביזרים", children: 6, items: 870 },
  { parent: "אביזרים", name: "ידיות", children: 0, items: 210 },
  { parent: "—", name: "צבעים וגמרים", children: 2, items: 260 },
  { parent: "—", name: "אטמים", children: 1, items: 148 },
];

/* ───── Color, Finish, Profile Codes ───── */
const FALLBACK_COLOR_CODES = [
  { code: "RAL-9016", name: "לבן טראפיק", hex: "#F1F0EA", usage: "חלונות סטנדרט" },
  { code: "RAL-7016", name: "אפור אנתרציט", hex: "#383E42", usage: "דלתות פרימיום" },
  { code: "RAL-8017", name: "חום שוקולד", hex: "#44322D", usage: "פרגולות עץ-דמוי" },
  { code: "RAL-1015", name: "שנהב בהיר", hex: "#E6D2B5", usage: "תריסים" },
  { code: "RAL-6005", name: "ירוק אזוב", hex: "#0F4336", usage: "גדרות / שערים" },
  { code: "RAL-5015", name: "כחול שמיים", hex: "#007CB0", usage: "מעקות חוץ" },
];

const FALLBACK_FINISH_CODES = [
  { code: "FIN-01", name: "אנודייז טבעי", process: "אנודייזציה", thickness: "15\u00B5" },
  { code: "FIN-02", name: "אבקה מט", process: "צביעה אלקטרוסטטית", thickness: "60\u00B5" },
  { code: "FIN-03", name: "אבקה מבריק", process: "צביעה אלקטרוסטטית", thickness: "80\u00B5" },
  { code: "FIN-04", name: "PVDF ימי", process: "ציפוי PVDF", thickness: "35\u00B5" },
  { code: "FIN-05", name: "עץ-דמוי (סובלימציה)", process: "סובלימציה", thickness: "—" },
];

const FALLBACK_PROFILE_FAMILIES = [
  { code: "PRF-T", name: "פרופיל T", section: "T-Section", widths: "40 / 60 / 80 mm" },
  { code: "PRF-U", name: "פרופיל U", section: "U-Channel", widths: "50 / 70 / 100 mm" },
  { code: "PRF-L", name: "פרופיל L (זווית)", section: "L-Angle", widths: "30 / 50 mm" },
  { code: "PRF-SQ", name: "פרופיל מרובע", section: "Square Tube", widths: "20 / 40 / 60 mm" },
  { code: "PRF-RD", name: "פרופיל עגול", section: "Round Tube", widths: "\u00D825 / \u00D850 mm" },
];

/* ───── Rules Tab Data ───── */
const FALLBACK_NUMBERING_SEQS = [
  { entity: "פריט חדש", prefix: "ITM-", next: 10009, step: 1, digits: 5 },
  { entity: "הזמנת עבודה", prefix: "WO-", next: 2461, step: 1, digits: 6 },
  { entity: "הזמנת רכש", prefix: "PO-", next: 8820, step: 1, digits: 6 },
  { entity: "חשבונית", prefix: "INV-", next: 55210, step: 1, digits: 6 },
  { entity: "משלוח", prefix: "SHP-", next: 14005, step: 1, digits: 5 },
  { entity: "NCR", prefix: "NCR-", next: 330, step: 1, digits: 4 },
];

const FALLBACK_NAMING_RULES = [
  { scope: "פריטים", rule: "[קטגוריה] [חומר] [מידה] [גמר]", example: "פרופיל אלומיניום T-60 אנודייז" },
  { scope: "צבעים", rule: "RAL-XXXX [שם עברי]", example: "RAL-7016 אפור אנתרציט" },
  { scope: "BOMs", rule: "BOM-[קוד פריט]-VXX", example: "BOM-ITM10001-V03" },
];

const FALLBACK_MANDATORY_FIELDS = [
  { entity: "פריט", field: "שם פריט", enforced: true },
  { entity: "פריט", field: "קטגוריה", enforced: true },
  { entity: "פריט", field: "יחידת מידה", enforced: true },
  { entity: "פריט", field: "קוד מס", enforced: true },
  { entity: "לקוח", field: 'ח.פ / ע"מ', enforced: true },
  { entity: "לקוח", field: "טלפון ראשי", enforced: true },
  { entity: "הזמנת עבודה", field: "תאריך יעד", enforced: true },
  { entity: "הזמנת עבודה", field: "קו ייצור", enforced: false },
];

const FALLBACK_DUPLICATE_RULES = [
  { scope: "פריטים", keys: "שם + קטגוריה + יחידה", action: "חסימה + התראה", found: 2 },
  { scope: "לקוחות", keys: 'ח.פ / ע"מ', action: "חסימה", found: 0 },
  { scope: "ספקים", keys: 'ח.פ + שם חברה', action: "התראה בלבד", found: 1 },
  { scope: "אנשי קשר", keys: "אימייל + טלפון", action: "התראה בלבד", found: 0 },
];

/* ───── Helpers ───── */
const statusBadge = (s: string) => {
  if (s === "active") return <Badge className="bg-emerald-600/90 text-white text-[10px]">פעיל</Badge>;
  return <Badge variant="outline" className="text-muted-foreground text-[10px]">לא פעיל</Badge>;
};

const colorSwatch = (hex: string) => (
  <span className="inline-block w-4 h-4 rounded border border-white/20" style={{ backgroundColor: hex }} />
);

/* ═══════════════════ Component ═══════════════════ */
export default function MasterData() {
  const { data: masterdataData } = useQuery({
    queryKey: ["master-data"],
    queryFn: () => authFetch("/api/platform/master_data"),
    staleTime: 5 * 60 * 1000,
  });

  const kpis = masterdataData ?? FALLBACK_KPIS;
  const colorCodes = FALLBACK_COLOR_CODES;
  const duplicateRules = FALLBACK_DUPLICATE_RULES;
  const finishCodes = FALLBACK_FINISH_CODES;
  const items = FALLBACK_ITEMS;
  const mandatoryFields = FALLBACK_MANDATORY_FIELDS;
  const namingRules = FALLBACK_NAMING_RULES;
  const numberingSeqs = FALLBACK_NUMBERING_SEQS;
  const profileFamilies = FALLBACK_PROFILE_FAMILIES;
  const units = FALLBACK_UNITS;

  const [tab, setTab] = useState("items");

  return (
    <div className="p-6 space-y-5" dir="rtl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Database className="h-7 w-7 text-primary" /> מאסטר דאטה — SSOT
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          טכנו-כל עוזי | ניהול נתוני אב — פריטים, יחידות, קטגוריות, קודים וכללים
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-6 gap-2">
        {kpis.map((k, i) => {
          const Icon = k.icon;
          return (
            <Card key={i} className={`${k.bg}/40 border-0 shadow-sm`}>
              <CardContent className="pt-2 pb-1.5 text-center px-1">
                <Icon className={`h-3.5 w-3.5 mx-auto ${k.color} mb-0.5`} />
                <p className="text-[8px] text-muted-foreground leading-tight">{k.label}</p>
                <p className={`text-sm font-bold font-mono ${k.color}`}>{k.value}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid grid-cols-5 w-full max-w-2xl">
          <TabsTrigger value="items" className="text-xs gap-1"><Package className="h-3.5 w-3.5" /> פריטים</TabsTrigger>
          <TabsTrigger value="units" className="text-xs gap-1"><Ruler className="h-3.5 w-3.5" /> יחידות</TabsTrigger>
          <TabsTrigger value="categories" className="text-xs gap-1"><FolderTree className="h-3.5 w-3.5" /> קטגוריות</TabsTrigger>
          <TabsTrigger value="codes" className="text-xs gap-1"><Palette className="h-3.5 w-3.5" /> קודים</TabsTrigger>
          <TabsTrigger value="rules" className="text-xs gap-1"><Settings2 className="h-3.5 w-3.5" /> כללים</TabsTrigger>
        </TabsList>

        {/* ── Items ── */}
        <TabsContent value="items">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Package className="h-4 w-4" /> מאסטר פריטים</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">קוד</TableHead>
                    <TableHead className="text-right">שם פריט</TableHead>
                    <TableHead className="text-right">קטגוריה</TableHead>
                    <TableHead className="text-right">יחידה</TableHead>
                    <TableHead className="text-right">סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((r) => (
                    <TableRow key={r.code}>
                      <TableCell className="font-mono text-xs">{r.code}</TableCell>
                      <TableCell className="font-medium text-sm">{r.name}</TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px]">{r.category}</Badge></TableCell>
                      <TableCell className="text-xs">{r.unit}</TableCell>
                      <TableCell>{statusBadge(r.status)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Units ── */}
        <TabsContent value="units">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Ruler className="h-4 w-4" /> יחידות מידה</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">קוד</TableHead>
                    <TableHead className="text-right">שם</TableHead>
                    <TableHead className="text-right">סוג</TableHead>
                    <TableHead className="text-right">המרה</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {units.map((u) => (
                    <TableRow key={u.code}>
                      <TableCell className="font-mono text-xs">{u.code}</TableCell>
                      <TableCell className="font-medium text-sm">{u.name}</TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px]">{u.type}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{u.conversion}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Categories ── */}
        <TabsContent value="categories">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><FolderTree className="h-4 w-4" /> עץ קטגוריות</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">הורה</TableHead>
                    <TableHead className="text-right">קטגוריה</TableHead>
                    <TableHead className="text-right">תת-קטגוריות</TableHead>
                    <TableHead className="text-right">פריטים</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categories.map((c, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs text-muted-foreground">{c.parent}</TableCell>
                      <TableCell className="font-medium text-sm">{c.name}</TableCell>
                      <TableCell className="font-mono text-xs">{c.children}</TableCell>
                      <TableCell className="font-mono text-xs">{c.items.toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Codes (Color + Finish + Profile) ── */}
        <TabsContent value="codes" className="space-y-4">
          {/* Color Codes */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Palette className="h-4 w-4" /> קודי צבע RAL</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">קוד</TableHead>
                    <TableHead className="text-right">צבע</TableHead>
                    <TableHead className="text-right">שם</TableHead>
                    <TableHead className="text-right">שימוש עיקרי</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {colorCodes.map((c) => (
                    <TableRow key={c.code}>
                      <TableCell className="font-mono text-xs">{c.code}</TableCell>
                      <TableCell>{colorSwatch(c.hex)}</TableCell>
                      <TableCell className="font-medium text-sm">{c.name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{c.usage}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Finish Codes */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Layers className="h-4 w-4" /> קודי גמר</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">קוד</TableHead>
                    <TableHead className="text-right">שם</TableHead>
                    <TableHead className="text-right">תהליך</TableHead>
                    <TableHead className="text-right">עובי שכבה</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {finishCodes.map((f) => (
                    <TableRow key={f.code}>
                      <TableCell className="font-mono text-xs">{f.code}</TableCell>
                      <TableCell className="font-medium text-sm">{f.name}</TableCell>
                      <TableCell className="text-xs">{f.process}</TableCell>
                      <TableCell className="font-mono text-xs">{f.thickness}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Profile Families */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4" /> משפחות פרופילים</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">קוד</TableHead>
                    <TableHead className="text-right">שם</TableHead>
                    <TableHead className="text-right">חתך</TableHead>
                    <TableHead className="text-right">רוחבים זמינים</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {profileFamilies.map((p) => (
                    <TableRow key={p.code}>
                      <TableCell className="font-mono text-xs">{p.code}</TableCell>
                      <TableCell className="font-medium text-sm">{p.name}</TableCell>
                      <TableCell className="text-xs">{p.section}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{p.widths}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Rules ── */}
        <TabsContent value="rules" className="space-y-4">
          {/* Numbering Sequences */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Hash className="h-4 w-4" /> רצפי מספור</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">ישות</TableHead>
                    <TableHead className="text-right">קידומת</TableHead>
                    <TableHead className="text-right">הבא</TableHead>
                    <TableHead className="text-right">צעד</TableHead>
                    <TableHead className="text-right">ספרות</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {numberingSeqs.map((n, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium text-sm">{n.entity}</TableCell>
                      <TableCell className="font-mono text-xs">{n.prefix}</TableCell>
                      <TableCell className="font-mono text-xs">{n.next.toLocaleString()}</TableCell>
                      <TableCell className="font-mono text-xs">{n.step}</TableCell>
                      <TableCell className="font-mono text-xs">{n.digits}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Naming Rules */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4" /> כללי שמות</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">היקף</TableHead>
                    <TableHead className="text-right">תבנית</TableHead>
                    <TableHead className="text-right">דוגמה</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {namingRules.map((n, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium text-sm">{n.scope}</TableCell>
                      <TableCell className="font-mono text-xs">{n.rule}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{n.example}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Mandatory Fields */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> שדות חובה</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">ישות</TableHead>
                    <TableHead className="text-right">שדה</TableHead>
                    <TableHead className="text-right">נאכף</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mandatoryFields.map((m, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium text-sm">{m.entity}</TableCell>
                      <TableCell className="text-xs">{m.field}</TableCell>
                      <TableCell>
                        {m.enforced
                          ? <Badge className="bg-emerald-600/90 text-white text-[10px]"><CheckCircle className="h-3 w-3 ml-1" />פעיל</Badge>
                          : <Badge variant="outline" className="text-muted-foreground text-[10px]"><Ban className="h-3 w-3 ml-1" />כבוי</Badge>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Duplicate Prevention */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Fingerprint className="h-4 w-4" /> מניעת כפילויות</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">היקף</TableHead>
                    <TableHead className="text-right">מפתחות זיהוי</TableHead>
                    <TableHead className="text-right">פעולה</TableHead>
                    <TableHead className="text-right">נמצאו</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {duplicateRules.map((d, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium text-sm">{d.scope}</TableCell>
                      <TableCell className="font-mono text-xs">{d.keys}</TableCell>
                      <TableCell className="text-xs">{d.action}</TableCell>
                      <TableCell>
                        <Badge className={d.found > 0 ? "bg-red-600/90 text-white text-[10px]" : "bg-emerald-600/90 text-white text-[10px]"}>
                          {d.found}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}