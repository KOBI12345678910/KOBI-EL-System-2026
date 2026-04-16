import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

type CommandCenterSummary = {
  snapshot_date?: string;
  active_workflows?: number;
  failed_workflows?: number;
  queued_jobs?: number;
  stuck_jobs?: number;
  open_notifications?: number;
  inbox_items?: number;
};

type WorkflowRunRow = {
  id: number;
  workflow_code: string;
  workflow_name: string;
  parent_entity_type?: string | null;
  parent_entity_id?: number | null;
  started_at: string;
  finished_at?: string | null;
  state: string;
};

type JobQueueRow = {
  id: number;
  queue_name: string;
  job_type: string;
  parent_entity_type?: string | null;
  parent_entity_id?: number | null;
  attempts_count: number;
  available_at?: string | null;
  started_at?: string | null;
  state: string;
};

type NotificationRow = {
  id: number;
  notification_number: string;
  recipient_type: string;
  recipient_id?: number | null;
  title: string;
  message_text?: string | null;
  severity?: string | null;
  state: string;
  created_at: string;
};

type InboxRow = {
  id: number;
  inbox_number: string;
  item_type: string;
  parent_entity_type?: string | null;
  parent_entity_id?: number | null;
  title: string;
  assigned_to_user_name?: string | null;
  priority?: string | null;
  state: string;
  created_at: string;
};

type CommandCenterPayload = {
  summary?: CommandCenterSummary;
  workflows?: WorkflowRunRow[];
  jobs?: JobQueueRow[];
  notifications?: NotificationRow[];
  inbox?: InboxRow[];
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
  if (["completed", "healthy", "sent", "resolved", "active", "running"].includes(s)) {
    return "bg-emerald-100 text-emerald-800 border border-emerald-200";
  }
  if (["failed", "stuck", "critical", "open", "deadletter", "error"].includes(s)) {
    return "bg-red-100 text-red-800 border border-red-200";
  }
  if (["queued", "pending", "draft", "warning", "assigned"].includes(s)) {
    return "bg-amber-100 text-amber-800 border border-amber-200";
  }
  return "bg-slate-100 text-slate-800 border border-slate-200";
}

async function fetchCommandCenter(): Promise<CommandCenterPayload> {
  const res = await fetch("/api/control-room/command-center", {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch command center: ${res.status}`);
  }

  const json = await res.json();
  return json.data ?? json;
}

export const commandCenterQueryKey = () => ["commandCenter"] as const;

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

function MetricCard({ title, value }: { title: string; value: string }) {
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

type CommandTab =
  | "overview"
  | "workflows"
  | "jobs"
  | "notifications"
  | "inbox";

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
        active ? "bg-slate-900 text-white" : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
      }`}
    >
      {label}
      {typeof count === "number" ? ` (${count})` : ""}
    </button>
  );
}

export default function CommandCenter() {
  const [activeTab, setActiveTab] = useState<CommandTab>("overview");

  const query = useQuery({
    queryKey: commandCenterQueryKey(),
    queryFn: fetchCommandCenter,
    refetchInterval: 30_000,
  });

  if (query.isLoading) {
    return <div className="p-6 text-white">Loading command center...</div>;
  }

  if (query.isError) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-800">
          שגיאה בטעינת Command Center
        </div>
      </div>
    );
  }

  const data = query.data ?? {};
  const summary = data.summary ?? {};
  const workflows = data.workflows ?? [];
  const jobs = data.jobs ?? [];
  const notifications = data.notifications ?? [];
  const inbox = data.inbox ?? [];

  const nextBestAction = useMemo(() => {
    if ((summary.stuck_jobs ?? 0) > 0) return "טפל ב־stuck jobs מיד";
    if ((summary.failed_workflows ?? 0) > 0) return "בדוק workflow failures";
    if ((summary.open_notifications ?? 0) > 0) return "בדוק notifications פתוחים קריטיים";
    if ((summary.inbox_items ?? 0) > 0) return "נקה items מה־universal inbox";
    return "ה־command center יציב";
  }, [summary]);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-[1600px] p-6 space-y-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-4xl font-black text-slate-900">Command Center</h1>
              <div className="mt-2 text-sm text-slate-600">
                שליטה ב־workflow orchestration, jobs, notifications ו־universal inbox.
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
          <MetricCard title="Active Workflows" value={String(summary.active_workflows ?? 0)} />
          <MetricCard title="Failed Workflows" value={String(summary.failed_workflows ?? 0)} />
          <MetricCard title="Queued Jobs" value={String(summary.queued_jobs ?? 0)} />
          <MetricCard title="Stuck Jobs" value={String(summary.stuck_jobs ?? 0)} />
          <MetricCard title="Open Notifications" value={String(summary.open_notifications ?? 0)} />
          <MetricCard title="Inbox Items" value={String(summary.inbox_items ?? 0)} />
        </div>

        <div className="flex flex-wrap gap-2">
          <TabButton active={activeTab === "overview"} label="סקירה" onClick={() => setActiveTab("overview")} />
          <TabButton active={activeTab === "workflows"} label="Workflow Runs" onClick={() => setActiveTab("workflows")} count={workflows.length} />
          <TabButton active={activeTab === "jobs"} label="Job Queue" onClick={() => setActiveTab("jobs")} count={jobs.length} />
          <TabButton active={activeTab === "notifications"} label="Notifications" onClick={() => setActiveTab("notifications")} count={notifications.length} />
          <TabButton active={activeTab === "inbox"} label="Universal Inbox" onClick={() => setActiveTab("inbox")} count={inbox.length} />
        </div>

        {activeTab === "overview" && (
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_1fr] gap-6">
            <Panel title="Workflow Failures / Running">
              {workflows.length === 0 ? (
                <div className="text-sm text-slate-600">אין workflow runs.</div>
              ) : (
                <div className="space-y-3">
                  {workflows.slice(0, 8).map((w) => (
                    <div key={w.id} className="rounded-2xl border border-slate-200 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="font-bold text-slate-900">
                            {w.workflow_name} • {w.workflow_code}
                          </div>
                          <div className="mt-2 text-sm text-slate-600">
                            Parent: {w.parent_entity_type || "—"} #{w.parent_entity_id || "—"}
                          </div>
                          <div className="mt-1 text-sm text-slate-600">
                            Started: {formatDateTime(w.started_at)} • Finished: {formatDateTime(w.finished_at)}
                          </div>
                        </div>
                        <Badge value={w.state} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            <Panel title="Job Queue Hot Items">
              {jobs.length === 0 ? (
                <div className="text-sm text-slate-600">אין jobs.</div>
              ) : (
                <div className="space-y-3">
                  {jobs.slice(0, 8).map((j) => (
                    <div key={j.id} className="rounded-2xl border border-slate-200 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="font-bold text-slate-900">
                            {j.queue_name} • {j.job_type}
                          </div>
                          <div className="mt-2 text-sm text-slate-600">
                            Parent: {j.parent_entity_type || "—"} #{j.parent_entity_id || "—"}
                          </div>
                          <div className="mt-1 text-sm text-slate-600">
                            Attempts: {j.attempts_count} • Available: {formatDateTime(j.available_at)} • Started: {formatDateTime(j.started_at)}
                          </div>
                        </div>
                        <Badge value={j.state} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </div>
        )}

        {activeTab === "workflows" && (
          <Panel title="Workflow Runs">
            <div className="space-y-3">
              {workflows.map((w) => (
                <div key={w.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-bold text-slate-900">
                        {w.workflow_name} • {w.workflow_code}
                      </div>
                      <div className="mt-2 text-sm text-slate-600">
                        Parent: {w.parent_entity_type || "—"} #{w.parent_entity_id || "—"}
                      </div>
                      <div className="mt-1 text-sm text-slate-600">
                        Started: {formatDateTime(w.started_at)} • Finished: {formatDateTime(w.finished_at)}
                      </div>
                    </div>
                    <Badge value={w.state} />
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        )}

        {activeTab === "jobs" && (
          <Panel title="Job Queue">
            <div className="space-y-3">
              {jobs.map((j) => (
                <div key={j.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-bold text-slate-900">
                        {j.queue_name} • {j.job_type}
                      </div>
                      <div className="mt-2 text-sm text-slate-600">
                        Parent: {j.parent_entity_type || "—"} #{j.parent_entity_id || "—"}
                      </div>
                      <div className="mt-1 text-sm text-slate-600">
                        Attempts: {j.attempts_count} • Available: {formatDateTime(j.available_at)}
                      </div>
                    </div>
                    <Badge value={j.state} />
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        )}

        {activeTab === "notifications" && (
          <Panel title="Notification Center">
            <div className="space-y-3">
              {notifications.map((n) => (
                <div key={n.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-bold text-slate-900">
                        {n.notification_number} • {n.title}
                      </div>
                      <div className="mt-2 text-sm text-slate-700">{n.message_text || "—"}</div>
                      <div className="mt-2 text-xs text-slate-500">
                        Recipient: {n.recipient_type} #{n.recipient_id || "—"} • Created: {formatDateTime(n.created_at)}
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 items-end">
                      <Badge value={n.severity} />
                      <Badge value={n.state} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        )}

        {activeTab === "inbox" && (
          <Panel title="Universal Inbox">
            <div className="space-y-3">
              {inbox.map((i) => (
                <div key={i.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-bold text-slate-900">
                        {i.inbox_number} • {i.title}
                      </div>
                      <div className="mt-2 text-sm text-slate-600">
                        Type: {i.item_type} • Parent: {i.parent_entity_type || "—"} #{i.parent_entity_id || "—"}
                      </div>
                      <div className="mt-1 text-sm text-slate-600">
                        Assigned: {i.assigned_to_user_name || "—"} • Created: {formatDateTime(i.created_at)}
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 items-end">
                      <Badge value={i.priority} />
                      <Badge value={i.state} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
          <MetricCard title="Next Best Action" value={nextBestAction} />
          <MetricCard title="Snapshot" value={formatDate(summary.snapshot_date)} />
          <MetricCard title="Focus" value={(summary.stuck_jobs ?? 0) > 0 ? "Queue Health" : "Workflow Stability"} />
          <MetricCard title="Refresh" value="30s" />
        </div>
      </div>
    </div>
  );
}
