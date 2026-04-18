import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { entityCreate } from "@/lib/entity-api";
import { authJson } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";

interface Lead {
  id: number | string;
  first_name?: string;
  company_name?: string;
  phone?: string;
  status?: string;
}

interface DeleteApprovalModalProps {
  open: boolean;
  onClose: () => void;
  lead: Lead;
}

export default function DeleteApprovalModal({
  open,
  onClose,
  lead,
}: DeleteApprovalModalProps) {
  const [reason, setReason] = useState("");
  const queryClient = useQueryClient();

  const requestDeleteMutation = useMutation({
    mutationFn: async (data: { reason: string }) => {
      const user = await authJson("/api/auth/me");

      // Create approval request
      await entityCreate("approval-requests", {
        request_type: "delete_lead",
        entity_type: "Lead",
        entity_id: lead.id,
        requested_by: user.email,
        reason: data.reason,
        status: "pending",
        metadata: {
          lead_name: lead.first_name || lead.company_name,
          lead_phone: lead.phone,
          lead_status: lead.status,
        },
      });

      // Create notification for manager
      await entityCreate("notifications", {
        user_email: "manager@company.com", // Should be dynamic based on role
        title: "בקשה למחיקת ליד",
        message: `${user.full_name} ביקש למחוק את הליד: ${lead.first_name || lead.company_name}`,
        type: "approval_request",
        priority: "medium",
        entity_type: "ApprovalRequest",
        metadata: { lead_id: lead.id },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["approval-requests"] });
      onClose();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) return;
    requestDeleteMutation.mutate({ reason });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent dir="rtl">
        <DialogHeader>
          <DialogTitle>בקשה למחיקת ליד</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              מחיקת ליד דורשת אישור מנהל. הבקשה תישלח לאישור.
            </AlertDescription>
          </Alert>
          <div>
            <Label>סיבה למחיקה *</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="למה למחוק את הליד הזה?"
              rows={4}
              required
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              ביטול
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={requestDeleteMutation.isPending}
            >
              שלח לאישור
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
