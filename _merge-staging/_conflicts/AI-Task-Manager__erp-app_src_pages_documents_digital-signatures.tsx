import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2, Plus, Search, X, Eye, Send,
  Clock, AlertCircle, Loader2, FileSignature, Shield, Users,
  ChevronRight, ChevronLeft, MoreHorizontal,
  Download
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const API = "/api";

const PROVIDERS = [
  { value: "local", label: "חתימה מקומית", desc: "חתימה דיגיטלית ישראלית" },
  { value: "docusign", label: "DocuSign", desc: "שירות DocuSign" },
  { value: "adobe_sign", label: "Adobe Sign", desc: "שירות Adobe Sign" },
  { value: "gov_il", label: "ממשל.il", desc: "חתימה אלקטרונית ממשלתית ישראלית" },
];

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  signed: "bg-green-500/20 text-green-300 border-green-500/30",
  declined: "bg-red-500/20 text-red-300 border-red-500/30",
  expired: "bg-gray-500/20 text-gray-300 border-gray-500/30",
};
const STATUS_LABELS: Record<string, string> = {
  pending: "ממתין",
  signed: "חתום",
  declined: "נדחה",
  expired: "פג תוקף",
};

type SignatureRow = {
  id: number; signee_name: string; signee_email: string;
  contract_title?: string; contract_number?: string; provider?: string;
  status: string; created_at?: string; signed_at?: string;
  signature_field?: string; expires_at?: string; ip_address?: string;
};

type WorkflowRow = {
  id: number; workflow_name: string; status: string; provider: string;
  created_at?: string; completed_at?: string;
};

export default function DigitalSignatures() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const perPage = 25;
  const [showCreate, setShowCreate] = useState(false);
  const [showDetail, setShowDetail] = useState<SignatureRow | null>(null);
  const [menuOpen, setMenuOpen] = useState<number | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<SignatureRow | null>(null);

  const [form, setForm] = useState({
    workflowName: "",
    provider: "local",
    contractId: "",
    signers: [{ name: "", email: "", field: "signature" }],
    expirationDays: 30,
    sendReminders: true,
  });

  const { data: statsData } = useQuery({
    queryKey: ["signature-stats"],
    queryFn: async () => {
      const r = await authFetch(`${API}/contract-signatures/stats`);
      if (!r.ok) return null;
      return r.json();
    },
    refetchInterval: 30000,
  });

  const { data: sigsData = { signatures: [], total: 0 }, isLoading } = useQuery({
    queryKey: ["signatures", search, statusFilter, page],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: String(perPage),
        offset: String((page - 1) * perPage),
        ...(statusFilter !== "all" && { status: statusFilter }),
        ...(search && { search }),
      });
      const r = await authFetch(`${API}/contract-signatures?${params}`);
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
  });

  const { data: workflowsData = { workflows: [] } } = useQuery({
    queryKey: ["esig-workflows"],
    queryFn: async () => {
      const r = await authFetch(`${API}/e-signature-workflow?limit=100`);
      if (!r.ok) return { workflows: [] };
      return r.json();
    },
  });

  const createWorkflowMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const wRes = await authFetch(`${API}/e-signature-workflow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workflowName: data.workflowName,
          provider: data.provider,
          contractId: data.contractId ? Number(data.contractId) : null,
          expirationDays: data.expirationDays,
          sendReminders: data.sendReminders,
        }),
      });
      if (!wRes.ok) throw new Error("Failed to create workflow");
      const wf = await wRes.json();
      const wfId = wf.workflow.id;

      const validSigners = data.signers.filter(s => s.email);
      const inviteResults = await Promise.all(
        validSigners.map(signer =>
          authFetch(`${API}/e-signature/${wfId}/invite`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ signeeEmail: signer.email, signeeName: signer.name, signatureField: signer.field, provider: data.provider }),
          })
        )
      );
      const failedInvites = inviteResults.filter(r => !r.ok);
      if (failedInvites.length > 0) {
        throw new Error(`נשלחו ${validSigners.length - failedInvites.length} הזמנות, נכשלו ${failedInvites.length}`);
      }
      return wf;
    },
    onSuccess: () => {
      toast({ title: "בקשת חתימה נשלחה", description: "החותמים יקבלו הזמנה לחתום." });
      setShowCreate(false);
      setForm({ workflowName: "", provider: "local", contractId: "", signers: [{ name: "", email: "", field: "signature" }], expirationDays: 30, sendReminders: true });
      queryClient.invalidateQueries({ queryKey: ["signatures"] });
      queryClient.invalidateQueries({ queryKey: ["esig-workflows"] });
      queryClient.invalidateQueries({ queryKey: ["signature-stats"] });
    },
    onError: (e: Error) => toast({ title: "שגיאה", description: e.message, variant: "destructive" }),
  });

  const sendReminderMutation = useMutation({
    mutationFn: async (signatureId: number) => {
      const r = await authFetch(`${API}/contract-signatures/${signatureId}/resend-reminder`, { method: "POST" });
      if (!r.ok) {
        const err = await r.json().catch(() => ({ error: "שגיאה בשליחת תזכורת" })) as { error?: string };
        throw new Error(err.error || "שגיאה בשליחת תזכורת");
      }
      return r.json();
    },
    onSuccess: () => toast({ title: "תזכורת נשלחה", description: "החותם קיבל תזכורת לחתום." }),
    onError: (e: Error) => toast({ title: "שגיאה בשליחת תזכורת", description: e.message, variant: "destructive" }),
  });

  const downloadSignedDocument = async (sig: SignatureRow) => {
    if (sig.status !== "signed") {
      toast({ title: "לא ניתן להוריד", description: "המסמך טרם נחתם.", variant: "destructive" });
      return;
    }
    const r = await authFetch(`${API}/contract-signatures/${sig.id}/signed-document?format=pdf`);
    if (!r.ok) {
      toast({ title: "שגיאה", description: "לא ניתן להוריד את המסמך החתום.", variant: "destructive" });
      return;
    }
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `signed-contract-${sig.id}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const stats = statsData || { total: 0, pending: 0, signed: 0, declined: 0, expired: 0, avg_days_to_sign: 0 };
  const signatures = sigsData.signatures || [];
  const total = sigsData.total || 0;
  const totalPages = Math.ceil(total / perPage);

  const kpis = [
    { label: "סה\"כ חתימות", value: stats.total, color: "text-blue-400" },
    { label: "ממתינות", value: stats.pending, color: "text-yellow-400" },
    { label: "חתומות", value: stats.signed, color: "text-green-400" },
    { label: "נדחו", value: stats.declined, color: "text-red-400" },
    { label: "זמן ממוצע", value: stats.avg_days_to_sign ? `${stats.avg_days_to_sign} ימים` : "—", color: "text-cyan-400" },
    { label: "תהליכים פעילים", value: (Array.isArray(workflowsData.workflows) ? workflowsData.workflows : []).filter((w: WorkflowRow) => w.status === "in_progress").length, color: "text-purple-400" },
  ];

  const addSigner = () => setForm(f => ({ ...f, signers: [...f.signers, { name: "", email: "", field: `signature_${f.signers.length + 1}` }] }));
  const removeSigner = (i: number) => setForm(f => ({ ...f, signers: f.signers.filter((_, idx) => idx !== i) }));
  const updateSigner = (i: number, field: string, val: string) =>
    setForm(f => ({ ...f, signers: f.signers.map((s, idx) => idx === i ? { ...s, [field]: val } : s) }));

  return (
    <div className="p-6 space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <FileSignature className="h-6 w-6 text-blue-400" />
            חתימות דיגיטליות
          </h1>
          <p className="text-sm text-muted-foreground mt-1">ניהול חתימות אלקטרוניות עם DocuSign, Adobe Sign וחתימה ישראלית</p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="bg-blue-600 hover:bg-blue-700 gap-2">
          <Plus className="h-4 w-4" /> בקשת חתימה חדשה
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map((k, i) => (
          <Card key={i} className="bg-card/80 border-border hover:border-border transition-colors">
            <CardContent className="p-4">
              <p className="text-[11px] text-muted-foreground">{k.label}</p>
              <p className={`text-lg font-bold font-mono mt-1 ${k.color}`}>{k.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="bg-card/60 border-border">
        <CardContent className="p-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
                placeholder="חיפוש לפי שם/אימייל..." className="pr-9 bg-input border-border text-foreground" />
            </div>
            <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
              className="bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground">
              <option value="all">כל הסטטוסים</option>
              {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            {(search || statusFilter !== "all") && (
              <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setStatusFilter("all"); setPage(1); }}
                className="text-red-400 hover:text-red-300 gap-1">
                <X className="h-3 w-3" /> נקה
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card/80 border-border">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center p-12 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin ml-2" /> טוען חתימות...
            </div>
          ) : signatures.length === 0 ? (
            <div className="text-center p-12 text-muted-foreground">
              <FileSignature className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>לא נמצאו חתימות</p>
              <Button onClick={() => setShowCreate(true)} className="mt-4 bg-blue-600 hover:bg-blue-700 gap-2">
                <Plus className="h-4 w-4" /> בקשת חתימה חדשה
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-background/50">
                    <th className="p-3 text-right text-muted-foreground font-medium">#</th>
                    <th className="p-3 text-right text-muted-foreground font-medium">חותם</th>
                    <th className="p-3 text-right text-muted-foreground font-medium">אימייל</th>
                    <th className="p-3 text-right text-muted-foreground font-medium">חוזה</th>
                    <th className="p-3 text-right text-muted-foreground font-medium">ספק</th>
                    <th className="p-3 text-right text-muted-foreground font-medium">נשלח</th>
                    <th className="p-3 text-right text-muted-foreground font-medium">חתם</th>
                    <th className="p-3 text-right text-muted-foreground font-medium">סטטוס</th>
                    <th className="p-3 text-center text-muted-foreground font-medium">פעולות</th>
                  </tr>
                </thead>
                <tbody>
                  {signatures.map((sig: SignatureRow) => (
                    <tr key={sig.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="p-3 font-mono text-xs text-blue-400">{sig.id}</td>
                      <td className="p-3 font-medium text-foreground">{sig.signee_name}</td>
                      <td className="p-3 text-muted-foreground text-xs">{sig.signee_email}</td>
                      <td className="p-3 text-muted-foreground text-xs">{sig.contract_title || sig.contract_number || "—"}</td>
                      <td className="p-3">
                        <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">
                          {PROVIDERS.find(p => p.value === sig.provider)?.label || sig.provider || "מקומי"}
                        </span>
                      </td>
                      <td className="p-3 text-muted-foreground text-xs">
                        {sig.created_at ? new Date(sig.created_at).toLocaleDateString("he-IL") : "—"}
                      </td>
                      <td className="p-3 text-muted-foreground text-xs">
                        {sig.signed_at ? new Date(sig.signed_at).toLocaleDateString("he-IL") : "—"}
                      </td>
                      <td className="p-3">
                        <Badge className={`${STATUS_COLORS[sig.status] || STATUS_COLORS.pending} border text-xs`}>
                          {STATUS_LABELS[sig.status] || sig.status}
                        </Badge>
                      </td>
                      <td className="p-3 text-center">
                        <div className="relative inline-block">
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0"
                            onClick={() => setMenuOpen(menuOpen === sig.id ? null : sig.id)}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                          {menuOpen === sig.id && (
                            <div className="absolute left-0 top-8 z-50 bg-card border border-border rounded-lg shadow-xl py-1 min-w-[150px]"
                              onMouseLeave={() => setMenuOpen(null)}>
                              <button onClick={() => { setShowDetail(sig); setMenuOpen(null); }}
                                className="w-full px-3 py-2 text-right text-sm text-foreground hover:bg-muted flex items-center gap-2">
                                <Eye className="h-4 w-4" /> צפייה
                              </button>
                              {sig.status === "pending" && (
                                <button onClick={() => { setMenuOpen(null); sendReminderMutation.mutate(sig.id); }}
                                  disabled={sendReminderMutation.isPending}
                                  className="w-full px-3 py-2 text-right text-sm text-blue-300 hover:bg-muted flex items-center gap-2">
                                  <Send className="h-4 w-4" /> שלח תזכורת
                                </button>
                              )}
                              <button onClick={() => { setMenuOpen(null); void downloadSignedDocument(sig); }}
                                className="w-full px-3 py-2 text-right text-sm text-foreground hover:bg-muted flex items-center gap-2">
                                <Download className="h-4 w-4" /> הורד
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between p-3 border-t border-border">
              <span className="text-sm text-muted-foreground">
                עמוד {page} מתוך {totalPages} ({total} רשומות)
              </span>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="h-8 w-8 p-0">
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="h-8 w-8 p-0">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {showCreate && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-card border border-border rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="text-lg font-bold text-foreground">בקשת חתימה חדשה</h2>
              <Button variant="ghost" size="sm" onClick={() => setShowCreate(false)}><X className="h-4 w-4" /></Button>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground text-xs">שם תהליך החתימה *</Label>
                  <Input value={form.workflowName} onChange={e => setForm(f => ({ ...f, workflowName: e.target.value }))}
                    placeholder="למשל: חוזה שירות עם לקוח" className="bg-input border-border text-foreground mt-1" />
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs">ספק חתימה</Label>
                  <select value={form.provider} onChange={e => setForm(f => ({ ...f, provider: e.target.value }))}
                    className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1">
                    {PROVIDERS.map(p => <option key={p.value} value={p.value}>{p.label} — {p.desc}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground text-xs">מזהה חוזה (אופציונלי)</Label>
                  <Input type="number" value={form.contractId} onChange={e => setForm(f => ({ ...f, contractId: e.target.value }))}
                    placeholder="מספר חוזה קיים" className="bg-input border-border text-foreground mt-1" />
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs">תפוגה (ימים)</Label>
                  <Input type="number" value={form.expirationDays} onChange={e => setForm(f => ({ ...f, expirationDays: Number(e.target.value) }))}
                    min={1} max={365} className="bg-input border-border text-foreground mt-1" />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-muted-foreground text-xs">חותמים</Label>
                  <Button variant="ghost" size="sm" onClick={addSigner} className="text-blue-400 text-xs gap-1">
                    <Plus className="h-3 w-3" /> הוסף חותם
                  </Button>
                </div>
                <div className="space-y-2">
                  {form.signers.map((s, i) => (
                    <div key={i} className="grid grid-cols-3 gap-2 items-center">
                      <Input value={s.name} onChange={e => updateSigner(i, "name", e.target.value)}
                        placeholder="שם מלא" className="bg-input border-border text-foreground text-sm" />
                      <Input value={s.email} onChange={e => updateSigner(i, "email", e.target.value)}
                        placeholder="אימייל" type="email" className="bg-input border-border text-foreground text-sm" />
                      <div className="flex gap-1">
                        <Input value={s.field} onChange={e => updateSigner(i, "field", e.target.value)}
                          placeholder="שדה חתימה" className="bg-input border-border text-foreground text-sm" />
                        {form.signers.length > 1 && (
                          <Button variant="ghost" size="sm" onClick={() => removeSigner(i)} className="text-red-400 p-1">
                            <X className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input type="checkbox" id="sendReminders" checked={form.sendReminders}
                  onChange={e => setForm(f => ({ ...f, sendReminders: e.target.checked }))} className="rounded" />
                <label htmlFor="sendReminders" className="text-sm text-muted-foreground">שלח תזכורות אוטומטיות</label>
              </div>

              {form.provider !== "local" && (
                <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-blue-300 text-sm">
                    <Shield className="h-4 w-4" />
                    <span>
                      {form.provider === "docusign" && "נדרש חיבור לחשבון DocuSign. הזמנות ישלחו דרך שרתי DocuSign."}
                      {form.provider === "adobe_sign" && "נדרש חיבור לחשבון Adobe Sign."}
                      {form.provider === "gov_il" && "חתימה אלקטרונית מוסמכת לפי תקן ישראלי."}
                    </span>
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 p-4 border-t border-border justify-end">
              <Button variant="outline" onClick={() => setShowCreate(false)} className="border-border">ביטול</Button>
              <Button onClick={() => createWorkflowMutation.mutate(form)}
                disabled={!form.workflowName || createWorkflowMutation.isPending}
                className="bg-blue-600 hover:bg-blue-700 gap-1">
                {createWorkflowMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                שלח לחתימה
              </Button>
            </div>
          </div>
        </div>
      )}

      {showDetail && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setShowDetail(null)}>
          <div className="bg-card border border-border rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-bold text-foreground">פרטי חתימה #{showDetail.id}</h2>
                <Badge className={`${STATUS_COLORS[showDetail.status] || STATUS_COLORS.pending} border text-xs`}>
                  {STATUS_LABELS[showDetail.status] || showDetail.status}
                </Badge>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setShowDetail(null)}><X className="h-4 w-4" /></Button>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "חותם", value: showDetail.signee_name },
                  { label: "אימייל", value: showDetail.signee_email },
                  { label: "ספק", value: PROVIDERS.find(p => p.value === showDetail.provider)?.label || showDetail.provider || "מקומי" },
                  { label: "שדה חתימה", value: showDetail.signature_field },
                  { label: "נשלח", value: showDetail.created_at ? new Date(showDetail.created_at).toLocaleDateString("he-IL") : "—" },
                  { label: "חתם", value: showDetail.signed_at ? new Date(showDetail.signed_at).toLocaleDateString("he-IL") : "טרם חתם" },
                  { label: "תפוגה", value: showDetail.expires_at ? new Date(showDetail.expires_at).toLocaleDateString("he-IL") : "—" },
                  { label: "חוזה", value: showDetail.contract_title || showDetail.contract_number || "—" },
                ].map((f, i) => (
                  <div key={i} className="bg-input rounded-lg p-3">
                    <p className="text-[11px] text-muted-foreground">{f.label}</p>
                    <p className="text-foreground mt-1 font-medium text-sm">{f.value}</p>
                  </div>
                ))}
              </div>
              {showDetail.ip_address && (
                <div className="bg-input rounded-lg p-3">
                  <p className="text-[11px] text-muted-foreground mb-1">אימות</p>
                  <p className="text-xs text-muted-foreground">IP: {showDetail.ip_address}</p>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 p-4 border-t border-border justify-end">
              <Button variant="outline" className="border-border gap-1" onClick={() => void downloadSignedDocument(showDetail)}>
                <Download className="h-4 w-4" /> הורד אישור
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
