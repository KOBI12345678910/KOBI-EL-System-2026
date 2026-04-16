import React from "react";
import { useQuery } from "@tanstack/react-query";

async function fetchWidgetData(widgetCode: string, config: Record<string, unknown>) {
  const res = await fetch(`/api/dashboard/widget/${widgetCode}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(config),
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch widget data for ${widgetCode}`);
  }

  const json = await res.json();
  return json.data ?? json;
}

function SimpleStatWidget({ widgetCode, config }: { widgetCode: string; config: Record<string, unknown> }) {
  const query = useQuery({
    queryKey: ["widgetData", widgetCode, config],
    queryFn: () => fetchWidgetData(widgetCode, config),
  });

  if (query.isLoading) return <div className="text-sm text-slate-500">Loading...</div>;
  if (query.isError) return <div className="text-sm text-red-600">Failed to load widget</div>;

  return (
    <div className="space-y-2">
      <div className="text-3xl font-black text-slate-900">{query.data?.value ?? "—"}</div>
      <div className="text-sm text-slate-500">{query.data?.subtitle ?? ""}</div>
    </div>
  );
}

function ListWidget({ widgetCode, config }: { widgetCode: string; config: Record<string, unknown> }) {
  const query = useQuery({
    queryKey: ["widgetData", widgetCode, config],
    queryFn: () => fetchWidgetData(widgetCode, config),
  });

  if (query.isLoading) return <div className="text-sm text-slate-500">Loading...</div>;
  if (query.isError) return <div className="text-sm text-red-600">Failed to load widget</div>;

  const items = query.data?.items ?? [];

  return (
    <div className="space-y-3">
      {items.map((item: any, idx: number) => (
        <div key={idx} className="rounded-xl border border-slate-200 p-3">
          <div className="font-bold text-slate-900">{item.title || "Item"}</div>
          <div className="mt-1 text-sm text-slate-600">{item.subtitle || ""}</div>
        </div>
      ))}
    </div>
  );
}

export const widgetRegistry: Record<string, React.ComponentType<{ config: Record<string, unknown> }>> = {
  executive_total_revenue: (props) => <SimpleStatWidget widgetCode="executive_total_revenue" {...props} />,
  finance_overdue_amount: (props) => <SimpleStatWidget widgetCode="finance_overdue_amount" {...props} />,
  procurement_pending_approvals: (props) => <SimpleStatWidget widgetCode="procurement_pending_approvals" {...props} />,
  operations_delayed_work_orders: (props) => <SimpleStatWidget widgetCode="operations_delayed_work_orders" {...props} />,
  workforce_missing_attendance: (props) => <SimpleStatWidget widgetCode="workforce_missing_attendance" {...props} />,
  ai_unhealthy_agents: (props) => <SimpleStatWidget widgetCode="ai_unhealthy_agents" {...props} />,
  recommendation_queue: (props) => <ListWidget widgetCode="recommendation_queue" {...props} />,
  operational_alerts_feed: (props) => <ListWidget widgetCode="operational_alerts_feed" {...props} />,
  procurement_overdue_pos_feed: (props) => <ListWidget widgetCode="procurement_overdue_pos_feed" {...props} />,
};
