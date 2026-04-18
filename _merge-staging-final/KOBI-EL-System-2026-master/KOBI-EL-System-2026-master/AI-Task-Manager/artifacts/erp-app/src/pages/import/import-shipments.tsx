import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Ship, Plane, Truck, Anchor, Clock, AlertTriangle, CheckCircle2,
  Package, MapPin, Container, Weight, CalendarCheck
} from "lucide-react";

type ShipmentStatus = "ordered" | "shipped" | "in_transit" | "at_port" | "customs" | "cleared" | "delivered";
type TransportType = "sea" | "air" | "land";

interface Shipment {
  id: string;
  type: TransportType;
  supplier: string;
  originCountry: string;
  originPort: string;
  destinationPort: string;
  etd: string;
  eta: string;
  ata: string | null;
  containers: number;
  weightKg: number;
  status: ShipmentStatus;
  trackingRef: string;
}

const FALLBACK_MILESTONES: { key: ShipmentStatus; label: string }[] = [
  { key: "ordered", label: "הוזמן" },
  { key: "shipped", label: "נשלח" },
  { key: "in_transit", label: "בדרך" },
  { key: "at_port", label: "בנמל" },
  { key: "customs", label: "מכס" },
  { key: "cleared", label: "שוחרר" },
  { key: "delivered", label: "נמסר" },
];

const FALLBACK_SHIPMENTS: Shipment[] = [
  {
    id: "SHP-001", type: "sea", supplier: "Istanbul Cam Sanayi", originCountry: "טורקיה",
    originPort: "Mersin", destinationPort: "חיפה", etd: "2026-03-18", eta: "2026-04-08",
    ata: null, containers: 3, weightKg: 24500, status: "at_port", trackingRef: "MSKU-8827341",
  },
  {
    id: "SHP-002", type: "sea", supplier: "Foshan Glass Industries", originCountry: "סין",
    originPort: "Shanghai", destinationPort: "אשדוד", etd: "2026-03-05", eta: "2026-04-12",
    ata: null, containers: 5, weightKg: 41200, status: "in_transit", trackingRef: "COSCO-TK29841",
  },
  {
    id: "SHP-003", type: "air", supplier: "Schüco International", originCountry: "גרמניה",
    originPort: "Frankfurt", destinationPort: "חיפה", etd: "2026-04-02", eta: "2026-04-05",
    ata: "2026-04-05", containers: 0, weightKg: 1850, status: "customs", trackingRef: "LH-CRG-44821",
  },
  {
    id: "SHP-004", type: "sea", supplier: "Vitrum Italia SpA", originCountry: "איטליה",
    originPort: "Genova", destinationPort: "חיפה", etd: "2026-03-22", eta: "2026-04-06",
    ata: "2026-04-06", containers: 2, weightKg: 18300, status: "delivered", trackingRef: "MSC-GNV-77123",
  },
  {
    id: "SHP-005", type: "land", supplier: "Trakya Cam Sanayii", originCountry: "טורקיה",
    originPort: "Istanbul", destinationPort: "חיפה", etd: "2026-04-01", eta: "2026-04-07",
    ata: null, containers: 1, weightKg: 8700, status: "in_transit", trackingRef: "TRK-IST-56201",
  },
  {
    id: "SHP-006", type: "sea", supplier: "AGC Glass Europe", originCountry: "בלגיה",
    originPort: "Antwerp", destinationPort: "אשדוד", etd: "2026-03-10", eta: "2026-04-03",
    ata: "2026-04-03", containers: 4, weightKg: 33600, status: "cleared", trackingRef: "HAPAG-ANT-91034",
  },
  {
    id: "SHP-007", type: "air", supplier: "Guangdong Hardware Co.", originCountry: "סין",
    originPort: "Shenzhen", destinationPort: "אשדוד", etd: "2026-04-04", eta: "2026-04-07",
    ata: null, containers: 0, weightKg: 2400, status: "at_port", trackingRef: "CX-CRG-30219",
  },
  {
    id: "SHP-008", type: "sea", supplier: "Ankara Metal Profil", originCountry: "טורקיה",
    originPort: "Izmir", destinationPort: "חיפה", etd: "2026-03-28", eta: "2026-04-10",
    ata: null, containers: 2, weightKg: 15900, status: "shipped", trackingRef: "ZIM-IZM-62847",
  },
];

const transportIcon = (type: TransportType) => {
  switch (type) {
    case "sea": return <Ship className="h-4 w-4 text-blue-400" />;
    case "air": return <Plane className="h-4 w-4 text-sky-400" />;
    case "land": return <Truck className="h-4 w-4 text-amber-400" />;
  }
};

const transportLabel = (type: TransportType) => {
  switch (type) {
    case "sea": return "ימי";
    case "air": return "אווירי";
    case "land": return "יבשתי";
  }
};

const statusBadge = (status: ShipmentStatus) => {
  const map: Record<ShipmentStatus, { bg: string; text: string; label: string }> = {
    ordered: { bg: "bg-gray-500/20", text: "text-gray-400", label: "הוזמן" },
    shipped: { bg: "bg-indigo-500/20", text: "text-indigo-400", label: "נשלח" },
    in_transit: { bg: "bg-blue-500/20", text: "text-blue-400", label: "בדרך" },
    at_port: { bg: "bg-cyan-500/20", text: "text-cyan-400", label: "בנמל" },
    customs: { bg: "bg-amber-500/20", text: "text-amber-400", label: "במכס" },
    cleared: { bg: "bg-emerald-500/20", text: "text-emerald-400", label: "שוחרר" },
    delivered: { bg: "bg-green-500/20", text: "text-green-400", label: "נמסר" },
  };
  const s = map[status];
  return <Badge className={`${s.bg} ${s.text} border-0`}>{s.label}</Badge>;
};

const getMilestoneProgress = (status: ShipmentStatus): number => {
  const idx = FALLBACK_MILESTONES.findIndex((m) => m.key === status);
  return idx >= 0 ? Math.round(((idx + 1) / FALLBACK_MILESTONES.length) * 100) : 0;
};

const isDelayed = (s: Shipment): boolean => {
  if (s.status === "delivered" || s.status === "cleared") return false;
  const now = new Date("2026-04-08");
  return new Date(s.eta) < now && !s.ata;
};

const arrivedThisMonth = (s: Shipment): boolean => {
  if (!s.ata) return false;
  return s.ata.startsWith("2026-04");
};

export default function ImportShipments() {
  const { data: milestones = FALLBACK_MILESTONES } = useQuery({
    queryKey: ["import-milestones"],
    queryFn: async () => {
      const res = await authFetch("/api/import/import-shipments/milestones");
      if (!res.ok) return FALLBACK_MILESTONES;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_MILESTONES;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: shipments = FALLBACK_SHIPMENTS } = useQuery({
    queryKey: ["import-shipments"],
    queryFn: async () => {
      const res = await authFetch("/api/import/import-shipments/shipments");
      if (!res.ok) return FALLBACK_SHIPMENTS;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_SHIPMENTS;
    },
    staleTime: 30_000,
    retry: 1,
  });


  const [activeTab, setActiveTab] = useState("active");

  const active = shipments.filter((s) => !["delivered", "cleared"].includes(s.status));
  const atPort = shipments.filter((s) => s.status === "at_port");
  const inCustoms = shipments.filter((s) => s.status === "customs");
  const arrived = shipments.filter((s) => ["delivered", "cleared"].includes(s.status));
  const delayed = shipments.filter(isDelayed);

  const kpis = [
    { label: "משלוחים פעילים", value: active.length, icon: Package, color: "text-blue-400", border: "border-blue-500/30" },
    { label: "בדרך", value: shipments.filter((s) => s.status === "in_transit" || s.status === "shipped").length, icon: Ship, color: "text-indigo-400", border: "border-indigo-500/30" },
    { label: "בנמל", value: atPort.length, icon: Anchor, color: "text-cyan-400", border: "border-cyan-500/30" },
    { label: "במכס", value: inCustoms.length, icon: Clock, color: "text-amber-400", border: "border-amber-500/30" },
    { label: "מעוכבים", value: delayed.length, icon: AlertTriangle, color: "text-red-400", border: "border-red-500/30" },
    { label: "הגיעו החודש", value: shipments.filter(arrivedThisMonth).length, icon: CalendarCheck, color: "text-green-400", border: "border-green-500/30" },
  ];

  const tabFilters: Record<string, Shipment[]> = {
    active,
    at_port: atPort,
    customs: inCustoms,
    arrived,
    delayed,
  };

  const currentShipments = tabFilters[activeTab] ?? active;

  const renderMilestones = (status: ShipmentStatus) => {
    const activeIdx = milestones.findIndex((m) => m.key === status);
    return (
      <div className="flex items-center gap-1 mt-2">
        {milestones.map((m, i) => (
          <div key={m.key} className="flex items-center gap-1">
            <div
              className={`w-2.5 h-2.5 rounded-full ${
                i <= activeIdx ? "bg-blue-500" : "bg-zinc-700"
              }`}
              title={m.label}
            />
            {i < milestones.length - 1 && (
              <div className={`w-4 h-0.5 ${i < activeIdx ? "bg-blue-500" : "bg-zinc-700"}`} />
            )}
          </div>
        ))}
      </div>
    );
  };

  const renderTable = (list: Shipment[]) => (
    <Table>
      <TableHeader>
        <TableRow className="border-zinc-800">
          <TableHead className="text-right text-zinc-400">מספר</TableHead>
          <TableHead className="text-right text-zinc-400">סוג</TableHead>
          <TableHead className="text-right text-zinc-400">ספק</TableHead>
          <TableHead className="text-right text-zinc-400">מוצא</TableHead>
          <TableHead className="text-right text-zinc-400">נמל יעד</TableHead>
          <TableHead className="text-right text-zinc-400">ETD</TableHead>
          <TableHead className="text-right text-zinc-400">ETA</TableHead>
          <TableHead className="text-right text-zinc-400">ATA</TableHead>
          <TableHead className="text-right text-zinc-400">מכולות</TableHead>
          <TableHead className="text-right text-zinc-400">משקל (ק"ג)</TableHead>
          <TableHead className="text-right text-zinc-400">סטטוס</TableHead>
          <TableHead className="text-right text-zinc-400">מעקב</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {list.map((s) => (
          <TableRow key={s.id} className="border-zinc-800 hover:bg-zinc-800/50">
            <TableCell className="font-mono font-semibold text-zinc-200">{s.id}</TableCell>
            <TableCell>
              <div className="flex items-center gap-1.5">
                {transportIcon(s.type)}
                <span className="text-zinc-300 text-sm">{transportLabel(s.type)}</span>
              </div>
            </TableCell>
            <TableCell className="text-zinc-300">{s.supplier}</TableCell>
            <TableCell>
              <div className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5 text-zinc-500" />
                <span className="text-zinc-300">{s.originCountry}</span>
                <span className="text-zinc-500 text-xs">({s.originPort})</span>
              </div>
            </TableCell>
            <TableCell className="text-zinc-300">{s.destinationPort}</TableCell>
            <TableCell className="text-zinc-400 text-sm">{s.etd}</TableCell>
            <TableCell className={`text-sm ${isDelayed(s) ? "text-red-400 font-semibold" : "text-zinc-400"}`}>
              {s.eta}
            </TableCell>
            <TableCell className="text-zinc-400 text-sm">{s.ata ?? "---"}</TableCell>
            <TableCell className="text-zinc-300 text-center">{s.containers > 0 ? s.containers : "---"}</TableCell>
            <TableCell className="text-zinc-300">{s.weightKg.toLocaleString()}</TableCell>
            <TableCell>{statusBadge(s.status)}</TableCell>
            <TableCell className="font-mono text-xs text-zinc-500">{s.trackingRef}</TableCell>
          </TableRow>
        ))}
        {list.length === 0 && (
          <TableRow>
            <TableCell colSpan={12} className="text-center text-zinc-500 py-8">
              אין משלוחים להצגה
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );

  return (
    <div className="p-6 space-y-6 bg-zinc-950 min-h-screen" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
          <Ship className="h-7 w-7 text-blue-400" />
          משלוחי יבוא
        </h1>
        <Badge variant="outline" className="border-zinc-700 text-zinc-400 text-xs">
          טכנו-כל עוזי | מעקב משלוחים
        </Badge>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpis.map((k) => (
          <Card key={k.label} className={`bg-zinc-900 ${k.border} border`}>
            <CardContent className="pt-5 pb-4 text-center">
              <k.icon className={`h-5 w-5 mx-auto mb-1 ${k.color}`} />
              <p className="text-xs text-zinc-500 mb-1">{k.label}</p>
              <p className={`text-2xl font-bold ${k.color}`}>{k.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Milestone Progress Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {shipments
          .filter((s) => s.status !== "delivered")
          .slice(0, 4)
          .map((s) => (
            <Card key={s.id} className="bg-zinc-900 border-zinc-800">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono font-semibold text-zinc-200 text-sm">{s.id}</span>
                  <div className="flex items-center gap-1">
                    {transportIcon(s.type)}
                    {statusBadge(s.status)}
                  </div>
                </div>
                <p className="text-xs text-zinc-500 mb-1">{s.supplier}</p>
                <Progress
                  value={getMilestoneProgress(s.status)}
                  className="h-1.5 bg-zinc-800 mb-1"
                />
                {renderMilestones(s.status)}
                <div className="flex justify-between mt-2 text-xs text-zinc-600">
                  <span>ETD: {s.etd}</span>
                  <span>ETA: {s.eta}</span>
                </div>
              </CardContent>
            </Card>
          ))}
      </div>

      {/* Tabs + Shipment Table */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-zinc-100 text-lg">רשימת משלוחים</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <div className="px-6 pt-2">
              <TabsList className="bg-zinc-800 border border-zinc-700">
                <TabsTrigger value="active" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-zinc-400">
                  פעילים ({active.length})
                </TabsTrigger>
                <TabsTrigger value="at_port" className="data-[state=active]:bg-cyan-600 data-[state=active]:text-white text-zinc-400">
                  בנמל ({atPort.length})
                </TabsTrigger>
                <TabsTrigger value="customs" className="data-[state=active]:bg-amber-600 data-[state=active]:text-white text-zinc-400">
                  במכס ({inCustoms.length})
                </TabsTrigger>
                <TabsTrigger value="arrived" className="data-[state=active]:bg-green-600 data-[state=active]:text-white text-zinc-400">
                  הגיעו ({arrived.length})
                </TabsTrigger>
                <TabsTrigger value="delayed" className="data-[state=active]:bg-red-600 data-[state=active]:text-white text-zinc-400">
                  מעוכבים ({delayed.length})
                </TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="active" className="mt-0">{renderTable(active)}</TabsContent>
            <TabsContent value="at_port" className="mt-0">{renderTable(atPort)}</TabsContent>
            <TabsContent value="customs" className="mt-0">{renderTable(inCustoms)}</TabsContent>
            <TabsContent value="arrived" className="mt-0">{renderTable(arrived)}</TabsContent>
            <TabsContent value="delayed" className="mt-0">{renderTable(delayed)}</TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
