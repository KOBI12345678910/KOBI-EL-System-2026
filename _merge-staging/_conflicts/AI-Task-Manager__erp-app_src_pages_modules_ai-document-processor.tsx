import { useState, useRef, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload,
  FileText,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Brain,
  Truck,
  Receipt,
  Package,
  Sparkles,
  Clock,
  ChevronDown,
  ChevronUp,
  Eye,
  RefreshCw,
  X,
  ListChecks,
} from "lucide-react";
import { authFetch } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import AttachmentsSection from "@/components/attachments-section";

const API = "/api";

type DocStatus = "pending" | "processing" | "extracted" | "reviewing" | "completed" | "failed";

interface DocRecord {
  id: number;
  file_name: string;
  file_url: string;
  document_type: string | null;
  status: DocStatus;
  extracted_data: any;
  distribution_log: any;
  error_message: string | null;
  created_at: string;
}

interface ExtractedData {
  documentType?: string;
  supplierName?: string | null;
  supplierPhone?: string | null;
  supplierEmail?: string | null;
  supplierAddress?: string | null;
  taxId?: string | null;
  invoiceNumber?: string | null;
  invoiceDate?: string | null;
  dueDate?: string | null;
  paymentTerms?: string | null;
  netAmount?: number | null;
  vatAmount?: number | null;
  totalAmount?: number | null;
  currency?: string;
  items?: Array<{ name: string; quantity?: number; unit?: string; unitPrice?: number; totalPrice?: number }>;
  notes?: string | null;
}

type QueueItemStatus = "waiting" | "uploading" | "processing" | "done" | "failed";

interface QueueItem {
  id: string;
  file: File;
  status: QueueItemStatus;
  docId?: number;
  error?: string;
  extractedData?: ExtractedData;
}

const DOC_TYPE_LABELS: Record<string, string> = {
  "חשבונית": "חשבונית",
  "חוזה": "חוזה",
  "הסכם": "הסכם",
  "קבלה": "קבלה",
  "הזמנת_רכש": "הזמנת רכש",
  "אחר": "מסמך אחר",
};

const STATUS_CONFIG: Record<DocStatus, { label: string; color: string; icon: React.ReactNode }> = {
  pending: { label: "ממתין", color: "text-yellow-400 bg-yellow-400/10", icon: <Clock className="w-3.5 h-3.5" /> },
  processing: { label: "בעיבוד", color: "text-blue-400 bg-blue-400/10", icon: <Loader2 className="w-3.5 h-3.5 animate-spin" /> },
  extracted: { label: "נחלץ", color: "text-violet-400 bg-violet-400/10", icon: <Brain className="w-3.5 h-3.5" /> },
  reviewing: { label: "בסקירה", color: "text-orange-400 bg-orange-400/10", icon: <Eye className="w-3.5 h-3.5" /> },
  completed: { label: "הושלם", color: "text-emerald-400 bg-emerald-400/10", icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
  failed: { label: "נכשל", color: "text-red-400 bg-red-400/10", icon: <AlertCircle className="w-3.5 h-3.5" /> },
};

const QUEUE_STATUS_CONFIG: Record<QueueItemStatus, { label: string; color: string; icon: React.ReactNode }> = {
  waiting: { label: "ממתין", color: "text-yellow-400", icon: <Clock className="w-3.5 h-3.5" /> },
  uploading: { label: "מעלה...", color: "text-blue-400", icon: <Loader2 className="w-3.5 h-3.5 animate-spin" /> },
  processing: { label: "מעבד AI...", color: "text-violet-400", icon: <Brain className="w-3.5 h-3.5 animate-pulse" /> },
  done: { label: "הושלם", color: "text-emerald-400", icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
  failed: { label: "נכשל", color: "text-red-400", icon: <AlertCircle className="w-3.5 h-3.5" /> },
};

function formatCurrency(val: number | null | undefined, currency = "ILS") {
  if (!val) return "—";
  return new Intl.NumberFormat("he-IL", { style: "currency", currency }).format(val);
}

function EditableField({ label, value, onChange }: { label: string; value: any; onChange: (v: any) => void }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <input
        className="bg-muted/30 border border-border rounded-lg px-2.5 py-1.5 text-sm text-foreground focus:outline-none focus:border-primary"
        value={value ?? ""}
        onChange={e => onChange(e.target.value || null)}
      />
    </div>
  );
}

function ExtractionReviewPanel({
  extractedData,
  onUpdate,
  onApprove,
  onBack,
  isDistributing,
}: {
  extractedData: ExtractedData;
  onUpdate: (data: ExtractedData) => void;
  onApprove: () => void;
  onBack: () => void;
  isDistributing: boolean;
}) {
  const [data, setData] = useState<ExtractedData>(extractedData);
  const [showItems, setShowItems] = useState(true);

  const update = (field: keyof ExtractedData, val: any) => {
    const updated = { ...data, [field]: val };
    setData(updated);
    onUpdate(updated);
  };

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-lg font-bold flex items-center gap-2">
          <Brain className="w-5 h-5 text-violet-400" />
          נתונים שחולצו על ידי AI
        </h3>
        <span className="text-xs px-2.5 py-1 rounded-full bg-violet-400/10 text-violet-400">
          {DOC_TYPE_LABELS[data.documentType || "אחר"] || data.documentType || "מסמך"}
        </span>
      </div>

      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Truck className="w-3.5 h-3.5" /> פרטי ספק
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <EditableField label="שם ספק" value={data.supplierName} onChange={v => update("supplierName", v)} />
          <EditableField label="ח.פ. / עוסק מורשה" value={data.taxId} onChange={v => update("taxId", v)} />
          <EditableField label="טלפון" value={data.supplierPhone} onChange={v => update("supplierPhone", v)} />
          <EditableField label="אימייל" value={data.supplierEmail} onChange={v => update("supplierEmail", v)} />
          <div className="col-span-2">
            <EditableField label="כתובת" value={data.supplierAddress} onChange={v => update("supplierAddress", v)} />
          </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Receipt className="w-3.5 h-3.5" /> פרטי מסמך
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <EditableField label="מספר חשבונית" value={data.invoiceNumber} onChange={v => update("invoiceNumber", v)} />
          <EditableField label="תאריך חשבונית" value={data.invoiceDate} onChange={v => update("invoiceDate", v)} />
          <EditableField label="תאריך פירעון" value={data.dueDate} onChange={v => update("dueDate", v)} />
          <EditableField label="תנאי תשלום" value={data.paymentTerms} onChange={v => update("paymentTerms", v)} />
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Receipt className="w-3.5 h-3.5" /> סכומים
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <span className="text-[10px] text-muted-foreground">סכום נטו</span>
            <input type="number" className="block w-full bg-muted/30 border border-border rounded-lg px-2.5 py-1.5 text-sm mt-0.5" value={data.netAmount ?? ""} onChange={e => update("netAmount", e.target.value ? Number(e.target.value) : null)} />
          </div>
          <div>
            <span className="text-[10px] text-muted-foreground">מע"מ (17%)</span>
            <input type="number" className="block w-full bg-muted/30 border border-border rounded-lg px-2.5 py-1.5 text-sm mt-0.5" value={data.vatAmount ?? ""} onChange={e => update("vatAmount", e.target.value ? Number(e.target.value) : null)} />
          </div>
          <div>
            <span className="text-[10px] text-muted-foreground">סה"כ כולל מע"מ</span>
            <input type="number" className="block w-full bg-muted/30 border border-border rounded-lg px-2.5 py-1.5 text-sm mt-0.5 font-bold text-primary" value={data.totalAmount ?? ""} onChange={e => update("totalAmount", e.target.value ? Number(e.target.value) : null)} />
          </div>
        </div>
      </div>

      {(data.items && data.items.length > 0) && (
        <div className="bg-card border border-border rounded-xl p-4 space-y-3">
          <button className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 w-full" onClick={() => setShowItems(!showItems)}>
            <Package className="w-3.5 h-3.5" /> פריטים ({data.items.length})
            {showItems ? <ChevronUp className="w-3.5 h-3.5 mr-auto" /> : <ChevronDown className="w-3.5 h-3.5 mr-auto" />}
          </button>
          <AnimatePresence>
            {showItems && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <div className="space-y-2 pt-1">
                  {data.items.map((item, i) => (
                    <div key={i} className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
                      <div className="col-span-2">
                        <input className="w-full bg-muted/30 border border-border rounded-lg px-2 py-1.5 text-sm" value={item.name} onChange={e => { const items = [...(data.items || [])]; items[i] = { ...item, name: e.target.value }; update("items", items); }} placeholder="שם פריט" />
                      </div>
                      <div>
                        <input type="number" className="w-full bg-muted/30 border border-border rounded-lg px-2 py-1.5 text-sm" value={item.quantity ?? ""} onChange={e => { const items = [...(data.items || [])]; items[i] = { ...item, quantity: Number(e.target.value) }; update("items", items); }} placeholder="כמות" />
                      </div>
                      <div>
                        <input type="number" className="w-full bg-muted/30 border border-border rounded-lg px-2 py-1.5 text-sm" value={item.unitPrice ?? ""} onChange={e => { const items = [...(data.items || [])]; items[i] = { ...item, unitPrice: Number(e.target.value) }; update("items", items); }} placeholder="מחיר ליחידה" />
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-3 text-sm text-blue-300">
        <p className="font-medium mb-1">מה יקרה לאחר האישור:</p>
        <ul className="space-y-1 text-[13px] text-blue-400/80">
          {data.supplierName && <li className="flex items-center gap-1.5"><CheckCircle2 className="w-3 h-3" /> ספק יימצא או ייווצר אוטומטית</li>}
          {(data.totalAmount || data.netAmount) && <li className="flex items-center gap-1.5"><CheckCircle2 className="w-3 h-3" /> רשומת הוצאה תיווצר בכספים</li>}
          {(data.invoiceNumber || data.totalAmount) && <li className="flex items-center gap-1.5"><CheckCircle2 className="w-3 h-3" /> חשבון לתשלום (AP) ייווצר</li>}
          {data.items && data.items.length > 0 && <li className="flex items-center gap-1.5"><CheckCircle2 className="w-3 h-3" /> {data.items.length} פריטים יעודכנו בקטלוג חומרי גלם</li>}
        </ul>
      </div>

      <div className="flex gap-3 pt-2">
        <button onClick={onBack} className="px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground border border-border rounded-xl transition-colors">
          חזור
        </button>
        <button
          onClick={onApprove}
          disabled={isDistributing}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {isDistributing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {isDistributing ? "מפיץ נתונים..." : "אשר והפץ נתונים"}
        </button>
      </div>
    </div>
  );
}

function DistributionResult({ log }: { log: any }) {
  if (!log) return null;
  return (
    <div className="space-y-2 mt-3" dir="rtl">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">לאן הועברו הנתונים:</p>
      <div className="grid grid-cols-2 gap-2">
        {log.supplier && (
          <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-2.5 flex items-center gap-2 text-sm">
            <Truck className="w-4 h-4 text-emerald-400 shrink-0" />
            <div>
              <p className="font-medium text-emerald-400">ספק</p>
              <p className="text-[11px] text-muted-foreground">{log.supplier.isNew ? "נוצר חדש" : "קושר לקיים"} — ID {log.supplier.id}</p>
            </div>
          </div>
        )}
        {log.expense && (
          <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-2.5 flex items-center gap-2 text-sm">
            <Receipt className="w-4 h-4 text-emerald-400 shrink-0" />
            <div>
              <p className="font-medium text-emerald-400">הוצאה</p>
              <p className="text-[11px] text-muted-foreground">ID {log.expense.id}</p>
            </div>
          </div>
        )}
        {log.accountsPayable && (
          <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-2.5 flex items-center gap-2 text-sm">
            <Receipt className="w-4 h-4 text-emerald-400 shrink-0" />
            <div>
              <p className="font-medium text-emerald-400">חשבון לתשלום (AP)</p>
              <p className="text-[11px] text-muted-foreground">ID {log.accountsPayable.id}</p>
            </div>
          </div>
        )}
        {log.rawMaterials && log.rawMaterials.count > 0 && (
          <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-2.5 flex items-center gap-2 text-sm">
            <Package className="w-4 h-4 text-emerald-400 shrink-0" />
            <div>
              <p className="font-medium text-emerald-400">חומרי גלם</p>
              <p className="text-[11px] text-muted-foreground">{log.rawMaterials.count} פריטים עודכנו</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AIDocumentProcessorPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const dropRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [activeDoc, setActiveDoc] = useState<{ id: number; extractedData: ExtractedData } | null>(null);
  const [reviewData, setReviewData] = useState<ExtractedData | null>(null);
  const [expandedHistory, setExpandedHistory] = useState<number | null>(null);
  const [detailTab, setDetailTab] = useState("details");

  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isQueueRunning, setIsQueueRunning] = useState(false);
  const [bulkApproving, setBulkApproving] = useState(false);

  const { data: history = [], isLoading: historyLoading } = useQuery<DocRecord[]>({
    queryKey: ["ai-doc-history"],
    queryFn: async () => {
      const r = await authFetch(`${API}/ai-documents/history`);
      if (!r.ok) throw new Error("Failed to load history");
      return r.json();
    },
    staleTime: 15000,
    refetchInterval: 30000,
  });

  const distributeMutation = useMutation({
    mutationFn: async ({ docId, data }: { docId: number; data: ExtractedData }) => {
      const r = await authFetch(`${API}/ai-documents/distribute/${docId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ extractedData: data }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error || "Distribution failed"); }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-doc-history"] });
      toast({ title: "הנתונים הופצו בהצלחה!", description: "כל הנתונים נשמרו בכל המודולים הרלוונטיים" });
      setActiveDoc(null);
      setReviewData(null);
    },
    onError: (err: Error) => toast({ title: "שגיאה בהפצה", description: err.message, variant: "destructive" }),
  });

  const updateQueueItem = useCallback((id: string, updates: Partial<QueueItem>) => {
    setQueue(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item));
  }, []);

  const processQueue = useCallback(async (items: QueueItem[]) => {
    setIsQueueRunning(true);

    if (items.length === 1) {
      const item = items[0];
      try {
        updateQueueItem(item.id, { status: "uploading" });
        const formData = new FormData();
        formData.append("file", item.file);
        const uploadRes = await authFetch(`${API}/ai-documents/upload`, { method: "POST", body: formData });
        if (!uploadRes.ok) {
          const e = await uploadRes.json();
          updateQueueItem(item.id, { status: "failed", error: e.error || "שגיאת העלאה" });
          setIsQueueRunning(false);
          return;
        }
        const uploadData = await uploadRes.json();
        const docId: number = uploadData.docId;
        updateQueueItem(item.id, { status: "processing", docId });

        const processRes = await authFetch(`${API}/ai-documents/process/${docId}`, { method: "POST" });
        if (!processRes.ok) {
          const e = await processRes.json();
          updateQueueItem(item.id, { status: "failed", error: e.error || "שגיאת עיבוד" });
        } else {
          const processData = await processRes.json();
          updateQueueItem(item.id, { status: "done", extractedData: processData.extractedData });
        }
      } catch (err: any) {
        updateQueueItem(item.id, { status: "failed", error: err.message });
      }
    } else {
      items.forEach(item => updateQueueItem(item.id, { status: "uploading" }));
      try {
        const formData = new FormData();
        items.forEach(item => formData.append("files", item.file));
        const uploadRes = await authFetch(`${API}/ai-documents/upload-batch`, { method: "POST", body: formData });
        if (!uploadRes.ok) {
          const e = await uploadRes.json();
          items.forEach(item => updateQueueItem(item.id, { status: "failed", error: e.error || "שגיאת העלאה" }));
          setIsQueueRunning(false);
          queryClient.invalidateQueries({ queryKey: ["ai-doc-history"] });
          return;
        }
        const uploadData = await uploadRes.json();
        const uploadedDocs: Array<{ docId: number; fileName: string }> = uploadData.docs;

        const docIdToQueueId = new Map<number, string>();
        uploadedDocs.forEach((d, idx) => {
          const qItem = items[idx];
          if (qItem) {
            docIdToQueueId.set(d.docId, qItem.id);
            updateQueueItem(qItem.id, { status: "processing", docId: d.docId });
          }
        });

        const docIds = uploadedDocs.map(d => d.docId);
        const processRes = await authFetch(`${API}/ai-documents/process-batch`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ docIds }),
        });

        if (!processRes.ok) {
          const e = await processRes.json();
          uploadedDocs.forEach(d => {
            const qid = docIdToQueueId.get(d.docId);
            if (qid) updateQueueItem(qid, { status: "failed", error: e.error || "שגיאת עיבוד" });
          });
        } else {
          const processData = await processRes.json();
          processData.results.forEach((r: { docId: number; status: string; extractedData?: any; error?: string }) => {
            const qid = docIdToQueueId.get(r.docId);
            if (!qid) return;
            if (r.status === "extracted") {
              updateQueueItem(qid, { status: "done", extractedData: r.extractedData });
            } else {
              updateQueueItem(qid, { status: "failed", error: r.error || "שגיאה" });
            }
          });
        }
      } catch (err: any) {
        items.forEach(item => updateQueueItem(item.id, { status: "failed", error: err.message }));
      }
    }

    setIsQueueRunning(false);
    queryClient.invalidateQueries({ queryKey: ["ai-doc-history"] });
  }, [updateQueueItem, queryClient]);

  const handleFiles = useCallback((files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    const newItems: QueueItem[] = fileArray.map(f => ({
      id: `${Date.now()}-${Math.random()}-${f.name}`,
      file: f,
      status: "waiting" as QueueItemStatus,
    }));
    setQueue(prev => [...prev, ...newItems]);
    processQueue(newItems);
  }, [processQueue]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const clearQueue = useCallback(() => {
    if (!isQueueRunning) setQueue([]);
  }, [isQueueRunning]);

  const handleBulkApprove = useCallback(async () => {
    const extractedDocs = history.filter(d => d.status === "extracted");
    if (extractedDocs.length === 0) {
      toast({ title: "אין מסמכים לאישור", description: "כל המסמכים שעובדו כבר אושרו או נכשלו" });
      return;
    }
    setBulkApproving(true);
    try {
      const docIds = extractedDocs.map(d => d.id);
      const r = await authFetch(`${API}/ai-documents/distribute-batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ docIds }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error || "שגיאה באישור גורף"); }
      const result = await r.json();
      queryClient.invalidateQueries({ queryKey: ["ai-doc-history"] });
      toast({
        title: `אישור גורף הושלם`,
        description: `${result.succeeded} מסמכים הופצו בהצלחה${result.failed > 0 ? `, ${result.failed} נכשלו` : ""}`,
      });
    } catch (err: any) {
      toast({ title: "שגיאה באישור גורף", description: err.message, variant: "destructive" });
    } finally {
      setBulkApproving(false);
    }
  }, [history, queryClient, toast]);

  const doneCount = queue.filter(q => q.status === "done").length;
  const failedCount = queue.filter(q => q.status === "failed").length;
  const totalQueue = queue.length;
  const progressPct = totalQueue > 0 ? Math.round(((doneCount + failedCount) / totalQueue) * 100) : 0;

  const extractedDocsCount = history.filter(d => d.status === "extracted").length;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6" dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-violet-600/20 rounded-xl">
            <Brain className="w-6 h-6 text-violet-400" />
          </div>
          <div>
            <h1 className="text-lg sm:text-2xl font-bold">עיבוד מסמכים חכם AI</h1>
            <p className="text-muted-foreground text-sm">העלה מסמכים — AI יחלץ את כל הנתונים ויפיץ אותם אוטומטית</p>
          </div>
        </div>
        {extractedDocsCount > 0 && (
          <button
            onClick={handleBulkApprove}
            disabled={bulkApproving}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-foreground rounded-xl text-sm font-semibold hover:bg-emerald-500 transition-colors disabled:opacity-50"
          >
            {bulkApproving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ListChecks className="w-4 h-4" />}
            {bulkApproving ? "מאשר..." : `אשר הכל (${extractedDocsCount})`}
          </button>
        )}
      </div>

      <AnimatePresence mode="wait">
        {activeDoc && reviewData ? (
          <motion.div
            key="review"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="bg-card border border-border rounded-2xl p-6"
          >
            <ExtractionReviewPanel
              extractedData={reviewData}
              onUpdate={setReviewData}
              onApprove={() => {
                if (activeDoc && reviewData) {
                  distributeMutation.mutate({ docId: activeDoc.id, data: reviewData });
                }
              }}
              onBack={() => { setActiveDoc(null); setReviewData(null); }}
              isDistributing={distributeMutation.isPending}
            />
          </motion.div>
        ) : (
          <motion.div
            key="upload"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <div
              ref={dropRef}
              onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => !isQueueRunning && fileInputRef.current?.click()}
              className={`relative border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all ${
                isDragging ? "border-violet-500 bg-violet-500/5" :
                isQueueRunning ? "border-blue-500/50 bg-blue-500/5 cursor-wait" :
                "border-border hover:border-violet-500/50 hover:bg-violet-500/5"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx"
                className="hidden"
                onChange={e => e.target.files && handleFiles(e.target.files)}
              />

              <AnimatePresence mode="wait">
                {isQueueRunning ? (
                  <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
                    <div className="flex justify-center">
                      <div className="relative">
                        <Brain className="w-16 h-16 text-violet-400 animate-pulse" />
                        <div className="absolute -top-1 -right-1">
                          <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
                        </div>
                      </div>
                    </div>
                    <p className="text-xl font-semibold">AI מעבד {totalQueue} מסמכים...</p>
                    <p className="text-muted-foreground text-sm">{doneCount + failedCount} מתוך {totalQueue} הושלמו</p>
                  </motion.div>
                ) : (
                  <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
                    <div className="flex justify-center">
                      <Upload className={`w-16 h-16 transition-colors ${isDragging ? "text-violet-400" : "text-muted-foreground"}`} />
                    </div>
                    <div>
                      <p className="text-xl font-semibold mb-1">גרור מסמכים לכאן או לחץ להעלאה</p>
                      <p className="text-muted-foreground text-sm">PDF, תמונות (JPG/PNG), Word, Excel — ניתן לבחור מספר קבצים בו-זמנית</p>
                    </div>
                    <div className="flex flex-wrap justify-center gap-2 pt-2">
                      {["חשבונית", "חוזה", "הסכם", "קבלה", "הזמנת רכש"].map(t => (
                        <span key={t} className="px-3 py-1 bg-muted/30 border border-border rounded-full text-xs text-muted-foreground">{t}</span>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {queue.length > 0 && (
              <div className="mt-4 bg-card border border-border rounded-2xl overflow-hidden">
                <div className="flex items-center justify-between p-3 border-b border-border">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium">תור עיבוד ({totalQueue} קבצים)</span>
                    {totalQueue > 0 && (
                      <span className="text-xs text-muted-foreground">
                        · {doneCount} הושלמו{failedCount > 0 ? `, ${failedCount} נכשלו` : ""}
                      </span>
                    )}
                  </div>
                  {!isQueueRunning && (
                    <button onClick={clearQueue} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
                      <X className="w-3.5 h-3.5" /> נקה
                    </button>
                  )}
                </div>

                {totalQueue > 0 && (
                  <div className="px-3 pt-3">
                    <div className="w-full bg-muted rounded-full h-1.5 mb-1">
                      <div
                        className="bg-violet-500 h-1.5 rounded-full transition-all duration-300"
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground text-left">{progressPct}%</p>
                  </div>
                )}

                <div className="divide-y divide-border max-h-60 overflow-y-auto">
                  {queue.map(item => {
                    const cfg = QUEUE_STATUS_CONFIG[item.status];
                    return (
                      <div key={item.id} className="flex items-center gap-3 px-3 py-2.5">
                        <span className={cfg.color}>{cfg.icon}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate">{item.file.name}</p>
                          {item.error && <p className="text-[11px] text-red-400 truncate">{item.error}</p>}
                        </div>
                        <span className={`text-xs font-medium ${cfg.color}`}>{cfg.label}</span>
                        {item.status === "done" && item.docId && item.extractedData && (
                          <button
                            onClick={() => {
                              setActiveDoc({ id: item.docId!, extractedData: item.extractedData! });
                              setReviewData(item.extractedData!);
                            }}
                            className="text-xs px-2 py-1 bg-violet-600/20 text-violet-400 hover:bg-violet-600/30 rounded-lg transition-colors"
                          >
                            סקור
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="mt-4 grid grid-cols-4 gap-3">
              {[
                { icon: <Truck className="w-4 h-4" />, label: "ספקים", desc: "יצירה/קישור אוטומטי", color: "text-blue-400" },
                { icon: <Receipt className="w-4 h-4" />, label: "הוצאות", desc: "רשומת הוצאה", color: "text-emerald-400" },
                { icon: <Receipt className="w-4 h-4" />, label: "חשבונות לתשלום", desc: "AP אוטומטי", color: "text-orange-400" },
                { icon: <Package className="w-4 h-4" />, label: "חומרי גלם", desc: "עדכון קטלוג", color: "text-violet-400" },
              ].map(item => (
                <div key={item.label} className="bg-card border border-border rounded-xl p-3 text-center">
                  <div className={`flex justify-center mb-1.5 ${item.color}`}>{item.icon}</div>
                  <p className="text-xs font-medium">{item.label}</p>
                  <p className="text-[10px] text-muted-foreground">{item.desc}</p>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex gap-2 border-b border-border mb-4">
        {[
          { id: "details", label: "פרטים" },
          { id: "related", label: "רשומות קשורות" },
          { id: "attachments", label: "מסמכים" },
          { id: "history", label: "היסטוריה" },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setDetailTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${detailTab === tab.id ? "border-violet-500 text-violet-400" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {detailTab === "related" && (
        <RelatedRecords
          tabs={[
            {
              key: "suppliers",
              label: "ספקים",
              endpoint: `${API}/suppliers?limit=10`,
              columns: [
                { key: "name", label: "שם" },
                { key: "contactName", label: "איש קשר" },
                { key: "phone", label: "טלפון" },
              ],
            },
            {
              key: "expenses",
              label: "הוצאות",
              endpoint: `${API}/expenses?limit=10`,
              columns: [
                { key: "description", label: "תיאור" },
                { key: "amount", label: "סכום" },
                { key: "date", label: "תאריך" },
              ],
            },
          ]}
        />
      )}

      {detailTab === "attachments" && (
        <AttachmentsSection entityType="ai-documents" entityId={0} />
      )}

      {detailTab === "history" && (
        <ActivityLog entityType="ai-documents" />
      )}

      {detailTab === "details" && (
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="font-semibold flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            היסטוריית מסמכים
          </h2>
          <button onClick={() => queryClient.invalidateQueries({ queryKey: ["ai-doc-history"] })} className="p-1.5 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground transition-colors">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {historyLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : history.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">טרם עובדו מסמכים</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {history.map(doc => {
              const statusCfg = STATUS_CONFIG[doc.status] || STATUS_CONFIG.pending;
              const isExpanded = expandedHistory === doc.id;
              const extractedData = doc.extracted_data ? (typeof doc.extracted_data === "string" ? JSON.parse(doc.extracted_data) : doc.extracted_data) : null;
              const distributionLog = doc.distribution_log ? (typeof doc.distribution_log === "string" ? JSON.parse(doc.distribution_log) : doc.distribution_log) : null;

              return (
                <div key={doc.id} className="hover:bg-muted/20 transition-colors">
                  <div
                    className="flex items-center gap-3 p-3.5 cursor-pointer"
                    onClick={() => setExpandedHistory(isExpanded ? null : doc.id)}
                  >
                    <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{doc.file_name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {doc.document_type || "מסמך"} · {new Date(doc.created_at).toLocaleDateString("he-IL")}
                      </p>
                    </div>
                    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${statusCfg.color}`}>
                      {statusCfg.icon}
                      {statusCfg.label}
                    </div>
                    {doc.status === "extracted" && (
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          if (extractedData) {
                            setActiveDoc({ id: doc.id, extractedData });
                            setReviewData(extractedData);
                          }
                        }}
                        className="px-3 py-1.5 bg-violet-600/20 text-violet-400 hover:bg-violet-600/30 rounded-lg text-xs font-medium transition-colors"
                      >
                        סקור
                      </button>
                    )}
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                  </div>

                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="px-4 pb-4 space-y-3 text-sm">
                          {doc.error_message && (
                            <div className="flex items-center gap-2 text-red-400 bg-red-500/5 border border-red-500/20 rounded-lg p-2.5">
                              <AlertCircle className="w-4 h-4 shrink-0" />
                              <p className="text-xs">{doc.error_message}</p>
                            </div>
                          )}
                          {extractedData && (
                            <div className="grid grid-cols-2 gap-2 text-[12px]">
                              {extractedData.supplierName && <div><span className="text-muted-foreground">ספק: </span>{extractedData.supplierName}</div>}
                              {extractedData.invoiceNumber && <div><span className="text-muted-foreground">חשבונית: </span>{extractedData.invoiceNumber}</div>}
                              {extractedData.invoiceDate && <div><span className="text-muted-foreground">תאריך: </span>{extractedData.invoiceDate}</div>}
                              {extractedData.totalAmount && <div><span className="text-muted-foreground">סה"כ: </span>{formatCurrency(extractedData.totalAmount, extractedData.currency)}</div>}
                            </div>
                          )}
                          {distributionLog && <DistributionResult log={distributionLog} />}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        )}
      </div>
      )}
    </div>
  );
}
