import React from "react";
import { useQuery } from "@tanstack/react-query";

type WorkflowRunCore = {
  id: number;
  workflow_code: string;
  workflow_name: string;
  parent_entity_type?: string | null;
  parent_entity_id?: number | null;
  correlation_id?: string | null;
  state: string;
  started_at: string;
  finished_at?: string | null;
  triggered_by_user_name?: string | null;
};

type WorkflowStepRun = {
  id: number;
  step_code: string;
  step_name: string;
  step_type: string;
  sequence_order: number;
  state: string;
  started_at?: string | null;
  finished_at?: string | null;
  error_message?: string | null;
};

type WorkflowRunPayload = {
  run: WorkflowRunCore;
  steps: WorkflowStepRun[];
};

function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString("he-IL");
  } catch {
    return value;
  }
}

function badgeClass(value?: string | null): string {
  const s = (value || "").toLowerCase();
  if (["completed", "success", "running"].includes(s)) return "bg-emerald-100 text-emerald-800 border border-emerald-200";
  if (["failed", "error", "stuck"].includes(s)) return "bg-red-100 text-red-800 border border-red-200";
  if (["queued", "pending", "waiting"].includes(s)) return "bg-amber-100 text-amber-800 border border-amber-200";
  return "bg-slate-100 text-slate-800 border border-slate-200";
}

function Badge({ value }: { value?: string | null }) {
  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${badgeClass(value)}`}>{value || "—"}</span>;
}

async function fetchWorkflowRun360(runId: number): Promise<WorkflowRunPayload> {
  const res = await fetch(`/api/workflows/run/${runId}`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
  });

  if (!res.ok) throw new Error(`Failed to fetch workflow run: ${res.status}`);
  const json = await res.json();
  return json.data ?? json;
}

export const workflowRunQueryKey = (runId: number) => ["workflowRun360", runId] as const;

export default function WorkflowRun360({ runId }: { runId: number }) {
  const query = useQuery({
    queryKey: workflowRunQueryKey(runId),
    queryFn: () => fetchWorkflowRun360(runId),
    refetchInterval: 15_000,
  });

  if (query.isLoading) return <div className="p-6 text-white">Loading workflow run...</div>;
  if (query.isError || !query.data?.run) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-800">
          Failed to load workflow run
        </div>
      </div>
    );
  }

  const { run, steps } = query.data;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl p-6 space-y-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-black text-slate-900">{run.workflow_name}</h1>
              <div className="mt-2 text-sm text-slate-600">
                {run.workflow_code} • Parent: {run.parent_entity_type || "—"} #{run.parent_entity_id || "—"}
              </div>
              <div className="mt-1 text-sm text-slate-500">
                Triggered by: {run.triggered_by_user_name || "—"} • Started: {formatDateTime(run.started_at)} • Finished: {formatDateTime(run.finished_at)}
              </div>
            </div>
            <Badge value={run.state} />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4 text-lg font-black text-slate-900">
            Workflow Steps
          </div>
          <div className="p-5 space-y-3">
            {steps.map((step) => (
              <div key={step.id} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-bold text-slate-900">
                      #{step.sequence_order} • {step.step_name}
                    </div>
                    <div className="mt-2 text-sm text-slate-600">
                      {step.step_code} • {step.step_type}
                    </div>
                    <div className="mt-1 text-sm text-slate-600">
                      Started: {formatDateTime(step.started_at)} • Finished: {formatDateTime(step.finished_at)}
                    </div>
                    {step.error_message ? (
                      <div className="mt-2 text-sm text-red-700">{step.error_message}</div>
                    ) : null}
                  </div>
                  <Badge value={step.state} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
