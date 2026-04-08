import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Download, Eye, Edit2, Trash2, ChevronRight, ChevronLeft, AlertCircle, AlertTriangle, Truck, User, Fuel, Wrench, Shield, X, Check, BarChart3 } from "lucide-react";
import { useFormValidation, FormFieldError, RequiredMark } from "@/hooks/use-form-validation";

const BASE = "/api";

const VEHICLE_TYPES: Record<string, string> = { truck: "משאית", van: "ואן", pickup: "פיקאפ", car: "רכב", motorcycle: "אופנוע" };
const FUEL_TYPES: Record<string, string> = { diesel: "דיזל", gasoline: "בנזין", electric: "חשמלי", hybrid: "היברידי" };
const VEHICLE_STATUS: Record<string, string> = { available: "זמין", in_use: "בשימוש", maintenance: "בטיפול", inactive: "לא פעיל" };
const STATUS_COLORS: Record<string, string> = { available: "bg-green-500/20 text-green-300", in_use: "bg-blue-500/20 text-blue-300", maintenance: "bg-yellow-500/20 text-yellow-300", inactive: "bg-gray-500/20 text-gray-300", active: "bg-green-500/20 text-green-300", inactive2: "bg-gray-500/20 text-gray-300" };
const ALERT_COLORS: Record<string, string> = { urgent: "bg-red-500/20 text-red-300 border-red-500/40", warning: "bg-yellow-500/20 text-yellow-300 border-yellow-500/40", notice: "bg-blue-500/20 text-blue-300 border-blue-500/40", ok: "bg-green-500/20 text-green-300 border-green-500/40" };
const TABS = ["רכבים", "נהגים", "תדלוק", "תחזוקה", "ביטוח"] as const;
type Tab = typeof TABS[number];

function apiFetch(path: string, opts?: RequestInit) {
  return fetch(BASE + path, { headers: { "Content-Type": "application/json" }, ...opts }).then(r => r.json());
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" dir="rtl">
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-bold text-foreground">{title}</h2>
          <Button variant="ghost" size="sm" onClick={onClose}><X className="w-4 h-4" /></Button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

function VehiclesTab() {
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [modal, setModal] = useState<"add" | "edit" | null>(null);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [page, setPage] = useState(1);
  const perPage = 20;

  const load = async () => {
    const [v, s] = await Promise.all([apiFetch("/fleet/vehicles"), apiFetch("/fleet/vehicles/stats")]);
    setVehicles(Array.isArray(v) ? v : []);
    setStats(s || {});
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => vehicles.filter(v => {
    if (statusFilter !== "all" && v.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return [v.plate, v.make, v.model, v.vehicle_number, v.driver_name].some(f => String(f || "").toLowerCase().includes(q));
    }
    return true;
  }), [vehicles, search, statusFilter]);

  const pageData = filtered.slice((page-1)*perPage, page*perPage);
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));

  const vehicleValidation = useFormValidation({
    plate: { required: true, message: "לוחית רישוי חובה" },
    vehicle_type: { required: true, message: "סוג רכב חובה" },
  });

  const openAdd = () => { setForm({ vehicle_type: "truck", status: "available", fuel_type: "diesel" }); setEditing(null); vehicleValidation.clearErrors(); setModal("add"); };
  const openEdit = (v: any) => { setForm({ ...v }); setEditing(v); vehicleValidation.clearErrors(); setModal("edit"); };
  const save = async () => {
    if (!vehicleValidation.validate(form)) return;
    if (editing) {
      await apiFetch(`/fleet/vehicles/${editing.id}`, { method: "PUT", body: JSON.stringify(form) });
    } else {
      await apiFetch("/fleet/vehicles", { method: "POST", body: JSON.stringify(form) });
    }
    setModal(null); load();
  };
  const del = async (id: number) => {
    if (!confirm("למחוק רכב זה?")) return;
    await apiFetch(`/fleet/vehicles/${id}`, { method: "DELETE" });
    load();
  };

  const exportCsv = () => {
    const rows = [["מספר רכב","לוחית","סוג","יצרן","דגם","שנה","קיבולת ק\"ג","דלק","ק\"מ","סטטוס","נהג"]];
    filtered.forEach(v => rows.push([v.vehicle_number, v.plate, VEHICLE_TYPES[v.vehicle_type] || v.vehicle_type, v.make, v.model, v.year, v.capacity_kg, FUEL_TYPES[v.fuel_type] || v.fuel_type, v.odometer, VEHICLE_STATUS[v.status] || v.status, v.driver_name || ""]));
    const csv = rows.map(r => r.join(",")).join("\n");
    const a = document.createElement("a"); a.href = "data:text/csv;charset=utf-8,%EF%BB%BF" + encodeURIComponent(csv); a.download = "fleet.csv"; a.click();
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {Object.entries(VEHICLE_STATUS).map(([k, label]) => (
          <Card key={k} className="bg-card/50 border-border/50 cursor-pointer" onClick={() => setStatusFilter(statusFilter === k ? "all" : k)}>
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold text-foreground">{stats[k] || 0}</div>
              <Badge className={STATUS_COLORS[k] + " mt-1 text-xs"}>{label}</Badge>
            </CardContent>
          </Card>
        ))}
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-3 text-center">
            <div className="text-2xl font-bold text-foreground">{stats.total || 0}</div>
            <Badge className="bg-purple-500/20 text-purple-300 mt-1 text-xs">סה"כ</Badge>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input placeholder="חיפוש לפי לוחית, יצרן, נהג..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9 bg-background/50" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground">
          <option value="all">כל הסטטוסים</option>
          {Object.entries(VEHICLE_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <Button variant="outline" size="sm" onClick={exportCsv}><Download className="w-4 h-4 ml-1" />ייצוא</Button>
        <Button size="sm" className="bg-primary" onClick={openAdd}><Plus className="w-4 h-4 ml-1" />הוספת רכב</Button>
      </div>

      {pageData.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Truck className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p className="text-lg font-medium">אין רכבים</p>
          <p className="text-sm mt-1">לחץ "הוספת רכב" להתחיל</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/50">
                {["מס' רכב","לוחית","סוג","יצרן/דגם","שנה","קיבולת","דלק","ק\"מ","סטטוס","נהג","פעולות"].map(h => (
                  <th key={h} className="text-right p-3 text-muted-foreground font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageData.map((v: any) => (
                <tr key={v.id} className="border-b border-border/30 hover:bg-card/30 transition-colors">
                  <td className="p-3 text-foreground font-mono text-xs">{v.vehicle_number}</td>
                  <td className="p-3 font-semibold text-foreground">{v.plate}</td>
                  <td className="p-3 text-foreground">{VEHICLE_TYPES[v.vehicle_type] || v.vehicle_type}</td>
                  <td className="p-3 text-foreground">{[v.make, v.model].filter(Boolean).join(" ")}</td>
                  <td className="p-3 text-foreground">{v.year || "—"}</td>
                  <td className="p-3 text-foreground">{v.capacity_kg ? `${v.capacity_kg} ק"ג` : "—"}</td>
                  <td className="p-3 text-foreground">{FUEL_TYPES[v.fuel_type] || v.fuel_type}</td>
                  <td className="p-3 text-foreground">{v.odometer ? Number(v.odometer).toLocaleString() : "—"}</td>
                  <td className="p-3"><Badge className={STATUS_COLORS[v.status] || "bg-gray-500/20 text-gray-300"}>{VEHICLE_STATUS[v.status] || v.status}</Badge></td>
                  <td className="p-3 text-foreground">{v.driver_name || "—"}</td>
                  <td className="p-3">
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(v)}><Edit2 className="w-3.5 h-3.5" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => del(v.id)}><Trash2 className="w-3.5 h-3.5 text-red-400" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{filtered.length} רכבים</span>
        <div className="flex gap-1">
          <Button variant="outline" size="sm" disabled={page<=1} onClick={() => setPage(p=>p-1)}><ChevronRight className="w-4 h-4" /></Button>
          <span className="px-3 py-1">{page}/{totalPages}</span>
          <Button variant="outline" size="sm" disabled={page>=totalPages} onClick={() => setPage(p=>p+1)}><ChevronLeft className="w-4 h-4" /></Button>
        </div>
      </div>

      {modal && (
        <Modal title={modal === "edit" ? "עריכת רכב" : "הוספת רכב"} onClose={() => setModal(null)}>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs text-muted-foreground">מספר רכב</label><Input value={form.vehicle_number || ""} onChange={e => setForm({...form, vehicle_number: e.target.value})} className="bg-background/50 mt-1" /></div>
              <div><label className="text-xs text-muted-foreground">לוחית <RequiredMark /></label><Input value={form.plate || ""} onChange={e => setForm({...form, plate: e.target.value})} className={`bg-background/50 mt-1 ${vehicleValidation.getFieldProps("plate").className}`} /><FormFieldError error={vehicleValidation.errors.plate} /></div>
              <div>
                <label className="text-xs text-muted-foreground">סוג רכב <RequiredMark /></label>
                <select value={form.vehicle_type || "truck"} onChange={e => setForm({...form, vehicle_type: e.target.value})} className={`w-full bg-background/50 border rounded-md px-3 py-2 text-sm text-foreground mt-1 ${vehicleValidation.getFieldProps("vehicle_type").className || "border-border"}`}>
                  {Object.entries(VEHICLE_TYPES).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <FormFieldError error={vehicleValidation.errors.vehicle_type} />
              </div>
              <div><label className="text-xs text-muted-foreground">סטטוס</label>
                <select value={form.status || "available"} onChange={e => setForm({...form, status: e.target.value})} className="w-full bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1">
                  {Object.entries(VEHICLE_STATUS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div><label className="text-xs text-muted-foreground">יצרן</label><Input value={form.make || ""} onChange={e => setForm({...form, make: e.target.value})} className="bg-background/50 mt-1" /></div>
              <div><label className="text-xs text-muted-foreground">דגם</label><Input value={form.model || ""} onChange={e => setForm({...form, model: e.target.value})} className="bg-background/50 mt-1" /></div>
              <div><label className="text-xs text-muted-foreground">שנה</label><Input type="number" value={form.year || ""} onChange={e => setForm({...form, year: e.target.value})} className="bg-background/50 mt-1" /></div>
              <div><label className="text-xs text-muted-foreground">ק"מ נוכחי</label><Input type="number" value={form.odometer || ""} onChange={e => setForm({...form, odometer: e.target.value})} className="bg-background/50 mt-1" /></div>
              <div><label className="text-xs text-muted-foreground">קיבולת ק"ג</label><Input type="number" value={form.capacity_kg || ""} onChange={e => setForm({...form, capacity_kg: e.target.value})} className="bg-background/50 mt-1" /></div>
              <div><label className="text-xs text-muted-foreground">קיבולת מ"ק</label><Input type="number" value={form.capacity_cbm || ""} onChange={e => setForm({...form, capacity_cbm: e.target.value})} className="bg-background/50 mt-1" /></div>
              <div><label className="text-xs text-muted-foreground">סוג דלק</label>
                <select value={form.fuel_type || "diesel"} onChange={e => setForm({...form, fuel_type: e.target.value})} className="w-full bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1">
                  {Object.entries(FUEL_TYPES).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div><label className="text-xs text-muted-foreground">צבע</label><Input value={form.color || ""} onChange={e => setForm({...form, color: e.target.value})} className="bg-background/50 mt-1" /></div>
            </div>
            <div><label className="text-xs text-muted-foreground">הערות</label><Input value={form.notes || ""} onChange={e => setForm({...form, notes: e.target.value})} className="bg-background/50 mt-1" /></div>
            <div className="flex gap-2 pt-2">
              <Button className="flex-1 bg-primary" onClick={save}><Check className="w-4 h-4 ml-1" />שמירה</Button>
              <Button variant="outline" className="flex-1" onClick={() => setModal(null)}>ביטול</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function DriversTab() {
  const [drivers, setDrivers] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<"add" | "edit" | null>(null);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({});

  const load = async () => {
    const d = await apiFetch("/fleet/drivers");
    setDrivers(Array.isArray(d) ? d : []);
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => drivers.filter(d => !search || [d.full_name, d.phone, d.license_number].some(f => String(f || "").toLowerCase().includes(search.toLowerCase()))), [drivers, search]);

  const driverValidation = useFormValidation({
    full_name: { required: true, message: "שם מלא חובה" },
    license_number: { required: true, message: "מספר רישיון חובה" },
  });

  const openAdd = () => { setForm({}); setEditing(null); driverValidation.clearErrors(); setModal("add"); };
  const openEdit = (d: any) => { setForm({...d}); setEditing(d); driverValidation.clearErrors(); setModal("edit"); };
  const save = async () => {
    if (!driverValidation.validate(form)) return;
    if (editing) { await apiFetch(`/fleet/drivers/${editing.id}`, { method: "PUT", body: JSON.stringify(form) }); }
    else { await apiFetch("/fleet/drivers", { method: "POST", body: JSON.stringify(form) }); }
    setModal(null); load();
  };
  const del = async (id: number) => {
    if (!confirm("למחוק נהג זה?")) return;
    await apiFetch(`/fleet/drivers/${id}`, { method: "DELETE" }); load();
  };

  const getLicenseAlert = (expiry: string) => {
    if (!expiry) return null;
    const days = Math.round((new Date(expiry).getTime() - Date.now()) / 86400000);
    if (days < 0) return { color: "text-red-400", label: "פג תוקף" };
    if (days <= 30) return { color: "text-red-400", label: `${days} ימים` };
    if (days <= 90) return { color: "text-yellow-400", label: `${days} ימים` };
    return null;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input placeholder="חיפוש נהגים..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9 bg-background/50" />
        </div>
        <Button size="sm" className="bg-primary" onClick={openAdd}><Plus className="w-4 h-4 ml-1" />הוספת נהג</Button>
      </div>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map((d: any) => {
          const alert = getLicenseAlert(d.license_expiry);
          return (
            <Card key={d.id} className="bg-card/50 border-border/50">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="font-semibold text-foreground">{d.full_name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{d.phone}</div>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(d)}><Edit2 className="w-3.5 h-3.5" /></Button>
                    <Button variant="ghost" size="sm" onClick={() => del(d.id)}><Trash2 className="w-3.5 h-3.5 text-red-400" /></Button>
                  </div>
                </div>
                <div className="space-y-1 text-xs text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <span>רישיון: {d.license_type} — {d.license_number}</span>
                    {alert && <span className={`font-semibold ${alert.color}`}>{alert.label}</span>}
                  </div>
                  {d.vehicle_plate && <div>רכב: <span className="text-foreground">{d.vehicle_plate} {d.vehicle_type && `(${VEHICLE_TYPES[d.vehicle_type] || d.vehicle_type})`}</span></div>}
                  <div>תפקיד: <Badge className={STATUS_COLORS[d.status] || "bg-gray-500/20 text-gray-300"} style={{fontSize:"10px"}}>{d.status === "active" ? "פעיל" : "לא פעיל"}</Badge></div>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {filtered.length === 0 && (
          <div className="col-span-3 text-center py-16 text-muted-foreground">
            <User className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>אין נהגים</p>
          </div>
        )}
      </div>

      {modal && (
        <Modal title={modal === "edit" ? "עריכת נהג" : "הוספת נהג"} onClose={() => setModal(null)}>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><label className="text-xs text-muted-foreground">שם מלא <RequiredMark /></label><Input value={form.full_name || ""} onChange={e => setForm({...form, full_name: e.target.value})} className={`bg-background/50 mt-1 ${driverValidation.getFieldProps("full_name").className}`} /><FormFieldError error={driverValidation.errors.full_name} /></div>
              <div><label className="text-xs text-muted-foreground">טלפון</label><Input value={form.phone || ""} onChange={e => setForm({...form, phone: e.target.value})} className="bg-background/50 mt-1" /></div>
              <div><label className="text-xs text-muted-foreground">אימייל</label><Input value={form.email || ""} onChange={e => setForm({...form, email: e.target.value})} className="bg-background/50 mt-1" /></div>
              <div><label className="text-xs text-muted-foreground">מספר רישיון <RequiredMark /></label><Input value={form.license_number || ""} onChange={e => setForm({...form, license_number: e.target.value})} className={`bg-background/50 mt-1 ${driverValidation.getFieldProps("license_number").className}`} /><FormFieldError error={driverValidation.errors.license_number} /></div>
              <div><label className="text-xs text-muted-foreground">סוג רישיון</label>
                <select value={form.license_type || "B"} onChange={e => setForm({...form, license_type: e.target.value})} className="w-full bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1">
                  {["B","C","C1","D","E"].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div><label className="text-xs text-muted-foreground">תוקף רישיון</label><Input type="date" value={form.license_expiry ? String(form.license_expiry).slice(0,10) : ""} onChange={e => setForm({...form, license_expiry: e.target.value})} className="bg-background/50 mt-1" /></div>
              <div><label className="text-xs text-muted-foreground">סטטוס</label>
                <select value={form.status || "active"} onChange={e => setForm({...form, status: e.target.value})} className="w-full bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1">
                  <option value="active">פעיל</option><option value="inactive">לא פעיל</option>
                </select>
              </div>
            </div>
            <div><label className="text-xs text-muted-foreground">הערות</label><Input value={form.notes || ""} onChange={e => setForm({...form, notes: e.target.value})} className="bg-background/50 mt-1" /></div>
            <div className="flex gap-2 pt-2">
              <Button className="flex-1 bg-primary" onClick={save}><Check className="w-4 h-4 ml-1" />שמירה</Button>
              <Button variant="outline" className="flex-1" onClick={() => setModal(null)}>ביטול</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function FuelLogsTab() {
  const [logs, setLogs] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [vehicleFilter, setVehicleFilter] = useState("all");
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState<any>({});

  const load = async () => {
    const url = vehicleFilter !== "all" ? `/fleet/fuel-logs?vehicle_id=${vehicleFilter}` : "/fleet/fuel-logs";
    const [l, v, d] = await Promise.all([apiFetch(url), apiFetch("/fleet/vehicles"), apiFetch("/fleet/drivers")]);
    setLogs(Array.isArray(l) ? l : []);
    setVehicles(Array.isArray(v) ? v : []);
    setDrivers(Array.isArray(d) ? d : []);
  };
  useEffect(() => { load(); }, [vehicleFilter]);

  const totalCost = logs.reduce((s, l) => s + parseFloat(l.total_cost || 0), 0);
  const totalLiters = logs.reduce((s, l) => s + parseFloat(l.liters || 0), 0);

  const save = async () => {
    await apiFetch("/fleet/fuel-logs", { method: "POST", body: JSON.stringify(form) });
    setModal(false); load();
  };
  const del = async (id: number) => {
    if (!confirm("למחוק רשומה זו?")) return;
    await apiFetch(`/fleet/fuel-logs/${id}`, { method: "DELETE" }); load();
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card className="bg-card/50 border-border/50"><CardContent className="p-3 text-center"><div className="text-2xl font-bold text-foreground">{logs.length}</div><p className="text-xs text-muted-foreground mt-1">רשומות תדלוק</p></CardContent></Card>
        <Card className="bg-card/50 border-border/50"><CardContent className="p-3 text-center"><div className="text-2xl font-bold text-foreground">{totalLiters.toFixed(0)} ל'</div><p className="text-xs text-muted-foreground mt-1">סה"כ ליטרים</p></CardContent></Card>
        <Card className="bg-card/50 border-border/50"><CardContent className="p-3 text-center"><div className="text-2xl font-bold text-foreground">₪{totalCost.toFixed(0)}</div><p className="text-xs text-muted-foreground mt-1">סה"כ עלות</p></CardContent></Card>
      </div>
      <div className="flex flex-wrap gap-3">
        <select value={vehicleFilter} onChange={e => setVehicleFilter(e.target.value)} className="bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground">
          <option value="all">כל הרכבים</option>
          {vehicles.map(v => <option key={v.id} value={v.id}>{v.plate}</option>)}
        </select>
        <Button size="sm" className="bg-primary" onClick={() => { setForm({ log_date: new Date().toISOString().slice(0,10) }); setModal(true); }}><Plus className="w-4 h-4 ml-1" />תדלוק חדש</Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border/50">
            {["תאריך","רכב","נהג","ליטרים","מחיר/ל'","סה\"כ","ק\"מ","תחנה","פעולות"].map(h => <th key={h} className="text-right p-3 text-muted-foreground font-medium">{h}</th>)}
          </tr></thead>
          <tbody>
            {logs.map((l: any) => (
              <tr key={l.id} className="border-b border-border/30 hover:bg-card/30 transition-colors">
                <td className="p-3 text-foreground">{String(l.log_date || "").slice(0,10)}</td>
                <td className="p-3 text-foreground font-semibold">{l.vehicle_plate || "—"}</td>
                <td className="p-3 text-foreground">{l.driver_name || "—"}</td>
                <td className="p-3 text-foreground">{Number(l.liters).toFixed(1)}</td>
                <td className="p-3 text-foreground">₪{Number(l.cost_per_liter).toFixed(2)}</td>
                <td className="p-3 font-semibold text-foreground">₪{Number(l.total_cost).toFixed(0)}</td>
                <td className="p-3 text-foreground">{Number(l.odometer).toLocaleString()}</td>
                <td className="p-3 text-foreground">{l.fuel_station || "—"}</td>
                <td className="p-3"><Button variant="ghost" size="sm" onClick={() => del(l.id)}><Trash2 className="w-3.5 h-3.5 text-red-400" /></Button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {logs.length === 0 && <div className="text-center py-12 text-muted-foreground"><Fuel className="w-10 h-10 mx-auto mb-2 opacity-50" /><p>אין רשומות תדלוק</p></div>}
      </div>

      {modal && (
        <Modal title="תדלוק חדש" onClose={() => setModal(false)}>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs text-muted-foreground">רכב *</label>
                <select value={form.vehicle_id || ""} onChange={e => setForm({...form, vehicle_id: e.target.value})} className="w-full bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1">
                  <option value="">בחר רכב</option>
                  {vehicles.map(v => <option key={v.id} value={v.id}>{v.plate}</option>)}
                </select>
              </div>
              <div><label className="text-xs text-muted-foreground">נהג</label>
                <select value={form.driver_id || ""} onChange={e => setForm({...form, driver_id: e.target.value})} className="w-full bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1">
                  <option value="">בחר נהג</option>
                  {drivers.map(d => <option key={d.id} value={d.id}>{d.full_name}</option>)}
                </select>
              </div>
              <div><label className="text-xs text-muted-foreground">תאריך</label><Input type="date" value={form.log_date || ""} onChange={e => setForm({...form, log_date: e.target.value})} className="bg-background/50 mt-1" /></div>
              <div><label className="text-xs text-muted-foreground">ליטרים</label><Input type="number" step="0.1" value={form.liters || ""} onChange={e => setForm({...form, liters: e.target.value})} className="bg-background/50 mt-1" /></div>
              <div><label className="text-xs text-muted-foreground">מחיר לליטר</label><Input type="number" step="0.01" value={form.cost_per_liter || ""} onChange={e => setForm({...form, cost_per_liter: e.target.value})} className="bg-background/50 mt-1" /></div>
              <div><label className="text-xs text-muted-foreground">ק"מ</label><Input type="number" value={form.odometer || ""} onChange={e => setForm({...form, odometer: e.target.value})} className="bg-background/50 mt-1" /></div>
              <div className="col-span-2"><label className="text-xs text-muted-foreground">תחנת דלק</label><Input value={form.fuel_station || ""} onChange={e => setForm({...form, fuel_station: e.target.value})} className="bg-background/50 mt-1" /></div>
            </div>
            <div className="flex gap-2 pt-2">
              <Button className="flex-1 bg-primary" onClick={save}><Check className="w-4 h-4 ml-1" />שמירה</Button>
              <Button variant="outline" className="flex-1" onClick={() => setModal(false)}>ביטול</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function MaintenanceTab() {
  const [schedules, setSchedules] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [modal, setModal] = useState<"add" | "edit" | null>(null);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [activeView, setActiveView] = useState<"alerts" | "all">("alerts");

  const load = async () => {
    const [s, a, v] = await Promise.all([apiFetch("/fleet/maintenance"), apiFetch("/fleet/maintenance/alerts"), apiFetch("/fleet/vehicles")]);
    setSchedules(Array.isArray(s) ? s : []);
    setAlerts(Array.isArray(a) ? a : []);
    setVehicles(Array.isArray(v) ? v : []);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (editing) { await apiFetch(`/fleet/maintenance/${editing.id}`, { method: "PUT", body: JSON.stringify(form) }); }
    else { await apiFetch("/fleet/maintenance", { method: "POST", body: JSON.stringify(form) }); }
    setModal(null); load();
  };
  const del = async (id: number) => {
    if (!confirm("למחוק?")) return;
    await apiFetch(`/fleet/maintenance/${id}`, { method: "DELETE" }); load();
  };

  const displayData = activeView === "alerts" ? alerts : schedules;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card className="bg-red-500/10 border-red-500/30"><CardContent className="p-3 text-center"><div className="text-2xl font-bold text-red-400">{alerts.filter(a => a.alert_level === "urgent").length}</div><p className="text-xs text-red-300 mt-1">דחוף (30 יום)</p></CardContent></Card>
        <Card className="bg-yellow-500/10 border-yellow-500/30"><CardContent className="p-3 text-center"><div className="text-2xl font-bold text-yellow-400">{alerts.filter(a => a.alert_level === "warning").length}</div><p className="text-xs text-yellow-300 mt-1">אזהרה (60 יום)</p></CardContent></Card>
        <Card className="bg-blue-500/10 border-blue-500/30"><CardContent className="p-3 text-center"><div className="text-2xl font-bold text-blue-400">{alerts.filter(a => a.alert_level === "notice").length}</div><p className="text-xs text-blue-300 mt-1">הודעה (90 יום)</p></CardContent></Card>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="flex gap-1 bg-background/50 border border-border rounded-md p-1">
          <button onClick={() => setActiveView("alerts")} className={`px-3 py-1.5 text-sm rounded transition-colors ${activeView === "alerts" ? "bg-primary text-foreground" : "text-muted-foreground hover:text-foreground"}`}>התראות ({alerts.length})</button>
          <button onClick={() => setActiveView("all")} className={`px-3 py-1.5 text-sm rounded transition-colors ${activeView === "all" ? "bg-primary text-foreground" : "text-muted-foreground hover:text-foreground"}`}>כל הטיפולים ({schedules.length})</button>
        </div>
        <Button size="sm" className="bg-primary mr-auto" onClick={() => { setForm({}); setEditing(null); setModal("add"); }}><Plus className="w-4 h-4 ml-1" />טיפול חדש</Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border/50">
            {["רכב","סוג טיפול","תאריך אחרון","תאריך הבא","ק\"מ הבא","סטטוס/התראה","עלות","פעולות"].map(h => <th key={h} className="text-right p-3 text-muted-foreground font-medium">{h}</th>)}
          </tr></thead>
          <tbody>
            {displayData.map((s: any) => (
              <tr key={s.id} className="border-b border-border/30 hover:bg-card/30 transition-colors">
                <td className="p-3 text-foreground font-semibold">{s.plate || `רכב ${s.vehicle_id}`}</td>
                <td className="p-3 text-foreground">{s.maintenance_type}</td>
                <td className="p-3 text-foreground">{String(s.last_service_date || "—").slice(0,10)}</td>
                <td className="p-3 text-foreground">{String(s.next_due_date || "—").slice(0,10)}</td>
                <td className="p-3 text-foreground">{s.next_due_odometer ? Number(s.next_due_odometer).toLocaleString() : "—"}</td>
                <td className="p-3">
                  {s.alert_level ? (
                    <Badge className={`text-xs border ${ALERT_COLORS[s.alert_level]}`}>
                      {s.alert_level === "urgent" ? "דחוף" : s.alert_level === "warning" ? "אזהרה" : s.alert_level === "notice" ? "הודעה" : "תקין"} {s.days_until_due !== undefined ? `(${s.days_until_due} ימים)` : ""}
                    </Badge>
                  ) : (
                    <Badge className="bg-gray-500/20 text-gray-300 text-xs">{s.status === "completed" ? "הושלם" : "מתוכנן"}</Badge>
                  )}
                </td>
                <td className="p-3 text-foreground">{s.cost ? `₪${Number(s.cost).toFixed(0)}` : "—"}</td>
                <td className="p-3">
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => { setForm({...s}); setEditing(s); setModal("edit"); }}><Edit2 className="w-3.5 h-3.5" /></Button>
                    <Button variant="ghost" size="sm" onClick={() => del(s.id)}><Trash2 className="w-3.5 h-3.5 text-red-400" /></Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {displayData.length === 0 && <div className="text-center py-12 text-muted-foreground"><Wrench className="w-10 h-10 mx-auto mb-2 opacity-50" /><p>אין רשומות</p></div>}
      </div>

      {modal && (
        <Modal title={modal === "edit" ? "עריכת טיפול" : "טיפול חדש"} onClose={() => setModal(null)}>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><label className="text-xs text-muted-foreground">רכב *</label>
                <select value={form.vehicle_id || ""} onChange={e => setForm({...form, vehicle_id: e.target.value})} className="w-full bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1">
                  <option value="">בחר רכב</option>
                  {vehicles.map(v => <option key={v.id} value={v.id}>{v.plate}</option>)}
                </select>
              </div>
              <div className="col-span-2"><label className="text-xs text-muted-foreground">סוג טיפול *</label><Input value={form.maintenance_type || ""} onChange={e => setForm({...form, maintenance_type: e.target.value})} placeholder="שמן, בלמים, טסט..." className="bg-background/50 mt-1" /></div>
              <div><label className="text-xs text-muted-foreground">תאריך אחרון</label><Input type="date" value={String(form.last_service_date || "").slice(0,10)} onChange={e => setForm({...form, last_service_date: e.target.value})} className="bg-background/50 mt-1" /></div>
              <div><label className="text-xs text-muted-foreground">תאריך הבא</label><Input type="date" value={String(form.next_due_date || "").slice(0,10)} onChange={e => setForm({...form, next_due_date: e.target.value})} className="bg-background/50 mt-1" /></div>
              <div><label className="text-xs text-muted-foreground">קמ"ר אחרון</label><Input type="number" value={form.last_service_odometer || ""} onChange={e => setForm({...form, last_service_odometer: e.target.value})} className="bg-background/50 mt-1" /></div>
              <div><label className="text-xs text-muted-foreground">קמ"ר הבא</label><Input type="number" value={form.next_due_odometer || ""} onChange={e => setForm({...form, next_due_odometer: e.target.value})} className="bg-background/50 mt-1" /></div>
              <div><label className="text-xs text-muted-foreground">עלות</label><Input type="number" value={form.cost || ""} onChange={e => setForm({...form, cost: e.target.value})} className="bg-background/50 mt-1" /></div>
              <div><label className="text-xs text-muted-foreground">ספק שירות</label><Input value={form.service_provider || ""} onChange={e => setForm({...form, service_provider: e.target.value})} className="bg-background/50 mt-1" /></div>
            </div>
            <div><label className="text-xs text-muted-foreground">הערות</label><Input value={form.notes || ""} onChange={e => setForm({...form, notes: e.target.value})} className="bg-background/50 mt-1" /></div>
            <div className="flex gap-2 pt-2">
              <Button className="flex-1 bg-primary" onClick={save}><Check className="w-4 h-4 ml-1" />שמירה</Button>
              <Button variant="outline" className="flex-1" onClick={() => setModal(null)}>ביטול</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function InsuranceTab() {
  const [policies, setPolicies] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [modal, setModal] = useState<"add" | "edit" | null>(null);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({});

  const load = async () => {
    const [p, v] = await Promise.all([apiFetch("/fleet/insurance"), apiFetch("/fleet/vehicles")]);
    setPolicies(Array.isArray(p) ? p : []);
    setVehicles(Array.isArray(v) ? v : []);
  };
  useEffect(() => { load(); }, []);

  const urgent = policies.filter(p => p.alert_level === "urgent").length;
  const warning = policies.filter(p => p.alert_level === "warning").length;

  const save = async () => {
    if (editing) { await apiFetch(`/fleet/insurance/${editing.id}`, { method: "PUT", body: JSON.stringify(form) }); }
    else { await apiFetch("/fleet/insurance", { method: "POST", body: JSON.stringify(form) }); }
    setModal(null); load();
  };
  const del = async (id: number) => {
    if (!confirm("למחוק פוליסה?")) return;
    await apiFetch(`/fleet/insurance/${id}`, { method: "DELETE" }); load();
  };

  const COVERAGE_MAP: Record<string,string> = { comprehensive: "מקיף", third_party: "צד שלישי", basic: "בסיסי" };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Card className="bg-red-500/10 border-red-500/30"><CardContent className="p-3 text-center"><div className="text-2xl font-bold text-red-400">{urgent}</div><p className="text-xs text-red-300 mt-1">פג תוקף תוך 30 יום</p></CardContent></Card>
        <Card className="bg-yellow-500/10 border-yellow-500/30"><CardContent className="p-3 text-center"><div className="text-2xl font-bold text-yellow-400">{warning}</div><p className="text-xs text-yellow-300 mt-1">תוך 60 יום</p></CardContent></Card>
        <Card className="bg-green-500/10 border-green-500/30"><CardContent className="p-3 text-center"><div className="text-2xl font-bold text-green-400">{policies.filter(p => p.alert_level === "ok").length}</div><p className="text-xs text-green-300 mt-1">תקין</p></CardContent></Card>
      </div>

      <div className="flex justify-end">
        <Button size="sm" className="bg-primary" onClick={() => { setForm({}); setEditing(null); setModal("add"); }}><Plus className="w-4 h-4 ml-1" />פוליסה חדשה</Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border/50">
            {["רכב","מספר פוליסה","חברת ביטוח","כיסוי","התחלה","סיום","ימים לפקיעה","פרמיה","פעולות"].map(h => <th key={h} className="text-right p-3 text-muted-foreground font-medium">{h}</th>)}
          </tr></thead>
          <tbody>
            {policies.map((p: any) => (
              <tr key={p.id} className="border-b border-border/30 hover:bg-card/30 transition-colors">
                <td className="p-3 text-foreground font-semibold">{p.vehicle_plate || `רכב ${p.vehicle_id}`}</td>
                <td className="p-3 font-mono text-xs text-foreground">{p.policy_number}</td>
                <td className="p-3 text-foreground">{p.provider}</td>
                <td className="p-3 text-foreground">{COVERAGE_MAP[p.coverage_type] || p.coverage_type}</td>
                <td className="p-3 text-foreground">{String(p.start_date || "").slice(0,10)}</td>
                <td className="p-3 text-foreground">{String(p.end_date || "").slice(0,10)}</td>
                <td className="p-3">
                  <Badge className={`text-xs border ${ALERT_COLORS[p.alert_level] || ALERT_COLORS.ok}`}>
                    {p.days_until_expiry !== null ? `${p.days_until_expiry} ימים` : "—"}
                  </Badge>
                </td>
                <td className="p-3 text-foreground">{p.premium_amount ? `₪${Number(p.premium_amount).toFixed(0)}` : "—"}</td>
                <td className="p-3">
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => { setForm({...p}); setEditing(p); setModal("edit"); }}><Edit2 className="w-3.5 h-3.5" /></Button>
                    <Button variant="ghost" size="sm" onClick={() => del(p.id)}><Trash2 className="w-3.5 h-3.5 text-red-400" /></Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {policies.length === 0 && <div className="text-center py-12 text-muted-foreground"><Shield className="w-10 h-10 mx-auto mb-2 opacity-50" /><p>אין פוליסות ביטוח</p></div>}
      </div>

      {modal && (
        <Modal title={modal === "edit" ? "עריכת פוליסה" : "פוליסה חדשה"} onClose={() => setModal(null)}>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><label className="text-xs text-muted-foreground">רכב *</label>
                <select value={form.vehicle_id || ""} onChange={e => setForm({...form, vehicle_id: e.target.value})} className="w-full bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1">
                  <option value="">בחר רכב</option>
                  {vehicles.map(v => <option key={v.id} value={v.id}>{v.plate}</option>)}
                </select>
              </div>
              <div><label className="text-xs text-muted-foreground">מספר פוליסה *</label><Input value={form.policy_number || ""} onChange={e => setForm({...form, policy_number: e.target.value})} className="bg-background/50 mt-1" /></div>
              <div><label className="text-xs text-muted-foreground">חברת ביטוח *</label><Input value={form.provider || ""} onChange={e => setForm({...form, provider: e.target.value})} className="bg-background/50 mt-1" /></div>
              <div><label className="text-xs text-muted-foreground">סוג כיסוי</label>
                <select value={form.coverage_type || "comprehensive"} onChange={e => setForm({...form, coverage_type: e.target.value})} className="w-full bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1">
                  <option value="comprehensive">מקיף</option><option value="third_party">צד שלישי</option><option value="basic">בסיסי</option>
                </select>
              </div>
              <div><label className="text-xs text-muted-foreground">פרמיה שנתית</label><Input type="number" value={form.premium_amount || ""} onChange={e => setForm({...form, premium_amount: e.target.value})} className="bg-background/50 mt-1" /></div>
              <div><label className="text-xs text-muted-foreground">תחילת פוליסה</label><Input type="date" value={String(form.start_date || "").slice(0,10)} onChange={e => setForm({...form, start_date: e.target.value})} className="bg-background/50 mt-1" /></div>
              <div><label className="text-xs text-muted-foreground">סוף פוליסה</label><Input type="date" value={String(form.end_date || "").slice(0,10)} onChange={e => setForm({...form, end_date: e.target.value})} className="bg-background/50 mt-1" /></div>
              <div><label className="text-xs text-muted-foreground">טלפון ביטוח</label><Input value={form.contact_phone || ""} onChange={e => setForm({...form, contact_phone: e.target.value})} className="bg-background/50 mt-1" /></div>
            </div>
            <div><label className="text-xs text-muted-foreground">הערות</label><Input value={form.notes || ""} onChange={e => setForm({...form, notes: e.target.value})} className="bg-background/50 mt-1" /></div>
            <div className="flex gap-2 pt-2">
              <Button className="flex-1 bg-primary" onClick={save}><Check className="w-4 h-4 ml-1" />שמירה</Button>
              <Button variant="outline" className="flex-1" onClick={() => setModal(null)}>ביטול</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default function FleetManagement() {
  const [tab, setTab] = useState<Tab>("רכבים");

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">ניהול צי רכב</h1>
          <p className="text-sm text-muted-foreground mt-1">רכבים, נהגים, תדלוק, תחזוקה וביטוח</p>
        </div>
      </div>

      <div className="flex gap-1 bg-background/50 border border-border rounded-lg p-1">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} className={`flex-1 px-3 py-2 text-sm rounded-md transition-colors ${tab === t ? "bg-primary text-foreground font-medium" : "text-muted-foreground hover:text-foreground"}`}>
            {t === "רכבים" && <Truck className="w-3.5 h-3.5 inline-block ml-1" />}
            {t === "נהגים" && <User className="w-3.5 h-3.5 inline-block ml-1" />}
            {t === "תדלוק" && <Fuel className="w-3.5 h-3.5 inline-block ml-1" />}
            {t === "תחזוקה" && <Wrench className="w-3.5 h-3.5 inline-block ml-1" />}
            {t === "ביטוח" && <Shield className="w-3.5 h-3.5 inline-block ml-1" />}
            {t}
          </button>
        ))}
      </div>

      <Card className="bg-card/50 border-border/50">
        <CardContent className="p-4">
          {tab === "רכבים" && <VehiclesTab />}
          {tab === "נהגים" && <DriversTab />}
          {tab === "תדלוק" && <FuelLogsTab />}
          {tab === "תחזוקה" && <MaintenanceTab />}
          {tab === "ביטוח" && <InsuranceTab />}
        </CardContent>
      </Card>
    </div>
  );
}
