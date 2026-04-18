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
import { authJson } from "@/lib/utils";

interface Lead {
  id: number | string;
  email?: string;
}

interface EmailModalProps {
  open: boolean;
  onClose: () => void;
  lead: Lead;
  onSuccess?: () => void;
}

interface EmailFormData {
  subject: string;
  body: string;
}

export default function EmailModal({
  open,
  onClose,
  lead,
  onSuccess,
}: EmailModalProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<EmailFormData>({
    subject: "",
    body: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Email submit - formData:", formData);

    if (!formData.subject || !formData.body) {
      alert("נא למלא נושא ותוכן המייל");
      return;
    }

    if (!lead?.email) {
      alert("הליד לא מכיל כתובת אימייל");
      return;
    }

    setLoading(true);
    try {
      console.log("Sending email to:", lead.email);
      await authJson("/api/email/send", {
        method: "POST",
        body: JSON.stringify({
          to: lead.email,
          subject: formData.subject,
          body: formData.body,
        }),
      });

      console.log("Email sent, creating activity log");
      await entityCreate("lead-activities", {
        lead_id: lead.id,
        type: "email",
        description: `נשלח מייל: ${formData.subject}`,
      });

      alert("המייל נשלח בהצלחה!");
      onSuccess?.();
      setFormData({ subject: "", body: "" });
      onClose();
    } catch (error) {
      console.error("שגיאה בשליחת מייל:", error);
      alert("שגיאה בשליחת המייל: " + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-xl" dir="rtl">
        <DialogHeader>
          <DialogTitle>שליחת מייל</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>לכתובת</Label>
            <Input value={lead?.email ?? ""} readOnly className="bg-slate-50" />
          </div>
          <div>
            <Label>נושא</Label>
            <Input
              value={formData.subject}
              onChange={(e) =>
                setFormData({ ...formData, subject: e.target.value })
              }
              placeholder="הצעת מחיר עבור פרויקט..."
              required
            />
          </div>
          <div>
            <Label>תוכן</Label>
            <Textarea
              value={formData.body}
              onChange={(e) =>
                setFormData({ ...formData, body: e.target.value })
              }
              rows={8}
              placeholder="שלום, מצורף הצעת מחיר..."
              required
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={onClose}>
              ביטול
            </Button>
            <Button type="submit" disabled={loading}>
              שלח מייל
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
