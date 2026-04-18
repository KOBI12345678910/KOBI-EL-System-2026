import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { entityCreate } from "@/lib/entity-api";

interface LogCallModalProps {
  open: boolean;
  onClose: () => void;
  leadId: number | string;
  onSuccess?: () => void;
}

interface CallFormData {
  duration: string;
  notes: string;
  outcome: string;
}

export default function LogCallModal({
  open,
  onClose,
  leadId,
  onSuccess,
}: LogCallModalProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<CallFormData>({
    duration: "",
    notes: "",
    outcome: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log("LogCall submit - formData:", formData, "leadId:", leadId);

    if (!leadId) {
      alert("שגיאה: חסר מזהה ליד");
      return;
    }

    setLoading(true);
    try {
      console.log("Creating call activity");
      const result = await entityCreate("lead-activities", {
        lead_id: leadId,
        type: "call",
        description: `שיחה ${formData.duration} דקות - ${formData.outcome}\n${formData.notes}`,
      });
      console.log("Call activity created:", result);

      alert("השיחה נרשמה בהצלחה!");
      onSuccess?.();
      setFormData({ duration: "", notes: "", outcome: "" });
      onClose();
    } catch (error) {
      console.error("שגיאה בשמירת שיחה:", error);
      alert("שגיאה בשמירת השיחה: " + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle>רישום שיחה</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>משך (דקות)</Label>
            <Input
              type="number"
              value={formData.duration}
              onChange={(e) =>
                setFormData({ ...formData, duration: e.target.value })
              }
              placeholder="5"
            />
          </div>
          <div>
            <Label>תוצאה</Label>
            <Input
              value={formData.outcome}
              onChange={(e) =>
                setFormData({ ...formData, outcome: e.target.value })
              }
              placeholder="לקוח מעוניין, קבענו פגישה"
            />
          </div>
          <div>
            <Label>הערות</Label>
            <Textarea
              value={formData.notes}
              onChange={(e) =>
                setFormData({ ...formData, notes: e.target.value })
              }
              rows={4}
              placeholder="פרטים נוספים..."
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={onClose}>
              ביטול
            </Button>
            <Button type="submit" disabled={loading}>
              שמור
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
