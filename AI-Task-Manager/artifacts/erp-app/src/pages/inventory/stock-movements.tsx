import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeftRight, PackagePlus, PackageMinus, Repeat2, SlidersHorizontal,
  TrendingUp, Warehouse, Clock, User, FileText, Search, ShieldCheck,
} from "lucide-react";

/* ── helpers ── */
const fmt = (n: number) => "₪" + n.toLocaleString("he-IL");
const ts = (d: string) => new Date(d).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });

type MoveType = "כניסה" | "יציאה" | "העברה" | "התאמה" | "שריון" | "הנפקה";

interface Movement {
  id: number;
  timestamp: string;
  type: MoveType;
  item: string;
  sku: string;
  qty: number;
  unitPrice: number;
  fromWarehouse: string;
  fromZone: string;
  toWarehouse: string;
  toZone: string;
  reference: string;
  user: string;
  notes: string;
}

const TYPE_META: Record<MoveType, { color: string; icon: typeof PackagePlus }> = {
  "כניסה":  { color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30", icon: PackagePlus },
  "יציאה":  { color: "bg-red-500/20 text-red-400 border-red-500/30", icon: PackageMinus },
  "העברה":  { color: "bg-blue-500/20 text-blue-400 border-blue-500/30", icon: Repeat2 },
  "התאמה":  { color: "bg-amber-500/20 text-amber-400 border-amber-500/30", icon: SlidersHorizontal },
  "שריון":  { color: "bg-purple-500/20 text-purple-400 border-purple-500/30", icon: ShieldCheck },
  "הנפקה":  { color: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30", icon: FileText },
};

const MOVEMENTS: Movement[] = [
  { id: 1, timestamp: "2026-04-08T07:12:00", type: "כניסה", item: "פלדה גלוונית 2 מ\"מ", sku: "STL-G2", qty: 500, unitPrice: 28, fromWarehouse: "ספק חיצוני", fromZone: "-", toWarehouse: "מחסן מרכזי", toZone: "A-01", reference: "PO-4410", user: "דני כהן", notes: "קבלה מספק מרכזי" },
  { id: 2, timestamp: "2026-04-08T07:35:00", type: "כניסה", item: "ברגים M8x30 נירוסטה", sku: "BLT-M8", qty: 2000, unitPrice: 1.2, fromWarehouse: "ספק חיצוני", fromZone: "-", toWarehouse: "מחסן מרכזי", toZone: "C-03", reference: "PO-4412", user: "דני כהן", notes: "הזמנה חוזרת" },
  { id: 3, timestamp: "2026-04-08T08:05:00", type: "יציאה", item: "אלומיניום 6061 T6", sku: "ALU-6061", qty: 120, unitPrice: 45, fromWarehouse: "מחסן מרכזי", fromZone: "B-02", toWarehouse: "קו ייצור 1", toZone: "-", reference: "WO-7801", user: "שירה לוי", notes: "הנפקה לפקודת עבודה" },
  { id: 4, timestamp: "2026-04-08T08:22:00", type: "העברה", item: "מנועי סרוו 400W", sku: "SRV-400", qty: 10, unitPrice: 890, fromWarehouse: "מחסן מרכזי", fromZone: "D-05", toWarehouse: "מחסן קו 2", toZone: "E-01", reference: "TR-1150", user: "יוסי אברהם", notes: "העברה לקו הרכבה" },
  { id: 5, timestamp: "2026-04-08T08:48:00", type: "התאמה", item: "צינורות PVC 3 אינץ'", sku: "PVC-3IN", qty: -15, unitPrice: 18, fromWarehouse: "מחסן מרכזי", fromZone: "F-02", toWarehouse: "מחסן מרכזי", toZone: "F-02", reference: "ADJ-0088", user: "מיכל רוזן", notes: "התאמה לאחר ספירה" },
  { id: 6, timestamp: "2026-04-08T09:10:00", type: "כניסה", item: "לוחות PCB דגם X7", sku: "PCB-X7", qty: 300, unitPrice: 32, fromWarehouse: "ספק חיצוני", fromZone: "-", toWarehouse: "מחסן אלקטרוניקה", toZone: "G-01", reference: "GRN-2245", user: "דני כהן", notes: "קבלת סחורה - בדיקת איכות עברה" },
  { id: 7, timestamp: "2026-04-08T09:30:00", type: "שריון", item: "פלדה גלוונית 2 מ\"מ", sku: "STL-G2", qty: 200, unitPrice: 28, fromWarehouse: "מחסן מרכזי", fromZone: "A-01", toWarehouse: "מחסן מרכזי", toZone: "A-01", reference: "WO-7805", user: "שירה לוי", notes: "שריון להזמנת לקוח #1189" },
  { id: 8, timestamp: "2026-04-08T09:55:00", type: "יציאה", item: "חוט ריתוך 1.2 מ\"מ", sku: "WLD-12", qty: 50, unitPrice: 65, fromWarehouse: "מחסן מרכזי", fromZone: "H-04", toWarehouse: "קו ייצור 3", toZone: "-", reference: "WO-7803", user: "אבי מזרחי", notes: "חומר מתכלה לקו ריתוך" },
  { id: 9, timestamp: "2026-04-08T10:15:00", type: "הנפקה", item: "ציפוי אפוקסי 5 ליטר", sku: "EPX-5L", qty: 8, unitPrice: 220, fromWarehouse: "מחסן כימיקלים", fromZone: "K-01", toWarehouse: "תחנת ציפוי", toZone: "-", reference: "WO-7806", user: "יוסי אברהם", notes: "הנפקה לתחנת ציפוי" },
  { id: 10, timestamp: "2026-04-08T10:40:00", type: "העברה", item: "ברגים M8x30 נירוסטה", sku: "BLT-M8", qty: 500, unitPrice: 1.2, fromWarehouse: "מחסן מרכזי", fromZone: "C-03", toWarehouse: "מחסן קו 1", toZone: "L-02", reference: "TR-1151", user: "מיכל רוזן", notes: "חידוש מלאי קו ייצור" },
  { id: 11, timestamp: "2026-04-08T11:00:00", type: "כניסה", item: "רצועות גומי תעשייתי", sku: "RBR-IND", qty: 150, unitPrice: 14, fromWarehouse: "ספק חיצוני", fromZone: "-", toWarehouse: "מחסן מרכזי", toZone: "M-03", reference: "PO-4415", user: "דני כהן", notes: "אספקה מתוזמנת" },
  { id: 12, timestamp: "2026-04-08T11:22:00", type: "יציאה", item: "מנועי סרוו 400W", sku: "SRV-400", qty: 4, unitPrice: 890, fromWarehouse: "מחסן קו 2", fromZone: "E-01", toWarehouse: "קו הרכבה 2", toZone: "-", reference: "WO-7808", user: "שירה לוי", notes: "הנפקה להרכבת מכלול" },
  { id: 13, timestamp: "2026-04-08T11:45:00", type: "התאמה", item: "מסבים SKF 6205", sku: "BRG-6205", qty: 8, unitPrice: 42, fromWarehouse: "מחסן מרכזי", fromZone: "N-02", toWarehouse: "מחסן מרכזי", toZone: "N-02", reference: "ADJ-0089", user: "אבי מזרחי", notes: "נמצאו יח' נוספות בספירה" },
  { id: 14, timestamp: "2026-04-08T12:10:00", type: "שריון", item: "לוחות PCB דגם X7", sku: "PCB-X7", qty: 100, unitPrice: 32, fromWarehouse: "מחסן אלקטרוניקה", fromZone: "G-01", toWarehouse: "מחסן אלקטרוניקה", toZone: "G-01", reference: "WO-7810", user: "מיכל רוזן", notes: "שריון לפרויקט אלפא" },
  { id: 15, timestamp: "2026-04-08T12:35:00", type: "הנפקה", item: "דבק תעשייתי 3M", sku: "GLU-3M", qty: 12, unitPrice: 85, fromWarehouse: "מחסן כימיקלים", fromZone: "K-02", toWarehouse: "קו הרכבה 1", toZone: "-", reference: "WO-7811", user: "יוסי אברהם", notes: "הנפקה לפי דרישת מנהל קו" },
  { id: 16, timestamp: "2026-04-08T13:00:00", type: "העברה", item: "אלומיניום 6061 T6", sku: "ALU-6061", qty: 80, unitPrice: 45, fromWarehouse: "מחסן מרכזי", fromZone: "B-02", toWarehouse: "מחסן חיצוני דרום", toZone: "P-01", reference: "TR-1152", user: "דני כהן", notes: "העברה למחסן גלישה" },
  { id: 17, timestamp: "2026-04-08T13:25:00", type: "יציאה", item: "רצועות גומי תעשייתי", sku: "RBR-IND", qty: 30, unitPrice: 14, fromWarehouse: "מחסן מרכזי", fromZone: "M-03", toWarehouse: "קו ייצור 2", toZone: "-", reference: "WO-7812", user: "אבי מזרחי", notes: "חומר מתכלה" },
  { id: 18, timestamp: "2026-04-08T13:50:00", type: "כניסה", item: "מחברים חשמליים DB25", sku: "CON-DB25", qty: 400, unitPrice: 8.5, fromWarehouse: "ספק חיצוני", fromZone: "-", toWarehouse: "מחסן אלקטרוניקה", toZone: "G-03", reference: "GRN-2246", user: "שירה לוי", notes: "קבלה + בדיקת דגימה" },
];

const TAB_MAP: Record<string, MoveType[] | null> = {
  "all": null,
  "in": ["כניסה"],
  "out": ["יציאה"],
  "transfer": ["העברה"],
  "adjust": ["התאמה"],
};

export default function StockMovementsPage() {
  const [activeTab, setActiveTab] = useState("all");
  const [search, setSearch] = useState("");

  /* ── computed ── */
  const filtered = useMemo(() => {
    let rows = [...MOVEMENTS];
    const types = TAB_MAP[activeTab];
    if (types) rows = rows.filter((m) => types.includes(m.type));
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(
        (m) =>
          m.item.toLowerCase().includes(q) ||
          m.sku.toLowerCase().includes(q) ||
          m.reference.toLowerCase().includes(q) ||
          m.user.toLowerCase().includes(q) ||
          m.notes.toLowerCase().includes(q)
      );
    }
    return rows;
  }, [activeTab, search]);

  const receipts  = MOVEMENTS.filter((m) => m.type === "כניסה");
  const issues    = MOVEMENTS.filter((m) => m.type === "יציאה" || m.type === "הנפקה");
  const transfers = MOVEMENTS.filter((m) => m.type === "העברה");
  const adjusts   = MOVEMENTS.filter((m) => m.type === "התאמה");
  const totalValue = MOVEMENTS.reduce((s, m) => s + Math.abs(m.qty) * m.unitPrice, 0);

  /* ── KPI cards ── */
  const kpis = [
    { label: "תנועות היום", value: MOVEMENTS.length, icon: ArrowLeftRight, color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20" },
    { label: "כניסות", value: receipts.length, icon: PackagePlus, color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
    { label: "יציאות / הנפקות", value: issues.length, icon: PackageMinus, color: "text-red-400", bg: "bg-red-500/10 border-red-500/20" },
    { label: "העברות", value: transfers.length, icon: Repeat2, color: "text-sky-400", bg: "bg-sky-500/10 border-sky-500/20" },
    { label: "התאמות", value: adjusts.length, icon: SlidersHorizontal, color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
    { label: "שווי תנועות ₪", value: fmt(totalValue), icon: TrendingUp, color: "text-violet-400", bg: "bg-violet-500/10 border-violet-500/20" },
  ];

  /* ── render row ── */
  const renderRow = (m: Movement) => {
    const meta = TYPE_META[m.type];
    const Icon = meta.icon;
    return (
      <TableRow key={m.id} className="hover:bg-muted/30 transition-colors border-border/30">
        <TableCell className="text-xs text-gray-400 font-mono whitespace-nowrap">
          <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" />{ts(m.timestamp)}</span>
        </TableCell>
        <TableCell>
          <Badge variant="outline" className={`${meta.color} gap-1 text-xs`}>
            <Icon className="w-3 h-3" />{m.type}
          </Badge>
        </TableCell>
        <TableCell>
          <div className="font-medium text-foreground text-sm">{m.item}</div>
          <div className="text-xs text-gray-500 font-mono">{m.sku}</div>
        </TableCell>
        <TableCell className="font-bold text-foreground tabular-nums">{Math.abs(m.qty).toLocaleString("he-IL")}</TableCell>
        <TableCell className="text-sm">
          <span className="flex items-center gap-1 text-gray-300"><Warehouse className="w-3 h-3 text-gray-500" />{m.fromWarehouse}</span>
          <span className="text-[10px] text-gray-500">{m.fromZone}</span>
        </TableCell>
        <TableCell className="text-sm">
          <span className="flex items-center gap-1 text-gray-300"><Warehouse className="w-3 h-3 text-gray-500" />{m.toWarehouse}</span>
          <span className="text-[10px] text-gray-500">{m.toZone}</span>
        </TableCell>
        <TableCell className="font-mono text-xs text-blue-400">{m.reference}</TableCell>
        <TableCell className="text-sm">
          <span className="inline-flex items-center gap-1 text-gray-300"><User className="w-3 h-3 text-gray-500" />{m.user}</span>
        </TableCell>
        <TableCell className="text-xs text-gray-400 max-w-[180px] truncate">{m.notes}</TableCell>
      </TableRow>
    );
  };

  /* ── page ── */
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0e1a] to-[#1a1f35] text-foreground p-6" dir="rtl">
      <div className="max-w-[1440px] mx-auto space-y-6">

        {/* header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-500/15 border border-blue-500/25">
              <ArrowLeftRight className="w-6 h-6 text-blue-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">תנועות מלאי והעברות</h1>
              <p className="text-sm text-gray-400 mt-0.5">טכנו-כל עוזי &mdash; מעקב תנועות מלאי בזמן אמת</p>
            </div>
          </div>
          <div className="relative min-w-[240px]">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="חיפוש פריט, SKU, אסמכתא..."
              className="w-full rounded-lg border border-border/50 bg-muted/40 pr-9 pl-3 py-2 text-sm text-foreground placeholder:text-gray-500 focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/50 transition-colors"
            />
          </div>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {kpis.map((k) => (
            <Card key={k.label} className={`border ${k.bg} bg-card/60 backdrop-blur`}>
              <CardContent className="p-4 flex items-center gap-3">
                <k.icon className={`w-8 h-8 ${k.color} shrink-0`} />
                <div className="min-w-0">
                  <p className="text-[11px] text-gray-400 truncate">{k.label}</p>
                  <p className={`text-xl font-extrabold ${k.color} leading-tight`}>{typeof k.value === "number" ? k.value.toLocaleString("he-IL") : k.value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* tabs + table */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="bg-muted/40 border border-border/40 p-1 rounded-xl">
            <TabsTrigger value="all" className="data-[state=active]:bg-blue-600/80 data-[state=active]:text-white rounded-lg text-sm px-4">כל התנועות</TabsTrigger>
            <TabsTrigger value="in" className="data-[state=active]:bg-emerald-600/80 data-[state=active]:text-white rounded-lg text-sm px-4">כניסות</TabsTrigger>
            <TabsTrigger value="out" className="data-[state=active]:bg-red-600/70 data-[state=active]:text-white rounded-lg text-sm px-4">יציאות</TabsTrigger>
            <TabsTrigger value="transfer" className="data-[state=active]:bg-sky-600/80 data-[state=active]:text-white rounded-lg text-sm px-4">העברות</TabsTrigger>
            <TabsTrigger value="adjust" className="data-[state=active]:bg-amber-600/80 data-[state=active]:text-white rounded-lg text-sm px-4">התאמות</TabsTrigger>
          </TabsList>

          {/* shared content for all tabs */}
          {Object.keys(TAB_MAP).map((tab) => (
            <TabsContent key={tab} value={tab} className="mt-0">
              <Card className="border-border/40 bg-card/50 backdrop-blur overflow-hidden">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50 border-border/30 hover:bg-muted/50">
                        <TableHead className="text-right text-gray-400 text-xs">זמן</TableHead>
                        <TableHead className="text-right text-gray-400 text-xs">סוג</TableHead>
                        <TableHead className="text-right text-gray-400 text-xs">פריט</TableHead>
                        <TableHead className="text-right text-gray-400 text-xs">כמות</TableHead>
                        <TableHead className="text-right text-gray-400 text-xs">ממחסן / אזור</TableHead>
                        <TableHead className="text-right text-gray-400 text-xs">למחסן / אזור</TableHead>
                        <TableHead className="text-right text-gray-400 text-xs">אסמכתא</TableHead>
                        <TableHead className="text-right text-gray-400 text-xs">משתמש</TableHead>
                        <TableHead className="text-right text-gray-400 text-xs">הערות</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={9} className="text-center py-12 text-gray-500">
                            <ArrowLeftRight className="w-10 h-10 mx-auto mb-2 opacity-20" />
                            אין תנועות להצגה
                          </TableCell>
                        </TableRow>
                      ) : (
                        filtered.map(renderRow)
                      )}
                    </TableBody>
                  </Table>
                </div>
                {/* footer summary */}
                <div className="flex items-center justify-between px-4 py-3 border-t border-border/30 bg-muted/20 text-xs text-gray-400">
                  <span>{filtered.length} תנועות מוצגות</span>
                  <span>שווי מוצג: {fmt(filtered.reduce((s, m) => s + Math.abs(m.qty) * m.unitPrice, 0))}</span>
                </div>
              </Card>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  );
}
