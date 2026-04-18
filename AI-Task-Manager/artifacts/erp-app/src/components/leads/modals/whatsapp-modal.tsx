import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MessageCircle } from "lucide-react";

interface Lead {
  first_name?: string;
  owner_user_id?: string;
  phone?: string;
}

interface WhatsAppModalProps {
  open: boolean;
  onClose: () => void;
  lead: Lead;
}

export default function WhatsAppModal({
  open,
  onClose,
  lead,
}: WhatsAppModalProps) {
  const message = `שלום ${lead?.first_name || "לקוח"}, זה ${lead?.owner_user_id || "הסוכן"} מ-MetalPro. איך אפשר לעזור?`;

  const handleSend = () => {
    const phone = lead?.phone?.replace(/[^0-9]/g, "");
    const url = `https://wa.me/972${phone}?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="w-5 h-5" />
            שליחת וואטסאפ
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <p className="text-sm text-slate-600 mb-2">
              לטלפון: {lead?.phone}
            </p>
            <Textarea value={message} readOnly rows={4} />
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onClose}>
              ביטול
            </Button>
            <Button
              onClick={handleSend}
              className="gap-2 bg-green-600 hover:bg-green-700"
            >
              <MessageCircle className="w-4 h-4" />
              פתח וואטסאפ
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
