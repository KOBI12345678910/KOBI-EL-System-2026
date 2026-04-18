import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Plus, Edit, Trash2, Wifi, WifiOff, Settings, FileText, ChevronRight, GripVertical } from "lucide-react";

const BASE = import.meta.env.BASE_URL;
const api = (path: string) => `${BASE}api${path}`;

async function fetchJSON(url: string, opts?: RequestInit) {
  const res = await fetch(url, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts?.headers || {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `HTTP ${res.status}`);
  }
  return res.json();
}

const PROTOCOLS = [
  { value: "webhook", label: "Webhook (HTTP POST)" },
  { value: "sftp", label: "SFTP" },
  { value: "api", label: "API Pickup" },
  { value: "as2", label: "AS2 (Applicability Statement 2)" },
];

const FORMATS = [
  { value: "X12", label: "ANSI X12" },
  { value: "EDIFACT", label: "UN/EDIFACT" },
];

const DOC_TYPES = [
  { value: "850", label: "850 — Purchase Order (X12)" },
  { value: "810", label: "810 — Invoice (X12)" },
  { value: "856", label: "856 — Advance Ship Notice (X12)" },
  { value: "997", label: "997 — Functional Acknowledgment (X12)" },
  { value: "ORDERS", label: "ORDERS — Purchase Order (EDIFACT)" },
  { value: "INVOIC", label: "INVOIC — Invoice (EDIFACT)" },
  { value: "DESADV", label: "DESADV — Despatch Advice (EDIFACT)" },
  { value: "CONTRL", label: "CONTRL — Control Message (EDIFACT)" },
];

function PartnerDialog({ partner, onClose }: { partner?: any; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const isEdit = !!partner;

  const { data: suppliersData } = useQuery<any[]>({
    queryKey: ["suppliers-list"],
    queryFn: () => fetchJSON(api("/suppliers?limit=200")),
    select: (d: any) => d.data ?? d ?? [],
  });

  const [form, setForm] = useState({
    name: partner?.name || "",
    supplierId: partner?.supplierId ? String(partner.supplierId) : "none",
    ediId: partner?.ediId || "",
    ediQualifier: partner?.ediQualifier || "01",
    protocol: partner?.protocol || "webhook",
    webhookUrl: partner?.webhookUrl || "",
    webhookSecret: "",
    sftpHost: partner?.sftpHost || "",
    sftpPort: partner?.sftpPort || 22,
    sftpUsername: partner?.sftpUsername || "",
    sftpPassword: "",
    sftpInboundPath: partner?.sftpInboundPath || "/inbound",
    sftpOutboundPath: partner?.sftpOutboundPath || "/outbound",
    as2Url: partner?.as2Url || "",
    as2FromId: partner?.as2FromId || "",
    as2ToId: partner?.as2ToId || "",
    apiKey: "",
    ediFormat: partner?.ediFormat || "X12",
    supportedDocTypes: partner?.supportedDocTypes || [],
    isActive: partner?.isActive !== false,
    testMode: partner?.testMode || false,
    notes: partner?.notes || "",
  });

  const toggleDocType = (dt: string) => {
    setForm(f => ({
      ...f,
      supportedDocTypes: f.supportedDocTypes.includes(dt)
        ? f.supportedDocTypes.filter((x: string) => x !== dt)
        : [...f.supportedDocTypes, dt],
    }));
  };

  const mutation = useMutation({
    mutationFn: (data: any) => {
      const payload = {
        ...data,
        supplierId: (data.supplierId && data.supplierId !== "none") ? Number(data.supplierId) : null,
      };
      return isEdit
        ? fetchJSON(api(`/edi/trading-partners/${partner.id}`), { method: "PUT", body: JSON.stringify(payload) })
        : fetchJSON(api("/edi/trading-partners"), { method: "POST", body: JSON.stringify(payload) });
    },
    onSuccess: () => {
      toast({ title: isEdit ? "שותף EDI עודכן" : "שותף EDI נוצר" });
      qc.invalidateQueries({ queryKey: ["edi-partners"] });
      onClose();
    },
    onError: (err: any) => toast({ title: "שגיאה", description: err.message, variant: "destructive" }),
  });

  const testMutation = useMutation({
    mutationFn: () => fetchJSON(api(`/edi/trading-partners/${partner?.id}/test`), { method: "POST" }),
    onSuccess: (data) => toast({ title: data.success ? "בדיקת חיבור הצליחה" : "בדיקת חיבור נכשלה", description: data.error || `HTTP ${data.httpStatus || "OK"}` }),
    onError: (err: any) => toast({ title: "שגיאה", description: err.message, variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "עריכת שותף EDI" : "שותף EDI חדש"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>שם השותף *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <Label>ספק מקושר</Label>
              <Select value={form.supplierId} onValueChange={v => setForm(f => ({ ...f, supplierId: v }))}>
                <SelectTrigger><SelectValue placeholder="בחר ספק..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">ללא ספק מקושר</SelectItem>
                  {(suppliersData || []).map((s: any) => (
                    <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>מזהה EDI</Label>
              <Input value={form.ediId} onChange={e => setForm(f => ({ ...f, ediId: e.target.value }))} placeholder="מזהה ייחודי ב-EDI" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>פורמט EDI</Label>
              <Select value={form.ediFormat} onValueChange={v => setForm(f => ({ ...f, ediFormat: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{FORMATS.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>פרוטוקול תקשורת</Label>
              <Select value={form.protocol} onValueChange={v => setForm(f => ({ ...f, protocol: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PROTOCOLS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          {form.protocol === "webhook" && (
            <div className="space-y-3 border rounded-lg p-3 bg-muted/20">
              <p className="text-sm font-medium">הגדרות Webhook</p>
              <div>
                <Label>URL לשליחה</Label>
                <Input value={form.webhookUrl} onChange={e => setForm(f => ({ ...f, webhookUrl: e.target.value }))} placeholder="https://..." />
              </div>
              <div>
                <Label>סוד (Secret)</Label>
                <Input type="password" value={form.webhookSecret} onChange={e => setForm(f => ({ ...f, webhookSecret: e.target.value }))} placeholder={isEdit && partner?.webhookSecret ? "השאר ריק לשמירה על הסוד הקיים" : "הזן סוד..."} />
              </div>
            </div>
          )}

          {form.protocol === "sftp" && (
            <div className="space-y-3 border rounded-lg p-3 bg-muted/20">
              <p className="text-sm font-medium">הגדרות SFTP</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>שרת SFTP</Label>
                  <Input value={form.sftpHost} onChange={e => setForm(f => ({ ...f, sftpHost: e.target.value }))} />
                </div>
                <div>
                  <Label>פורט</Label>
                  <Input type="number" value={form.sftpPort} onChange={e => setForm(f => ({ ...f, sftpPort: Number(e.target.value) }))} />
                </div>
                <div>
                  <Label>שם משתמש</Label>
                  <Input value={form.sftpUsername} onChange={e => setForm(f => ({ ...f, sftpUsername: e.target.value }))} />
                </div>
                <div>
                  <Label>סיסמה</Label>
                  <Input type="password" value={form.sftpPassword} onChange={e => setForm(f => ({ ...f, sftpPassword: e.target.value }))} placeholder={isEdit && partner?.sftpPassword ? "השאר ריק לשמירה על הסיסמה הקיימת" : "הזן סיסמה..."} />
                </div>
                <div>
                  <Label>נתיב נכנס</Label>
                  <Input value={form.sftpInboundPath} onChange={e => setForm(f => ({ ...f, sftpInboundPath: e.target.value }))} />
                </div>
                <div>
                  <Label>נתיב יוצא</Label>
                  <Input value={form.sftpOutboundPath} onChange={e => setForm(f => ({ ...f, sftpOutboundPath: e.target.value }))} />
                </div>
              </div>
            </div>
          )}

          {form.protocol === "as2" && (
            <div className="space-y-3 border rounded-lg p-3 bg-muted/20">
              <p className="text-sm font-medium">הגדרות AS2</p>
              <div>
                <Label>AS2 Endpoint URL</Label>
                <Input value={form.as2Url} onChange={e => setForm(f => ({ ...f, as2Url: e.target.value }))} placeholder="https://partner.example.com/as2" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>AS2 From ID (שולח)</Label>
                  <Input value={form.as2FromId} onChange={e => setForm(f => ({ ...f, as2FromId: e.target.value }))} placeholder="EDI-SENDER-ID" />
                </div>
                <div>
                  <Label>AS2 To ID (מקבל)</Label>
                  <Input value={form.as2ToId} onChange={e => setForm(f => ({ ...f, as2ToId: e.target.value }))} placeholder="EDI-RECEIVER-ID" />
                </div>
              </div>
            </div>
          )}

          {form.protocol === "api" && (
            <div className="space-y-3 border rounded-lg p-3 bg-muted/20">
              <p className="text-sm font-medium">הגדרות API Pickup</p>
              <div>
                <Label>מפתח API (X-EDI-API-Key)</Label>
                <Input type="password" value={form.apiKey} onChange={e => setForm(f => ({ ...f, apiKey: e.target.value }))} placeholder={isEdit && partner?.apiKey ? "השאר ריק לשמירה על המפתח הקיים" : "הזן מפתח API..."} />
              </div>
              <p className="text-xs text-muted-foreground">שותפי API משתמשים בנקודת הקצה GET /api/edi/pickup/:partnerId עם הכותרת X-EDI-API-Key לאיסוף מסמכי EDI</p>
            </div>
          )}

          <div>
            <Label className="mb-2 block">סוגי מסמכים נתמכים</Label>
            <div className="grid grid-cols-2 gap-2">
              {DOC_TYPES.map(dt => (
                <label key={dt.value} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={form.supportedDocTypes.includes(dt.value)} onChange={() => toggleDocType(dt.value)} />
                  {dt.label}
                </label>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Switch checked={form.isActive} onCheckedChange={v => setForm(f => ({ ...f, isActive: v }))} />
              <Label>פעיל</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.testMode} onCheckedChange={v => setForm(f => ({ ...f, testMode: v }))} />
              <Label>מצב בדיקה</Label>
            </div>
          </div>

          <div>
            <Label>הערות</Label>
            <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
          </div>
        </div>
        <DialogFooter className="gap-2">
          {isEdit && (
            <Button variant="outline" onClick={() => testMutation.mutate()} disabled={testMutation.isPending}>
              <Wifi className="h-4 w-4 ml-1" />
              בדיקת חיבור
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>ביטול</Button>
          <Button onClick={() => mutation.mutate(form)} disabled={mutation.isPending || !form.name}>
            {mutation.isPending ? "שומר..." : isEdit ? "עדכן" : "צור"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type FieldMapEntry = { ediField: string; erpField: string };

function MappingDialog({ mapping, partners, onClose }: { mapping?: any; partners: any[]; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const isEdit = !!mapping;

  const initialFieldMaps: FieldMapEntry[] = mapping?.mappingConfig
    ? Object.entries(mapping.mappingConfig as Record<string, string>).map(([ediField, erpField]) => ({ ediField, erpField }))
    : [];

  const [form, setForm] = useState({
    tradingPartnerId: mapping?.tradingPartnerId ? String(mapping.tradingPartnerId) : "none",
    docType: mapping?.docType || "850",
    ediFormat: mapping?.ediFormat || "X12",
    direction: mapping?.direction || "outbound",
    isActive: mapping?.isActive !== false,
    isDefault: mapping?.isDefault || false,
    notes: mapping?.notes || "",
  });

  const [fieldMaps, setFieldMaps] = useState<FieldMapEntry[]>(
    initialFieldMaps.length > 0 ? initialFieldMaps : [{ ediField: "", erpField: "" }]
  );

  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const addFieldMap = () => setFieldMaps(prev => [...prev, { ediField: "", erpField: "" }]);
  const removeFieldMap = (idx: number) => setFieldMaps(prev => prev.filter((_, i) => i !== idx));
  const updateFieldMap = (idx: number, key: keyof FieldMapEntry, value: string) =>
    setFieldMaps(prev => prev.map((fm, i) => i === idx ? { ...fm, [key]: value } : fm));

  const onDragStart = (idx: number) => setDragIndex(idx);
  const onDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === idx) return;
    setFieldMaps(prev => {
      const next = [...prev];
      const [removed] = next.splice(dragIndex, 1);
      next.splice(idx, 0, removed);
      return next;
    });
    setDragIndex(idx);
  };
  const onDragEnd = () => setDragIndex(null);

  const buildPayload = () => {
    const mappingConfig: Record<string, string> = {};
    fieldMaps.forEach(fm => {
      if (fm.ediField.trim() && fm.erpField.trim()) {
        mappingConfig[fm.ediField.trim()] = fm.erpField.trim();
      }
    });
    return {
      ...form,
      tradingPartnerId: (form.tradingPartnerId && form.tradingPartnerId !== "none") ? Number(form.tradingPartnerId) : null,
      mappingConfig,
    };
  };

  const mutation = useMutation({
    mutationFn: (data: any) => isEdit
      ? fetchJSON(api(`/edi/mappings/${mapping.id}`), { method: "PUT", body: JSON.stringify(data) })
      : fetchJSON(api("/edi/mappings"), { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      toast({ title: isEdit ? "מיפוי עודכן" : "מיפוי נוצר" });
      qc.invalidateQueries({ queryKey: ["edi-mappings"] });
      onClose();
    },
    onError: (err: any) => toast({ title: "שגיאה", description: err.message, variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "עריכת מיפוי שדות EDI" : "מיפוי שדות EDI חדש"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>שותף EDI</Label>
            <Select value={String(form.tradingPartnerId)} onValueChange={v => setForm(f => ({ ...f, tradingPartnerId: v }))}>
              <SelectTrigger><SelectValue placeholder="בחר שותף" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">ללא שותף ספציפי</SelectItem>
                {partners.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>סוג מסמך</Label>
              <Select value={form.docType} onValueChange={v => setForm(f => ({ ...f, docType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{DOC_TYPES.map(dt => <SelectItem key={dt.value} value={dt.value}>{dt.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>פורמט</Label>
              <Select value={form.ediFormat} onValueChange={v => setForm(f => ({ ...f, ediFormat: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{FORMATS.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>כיוון</Label>
              <Select value={form.direction} onValueChange={v => setForm(f => ({ ...f, direction: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="outbound">יוצא</SelectItem>
                  <SelectItem value="inbound">נכנס</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="border rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <Label className="font-medium">מיפוי שדות EDI ↔ ERP</Label>
              <Button size="sm" variant="outline" onClick={addFieldMap} type="button">
                <Plus className="h-3 w-3 ml-1" />
                הוסף שדה
              </Button>
            </div>
            <div className="grid gap-1 text-xs text-muted-foreground px-1" style={{ gridTemplateColumns: "20px 1fr 1fr 32px" }}>
              <span></span>
              <span>שדה EDI (מקור)</span>
              <span>שדה ERP (יעד)</span>
              <span></span>
            </div>
            {fieldMaps.map((fm, idx) => (
              <div
                key={idx}
                className={`grid gap-2 items-center rounded ${dragIndex === idx ? "opacity-50 bg-muted" : ""}`}
                style={{ gridTemplateColumns: "20px 1fr 1fr 32px" }}
                draggable
                onDragStart={() => onDragStart(idx)}
                onDragOver={e => onDragOver(e, idx)}
                onDragEnd={onDragEnd}
              >
                <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
                <Input
                  placeholder="לדוגמה: invoiceNumber"
                  value={fm.ediField}
                  onChange={e => updateFieldMap(idx, "ediField", e.target.value)}
                  className="text-sm h-8"
                />
                <Input
                  placeholder="לדוגמה: invoice_number"
                  value={fm.erpField}
                  onChange={e => updateFieldMap(idx, "erpField", e.target.value)}
                  className="text-sm h-8"
                />
                <Button size="sm" variant="ghost" onClick={() => removeFieldMap(idx)} className="h-8 w-8 p-0 flex-shrink-0">
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
            {fieldMaps.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-2">אין מיפויי שדות — לחץ "הוסף שדה"</p>
            )}
          </div>

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Switch checked={form.isActive} onCheckedChange={v => setForm(f => ({ ...f, isActive: v }))} />
              <Label>פעיל</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.isDefault} onCheckedChange={v => setForm(f => ({ ...f, isDefault: v }))} />
              <Label>ברירת מחדל</Label>
            </div>
          </div>
          <div>
            <Label>הערות</Label>
            <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>ביטול</Button>
          <Button onClick={() => mutation.mutate(buildPayload())} disabled={mutation.isPending}>
            {mutation.isPending ? "שומר..." : isEdit ? "עדכן" : "צור"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function EdiAdminPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState("partners");
  const [partnerDialog, setPartnerDialog] = useState<any>(null);
  const [mappingDialog, setMappingDialog] = useState<any>(null);

  const { data: partners = [], isLoading: partnersLoading } = useQuery({
    queryKey: ["edi-partners"],
    queryFn: () => fetchJSON(api("/edi/trading-partners")),
  });

  const { data: mappings = [] } = useQuery({
    queryKey: ["edi-mappings"],
    queryFn: () => fetchJSON(api("/edi/mappings")),
  });

  const deletePartnerMutation = useMutation({
    mutationFn: (id: number) => fetchJSON(api(`/edi/trading-partners/${id}`), { method: "DELETE" }),
    onSuccess: () => { toast({ title: "שותף נמחק" }); qc.invalidateQueries({ queryKey: ["edi-partners"] }); },
    onError: (err: any) => toast({ title: "שגיאה", description: err.message, variant: "destructive" }),
  });

  const deleteMappingMutation = useMutation({
    mutationFn: (id: number) => fetchJSON(api(`/edi/mappings/${id}`), { method: "DELETE" }),
    onSuccess: () => { toast({ title: "מיפוי נמחק" }); qc.invalidateQueries({ queryKey: ["edi-mappings"] }); },
    onError: (err: any) => toast({ title: "שגיאה", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">ניהול EDI</h1>
          <p className="text-muted-foreground">הגדרת שותפי מסחר ומיפויי מסמכים לחילופי נתונים אלקטרוניים</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="partners">שותפי מסחר</TabsTrigger>
          <TabsTrigger value="mappings">מיפויי מסמכים</TabsTrigger>
        </TabsList>

        <TabsContent value="partners" className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">{partners.length} שותפים רשומים</p>
            <Button onClick={() => setPartnerDialog({})}>
              <Plus className="h-4 w-4 ml-1" /> שותף חדש
            </Button>
          </div>

          {partnersLoading ? (
            <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-20 bg-muted/30 rounded-lg animate-pulse" />)}</div>
          ) : partners.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Settings className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p>אין שותפי EDI מוגדרים</p>
                <Button className="mt-4" onClick={() => setPartnerDialog({})}>הוסף שותף ראשון</Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {partners.map((p: any) => (
                <Card key={p.id}>
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className={`p-2 rounded-lg ${p.isActive ? "bg-green-100 text-green-600" : "bg-muted text-muted-foreground"}`}>
                          {p.isActive ? <Wifi className="h-5 w-5" /> : <WifiOff className="h-5 w-5" />}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{p.name}</span>
                            {p.testMode && <Badge variant="outline" className="text-xs">מצב בדיקה</Badge>}
                            {!p.isActive && <Badge variant="secondary">לא פעיל</Badge>}
                          </div>
                          <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
                            <span>{p.ediFormat}</span>
                            <ChevronRight className="h-3 w-3" />
                            <span>{PROTOCOLS.find(pr => pr.value === p.protocol)?.label}</span>
                            {p.ediId && <><ChevronRight className="h-3 w-3" /><span>ID: {p.ediId}</span></>}
                          </div>
                          {Array.isArray(p.supportedDocTypes) && p.supportedDocTypes.length > 0 && (
                            <div className="flex gap-1 mt-2 flex-wrap">
                              {p.supportedDocTypes.map((dt: string) => (
                                <Badge key={dt} variant="outline" className="text-xs">{dt}</Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline" onClick={() => setPartnerDialog(p)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="outline" className="text-destructive hover:bg-destructive/10"
                          onClick={() => { if (confirm("למחוק שותף זה?")) deletePartnerMutation.mutate(p.id); }}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="mappings" className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">{mappings.length} מיפויים רשומים</p>
            <Button onClick={() => setMappingDialog({})}>
              <Plus className="h-4 w-4 ml-1" /> מיפוי חדש
            </Button>
          </div>

          {mappings.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <FileText className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p>אין מיפויי מסמכים מוגדרים</p>
                <Button className="mt-4" onClick={() => setMappingDialog({})}>הוסף מיפוי ראשון</Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {mappings.map((m: any) => {
                const partner = partners.find((p: any) => p.id === m.tradingPartnerId);
                return (
                  <Card key={m.id}>
                    <CardContent className="py-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="p-2 rounded-lg bg-blue-100 text-blue-600">
                            <FileText className="h-5 w-5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{m.docType}</span>
                              <Badge variant={m.direction === "outbound" ? "default" : "secondary"}>
                                {m.direction === "outbound" ? "יוצא" : "נכנס"}
                              </Badge>
                              {m.isDefault && <Badge className="bg-amber-100 text-amber-700 border-amber-200">ברירת מחדל</Badge>}
                              {!m.isActive && <Badge variant="secondary">לא פעיל</Badge>}
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {partner ? partner.name : "כל השותפים"} · {m.ediFormat}
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => setMappingDialog(m)}><Edit className="h-4 w-4" /></Button>
                          <Button size="sm" variant="outline" className="text-destructive hover:bg-destructive/10"
                            onClick={() => { if (confirm("למחוק מיפוי זה?")) deleteMappingMutation.mutate(m.id); }}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {partnerDialog !== null && (
        <PartnerDialog partner={Object.keys(partnerDialog).length ? partnerDialog : undefined} onClose={() => setPartnerDialog(null)} />
      )}
      {mappingDialog !== null && (
        <MappingDialog mapping={Object.keys(mappingDialog).length ? mappingDialog : undefined} partners={partners} onClose={() => setMappingDialog(null)} />
      )}
    </div>
  );
}
