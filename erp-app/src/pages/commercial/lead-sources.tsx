// ============================================================
// Commercial / Lead Sources — admin list + create/edit
// Generated: 2026-04-18
// ============================================================
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authJson } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Search, Edit2, Radio } from "lucide-react";

interface LeadSource {
  id: number;
  code: string;
  name_he: string;
  name_en: string | null;
  channel: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

const CHANNELS = [
  "website", "referral", "linkedin", "cold_outreach", "event",
  "existing_customer", "partner", "advertisement", "tender", "other",
];
const CHANNEL_HE: Record<string, string> = {
  website: "אתר", referral: "הפניה", linkedin: "LinkedIn", cold_outreach: "פניה יזומה",
  event: "אירוע", existing_customer: "לקוח קיים", partner: "שותף", advertisement: "פרסום",
  tender: "מכרז", other: "אחר",
};

export default function LeadSourcesPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    code: "", name_he: "", name_en: "", channel: "website", description: "", sort_order: 0, is_active: true,
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["commercial", "lead-sources", { search, channelFilter }],
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (search) qs.set("q", search);
      if (channelFilter !== "all") qs.set("channel", channelFilter);
      qs.set("limit", "200");
      return authJson(`/api/commercial/lead-sources?${qs.toString()}`);
    },
    staleTime: 30_000,
  });

  const rows: LeadSource[] = useMemo(() => data?.data ?? [], [data]);

  const createMutation = useMutation({
    mutationFn: async (payload: typeof form) =>
      authJson("/api/commercial/lead-sources", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["commercial", "lead-sources"] }); setDialogOpen(false); },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: Partial<typeof form> }) =>
      authJson(`/api/commercial/lead-sources/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["commercial", "lead-sources"] }); setDialogOpen(false); setEditingId(null); },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => authJson(`/api/commercial/lead-sources/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["commercial", "lead-sources"] }),
  });

  function openCreate() {
    setEditingId(null);
    setForm({ code: "", name_he: "", name_en: "", channel: "website", description: "", sort_order: 0, is_active: true });
    setDialogOpen(true);
  }
  function openEdit(row: LeadSource) {
    setEditingId(row.id);
    setForm({
      code: row.code, name_he: row.name_he, name_en: row.name_en ?? "",
      channel: row.channel, description: row.description ?? "", sort_order: row.sort_order,
      is_active: row.is_active,
    });
    setDialogOpen(true);
  }
  function submit() {
    const payload = { ...form, name_en: form.name_en || null, description: form.description || null };
    if (editingId) updateMutation.mutate({ id: editingId, payload });
    else createMutation.mutate(payload);
  }

  return (
    <div dir="rtl" className="p-6 space-y-6 min-h-screen bg-slate-950 text-slate-100">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Radio className="h-6 w-6 text-blue-400" />
          <h1 className="text-2xl font-bold">מקורות לידים</h1>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreate}><Plus className="h-4 w-4 ml-2" />הוסף מקור</Button>
          </DialogTrigger>
          <DialogContent dir="rtl" className="max-w-lg">
            <DialogHeader><DialogTitle>{editingId ? "עריכת מקור" : "מקור חדש"}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>קוד</Label><Input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="website" /></div>
              <div><Label>שם (עברית)</Label><Input value={form.name_he} onChange={e => setForm({ ...form, name_he: e.target.value })} /></div>
              <div><Label>שם (אנגלית)</Label><Input value={form.name_en} onChange={e => setForm({ ...form, name_en: e.target.value })} /></div>
              <div>
                <Label>ערוץ</Label>
                <Select value={form.channel} onValueChange={v => setForm({ ...form, channel: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CHANNELS.map(c => <SelectItem key={c} value={c}>{CHANNEL_HE[c]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>תיאור</Label><Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
              <div><Label>סדר תצוגה</Label><Input type="number" value={form.sort_order} onChange={e => setForm({ ...form, sort_order: Number(e.target.value) })} /></div>
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
        <CardHeader>
          <CardTitle>סינון</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-3 flex-wrap">
          <div className="flex-1 min-w-[200px] relative">
            <Search className="h-4 w-4 absolute right-3 top-3 text-slate-400" />
            <Input className="pr-9" placeholder="חיפוש לפי שם/קוד" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Select value={channelFilter} onValueChange={setChannelFilter}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">כל הערוצים</SelectItem>
              {CHANNELS.map(c => <SelectItem key={c} value={c}>{CHANNEL_HE[c]}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card className="bg-slate-900 border-slate-800">
        <CardContent className="p-0">
          {isLoading && <div className="p-6 text-center text-slate-400">טוען…</div>}
          {error && <div className="p-6 text-center text-red-400">שגיאה בטעינה</div>}
          {!isLoading && !error && rows.length === 0 && (
            <div className="p-12 text-center text-slate-400">לא נמצאו מקורות. לחץ "הוסף מקור" כדי להתחיל.</div>
          )}
          {!isLoading && rows.length > 0 && (
            <Table dir="rtl">
              <TableHeader>
                <TableRow>
                  <TableHead>קוד</TableHead>
                  <TableHead>שם</TableHead>
                  <TableHead>ערוץ</TableHead>
                  <TableHead>סדר</TableHead>
                  <TableHead>פעיל</TableHead>
                  <TableHead>פעולות</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(row => (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono text-xs">{row.code}</TableCell>
                    <TableCell>{row.name_he}</TableCell>
                    <TableCell><Badge variant="outline">{CHANNEL_HE[row.channel] ?? row.channel}</Badge></TableCell>
                    <TableCell>{row.sort_order}</TableCell>
                    <TableCell>{row.is_active ? <Badge className="bg-emerald-600">פעיל</Badge> : <Badge variant="secondary">לא פעיל</Badge>}</TableCell>
                    <TableCell className="flex gap-2">
                      <Button size="sm" variant="ghost" onClick={() => openEdit(row)}><Edit2 className="h-3 w-3" /></Button>
                      <Button size="sm" variant="ghost" className="text-red-400" onClick={() => confirm(`להשבית את ${row.name_he}?`) && deleteMutation.mutate(row.id)}>השבת</Button>
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
