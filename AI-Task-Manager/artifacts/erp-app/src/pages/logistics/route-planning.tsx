import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Download, Edit2, Trash2, ChevronRight, ChevronLeft, AlertCircle, MapPin, Zap, Check, X, Clock, Truck, ArrowDown } from "lucide-react";

const BASE = "/api";
function apiFetch(path: string, opts?: RequestInit) {
  return fetch(BASE + path, { headers: { "Content-Type": "application/json" }, ...opts }).then(r => r.json());
}

const STATUS_MAP: Record<string, string> = { planned: "מתוכנן", in_progress: "בביצוע", completed: "הושלם", cancelled: "מבוטל" };
const STATUS_COLORS: Record<string, string> = { planned: "bg-blue-500/20 text-blue-300", in_progress: "bg-yellow-500/20 text-yellow-300", completed: "bg-green-500/20 text-green-300", cancelled: "bg-gray-500/20 text-gray-300" };

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" dir="rtl">
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-bold text-foreground">{title}</h2>
          <Button variant="ghost" size="sm" onClick={onClose}><X className="w-4 h-4" /></Button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

function StopEditor({ stops, onChange }: { stops: any[]; onChange: (stops: any[]) => void }) {
  const addStop = () => onChange([...stops, { address: "", lat: "", lng: "", weight_kg: "", time_window_start: "", time_window_end: "", contact: "" }]);
  const removeStop = (i: number) => onChange(stops.filter((_, idx) => idx !== i));
  const updateStop = (i: number, field: string, val: string) => {
    const updated = [...stops];
    updated[i] = { ...updated[i], [field]: val };
    onChange(updated);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-xs text-muted-foreground font-semibold">עצירות במסלול</label>
        <Button variant="outline" size="sm" onClick={addStop}><Plus className="w-3.5 h-3.5 ml-1" />עצירה</Button>
      </div>
      {stops.map((s, i) => (
        <div key={i} className="border border-border/50 rounded-lg p-3 space-y-2 bg-background/30">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-bold text-muted-foreground flex items-center gap-1"><MapPin className="w-3 h-3" />עצירה {i + 1}</span>
            <Button variant="ghost" size="sm" onClick={() => removeStop(i)}><X className="w-3.5 h-3.5 text-red-400" /></Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2"><Input placeholder="כתובת *" value={s.address || ""} onChange={e => updateStop(i, "address", e.target.value)} className="bg-background/50 text-sm" /></div>
            <Input placeholder="קואורדינטה רוחב (lat)" value={s.lat || ""} onChange={e => updateStop(i, "lat", e.target.value)} className="bg-background/50 text-sm" />
            <Input placeholder="קואורדינטה אורך (lng)" value={s.lng || ""} onChange={e => updateStop(i, "lng", e.target.value)} className="bg-background/50 text-sm" />
            <Input placeholder='משקל ק"ג' type="number" value={s.weight_kg || ""} onChange={e => updateStop(i, "weight_kg", e.target.value)} className="bg-background/50 text-sm" />
            <Input placeholder="איש קשר" value={s.contact || ""} onChange={e => updateStop(i, "contact", e.target.value)} className="bg-background/50 text-sm" />
            <div><label className="text-xs text-muted-foreground">חלון זמן — מ</label><Input type="time" value={s.time_window_start || ""} onChange={e => updateStop(i, "time_window_start", e.target.value)} className="bg-background/50 text-sm mt-0.5" /></div>
            <div><label className="text-xs text-muted-foreground">חלון זמן — עד</label><Input type="time" value={s.time_window_end || ""} onChange={e => updateStop(i, "time_window_end", e.target.value)} className="bg-background/50 text-sm mt-0.5" /></div>
          </div>
        </div>
      ))}
      {stops.length === 0 && (
        <div className="text-center py-4 text-muted-foreground text-sm border border-dashed border-border/50 rounded-lg">
          לחץ "עצירה" להוספת עצירה למסלול
        </div>
      )}
    </div>
  );
}

function RouteMapView({ stops, optimized }: { stops: any[]; optimized: boolean }) {
  const displayStops = stops.filter(s => s.address);
  if (displayStops.length === 0) return null;
  return (
    <div className="border border-border/50 rounded-lg p-4 bg-background/20 space-y-2">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground mb-3">
        <MapPin className="w-4 h-4 text-primary" />
        מפת מסלול {optimized && <Badge className="bg-green-500/20 text-green-300 text-xs mr-2">מאופטם</Badge>}
      </div>
      <div className="space-y-1">
        {displayStops.map((s: any, i: number) => (
          <div key={i} className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-xs font-bold text-foreground flex-shrink-0">{s.sequence || i + 1}</div>
            <div className="flex-1 text-sm text-foreground">{s.address}</div>
            {s.time_window_start && <span className="text-xs text-muted-foreground">{s.time_window_start}–{s.time_window_end}</span>}
            {s.weight_kg && <span className="text-xs text-muted-foreground">{s.weight_kg} ק"ג</span>}
            {i < displayStops.length - 1 && (
              <div className="absolute mr-3 mt-7">
              </div>
            )}
          </div>
        ))}
      </div>
      {displayStops.length > 1 && (
        <div className="mt-2 pt-2 border-t border-border/30 flex gap-1 flex-wrap">
          {displayStops.slice(1).map((_, i) => (
            <span key={i} className="text-xs text-muted-foreground">
              {displayStops[i].address?.split(",")[0]} <ArrowDown className="w-3 h-3 inline" /> {displayStops[i+1].address?.split(",")[0]}
              {i < displayStops.length - 2 ? " · " : ""}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function RoutePlanning() {
  const [routes, setRoutes] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<"add" | "edit" | "view" | null>(null);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({ stops: [], status: "planned" });
  const [optimizing, setOptimizing] = useState(false);
  const [optimizeResult, setOptimizeResult] = useState<any>(null);
  const perPage = 20;

  const load = async () => {
    const [r, v, d] = await Promise.all([apiFetch("/fleet/routes"), apiFetch("/fleet/vehicles"), apiFetch("/fleet/drivers")]);
    setRoutes(Array.isArray(r) ? r : []);
    setVehicles(Array.isArray(v) ? v : []);
    setDrivers(Array.isArray(d) ? d : []);
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => routes.filter(r => {
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return [r.route_name, r.vehicle_plate, r.driver_name].some(f => String(f || "").toLowerCase().includes(q));
    }
    return true;
  }), [routes, search, statusFilter]);

  const pageData = filtered.slice((page-1)*perPage, page*perPage);
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));

  const openAdd = () => { setForm({ stops: [], status: "planned", scheduled_date: new Date().toISOString().slice(0,10) }); setEditing(null); setOptimizeResult(null); setModal("add"); };
  const openEdit = (r: any) => {
    let stops: any[] = [];
    try { stops = typeof r.stops === "string" ? JSON.parse(r.stops) : (r.stops || []); } catch {}
    setForm({ ...r, stops });
    setEditing(r);
    setOptimizeResult(null);
    setModal("edit");
  };
  const openView = (r: any) => { setEditing(r); setModal("view"); };

  const optimize = async () => {
    if ((form.stops || []).length < 2) return alert("יש להוסיף לפחות 2 עצירות");
    setOptimizing(true);
    try {
      const res = await apiFetch("/fleet/routes/optimize", { method: "POST", body: JSON.stringify({ stops: form.stops, vehicle_id: form.vehicle_id }) });
      setOptimizeResult(res);
      setForm((f: any) => ({ ...f, stops: res.optimized || f.stops, total_distance_km: res.total_distance_km, estimated_duration_min: res.estimated_duration_min, optimization_score: res.optimization_score }));
    } finally {
      setOptimizing(false);
    }
  };

  const save = async () => {
    if (editing) { await apiFetch(`/fleet/routes/${editing.id}`, { method: "PUT", body: JSON.stringify(form) }); }
    else { await apiFetch("/fleet/routes", { method: "POST", body: JSON.stringify(form) }); }
    setModal(null); load();
  };
  const del = async (id: number) => {
    if (!confirm("למחוק מסלול זה?")) return;
    await apiFetch(`/fleet/routes/${id}`, { method: "DELETE" }); load();
  };

  const exportCsv = () => {
    const rows = [["שם מסלול","תאריך","עצירות","מרחק ק\"מ","זמן (דק)","רכב","נהג","ציון","סטטוס"]];
    filtered.forEach(r => {
      let stopsCount = 0;
      try { stopsCount = (typeof r.stops === "string" ? JSON.parse(r.stops) : (r.stops || [])).length; } catch {}
      rows.push([r.route_name, String(r.scheduled_date || "").slice(0,10), stopsCount, r.total_distance_km, r.estimated_duration_min, r.vehicle_plate || "", r.driver_name || "", r.optimization_score, STATUS_MAP[r.status] || r.status]);
    });
    const csv = rows.map(r => r.join(",")).join("\n");
    const a = document.createElement("a"); a.href = "data:text/csv;charset=utf-8,%EF%BB%BF" + encodeURIComponent(csv); a.download = "routes.csv"; a.click();
  };

  const statusCounts = useMemo(() => {
    const c: Record<string,number> = {};
    routes.forEach(r => { c[r.status] = (c[r.status] || 0) + 1; });
    return c;
  }, [routes]);

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">תכנון מסלולים</h1>
          <p className="text-sm text-muted-foreground mt-1">אופטימיזציה חכמה של מסלולי הובלה</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCsv}><Download className="w-4 h-4 ml-1" />ייצוא</Button>
          <Button size="sm" className="bg-primary" onClick={openAdd}><Plus className="w-4 h-4 ml-1" />מסלול חדש</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Object.entries(STATUS_MAP).map(([k, label]) => (
          <Card key={k} className="bg-card/50 border-border/50 cursor-pointer" onClick={() => setStatusFilter(statusFilter === k ? "all" : k)}>
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold text-foreground">{statusCounts[k] || 0}</div>
              <Badge className={STATUS_COLORS[k] + " mt-1 text-xs"}>{label}</Badge>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="bg-card/50 border-border/50">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 mb-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input placeholder="חיפוש מסלולים..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9 bg-background/50" />
            </div>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground">
              <option value="all">כל הסטטוסים</option>
              {Object.entries(STATUS_MAP).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>

          {pageData.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <MapPin className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="text-lg font-medium">אין מסלולים</p>
              <p className="text-sm mt-1">לחץ "מסלול חדש" להתחיל</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50">
                    {["שם מסלול","תאריך","עצירות","מרחק","זמן משוער","רכב","נהג","ציון","סטטוס","פעולות"].map(h => (
                      <th key={h} className="text-right p-3 text-muted-foreground font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pageData.map((r: any) => {
                    let stopsCount = 0;
                    try { stopsCount = (typeof r.stops === "string" ? JSON.parse(r.stops) : (r.stops || [])).length; } catch {}
                    return (
                      <tr key={r.id} className="border-b border-border/30 hover:bg-card/30 transition-colors">
                        <td className="p-3 text-foreground font-semibold">{r.route_name}</td>
                        <td className="p-3 text-foreground">{String(r.scheduled_date || "").slice(0,10)}</td>
                        <td className="p-3 text-center"><Badge className="bg-purple-500/20 text-purple-300">{stopsCount}</Badge></td>
                        <td className="p-3 text-foreground">{r.total_distance_km ? `${r.total_distance_km} ק"מ` : "—"}</td>
                        <td className="p-3 text-foreground">{r.estimated_duration_min ? `${r.estimated_duration_min} דק'` : "—"}</td>
                        <td className="p-3 text-foreground">{r.vehicle_plate || "—"}</td>
                        <td className="p-3 text-foreground">{r.driver_name || "—"}</td>
                        <td className="p-3">
                          {r.optimization_score ? <Badge className="bg-green-500/20 text-green-300">{r.optimization_score}%</Badge> : "—"}
                        </td>
                        <td className="p-3"><Badge className={STATUS_COLORS[r.status] || "bg-gray-500/20 text-gray-300"}>{STATUS_MAP[r.status] || r.status}</Badge></td>
                        <td className="p-3">
                          <div className="flex gap-1">
                            <Button variant="ghost" size="sm" title="צפייה" onClick={() => openView(r)}><MapPin className="w-3.5 h-3.5" /></Button>
                            <Button variant="ghost" size="sm" onClick={() => openEdit(r)}><Edit2 className="w-3.5 h-3.5" /></Button>
                            <Button variant="ghost" size="sm" onClick={() => del(r.id)}><Trash2 className="w-3.5 h-3.5 text-red-400" /></Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
            <span>{filtered.length} מסלולים</span>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" disabled={page<=1} onClick={() => setPage(p=>p-1)}><ChevronRight className="w-4 h-4" /></Button>
              <span className="px-3 py-1">{page}/{totalPages}</span>
              <Button variant="outline" size="sm" disabled={page>=totalPages} onClick={() => setPage(p=>p+1)}><ChevronLeft className="w-4 h-4" /></Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {(modal === "add" || modal === "edit") && (
        <Modal title={modal === "edit" ? "עריכת מסלול" : "מסלול חדש"} onClose={() => setModal(null)}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><label className="text-xs text-muted-foreground">שם מסלול *</label><Input value={form.route_name || ""} onChange={e => setForm({...form, route_name: e.target.value})} className="bg-background/50 mt-1" /></div>
              <div><label className="text-xs text-muted-foreground">תאריך</label><Input type="date" value={String(form.scheduled_date || "").slice(0,10)} onChange={e => setForm({...form, scheduled_date: e.target.value})} className="bg-background/50 mt-1" /></div>
              <div><label className="text-xs text-muted-foreground">סטטוס</label>
                <select value={form.status || "planned"} onChange={e => setForm({...form, status: e.target.value})} className="w-full bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1">
                  {Object.entries(STATUS_MAP).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div><label className="text-xs text-muted-foreground">רכב</label>
                <select value={form.vehicle_id || ""} onChange={e => setForm({...form, vehicle_id: e.target.value})} className="w-full bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1">
                  <option value="">בחר רכב</option>
                  {vehicles.map(v => <option key={v.id} value={v.id}>{v.plate} ({v.vehicle_type})</option>)}
                </select>
              </div>
              <div><label className="text-xs text-muted-foreground">נהג</label>
                <select value={form.driver_id || ""} onChange={e => setForm({...form, driver_id: e.target.value})} className="w-full bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1">
                  <option value="">בחר נהג</option>
                  {drivers.map(d => <option key={d.id} value={d.id}>{d.full_name}</option>)}
                </select>
              </div>
            </div>

            <StopEditor stops={form.stops || []} onChange={stops => setForm((f: any) => ({...f, stops}))} />

            {(form.stops || []).length >= 2 && (
              <div className="border border-border/50 rounded-lg p-3 bg-background/20 space-y-2">
                <Button className="w-full bg-gradient-to-l from-primary to-purple-600" onClick={optimize} disabled={optimizing}>
                  <Zap className="w-4 h-4 ml-2" />
                  {optimizing ? "מחשב אופטימיזציה..." : "אפטם מסלול (AI)"}
                </Button>
                {optimizeResult && (
                  <div className="grid grid-cols-3 gap-2 text-center text-xs mt-2">
                    <div className="bg-green-500/10 border border-green-500/30 rounded p-2">
                      <div className="text-green-400 font-bold">{optimizeResult.total_distance_km} ק"מ</div>
                      <div className="text-muted-foreground">מרחק כולל</div>
                    </div>
                    <div className="bg-blue-500/10 border border-blue-500/30 rounded p-2">
                      <div className="text-blue-400 font-bold">{optimizeResult.estimated_duration_min} דק'</div>
                      <div className="text-muted-foreground">זמן משוער</div>
                    </div>
                    <div className="bg-purple-500/10 border border-purple-500/30 rounded p-2">
                      <div className="text-purple-400 font-bold">{optimizeResult.optimization_score}%</div>
                      <div className="text-muted-foreground">ציון</div>
                    </div>
                    {optimizeResult.capacity_warning && (
                      <div className="col-span-3 text-yellow-400 text-xs text-center">⚠ המשקל הכולל עולה על קיבולת הרכב</div>
                    )}
                  </div>
                )}
              </div>
            )}

            {(form.stops || []).length > 0 && (
              <RouteMapView stops={form.stops || []} optimized={!!optimizeResult} />
            )}

            <div><label className="text-xs text-muted-foreground">הערות</label><Input value={form.notes || ""} onChange={e => setForm({...form, notes: e.target.value})} className="bg-background/50 mt-1" /></div>
            <div className="flex gap-2 pt-2">
              <Button className="flex-1 bg-primary" onClick={save}><Check className="w-4 h-4 ml-1" />שמירה</Button>
              <Button variant="outline" className="flex-1" onClick={() => setModal(null)}>ביטול</Button>
            </div>
          </div>
        </Modal>
      )}

      {modal === "view" && editing && (
        <Modal title={`מסלול: ${editing.route_name}`} onClose={() => setModal(null)}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-muted-foreground">תאריך:</span> <span className="text-foreground">{String(editing.scheduled_date || "").slice(0,10)}</span></div>
              <div><span className="text-muted-foreground">סטטוס:</span> <Badge className={STATUS_COLORS[editing.status]}>{STATUS_MAP[editing.status]}</Badge></div>
              <div><span className="text-muted-foreground">רכב:</span> <span className="text-foreground">{editing.vehicle_plate || "—"}</span></div>
              <div><span className="text-muted-foreground">נהג:</span> <span className="text-foreground">{editing.driver_name || "—"}</span></div>
              <div><span className="text-muted-foreground">מרחק:</span> <span className="text-foreground">{editing.total_distance_km ? `${editing.total_distance_km} ק"מ` : "—"}</span></div>
              <div><span className="text-muted-foreground">זמן:</span> <span className="text-foreground">{editing.estimated_duration_min ? `${editing.estimated_duration_min} דק'` : "—"}</span></div>
              <div><span className="text-muted-foreground">ציון אופטימיזציה:</span> <span className="text-foreground">{editing.optimization_score ? `${editing.optimization_score}%` : "—"}</span></div>
            </div>
            {(() => {
              let stops: any[] = [];
              try { stops = typeof editing.stops === "string" ? JSON.parse(editing.stops) : (editing.stops || []); } catch {}
              return stops.length > 0 && <RouteMapView stops={stops} optimized={!!editing.optimization_score} />;
            })()}
            {editing.notes && <div className="text-sm text-muted-foreground">{editing.notes}</div>}
          </div>
        </Modal>
      )}
    </div>
  );
}
