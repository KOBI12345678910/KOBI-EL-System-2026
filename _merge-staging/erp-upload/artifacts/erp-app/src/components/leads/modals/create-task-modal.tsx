import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { entityCreate, entityList } from "@/lib/entity-api";
import { authJson } from "@/lib/utils";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckSquare, Calendar, User, Flag } from "lucide-react";

interface CreateTaskModalProps {
  open: boolean;
  onClose: () => void;
  leadId: number | string;
}

interface TaskFormData {
  title: string;
  description: string;
  due_date: string;
  priority: string;
  category: string;
  assigned_to: string;
}

interface UserRecord {
  id: string;
  email: string;
  full_name?: string;
}

const emptyForm: TaskFormData = {
  title: "",
  description: "",
  due_date: "",
  priority: "medium",
  category: "follow_up",
  assigned_to: "",
};

export default function CreateTaskModal({
  open,
  onClose,
  leadId,
}: CreateTaskModalProps) {
  const [formData, setFormData] = useState<TaskFormData>({ ...emptyForm });

  const queryClient = useQueryClient();

  const { data: users = [] } = useQuery<UserRecord[]>({
    queryKey: ["users"],
    queryFn: () => entityList<UserRecord>("users"),
  });

  const createTaskMutation = useMutation({
    mutationFn: async (taskData: TaskFormData) => {
      console.log("Creating task with data:", taskData);
      const user = await authJson("/api/auth/me");
      const result = await entityCreate("tasks", {
        ...taskData,
        lead_id: leadId,
        created_by: user.id,
        status: "todo",
      });
      console.log("Task created:", result);
      return result;
    },
    onSuccess: async (data) => {
      console.log("Task creation succeeded:", data);
      await queryClient.invalidateQueries({ queryKey: ["lead-tasks", leadId] });
      await queryClient.invalidateQueries({ queryKey: ["tasks"] });

      // Create activity log
      try {
        await entityCreate("lead-activities", {
          lead_id: leadId,
          type: "task",
          description: `נוצרה משימה חדשה: ${formData.title}`,
        });
      } catch (err) {
        console.error("Failed to create activity log:", err);
      }

      toast.success("המשימה נוצרה בהצלחה");
      onClose();
      setFormData({ ...emptyForm });
    },
    onError: (error: Error) => {
      console.error("Error creating task:", error);
      toast.error("שגיאה ביצירת המשימה: " + error.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("handleSubmit called with formData:", formData);
    if (!formData.title) {
      toast.error("נא למלא כותרת למשימה");
      return;
    }
    if (!leadId) {
      console.error("No leadId provided!");
      toast.error("שגיאה: חסר מזהה ליד");
      return;
    }
    createTaskMutation.mutate(formData);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
              <CheckSquare className="w-5 h-5 text-white" />
            </div>
            יצירת משימה חדשה
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          {/* Title */}
          <div>
            <Label>כותרת *</Label>
            <Input
              value={formData.title}
              onChange={(e) =>
                setFormData({ ...formData, title: e.target.value })
              }
              placeholder="לדוגמה: להתקשר ללקוח"
              className="mt-1"
            />
          </div>

          {/* Description */}
          <div>
            <Label>תיאור</Label>
            <Textarea
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              placeholder="פרטים נוספים..."
              className="mt-1"
              rows={3}
            />
          </div>

          {/* Due Date & Priority */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                תאריך יעד
              </Label>
              <Input
                type="datetime-local"
                value={formData.due_date}
                onChange={(e) =>
                  setFormData({ ...formData, due_date: e.target.value })
                }
                className="mt-1"
              />
            </div>

            <div>
              <Label className="flex items-center gap-2">
                <Flag className="w-4 h-4" />
                עדיפות
              </Label>
              <Select
                value={formData.priority}
                onValueChange={(val) =>
                  setFormData({ ...formData, priority: val })
                }
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">נמוכה</SelectItem>
                  <SelectItem value="medium">בינונית</SelectItem>
                  <SelectItem value="high">גבוהה</SelectItem>
                  <SelectItem value="critical">קריטית</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Category & Assigned To */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>קטגוריה</Label>
              <Select
                value={formData.category}
                onValueChange={(val) =>
                  setFormData({ ...formData, category: val })
                }
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="follow_up">מעקב</SelectItem>
                  <SelectItem value="meeting">פגישה</SelectItem>
                  <SelectItem value="call">שיחה</SelectItem>
                  <SelectItem value="email">מייל</SelectItem>
                  <SelectItem value="proposal">הצעת מחיר</SelectItem>
                  <SelectItem value="contract">חוזה</SelectItem>
                  <SelectItem value="delivery">משלוח</SelectItem>
                  <SelectItem value="other">אחר</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="flex items-center gap-2">
                <User className="w-4 h-4" />
                שייך לסוכן
              </Label>
              <Select
                value={formData.assigned_to}
                onValueChange={(val) =>
                  setFormData({ ...formData, assigned_to: val })
                }
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="בחר סוכן" />
                </SelectTrigger>
                <SelectContent>
                  {users.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.full_name || user.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              ביטול
            </Button>
            <Button
              type="submit"
              disabled={createTaskMutation.isPending}
              className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700"
            >
              {createTaskMutation.isPending ? "יוצר..." : "צור משימה"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
