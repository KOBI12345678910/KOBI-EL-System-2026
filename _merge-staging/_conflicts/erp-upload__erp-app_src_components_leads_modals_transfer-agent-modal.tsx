import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { entityList, entityUpdate } from "@/lib/entity-api";
import { useQuery } from "@tanstack/react-query";

interface TransferAgentModalProps {
  open: boolean;
  onClose: () => void;
  leadId: number | string;
  onSuccess?: () => void;
}

interface UserRecord {
  id: string;
  email: string;
  full_name?: string;
}

export default function TransferAgentModal({
  open,
  onClose,
  leadId,
  onSuccess,
}: TransferAgentModalProps) {
  const [loading, setLoading] = useState(false);
  const [newOwner, setNewOwner] = useState("");

  const { data: users = [] } = useQuery<UserRecord[]>({
    queryKey: ["users"],
    queryFn: () => entityList<UserRecord>("users"),
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await entityUpdate("leads", leadId, {
        owner_user_id: newOwner,
      });
      onSuccess?.();
      onClose();
    } catch (error) {
      console.error("שגיאה בהעברת בעלות:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle>העברת בעלות ליד</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>סוכן חדש</Label>
            <Select value={newOwner} onValueChange={setNewOwner}>
              <SelectTrigger>
                <SelectValue placeholder="בחר סוכן..." />
              </SelectTrigger>
              <SelectContent>
                {users.map((user) => (
                  <SelectItem key={user.id} value={user.email}>
                    {user.full_name || user.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={onClose}>
              ביטול
            </Button>
            <Button type="submit" disabled={loading || !newOwner}>
              העבר
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
