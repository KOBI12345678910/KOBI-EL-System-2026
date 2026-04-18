import { useState, Fragment } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Zap } from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface TriggerItem {
  id: string;
  name: string;
  trigger_type: string;
  is_enabled: boolean;
}

interface WorkflowData {
  connected_modules?: string[];
  trigger_event?: string;
  execution_count?: number;
  error_count?: number;
}

interface Props {
  workflow?: WorkflowData;
  triggers?: TriggerItem[];
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function WorkflowVisualizer({ workflow, triggers }: Props) {
  const [hoveredNode, setHoveredNode] = useState<number | null>(null);

  if (!workflow) return null;

  const modules = workflow.connected_modules || [];

  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-6">
        <div className="space-y-4">
          <h3 className="font-semibold text-slate-900">Workflow Flow Map</h3>

          {/* Workflow Diagram */}
          <div className="bg-gradient-to-br from-slate-50 to-indigo-50 rounded-lg p-8 overflow-x-auto">
            <div className="flex items-center justify-center gap-4 min-w-max">
              {/* Trigger */}
              <div className="flex flex-col items-center">
                <div className="relative">
                  <div className="w-24 h-24 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center text-white shadow-lg">
                    <Zap className="w-8 h-8" />
                  </div>
                  <div className="absolute -bottom-8 left-1/2 transform -translate-x-1/2 whitespace-nowrap text-xs font-semibold text-slate-700">
                    Trigger
                  </div>
                </div>
                <p className="mt-10 text-xs font-medium text-slate-600 text-center max-w-24">
                  {workflow.trigger_event || "Not defined"}
                </p>
              </div>

              {/* Arrow */}
              <div className="flex items-center justify-center">
                <ArrowRight className="w-6 h-6 text-slate-400" />
              </div>

              {/* Modules */}
              {modules.map((module, idx) => (
                <Fragment key={idx}>
                  <div
                    className="flex flex-col items-center cursor-pointer"
                    onMouseEnter={() => setHoveredNode(idx)}
                    onMouseLeave={() => setHoveredNode(null)}
                  >
                    <div
                      className={`w-24 h-24 rounded-xl flex items-center justify-center text-white shadow-lg transition-all ${
                        hoveredNode === idx ? "scale-110 shadow-xl" : ""
                      } ${
                        idx % 3 === 0
                          ? "bg-gradient-to-br from-blue-500 to-cyan-600"
                          : idx % 3 === 1
                            ? "bg-gradient-to-br from-green-500 to-emerald-600"
                            : "bg-gradient-to-br from-orange-500 to-red-600"
                      }`}
                    >
                      <span className="text-2xl">📦</span>
                    </div>
                    <p className="mt-10 text-xs font-semibold text-slate-900 text-center">
                      {module}
                    </p>
                  </div>

                  {idx < modules.length - 1 && (
                    <ArrowRight className="w-6 h-6 text-slate-400" />
                  )}
                </Fragment>
              ))}
            </div>
          </div>

          {/* Triggers Info */}
          {triggers && triggers.length > 0 && (
            <div className="border-t pt-4">
              <p className="text-xs font-semibold text-slate-700 mb-3">
                Connected triggers:
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {triggers.map((trigger) => (
                  <div
                    key={trigger.id}
                    className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg text-xs"
                  >
                    <Badge variant="outline" className="text-xs">
                      {trigger.trigger_type}
                    </Badge>
                    <span className="text-slate-600 truncate">{trigger.name}</span>
                    <Badge
                      variant={trigger.is_enabled ? "default" : "secondary"}
                      className="text-xs ml-auto"
                    >
                      {trigger.is_enabled ? "On" : "Off"}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Stats */}
          <div className="grid grid-cols-3 gap-2 pt-4 border-t">
            <div className="text-center">
              <p className="text-2xl font-bold text-indigo-600">{modules.length}</p>
              <p className="text-xs text-slate-600">Modules</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-green-600">
                {workflow.execution_count || 0}
              </p>
              <p className="text-xs text-slate-600">Runs</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-red-600">
                {workflow.error_count || 0}
              </p>
              <p className="text-xs text-slate-600">Errors</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
