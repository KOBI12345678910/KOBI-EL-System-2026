import { LoadingOverlay } from "@/components/ui/unified-states";
import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Search, Download, Eye, Edit2, Trash2, ChevronRight, ChevronLeft,
  AlertCircle, CheckCircle2, X, Save, Loader2, FlaskConical, FileText,
  ShieldAlert, Package, MapPin, AlertTriangle, Upload, ExternalLink, Clock
} from "lucide-react";
import { authFetch } from "@/lib/utils";

const API = "/api";
const safeArr = (d: any) => Array.isArray(d) ? d : (d?.data ?? []);

const GHS_CLASSES = [
  "פיצוץ", "גז דחוס", "בעיר", "חמצון", "תחת לחץ", "קורוזיבי",
  "רעיל", "מסוכן לבריאות", "מסוכן לסביבה", "מעצבן"
];

const PPE_OPTIONS = [
  "כפפות", "משקפי מגן", "מסכת גז", "חלוק מעבדה", "מגפיים",
  "חליפת הגנה", "מגן פנים", "נשמייה", "אפרון"
];

const PHYSICAL_STATES = ["solid", "liquid", "gas", "powder", "aerosol"];
const PHYSICAL_STATE_HE: Record<string, string> = {
  solid: "מוצק", liquid: "נוזל", gas: "גז", powder: "אבקה", aerosol: "אירוסול"
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-500/20 text-green-300",
  restricted: "bg-yellow-500/20 text-yellow-300",
  requires_update: "bg-blue-500/20 text-blue-300",
  prohibited: "bg-red-500/20 text-red-300",
};
const STATUS_HE: Record<string, string> = {
  active: "פעיל", restricted: "מוגבל", requires_update: "דרוש עדכון", prohibited: "אסור"
};

interface Chemical {
  id: number;
  chemical_name: string;
  trade_name?: string;
  cas_number?: string;
  un_number?: string;
  ghs_hazard_classes?: string[] | string;
  physical_state?: string;
  manufacturer?: string;
  supplier?: string;
  location?: string;
  storage_area?: string;
  quantity?: number;
  unit?: string;
  required_ppe?: string[] | string;
  handling_precautions?: string;
  storage_conditions?: string;
  incompatible_materials?: string;
  spill_response?: string;
  fire_response?: string;
  first_aid_inhalation?: string;
  first_aid_skin?: string;
  first_aid_eyes?: string;
  first_aid_ingestion?: string;
  disposal_method?: string;
  status: string;
  notes?: string;
  created_at?: string;
}

interface MSDSDocument {
  id: number;
  chemical_id: number;
  document_number?: string;
  revision?: string;
  language?: string;
  file_name: string;
  file_path: string;
  file_size?: number;
  issue_date?: string;
  expiry_date?: string;
  supplier?: string;
  is_current: boolean;
  status: string;
  notes?: string;
  created_at?: string;
}

const emptyForm = (): Partial<Chemical> => ({
  chemical_name: "", trade_name: "", cas_number: "", un_number: "",
  ghs_hazard_classes: [], physical_state: "liquid", manufacturer: "", supplier: "",
  location: "", storage_area: "", quantity: 0, unit: "kg", required_ppe: [],
  handling_precautions: "", storage_conditions: "", incompatible_materials: "",
  spill_response: "", fire_response: "", first_aid_inhalation: "", first_aid_skin: "",
  first_aid_eyes: "", first_aid_ingestion: "", disposal_method: "", status: "active", notes: "",
});

function parseArr(val: any): string[] {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === "string") {
    try { const p = JSON.parse(val); if (Array.isArray(p)) return p; } catch {}
    return val.split(",").map(s => s.trim()).filter(Boolean);
  }
  return [];
}

const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString("he-IL") : "—";
const daysUntil = (d?: string): number | null => {
  if (!d) return null;
  return Math.ceil((new Date(d).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
};

// ─── MSDS Upload Modal ─────────────────────────────────────────────────────────
function MSDSUploadModal({ chemical, onClose, onUploaded }: {
  chemical: Chemical;
  onClose: () => void;
  onUploaded: () => void;
}) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [form, setForm] = useState({ document_number: "", revision: "1.0", language: "he", issue_date: "", expiry_date: "", supplier: "", notes: "" });
  const [uploading, setUploading] = useState(false);

  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("chemical_id", String(chemical.id));
      Object.entries(form).forEach(([k, v]) => { if (v) fd.append(k, v); });
      const token = localStorage.getItem("erp_token") || "";
      const res = await fetch(`${API}/hse/msds/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "שגיאה בהעלאה");
      }
      toast({ title: "מסמך MSDS הועלה בהצלחה" });
      onUploaded();
      onClose();
    } catch (e: any) {
      toast({ title: "שגיאה בהעלאה", description: e.message, variant: "destructive" });
    } finally { setUploading(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="p-6" dir="rtl">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-bold text-foreground">העלאת מסמך MSDS</h3>
            <Button variant="ghost" size="sm" onClick={onClose}><X className="w-4 h-4" /></Button>
          </div>
          <p className="text-sm text-muted-foreground mb-4">{chemical.chemical_name}</p>

          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">קובץ MSDS *</label>
              <div
                className="mt-1 border-2 border-dashed border-border/50 rounded-lg p-4 text-center cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => fileRef.current?.click()}
              >
                {file ? (
                  <div className="flex items-center gap-2 justify-center text-sm text-foreground">
                    <FileText className="w-4 h-4 text-primary" />
                    {file.name}
                    <span className="text-muted-foreground">({(file.size / 1024).toFixed(0)} KB)</span>
                  </div>
                ) : (
                  <div className="text-muted-foreground text-sm">
                    <Upload className="w-6 h-6 mx-auto mb-1" />
                    לחץ לבחירת קובץ (PDF, Word, תמונה)
                  </div>
                )}
              </div>
              <input ref={fileRef} type="file" className="hidden" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp"
                onChange={e => setFile(e.target.files?.[0] || null)} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">מספר מסמך</label>
                <Input value={form.document_number} onChange={e => set("document_number", e.target.value)} className="bg-background/50 mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">גרסה</label>
                <Input value={form.revision} onChange={e => set("revision", e.target.value)} className="bg-background/50 mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">תאריך הוצאה</label>
                <Input type="date" value={form.issue_date} onChange={e => set("issue_date", e.target.value)} className="bg-background/50 mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">תאריך תפוגה</label>
                <Input type="date" value={form.expiry_date} onChange={e => set("expiry_date", e.target.value)} className="bg-background/50 mt-1" />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-muted-foreground">שפה</label>
                <select value={form.language} onChange={e => set("language", e.target.value)}
                  className="w-full bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1">
                  <option value="he">עברית</option>
                  <option value="en">אנגלית</option>
                  <option value="ar">ערבית</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="text-xs text-muted-foreground">ספק / יצרן</label>
                <Input value={form.supplier} onChange={e => set("supplier", e.target.value)} className="bg-background/50 mt-1" />
              </div>
            </div>
          </div>

          <div className="flex gap-2 mt-4 justify-end">
            <Button variant="outline" onClick={onClose}>ביטול</Button>
            <Button disabled={!file || uploading} onClick={handleUpload}>
              {uploading ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <Upload className="w-4 h-4 ml-1" />}
              העלה מסמך
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── MSDS Detail Modal ─────────────────────────────────────────────────────────
function MSDSModal({ chemical, onClose }: { chemical: Chemical; onClose: () => void }) {
  const { toast } = useToast();
  const ppe = parseArr(chemical.required_ppe);
  const ghs = parseArr(chemical.ghs_hazard_classes);
  const [docs, setDocs] = useState<MSDSDocument[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [showUpload, setShowUpload] = useState(false);

  const loadDocs = useCallback(async () => {
    setLoadingDocs(true);
    try {
      const res = await authFetch(`${API}/hse/msds/${chemical.id}`);
      const json = await res.json();
      setDocs(Array.isArray(json) ? json : []);
    } catch { setDocs([]); }
    finally { setLoadingDocs(false); }
  }, [chemical.id]);

  useEffect(() => { loadDocs(); }, [loadDocs]);

  const deleteDoc = async (docId: number) => {
    if (!confirm("האם למחוק מסמך זה?")) return;
    try {
      await authFetch(`${API}/hse/msds/doc/${docId}`, { method: "DELETE" });
      toast({ title: "מסמך נמחק" });
      loadDocs();
    } catch {
      toast({ title: "שגיאה במחיקה", variant: "destructive" });
    }
  };

  return (
    <>
      {showUpload && (
        <MSDSUploadModal
          chemical={chemical}
          onClose={() => setShowUpload(false)}
          onUploaded={loadDocs}
        />
      )}
      <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={onClose}>
        <div className="bg-card border border-border rounded-xl w-full max-w-3xl max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
          <div className="p-6" dir="rtl">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h2 className="text-xl font-bold text-foreground">{chemical.chemical_name}</h2>
                {chemical.trade_name && <p className="text-sm text-muted-foreground">{chemical.trade_name}</p>}
                <div className="flex gap-2 mt-2">
                  {chemical.un_number && <Badge variant="outline">UN: {chemical.un_number}</Badge>}
                  {chemical.cas_number && <Badge variant="outline">CAS: {chemical.cas_number}</Badge>}
                  <Badge className={STATUS_COLORS[chemical.status]}>{STATUS_HE[chemical.status]}</Badge>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={onClose}><X className="w-4 h-4" /></Button>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="bg-background/50 rounded-lg p-3">
                <p className="text-xs text-muted-foreground mb-1">מצב פיזי</p>
                <p className="text-sm font-medium text-foreground">{PHYSICAL_STATE_HE[chemical.physical_state || ""] || chemical.physical_state}</p>
              </div>
              <div className="bg-background/50 rounded-lg p-3">
                <p className="text-xs text-muted-foreground mb-1">כמות</p>
                <p className="text-sm font-medium text-foreground">{chemical.quantity} {chemical.unit}</p>
              </div>
              <div className="bg-background/50 rounded-lg p-3">
                <p className="text-xs text-muted-foreground mb-1">מיקום</p>
                <p className="text-sm font-medium text-foreground">{chemical.location || "—"} / {chemical.storage_area || "—"}</p>
              </div>
              <div className="bg-background/50 rounded-lg p-3">
                <p className="text-xs text-muted-foreground mb-1">יצרן / ספק</p>
                <p className="text-sm font-medium text-foreground">{chemical.manufacturer || "—"} / {chemical.supplier || "—"}</p>
              </div>
            </div>

            {ghs.length > 0 && (
              <div className="mb-4">
                <p className="text-sm font-semibold text-foreground mb-2">סיווגי GHS:</p>
                <div className="flex flex-wrap gap-1">{ghs.map(c => <Badge key={c} className="bg-orange-500/20 text-orange-300">{c}</Badge>)}</div>
              </div>
            )}

            {ppe.length > 0 && (
              <div className="mb-4">
                <p className="text-sm font-semibold text-foreground mb-2">ציוד מגן נדרש (PPE):</p>
                <div className="flex flex-wrap gap-1">{ppe.map(p => <Badge key={p} className="bg-blue-500/20 text-blue-300">{p}</Badge>)}</div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-3">
              {[
                { label: "אמצעי טיפול", val: chemical.handling_precautions },
                { label: "תנאי אחסון", val: chemical.storage_conditions },
                { label: "חומרים בלתי תואמים", val: chemical.incompatible_materials },
              ].filter(r => r.val).map(r => (
                <div key={r.label} className="bg-background/50 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-1">{r.label}</p>
                  <p className="text-sm text-foreground">{r.val}</p>
                </div>
              ))}
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3">
              <p className="text-sm font-semibold text-foreground">פרוטוקולי חירום:</p>
              {[
                { label: "תגובה לדליפה", val: chemical.spill_response, color: "text-yellow-300" },
                { label: "תגובה לשריפה", val: chemical.fire_response, color: "text-red-300" },
                { label: "עזרה ראשונה — שאיפה", val: chemical.first_aid_inhalation, color: "text-blue-300" },
                { label: "עזרה ראשונה — עור", val: chemical.first_aid_skin, color: "text-blue-300" },
                { label: "עזרה ראשונה — עיניים", val: chemical.first_aid_eyes, color: "text-blue-300" },
                { label: "עזרה ראשונה — בליעה", val: chemical.first_aid_ingestion, color: "text-blue-300" },
                { label: "סילוק פסולת", val: chemical.disposal_method, color: "text-green-300" },
              ].filter(r => r.val).map(r => (
                <div key={r.label} className="bg-background/50 rounded-lg p-3">
                  <p className={`text-xs font-medium mb-1 ${r.color}`}>{r.label}</p>
                  <p className="text-sm text-foreground">{r.val}</p>
                </div>
              ))}
            </div>

            {/* ── MSDS Document Library ── */}
            <div className="mt-6">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-foreground">מסמכי MSDS:</p>
                <Button size="sm" variant="outline" onClick={() => setShowUpload(true)}>
                  <Upload className="w-3.5 h-3.5 ml-1" />העלאת מסמך
                </Button>
              </div>
              {loadingDocs ? (
                <LoadingOverlay className="min-h-[80px]" />
              ) : docs.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground bg-background/30 rounded-lg">
                  <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">אין מסמכי MSDS</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {docs.map(doc => {
                    const days = daysUntil(doc.expiry_date);
                    const expired = days !== null && days < 0;
                    const expiring = days !== null && days >= 0 && days <= 30;
                    return (
                      <div key={doc.id} className={`flex items-center gap-3 rounded-lg p-3 border ${expired ? "border-red-500/30 bg-red-900/10" : expiring ? "border-yellow-500/30 bg-yellow-900/10" : "border-border/30 bg-background/40"}`}>
                        <FileText className={`w-5 h-5 flex-shrink-0 ${expired ? "text-red-400" : expiring ? "text-yellow-400" : "text-primary"}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-foreground truncate">{doc.file_name}</p>
                            {doc.is_current && <Badge className="text-[10px] bg-green-500/20 text-green-300">עדכני</Badge>}
                            {doc.revision && <Badge variant="outline" className="text-[10px]">v{doc.revision}</Badge>}
                          </div>
                          <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                            {doc.issue_date && <span>הוצא: {fmtDate(doc.issue_date)}</span>}
                            {doc.expiry_date && (
                              <span className={expired ? "text-red-400 font-medium" : expiring ? "text-yellow-400 font-medium" : ""}>
                                {expired ? `פג תוקף לפני ${Math.abs(days!)} ימים` : expiring ? `פג תוקף בעוד ${days} ימים` : `תוקף עד ${fmtDate(doc.expiry_date)}`}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <Button variant="ghost" size="sm" title="פתח מסמך"
                            onClick={() => window.open(doc.file_path, "_blank")}>
                            <ExternalLink className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" title="מחיקה" onClick={() => deleteDoc(doc.id)}>
                            <Trash2 className="w-3.5 h-3.5 text-red-400" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Chemical Form ─────────────────────────────────────────────────────────────
function ChemicalForm({ initial, onSave, onClose }: {
  initial: Partial<Chemical>; onSave: (data: Partial<Chemical>) => Promise<void>; onClose: () => void;
}) {
  const [form, setForm] = useState<Partial<Chemical>>(initial);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof Chemical, v: any) => setForm(f => ({ ...f, [k]: v }));

  const toggleArr = (field: keyof Chemical, val: string) => {
    const arr = parseArr(form[field]);
    set(field, arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val]);
  };

  const handleSave = async () => {
    if (!form.chemical_name?.trim()) return;
    setSaving(true);
    try { await onSave(form); } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl w-full max-w-2xl max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="p-6" dir="rtl">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-bold text-foreground">{initial.id ? "עריכת כימיקל" : "הוספת כימיקל"}</h2>
            <Button variant="ghost" size="sm" onClick={onClose}><X className="w-4 h-4" /></Button>
          </div>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">שם כימיקל *</label>
                <Input value={form.chemical_name || ""} onChange={e => set("chemical_name", e.target.value)} className="bg-background/50 mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">שם מסחרי</label>
                <Input value={form.trade_name || ""} onChange={e => set("trade_name", e.target.value)} className="bg-background/50 mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">מספר CAS</label>
                <Input value={form.cas_number || ""} onChange={e => set("cas_number", e.target.value)} className="bg-background/50 mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">מספר UN</label>
                <Input value={form.un_number || ""} onChange={e => set("un_number", e.target.value)} className="bg-background/50 mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">מצב פיזי</label>
                <select value={form.physical_state || "liquid"} onChange={e => set("physical_state", e.target.value)} className="w-full bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1">
                  {PHYSICAL_STATES.map(s => <option key={s} value={s}>{PHYSICAL_STATE_HE[s]}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">סטטוס</label>
                <select value={form.status || "active"} onChange={e => set("status", e.target.value)} className="w-full bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1">
                  {Object.entries(STATUS_HE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">יצרן</label>
                <Input value={form.manufacturer || ""} onChange={e => set("manufacturer", e.target.value)} className="bg-background/50 mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">ספק</label>
                <Input value={form.supplier || ""} onChange={e => set("supplier", e.target.value)} className="bg-background/50 mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">מיקום</label>
                <Input value={form.location || ""} onChange={e => set("location", e.target.value)} className="bg-background/50 mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">אזור אחסון</label>
                <Input value={form.storage_area || ""} onChange={e => set("storage_area", e.target.value)} className="bg-background/50 mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">כמות</label>
                <Input type="number" value={form.quantity || 0} onChange={e => set("quantity", parseFloat(e.target.value))} className="bg-background/50 mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">יחידה</label>
                <Input value={form.unit || "kg"} onChange={e => set("unit", e.target.value)} className="bg-background/50 mt-1" />
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-foreground">סיווגי GHS</label>
              <div className="flex flex-wrap gap-1 mt-1">
                {GHS_CLASSES.map(c => {
                  const sel = parseArr(form.ghs_hazard_classes).includes(c);
                  return (
                    <button key={c} type="button" onClick={() => toggleArr("ghs_hazard_classes", c)}
                      className={`px-2 py-1 rounded text-xs border transition-colors ${sel ? "bg-orange-500/30 border-orange-500 text-orange-200" : "bg-background/50 border-border text-muted-foreground"}`}>
                      {c}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-foreground">ציוד מגן נדרש (PPE)</label>
              <div className="flex flex-wrap gap-1 mt-1">
                {PPE_OPTIONS.map(p => {
                  const sel = parseArr(form.required_ppe).includes(p);
                  return (
                    <button key={p} type="button" onClick={() => toggleArr("required_ppe", p)}
                      className={`px-2 py-1 rounded text-xs border transition-colors ${sel ? "bg-blue-500/30 border-blue-500 text-blue-200" : "bg-background/50 border-border text-muted-foreground"}`}>
                      {p}
                    </button>
                  );
                })}
              </div>
            </div>

            {([
              { key: "handling_precautions", label: "אמצעי טיפול" },
              { key: "storage_conditions", label: "תנאי אחסון" },
              { key: "incompatible_materials", label: "חומרים בלתי תואמים" },
              { key: "spill_response", label: "תגובה לדליפה" },
              { key: "fire_response", label: "תגובה לשריפה" },
              { key: "first_aid_inhalation", label: "עזרה ראשונה — שאיפה" },
              { key: "first_aid_skin", label: "עזרה ראשונה — עור" },
              { key: "first_aid_eyes", label: "עזרה ראשונה — עיניים" },
              { key: "first_aid_ingestion", label: "עזרה ראשונה — בליעה" },
              { key: "disposal_method", label: "סילוק פסולת" },
              { key: "notes", label: "הערות" },
            ] as { key: keyof Chemical; label: string }[]).map(f => (
              <div key={f.key}>
                <label className="text-xs text-muted-foreground">{f.label}</label>
                <textarea value={(form as any)[f.key] || ""} onChange={e => set(f.key, e.target.value)}
                  rows={2} className="w-full bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1 resize-none" />
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-4 justify-end">
            <Button variant="outline" onClick={onClose}>ביטול</Button>
            <Button onClick={handleSave} disabled={saving || !form.chemical_name?.trim()}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <Save className="w-4 h-4 ml-1" />}שמירה
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function HazardousMaterials() {
  const { toast } = useToast();
  const [chemicals, setChemicals] = useState<Chemical[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [viewChem, setViewChem] = useState<Chemical | null>(null);
  const [editChem, setEditChem] = useState<Partial<Chemical> | null>(null);
  const [expiringMsds, setExpiringMsds] = useState<any[]>([]);
  const perPage = 25;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(perPage), is_active: "true" });
      if (search) params.set("search", search);
      if (statusFilter !== "all") params.set("status", statusFilter);
      const res = await authFetch(`${API}/hse-chemicals?${params}`);
      const json = await res.json();
      setChemicals(safeArr(json));
      setTotal(json.pagination?.total ?? 0);
      setTotalPages(json.pagination?.totalPages ?? 1);
    } catch { toast({ title: "שגיאה", description: "שגיאה בטעינת נתונים", variant: "destructive" }); }
    finally { setLoading(false); }
  }, [page, search, statusFilter, toast]);

  const loadExpiringMsds = useCallback(async () => {
    try {
      const res = await authFetch(`${API}/hse/msds/expiring?days=30`);
      const json = await res.json();
      setExpiringMsds(json.expiring || []);
    } catch { setExpiringMsds([]); }
  }, []);

  useEffect(() => { load(); loadExpiringMsds(); }, [load, loadExpiringMsds]);

  const handleSave = async (data: Partial<Chemical>) => {
    const payload = {
      ...data,
      ghs_hazard_classes: parseArr(data.ghs_hazard_classes),
      required_ppe: parseArr(data.required_ppe),
    };
    const url = data.id ? `${API}/hse-chemicals/${data.id}` : `${API}/hse-chemicals`;
    const method = data.id ? "PUT" : "POST";
    const res = await authFetch(url, { method, body: JSON.stringify(payload) });
    if (!res.ok) throw new Error("שגיאה בשמירה");
    toast({ title: "נשמר בהצלחה" });
    setEditChem(null);
    load();
  };

  const handleDelete = async (id: number) => {
    if (!confirm("האם למחוק כימיקל זה?")) return;
    await authFetch(`${API}/hse-chemicals/${id}`, { method: "DELETE" });
    toast({ title: "נמחק" });
    load();
  };

  const statuses = ["all", "active", "restricted", "requires_update", "prohibited"];
  const statusCounts = statuses.reduce((acc, s) => {
    if (s !== "all") acc[s] = chemicals.filter(c => c.status === s).length;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {viewChem && <MSDSModal chemical={viewChem} onClose={() => { setViewChem(null); loadExpiringMsds(); }} />}
      {editChem && <ChemicalForm initial={editChem} onSave={handleSave} onClose={() => setEditChem(null)} />}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <FlaskConical className="w-7 h-7 text-orange-400" />
            חומרים מסוכנים — MSDS
          </h1>
          <p className="text-sm text-muted-foreground mt-1">מאגר גיליונות בטיחות, מלאי כימיקלים ונהלי חירום</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setEditChem(emptyForm())}>
            <Plus className="w-4 h-4 ml-1" />הוספת כימיקל
          </Button>
        </div>
      </div>

      {expiringMsds.length > 0 && (
        <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-yellow-400" />
            <p className="text-sm font-semibold text-yellow-300">אזהרת תפוגת MSDS — {expiringMsds.length} מסמכים דורשים תשומת לב</p>
          </div>
          <div className="space-y-1.5">
            {expiringMsds.slice(0, 5).map(doc => {
              const days = daysUntil(doc.expiry_date);
              const expired = days !== null && days < 0;
              return (
                <div key={doc.id} className="flex items-center justify-between text-sm">
                  <span className="text-foreground">{doc.chemical_name} — {doc.file_name}</span>
                  <span className={`text-xs font-medium ${expired ? "text-red-400" : "text-yellow-400"}`}>
                    {expired ? `פג לפני ${Math.abs(days!)} ימים` : `פג בעוד ${days} ימים`}
                  </span>
                </div>
              );
            })}
            {expiringMsds.length > 5 && <p className="text-xs text-muted-foreground">ועוד {expiringMsds.length - 5} מסמכים...</p>}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { key: "active", label: "פעיל", icon: CheckCircle2, color: "text-green-400" },
          { key: "restricted", label: "מוגבל", icon: AlertTriangle, color: "text-yellow-400" },
          { key: "requires_update", label: "דרוש עדכון", icon: FileText, color: "text-blue-400" },
          { key: "prohibited", label: "אסור", icon: AlertCircle, color: "text-red-400" },
        ].map(({ key, label, icon: Icon, color }) => (
          <Card key={key} className="bg-card/50 border-border/50 cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => setStatusFilter(statusFilter === key ? "all" : key)}>
            <CardContent className="p-4 flex items-center gap-3">
              <Icon className={`w-8 h-8 ${color} opacity-70`} />
              <div>
                <div className="text-2xl font-bold text-foreground">{statusCounts[key] ?? 0}</div>
                <div className="text-xs text-muted-foreground">{label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="bg-card/50 border-border/50">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 mb-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input placeholder="חיפוש לפי שם, UN, CAS..." value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                className="pr-9 bg-background/50" />
            </div>
            <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
              className="bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground">
              <option value="all">כל הסטטוסים</option>
              {Object.entries(STATUS_HE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>

          {loading ? (
            <LoadingOverlay className="min-h-[200px]" />
          ) : chemicals.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <FlaskConical className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-lg font-medium">אין כימיקלים במאגר</p>
              <p className="text-sm mt-1">לחץ על "הוספת כימיקל" כדי להתחיל</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50">
                    {["שם כימיקל", "מספר UN", "מצב פיזי", "מיקום", "כמות", "GHS", "סטטוס"].map(c => (
                      <th key={c} className="text-right p-3 text-muted-foreground font-medium">{c}</th>
                    ))}
                    <th className="text-center p-3 text-muted-foreground font-medium">פעולות</th>
                  </tr>
                </thead>
                <tbody>
                  {chemicals.map(chem => {
                    const hasExpiringMsds = expiringMsds.some(d => d.chemical_id === chem.id);
                    return (
                      <tr key={chem.id} className="border-b border-border/30 hover:bg-card/30 transition-colors">
                        <td className="p-3">
                          <div className="flex items-center gap-1.5">
                            <div>
                              <div className="font-medium text-foreground">{chem.chemical_name}</div>
                              {chem.trade_name && <div className="text-xs text-muted-foreground">{chem.trade_name}</div>}
                            </div>
                            {hasExpiringMsds && <Clock className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" title="MSDS דורש עדכון" />}
                          </div>
                        </td>
                        <td className="p-3 text-foreground">{chem.un_number || "—"}</td>
                        <td className="p-3 text-foreground">{PHYSICAL_STATE_HE[chem.physical_state || ""] || chem.physical_state || "—"}</td>
                        <td className="p-3 text-foreground">
                          <div className="flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-muted-foreground" />
                            {chem.location || "—"}
                          </div>
                        </td>
                        <td className="p-3 text-foreground">{chem.quantity ?? "—"} {chem.unit}</td>
                        <td className="p-3">
                          <div className="flex flex-wrap gap-0.5">
                            {parseArr(chem.ghs_hazard_classes).slice(0, 2).map(g => (
                              <Badge key={g} className="text-[10px] bg-orange-500/20 text-orange-300">{g}</Badge>
                            ))}
                            {parseArr(chem.ghs_hazard_classes).length > 2 && (
                              <Badge className="text-[10px] bg-muted/50 text-muted-foreground">
                                +{parseArr(chem.ghs_hazard_classes).length - 2}
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="p-3">
                          <Badge className={STATUS_COLORS[chem.status] || "bg-gray-500/20 text-gray-300"}>
                            {STATUS_HE[chem.status] || chem.status}
                          </Badge>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center justify-center gap-1">
                            <Button variant="ghost" size="sm" onClick={() => setViewChem(chem)} title="הצג MSDS">
                              <Eye className="w-3.5 h-3.5" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => setEditChem(chem)} title="עריכה">
                              <Edit2 className="w-3.5 h-3.5" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => handleDelete(chem.id)} title="מחיקה">
                              <Trash2 className="w-3.5 h-3.5 text-red-400" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
            <span>סה"כ {total} רשומות</span>
            <div className="flex gap-1 items-center">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                <ChevronRight className="w-4 h-4" />
              </Button>
              <span className="px-3 py-1">{page} / {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
