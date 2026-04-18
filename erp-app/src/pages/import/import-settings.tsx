import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Settings, Globe, Anchor, FileText, Truck, Ship, Users, Building2,
  ShieldAlert, Calculator, DollarSign, Bell, ArrowLeftRight, Container
} from "lucide-react";

// ── 1. Countries ─────────────────────────────────────────────────────
const FALLBACK_COUNTRIES = [
  { code: "CN", name: "סין", flag: "\u{1F1E8}\u{1F1F3}", agreement: "—", currency: "CNY", active: true },
  { code: "DE", name: "גרמניה", flag: "\u{1F1E9}\u{1F1EA}", agreement: "EU-IL FTA", currency: "EUR", active: true },
  { code: "TR", name: "טורקיה", flag: "\u{1F1F9}\u{1F1F7}", agreement: "TR-IL FTA", currency: "TRY", active: true },
  { code: "IT", name: "איטליה", flag: "\u{1F1EE}\u{1F1F9}", agreement: "EU-IL FTA", currency: "EUR", active: true },
  { code: "BE", name: "בלגיה", flag: "\u{1F1E7}\u{1F1EA}", agreement: "EU-IL FTA", currency: "EUR", active: true },
  { code: "ES", name: "ספרד", flag: "\u{1F1EA}\u{1F1F8}", agreement: "EU-IL FTA", currency: "EUR", active: true },
];

// ── 2. Ports ─────────────────────────────────────────────────────────
const FALLBACK_PORTS = [
  { code: "ILASH", name: "נמל אשדוד", type: "ימי", country: "ישראל", primary: true },
  { code: "ILHFA", name: "נמל חיפה", type: "ימי", country: "ישראל", primary: true },
  { code: "ILBEN", name: "נמל תעופה בן גוריון", type: "אווירי", country: "ישראל", primary: true },
  { code: "CNZOS", name: "Zhongshan Port", type: "ימי", country: "סין", primary: false },
  { code: "DEHAM", name: "Hamburg", type: "ימי", country: "גרמניה", primary: false },
  { code: "ITGOA", name: "Genova", type: "ימי", country: "איטליה", primary: false },
];

// ── 3. Incoterms ─────────────────────────────────────────────────────
const FALLBACK_INCOTERMS = [
  { code: "FOB", name: "Free On Board", desc: "הספק אחראי עד העמסה על הספינה", default: true },
  { code: "CIF", name: "Cost Insurance Freight", desc: "הספק אחראי כולל ביטוח והובלה עד נמל יעד", default: false },
  { code: "EXW", name: "Ex Works", desc: "הקונה אחראי מרגע עזיבת המפעל", default: false },
  { code: "DDP", name: "Delivered Duty Paid", desc: "הספק אחראי כולל מכס עד המחסן", default: false },
  { code: "CFR", name: "Cost and Freight", desc: "הספק אחראי כולל הובלה ללא ביטוח", default: false },
];

// ── 4. Shipment modes ────────────────────────────────────────────────
const FALLBACK_SHIPMENT_MODES = [
  { code: "SEA_FCL", name: "ימי — מכולה שלמה (FCL)", icon: "sea", avgDays: 25, costRange: "$3,500-$5,000/TEU" },
  { code: "SEA_LCL", name: "ימי — מכולה משותפת (LCL)", icon: "sea", avgDays: 30, costRange: "$80-$120/CBM" },
  { code: "AIR", name: "אווירי", icon: "air", avgDays: 5, costRange: "$8-$12/kg" },
  { code: "LAND", name: "יבשתי (משאית)", icon: "land", avgDays: 10, costRange: "$2,500-$4,000/משלוח" },
  { code: "EXPRESS", name: "שליח מהיר (DHL/FedEx)", icon: "express", avgDays: 3, costRange: "$15-$25/kg" },
];

// ── 5. Customs FALLBACK_BROKERS ───────────────────────────────────────────────
const FALLBACK_BROKERS = [
  { name: "שחם עמילות מכס", license: "AMK-5521", port: "אשדוד", rating: "A+", phone: "08-8523100" },
  { name: "מכס פלוס בע\"מ", license: "AMK-3387", port: "חיפה", rating: "A", phone: "04-8501200" },
  { name: "ג.ל.ד עמילות מכס", license: "AMK-4412", port: "אשדוד", rating: "A-", phone: "08-8564300" },
  { name: "נהרי עמילות מכס", license: "AMK-2298", port: "בן גוריון", rating: "B+", phone: "03-9753200" },
];

// ── 6. Freight FALLBACK_FORWARDERS ────────────────────────────────────────────
const FALLBACK_FORWARDERS = [
  { name: "דהן שילוח בינלאומי", speciality: "ימי + אווירי", routes: "אסיה, אירופה", rating: "A", active: true },
  { name: "אלעד לוגיסטיקה", speciality: "ימי FCL", routes: "סין, טורקיה", rating: "A-", active: true },
  { name: "Kuehne+Nagel Israel", speciality: "אווירי", routes: "גרמניה, איטליה", rating: "A+", active: true },
  { name: "גלובל שיפינג", speciality: "ימי LCL", routes: "אירופה", rating: "B+", active: true },
];

// ── 7. Carriers ──────────────────────────────────────────────────────
const FALLBACK_CARRIERS = [
  { name: "ZIM", type: "ימי", routes: "אסיה, אירופה, ים תיכון", transitAvg: "22 ימים" },
  { name: "MSC", type: "ימי", routes: "סין, דרום מזרח אסיה", transitAvg: "28 ימים" },
  { name: "Maersk", type: "ימי", routes: "אירופה, סין", transitAvg: "25 ימים" },
  { name: "El Al Cargo", type: "אווירי", routes: "אירופה", transitAvg: "1 יום" },
  { name: "Turkish Cargo", type: "אווירי", routes: "טורקיה, אסיה", transitAvg: "1 יום" },
];

// ── 8. Document types ────────────────────────────────────────────────
const FALLBACK_DOCUMENT_TYPES = [
  { code: "CI", name: "חשבונית מסחרית (Commercial Invoice)", required: true, stage: "הזמנה" },
  { code: "PL", name: "רשימת אריזה (Packing List)", required: true, stage: "משלוח" },
  { code: "BL", name: "שטר מטען (Bill of Lading)", required: true, stage: "הובלה" },
  { code: "CO", name: "תעודת מקור (Certificate of Origin)", required: true, stage: "מכס" },
  { code: "EUR1", name: "תעודת EUR.1", required: false, stage: "מכס" },
  { code: "INS", name: "פוליסת ביטוח", required: true, stage: "משלוח" },
];

// ── 9. Duty rules ────────────────────────────────────────────────────
const FALLBACK_DUTY_RULES = [
  { hsRange: "7005.xx", category: "זכוכית שטוחה", baseRate: "8%", ftaRate: "0% (EU)", notes: "דורש EUR.1" },
  { hsRange: "7604.xx", category: "פרופילי אלומיניום", baseRate: "6%", ftaRate: "3% (TR)", notes: "הסכם טורקיה" },
  { hsRange: "3214.xx", category: "חומרי אטימה", baseRate: "12%", ftaRate: "—", notes: "אין הסכם" },
  { hsRange: "7318.xx", category: "ברגים וחיבורים", baseRate: "4%", ftaRate: "0% (EU)", notes: "פטור EU" },
  { hsRange: "3208.xx", category: "ציפויים", baseRate: "10%", ftaRate: "5% (TR)", notes: "הסכם חלקי" },
];

// ── 10. Landed cost rules ────────────────────────────────────────────
const FALLBACK_LANDED_COST_RULES = [
  { component: "הובלה ימית", method: "לפי נפח (CBM)", pct: "8-12%", allocTo: "הזמנה" },
  { component: "הובלה אווירית", method: "לפי משקל (kg)", pct: "15-22%", allocTo: "הזמנה" },
  { component: "ביטוח", method: "% מערך הסחורה", pct: "0.5-1.5%", allocTo: "הזמנה" },
  { component: "מכס", method: "שיעור HS Code", pct: "4-12%", allocTo: "פריט" },
  { component: "עמילות", method: "עמלה קבועה + %", pct: "0.8-1.2%", allocTo: "משלוח" },
  { component: "הובלה מקומית", method: "תעריף קבוע", pct: "1-2%", allocTo: "משלוח" },
];

// ── 11. Currency rules ───────────────────────────────────────────────
const FALLBACK_CURRENCY_RULES = [
  { currency: "USD", symbol: "$", source: "בנק ישראל", updateFreq: "יומי", hedging: "חוזה פורוורד", spread: "0.3%" },
  { currency: "EUR", symbol: "\u20AC", source: "בנק ישראל", updateFreq: "יומי", hedging: "חוזה פורוורד", spread: "0.4%" },
  { currency: "CNY", symbol: "\u00A5", source: "בנק ישראל", updateFreq: "יומי", hedging: "אופציה", spread: "0.8%" },
  { currency: "TRY", symbol: "\u20BA", source: "בנק ישראל", updateFreq: "יומי", hedging: "—", spread: "1.2%" },
  { currency: "GBP", symbol: "\u00A3", source: "בנק ישראל", updateFreq: "יומי", hedging: "חוזה פורוורד", spread: "0.4%" },
];

// ── 12. Alert rules ──────────────────────────────────────────────────
const FALLBACK_ALERT_RULES = [
  { event: "עיכוב משלוח > 3 ימים", severity: "קריטי", channel: "SMS + מייל", recipients: "מנהל יבוא, מנכ\"ל" },
  { event: "חריגת Landed Cost > 5%", severity: "גבוה", channel: "מייל", recipients: "מנהל יבוא, כספים" },
  { event: "מסמך חסר למשלוח פעיל", severity: "גבוה", channel: "מייל + מערכת", recipients: "מנהל יבוא" },
  { event: "תשלום מכס בפיגור", severity: "קריטי", channel: "SMS + מייל", recipients: "כספים, מנכ\"ל" },
  { event: "שינוי שער מטבע > 2%", severity: "בינוני", channel: "מייל", recipients: "כספים" },
  { event: "ספק — ציון מתחת 80", severity: "בינוני", channel: "מערכת", recipients: "מנהל יבוא" },
];

const severityBadge = (s: string) => {
  const m: Record<string, string> = {
    "קריטי": "bg-red-500/20 text-red-300 border-red-500/30",
    "גבוה": "bg-orange-500/20 text-orange-300 border-orange-500/30",
    "בינוני": "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
    "נמוך": "bg-slate-500/20 text-slate-300 border-slate-500/30",
  };
  return m[s] || m["בינוני"];
};

export default function ImportSettings() {
  const { data: countries = FALLBACK_COUNTRIES } = useQuery({
    queryKey: ["import-countries"],
    queryFn: async () => {
      const res = await authFetch("/api/import/import-settings/countries");
      if (!res.ok) return FALLBACK_COUNTRIES;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_COUNTRIES;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: ports = FALLBACK_PORTS } = useQuery({
    queryKey: ["import-ports"],
    queryFn: async () => {
      const res = await authFetch("/api/import/import-settings/ports");
      if (!res.ok) return FALLBACK_PORTS;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_PORTS;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: incoterms = FALLBACK_INCOTERMS } = useQuery({
    queryKey: ["import-incoterms"],
    queryFn: async () => {
      const res = await authFetch("/api/import/import-settings/incoterms");
      if (!res.ok) return FALLBACK_INCOTERMS;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_INCOTERMS;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: shipmentModes = FALLBACK_SHIPMENT_MODES } = useQuery({
    queryKey: ["import-shipment-modes"],
    queryFn: async () => {
      const res = await authFetch("/api/import/import-settings/shipment-modes");
      if (!res.ok) return FALLBACK_SHIPMENT_MODES;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_SHIPMENT_MODES;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: brokers = FALLBACK_BROKERS } = useQuery({
    queryKey: ["import-brokers"],
    queryFn: async () => {
      const res = await authFetch("/api/import/import-settings/brokers");
      if (!res.ok) return FALLBACK_BROKERS;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_BROKERS;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: forwarders = FALLBACK_FORWARDERS } = useQuery({
    queryKey: ["import-forwarders"],
    queryFn: async () => {
      const res = await authFetch("/api/import/import-settings/forwarders");
      if (!res.ok) return FALLBACK_FORWARDERS;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_FORWARDERS;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: carriers = FALLBACK_CARRIERS } = useQuery({
    queryKey: ["import-carriers"],
    queryFn: async () => {
      const res = await authFetch("/api/import/import-settings/carriers");
      if (!res.ok) return FALLBACK_CARRIERS;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_CARRIERS;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: documentTypes = FALLBACK_DOCUMENT_TYPES } = useQuery({
    queryKey: ["import-document-types"],
    queryFn: async () => {
      const res = await authFetch("/api/import/import-settings/document-types");
      if (!res.ok) return FALLBACK_DOCUMENT_TYPES;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_DOCUMENT_TYPES;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: dutyRules = FALLBACK_DUTY_RULES } = useQuery({
    queryKey: ["import-duty-rules"],
    queryFn: async () => {
      const res = await authFetch("/api/import/import-settings/duty-rules");
      if (!res.ok) return FALLBACK_DUTY_RULES;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_DUTY_RULES;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: landedCostRules = FALLBACK_LANDED_COST_RULES } = useQuery({
    queryKey: ["import-landed-cost-rules"],
    queryFn: async () => {
      const res = await authFetch("/api/import/import-settings/landed-cost-rules");
      if (!res.ok) return FALLBACK_LANDED_COST_RULES;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_LANDED_COST_RULES;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: currencyRules = FALLBACK_CURRENCY_RULES } = useQuery({
    queryKey: ["import-currency-rules"],
    queryFn: async () => {
      const res = await authFetch("/api/import/import-settings/currency-rules");
      if (!res.ok) return FALLBACK_CURRENCY_RULES;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_CURRENCY_RULES;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: alertRules = FALLBACK_ALERT_RULES } = useQuery({
    queryKey: ["import-alert-rules"],
    queryFn: async () => {
      const res = await authFetch("/api/import/import-settings/alert-rules");
      if (!res.ok) return FALLBACK_ALERT_RULES;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_ALERT_RULES;
    },
    staleTime: 30_000,
    retry: 1,
  });


  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-slate-500/10">
          <Settings className="h-6 w-6 text-slate-300" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">הגדרות יבוא</h1>
          <p className="text-slate-400 text-sm">טכנו-כל עוזי — 12 טבלאות הגדרה לניהול יבוא</p>
        </div>
      </div>

      {/* ── Tabs ────────────────────────────────────────────────── */}
      <Tabs defaultValue="countries" className="space-y-4">
        <TabsList className="bg-slate-800/50 border border-slate-700 flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="countries" className="data-[state=active]:bg-teal-500/20 data-[state=active]:text-teal-300 text-xs"><Globe className="h-3 w-3 ml-1" />מדינות</TabsTrigger>
          <TabsTrigger value="ports" className="data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-300 text-xs"><Anchor className="h-3 w-3 ml-1" />נמלים</TabsTrigger>
          <TabsTrigger value="incoterms" className="data-[state=active]:bg-blue-500/20 data-[state=active]:text-blue-300 text-xs"><ArrowLeftRight className="h-3 w-3 ml-1" />Incoterms</TabsTrigger>
          <TabsTrigger value="modes" className="data-[state=active]:bg-indigo-500/20 data-[state=active]:text-indigo-300 text-xs"><Ship className="h-3 w-3 ml-1" />אמצעי משלוח</TabsTrigger>
          <TabsTrigger value="brokers" className="data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-300 text-xs"><Users className="h-3 w-3 ml-1" />עמילי מכס</TabsTrigger>
          <TabsTrigger value="forwarders" className="data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-300 text-xs"><Truck className="h-3 w-3 ml-1" />משלחים</TabsTrigger>
          <TabsTrigger value="carriers" className="data-[state=active]:bg-sky-500/20 data-[state=active]:text-sky-300 text-xs"><Container className="h-3 w-3 ml-1" />מובילים</TabsTrigger>
          <TabsTrigger value="doctypes" className="data-[state=active]:bg-green-500/20 data-[state=active]:text-green-300 text-xs"><FileText className="h-3 w-3 ml-1" />סוגי מסמכים</TabsTrigger>
          <TabsTrigger value="duty" className="data-[state=active]:bg-orange-500/20 data-[state=active]:text-orange-300 text-xs"><ShieldAlert className="h-3 w-3 ml-1" />כללי מכס</TabsTrigger>
          <TabsTrigger value="landed" className="data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-300 text-xs"><Calculator className="h-3 w-3 ml-1" />Landed Cost</TabsTrigger>
          <TabsTrigger value="currency" className="data-[state=active]:bg-yellow-500/20 data-[state=active]:text-yellow-300 text-xs"><DollarSign className="h-3 w-3 ml-1" />מטבעות</TabsTrigger>
          <TabsTrigger value="alerts" className="data-[state=active]:bg-red-500/20 data-[state=active]:text-red-300 text-xs"><Bell className="h-3 w-3 ml-1" />התראות</TabsTrigger>
        </TabsList>

        {/* ── 1. Countries ──────────────────────────────────────── */}
        <TabsContent value="countries">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="pb-3"><CardTitle className="text-white flex items-center gap-2"><Globe className="h-4 w-4 text-teal-400" /> מדינות יבוא</CardTitle></CardHeader>
            <CardContent><Table><TableHeader><TableRow className="border-slate-700"><TableHead className="text-slate-400 text-right">קוד</TableHead><TableHead className="text-slate-400 text-right">מדינה</TableHead><TableHead className="text-slate-400 text-right">הסכם סחר</TableHead><TableHead className="text-slate-400 text-right">מטבע</TableHead><TableHead className="text-slate-400 text-right">סטטוס</TableHead></TableRow></TableHeader>
              <TableBody>{countries.map((r, i) => (
                <TableRow key={i} className="border-slate-700/50"><TableCell className="text-blue-400 font-mono">{r.code}</TableCell><TableCell className="text-slate-300">{r.flag} {r.name}</TableCell><TableCell className="text-slate-400">{r.agreement}</TableCell><TableCell className="text-slate-300">{r.currency}</TableCell><TableCell><Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30">פעיל</Badge></TableCell></TableRow>
              ))}</TableBody></Table></CardContent>
          </Card>
        </TabsContent>

        {/* ── 2. Ports ──────────────────────────────────────────── */}
        <TabsContent value="ports">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="pb-3"><CardTitle className="text-white flex items-center gap-2"><Anchor className="h-4 w-4 text-cyan-400" /> נמלים</CardTitle></CardHeader>
            <CardContent><Table><TableHeader><TableRow className="border-slate-700"><TableHead className="text-slate-400 text-right">קוד</TableHead><TableHead className="text-slate-400 text-right">שם</TableHead><TableHead className="text-slate-400 text-right">סוג</TableHead><TableHead className="text-slate-400 text-right">מדינה</TableHead><TableHead className="text-slate-400 text-right">ראשי</TableHead></TableRow></TableHeader>
              <TableBody>{ports.map((r, i) => (
                <TableRow key={i} className="border-slate-700/50"><TableCell className="text-blue-400 font-mono text-sm">{r.code}</TableCell><TableCell className="text-slate-300">{r.name}</TableCell><TableCell className="text-slate-400">{r.type}</TableCell><TableCell className="text-slate-300">{r.country}</TableCell><TableCell>{r.primary ? <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30">ראשי</Badge> : <Badge className="bg-slate-500/20 text-slate-400 border-slate-500/30">מוצא</Badge>}</TableCell></TableRow>
              ))}</TableBody></Table></CardContent>
          </Card>
        </TabsContent>

        {/* ── 3. Incoterms ──────────────────────────────────────── */}
        <TabsContent value="incoterms">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="pb-3"><CardTitle className="text-white flex items-center gap-2"><ArrowLeftRight className="h-4 w-4 text-blue-400" /> תנאי מסירה (Incoterms 2020)</CardTitle></CardHeader>
            <CardContent><Table><TableHeader><TableRow className="border-slate-700"><TableHead className="text-slate-400 text-right">קוד</TableHead><TableHead className="text-slate-400 text-right">שם</TableHead><TableHead className="text-slate-400 text-right">תיאור</TableHead><TableHead className="text-slate-400 text-right">ברירת מחדל</TableHead></TableRow></TableHeader>
              <TableBody>{incoterms.map((r, i) => (
                <TableRow key={i} className="border-slate-700/50"><TableCell className="text-blue-400 font-mono font-bold">{r.code}</TableCell><TableCell className="text-white">{r.name}</TableCell><TableCell className="text-slate-400 text-sm">{r.desc}</TableCell><TableCell>{r.default ? <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30">ברירת מחדל</Badge> : <span className="text-slate-500">—</span>}</TableCell></TableRow>
              ))}</TableBody></Table></CardContent>
          </Card>
        </TabsContent>

        {/* ── 4. Shipment modes ─────────────────────────────────── */}
        <TabsContent value="modes">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="pb-3"><CardTitle className="text-white flex items-center gap-2"><Ship className="h-4 w-4 text-indigo-400" /> אמצעי משלוח</CardTitle></CardHeader>
            <CardContent><Table><TableHeader><TableRow className="border-slate-700"><TableHead className="text-slate-400 text-right">קוד</TableHead><TableHead className="text-slate-400 text-right">שם</TableHead><TableHead className="text-slate-400 text-right">זמן ממוצע</TableHead><TableHead className="text-slate-400 text-right">טווח עלות</TableHead></TableRow></TableHeader>
              <TableBody>{shipmentModes.map((r, i) => (
                <TableRow key={i} className="border-slate-700/50"><TableCell className="text-blue-400 font-mono text-sm">{r.code}</TableCell><TableCell className="text-slate-300">{r.name}</TableCell><TableCell className="text-amber-300">{r.avgDays} ימים</TableCell><TableCell className="text-slate-400">{r.costRange}</TableCell></TableRow>
              ))}</TableBody></Table></CardContent>
          </Card>
        </TabsContent>

        {/* ── 5. Customs brokers ────────────────────────────────── */}
        <TabsContent value="brokers">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="pb-3"><CardTitle className="text-white flex items-center gap-2"><Users className="h-4 w-4 text-amber-400" /> עמילי מכס</CardTitle></CardHeader>
            <CardContent><Table><TableHeader><TableRow className="border-slate-700"><TableHead className="text-slate-400 text-right">שם</TableHead><TableHead className="text-slate-400 text-right">רישיון</TableHead><TableHead className="text-slate-400 text-right">נמל</TableHead><TableHead className="text-slate-400 text-right">דירוג</TableHead><TableHead className="text-slate-400 text-right">טלפון</TableHead></TableRow></TableHeader>
              <TableBody>{brokers.map((r, i) => (
                <TableRow key={i} className="border-slate-700/50"><TableCell className="text-white">{r.name}</TableCell><TableCell className="text-blue-400 font-mono text-sm">{r.license}</TableCell><TableCell className="text-slate-300">{r.port}</TableCell><TableCell><Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30">{r.rating}</Badge></TableCell><TableCell className="text-slate-400 font-mono text-sm" dir="ltr">{r.phone}</TableCell></TableRow>
              ))}</TableBody></Table></CardContent>
          </Card>
        </TabsContent>

        {/* ── 6. Freight forwarders ─────────────────────────────── */}
        <TabsContent value="forwarders">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="pb-3"><CardTitle className="text-white flex items-center gap-2"><Truck className="h-4 w-4 text-purple-400" /> משלחים בינלאומיים</CardTitle></CardHeader>
            <CardContent><Table><TableHeader><TableRow className="border-slate-700"><TableHead className="text-slate-400 text-right">שם</TableHead><TableHead className="text-slate-400 text-right">התמחות</TableHead><TableHead className="text-slate-400 text-right">מסלולים</TableHead><TableHead className="text-slate-400 text-right">דירוג</TableHead></TableRow></TableHeader>
              <TableBody>{forwarders.map((r, i) => (
                <TableRow key={i} className="border-slate-700/50"><TableCell className="text-white">{r.name}</TableCell><TableCell className="text-slate-300">{r.speciality}</TableCell><TableCell className="text-slate-400">{r.routes}</TableCell><TableCell><Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30">{r.rating}</Badge></TableCell></TableRow>
              ))}</TableBody></Table></CardContent>
          </Card>
        </TabsContent>

        {/* ── 7. Carriers ───────────────────────────────────────── */}
        <TabsContent value="carriers">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="pb-3"><CardTitle className="text-white flex items-center gap-2"><Container className="h-4 w-4 text-sky-400" /> מובילים (Carriers)</CardTitle></CardHeader>
            <CardContent><Table><TableHeader><TableRow className="border-slate-700"><TableHead className="text-slate-400 text-right">שם</TableHead><TableHead className="text-slate-400 text-right">סוג</TableHead><TableHead className="text-slate-400 text-right">מסלולים</TableHead><TableHead className="text-slate-400 text-right">זמן מעבר ממוצע</TableHead></TableRow></TableHeader>
              <TableBody>{carriers.map((r, i) => (
                <TableRow key={i} className="border-slate-700/50"><TableCell className="text-white font-semibold">{r.name}</TableCell><TableCell className="text-slate-300">{r.type}</TableCell><TableCell className="text-slate-400">{r.routes}</TableCell><TableCell className="text-amber-300">{r.transitAvg}</TableCell></TableRow>
              ))}</TableBody></Table></CardContent>
          </Card>
        </TabsContent>

        {/* ── 8. Document types ─────────────────────────────────── */}
        <TabsContent value="doctypes">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="pb-3"><CardTitle className="text-white flex items-center gap-2"><FileText className="h-4 w-4 text-green-400" /> סוגי מסמכי יבוא</CardTitle></CardHeader>
            <CardContent><Table><TableHeader><TableRow className="border-slate-700"><TableHead className="text-slate-400 text-right">קוד</TableHead><TableHead className="text-slate-400 text-right">שם</TableHead><TableHead className="text-slate-400 text-right">שלב</TableHead><TableHead className="text-slate-400 text-right">חובה</TableHead></TableRow></TableHeader>
              <TableBody>{documentTypes.map((r, i) => (
                <TableRow key={i} className="border-slate-700/50"><TableCell className="text-blue-400 font-mono">{r.code}</TableCell><TableCell className="text-slate-300">{r.name}</TableCell><TableCell className="text-slate-400">{r.stage}</TableCell><TableCell>{r.required ? <Badge className="bg-red-500/20 text-red-300 border-red-500/30">חובה</Badge> : <Badge className="bg-slate-500/20 text-slate-400 border-slate-500/30">אופציונלי</Badge>}</TableCell></TableRow>
              ))}</TableBody></Table></CardContent>
          </Card>
        </TabsContent>

        {/* ── 9. Duty rules ─────────────────────────────────────── */}
        <TabsContent value="duty">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="pb-3"><CardTitle className="text-white flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-orange-400" /> כללי מכס ושיעורי חיוב</CardTitle></CardHeader>
            <CardContent><Table><TableHeader><TableRow className="border-slate-700"><TableHead className="text-slate-400 text-right">טווח HS</TableHead><TableHead className="text-slate-400 text-right">קטגוריה</TableHead><TableHead className="text-slate-400 text-right">שיעור בסיס</TableHead><TableHead className="text-slate-400 text-right">שיעור FTA</TableHead><TableHead className="text-slate-400 text-right">הערות</TableHead></TableRow></TableHeader>
              <TableBody>{dutyRules.map((r, i) => (
                <TableRow key={i} className="border-slate-700/50"><TableCell className="text-blue-400 font-mono">{r.hsRange}</TableCell><TableCell className="text-slate-300">{r.category}</TableCell><TableCell className="text-amber-300">{r.baseRate}</TableCell><TableCell className="text-emerald-400">{r.ftaRate}</TableCell><TableCell className="text-slate-400 text-sm">{r.notes}</TableCell></TableRow>
              ))}</TableBody></Table></CardContent>
          </Card>
        </TabsContent>

        {/* ── 10. Landed cost rules ─────────────────────────────── */}
        <TabsContent value="landed">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="pb-3"><CardTitle className="text-white flex items-center gap-2"><Calculator className="h-4 w-4 text-emerald-400" /> כללי חישוב Landed Cost</CardTitle></CardHeader>
            <CardContent><Table><TableHeader><TableRow className="border-slate-700"><TableHead className="text-slate-400 text-right">רכיב</TableHead><TableHead className="text-slate-400 text-right">שיטת חישוב</TableHead><TableHead className="text-slate-400 text-right">טווח %</TableHead><TableHead className="text-slate-400 text-right">הקצאה ל-</TableHead></TableRow></TableHeader>
              <TableBody>{landedCostRules.map((r, i) => (
                <TableRow key={i} className="border-slate-700/50"><TableCell className="text-white">{r.component}</TableCell><TableCell className="text-slate-300">{r.method}</TableCell><TableCell className="text-amber-300">{r.pct}</TableCell><TableCell className="text-slate-400">{r.allocTo}</TableCell></TableRow>
              ))}</TableBody></Table></CardContent>
          </Card>
        </TabsContent>

        {/* ── 11. Currency rules ────────────────────────────────── */}
        <TabsContent value="currency">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="pb-3"><CardTitle className="text-white flex items-center gap-2"><DollarSign className="h-4 w-4 text-yellow-400" /> כללי מטבע וגידור</CardTitle></CardHeader>
            <CardContent><Table><TableHeader><TableRow className="border-slate-700"><TableHead className="text-slate-400 text-right">מטבע</TableHead><TableHead className="text-slate-400 text-right">סימן</TableHead><TableHead className="text-slate-400 text-right">מקור שער</TableHead><TableHead className="text-slate-400 text-right">עדכון</TableHead><TableHead className="text-slate-400 text-right">גידור</TableHead><TableHead className="text-slate-400 text-right">מרווח</TableHead></TableRow></TableHeader>
              <TableBody>{currencyRules.map((r, i) => (
                <TableRow key={i} className="border-slate-700/50"><TableCell className="text-blue-400 font-mono font-bold">{r.currency}</TableCell><TableCell className="text-white text-lg">{r.symbol}</TableCell><TableCell className="text-slate-300">{r.source}</TableCell><TableCell className="text-slate-400">{r.updateFreq}</TableCell><TableCell className="text-slate-300">{r.hedging}</TableCell><TableCell className="text-amber-300">{r.spread}</TableCell></TableRow>
              ))}</TableBody></Table></CardContent>
          </Card>
        </TabsContent>

        {/* ── 12. Alert rules ───────────────────────────────────── */}
        <TabsContent value="alerts">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="pb-3"><CardTitle className="text-white flex items-center gap-2"><Bell className="h-4 w-4 text-red-400" /> כללי התראות</CardTitle></CardHeader>
            <CardContent><Table><TableHeader><TableRow className="border-slate-700"><TableHead className="text-slate-400 text-right">אירוע</TableHead><TableHead className="text-slate-400 text-right">חומרה</TableHead><TableHead className="text-slate-400 text-right">ערוץ</TableHead><TableHead className="text-slate-400 text-right">נמענים</TableHead></TableRow></TableHeader>
              <TableBody>{alertRules.map((r, i) => (
                <TableRow key={i} className="border-slate-700/50"><TableCell className="text-slate-300">{r.event}</TableCell><TableCell><Badge className={severityBadge(r.severity)}>{r.severity}</Badge></TableCell><TableCell className="text-slate-400">{r.channel}</TableCell><TableCell className="text-slate-300 text-sm">{r.recipients}</TableCell></TableRow>
              ))}</TableBody></Table></CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
