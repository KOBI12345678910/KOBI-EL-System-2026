import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

type AgentRow = {
  id: number;
  agent_code: string;
  agent_name: string;
  status: string;
  last_heartbeat_at?: string | null;
  config_payload?: Record<string, unknown> | null;
};

type AgentJobRow = {
  id: number;
  agent_id: number;
  agent_name?: string | null;
  job_type: string;
  state: string;
  created_at: string;
  started_at?: string | null;
  finished_at?: string | null;
  error_message?: string | null;
};

type AgentConsolePayload = {
  agents: AgentRow[];
  jobs: AgentJobRow[];
};

function formatDateTime(value?: string | null): string {
  if (!value) return "\u2014";
  try { return new Date(value).toLocaleString("he-IL"); } catch { return value; }
}

function badgeClass(value?: string | null): string {
  const s = (value || "").toLowerCase();
  if (["healthy", "active", "completed", "success"].includes(s)) return "bg-emerald-100 text-emerald-800 border border-emerald-200";
  if (["failed", "unhealthy", "critical", "deadletter"].includes(s)) return "bg-red-100 text-red-800 border border-red-200";
  if (["queued", "running", "pending", "warning"].includes(s)) return "bg-amber-100 text-amber-800 border border-amber-200";
  return "bg-slate-100 text-slate-800 border border-slate-200";
}

function Badge({ value }: { value?: string | null }) {
  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${badgeClass(value)}`}>{value || "\u2014"}</span>;
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-4 text-lg font-black text-slate-900">{title}</div>
      <div className="p-5">{children}</div>
    </div>
  );
}

async function fetchAgentConsole(): Promise<AgentConsolePayload> {
  const res = await fetch("/api/ai/agent-console", { method: "GET", headers: { "Content-Type": "application/json" }, credentials: "include" });
  if (!res.ok) throw new Error(`Failed to fetch agent console: ${res.status}`);
  const json = await res.json();
  return json.data ?? json;
}

async function restartAgent(agentId: number) {
  const res = await fetch("/api/ai/agents/restart", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ agent_id: agentId }) });
  if (!res.ok) throw new Error("Failed to restart agent");
  return res.json();
}

async function requeueAgentJob(jobId: number) {
  const res = await fetch("/api/ai/agent-jobs/requeue", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ job_id: jobId }) });
  if (!res.ok) throw new Error("Failed to requeue agent job");
  return res.json();
}

export const agentConsoleQueryKey = () => ["advancedAIAgentConsole"] as const;

type Tab = "agents" | "jobs";

export default function AdvancedAIAgentConsole() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("agents");
  const [search, setSearch] = useState("");

  const query = useQuery({ queryKey: agentConsoleQueryKey(), queryFn: fetchAgentConsole, refetchInterval: 20_000 });

  const restartMutation = useMutation({ mutationFn: restartAgent, onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: agentConsoleQueryKey() }); } });
  const requeueMutation = useMutation({ mutationFn: requeueAgentJob, onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: agentConsoleQueryKey() }); } });

  if (query.isLoading) return <div className="p-6 text-white">Loading AI Agent Console...</div>;
  if (query.isError) return (<div className="p-6"><div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-800">Failed to load Advanced AI Agent Console</div></div>);

  const agents = query.data?.agents ?? [];
  const jobs = query.data?.jobs ?? [];

  const filteredAgents = useMemo(() => agents.filter((a) => `${a.agent_code} ${a.agent_name}`.toLowerCase().includes(search.toLowerCase())), [agents, search]);
  const filteredJobs = useMemo(() => jobs.filter((j) => `${j.job_type} ${j.agent_name || ""} ${j.error_message || ""}`.toLowerCase().includes(search.toLowerCase())), [jobs, search]);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-[1500px] p-6 space-y-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h1 className="text-4xl font-black text-slate-900">Advanced AI Agent Console</h1>
              <div className="mt-2 text-sm text-slate-600">\u05E9\u05DC\u05D9\u05D8\u05D4 \u05D1\u05BE AI agents, jobs, failures, requeue, restart, heartbeat, orchestration bridge.</div>
            </div>
            <div className="flex gap-2">
              <input className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-900" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="\u05D7\u05D9\u05E4\u05D5\u05E9..." />
              <button type="button" onClick={() => query.refetch()} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white">\u05E8\u05E2\u05E0\u05DF</button>
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <button type="button" onClick={() => setTab("agents")} className={`rounded-xl px-4 py-2 text-sm font-bold ${tab === "agents" ? "bg-slate-900 text-white" : "bg-white border border-slate-200 text-slate-700"}`}>Agents ({agents.length})</button>
          <button type="button" onClick={() => setTab("jobs")} className={`rounded-xl px-4 py-2 text-sm font-bold ${tab === "jobs" ? "bg-slate-900 text-white" : "bg-white border border-slate-200 text-slate-700"}`}>Jobs ({jobs.length})</button>
        </div>

        {tab === "agents" && (
          <Panel title="AI Agents">
            <div className="space-y-3">
              {filteredAgents.map((a) => (
                <div key={a.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2"><div className="font-bold text-slate-900">{a.agent_name}</div><Badge value={a.status} /></div>
                      <div className="mt-2 text-sm text-slate-600">{a.agent_code} &bull; Last heartbeat: {formatDateTime(a.last_heartbeat_at)}</div>
                      <pre className="mt-3 overflow-auto rounded-xl bg-slate-900 p-3 text-xs text-slate-100">{JSON.stringify(a.config_payload || {}, null, 2)}</pre>
                    </div>
                    <div><button type="button" onClick={() => restartMutation.mutate(a.id)} disabled={restartMutation.isPending} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white">Restart Agent</button></div>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        )}

        {tab === "jobs" && (
          <Panel title="AI Agent Jobs">
            <div className="space-y-3">
              {filteredJobs.map((j) => (
                <div key={j.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2"><div className="font-bold text-slate-900">{j.job_type}</div><Badge value={j.state} /></div>
                      <div className="mt-2 text-sm text-slate-600">Agent: {j.agent_name || `#${j.agent_id}`} &bull; Created: {formatDateTime(j.created_at)}</div>
                      <div className="mt-1 text-sm text-slate-600">Started: {formatDateTime(j.started_at)} &bull; Finished: {formatDateTime(j.finished_at)}</div>
                      {j.error_message ? <div className="mt-2 rounded-xl bg-red-50 p-3 text-sm text-red-700">{j.error_message}</div> : null}
                    </div>
                    <div><button type="button" onClick={() => requeueMutation.mutate(j.id)} disabled={requeueMutation.isPending} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white">Requeue Job</button></div>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
}
