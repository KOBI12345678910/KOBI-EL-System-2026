import React from "react";
import { useQuery } from "@tanstack/react-query";
import { widgetRegistry } from "./WidgetRegistry";

type DashboardWidgetConfig = {
  id: number;
  widget_code: string;
  title: string;
  width_units: number;
  height_units: number;
  order_index: number;
  config_payload?: Record<string, unknown> | null;
};

type DashboardBoardPayload = {
  board_code: string;
  board_name: string;
  widgets: DashboardWidgetConfig[];
};

async function fetchDashboardBoard(boardCode: string): Promise<DashboardBoardPayload> {
  const res = await fetch(`/api/dashboard/board/${boardCode}`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch dashboard board: ${res.status}`);
  }

  const json = await res.json();
  return json.data ?? json;
}

export const dashboardBoardQueryKey = (boardCode: string) => ["dashboardBoard", boardCode] as const;

export default function DashboardWidgetsBoard({ boardCode }: { boardCode: string }) {
  const query = useQuery({
    queryKey: dashboardBoardQueryKey(boardCode),
    queryFn: () => fetchDashboardBoard(boardCode),
  });

  if (query.isLoading) {
    return <div className="p-6 text-white">Loading dashboard...</div>;
  }

  if (query.isError || !query.data) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-800">
        Failed to load dashboard board
      </div>
    );
  }

  const board = query.data;
  const widgets = [...board.widgets].sort((a, b) => a.order_index - b.order_index);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="text-2xl font-black text-slate-900">{board.board_name}</div>
        <div className="mt-1 text-sm text-slate-500">{board.board_code}</div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        {widgets.map((widget) => {
          const RegistryComponent = widgetRegistry[widget.widget_code];

          if (!RegistryComponent) {
            return (
              <div
                key={widget.id}
                className="col-span-12 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-800"
              >
                Widget not registered: {widget.widget_code}
              </div>
            );
          }

          const colSpan = Math.min(Math.max(widget.width_units, 3), 12);
          const minHeight = Math.max(widget.height_units, 2) * 120;

          return (
            <div
              key={widget.id}
              className={`col-span-12 xl:col-span-${colSpan}`}
              style={{ minHeight }}
            >
              <div className="h-full rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 px-5 py-4 text-lg font-black text-slate-900">
                  {widget.title}
                </div>
                <div className="p-5">
                  <RegistryComponent config={widget.config_payload || {}} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
