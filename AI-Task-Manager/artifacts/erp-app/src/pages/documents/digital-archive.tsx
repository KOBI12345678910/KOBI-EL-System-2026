import { useState, useMemo, useEffect } from "react";
import { Archive, Search, FolderOpen, FileText, ShieldCheck, DollarSign, Users, Package, Plus, Download, Eye, Trash2 } from "lucide-react";
import { motion } from "framer-motion";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";
import { authFetch } from "@/lib/utils";
import ActivityLog from "@/components/activity-log";
import BulkActions, { useBulkSelection, defaultBulkActions } from "@/components/bulk-actions";

const API = "/api";
const token = () => localStorage.getItem("erp_token") || localStorage.getItem("erp_token") || "";
const headers = () => ({ Authorization: `Bearer ${token()}`, "Content-Type": "application/json" });

const CATEGORY_CONFIG: Record<string, { color: string; light: string; icon: any; textColor: string }> = {
  "פיקוח": { color: "bg-blue-500", light: "bg-blue-50 border-blue-200", icon: ShieldCheck, textColor: "text-blue-600" },
  "מיסוי": { color: "bg-orange-500", light: "bg-orange-50 border-orange-200", icon: DollarSign, textColor: "text-orange-600" },
  "פרסונל": { color: "bg-purple-500", light: "bg-purple-50 border-purple-200", icon: Users, textColor: "text-purple-600" },
  "מסמכי ארכיון": { color: "bg-muted", light: "bg-muted/30 border-border", icon: Package, textColor: "text-muted-foreground" },
  "כספים": { color: "bg-green-500", light: "bg-green-50 border-green-200", icon: DollarSign, textColor: "text-green-600" },
  "שיווק": { color: "bg-pink-500", light: "bg-pink-50 border-pink-200", icon: Package, textColor: "text-pink-600" },
};

function formatSize(bytes: number): string {
  if (!bytes) return "0 B";
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function getFileType(mimeType: string): string {
  if (mimeType.includes("pdf")) return "PDF";
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel") || mimeType.includes("xlsx")) return "XLSX";
  if (mimeType.includes("word") || mimeType.includes("docx")) return "DOCX";
  if (mimeType.includes("zip")) return "ZIP";
  if (mimeType.includes("image")) return "IMG";
  return "FILE";
}

export default function DigitalArchivePage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [files, setFiles] = useState<any[]>([]);
  const [folders, setFolders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { selectedIds, toggle, toggleAll, clear, isSelected } = useBulkSelection();

  const load = async () => {
    setLoading(true);
    try {
      const [foldersRes, filesRes] = await Promise.allSettled([
        authFetch(`${API}/document-folders`, { headers: headers() }).then(r => r.json()),
        authFetch(`${API}/document-files`, { headers: headers() }).then(r => r.json()),
      ]);
      if (foldersRes.status === "fulfilled" && Array.isArray(foldersRes.value)) {
        setFolders(foldersRes.value);
      }
      if (filesRes.status === "fulfilled" && Array.isArray(filesRes.value)) {
        setFiles(filesRes.value);
      }
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const categories = useMemo(() => {
    const folderCategoryMap: Record<string, number> = {};
    folders.forEach(f => {
      const cat = f.name;
      folderCategoryMap[cat] = (folderCategoryMap[cat] || 0) + (f.fileCount || 0);
    });
    return folders.slice(0, 4).map(f => {
      const cfg = CATEGORY_CONFIG[f.name] || { color: "bg-muted", light: "bg-muted/30 border-border", icon: FolderOpen, textColor: "text-muted-foreground" };
      return { name: f.name, count: f.fileCount || 0, ...cfg };
    });
  }, [folders]);

  const filtered = useMemo(() => {
    return files.filter(f => {
      if (filterCategory !== "all") {
        const folder = folders.find(folder => folder.id === f.folderId);
        if (!folder || folder.name !== filterCategory) return false;
      }
      if (search) {
        return f.name.toLowerCase().includes(search.toLowerCase());
      }
      return true;
    });
  }, [files, folders, search, filterCategory]);

  const handleDownload = async (file: any) => {
    const res = await authFetch(`${API}/document-files/${file.id}/download`, { headers: headers() });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDelete = async (id: number) => {
    if (!(await globalConfirm("למחוק קובץ?"))) return;
    await authFetch(`${API}/document-files/${id}`, { method: "DELETE", headers: headers() });
    setFiles(files.filter(f => f.id !== id));
  };

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex justify-between items-start flex-wrap gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold flex items-center gap-2"><Archive className="text-cyan-600" /> ארכוב דיגיטלי</h1>
          <p className="text-muted-foreground mt-1">ניהול וסיווג מסמכים דיגיטליים בארכיון המרכזי</p>
        </div>
        <button
          onClick={() => { window.location.href = "/documents"; }}
          className="flex items-center gap-2 bg-cyan-600 text-foreground px-4 py-2 rounded-lg hover:bg-cyan-700 shadow-lg text-sm"
        >
          <Plus size={16} /> העלאת מסמך
        </button>
      </div>

      {categories.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {categories.map((cat, i) => (
            <motion.div
              key={cat.name}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07 }}
              onClick={() => setFilterCategory(filterCategory === cat.name ? "all" : cat.name)}
              className={`cursor-pointer rounded-xl border-2 p-4 transition-all ${filterCategory === cat.name ? cat.light + " ring-2 ring-offset-1 ring-cyan-400" : cat.light}`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className={`p-2 rounded-lg ${cat.color} text-foreground`}>
                  <cat.icon size={20} />
                </div>
                <span className={`text-lg sm:text-2xl font-bold ${cat.textColor}`}>{cat.count}</span>
              </div>
              <div className="font-semibold text-foreground">{cat.name}</div>
              <div className="text-xs text-muted-foreground mt-1">מסמכים בארכיון</div>
            </motion.div>
          ))}
        </div>
      )}

      <div className="bg-card rounded-xl shadow-sm border p-4">
        <div className="flex gap-3 flex-wrap mb-4">
          <div className="relative flex-1 min-w-0 sm:min-w-[200px]">
            <Search className="absolute right-3 top-2.5 text-muted-foreground" size={18} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש מסמכים..." className="w-full pr-10 pl-4 py-2 border rounded-lg" />
          </div>
          <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="border rounded-lg px-3 py-2">
            <option value="all">כל הקטגוריות</option>
            {folders.map(f => <option key={f.id} value={f.name}>{f.name}</option>)}
          </select>
        </div>

        {loading ? (
          <div className="text-center py-12 text-muted-foreground">טוען מסמכים...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Archive size={48} className="mx-auto mb-3 opacity-30" />
            <p className="text-lg">אין מסמכים בארכיון</p>
            <p className="text-sm mt-1">העלה מסמכים דרך מנהל המסמכים</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/30 border-b">
              <tr>
                <th className="px-3 py-3 text-right">שם מסמך</th>
                <th className="px-3 py-3 text-right">קטגוריה</th>
                <th className="px-3 py-3 text-right">תאריך ארכוב</th>
                <th className="px-3 py-3 text-right">גודל</th>
                <th className="px-3 py-3 text-right">סוג</th>
                <th className="px-3 py-3 text-right">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(doc => {
                const folder = folders.find(f => f.id === doc.folderId);
                return (
                  <tr key={doc.id} className="border-b hover:bg-cyan-50/30">
                    <td className="px-3 py-2 flex items-center gap-2"><FileText size={16} className="text-cyan-500" />{doc.name}</td>
                    <td className="px-3 py-2"><span className="px-2 py-0.5 rounded-full text-xs bg-muted/50 text-foreground">{folder?.name || "כללי"}</span></td>
                    <td className="px-3 py-2">{new Date(doc.createdAt).toLocaleDateString("he-IL")}</td>
                    <td className="px-3 py-2">{formatSize(doc.size)}</td>
                    <td className="px-3 py-2 font-mono text-xs">{getFileType(doc.mimeType)}</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        <button className="p-1 hover:bg-blue-500/10 rounded text-blue-600"><Eye size={14} /></button>
                        <button onClick={() => handleDownload(doc)} className="p-1 hover:bg-green-100 rounded text-green-600"><Download size={14} /></button>
                        <button onClick={() => handleDelete(doc.id)} className="p-1 hover:bg-red-500/10 rounded text-red-500"><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <div className="text-sm text-muted-foreground mt-3">סה"כ: {filtered.length} מסמכים</div>
      </div>

      <BulkActions selectedIds={selectedIds} onClear={clear} entityName="מסמכים" actions={defaultBulkActions(selectedIds, clear, load, `${API}/document-files`)} />

      <ActivityLog entityType="digital-archive" compact />
    </div>
  );
}
