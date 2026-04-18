import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { entityCreate, entityList, entityUpdate } from "@/lib/entity-api";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info } from "lucide-react";

interface Lead {
  id: number | string;
  first_name?: string;
  company_name?: string;
  owner_user_id?: string;
}

interface UserRecord {
  email: string;
  full_name?: string;
  role?: string;
}

interface ReassignApprovalModalProps {
  open: boolean;
  onClose: () => void;
  lead: Lead;
}

export default function ReassignApprovalModal({
  open,
  onClose,
  lead,
}: ReassignApprovalModalProps) {
  const [newOwner, setNewOwner] = useState("");
  const [reason, setReason] = useState("");
  const queryClient = useQueryClient();

  const { data: users = [] } = useQuery<UserRecord[]>({
    queryKey: ["users"],
    queryFn: () => entityList<UserRecord>("users"),
  });

  const requestReassignMutation = useMutation({
    mutationFn: async (data: { newOwner: string; reason: string }) => {
      const user = await authJson("/api/auth/me");

      // Check if user is manager/admin
      if (user.role === "admin") {
        // Direct reassign
        await entityUpdate("leads", lead.id, {
          owner_user_id: data.newOwner,
        });

        // Create activity
        await entityCreate("lead-activities", {
          lead_id: lead.id,
          type: "owner_changed",
          description: `הליד הועבר ל-${data.newOwner} על ידי ${user.full_name}. סיבה: ${data.reason}`,
        });
      } else {
        // Create approval request
        await entityCreate("approval-requests", {
          request_type: "reassign_lead",
          entity_type: "Lead",
          entity_id: lead.id,
          requested_by: user.email,
          reason: data.reason,
          status: "pending",
          metadata: {
            lead_name: lead.first_name || lead.company_name,
            current_owner: lead.owner_user_id,
            new_owner: data.newOwner,
          },
        });

        // Notify manager
        await entityCreate("notifications", {
          user_email: "manager@company.com",
          title: "בקשה להעברת ליד",
          message: `${user.full_name} ביקש להעביר את הליד ${lead.first_name || lead.company_name}`,
          type: "approval_request",
          priority: "medium",
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["approval-requests"] });
      onClose();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOwner || !reason.trim()) return;
    requestReassignMutation.mutate({ newOwner, reason });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent dir="rtl">
        <DialogHeader>
          <DialogTitle>העברת בעלות על ליד</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              העברת ליד מחוץ לצוות שלך דורשת אישור מנהל
            </AlertDescription>
          </Alert>
          <div>
            <Label>בעלים חדש *</Label>
            <Select value={newOwner} onValueChange={setNewOwner}>
              <SelectTrigger>
                <SelectValue placeholder="בחר משתמש" />
              </SelectTrigger>
              <SelectContent>
                {users.map((u) => (
                  <SelectItem key={u.email} value={u.email}>
                    {u.full_name} ({u.email})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>סיבה להעברה *</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="למה להעביר את הליד?"
              rows={3}
              required
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              ביטול
            </Button>
            <Button
              type="submit"
              disabled={requestReassignMutation.isPending}
            >
              שלח לאישור
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
