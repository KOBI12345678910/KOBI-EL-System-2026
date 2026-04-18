import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { AlertCircle } from "lucide-react";
import { entityUpdate } from "@/lib/entity-api";

interface DeleteRequestModalProps {
  open: boolean;
  onClose: () => void;
  leadId: number | string;
}

export default function DeleteRequestModal({
  open,
  onClose,
  leadId,
}: DeleteRequestModalProps) {
  const [loading, setLoading] = useState(false);
  const [reason, setReason] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await entityUpdate("leads", leadId, {
        archived: true,
        notes: `בקשת מחיקה: ${reason}`,
      });
      alert("בקשת מחיקה נשלחה בהצלחה");
      onClose();
    } catch (error) {
      console.error("שגיאה בבקשת מחיקה:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <AlertCircle className="w-5 h-5" />
            בקשת מחיקת ליד
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800">
            פעולה זו תסמן את הליד למחיקה ותשלח בקשה לאישור מנהל.
          </div>
          <div>
            <Label>סיבת המחיקה</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              placeholder="פרט את הסיבה למחיקה..."
              required
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={onClose}>
              ביטול
            </Button>
            <Button type="submit" disabled={loading} variant="destructive">
              שלח בקשה
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
