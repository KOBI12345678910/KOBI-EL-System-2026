import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

type InboxRow = {
  id: number;
  inbox_number: string;
  item_type: string;
  parent_entity_type?: string | null;
  parent_entity_id?: number | null;
  title: string;
  description?: string | null;
  assigned_to_user_id?: number | null;
  assigned_to_user_name?: string | null;
  priority?: string | null;
  state: string;
  created_at: string;
  updated_at?: string | null;
};

type InboxSummary = {
  open_count?: number;
  assigned_count?: number;
  resolved_count?: number;
  high_priority_count?: number;
};

type AssignableUser = {
  id: number;
  full_name: string;
};

type InboxPayload = {
  summary?: InboxSummary;
  inbox?: InboxRow[];
  assignable_users?: AssignableUser[];
};

function formatDateTime(value?: string | null): string {
  if (!value) return "\u2014";
  try {
    return new Date(value).toLocaleString("he-IL");
  } catch {
    return value;
  }
}

function badgeClass(value?: string | null): string {
  const s = (value || "").toLowerCase();
  if (["resolved", "closed", "normal", "low"].includes(s)) {
    return "bg-emerald-100 text-emerald-800 border border-emerald-200";
  }
  if (["critical", "high", "open"].includes(s)) {
    return "bg-red-100 text-red-800 border border-red-200";
  }
  if (["assigned", "medium", "pending"].includes(s)) {
    return "bg-amber-100 text-amber-800 border border-amber-200";
  }
  return "bg-slate-100 text-slate-800 border border-slate-200";
}

function Badge({ value }: { value?: string | null }) {
  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${badgeClass(value)}`}>{value || "\u2014"}</span>;
}

function Panel({
  title,
  children,
  right,
}: {
  title: string;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <div className="text-lg font-black text-slate-900">{title}</div>
        {right}
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

function ActionButton({
  label,
  onClick,
  disabled,
  variant = "dark",
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "dark" | "light" | "danger";
}) {
  const className =
    variant === "dark"
      ? "rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-700 disabled:opacity-50"
      : variant === "danger"
        ? "rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
        : "rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50";

  return (
    <button className={className} onClick={onClick} disabled={disabled} type="button">
      {label}
    </button>
  );
}

async function fetchUniversalInbox(): Promise<InboxPayload> {
  const res = await fetch("/api/orchestration/universal-inbox", {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
  });

  if (!res.ok) throw new Error(`Failed to fetch universal inbox: ${res.status}`);
  const json = await res.json();
  return json.data ?? json;
}

async function assignInboxItem(input: { inbox_id: number; assigned_to_user_id: number }) {
  const res = await fetch("/api/orchestration/inbox/assign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error("Failed to assign inbox item");
  return res.json();
}

async function resolveInboxItem(inboxId: number) {
  const res = await fetch("/api/orchestration/inbox/resolve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ inbox_id: inboxId }),
  });
  if (!res.ok) throw new Error("Failed to resolve inbox item");
  return res.json();
}

async function reopenInboxItem(inboxId: number) {
  const res = await fetch("/api/orchestration/inbox/reopen", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ inbox_id: inboxId }),
  });
  if (!res.ok) throw new Error("Failed to reopen inbox item");
  return res.json();
}

export const universalInboxQueryKey = () => ["universalInbox"] as const;

type InboxTab = "all" | "open" | "assigned" | "resolved";

export default function UniversalInbox() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<InboxTab>("all");
  const [search, setSearch] = useState("");
  const [assignTarget, setAssignTarget] = useState<Record<number, number>>({});

  const query = useQuery({
    queryKey: universalInboxQueryKey(),
    queryFn: fetchUniversalInbox,
    refetchInterval: 30_000,
  });

  const assignMutation = useMutation({
    mutationFn: assignInboxItem,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: universalInboxQueryKey() });
    },
  });

  const resolveMutation = useMutation({
    mutationFn: resolveInboxItem,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: universalInboxQueryKey() });
    },
  });

  const reopenMutation = useMutation({
    mutationFn: reopenInboxItem,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: universalInboxQueryKey() });
    },
  });

  if (query.isLoading) return <div className="p-6 text-white">Loading universal inbox...</div>;

  if (query.isError) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-800">
          \u05E9\u05D2\u05D9\u05D0\u05D4 \u05D1\u05D8\u05E2\u05D9\u05E0\u05EA Universal Inbox
        </div>
      </div>
    );
  }

  const summary = query.data?.summary ?? {};
  const inbox = query.data?.inbox ?? [];
  const users = query.data?.assignable_users ?? [];

  const filtered = useMemo(() => {
    return inbox.filter((i) => {
      const stateLower = (i.state || "").toLowerCase();
      const matchesTab =
        tab === "all"
          ? true
          : tab === "open"
            ? stateLower === "open"
            : tab === "assigned"
              ? stateLower === "assigned"
              : ["resolved", "closed"].includes(stateLower);

      const text = `${i.inbox_number} ${i.title} ${i.description || ""}`.toLowerCase();
      const matchesSearch = !search.trim() || text.includes(search.trim().toLowerCase());

      return matchesTab && matchesSearch;
    });
  }, [inbox, tab, search]);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-[1500px] p-6 space-y-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h1 className="text-4xl font-black text-slate-900">Universal Inbox</h1>
              <div className="mt-2 text-sm text-slate-600">
                \u05EA\u05D9\u05D1\u05EA \u05DE\u05E9\u05D9\u05DE\u05D5\u05EA \u05D0\u05D5\u05E0\u05D9\u05D1\u05E8\u05E1\u05DC\u05D9\u05EA \u05DC\u05DB\u05DC \u05D4\u05BE actions \u05E9\u05DE\u05E0\u05D5\u05E2\u05D9 \u05D4\u05DE\u05E2\u05E8\u05DB\u05EA \u05DE\u05D9\u05D9\u05E6\u05E8\u05D9\u05DD: approvals, KPI breaches, alerts, workflows, AI recommendations.
              </div>
            </div>

            <div className="flex gap-2">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="\u05D7\u05D9\u05E4\u05D5\u05E9 inbox..."
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-900 outline-none"
              />
              <ActionButton label="\u05E8\u05E2\u05E0\u05DF" onClick={() => query.refetch()} />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <MetricCard title="Open" value={String(summary.open_count ?? 0)} />
          <MetricCard title="Assigned" value={String(summary.assigned_count ?? 0)} />
          <MetricCard title="Resolved" value={String(summary.resolved_count ?? 0)} />
          <MetricCard title="High Priority" value={String(summary.high_priority_count ?? 0)} />
        </div>

        <div className="flex flex-wrap gap-2">
          <ActionButton label={`All (${inbox.length})`} variant={tab === "all" ? "dark" : "light"} onClick={() => setTab("all")} />
          <ActionButton label="Open" variant={tab === "open" ? "dark" : "light"} onClick={() => setTab("open")} />
          <ActionButton label="Assigned" variant={tab === "assigned" ? "dark" : "light"} onClick={() => setTab("assigned")} />
          <ActionButton label="Resolved" variant={tab === "resolved" ? "dark" : "light"} onClick={() => setTab("resolved")} />
        </div>

        <Panel title="Inbox Items">
          {filtered.length === 0 ? (
            <div className="text-sm text-slate-600">\u05D0\u05D9\u05DF Inbox Items \u05DC\u05D4\u05E6\u05D2\u05D4.</div>
          ) : (
            <div className="space-y-3">
              {filtered.map((i) => {
                const stateLower = (i.state || "").toLowerCase();

                return (
                  <div key={i.id} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="font-bold text-slate-900">
                            {i.inbox_number} &bull; {i.title}
                          </div>
                          <Badge value={i.priority} />
                          <Badge value={i.state} />
                        </div>

                        <div className="text-sm text-slate-700">{i.description || "\u2014"}</div>

                        <div className="text-xs text-slate-500">
                          Type: {i.item_type} &bull; Parent: {i.parent_entity_type || "\u2014"} #{i.parent_entity_id || "\u2014"} &bull; Assigned: {i.assigned_to_user_name || "\u2014"} &bull; Created: {formatDateTime(i.created_at)}
                        </div>
                      </div>

                      <div className="flex flex-col gap-2 xl:min-w-[260px]">
                        {["open", "assigned"].includes(stateLower) ? (
                          <>
                            <div className="flex gap-2">
                              <select
                                value={assignTarget[i.id] || ""}
                                onChange={(e) =>
                                  setAssignTarget((prev) => ({
                                    ...prev,
                                    [i.id]: Number(e.target.value),
                                  }))
                                }
                                className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none"
                              >
                                <option value="">\u05D1\u05D7\u05E8 \u05DE\u05E9\u05EA\u05DE\u05E9</option>
                                {users.map((u) => (
                                  <option key={u.id} value={u.id}>
                                    {u.full_name}
                                  </option>
                                ))}
                              </select>

                              <ActionButton
                                label="Assign"
                                variant="light"
                                disabled={!assignTarget[i.id] || assignMutation.isPending}
                                onClick={() =>
                                  assignMutation.mutate({
                                    inbox_id: i.id,
                                    assigned_to_user_id: assignTarget[i.id],
                                  })
                                }
                              />
                            </div>

                            <ActionButton
                              label="Resolve"
                              disabled={resolveMutation.isPending}
                              onClick={() => resolveMutation.mutate(i.id)}
                            />
                          </>
                        ) : null}

                        {["resolved", "closed"].includes(stateLower) ? (
                          <ActionButton
                            label="Reopen"
                            variant="danger"
                            disabled={reopenMutation.isPending}
                            onClick={() => reopenMutation.mutate(i.id)}
                          />
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
