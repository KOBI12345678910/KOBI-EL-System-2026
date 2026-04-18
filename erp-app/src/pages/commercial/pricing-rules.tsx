// ============================================================
// Commercial / Pricing Rules — admin list + editor
// Generated: 2026-04-18
// ============================================================
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authJson } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Search, Edit2, PowerOff, Power, Scale } from "lucide-react";

interface Rule {
  id: number;
  code: string;
  name_he: string;
  name_en: string | null;
  description: string | null;
  scope: string;
  scope_ref_id: number | null;
  rule_type: string;
  rule_value: Record<string, unknown>;
  valid_from: string | null;
  valid_to: string | null;
  priority: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const SCOPES = ["customer", "segment", "product", "category", "all"] as const;
const RULE_TYPES = ["percent_discount", "fixed_discount", "special_price", "tiered", "markup_over_cost"] as const;
const SCOPE_HE: Record<string, string> = { customer: "לקוח", segment: "פילוח", product: "מוצר", category: "קטגוריה", all: "כללי" };
const TYPE_HE: Record<string, string> = {
  percent_discount: "הנחה באחוזים", fixed_discount: "הנחה קבועה",
  special_price: "מחיר מיוחד", tiered: "מדרגות כמות", markup_over_cost: "תוספת על עלות",
};

export default function PricingRulesPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [scopeFilter, setScopeFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [onlyCurrent, setOnlyCurrent] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    code: "", name_he: "", name_en: "", description: "",
    scope: "all" as string, scope_ref_id: "" as string,
    rule_type: "percent_discount" as string,
    rule_value_json: '{"percent": 5}',
    valid_from: "", valid_to: "",
    priority: 100, is_active: true,
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["commercial", "pricing-rules", { search, scopeFilter, typeFilter, onlyCurrent }],
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (search) qs.set("q", search);
      if (scopeFilter !== "all") qs.set("scope", scopeFilter);
      if (typeFilter !== "all") qs.set("rule_type", typeFilter);
      if (onlyCurrent) qs.set("only_current", "true");
      qs.set("limit", "200");
      return authJson(`/api/commercial/pricing-rules?${qs.toString()}`);
    },
    staleTime: 30_000,
  });
  const rows: Rule[] = useMemo(() => data?.data ?? [], [data]);

  const createMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      authJson("/api/commercial/pricing-rules", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["commercial", "pricing-rules"] }); setDialogOpen(false); },
  });
  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: Record<string, unknown> }) =>
      authJson(`/api/commercial/pricing-rules/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["commercial", "pricing-rules"] }); setDialogOpen(false); setEditingId(null); },
  });
  const toggleMutation = useMutation({
    mutationFn: async ({ id, active }: { id: number; active: boolean }) =>
      authJson(`/api/commercial/pricing-rules/${id}/${active ? "activate" : "deactivate"}`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["commercial", "pricing-rules"] }),
  });

  function openCreate() {
    setEditingId(null);
    setForm({
      code: "", name_he: "", name_en: "", description: "",
      scope: "all", scope_ref_id: "",
      rule_type: "percent_discount", rule_value_json: '{"percent": 5}',
      valid_from: "", valid_to: "", priority: 100, is_active: true,
    });
    setDialogOpen(true);
  }
  function openEdit(row: Rule) {
    setEditingId(row.id);
    setForm({
      code: row.code, name_he: row.name_he, name_en: row.name_en ?? "", description: row.description ?? "",
      scope: row.scope, scope_ref_id: row.scope_ref_id != null ? String(row.scope_ref_id) : "",
      rule_type: row.rule_type, rule_value_json: JSON.stringify(row.rule_value ?? {}, null, 2),
      valid_from: row.valid_from ?? "", valid_to: row.valid_to ?? "",
      priority: row.priority, is_active: row.is_active,
    });
    setDialogOpen(true);
  }

  function submit() {
    let rule_value: Record<string, unknown>;
    try { rule_value = JSON.parse(form.rule_value_json || "{}"); }
    catch { alert("rule_value חייב להיות JSON חוקי"); return; }
    if (form.scope !== "all" && !form.scope_ref_id) { alert("דרוש מזהה אובייקט (scope_ref_id) כאשר היקף אינו 'כללי'"); return; }
    const payload: Record<string, unknown> = {
      code: form.code, name_he: form.name_he,
      name_en: form.name_en || null, description: form.description || null,
      scope: form.scope,
      scope_ref_id: form.scope_ref_id ? Number(form.scope_ref_id) : null,
      rule_type: form.rule_type, rule_value,
      valid_from: form.valid_from || null, valid_to: form.valid_to || null,
      priority: form.priority, is_active: form.is_active,
    };
    if (editingId) updateMutation.mutate({ id: editingId, payload });
    else createMutation.mutate(payload);
  }

  return (
    <div dir="rtl" className="p-6 space-y-6 min-h-screen bg-slate-950 text-slate-100">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Scale className="h-6 w-6 text-amber-400" />
          <h1 className="text-2xl font-bold">כללי תמחור</h1>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreate}><Plus className="h-4 w-4 ml-2" />כלל חדש</Button>
          </DialogTrigger>
          <DialogContent dir="rtl" className="max-w-2xl">
            <DialogHeader><DialogTitle>{editingId ? "עריכת כלל" : "כלל חדש"}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>קוד</Label><Input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} /></div>
                <div><Label>עדיפות</Label><Input type="number" value={form.priority} onChange={e => setForm({ ...form, priority: Number(e.target.value) })} /></div>
              </div>
              <div><Label>שם (עברית)</Label><Input value={form.name_he} onChange={e => setForm({ ...form, name_he: e.target.value })} /></div>
              <div><Label>שם (אנגלית)</Label><Input value={form.name_en} onChange={e => setForm({ ...form, name_en: e.target.value })} /></div>
              <div><Label>תיאור</Label><Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>היקף</Label>
                  <Select value={form.scope} onValueChange={v => setForm({ ...form, scope: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{SCOPES.map(s => <SelectItem key={s} value={s}>{SCOPE_HE[s]}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>מזהה אובייקט</Label>
                  <Input type="number" value={form.scope_ref_id} disabled={form.scope === "all"} onChange={e => setForm({ ...form, scope_ref_id: e.target.value })} />
                </div>
              </div>
              <div>
                <Label>סוג כלל</Label>
                <Select value={form.rule_type} onValueChange={v => setForm({ ...form, rule_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{RULE_TYPES.map(t => <SelectItem key={t} value={t}>{TYPE_HE[t]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>ערך הכלל (JSON)</Label>
                <Textarea value={form.rule_value_json} onChange={e => setForm({ ...form, rule_value_json: e.target.value })} className="font-mono text-xs h-24" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>בתוקף מ</Label><Input type="date" value={form.valid_from} onChange={e => setForm({ ...form, valid_from: e.target.value })} /></div>
                <div><Label>בתוקף עד</Label><Input type="date" value={form.valid_to} onChange={e => setForm({ ...form, valid_to: e.target.value })} /></div>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
                <Label>פעיל</Label>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={submit} disabled={!form.code || !form.name_he || createMutation.isPending || updateMutation.isPending}>
                {editingId ? "עדכן" : "צור"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </header>

      <Card className="bg-slate-900 border-slate-800">
        <CardHeader><CardTitle>סינון</CardTitle></CardHeader>
        <CardContent className="flex gap-3 flex-wrap">
          <div className="flex-1 min-w-[200px] relative">
            <Search className="h-4 w-4 absolute right-3 top-3 text-slate-400" />
            <Input className="pr-9" placeholder="חיפוש" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Select value={scopeFilter} onValueChange={setScopeFilter}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">כל ההיקפים</SelectItem>
              {SCOPES.map(s => <SelectItem key={s} value={s}>{SCOPE_HE[s]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">כל הסוגים</SelectItem>
              {RULE_TYPES.map(t => <SelectItem key={t} value={t}>{TYPE_HE[t]}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <Switch checked={onlyCurrent} onCheckedChange={setOnlyCurrent} />
            <Label>בתוקף כעת</Label>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-slate-900 border-slate-800">
        <CardContent className="p-0">
          {isLoading && <div className="p-6 text-center text-slate-400">טוען…</div>}
          {error && <div className="p-6 text-center text-red-400">שגיאה בטעינה</div>}
          {!isLoading && !error && rows.length === 0 && (
            <div className="p-12 text-center text-slate-400">אין כללי תמחור. לחץ "כלל חדש".</div>
          )}
          {!isLoading && rows.length > 0 && (
            <Table dir="rtl">
              <TableHeader>
                <TableRow>
                  <TableHead>קוד</TableHead>
                  <TableHead>שם</TableHead>
                  <TableHead>היקף</TableHead>
                  <TableHead>סוג</TableHead>
                  <TableHead>תוקף</TableHead>
                  <TableHead>עדיפות</TableHead>
                  <TableHead>פעיל</TableHead>
                  <TableHead>פעולות</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(row => (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono text-xs">{row.code}</TableCell>
                    <TableCell>{row.name_he}</TableCell>
                    <TableCell><Badge variant="outline">{SCOPE_HE[row.scope] ?? row.scope}</Badge></TableCell>
                    <TableCell><Badge variant="outline">{TYPE_HE[row.rule_type] ?? row.rule_type}</Badge></TableCell>
                    <TableCell className="text-xs">{row.valid_from ?? "—"} → {row.valid_to ?? "—"}</TableCell>
                    <TableCell>{row.priority}</TableCell>
                    <TableCell>{row.is_active ? <Badge className="bg-emerald-600">פעיל</Badge> : <Badge variant="secondary">כבוי</Badge>}</TableCell>
                    <TableCell className="flex gap-2">
                      <Button size="sm" variant="ghost" onClick={() => openEdit(row)}><Edit2 className="h-3 w-3" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => toggleMutation.mutate({ id: row.id, active: !row.is_active })}>
                        {row.is_active ? <PowerOff className="h-3 w-3" /> : <Power className="h-3 w-3" />}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
