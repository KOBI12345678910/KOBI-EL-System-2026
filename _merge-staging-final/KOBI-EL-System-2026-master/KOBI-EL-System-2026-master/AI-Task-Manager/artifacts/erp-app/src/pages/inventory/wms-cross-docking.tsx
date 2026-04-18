import { useState, useEffect, useCallback } from "react";
import { authFetch } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Plus, X, Loader2, Zap, AlertCircle, RefreshCw, Edit2, Trash2, CheckCircle2, Clock, ArrowRight } from "lucide-react";

const VELOCITY_OPTIONS = ["גבוה", "בינוני", "נמוך"];
const CONDITION_TYPE_LABELS: Record<string, string> = {
  item: "לפי פריט", category: "לפי קטגוריה", velocity: "לפי מחזוריות"
};

export default function WmsCrossDockingPage() {
  const [rules, setRules] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"rules" | "events">("rules");
  const [showForm, setShowForm] = useState(false);
  const [showEventForm, setShowEventForm] = useState(false);
  const [editRule, setEditRule] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [form, setForm] = useState<any>({ priority: 10, is_active: true, condition_type: "item", max_dwell_hours: 24, auto_route: true });
  const [eventForm, setEventForm] = useState<any>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rulesRes, eventsRes] = await Promise.all([authFetch("/api/wms/cross-dock-rules"), authFetch("/api/wms/cross-dock-events")]);
      if (rulesRes.ok) setRules(await rulesRes.json());
      if (eventsRes.ok) setEvents(await eventsRes.json());
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const stats = {
    totalRules: rules.length,
    activeRules: rules.filter(r => r.is_active).length,
    pendingEvents: events.filter(e => e.status === "received").length,
    stagedEvents: events.filter(e => e.status === "staged").length,
    shippedEvents: events.filter(e => e.status === "shipped").length,
  };

  const openForm = (rule?: any) => {
    setEditRule(rule || null);
    setForm(rule ? { ...rule } : { priority: 10, is_active: true, condition_type: "item", max_dwell_hours: 24, auto_route: true });
    setShowForm(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const method = editRule ? "PUT" : "POST";
      const url = editRule ? `/api/wms/cross-dock-rules/${editRule.id}` : "/api/wms/cross-dock-rules";
      const res = await authFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!res.ok) throw new Error((await res.json()).error);
      setShowForm(false); setEditRule(null); await load();
    } catch (e: any) { setError(e.message); }
    setSaving(false);
  };

  const handleDelete = async (id: number) => {
    try {
      const res = await authFetch(`/api/wms/cross-dock-rules/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error);
      setDeleteId(null); await load();
    } catch (e: any) { setError(e.message); }
  };

  const handleSaveEvent = async () => {
    setSaving(true);
    try {
      const res = await authFetch("/api/wms/cross-dock-events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(eventForm) });
      if (!res.ok) throw new Error((await res.json()).error);
      setShowEventForm(false); setEventForm({}); await load();
    } catch (e: any) { setError(e.message); }
    setSaving(false);
  };

  const advanceEvent = async (id: number, currentStatus: string) => {
    const next = currentStatus === "received" ? "staged" : currentStatus === "staged" ? "shipped" : null;
    if (!next) return;
    try {
      const update: any = { status: next };
      if (next === "staged") update.staged_at = new Date().toISOString();
      if (next === "shipped") update.shipped_at = new Date().toISOString();
      const res = await authFetch(`/api/wms/cross-dock-events/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(update) });
      if (!res.ok) throw new Error((await res.json()).error);
      await load();
    } catch (e: any) { setError(e.message); }
  };

  const EVENT_STATUS_COLORS: Record<string, string> = {
    received: "bg-blue-500/20 text-blue-300",
    staged: "bg-yellow-500/20 text-yellow-300",
    shipped: "bg-green-500/20 text-green-300",
  };
  const EVENT_STATUS_LABELS: Record<string, string> = {
    received: "התקבל", staged: "בבידוד", shipped: "נשלח"
  };

  return (
    <div className="p-6 space-y-4" dir="rtl">
      {error && <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400"><AlertCircle className="h-4 w-4" /><span className="text-sm">{error}</span><button onClick={() => setError(null)} className="mr-auto"><X className="h-4 w-4" /></button></div>}
      
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><Zap className="h-6 w-6 text-yellow-400" />Cross-Docking</h1><p className="text-sm text-muted-foreground mt-1">ניתוב ישיר מרציף הקבלה לרציף המשלוח, ללא אחסון ביניים</p></div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} className="border-border text-gray-300 gap-1"><RefreshCw className="h-4 w-4" />רענן</Button>
          {tab === "rules" && <Button onClick={() => openForm()} className="bg-yellow-600 hover:bg-yellow-700 gap-2"><Plus className="h-4 w-4" />כלל חדש</Button>}
          {tab === "events" && <Button onClick={() => setShowEventForm(true)} className="bg-yellow-600 hover:bg-yellow-700 gap-2"><Plus className="h-4 w-4" />אירוע חדש</Button>}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { l: "כללים", v: stats.totalRules, c: "text-yellow-400" },
          { l: "פעילים", v: stats.activeRules, c: "text-green-400" },
          { l: "ממתינים", v: stats.pendingEvents, c: "text-blue-400" },
          { l: "בבידוד", v: stats.stagedEvents, c: "text-yellow-400" },
          { l: "נשלחו", v: stats.shippedEvents, c: "text-emerald-400" },
        ].map((k, i) => (
          <Card key={i} className="bg-card/80 border-border"><CardContent className="p-4"><p className="text-[11px] text-muted-foreground">{k.l}</p><p className={`text-xl font-bold font-mono mt-1 ${k.c}`}>{k.v}</p></CardContent></Card>
        ))}
      </div>

      <div className="flex gap-2 border-b border-border pb-2">
        <button onClick={() => setTab("rules")} className={`px-4 py-2 text-sm rounded-t-lg transition-colors ${tab === "rules" ? "bg-yellow-600 text-foreground" : "text-muted-foreground hover:text-foreground"}`}>כללי ניתוב</button>
        <button onClick={() => setTab("events")} className={`px-4 py-2 text-sm rounded-t-lg transition-colors ${tab === "events" ? "bg-yellow-600 text-foreground" : "text-muted-foreground hover:text-foreground"}`}>אירועי Cross-Dock</button>
      </div>

      {tab === "rules" && (
        <Card className="bg-card/80 border-border"><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full text-sm">
          <thead><tr className="border-b border-border bg-background/50">
            <th className="p-3 text-right text-muted-foreground">עדיפות</th>
            <th className="p-3 text-right text-muted-foreground">שם כלל</th>
            <th className="p-3 text-right text-muted-foreground">סוג תנאי</th>
            <th className="p-3 text-right text-muted-foreground">קטגוריה/מחזוריות</th>
            <th className="p-3 text-right text-muted-foreground">מיקום בידוד</th>
            <th className="p-3 text-right text-muted-foreground">זמן שהייה מקס׳</th>
            <th className="p-3 text-center text-muted-foreground">ניתוב אוטומטי</th>
            <th className="p-3 text-center text-muted-foreground">פעיל</th>
            <th className="p-3 text-center text-muted-foreground">פעולות</th>
          </tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={9} className="p-8 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto text-yellow-400" /></td></tr>
            : rules.length === 0 ? <tr><td colSpan={9} className="p-12 text-center text-muted-foreground"><Zap className="h-12 w-12 mx-auto mb-3 opacity-20" /><p>אין כללים עדיין</p></td></tr>
            : rules.map(rule => (
              <tr key={rule.id} className="border-b border-border/50 hover:bg-muted/30">
                <td className="p-3 text-center font-mono text-yellow-400 font-bold">{rule.priority}</td>
                <td className="p-3 text-foreground font-medium">{rule.rule_name}</td>
                <td className="p-3 text-muted-foreground text-xs">{CONDITION_TYPE_LABELS[rule.condition_type] || rule.condition_type}</td>
                <td className="p-3 text-muted-foreground text-xs">{rule.condition_category || rule.condition_velocity || "—"}</td>
                <td className="p-3 font-mono text-cyan-400 text-xs">{rule.staging_location || "—"}</td>
                <td className="p-3 text-muted-foreground text-xs">{rule.max_dwell_hours} שעות</td>
                <td className="p-3 text-center">{rule.auto_route ? <CheckCircle2 className="h-4 w-4 text-green-400 mx-auto" /> : <X className="h-4 w-4 text-red-400 mx-auto" />}</td>
                <td className="p-3 text-center">{rule.is_active ? <CheckCircle2 className="h-4 w-4 text-green-400 mx-auto" /> : <X className="h-4 w-4 text-red-400 mx-auto" />}</td>
                <td className="p-3 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <button onClick={() => openForm(rule)} className="p-1.5 hover:bg-muted rounded"><Edit2 className="h-4 w-4 text-yellow-400" /></button>
                    <button onClick={() => setDeleteId(rule.id)} className="p-1.5 hover:bg-red-500/10 rounded"><Trash2 className="h-4 w-4 text-red-400" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table></div></CardContent></Card>
      )}

      {tab === "events" && (
        <div className="space-y-3">
          {loading ? <div className="p-8 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto text-yellow-400" /></div>
          : events.length === 0 ? <Card className="bg-card/80 border-border"><CardContent className="p-12 text-center text-muted-foreground"><Zap className="h-12 w-12 mx-auto mb-3 opacity-20" /><p>אין אירועי Cross-Dock</p></CardContent></Card>
          : events.map(ev => (
            <Card key={ev.id} className="bg-card/80 border-border"><CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div>
                    <p className="font-mono text-xs text-cyan-400">{ev.item_code}</p>
                    <p className="text-foreground font-medium text-sm">{ev.item_name}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-yellow-400" />
                  <div>
                    <p className="text-xs text-muted-foreground">יעד</p>
                    <p className="text-foreground text-sm font-mono">{ev.destination_dock || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">כמות</p>
                    <p className="text-foreground font-mono">{ev.quantity}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">התקבל</p>
                    <p className="text-foreground text-xs">{new Date(ev.received_at || ev.created_at).toLocaleDateString("he-IL")}</p>
                  </div>
                  {ev.staged_at && <div><p className="text-xs text-muted-foreground">בבידוד</p><p className="text-yellow-400 text-xs">{new Date(ev.staged_at).toLocaleDateString("he-IL")}</p></div>}
                </div>
                <div className="flex items-center gap-3">
                  <Badge className={`${EVENT_STATUS_COLORS[ev.status] || ''} border-0`}>{EVENT_STATUS_LABELS[ev.status] || ev.status}</Badge>
                  {ev.status !== "shipped" && (
                    <button onClick={() => advanceEvent(ev.id, ev.status)} className={`text-xs border px-3 py-1.5 rounded flex items-center gap-1 ${ev.status === "received" ? "border-yellow-500/30 text-yellow-300 hover:bg-yellow-500/10" : "border-green-500/30 text-green-300 hover:bg-green-500/10"}`}>
                      {ev.status === "received" ? <><Clock className="h-3 w-3" />העבר לבידוד</> : <><CheckCircle2 className="h-3 w-3" />שלח</>}
                    </button>
                  )}
                </div>
              </div>
            </CardContent></Card>
          ))}
        </div>
      )}

      {showForm && <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setShowForm(false)}><div className="bg-card border border-border rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-border"><h2 className="text-lg font-bold text-foreground">{editRule ? "עריכת כלל" : "כלל Cross-Dock חדש"}</h2><button onClick={() => setShowForm(false)}><X className="h-5 w-5 text-gray-400" /></button></div>
        <div className="p-4 grid grid-cols-2 gap-4">
          <div className="col-span-2"><Label className="text-xs text-muted-foreground">שם כלל *</Label><Input className="bg-input border-border text-foreground mt-1" value={form.rule_name || ""} onChange={e => setForm({...form, rule_name: e.target.value})} /></div>
          <div><Label className="text-xs text-muted-foreground">עדיפות</Label><Input type="number" className="bg-input border-border text-foreground mt-1" value={form.priority} onChange={e => setForm({...form, priority: parseInt(e.target.value)})} /></div>
          <div><Label className="text-xs text-muted-foreground">סוג תנאי</Label><select className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1" value={form.condition_type} onChange={e => setForm({...form, condition_type: e.target.value})}>{Object.entries(CONDITION_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          {form.condition_type === "category" && <div><Label className="text-xs text-muted-foreground">קטגוריה</Label><Input className="bg-input border-border text-foreground mt-1" value={form.condition_category || ""} onChange={e => setForm({...form, condition_category: e.target.value})} /></div>}
          {form.condition_type === "velocity" && <div><Label className="text-xs text-muted-foreground">מחזוריות</Label><select className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1" value={form.condition_velocity || ""} onChange={e => setForm({...form, condition_velocity: e.target.value})}><option value="">בחר...</option>{VELOCITY_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}</select></div>}
          <div><Label className="text-xs text-muted-foreground">מיקום בידוד</Label><Input className="bg-input border-border text-foreground mt-1" placeholder="DOCK-A1..." value={form.staging_location || ""} onChange={e => setForm({...form, staging_location: e.target.value})} /></div>
          <div><Label className="text-xs text-muted-foreground">זמן שהייה מקס׳ (שעות)</Label><Input type="number" className="bg-input border-border text-foreground mt-1" value={form.max_dwell_hours} onChange={e => setForm({...form, max_dwell_hours: parseInt(e.target.value)})} /></div>
          <div className="flex items-center gap-2 mt-4"><input type="checkbox" id="auto_route" checked={form.auto_route !== false} onChange={e => setForm({...form, auto_route: e.target.checked})} className="rounded" /><Label htmlFor="auto_route" className="text-sm text-foreground cursor-pointer">ניתוב אוטומטי</Label></div>
          <div className="flex items-center gap-2 mt-4"><input type="checkbox" id="rule_active" checked={form.is_active !== false} onChange={e => setForm({...form, is_active: e.target.checked})} className="rounded" /><Label htmlFor="rule_active" className="text-sm text-foreground cursor-pointer">כלל פעיל</Label></div>
          <div className="col-span-2"><Label className="text-xs text-muted-foreground">תיאור</Label><textarea rows={2} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1 resize-none" value={form.description || ""} onChange={e => setForm({...form, description: e.target.value})} /></div>
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-border">
          <Button variant="outline" onClick={() => setShowForm(false)} className="border-border">ביטול</Button>
          <Button onClick={handleSave} disabled={saving} className="bg-yellow-600 hover:bg-yellow-700 gap-1">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}{editRule ? "עדכן" : "צור כלל"}</Button>
        </div>
      </div></div>}

      {showEventForm && <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setShowEventForm(false)}><div className="bg-card border border-border rounded-xl w-full max-w-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-border"><h2 className="text-lg font-bold text-foreground">אירוע Cross-Dock חדש</h2><button onClick={() => setShowEventForm(false)}><X className="h-5 w-5 text-gray-400" /></button></div>
        <div className="p-4 grid grid-cols-2 gap-4">
          <div><Label className="text-xs text-muted-foreground">קוד פריט</Label><Input className="bg-input border-border text-foreground mt-1" value={eventForm.item_code || ""} onChange={e => setEventForm({...eventForm, item_code: e.target.value})} /></div>
          <div><Label className="text-xs text-muted-foreground">שם פריט *</Label><Input className="bg-input border-border text-foreground mt-1" value={eventForm.item_name || ""} onChange={e => setEventForm({...eventForm, item_name: e.target.value})} /></div>
          <div><Label className="text-xs text-muted-foreground">כמות *</Label><Input type="number" className="bg-input border-border text-foreground mt-1" value={eventForm.quantity || ""} onChange={e => setEventForm({...eventForm, quantity: e.target.value})} /></div>
          <div><Label className="text-xs text-muted-foreground">רציף יעד</Label><Input className="bg-input border-border text-foreground mt-1" placeholder="DOCK-B1" value={eventForm.destination_dock || ""} onChange={e => setEventForm({...eventForm, destination_dock: e.target.value})} /></div>
          <div className="col-span-2"><Label className="text-xs text-muted-foreground">הערות</Label><textarea rows={2} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1 resize-none" value={eventForm.notes || ""} onChange={e => setEventForm({...eventForm, notes: e.target.value})} /></div>
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-border">
          <Button variant="outline" onClick={() => setShowEventForm(false)} className="border-border">ביטול</Button>
          <Button onClick={handleSaveEvent} disabled={saving} className="bg-yellow-600 hover:bg-yellow-700 gap-1">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}שמור</Button>
        </div>
      </div></div>}

      {deleteId && <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4" onClick={() => setDeleteId(null)}><div className="bg-card border border-border rounded-xl w-full max-w-md text-center p-6" onClick={e => e.stopPropagation()}>
        <Trash2 className="h-12 w-12 text-red-400 mx-auto mb-3" />
        <h3 className="text-lg font-bold text-foreground mb-2">מחיקת כלל</h3>
        <p className="text-muted-foreground mb-4">האם למחוק את הכלל? פעולה זו בלתי הפיכה.</p>
        <div className="flex gap-2 justify-center"><Button variant="outline" onClick={() => setDeleteId(null)} className="border-border">ביטול</Button><Button onClick={() => handleDelete(deleteId)} className="bg-red-600 hover:bg-red-700">מחק</Button></div>
      </div></div>}
    </div>
  );
}
