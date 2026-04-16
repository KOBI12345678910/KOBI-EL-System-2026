import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

type NotificationRow = {
  id: number;
  notification_number: string;
  recipient_type: string;
  recipient_id?: number | null;
  title: string;
  message_text?: string | null;
  severity?: string | null;
  channel?: string | null;
  state: string;
  created_at: string;
  updated_at?: string | null;
};

type NotificationCenterSummary = {
  open_count?: number;
  critical_count?: number;
  high_count?: number;
  resolved_count?: number;
};

type NotificationCenterPayload = {
  summary?: NotificationCenterSummary;
  notifications?: NotificationRow[];
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
  if (["resolved", "closed", "sent", "normal", "info"].includes(s)) {
    return "bg-emerald-100 text-emerald-800 border border-emerald-200";
  }
  if (["critical", "high", "open", "failed"].includes(s)) {
    return "bg-red-100 text-red-800 border border-red-200";
  }
  if (["warning", "medium", "pending", "acknowledged"].includes(s)) {
    return "bg-amber-100 text-amber-800 border border-amber-200";
  }
  return "bg-slate-100 text-slate-800 border border-slate-200";
}

function Badge({ value }: { value?: string | null }) {
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${badgeClass(value)}`}>
      {value || "\u2014"}
    </span>
  );
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

async function fetchNotificationCenter(): Promise<NotificationCenterPayload> {
  const res = await fetch("/api/orchestration/notification-center", {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
  });

  if (!res.ok) throw new Error(`Failed to fetch notification center: ${res.status}`);
  const json = await res.json();
  return json.data ?? json;
}

async function resolveNotification(notificationId: number) {
  const res = await fetch(`/api/orchestration/notifications/${notificationId}/resolve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to resolve notification");
  return res.json();
}

async function acknowledgeNotification(notificationId: number) {
  const res = await fetch(`/api/orchestration/notifications/${notificationId}/acknowledge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to acknowledge notification");
  return res.json();
}

async function reopenNotification(notificationId: number) {
  const res = await fetch(`/api/orchestration/notifications/${notificationId}/reopen`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to reopen notification");
  return res.json();
}

export const notificationCenterQueryKey = () => ["notificationCenter"] as const;

type NotificationTab = "all" | "open" | "critical" | "resolved";

export default function NotificationCenter() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<NotificationTab>("all");
  const [search, setSearch] = useState("");

  const query = useQuery({
    queryKey: notificationCenterQueryKey(),
    queryFn: fetchNotificationCenter,
    refetchInterval: 30_000,
  });

  const resolveMutation = useMutation({
    mutationFn: resolveNotification,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: notificationCenterQueryKey() });
    },
  });

  const acknowledgeMutation = useMutation({
    mutationFn: acknowledgeNotification,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: notificationCenterQueryKey() });
    },
  });

  const reopenMutation = useMutation({
    mutationFn: reopenNotification,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: notificationCenterQueryKey() });
    },
  });

  if (query.isLoading) return <div className="p-6 text-white">Loading notification center...</div>;

  if (query.isError) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-800">
          \u05E9\u05D2\u05D9\u05D0\u05D4 \u05D1\u05D8\u05E2\u05D9\u05E0\u05EA Notification Center
        </div>
      </div>
    );
  }

  const summary = query.data?.summary ?? {};
  const notifications = query.data?.notifications ?? [];

  const filtered = useMemo(() => {
    return notifications.filter((n) => {
      const matchesTab =
        tab === "all"
          ? true
          : tab === "open"
            ? ["open", "acknowledged"].includes((n.state || "").toLowerCase())
            : tab === "critical"
              ? ["critical", "high"].includes((n.severity || "").toLowerCase())
              : ["resolved", "closed"].includes((n.state || "").toLowerCase());

      const text = `${n.notification_number} ${n.title} ${n.message_text || ""}`.toLowerCase();
      const matchesSearch = !search.trim() || text.includes(search.trim().toLowerCase());

      return matchesTab && matchesSearch;
    });
  }, [notifications, tab, search]);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-[1500px] p-6 space-y-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h1 className="text-4xl font-black text-slate-900">Notification Center</h1>
              <div className="mt-2 text-sm text-slate-600">
                \u05DE\u05E8\u05DB\u05D6 \u05E9\u05DC\u05D9\u05D8\u05D4 \u05DC\u05DB\u05DC \u05D4\u05D4\u05EA\u05E8\u05D0\u05D5\u05EA \u05D1\u05DE\u05E2\u05E8\u05DB\u05EA: orchestration, KPI, AI, operations, procurement, finance, workforce.
              </div>
            </div>

            <div className="flex gap-2">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="\u05D7\u05D9\u05E4\u05D5\u05E9 \u05D4\u05EA\u05E8\u05D0\u05D5\u05EA..."
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-900 outline-none"
              />
              <ActionButton
                label="\u05E8\u05E2\u05E0\u05DF"
                onClick={() => query.refetch()}
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <MetricCard title="Open" value={String(summary.open_count ?? 0)} />
          <MetricCard title="Critical" value={String(summary.critical_count ?? 0)} />
          <MetricCard title="High" value={String(summary.high_count ?? 0)} />
          <MetricCard title="Resolved" value={String(summary.resolved_count ?? 0)} />
        </div>

        <div className="flex flex-wrap gap-2">
          <ActionButton label={`All (${notifications.length})`} variant={tab === "all" ? "dark" : "light"} onClick={() => setTab("all")} />
          <ActionButton label="Open" variant={tab === "open" ? "dark" : "light"} onClick={() => setTab("open")} />
          <ActionButton label="Critical" variant={tab === "critical" ? "dark" : "light"} onClick={() => setTab("critical")} />
          <ActionButton label="Resolved" variant={tab === "resolved" ? "dark" : "light"} onClick={() => setTab("resolved")} />
        </div>

        <Panel title="Notifications">
          {filtered.length === 0 ? (
            <div className="text-sm text-slate-600">\u05D0\u05D9\u05DF Notifications \u05DC\u05D4\u05E6\u05D2\u05D4.</div>
          ) : (
            <div className="space-y-3">
              {filtered.map((n) => {
                const stateLower = (n.state || "").toLowerCase();

                return (
                  <div key={n.id} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="font-bold text-slate-900">
                            {n.notification_number} &bull; {n.title}
                          </div>
                          <Badge value={n.severity} />
                          <Badge value={n.state} />
                        </div>

                        <div className="text-sm text-slate-700">{n.message_text || "\u2014"}</div>

                        <div className="text-xs text-slate-500">
                          Recipient: {n.recipient_type} #{n.recipient_id || "\u2014"} &bull; Channel: {n.channel || "\u2014"} &bull; Created: {formatDateTime(n.created_at)}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {["open"].includes(stateLower) ? (
                          <ActionButton
                            label="Acknowledge"
                            variant="light"
                            onClick={() => acknowledgeMutation.mutate(n.id)}
                            disabled={acknowledgeMutation.isPending}
                          />
                        ) : null}

                        {["open", "acknowledged"].includes(stateLower) ? (
                          <ActionButton
                            label="Resolve"
                            onClick={() => resolveMutation.mutate(n.id)}
                            disabled={resolveMutation.isPending}
                          />
                        ) : null}

                        {["resolved", "closed"].includes(stateLower) ? (
                          <ActionButton
                            label="Reopen"
                            variant="danger"
                            onClick={() => reopenMutation.mutate(n.id)}
                            disabled={reopenMutation.isPending}
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
