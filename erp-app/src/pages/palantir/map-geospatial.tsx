import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  MapPin, Search, Layers, Users, Truck, Warehouse, Package,
  Briefcase, Thermometer, Route, Target, Navigation, Globe,
  Building2, TrendingUp, X, Compass, Locate, Maximize2
} from "lucide-react";

type EntityKind = "customer" | "supplier" | "warehouse" | "delivery" | "project";

interface GeoEntity {
  id: string;
  name: string;
  kind: EntityKind;
  lat: number;
  lng: number;
  city: string;
  region: string;
  revenue?: number;
  employees?: number;
  rating?: number;
  lastActivity: string;
}

const KIND_CONFIG: Record<EntityKind, { color: string; bgHex: string; label: string; icon: any }> = {
  customer: { color: "text-blue-400", bgHex: "#3b82f6", label: "לקוחות", icon: Users },
  supplier: { color: "text-green-400", bgHex: "#22c55e", label: "ספקים", icon: Truck },
  warehouse: { color: "text-purple-400", bgHex: "#a855f7", label: "מחסנים", icon: Warehouse },
  delivery: { color: "text-orange-400", bgHex: "#f97316", label: "משלוחים", icon: Package },
  project: { color: "text-cyan-400", bgHex: "#06b6d4", label: "פרויקטים", icon: Briefcase },
};

// Israel bounding box approx
const ISRAEL_BOUNDS = { minLat: 29.5, maxLat: 33.3, minLng: 34.3, maxLng: 35.9 };

const MOCK_ENTITIES: GeoEntity[] = [
  // Tel Aviv area (customers + warehouses)
  { id: "e1", name: "תעש ישראל HQ", kind: "customer", lat: 32.0853, lng: 34.7818, city: "תל אביב", region: "מרכז", revenue: 4500000, employees: 1200, rating: 4.8, lastActivity: "2026-04-09" },
  { id: "e2", name: "אלקטרה נדל\"ן", kind: "customer", lat: 32.0688, lng: 34.7943, city: "תל אביב", region: "מרכז", revenue: 3200000, employees: 850, rating: 4.6, lastActivity: "2026-04-08" },
  { id: "e3", name: "מחסן מרכזי ת\"א", kind: "warehouse", lat: 32.1002, lng: 34.8000, city: "תל אביב", region: "מרכז", employees: 45, rating: 4.9, lastActivity: "2026-04-10" },
  { id: "e4", name: "אמדוקס", kind: "customer", lat: 32.0600, lng: 34.7700, city: "תל אביב", region: "מרכז", revenue: 5200000, employees: 3400, rating: 4.7, lastActivity: "2026-04-07" },
  { id: "e5", name: "בזק מטה", kind: "customer", lat: 32.0809, lng: 34.7806, city: "תל אביב", region: "מרכז", revenue: 6800000, employees: 5000, rating: 4.5, lastActivity: "2026-04-09" },
  { id: "e6", name: "מחסן דרום ת\"א", kind: "warehouse", lat: 32.0433, lng: 34.7632, city: "תל אביב", region: "מרכז", employees: 30, rating: 4.7, lastActivity: "2026-04-10" },
  { id: "e7", name: "פרויקט אלפא", kind: "project", lat: 32.0750, lng: 34.7900, city: "תל אביב", region: "מרכז", revenue: 2400000, rating: 4.3, lastActivity: "2026-04-06" },
  { id: "e8", name: "משלוח #4521", kind: "delivery", lat: 32.0900, lng: 34.7850, city: "תל אביב", region: "מרכז", lastActivity: "2026-04-10" },
  { id: "e9", name: "ספק אלקטרוניקה ת\"א", kind: "supplier", lat: 32.1150, lng: 34.8200, city: "רמת גן", region: "מרכז", revenue: 1200000, employees: 180, rating: 4.4, lastActivity: "2026-04-08" },
  { id: "e10", name: "אלביט מערכות", kind: "customer", lat: 32.0988, lng: 34.8540, city: "פתח תקווה", region: "מרכז", revenue: 7800000, employees: 4200, rating: 4.9, lastActivity: "2026-04-10" },

  // Haifa area
  { id: "e11", name: "טבע תעשיות", kind: "customer", lat: 32.7940, lng: 34.9896, city: "חיפה", region: "צפון", revenue: 9200000, employees: 6800, rating: 4.8, lastActivity: "2026-04-09" },
  { id: "e12", name: "ZIM נמל חיפה", kind: "customer", lat: 32.8100, lng: 35.0060, city: "חיפה", region: "צפון", revenue: 5400000, employees: 3200, rating: 4.6, lastActivity: "2026-04-08" },
  { id: "e13", name: "מחסן חיפה", kind: "warehouse", lat: 32.8015, lng: 34.9955, city: "חיפה", region: "צפון", employees: 55, rating: 4.8, lastActivity: "2026-04-10" },
  { id: "e14", name: "ספק פלדה א'", kind: "supplier", lat: 32.7580, lng: 34.9560, city: "חיפה", region: "צפון", revenue: 2800000, employees: 420, rating: 4.5, lastActivity: "2026-04-07" },
  { id: "e15", name: "ספק כימיקלים", kind: "supplier", lat: 32.7800, lng: 35.0200, city: "חיפה", region: "צפון", revenue: 1900000, employees: 240, rating: 4.3, lastActivity: "2026-04-06" },
  { id: "e16", name: "פרויקט בטא", kind: "project", lat: 32.7900, lng: 34.9800, city: "חיפה", region: "צפון", revenue: 1800000, rating: 4.4, lastActivity: "2026-04-05" },
  { id: "e17", name: "אינטל חיפה", kind: "customer", lat: 32.7750, lng: 35.0330, city: "חיפה", region: "צפון", revenue: 12000000, employees: 11000, rating: 4.9, lastActivity: "2026-04-10" },
  { id: "e18", name: "משלוח #4525", kind: "delivery", lat: 32.8050, lng: 35.0010, city: "חיפה", region: "צפון", lastActivity: "2026-04-10" },
  { id: "e19", name: "רפאל מחקר", kind: "customer", lat: 32.8250, lng: 35.0500, city: "חיפה", region: "צפון", revenue: 8500000, employees: 3500, rating: 4.8, lastActivity: "2026-04-09" },

  // Jerusalem area
  { id: "e20", name: "אוניברסיטת י-ם", kind: "customer", lat: 31.7767, lng: 35.2345, city: "ירושלים", region: "ירושלים", revenue: 3400000, employees: 2800, rating: 4.6, lastActivity: "2026-04-08" },
  { id: "e21", name: "הדסה הר הצופים", kind: "customer", lat: 31.7959, lng: 35.2430, city: "ירושלים", region: "ירושלים", revenue: 4100000, employees: 4500, rating: 4.7, lastActivity: "2026-04-09" },
  { id: "e22", name: "מחסן ירושלים", kind: "warehouse", lat: 31.7700, lng: 35.2100, city: "ירושלים", region: "ירושלים", employees: 25, rating: 4.6, lastActivity: "2026-04-10" },
  { id: "e23", name: "ספק ציוד רפואי", kind: "supplier", lat: 31.7800, lng: 35.2200, city: "ירושלים", region: "ירושלים", revenue: 1600000, employees: 120, rating: 4.5, lastActivity: "2026-04-07" },
  { id: "e24", name: "משרדי ממשלה", kind: "customer", lat: 31.7820, lng: 35.2100, city: "ירושלים", region: "ירושלים", revenue: 2800000, employees: 1500, rating: 4.2, lastActivity: "2026-04-06" },
  { id: "e25", name: "פרויקט גמא", kind: "project", lat: 31.7650, lng: 35.2200, city: "ירושלים", region: "ירושלים", revenue: 1500000, rating: 4.1, lastActivity: "2026-04-05" },
  { id: "e26", name: "משלוח #4527", kind: "delivery", lat: 31.7850, lng: 35.2300, city: "ירושלים", region: "ירושלים", lastActivity: "2026-04-10" },

  // Beer Sheva area
  { id: "e27", name: "אונ' בן גוריון", kind: "customer", lat: 31.2620, lng: 34.8010, city: "באר שבע", region: "דרום", revenue: 2600000, employees: 2200, rating: 4.5, lastActivity: "2026-04-08" },
  { id: "e28", name: "מחסן דרום", kind: "warehouse", lat: 31.2500, lng: 34.7900, city: "באר שבע", region: "דרום", employees: 35, rating: 4.7, lastActivity: "2026-04-10" },
  { id: "e29", name: "ספק סולר", kind: "supplier", lat: 31.2800, lng: 34.8200, city: "באר שבע", region: "דרום", revenue: 2100000, employees: 180, rating: 4.4, lastActivity: "2026-04-07" },
  { id: "e30", name: "IAI סייבר", kind: "customer", lat: 31.2700, lng: 34.8100, city: "באר שבע", region: "דרום", revenue: 5600000, employees: 1800, rating: 4.8, lastActivity: "2026-04-09" },
  { id: "e31", name: "פרויקט דלתא", kind: "project", lat: 31.2650, lng: 34.8050, city: "באר שבע", region: "דרום", revenue: 2200000, rating: 4.3, lastActivity: "2026-04-06" },

  // Netanya
  { id: "e32", name: "אלקטרה נתניה", kind: "customer", lat: 32.3215, lng: 34.8532, city: "נתניה", region: "מרכז", revenue: 1800000, employees: 400, rating: 4.4, lastActivity: "2026-04-08" },
  { id: "e33", name: "מחסן נתניה", kind: "warehouse", lat: 32.3300, lng: 34.8600, city: "נתניה", region: "מרכז", employees: 22, rating: 4.5, lastActivity: "2026-04-10" },
  { id: "e34", name: "ספק אריזה", kind: "supplier", lat: 32.3100, lng: 34.8700, city: "נתניה", region: "מרכז", revenue: 1400000, employees: 150, rating: 4.3, lastActivity: "2026-04-07" },

  // Herzliya
  { id: "e35", name: "Microsoft הרצליה", kind: "customer", lat: 32.1624, lng: 34.8443, city: "הרצליה", region: "מרכז", revenue: 15000000, employees: 2500, rating: 4.9, lastActivity: "2026-04-10" },
  { id: "e36", name: "Check Point", kind: "customer", lat: 32.1750, lng: 34.8500, city: "הרצליה", region: "מרכז", revenue: 11000000, employees: 3200, rating: 4.9, lastActivity: "2026-04-09" },
  { id: "e37", name: "פרויקט אפסילון", kind: "project", lat: 32.1650, lng: 34.8480, city: "הרצליה", region: "מרכז", revenue: 3400000, rating: 4.5, lastActivity: "2026-04-08" },

  // Rishon
  { id: "e38", name: "סלקום ראשון", kind: "customer", lat: 31.9642, lng: 34.8046, city: "ראשון לציון", region: "מרכז", revenue: 4200000, employees: 1800, rating: 4.5, lastActivity: "2026-04-08" },
  { id: "e39", name: "מחסן ראשון", kind: "warehouse", lat: 31.9720, lng: 34.8100, city: "ראשון לציון", region: "מרכז", employees: 28, rating: 4.6, lastActivity: "2026-04-10" },
  { id: "e40", name: "משלוח #4529", kind: "delivery", lat: 31.9680, lng: 34.8080, city: "ראשון לציון", region: "מרכז", lastActivity: "2026-04-10" },

  // Ashdod
  { id: "e41", name: "נמל אשדוד", kind: "customer", lat: 31.8040, lng: 34.6500, city: "אשדוד", region: "דרום", revenue: 8900000, employees: 4200, rating: 4.7, lastActivity: "2026-04-09" },
  { id: "e42", name: "מחסן אשדוד", kind: "warehouse", lat: 31.8100, lng: 34.6600, city: "אשדוד", region: "דרום", employees: 40, rating: 4.7, lastActivity: "2026-04-10" },
  { id: "e43", name: "ספק לוגיסטיקה", kind: "supplier", lat: 31.7980, lng: 34.6450, city: "אשדוד", region: "דרום", revenue: 3100000, employees: 280, rating: 4.6, lastActivity: "2026-04-08" },

  // Kfar Saba/Raanana
  { id: "e44", name: "אמדוקס רעננה", kind: "customer", lat: 32.1858, lng: 34.8708, city: "רעננה", region: "מרכז", revenue: 5800000, employees: 3800, rating: 4.7, lastActivity: "2026-04-09" },
  { id: "e45", name: "SAP לאבס", kind: "customer", lat: 32.1750, lng: 34.9000, city: "רעננה", region: "מרכז", revenue: 4500000, employees: 1200, rating: 4.8, lastActivity: "2026-04-08" },
  { id: "e46", name: "משלוח #4530", kind: "delivery", lat: 32.1800, lng: 34.8800, city: "רעננה", region: "מרכז", lastActivity: "2026-04-10" },

  // Petach Tikva extra
  { id: "e47", name: "ספק חשמל ב'", kind: "supplier", lat: 32.0900, lng: 34.8800, city: "פתח תקווה", region: "מרכז", revenue: 2300000, employees: 300, rating: 4.5, lastActivity: "2026-04-07" },
  { id: "e48", name: "מחסן פ\"ת", kind: "warehouse", lat: 32.0850, lng: 34.8700, city: "פתח תקווה", region: "מרכז", employees: 32, rating: 4.6, lastActivity: "2026-04-10" },

  // Eilat
  { id: "e49", name: "מלון אילת", kind: "customer", lat: 29.5577, lng: 34.9519, city: "אילת", region: "דרום", revenue: 1900000, employees: 450, rating: 4.5, lastActivity: "2026-04-08" },
  { id: "e50", name: "נמל אילת", kind: "customer", lat: 29.5470, lng: 34.9450, city: "אילת", region: "דרום", revenue: 2800000, employees: 600, rating: 4.4, lastActivity: "2026-04-07" },

  // Tiberias
  { id: "e51", name: "בית חולים פוריה", kind: "customer", lat: 32.7800, lng: 35.5500, city: "טבריה", region: "צפון", revenue: 1700000, employees: 800, rating: 4.4, lastActivity: "2026-04-08" },
  { id: "e52", name: "ספק גליל", kind: "supplier", lat: 32.7900, lng: 35.5400, city: "טבריה", region: "צפון", revenue: 1100000, employees: 95, rating: 4.3, lastActivity: "2026-04-06" },

  // Nazareth
  { id: "e53", name: "לקוח נצרת", kind: "customer", lat: 32.7020, lng: 35.2980, city: "נצרת", region: "צפון", revenue: 2100000, employees: 350, rating: 4.5, lastActivity: "2026-04-07" },
  { id: "e54", name: "פרויקט זתא", kind: "project", lat: 32.7100, lng: 35.3000, city: "נצרת", region: "צפון", revenue: 1600000, rating: 4.2, lastActivity: "2026-04-05" },

  // Modiin
  { id: "e55", name: "אלתא מודיעין", kind: "customer", lat: 31.8969, lng: 35.0100, city: "מודיעין", region: "מרכז", revenue: 3600000, employees: 1400, rating: 4.6, lastActivity: "2026-04-09" },
  { id: "e56", name: "מחסן מודיעין", kind: "warehouse", lat: 31.9050, lng: 35.0200, city: "מודיעין", region: "מרכז", employees: 20, rating: 4.5, lastActivity: "2026-04-10" },

  // Rehovot
  { id: "e57", name: "מכון ויצמן", kind: "customer", lat: 31.9080, lng: 34.8100, city: "רחובות", region: "מרכז", revenue: 3900000, employees: 1800, rating: 4.9, lastActivity: "2026-04-09" },
  { id: "e58", name: "ספק כימי רחובות", kind: "supplier", lat: 31.9000, lng: 34.8050, city: "רחובות", region: "מרכז", revenue: 1800000, employees: 160, rating: 4.5, lastActivity: "2026-04-08" },
  { id: "e59", name: "משלוח #4532", kind: "delivery", lat: 31.9050, lng: 34.8150, city: "רחובות", region: "מרכז", lastActivity: "2026-04-10" },
  { id: "e60", name: "פרויקט איוטה", kind: "project", lat: 31.9030, lng: 34.8080, city: "רחובות", region: "מרכז", revenue: 2100000, rating: 4.4, lastActivity: "2026-04-06" },
  { id: "e61", name: "פרויקט חצרות", kind: "project", lat: 32.0450, lng: 34.7700, city: "תל אביב", region: "מרכז", revenue: 2900000, rating: 4.5, lastActivity: "2026-04-08" },
  { id: "e62", name: "מלם תים", kind: "customer", lat: 32.1050, lng: 34.8150, city: "רמת גן", region: "מרכז", revenue: 4700000, employees: 2900, rating: 4.7, lastActivity: "2026-04-09" },
];

export default function MapGeospatial() {
  const [selectedId, setSelectedId] = useState<string>("e10");
  const [searchText, setSearchText] = useState("");
  const [radiusFilter, setRadiusFilter] = useState(0);
  const [regionFilter, setRegionFilter] = useState<string>("all");
  const [activeLayers, setActiveLayers] = useState<Record<EntityKind, boolean>>({
    customer: true,
    supplier: true,
    warehouse: true,
    delivery: true,
    project: true,
  });
  const [heatMap, setHeatMap] = useState(false);
  const [routePlanner, setRoutePlanner] = useState(true);

  const { data } = useQuery({
    queryKey: ["map-geospatial"],
    queryFn: async () => {
      try {
        const res = await authFetch("/api/palantir/map-geospatial");
        if (!res.ok) throw new Error("fallback");
        return await res.json();
      } catch {
        return { entities: MOCK_ENTITIES };
      }
    },
  });

  const entities: GeoEntity[] = data?.entities || MOCK_ENTITIES;
  const selected = entities.find((e) => e.id === selectedId);

  const filteredEntities = useMemo(() => {
    return entities.filter((e) => {
      if (!activeLayers[e.kind]) return false;
      if (regionFilter !== "all" && e.region !== regionFilter) return false;
      if (searchText && !e.name.includes(searchText) && !e.city.includes(searchText)) return false;
      return true;
    });
  }, [entities, activeLayers, regionFilter, searchText]);

  const latLngToSvg = (lat: number, lng: number) => {
    const x = ((lng - ISRAEL_BOUNDS.minLng) / (ISRAEL_BOUNDS.maxLng - ISRAEL_BOUNDS.minLng)) * 800;
    const y = ((ISRAEL_BOUNDS.maxLat - lat) / (ISRAEL_BOUNDS.maxLat - ISRAEL_BOUNDS.minLat)) * 780;
    return { x: x + 20, y: y + 20 };
  };

  // Calculate distance (haversine-ish simplified)
  const distance = (a: GeoEntity, b: GeoEntity) => {
    const R = 6371;
    const dLat = ((b.lat - a.lat) * Math.PI) / 180;
    const dLng = ((b.lng - a.lng) * Math.PI) / 180;
    const h =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return Math.round(R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)));
  };

  const nearby = selected
    ? entities
        .filter((e) => e.id !== selected.id)
        .map((e) => ({ ...e, dist: distance(selected, e) }))
        .sort((a, b) => a.dist - b.dist)
        .slice(0, 6)
    : [];

  // Route planning: warehouses -> deliveries
  const warehouses = entities.filter((e) => e.kind === "warehouse");
  const deliveries = entities.filter((e) => e.kind === "delivery");
  const routes = deliveries.map((d) => {
    const nearestWh = warehouses
      .map((w) => ({ w, dist: distance(w, d) }))
      .sort((a, b) => a.dist - b.dist)[0];
    return { from: nearestWh?.w, to: d, dist: nearestWh?.dist || 0 };
  });

  const stats = {
    total: filteredEntities.length,
    byRegion: {
      מרכז: filteredEntities.filter((e) => e.region === "מרכז").length,
      צפון: filteredEntities.filter((e) => e.region === "צפון").length,
      ירושלים: filteredEntities.filter((e) => e.region === "ירושלים").length,
      דרום: filteredEntities.filter((e) => e.region === "דרום").length,
    },
    topRegion: "מרכז",
  };

  const regions = ["all", "מרכז", "צפון", "ירושלים", "דרום"];

  return (
    <div dir="rtl" className="min-h-screen bg-[#0a0e1a] text-white p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/40">
            <Globe className="h-7 w-7 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Map Analysis — ניתוח גיאוגרפי</h1>
            <p className="text-sm text-gray-400">מפת ישויות — לקוחות, ספקים, מחסנים ומשלוחים ברחבי ישראל</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-emerald-500/40 text-emerald-400">{filteredEntities.length} ישויות מוצגות</Badge>
          <Badge variant="outline" className="border-teal-500/40 text-teal-400">{routes.length} מסלולים פעילים</Badge>
        </div>
      </div>

      {/* Top toolbar: Layer toggles */}
      <Card className="bg-[#111827] border-[#1f2937] mb-4">
        <CardContent className="p-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-emerald-400" />
              <span className="text-xs text-gray-400">שכבות:</span>
              {(Object.keys(KIND_CONFIG) as EntityKind[]).map((kind) => {
                const cfg = KIND_CONFIG[kind];
                const Icon = cfg.icon;
                const active = activeLayers[kind];
                return (
                  <button
                    key={kind}
                    onClick={() => setActiveLayers({ ...activeLayers, [kind]: !active })}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs border transition-all ${
                      active
                        ? "bg-[#0a0e1a] border-[#1f2937] " + cfg.color
                        : "border-[#1f2937] text-gray-600 opacity-50"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {cfg.label}
                    <Badge variant="outline" className="h-4 text-[9px] mr-1 border-[#1f2937]">
                      {entities.filter((e) => e.kind === kind).length}
                    </Badge>
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={heatMap}
                  onChange={(e) => setHeatMap(e.target.checked)}
                  className="accent-red-500"
                />
                <Thermometer className="h-3.5 w-3.5 text-red-400" />
                <span className="text-gray-400">Heat Map</span>
              </label>
              <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={routePlanner}
                  onChange={(e) => setRoutePlanner(e.target.checked)}
                  className="accent-indigo-500"
                />
                <Route className="h-3.5 w-3.5 text-indigo-400" />
                <span className="text-gray-400">Routes</span>
              </label>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-12 gap-4">
        {/* LEFT: Search + filters */}
        <div className="col-span-3 space-y-4">
          <Card className="bg-[#111827] border-[#1f2937]">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-white text-sm">
                <Search className="h-4 w-4 text-emerald-400" />
                חיפוש וסינון
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <div className="text-[11px] text-gray-400 mb-1">שם/עיר</div>
                <div className="relative">
                  <Search className="h-3.5 w-3.5 absolute right-3 top-2.5 text-gray-500" />
                  <Input
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    className="bg-[#0a0e1a] border-[#1f2937] h-9 text-xs pr-9"
                    placeholder="חיפוש..."
                  />
                </div>
              </div>
              <div>
                <div className="text-[11px] text-gray-400 mb-1">מחוז</div>
                <select
                  value={regionFilter}
                  onChange={(e) => setRegionFilter(e.target.value)}
                  className="w-full bg-[#0a0e1a] border border-[#1f2937] rounded-md px-3 py-2 text-xs h-9"
                >
                  {regions.map((r) => (
                    <option key={r} value={r}>{r === "all" ? "כל המחוזות" : r}</option>
                  ))}
                </select>
              </div>
              <div>
                <div className="text-[11px] text-gray-400 mb-1">רדיוס (ק"מ): {radiusFilter}</div>
                <input
                  type="range"
                  min="0"
                  max="200"
                  value={radiusFilter}
                  onChange={(e) => setRadiusFilter(Number(e.target.value))}
                  className="w-full accent-emerald-500"
                />
              </div>
              <Button className="w-full h-8 text-xs bg-emerald-600 hover:bg-emerald-700">
                <Compass className="h-3 w-3 ml-1" /> חפש באזור
              </Button>
            </CardContent>
          </Card>

          <Card className="bg-[#111827] border-[#1f2937]">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-white text-sm">
                <TrendingUp className="h-4 w-4 text-emerald-400" />
                ישויות לפי סוג
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(Object.keys(KIND_CONFIG) as EntityKind[]).map((kind) => {
                const cfg = KIND_CONFIG[kind];
                const Icon = cfg.icon;
                const count = filteredEntities.filter((e) => e.kind === kind).length;
                const total = entities.filter((e) => e.kind === kind).length;
                return (
                  <div key={kind} className="flex items-center justify-between p-2 rounded bg-[#0a0e1a] border border-[#1f2937]">
                    <div className="flex items-center gap-2">
                      <Icon className={`h-3.5 w-3.5 ${cfg.color}`} />
                      <span className="text-xs">{cfg.label}</span>
                    </div>
                    <Badge variant="outline" className="h-4 text-[9px] border-[#1f2937]" style={{ color: cfg.bgHex }}>
                      {count}/{total}
                    </Badge>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card className="bg-[#111827] border-[#1f2937]">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-white text-sm">
                <Building2 className="h-4 w-4 text-emerald-400" />
                התפלגות גיאוגרפית
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {Object.entries(stats.byRegion).map(([region, count]) => {
                const pct = stats.total > 0 ? (count / stats.total) * 100 : 0;
                return (
                  <div key={region}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-gray-400">{region}</span>
                      <span className="text-emerald-400 font-bold">{count}</span>
                    </div>
                    <div className="h-1.5 bg-[#0a0e1a] rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-emerald-500 to-teal-500" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>

        {/* CENTER: Map */}
        <div className="col-span-6">
          <Card className="bg-[#111827] border-[#1f2937]">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-white text-sm">
                  <MapPin className="h-4 w-4 text-emerald-400" />
                  מפת ישראל — {filteredEntities.length} ישויות
                </CardTitle>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0"><Locate className="h-3.5 w-3.5" /></Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0"><Maximize2 className="h-3.5 w-3.5" /></Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg bg-[#0a0e1a] border border-[#1f2937] overflow-hidden relative">
                <svg viewBox="0 0 840 820" className="w-full" style={{ maxHeight: "750px" }}>
                  <defs>
                    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                      <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1f2937" strokeWidth="0.5" />
                    </pattern>
                    <radialGradient id="heatGrad">
                      <stop offset="0%" stopColor="#ef4444" stopOpacity="0.6" />
                      <stop offset="50%" stopColor="#f97316" stopOpacity="0.3" />
                      <stop offset="100%" stopColor="#f97316" stopOpacity="0" />
                    </radialGradient>
                  </defs>
                  {/* Grid background */}
                  <rect width="840" height="820" fill="url(#grid)" />

                  {/* Stylized Israel outline */}
                  <path
                    d="M 250 60 L 340 75 L 420 160 L 480 280 L 520 400 L 530 520 L 500 580 L 450 650 L 400 720 L 320 780 L 250 760 L 230 680 L 240 600 L 220 500 L 230 400 L 250 320 L 240 240 L 260 160 L 250 60 Z"
                    fill="#0f172a"
                    stroke="#374151"
                    strokeWidth="1.5"
                    strokeDasharray="4,4"
                  />
                  <path
                    d="M 480 280 L 520 260 L 530 300 L 510 320 Z"
                    fill="#0f172a"
                    stroke="#374151"
                    strokeWidth="1"
                  />

                  {/* City labels */}
                  {[
                    { name: "תל אביב", x: 310, y: 340 },
                    { name: "חיפה", x: 350, y: 140 },
                    { name: "ירושלים", x: 430, y: 370 },
                    { name: "באר שבע", x: 350, y: 600 },
                    { name: "אילת", x: 420, y: 770 },
                    { name: "טבריה", x: 450, y: 180 },
                  ].map((c, i) => (
                    <text key={i} x={c.x} y={c.y} fill="#4b5563" fontSize="10" textAnchor="middle" fontStyle="italic">
                      {c.name}
                    </text>
                  ))}

                  {/* Heat map overlay */}
                  {heatMap && filteredEntities.map((e) => {
                    const { x, y } = latLngToSvg(e.lat, e.lng);
                    return <circle key={`heat-${e.id}`} cx={x} cy={y} r="35" fill="url(#heatGrad)" />;
                  })}

                  {/* Routes */}
                  {routePlanner && routes.map((r, i) => {
                    if (!r.from) return null;
                    const from = latLngToSvg(r.from.lat, r.from.lng);
                    const to = latLngToSvg(r.to.lat, r.to.lng);
                    return (
                      <g key={`route-${i}`}>
                        <line
                          x1={from.x}
                          y1={from.y}
                          x2={to.x}
                          y2={to.y}
                          stroke="#6366f1"
                          strokeWidth="1.5"
                          strokeOpacity="0.6"
                          strokeDasharray="4,2"
                        />
                        <circle cx={(from.x + to.x) / 2} cy={(from.y + to.y) / 2} r="2" fill="#818cf8" />
                      </g>
                    );
                  })}

                  {/* Entity markers */}
                  {filteredEntities.map((e) => {
                    const { x, y } = latLngToSvg(e.lat, e.lng);
                    const cfg = KIND_CONFIG[e.kind];
                    const isSelected = e.id === selectedId;
                    const r = isSelected ? 9 : 6;
                    return (
                      <g key={e.id} onClick={() => setSelectedId(e.id)} style={{ cursor: "pointer" }}>
                        {isSelected && (
                          <circle cx={x} cy={y} r={r + 7} fill="none" stroke={cfg.bgHex} strokeWidth="2" className="animate-pulse" />
                        )}
                        <circle cx={x} cy={y} r={r + 3} fill={cfg.bgHex} fillOpacity="0.3" />
                        <circle
                          cx={x}
                          cy={y}
                          r={r}
                          fill={cfg.bgHex}
                          stroke={isSelected ? "white" : "#0a0e1a"}
                          strokeWidth={isSelected ? 2 : 1}
                        />
                      </g>
                    );
                  })}
                </svg>

                <div className="absolute bottom-3 left-3 bg-[#111827] border border-[#1f2937] rounded-lg p-2">
                  <div className="text-[10px] text-gray-500 mb-1">מקרא</div>
                  <div className="space-y-1">
                    {(Object.entries(KIND_CONFIG) as [EntityKind, typeof KIND_CONFIG.customer][]).map(([k, cfg]) => (
                      <div key={k} className="flex items-center gap-1.5 text-[10px]">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: cfg.bgHex }} />
                        <span className="text-gray-400">{cfg.label}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="absolute top-3 left-3 bg-[#111827] border border-[#1f2937] rounded-lg px-3 py-2">
                  <div className="text-[10px] text-gray-500">Scale</div>
                  <div className="flex items-center gap-1 text-[10px] text-gray-400">
                    <div className="w-8 h-0.5 bg-gray-400" />
                    <span>50 ק"מ</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* RIGHT: Selected + nearby */}
        <div className="col-span-3 space-y-4">
          {selected && (
            <Card className="bg-[#111827] border-[#1f2937]">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <CardTitle className="flex items-center gap-2 text-white text-sm">
                    <Target className="h-4 w-4 text-emerald-400" />
                    ישות נבחרת
                  </CardTitle>
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setSelectedId("")}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Badge variant="outline" className={KIND_CONFIG[selected.kind].color + " border-[#1f2937]"}>
                    {KIND_CONFIG[selected.kind].label}
                  </Badge>
                </div>
                <div className="text-sm font-bold">{selected.name}</div>
                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">עיר:</span>
                    <span className="text-emerald-400">{selected.city}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">מחוז:</span>
                    <span>{selected.region}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">קואורדינטות:</span>
                    <span className="text-[10px] font-mono text-gray-400">{selected.lat.toFixed(3)}, {selected.lng.toFixed(3)}</span>
                  </div>
                  {selected.revenue && (
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">הכנסות:</span>
                      <span className="text-green-400">₪{(selected.revenue / 1000).toFixed(0)}K</span>
                    </div>
                  )}
                  {selected.employees && (
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">עובדים:</span>
                      <span>{selected.employees}</span>
                    </div>
                  )}
                  {selected.rating && (
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">דירוג:</span>
                      <span className="text-amber-400">★ {selected.rating.toFixed(1)}</span>
                    </div>
                  )}
                </div>
                <Button className="w-full h-8 text-xs bg-emerald-600 hover:bg-emerald-700">
                  <Navigation className="h-3 w-3 ml-1" /> נווט לכאן
                </Button>
              </CardContent>
            </Card>
          )}

          {selected && (
            <Card className="bg-[#111827] border-[#1f2937]">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-white text-sm">
                  <Compass className="h-4 w-4 text-teal-400" />
                  ישויות בקרבת מקום
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {nearby.map((n) => {
                  const cfg = KIND_CONFIG[n.kind];
                  const Icon = cfg.icon;
                  return (
                    <div
                      key={n.id}
                      onClick={() => setSelectedId(n.id)}
                      className="flex items-center gap-2 p-2 rounded bg-[#0a0e1a] border border-[#1f2937] hover:border-teal-500/40 cursor-pointer"
                    >
                      <Icon className={`h-3.5 w-3.5 ${cfg.color}`} />
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] font-medium truncate">{n.name}</div>
                        <div className="text-[9px] text-gray-500">{n.city}</div>
                      </div>
                      <Badge variant="outline" className="h-4 text-[9px] border-[#1f2937] text-teal-400">
                        {n.dist}ק"מ
                      </Badge>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Bottom statistics */}
      <div className="grid grid-cols-4 gap-4 mt-4">
        <Card className="bg-[#111827] border-[#1f2937]">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-400">ריכוז עליון</span>
              <Building2 className="h-4 w-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-bold text-emerald-400">מרכז</div>
            <div className="text-[10px] text-gray-500 mt-1">{stats.byRegion.מרכז} ישויות • {((stats.byRegion.מרכז / stats.total) * 100).toFixed(0)}%</div>
          </CardContent>
        </Card>
        <Card className="bg-[#111827] border-[#1f2937]">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-400">סה"כ מסלולים</span>
              <Route className="h-4 w-4 text-indigo-400" />
            </div>
            <div className="text-2xl font-bold text-indigo-400">{routes.length}</div>
            <div className="text-[10px] text-gray-500 mt-1">אורך ממוצע: {routes.length > 0 ? Math.round(routes.reduce((s, r) => s + r.dist, 0) / routes.length) : 0} ק"מ</div>
          </CardContent>
        </Card>
        <Card className="bg-[#111827] border-[#1f2937]">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-400">מחסנים פעילים</span>
              <Warehouse className="h-4 w-4 text-purple-400" />
            </div>
            <div className="text-2xl font-bold text-purple-400">{warehouses.length}</div>
            <div className="text-[10px] text-gray-500 mt-1">כיסוי ארצי מלא</div>
          </CardContent>
        </Card>
        <Card className="bg-[#111827] border-[#1f2937]">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-400">משלוחים פעילים</span>
              <Package className="h-4 w-4 text-orange-400" />
            </div>
            <div className="text-2xl font-bold text-orange-400">{deliveries.length}</div>
            <div className="text-[10px] text-gray-500 mt-1">בתנועה עכשיו</div>
          </CardContent>
        </Card>
      </div>

      {/* Route planner table */}
      <Card className="bg-[#111827] border-[#1f2937] mt-4">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-white text-sm">
            <Route className="h-4 w-4 text-indigo-400" />
            מתכנן מסלולים — מחסנים ← משלוחים
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-[#1f2937] overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[#0a0e1a] border-b border-[#1f2937]">
                <tr>
                  <th className="text-right px-4 py-2 text-xs text-gray-400 font-medium">מחסן מקור</th>
                  <th className="text-right px-4 py-2 text-xs text-gray-400 font-medium">עיר מקור</th>
                  <th className="text-right px-4 py-2 text-xs text-gray-400 font-medium">יעד</th>
                  <th className="text-right px-4 py-2 text-xs text-gray-400 font-medium">עיר יעד</th>
                  <th className="text-right px-4 py-2 text-xs text-gray-400 font-medium">מרחק</th>
                  <th className="text-right px-4 py-2 text-xs text-gray-400 font-medium">ETA</th>
                  <th className="text-right px-4 py-2 text-xs text-gray-400 font-medium">פעולה</th>
                </tr>
              </thead>
              <tbody>
                {routes.map((r, i) => {
                  if (!r.from) return null;
                  const eta = Math.round(r.dist / 60) + "ש " + Math.round((r.dist % 60) * 1.5) + "ד";
                  return (
                    <tr key={i} className="border-b border-[#1f2937] hover:bg-[#0a0e1a]/50">
                      <td className="px-4 py-2 text-purple-400">{r.from.name}</td>
                      <td className="px-4 py-2 text-xs text-gray-400">{r.from.city}</td>
                      <td className="px-4 py-2 text-orange-400">{r.to.name}</td>
                      <td className="px-4 py-2 text-xs text-gray-400">{r.to.city}</td>
                      <td className="px-4 py-2 text-indigo-400 font-bold">{r.dist} ק"מ</td>
                      <td className="px-4 py-2 text-xs text-gray-400">{eta}</td>
                      <td className="px-4 py-2">
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0 hover:bg-[#1f2937]" onClick={() => setSelectedId(r.to.id)}>
                          <Target className="h-3 w-3 text-indigo-400" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
