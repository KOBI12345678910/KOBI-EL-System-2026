import { useState, useRef } from "react";
import { Upload, X, AlertCircle, CheckCircle, Loader2 } from "lucide-react";
import { authFetch } from "@/lib/utils";
import * as XLSX from "xlsx";

interface ImportButtonProps {
  /** Standard entity type slug — resolves to /api/:entityType/import via entity-crud-registry */
  entityType?: string;
  /** Legacy: explicit API route base, e.g. "/api/hr-payslips" */
  apiRoute?: string;
  /** Legacy: platform entity numeric ID for /api/platform/entities/:id/records/import */
  entityId?: number;
  onSuccess?: () => void;
  label?: string;
  className?: string;
  buttonClassName?: string;
  compact?: boolean;
}

export default function ImportButton({
  entityType,
  apiRoute: apiRouteProp,
  entityId,
  onSuccess,
  label = "ייבוא",
  className = "",
  buttonClassName,
  compact = false,
}: ImportButtonProps) {
  // Resolve the effective apiRoute: entityType takes precedence over apiRoute prop
  const apiRoute = entityType ? `/api/${entityType}` : apiRouteProp;

  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ imported?: number; errors?: string[]; error?: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const usePlatformRoute = entityId !== undefined;
  const btnClass = buttonClassName || "flex items-center gap-1.5 bg-slate-600 text-foreground px-3 py-2 rounded-lg hover:bg-slate-700 text-sm";

  const reset = () => {
    setFile(null);
    setResult(null);
    setLoading(false);
  };

  const handleClose = () => {
    setOpen(false);
    reset();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    setFile(f);
    setResult(null);
  };

  const fileToCsv = async (f: File): Promise<string> => {
    const name = f.name.toLowerCase();
    if (name.endsWith(".xlsx") || name.endsWith(".xls") || name.endsWith(".ods")) {
      const buffer = await f.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      return XLSX.utils.sheet_to_csv(sheet);
    }
    return f.text();
  };

  const handleImport = async () => {
    if (!file) return;
    setLoading(true);
    setResult(null);
    try {
      if (usePlatformRoute) {
        const formData = new FormData();
        formData.append("file", file);
        const res = await authFetch(`/api/platform/entities/${entityId}/records/import`, {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (!res.ok) {
          setResult({ error: data.message || data.error || "שגיאה בייבוא" });
        } else {
          setResult({ imported: data.imported ?? data.count ?? 0, errors: data.errors || [] });
          if (onSuccess) onSuccess();
        }
      } else if (apiRoute) {
        const csv = await fileToCsv(file);
        const res = await authFetch(`${apiRoute}/import`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ csv }),
        });
        const data = await res.json();
        if (!res.ok) {
          setResult({ error: data.error || "שגיאה בייבוא" });
        } else {
          setResult({ imported: data.imported ?? data.inserted ?? 0, errors: data.errors || [] });
          if (onSuccess) onSuccess();
        }
      } else {
        setResult({ error: "לא הוגדר מסלול ייבוא" });
      }
    } catch (e: any) {
      setResult({ error: e.message || "שגיאת רשת" });
    }
    setLoading(false);
  };

  return (
    <div className={`relative ${className}`}>
      <button onClick={() => setOpen(true)} className={btnClass}>
        <Upload size={16} />
        {!compact && label}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={handleClose}>
          <div className="bg-card border border-border rounded-xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                <Upload className="w-4 h-4 text-blue-400" />
                ייבוא נתונים
              </h2>
              <button onClick={handleClose} className="p-1 hover:bg-muted rounded-lg transition-colors">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-sm text-muted-foreground">
                {usePlatformRoute
                  ? "בחר קובץ לייבוא (CSV, Excel, ODS). ימופה אוטומטית לשדות הישות."
                  : "בחר קובץ CSV או Excel לייבוא. השורה הראשונה חייבת להכיל כותרות עמודות."}
              </p>

              <div
                className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-blue-500/50 hover:bg-blue-500/5 transition-colors"
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                {file ? (
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">{file.name}</p>
                    <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">לחץ לבחירת קובץ</p>
                    <p className="text-xs text-muted-foreground/60">CSV, Excel (.xlsx, .xls), ODS</p>
                  </div>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,.xlsx,.xls,.ods,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>

              {result && (
                <div className={`rounded-lg p-3 text-sm ${result.error ? "bg-red-500/10 border border-red-500/20" : "bg-green-500/10 border border-green-500/20"}`}>
                  {result.error ? (
                    <div className="flex items-center gap-2 text-red-400">
                      <AlertCircle className="w-4 h-4 flex-shrink-0" />
                      <span>{result.error}</span>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-green-400">
                        <CheckCircle className="w-4 h-4 flex-shrink-0" />
                        <span>יובאו בהצלחה {result.imported} רשומות</span>
                      </div>
                      {result.errors && result.errors.length > 0 && (
                        <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                          <p className="text-orange-400">שגיאות ({result.errors.length}):</p>
                          {result.errors.slice(0, 5).map((e, i) => <p key={i}>{e}</p>)}
                          {result.errors.length > 5 && <p>...ועוד {result.errors.length - 5}</p>}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 p-4 border-t border-border">
              <button onClick={handleClose} className="px-4 py-2 text-sm text-muted-foreground hover:bg-muted rounded-lg transition-colors">
                {result?.imported !== undefined ? "סגור" : "ביטול"}
              </button>
              {!result?.imported && (
                <button
                  onClick={handleImport}
                  disabled={!file || loading}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-600 text-foreground rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  {loading ? "מייבא..." : "ייבא נתונים"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
