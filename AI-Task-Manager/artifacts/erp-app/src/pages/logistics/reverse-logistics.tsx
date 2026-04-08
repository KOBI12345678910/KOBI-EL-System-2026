import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search, Plus, AlertCircle, Package, RotateCcw, CheckCircle2, Clock, Eye, ChevronLeft, ChevronRight, Truck, FileText, RefreshCw } from "lucide-react";

const API = "/api";

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  requested: { label: "בקשה נשלחה", color: "bg-blue-500/20 text-blue-300" },
  authorized: { label: "אושרה", color: "bg-green-500/20 text-green-300" },
  in_transit: { label: "בדרך חזרה", color: "bg-yellow-500/20 text-yellow-300" },
  received: { label: "התקבלה", color: "bg-purple-500/20 text-purple-300" },
  inspected: { label: "נבדקה", color: "bg-orange-500/20 text-orange-300" },
  resolved: { label: "טופלה", color: "bg-green-500/20 text-green-300" },
  rejected: { label: "נדחתה", color: "bg-red-500/20 text-red-300" },
};

const REASON_CODES = [
  { value: "defective", label: "מוצר פגום" },
  { value: "wrong_item", label: "פריט שגוי" },
  { value: "damaged_shipping", label: "ניזוק בהובלה" },
  { value: "not_as_described", label: "לא תואם תיאור" },
  { value: "changed_mind", label: "חרטה" },
  { value: "duplicate_order", label: "הזמנה כפולה" },
  { value: "other", label: "אחר" },
];

const RESOLUTION_TYPES = [
  { value: "refund", label: "החזר כספי" },
  { value: "replace", label: "החלפה" },
  { value: "repair", label: "תיקון" },
];

interface RMA {
  id: number;
  rma_number?: string;
  original_order_id?: number;
  customer_id?: number;
  customer_name?: string;
  request_date?: string;
  reason_code?: string;
  reason_description?: string;
  status?: string;
  authorized_by_name?: string;
  authorization_date?: string;
  notes?: string;
}

interface RMADetail extends RMA {
  items?: any[];
  shipments?: any[];
}

export default function ReverseLogistics() {
  const [rmas, setRmas] = useState<RMA[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const perPage = 20;
  const [loading, setLoading] = useState(false);
  const [selectedRma, setSelectedRma] = useState<RMADetail | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [showItemDialog, setShowItemDialog] = useState(false);
  const [showShipDialog, setShowShipDialog] = useState(false);
  const [createForm, setCreateForm] = useState({ original_order_id: "", customer_id: "", reason_code: "defective", reason_description: "", notes: "" });
  const [itemForm, setItemForm] = useState({ product_name: "", quantity: "1", condition: "unknown", resolution_type: "refund" });
  const [shipForm, setShipForm] = useState({ carrier: "", tracking_number: "", ship_date: "" });

  useEffect(() => { loadRmas(); }, []);

  async function loadRmas() {
    setLoading(true);
    try {
      const r = await fetch(`${API}/rma`);
      if (r.ok) setRmas(await r.json());
    } catch {}
    setLoading(false);
  }

  async function loadDetail(rma: RMA) {
    try {
      const r = await fetch(`${API}/rma/${rma.id}`);
      if (r.ok) { setSelectedRma(await r.json()); setShowDetailDialog(true); }
    } catch {}
  }

  async function createRma() {
    try {
      const r = await fetch(`${API}/rma`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createForm),
      });
      if (r.ok) {
        setShowCreateDialog(false);
        setCreateForm({ original_order_id: "", customer_id: "", reason_code: "defective", reason_description: "", notes: "" });
        loadRmas();
      }
    } catch {}
  }

  async function updateStatus(id: number, status: string, extra?: any) {
    try {
      const r = await fetch(`${API}/rma/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, ...extra }),
      });
      if (r.ok) { loadRmas(); if (selectedRma) loadDetail(selectedRma); }
    } catch {}
  }

  async function addItem() {
    if (!selectedRma) return;
    try {
      const r = await fetch(`${API}/rma/${selectedRma.id}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(itemForm),
      });
      if (r.ok) { setShowItemDialog(false); setItemForm({ product_name: "", quantity: "1", condition: "unknown", resolution_type: "refund" }); loadDetail(selectedRma); }
    } catch {}
  }

  async function addShipment() {
    if (!selectedRma) return;
    try {
      const r = await fetch(`${API}/rma/${selectedRma.id}/shipments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(shipForm),
      });
      if (r.ok) { setShowShipDialog(false); setShipForm({ carrier: "", tracking_number: "", ship_date: "" }); loadDetail(selectedRma); updateStatus(selectedRma.id, "in_transit"); }
    } catch {}
  }

  const filtered = rmas.filter(r => {
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (search && !([r.rma_number, r.customer_name, r.reason_code].some(v => v?.includes(search)))) return false;
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const pageData = filtered.slice((page - 1) * perPage, page * perPage);

  const requestedCount = rmas.filter(r => r.status === "requested").length;
  const authorizedCount = rmas.filter(r => r.status === "authorized").length;
  const inTransitCount = rmas.filter(r => r.status === "in_transit").length;
  const resolvedCount = rmas.filter(r => r.status === "resolved").length;

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">לוגיסטיקה הפוכה (RMA)</h1>
          <p className="text-sm text-muted-foreground mt-1">ניהול החזרות, אישורי החזרה ועיבוד פתרונות</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadRmas} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ml-1 ${loading ? 'animate-spin' : ''}`} />רענן
          </Button>
          <Button size="sm" className="bg-primary" onClick={() => setShowCreateDialog(true)}>
            <Plus className="w-4 h-4 ml-1" />בקשת החזרה
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <RotateCcw className="w-8 h-8 text-blue-400" />
            <div><div className="text-2xl font-bold text-foreground">{requestedCount}</div><div className="text-xs text-muted-foreground">בקשות פתוחות</div></div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <CheckCircle2 className="w-8 h-8 text-green-400" />
            <div><div className="text-2xl font-bold text-foreground">{authorizedCount}</div><div className="text-xs text-muted-foreground">מאושרות</div></div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <Truck className="w-8 h-8 text-yellow-400" />
            <div><div className="text-2xl font-bold text-foreground">{inTransitCount}</div><div className="text-xs text-muted-foreground">בדרך חזרה</div></div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <Package className="w-8 h-8 text-purple-400" />
            <div><div className="text-2xl font-bold text-foreground">{resolvedCount}</div><div className="text-xs text-muted-foreground">טופלו</div></div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card/50 border-border/50">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 mb-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input placeholder="חיפוש RMA..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9 bg-background/50" />
            </div>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground">
              <option value="all">כל הסטטוסים</option>
              {Object.entries(STATUS_MAP).map(([v, { label }]) => <option key={v} value={v}>{label}</option>)}
            </select>
          </div>

          {pageData.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <AlertCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="text-lg font-medium">אין בקשות החזרה</p>
              <p className="text-sm mt-1">לחץ על "בקשת החזרה" כדי להתחיל</p>
            </div>
          ) : (
            <div className="space-y-2">
              {pageData.map(rma => (
                <div key={rma.id} className="flex items-center justify-between p-3 rounded-lg border border-border/30 hover:bg-card/30 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-orange-500/10 flex items-center justify-center">
                      <RotateCcw className="w-5 h-5 text-orange-400" />
                    </div>
                    <div>
                      <div className="font-medium text-foreground text-sm">{rma.rma_number}</div>
                      <div className="text-xs text-muted-foreground">
                        {rma.customer_name || `לקוח #${rma.customer_id || "—"}`}
                        {rma.request_date && <span className="mr-3"><Clock className="w-3 h-3 inline ml-1" />{new Date(rma.request_date).toLocaleDateString("he-IL")}</span>}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {REASON_CODES.find(r => r.value === rma.reason_code)?.label || rma.reason_code}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={STATUS_MAP[rma.status || "requested"]?.color || "bg-gray-500/20 text-gray-300"}>
                      {STATUS_MAP[rma.status || "requested"]?.label || rma.status}
                    </Badge>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => loadDetail(rma)}><Eye className="w-3.5 h-3.5" /></Button>
                      {rma.status === "requested" && (
                        <Button variant="ghost" size="sm" className="text-green-400 hover:text-green-300" onClick={() => updateStatus(rma.id, "authorized", { authorized_by_name: "מנהל" })}>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
            <span>מציג {Math.min(filtered.length, (page - 1) * perPage + 1)}-{Math.min(filtered.length, page * perPage)} מתוך {filtered.length}</span>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronRight className="w-4 h-4" /></Button>
              <span className="px-3 py-1">{page}/{totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}><ChevronLeft className="w-4 h-4" /></Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader><DialogTitle>בקשת החזרת מוצר (RMA)</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-sm text-muted-foreground">מזהה הזמנה מקורית</label>
                <Input value={createForm.original_order_id} onChange={e => setCreateForm(f => ({ ...f, original_order_id: e.target.value }))} className="mt-1" />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">מזהה לקוח</label>
                <Input value={createForm.customer_id} onChange={e => setCreateForm(f => ({ ...f, customer_id: e.target.value }))} className="mt-1" />
              </div>
            </div>
            <div>
              <label className="text-sm text-muted-foreground">סיבת ההחזרה</label>
              <select value={createForm.reason_code} onChange={e => setCreateForm(f => ({ ...f, reason_code: e.target.value }))} className="w-full mt-1 bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground">
                {REASON_CODES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm text-muted-foreground">תיאור מפורט</label>
              <Input value={createForm.reason_description} onChange={e => setCreateForm(f => ({ ...f, reason_description: e.target.value }))} placeholder="תאר את הבעיה" className="mt-1" />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">הערות</label>
              <Input value={createForm.notes} onChange={e => setCreateForm(f => ({ ...f, notes: e.target.value }))} className="mt-1" />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>ביטול</Button>
              <Button onClick={createRma} className="bg-primary">צור RMA</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
          {selectedRma && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center justify-between">
                  <span>{selectedRma.rma_number}</span>
                  <Badge className={STATUS_MAP[selectedRma.status || "requested"]?.color || ""}>
                    {STATUS_MAP[selectedRma.status || "requested"]?.label}
                  </Badge>
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-muted-foreground">לקוח:</span> <span className="text-foreground">{selectedRma.customer_name || `#${selectedRma.customer_id}`}</span></div>
                  <div><span className="text-muted-foreground">תאריך בקשה:</span> <span className="text-foreground">{selectedRma.request_date ? new Date(selectedRma.request_date).toLocaleDateString("he-IL") : "—"}</span></div>
                  <div><span className="text-muted-foreground">סיבה:</span> <span className="text-foreground">{REASON_CODES.find(r => r.value === selectedRma.reason_code)?.label}</span></div>
                  {selectedRma.authorized_by_name && <div><span className="text-muted-foreground">אושר ע"י:</span> <span className="text-foreground">{selectedRma.authorized_by_name}</span></div>}
                  {selectedRma.reason_description && <div className="col-span-2"><span className="text-muted-foreground">תיאור:</span> <span className="text-foreground">{selectedRma.reason_description}</span></div>}
                </div>

                <div className="flex gap-2 flex-wrap">
                  {selectedRma.status === "requested" && (
                    <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => { updateStatus(selectedRma.id, "authorized", { authorized_by_name: "מנהל" }); setSelectedRma(r => r ? { ...r, status: "authorized" } : r); }}>
                      <CheckCircle2 className="w-4 h-4 ml-1" />אשר RMA
                    </Button>
                  )}
                  {selectedRma.status === "authorized" && (
                    <Button size="sm" variant="outline" onClick={() => setShowShipDialog(true)}>
                      <Truck className="w-4 h-4 ml-1" />תזמן איסוף
                    </Button>
                  )}
                  {selectedRma.status === "in_transit" && (
                    <Button size="sm" variant="outline" onClick={() => { updateStatus(selectedRma.id, "received"); setSelectedRma(r => r ? { ...r, status: "received" } : r); }}>
                      <Package className="w-4 h-4 ml-1" />אשר קבלה
                    </Button>
                  )}
                  {selectedRma.status === "received" && (
                    <Button size="sm" variant="outline" onClick={() => { updateStatus(selectedRma.id, "inspected"); setSelectedRma(r => r ? { ...r, status: "inspected" } : r); }}>
                      <FileText className="w-4 h-4 ml-1" />בצע בדיקה
                    </Button>
                  )}
                  {selectedRma.status === "inspected" && (
                    <Button size="sm" className="bg-primary" onClick={() => { updateStatus(selectedRma.id, "resolved"); setSelectedRma(r => r ? { ...r, status: "resolved" } : r); }}>
                      <CheckCircle2 className="w-4 h-4 ml-1" />סגור ועבד פתרון
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => setShowItemDialog(true)}>
                    <Plus className="w-4 h-4 ml-1" />הוסף פריט
                  </Button>
                </div>

                {(selectedRma.items?.length || 0) > 0 && (
                  <div>
                    <div className="text-sm font-medium text-foreground mb-2">פריטים</div>
                    <div className="space-y-2">
                      {selectedRma.items?.map((item: any) => (
                        <div key={item.id} className="flex items-center justify-between p-2 rounded bg-background/30 text-sm">
                          <div>
                            <span className="text-foreground">{item.product_name || `מוצר #${item.product_id}`}</span>
                            <span className="text-muted-foreground mr-2">כמות: {item.quantity}</span>
                          </div>
                          <div className="flex gap-2">
                            <Badge className="bg-gray-500/20 text-gray-300 text-xs">{item.condition}</Badge>
                            <Badge className="bg-blue-500/20 text-blue-300 text-xs">{RESOLUTION_TYPES.find(r => r.value === item.resolution_type)?.label || item.resolution_type}</Badge>
                            <Badge className={item.resolution_status === "completed" ? "bg-green-500/20 text-green-300 text-xs" : "bg-yellow-500/20 text-yellow-300 text-xs"}>
                              {item.resolution_status}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {(selectedRma.shipments?.length || 0) > 0 && (
                  <div>
                    <div className="text-sm font-medium text-foreground mb-2">משלוחי החזרה</div>
                    <div className="space-y-2">
                      {selectedRma.shipments?.map((s: any) => (
                        <div key={s.id} className="p-2 rounded bg-background/30 text-sm">
                          <div className="flex justify-between">
                            <span className="text-foreground">{s.carrier} — {s.tracking_number}</span>
                            <span className="text-muted-foreground">{s.ship_date ? new Date(s.ship_date).toLocaleDateString("he-IL") : "—"}</span>
                          </div>
                          {s.received_date && <div className="text-xs text-green-400 mt-1">התקבל: {new Date(s.received_date).toLocaleDateString("he-IL")}</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showItemDialog} onOpenChange={setShowItemDialog}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader><DialogTitle>הוסף פריט ל-RMA</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm text-muted-foreground">שם מוצר</label>
              <Input value={itemForm.product_name} onChange={e => setItemForm(f => ({ ...f, product_name: e.target.value }))} className="mt-1" />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">כמות</label>
              <Input type="number" value={itemForm.quantity} onChange={e => setItemForm(f => ({ ...f, quantity: e.target.value }))} className="mt-1" />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">מצב</label>
              <select value={itemForm.condition} onChange={e => setItemForm(f => ({ ...f, condition: e.target.value }))} className="w-full mt-1 bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground">
                <option value="unknown">לא ידוע</option>
                <option value="good">תקין</option>
                <option value="damaged">פגום</option>
                <option value="defective">לא עובד</option>
              </select>
            </div>
            <div>
              <label className="text-sm text-muted-foreground">פתרון מבוקש</label>
              <select value={itemForm.resolution_type} onChange={e => setItemForm(f => ({ ...f, resolution_type: e.target.value }))} className="w-full mt-1 bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground">
                {RESOLUTION_TYPES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setShowItemDialog(false)}>ביטול</Button>
              <Button onClick={addItem} className="bg-primary">הוסף</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showShipDialog} onOpenChange={setShowShipDialog}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader><DialogTitle>תזמן משלוח החזרה</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm text-muted-foreground">חברת שילוח</label>
              <Input value={shipForm.carrier} onChange={e => setShipForm(f => ({ ...f, carrier: e.target.value }))} placeholder="DHL, FedEx, ..." className="mt-1" />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">מספר מעקב</label>
              <Input value={shipForm.tracking_number} onChange={e => setShipForm(f => ({ ...f, tracking_number: e.target.value }))} className="mt-1" />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">תאריך משלוח</label>
              <Input type="date" value={shipForm.ship_date} onChange={e => setShipForm(f => ({ ...f, ship_date: e.target.value }))} className="mt-1" />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setShowShipDialog(false)}>ביטול</Button>
              <Button onClick={addShipment} className="bg-primary"><Truck className="w-4 h-4 ml-1" />תזמן</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
