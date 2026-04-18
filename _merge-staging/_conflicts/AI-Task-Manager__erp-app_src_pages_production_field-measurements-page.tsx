import { useState, useEffect } from "react";
import { authFetch } from "@/lib/utils";
import {
  Ruler, MapPin, Calendar, User, Plus, Search, Filter, CheckCircle2,
  Clock, AlertCircle, Building2, DoorOpen, SquareStack, Eye
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import AttachmentsSection from "@/components/attachments-section";
import { useFormValidation, FormFieldError, RequiredMark } from "@/hooks/use-form-validation";

const API = "/api";

function authHeaders(): Record<string, string> {
  const t = localStorage.getItem("erp_token") || localStorage.getItem("token") || "";
  return { Authorization: `Bearer ${t}`, "Content-Type": "application/json" };
}

const STATUS_MAP: Record<string, { label: string; color: string; icon: any }> = {
  planned: { label: "מתוכנן", color: "bg-blue-500/20 text-blue-400 border-blue-500/30", icon: Calendar },
  in_progress: { label: "בביצוע", color: "bg-amber-500/20 text-amber-400 border-amber-500/30", icon: Clock },
  completed: { label: "הושלם", color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30", icon: CheckCircle2 },
};

const CATEGORY_MAP: Record<string, string> = {
  windows: "חלונות", doors: "דלתות", storefronts: "ויטרינות", partitions: "מחיצות",
  curtain_wall: "קירות מסך", railings: "מעקות", shutters: "תריסים"
};

const APPROVAL_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: "ממתין לאישור", color: "bg-amber-500/20 text-amber-400" },
  approved: { label: "מאושר", color: "bg-emerald-500/20 text-emerald-400" },
  rejected: { label: "נדחה", color: "bg-red-500/20 text-red-400" },
};

const validationSchema = {
  project_name: { required: true, message: "שם פרויקט הוא שדה חובה" },
  customer_name: { required: true, message: "שם לקוח הוא שדה חובה" },
  site_address: { required: true, message: "כתובת אתר היא שדה חובה" },
  measured_by: { required: true, message: "נמדד על ידי הוא שדה חובה" },
  width_mm: { required: true, min: 1, message: "רוחב חייב להיות גדול מ-0" },
  height_mm: { required: true, min: 1, message: "גובה חייב להיות גדול מ-0" },
};

export default function FieldMeasurementsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<any>({});
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [detailTab, setDetailTab] = useState("details");

  const { selectedIds, toggle, toggleAll, clear, isSelected } = useBulkSelection();
  const { errors, validate, clearErrors } = useFormValidation(validationSchema);

  const headers = authHeaders();

  const load = async () => {
    setLoading(true);
    try {
      const [itemsRes, statsRes] = await Promise.all([
        authFetch(`${API}/field-measurements${filterStatus ? `?status=${filterStatus}` : ''}`, { headers }).then(r => r.ok ? r.json() : []),
        authFetch(`${API}/field-measurements/stats`, { headers }).then(r => r.ok ? r.json() : {}),
      ]);
      setItems(Array.isArray(itemsRes) ? itemsRes : []);
      setStats(statsRes);
    } catch { }
    setLoading(false);
  };

  useEffect(() => { load(); }, [filterStatus]);

  const save = async () => {
    if (!validate(form)) return;
    const url = editing ? `${API}/field-measurements/${editing.id}` : `${API}/field-measurements`;
    await authFetch(url, { method: editing ? "PUT" : "POST", headers, body: JSON.stringify(form) });
    setShowForm(false);
    setEditing(null);
    setForm({});
    clearErrors();
    load();
  };

  const remove = async (id: number) => {
    if (!confirm("למחוק מדידה זו?")) return;
    await authFetch(`${API}/field-measurements/${id}`, { method: "DELETE", headers });
    load();
  };

  const filtered = items.filter(i => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (i.measurement_number?.toLowerCase().includes(s) ||
      i.project_name?.toLowerCase().includes(s) ||
      i.customer_name?.toLowerCase().includes(s) ||
      i.site_address?.toLowerCase().includes(s) ||
      i.room?.toLowerCase().includes(s));
  });

  const openEdit = (item: any) => {
    setEditing(item);
    setForm({
      project_name: item.project_name, customer_name: item.customer_name,
      site_address: item.site_address, measured_by: item.measured_by,
      measurement_date: item.measurement_date?.split('T')[0], status: item.status,
      category: item.category, floor: item.floor, room: item.room,
      opening_type: item.opening_type, width_mm: item.width_mm, height_mm: item.height_mm,
      depth_mm: item.depth_mm, sill_height_mm: item.sill_height_mm,
      wall_material: item.wall_material, glass_type: item.glass_type,
      frame_color: item.frame_color, opening_direction: item.opening_direction,
      handle_side: item.handle_side, mosquito_net: item.mosquito_net,
      shutter_type: item.shutter_type, notes: item.notes, approval_status: item.approval_status
    });
    clearErrors();
    setShowForm(true);
  };

  const relatedTabs = selectedItem ? [
    {
      key: "products", label: "מוצרים", endpoint: `${API}/product-catalog?search=${selectedItem.project_name || ""}`,
      columns: [
        { key: "name", label: "שם מוצר" },
        { key: "sku", label: "מק\"ט" },
        { key: "category", label: "קטגוריה" },
      ],
    },
    {
      key: "inspections", label: "בדיקות", endpoint: `${API}/qc-inspections?project=${selectedItem.project_name || ""}`,
      columns: [
        { key: "inspection_number", label: "מספר בדיקה" },
        { key: "type", label: "סוג" },
        { key: "result", label: "תוצאה" },
      ],
    },
    {
      key: "standards", label: "תקנים", endpoint: `${API}/compliance-certificates?limit=10`,
      columns: [
        { key: "name", label: "שם תקן" },
        { key: "standard_number", label: "מספר תקן" },
        { key: "status", label: "סטטוס" },
      ],
    },
  ] : [];

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Ruler className="w-8 h-8 text-blue-500" />
            מדידות שטח
          </h1>
          <p className="text-muted-foreground mt-1">ניהול מדידות שטח לחלונות, דלתות, ויטרינות ומחיצות</p>
        </div>
        <Button onClick={() => { setEditing(null); setForm({}); clearErrors(); setShowForm(true); }}>
          <Plus className="w-4 h-4 ml-1" /> מדידה חדשה
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-blue-900/40 to-blue-800/20 border-blue-700/30">
          <CardContent className="p-4 text-center">
            <Ruler className="w-5 h-5 mx-auto mb-1 text-blue-400" />
            <p className="text-xs text-muted-foreground">{"סה\"כ מדידות"}</p>
            <p className="text-2xl font-bold text-blue-300">{stats.total || 0}</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-amber-900/40 to-amber-800/20 border-amber-700/30">
          <CardContent className="p-4 text-center">
            <Clock className="w-5 h-5 mx-auto mb-1 text-amber-400" />
            <p className="text-xs text-muted-foreground">בביצוע</p>
            <p className="text-2xl font-bold text-amber-300">{stats.in_progress || 0}</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-emerald-900/40 to-emerald-800/20 border-emerald-700/30">
          <CardContent className="p-4 text-center">
            <CheckCircle2 className="w-5 h-5 mx-auto mb-1 text-emerald-400" />
            <p className="text-xs text-muted-foreground">הושלמו</p>
            <p className="text-2xl font-bold text-emerald-300">{stats.completed || 0}</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-purple-900/40 to-purple-800/20 border-purple-700/30">
          <CardContent className="p-4 text-center">
            <Building2 className="w-5 h-5 mx-auto mb-1 text-purple-400" />
            <p className="text-xs text-muted-foreground">פרויקטים</p>
            <p className="text-2xl font-bold text-purple-300">{stats.projects || 0}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-3 items-center flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="חיפוש לפי מספר, פרויקט, לקוח, כתובת..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9" />
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant={filterStatus === '' ? 'default' : 'outline'} onClick={() => setFilterStatus('')}>הכל</Button>
          <Button size="sm" variant={filterStatus === 'planned' ? 'default' : 'outline'} onClick={() => setFilterStatus('planned')}>מתוכנן</Button>
          <Button size="sm" variant={filterStatus === 'in_progress' ? 'default' : 'outline'} onClick={() => setFilterStatus('in_progress')}>בביצוע</Button>
          <Button size="sm" variant={filterStatus === 'completed' ? 'default' : 'outline'} onClick={() => setFilterStatus('completed')}>הושלם</Button>
        </div>
      </div>

      <BulkActions selectedIds={selectedIds} onClear={clear} entityName="מדידות" actions={defaultBulkActions(selectedIds, clear, load, `${API}/field-measurements`)} />

      {showForm && (
        <Card className="border-blue-500/30">
          <CardHeader><CardTitle className="text-sm">{editing ? 'עריכת מדידה' : 'מדידה חדשה'}</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-3">
              <div><label className="text-xs text-muted-foreground"><RequiredMark />שם פרויקט</label><Input value={form.project_name || ''} onChange={e => setForm({ ...form, project_name: e.target.value })} /><FormFieldError error={errors.project_name} /></div>
              <div><label className="text-xs text-muted-foreground"><RequiredMark />לקוח</label><Input value={form.customer_name || ''} onChange={e => setForm({ ...form, customer_name: e.target.value })} /><FormFieldError error={errors.customer_name} /></div>
              <div><label className="text-xs text-muted-foreground"><RequiredMark />כתובת אתר</label><Input value={form.site_address || ''} onChange={e => setForm({ ...form, site_address: e.target.value })} /><FormFieldError error={errors.site_address} /></div>
              <div><label className="text-xs text-muted-foreground"><RequiredMark />{"נמדד ע\"י"}</label><Input value={form.measured_by || ''} onChange={e => setForm({ ...form, measured_by: e.target.value })} /><FormFieldError error={errors.measured_by} /></div>
              <div><label className="text-xs text-muted-foreground">תאריך מדידה</label><Input type="date" value={form.measurement_date || ''} onChange={e => setForm({ ...form, measurement_date: e.target.value })} /></div>
              <div><label className="text-xs text-muted-foreground">סטטוס</label>
                <select className="w-full bg-slate-800 border border-slate-700 rounded-md p-2 text-sm" value={form.status || 'planned'} onChange={e => setForm({ ...form, status: e.target.value })}>
                  <option value="planned">מתוכנן</option><option value="in_progress">בביצוע</option><option value="completed">הושלם</option>
                </select>
              </div>
              <div><label className="text-xs text-muted-foreground">קטגוריה</label>
                <select className="w-full bg-slate-800 border border-slate-700 rounded-md p-2 text-sm" value={form.category || 'windows'} onChange={e => setForm({ ...form, category: e.target.value })}>
                  <option value="windows">חלונות</option><option value="doors">דלתות</option><option value="storefronts">ויטרינות</option>
                  <option value="partitions">מחיצות</option><option value="curtain_wall">קירות מסך</option><option value="railings">מעקות</option>
                </select>
              </div>
              <div><label className="text-xs text-muted-foreground">קומה</label><Input value={form.floor || ''} onChange={e => setForm({ ...form, floor: e.target.value })} /></div>
              <div><label className="text-xs text-muted-foreground">חדר/מיקום</label><Input value={form.room || ''} onChange={e => setForm({ ...form, room: e.target.value })} /></div>
              <div><label className="text-xs text-muted-foreground">סוג פתח</label><Input value={form.opening_type || ''} onChange={e => setForm({ ...form, opening_type: e.target.value })} /></div>
              <div><label className="text-xs text-muted-foreground"><RequiredMark />{"רוחב (מ\"מ)"}</label><Input type="number" value={form.width_mm || ''} onChange={e => setForm({ ...form, width_mm: e.target.value })} /><FormFieldError error={errors.width_mm} /></div>
              <div><label className="text-xs text-muted-foreground"><RequiredMark />{"גובה (מ\"מ)"}</label><Input type="number" value={form.height_mm || ''} onChange={e => setForm({ ...form, height_mm: e.target.value })} /><FormFieldError error={errors.height_mm} /></div>
              <div><label className="text-xs text-muted-foreground">{"עומק (מ\"מ)"}</label><Input type="number" value={form.depth_mm || ''} onChange={e => setForm({ ...form, depth_mm: e.target.value })} /></div>
              <div><label className="text-xs text-muted-foreground">{"גובה אדן (מ\"מ)"}</label><Input type="number" value={form.sill_height_mm || ''} onChange={e => setForm({ ...form, sill_height_mm: e.target.value })} /></div>
              <div><label className="text-xs text-muted-foreground">חומר קיר</label><Input value={form.wall_material || ''} onChange={e => setForm({ ...form, wall_material: e.target.value })} /></div>
              <div><label className="text-xs text-muted-foreground">סוג זכוכית</label><Input value={form.glass_type || ''} onChange={e => setForm({ ...form, glass_type: e.target.value })} /></div>
              <div><label className="text-xs text-muted-foreground">צבע מסגרת</label><Input value={form.frame_color || ''} onChange={e => setForm({ ...form, frame_color: e.target.value })} /></div>
              <div><label className="text-xs text-muted-foreground">כיוון פתיחה</label><Input value={form.opening_direction || ''} onChange={e => setForm({ ...form, opening_direction: e.target.value })} /></div>
              <div className="md:col-span-2"><label className="text-xs text-muted-foreground">הערות</label><Input value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
            </div>
            <div className="flex gap-2 mt-4">
              <Button onClick={save}>{editing ? 'עדכן' : 'שמור'}</Button>
              <Button variant="outline" onClick={() => { setShowForm(false); setEditing(null); clearErrors(); }}>ביטול</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {selectedItem && (
        <Card className="border-purple-500/30">
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle className="text-sm flex items-center gap-2"><Eye className="w-4 h-4" /> פרטי מדידה - {selectedItem.measurement_number}</CardTitle>
              <Button size="sm" variant="outline" onClick={() => { setSelectedItem(null); setDetailTab("details"); }}>סגור</Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex border-b border-border/50 mb-4">
              {[{key:"details",label:"פרטים"},{key:"related",label:"רשומות קשורות"},{key:"docs",label:"מסמכים"},{key:"history",label:"היסטוריה"}].map(t => (
                <button key={t.key} onClick={() => setDetailTab(t.key)} className={`px-4 py-2.5 text-sm font-medium border-b-2 ${detailTab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t.label}</button>
              ))}
            </div>

            {detailTab === "details" && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div><span className="text-muted-foreground">פרויקט:</span> <span className="font-medium">{selectedItem.project_name}</span></div>
                  <div><span className="text-muted-foreground">לקוח:</span> <span className="font-medium">{selectedItem.customer_name}</span></div>
                  <div><span className="text-muted-foreground">כתובת:</span> <span className="font-medium">{selectedItem.site_address}</span></div>
                  <div><span className="text-muted-foreground">{"נמדד ע\"י:"}</span> <span className="font-medium">{selectedItem.measured_by}</span></div>
                  <div><span className="text-muted-foreground">קומה:</span> <span className="font-medium">{selectedItem.floor}</span></div>
                  <div><span className="text-muted-foreground">חדר:</span> <span className="font-medium">{selectedItem.room}</span></div>
                  <div><span className="text-muted-foreground">סוג פתח:</span> <span className="font-medium">{selectedItem.opening_type}</span></div>
                  <div><span className="text-muted-foreground">מידות:</span> <span className="font-medium">{selectedItem.width_mm}x{selectedItem.height_mm}x{selectedItem.depth_mm} {"מ\"מ"}</span></div>
                  <div><span className="text-muted-foreground">גובה אדן:</span> <span className="font-medium">{selectedItem.sill_height_mm} {"מ\"מ"}</span></div>
                  <div><span className="text-muted-foreground">חומר קיר:</span> <span className="font-medium">{selectedItem.wall_material}</span></div>
                  <div><span className="text-muted-foreground">זכוכית:</span> <span className="font-medium">{selectedItem.glass_type}</span></div>
                  <div><span className="text-muted-foreground">צבע מסגרת:</span> <span className="font-medium">{selectedItem.frame_color}</span></div>
                  <div><span className="text-muted-foreground">כיוון פתיחה:</span> <span className="font-medium">{selectedItem.opening_direction}</span></div>
                  <div><span className="text-muted-foreground">צד ידית:</span> <span className="font-medium">{selectedItem.handle_side}</span></div>
                  <div><span className="text-muted-foreground">רשת:</span> <span className="font-medium">{selectedItem.mosquito_net ? 'כן' : 'לא'}</span></div>
                  <div><span className="text-muted-foreground">תריס:</span> <span className="font-medium">{selectedItem.shutter_type || '-'}</span></div>
                </div>
                {selectedItem.notes && <div className="mt-3 p-2 bg-slate-800/50 rounded text-sm"><span className="text-muted-foreground">הערות:</span> {selectedItem.notes}</div>}
              </>
            )}

            {detailTab === "related" && (
              <RelatedRecords tabs={relatedTabs} />
            )}

            {detailTab === "docs" && (
              <AttachmentsSection entityType="field_measurement" entityId={selectedItem.id} />
            )}

            {detailTab === "history" && (
              <ActivityLog entityType="field_measurement" entityId={selectedItem.id} />
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-muted-foreground">
                  <th className="text-right p-3 w-10">
                    <BulkCheckbox checked={selectedIds.length === filtered.length && filtered.length > 0} onChange={() => toggleAll(filtered)} partial={selectedIds.length > 0 && selectedIds.length < filtered.length} />
                  </th>
                  <th className="text-right p-3">מס' מדידה</th>
                  <th className="text-right p-3">פרויקט</th>
                  <th className="text-right p-3">לקוח</th>
                  <th className="text-right p-3">קטגוריה</th>
                  <th className="text-right p-3">קומה/חדר</th>
                  <th className="text-right p-3">סוג פתח</th>
                  <th className="text-left p-3">{"מידות (מ\"מ)"}</th>
                  <th className="text-right p-3">{"נמדד ע\"י"}</th>
                  <th className="text-right p-3">תאריך</th>
                  <th className="text-right p-3">סטטוס</th>
                  <th className="text-right p-3">אישור</th>
                  <th className="text-center p-3">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={13} className="p-8 text-center text-muted-foreground">טוען...</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={13} className="p-8 text-center text-muted-foreground">לא נמצאו מדידות</td></tr>
                ) : filtered.map((item: any) => {
                  const st = STATUS_MAP[item.status] || STATUS_MAP.planned;
                  const ap = APPROVAL_MAP[item.approval_status] || APPROVAL_MAP.pending;
                  const StIcon = st.icon;
                  return (
                    <tr key={item.id} className="border-b border-slate-800 hover:bg-slate-800/50 transition-colors">
                      <td className="p-3">
                        <BulkCheckbox checked={isSelected(item.id)} onChange={() => toggle(item.id)} />
                      </td>
                      <td className="p-3 font-mono text-blue-400 font-medium">{item.measurement_number}</td>
                      <td className="p-3">{item.project_name}</td>
                      <td className="p-3 text-muted-foreground">{item.customer_name}</td>
                      <td className="p-3">
                        <Badge variant="outline" className="text-xs">{CATEGORY_MAP[item.category] || item.category}</Badge>
                      </td>
                      <td className="p-3 text-xs">{item.floor && `ק' ${item.floor}`}{item.room && ` / ${item.room}`}</td>
                      <td className="p-3 text-xs">{item.opening_type}</td>
                      <td className="p-3 font-mono text-xs text-left">{item.width_mm}x{item.height_mm}{item.depth_mm ? `x${item.depth_mm}` : ''}</td>
                      <td className="p-3 text-xs">{item.measured_by}</td>
                      <td className="p-3 font-mono text-xs">{item.measurement_date?.split('T')[0]}</td>
                      <td className="p-3">
                        <Badge variant="outline" className={`text-xs ${st.color}`}><StIcon className="w-3 h-3 ml-1" />{st.label}</Badge>
                      </td>
                      <td className="p-3">
                        <Badge variant="outline" className={`text-xs ${ap.color}`}>{ap.label}</Badge>
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex gap-1 justify-center">
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => { setSelectedItem(item); setDetailTab("details"); }}><Eye className="w-3 h-3" /></Button>
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => openEdit(item)}>עריכה</Button>
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-red-400" onClick={() => remove(item.id)}>מחיקה</Button>
                        </div>
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
