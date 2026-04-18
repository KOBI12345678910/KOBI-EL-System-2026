import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Workflow, Plus, Play, Pause, Trash2 } from "lucide-react";

interface WorkflowItem {
  id: number;
  name: string;
  steps: number;
  active: boolean;
  trigger: string;
}

export default function WorkflowBuilder() {
  const [workflows] = useState<WorkflowItem[]>([
    { id: 1, name: "New Lead Flow", steps: 4, active: true, trigger: "Lead created" },
    { id: 2, name: "Deal Won Notification", steps: 3, active: true, trigger: "Deal stage changed" },
    { id: 3, name: "Email Nurture Sequence", steps: 6, active: false, trigger: "Lead inactive 7 days" },
  ]);

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Workflow className="w-5 h-5 text-purple-600" />
          Custom Workflows (No-Code)
        </CardTitle>
        <Button size="sm" className="bg-purple-600">
          <Plus className="w-4 h-4 ml-1" />
          New Workflow
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {workflows.map((wf) => (
          <div
            key={wf.id}
            className="p-3 border border-slate-200 rounded-lg flex items-center justify-between hover:bg-slate-50"
          >
            <div>
              <p className="font-medium text-slate-900 text-sm">{wf.name}</p>
              <p className="text-xs text-slate-500">Trigger: {wf.trigger}</p>
              <div className="mt-1 flex gap-2">
                <Badge variant="outline" className="text-xs">
                  {wf.steps} steps
                </Badge>
                <Badge
                  className={
                    wf.active
                      ? "bg-emerald-100 text-emerald-700 text-xs"
                      : "bg-slate-200 text-slate-700 text-xs"
                  }
                >
                  {wf.active ? "Active" : "Paused"}
                </Badge>
              </div>
            </div>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8">
                {wf.active ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <Trash2 className="w-4 h-4 text-red-600" />
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
