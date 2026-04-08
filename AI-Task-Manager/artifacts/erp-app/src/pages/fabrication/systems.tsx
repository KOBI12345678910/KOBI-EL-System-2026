import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { authFetch } from "@/lib/utils";
import { Search, Plus, Edit2, Trash2, X, Save, Grid3X3, Filter, Shield, Wind, Droplets } from "lucide-react";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import AttachmentsSection from "@/components/attachments-section";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL");

const SYSTEM_TYPES = ["window", "door", "curtain_wall", "sliding", "folding", "railing", "partition", "skylight", "louver"];

export default function FabricationSystemsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [detail, setDetail] = useState<any>(null);
  const [detailTab, setDetailTab] = useState("details");

  const { data: rawSystems } = useQuery({ queryKey: ["/api/fabrication-systems"], queryFn: () => authFetch(`${API}/fabrication-systems`).then(r => r.json()) });
  const { data: stats } = useQuery({ queryKey: ["/api/fabrication-systems/stats"], queryFn: () => authFetch(`${API}/fabrication-systems/stats`).then(r => r.json()) });

  const systems = useMemo(() => safeArray(rawSystems), [rawSystems]);
  const filtered = useMemo(() => systems.filter((s: any) => {
    const q = search.toLowerCase();
    return !q || s.system_name?.toLowerCase().includes(q) || s.system_number?.toLowerCase().includes(q) || s.manufacturer?.toLowerCase().includes(q);
  }), [systems, search]);

  const saveMut = useMutation({
    mutationFn: (data: any) => {
      const method = data.id ? "PUT" : "POST";
      const url = data.id ? `${API}/fabrication-systems/${data.id}` : `${API}/fabrication-systems`;
      return authFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).then(r => r.json());
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/fabrication-systems"] }); qc.invalidateQueries({ queryKey: ["/api/fabrication-systems/stats"] }); setShowForm(false); },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => authFetch(`${API}/fabrication-systems/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/fabrication-systems"] }); qc.invalidateQueries({ queryKey: ["/api/fabrication-systems/stats"] }); },
  });

  const [form, setForm] = useState<any>({});
  const openNew = () => { setForm({ systemType: "window", material: "aluminum" }); setShowForm(true); };
  const openEdit = (s: any) => { setForm({ id: s.id, systemNumber: s.system_number, systemName: s.system_name, systemType: s.system_type, manufacturer: s.manufacturer, material: s.material, description: s.description, maxWidthMm: s.max_width_mm, maxHeightMm: s.max_height_mm, thermalBreak: s.thermal_break, costPerSqm: s.cost_per_sqm, status: s.status, notes: s.notes }); setShowForm(true); };

  const typeLabels: Record<string, string> = { window: "חלון", door: "דלת", curtain_wall: "קיר מסך", sliding: "הזזה", folding: "מתקפל", railing: "מעקה", partition: "מחיצה", skylight: "סקיילייט", louver: "תריס" };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 text-foreground p-6" dir="rtl">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-l from-indigo-400 to-purple-300 bg-clip-text text-transparent">{"מערכות"}</h1>
            <p className="text-muted-foreground mt-1">{"ניהול מערכות חלונות, דלתות, קירות מסך ומעקות"}</p>
          </div>
          <button onClick={openNew} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 px-4 py-2 rounded-lg"><Plus className="w-4 h-4" /><span>{"מערכת חדשה"}</span></button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[
            { label: "סה\"כ מערכות", value: stats?.total || 0, icon: Grid3X3, color: "indigo" },
            { label: "פעילות", value: stats?.active || 0, icon: Shield, color: "green" },
            { label: "סוגים", value: stats?.type_count || 0, icon: Wind, color: "cyan" },
            { label: "יצרנים", value: stats?.manufacturer_count || 0, icon: Droplets, color: "orange" },
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

        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={"חיפוש מערכת..."} className="w-full bg-muted/50 border border-border rounded-lg pr-10 pl-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500" />
        </div>

        <div className="bg-muted/30 border border-border/50 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="bg-muted/60 text-muted-foreground border-b border-border">
              <th className="p-3 text-right">{"מספר"}</th>
              <th className="p-3 text-right">{"שם מערכת"}</th>
              <th className="p-3 text-right">{"סוג"}</th>
              <th className="p-3 text-right">{"יצרן"}</th>
              <th className="p-3 text-right">{"חומר"}</th>
              <th className="p-3 text-right">{"חיתוך תרמי"}</th>
              <th className="p-3 text-right">{"מחיר/מ\"ר"}</th>
              <th className="p-3 text-right">{"סטטוס"}</th>
              <th className="p-3 text-right">{"פעולות"}</th>
            </tr></thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">{"לא נמצאו מערכות"}</td></tr>
              ) : filtered.map((s: any) => (
                <tr key={s.id} className="border-b border-border/30 hover:bg-muted/20 cursor-pointer" onClick={() => { setDetail(s); setDetailTab("details"); }}>
                  <td className="p-3 font-mono text-indigo-400">{s.system_number}</td>
                  <td className="p-3 font-medium">{s.system_name}</td>
                  <td className="p-3">{typeLabels[s.system_type] || s.system_type}</td>
                  <td className="p-3">{s.manufacturer || "—"}</td>
                  <td className="p-3">{s.material}</td>
                  <td className="p-3">{s.thermal_break ? <span className="text-green-400">{"✓"}</span> : "—"}</td>
                  <td className="p-3">{s.cost_per_sqm ? `₪${fmt(s.cost_per_sqm)}` : "—"}</td>
                  <td className="p-3"><span className={`px-2 py-0.5 rounded-full text-xs ${s.status === 'active' ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}`}>{s.status === 'active' ? 'פעיל' : s.status}</span></td>
                  <td className="p-3 flex gap-1" onClick={e => e.stopPropagation()}>
                    <button onClick={() => openEdit(s)} className="p-1 hover:bg-muted rounded"><Edit2 className="w-4 h-4" /></button>
                    <button onClick={() => { if (confirm("למחוק?")) deleteMut.mutate(s.id); }} className="p-1 hover:bg-red-600/30 rounded text-red-400"><Trash2 className="w-4 h-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {showForm && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
            <div className="bg-background border border-border rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold">{editing ? "עריכת מערכת" : "מערכת חדשה"}</h2>
                <button onClick={() => setShowForm(false)}><X className="w-5 h-5" /></button>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { key: "systemNumber", label: "מספר מערכת" }, { key: "systemName", label: "שם מערכת" },
                  { key: "systemType", label: "סוג", type: "select", options: SYSTEM_TYPES },
                  { key: "manufacturer", label: "יצרן" }, { key: "material", label: "חומר" },
                  { key: "maxWidthMm", label: "רוחב מקסימום (mm)", type: "number" },
                  { key: "maxHeightMm", label: "גובה מקסימום (mm)", type: "number" },
                  { key: "costPerSqm", label: "מחיר/מ\"ר (₪)", type: "number" },
                  { key: "thermalBreak", label: "חיתוך תרמי", type: "checkbox" },
                  { key: "status", label: "סטטוס", type: "select", options: ["active", "inactive"] },
                ].map(f => (
                  <div key={f.key}>
                    <label className="block text-sm text-muted-foreground mb-1">{f.label}</label>
                    {f.type === "select" ? (
                      <select value={form[f.key] || ""} onChange={e => setForm({ ...form, [f.key]: e.target.value })} className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm">
                        {f.options?.map(o => <option key={o} value={o}>{typeLabels[o] || o}</option>)}
                      </select>
                    ) : f.type === "checkbox" ? (
                      <input type="checkbox" checked={form[f.key] || false} onChange={e => setForm({ ...form, [f.key]: e.target.checked })} />
                    ) : (
                      <input type={f.type || "text"} value={form[f.key] || ""} onChange={e => setForm({ ...form, [f.key]: e.target.value })} className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm" />
                    )}
                  </div>
                ))}
                <div className="col-span-2">
                  <label className="block text-sm text-muted-foreground mb-1">{"תיאור"}</label>
                  <textarea value={form.description || ""} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => saveMut.mutate(form)} disabled={saveMut.isPending} className="flex-1 bg-indigo-600 hover:bg-indigo-500 px-4 py-2 rounded-lg flex items-center justify-center gap-2"><Save className="w-4 h-4" />{saveMut.isPending ? "שומר..." : "שמור"}</button>
                <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-muted rounded-lg">{"ביטול"}</button>
              </div>
            </div>
          </div>
        )}

        {detail && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setDetail(null)}>
            <div className="bg-background border border-border rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold">{detail.system_name}</h2>
                <button onClick={() => setDetail(null)}><X className="w-5 h-5" /></button>
              </div>
              <div className="flex gap-2 mb-4 border-b border-border">
                {["details", "related", "attachments", "history"].map(tab => (
                  <button key={tab} onClick={() => setDetailTab(tab)} className={`px-4 py-2 text-sm ${detailTab === tab ? "text-indigo-400 border-b-2 border-indigo-400" : "text-muted-foreground hover:text-foreground"}`}>
                    {tab === "details" ? "פרטים" : tab === "related" ? "רשומות קשורות" : tab === "attachments" ? "מסמכים" : "היסטוריה"}
                  </button>
                ))}
              </div>
              {detailTab === "details" && (
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {[["סוג", typeLabels[detail.system_type] || detail.system_type], ["יצרן", detail.manufacturer], ["חומר", detail.material], ["חיתוך תרמי", detail.thermal_break ? "כן" : "לא"], ["רוחב מקס.", detail.max_width_mm ? `${fmt(detail.max_width_mm)} mm` : null], ["גובה מקס.", detail.max_height_mm ? `${fmt(detail.max_height_mm)} mm` : null], ["מחיר/מ\"ר", detail.cost_per_sqm ? `₪${fmt(detail.cost_per_sqm)}` : null], ["דירוג אקוסטי", detail.acoustic_rating], ["דירוג אש", detail.fire_rating]].map(([l, v], i) => (
                    <div key={i}><span className="text-muted-foreground">{l}: </span><span>{v || "—"}</span></div>
                  ))}
                </div>
              )}
              {detailTab === "related" && <RelatedRecords entityType="fabrication_system" entityId={detail.id} />}
              {detailTab === "attachments" && <AttachmentsSection entityType="fabrication_system" entityId={detail.id} />}
              {detailTab === "history" && <ActivityLog entityType="fabrication_system" entityId={detail.id} />}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
