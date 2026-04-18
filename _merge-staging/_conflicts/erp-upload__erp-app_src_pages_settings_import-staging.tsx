import { useState, useMemo, useEffect, useCallback } from "react";
import { authFetch } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, X, Upload, Loader2, FileSpreadsheet, CheckCircle2, AlertCircle, XCircle, Eye, RotateCcw, ThumbsUp, ThumbsDown, ArrowRight, ChevronsUpDown, Download } from "lucide-react";

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  uploaded: { label: "הועלה", color: "bg-blue-500/20 text-blue-300" },
  validating: { label: "מאמת", color: "bg-yellow-500/20 text-yellow-300" },
  validated: { label: "אומת", color: "bg-green-500/20 text-green-300" },
  approved: { label: "מאושר", color: "bg-emerald-500/20 text-emerald-300" },
  imported: { label: "יובא", color: "bg-purple-500/20 text-purple-300" },
  rejected: { label: "נדחה", color: "bg-red-500/20 text-red-300" },
};
const ROW_STATUS: Record<string, { label: string; color: string }> = {
  valid: { label: "תקין", color: "bg-green-500/20 text-green-300" },
  error: { label: "שגיאה", color: "bg-red-500/20 text-red-300" },
  duplicate: { label: "כפילות", color: "bg-yellow-500/20 text-yellow-300" },
  imported: { label: "יובא", color: "bg-purple-500/20 text-purple-300" },
};

export default function ImportStagingPage() {
  const [batches, setBatches] = useState<any[]>([]);
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showUpload, setShowUpload] = useState(false);
  const [showRows, setShowRows] = useState<number | null>(null);
  const [uploadForm, setUploadForm] = useState<any>({ entity_type: "", file_name: "", rawText: "" });
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const res = await authFetch("/api/import-staging/batches");
      if (res.ok) { const j = await res.json(); setBatches(j.data || []); }
    } catch (e: any) { setError(e.message); }
    setIsLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadRows = async (batchId: number) => {
    try {
      const res = await authFetch(`/api/import-staging/${batchId}/rows`);
      if (res.ok) { const j = await res.json(); setRows(j.data || []); setShowRows(batchId); }
    } catch (e: any) { setError(e.message); }
  };

  const filtered = useMemo(() => {
    let d = [...batches];
    if (search) { const s = search.toLowerCase(); d = d.filter(r => r.entity_type?.toLowerCase().includes(s) || r.file_name?.toLowerCase().includes(s)); }
    if (statusFilter !== "all") d = d.filter(r => r.status === statusFilter);
    return d;
  }, [batches, search, statusFilter]);

  const handleUpload = async () => {
    setSaving(true);
    try {
      const lines = uploadForm.rawText.split("\n").filter((l: string) => l.trim());
      if (lines.length === 0) throw new Error("אין שורות לייבוא");
      const headers = lines[0].split(",").map((h: string) => h.trim());
      const rows = lines.slice(1).map((line: string) => {
        const vals = line.split(",").map((v: string) => v.trim());
        const obj: any = {};
        headers.forEach((h: string, i: number) => { obj[h] = vals[i] || ""; });
        return obj;
      });
      const res = await authFetch("/api/import-staging/upload", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity_type: uploadForm.entity_type, file_name: uploadForm.file_name || "upload.csv", rows })
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "שגיאה בהעלאה"); }
      setShowUpload(false); setUploadForm({ entity_type: "", file_name: "", rawText: "" });
      await load();
    } catch (e: any) { setError(e.message); }
    setSaving(false);
  };

  const batchAction = async (batchId: number, action: string, body?: any) => {
    setActionLoading(batchId);
    try {
      const method = action === "rollback" ? "DELETE" : "POST";
      const url = action === "rollback" ? `/api/import-staging/${batchId}/rollback` : `/api/import-staging/${batchId}/${action}`;
      const res = await authFetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "שגיאה"); }
      await load();
    } catch (e: any) { setError(e.message); }
    setActionLoading(null);
  };

  if (isLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-blue-400" /></div>;

  return (
    <div dir="rtl" className="p-6 space-y-6 bg-[#0a0a1a] min-h-screen text-white">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><FileSpreadsheet className="h-6 w-6 text-green-400" />ייבוא נתונים מדורג</h1>
          <p className="text-gray-400 text-sm mt-1">העלאה, אימות, אישור וייבוא נתונים בצורה מבוקרת</p>
        </div>
        <Button onClick={() => setShowUpload(true)} className="bg-green-600 hover:bg-green-700">
          <Upload className="h-4 w-4 ml-2" />העלאת קובץ
        </Button>
      </div>

      {error && <div className="bg-red-900/30 border border-red-700 rounded-lg p-3 text-red-300 flex items-center gap-2"><AlertCircle className="h-4 w-4" />{error}<X className="h-4 w-4 mr-auto cursor-pointer" onClick={() => setError(null)} /></div>}

      {/* Summary */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="bg-[#12122a] border-gray-800"><CardContent className="p-4 text-center"><div className="text-3xl font-bold text-blue-400">{batches.length}</div><div className="text-gray-400 text-sm">סה"כ אצוות</div></CardContent></Card>
        <Card className="bg-[#12122a] border-gray-800"><CardContent className="p-4 text-center"><div className="text-3xl font-bold text-green-400">{batches.filter(b => b.status === "imported").length}</div><div className="text-gray-400 text-sm">יובאו</div></CardContent></Card>
        <Card className="bg-[#12122a] border-gray-800"><CardContent className="p-4 text-center"><div className="text-3xl font-bold text-yellow-400">{batches.filter(b => ["uploaded", "validated", "approved"].includes(b.status)).length}</div><div className="text-gray-400 text-sm">בתהליך</div></CardContent></Card>
        <Card className="bg-[#12122a] border-gray-800"><CardContent className="p-4 text-center"><div className="text-3xl font-bold text-red-400">{batches.filter(b => b.status === "rejected").length}</div><div className="text-gray-400 text-sm">נדחו</div></CardContent></Card>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1"><Search className="absolute right-3 top-2.5 h-4 w-4 text-gray-500" /><Input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש אצווה..." className="pr-10 bg-[#12122a] border-gray-700 text-white" /></div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="bg-[#12122a] border border-gray-700 rounded-md px-3 text-white text-sm">
          <option value="all">כל הסטטוסים</option>
          {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {/* Batch List */}
      <div className="space-y-3">
        {filtered.map(batch => {
          const st = STATUS_MAP[batch.status] || { label: batch.status, color: "bg-gray-500/20 text-gray-300" };
          return (
            <Card key={batch.id} className="bg-[#12122a] border-gray-800">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <FileSpreadsheet className="h-5 w-5 text-gray-400" />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-white">{batch.file_name}</span>
                        <Badge className={`text-xs ${st.color}`}>{st.label}</Badge>
                        <Badge variant="outline" className="text-xs border-gray-700 text-gray-400">{batch.entity_type}</Badge>
                      </div>
                      <div className="flex gap-4 mt-1 text-xs text-gray-500">
                        <span>שורות: {batch.total_rows}</span>
                        <span className="text-green-400">תקינות: {batch.valid_rows || 0}</span>
                        <span className="text-red-400">שגיאות: {batch.error_rows || 0}</span>
                        <span>{new Date(batch.created_at).toLocaleDateString("he-IL")}</span>
                        {batch.uploaded_by && <span>העלה: {batch.uploaded_by}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => loadRows(batch.id)} title="צפייה בשורות"><Eye className="h-4 w-4 text-gray-400" /></Button>
                    {batch.status === "uploaded" && <Button size="sm" variant="ghost" onClick={() => batchAction(batch.id, "validate")} disabled={actionLoading === batch.id}>{actionLoading === batch.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4 text-blue-400" />}</Button>}
                    {batch.status === "validated" && <>
                      <Button size="sm" variant="ghost" onClick={() => batchAction(batch.id, "approve")} disabled={actionLoading === batch.id}><ThumbsUp className="h-4 w-4 text-green-400" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => batchAction(batch.id, "reject")} disabled={actionLoading === batch.id}><ThumbsDown className="h-4 w-4 text-red-400" /></Button>
                    </>}
                    {batch.status === "approved" && <Button size="sm" variant="ghost" onClick={() => batchAction(batch.id, "import")} disabled={actionLoading === batch.id}><ArrowRight className="h-4 w-4 text-purple-400" /></Button>}
                    {batch.status === "imported" && <Button size="sm" variant="ghost" onClick={() => batchAction(batch.id, "rollback")} disabled={actionLoading === batch.id}><RotateCcw className="h-4 w-4 text-orange-400" /></Button>}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {filtered.length === 0 && <div className="text-center py-12 text-gray-500">אין אצוות ייבוא</div>}
      </div>

      {/* Upload Dialog */}
      {showUpload && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center" onClick={() => setShowUpload(false)}>
          <div className="bg-[#12122a] border border-gray-700 rounded-xl p-6 w-full max-w-lg space-y-4" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold">העלאת נתונים לייבוא</h2>
            <div className="grid grid-cols-2 gap-4">
              <div><Label className="text-gray-300">סוג ישות</Label><Input value={uploadForm.entity_type} onChange={e => setUploadForm({ ...uploadForm, entity_type: e.target.value })} placeholder="contacts / products" className="bg-[#0a0a1a] border-gray-700 text-white" /></div>
              <div><Label className="text-gray-300">שם קובץ</Label><Input value={uploadForm.file_name} onChange={e => setUploadForm({ ...uploadForm, file_name: e.target.value })} placeholder="data.csv" className="bg-[#0a0a1a] border-gray-700 text-white" /></div>
            </div>
            <div><Label className="text-gray-300">נתונים (CSV - שורה ראשונה כותרות)</Label>
              <textarea value={uploadForm.rawText} onChange={e => setUploadForm({ ...uploadForm, rawText: e.target.value })} rows={8} placeholder={"name,email,phone\nישראל ישראלי,israel@example.com,050-1234567"} className="w-full bg-[#0a0a1a] border border-gray-700 rounded-md px-3 py-2 text-white text-sm font-mono" />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowUpload(false)} className="border-gray-700 text-gray-300">ביטול</Button>
              <Button onClick={handleUpload} disabled={saving} className="bg-green-600 hover:bg-green-700">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4 ml-2" />}העלאה</Button>
            </div>
          </div>
        </div>
      )}

      {/* Rows Detail Dialog */}
      {showRows !== null && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center" onClick={() => { setShowRows(null); setRows([]); }}>
          <div className="bg-[#12122a] border border-gray-700 rounded-xl p-6 w-full max-w-3xl max-h-[80vh] overflow-auto space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">שורות אצווה #{showRows}</h2>
              <Button size="sm" variant="ghost" onClick={() => { setShowRows(null); setRows([]); }}><X className="h-4 w-4" /></Button>
            </div>
            <div className="space-y-2 max-h-[60vh] overflow-auto">
              {rows.map(row => {
                const rs = ROW_STATUS[row.status] || { label: row.status, color: "bg-gray-500/20 text-gray-300" };
                return (
                  <div key={row.id} className="bg-[#0a0a1a] border border-gray-800 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-gray-400 text-xs">#{row.row_number}</span>
                      <Badge className={`text-xs ${rs.color}`}>{rs.label}</Badge>
                    </div>
                    <pre className="text-xs text-gray-300 overflow-auto">{JSON.stringify(row.data, null, 2)}</pre>
                    {row.validation_errors && row.validation_errors.length > 0 && (
                      <div className="mt-2 text-xs text-red-400">{row.validation_errors.join(", ")}</div>
                    )}
                  </div>
                );
              })}
              {rows.length === 0 && <div className="text-center py-8 text-gray-500">אין שורות</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
