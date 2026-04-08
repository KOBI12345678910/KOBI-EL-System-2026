import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, RefreshCw, Globe, FileText, FileCheck, Package, Trash2, ChevronDown, ChevronUp, Wand2, CheckCircle2 } from "lucide-react";
import { authFetch } from "@/lib/utils";

const API = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;

const DOC_TYPES = [
  { value: "commercial_invoice", label: "חשבון מסחרי" },
  { value: "packing_list", label: "רשימת אריזה" },
  { value: "certificate_of_origin", label: "תעודת מקור" },
  { value: "full_set", label: "סט מלא" },
];

const INCOTERMS = ["FOB", "CIF", "EXW", "DDP", "DAP", "FCA", "CFR", "CPT", "CIP", "DAT"];
const HS_CODES_COMMON = [
  { code: "7308.30", desc: "דלתות, חלונות, משקופות (פלדה)" },
  { code: "7610.10", desc: "דלתות, חלונות, משקופות (אלומיניום)" },
  { code: "3214.90", desc: "מסטיק זגוגית, מלט שרף" },
  { code: "7007.29", desc: "זכוכית בטיחות — אחרת" },
  { code: "7604.10", desc: "פרופילי אלומיניום" },
];

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-500/20 text-gray-300",
  approved: "bg-green-500/20 text-green-300",
  submitted: "bg-blue-500/20 text-blue-300",
  rejected: "bg-red-500/20 text-red-300",
};
const STATUS_LABELS: Record<string, string> = {
  draft: "טיוטה", approved: "מאושר", submitted: "הוגש", rejected: "נדחה"
};

interface DocItem { id: string; description: string; qty: number; unitPrice: number; weight: number; hsCode: string; length: number; width: number; height: number; countryOfOrigin: string; }
interface CustomsDoc { id: number; doc_number: string; doc_type: string; exporter_name: string; importer_name: string; country_of_destination: string; incoterms: string; customs_value: string; currency: string; status: string; issued_date: string; hs_codes: any[]; commercial_invoice_data: any; packing_list_data: any; certificate_of_origin_data: any; total_weight: string; total_packages: number; }

const EXPORT_COMPLIANCE = [
  "בדיקת סיווג HS תקין",
  "אישור ייצוא מהמשרד לכלכלה",
  "אישור מוצא ישראלי מלשכת המסחר",
  "תנאי Incoterms מוסכמים עם הקונה",
  "ביטוח מטען תקין",
  "רשומון ייצוא ממכס ישראל",
  "בדיקת הגבלות ייצוא (Dual Use)",
  "תאימות תקנות המדינה המקבלת",
];

export default function CrossBorderPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generatedDocs, setGeneratedDocs] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<"docs" | "generate" | "compliance">("docs");
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [showHsCodes, setShowHsCodes] = useState(false);

  const [form, setForm] = useState({
    docType: "commercial_invoice", shipmentRef: "",
    exporterName: "Technokol Industries Ltd.", exporterAddress: "Tel Aviv, Israel", exporterTaxId: "51-1234567",
    importerName: "", importerAddress: "",
    countryOfOrigin: "Israel", countryOfDestination: "", incoterms: "FOB",
    portOfLoading: "Haifa", portOfDischarge: "",
    currency: "USD", notes: "",
    items: [] as DocItem[],
  });

  const { data: docs = [] } = useQuery<CustomsDoc[]>({
    queryKey: ["customs-documents"],
    queryFn: async () => {
      const r = await authFetch(`${API}/customs-documents`);
      if (!r.ok) return [];
      const d = await r.json();
      return Array.isArray(d) ? d : [];
    },
    staleTime: 60_000,
  });

  const { data: stats } = useQuery({
    queryKey: ["customs-documents-stats"],
    queryFn: async () => {
      const r = await authFetch(`${API}/customs-documents/stats`);
      if (!r.ok) return null;
      return r.json();
    },
    staleTime: 60_000,
  });

  function addItem() {
    setForm(f => ({
      ...f,
      items: [...f.items, { id: String(Date.now()), description: "", qty: 1, unitPrice: 0, weight: 0, hsCode: "", length: 0, width: 0, height: 0, countryOfOrigin: "Israel" }]
    }));
  }

  function updateItem(idx: number, key: keyof DocItem, value: any) {
    setForm(f => {
      const items = [...f.items];
      const numKeys: (keyof DocItem)[] = ["qty", "unitPrice", "weight", "length", "width", "height"];
      items[idx] = { ...items[idx], [key]: numKeys.includes(key) ? Number(value) : value };
      return { ...f, items };
    });
  }

  function removeItem(idx: number) {
    setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));
  }

  const totalValue = form.items.reduce((acc, item) => acc + item.qty * item.unitPrice, 0);
  const totalWeight = form.items.reduce((acc, item) => acc + item.weight * item.qty, 0);

  async function handleGenerate() {
    setGenerating(true);
    try {
      const r = await authFetch(`${API}/customs-documents/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, items: form.items }),
      });
      const data = await r.json();
      setGeneratedDocs(data);
    } finally { setGenerating(false); }
  }

  async function handleSave() {
    setSaving(true);
    try {
      await authFetch(`${API}/customs-documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          customsValue: totalValue,
          totalWeight,
          totalPackages: form.items.length,
          hsCodes: form.items.map(i => ({ code: i.hsCode, description: i.description })),
          issuedDate: new Date().toISOString().split("T")[0],
        }),
      });
      setShowForm(false);
      queryClient.invalidateQueries({ queryKey: ["customs-documents"] });
      queryClient.invalidateQueries({ queryKey: ["customs-documents-stats"] });
    } finally { setSaving(false); }
  }

  async function handleStatusChange(id: number, status: string) {
    await authFetch(`${API}/customs-documents/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    queryClient.invalidateQueries({ queryKey: ["customs-documents"] });
      queryClient.invalidateQueries({ queryKey: ["customs-documents-stats"] });
  }

  async function handleDelete(id: number) {
    if (!confirm("למחוק מסמך?")) return;
    await authFetch(`${API}/customs-documents/${id}`, { method: "DELETE" });
    queryClient.invalidateQueries({ queryKey: ["customs-documents"] });
      queryClient.invalidateQueries({ queryKey: ["customs-documents-stats"] });
  }

  function addHsCode(code: string, desc: string) {
    setForm(f => ({
      ...f,
      items: f.items.map((item, i) => i === f.items.length - 1 ? { ...item, hsCode: code, description: desc } : item)
    }));
    setShowHsCodes(false);
  }

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">שילוח בינלאומי ומכס</h1>
          <p className="text-sm text-muted-foreground mt-1">מסמכי מכס, יצוא ישראלי ותאימות בינלאומית</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { queryClient.invalidateQueries({ queryKey: ["customs-documents"] }); queryClient.invalidateQueries({ queryKey: ["customs-documents-stats"] }); }}><RefreshCw className="w-4 h-4 ml-1" />רענן</Button>
          <Button size="sm" className="bg-primary" onClick={() => { setShowForm(true); setActiveTab("generate"); }}><Plus className="w-4 h-4 ml-1" />מסמך חדש</Button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
          {[
            { label: "סה״כ מסמכים", value: stats.total || 0, color: "text-foreground" },
            { label: "חשבוניות", value: stats.invoices || 0, color: "text-blue-400" },
            { label: "רשימות אריזה", value: stats.packing_lists || 0, color: "text-cyan-400" },
            { label: "תעודות מקור", value: stats.coo || 0, color: "text-purple-400" },
            { label: "טיוטות", value: stats.drafts || 0, color: "text-gray-400" },
            { label: "מאושרות", value: stats.approved || 0, color: "text-green-400" },
          ].map(s => (
            <Card key={s.label} className="bg-card/50 border-border/50">
              <CardContent className="p-3 text-center">
                <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
                <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-background/50 p-1 rounded-lg w-fit">
        {[
          { id: "docs", label: "מסמכים קיימים", icon: FileText },
          { id: "generate", label: "יצירת מסמכים", icon: Wand2 },
          { id: "compliance", label: "רשימת ציות", icon: CheckCircle2 },
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm transition-colors ${activeTab === tab.id ? "bg-primary text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            <tab.icon className="w-4 h-4" />{tab.label}
          </button>
        ))}
      </div>

      {/* Documents List */}
      {activeTab === "docs" && (
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-0">
            {docs.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <Globe className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p className="text-lg font-medium">אין מסמכי מכס</p>
                <p className="text-sm mt-1">עבור לטאב "יצירת מסמכים" להתחיל</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50">
                    <th className="text-right p-3 text-muted-foreground">מספר מסמך</th>
                    <th className="text-right p-3 text-muted-foreground">סוג</th>
                    <th className="text-right p-3 text-muted-foreground">יצואן</th>
                    <th className="text-right p-3 text-muted-foreground">יבואן</th>
                    <th className="text-right p-3 text-muted-foreground">יעד</th>
                    <th className="text-right p-3 text-muted-foreground">ערך מכס</th>
                    <th className="text-right p-3 text-muted-foreground">סטטוס</th>
                    <th className="text-center p-3 text-muted-foreground">פעולות</th>
                  </tr>
                </thead>
                <tbody>
                  {docs.map(doc => (
                    <>
                      <tr key={doc.id} className="border-b border-border/30 hover:bg-card/30">
                        <td className="p-3 font-mono text-blue-300">{doc.doc_number}</td>
                        <td className="p-3 text-muted-foreground text-xs">{DOC_TYPES.find(d => d.value === doc.doc_type)?.label || doc.doc_type}</td>
                        <td className="p-3 text-foreground">{doc.exporter_name || "—"}</td>
                        <td className="p-3 text-foreground">{doc.importer_name || "—"}</td>
                        <td className="p-3 text-muted-foreground">{doc.country_of_destination || "—"}</td>
                        <td className="p-3 text-foreground">{Number(doc.customs_value).toLocaleString()} {doc.currency}</td>
                        <td className="p-3"><Badge className={STATUS_COLORS[doc.status] || "bg-gray-500/20 text-gray-300"}>{STATUS_LABELS[doc.status] || doc.status}</Badge></td>
                        <td className="p-3">
                          <div className="flex items-center justify-center gap-1">
                            <Button size="sm" variant="ghost" onClick={() => setExpandedId(expandedId === doc.id ? null : doc.id)}>
                              {expandedId === doc.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            </Button>
                            {doc.status === "draft" && (
                              <Button size="sm" variant="ghost" onClick={() => handleStatusChange(doc.id, "approved")} title="אשר">
                                <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" className="text-red-400" onClick={() => handleDelete(doc.id)}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                      {expandedId === doc.id && (
                        <tr key={`${doc.id}-exp`} className="border-b border-border/20 bg-card/20">
                          <td colSpan={8} className="p-4">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                              <div>
                                <p className="text-muted-foreground font-medium mb-1">פרטי ייצוא</p>
                                <p>Incoterms: <span className="text-foreground">{doc.incoterms}</span></p>
                                <p>נמל העמסה: <span className="text-foreground">{(doc as any).port_of_loading || "—"}</span></p>
                                <p>נמל פריקה: <span className="text-foreground">{(doc as any).port_of_discharge || "—"}</span></p>
                                <p>משקל: <span className="text-foreground">{doc.total_weight} ק״ג</span></p>
                                <p>חבילות: <span className="text-foreground">{doc.total_packages}</span></p>
                              </div>
                              <div>
                                <p className="text-muted-foreground font-medium mb-1">קודי HS</p>
                                {(Array.isArray(doc.hs_codes) ? doc.hs_codes : []).map((hs: any, i: number) => (
                                  <p key={i} className="text-foreground">{hs.code} — {hs.description}</p>
                                ))}
                                {(Array.isArray(doc.hs_codes) ? doc.hs_codes : []).length === 0 && <p className="text-muted-foreground">—</p>}
                              </div>
                              <div>
                                <p className="text-muted-foreground font-medium mb-1">מסמכים שנוצרו</p>
                                {doc.commercial_invoice_data && Object.keys(doc.commercial_invoice_data).length > 0 && <p className="text-green-400">✓ חשבון מסחרי</p>}
                                {doc.packing_list_data && Object.keys(doc.packing_list_data).length > 0 && <p className="text-green-400">✓ רשימת אריזה</p>}
                                {doc.certificate_of_origin_data && Object.keys(doc.certificate_of_origin_data).length > 0 && <p className="text-green-400">✓ תעודת מקור</p>}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Generate Documents Tab */}
      {activeTab === "generate" && (
        <div className="space-y-4">
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-foreground">פרטי היצוא</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">סוג מסמך</label>
                  <select value={form.docType} onChange={e => setForm(f => ({ ...f, docType: e.target.value }))} className="w-full bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground">
                    {DOC_TYPES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">הפניית משלוח</label>
                  <Input value={form.shipmentRef} onChange={e => setForm(f => ({ ...f, shipmentRef: e.target.value }))} placeholder="SHP-2026-0001" className="bg-background/50" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Incoterms</label>
                  <select value={form.incoterms} onChange={e => setForm(f => ({ ...f, incoterms: e.target.value }))} className="w-full bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground">
                    {INCOTERMS.map(i => <option key={i} value={i}>{i}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">יצואן</label>
                  <Input value={form.exporterName} onChange={e => setForm(f => ({ ...f, exporterName: e.target.value }))} className="bg-background/50" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">כתובת יצואן</label>
                  <Input value={form.exporterAddress} onChange={e => setForm(f => ({ ...f, exporterAddress: e.target.value }))} className="bg-background/50" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">יבואן</label>
                  <Input value={form.importerName} onChange={e => setForm(f => ({ ...f, importerName: e.target.value }))} placeholder="שם החברה המקבלת" className="bg-background/50" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">כתובת יבואן</label>
                  <Input value={form.importerAddress} onChange={e => setForm(f => ({ ...f, importerAddress: e.target.value }))} className="bg-background/50" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">מדינת יעד</label>
                  <Input value={form.countryOfDestination} onChange={e => setForm(f => ({ ...f, countryOfDestination: e.target.value }))} placeholder="Germany" className="bg-background/50" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">נמל פריקה</label>
                  <Input value={form.portOfDischarge} onChange={e => setForm(f => ({ ...f, portOfDischarge: e.target.value }))} placeholder="Hamburg" className="bg-background/50" />
                </div>
              </div>

              {/* Items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-foreground">פריטי הסחורה</span>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setShowHsCodes(!showHsCodes)}>
                      <Package className="w-3 h-3 ml-1" />קוד HS
                    </Button>
                    <Button size="sm" variant="outline" onClick={addItem}><Plus className="w-3 h-3 ml-1" />הוסף פריט</Button>
                  </div>
                </div>

                {showHsCodes && (
                  <div className="mb-3 p-3 bg-background/30 rounded-lg">
                    <p className="text-xs text-muted-foreground mb-2">קודי HS נפוצים לתעשיית חלונות/אלומיניום:</p>
                    <div className="space-y-1">
                      {HS_CODES_COMMON.map(hs => (
                        <button key={hs.code} onClick={() => addHsCode(hs.code, hs.desc)}
                          className="w-full text-right text-xs p-2 rounded hover:bg-card/40 flex items-center gap-2">
                          <span className="font-mono text-blue-300">{hs.code}</span>
                          <span className="text-muted-foreground">—</span>
                          <span className="text-foreground">{hs.desc}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {form.items.length === 0 && (
                  <div className="text-center py-6 text-muted-foreground text-sm border border-dashed border-border/40 rounded-lg">לחץ "הוסף פריט"</div>
                )}
                {form.items.map((item, idx) => (
                  <div key={item.id} className="grid grid-cols-7 gap-2 mb-2 items-center">
                    <Input className="col-span-2 bg-background/50 text-xs" placeholder="תיאור הסחורה" value={item.description} onChange={e => updateItem(idx, "description", e.target.value)} />
                    <Input type="number" className="bg-background/50 text-xs" placeholder="כמות" value={item.qty || ""} onChange={e => updateItem(idx, "qty", e.target.value)} />
                    <Input type="number" className="bg-background/50 text-xs" placeholder="מחיר יחידה $" value={item.unitPrice || ""} onChange={e => updateItem(idx, "unitPrice", e.target.value)} />
                    <Input type="number" className="bg-background/50 text-xs" placeholder="משקל ק״ג" value={item.weight || ""} onChange={e => updateItem(idx, "weight", e.target.value)} />
                    <Input className="bg-background/50 text-xs" placeholder="קוד HS" value={item.hsCode} onChange={e => updateItem(idx, "hsCode", e.target.value)} />
                    <Button size="sm" variant="ghost" className="text-red-400" onClick={() => removeItem(idx)}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                ))}

                {form.items.length > 0 && (
                  <div className="flex gap-6 text-sm mt-2 text-muted-foreground">
                    <span>ערך כולל: <strong className="text-foreground">${totalValue.toLocaleString()}</strong></span>
                    <span>משקל כולל: <strong className="text-foreground">{totalWeight.toFixed(2)} ק״ג</strong></span>
                  </div>
                )}
              </div>

              <div className="flex gap-2 justify-end flex-wrap">
                <Button variant="outline" onClick={handleGenerate} disabled={generating}>
                  {generating ? <RefreshCw className="w-4 h-4 ml-1 animate-spin" /> : <Wand2 className="w-4 h-4 ml-1" />}
                  תצוגה מקדימה
                </Button>
                <Button className="bg-primary" onClick={handleSave} disabled={saving}>
                  {saving ? <RefreshCw className="w-4 h-4 ml-1 animate-spin" /> : <FileCheck className="w-4 h-4 ml-1" />}
                  שמור מסמך
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Preview */}
          {generatedDocs && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="bg-card/50 border-border/50">
                <CardHeader className="pb-2"><CardTitle className="text-sm text-foreground">חשבון מסחרי</CardTitle></CardHeader>
                <CardContent className="text-xs space-y-1">
                  <p>מספר: <span className="text-blue-300">{generatedDocs.commercialInvoiceData.invoiceNumber}</span></p>
                  <p>תאריך: {generatedDocs.commercialInvoiceData.date}</p>
                  <p>מוכר: {generatedDocs.commercialInvoiceData.seller?.name}</p>
                  <p>קונה: {generatedDocs.commercialInvoiceData.buyer?.name}</p>
                  <p>Incoterms: {generatedDocs.commercialInvoiceData.incoterms}</p>
                  <p className="font-bold text-green-400 mt-2">סך הכל: ${generatedDocs.commercialInvoiceData.totalAmount} {generatedDocs.commercialInvoiceData.currency}</p>
                  <div className="mt-2 border-t border-border/30 pt-2">
                    {(generatedDocs.commercialInvoiceData.items || []).map((item: any, i: number) => (
                      <div key={i} className="flex justify-between py-0.5">
                        <span className="text-muted-foreground">{item.description} × {item.quantity}</span>
                        <span className="text-foreground">${item.totalPrice}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-card/50 border-border/50">
                <CardHeader className="pb-2"><CardTitle className="text-sm text-foreground">רשימת אריזה</CardTitle></CardHeader>
                <CardContent className="text-xs space-y-1">
                  <p>תאריך: {generatedDocs.packingListData.date}</p>
                  <p>חבילות: {generatedDocs.packingListData.totalBoxes}</p>
                  <p>משקל: {generatedDocs.packingListData.totalWeight} ק״ג</p>
                  <div className="mt-2 border-t border-border/30 pt-2">
                    {(generatedDocs.packingListData.boxes || []).map((box: any, i: number) => (
                      <div key={i} className="py-0.5">
                        <span className="text-muted-foreground">קופסה {box.boxNumber}: </span>
                        <span className="text-foreground">{box.contents} × {box.quantity}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-card/50 border-border/50">
                <CardHeader className="pb-2"><CardTitle className="text-sm text-foreground">תעודת מקור ישראלית</CardTitle></CardHeader>
                <CardContent className="text-xs space-y-1">
                  <p>מספר: <span className="text-blue-300">{generatedDocs.certificateOfOriginData.certificateNumber}</span></p>
                  <p>תאריך: {generatedDocs.certificateOfOriginData.date}</p>
                  <p>יצואן: {generatedDocs.certificateOfOriginData.exporter?.name}</p>
                  <p>גוף מנפיק: {generatedDocs.certificateOfOriginData.chamber}</p>
                  <div className="mt-2 p-2 bg-green-500/10 rounded text-green-300">
                    <p className="font-medium">מדינת מוצא: ישראל</p>
                    <p className="text-xs mt-1">{generatedDocs.certificateOfOriginData.declarationText}</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}

      {/* Compliance Tab */}
      {activeTab === "compliance" && (
        <Card className="bg-card/50 border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-foreground">רשימת ציות — ייצוא ישראלי</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {EXPORT_COMPLIANCE.map((item, idx) => (
              <div
                key={idx}
                className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${checklist[item] ? "bg-green-500/10 border border-green-500/30" : "bg-background/30 border border-border/30 hover:bg-card/40"}`}
                onClick={() => setChecklist(prev => ({ ...prev, [item]: !prev[item] }))}
              >
                {checklist[item] ? (
                  <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0" />
                ) : (
                  <div className="w-5 h-5 border-2 border-border rounded-full flex-shrink-0" />
                )}
                <span className={`text-sm ${checklist[item] ? "text-foreground" : "text-muted-foreground"}`}>{item}</span>
              </div>
            ))}
            <div className="mt-4 p-3 bg-background/30 rounded-lg">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">התקדמות</span>
                <span className="text-foreground">{Object.values(checklist).filter(Boolean).length}/{EXPORT_COMPLIANCE.length}</span>
              </div>
              <div className="w-full bg-background/50 rounded-full h-2 mt-2">
                <div
                  className="h-2 rounded-full bg-green-500 transition-all"
                  style={{ width: `${(Object.values(checklist).filter(Boolean).length / EXPORT_COMPLIANCE.length) * 100}%` }}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
