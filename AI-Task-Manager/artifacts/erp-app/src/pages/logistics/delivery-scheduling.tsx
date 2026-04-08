import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Download, Edit2, Trash2, ChevronRight, ChevronLeft, Clock, User, Truck, Check, X, Calendar, Sun, Sunset, Star, AlertCircle, Zap } from "lucide-react";
import { useFormValidation, FormFieldError, RequiredMark } from "@/hooks/use-form-validation";

const BASE = "/api";
function apiFetch(path: string, opts?: RequestInit) {
  return fetch(BASE + path, { headers: { "Content-Type": "application/json" }, ...opts }).then(r => r.json());
}

const STATUS_MAP: Record<string, string> = { scheduled: "מתוכנן", delivered: "נמסר", cancelled: "מבוטל", delayed: "עיכוב", in_transit: "בדרך" };
const STATUS_COLORS: Record<string, string> = { scheduled: "bg-blue-500/20 text-blue-300", delivered: "bg-green-500/20 text-green-300", cancelled: "bg-gray-500/20 text-gray-300", delayed: "bg-red-500/20 text-red-300", in_transit: "bg-yellow-500/20 text-yellow-300" };
const APPT_MAP: Record<string, string> = { morning: "בוקר (08:00-12:00)", afternoon: "צהריים (12:00-16:00)", evening: "ערב (16:00-20:00)", specific: "שעה ספציפית" };
const PRIORITY_COLORS: Record<string, string> = { high: "bg-red-500/20 text-red-300", normal: "bg-gray-500/20 text-gray-400", urgent: "bg-orange-500/20 text-orange-300", low: "bg-green-500/20 text-green-300" };

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" dir="rtl">
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-xl mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-bold text-foreground">{title}</h2>
          <Button variant="ghost" size="sm" onClick={onClose}><X className="w-4 h-4" /></Button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

function GanttView({ schedules, drivers }: { schedules: any[]; drivers: any[] }) {
  const hours = Array.from({ length: 14 }, (_, i) => i + 6);
  const driverGroups = useMemo(() => {
    const groups: Record<string, any[]> = { unassigned: [] };
    drivers.forEach(d => { groups[d.id] = []; });
    schedules.forEach(s => {
      const key = s.driver_id ? String(s.driver_id) : "unassigned";
      if (!groups[key]) groups[key] = [];
      groups[key].push(s);
    });
    return groups;
  }, [schedules, drivers]);

  const getBarStyle = (s: any) => {
    const start = new Date(s.time_window_start);
    const end = new Date(s.time_window_end);
    const startHour = start.getHours() + start.getMinutes() / 60;
    const endHour = end.getHours() + end.getMinutes() / 60;
    const left = Math.max(0, ((startHour - 6) / 14) * 100);
    const width = Math.max(2, ((endHour - startHour) / 14) * 100);
    return { left: `${left}%`, width: `${width}%` };
  };

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[800px]">
        <div className="flex border-b border-border/50 mb-2">
          <div className="w-40 flex-shrink-0" />
          {hours.map(h => (
            <div key={h} className="flex-1 text-center text-xs text-muted-foreground pb-1">{String(h).padStart(2,"0")}:00</div>
          ))}
        </div>
        {Object.entries(driverGroups).map(([driverId, items]) => {
          if (items.length === 0 && driverId !== "unassigned") return null;
          const driver = drivers.find(d => String(d.id) === driverId);
          const label = driver ? driver.full_name : "לא מוקצה";
          return (
            <div key={driverId} className="flex items-center gap-2 mb-2 h-10">
              <div className="w-40 flex-shrink-0 text-xs text-muted-foreground truncate text-left pr-2">{label}</div>
              <div className="flex-1 relative h-8 bg-background/30 rounded border border-border/30">
                {items.map((s: any) => {
                  if (!s.time_window_start || !s.time_window_end) return null;
                  const style = getBarStyle(s);
                  const statusColor = STATUS_COLORS[s.status]?.replace("/20 ", "/50 ") || "bg-blue-500/50";
                  return (
                    <div key={s.id} className={`absolute top-1 bottom-1 rounded text-xs flex items-center px-1 overflow-hidden ${statusColor} border border-white/20`} style={style} title={`${s.customer_name} — ${s.delivery_address}`}>
                      <span className="truncate">{s.customer_name}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function DeliveryScheduling() {
  const [schedules, setSchedules] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [triggers, setTriggers] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("");
  const [view, setView] = useState<"list" | "calendar" | "gantt">("list");
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<"add" | "edit" | "trigger" | null>(null);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [triggerForm, setTriggerForm] = useState<any>({});
  const [triggerLoading, setTriggerLoading] = useState(false);
  const validation = useFormValidation<{ customer_name: string; delivery_address: string }>({
    customer_name: { required: true, message: "שם לקוח חובה" },
    delivery_address: { required: true, message: "כתובת משלוח חובה" },
  });
  const perPage = 20;

  const load = async () => {
    const params = new URLSearchParams();
    if (dateFilter) params.set("date", dateFilter);
    const [s, d, v, t] = await Promise.all([
      apiFetch(`/fleet/schedules${params.toString() ? "?" + params : ""}`),
      apiFetch("/fleet/drivers"),
      apiFetch("/fleet/vehicles"),
      apiFetch("/fleet/warehouse-triggers")
    ]);
    setSchedules(Array.isArray(s) ? s : []);
    setDrivers(Array.isArray(d) ? d : []);
    setVehicles(Array.isArray(v) ? v : []);
    setTriggers(Array.isArray(t) ? t : []);
  };
  useEffect(() => { load(); }, [dateFilter]);

  const filtered = useMemo(() => schedules.filter(s => {
    if (statusFilter !== "all" && s.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return [s.customer_name, s.delivery_address, s.schedule_number, s.driver_name].some(f => String(f || "").toLowerCase().includes(q));
    }
    return true;
  }), [schedules, search, statusFilter]);

  const pageData = filtered.slice((page-1)*perPage, page*perPage);
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));

  const openAdd = () => {
    const now = new Date();
    const dateStr = now.toISOString().slice(0,10);
    setForm({ appointment_type: "morning", status: "scheduled", priority: "normal", time_window_start: `${dateStr}T08:00`, time_window_end: `${dateStr}T12:00` });
    setEditing(null);
    validation.clearErrors();
    setModal("add");
  };
  const openEdit = (s: any) => { setForm({...s, time_window_start: String(s.time_window_start || "").slice(0,16), time_window_end: String(s.time_window_end || "").slice(0,16)}); setEditing(s); validation.clearErrors(); setModal("edit"); };
  const save = async () => {
    if (!validation.validate(form)) return;
    if (editing) { await apiFetch(`/fleet/schedules/${editing.id}`, { method: "PUT", body: JSON.stringify(form) }); }
    else { await apiFetch("/fleet/schedules", { method: "POST", body: JSON.stringify(form) }); }
    setModal(null); load();
  };
  const del = async (id: number) => {
    if (!confirm("למחוק?")) return;
    await apiFetch(`/fleet/schedules/${id}`, { method: "DELETE" }); load();
  };

  const triggerWarehouse = async () => {
    setTriggerLoading(true);
    try {
      const res = await apiFetch("/fleet/warehouse-trigger", { method: "POST", body: JSON.stringify(triggerForm) });
      if (res.error) { alert(res.error); } else {
        alert(`תזמון נוצר אוטומטית! ${res.schedule?.schedule_number || ""}`);
        setModal(null); load();
      }
    } finally { setTriggerLoading(false); }
  };

  const handleApptTypeChange = (type: string) => {
    const date = (form.time_window_start || "").slice(0,10) || new Date().toISOString().slice(0,10);
    const windows: Record<string, [string, string]> = {
      morning: [`${date}T08:00`, `${date}T12:00`],
      afternoon: [`${date}T12:00`, `${date}T16:00`],
      evening: [`${date}T16:00`, `${date}T20:00`],
    };
    const [s, e] = windows[type] || [form.time_window_start, form.time_window_end];
    setForm((f: any) => ({ ...f, appointment_type: type, time_window_start: s, time_window_end: e }));
  };

  const exportCsv = () => {
    const rows = [["מספר","לקוח","כתובת","תאריך","חלון זמן","סוג","נהג","רכב","עדיפות","סטטוס"]];
    filtered.forEach(s => rows.push([s.schedule_number, s.customer_name, s.delivery_address, String(s.time_window_start || "").slice(0,10), `${String(s.time_window_start || "").slice(11,16)}–${String(s.time_window_end || "").slice(11,16)}`, APPT_MAP[s.appointment_type] || s.appointment_type, s.driver_name || "", s.vehicle_plate || "", s.priority || "normal", STATUS_MAP[s.status] || s.status]));
    const csv = rows.map(r => r.join(",")).join("\n");
    const a = document.createElement("a"); a.href = "data:text/csv;charset=utf-8,%EF%BB%BF" + encodeURIComponent(csv); a.download = "schedules.csv"; a.click();
  };

  const statusCounts = useMemo(() => {
    const c: Record<string,number> = {};
    schedules.forEach(s => { c[s.status] = (c[s.status] || 0) + 1; });
    return c;
  }, [schedules]);

  const calendarGroups = useMemo(() => {
    const groups: Record<string, any[]> = {};
    filtered.forEach(s => {
      const date = String(s.time_window_start || "").slice(0,10);
      if (date) { if (!groups[date]) groups[date] = []; groups[date].push(s); }
    });
    return groups;
  }, [filtered]);

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">תזמון משלוחים</h1>
          <p className="text-sm text-muted-foreground mt-1">ניהול הזמנות לקוח, חלונות זמן ולוח נהגים</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCsv}><Download className="w-4 h-4 ml-1" />ייצוא</Button>
          <Button variant="outline" size="sm" onClick={() => { setTriggerForm({}); setModal("trigger"); }} className="border-purple-500/50 text-purple-300 hover:bg-purple-500/10">
            <Zap className="w-4 h-4 ml-1" />מחסן → משלוח
          </Button>
          <Button size="sm" className="bg-primary" onClick={openAdd}><Plus className="w-4 h-4 ml-1" />תזמון חדש</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {Object.entries(STATUS_MAP).map(([k, label]) => (
          <Card key={k} className="bg-card/50 border-border/50 cursor-pointer" onClick={() => setStatusFilter(statusFilter === k ? "all" : k)}>
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold text-foreground">{statusCounts[k] || 0}</div>
              <Badge className={STATUS_COLORS[k] + " mt-1 text-xs"}>{label}</Badge>
            </CardContent>
          </Card>
        ))}
      </div>

      {triggers.filter(t => t.auto_scheduled).length > 0 && (
        <Card className="bg-purple-500/10 border-purple-500/30">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-sm text-purple-300">
              <Zap className="w-4 h-4" />
              <span className="font-semibold">{triggers.filter(t => t.auto_scheduled).length} תזמונים אוטומטיים ממחסן</span>
              <span className="text-purple-400/70 text-xs">נוצרו אוטומטית לאחר אישור ליקוט</span>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="bg-card/50 border-border/50">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 mb-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input placeholder="חיפוש לקוח, כתובת, מספר..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9 bg-background/50" />
            </div>
            <Input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)} className="bg-background/50 w-40" placeholder="סינון לפי תאריך" />
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground">
              <option value="all">כל הסטטוסים</option>
              {Object.entries(STATUS_MAP).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <div className="flex gap-1 bg-background/50 border border-border rounded-md p-1">
              <button onClick={() => setView("list")} className={`px-3 py-1.5 text-xs rounded transition-colors ${view === "list" ? "bg-primary text-foreground" : "text-muted-foreground"}`}>רשימה</button>
              <button onClick={() => setView("calendar")} className={`px-3 py-1.5 text-xs rounded transition-colors ${view === "calendar" ? "bg-primary text-foreground" : "text-muted-foreground"}`}>לוח שנה</button>
              <button onClick={() => setView("gantt")} className={`px-3 py-1.5 text-xs rounded transition-colors ${view === "gantt" ? "bg-primary text-foreground" : "text-muted-foreground"}`}>גאנט</button>
            </div>
          </div>

          {view === "list" && (
            <>
              {pageData.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                  <Calendar className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p className="text-lg font-medium">אין תזמונים</p>
                  <p className="text-sm mt-1">לחץ "תזמון חדש" להוספה</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-border/50">
                      {["מספר","לקוח","כתובת","חלון זמן","סוג","נהג","עדיפות","סטטוס","פעולות"].map(h => (
                        <th key={h} className="text-right p-3 text-muted-foreground font-medium">{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {pageData.map((s: any) => (
                        <tr key={s.id} className="border-b border-border/30 hover:bg-card/30 transition-colors">
                          <td className="p-3 font-mono text-xs text-foreground">{s.schedule_number}</td>
                          <td className="p-3 text-foreground font-semibold">{s.customer_name}</td>
                          <td className="p-3 text-foreground text-xs max-w-[150px] truncate">{s.delivery_address}</td>
                          <td className="p-3 text-foreground text-xs">
                            <div>{String(s.time_window_start || "").slice(0,10)}</div>
                            <div className="text-muted-foreground">{String(s.time_window_start || "").slice(11,16)}–{String(s.time_window_end || "").slice(11,16)}</div>
                          </td>
                          <td className="p-3 text-xs text-foreground">
                            {s.appointment_type === "morning" && <span className="flex items-center gap-1"><Sun className="w-3 h-3 text-yellow-400" />בוקר</span>}
                            {s.appointment_type === "afternoon" && <span className="flex items-center gap-1"><Sunset className="w-3 h-3 text-orange-400" />צהריים</span>}
                            {s.appointment_type === "evening" && <span className="flex items-center gap-1"><Sunset className="w-3 h-3 text-purple-400" />ערב</span>}
                            {s.appointment_type === "specific" && <span className="flex items-center gap-1"><Star className="w-3 h-3 text-blue-400" />ספציפי</span>}
                          </td>
                          <td className="p-3 text-foreground text-xs">{s.driver_name || "—"}</td>
                          <td className="p-3"><Badge className={`text-xs ${PRIORITY_COLORS[s.priority] || "bg-gray-500/20 text-gray-400"}`}>{s.priority === "high" ? "גבוה" : s.priority === "urgent" ? "דחוף" : s.priority === "low" ? "נמוך" : "רגיל"}</Badge></td>
                          <td className="p-3"><Badge className={STATUS_COLORS[s.status] || "bg-gray-500/20 text-gray-300"}>{STATUS_MAP[s.status] || s.status}</Badge></td>
                          <td className="p-3">
                            <div className="flex gap-1">
                              <Button variant="ghost" size="sm" onClick={() => openEdit(s)}><Edit2 className="w-3.5 h-3.5" /></Button>
                              <Button variant="ghost" size="sm" onClick={() => del(s.id)}><Trash2 className="w-3.5 h-3.5 text-red-400" /></Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
                <span>{filtered.length} תזמונים</span>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" disabled={page<=1} onClick={() => setPage(p=>p-1)}><ChevronRight className="w-4 h-4" /></Button>
                  <span className="px-3 py-1">{page}/{totalPages}</span>
                  <Button variant="outline" size="sm" disabled={page>=totalPages} onClick={() => setPage(p=>p+1)}><ChevronLeft className="w-4 h-4" /></Button>
                </div>
              </div>
            </>
          )}

          {view === "calendar" && (
            <div className="space-y-4">
              {Object.keys(calendarGroups).length === 0 ? (
                <div className="text-center py-16 text-muted-foreground"><Calendar className="w-12 h-12 mx-auto mb-3 opacity-50" /><p>אין תזמונים בחלון הנבחר</p></div>
              ) : (
                Object.entries(calendarGroups).sort().map(([date, items]) => (
                  <div key={date} className="border border-border/50 rounded-lg overflow-hidden">
                    <div className="bg-background/40 px-4 py-2 border-b border-border/30">
                      <span className="font-semibold text-foreground">{date}</span>
                      <Badge className="bg-blue-500/20 text-blue-300 mr-2">{items.length} משלוחים</Badge>
                    </div>
                    <div className="divide-y divide-border/30">
                      {items.map((s: any) => (
                        <div key={s.id} className="p-3 hover:bg-card/30 transition-colors flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="text-xs text-muted-foreground w-20 flex-shrink-0">
                              {String(s.time_window_start || "").slice(11,16)}–{String(s.time_window_end || "").slice(11,16)}
                            </div>
                            <div>
                              <div className="text-sm font-semibold text-foreground">{s.customer_name}</div>
                              <div className="text-xs text-muted-foreground">{s.delivery_address}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {s.driver_name && <span className="text-xs text-muted-foreground">{s.driver_name}</span>}
                            <Badge className={STATUS_COLORS[s.status] || "bg-gray-500/20 text-gray-300"}>{STATUS_MAP[s.status] || s.status}</Badge>
                            <Button variant="ghost" size="sm" onClick={() => openEdit(s)}><Edit2 className="w-3.5 h-3.5" /></Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {view === "gantt" && (
            <div className="space-y-3">
              <div className="text-xs text-muted-foreground mb-2">* לוח גאנט מציג משלוחים לפי נהג וחלונות זמן</div>
              {filtered.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground"><AlertCircle className="w-10 h-10 mx-auto mb-2 opacity-50" /><p>אין נתונים להצגה</p></div>
              ) : (
                <GanttView schedules={filtered} drivers={drivers} />
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {(modal === "add" || modal === "edit") && (
        <Modal title={modal === "edit" ? "עריכת תזמון" : "תזמון חדש"} onClose={() => setModal(null)}>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><label className="text-xs text-muted-foreground">שם לקוח <RequiredMark /></label><Input value={form.customer_name || ""} onChange={e => setForm({...form, customer_name: e.target.value})} className={`bg-background/50 mt-1 ${validation.errors.customer_name ? "border-red-500" : ""}`} /><FormFieldError error={validation.errors.customer_name} /></div>
              <div className="col-span-2"><label className="text-xs text-muted-foreground">כתובת משלוח <RequiredMark /></label><Input value={form.delivery_address || ""} onChange={e => setForm({...form, delivery_address: e.target.value})} className={`bg-background/50 mt-1 ${validation.errors.delivery_address ? "border-red-500" : ""}`} /><FormFieldError error={validation.errors.delivery_address} /></div>
              <div className="col-span-2">
                <label className="text-xs text-muted-foreground">סוג פגישה</label>
                <div className="grid grid-cols-4 gap-2 mt-1">
                  {Object.entries(APPT_MAP).map(([k, v]) => (
                    <button key={k} onClick={() => handleApptTypeChange(k)} className={`p-2 text-xs rounded-lg border transition-colors ${form.appointment_type === k ? "bg-primary border-primary text-foreground" : "border-border text-muted-foreground hover:border-primary/50"}`}>
                      {k === "morning" && <Sun className="w-3 h-3 mx-auto mb-0.5" />}
                      {k === "afternoon" && <Sunset className="w-3 h-3 mx-auto mb-0.5" />}
                      {k === "evening" && <Sunset className="w-3 h-3 mx-auto mb-0.5 text-purple-400" />}
                      {k === "specific" && <Star className="w-3 h-3 mx-auto mb-0.5" />}
                      {v.split(" ")[0]}
                    </button>
                  ))}
                </div>
              </div>
              <div><label className="text-xs text-muted-foreground">חלון מ</label><Input type="datetime-local" value={form.time_window_start || ""} onChange={e => setForm({...form, time_window_start: e.target.value})} className="bg-background/50 mt-1" /></div>
              <div><label className="text-xs text-muted-foreground">חלון עד</label><Input type="datetime-local" value={form.time_window_end || ""} onChange={e => setForm({...form, time_window_end: e.target.value})} className="bg-background/50 mt-1" /></div>
              <div><label className="text-xs text-muted-foreground">נהג</label>
                <select value={form.driver_id || ""} onChange={e => setForm({...form, driver_id: e.target.value})} className="w-full bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1">
                  <option value="">בחר נהג</option>
                  {drivers.map(d => <option key={d.id} value={d.id}>{d.full_name}</option>)}
                </select>
              </div>
              <div><label className="text-xs text-muted-foreground">רכב</label>
                <select value={form.vehicle_id || ""} onChange={e => setForm({...form, vehicle_id: e.target.value})} className="w-full bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1">
                  <option value="">בחר רכב</option>
                  {vehicles.map(v => <option key={v.id} value={v.id}>{v.plate}</option>)}
                </select>
              </div>
              <div><label className="text-xs text-muted-foreground">עדיפות</label>
                <select value={form.priority || "normal"} onChange={e => setForm({...form, priority: e.target.value})} className="w-full bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1">
                  <option value="low">נמוכה</option><option value="normal">רגילה</option><option value="high">גבוהה</option><option value="urgent">דחוף</option>
                </select>
              </div>
              <div><label className="text-xs text-muted-foreground">סטטוס</label>
                <select value={form.status || "scheduled"} onChange={e => setForm({...form, status: e.target.value})} className="w-full bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1">
                  {Object.entries(STATUS_MAP).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div><label className="text-xs text-muted-foreground">טלפון קשר</label><Input value={form.contact_phone || ""} onChange={e => setForm({...form, contact_phone: e.target.value})} className="bg-background/50 mt-1" /></div>
            </div>
            <div><label className="text-xs text-muted-foreground">הערות</label><Input value={form.notes || ""} onChange={e => setForm({...form, notes: e.target.value})} className="bg-background/50 mt-1" /></div>
            <div className="flex gap-2 pt-2">
              <Button className="flex-1 bg-primary" onClick={save}><Check className="w-4 h-4 ml-1" />שמירה</Button>
              <Button variant="outline" className="flex-1" onClick={() => setModal(null)}>ביטול</Button>
            </div>
          </div>
        </Modal>
      )}

      {modal === "trigger" && (
        <Modal title="אוטומציה: מחסן → משלוח" onClose={() => setModal(null)}>
          <div className="space-y-3">
            <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-3 text-sm text-purple-300">
              <Zap className="w-4 h-4 inline-block ml-1" />
              כאשר הזמנת ליקוט ממחסן מאושרת, המערכת תיצור תזמון משלוח אוטומטי עם הנהג הזמין ביותר.
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><label className="text-xs text-muted-foreground">מזהה הזמנת ליקוט *</label><Input type="number" value={triggerForm.pick_order_id || ""} onChange={e => setTriggerForm({...triggerForm, pick_order_id: e.target.value})} className="bg-background/50 mt-1" placeholder="מס' הזמנת ליקוט" /></div>
              <div className="col-span-2"><label className="text-xs text-muted-foreground">שם לקוח *</label><Input value={triggerForm.customer_name || ""} onChange={e => setTriggerForm({...triggerForm, customer_name: e.target.value})} className="bg-background/50 mt-1" /></div>
              <div className="col-span-2"><label className="text-xs text-muted-foreground">כתובת משלוח *</label><Input value={triggerForm.delivery_address || ""} onChange={e => setTriggerForm({...triggerForm, delivery_address: e.target.value})} className="bg-background/50 mt-1" /></div>
              <div><label className="text-xs text-muted-foreground">מזהה לקוח</label><Input type="number" value={triggerForm.customer_id || ""} onChange={e => setTriggerForm({...triggerForm, customer_id: e.target.value})} className="bg-background/50 mt-1" /></div>
              <div><label className="text-xs text-muted-foreground">מזהה הזמנה</label><Input type="number" value={triggerForm.order_id || ""} onChange={e => setTriggerForm({...triggerForm, order_id: e.target.value})} className="bg-background/50 mt-1" /></div>
            </div>
            <div className="flex gap-2 pt-2">
              <Button className="flex-1 bg-purple-600 hover:bg-purple-700" onClick={triggerWarehouse} disabled={triggerLoading}>
                <Zap className="w-4 h-4 ml-1" />{triggerLoading ? "יוצר..." : "צור תזמון אוטומטי"}
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => setModal(null)}>ביטול</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
