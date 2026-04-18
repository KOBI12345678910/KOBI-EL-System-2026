import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { MapPin, Ship, Anchor, Package, ShieldCheck, Factory, Clock, AlertTriangle, CalendarClock, FileWarning, Ban, Truck } from "lucide-react";

const FALLBACK_STAGES = [
  { key: "ordered", label: "הוזמן", color: "bg-slate-600", icon: Package },
  { key: "shipped", label: "נשלח", color: "bg-blue-700", icon: Ship },
  { key: "in_transit", label: "בדרך", color: "bg-cyan-600", icon: Truck },
  { key: "at_port", label: "בנמל", color: "bg-amber-600", icon: Anchor },
  { key: "customs", label: "מכס", color: "bg-orange-600", icon: ShieldCheck },
  { key: "cleared", label: "שוחרר", color: "bg-emerald-600", icon: ShieldCheck },
  { key: "factory", label: "במפעל", color: "bg-green-600", icon: Factory },
];

const FALLBACK_SHIPMENTS = [
  { id: "SHP-101", supplier: "Foshan Glass Co.", country: "CN", flag: "🇨🇳", stage: "in_transit", eta: "2026-04-18", daysLeft: 10, alerts: ["delay"], po: "PO-IM-001", value: 45000 },
  { id: "SHP-102", supplier: "Schüco International", country: "DE", flag: "🇩🇪", stage: "customs", eta: "2026-04-12", daysLeft: 4, alerts: ["docs"], po: "PO-IM-002", value: 120000 },
  { id: "SHP-103", supplier: "Alumil SA", country: "GR", flag: "🇬🇷", stage: "ordered", eta: "2026-05-01", daysLeft: 23, alerts: [], po: "PO-IM-003", value: 78000 },
  { id: "SHP-104", supplier: "Technal India", country: "IN", flag: "🇮🇳", stage: "factory", eta: "2026-04-05", daysLeft: 0, alerts: [], po: "PO-IM-004", value: 32000 },
  { id: "SHP-105", supplier: "YKK AP", country: "JP", flag: "🇯🇵", stage: "at_port", eta: "2026-04-14", daysLeft: 6, alerts: ["hold"], po: "PO-IM-005", value: 56000 },
  { id: "SHP-106", supplier: "Reynaers Aluminium", country: "BE", flag: "🇧🇪", stage: "shipped", eta: "2026-04-22", daysLeft: 14, alerts: [], po: "PO-IM-006", value: 91000 },
  { id: "SHP-107", supplier: "Tostem (Lixil)", country: "JP", flag: "🇯🇵", stage: "cleared", eta: "2026-04-09", daysLeft: 1, alerts: [], po: "PO-IM-007", value: 67000 },
  { id: "SHP-108", supplier: "Guangdong Hardware", country: "CN", flag: "🇨🇳", stage: "in_transit", eta: "2026-04-20", daysLeft: 12, alerts: ["delay"], po: "PO-IM-008", value: 38000 },
];

const FALLBACK_MILESTONES = [
  { shipment: "SHP-101", milestone: "הזמנה אושרה", date: "2026-03-10", done: true },
  { shipment: "SHP-101", milestone: "נשלח מהמפעל", date: "2026-03-18", done: true },
  { shipment: "SHP-101", milestone: "הגעה לנמל מוצא", date: "2026-03-22", done: true },
  { shipment: "SHP-101", milestone: "הגעה לנמל יעד", date: "2026-04-15", done: false },
  { shipment: "SHP-101", milestone: "שחרור מכס", date: "2026-04-17", done: false },
  { shipment: "SHP-102", milestone: "הזמנה אושרה", date: "2026-02-28", done: true },
  { shipment: "SHP-102", milestone: "נשלח מהמפעל", date: "2026-03-08", done: true },
  { shipment: "SHP-102", milestone: "הגעה לנמל יעד", date: "2026-03-28", done: true },
  { shipment: "SHP-102", milestone: "שחרור מכס", date: "2026-04-12", done: false },
  { shipment: "SHP-105", milestone: "הזמנה אושרה", date: "2026-03-01", done: true },
  { shipment: "SHP-105", milestone: "נשלח מהמפעל", date: "2026-03-12", done: true },
  { shipment: "SHP-105", milestone: "הגעה לנמל יעד", date: "2026-04-06", done: true },
  { shipment: "SHP-105", milestone: "שחרור מכס", date: "2026-04-14", done: false },
];

const FALLBACK_ETA_CHANGES = [
  { shipment: "SHP-101", date: "2026-03-25", oldEta: "2026-04-12", newEta: "2026-04-18", reason: "עיכוב בנמל מוצא", days: 6 },
  { shipment: "SHP-108", date: "2026-04-01", oldEta: "2026-04-16", newEta: "2026-04-20", reason: "סערה בים", days: 4 },
  { shipment: "SHP-102", date: "2026-03-20", oldEta: "2026-04-08", newEta: "2026-04-12", reason: "עומס בנמל חיפה", days: 4 },
  { shipment: "SHP-106", date: "2026-04-03", oldEta: "2026-04-20", newEta: "2026-04-22", reason: "שינוי מסלול ספינה", days: 2 },
];

const FALLBACK_DELAYS = [
  { shipment: "SHP-101", reason: "עיכוב בנמל שנזן", category: "נמל מוצא", days: 6, impact: "high" },
  { shipment: "SHP-108", reason: "תנאי מזג אוויר קשים", category: "מזג אוויר", days: 4, impact: "medium" },
  { shipment: "SHP-102", reason: "חוסר מסמכים מקוריים", category: "מסמכים", days: 3, impact: "high" },
  { shipment: "SHP-105", reason: "בדיקה רנדומלית במכס", category: "מכס", days: 2, impact: "medium" },
];

const FALLBACK_CUSTOMS_HOLDS = [
  { shipment: "SHP-102", holdType: "מסמכים חסרים", since: "2026-04-08", status: "open", details: "חסר אישור CE מקורי" },
  { shipment: "SHP-105", holdType: "בדיקה פיזית", since: "2026-04-07", status: "in_progress", details: "דגימת סחורה לבדיקת תקן" },
];

const FALLBACK_MISSING_DOCS = [
  { shipment: "SHP-102", document: "אישור CE מקורי", required: "2026-04-06", status: "missing", responsible: "ספק" },
  { shipment: "SHP-102", document: "תעודת מקור EUR.1", required: "2026-04-06", status: "missing", responsible: "סוכן מכס" },
  { shipment: "SHP-101", document: "שטר מטען B/L", required: "2026-04-10", status: "pending", responsible: "חברת שילוח" },
  { shipment: "SHP-108", document: "חשבון מסחרי", required: "2026-04-12", status: "pending", responsible: "ספק" },
];

const FALLBACK_FACTORY_DELIVERIES = [
  { shipment: "SHP-104", date: "2026-04-05", arrived: true, warehouse: "מחסן A", receiver: "דוד כהן", items: 120, qcStatus: "passed" },
  { shipment: "SHP-107", date: "2026-04-10", arrived: false, warehouse: "מחסן B", receiver: "משה לוי", items: 85, qcStatus: "pending" },
];

const alertBadge = (alert: string) => {
  switch (alert) {
    case "delay": return <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse" title="עיכוב" />;
    case "docs": return <span className="inline-block w-2 h-2 rounded-full bg-amber-500 animate-pulse" title="מסמכים חסרים" />;
    case "hold": return <span className="inline-block w-2 h-2 rounded-full bg-orange-500 animate-pulse" title="עצור במכס" />;
    default: return null;
  }
};

export default function ImportTracking() {
  const { data: stages = FALLBACK_STAGES } = useQuery({
    queryKey: ["import-stages"],
    queryFn: async () => {
      const res = await authFetch("/api/import/import-tracking/stages");
      if (!res.ok) return FALLBACK_STAGES;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_STAGES;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: shipments = FALLBACK_SHIPMENTS } = useQuery({
    queryKey: ["import-shipments"],
    queryFn: async () => {
      const res = await authFetch("/api/import/import-tracking/shipments");
      if (!res.ok) return FALLBACK_SHIPMENTS;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_SHIPMENTS;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: milestones = FALLBACK_MILESTONES } = useQuery({
    queryKey: ["import-milestones"],
    queryFn: async () => {
      const res = await authFetch("/api/import/import-tracking/milestones");
      if (!res.ok) return FALLBACK_MILESTONES;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_MILESTONES;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: etaChanges = FALLBACK_ETA_CHANGES } = useQuery({
    queryKey: ["import-eta-changes"],
    queryFn: async () => {
      const res = await authFetch("/api/import/import-tracking/eta-changes");
      if (!res.ok) return FALLBACK_ETA_CHANGES;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_ETA_CHANGES;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: delays = FALLBACK_DELAYS } = useQuery({
    queryKey: ["import-delays"],
    queryFn: async () => {
      const res = await authFetch("/api/import/import-tracking/delays");
      if (!res.ok) return FALLBACK_DELAYS;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_DELAYS;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: customsHolds = FALLBACK_CUSTOMS_HOLDS } = useQuery({
    queryKey: ["import-customs-holds"],
    queryFn: async () => {
      const res = await authFetch("/api/import/import-tracking/customs-holds");
      if (!res.ok) return FALLBACK_CUSTOMS_HOLDS;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_CUSTOMS_HOLDS;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: missingDocs = FALLBACK_MISSING_DOCS } = useQuery({
    queryKey: ["import-missing-docs"],
    queryFn: async () => {
      const res = await authFetch("/api/import/import-tracking/missing-docs");
      if (!res.ok) return FALLBACK_MISSING_DOCS;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_MISSING_DOCS;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: factoryDeliveries = FALLBACK_FACTORY_DELIVERIES } = useQuery({
    queryKey: ["import-factory-deliveries"],
    queryFn: async () => {
      const res = await authFetch("/api/import/import-tracking/factory-deliveries");
      if (!res.ok) return FALLBACK_FACTORY_DELIVERIES;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_FACTORY_DELIVERIES;
    },
    staleTime: 30_000,
    retry: 1,
  });


  const [tab, setTab] = useState("board");

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="relative">
          <MapPin className="h-7 w-7 text-blue-400" />
          <span className="absolute -top-1 -left-1 w-3 h-3 bg-blue-400 rounded-full animate-pulse" />
        </div>
        <h1 className="text-2xl font-bold">מעקב יבוא</h1>
        <Badge variant="outline" className="mr-auto text-xs">{shipments.length} משלוחים פעילים</Badge>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-[#1a1a2e]">
          <TabsTrigger value="board">לוח מעקב</TabsTrigger>
          <TabsTrigger value="milestones">אבני דרך</TabsTrigger>
          <TabsTrigger value="eta">שינויי ETA</TabsTrigger>
          <TabsTrigger value="delays">עיכובים</TabsTrigger>
          <TabsTrigger value="customs">מכס</TabsTrigger>
          <TabsTrigger value="docs">מסמכים</TabsTrigger>
          <TabsTrigger value="delivery">משלוח למפעל</TabsTrigger>
        </TabsList>

        {/* ── Kanban Board ── */}
        <TabsContent value="board" className="mt-4">
          <div className="flex gap-3 overflow-x-auto pb-4">
            {stages.map((stage) => {
              const items = shipments.filter((s) => s.stage === stage.key);
              const StageIcon = stage.icon;
              return (
                <div key={stage.key} className="min-w-[210px] flex-1">
                  <div className={`rounded-t-lg px-3 py-2 text-white text-sm font-semibold flex items-center gap-2 ${stage.color}`}>
                    <StageIcon className="h-4 w-4" />
                    {stage.label}
                    <Badge variant="secondary" className="mr-auto text-xs px-1.5">{items.length}</Badge>
                  </div>
                  <div className="bg-[#0f0f1a] rounded-b-lg border border-t-0 border-[#2a2a3e] min-h-[180px] space-y-2 p-2">
                    {items.length === 0 && <p className="text-xs text-gray-600 text-center pt-6">אין משלוחים</p>}
                    {items.map((shp) => (
                      <Card key={shp.id} className="bg-[#16162a] border-[#2a2a3e] hover:border-blue-500/50 transition-colors cursor-pointer">
                        <CardContent className="p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-bold text-blue-400">{shp.id}</span>
                            <span className="text-lg">{shp.flag}</span>
                          </div>
                          <p className="text-xs text-gray-400 truncate">{shp.supplier}</p>
                          <div className="flex items-center gap-2 text-xs text-gray-500">
                            <Clock className="h-3 w-3" />
                            <span>ETA: {shp.eta}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-gray-500">{shp.daysLeft > 0 ? `${shp.daysLeft} ימים` : "הגיע"}</span>
                            <div className="flex gap-1">{shp.alerts.map((a, i) => <span key={i}>{alertBadge(a)}</span>)}</div>
                          </div>
                          <Progress value={((stages.findIndex((st) => st.key === shp.stage) + 1) / stages.length) * 100} className="h-1" />
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </TabsContent>

        {/* ── Milestones ── */}
        <TabsContent value="milestones" className="mt-4">
          <Card className="bg-[#12121f] border-[#2a2a3e]">
            <CardHeader><CardTitle className="text-lg flex items-center gap-2"><CalendarClock className="h-5 w-5 text-purple-400" /> אבני דרך - ציר זמן</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#2a2a3e] text-gray-400 text-right">
                      <th className="py-2 px-3 font-medium">משלוח</th>
                      <th className="py-2 px-3 font-medium">אבן דרך</th>
                      <th className="py-2 px-3 font-medium">תאריך</th>
                      <th className="py-2 px-3 font-medium">סטטוס</th>
                    </tr>
                  </thead>
                  <tbody>
                    {milestones.map((m, i) => (
                      <tr key={i} className="border-b border-[#1a1a2e] hover:bg-[#1a1a2e]">
                        <td className="py-2 px-3 font-mono text-blue-400">{m.shipment}</td>
                        <td className="py-2 px-3">{m.milestone}</td>
                        <td className="py-2 px-3 text-gray-400">{m.date}</td>
                        <td className="py-2 px-3">
                          {m.done
                            ? <Badge className="bg-green-500/20 text-green-400">הושלם</Badge>
                            : <Badge className="bg-gray-500/20 text-gray-400">ממתין</Badge>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── ETA Changes ── */}
        <TabsContent value="eta" className="mt-4">
          <Card className="bg-[#12121f] border-[#2a2a3e]">
            <CardHeader><CardTitle className="text-lg flex items-center gap-2"><CalendarClock className="h-5 w-5 text-amber-400" /> יומן שינויי ETA</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#2a2a3e] text-gray-400 text-right">
                      <th className="py-2 px-3 font-medium">משלוח</th>
                      <th className="py-2 px-3 font-medium">תאריך שינוי</th>
                      <th className="py-2 px-3 font-medium">ETA קודם</th>
                      <th className="py-2 px-3 font-medium">ETA חדש</th>
                      <th className="py-2 px-3 font-medium">הפרש</th>
                      <th className="py-2 px-3 font-medium">סיבה</th>
                    </tr>
                  </thead>
                  <tbody>
                    {etaChanges.map((e, i) => (
                      <tr key={i} className="border-b border-[#1a1a2e] hover:bg-[#1a1a2e]">
                        <td className="py-2 px-3 font-mono text-blue-400">{e.shipment}</td>
                        <td className="py-2 px-3 text-gray-400">{e.date}</td>
                        <td className="py-2 px-3 line-through text-red-400/70">{e.oldEta}</td>
                        <td className="py-2 px-3 text-green-400">{e.newEta}</td>
                        <td className="py-2 px-3"><Badge className="bg-red-500/20 text-red-400">+{e.days} ימים</Badge></td>
                        <td className="py-2 px-3 text-gray-300">{e.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Delays ── */}
        <TabsContent value="delays" className="mt-4">
          <Card className="bg-[#12121f] border-[#2a2a3e]">
            <CardHeader><CardTitle className="text-lg flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-red-400" /> יומן עיכובים</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#2a2a3e] text-gray-400 text-right">
                      <th className="py-2 px-3 font-medium">משלוח</th>
                      <th className="py-2 px-3 font-medium">סיבת עיכוב</th>
                      <th className="py-2 px-3 font-medium">קטגוריה</th>
                      <th className="py-2 px-3 font-medium">ימי עיכוב</th>
                      <th className="py-2 px-3 font-medium">השפעה</th>
                    </tr>
                  </thead>
                  <tbody>
                    {delays.map((d, i) => (
                      <tr key={i} className="border-b border-[#1a1a2e] hover:bg-[#1a1a2e]">
                        <td className="py-2 px-3 font-mono text-blue-400">{d.shipment}</td>
                        <td className="py-2 px-3">{d.reason}</td>
                        <td className="py-2 px-3"><Badge variant="outline" className="text-xs">{d.category}</Badge></td>
                        <td className="py-2 px-3 text-red-400 font-bold">{d.days}</td>
                        <td className="py-2 px-3">
                          {d.impact === "high"
                            ? <Badge className="bg-red-500/20 text-red-400">גבוהה</Badge>
                            : <Badge className="bg-amber-500/20 text-amber-400">בינונית</Badge>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Customs Holds ── */}
        <TabsContent value="customs" className="mt-4">
          <Card className="bg-[#12121f] border-[#2a2a3e]">
            <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Ban className="h-5 w-5 text-orange-400" /> עצירות מכס</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-4">
                {customsHolds.map((h, i) => (
                  <Card key={i} className="bg-[#16162a] border-[#2a2a3e]">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-mono text-blue-400 font-bold">{h.shipment}</span>
                        {h.status === "open"
                          ? <Badge className="bg-red-500/20 text-red-400">פתוח</Badge>
                          : <Badge className="bg-amber-500/20 text-amber-400">בטיפול</Badge>}
                      </div>
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <p className="text-xs text-gray-500">סוג עצירה</p>
                          <p className="text-gray-200">{h.holdType}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">מאז</p>
                          <p className="text-gray-200">{h.since}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">פרטים</p>
                          <p className="text-gray-200">{h.details}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Missing Documents ── */}
        <TabsContent value="docs" className="mt-4">
          <Card className="bg-[#12121f] border-[#2a2a3e]">
            <CardHeader><CardTitle className="text-lg flex items-center gap-2"><FileWarning className="h-5 w-5 text-amber-400" /> מעקב מסמכים חסרים</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#2a2a3e] text-gray-400 text-right">
                      <th className="py-2 px-3 font-medium">משלוח</th>
                      <th className="py-2 px-3 font-medium">מסמך</th>
                      <th className="py-2 px-3 font-medium">נדרש עד</th>
                      <th className="py-2 px-3 font-medium">סטטוס</th>
                      <th className="py-2 px-3 font-medium">אחראי</th>
                    </tr>
                  </thead>
                  <tbody>
                    {missingDocs.map((d, i) => (
                      <tr key={i} className="border-b border-[#1a1a2e] hover:bg-[#1a1a2e]">
                        <td className="py-2 px-3 font-mono text-blue-400">{d.shipment}</td>
                        <td className="py-2 px-3">{d.document}</td>
                        <td className="py-2 px-3 text-gray-400">{d.required}</td>
                        <td className="py-2 px-3">
                          {d.status === "missing"
                            ? <Badge className="bg-red-500/20 text-red-400">חסר</Badge>
                            : <Badge className="bg-amber-500/20 text-amber-400">ממתין</Badge>}
                        </td>
                        <td className="py-2 px-3 text-gray-300">{d.responsible}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Delivery to Factory ── */}
        <TabsContent value="delivery" className="mt-4">
          <Card className="bg-[#12121f] border-[#2a2a3e]">
            <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Factory className="h-5 w-5 text-green-400" /> משלוחים למפעל</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-4">
                {factoryDeliveries.map((fd, i) => (
                  <Card key={i} className="bg-[#16162a] border-[#2a2a3e]">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <span className="font-mono text-blue-400 font-bold">{fd.shipment}</span>
                        {fd.qcStatus === "passed"
                          ? <Badge className="bg-green-500/20 text-green-400">QC עבר</Badge>
                          : <Badge className="bg-amber-500/20 text-amber-400">QC ממתין</Badge>}
                      </div>
                      <div className="grid grid-cols-4 gap-4 text-sm">
                        <div>
                          <p className="text-xs text-gray-500">{fd.arrived ? "הגיע" : "מתוכנן"}</p>
                          <p className="text-gray-200">{fd.date}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">מחסן</p>
                          <p className="text-gray-200">{fd.warehouse}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">מקבל</p>
                          <p className="text-gray-200">{fd.receiver}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">פריטים</p>
                          <p className="text-gray-200">{fd.items}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}