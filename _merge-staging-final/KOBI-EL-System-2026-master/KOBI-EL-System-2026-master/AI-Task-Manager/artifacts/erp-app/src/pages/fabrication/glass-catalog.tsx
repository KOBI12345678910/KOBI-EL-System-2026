import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { authFetch } from "@/lib/utils";
import { Search, Plus, Edit2, Trash2, X, Save, GlassWater, Thermometer, Shield, Layers } from "lucide-react";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import AttachmentsSection from "@/components/attachments-section";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL");

const GLASS_TYPES = ["float", "tempered", "laminated", "insulated", "low_e", "reflective", "frosted", "tinted", "patterned", "wire"];

export default function GlassCatalogPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [detail, setDetail] = useState<any>(null);
  const [detailTab, setDetailTab] = useState("details");

  const { data: rawGlass } = useQuery({ queryKey: ["/api/glass-catalog"], queryFn: () => authFetch(`${API}/glass-catalog`).then(r => r.json()) });
  const { data: stats } = useQuery({ queryKey: ["/api/glass-catalog/stats"], queryFn: () => authFetch(`${API}/glass-catalog/stats`).then(r => r.json()) });

  const glassList = useMemo(() => safeArray(rawGlass), [rawGlass]);
  const filtered = useMemo(() => glassList.filter((g: any) => {
    const q = search.toLowerCase();
    return !q || g.glass_name?.toLowerCase().includes(q) || g.glass_code?.toLowerCase().includes(q);
  }), [glassList, search]);

  const saveMut = useMutation({
    mutationFn: (data: any) => {
      const method = data.id ? "PUT" : "POST";
      const url = data.id ? `${API}/glass-catalog/${data.id}` : `${API}/glass-catalog`;
      return authFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).then(r => r.json());
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/glass-catalog"] }); qc.invalidateQueries({ queryKey: ["/api/glass-catalog/stats"] }); setShowForm(false); },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => authFetch(`${API}/glass-catalog/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/glass-catalog"] }); qc.invalidateQueries({ queryKey: ["/api/glass-catalog/stats"] }); },
  });

  const [form, setForm] = useState<any>({});
  const openNew = () => { setForm({ glassType: "float", thicknessMm: "6" }); setShowForm(true); };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 text-foreground p-6" dir="rtl">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-l from-cyan-400 to-sky-300 bg-clip-text text-transparent">{"קטלוג זכוכית"}</h1>
            <p className="text-muted-foreground mt-1">{"ניהול סוגי זכוכית, עוביים וטיפולים"}</p>
          </div>
          <button onClick={openNew} className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-500 px-4 py-2 rounded-lg"><Plus className="w-4 h-4" /><span>{"זכוכית חדשה"}</span></button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[
            { label: "סה\"כ סוגים", value: stats?.total || 0, icon: GlassWater, color: "cyan" },
            { label: "פעילים", value: stats?.active || 0, icon: Shield, color: "green" },
            { label: "סוגי זכוכית", value: stats?.type_count || 0, icon: Layers, color: "purple" },
            { label: "מלאי (מ\"ר)", value: fmt(stats?.total_stock_sqm), icon: Thermometer, color: "blue" },
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
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={"חיפוש זכוכית..."} className="w-full bg-muted/50 border border-border rounded-lg pr-10 pl-4 py-2 text-sm" />
        </div>

        <div className="bg-muted/30 border border-border/50 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="bg-muted/60 text-muted-foreground border-b border-border">
              <th className="p-3 text-right">{"קוד"}</th><th className="p-3 text-right">{"שם"}</th>
              <th className="p-3 text-right">{"סוג"}</th><th className="p-3 text-right">{"עובי (mm)"}</th>
              <th className="p-3 text-right">{"U-Value"}</th><th className="p-3 text-right">{"מלאי (מ\"ר)"}</th>
              <th className="p-3 text-right">{"מחיר/מ\"ר"}</th><th className="p-3 text-right">{"סטטוס"}</th>
              <th className="p-3 text-right">{"פעולות"}</th>
            </tr></thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">{"לא נמצאו פריטי זכוכית"}</td></tr>
              ) : filtered.map((g: any) => (
                <tr key={g.id} className="border-b border-border/30 hover:bg-muted/20 cursor-pointer" onClick={() => { setDetail(g); setDetailTab("details"); }}>
                  <td className="p-3 font-mono text-cyan-400">{g.glass_code}</td>
                  <td className="p-3 font-medium">{g.glass_name}</td>
                  <td className="p-3">{g.glass_type}</td>
                  <td className="p-3">{g.thickness_mm}</td>
                  <td className="p-3">{g.u_value || "—"}</td>
                  <td className="p-3">{fmt(g.current_stock_sqm)}</td>
                  <td className="p-3">{g.price_per_sqm ? `₪${fmt(g.price_per_sqm)}` : "—"}</td>
                  <td className="p-3"><span className={`px-2 py-0.5 rounded-full text-xs ${g.status === 'active' ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}`}>{g.status === 'active' ? 'פעיל' : g.status}</span></td>
                  <td className="p-3 flex gap-1" onClick={e => e.stopPropagation()}>
                    <button onClick={() => { setForm({ id: g.id, glassCode: g.glass_code, glassName: g.glass_name, glassType: g.glass_type, thicknessMm: g.thickness_mm, uValue: g.u_value, pricePerSqm: g.price_per_sqm, currentStockSqm: g.current_stock_sqm, status: g.status, notes: g.notes }); setShowForm(true); }} className="p-1 hover:bg-muted rounded"><Edit2 className="w-4 h-4" /></button>
                    <button onClick={() => { if (confirm("למחוק?")) deleteMut.mutate(g.id); }} className="p-1 hover:bg-red-600/30 rounded text-red-400"><Trash2 className="w-4 h-4" /></button>
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
                <h2 className="text-xl font-bold">{form.id ? "עריכת זכוכית" : "זכוכית חדשה"}</h2>
                <button onClick={() => setShowForm(false)}><X className="w-5 h-5" /></button>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { key: "glassCode", label: "קוד זכוכית" }, { key: "glassName", label: "שם" },
                  { key: "glassType", label: "סוג", type: "select", options: GLASS_TYPES },
                  { key: "thicknessMm", label: "עובי (mm)", type: "number" },
                  { key: "uValue", label: "U-Value", type: "number" },
                  { key: "pricePerSqm", label: "מחיר/מ\"ר", type: "number" },
                  { key: "currentStockSqm", label: "מלאי (מ\"ר)", type: "number" },
                  { key: "status", label: "סטטוס", type: "select", options: ["active", "inactive"] },
                ].map(f => (
                  <div key={f.key}>
                    <label className="block text-sm text-muted-foreground mb-1">{f.label}</label>
                    {f.type === "select" ? (
                      <select value={form[f.key] || ""} onChange={e => setForm({ ...form, [f.key]: e.target.value })} className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm">{f.options?.map(o => <option key={o} value={o}>{o}</option>)}</select>
                    ) : (
                      <input type={f.type || "text"} value={form[f.key] || ""} onChange={e => setForm({ ...form, [f.key]: e.target.value })} className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm" />
                    )}
                  </div>
                ))}
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => saveMut.mutate(form)} disabled={saveMut.isPending} className="flex-1 bg-cyan-600 hover:bg-cyan-500 px-4 py-2 rounded-lg flex items-center justify-center gap-2"><Save className="w-4 h-4" />{saveMut.isPending ? "שומר..." : "שמור"}</button>
                <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-muted rounded-lg">{"ביטול"}</button>
              </div>
            </div>
          </div>
        )}

        {detail && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setDetail(null)}>
            <div className="bg-background border border-border rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold">{detail.glass_name}</h2>
                <button onClick={() => setDetail(null)}><X className="w-5 h-5" /></button>
              </div>
              <div className="flex gap-2 mb-4 border-b border-border">
                {["details", "related", "attachments", "history"].map(tab => (
                  <button key={tab} onClick={() => setDetailTab(tab)} className={`px-4 py-2 text-sm ${detailTab === tab ? "text-cyan-400 border-b-2 border-cyan-400" : "text-muted-foreground"}`}>
                    {tab === "details" ? "פרטים" : tab === "related" ? "רשומות קשורות" : tab === "attachments" ? "מסמכים" : "היסטוריה"}
                  </button>
                ))}
              </div>
              {detailTab === "details" && (
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {[["סוג", detail.glass_type], ["עובי", `${detail.thickness_mm} mm`], ["מחוסם", detail.is_tempered ? "כן" : "לא"], ["למינציה", detail.is_laminated ? "כן" : "לא"], ["מבודד", detail.is_insulated ? "כן" : "לא"], ["U-Value", detail.u_value], ["SHGC", detail.shgc], ["שקיפות", detail.light_transmission ? `${detail.light_transmission}%` : null], ["בטיחות", detail.safety_class], ["מחיר/מ\"ר", detail.price_per_sqm ? `₪${fmt(detail.price_per_sqm)}` : null], ["מלאי", `${fmt(detail.current_stock_sqm)} מ"ר`]].map(([l, v], i) => (
                    <div key={i}><span className="text-muted-foreground">{l}: </span><span>{v || "—"}</span></div>
                  ))}
                </div>
              )}
              {detailTab === "related" && <RelatedRecords entityType="glass_catalog" entityId={detail.id} />}
              {detailTab === "attachments" && <AttachmentsSection entityType="glass_catalog" entityId={detail.id} />}
              {detailTab === "history" && <ActivityLog entityType="glass_catalog" entityId={detail.id} />}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
