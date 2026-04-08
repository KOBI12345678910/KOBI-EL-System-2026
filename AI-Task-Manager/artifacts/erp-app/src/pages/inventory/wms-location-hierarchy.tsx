import { useState, useEffect, useCallback } from "react";
import { authFetch } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { MapPin, Plus, Search, X, Save, RefreshCw, AlertCircle, Loader2, ChevronRight, ChevronDown, Thermometer, Package } from "lucide-react";

const LOCATION_TYPES = [
  { v: "zone", label: "אזור", color: "bg-blue-500/20 text-blue-300" },
  { v: "aisle", label: "מעבר", color: "bg-purple-500/20 text-purple-300" },
  { v: "shelf", label: "מדף", color: "bg-cyan-500/20 text-cyan-300" },
  { v: "bin", label: "תא", color: "bg-green-500/20 text-green-300" },
];

const TEMP_ZONES = ["רגיל", "מקורר (2-8°C)", "קפוא (-18°C)", "בטמפרטורה מבוקרת", "חדר נקי"];
const STATUSES = ["active", "inactive", "maintenance", "full", "reserved"];
const STATUS_LABELS: Record<string, string> = { active: "פעיל", inactive: "לא פעיל", maintenance: "תחזוקה", full: "מלא", reserved: "שמור" };
const STATUS_COLORS: Record<string, string> = { active: "bg-green-500/20 text-green-300", inactive: "bg-gray-500/20 text-gray-300", maintenance: "bg-yellow-500/20 text-yellow-300", full: "bg-red-500/20 text-red-300", reserved: "bg-blue-500/20 text-blue-300" };

export default function WmsLocationHierarchyPage() {
  const [locations, setLocations] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [warehouseFilter, setWarehouseFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expandedZones, setExpandedZones] = useState<Set<number>>(new Set());
  const [form, setForm] = useState<any>({
    location_type: "bin",
    status: "active",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (warehouseFilter) params.set("warehouse_id", warehouseFilter);
      const [locRes, whRes] = await Promise.all([
        authFetch(`/api/wms/location-hierarchy?${params}`),
        authFetch("/api/warehouses"),
      ]);
      if (locRes.ok) { const j = await locRes.json(); setLocations(j.data || []); }
      if (whRes.ok) { const j = await whRes.json(); setWarehouses(Array.isArray(j) ? j : j.data || []); }
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  }, [warehouseFilter]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await authFetch("/api/wms/warehouse-locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("שגיאה בשמירה");
      setShowCreate(false);
      setForm({ location_type: "bin", status: "active" });
      await load();
    } catch (e: any) { setError(e.message); }
    setSaving(false);
  };

  const filtered = locations.filter(loc => {
    const matchSearch = !search || (loc.location_code || "").toLowerCase().includes(search.toLowerCase()) ||
      (loc.zone || "").toLowerCase().includes(search.toLowerCase());
    const matchType = typeFilter === "all" || (loc.location_type || "bin") === typeFilter;
    return matchSearch && matchType;
  });

  const zones = filtered.filter(l => (l.location_type || "bin") === "zone");
  const nonZones = filtered.filter(l => (l.location_type || "bin") !== "zone");

  const buildGrid = (parentId: number | null, level: number): React.ReactElement | null => {
    const children = filtered.filter(l => l.parent_location_id === parentId);
    if (!children.length && parentId !== null) return null;

    const items = parentId === null
      ? filtered.filter(l => !l.parent_location_id)
      : children;

    return (
      <div className={level > 0 ? "mr-4 border-r border-border/50 pr-2" : ""}>
        {items.map(loc => {
          const typeCfg = LOCATION_TYPES.find(t => t.v === (loc.location_type || "bin"));
          const isExpanded = expandedZones.has(loc.id);
          const hasChildren = loc.child_count > 0;

          return (
            <div key={loc.id} className="mb-1">
              <div className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted/30 transition-colors group">
                <button
                  className="w-4 h-4 flex-shrink-0"
                  onClick={() => {
                    const next = new Set(expandedZones);
                    isExpanded ? next.delete(loc.id) : next.add(loc.id);
                    setExpandedZones(next);
                  }}
                >
                  {hasChildren ? (
                    isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : <span className="w-3.5" />}
                </button>

                <Badge className={`border-0 text-[9px] px-1.5 py-0 flex-shrink-0 ${typeCfg?.color || "bg-gray-500/20 text-gray-300"}`}>
                  {typeCfg?.label || "תא"}
                </Badge>

                <span className="font-mono text-sm text-foreground">{loc.location_code || "-"}</span>

                {loc.zone && loc.zone !== loc.location_code && (
                  <span className="text-xs text-muted-foreground">{loc.zone}</span>
                )}

                {loc.temperature_zone && (
                  <span className="flex items-center gap-1 text-xs text-cyan-400">
                    <Thermometer className="h-3 w-3" />{loc.temperature_zone}
                  </span>
                )}

                {loc.items_count > 0 && (
                  <span className="flex items-center gap-1 text-xs text-emerald-400">
                    <Package className="h-3 w-3" />{loc.items_count}
                  </span>
                )}

                {loc.capacity_units && (
                  <span className="text-xs text-muted-foreground">קיבולת: {loc.capacity_units}</span>
                )}

                {loc.status && loc.status !== "active" && (
                  <Badge className={`border-0 text-[9px] px-1.5 py-0 ${STATUS_COLORS[loc.status] || ""}`}>
                    {STATUS_LABELS[loc.status] || loc.status}
                  </Badge>
                )}

                <span className="text-xs text-muted-foreground mr-auto">{loc.warehouse_name || ""}</span>
              </div>

              {hasChildren && isExpanded && (
                <LocationChildren parentId={loc.id} locations={filtered} level={level + 1} expandedZones={expandedZones} setExpandedZones={setExpandedZones} />
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="p-6 space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <MapPin className="h-6 w-6 text-cyan-400" />
            היררכיית מיקומים — Location Hierarchy
          </h1>
          <p className="text-sm text-muted-foreground mt-1">מבנה אזור → מעבר → מדף → תא עם קיבולת, ממדים וטמפרטורה</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} className="border-border text-gray-300 gap-1">
            <RefreshCw className="h-4 w-4" />רענן
          </Button>
          <Button onClick={() => setShowCreate(true)} className="bg-cyan-600 hover:bg-cyan-700 gap-1">
            <Plus className="h-4 w-4" />מיקום חדש
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400">
          <AlertCircle className="h-4 w-4" /><span className="text-sm">{error}</span>
          <button onClick={() => setError("")} className="mr-auto"><X className="h-4 w-4" /></button>
        </div>
      )}

      <Card className="bg-card/60 border-border">
        <CardContent className="p-3">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש קוד מיקום, אזור..." className="pr-9 bg-input border-border text-foreground h-9" />
            </div>
            <select value={warehouseFilter} onChange={e => setWarehouseFilter(e.target.value)} className="bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground h-9">
              <option value="">כל המחסנים</option>
              {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
            <div className="flex gap-1">
              <button onClick={() => setTypeFilter("all")} className={`px-3 py-1.5 rounded text-xs border ${typeFilter === "all" ? "border-cyan-500 bg-cyan-500/10 text-cyan-300" : "border-border text-gray-400"}`}>הכל</button>
              {LOCATION_TYPES.map(t => (
                <button key={t.v} onClick={() => setTypeFilter(t.v)} className={`px-3 py-1.5 rounded text-xs border ${typeFilter === t.v ? "border-cyan-500 bg-cyan-500/10 text-cyan-300" : "border-border text-gray-400"}`}>{t.label}</button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {LOCATION_TYPES.map(t => {
          const count = locations.filter(l => (l.location_type || "bin") === t.v).length;
          return (
            <Card key={t.v} className="bg-card/80 border-border">
              <CardContent className="p-3">
                <p className="text-[11px] text-muted-foreground">{t.label}ים</p>
                <p className={`text-xl font-bold font-mono mt-1 ${t.color.split(" ")[1]}`}>{count}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-card border border-border rounded-xl w-full max-w-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="text-lg font-bold text-foreground">מיקום חדש</h2>
              <Button variant="ghost" size="sm" onClick={() => setShowCreate(false)}><X className="h-4 w-4" /></Button>
            </div>
            <div className="p-4 grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-muted-foreground">מחסן *</label>
                <select value={form.warehouse_id || ""} onChange={e => setForm({ ...form, warehouse_id: e.target.value })} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1">
                  <option value="">בחר...</option>
                  {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">קוד מיקום *</label>
                <Input value={form.location_code || ""} onChange={e => setForm({ ...form, location_code: e.target.value })} placeholder="A-01-02-03" className="bg-input border-border text-foreground mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">סוג מיקום</label>
                <select value={form.location_type || "bin"} onChange={e => setForm({ ...form, location_type: e.target.value })} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1">
                  {LOCATION_TYPES.map(t => <option key={t.v} value={t.v}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">מיקום אב</label>
                <select value={form.parent_location_id || ""} onChange={e => setForm({ ...form, parent_location_id: e.target.value || null })} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1">
                  <option value="">ללא</option>
                  {locations.filter(l => l.warehouse_id == form.warehouse_id).map(l => <option key={l.id} value={l.id}>{l.location_code}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">אזור</label>
                <Input value={form.zone || ""} onChange={e => setForm({ ...form, zone: e.target.value })} className="bg-input border-border text-foreground mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">מעבר</label>
                <Input value={form.aisle || ""} onChange={e => setForm({ ...form, aisle: e.target.value })} className="bg-input border-border text-foreground mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">מדף</label>
                <Input value={form.shelf || ""} onChange={e => setForm({ ...form, shelf: e.target.value })} className="bg-input border-border text-foreground mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">תא</label>
                <Input value={form.bin || ""} onChange={e => setForm({ ...form, bin: e.target.value })} className="bg-input border-border text-foreground mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">קיבולת (יח')</label>
                <Input value={form.capacity_units || ""} onChange={e => setForm({ ...form, capacity_units: e.target.value })} type="number" className="bg-input border-border text-foreground mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">קיבולת משקל (ק"ג)</label>
                <Input value={form.capacity_weight_kg || ""} onChange={e => setForm({ ...form, capacity_weight_kg: e.target.value })} type="number" className="bg-input border-border text-foreground mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">ממדים</label>
                <Input value={form.dimensions_cm || ""} onChange={e => setForm({ ...form, dimensions_cm: e.target.value })} placeholder="100x80x200 ס'מ" className="bg-input border-border text-foreground mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">אזור טמפרטורה</label>
                <select value={form.temperature_zone || ""} onChange={e => setForm({ ...form, temperature_zone: e.target.value })} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1">
                  <option value="">רגיל</option>
                  {TEMP_ZONES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">סטטוס</label>
                <select value={form.status || "active"} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1">
                  {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="text-xs text-muted-foreground">הערות</label>
                <textarea value={form.notes || ""} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1 resize-none" />
              </div>
            </div>
            <div className="flex justify-end gap-2 p-4 border-t border-border">
              <Button variant="outline" onClick={() => setShowCreate(false)} className="border-border">ביטול</Button>
              <Button onClick={handleSave} disabled={saving} className="bg-cyan-600 hover:bg-cyan-700 gap-1">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}שמור
              </Button>
            </div>
          </div>
        </div>
      )}

      <Card className="bg-card/80 border-border">
        <CardContent className="p-4">
          {loading ? (
            <div className="text-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-cyan-400 mx-auto mb-2" />
              <span className="text-muted-foreground">טוען...</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12">
              <MapPin className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">אין מיקומים — הוסף מיקום חדש</p>
            </div>
          ) : (
            <LocationTree locations={filtered} expandedZones={expandedZones} setExpandedZones={setExpandedZones} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function LocationChildren({ parentId, locations, level, expandedZones, setExpandedZones }: any) {
  const children = locations.filter((l: any) => l.parent_location_id === parentId);
  if (!children.length) return null;

  return (
    <div className="mr-4 border-r border-border/50 pr-2">
      {children.map((loc: any) => {
        const typeCfg = LOCATION_TYPES.find(t => t.v === (loc.location_type || "bin"));
        const isExpanded = expandedZones.has(loc.id);
        const hasChildren = loc.child_count > 0;

        return (
          <div key={loc.id} className="mb-1">
            <div className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted/30 transition-colors">
              <button className="w-4 h-4 flex-shrink-0" onClick={() => {
                const next = new Set(expandedZones);
                isExpanded ? next.delete(loc.id) : next.add(loc.id);
                setExpandedZones(next);
              }}>
                {hasChildren ? (isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />) : <span className="w-3.5" />}
              </button>
              <Badge className={`border-0 text-[9px] px-1.5 py-0 flex-shrink-0 ${typeCfg?.color || ""}`}>{typeCfg?.label || "תא"}</Badge>
              <span className="font-mono text-sm text-foreground">{loc.location_code || "-"}</span>
              {loc.temperature_zone && <span className="flex items-center gap-1 text-xs text-cyan-400"><Thermometer className="h-3 w-3" />{loc.temperature_zone}</span>}
              {loc.items_count > 0 && <span className="flex items-center gap-1 text-xs text-emerald-400"><Package className="h-3 w-3" />{loc.items_count}</span>}
            </div>
            {hasChildren && isExpanded && <LocationChildren parentId={loc.id} locations={locations} level={level + 1} expandedZones={expandedZones} setExpandedZones={setExpandedZones} />}
          </div>
        );
      })}
    </div>
  );
}

function LocationTree({ locations, expandedZones, setExpandedZones }: any) {
  const roots = locations.filter((l: any) => !l.parent_location_id);

  return (
    <div>
      {roots.map((loc: any) => {
        const typeCfg = LOCATION_TYPES.find(t => t.v === (loc.location_type || "bin"));
        const isExpanded = expandedZones.has(loc.id);
        const hasChildren = loc.child_count > 0;

        return (
          <div key={loc.id} className="mb-1">
            <div className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted/30 transition-colors">
              <button className="w-4 h-4 flex-shrink-0" onClick={() => {
                const next = new Set(expandedZones);
                isExpanded ? next.delete(loc.id) : next.add(loc.id);
                setExpandedZones(next);
              }}>
                {hasChildren ? (isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />) : <span className="w-3.5" />}
              </button>
              <Badge className={`border-0 text-[9px] px-1.5 py-0 flex-shrink-0 ${typeCfg?.color || ""}`}>{typeCfg?.label || "תא"}</Badge>
              <span className="font-mono text-sm font-medium text-foreground">{loc.location_code || "-"}</span>
              {loc.temperature_zone && <span className="flex items-center gap-1 text-xs text-cyan-400"><Thermometer className="h-3 w-3" />{loc.temperature_zone}</span>}
              {loc.items_count > 0 && <span className="flex items-center gap-1 text-xs text-emerald-400"><Package className="h-3 w-3" />{loc.items_count}</span>}
              {loc.capacity_units && <span className="text-xs text-muted-foreground">קיבולת: {loc.capacity_units}</span>}
              <span className="text-xs text-muted-foreground mr-auto">{loc.warehouse_name}</span>
            </div>
            {hasChildren && isExpanded && <LocationChildren parentId={loc.id} locations={locations} level={1} expandedZones={expandedZones} setExpandedZones={setExpandedZones} />}
          </div>
        );
      })}
    </div>
  );
}
