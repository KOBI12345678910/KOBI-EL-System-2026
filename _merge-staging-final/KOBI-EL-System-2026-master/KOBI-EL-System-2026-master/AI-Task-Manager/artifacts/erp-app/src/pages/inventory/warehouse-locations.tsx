import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { MapPin, Plus, Search } from "lucide-react";

interface WarehouseLocation {
  id: number;
  warehouse_id: number;
  location_code: string;
  zone: string;
  aisle: string;
  shelf: string;
  bin: string;
  max_weight: number;
  max_volume: number;
  is_occupied: boolean;
  is_active: boolean;
  created_at: string;
}

export default function WarehouseLocationsPage() {
  const [items, setItems] = useState<WarehouseLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const token = localStorage.getItem("erp_token");

  useEffect(() => {
    fetchItems();
  }, []);

  async function fetchItems() {
    try {
      setLoading(true);
      const res = await fetch("/api/warehouse-locations", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const filtered = items.filter(
    (i) =>
      (i.location_code || "").toLowerCase().includes(search.toLowerCase()) ||
      (i.zone || "").toLowerCase().includes(search.toLowerCase()) ||
      (i.aisle || "").toLowerCase().includes(search.toLowerCase())
  );

  const totalLocations = items.length;
  const occupied = items.filter((i) => i.is_occupied).length;
  const active = items.filter((i) => i.is_active).length;

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0a0e1a] to-[#1a1f35] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0e1a] to-[#1a1f35] text-foreground p-6" dir="rtl">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <MapPin className="text-purple-400" />
              מיקומי מחסן
            </h1>
            <p className="text-muted-foreground mt-1">ניהול מיקומים, אזורים ומדפים במחסנים</p>
          </div>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400">{error}</div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { label: "סה״כ מיקומים", value: totalLocations, color: "purple" },
            { label: "מיקומים תפוסים", value: occupied, color: "orange" },
            { label: "מיקומים פעילים", value: active, color: "green" },
          ].map((kpi, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
              className="bg-card/5 border border-white/10 rounded-xl p-4"
            >
              <p className="text-muted-foreground text-sm">{kpi.label}</p>
              <p className={`text-2xl font-bold text-${kpi.color}-400`}>{kpi.value}</p>
            </motion.div>
          ))}
        </div>

        <div className="bg-card/5 border border-white/10 rounded-xl p-4">
          <div className="flex items-center gap-4 mb-4">
            <div className="flex-1 relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
              <input
                className="w-full bg-card/5 border border-white/10 rounded-lg pl-4 pr-10 py-2 text-foreground"
                placeholder="חיפוש לפי קוד מיקום, אזור, מעבר..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <MapPin className="mx-auto mb-4 opacity-50" size={48} />
              <p>אין מיקומי מחסן</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-muted-foreground">
                    <th className="text-right p-3">#</th>
                    <th className="text-right p-3">קוד מיקום</th>
                    <th className="text-right p-3">אזור</th>
                    <th className="text-right p-3">מעבר</th>
                    <th className="text-right p-3">מדף</th>
                    <th className="text-right p-3">תא</th>
                    <th className="text-right p-3">משקל מקס</th>
                    <th className="text-right p-3">נפח מקס</th>
                    <th className="text-right p-3">תפוס</th>
                    <th className="text-right p-3">פעיל</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item) => (
                    <tr key={item.id} className="border-b border-white/5 hover:bg-card/5">
                      <td className="p-3">{item.id}</td>
                      <td className="p-3 font-mono font-bold">{item.location_code || "-"}</td>
                      <td className="p-3">{item.zone || "-"}</td>
                      <td className="p-3">{item.aisle || "-"}</td>
                      <td className="p-3">{item.shelf || "-"}</td>
                      <td className="p-3">{item.bin || "-"}</td>
                      <td className="p-3">{item.max_weight ? `${item.max_weight} ק"ג` : "-"}</td>
                      <td className="p-3">{item.max_volume ? `${item.max_volume} מ"ק` : "-"}</td>
                      <td className="p-3">
                        <span className={`px-2 py-1 rounded-full text-xs ${item.is_occupied ? "text-orange-400 bg-orange-400/10" : "text-green-400 bg-green-400/10"}`}>
                          {item.is_occupied ? "תפוס" : "פנוי"}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className={`px-2 py-1 rounded-full text-xs ${item.is_active ? "text-green-400 bg-green-400/10" : "text-red-400 bg-red-400/10"}`}>
                          {item.is_active ? "פעיל" : "לא פעיל"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}