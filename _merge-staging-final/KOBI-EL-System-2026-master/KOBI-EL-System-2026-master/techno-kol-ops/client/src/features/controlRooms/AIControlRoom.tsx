import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

type AISummary = {
  snapshot_date?: string;
  active_models?: number;
  executions_today?: number;
  failed_executions?: number;
  pending_recommendations?: number;
  feedback_items?: number;
  unhealthy_agents?: number;
};

type AIModelRow = {
  id: number;
  model_code: string;
  model_name: string;
  model_type: string;
  version: string;
  status: string;
  deployed_at?: string | null;
};

type AIExecutionRow = {
  id: number;
  model_registry_id: number;
  execution_type: string;
  parent_entity_type?: string | null;
  parent_entity_id?: number | null;
  success: boolean;
  started_at: string;
  finished_at?: string | null;
  error_message?: string | null;
};

type AIRecommendationRow = {
  id: number;
  recommendation_number: string;
  parent_entity_type?: string | null;
  parent_entity_id?: number | null;
  recommendation_text: string;
  priority?: string | null;
  confidence_score?: number | null;
  state: string;
};

type AIFeedbackRow = {
  id: number;
  recommendation_id: number;
  feedback_type: string;
  feedback_notes?: string | null;
  provided_by_user_name?: string | null;
  provided_at: string;
};

type AIAgentHealthRow = {
  agent_code: string;
  agent_name: string;
  status: string;
  last_heartbeat_at?: string | null;
  pending_jobs: number;
  failed_jobs_24h: number;
};

type AIControlRoomPayload = {
  summary?: AISummary;
  models?: AIModelRow[];
  executions?: AIExecutionRow[];
  recommendations?: AIRecommendationRow[];
  feedback?: AIFeedbackRow[];
  agents?: AIAgentHealthRow[];
};

function formatDate(value?: string | null): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString("he-IL");
  } catch {
    return value;
  }
}

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
  if (["active", "healthy", "success", "applied", "approved"].includes(s)) {
    return "bg-emerald-100 text-emerald-800 border border-emerald-200";
  }
  if (["failed", "unhealthy", "critical", "rejected", "error"].includes(s)) {
    return "bg-red-100 text-red-800 border border-red-200";
  }
  if (["pending", "queued", "warning", "draft"].includes(s)) {
    return "bg-amber-100 text-amber-800 border border-amber-200";
  }
  return "bg-slate-100 text-slate-800 border border-slate-200";
}

async function fetchAIControlRoom(): Promise<AIControlRoomPayload> {
  const res = await fetch("/api/control-room/ai", {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch AI control room: ${res.status}`);
  }

  const json = await res.json();
  return json.data ?? json;
}

export const aiControlRoomQueryKey = () => ["aiControlRoom"] as const;

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-4 text-lg font-black text-slate-900">
        {title}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function MetricCard({
  title,
  value,
}: {
  title: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-sm text-slate-500">{title}</div>
      <div className="mt-3 text-3xl font-black text-slate-900">{value}</div>
    </div>
  );
}

function Badge({ value }: { value?: string | null }) {
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${badgeClass(value)}`}>
      {value || "—"}
    </span>
  );
}

type AITab =
  | "overview"
  | "models"
  | "executions"
  | "recommendations"
  | "feedback"
  | "agents";

function TabButton({
  active,
  label,
  onClick,
  count,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
        active
          ? "bg-slate-900 text-white"
          : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
      }`}
    >
      {label}
      {typeof count === "number" ? ` (${count})` : ""}
    </button>
  );
}

export default function AIControlRoom() {
  const [activeTab, setActiveTab] = useState<AITab>("overview");

  const query = useQuery({
    queryKey: aiControlRoomQueryKey(),
    queryFn: fetchAIControlRoom,
    refetchInterval: 45_000,
  });

  if (query.isLoading) {
    return <div className="p-6 text-white">Loading AI control room...</div>;
  }

  if (query.isError) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-800">
          שגיאה בטעינת AI Control Room
        </div>
      </div>
    );
  }

  const data = query.data ?? {};
  const summary = data.summary ?? {};
  const models = data.models ?? [];
  const executions = data.executions ?? [];
  const recommendations = data.recommendations ?? [];
  const feedback = data.feedback ?? [];
  const agents = data.agents ?? [];

  const nextBestAction = useMemo(() => {
    if ((summary.unhealthy_agents ?? 0) > 0) return "טפל ב־AI agents לא בריאים";
    if ((summary.failed_executions ?? 0) > 0) return "בדוק failures בהרצות מודלים";
    if ((summary.pending_recommendations ?? 0) > 0) return "בדוק המלצות AI שממתינות להחלטה";
    return "שמור על בריאות המודלים, agents ו־feedback loop";
  }, [summary]);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-[1600px] p-6 space-y-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-4xl font-black text-slate-900">AI Control Room</h1>
              <div className="mt-2 text-sm text-slate-600">
                שליטה במודלים, agents, recommendation queue, feedback loop ו־execution health.
              </div>
              <div className="mt-2 text-sm text-slate-500">
                Snapshot: {formatDate(summary.snapshot_date)}
              </div>
            </div>
            <button
              type="button"
              onClick={() => query.refetch()}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-700"
            >
              רענן
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-4">
          <MetricCard title="Active Models" value={String(summary.active_models ?? 0)} />
          <MetricCard title="Executions Today" value={String(summary.executions_today ?? 0)} />
          <MetricCard title="Failed Executions" value={String(summary.failed_executions ?? 0)} />
          <MetricCard title="Pending Recos" value={String(summary.pending_recommendations ?? 0)} />
          <MetricCard title="Feedback Items" value={String(summary.feedback_items ?? 0)} />
          <MetricCard title="Unhealthy Agents" value={String(summary.unhealthy_agents ?? 0)} />
        </div>

        <div className="flex flex-wrap gap-2">
          <TabButton active={activeTab === "overview"} label="סקירה" onClick={() => setActiveTab("overview")} />
          <TabButton active={activeTab === "models"} label="Models" onClick={() => setActiveTab("models")} count={models.length} />
          <TabButton active={activeTab === "executions"} label="Executions" onClick={() => setActiveTab("executions")} count={executions.length} />
          <TabButton active={activeTab === "recommendations"} label="Recommendations" onClick={() => setActiveTab("recommendations")} count={recommendations.length} />
          <TabButton active={activeTab === "feedback"} label="Feedback" onClick={() => setActiveTab("feedback")} count={feedback.length} />
          <TabButton active={activeTab === "agents"} label="Agents" onClick={() => setActiveTab("agents")} count={agents.length} />
        </div>

        {activeTab === "overview" && (
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_1fr] gap-6">
            <Panel title="Agent Health">
              {agents.length === 0 ? (
                <div className="text-sm text-slate-600">אין agents להצגה.</div>
              ) : (
                <div className="space-y-3">
                  {agents.slice(0, 8).map((a) => (
                    <div key={a.agent_code} className="rounded-2xl border border-slate-200 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="font-bold text-slate-900">
                            {a.agent_name} • {a.agent_code}
                          </div>
                          <div className="mt-2 text-sm text-slate-600">
                            Pending Jobs: {a.pending_jobs} • Failed 24h: {a.failed_jobs_24h} • Last heartbeat: {formatDateTime(a.last_heartbeat_at)}
                          </div>
                        </div>
                        <Badge value={a.status} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            <Panel title="Recommendation Queue">
              {recommendations.length === 0 ? (
                <div className="text-sm text-slate-600">אין recommendations ממתינות.</div>
              ) : (
                <div className="space-y-3">
                  {recommendations.slice(0, 8).map((r) => (
                    <div key={r.id} className="rounded-2xl border border-slate-200 p-4">
                      <div className="font-bold text-slate-900">
                        {r.recommendation_number} • {r.priority || "normal"}
                      </div>
                      <div className="mt-2 text-sm text-slate-700">{r.recommendation_text}</div>
                      <div className="mt-2 text-xs text-slate-500">
                        Parent: {r.parent_entity_type || "—"} #{r.parent_entity_id || "—"} • Confidence: {r.confidence_score ?? "—"}
                      </div>
                      <div className="mt-2">
                        <Badge value={r.state} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </div>
        )}

        {activeTab === "models" && (
          <Panel title="Model Registry">
            <div className="space-y-3">
              {models.map((m) => (
                <div key={m.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-bold text-slate-900">
                        {m.model_name} • {m.model_code}
                      </div>
                      <div className="mt-2 text-sm text-slate-600">
                        Type: {m.model_type} • Version: {m.version} • Deployed: {formatDateTime(m.deployed_at)}
                      </div>
                    </div>
                    <Badge value={m.status} />
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        )}

        {activeTab === "executions" && (
          <Panel title="Model Executions">
            <div className="space-y-3">
              {executions.map((e) => (
                <div key={e.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-bold text-slate-900">
                        Model #{e.model_registry_id} • {e.execution_type}
                      </div>
                      <div className="mt-2 text-sm text-slate-600">
                        Parent: {e.parent_entity_type || "—"} #{e.parent_entity_id || "—"}
                      </div>
                      <div className="mt-1 text-sm text-slate-600">
                        Started: {formatDateTime(e.started_at)} • Finished: {formatDateTime(e.finished_at)}
                      </div>
                      {e.error_message ? (
                        <div className="mt-2 text-sm text-red-700">{e.error_message}</div>
                      ) : null}
                    </div>
                    <Badge value={e.success ? "success" : "failed"} />
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        )}

        {activeTab === "recommendations" && (
          <Panel title="Recommendations">
            <div className="space-y-3">
              {recommendations.map((r) => (
                <div key={r.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-bold text-slate-900">{r.recommendation_number}</div>
                      <div className="mt-2 text-sm text-slate-700">{r.recommendation_text}</div>
                      <div className="mt-2 text-xs text-slate-500">
                        Priority: {r.priority || "—"} • Confidence: {r.confidence_score ?? "—"}
                      </div>
                    </div>
                    <Badge value={r.state} />
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        )}

        {activeTab === "feedback" && (
          <Panel title="Recommendation Feedback">
            <div className="space-y-3">
              {feedback.map((f) => (
                <div key={f.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="font-bold text-slate-900">
                    Recommendation #{f.recommendation_id} • {f.feedback_type}
                  </div>
                  <div className="mt-2 text-sm text-slate-700">{f.feedback_notes || "—"}</div>
                  <div className="mt-2 text-xs text-slate-500">
                    By: {f.provided_by_user_name || "—"} • At: {formatDateTime(f.provided_at)}
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        )}

        {activeTab === "agents" && (
          <Panel title="Agent Health Grid">
            <div className="space-y-3">
              {agents.map((a) => (
                <div key={a.agent_code} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-bold text-slate-900">{a.agent_name}</div>
                      <div className="mt-2 text-sm text-slate-600">
                        {a.agent_code} • Pending: {a.pending_jobs} • Failed 24h: {a.failed_jobs_24h}
                      </div>
                      <div className="mt-1 text-sm text-slate-600">
                        Last heartbeat: {formatDateTime(a.last_heartbeat_at)}
                      </div>
                    </div>
                    <Badge value={a.status} />
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
          <MetricCard title="Next Best Action" value={nextBestAction} />
          <MetricCard title="Snapshot" value={formatDate(summary.snapshot_date)} />
          <MetricCard title="Focus" value={(summary.unhealthy_agents ?? 0) > 0 ? "Agent Health" : "Recommendations"} />
          <MetricCard title="Refresh" value="45s" />
        </div>
      </div>
    </div>
  );
}
