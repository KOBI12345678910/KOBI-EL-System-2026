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

interface ReminderModalProps {
  open: boolean;
  onClose: () => void;
  leadId: number | string;
  onSuccess?: () => void;
}

interface ReminderFormData {
  title: string;
  due_date: string;
  description: string;
}

export default function ReminderModal({
  open,
  onClose,
  leadId,
  onSuccess,
}: ReminderModalProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<ReminderFormData>({
    title: "",
    due_date: "",
    description: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Reminder submit - formData:", formData, "leadId:", leadId);

    if (!formData.title || !formData.due_date) {
      alert("נא למלא כותרת ותאריך");
      return;
    }

    if (!leadId) {
      alert("שגיאה: חסר מזהה ליד");
      return;
    }

    setLoading(true);
    try {
      console.log("Creating reminder/task");
      const result = await entityCreate("tasks", {
        lead_id: leadId,
        title: formData.title,
        due_date: formData.due_date,
        description: formData.description,
        status: "todo",
        category: "follow_up",
      });
      console.log("Reminder created:", result);

      alert("התזכורת נוצרה בהצלחה!");
      onSuccess?.();
      setFormData({ title: "", due_date: "", description: "" });
      onClose();
    } catch (error) {
      console.error("שגיאה ביצירת תזכורת:", error);
      alert("שגיאה ביצירת התזכורת: " + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle>תזכורת חדשה</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>כותרת</Label>
            <Input
              value={formData.title}
              onChange={(e) =>
                setFormData({ ...formData, title: e.target.value })
              }
              placeholder="להתקשר ללקוח"
              required
            />
          </div>
          <div>
            <Label>תאריך ושעה</Label>
            <Input
              type="datetime-local"
              value={formData.due_date}
              onChange={(e) =>
                setFormData({ ...formData, due_date: e.target.value })
              }
              required
            />
          </div>
          <div>
            <Label>פרטים</Label>
            <Textarea
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              rows={3}
              placeholder="פרטים נוספים..."
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={onClose}>
              ביטול
            </Button>
            <Button type="submit" disabled={loading}>
              שמור תזכורת
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
