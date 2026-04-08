import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Paperclip, Upload, X, FileText, Image, File, Download, Trash2, Eye, ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { globalConfirm } from "@/components/confirm-dialog";
import { authFetch } from "@/lib/utils";

interface Attachment {
  id: number;
  fileName: string;
  fileType: string;
  fileSize: number;
  uploadedBy?: string;
  uploadedAt: string;
  url?: string;
  entityType: string;
  entityId: number;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function getFileIcon(type: string) {
  if (type?.startsWith("image/")) return Image;
  if (type?.includes("pdf") || type?.includes("doc")) return FileText;
  return File;
}

function formatDate(d: string) {
  try { return new Date(d).toLocaleDateString("he-IL"); } catch { return d; }
}

interface AttachmentsSectionProps {
  entityType: string;
  entityId: number;
  apiEndpoint?: string;
  readOnly?: boolean;
  compact?: boolean;
}

export default function AttachmentsSection({ entityType, entityId, apiEndpoint, readOnly = false, compact = false }: AttachmentsSectionProps) {
  const [files, setFiles] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [expanded, setExpanded] = useState(!compact);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const baseUrl = apiEndpoint || `/api/documents`;

  const load = async () => {
    setLoading(true);
    try {
      const res = await authFetch(`${baseUrl}?entityType=${entityType}&entityId=${entityId}`);
      if (res.ok) {
        const data = await res.json();
        setFiles(Array.isArray(data) ? data : data?.data || data?.items || []);
      }
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, [entityType, entityId]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(fileList)) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("entityType", entityType);
        formData.append("entityId", String(entityId));
        await authFetch(`${baseUrl}/upload`, { method: "POST", body: formData });
      }
      load();
    } catch {}
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDelete = async (id: number) => {
    if (await globalConfirm("האם למחוק קובץ זה?")) {
      await authFetch(`${baseUrl}/${id}`, { method: "DELETE" });
      load();
    }
  };

  return (
    <div className="bg-card border border-border/50 rounded-2xl overflow-hidden">
      <div className="p-4 border-b border-border/50 flex items-center justify-between cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-2">
          <Paperclip className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">מסמכים מצורפים</h3>
          <Badge className="bg-muted text-muted-foreground text-xs">{files.length}</Badge>
        </div>
        <div className="flex items-center gap-2">
          {!readOnly && (
            <button onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }} className="flex items-center gap-1 px-2.5 py-1 bg-primary/20 text-primary rounded-lg text-xs hover:bg-primary/30 transition-colors">
              <Upload className="w-3.5 h-3.5" />{uploading ? "מעלה..." : "העלאה"}
            </button>
          )}
          <button onClick={(e) => { e.stopPropagation(); load(); }} className="p-1 hover:bg-muted rounded-lg"><RefreshCw className="w-3.5 h-3.5 text-muted-foreground" /></button>
          {compact && (expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />)}
        </div>
      </div>
      <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleUpload} accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.png,.jpg,.jpeg,.gif,.txt,.zip" />
      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
            {loading ? (
              <div className="p-6 text-center"><div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" /></div>
            ) : files.length === 0 ? (
              <div className="p-6 text-center">
                <Paperclip className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">אין מסמכים מצורפים</p>
                {!readOnly && <p className="text-xs text-muted-foreground/60 mt-1">לחץ על "העלאה" להוספת קבצים</p>}
              </div>
            ) : (
              <div className="divide-y divide-border/30">
                {files.map((file, i) => {
                  const Icon = getFileIcon(file.fileType);
                  return (
                    <motion.div key={file.id || i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }} className="p-3 flex items-center gap-3 hover:bg-muted/20 transition-colors group">
                      <div className="p-2 bg-muted/50 rounded-lg"><Icon className="w-4 h-4 text-muted-foreground" /></div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground truncate">{file.fileName}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-muted-foreground">{formatSize(file.fileSize)}</span>
                          {file.uploadedBy && <span className="text-xs text-muted-foreground">• {file.uploadedBy}</span>}
                          <span className="text-xs text-muted-foreground">• {formatDate(file.uploadedAt)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {file.url && <a href={file.url} target="_blank" rel="noopener" className="p-1.5 hover:bg-muted rounded-lg"><Download className="w-3.5 h-3.5 text-muted-foreground" /></a>}
                        {!readOnly && <button onClick={() => handleDelete(file.id)} className="p-1.5 hover:bg-red-500/20 rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
