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
import { entityCreate } from "@/lib/entity-api";
import { authJson } from "@/lib/utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Calendar, Video, MapPin, Clock } from "lucide-react";

interface CreateMeetingModalProps {
  open: boolean;
  onClose: () => void;
  leadId: number | string;
}

interface MeetingFormData {
  title: string;
  description: string;
  meeting_date: string;
  duration_minutes: number;
  meeting_type: string;
  location: string;
}

const emptyForm: MeetingFormData = {
  title: "",
  description: "",
  meeting_date: "",
  duration_minutes: 60,
  meeting_type: "in_person",
  location: "",
};

export default function CreateMeetingModal({
  open,
  onClose,
  leadId,
}: CreateMeetingModalProps) {
  const [formData, setFormData] = useState<MeetingFormData>({ ...emptyForm });

  const queryClient = useQueryClient();

  const createMeetingMutation = useMutation({
    mutationFn: async (meetingData: MeetingFormData) => {
      console.log("Creating meeting with data:", meetingData);
      const user = await authJson("/api/auth/me");
      const result = await entityCreate("meetings", {
        ...meetingData,
        lead_id: leadId,
        created_by: user.id,
        status: "scheduled",
      });
      console.log("Meeting created:", result);
      return result;
    },
    onSuccess: async (data) => {
      console.log("Meeting creation succeeded:", data);
      await queryClient.invalidateQueries({ queryKey: ["lead-meetings", leadId] });
      await queryClient.invalidateQueries({ queryKey: ["meetings"] });

      // Create activity log
      try {
        await entityCreate("lead-activities", {
          lead_id: leadId,
          type: "meeting",
          description: `נקבעה פגישה: ${formData.title}`,
        });
      } catch (err) {
        console.error("Failed to create activity log:", err);
      }

      toast.success("הפגישה נוצרה בהצלחה");
      onClose();
      setFormData({ ...emptyForm });
    },
    onError: (error: Error) => {
      console.error("Error creating meeting:", error);
      toast.error("שגיאה ביצירת הפגישה: " + error.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Meeting submit - formData:", formData, "leadId:", leadId);

    if (!formData.title || !formData.meeting_date) {
      toast.error("נא למלא כותרת ותאריך");
      return;
    }

    if (!leadId) {
      console.error("No leadId provided!");
      toast.error("שגיאה: חסר מזהה ליד");
      return;
    }

    createMeetingMutation.mutate(formData);
  };

  const generateZoomLink = () => {
    const mockZoomLink = `https://zoom.us/j/${Math.floor(Math.random() * 1000000000)}`;
    setFormData({ ...formData, location: mockZoomLink, meeting_type: "video" });
    toast.success("נוצר קישור Zoom (דמו)");
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
              <Calendar className="w-5 h-5 text-white" />
            </div>
            יצירת פגישה חדשה
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
              placeholder="לדוגמה: פגישת היכרות"
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
              placeholder="נושאים לדיון..."
              className="mt-1"
              rows={3}
            />
          </div>

          {/* Date & Duration */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                תאריך ושעה *
              </Label>
              <Input
                type="datetime-local"
                value={formData.meeting_date}
                onChange={(e) =>
                  setFormData({ ...formData, meeting_date: e.target.value })
                }
                className="mt-1"
              />
            </div>

            <div>
              <Label className="flex items-center gap-2">
                <Clock className="w-4 h-4" />
                משך (דקות)
              </Label>
              <Input
                type="number"
                value={formData.duration_minutes}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    duration_minutes: parseInt(e.target.value),
                  })
                }
                className="mt-1"
                min="15"
                step="15"
              />
            </div>
          </div>

          {/* Meeting Type */}
          <div>
            <Label className="flex items-center gap-2">
              <Video className="w-4 h-4" />
              סוג הפגישה
            </Label>
            <Select
              value={formData.meeting_type}
              onValueChange={(val) =>
                setFormData({ ...formData, meeting_type: val })
              }
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="in_person">פנים אל פנים</SelectItem>
                <SelectItem value="video">וידאו</SelectItem>
                <SelectItem value="phone">טלפון</SelectItem>
                <SelectItem value="other">אחר</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Location / Link */}
          <div>
            <Label className="flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              מיקום / קישור
            </Label>
            <div className="flex gap-2 mt-1">
              <Input
                value={formData.location}
                onChange={(e) =>
                  setFormData({ ...formData, location: e.target.value })
                }
                placeholder="כתובת או קישור"
                className="flex-1"
              />
              <Button type="button" variant="outline" onClick={generateZoomLink}>
                <Video className="w-4 h-4" />
                Zoom
              </Button>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              ביטול
            </Button>
            <Button
              type="submit"
              disabled={createMeetingMutation.isPending}
              className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700"
            >
              {createMeetingMutation.isPending ? "יוצר..." : "צור פגישה"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
