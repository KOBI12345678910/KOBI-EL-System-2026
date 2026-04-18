import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { entityList, entityUpdate } from "@/lib/entity-api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, X } from "lucide-react";

interface Approval {
  id: number;
  title: string;
  description?: string;
  type: string;
  status: "pending" | "approved" | "rejected";
  created_date?: string;
}

export default function ApprovalCenter() {
  const queryClient = useQueryClient();

  const { data: approvals = [] } = useQuery({
    queryKey: ["approvals"],
    queryFn: () => entityList<Approval>("approvals"),
  });

  const approveMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      entityUpdate<Approval>("approvals", id, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["approvals"] }),
  });

  const statusColor: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-800",
    approved: "bg-green-100 text-green-800",
    rejected: "bg-red-100 text-red-800",
  };

  const pendingApprovals = approvals.filter((a) => a.status === "pending");
  const completedApprovals = approvals.filter((a) => a.status !== "pending");

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4">
          ממתינים לאישור ({pendingApprovals.length})
        </h3>
        <div className="grid gap-3">
          {pendingApprovals.map((approval) => (
            <Card key={approval.id} className="p-4 border-l-4 border-yellow-500">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="font-semibold text-slate-900">{approval.title}</p>
                  <p className="text-sm text-slate-600 mt-1">{approval.description}</p>
                  <div className="flex gap-2 mt-3">
                    <Badge className="bg-slate-100 text-slate-800">{approval.type}</Badge>
                    <Badge className={statusColor[approval.status]}>{approval.status}</Badge>
                  </div>
                </div>
                <div className="flex gap-2 ml-4">
                  <Button
                    size="sm"
                    onClick={() =>
                      approveMutation.mutate({ id: approval.id, status: "approved" })
                    }
                    className="bg-green-600 hover:bg-green-700"
                  >
                    <Check className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    onClick={() =>
                      approveMutation.mutate({ id: approval.id, status: "rejected" })
                    }
                    variant="outline"
                    className="text-red-600 border-red-300"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4">הסטוריה</h3>
        <div className="grid gap-2">
          {completedApprovals.map((approval) => (
            <Card key={approval.id} className="p-3 opacity-75">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="font-medium text-slate-900">{approval.title}</p>
                </div>
                <Badge className={statusColor[approval.status]}>{approval.status}</Badge>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
