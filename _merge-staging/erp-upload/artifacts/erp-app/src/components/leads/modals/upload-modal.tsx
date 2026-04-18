import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { entityCreate } from "@/lib/entity-api";
import { authFetch } from "@/lib/utils";
import { Upload } from "lucide-react";

interface UploadModalProps {
  open: boolean;
  onClose: () => void;
  leadId: number | string;
  onSuccess?: () => void;
}

export default function UploadModal({
  open,
  onClose,
  leadId,
  onSuccess,
}: UploadModalProps) {
  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [tag, setTag] = useState("אחר");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Upload submit - file:", file, "leadId:", leadId);

    if (!file) {
      alert("נא לבחור קובץ");
      return;
    }

    if (!leadId) {
      alert("שגיאה: חסר מזהה ליד");
      return;
    }

    setLoading(true);
    try {
      console.log("Uploading file...");
      const formData = new FormData();
      formData.append("file", file);
      const uploadRes = await authFetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      if (!uploadRes.ok) {
        throw new Error("שגיאה בהעלאת הקובץ");
      }
      const { file_url } = await uploadRes.json();
      console.log("File uploaded:", file_url);

      console.log("Creating document record");
      const result = await entityCreate("lead-documents", {
        lead_id: leadId,
        file_url,
        file_name: file.name,
        file_type: file.type,
        tag,
        source: "manual",
      });
      console.log("Document created:", result);

      alert("הקובץ הועלה בהצלחה!");
      onSuccess?.();
      setFile(null);
      onClose();
    } catch (error) {
      console.error("שגיאה בהעלאת קובץ:", error);
      alert("שגיאה בהעלאת הקובץ: " + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5" />
            העלאת מסמך
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>בחר קובץ</Label>
            <Input
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              required
            />
          </div>
          <div>
            <Label>סוג מסמך</Label>
            <Select value={tag} onValueChange={setTag}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="הצעת_מחיר">הצעת מחיר</SelectItem>
                <SelectItem value="חוזה">חוזה</SelectItem>
                <SelectItem value="תוכנית">תוכנית</SelectItem>
                <SelectItem value="תמונה">תמונה</SelectItem>
                <SelectItem value="חשבונית">חשבונית</SelectItem>
                <SelectItem value="אחר">אחר</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {file && (
            <div className="text-sm text-slate-600">
              קובץ נבחר: {file.name}
            </div>
          )}
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={onClose}>
              ביטול
            </Button>
            <Button type="submit" disabled={loading || !file}>
              העלה
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
