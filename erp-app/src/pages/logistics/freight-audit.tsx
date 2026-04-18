import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, RefreshCw, AlertTriangle, CheckCircle2, DollarSign, TrendingDown, FileText, MessageSquare, Trash2, ChevronDown, ChevronUp, BarChart3 } from "lucide-react";
import { authFetch } from "@/lib/utils";

const API = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;

const DISPUTE_STATUS: Record<string, { label: string; color: string }> = {
  none: { label: "ללא מחלוקת", color: "bg-gray-500/20 text-gray-300" },
  open: { label: "פתוח", color: "bg-red-500/20 text-red-300" },
  investigating: { label: "בחקירה", color: "bg-yellow-500/20 text-yellow-300" },
  resolved: { label: "נפתר", color: "bg-green-500/20 text-green-300" },
  closed: { label: "סגור", color: "bg-blue-500/20 text-blue-300" },
};

interface AuditRecord {
  id: number;
  audit_number: string;
  carrier_name: string;
  carrier_display_name: string;
  shipment_ref: string;
  carrier_invoice_id: string;
  invoice_date: string;
  invoice_amount: string;
  expected_amount: string;
  discrepancy_amount: string;
  discrepancy_pct: string;
  currency: string;
  is_flagged: boolean;
  dispute_status: string;
  resolution_notes: string;
  savings_realized: string;
}

interface AuditStats {
  total: number;
  flagged: number;
  open_disputes: number;
  resolved_disputes: number;
  total_discrepancies: string;
  total_savings: string;
}

export default function FreightAuditPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [disputeModal, setDisputeModal] = useState<{ id: number; currentStatus: string } | null>(null);
  const [disputeNotes, setDisputeNotes] = useState("");
  const [savingsModal, setSavingsModal] = useState<number | null>(null);
  const [savingsValue, setSavingsValue] = useState("");
  const [filterFlagged, setFilterFlagged] = useState(false);

  const [form, setForm] = useState({
    carrierName: "", carrierInvoiceId: "", shipmentRef: "",
    invoiceDate: "", invoiceAmount: "", expectedAmount: "",
    currency: "USD", discrepancyThreshold: "5",
  });

  const { data: audits = [] } = useQuery<AuditRecord[]>({
    queryKey: ["freight-audits"],
    queryFn: async () => {
      const r = await authFetch(`${API}/freight-audit`);
      if (!r.ok) return [];
      const d = await r.json();
      return Array.isArray(d) ? d : [];
    },
    staleTime: 60_000,
  });

  const { data: stats } = useQuery<AuditStats | null>({
    queryKey: ["freight-audit-stats"],
    queryFn: async () => {
      const r = await authFetch(`${API}/freight-audit/stats`);
      if (!r.ok) return null;
      return r.json();
    },
    staleTime: 60_000,
  });

  async function handleSubmit() {
    setSaving(true);
    try {
      await authFetch(`${API}/freight-audit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      setShowForm(false);
      setForm({ carrierName: "", carrierInvoiceId: "", shipmentRef: "", invoiceDate: "", invoiceAmount: "", expectedAmount: "", currency: "USD", discrepancyThreshold: "5" });
      queryClient.invalidateQueries({ queryKey: ["freight-audits"] });
      queryClient.invalidateQueries({ queryKey: ["freight-audit-stats"] });
    } finally { setSaving(false); }
  }

  async function handleDisputeUpdate(newStatus: string) {
    if (!disputeModal) return;
    await authFetch(`${API}/freight-audit/${disputeModal.id}/dispute`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus, notes: disputeNotes }),
    });
    setDisputeModal(null);
    setDisputeNotes("");
    queryClient.invalidateQueries({ queryKey: ["freight-audits"] });
      queryClient.invalidateQueries({ queryKey: ["freight-audit-stats"] });
  }

  async function handleSavingsUpdate() {
    if (!savingsModal) return;
    await authFetch(`${API}/freight-audit/${savingsModal}/savings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ savingsRealized: savingsValue }),
    });
    setSavingsModal(null);
    setSavingsValue("");
    queryClient.invalidateQueries({ queryKey: ["freight-audits"] });
      queryClient.invalidateQueries({ queryKey: ["freight-audit-stats"] });
  }

  async function handleDelete(id: number) {
    if (!confirm("למחוק רשומת ביקורת?")) return;
    await authFetch(`${API}/freight-audit/${id}`, { method: "DELETE" });
    queryClient.invalidateQueries({ queryKey: ["freight-audits"] });
      queryClient.invalidateQueries({ queryKey: ["freight-audit-stats"] });
  }

  const displayedAudits = filterFlagged ? audits.filter(a => a.is_flagged) : audits;

  const DISPUTE_FLOW = ["none", "open", "investigating", "resolved", "closed"];

  function discrepancyColor(pct: number) {
    const abs = Math.abs(pct);
    if (abs < 3) return "text-green-400";
    if (abs < 8) return "text-yellow-400";
    return "text-red-400";
  }

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">ביקורת חשבוניות מטען</h1>
          <p className="text-sm text-muted-foreground mt-1">השוואת חשבוניות מובילים, סימון סטיות וניהול מחלוקות</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { queryClient.invalidateQueries({ queryKey: ["freight-audits"] }); queryClient.invalidateQueries({ queryKey: ["freight-audit-stats"] }); }}><RefreshCw className="w-4 h-4 ml-1" />רענן</Button>
          <Button size="sm" className="bg-primary" onClick={() => setShowForm(true)}><Plus className="w-4 h-4 ml-1" />חשבונית חדשה</Button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          {[
            { label: "סה״כ ביקורות", value: stats.total || 0, color: "text-foreground", icon: FileText },
            { label: "מסומנות", value: stats.flagged || 0, color: "text-red-400", icon: AlertTriangle },
            { label: "מחלוקות פתוחות", value: stats.open_disputes || 0, color: "text-yellow-400", icon: MessageSquare },
            { label: "מחלוקות שנפתרו", value: stats.resolved_disputes || 0, color: "text-green-400", icon: CheckCircle2 },
            { label: "סה״כ סטיות ($)", value: `$${Number(stats.total_discrepancies).toLocaleString()}`, color: "text-orange-400", icon: TrendingDown },
            { label: "חיסכון שהושג ($)", value: `$${Number(stats.total_savings).toLocaleString()}`, color: "text-emerald-400", icon: DollarSign },
          ].map(s => (
            <Card key={s.label} className="bg-card/50 border-border/50">
              <CardContent className="p-3 text-center">
                <s.icon className={`w-4 h-4 mx-auto mb-1 ${s.color} opacity-70`} />
                <div className={`text-lg font-bold ${s.color}`}>{s.value}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* New Audit Form */}
      {showForm && (
        <Card className="bg-card/50 border-border/50 border-blue-500/30">
          <CardHeader className="pb-3"><CardTitle className="text-base text-foreground">הוספת חשבונית מוביל</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">שם מוביל *</label>
                <Input value={form.carrierName} onChange={e => setForm(f => ({ ...f, carrierName: e.target.value }))} placeholder="ZIM Shipping" className="bg-background/50" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">מספר חשבונית *</label>
                <Input value={form.carrierInvoiceId} onChange={e => setForm(f => ({ ...f, carrierInvoiceId: e.target.value }))} placeholder="INV-2026-001" className="bg-background/50" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">הפניית משלוח</label>
                <Input value={form.shipmentRef} onChange={e => setForm(f => ({ ...f, shipmentRef: e.target.value }))} placeholder="SHP-2026-0001" className="bg-background/50" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">תאריך חשבונית</label>
                <Input type="date" value={form.invoiceDate} onChange={e => setForm(f => ({ ...f, invoiceDate: e.target.value }))} className="bg-background/50" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">סכום חשבונית *</label>
                <Input type="number" value={form.invoiceAmount} onChange={e => setForm(f => ({ ...f, invoiceAmount: e.target.value }))} placeholder="0.00" className="bg-background/50" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">סכום מוסכם *</label>
                <Input type="number" value={form.expectedAmount} onChange={e => setForm(f => ({ ...f, expectedAmount: e.target.value }))} placeholder="0.00" className="bg-background/50" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">מטבע</label>
                <select value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))} className="w-full bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground">
                  <option value="USD">USD</option><option value="EUR">EUR</option><option value="ILS">ILS</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">סף סימון (%)</label>
                <Input type="number" value={form.discrepancyThreshold} onChange={e => setForm(f => ({ ...f, discrepancyThreshold: e.target.value }))} placeholder="5" className="bg-background/50" />
              </div>
            </div>

            {form.invoiceAmount && form.expectedAmount && (
              <div className="p-3 bg-background/30 rounded-lg text-sm">
                <div className="flex gap-6">
                  <span className="text-muted-foreground">סטייה:
                    <strong className={discrepancyColor((parseFloat(form.invoiceAmount) - parseFloat(form.expectedAmount)) / parseFloat(form.expectedAmount) * 100)}>
                      {" "}${(parseFloat(form.invoiceAmount) - parseFloat(form.expectedAmount)).toFixed(2)}
                    </strong>
                  </span>
                  <span className="text-muted-foreground">אחוז:
                    <strong className={discrepancyColor((parseFloat(form.invoiceAmount) - parseFloat(form.expectedAmount)) / parseFloat(form.expectedAmount) * 100)}>
                      {" "}{(((parseFloat(form.invoiceAmount) - parseFloat(form.expectedAmount)) / parseFloat(form.expectedAmount)) * 100).toFixed(2)}%
                    </strong>
                  </span>
                </div>
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowForm(false)}>ביטול</Button>
              <Button className="bg-primary" onClick={handleSubmit} disabled={saving}>
                {saving ? <RefreshCw className="w-4 h-4 ml-1 animate-spin" /> : <Plus className="w-4 h-4 ml-1" />}
                שמור
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dispute Modal */}
      {disputeModal && (
        <Card className="bg-card/50 border-border/50 border-yellow-500/30">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm text-foreground">ניהול מחלוקת</CardTitle>
              <Button size="sm" variant="ghost" onClick={() => setDisputeModal(null)}>✕</Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2 flex-wrap">
              {DISPUTE_FLOW.filter(s => s !== "none").map(s => (
                <Button key={s} size="sm"
                  className={disputeModal.currentStatus === s ? "bg-primary" : ""}
                  variant={disputeModal.currentStatus === s ? "default" : "outline"}
                  onClick={() => setDisputeModal(prev => prev ? { ...prev, currentStatus: s } : null)}>
                  {DISPUTE_STATUS[s].label}
                </Button>
              ))}
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">הערות</label>
              <textarea value={disputeNotes} onChange={e => setDisputeNotes(e.target.value)}
                className="w-full bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground h-20 resize-none"
                placeholder="פרטי הפעולה / סיכום פתרון..." />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setDisputeModal(null)}>ביטול</Button>
              <Button className="bg-primary" onClick={() => handleDisputeUpdate(disputeModal.currentStatus)}>עדכן סטטוס</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Savings Modal */}
      {savingsModal && (
        <Card className="bg-card/50 border-border/50 border-green-500/30">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm text-foreground">רישום חיסכון</CardTitle>
              <Button size="sm" variant="ghost" onClick={() => setSavingsModal(null)}>✕</Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">סכום חיסכון ($)</label>
              <Input type="number" value={savingsValue} onChange={e => setSavingsValue(e.target.value)} placeholder="0.00" className="bg-background/50" />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setSavingsModal(null)}>ביטול</Button>
              <Button className="bg-primary" onClick={handleSavingsUpdate}>שמור חיסכון</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filter */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setFilterFlagged(!filterFlagged)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors ${filterFlagged ? "bg-red-500/20 text-red-300 border border-red-500/30" : "bg-background/50 text-muted-foreground border border-border/30 hover:text-foreground"}`}>
          <AlertTriangle className="w-4 h-4" />
          {filterFlagged ? "הצג הכל" : "הצג מסומנות בלבד"}
        </button>
        <span className="text-xs text-muted-foreground">
          {displayedAudits.length} רשומות
        </span>
      </div>

      {/* Audit Table */}
      <Card className="bg-card/50 border-border/50">
        <CardContent className="p-0">
          {displayedAudits.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="text-lg font-medium">אין רשומות ביקורת</p>
              <p className="text-sm mt-1">לחץ "חשבונית חדשה" להתחיל</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50">
                  <th className="text-right p-3 text-muted-foreground">מספר ביקורת</th>
                  <th className="text-right p-3 text-muted-foreground">מוביל</th>
                  <th className="text-right p-3 text-muted-foreground">חשבונית</th>
                  <th className="text-right p-3 text-muted-foreground">סכום חשבונית</th>
                  <th className="text-right p-3 text-muted-foreground">סכום מוסכם</th>
                  <th className="text-right p-3 text-muted-foreground">סטייה</th>
                  <th className="text-right p-3 text-muted-foreground">מחלוקת</th>
                  <th className="text-right p-3 text-muted-foreground">חיסכון</th>
                  <th className="text-center p-3 text-muted-foreground">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {displayedAudits.map(audit => {
                  const discPct = parseFloat(audit.discrepancy_pct);
                  return (
                    <>
                      <tr key={audit.id} className={`border-b border-border/30 hover:bg-card/30 ${audit.is_flagged ? "bg-red-500/5" : ""}`}>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            {audit.is_flagged && <AlertTriangle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />}
                            <span className="font-mono text-blue-300 text-xs">{audit.audit_number}</span>
                          </div>
                        </td>
                        <td className="p-3 text-foreground">{audit.carrier_display_name || audit.carrier_name || "—"}</td>
                        <td className="p-3 text-muted-foreground text-xs">{audit.carrier_invoice_id || "—"}</td>
                        <td className="p-3 text-foreground">${Number(audit.invoice_amount).toLocaleString()}</td>
                        <td className="p-3 text-foreground">${Number(audit.expected_amount).toLocaleString()}</td>
                        <td className="p-3">
                          <div className={`font-medium ${discrepancyColor(discPct)}`}>
                            {discPct > 0 ? "+" : ""}{discPct.toFixed(2)}%
                            <div className="text-xs font-normal">
                              ${Number(audit.discrepancy_amount).toFixed(2)}
                            </div>
                          </div>
                        </td>
                        <td className="p-3">
                          <Badge className={DISPUTE_STATUS[audit.dispute_status]?.color || "bg-gray-500/20 text-gray-300"}>
                            {DISPUTE_STATUS[audit.dispute_status]?.label || audit.dispute_status}
                          </Badge>
                        </td>
                        <td className="p-3 text-emerald-400">${Number(audit.savings_realized).toFixed(2)}</td>
                        <td className="p-3">
                          <div className="flex items-center justify-center gap-1">
                            <Button size="sm" variant="ghost" onClick={() => setExpandedId(expandedId === audit.id ? null : audit.id)}>
                              {expandedId === audit.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            </Button>
                            <Button size="sm" variant="ghost" title="ניהול מחלוקת"
                              onClick={() => setDisputeModal({ id: audit.id, currentStatus: audit.dispute_status })}>
                              <MessageSquare className="w-3.5 h-3.5 text-yellow-400" />
                            </Button>
                            <Button size="sm" variant="ghost" title="רשום חיסכון"
                              onClick={() => { setSavingsModal(audit.id); setSavingsValue(audit.savings_realized); }}>
                              <DollarSign className="w-3.5 h-3.5 text-green-400" />
                            </Button>
                            <Button size="sm" variant="ghost" className="text-red-400" onClick={() => handleDelete(audit.id)}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                      {expandedId === audit.id && (
                        <tr key={`${audit.id}-exp`} className="border-b border-border/20 bg-card/20">
                          <td colSpan={9} className="p-4">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                              <div>
                                <p className="text-muted-foreground font-medium mb-2">פרטי חשבונית</p>
                                <p>תאריך חשבונית: <span className="text-foreground">{audit.invoice_date || "—"}</span></p>
                                <p>הפניית משלוח: <span className="text-foreground">{audit.shipment_ref || "—"}</span></p>
                                <p>מטבע: <span className="text-foreground">{audit.currency}</span></p>
                                <p>סף סימון: <span className="text-foreground">{(audit as any).discrepancy_threshold}%</span></p>
                              </div>
                              <div>
                                <p className="text-muted-foreground font-medium mb-2">ניתוח סטייה</p>
                                <div className={`text-2xl font-bold ${discrepancyColor(discPct)}`}>
                                  {discPct > 0 ? "+" : ""}{discPct.toFixed(2)}%
                                </div>
                                <p className="mt-1">סכום סטייה: <span className={discrepancyColor(discPct)}>${Number(audit.discrepancy_amount).toFixed(2)}</span></p>
                                {audit.is_flagged && (
                                  <div className="mt-2 flex items-center gap-1 text-red-400">
                                    <AlertTriangle className="w-3.5 h-3.5" />
                                    <span>מסומן לביקורת — חורג מסף</span>
                                  </div>
                                )}
                              </div>
                              <div>
                                <p className="text-muted-foreground font-medium mb-2">מחלוקת ופתרון</p>
                                <p>סטטוס: <Badge className={DISPUTE_STATUS[audit.dispute_status]?.color || ""}>{DISPUTE_STATUS[audit.dispute_status]?.label}</Badge></p>
                                {audit.resolution_notes && (
                                  <p className="mt-2 text-foreground">{audit.resolution_notes}</p>
                                )}
                                <p className="mt-2">חיסכון שהושג: <span className="text-emerald-400 font-bold">${Number(audit.savings_realized).toFixed(2)}</span></p>
                              </div>
                            </div>

                            {/* Dispute Timeline */}
                            <div className="mt-4">
                              <p className="text-xs text-muted-foreground mb-2">ציר זמן מחלוקת</p>
                              <div className="flex items-center gap-1">
                                {DISPUTE_FLOW.map((s, i) => {
                                  const currentIdx = DISPUTE_FLOW.indexOf(audit.dispute_status);
                                  const isActive = i <= currentIdx;
                                  return (
                                    <div key={s} className="flex items-center gap-1">
                                      <div className={`w-2.5 h-2.5 rounded-full ${isActive ? "bg-primary" : "bg-border"}`} title={DISPUTE_STATUS[s]?.label} />
                                      {i < DISPUTE_FLOW.length - 1 && (
                                        <div className={`h-0.5 w-8 ${i < currentIdx ? "bg-primary" : "bg-border"}`} />
                                      )}
                                    </div>
                                  );
                                })}
                                <span className="mr-2 text-xs text-muted-foreground">
                                  {DISPUTE_STATUS[audit.dispute_status]?.label}
                                </span>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Savings Summary */}
      {stats && (Number(stats.total_savings) > 0 || Number(stats.total_discrepancies) > 0) && (
        <Card className="bg-card/50 border-border/50">
          <CardHeader className="pb-2"><CardTitle className="text-sm text-foreground">סיכום חיסכון</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center">
                <div className="text-3xl font-bold text-red-400">${Number(stats.total_discrepancies).toLocaleString()}</div>
                <div className="text-xs text-muted-foreground mt-1">סה״כ סטיות שזוהו</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-emerald-400">${Number(stats.total_savings).toLocaleString()}</div>
                <div className="text-xs text-muted-foreground mt-1">חיסכון שהושג</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-yellow-400">
                  {Number(stats.total_discrepancies) > 0
                    ? `${((Number(stats.total_savings) / Number(stats.total_discrepancies)) * 100).toFixed(0)}%`
                    : "—"}
                </div>
                <div className="text-xs text-muted-foreground mt-1">אחוז גבייה חזרה</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
