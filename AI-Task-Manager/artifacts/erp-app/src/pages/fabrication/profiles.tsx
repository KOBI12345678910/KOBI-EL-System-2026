import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { authFetch } from "@/lib/utils";
import { Search, Plus, Edit2, Trash2, X, Save, Layers, Filter, Ruler, Thermometer, Package } from "lucide-react";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import AttachmentsSection from "@/components/attachments-section";
import { useFormValidation, FormFieldError, RequiredMark } from "@/hooks/use-form-validation";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL");

export default function FabricationProfilesPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [detail, setDetail] = useState<any>(null);
  const [detailTab, setDetailTab] = useState("details");
  const [filterMaterial, setFilterMaterial] = useState("");

  const { data: rawProfiles } = useQuery({ queryKey: ["/api/fabrication-profiles"], queryFn: () => authFetch(`${API}/fabrication-profiles`).then(r => r.json()) });
  const { data: stats } = useQuery({ queryKey: ["/api/fabrication-profiles/stats"], queryFn: () => authFetch(`${API}/fabrication-profiles/stats`).then(r => r.json()) });

  const profiles = useMemo(() => safeArray(rawProfiles), [rawProfiles]);
  const filtered = useMemo(() => profiles.filter((p: any) => {
    const s = search.toLowerCase();
    const matchSearch = !s || p.profile_name?.toLowerCase().includes(s) || p.profile_number?.toLowerCase().includes(s) || p.series?.toLowerCase().includes(s);
    const matchMaterial = !filterMaterial || p.material === filterMaterial;
    return matchSearch && matchMaterial;
  }), [profiles, search, filterMaterial]);

  const materials = useMemo(() => [...new Set(profiles.map((p: any) => p.material).filter(Boolean))], [profiles]);
  const bulk = useBulkSelection(filtered);

  const saveMut = useMutation({
    mutationFn: (data: any) => {
      const method = data.id ? "PUT" : "POST";
      const url = data.id ? `${API}/fabrication-profiles/${data.id}` : `${API}/fabrication-profiles`;
      return authFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).then(r => r.json());
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/fabrication-profiles"] }); qc.invalidateQueries({ queryKey: ["/api/fabrication-profiles/stats"] }); setShowForm(false); setEditing(null); },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => authFetch(`${API}/fabrication-profiles/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/fabrication-profiles"] }); qc.invalidateQueries({ queryKey: ["/api/fabrication-profiles/stats"] }); },
  });

  const [form, setForm] = useState<any>({});
  const openNew = () => { setForm({ material: "aluminum", profileType: "frame", defaultFinish: "anodized" }); setEditing(null); setShowForm(true); };
  const openEdit = (p: any) => { setForm({ id: p.id, profileNumber: p.profile_number, profileName: p.profile_name, series: p.series, material: p.material, profileType: p.profile_type, alloy: p.alloy, weightPerMeter: p.weight_per_meter, wallThicknessMm: p.wall_thickness_mm, thermalBreak: p.thermal_break, costPerMeter: p.cost_per_meter, currentStockMeters: p.current_stock_meters, minimumStockMeters: p.minimum_stock_meters, defaultFinish: p.default_finish, status: p.status, notes: p.notes }); setEditing(p); setShowForm(true); };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 text-foreground p-6" dir="rtl">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-l from-blue-400 to-cyan-300 bg-clip-text text-transparent">{"פרופילים"}</h1>
            <p className="text-muted-foreground mt-1">{"ניהול פרופילי אלומיניום, ברזל ונירוסטה"}</p>
          </div>
          <button onClick={openNew} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-lg transition-colors">
            <Plus className="w-4 h-4" /><span>{"פרופיל חדש"}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[
            { label: "סה\"כ פרופילים", value: stats?.total || 0, icon: Layers, color: "blue" },
            { label: "פעילים", value: stats?.active || 0, icon: Package, color: "green" },
            { label: "סדרות", value: stats?.series_count || 0, icon: Ruler, color: "purple" },
            { label: "מלאי (מטר)", value: fmt(stats?.total_stock_meters), icon: Thermometer, color: "orange" },
          ].map((kpi, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
              className={`bg-muted/50 border border-border/50 rounded-xl p-4`}>
              <div className="flex items-center justify-between">
                <div><p className="text-muted-foreground text-sm">{kpi.label}</p><p className="text-2xl font-bold mt-1">{kpi.value}</p></div>
                <kpi.icon className={`w-8 h-8 text-${kpi.color}-400 opacity-60`} />
              </div>
            </motion.div>
          ))}
        </div>

        <div className="flex gap-3 items-center">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder={"חיפוש פרופיל..."}
              className="w-full bg-muted/50 border border-border rounded-lg pr-10 pl-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
          </div>
          <select value={filterMaterial} onChange={e => setFilterMaterial(e.target.value)}
            className="bg-muted/50 border border-border rounded-lg px-3 py-2 text-sm">
            <option value="">{"כל החומרים"}</option>
            {materials.map((m: any) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        {bulk.selected.size > 0 && <BulkActions selected={bulk.selected} items={filtered} actions={defaultBulkActions} onClear={bulk.clearAll} entityName="פרופילים" apiBase={`${API}/fabrication-profiles`} onSuccess={() => qc.invalidateQueries({ queryKey: ["/api/fabrication-profiles"] })} />}

        <div className="bg-muted/30 border border-border/50 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-muted/60 text-muted-foreground border-b border-border">
                <th className="p-3 text-right"><BulkCheckbox checked={bulk.allSelected} onChange={bulk.toggleAll} /></th>
                <th className="p-3 text-right">{"מספר"}</th>
                <th className="p-3 text-right">{"שם פרופיל"}</th>
                <th className="p-3 text-right">{"סדרה"}</th>
                <th className="p-3 text-right">{"חומר"}</th>
                <th className="p-3 text-right">{"משקל/מטר"}</th>
                <th className="p-3 text-right">{"עובי דופן"}</th>
                <th className="p-3 text-right">{"מלאי (מ')"}</th>
                <th className="p-3 text-right">{"מחיר/מטר"}</th>
                <th className="p-3 text-right">{"סטטוס"}</th>
                <th className="p-3 text-right">{"פעולות"}</th>
              </tr></thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={11} className="p-8 text-center text-muted-foreground">{"לא נמצאו פרופילים"}</td></tr>
                ) : filtered.map((p: any) => (
                  <tr key={p.id} className="border-b border-border/30 hover:bg-muted/20 cursor-pointer" onClick={() => { setDetail(p); setDetailTab("details"); }}>
                    <td className="p-3" onClick={e => e.stopPropagation()}><BulkCheckbox checked={bulk.selected.has(p.id)} onChange={() => bulk.toggle(p.id)} /></td>
                    <td className="p-3 font-mono text-blue-400">{p.profile_number}</td>
                    <td className="p-3 font-medium">{p.profile_name}</td>
                    <td className="p-3">{p.series || "—"}</td>
                    <td className="p-3"><span className={`px-2 py-0.5 rounded text-xs ${p.material === 'aluminum' ? 'bg-blue-500/20 text-blue-300' : p.material === 'steel' ? 'bg-muted/20 text-gray-300' : 'bg-purple-500/20 text-purple-300'}`}>{p.material}</span></td>
                    <td className="p-3">{p.weight_per_meter ? `${fmt(p.weight_per_meter)} kg` : "—"}</td>
                    <td className="p-3">{p.wall_thickness_mm ? `${p.wall_thickness_mm} mm` : "—"}</td>
                    <td className="p-3">{fmt(p.current_stock_meters)}</td>
                    <td className="p-3">{p.cost_per_meter ? `₪${fmt(p.cost_per_meter)}` : "—"}</td>
                    <td className="p-3"><span className={`px-2 py-0.5 rounded-full text-xs ${p.status === 'active' ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}`}>{p.status === 'active' ? 'פעיל' : p.status}</span></td>
                    <td className="p-3 flex gap-1" onClick={e => e.stopPropagation()}>
                      <button onClick={() => openEdit(p)} className="p-1 hover:bg-muted rounded"><Edit2 className="w-4 h-4" /></button>
                      <button onClick={() => { if (confirm("למחוק פרופיל?")) deleteMut.mutate(p.id); }} className="p-1 hover:bg-red-600/30 rounded text-red-400"><Trash2 className="w-4 h-4" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {showForm && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
            <div className="bg-background border border-border rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold">{editing ? "עריכת פרופיל" : "פרופיל חדש"}</h2>
                <button onClick={() => setShowForm(false)} className="p-1 hover:bg-muted rounded"><X className="w-5 h-5" /></button>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { key: "profileNumber", label: "מספר פרופיל", required: true },
                  { key: "profileName", label: "שם פרופיל", required: true },
                  { key: "series", label: "סדרה" },
                  { key: "material", label: "חומר", type: "select", options: ["aluminum", "steel", "stainless_steel", "iron"] },
                  { key: "profileType", label: "סוג", type: "select", options: ["frame", "sash", "mullion", "transom", "bead", "coupling", "threshold", "sill", "other"] },
                  { key: "alloy", label: "סגסוגת" },
                  { key: "weightPerMeter", label: "משקל/מטר (kg)", type: "number" },
                  { key: "wallThicknessMm", label: "עובי דופן (mm)", type: "number" },
                  { key: "costPerMeter", label: "מחיר/מטר (₪)", type: "number" },
                  { key: "currentStockMeters", label: "מלאי (מטרים)", type: "number" },
                  { key: "minimumStockMeters", label: "מלאי מינימום", type: "number" },
                  { key: "defaultFinish", label: "גימור ברירת מחדל", type: "select", options: ["anodized", "powder_coated", "pvdf", "raw"] },
                  { key: "thermalBreak", label: "חיתוך תרמי", type: "checkbox" },
                  { key: "status", label: "סטטוס", type: "select", options: ["active", "inactive", "discontinued"] },
                ].map(f => (
                  <div key={f.key} className={f.type === "checkbox" ? "flex items-center gap-2 col-span-1" : ""}>
                    <label className="block text-sm text-muted-foreground mb-1">{f.label}{f.required && <span className="text-red-400">*</span>}</label>
                    {f.type === "select" ? (
                      <select value={form[f.key] || ""} onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                        className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm">
                        {f.options?.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : f.type === "checkbox" ? (
                      <input type="checkbox" checked={form[f.key] || false} onChange={e => setForm({ ...form, [f.key]: e.target.checked })}
                        className="w-4 h-4 rounded border-border" />
                    ) : (
                      <input type={f.type || "text"} value={form[f.key] || ""} onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                        className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm" />
                    )}
                  </div>
                ))}
                <div className="col-span-2">
                  <label className="block text-sm text-muted-foreground mb-1">{"הערות"}</label>
                  <textarea value={form.notes || ""} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2}
                    className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => saveMut.mutate(form)} disabled={saveMut.isPending}
                  className="flex-1 bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-lg flex items-center justify-center gap-2">
                  <Save className="w-4 h-4" />{saveMut.isPending ? "שומר..." : "שמור"}
                </button>
                <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-muted hover:bg-muted rounded-lg">{"ביטול"}</button>
              </div>
            </div>
          </div>
        )}

        {detail && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setDetail(null)}>
            <div className="bg-background border border-border rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold">{detail.profile_name} <span className="text-muted-foreground font-mono text-base">({detail.profile_number})</span></h2>
                <button onClick={() => setDetail(null)} className="p-1 hover:bg-muted rounded"><X className="w-5 h-5" /></button>
              </div>
              <div className="flex gap-2 mb-4 border-b border-border">
                {["details", "related", "attachments", "history"].map(tab => (
                  <button key={tab} onClick={() => setDetailTab(tab)}
                    className={`px-4 py-2 text-sm transition-colors ${detailTab === tab ? "text-blue-400 border-b-2 border-blue-400" : "text-muted-foreground hover:text-foreground"}`}>
                    {tab === "details" ? "פרטים" : tab === "related" ? "רשומות קשורות" : tab === "attachments" ? "מסמכים" : "היסטוריה"}
                  </button>
                ))}
              </div>
              {detailTab === "details" && (
                <div className="grid grid-cols-2 gap-4 text-sm">
                  {[
                    ["חומר", detail.material], ["סדרה", detail.series], ["סוג", detail.profile_type],
                    ["סגסוגת", detail.alloy], ["משקל/מטר", detail.weight_per_meter ? `${detail.weight_per_meter} kg` : null],
                    ["עובי דופן", detail.wall_thickness_mm ? `${detail.wall_thickness_mm} mm` : null],
                    ["חיתוך תרמי", detail.thermal_break ? "כן" : "לא"],
                    ["גימור", detail.default_finish], ["מלאי", `${fmt(detail.current_stock_meters)} מטר`],
                    ["מחיר/מטר", detail.cost_per_meter ? `₪${fmt(detail.cost_per_meter)}` : null],
                  ].map(([label, value], i) => (
                    <div key={i}><span className="text-muted-foreground">{label}: </span><span className="text-foreground">{value || "—"}</span></div>
                  ))}
                  {detail.notes && <div className="col-span-2"><span className="text-muted-foreground">{"הערות: "}</span>{detail.notes}</div>}
                </div>
              )}
              {detailTab === "related" && <RelatedRecords entityType="fabrication_profile" entityId={detail.id} />}
              {detailTab === "attachments" && <AttachmentsSection entityType="fabrication_profile" entityId={detail.id} />}
              {detailTab === "history" && <ActivityLog entityType="fabrication_profile" entityId={detail.id} />}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
