import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { entityCreate } from "@/lib/entity-api";
import { Calendar, Clock } from "lucide-react";

interface FollowUpSchedulerProps {
  leadId: string;
  agentId?: string;
  onTaskCreated?: () => void;
}

export default function FollowUpScheduler({ leadId, agentId, onTaskCreated }: FollowUpSchedulerProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    category: "follow_up",
    priority: "medium",
    daysFromNow: "1",
  });

  const quickActions = [
    { label: "Call", title: "Make Call" },
    { label: "Email", title: "Send Email" },
    { label: "WhatsApp", title: "Send WhatsApp" },
    { label: "Proposal", title: "Send Proposal" },
    { label: "Demo", title: "Schedule Demo" },
    { label: "Follow-up", title: "Check In" },
  ];

  const handleQuickAction = (action: { title: string }) => {
    setFormData((prev) => ({ ...prev, title: action.title }));
  };

  const handleCreateTask = async () => {
    if (!formData.title) {
      alert("Enter a task title");
      return;
    }

    setLoading(true);
    try {
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + parseInt(formData.daysFromNow));

      await entityCreate("tasks", {
        lead_id: leadId,
        assigned_to: agentId,
        title: formData.title,
        description: formData.description,
        category: formData.category,
        priority: formData.priority,
        status: "todo",
        due_date: dueDate.toISOString(),
      });

      await entityCreate("activities", {
        entity_type: "lead",
        entity_id: leadId,
        action_type: "note",
        description: `Follow-up task scheduled: ${formData.title}`,
        performed_by: agentId,
      });

      setFormData({ title: "", description: "", category: "follow_up", priority: "medium", daysFromNow: "1" });
      setOpen(false);
      if (onTaskCreated) onTaskCreated();
    } catch (error) {
      console.error("Task creation error:", error);
      alert("Error creating task");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button onClick={() => setOpen(true)} className="bg-blue-600 hover:bg-blue-700 w-full">
        <Clock className="w-4 h-4 mr-2" />Schedule Follow-up
      </Button>

      {open && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-2xl border-0 shadow-2xl">
            <CardHeader className="bg-gradient-to-r from-blue-50 to-blue-100 border-b">
              <CardTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-blue-600" />Schedule Follow-up Task
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              <div>
                <p className="text-sm font-semibold text-slate-900 mb-3">Quick Actions:</p>
                <div className="grid grid-cols-3 gap-2">
                  {quickActions.map((action) => (
                    <Button key={action.title} variant="outline" onClick={() => handleQuickAction(action)} className={formData.title === action.title ? "border-blue-600 bg-blue-50 text-blue-600" : ""}>
                      {action.label}
                    </Button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Task Title *</label>
                <Input placeholder="e.g., Send Proposal, Schedule Demo" value={formData.title} onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))} className="border-slate-300" />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Description</label>
                <Textarea placeholder="Add details..." value={formData.description} onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))} className="border-slate-300 h-24" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Due Date</label>
                  <Select value={formData.daysFromNow} onValueChange={(value) => setFormData((prev) => ({ ...prev, daysFromNow: value }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">Today</SelectItem>
                      <SelectItem value="1">Tomorrow</SelectItem>
                      <SelectItem value="2">In 2 days</SelectItem>
                      <SelectItem value="3">In 3 days</SelectItem>
                      <SelectItem value="7">In 1 week</SelectItem>
                      <SelectItem value="14">In 2 weeks</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Priority</label>
                  <Select value={formData.priority} onValueChange={(value) => setFormData((prev) => ({ ...prev, priority: value }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <Button onClick={handleCreateTask} disabled={loading} className="flex-1 bg-blue-600 hover:bg-blue-700">
                  {loading ? "Creating..." : "Create Task"}
                </Button>
                <Button variant="outline" onClick={() => setOpen(false)} className="flex-1">Cancel</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
