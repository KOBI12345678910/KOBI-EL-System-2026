import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { authFetch } from "@/lib/utils";
import { Search, Plus, Edit2, Trash2, X, Save, Paintbrush, Palette, Droplets } from "lucide-react";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL");

export default function FinishesColorsPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"finishes" | "colors">("finishes");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<any>({});

  const { data: rawFinishes } = useQuery({ queryKey: ["/api/finishes"], queryFn: () => authFetch(`${API}/finishes`).then(r => r.json()) });
  const { data: rawColors } = useQuery({ queryKey: ["/api/colors"], queryFn: () => authFetch(`${API}/colors`).then(r => r.json()) });

  const finishes = useMemo(() => safeArray(rawFinishes), [rawFinishes]);
  const colors = useMemo(() => safeArray(rawColors), [rawColors]);

  const filteredFinishes = useMemo(() => finishes.filter((f: any) => { const q = search.toLowerCase(); return !q || f.finish_name?.toLowerCase().includes(q) || f.finish_code?.toLowerCase().includes(q); }), [finishes, search]);
  const filteredColors = useMemo(() => colors.filter((c: any) => { const q = search.toLowerCase(); return !q || c.color_name?.toLowerCase().includes(q) || c.color_code?.toLowerCase().includes(q) || c.ral_number?.toLowerCase().includes(q); }), [colors, search]);

  const saveFinishMut = useMutation({
    mutationFn: (data: any) => authFetch(data.id ? `${API}/finishes/${data.id}` : `${API}/finishes`, { method: data.id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/finishes"] }); setShowForm(false); },
  });

  const saveColorMut = useMutation({
    mutationFn: (data: any) => authFetch(data.id ? `${API}/colors/${data.id}` : `${API}/colors`, { method: data.id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/colors"] }); setShowForm(false); },
  });

  const deleteFinishMut = useMutation({ mutationFn: (id: number) => authFetch(`${API}/finishes/${id}`, { method: "DELETE" }), onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/finishes"] }) });
  const deleteColorMut = useMutation({ mutationFn: (id: number) => authFetch(`${API}/colors/${id}`, { method: "DELETE" }), onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/colors"] }) });

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 text-foreground p-6" dir="rtl">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-l from-amber-400 to-orange-300 bg-clip-text text-transparent">{"גימורים וצבעים"}</h1>
            <p className="text-muted-foreground mt-1">{"ניהול סוגי גימור, צביעה אלקטרוסטטית, אנודייז וצבעי RAL"}</p>
          </div>
          <button onClick={() => { setForm(tab === "finishes" ? { finishType: "powder_coating" } : { colorSystem: "RAL" }); setShowForm(true); }} className="flex items-center gap-2 bg-amber-600 hover:bg-amber-500 px-4 py-2 rounded-lg"><Plus className="w-4 h-4" /><span>{tab === "finishes" ? "גימור חדש" : "צבע חדש"}</span></button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-muted/50 border border-border/50 rounded-xl p-4">
            <div className="flex items-center justify-between"><div><p className="text-muted-foreground text-sm">{"גימורים"}</p><p className="text-2xl font-bold mt-1">{finishes.length}</p></div><Paintbrush className="w-8 h-8 text-amber-400 opacity-60" /></div>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-muted/50 border border-border/50 rounded-xl p-4">
            <div className="flex items-center justify-between"><div><p className="text-muted-foreground text-sm">{"צבעים"}</p><p className="text-2xl font-bold mt-1">{colors.length}</p></div><Palette className="w-8 h-8 text-purple-400 opacity-60" /></div>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-muted/50 border border-border/50 rounded-xl p-4">
            <div className="flex items-center justify-between"><div><p className="text-muted-foreground text-sm">{"צבעי RAL"}</p><p className="text-2xl font-bold mt-1">{colors.filter((c: any) => c.color_system === "RAL").length}</p></div><Droplets className="w-8 h-8 text-cyan-400 opacity-60" /></div>
          </motion.div>
        </div>

        <div className="flex gap-2 border-b border-border">
          <button onClick={() => setTab("finishes")} className={`px-4 py-2 text-sm ${tab === "finishes" ? "text-amber-400 border-b-2 border-amber-400" : "text-muted-foreground"}`}>{"גימורים"}</button>
          <button onClick={() => setTab("colors")} className={`px-4 py-2 text-sm ${tab === "colors" ? "text-amber-400 border-b-2 border-amber-400" : "text-muted-foreground"}`}>{"צבעים"}</button>
        </div>

        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={"חיפוש..."} className="w-full bg-muted/50 border border-border rounded-lg pr-10 pl-4 py-2 text-sm" />
        </div>

        {tab === "finishes" && (
          <div className="bg-muted/30 border border-border/50 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="bg-muted/60 text-muted-foreground border-b border-border">
                <th className="p-3 text-right">{"קוד"}</th><th className="p-3 text-right">{"שם גימור"}</th>
                <th className="p-3 text-right">{"סוג"}</th><th className="p-3 text-right">{"עובי (מיקרון)"}</th>
                <th className="p-3 text-right">{"אחריות"}</th><th className="p-3 text-right">{"מחיר/מ\"ר"}</th>
                <th className="p-3 text-right">{"פעולות"}</th>
              </tr></thead>
              <tbody>
                {filteredFinishes.length === 0 ? <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">{"לא נמצאו גימורים"}</td></tr> :
                  filteredFinishes.map((f: any) => (
                    <tr key={f.id} className="border-b border-border/30 hover:bg-muted/20">
                      <td className="p-3 font-mono text-amber-400">{f.finish_code}</td>
                      <td className="p-3 font-medium">{f.finish_name}</td>
                      <td className="p-3">{f.finish_type}</td>
                      <td className="p-3">{f.thickness_microns || "—"}</td>
                      <td className="p-3">{f.warranty_years ? `${f.warranty_years} שנים` : "—"}</td>
                      <td className="p-3">{f.cost_per_sqm ? `₪${fmt(f.cost_per_sqm)}` : "—"}</td>
                      <td className="p-3 flex gap-1">
                        <button onClick={() => { setForm({ id: f.id, finishName: f.finish_name, finishType: f.finish_type, costPerSqm: f.cost_per_sqm, status: f.status, notes: f.notes }); setShowForm(true); }} className="p-1 hover:bg-muted rounded"><Edit2 className="w-4 h-4" /></button>
                        <button onClick={() => { if (confirm("למחוק?")) deleteFinishMut.mutate(f.id); }} className="p-1 hover:bg-red-600/30 rounded text-red-400"><Trash2 className="w-4 h-4" /></button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === "colors" && (
          <div className="bg-muted/30 border border-border/50 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="bg-muted/60 text-muted-foreground border-b border-border">
                <th className="p-3 text-right">{"קוד"}</th><th className="p-3 text-right">{"צבע"}</th>
                <th className="p-3 text-right">{"שם בעברית"}</th><th className="p-3 text-right">{"RAL"}</th>
                <th className="p-3 text-right">{"דוגמה"}</th><th className="p-3 text-right">{"תוספת %"}</th>
                <th className="p-3 text-right">{"פעולות"}</th>
              </tr></thead>
              <tbody>
                {filteredColors.length === 0 ? <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">{"לא נמצאו צבעים"}</td></tr> :
                  filteredColors.map((c: any) => (
                    <tr key={c.id} className="border-b border-border/30 hover:bg-muted/20">
                      <td className="p-3 font-mono text-purple-400">{c.color_code}</td>
                      <td className="p-3 font-medium">{c.color_name}</td>
                      <td className="p-3">{c.color_name_he || "—"}</td>
                      <td className="p-3">{c.ral_number || "—"}</td>
                      <td className="p-3">{c.hex_value ? <div className="w-6 h-6 rounded border border-border" style={{ backgroundColor: c.hex_value }} /> : "—"}</td>
                      <td className="p-3">{Number(c.surcharge_percent) > 0 ? `${c.surcharge_percent}%` : "—"}</td>
                      <td className="p-3 flex gap-1">
                        <button onClick={() => { setForm({ id: c.id, colorName: c.color_name, colorNameHe: c.color_name_he, hexValue: c.hex_value, surchargePercent: c.surcharge_percent, status: c.status, notes: c.notes }); setShowForm(true); }} className="p-1 hover:bg-muted rounded"><Edit2 className="w-4 h-4" /></button>
                        <button onClick={() => { if (confirm("למחוק?")) deleteColorMut.mutate(c.id); }} className="p-1 hover:bg-red-600/30 rounded text-red-400"><Trash2 className="w-4 h-4" /></button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}

        {showForm && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
            <div className="bg-background border border-border rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold">{tab === "finishes" ? (form.id ? "עריכת גימור" : "גימור חדש") : (form.id ? "עריכת צבע" : "צבע חדש")}</h2>
                <button onClick={() => setShowForm(false)}><X className="w-5 h-5" /></button>
              </div>
              {tab === "finishes" ? (
                <div className="grid grid-cols-2 gap-4">
                  {[{ key: "finishCode", label: "קוד" }, { key: "finishName", label: "שם" }, { key: "finishType", label: "סוג", type: "select", options: ["powder_coating", "anodizing", "pvdf", "wet_paint", "electrophoresis", "sublimation"] }, { key: "costPerSqm", label: "מחיר/מ\"ר", type: "number" }, { key: "status", label: "סטטוס", type: "select", options: ["active", "inactive"] }].map(f => (
                    <div key={f.key}><label className="block text-sm text-muted-foreground mb-1">{f.label}</label>
                      {f.type === "select" ? <select value={form[f.key] || ""} onChange={e => setForm({ ...form, [f.key]: e.target.value })} className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm">{f.options?.map(o => <option key={o} value={o}>{o}</option>)}</select>
                        : <input type={f.type || "text"} value={form[f.key] || ""} onChange={e => setForm({ ...form, [f.key]: e.target.value })} className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm" />}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  {[{ key: "colorCode", label: "קוד" }, { key: "colorName", label: "שם (EN)" }, { key: "colorNameHe", label: "שם (HE)" }, { key: "ralNumber", label: "RAL" }, { key: "hexValue", label: "HEX" }, { key: "colorSystem", label: "מערכת", type: "select", options: ["RAL", "NCS", "Pantone", "Custom"] }, { key: "surchargePercent", label: "תוספת %", type: "number" }, { key: "status", label: "סטטוס", type: "select", options: ["active", "inactive"] }].map(f => (
                    <div key={f.key}><label className="block text-sm text-muted-foreground mb-1">{f.label}</label>
                      {f.type === "select" ? <select value={form[f.key] || ""} onChange={e => setForm({ ...form, [f.key]: e.target.value })} className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm">{f.options?.map(o => <option key={o} value={o}>{o}</option>)}</select>
                        : <input type={f.type || "text"} value={form[f.key] || ""} onChange={e => setForm({ ...form, [f.key]: e.target.value })} className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm" />}
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-3 mt-6">
                <button onClick={() => (tab === "finishes" ? saveFinishMut : saveColorMut).mutate(form)} className="flex-1 bg-amber-600 hover:bg-amber-500 px-4 py-2 rounded-lg flex items-center justify-center gap-2"><Save className="w-4 h-4" />{"שמור"}</button>
                <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-muted rounded-lg">{"ביטול"}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
