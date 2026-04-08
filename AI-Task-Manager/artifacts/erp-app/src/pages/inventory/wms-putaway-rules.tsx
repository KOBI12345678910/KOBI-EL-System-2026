import { useState, useEffect, useCallback } from "react";
import { authFetch } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Plus, X, Loader2, MapPin, AlertCircle, RefreshCw, Edit2, Trash2, CheckCircle2 } from "lucide-react";

const TEMP_OPTIONS = ["", "קירור (2-8°C)", "הקפאה (-18°C)", "טמפ׳ מבוקרת (15-25°C)", "רגיל"];
const CATEGORY_OPTIONS = ["חומרי גלם", "מוצר מוגמר", "חלפים", "אריזה", "כימיקלים", "כלי עבודה", "אחר"];

export default function WmsPutawayRulesPage() {
  const [rules, setRules] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editRule, setEditRule] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [suggestion, setSuggestion] = useState<any>(null);
  const [suggestForm, setSuggestForm] = useState<any>({});
  const [form, setForm] = useState<any>({ priority: 10, is_active: true });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rulesRes, whRes] = await Promise.all([authFetch("/api/wms/putaway-rules"), authFetch("/api/warehouses")]);
      if (rulesRes.ok) setRules(await rulesRes.json());
      if (whRes.ok) setWarehouses(await whRes.json());
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openForm = (rule?: any) => {
    setEditRule(rule || null);
    setForm(rule ? { ...rule } : { priority: 10, is_active: true });
    setShowForm(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const method = editRule ? "PUT" : "POST";
      const url = editRule ? `/api/wms/putaway-rules/${editRule.id}` : "/api/wms/putaway-rules";
      const res = await authFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!res.ok) throw new Error((await res.json()).error);
      setShowForm(false); setEditRule(null); setForm({ priority: 10, is_active: true }); await load();
    } catch (e: any) { setError(e.message); }
    setSaving(false);
  };

  const handleDelete = async (id: number) => {
    try {
      const res = await authFetch(`/api/wms/putaway-rules/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error);
      setDeleteId(null); await load();
    } catch (e: any) { setError(e.message); }
  };

  const handleSuggest = async () => {
    try {
      const res = await authFetch("/api/wms/putaway-rules/suggest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(suggestForm) });
      if (res.ok) setSuggestion(await res.json());
    } catch (e: any) { setError(e.message); }
  };

  return (
    <div className="p-6 space-y-4" dir="rtl">
      {error && <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400"><AlertCircle className="h-4 w-4" /><span className="text-sm">{error}</span><button onClick={() => setError(null)} className="mr-auto"><X className="h-4 w-4" /></button></div>}
      
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><MapPin className="h-6 w-6 text-orange-400" />כללי אחסון (Putaway Rules)</h1><p className="text-sm text-muted-foreground mt-1">מנוע כללים לניהול הצעות מיקום אחסון אוטומטיות</p></div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} className="border-border text-gray-300 gap-1"><RefreshCw className="h-4 w-4" />רענן</Button>
          <Button onClick={() => openForm()} className="bg-orange-600 hover:bg-orange-700 gap-2"><Plus className="h-4 w-4" />כלל חדש</Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2">
          <Card className="bg-card/80 border-border"><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full text-sm">
            <thead><tr className="border-b border-border bg-background/50">
              <th className="p-3 text-right text-muted-foreground">עדיפות</th>
              <th className="p-3 text-right text-muted-foreground">שם כלל</th>
              <th className="p-3 text-right text-muted-foreground">תנאי: קטגוריה</th>
              <th className="p-3 text-right text-muted-foreground">תנאי: ABC</th>
              <th className="p-3 text-right text-muted-foreground">תנאי: טמפ׳</th>
              <th className="p-3 text-right text-muted-foreground">פעולה: אזור</th>
              <th className="p-3 text-right text-muted-foreground">פעולה: מדף</th>
              <th className="p-3 text-center text-muted-foreground">פעיל</th>
              <th className="p-3 text-center text-muted-foreground">פעולות</th>
            </tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={9} className="p-8 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto text-orange-400" /></td></tr>
              : rules.length === 0 ? <tr><td colSpan={9} className="p-12 text-center text-muted-foreground"><MapPin className="h-12 w-12 mx-auto mb-3 opacity-20" /><p>אין כללים עדיין</p></td></tr>
              : rules.map(rule => (
                <tr key={rule.id} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="p-3 text-center font-mono text-orange-400 font-bold">{rule.priority}</td>
                  <td className="p-3 text-foreground font-medium">{rule.rule_name}</td>
                  <td className="p-3 text-muted-foreground text-xs">{rule.condition_item_category || "כל הקטגוריות"}</td>
                  <td className="p-3">{rule.condition_abc_class ? <Badge className="bg-yellow-500/20 text-yellow-300 border-0 text-xs">{rule.condition_abc_class}</Badge> : <span className="text-muted-foreground text-xs">—</span>}</td>
                  <td className="p-3 text-muted-foreground text-xs">{rule.condition_temp_required || "—"}</td>
                  <td className="p-3 text-cyan-400 font-mono text-xs">{rule.action_zone || "—"}</td>
                  <td className="p-3 text-muted-foreground font-mono text-xs">{[rule.action_aisle, rule.action_shelf, rule.action_bin].filter(Boolean).join("-") || "—"}</td>
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
        </div>
        <div className="space-y-4">
          <Card className="bg-card/80 border-border"><CardContent className="p-4 space-y-3">
            <h3 className="text-sm font-semibold text-orange-400 flex items-center gap-2"><MapPin className="h-4 w-4" />הצעת מיקום</h3>
            <div><Label className="text-xs text-muted-foreground">קטגוריה</Label><select className="w-full bg-input border border-border rounded-md px-3 py-2 text-xs text-foreground mt-1" value={suggestForm.category || ""} onChange={e => setSuggestForm({...suggestForm, category: e.target.value})}><option value="">בחר...</option>{CATEGORY_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}</select></div>
            <div><Label className="text-xs text-muted-foreground">קבוצת ABC</Label><select className="w-full bg-input border border-border rounded-md px-3 py-2 text-xs text-foreground mt-1" value={suggestForm.abc_class || ""} onChange={e => setSuggestForm({...suggestForm, abc_class: e.target.value})}><option value="">בחר...</option><option value="A">A</option><option value="B">B</option><option value="C">C</option></select></div>
            <div><Label className="text-xs text-muted-foreground">משקל (ק"ג)</Label><Input type="number" className="bg-input border-border text-foreground mt-1 text-xs" value={suggestForm.weight || ""} onChange={e => setSuggestForm({...suggestForm, weight: e.target.value})} /></div>
            <Button onClick={handleSuggest} className="w-full bg-orange-600 hover:bg-orange-700 text-sm">הצע מיקום</Button>
            {suggestion && <div className={`rounded-lg p-3 ${suggestion.suggested ? 'bg-green-500/10 border border-green-500/30' : 'bg-gray-500/10 border border-gray-500/30'}`}>
              {suggestion.suggested ? (
                <div>
                  <p className="text-green-400 text-xs font-semibold mb-2">✓ מיקום מוצע:</p>
                  <div className="space-y-1 text-xs">
                    {suggestion.location.zone && <p className="text-foreground">אזור: <span className="text-cyan-400 font-mono">{suggestion.location.zone}</span></p>}
                    {suggestion.location.aisle && <p className="text-foreground">מסדרון: <span className="text-cyan-400 font-mono">{suggestion.location.aisle}</span></p>}
                    {suggestion.location.shelf && <p className="text-foreground">מדף: <span className="text-cyan-400 font-mono">{suggestion.location.shelf}</span></p>}
                    {suggestion.location.bin && <p className="text-foreground">תא: <span className="text-cyan-400 font-mono">{suggestion.location.bin}</span></p>}
                    <p className="text-muted-foreground mt-2">כלל: {suggestion.rule?.rule_name}</p>
                  </div>
                </div>
              ) : <p className="text-muted-foreground text-xs">לא נמצא כלל מתאים</p>}
            </div>}
          </CardContent></Card>

          <Card className="bg-card/80 border-border"><CardContent className="p-4">
            <h3 className="text-sm font-semibold text-muted-foreground mb-3">סטטיסטיקות</h3>
            <div className="space-y-2">
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">סה"כ כללים</span><span className="text-foreground font-mono">{rules.length}</span></div>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">כללים פעילים</span><span className="text-green-400 font-mono">{rules.filter(r => r.is_active).length}</span></div>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">כללים לא פעילים</span><span className="text-gray-400 font-mono">{rules.filter(r => !r.is_active).length}</span></div>
            </div>
          </CardContent></Card>
        </div>
      </div>

      {showForm && <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setShowForm(false)}><div className="bg-card border border-border rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-border"><h2 className="text-lg font-bold text-foreground">{editRule ? "עריכת כלל" : "כלל חדש"}</h2><button onClick={() => setShowForm(false)}><X className="h-5 w-5 text-gray-400" /></button></div>
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2"><Label className="text-xs text-muted-foreground">שם כלל *</Label><Input className="bg-input border-border text-foreground mt-1" value={form.rule_name || ""} onChange={e => setForm({...form, rule_name: e.target.value})} /></div>
            <div><Label className="text-xs text-muted-foreground">עדיפות (1=גבוה)</Label><Input type="number" className="bg-input border-border text-foreground mt-1" value={form.priority} onChange={e => setForm({...form, priority: parseInt(e.target.value)})} /></div>
            <div className="flex items-center gap-2 mt-5"><input type="checkbox" id="is_active" checked={form.is_active !== false} onChange={e => setForm({...form, is_active: e.target.checked})} className="rounded" /><Label htmlFor="is_active" className="text-sm text-foreground cursor-pointer">כלל פעיל</Label></div>
          </div>
          <div className="border-b border-border pb-1"><h3 className="text-xs font-semibold text-orange-400">תנאים (Conditions)</h3></div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label className="text-xs text-muted-foreground">קטגוריה</Label><select className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1" value={form.condition_item_category || ""} onChange={e => setForm({...form, condition_item_category: e.target.value})}><option value="">כל הקטגוריות</option>{CATEGORY_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}</select></div>
            <div><Label className="text-xs text-muted-foreground">קבוצת ABC</Label><select className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1" value={form.condition_abc_class || ""} onChange={e => setForm({...form, condition_abc_class: e.target.value})}><option value="">כל הקבוצות</option><option value="A">A — ערך גבוה</option><option value="B">B — ערך בינוני</option><option value="C">C — ערך נמוך</option></select></div>
            <div><Label className="text-xs text-muted-foreground">משקל מינימום (ק"ג)</Label><Input type="number" className="bg-input border-border text-foreground mt-1" value={form.condition_min_weight || ""} onChange={e => setForm({...form, condition_min_weight: e.target.value})} /></div>
            <div><Label className="text-xs text-muted-foreground">משקל מקסימום (ק"ג)</Label><Input type="number" className="bg-input border-border text-foreground mt-1" value={form.condition_max_weight || ""} onChange={e => setForm({...form, condition_max_weight: e.target.value})} /></div>
            <div><Label className="text-xs text-muted-foreground">דרישות טמפרטורה</Label><select className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1" value={form.condition_temp_required || ""} onChange={e => setForm({...form, condition_temp_required: e.target.value})}>{TEMP_OPTIONS.map(o => <option key={o} value={o}>{o || "ללא דרישה"}</option>)}</select></div>
            <div className="flex items-center gap-2 mt-5"><input type="checkbox" id="hazmat" checked={form.condition_hazmat || false} onChange={e => setForm({...form, condition_hazmat: e.target.checked})} className="rounded" /><Label htmlFor="hazmat" className="text-sm text-foreground cursor-pointer">חומר מסוכן</Label></div>
          </div>
          <div className="border-b border-border pb-1"><h3 className="text-xs font-semibold text-cyan-400">פעולות (Actions)</h3></div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label className="text-xs text-muted-foreground">אזור</Label><Input className="bg-input border-border text-foreground mt-1" placeholder="A, B, COLD..." value={form.action_zone || ""} onChange={e => setForm({...form, action_zone: e.target.value})} /></div>
            <div><Label className="text-xs text-muted-foreground">מסדרון</Label><Input className="bg-input border-border text-foreground mt-1" placeholder="A1, B2..." value={form.action_aisle || ""} onChange={e => setForm({...form, action_aisle: e.target.value})} /></div>
            <div><Label className="text-xs text-muted-foreground">מדף</Label><Input className="bg-input border-border text-foreground mt-1" placeholder="S01, S02..." value={form.action_shelf || ""} onChange={e => setForm({...form, action_shelf: e.target.value})} /></div>
            <div><Label className="text-xs text-muted-foreground">תא</Label><Input className="bg-input border-border text-foreground mt-1" placeholder="B001..." value={form.action_bin || ""} onChange={e => setForm({...form, action_bin: e.target.value})} /></div>
            <div><Label className="text-xs text-muted-foreground">מחסן</Label><select className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1" value={form.action_warehouse_id || ""} onChange={e => setForm({...form, action_warehouse_id: e.target.value})}><option value="">בחר מחסן...</option>{warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></div>
          </div>
          <div><Label className="text-xs text-muted-foreground">תיאור</Label><textarea rows={2} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1 resize-none" value={form.description || ""} onChange={e => setForm({...form, description: e.target.value})} /></div>
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-border">
          <Button variant="outline" onClick={() => setShowForm(false)} className="border-border">ביטול</Button>
          <Button onClick={handleSave} disabled={saving} className="bg-orange-600 hover:bg-orange-700 gap-1">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}{editRule ? "עדכן" : "צור כלל"}</Button>
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
