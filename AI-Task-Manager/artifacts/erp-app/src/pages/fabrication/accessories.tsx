import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { authFetch } from "@/lib/utils";
import { Search, Plus, Edit2, Trash2, X, Save, Wrench, Package, AlertTriangle, Lock } from "lucide-react";
import ActivityLog from "@/components/activity-log";
import AttachmentsSection from "@/components/attachments-section";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL");

const CATEGORIES = ["handle", "hinge", "lock", "seal", "gasket", "screw", "anchor", "roller", "bracket", "corner_key", "drainage", "glazing_bead", "threshold", "other"];
const catLabels: Record<string, string> = { handle: "ידית", hinge: "ציר", lock: "מנעול", seal: "אטם", gasket: "גומיה", screw: "בורג", anchor: "עוגן", roller: "גלגלת", bracket: "תפס", corner_key: "מפתח פינה", drainage: "ניקוז", glazing_bead: "חרוז זיגוג", threshold: "סף", other: "אחר" };

export default function AccessoriesHardwarePage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [filterCat, setFilterCat] = useState("");
  const [form, setForm] = useState<any>({});
  const [detail, setDetail] = useState<any>(null);
  const [detailTab, setDetailTab] = useState("details");

  const { data: rawItems } = useQuery({ queryKey: ["/api/accessories-hardware"], queryFn: () => authFetch(`${API}/accessories-hardware`).then(r => r.json()) });
  const { data: stats } = useQuery({ queryKey: ["/api/accessories-hardware/stats"], queryFn: () => authFetch(`${API}/accessories-hardware/stats`).then(r => r.json()) });

  const items = useMemo(() => safeArray(rawItems), [rawItems]);
  const filtered = useMemo(() => items.filter((i: any) => {
    const q = search.toLowerCase();
    const matchSearch = !q || i.part_name?.toLowerCase().includes(q) || i.part_number?.toLowerCase().includes(q) || i.part_name_he?.includes(q);
    return matchSearch && (!filterCat || i.category === filterCat);
  }), [items, search, filterCat]);

  const saveMut = useMutation({
    mutationFn: (data: any) => authFetch(data.id ? `${API}/accessories-hardware/${data.id}` : `${API}/accessories-hardware`, { method: data.id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/accessories-hardware"] }); qc.invalidateQueries({ queryKey: ["/api/accessories-hardware/stats"] }); setShowForm(false); },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => authFetch(`${API}/accessories-hardware/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/accessories-hardware"] }); qc.invalidateQueries({ queryKey: ["/api/accessories-hardware/stats"] }); },
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 text-foreground p-6" dir="rtl">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-l from-rose-400 to-pink-300 bg-clip-text text-transparent">{"אביזרים ופרזול"}</h1>
            <p className="text-muted-foreground mt-1">{"ידיות, צירים, מנעולים, אטמים, ברגים ועוגנים"}</p>
          </div>
          <button onClick={() => { setForm({ category: "handle" }); setShowForm(true); }} className="flex items-center gap-2 bg-rose-600 hover:bg-rose-500 px-4 py-2 rounded-lg"><Plus className="w-4 h-4" /><span>{"פריט חדש"}</span></button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {[
            { label: "סה\"כ פריטים", value: stats?.total || 0, icon: Wrench, color: "rose" },
            { label: "פעילים", value: stats?.active || 0, icon: Package, color: "green" },
            { label: "קטגוריות", value: stats?.category_count || 0, icon: Lock, color: "purple" },
            { label: "מותגים", value: stats?.brand_count || 0, icon: Package, color: "blue" },
            { label: "מלאי נמוך", value: stats?.low_stock || 0, icon: AlertTriangle, color: "red" },
          ].map((kpi, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
              className="bg-muted/50 border border-border/50 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div><p className="text-muted-foreground text-sm">{kpi.label}</p><p className="text-2xl font-bold mt-1">{kpi.value}</p></div>
                <kpi.icon className={`w-8 h-8 text-${kpi.color}-400 opacity-60`} />
              </div>
            </motion.div>
          ))}
        </div>

        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder={"חיפוש פרזול..."} className="w-full bg-muted/50 border border-border rounded-lg pr-10 pl-4 py-2 text-sm" />
          </div>
          <select value={filterCat} onChange={e => setFilterCat(e.target.value)} className="bg-muted/50 border border-border rounded-lg px-3 py-2 text-sm">
            <option value="">{"כל הקטגוריות"}</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{catLabels[c] || c}</option>)}
          </select>
        </div>

        <div className="bg-muted/30 border border-border/50 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="bg-muted/60 text-muted-foreground border-b border-border">
              <th className="p-3 text-right">{"מק\"ט"}</th><th className="p-3 text-right">{"שם"}</th>
              <th className="p-3 text-right">{"קטגוריה"}</th><th className="p-3 text-right">{"מותג"}</th>
              <th className="p-3 text-right">{"מלאי"}</th><th className="p-3 text-right">{"מחיר"}</th>
              <th className="p-3 text-right">{"סטטוס"}</th><th className="p-3 text-right">{"פעולות"}</th>
            </tr></thead>
            <tbody>
              {filtered.length === 0 ? <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">{"לא נמצאו פריטים"}</td></tr> :
                filtered.map((i: any) => (
                  <tr key={i.id} className="border-b border-border/30 hover:bg-muted/20 cursor-pointer" onClick={() => { setDetail(i); setDetailTab("details"); }}>
                    <td className="p-3 font-mono text-rose-400">{i.part_number}</td>
                    <td className="p-3 font-medium">{i.part_name_he || i.part_name}</td>
                    <td className="p-3">{catLabels[i.category] || i.category}</td>
                    <td className="p-3">{i.brand || "—"}</td>
                    <td className="p-3">{fmt(i.current_stock)}</td>
                    <td className="p-3">{i.cost_per_unit ? `₪${fmt(i.cost_per_unit)}` : "—"}</td>
                    <td className="p-3"><span className={`px-2 py-0.5 rounded-full text-xs ${i.status === 'active' ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}`}>{i.status === 'active' ? 'פעיל' : i.status}</span></td>
                    <td className="p-3 flex gap-1" onClick={e => e.stopPropagation()}>
                      <button onClick={() => { setForm({ id: i.id, partName: i.part_name, category: i.category, costPerUnit: i.cost_per_unit, currentStock: i.current_stock, status: i.status, notes: i.notes }); setShowForm(true); }} className="p-1 hover:bg-muted rounded"><Edit2 className="w-4 h-4" /></button>
                      <button onClick={() => { if (confirm("למחוק?")) deleteMut.mutate(i.id); }} className="p-1 hover:bg-red-600/30 rounded text-red-400"><Trash2 className="w-4 h-4" /></button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        {showForm && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
            <div className="bg-background border border-border rounded-2xl w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold">{form.id ? "עריכת פריט" : "פריט חדש"}</h2>
                <button onClick={() => setShowForm(false)}><X className="w-5 h-5" /></button>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {[{ key: "partNumber", label: "מק\"ט" }, { key: "partName", label: "שם (EN)" }, { key: "partNameHe", label: "שם (HE)" }, { key: "category", label: "קטגוריה", type: "select", options: CATEGORIES }, { key: "brand", label: "מותג" }, { key: "costPerUnit", label: "מחיר", type: "number" }, { key: "currentStock", label: "מלאי", type: "number" }, { key: "minimumStock", label: "מלאי מינימום", type: "number" }, { key: "status", label: "סטטוס", type: "select", options: ["active", "inactive"] }].map(f => (
                  <div key={f.key}><label className="block text-sm text-muted-foreground mb-1">{f.label}</label>
                    {f.type === "select" ? <select value={form[f.key] || ""} onChange={e => setForm({ ...form, [f.key]: e.target.value })} className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm">{f.options?.map(o => <option key={o} value={o}>{catLabels[o] || o}</option>)}</select>
                      : <input type={f.type || "text"} value={form[f.key] || ""} onChange={e => setForm({ ...form, [f.key]: e.target.value })} className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm" />}
                  </div>
                ))}
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => saveMut.mutate(form)} className="flex-1 bg-rose-600 hover:bg-rose-500 px-4 py-2 rounded-lg flex items-center justify-center gap-2"><Save className="w-4 h-4" />{"שמור"}</button>
                <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-muted rounded-lg">{"ביטול"}</button>
              </div>
            </div>
          </div>
        )}

        {detail && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setDetail(null)}>
            <div className="bg-background border border-border rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold">{detail.part_name_he || detail.part_name}</h2>
                <button onClick={() => setDetail(null)}><X className="w-5 h-5" /></button>
              </div>
              <div className="flex gap-2 mb-4 border-b border-border">
                {["details", "attachments", "history"].map(tab => (
                  <button key={tab} onClick={() => setDetailTab(tab)} className={`px-4 py-2 text-sm ${detailTab === tab ? "text-rose-400 border-b-2 border-rose-400" : "text-muted-foreground"}`}>
                    {tab === "details" ? "פרטים" : tab === "attachments" ? "מסמכים" : "היסטוריה"}
                  </button>
                ))}
              </div>
              {detailTab === "details" && (
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {[["מק\"ט", detail.part_number], ["קטגוריה", catLabels[detail.category] || detail.category], ["מותג", detail.brand], ["דגם", detail.model], ["חומר", detail.material], ["גימור", detail.finish], ["מחיר", detail.cost_per_unit ? `₪${fmt(detail.cost_per_unit)}` : null], ["מלאי", fmt(detail.current_stock)], ["בטיחות ילדים", detail.child_safe ? "כן" : "לא"], ["עמידות אש", detail.fire_rated ? "כן" : "לא"]].map(([l, v], i) => (
                    <div key={i}><span className="text-muted-foreground">{l}: </span><span>{v || "—"}</span></div>
                  ))}
                </div>
              )}
              {detailTab === "attachments" && <AttachmentsSection entityType="accessory_hardware" entityId={detail.id} />}
              {detailTab === "history" && <ActivityLog entityType="accessory_hardware" entityId={detail.id} />}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
