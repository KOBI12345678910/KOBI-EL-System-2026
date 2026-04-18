import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import {
  GitCompare, CheckCircle2, AlertTriangle, XCircle, Clock, Search,
  ChevronDown, ChevronUp, X, Settings, Loader2, Save, Eye, Filter,
  DollarSign, Package, FileText, RefreshCw
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

const fmt = (v: number | string | null | undefined) =>
  new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(Number(v || 0));

type LucideIcon = React.ComponentType<{ className?: string }>;

interface MatchResult {
  id: number;
  po_id: number;
  invoice_number: string;
  invoice_date: string | null;
  po_amount: number | string;
  grn_amount: number | string;
  invoice_amount: number | string;
  amount_variance_pct?: number | string;
  match_status: string;
  exception_reason: string | null;
  auto_approved: boolean;
  line_items: MatchLineItem[] | string | null;
  resolved_at?: string | null;
  resolved_by?: string | null;
  resolution_action?: string | null;
  resolution_notes?: string | null;
  created_at: string;
  updated_at: string;
  order_number?: string;
  supplier_name?: string;
}

interface MatchLineItem {
  itemId?: number;
  description?: string;
  item_description?: string;
  orderedQty?: number;
  receivedQty?: number;
  invoiceQty?: number;
  orderedPrice?: number;
  invoicePrice?: number;
  qtyVariance?: number;
  invPriceVariance?: number;
  lineStatus?: string;
  poQty?: number; poUnitPrice?: number; poTotal?: number;
  grnQty?: number;
  invQty?: number; invUnitPrice?: number; invTotal?: number;
  qtyVariancePct?: number; priceVariancePct?: number;
  status?: string;
}

interface MatchConfig {
  quantity_tolerance_pct: number;
  price_tolerance_pct: number;
  amount_tolerance_pct: number;
  auto_approve_within_tolerance: boolean;
}

interface PurchaseOrder {
  id: number;
  order_number?: string;
  orderNumber?: string;
  status: string;
  supplier_name?: string;
  total_amount?: number | string;
  totalAmount?: number | string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: LucideIcon }> = {
  matched: { label: "תואם", color: "bg-green-500/20 text-green-400", icon: CheckCircle2 },
  auto_approved: { label: "אושר אוטומטית", color: "bg-emerald-500/20 text-emerald-400", icon: CheckCircle2 },
  partial_match: { label: "התאמה חלקית", color: "bg-yellow-500/20 text-yellow-400", icon: AlertTriangle },
  exception: { label: "חריגה", color: "bg-red-500/20 text-red-400", icon: XCircle },
  no_grn: { label: "אין קבלת סחורה", color: "bg-orange-500/20 text-orange-400", icon: Package },
  pending: { label: "ממתין", color: "bg-gray-500/20 text-gray-400", icon: Clock },
  resolved_approved: { label: "טופל - אושר", color: "bg-green-500/20 text-green-400", icon: CheckCircle2 },
  resolved_adjusted: { label: "טופל - הותאם", color: "bg-blue-500/20 text-blue-400", icon: CheckCircle2 },
  resolved_rejected: { label: "טופל - נדחה", color: "bg-red-500/20 text-red-400", icon: XCircle },
};

export default function ThreeWayMatchingPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showRunModal, setShowRunModal] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showResolveModal, setShowResolveModal] = useState<MatchResult | null>(null);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [runForm, setRunForm] = useState({ poId: "", invoiceNumber: "", invoiceAmount: "", invoiceDate: "" });
  const [invoiceLines, setInvoiceLines] = useState<Array<{ description: string; quantity: string; unitPrice: string }>>([]);

  const addInvoiceLine = () => setInvoiceLines(prev => [...prev, { description: "", quantity: "", unitPrice: "" }]);
  const removeInvoiceLine = (i: number) => setInvoiceLines(prev => prev.filter((_, idx) => idx !== i));
  const updateInvoiceLine = (i: number, field: string, val: string) =>
    setInvoiceLines(prev => prev.map((l, idx) => idx === i ? { ...l, [field]: val } : l));
  const [resolveForm, setResolveForm] = useState({ resolutionAction: "approve" as "approve" | "adjust" | "reject", resolutionNotes: "" });

  const { data: matchesRaw = [], isLoading } = useQuery({
    queryKey: ["three-way-matching"],
    queryFn: async () => { const r = await authFetch("/api/three-way-matching"); return r.json(); },
  });
  const matches: MatchResult[] = Array.isArray(matchesRaw) ? (matchesRaw as MatchResult[]) : [];

  const { data: stats } = useQuery({
    queryKey: ["three-way-matching-stats"],
    queryFn: async () => { const r = await authFetch("/api/three-way-matching/stats"); return r.json(); },
  });

  const { data: config } = useQuery({
    queryKey: ["three-way-matching-config"],
    queryFn: async () => { const r = await authFetch("/api/three-way-matching/config"); return r.json(); },
  });

  const [configForm, setConfigForm] = useState<MatchConfig | null>(null);
  const effConfig = configForm || config || { quantity_tolerance_pct: 5, price_tolerance_pct: 2, amount_tolerance_pct: 3, auto_approve_within_tolerance: true };

  const { data: posRaw = [] } = useQuery({
    queryKey: ["purchase-orders"],
    queryFn: async () => { const r = await authFetch("/api/purchase-orders"); return r.json(); },
  });
  const pos: PurchaseOrder[] = Array.isArray(posRaw) ? (posRaw as PurchaseOrder[]) : ((posRaw as { data?: PurchaseOrder[] })?.data || []);

  const runMatchMut = useMutation({
    mutationFn: async () => {
      const validLines = invoiceLines.filter(l => l.description || l.quantity || l.unitPrice).map(l => ({
        description: l.description,
        quantity: l.quantity ? parseFloat(l.quantity) : undefined,
        unitPrice: l.unitPrice ? parseFloat(l.unitPrice) : undefined,
        totalPrice: (l.quantity && l.unitPrice) ? parseFloat(l.quantity) * parseFloat(l.unitPrice) : undefined,
      }));
      const r = await authFetch("/api/three-way-matching/run", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          poId: parseInt(runForm.poId),
          invoiceNumber: runForm.invoiceNumber,
          invoiceAmount: parseFloat(runForm.invoiceAmount),
          invoiceDate: runForm.invoiceDate || undefined,
          invoiceLines: validLines.length > 0 ? validLines : undefined,
        }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message); }
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["three-way-matching"] });
      qc.invalidateQueries({ queryKey: ["three-way-matching-stats"] });
      setShowRunModal(false);
      setRunForm({ poId: "", invoiceNumber: "", invoiceAmount: "", invoiceDate: "" });
      setInvoiceLines([]);
    },
  });

  const updateConfigMut = useMutation({
    mutationFn: async () => {
      const r = await authFetch("/api/three-way-matching/config", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quantityTolerancePct: parseFloat(effConfig.quantity_tolerance_pct),
          priceTolerancePct: parseFloat(effConfig.price_tolerance_pct),
          amountTolerancePct: parseFloat(effConfig.amount_tolerance_pct),
          autoApproveWithinTolerance: effConfig.auto_approve_within_tolerance,
        }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message); }
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["three-way-matching-config"] });
      setShowConfigModal(false);
      setConfigForm(null);
    },
  });

  const resolveMut = useMutation({
    mutationFn: async (id: number) => {
      const r = await authFetch(`/api/three-way-matching/${id}/resolve`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(resolveForm),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message); }
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["three-way-matching"] });
      qc.invalidateQueries({ queryKey: ["three-way-matching-stats"] });
      setShowResolveModal(null);
      setResolveForm({ resolutionAction: "approve", resolutionNotes: "" });
    },
  });

  const filtered = useMemo(() => {
    let d = [...matches];
    if (search) {
      const s = search.toLowerCase();
      d = d.filter(m => m.order_number?.toLowerCase().includes(s) || m.invoice_number?.toLowerCase().includes(s) || m.supplier_name?.toLowerCase().includes(s));
    }
    if (statusFilter !== "all") d = d.filter(m => m.match_status === statusFilter);
    return d;
  }, [matches, search, statusFilter]);

  const kpis = [
    { label: "סה\"כ בדיקות", value: stats?.total || 0, color: "text-blue-400", icon: GitCompare },
    { label: "תואם", value: stats?.matched || 0, color: "text-green-400", icon: CheckCircle2 },
    { label: "חלקי", value: stats?.partial || 0, color: "text-yellow-400", icon: AlertTriangle },
    { label: "חריגות", value: stats?.exceptions || 0, color: "text-red-400", icon: XCircle },
    { label: "ממתין", value: stats?.pending || 0, color: "text-gray-400", icon: Clock },
  ];

  const openExceptions = matches.filter(m => ["exception", "partial_match", "no_grn"].includes(m.match_status) && !m.resolved_at);

  return (
    <div className="p-6 space-y-5" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <GitCompare className="h-6 w-6 text-blue-400" />
            התאמה תלת-כיוונית
          </h1>
          <p className="text-sm text-muted-foreground mt-1">השוואת הזמנת רכש, קבלת סחורה וחשבונית ספק</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowConfigModal(true)} className="border-border gap-1 text-xs">
            <Settings className="h-3 w-3" />הגדרות סבילות
          </Button>
          <Button onClick={() => setShowRunModal(true)} className="bg-blue-600 hover:bg-blue-700 gap-2">
            <RefreshCw className="h-4 w-4" />הפעל בדיקת התאמה
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {kpis.map((k, i) => (
          <Card key={i} className="bg-card/80 border-border">
            <CardContent className="p-4">
              <k.icon className={`h-4 w-4 ${k.color} mb-1`} />
              <p className={`text-2xl font-bold ${k.color}`}>{k.value}</p>
              <p className="text-[11px] text-muted-foreground">{k.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {openExceptions.length > 0 && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-4 w-4 text-red-400" />
            <span className="text-red-400 font-medium text-sm">{openExceptions.length} חריגות פתוחות הדורשות טיפול</span>
          </div>
          <div className="flex gap-2 flex-wrap">
            {openExceptions.slice(0, 5).map((ex: MatchResult) => (
              <button key={ex.id} onClick={() => setShowResolveModal(ex)}
                className="text-xs bg-red-500/20 text-red-300 px-2 py-1 rounded hover:bg-red-500/30">
                {ex.order_number} ({ex.invoice_number})
              </button>
            ))}
          </div>
        </div>
      )}

      {config && (
        <div className="grid grid-cols-3 gap-3 text-sm">
          {[
            { label: "סבילות כמות", value: `${config.quantity_tolerance_pct}%` },
            { label: "סבילות מחיר", value: `${config.price_tolerance_pct}%` },
            { label: "סבילות סכום", value: `${config.amount_tolerance_pct}%` },
          ].map((c, i) => (
            <div key={i} className="bg-card/60 border border-border rounded-lg p-3 flex items-center justify-between">
              <span className="text-muted-foreground">{c.label}</span>
              <span className="text-foreground font-bold">{c.value}</span>
            </div>
          ))}
        </div>
      )}

      <Card className="bg-card/60 border-border">
        <CardContent className="p-3">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש..." className="pr-9 bg-input border-border text-foreground" />
            </div>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground">
              <option value="all">כל הסטטוסים</option>
              {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card/80 border-border">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-background/50">
                  {["הזמנת רכש", "ספק", "חשבונית", "סכום PO", "סכום GRN", "סכום חשבונית", "חריגת סכום", "סטטוס", "פעולות"].map(h => (
                    <th key={h} className="p-3 text-right text-muted-foreground font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i} className="border-b border-border/50">
                      <td colSpan={9} className="p-3">
                        <div className="flex gap-4 animate-pulse">{Array.from({ length: 7 }).map((_, j) => <div key={j} className="h-4 bg-muted rounded flex-1" />)}</div>
                      </td>
                    </tr>
                  ))
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={9} className="p-12 text-center">
                    <GitCompare className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
                    <p className="text-muted-foreground">אין תוצאות התאמה</p>
                  </td></tr>
                ) : filtered.map((match: MatchResult) => {
                  const cfg = STATUS_CONFIG[match.match_status] || STATUS_CONFIG.pending;
                  const isException = ["exception", "partial_match", "no_grn"].includes(match.match_status) && !match.resolved_at;
                  const lineItems = typeof match.line_items === "string" ? JSON.parse(match.line_items) : (match.line_items || []);
                  return (
                    <>
                      <tr key={match.id} className={`border-b border-border/50 hover:bg-muted/30 transition-colors ${isException ? "bg-red-500/5" : ""}`}>
                        <td className="p-3 font-mono text-cyan-400 text-xs">{match.order_number}</td>
                        <td className="p-3 text-foreground text-xs">{match.supplier_name || "—"}</td>
                        <td className="p-3 font-mono text-xs text-muted-foreground">{match.invoice_number}</td>
                        <td className="p-3 font-mono text-muted-foreground">{fmt(match.po_amount)}</td>
                        <td className="p-3 font-mono text-muted-foreground">{fmt(match.grn_amount)}</td>
                        <td className="p-3 font-mono text-foreground">{fmt(match.invoice_amount)}</td>
                        <td className="p-3">
                          <span className={`font-mono text-xs ${parseFloat(match.amount_variance_pct) > 5 ? "text-red-400" : parseFloat(match.amount_variance_pct) > 2 ? "text-yellow-400" : "text-green-400"}`}>
                            {match.amount_variance_pct ? `${parseFloat(match.amount_variance_pct).toFixed(1)}%` : "—"}
                          </span>
                        </td>
                        <td className="p-3">
                          <Badge className={`${cfg.color} border-0 text-xs flex items-center gap-1 w-fit`}>
                            <cfg.icon className="h-3 w-3" />{cfg.label}
                          </Badge>
                        </td>
                        <td className="p-3">
                          <div className="flex gap-1">
                            {lineItems.length > 0 && (
                              <button onClick={() => setExpandedRow(expandedRow === match.id ? null : match.id)} className="p-1.5 hover:bg-muted rounded">
                                {expandedRow === match.id ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                              </button>
                            )}
                            {isException && (
                              <button onClick={() => setShowResolveModal(match)} className="p-1.5 hover:bg-red-500/20 rounded">
                                <AlertTriangle className="h-3.5 w-3.5 text-red-400" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {expandedRow === match.id && lineItems.length > 0 && (
                        <tr key={`exp-${match.id}`} className="border-b border-border/50">
                          <td colSpan={9} className="p-0">
                            <div className="bg-background/50 px-4 py-3">
                              <p className="text-xs font-semibold text-muted-foreground mb-2">פירוט שורות</p>
                              <table className="w-full text-xs">
                                <thead><tr className="border-b border-border">
                                  <th className="pb-1 text-right text-muted-foreground">פריט</th>
                                  <th className="pb-1 text-right text-muted-foreground">כמות הזמנה</th>
                                  <th className="pb-1 text-right text-muted-foreground">כמות קבלה</th>
                                  <th className="pb-1 text-right text-muted-foreground">כמות חשבונית</th>
                                  <th className="pb-1 text-right text-muted-foreground">מחיר הזמנה</th>
                                  <th className="pb-1 text-right text-muted-foreground">מחיר חשבונית</th>
                                  <th className="pb-1 text-right text-muted-foreground">חריגת כמות</th>
                                  <th className="pb-1 text-right text-muted-foreground">חריגת מחיר</th>
                                  <th className="pb-1 text-right text-muted-foreground">סטטוס</th>
                                </tr></thead>
                                <tbody>
                                  {lineItems.map((li: MatchLineItem, i: number) => (
                                    <tr key={i} className="border-b border-border/30">
                                      <td className="py-1.5 text-foreground">{li.description}</td>
                                      <td className="py-1.5 font-mono text-muted-foreground">{li.orderedQty}</td>
                                      <td className="py-1.5 font-mono text-muted-foreground">{li.receivedQty ?? "—"}</td>
                                      <td className="py-1.5 font-mono text-muted-foreground">{li.invoiceQty ?? "—"}</td>
                                      <td className="py-1.5 font-mono text-muted-foreground">{li.orderedPrice != null ? fmt(li.orderedPrice) : "—"}</td>
                                      <td className="py-1.5 font-mono text-muted-foreground">{li.invoicePrice != null ? fmt(li.invoicePrice) : "—"}</td>
                                      <td className="py-1.5 font-mono">
                                        <span className={li.qtyVariance > 5 ? "text-red-400" : li.qtyVariance > 0 ? "text-yellow-400" : "text-green-400"}>
                                          {typeof li.qtyVariance === "number" ? li.qtyVariance.toFixed(1) + "%" : "—"}
                                        </span>
                                      </td>
                                      <td className="py-1.5 font-mono">
                                        {li.invPriceVariance != null ? (
                                          <span className={li.invPriceVariance > 2 ? "text-red-400" : li.invPriceVariance > 0 ? "text-yellow-400" : "text-green-400"}>
                                            {li.invPriceVariance.toFixed(1)}%
                                          </span>
                                        ) : "—"}
                                      </td>
                                      <td className="py-1.5">
                                        <Badge className={`${STATUS_CONFIG[li.lineStatus]?.color || "bg-gray-500/20 text-gray-400"} border-0 text-[10px]`}>
                                          {STATUS_CONFIG[li.lineStatus]?.label || li.lineStatus}
                                        </Badge>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                              {match.exception_reason && (
                                <div className="mt-2 p-2 bg-red-500/10 rounded text-xs text-red-300">
                                  <AlertTriangle className="h-3 w-3 inline ml-1" />{match.exception_reason}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {showRunModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setShowRunModal(false)}>
          <div className="bg-card border border-border rounded-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h3 className="font-bold text-foreground">הפעלת בדיקת התאמה</h3>
              <Button variant="ghost" size="sm" onClick={() => setShowRunModal(false)}><X className="h-4 w-4" /></Button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <Label className="text-muted-foreground text-xs">הזמנת רכש *</Label>
                <select value={runForm.poId} onChange={e => setRunForm({ ...runForm, poId: e.target.value })} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1">
                  <option value="">בחר הזמנת רכש...</option>
                  {pos.filter(p => !["בוטל", "טיוטה"].includes(p.status)).map((p: PurchaseOrder) => (
                    <option key={p.id} value={p.id}>{p.order_number || p.orderNumber} - {fmt(p.total_amount ?? p.totalAmount)}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">מספר חשבונית *</Label>
                <Input value={runForm.invoiceNumber} onChange={e => setRunForm({ ...runForm, invoiceNumber: e.target.value })} className="bg-input border-border text-foreground mt-1" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-muted-foreground text-xs">סכום חשבונית (₪) *</Label>
                  <Input type="number" value={runForm.invoiceAmount} onChange={e => setRunForm({ ...runForm, invoiceAmount: e.target.value })} className="bg-input border-border text-foreground mt-1" />
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs">תאריך חשבונית</Label>
                  <Input type="date" value={runForm.invoiceDate} onChange={e => setRunForm({ ...runForm, invoiceDate: e.target.value })} className="bg-input border-border text-foreground mt-1" />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label className="text-muted-foreground text-xs">שורות חשבונית (להתאמה ברמת שורה)</Label>
                  <Button type="button" size="sm" variant="outline" onClick={addInvoiceLine} className="h-6 text-xs border-border px-2">+ שורה</Button>
                </div>
                {invoiceLines.length > 0 && (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {invoiceLines.map((line, i) => (
                      <div key={i} className="flex gap-1 items-center">
                        <Input placeholder="תיאור פריט" value={line.description} onChange={e => updateInvoiceLine(i, "description", e.target.value)} className="bg-input border-border text-foreground text-xs flex-1 h-7 px-2" />
                        <Input type="number" placeholder="כמות" value={line.quantity} onChange={e => updateInvoiceLine(i, "quantity", e.target.value)} className="bg-input border-border text-foreground text-xs w-20 h-7 px-2" />
                        <Input type="number" placeholder="מחיר" value={line.unitPrice} onChange={e => updateInvoiceLine(i, "unitPrice", e.target.value)} className="bg-input border-border text-foreground text-xs w-24 h-7 px-2" />
                        <Button type="button" size="sm" variant="ghost" onClick={() => removeInvoiceLine(i)} className="h-7 w-7 p-0 text-red-400 hover:text-red-300"><X className="h-3 w-3" /></Button>
                      </div>
                    ))}
                  </div>
                )}
                {invoiceLines.length === 0 && (
                  <p className="text-xs text-muted-foreground/60 italic">אופציונלי — הוסף שורות חשבונית לבדיקת התאמה ברמת שורה</p>
                )}
              </div>
            </div>
            <div className="flex gap-2 p-4 border-t border-border justify-end">
              <Button variant="outline" onClick={() => setShowRunModal(false)} className="border-border">ביטול</Button>
              <Button onClick={() => runMatchMut.mutate()}
                disabled={!runForm.poId || !runForm.invoiceNumber || !runForm.invoiceAmount || runMatchMut.isPending}
                className="bg-blue-600 hover:bg-blue-700 gap-1">
                {runMatchMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                הפעל בדיקה
              </Button>
            </div>
          </div>
        </div>
      )}

      {showConfigModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setShowConfigModal(false)}>
          <div className="bg-card border border-border rounded-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h3 className="font-bold text-foreground">הגדרות סבילות התאמה</h3>
              <Button variant="ghost" size="sm" onClick={() => setShowConfigModal(false)}><X className="h-4 w-4" /></Button>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-3 gap-3">
                {[
                  { key: "quantity_tolerance_pct", label: "סבילות כמות (%)" },
                  { key: "price_tolerance_pct", label: "סבילות מחיר (%)" },
                  { key: "amount_tolerance_pct", label: "סבילות סכום (%)" },
                ].map(({ key, label }) => (
                  <div key={key}>
                    <Label className="text-muted-foreground text-xs">{label}</Label>
                    <Input type="number" min={0} max={100} step={0.5}
                      value={effConfig[key] || ""}
                      onChange={e => setConfigForm({ ...effConfig, [key]: e.target.value })}
                      className="bg-input border-border text-foreground mt-1" />
                  </div>
                ))}
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={effConfig.auto_approve_within_tolerance}
                  onChange={e => setConfigForm({ ...effConfig, auto_approve_within_tolerance: e.target.checked })}
                  className="rounded" />
                <span className="text-foreground text-sm">אישור אוטומטי בתוך טווח הסבילות</span>
              </label>
            </div>
            <div className="flex gap-2 p-4 border-t border-border justify-end">
              <Button variant="outline" onClick={() => setShowConfigModal(false)} className="border-border">ביטול</Button>
              <Button onClick={() => updateConfigMut.mutate()} disabled={updateConfigMut.isPending} className="bg-blue-600 hover:bg-blue-700 gap-1">
                {updateConfigMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}שמור
              </Button>
            </div>
          </div>
        </div>
      )}

      {showResolveModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setShowResolveModal(null)}>
          <div className="bg-card border border-border rounded-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h3 className="font-bold text-foreground">טיפול בחריגה — {showResolveModal.order_number}</h3>
              <Button variant="ghost" size="sm" onClick={() => setShowResolveModal(null)}><X className="h-4 w-4" /></Button>
            </div>
            <div className="p-4 space-y-3">
              <div className="bg-red-500/10 rounded-lg p-3 text-sm text-red-300">
                <AlertTriangle className="h-4 w-4 inline ml-2" />{showResolveModal.exception_reason || "חריגה מסבילות"}
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">פעולה</Label>
                <div className="flex gap-2 mt-1">
                  {[
                    { v: "approve", l: "אישור", cls: "border-green-500/30 text-green-400 data-[active=true]:bg-green-500/20" },
                    { v: "adjust", l: "התאמה", cls: "border-blue-500/30 text-blue-400 data-[active=true]:bg-blue-500/20" },
                    { v: "reject", l: "דחייה", cls: "border-red-500/30 text-red-400 data-[active=true]:bg-red-500/20" },
                  ].map(({ v, l, cls }) => (
                    <button key={v} data-active={resolveForm.resolutionAction === v}
                      onClick={() => setResolveForm({ ...resolveForm, resolutionAction: v as "approve" | "adjust" | "reject" })}
                      className={`flex-1 border rounded-lg py-2 text-sm font-medium transition-colors ${cls} ${resolveForm.resolutionAction === v ? "opacity-100" : "opacity-50 hover:opacity-75"}`}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">הערות</Label>
                <textarea rows={2} value={resolveForm.resolutionNotes} onChange={e => setResolveForm({ ...resolveForm, resolutionNotes: e.target.value })}
                  className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1 resize-none" />
              </div>
            </div>
            <div className="flex gap-2 p-4 border-t border-border justify-end">
              <Button variant="outline" onClick={() => setShowResolveModal(null)} className="border-border">ביטול</Button>
              <Button onClick={() => resolveMut.mutate(showResolveModal.id)} disabled={resolveMut.isPending} className="bg-blue-600 hover:bg-blue-700 gap-1">
                {resolveMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}טפל
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
