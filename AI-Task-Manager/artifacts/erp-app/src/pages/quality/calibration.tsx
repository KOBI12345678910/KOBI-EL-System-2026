import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Plus, Search, Download, Eye, Edit2, Trash2,
  ChevronRight, ChevronLeft, AlertCircle, CheckCircle2,
  Clock, Activity, Wrench, X, Save, AlertTriangle
} from "lucide-react";

const BASE = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;

const STATUS_COLORS: Record<string, string> = {
  calibrated: "bg-green-500/20 text-green-300 border-green-500/30",
  active: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  overdue: "bg-red-500/20 text-red-300 border-red-500/30",
  in_calibration: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
};

const STATUS_LABELS: Record<string, string> = {
  calibrated: "מכויל",
  active: "פעיל",
  overdue: "באיחור",
  in_calibration: "בכיול",
};

function isOverdue(dateStr: string | null) {
  if (!dateStr) return false;
  return new Date(dateStr) < new Date();
}

function isDueSoon(dateStr: string | null) {
  if (!dateStr) return false;
  const diff = new Date(dateStr).getTime() - Date.now();
  return diff > 0 && diff < 30 * 24 * 60 * 60 * 1000;
}

interface Instrument {
  id: number;
  name: string;
  serial_number: string;
  type: string;
  location: string;
  department: string;
  manufacturer: string;
  model: string;
  calibration_interval: number;
  last_calibration_date: string | null;
  next_calibration_date: string | null;
  calibration_status: string;
  out_of_calibration: boolean;
  notes: string;
}

interface CalibRecord {
  id: number;
  instrument_id: number;
  calibration_date: string;
  result: string;
  next_due_date: string;
  certificate_number: string;
  performed_by: string;
  lab_name: string;
  notes: string;
}

const emptyForm = {
  name: "", serialNumber: "", type: "", location: "",
  department: "", manufacturer: "", model: "",
  calibrationInterval: "12", lastCalibrationDate: "",
  nextCalibrationDate: "", calibrationStatus: "active", notes: ""
};

const emptyRecordForm = {
  calibrationDate: "", result: "pass", nextDueDate: "",
  certificateNumber: "", performedBy: "", labName: "", notes: ""
};

export default function Calibration() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const perPage = 20;

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showRecordForm, setShowRecordForm] = useState(false);
  const [recordForm, setRecordForm] = useState({ ...emptyRecordForm });
  const [activeTab, setActiveTab] = useState<"list" | "alerts">("list");

  const { data: instruments = [], isLoading: loading } = useQuery<Instrument[]>({
    queryKey: ["calibration-instruments"],
    queryFn: async () => {
      const res = await authFetch(`${BASE}/calibration-instruments`);
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 60_000,
  });

  const { data: records = [], isLoading: recordsLoading } = useQuery<CalibRecord[]>({
    queryKey: ["calibration-records", selectedId],
    queryFn: async () => {
      if (!selectedId) return [];
      const res = await authFetch(`${BASE}/calibration-records?instrumentId=${selectedId}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedId,
    staleTime: 30_000,
  });

  const filtered = useMemo(() => {
    return instruments.filter(r => {
      if (statusFilter !== "all" && r.calibration_status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (r.name?.toLowerCase().includes(q) ||
          r.serial_number?.toLowerCase().includes(q) ||
          r.location?.toLowerCase().includes(q) ||
          r.type?.toLowerCase().includes(q));
      }
      return true;
    });
  }, [instruments, search, statusFilter]);

  const pageData = filtered.slice((page - 1) * perPage, page * perPage);
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));

  const overdueList = instruments.filter(i => isOverdue(i.next_calibration_date) || i.calibration_status === "overdue" || i.out_of_calibration);
  const dueSoonList = instruments.filter(i => !isOverdue(i.next_calibration_date) && isDueSoon(i.next_calibration_date));

  async function handleSave() {
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        serialNumber: form.serialNumber,
        type: form.type,
        location: form.location,
        department: form.department,
        manufacturer: form.manufacturer,
        model: form.model,
        calibrationInterval: parseInt(form.calibrationInterval) || 12,
        lastCalibrationDate: form.lastCalibrationDate || null,
        nextCalibrationDate: form.nextCalibrationDate || null,
        calibrationStatus: form.calibrationStatus,
        notes: form.notes,
      };
      const url = editId ? `${BASE}/calibration-instruments/${editId}` : `${BASE}/calibration-instruments`;
      const method = editId ? "PUT" : "POST";
      await authFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      setShowForm(false);
      setEditId(null);
      setForm({ ...emptyForm });
      queryClient.invalidateQueries({ queryKey: ["calibration-instruments"] });
    } catch { } finally { setSaving(false); }
  }

  async function handleSaveRecord() {
    if (!selectedId) return;
    setSaving(true);
    try {
      await authFetch(`${BASE}/calibration-records`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instrumentId: selectedId, ...recordForm })
      });
      setShowRecordForm(false);
      setRecordForm({ ...emptyRecordForm });
      queryClient.invalidateQueries({ queryKey: ["calibration-instruments"] });
      queryClient.invalidateQueries({ queryKey: ["calibration-records", selectedId] });
    } catch { } finally { setSaving(false); }
  }

  async function handleDelete(id: number) {
    if (!confirm("למחוק מכשיר זה?")) return;
    await authFetch(`${BASE}/calibration-instruments/${id}`, { method: "DELETE" });
    queryClient.invalidateQueries({ queryKey: ["calibration-instruments"] });
  }

  function openEdit(i: Instrument) {
    setEditId(i.id);
    setForm({
      name: i.name || "", serialNumber: i.serial_number || "",
      type: i.type || "", location: i.location || "",
      department: i.department || "", manufacturer: i.manufacturer || "",
      model: i.model || "", calibrationInterval: String(i.calibration_interval || 12),
      lastCalibrationDate: i.last_calibration_date?.split("T")[0] || "",
      nextCalibrationDate: i.next_calibration_date?.split("T")[0] || "",
      calibrationStatus: i.calibration_status || "active", notes: i.notes || ""
    });
    setShowForm(true);
  }

  function openInstrumentDetail(id: number) {
    setSelectedId(id);
  }

  const statCounts = {
    calibrated: instruments.filter(i => i.calibration_status === "calibrated").length,
    active: instruments.filter(i => i.calibration_status === "active").length,
    overdue: overdueList.length,
    in_calibration: instruments.filter(i => i.calibration_status === "in_calibration").length,
  };

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">ניהול כיול מכשירים</h1>
          <p className="text-sm text-muted-foreground mt-1">רישום ציוד, לוח כיול, תעודות ואזהרות</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setActiveTab(t => t === "list" ? "alerts" : "list")}>
            {activeTab === "list" ? <><AlertTriangle className="w-4 h-4 ml-1" />אזהרות</> : <><Activity className="w-4 h-4 ml-1" />כל המכשירים</>}
          </Button>
          <Button size="sm" className="bg-primary" onClick={() => { setShowForm(true); setEditId(null); setForm({ ...emptyForm }); }}>
            <Plus className="w-4 h-4 ml-1" />הוספת מכשיר
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { key: "calibrated", icon: CheckCircle2, color: "text-green-400" },
          { key: "active", icon: Activity, color: "text-blue-400" },
          { key: "overdue", icon: AlertCircle, color: "text-red-400" },
          { key: "in_calibration", icon: Clock, color: "text-yellow-400" },
        ].map(({ key, icon: Icon, color }) => (
          <Card key={key} className="bg-card/50 border-border/50 cursor-pointer hover:bg-card/70 transition-colors"
            onClick={() => setStatusFilter(statusFilter === key ? "all" : key)}>
            <CardContent className="p-4 flex items-center gap-3">
              <Icon className={`w-8 h-8 ${color}`} />
              <div>
                <div className="text-2xl font-bold text-foreground">{statCounts[key as keyof typeof statCounts]}</div>
                <div className="text-xs text-muted-foreground">{STATUS_LABELS[key]}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Alerts tab */}
      {activeTab === "alerts" && (
        <div className="space-y-4">
          {overdueList.length > 0 && (
            <Card className="bg-red-900/20 border-red-500/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-red-300 text-base flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />מכשירים באיחור ({overdueList.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {overdueList.map(i => (
                    <div key={i.id} className="flex items-center justify-between p-3 bg-red-900/20 rounded-lg">
                      <div>
                        <span className="font-medium text-foreground">{i.name}</span>
                        <span className="text-sm text-muted-foreground mr-2">— {i.serial_number}</span>
                        {i.out_of_calibration && <Badge className="bg-red-500/20 text-red-300 text-xs mr-2">חסום</Badge>}
                      </div>
                      <span className="text-sm text-red-300">{i.next_calibration_date ? new Date(i.next_calibration_date).toLocaleDateString("he-IL") : "—"}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
          {dueSoonList.length > 0 && (
            <Card className="bg-yellow-900/20 border-yellow-500/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-yellow-300 text-base flex items-center gap-2">
                  <Clock className="w-4 h-4" />כיול נדרש בקרוב ({dueSoonList.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {dueSoonList.map(i => (
                    <div key={i.id} className="flex items-center justify-between p-3 bg-yellow-900/20 rounded-lg">
                      <span className="font-medium text-foreground">{i.name} — {i.serial_number}</span>
                      <span className="text-sm text-yellow-300">{i.next_calibration_date ? new Date(i.next_calibration_date).toLocaleDateString("he-IL") : "—"}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
          {overdueList.length === 0 && dueSoonList.length === 0 && (
            <div className="text-center py-16 text-muted-foreground">
              <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-green-400 opacity-70" />
              <p className="text-lg font-medium">כל המכשירים מכוילים ותקינים</p>
            </div>
          )}
        </div>
      )}

      {/* Main list */}
      {activeTab === "list" && (
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-3 mb-4">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
                <Input placeholder={'חיפוש לפי שם, מ"ס, מיקום...'} value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pr-9 bg-background/50" />
              </div>
              <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
                className="bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground">
                <option value="all">כל הסטטוסים</option>
                {Object.keys(STATUS_LABELS).map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </select>
            </div>

            {loading ? (
              <div className="text-center py-16 text-muted-foreground"><Activity className="w-8 h-8 mx-auto mb-2 animate-pulse" />טוען...</div>
            ) : pageData.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <Wrench className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p className="text-lg font-medium">אין מכשירים להצגה</p>
                <p className="text-sm mt-1">לחץ על "הוספת מכשיר" כדי להתחיל</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      {["שם מכשיר", "מ\"ס", "סוג", "מיקום", "כיול אחרון", "כיול הבא", "סטטוס", "פעולות"].map(h => (
                        <th key={h} className="text-right p-3 text-muted-foreground font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pageData.map(row => (
                      <tr key={row.id} className={`border-b border-border/30 hover:bg-card/30 transition-colors ${row.out_of_calibration ? "bg-red-900/10" : ""}`}>
                        <td className="p-3 text-foreground font-medium">
                          {row.name}
                          {row.out_of_calibration && <Badge className="bg-red-500/20 text-red-300 text-xs mr-2">חסום</Badge>}
                        </td>
                        <td className="p-3 text-muted-foreground">{row.serial_number || "—"}</td>
                        <td className="p-3 text-muted-foreground">{row.type || "—"}</td>
                        <td className="p-3 text-muted-foreground">{row.location || "—"}</td>
                        <td className="p-3 text-muted-foreground">{row.last_calibration_date ? new Date(row.last_calibration_date).toLocaleDateString("he-IL") : "—"}</td>
                        <td className={`p-3 ${isOverdue(row.next_calibration_date) ? "text-red-300" : isDueSoon(row.next_calibration_date) ? "text-yellow-300" : "text-muted-foreground"}`}>
                          {row.next_calibration_date ? new Date(row.next_calibration_date).toLocaleDateString("he-IL") : "—"}
                        </td>
                        <td className="p-3">
                          <Badge className={STATUS_COLORS[row.calibration_status] || "bg-gray-500/20 text-gray-300"}>
                            {STATUS_LABELS[row.calibration_status] || row.calibration_status}
                          </Badge>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="sm" onClick={() => openInstrumentDetail(row.id)}><Eye className="w-3.5 h-3.5" /></Button>
                            <Button variant="ghost" size="sm" onClick={() => openEdit(row)}><Edit2 className="w-3.5 h-3.5" /></Button>
                            <Button variant="ghost" size="sm" onClick={() => handleDelete(row.id)}><Trash2 className="w-3.5 h-3.5 text-red-400" /></Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
              <span>{filtered.length} מכשירים</span>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronRight className="w-4 h-4" /></Button>
                <span className="px-3 py-1">{page}/{totalPages}</span>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}><ChevronLeft className="w-4 h-4" /></Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Instrument Detail Modal */}
      {selectedId !== null && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-2xl bg-card border-border max-h-[90vh] flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-foreground">היסטוריית כיול</CardTitle>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => setShowRecordForm(true)}><Plus className="w-4 h-4 ml-1" />הוספת כיול</Button>
                <Button variant="ghost" size="sm" onClick={() => { setSelectedId(null); setShowRecordForm(false); }}><X className="w-4 h-4" /></Button>
              </div>
            </CardHeader>
            <CardContent className="overflow-y-auto">
              {showRecordForm && (
                <div className="mb-4 p-4 bg-background/50 rounded-lg space-y-3">
                  <h3 className="font-medium text-foreground">רישום כיול חדש</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>תאריך כיול</Label><Input type="date" value={recordForm.calibrationDate} onChange={e => setRecordForm(f => ({ ...f, calibrationDate: e.target.value }))} className="bg-background/50" /></div>
                    <div><Label>תאריך כיול הבא</Label><Input type="date" value={recordForm.nextDueDate} onChange={e => setRecordForm(f => ({ ...f, nextDueDate: e.target.value }))} className="bg-background/50" /></div>
                    <div>
                      <Label>תוצאה</Label>
                      <select value={recordForm.result} onChange={e => setRecordForm(f => ({ ...f, result: e.target.value }))}
                        className="w-full bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground">
                        <option value="pass">עבר</option>
                        <option value="fail">נכשל</option>
                      </select>
                    </div>
                    <div><Label>מספר תעודה</Label><Input value={recordForm.certificateNumber} onChange={e => setRecordForm(f => ({ ...f, certificateNumber: e.target.value }))} className="bg-background/50" /></div>
                    <div><Label>בוצע על ידי</Label><Input value={recordForm.performedBy} onChange={e => setRecordForm(f => ({ ...f, performedBy: e.target.value }))} className="bg-background/50" /></div>
                    <div><Label>מעבדה</Label><Input value={recordForm.labName} onChange={e => setRecordForm(f => ({ ...f, labName: e.target.value }))} className="bg-background/50" /></div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button variant="outline" size="sm" onClick={() => setShowRecordForm(false)}>ביטול</Button>
                    <Button size="sm" onClick={handleSaveRecord} disabled={saving}><Save className="w-4 h-4 ml-1" />שמור</Button>
                  </div>
                </div>
              )}

              {recordsLoading ? <div className="text-center py-8 text-muted-foreground">טוען...</div> : records.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">אין רשומות כיול עדיין</div>
              ) : (
                <div className="space-y-2">
                  {records.map(r => (
                    <div key={r.id} className="p-3 bg-background/30 rounded-lg flex items-center justify-between">
                      <div>
                        <span className="font-medium text-foreground">{r.calibration_date ? new Date(r.calibration_date).toLocaleDateString("he-IL") : "—"}</span>
                        <span className="text-sm text-muted-foreground mr-3">{r.performed_by || ""} {r.lab_name ? `• ${r.lab_name}` : ""}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {r.certificate_number && <span className="text-xs text-muted-foreground">תעודה: {r.certificate_number}</span>}
                        <Badge className={r.result === "pass" ? "bg-green-500/20 text-green-300" : "bg-red-500/20 text-red-300"}>
                          {r.result === "pass" ? "עבר" : "נכשל"}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Add/Edit Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-2xl bg-card border-border max-h-[90vh] flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-foreground">{editId ? "עריכת מכשיר" : "הוספת מכשיר חדש"}</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => { setShowForm(false); setEditId(null); }}><X className="w-4 h-4" /></Button>
            </CardHeader>
            <CardContent className="overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                {[
                  { key: "name", label: "שם מכשיר", required: true },
                  { key: "serialNumber", label: "מספר סידורי" },
                  { key: "type", label: "סוג" },
                  { key: "location", label: "מיקום" },
                  { key: "department", label: "מחלקה" },
                  { key: "manufacturer", label: "יצרן" },
                  { key: "model", label: "דגם" },
                  { key: "calibrationInterval", label: "מחזור כיול (חודשים)", type: "number" },
                  { key: "lastCalibrationDate", label: "כיול אחרון", type: "date" },
                  { key: "nextCalibrationDate", label: "כיול הבא", type: "date" },
                ].map(f => (
                  <div key={f.key}>
                    <Label>{f.label}{f.required && " *"}</Label>
                    <Input
                      type={f.type || "text"}
                      value={(form as any)[f.key]}
                      onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                      className="bg-background/50"
                    />
                  </div>
                ))}
                <div>
                  <Label>סטטוס</Label>
                  <select value={form.calibrationStatus} onChange={e => setForm(f => ({ ...f, calibrationStatus: e.target.value }))}
                    className="w-full bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground">
                    {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
              </div>
              <div className="mt-4">
                <Label>הערות</Label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground h-20 resize-none" />
              </div>
              <div className="flex gap-2 justify-end mt-4">
                <Button variant="outline" onClick={() => { setShowForm(false); setEditId(null); }}>ביטול</Button>
                <Button onClick={handleSave} disabled={saving || !form.name}>
                  <Save className="w-4 h-4 ml-1" />{saving ? "שומר..." : "שמור"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
