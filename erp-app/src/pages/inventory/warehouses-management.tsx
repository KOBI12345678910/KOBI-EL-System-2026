import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Building2, MapPin, Package, Layers, LayoutGrid, Users, TrendingUp, Box, AlertTriangle, Archive,
} from "lucide-react";

const API = "/api";

const fmt = (n: number) =>
  new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(n);
const fmtN = (n: number) => new Intl.NumberFormat("he-IL").format(n);

/* ── Warehouses ── */
const FALLBACK_WAREHOUSES = [
  { id: "WH-01", name: "מחסן ראשי", address: "רח׳ התעשייה 12, חולון", zones: 6, bins: 184, items: 1_247, value: 2_845_000, utilization: 78, manager: "יוסי כהן", status: "פעיל", color: "blue" },
  { id: "WH-02", name: "מחסן חומרי גלם", address: "רח׳ המלאכה 5, חולון", zones: 4, bins: 96, items: 632, value: 1_520_000, utilization: 85, manager: "שרה לוי", status: "פעיל", color: "amber" },
  { id: "WH-03", name: "מחסן מוצרים מוגמרים", address: "רח׳ הרכבת 8, חולון", zones: 5, bins: 120, items: 418, value: 3_210_000, utilization: 62, manager: "דוד מזרחי", status: "פעיל", color: "emerald" },
];

/* ── Zones ── */
const FALLBACK_ZONES = [
  { code: "Z-01A", warehouse: "WH-01", name: "אזור אחסון כללי", type: "אחסון", bins: 48, items: 312, value: 680_000 },
  { code: "Z-01B", warehouse: "WH-01", name: "אזור מוצרים מוגמרים", type: "מוצרים", bins: 36, items: 198, value: 920_000 },
  { code: "Z-01C", warehouse: "WH-01", name: "אזור הסגר", type: "הסגר", bins: 24, items: 87, value: 245_000 },
  { code: "Z-01D", warehouse: "WH-01", name: "אזור גרוטאות", type: "גרוטאות", bins: 20, items: 142, value: 120_000 },
  { code: "Z-01E", warehouse: "WH-01", name: "אזור שאריות", type: "שאריות", bins: 32, items: 264, value: 410_000 },
  { code: "Z-01F", warehouse: "WH-01", name: "אזור חומרי אריזה", type: "אחסון", bins: 24, items: 244, value: 470_000 },
  { code: "Z-02A", warehouse: "WH-02", name: "מתכות", type: "חומרי גלם", bins: 32, items: 186, value: 520_000 },
  { code: "Z-02B", warehouse: "WH-02", name: "פלסטיקה וגומי", type: "חומרי גלם", bins: 28, items: 148, value: 380_000 },
  { code: "Z-02C", warehouse: "WH-02", name: "רכיבים אלקטרוניים", type: "חומרי גלם", bins: 20, items: 212, value: 440_000 },
  { code: "Z-02D", warehouse: "WH-02", name: "חומרי עזר", type: "חומרי גלם", bins: 16, items: 86, value: 180_000 },
  { code: "Z-03A", warehouse: "WH-03", name: "מוצרים סטנדרטיים", type: "מוצרים", bins: 36, items: 156, value: 1_240_000 },
  { code: "Z-03B", warehouse: "WH-03", name: "מוצרים מותאמים אישית", type: "מוצרים", bins: 28, items: 94, value: 860_000 },
  { code: "Z-03C", warehouse: "WH-03", name: "אזור הסגר מו״מ", type: "הסגר", bins: 20, items: 62, value: 410_000 },
  { code: "Z-03D", warehouse: "WH-03", name: "משלוחים יוצאים", type: "אחסון", bins: 24, items: 72, value: 480_000 },
  { code: "Z-03E", warehouse: "WH-03", name: "החזרות", type: "שאריות", bins: 12, items: 34, value: 220_000 },
];

const zoneTypeColors: Record<string, string> = {
  "אחסון": "bg-blue-500/20 text-blue-300",
  "חומרי גלם": "bg-amber-500/20 text-amber-300",
  "מוצרים": "bg-emerald-500/20 text-emerald-300",
  "הסגר": "bg-red-500/20 text-red-300",
  "גרוטאות": "bg-gray-500/20 text-gray-300",
  "שאריות": "bg-orange-500/20 text-orange-300",
};

/* ── Bins ── */
const FALLBACK_BINS = [
  { code: "B-01A-01", zone: "Z-01A", rack: "A1", shelf: "1", item: "ברגים נירוסטה M6", qty: 4_500, capacity: 82 },
  { code: "B-01A-02", zone: "Z-01A", rack: "A1", shelf: "2", item: "אומים M8 מגולוון", qty: 3_200, capacity: 71 },
  { code: "B-01A-03", zone: "Z-01A", rack: "A2", shelf: "1", item: "מסגרת אלומיניום 30x30", qty: 120, capacity: 45 },
  { code: "B-01B-01", zone: "Z-01B", rack: "B1", shelf: "1", item: "יחידת בקרה TK-200", qty: 84, capacity: 56 },
  { code: "B-01B-02", zone: "Z-01B", rack: "B1", shelf: "2", item: "מארז מוצר סופי", qty: 210, capacity: 88 },
  { code: "B-01C-01", zone: "Z-01C", rack: "C1", shelf: "1", item: "לוח PCB — בדיקה", qty: 62, capacity: 31 },
  { code: "B-02A-01", zone: "Z-02A", rack: "A1", shelf: "1", item: "פלדה גליל 2.5mm", qty: 1_200, capacity: 90 },
  { code: "B-02A-02", zone: "Z-02A", rack: "A1", shelf: "2", item: "נחושת 1mm", qty: 680, capacity: 68 },
  { code: "B-02B-01", zone: "Z-02B", rack: "B1", shelf: "1", item: "ABS גרנולס שחור", qty: 2_400, capacity: 77 },
  { code: "B-02C-01", zone: "Z-02C", rack: "C1", shelf: "1", item: "מחבר USB-C 3.1", qty: 8_400, capacity: 92 },
  { code: "B-02C-02", zone: "Z-02C", rack: "C1", shelf: "2", item: "נגד SMD 10kΩ", qty: 24_000, capacity: 60 },
  { code: "B-03A-01", zone: "Z-03A", rack: "A1", shelf: "1", item: "טכנו-בקר Pro", qty: 64, capacity: 53 },
  { code: "B-03A-02", zone: "Z-03A", rack: "A1", shelf: "2", item: "טכנו-חיישן Ultra", qty: 128, capacity: 74 },
  { code: "B-03B-01", zone: "Z-03B", rack: "B1", shelf: "1", item: "מערכת TK-Custom 4200", qty: 18, capacity: 30 },
  { code: "B-03C-01", zone: "Z-03C", rack: "C1", shelf: "1", item: "מוצר בבדיקת QC", qty: 42, capacity: 35 },
  { code: "B-03D-01", zone: "Z-03D", rack: "D1", shelf: "1", item: "הזמנה #8842 — ארוז", qty: 36, capacity: 48 },
];

/* ── Warehouse map layout concept ── */
const mapZones: Record<string, { label: string; color: string; w: string; h: string }[]> = {
  "WH-01": [
    { label: "אחסון כללי", color: "bg-blue-600/40", w: "w-1/2", h: "h-32" },
    { label: "מוצרים מוגמרים", color: "bg-emerald-600/40", w: "w-1/2", h: "h-32" },
    { label: "הסגר", color: "bg-red-600/40", w: "w-1/3", h: "h-24" },
    { label: "גרוטאות", color: "bg-gray-600/40", w: "w-1/3", h: "h-24" },
    { label: "שאריות", color: "bg-orange-600/40", w: "w-1/3", h: "h-24" },
    { label: "חומרי אריזה", color: "bg-purple-600/40", w: "w-full", h: "h-16" },
  ],
  "WH-02": [
    { label: "מתכות", color: "bg-amber-600/40", w: "w-1/2", h: "h-32" },
    { label: "פלסטיקה וגומי", color: "bg-cyan-600/40", w: "w-1/2", h: "h-32" },
    { label: "רכיבים אלקטרוניים", color: "bg-violet-600/40", w: "w-1/2", h: "h-24" },
    { label: "חומרי עזר", color: "bg-lime-600/40", w: "w-1/2", h: "h-24" },
  ],
  "WH-03": [
    { label: "מוצרים סטנדרטיים", color: "bg-emerald-600/40", w: "w-1/2", h: "h-32" },
    { label: "מוצרים מותאמים אישית", color: "bg-teal-600/40", w: "w-1/2", h: "h-32" },
    { label: "הסגר מו״מ", color: "bg-red-600/40", w: "w-1/3", h: "h-24" },
    { label: "משלוחים יוצאים", color: "bg-blue-600/40", w: "w-1/3", h: "h-24" },
    { label: "החזרות", color: "bg-orange-600/40", w: "w-1/3", h: "h-24" },
  ],
};

const utilColor = (p: number) => p >= 85 ? "text-red-400" : p >= 65 ? "text-amber-400" : "text-emerald-400";
const capBadge = (p: number) => p >= 90 ? "bg-red-500/20 text-red-300" : p >= 70 ? "bg-amber-500/20 text-amber-300" : "bg-emerald-500/20 text-emerald-300";

export default function WarehousesManagement() {
  const [tab, setTab] = useState("warehouses");
  const [zoneWarehouse, setZoneWarehouse] = useState("all");
  const [mapWarehouse, setMapWarehouse] = useState("WH-01");

  const { data: apiData } = useQuery({
    queryKey: ["inventory-warehouses"],
    queryFn: async () => {
      const res = await authFetch(`${API}/inventory/warehouses`);
      if (!res.ok) throw new Error("Failed to fetch warehouses");
      return res.json();
    },
  });

  const warehouses = apiData?.warehouses ?? FALLBACK_WAREHOUSES;
  const zones = apiData?.zones ?? FALLBACK_ZONES;
  const bins = apiData?.bins ?? FALLBACK_BINS;

  const totalItems = warehouses.reduce((s: number, w: any) => s + w.items, 0);
  const totalValue = warehouses.reduce((s: number, w: any) => s + w.value, 0);
  const totalBins = warehouses.reduce((s: number, w: any) => s + w.bins, 0);

  const filteredZones = zoneWarehouse === "all" ? zones : zones.filter((z: any) => z.warehouse === zoneWarehouse);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0e1a] to-[#1a1f35] text-white p-6" dir="rtl">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Building2 className="text-blue-400" />
            ניהול מחסנים, אזורים ומיקומים
          </h1>
          <p className="text-gray-400 mt-1">טכנו-כל עוזי — מערכת ניהול מחסנים מתקדמת</p>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "מחסנים", value: warehouses.length, icon: Building2, color: "text-blue-400", bg: "bg-blue-500/15" },
            { label: "סה״כ מיקומים", value: fmtN(totalBins), icon: LayoutGrid, color: "text-purple-400", bg: "bg-purple-500/15" },
            { label: "פריטים במלאי", value: fmtN(totalItems), icon: Package, color: "text-emerald-400", bg: "bg-emerald-500/15" },
            { label: "שווי כולל", value: fmt(totalValue), icon: TrendingUp, color: "text-amber-400", bg: "bg-amber-500/15" },
          ].map((k, i) => (
            <Card key={i} className="bg-[#141829] border-[#1e2340]">
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`p-2 rounded-lg ${k.bg}`}>
                  <k.icon className={`h-5 w-5 ${k.color}`} />
                </div>
                <div>
                  <p className="text-xs text-gray-400">{k.label}</p>
                  <p className={`text-lg font-bold ${k.color}`}>{k.value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Tabs */}
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="bg-[#141829] border border-[#1e2340]">
            <TabsTrigger value="warehouses" className="data-[state=active]:bg-blue-600/30 data-[state=active]:text-blue-300">
              <Building2 className="h-4 w-4 ml-1" /> מחסנים
            </TabsTrigger>
            <TabsTrigger value="zones" className="data-[state=active]:bg-purple-600/30 data-[state=active]:text-purple-300">
              <Layers className="h-4 w-4 ml-1" /> אזורים
            </TabsTrigger>
            <TabsTrigger value="bins" className="data-[state=active]:bg-emerald-600/30 data-[state=active]:text-emerald-300">
              <Box className="h-4 w-4 ml-1" /> מיקומים
            </TabsTrigger>
            <TabsTrigger value="map" className="data-[state=active]:bg-amber-600/30 data-[state=active]:text-amber-300">
              <MapPin className="h-4 w-4 ml-1" /> מפת מחסן
            </TabsTrigger>
          </TabsList>

          {/* ─── Tab: Warehouses ─── */}
          <TabsContent value="warehouses" className="space-y-4 mt-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {warehouses.map(w => (
                <Card key={w.id} className="bg-[#141829] border-[#1e2340] hover:border-blue-500/40 transition-colors">
                  <CardContent className="p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-bold text-white">{w.name}</h3>
                        <p className="text-xs text-gray-400">{w.id}</p>
                      </div>
                      <Badge className="bg-green-500/20 text-green-300 border-0">{w.status}</Badge>
                    </div>
                    <p className="text-sm text-gray-400 flex items-center gap-1"><MapPin className="h-3 w-3" />{w.address}</p>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="bg-[#0d1120] rounded-lg p-2 text-center">
                        <p className="text-xs text-gray-500">אזורים</p>
                        <p className="font-bold text-blue-300">{w.zones}</p>
                      </div>
                      <div className="bg-[#0d1120] rounded-lg p-2 text-center">
                        <p className="text-xs text-gray-500">מיקומים</p>
                        <p className="font-bold text-purple-300">{fmtN(w.bins)}</p>
                      </div>
                      <div className="bg-[#0d1120] rounded-lg p-2 text-center">
                        <p className="text-xs text-gray-500">פריטים</p>
                        <p className="font-bold text-emerald-300">{fmtN(w.items)}</p>
                      </div>
                      <div className="bg-[#0d1120] rounded-lg p-2 text-center">
                        <p className="text-xs text-gray-500">שווי</p>
                        <p className="font-bold text-amber-300">{fmt(w.value)}</p>
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-gray-400">ניצולת</span>
                        <span className={utilColor(w.utilization)}>{w.utilization}%</span>
                      </div>
                      <Progress value={w.utilization} className="h-2 bg-[#0d1120]" />
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-400">
                      <Users className="h-4 w-4" />
                      <span>מנהל: <span className="text-white">{w.manager}</span></span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* ─── Tab: Zones ─── */}
          <TabsContent value="zones" className="space-y-4 mt-4">
            <div className="flex gap-2 flex-wrap">
              <Badge
                className={`cursor-pointer ${zoneWarehouse === "all" ? "bg-blue-600 text-white" : "bg-[#1e2340] text-gray-300"} border-0`}
                onClick={() => setZoneWarehouse("all")}
              >הכל</Badge>
              {warehouses.map(w => (
                <Badge
                  key={w.id}
                  className={`cursor-pointer ${zoneWarehouse === w.id ? "bg-blue-600 text-white" : "bg-[#1e2340] text-gray-300"} border-0`}
                  onClick={() => setZoneWarehouse(w.id)}
                >{w.name}</Badge>
              ))}
            </div>
            <Card className="bg-[#141829] border-[#1e2340]">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="border-[#1e2340] hover:bg-transparent">
                      <TableHead className="text-gray-400 text-right">קוד</TableHead>
                      <TableHead className="text-gray-400 text-right">מחסן</TableHead>
                      <TableHead className="text-gray-400 text-right">שם אזור</TableHead>
                      <TableHead className="text-gray-400 text-right">סוג</TableHead>
                      <TableHead className="text-gray-400 text-right">מיקומים</TableHead>
                      <TableHead className="text-gray-400 text-right">פריטים</TableHead>
                      <TableHead className="text-gray-400 text-right">שווי</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredZones.map(z => (
                      <TableRow key={z.code} className="border-[#1e2340] hover:bg-[#1a1f38]">
                        <TableCell className="font-mono text-blue-300">{z.code}</TableCell>
                        <TableCell className="text-gray-300">{z.warehouse}</TableCell>
                        <TableCell className="text-white font-medium">{z.name}</TableCell>
                        <TableCell><Badge className={`${zoneTypeColors[z.type] || "bg-gray-500/20 text-gray-300"} border-0`}>{z.type}</Badge></TableCell>
                        <TableCell className="text-purple-300">{z.bins}</TableCell>
                        <TableCell className="text-emerald-300">{fmtN(z.items)}</TableCell>
                        <TableCell className="text-amber-300">{fmt(z.value)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ─── Tab: Bins ─── */}
          <TabsContent value="bins" className="space-y-4 mt-4">
            <Card className="bg-[#141829] border-[#1e2340]">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="border-[#1e2340] hover:bg-transparent">
                      <TableHead className="text-gray-400 text-right">קוד מיקום</TableHead>
                      <TableHead className="text-gray-400 text-right">אזור</TableHead>
                      <TableHead className="text-gray-400 text-right">מתלה</TableHead>
                      <TableHead className="text-gray-400 text-right">מדף</TableHead>
                      <TableHead className="text-gray-400 text-right">פריט מאוחסן</TableHead>
                      <TableHead className="text-gray-400 text-right">כמות</TableHead>
                      <TableHead className="text-gray-400 text-right">ניצולת</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bins.map(b => (
                      <TableRow key={b.code} className="border-[#1e2340] hover:bg-[#1a1f38]">
                        <TableCell className="font-mono text-blue-300">{b.code}</TableCell>
                        <TableCell className="text-gray-300">{b.zone}</TableCell>
                        <TableCell className="text-gray-300">{b.rack}</TableCell>
                        <TableCell className="text-gray-300">{b.shelf}</TableCell>
                        <TableCell className="text-white font-medium">{b.item}</TableCell>
                        <TableCell className="text-emerald-300">{fmtN(b.qty)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress value={b.capacity} className="h-2 w-20 bg-[#0d1120]" />
                            <Badge className={`${capBadge(b.capacity)} border-0 text-xs`}>{b.capacity}%</Badge>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ─── Tab: Warehouse Map ─── */}
          <TabsContent value="map" className="space-y-4 mt-4">
            <div className="flex gap-2 flex-wrap">
              {warehouses.map(w => (
                <Badge
                  key={w.id}
                  className={`cursor-pointer ${mapWarehouse === w.id ? "bg-blue-600 text-white" : "bg-[#1e2340] text-gray-300"} border-0`}
                  onClick={() => setMapWarehouse(w.id)}
                >{w.name} ({w.id})</Badge>
              ))}
            </div>
            <Card className="bg-[#141829] border-[#1e2340]">
              <CardContent className="p-6">
                <h3 className="text-lg font-bold text-white mb-1">
                  {warehouses.find(w => w.id === mapWarehouse)?.name} — תרשים אזורים
                </h3>
                <p className="text-xs text-gray-500 mb-4">תצוגה סכמטית של אזורי המחסן</p>
                <div className="flex flex-wrap gap-3">
                  {(mapZones[mapWarehouse] || []).map((mz, i) => (
                    <div
                      key={i}
                      className={`${mz.color} ${mz.w} ${mz.h} rounded-xl border border-white/10 flex items-center justify-center text-sm font-semibold text-white/90 min-w-[140px]`}
                    >
                      {mz.label}
                    </div>
                  ))}
                </div>
                <div className="mt-6 grid grid-cols-2 md:grid-cols-3 gap-3">
                  {zones.filter(z => z.warehouse === mapWarehouse).map(z => (
                    <div key={z.code} className="bg-[#0d1120] rounded-lg p-3 text-sm">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-mono text-blue-300 text-xs">{z.code}</span>
                        <Badge className={`${zoneTypeColors[z.type] || "bg-gray-500/20 text-gray-300"} border-0 text-[10px]`}>{z.type}</Badge>
                      </div>
                      <p className="text-white font-medium text-xs">{z.name}</p>
                      <div className="flex justify-between mt-2 text-[11px] text-gray-500">
                        <span>{z.bins} מיקומים</span>
                        <span>{fmtN(z.items)} פריטים</span>
                        <span>{fmt(z.value)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
