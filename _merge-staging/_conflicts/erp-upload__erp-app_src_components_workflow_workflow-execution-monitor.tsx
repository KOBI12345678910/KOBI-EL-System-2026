import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, CheckCircle, Clock, ChevronDown, Copy } from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ExecutionStep {
  name: string;
  status: "success" | "failed" | "running";
  duration: number;
  error?: string;
}

interface Execution {
  id: number;
  status: "success" | "failed" | "running";
  startTime: Date;
  endTime?: Date;
  duration: number;
  error?: string;
  steps: ExecutionStep[];
}

interface Props {
  workflowId?: string;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function WorkflowExecutionMonitor({ workflowId }: Props) {
  const [expandedExecution, setExpandedExecution] = useState<number | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const { data: executions = [], refetch } = useQuery<Execution[]>({
    queryKey: ["workflow-executions", workflowId],
    queryFn: async () => {
      // Simulated data - replace with actual API call
      return [
        {
          id: 1,
          status: "success" as const,
          startTime: new Date(Date.now() - 5 * 60000),
          endTime: new Date(Date.now() - 4 * 60000),
          duration: 60,
          steps: [
            { name: "Trigger", status: "success" as const, duration: 5 },
            { name: "Load Data", status: "success" as const, duration: 15 },
            { name: "Transform", status: "success" as const, duration: 20 },
            { name: "Update Target", status: "success" as const, duration: 20 },
          ],
        },
        {
          id: 2,
          status: "failed" as const,
          startTime: new Date(Date.now() - 15 * 60000),
          endTime: new Date(Date.now() - 14 * 60000),
          duration: 45,
          error: "Invalid field mapping: source.amount != target.price format",
          steps: [
            { name: "Trigger", status: "success" as const, duration: 5 },
            { name: "Load Data", status: "success" as const, duration: 15 },
            { name: "Transform", status: "failed" as const, duration: 25, error: "Field type mismatch" },
          ],
        },
        {
          id: 3,
          status: "running" as const,
          startTime: new Date(Date.now() - 30000),
          duration: 30,
          steps: [
            { name: "Trigger", status: "success" as const, duration: 5 },
            { name: "Load Data", status: "running" as const, duration: 25 },
          ],
        },
      ];
    },
    refetchInterval: autoRefresh ? 5000 : false,
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "success":
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case "failed":
        return <AlertCircle className="w-4 h-4 text-red-600" />;
      case "running":
        return <Clock className="w-4 h-4 text-blue-600 animate-spin" />;
      default:
        return null;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "success":
        return "bg-green-100 text-green-800";
      case "failed":
        return "bg-red-100 text-red-800";
      case "running":
        return "bg-blue-100 text-blue-800";
      default:
        return "bg-slate-100 text-slate-800";
    }
  };

  const successCount = executions.filter((e) => e.status === "success").length;
  const failedCount = executions.filter((e) => e.status === "failed").length;
  const successRate =
    executions.length > 0 ? Math.round((successCount / executions.length) * 100) : 0;

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Real-time Execution Monitor</CardTitle>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={autoRefresh ? "default" : "outline"}
              onClick={() => setAutoRefresh(!autoRefresh)}
              className="gap-1 text-xs"
            >
              {autoRefresh ? "Pause" : "Resume"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => refetch()}
              className="gap-1 text-xs"
            >
              Refresh
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="p-3 bg-gradient-to-br from-green-50 to-green-100 rounded-lg">
            <p className="text-xs text-green-700 mb-1">Succeeded</p>
            <p className="text-2xl font-bold text-green-900">{successCount}</p>
          </div>
          <div className="p-3 bg-gradient-to-br from-red-50 to-red-100 rounded-lg">
            <p className="text-xs text-red-700 mb-1">Failed</p>
            <p className="text-2xl font-bold text-red-900">{failedCount}</p>
          </div>
          <div className="p-3 bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg">
            <p className="text-xs text-blue-700 mb-1">Success Rate</p>
            <p className="text-2xl font-bold text-blue-900">{successRate}%</p>
          </div>
          <div className="p-3 bg-gradient-to-br from-slate-50 to-slate-100 rounded-lg">
            <p className="text-xs text-slate-700 mb-1">Total Runs</p>
            <p className="text-2xl font-bold text-slate-900">{executions.length}</p>
          </div>
        </div>

        {/* Executions Timeline */}
        <Tabs defaultValue="recent" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="recent">Recent Runs</TabsTrigger>
            <TabsTrigger value="errors">Errors</TabsTrigger>
          </TabsList>

          <TabsContent value="recent" className="space-y-2 mt-4">
            {executions.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                <p className="text-sm">No runs yet</p>
              </div>
            ) : (
              executions.map((execution) => (
                <div
                  key={execution.id}
                  className="border border-slate-200 rounded-lg overflow-hidden"
                >
                  <button
                    onClick={() =>
                      setExpandedExecution(
                        expandedExecution === execution.id ? null : execution.id
                      )
                    }
                    className="w-full p-4 hover:bg-slate-50 transition-colors flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3 flex-1">
                      {getStatusIcon(execution.status)}
                      <div className="text-left">
                        <p className="text-sm font-semibold text-slate-900">
                          Run #{execution.id}
                        </p>
                        <p className="text-xs text-slate-600">
                          {execution.startTime.toLocaleTimeString("en-US")}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge className={getStatusColor(execution.status)}>
                        {execution.status === "success" && "Success"}
                        {execution.status === "failed" && "Failed"}
                        {execution.status === "running" && "Running"}
                      </Badge>
                      <span className="text-xs font-semibold text-slate-600 min-w-12">
                        {execution.duration}s
                      </span>
                      <ChevronDown
                        className={`w-4 h-4 transition-transform ${expandedExecution === execution.id ? "rotate-180" : ""}`}
                      />
                    </div>
                  </button>

                  {expandedExecution === execution.id && (
                    <div className="border-t border-slate-200 bg-slate-50 p-4 space-y-3">
                      {execution.error && (
                        <div className="p-3 bg-red-100 border border-red-300 rounded-lg">
                          <p className="text-xs font-semibold text-red-900 mb-1">Error:</p>
                          <p className="text-xs text-red-800">{execution.error}</p>
                        </div>
                      )}

                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-slate-700">Steps:</p>
                        {execution.steps.map((step, idx) => (
                          <div
                            key={idx}
                            className="flex items-center gap-2 p-2 bg-white rounded border border-slate-200"
                          >
                            {getStatusIcon(step.status)}
                            <span className="text-xs font-medium text-slate-900 flex-1">
                              {step.name}
                            </span>
                            <span className="text-xs text-slate-600">{step.duration}ms</span>
                            {step.error && (
                              <span className="text-xs text-red-600">({step.error})</span>
                            )}
                          </div>
                        ))}
                      </div>

                      <div className="p-2 bg-white rounded border border-slate-200">
                        <button className="w-full text-left text-xs font-semibold text-slate-700 hover:text-slate-900">
                          <Copy className="w-3 h-3 inline mr-1" />
                          Show response JSON
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </TabsContent>

          <TabsContent value="errors" className="space-y-2 mt-4">
            {executions.filter((e) => e.status === "failed").length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                <p className="text-sm">No errors</p>
              </div>
            ) : (
              executions
                .filter((e) => e.status === "failed")
                .map((execution) => (
                  <div
                    key={execution.id}
                    className="p-4 bg-red-50 border border-red-200 rounded-lg"
                  >
                    <p className="text-xs font-semibold text-red-900 mb-1">
                      Run #{execution.id}
                    </p>
                    <p className="text-xs text-red-700">{execution.error}</p>
                  </div>
                ))
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
