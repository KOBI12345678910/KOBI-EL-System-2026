// ============================================================
// Commercial / Customer Segments — admin list + builder
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
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Search, Edit2, RefreshCw, Users } from "lucide-react";

interface Segment {
  id: number;
  code: string;
  name_he: string;
  name_en: string | null;
  description: string | null;
  segment_type: string;
  member_count: number;
  is_active: boolean;
  criteria: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

const SEGMENT_TYPES = ["enterprise", "smb", "government", "retail", "wholesale", "strategic", "custom"] as const;
const TYPE_HE: Record<string, string> = {
  enterprise: "אסטרטגי", smb: "SMB", government: "ציבורי", retail: "קמעונאי",
  wholesale: "סיטונאי", strategic: "שותף אסטרטגי", custom: "מותאם אישית",
};

export default function CustomerSegmentsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    code: "", name_he: "", name_en: "", description: "",
    segment_type: "smb" as string, criteria_json: "{}", is_active: true,
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["commercial", "customer-segments", { search, typeFilter }],
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (search) qs.set("q", search);
      if (typeFilter !== "all") qs.set("segment_type", typeFilter);
      qs.set("limit", "200");
      return authJson(`/api/commercial/customer-segments?${qs.toString()}`);
    },
    staleTime: 30_000,
  });

  const rows: Segment[] = useMemo(() => data?.data ?? [], [data]);

  const createMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      authJson("/api/commercial/customer-segments", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["commercial", "customer-segments"] }); setDialogOpen(false); },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: Record<string, unknown> }) =>
      authJson(`/api/commercial/customer-segments/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["commercial", "customer-segments"] }); setDialogOpen(false); setEditingId(null); },
  });

  const recountMutation = useMutation({
    mutationFn: async (id: number) => authJson(`/api/commercial/customer-segments/${id}/recount`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["commercial", "customer-segments"] }),
  });

  function openCreate() {
    setEditingId(null);
    setForm({ code: "", name_he: "", name_en: "", description: "", segment_type: "smb", criteria_json: "{}", is_active: true });
    setDialogOpen(true);
  }
  function openEdit(row: Segment) {
    setEditingId(row.id);
    setForm({
      code: row.code, name_he: row.name_he, name_en: row.name_en ?? "", description: row.description ?? "",
      segment_type: row.segment_type, criteria_json: JSON.stringify(row.criteria ?? {}, null, 2),
      is_active: row.is_active,
    });
    setDialogOpen(true);
  }
  function submit() {
    let criteria: Record<string, unknown> = {};
    try { criteria = JSON.parse(form.criteria_json || "{}"); }
    catch { alert("קריטריונים חייבים להיות JSON חוקי"); return; }
    const payload = { ...form, criteria, name_en: form.name_en || null, description: form.description || null };
    delete (payload as Record<string, unknown>).criteria_json;
    if (editingId) updateMutation.mutate({ id: editingId, payload });
    else createMutation.mutate(payload);
  }

  return (
    <div dir="rtl" className="p-6 space-y-6 min-h-screen bg-slate-950 text-slate-100">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users className="h-6 w-6 text-purple-400" />
          <h1 className="text-2xl font-bold">פילוח לקוחות</h1>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreate}><Plus className="h-4 w-4 ml-2" />פילוח חדש</Button>
          </DialogTrigger>
          <DialogContent dir="rtl" className="max-w-2xl">
            <DialogHeader><DialogTitle>{editingId ? "עריכת פילוח" : "פילוח חדש"}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>קוד</Label><Input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} /></div>
                <div>
                  <Label>סוג</Label>
                  <Select value={form.segment_type} onValueChange={v => setForm({ ...form, segment_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SEGMENT_TYPES.map(t => <SelectItem key={t} value={t}>{TYPE_HE[t]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div><Label>שם (עברית)</Label><Input value={form.name_he} onChange={e => setForm({ ...form, name_he: e.target.value })} /></div>
              <div><Label>שם (אנגלית)</Label><Input value={form.name_en} onChange={e => setForm({ ...form, name_en: e.target.value })} /></div>
              <div><Label>תיאור</Label><Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
              <div>
                <Label>קריטריונים (JSON)</Label>
                <Textarea
                  value={form.criteria_json}
                  onChange={e => setForm({ ...form, criteria_json: e.target.value })}
                  className="font-mono text-xs h-32"
                  placeholder='{"rules":[{"field":"annual_revenue","op":"gte","value":50000000}],"logic":"all"}'
                />
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
            <Input className="pr-9" placeholder="חיפוש לפי שם/קוד" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">כל הסוגים</SelectItem>
              {SEGMENT_TYPES.map(t => <SelectItem key={t} value={t}>{TYPE_HE[t]}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card className="bg-slate-900 border-slate-800">
        <CardContent className="p-0">
          {isLoading && <div className="p-6 text-center text-slate-400">טוען…</div>}
          {error && <div className="p-6 text-center text-red-400">שגיאה בטעינה</div>}
          {!isLoading && !error && rows.length === 0 && (
            <div className="p-12 text-center text-slate-400">לא נמצאו פילוחים. לחץ "פילוח חדש" להתחלה.</div>
          )}
          {!isLoading && rows.length > 0 && (
            <Table dir="rtl">
              <TableHeader>
                <TableRow>
                  <TableHead>קוד</TableHead>
                  <TableHead>שם</TableHead>
                  <TableHead>סוג</TableHead>
                  <TableHead>חברים</TableHead>
                  <TableHead>פעיל</TableHead>
                  <TableHead>פעולות</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(row => (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono text-xs">{row.code}</TableCell>
                    <TableCell>{row.name_he}</TableCell>
                    <TableCell><Badge variant="outline">{TYPE_HE[row.segment_type] ?? row.segment_type}</Badge></TableCell>
                    <TableCell className="font-mono">{row.member_count}</TableCell>
                    <TableCell>{row.is_active ? <Badge className="bg-emerald-600">פעיל</Badge> : <Badge variant="secondary">לא פעיל</Badge>}</TableCell>
                    <TableCell className="flex gap-2">
                      <Button size="sm" variant="ghost" onClick={() => openEdit(row)}><Edit2 className="h-3 w-3" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => recountMutation.mutate(row.id)} title="ספור מחדש">
                        <RefreshCw className="h-3 w-3" />
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
