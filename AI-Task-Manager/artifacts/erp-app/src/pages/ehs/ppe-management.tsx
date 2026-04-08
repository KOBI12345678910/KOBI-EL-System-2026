import { useState, useMemo, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { authFetch } from "@/lib/utils";
import {
  HardHat, Plus, Search, X, Save, Eye, Edit2, Trash2,
  ChevronRight, ChevronLeft, Loader2, AlertTriangle, CheckCircle2,
  Package, Users, RefreshCw, Calendar, Download
} from "lucide-react";

const API = "/api";

const PPE_TYPES = ["קסדה", "כפפות", "משקפי מגן", "רתמה / חגורת בטיחות", "נעלי בטיחות", "אטמי אוזניים", "מגן פנים", "ווסט רפלקטיבי", "מסיכה / מגן נשימה", "בגדי מגן", "אחר"];
const CATEGORIES = ["ראש", "ידיים", "עיניים", "נשימה", "שמיעה", "גוף", "רגליים", "גובה", "כללי"];
const CONDITION_OPTIONS = [
  { val: "good", label: "טוב", color: "text-green-400" },
  { val: "fair", label: "סביר", color: "text-yellow-400" },
  { val: "poor", label: "גרוע", color: "text-red-400" },
];

const STATUS_COLORS: Record<string, string> = {
  "issued": "bg-blue-500/20 text-blue-300",
  "returned": "bg-green-500/20 text-green-300",
  "lost": "bg-red-500/20 text-red-300",
  "damaged": "bg-orange-500/20 text-orange-300",
  "expired": "bg-purple-500/20 text-purple-300",
};

const STATUS_LABELS: Record<string, string> = {
  "issued": "מחולק",
  "returned": "הוחזר",
  "lost": "אבד",
  "damaged": "פגום",
  "expired": "פג תוקף",
};

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

export default function PpeManagement() {
  const [inventory, setInventory] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"assignments" | "inventory">("assignments");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [perPage] = useState(25);
  const [showInventoryForm, setShowInventoryForm] = useState(false);
  const [showAssignmentForm, setShowAssignmentForm] = useState(false);
  const [editInventoryId, setEditInventoryId] = useState<number | null>(null);
  const [editAssignmentId, setEditAssignmentId] = useState<number | null>(null);
  const [inventoryForm, setInventoryForm] = useState<any>({});
  const [assignmentForm, setAssignmentForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [invRes, assignRes] = await Promise.all([
        authFetch(`${API}/hse-ppe-inventory?limit=200`),
        authFetch(`${API}/hse-ppe-assignments?limit=500`),
      ]);
      if (invRes.ok) { const j = await invRes.json(); setInventory(Array.isArray(j) ? j : j.data || []); }
      if (assignRes.ok) { const j = await assignRes.json(); setAssignments(Array.isArray(j) ? j : j.data || []); }
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filteredAssignments = useMemo(() => {
    let d = [...assignments];
    if (search) d = d.filter(r => [r.employee_name, r.ppe_name, r.department].some(f => f?.toLowerCase().includes(search.toLowerCase())));
    if (statusFilter !== "all") d = d.filter(r => r.status === statusFilter);
    if (typeFilter !== "all") d = d.filter(r => r.ppe_type === typeFilter);
    return d;
  }, [assignments, search, statusFilter, typeFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredAssignments.length / perPage));
  const pageData = filteredAssignments.slice((page - 1) * perPage, page * perPage);

  const stats = useMemo(() => {
    const issuedAssignments = assignments.filter(a => a.status === "issued");
    const dueReplacement = assignments.filter(a => {
      if (a.status !== "issued" || !a.expected_replacement_date) return false;
      const days = daysUntil(a.expected_replacement_date);
      return days !== null && days <= 30;
    });
    const totalItems = inventory.reduce((s, i) => s + (i.quantity_in_stock || 0), 0);
    const lowStock = inventory.filter(i => (i.quantity_in_stock || 0) <= (i.minimum_stock || 5));
    return {
      inventoryTypes: inventory.length,
      totalItems,
      issued: issuedAssignments.length,
      dueReplacement: dueReplacement.length,
      lowStock: lowStock.length,
    };
  }, [inventory, assignments]);

  const saveInventory = async () => {
    setSaving(true);
    setError(null);
    try {
      const url = editInventoryId ? `${API}/hse-ppe-inventory/${editInventoryId}` : `${API}/hse-ppe-inventory`;
      const res = await authFetch(url, { method: editInventoryId ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(inventoryForm) });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "שגיאה בשמירה"); }
      setShowInventoryForm(false); setEditInventoryId(null); setInventoryForm({});
      await load();
    } catch (e: any) { setError(e.message); }
    setSaving(false);
  };

  const saveAssignment = async () => {
    setSaving(true);
    setError(null);
    try {
      const item = inventory.find(i => i.id === parseInt(assignmentForm.ppe_item_id));
      const data = { ...assignmentForm, ppe_name: item?.ppe_name || assignmentForm.ppe_name, ppe_type: item?.ppe_type || assignmentForm.ppe_type };
      const url = editAssignmentId ? `${API}/hse-ppe-assignments/${editAssignmentId}` : `${API}/hse-ppe-assignments`;
      const res = await authFetch(url, { method: editAssignmentId ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      if (!res.ok) throw new Error("שגיאה בשמירה");
      setShowAssignmentForm(false); setEditAssignmentId(null); setAssignmentForm({});
      await load();
    } catch (e: any) { setError(e.message); }
    setSaving(false);
  };

  const uniqueTypes = useMemo(() => [...new Set(assignments.map(a => a.ppe_type).filter(Boolean))], [assignments]);

  return (
    <div className="p-6 space-y-5" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <HardHat className="h-6 w-6 text-yellow-400" />
            ציוד מגן אישי — PPE
          </h1>
          <p className="text-sm text-muted-foreground mt-1">מלאי ציוד, חלוקה לעובדים ולוח החלפות</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { setInventoryForm({ quantity_in_stock: 0, minimum_stock: 5, lifecycle_months: 12, is_active: true }); setEditInventoryId(null); setShowInventoryForm(true); }} className="border-border text-gray-300 gap-1">
            <Package className="h-4 w-4" />הוסף לציוד
          </Button>
          <Button onClick={() => { setAssignmentForm({ issue_date: new Date().toISOString().slice(0,10), status: "issued", condition: "good", quantity: 1 }); setEditAssignmentId(null); setShowAssignmentForm(true); }} className="bg-yellow-600 hover:bg-yellow-700 gap-2">
            <Plus className="h-4 w-4" />חלק ציוד
          </Button>
        </div>
      </div>

      {error && <div className="bg-red-500/10 border border-red-500/30 text-red-300 p-3 rounded-lg text-sm">{error}</div>}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {[
          { l: "סוגי ציוד", v: stats.inventoryTypes, c: "text-blue-400", icon: Package },
          { l: "פריטים במלאי", v: stats.totalItems, c: "text-cyan-400", icon: Package },
          { l: "מחולק", v: stats.issued, c: "text-yellow-400", icon: Users },
          { l: "להחלפה בקרוב", v: stats.dueReplacement, c: "text-orange-400", icon: RefreshCw },
          { l: "מלאי נמוך", v: stats.lowStock, c: "text-red-400", icon: AlertTriangle },
        ].map((k, i) => (
          <Card key={i} className="bg-card/80 border-border">
            <CardContent className="p-4">
              <k.icon className={`h-4 w-4 ${k.c} mb-2`} />
              <p className={`text-xl font-bold font-mono ${k.c}`}>{loading ? "—" : k.v}</p>
              <p className="text-xs text-muted-foreground mt-1">{k.l}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {stats.dueReplacement > 0 && (
        <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-3 flex items-start gap-3">
          <RefreshCw className="h-4 w-4 text-orange-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-orange-300">החלפת ציוד קרובה</p>
            <p className="text-xs text-muted-foreground mt-1">
              {assignments.filter(a => {
                if (a.status !== "issued" || !a.expected_replacement_date) return false;
                const days = daysUntil(a.expected_replacement_date);
                return days !== null && days <= 30;
              }).slice(0, 5).map(a => {
                const days = daysUntil(a.expected_replacement_date);
                return `${a.employee_name} — ${a.ppe_name} (עוד ${days} ימים)`;
              }).join(" | ")}
            </p>
          </div>
        </div>
      )}

      {stats.lowStock > 0 && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 text-red-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-red-300">מלאי נמוך</p>
            <p className="text-xs text-muted-foreground mt-1">
              {inventory.filter(i => (i.quantity_in_stock || 0) <= (i.minimum_stock || 5)).map(i => `${i.ppe_name} (${i.quantity_in_stock})`).join(" | ")}
            </p>
          </div>
        </div>
      )}

      <div className="flex border-b border-border gap-0">
        {[{ key: "assignments", label: "חלוקות לעובדים" }, { key: "inventory", label: "מלאי ציוד" }].map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key as any)} className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === t.key ? "border-yellow-400 text-yellow-400" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "assignments" && (
        <>
          <Card className="bg-card/60 border-border">
            <CardContent className="p-3">
              <div className="flex flex-wrap gap-3">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="חיפוש..." className="pr-9 bg-input border-border text-foreground" />
                </div>
                <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} className="bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground">
                  <option value="all">כל הסטטוסים</option>
                  {Object.entries(STATUS_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1); }} className="bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground">
                  <option value="all">כל הסוגים</option>
                  {uniqueTypes.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/80 border-border">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-background/50">
                      <th className="p-3 text-right text-muted-foreground font-medium">עובד</th>
                      <th className="p-3 text-right text-muted-foreground font-medium">מחלקה</th>
                      <th className="p-3 text-right text-muted-foreground font-medium">ציוד</th>
                      <th className="p-3 text-right text-muted-foreground font-medium">סוג</th>
                      <th className="p-3 text-right text-muted-foreground font-medium">תאריך חלוקה</th>
                      <th className="p-3 text-right text-muted-foreground font-medium">להחלפה</th>
                      <th className="p-3 text-right text-muted-foreground font-medium">מצב</th>
                      <th className="p-3 text-right text-muted-foreground font-medium">סטטוס</th>
                      <th className="p-3 text-center text-muted-foreground font-medium">פעולות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      Array.from({length: 5}).map((_, i) => (
                        <tr key={i} className="border-b border-border/50">
                          <td colSpan={9} className="p-3">
                            <div className="flex gap-4 animate-pulse">{Array.from({length:6}).map((_,j)=><div key={j} className="h-4 bg-muted rounded flex-1" />)}</div>
                          </td>
                        </tr>
                      ))
                    ) : pageData.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="p-16 text-center">
                          <HardHat className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                          <p className="text-muted-foreground">אין חלוקות ציוד</p>
                          <Button onClick={() => { setAssignmentForm({ issue_date: new Date().toISOString().slice(0,10), status: "issued", condition: "good", quantity: 1 }); setEditAssignmentId(null); setShowAssignmentForm(true); }} className="mt-3 bg-yellow-600 hover:bg-yellow-700 gap-2">
                            <Plus className="h-4 w-4" />חלוקה ראשונה
                          </Button>
                        </td>
                      </tr>
                    ) : pageData.map(row => {
                      const replaceDays = daysUntil(row.expected_replacement_date);
                      const cond = CONDITION_OPTIONS.find(c => c.val === row.condition);
                      return (
                        <tr key={row.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                          <td className="p-3 text-foreground font-medium">{row.employee_name}</td>
                          <td className="p-3 text-muted-foreground">{row.department || "—"}</td>
                          <td className="p-3 text-foreground">{row.ppe_name || "—"}</td>
                          <td className="p-3 text-muted-foreground text-xs">{row.ppe_type || "—"}</td>
                          <td className="p-3 text-muted-foreground text-xs">{row.issue_date?.slice(0,10) || "—"}</td>
                          <td className="p-3 text-center">
                            {replaceDays !== null ? (
                              <span className={`font-mono text-xs ${replaceDays < 0 ? "text-red-400" : replaceDays <= 30 ? "text-orange-400" : "text-muted-foreground"}`}>
                                {replaceDays < 0 ? "באיחור" : `${replaceDays} ימים`}
                              </span>
                            ) : "—"}
                          </td>
                          <td className="p-3">
                            <span className={`text-xs ${cond?.color || "text-muted-foreground"}`}>{cond?.label || row.condition || "—"}</span>
                          </td>
                          <td className="p-3">
                            <Badge className={STATUS_COLORS[row.status] || "bg-gray-500/20 text-gray-300"}>
                              {STATUS_LABELS[row.status] || row.status}
                            </Badge>
                          </td>
                          <td className="p-3 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => { setAssignmentForm({...row}); setEditAssignmentId(row.id); setShowAssignmentForm(true); }}>
                                <Edit2 className="h-3.5 w-3.5 text-blue-400" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={async () => { await authFetch(`${API}/hse-ppe-assignments/${row.id}`, { method: "DELETE" }); await load(); }}>
                                <Trash2 className="h-3.5 w-3.5 text-red-400" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between p-3 border-t border-border">
                <span className="text-sm text-muted-foreground">מציג {Math.min(filteredAssignments.length,(page-1)*perPage+1)}-{Math.min(filteredAssignments.length,page*perPage)} מתוך {filteredAssignments.length}</span>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" disabled={page<=1} onClick={() => setPage(p=>p-1)} className="h-8 w-8 p-0"><ChevronRight className="h-4 w-4" /></Button>
                  <span className="px-2 py-1 text-sm text-muted-foreground">{page}/{totalPages}</span>
                  <Button variant="ghost" size="sm" disabled={page>=totalPages} onClick={() => setPage(p=>p+1)} className="h-8 w-8 p-0"><ChevronLeft className="h-4 w-4" /></Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {activeTab === "inventory" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {loading ? (
            Array.from({length: 6}).map((_, i) => (
              <Card key={i} className="bg-card/80 border-border">
                <CardContent className="p-4">
                  <div className="animate-pulse space-y-2">
                    <div className="h-4 bg-muted rounded w-3/4" />
                    <div className="h-3 bg-muted rounded w-1/2" />
                    <div className="h-6 bg-muted rounded mt-4" />
                  </div>
                </CardContent>
              </Card>
            ))
          ) : inventory.length === 0 ? (
            <div className="col-span-3 text-center py-12 text-muted-foreground">
              <Package className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>אין פריטי ציוד במלאי</p>
              <Button onClick={() => { setInventoryForm({ quantity_in_stock: 0, minimum_stock: 5, lifecycle_months: 12, is_active: true }); setEditInventoryId(null); setShowInventoryForm(true); }} className="mt-3 bg-yellow-600 hover:bg-yellow-700 gap-2">
                <Plus className="h-4 w-4" />הוסף ציוד ראשון
              </Button>
            </div>
          ) : inventory.map(item => {
            const assignedCount = assignments.filter(a => a.ppe_item_id === item.id && a.status === "issued").length;
            const isLowStock = (item.quantity_in_stock || 0) <= (item.minimum_stock || 5);
            return (
              <Card key={item.id} className={`bg-card/80 border-border ${isLowStock ? "border-red-500/30" : ""}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-foreground font-medium">{item.ppe_name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{item.ppe_type} • {item.category}</p>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => { setInventoryForm({...item}); setEditInventoryId(item.id); setShowInventoryForm(true); }}>
                        <Edit2 className="h-3 w-3 text-blue-400" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={async () => { await authFetch(`${API}/hse-ppe-inventory/${item.id}`, { method: "DELETE" }); await load(); }}>
                        <Trash2 className="h-3 w-3 text-red-400" />
                      </Button>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                    <div className="text-center">
                      <p className="text-muted-foreground">במלאי</p>
                      <p className={`font-bold ${isLowStock ? "text-red-400" : "text-foreground"}`}>{item.quantity_in_stock}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-muted-foreground">מחולק</p>
                      <p className="text-blue-400 font-bold">{assignedCount}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-muted-foreground">מינימום</p>
                      <p className="text-muted-foreground">{item.minimum_stock}</p>
                    </div>
                  </div>
                  {item.manufacturer && <p className="text-xs text-muted-foreground mt-2 border-t border-border pt-2">יצרן: {item.manufacturer} {item.model ? `| דגם: ${item.model}` : ""}</p>}
                  <div className="flex items-center gap-2 mt-2">
                    <RefreshCw className="h-3 w-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">החלפה כל {item.lifecycle_months} חודשים</span>
                  </div>
                  {isLowStock && <Badge className="mt-2 bg-red-500/20 text-red-300 text-[10px]">מלאי נמוך — יש להזמין</Badge>}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {showInventoryForm && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => { setShowInventoryForm(false); setEditInventoryId(null); }}>
          <div className="bg-card border border-border rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="text-lg font-bold text-foreground">{editInventoryId ? "עריכת פריט ציוד" : "פריט ציוד חדש"}</h2>
              <Button variant="ghost" size="sm" onClick={() => { setShowInventoryForm(false); setEditInventoryId(null); }}><X className="h-4 w-4" /></Button>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label className="text-xs text-muted-foreground">שם הציוד *</Label>
                  <select value={inventoryForm.ppe_name || ""} onChange={e => setInventoryForm({...inventoryForm, ppe_name: e.target.value})} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1">
                    <option value="">בחר...</option>
                    {PPE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <Input value={inventoryForm.ppe_name || ""} onChange={e => setInventoryForm({...inventoryForm, ppe_name: e.target.value})} placeholder="או הקלד שם..." className="bg-input border-border text-foreground mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">סוג</Label>
                  <select value={inventoryForm.ppe_type || ""} onChange={e => setInventoryForm({...inventoryForm, ppe_type: e.target.value})} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1">
                    <option value="">בחר...</option>
                    {PPE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">קטגוריה</Label>
                  <select value={inventoryForm.category || ""} onChange={e => setInventoryForm({...inventoryForm, category: e.target.value})} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1">
                    <option value="">בחר...</option>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">יצרן</Label>
                  <Input value={inventoryForm.manufacturer || ""} onChange={e => setInventoryForm({...inventoryForm, manufacturer: e.target.value})} placeholder="יצרן" className="bg-input border-border text-foreground mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">דגם</Label>
                  <Input value={inventoryForm.model || ""} onChange={e => setInventoryForm({...inventoryForm, model: e.target.value})} placeholder="מספר דגם" className="bg-input border-border text-foreground mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">תקן</Label>
                  <Input value={inventoryForm.standard || ""} onChange={e => setInventoryForm({...inventoryForm, standard: e.target.value})} placeholder="EN 397, ISO..." className="bg-input border-border text-foreground mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">כמות במלאי</Label>
                  <Input type="number" value={inventoryForm.quantity_in_stock ?? 0} onChange={e => setInventoryForm({...inventoryForm, quantity_in_stock: parseInt(e.target.value)})} className="bg-input border-border text-foreground mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">מינימום מלאי</Label>
                  <Input type="number" value={inventoryForm.minimum_stock ?? 5} onChange={e => setInventoryForm({...inventoryForm, minimum_stock: parseInt(e.target.value)})} className="bg-input border-border text-foreground mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">עלות יחידה (₪)</Label>
                  <Input type="number" step="0.01" value={inventoryForm.unit_cost ?? 0} onChange={e => setInventoryForm({...inventoryForm, unit_cost: parseFloat(e.target.value)})} className="bg-input border-border text-foreground mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">מחזור חיים (חודשים)</Label>
                  <Input type="number" value={inventoryForm.lifecycle_months ?? 12} onChange={e => setInventoryForm({...inventoryForm, lifecycle_months: parseInt(e.target.value)})} className="bg-input border-border text-foreground mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">ספק</Label>
                  <Input value={inventoryForm.supplier || ""} onChange={e => setInventoryForm({...inventoryForm, supplier: e.target.value})} placeholder="שם הספק" className="bg-input border-border text-foreground mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">מיקום אחסון</Label>
                  <Input value={inventoryForm.storage_location || ""} onChange={e => setInventoryForm({...inventoryForm, storage_location: e.target.value})} placeholder="מחסן, ארון A..." className="bg-input border-border text-foreground mt-1" />
                </div>
                <div className="flex items-center gap-3">
                  <input type="checkbox" checked={inventoryForm.is_active ?? true} onChange={e => setInventoryForm({...inventoryForm, is_active: e.target.checked})} className="rounded" />
                  <Label className="text-sm text-foreground">פעיל</Label>
                </div>
              </div>
            </div>
            <div className="flex gap-2 p-4 border-t border-border justify-end">
              <Button variant="outline" onClick={() => { setShowInventoryForm(false); setEditInventoryId(null); }} className="border-border">ביטול</Button>
              <Button onClick={saveInventory} disabled={saving} className="bg-yellow-600 hover:bg-yellow-700 gap-1">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {editInventoryId ? "עדכן" : "שמור"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {showAssignmentForm && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => { setShowAssignmentForm(false); setEditAssignmentId(null); }}>
          <div className="bg-card border border-border rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="text-lg font-bold text-foreground">{editAssignmentId ? "עריכת חלוקה" : "חלוקת ציוד חדשה"}</h2>
              <Button variant="ghost" size="sm" onClick={() => { setShowAssignmentForm(false); setEditAssignmentId(null); }}><X className="h-4 w-4" /></Button>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground">שם עובד *</Label>
                  <Input value={assignmentForm.employee_name || ""} onChange={e => setAssignmentForm({...assignmentForm, employee_name: e.target.value})} placeholder="שם מלא" className="bg-input border-border text-foreground mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">מחלקה</Label>
                  <Input value={assignmentForm.department || ""} onChange={e => setAssignmentForm({...assignmentForm, department: e.target.value})} placeholder="מחלקה" className="bg-input border-border text-foreground mt-1" />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs text-muted-foreground">פריט ציוד</Label>
                  <select value={assignmentForm.ppe_item_id || ""} onChange={e => {
                    const item = inventory.find(i => i.id === parseInt(e.target.value));
                    setAssignmentForm({...assignmentForm, ppe_item_id: parseInt(e.target.value), ppe_name: item?.ppe_name || "", ppe_type: item?.ppe_type || ""});
                  }} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1">
                    <option value="">בחר ציוד...</option>
                    {inventory.map(i => <option key={i.id} value={i.id}>{i.ppe_name} ({i.quantity_in_stock} במלאי)</option>)}
                  </select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">שם ציוד (ידני)</Label>
                  <Input value={assignmentForm.ppe_name || ""} onChange={e => setAssignmentForm({...assignmentForm, ppe_name: e.target.value})} placeholder="שם ציוד" className="bg-input border-border text-foreground mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">כמות</Label>
                  <Input type="number" value={assignmentForm.quantity ?? 1} onChange={e => setAssignmentForm({...assignmentForm, quantity: parseInt(e.target.value)})} className="bg-input border-border text-foreground mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">תאריך חלוקה</Label>
                  <Input type="date" value={assignmentForm.issue_date || ""} onChange={e => setAssignmentForm({...assignmentForm, issue_date: e.target.value})} className="bg-input border-border text-foreground mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">תאריך החלפה צפויה</Label>
                  <Input type="date" value={assignmentForm.expected_replacement_date || ""} onChange={e => setAssignmentForm({...assignmentForm, expected_replacement_date: e.target.value})} className="bg-input border-border text-foreground mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">מצב</Label>
                  <select value={assignmentForm.condition || "good"} onChange={e => setAssignmentForm({...assignmentForm, condition: e.target.value})} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1">
                    {CONDITION_OPTIONS.map(c => <option key={c.val} value={c.val}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">סטטוס</Label>
                  <select value={assignmentForm.status || "issued"} onChange={e => setAssignmentForm({...assignmentForm, status: e.target.value})} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1">
                    {Object.entries(STATUS_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">מספר סידורי</Label>
                  <Input value={assignmentForm.serial_number || ""} onChange={e => setAssignmentForm({...assignmentForm, serial_number: e.target.value})} placeholder="מספר סידורי" className="bg-input border-border text-foreground mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">חולק ע"י</Label>
                  <Input value={assignmentForm.issued_by || ""} onChange={e => setAssignmentForm({...assignmentForm, issued_by: e.target.value})} placeholder="שם המחלק" className="bg-input border-border text-foreground mt-1" />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs text-muted-foreground">הערות</Label>
                  <textarea value={assignmentForm.notes || ""} onChange={e => setAssignmentForm({...assignmentForm, notes: e.target.value})} rows={2} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1 resize-none" placeholder="הערות..." />
                </div>
              </div>
            </div>
            <div className="flex gap-2 p-4 border-t border-border justify-end">
              <Button variant="outline" onClick={() => { setShowAssignmentForm(false); setEditAssignmentId(null); }} className="border-border">ביטול</Button>
              <Button onClick={saveAssignment} disabled={saving} className="bg-yellow-600 hover:bg-yellow-700 gap-1">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {editAssignmentId ? "עדכן" : "שמור"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
