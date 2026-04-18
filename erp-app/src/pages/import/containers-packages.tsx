import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Container, Anchor, Ship, Weight, Box, DollarSign, Package, Layers } from "lucide-react";

const FALLBACK_SUBMODULES = [
  "containers_list", "container_details", "packages", "pallets",
  "cartons", "loose_cargo", "loading_map", "cost_allocation",
] as const;

const fmt = (v: number) => "$" + v.toLocaleString("en-US");
const fmtNis = (v: number) => "\u20AA" + v.toLocaleString("he-IL");

const FALLBACK_CONTAINERS = [
  { id: "CNTR-001", type: "40HC", shipment: "SHP-1120", supplier: "Foshan Glass Co.", origin: "Shenzhen", port: "Ashdod", weight: 18400, cbm: 67.5, status: "in_transit", eta: "2026-04-12", cost: 4200 },
  { id: "CNTR-002", type: "20ft", shipment: "SHP-1121", supplier: "Schuco International", origin: "Hamburg", port: "Haifa", weight: 12800, cbm: 28.3, status: "at_port", eta: "2026-04-08", cost: 2800 },
  { id: "CNTR-003", type: "40ft", shipment: "SHP-1122", supplier: "Alumil SA", origin: "Thessaloniki", port: "Ashdod", weight: 22100, cbm: 58.2, status: "in_transit", eta: "2026-04-15", cost: 3600 },
  { id: "CNTR-004", type: "40HC", shipment: "SHP-1123", supplier: "Reynaers Aluminium", origin: "Antwerp", port: "Haifa", weight: 19500, cbm: 65.1, status: "cleared", eta: "2026-04-06", cost: 4100 },
  { id: "CNTR-005", type: "20ft", shipment: "SHP-1124", supplier: "YKK AP", origin: "Yokohama", port: "Ashdod", weight: 9800, cbm: 24.6, status: "at_port", eta: "2026-04-09", cost: 3200 },
  { id: "CNTR-006", type: "40ft", shipment: "SHP-1125", supplier: "Xingfa Aluminium", origin: "Guangzhou", port: "Haifa", weight: 21300, cbm: 56.8, status: "in_transit", eta: "2026-04-18", cost: 3800 },
  { id: "CNTR-007", type: "40HC", shipment: "SHP-1126", supplier: "Kawneer (Arconic)", origin: "Houston", port: "Ashdod", weight: 17200, cbm: 62.4, status: "loading", eta: "2026-04-22", cost: 5100 },
  { id: "CNTR-008", type: "20ft", shipment: "SHP-1127", supplier: "Hydro ASA", origin: "Oslo", port: "Haifa", weight: 11600, cbm: 26.9, status: "at_port", eta: "2026-04-08", cost: 2600 },
];

const FALLBACK_PACKAGES = [
  { container: "CNTR-001", pallets: 22, cartons: 186, loose: 4, totalPcs: 2840, packType: "mixed", fragile: true, stackable: false },
  { container: "CNTR-002", pallets: 14, cartons: 98, loose: 0, totalPcs: 1420, packType: "palletized", fragile: false, stackable: true },
  { container: "CNTR-003", pallets: 18, cartons: 152, loose: 8, totalPcs: 2160, packType: "mixed", fragile: true, stackable: false },
  { container: "CNTR-004", pallets: 20, cartons: 174, loose: 2, totalPcs: 2650, packType: "palletized", fragile: false, stackable: true },
  { container: "CNTR-005", pallets: 8, cartons: 64, loose: 12, totalPcs: 780, packType: "loose", fragile: true, stackable: false },
  { container: "CNTR-006", pallets: 16, cartons: 140, loose: 6, totalPcs: 1980, packType: "mixed", fragile: false, stackable: true },
  { container: "CNTR-007", pallets: 24, cartons: 196, loose: 0, totalPcs: 3100, packType: "palletized", fragile: false, stackable: true },
  { container: "CNTR-008", pallets: 10, cartons: 72, loose: 3, totalPcs: 960, packType: "mixed", fragile: true, stackable: false },
];

const FALLBACK_COSTS = [
  { container: "CNTR-001", freight: 4200, insurance: 840, portHandling: 1200, customs: 14720, storage: 0, inland: 1800, total: 22760 },
  { container: "CNTR-002", freight: 2800, insurance: 560, portHandling: 950, customs: 9600, storage: 450, inland: 1200, total: 15560 },
  { container: "CNTR-003", freight: 3600, insurance: 720, portHandling: 1100, customs: 12400, storage: 0, inland: 1500, total: 19320 },
  { container: "CNTR-004", freight: 4100, insurance: 820, portHandling: 1150, customs: 16200, storage: 800, inland: 1650, total: 24720 },
  { container: "CNTR-005", freight: 3200, insurance: 640, portHandling: 850, customs: 7800, storage: 350, inland: 1100, total: 13940 },
  { container: "CNTR-006", freight: 3800, insurance: 760, portHandling: 1050, customs: 11800, storage: 0, inland: 1400, total: 18810 },
  { container: "CNTR-007", freight: 5100, insurance: 1020, portHandling: 1300, customs: 15600, storage: 0, inland: 2100, total: 25120 },
  { container: "CNTR-008", freight: 2600, insurance: 520, portHandling: 800, customs: 6400, storage: 200, inland: 950, total: 11470 },
];

const statusBadge = (s: string) => {
  switch (s) {
    case "loading": return <Badge className="bg-gray-500/20 text-gray-400">בטעינה</Badge>;
    case "in_transit": return <Badge className="bg-blue-500/20 text-blue-400">במעבר</Badge>;
    case "at_port": return <Badge className="bg-amber-500/20 text-amber-400">בנמל</Badge>;
    case "cleared": return <Badge className="bg-green-500/20 text-green-400">שוחרר</Badge>;
    default: return null;
  }
};

const packBadge = (t: string) => {
  switch (t) {
    case "palletized": return <Badge className="bg-blue-500/20 text-blue-400">משטחים</Badge>;
    case "mixed": return <Badge className="bg-purple-500/20 text-purple-400">מעורב</Badge>;
    case "loose": return <Badge className="bg-amber-500/20 text-amber-400">תפזורת</Badge>;
    default: return null;
  }
};

export default function ContainersPackages() {
  const { data: submodules = FALLBACK_SUBMODULES } = useQuery({
    queryKey: ["import-submodules"],
    queryFn: async () => {
      const res = await authFetch("/api/import/containers-packages/submodules");
      if (!res.ok) return FALLBACK_SUBMODULES;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_SUBMODULES;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: containers = FALLBACK_CONTAINERS } = useQuery({
    queryKey: ["import-containers"],
    queryFn: async () => {
      const res = await authFetch("/api/import/containers-packages/containers");
      if (!res.ok) return FALLBACK_CONTAINERS;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_CONTAINERS;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: packages = FALLBACK_PACKAGES } = useQuery({
    queryKey: ["import-packages"],
    queryFn: async () => {
      const res = await authFetch("/api/import/containers-packages/packages");
      if (!res.ok) return FALLBACK_PACKAGES;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_PACKAGES;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: costs = FALLBACK_COSTS } = useQuery({
    queryKey: ["import-costs"],
    queryFn: async () => {
      const res = await authFetch("/api/import/containers-packages/costs");
      if (!res.ok) return FALLBACK_COSTS;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_COSTS;
    },
    staleTime: 30_000,
    retry: 1,
  });


  const [tab, setTab] = useState("containers");

  const active = containers.filter(c => c.status !== "cleared").length;
  const atPort = containers.filter(c => c.status === "at_port").length;
  const inTransit = containers.filter(c => c.status === "in_transit").length;
  const totalWeight = containers.reduce((s, c) => s + c.weight, 0);
  const totalCBM = containers.reduce((s, c) => s + c.cbm, 0);
  const avgCost = Math.round(costs.reduce((s, c) => s + c.total, 0) / costs.length);

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center gap-3">
        <Container className="h-7 w-7 text-blue-400" />
        <h1 className="text-2xl font-bold">מכולות ואריזות</h1>
        <Badge variant="outline" className="mr-auto text-xs text-muted-foreground">טכנו-כל עוזי</Badge>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card className="bg-slate-900 border-slate-700">
          <CardContent className="pt-5 text-center">
            <Box className="h-5 w-5 mx-auto text-blue-400 mb-1" />
            <p className="text-xs text-slate-400">מכולות פעילות</p>
            <p className="text-2xl font-bold text-blue-400">{active}</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-900 border-slate-700">
          <CardContent className="pt-5 text-center">
            <Anchor className="h-5 w-5 mx-auto text-amber-400 mb-1" />
            <p className="text-xs text-slate-400">בנמל</p>
            <p className="text-2xl font-bold text-amber-400">{atPort}</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-900 border-slate-700">
          <CardContent className="pt-5 text-center">
            <Ship className="h-5 w-5 mx-auto text-cyan-400 mb-1" />
            <p className="text-xs text-slate-400">במעבר</p>
            <p className="text-2xl font-bold text-cyan-400">{inTransit}</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-900 border-slate-700">
          <CardContent className="pt-5 text-center">
            <Weight className="h-5 w-5 mx-auto text-purple-400 mb-1" />
            <p className="text-xs text-slate-400">משקל כולל (kg)</p>
            <p className="text-xl font-bold text-purple-400">{totalWeight.toLocaleString("he-IL")}</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-900 border-slate-700">
          <CardContent className="pt-5 text-center">
            <Layers className="h-5 w-5 mx-auto text-green-400 mb-1" />
            <p className="text-xs text-slate-400">CBM כולל</p>
            <p className="text-xl font-bold text-green-400">{totalCBM.toFixed(1)}</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-900 border-slate-700">
          <CardContent className="pt-5 text-center">
            <DollarSign className="h-5 w-5 mx-auto text-red-400 mb-1" />
            <p className="text-xs text-slate-400">עלות ממוצעת/מכולה</p>
            <p className="text-xl font-bold text-red-400">{fmt(avgCost)}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-slate-800">
          <TabsTrigger value="containers">מכולות</TabsTrigger>
          <TabsTrigger value="packages">אריזות</TabsTrigger>
          <TabsTrigger value="costs">עלויות</TabsTrigger>
        </TabsList>

        <TabsContent value="containers">
          <Card className="bg-slate-900 border-slate-700">
            <CardHeader><CardTitle className="text-base">רשימת מכולות</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700">
                    <TableHead className="text-right text-slate-400">מס׳ מכולה</TableHead>
                    <TableHead className="text-right text-slate-400">סוג</TableHead>
                    <TableHead className="text-right text-slate-400">משלוח</TableHead>
                    <TableHead className="text-right text-slate-400">ספק</TableHead>
                    <TableHead className="text-right text-slate-400">מקור</TableHead>
                    <TableHead className="text-right text-slate-400">נמל יעד</TableHead>
                    <TableHead className="text-right text-slate-400">משקל (kg)</TableHead>
                    <TableHead className="text-right text-slate-400">CBM</TableHead>
                    <TableHead className="text-right text-slate-400">ETA</TableHead>
                    <TableHead className="text-right text-slate-400">סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {containers.map(c => (
                    <TableRow key={c.id} className="border-slate-800 hover:bg-slate-800/50">
                      <TableCell className="font-mono text-sm">{c.id}</TableCell>
                      <TableCell><Badge variant="outline" className="border-slate-600 text-slate-300">{c.type}</Badge></TableCell>
                      <TableCell className="text-sm">{c.shipment}</TableCell>
                      <TableCell className="text-sm">{c.supplier}</TableCell>
                      <TableCell className="text-sm">{c.origin}</TableCell>
                      <TableCell className="text-sm">{c.port}</TableCell>
                      <TableCell className="text-sm font-medium">{c.weight.toLocaleString("he-IL")}</TableCell>
                      <TableCell className="text-sm">{c.cbm}</TableCell>
                      <TableCell className="text-sm">{c.eta}</TableCell>
                      <TableCell>{statusBadge(c.status)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="packages">
          <Card className="bg-slate-900 border-slate-700">
            <CardHeader><CardTitle className="text-base">אריזות לפי מכולה</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700">
                    <TableHead className="text-right text-slate-400">מכולה</TableHead>
                    <TableHead className="text-right text-slate-400">משטחים</TableHead>
                    <TableHead className="text-right text-slate-400">קרטונים</TableHead>
                    <TableHead className="text-right text-slate-400">תפזורת</TableHead>
                    <TableHead className="text-right text-slate-400">סה״כ יחידות</TableHead>
                    <TableHead className="text-right text-slate-400">סוג אריזה</TableHead>
                    <TableHead className="text-right text-slate-400">שביר</TableHead>
                    <TableHead className="text-right text-slate-400">ניתן לערום</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {packages.map(p => (
                    <TableRow key={p.container} className="border-slate-800 hover:bg-slate-800/50">
                      <TableCell className="font-mono text-sm">{p.container}</TableCell>
                      <TableCell className="text-sm font-medium">{p.pallets}</TableCell>
                      <TableCell className="text-sm">{p.cartons}</TableCell>
                      <TableCell className="text-sm">{p.loose}</TableCell>
                      <TableCell className="text-sm font-bold">{p.totalPcs.toLocaleString("he-IL")}</TableCell>
                      <TableCell>{packBadge(p.packType)}</TableCell>
                      <TableCell>{p.fragile
                        ? <Badge className="bg-red-500/20 text-red-400">כן</Badge>
                        : <Badge className="bg-green-500/20 text-green-400">לא</Badge>}</TableCell>
                      <TableCell>{p.stackable
                        ? <Badge className="bg-green-500/20 text-green-400">כן</Badge>
                        : <Badge className="bg-amber-500/20 text-amber-400">לא</Badge>}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="costs">
          <Card className="bg-slate-900 border-slate-700">
            <CardHeader><CardTitle className="text-base">הקצאת עלויות לפי מכולה</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700">
                    <TableHead className="text-right text-slate-400">מכולה</TableHead>
                    <TableHead className="text-right text-slate-400">הובלה ימית</TableHead>
                    <TableHead className="text-right text-slate-400">ביטוח</TableHead>
                    <TableHead className="text-right text-slate-400">טיפול נמל</TableHead>
                    <TableHead className="text-right text-slate-400">מכס</TableHead>
                    <TableHead className="text-right text-slate-400">אחסון</TableHead>
                    <TableHead className="text-right text-slate-400">הובלה יבשתית</TableHead>
                    <TableHead className="text-right text-slate-400">סה״כ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {costs.map(c => (
                    <TableRow key={c.container} className="border-slate-800 hover:bg-slate-800/50">
                      <TableCell className="font-mono text-sm">{c.container}</TableCell>
                      <TableCell className="text-sm">{fmt(c.freight)}</TableCell>
                      <TableCell className="text-sm">{fmt(c.insurance)}</TableCell>
                      <TableCell className="text-sm">{fmt(c.portHandling)}</TableCell>
                      <TableCell className="text-sm">{fmtNis(c.customs)}</TableCell>
                      <TableCell className="text-sm">{c.storage > 0 ? fmt(c.storage) : <span className="text-slate-600">-</span>}</TableCell>
                      <TableCell className="text-sm">{fmtNis(c.inland)}</TableCell>
                      <TableCell className="text-sm font-bold text-amber-400">{fmt(c.total)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="border-slate-700 bg-slate-800/30">
                    <TableCell className="font-bold">סה״כ</TableCell>
                    <TableCell className="font-bold text-sm">{fmt(costs.reduce((s, c) => s + c.freight, 0))}</TableCell>
                    <TableCell className="font-bold text-sm">{fmt(costs.reduce((s, c) => s + c.insurance, 0))}</TableCell>
                    <TableCell className="font-bold text-sm">{fmt(costs.reduce((s, c) => s + c.portHandling, 0))}</TableCell>
                    <TableCell className="font-bold text-sm">{fmtNis(costs.reduce((s, c) => s + c.customs, 0))}</TableCell>
                    <TableCell className="font-bold text-sm">{fmt(costs.reduce((s, c) => s + c.storage, 0))}</TableCell>
                    <TableCell className="font-bold text-sm">{fmtNis(costs.reduce((s, c) => s + c.inland, 0))}</TableCell>
                    <TableCell className="font-bold text-sm text-amber-400">{fmt(costs.reduce((s, c) => s + c.total, 0))}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
