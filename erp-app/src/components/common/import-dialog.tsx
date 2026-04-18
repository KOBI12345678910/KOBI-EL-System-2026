import { useState, type ChangeEvent } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { authFetch } from "@/lib/utils";

interface ImportDialogProps {
  open: boolean;
  onClose: () => void;
  entityName: string;
  onSuccess?: () => void;
}

interface ImportResults {
  total: number;
  success: number;
  errors: number;
}

export default function ImportDialog({ open, onClose, entityName, onSuccess }: ImportDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<ImportResults | null>(null);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (!selectedFile.name.match(/\.(csv|xlsx|xls)$/)) {
        toast.error("יש להעלות קובץ CSV או Excel בלבד");
        return;
      }
      setFile(selectedFile);
      setResults(null);
    }
  };

  const handleImport = async () => {
    if (!file) { toast.error("נא לבחור קובץ"); return; }
    setUploading(true);
    setResults(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("entity", entityName);
      const res = await authFetch(`/api/import/${entityName}`, { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "שגיאת ייבוא");
      setResults({ total: data.total || 0, success: data.success || 0, errors: data.errors || 0 });
      if (data.success > 0) { toast.success(`${data.success} רשומות יובאו בהצלחה`); onSuccess?.(); }
      if (data.errors > 0) toast.warning(`${data.errors} רשומות נכשלו`);
    } catch (error) {
      console.error("Import error:", error);
      toast.error("שגיאה בייבוא: " + (error instanceof Error ? error.message : "שגיאה לא ידועה"));
    } finally { setUploading(false); }
  };

  const handleClose = () => { setFile(null); setResults(null); onClose(); };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Upload className="w-5 h-5" />ייבוא מקובץ</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Alert><FileSpreadsheet className="h-4 w-4" /><AlertDescription>העלה קובץ CSV או Excel עם הנתונים. המערכת תזהה אוטומטית את העמודות.</AlertDescription></Alert>
          <div>
            <Label>בחר קובץ</Label>
            <Input type="file" accept=".csv,.xlsx,.xls" onChange={handleFileChange} className="mt-1" disabled={uploading} />
            {file && <p className="text-sm text-slate-600 mt-2">{file.name} ({(file.size / 1024).toFixed(1)} KB)</p>}
          </div>
          {results && (
            <Alert className={results.errors > 0 ? "border-amber-200 bg-amber-50" : "border-green-200 bg-green-50"}>
              {results.errors > 0 ? <AlertCircle className="h-4 w-4 text-amber-600" /> : <CheckCircle2 className="h-4 w-4 text-green-600" />}
              <AlertDescription className={results.errors > 0 ? "text-amber-800" : "text-green-800"}>
                <strong>תוצאות ייבוא:</strong>
                <ul className="mt-2 space-y-1">
                  <li>{results.success} רשומות יובאו בהצלחה</li>
                  {results.errors > 0 && <li>{results.errors} רשומות נכשלו</li>}
                </ul>
              </AlertDescription>
            </Alert>
          )}
          <div className="flex gap-3 pt-4">
            <Button onClick={handleImport} disabled={!file || uploading} className="flex-1 bg-indigo-600 hover:bg-indigo-700">
              {uploading ? (<><Loader2 className="w-4 h-4 ml-2 animate-spin" />מייבא...</>) : (<><Upload className="w-4 h-4 ml-2" />ייבא נתונים</>)}
            </Button>
            <Button type="button" variant="outline" onClick={handleClose} disabled={uploading}>{results ? "סגור" : "ביטול"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
