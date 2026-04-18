import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

type CRMSummary = {
  snapshot_date?: string;
  total_leads?: number;
  open_leads?: number;
  open_opportunities?: number;
  open_pipeline_value?: number;
};

type LeadRow = {
  id: number;
  public_id?: string;
  lead_number: string;
  source_channel?: string | null;
  full_name?: string | null;
  company_name?: string | null;
  phone?: string | null;
  email?: string | null;
  city?: string | null;
  lead_status: string;
  score?: number | null;
  owner_user_id?: number | null;
  estimated_value?: number | null;
  notes?: string | null;
  created_at: string;
  updated_at?: string | null;
};

type OpportunityRow = {
  id: number;
  public_id?: string;
  opportunity_number: string;
  lead_id?: number | null;
  customer_id?: number | null;
  stage: string;
  probability_percent?: number | null;
  expected_close_date?: string | null;
  opportunity_value?: number | null;
  owner_user_id?: number | null;
  state: string;
  created_at: string;
  updated_at?: string | null;
};

type CRMPayload = {
  summary?: CRMSummary;
  leads?: LeadRow[];
  opportunities?: OpportunityRow[];
};

const money = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

function m(v?: number | null) {
  return money.format(v ?? 0);
}

function formatDate(value?: string | null): string {
  if (!value) return "\u2014";
  try {
    return new Date(value).toLocaleDateString("he-IL");
  } catch {
    return value;
  }
}

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

  if (["won", "qualified", "proposal", "open", "active"].includes(s)) {
    return "bg-emerald-100 text-emerald-800 border border-emerald-200";
  }
  if (["lost", "closed", "rejected", "critical"].includes(s)) {
    return "bg-red-100 text-red-800 border border-red-200";
  }
  if (["new", "contacted", "negotiation", "warning"].includes(s)) {
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

type CRMTab = "overview" | "leads" | "opportunities";

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
      {label}{typeof count === "number" ? ` (${count})` : ""}
    </button>
  );
}

async function fetchCRMControlRoom(): Promise<CRMPayload> {
  const res = await fetch("/api/control-room/crm", {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
  });

  if (!res.ok) throw new Error(`Failed to fetch CRM control room: ${res.status}`);
  const json = await res.json();
  return json.data ?? json;
}

export const crmControlRoomQueryKey = () => ["crmControlRoom"] as const;

export default function CRMControlRoom() {
  const [tab, setTab] = useState<CRMTab>("overview");

  const query = useQuery({
    queryKey: crmControlRoomQueryKey(),
    queryFn: fetchCRMControlRoom,
    refetchInterval: 60_000,
  });

  if (query.isLoading) return <div className="p-6 text-white">Loading CRM control room...</div>;

  if (query.isError) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-800">
          \u05E9\u05D2\u05D9\u05D0\u05D4 \u05D1\u05D8\u05E2\u05D9\u05E0\u05EA CRM Control Room
        </div>
      </div>
    );
  }

  const summary = query.data?.summary ?? {};
  const leads = query.data?.leads ?? [];
  const opportunities = query.data?.opportunities ?? [];

  const hotLeads = useMemo(
    () => [...leads].sort((a, b) => Number(b.score ?? 0) - Number(a.score ?? 0)).slice(0, 10),
    [leads],
  );

  const nextBestAction = useMemo(() => {
    if ((summary.open_leads ?? 0) > 0) return "\u05D8\u05E4\u05DC \u05D1\u05DC\u05D9\u05D3\u05D9\u05DD \u05D7\u05D3\u05E9\u05D9\u05DD/\u05E4\u05EA\u05D5\u05D7\u05D9\u05DD";
    if ((summary.open_opportunities ?? 0) > 0) return "\u05D3\u05D7\u05D5\u05E3 \u05D4\u05D6\u05D3\u05DE\u05E0\u05D5\u05D9\u05D5\u05EA \u05DC\u05E9\u05DC\u05D1 Proposal/Close";
    return "\u05D4\u05BeCRM \u05D9\u05E6\u05D9\u05D1";
  }, [summary]);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-[1600px] p-6 space-y-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h1 className="text-4xl font-black text-slate-900">CRM Control Room</h1>
              <div className="mt-2 text-sm text-slate-600">
                \u05E9\u05DC\u05D9\u05D8\u05D4 \u05D1\u05DC\u05D9\u05D3\u05D9\u05DD, pipeline, opportunities, lead scoring, closing pressure.
              </div>
              <div className="mt-2 text-sm text-slate-500">Snapshot: {formatDate(summary.snapshot_date)}</div>
            </div>

            <button
              type="button"
              onClick={() => query.refetch()}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-700"
            >
              \u05E8\u05E2\u05E0\u05DF
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <MetricCard title="Total Leads" value={String(summary.total_leads ?? 0)} />
          <MetricCard title="Open Leads" value={String(summary.open_leads ?? 0)} />
          <MetricCard title="Open Opportunities" value={String(summary.open_opportunities ?? 0)} />
          <MetricCard title="Pipeline Value" value={m(summary.open_pipeline_value)} />
        </div>

        <div className="flex flex-wrap gap-2">
          <TabButton active={tab === "overview"} label="\u05E1\u05E7\u05D9\u05E8\u05D4" onClick={() => setTab("overview")} />
          <TabButton active={tab === "leads"} label="Leads" onClick={() => setTab("leads")} count={leads.length} />
          <TabButton active={tab === "opportunities"} label="Opportunities" onClick={() => setTab("opportunities")} count={opportunities.length} />
        </div>

        {tab === "overview" && (
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_1fr] gap-6">
            <Panel title="Hot Leads">
              <div className="space-y-3">
                {hotLeads.map((lead) => (
                  <div key={lead.id} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                      <div>
                        <div className="font-bold text-slate-900">
                          {lead.lead_number} &bull; {lead.full_name || lead.company_name || "Unnamed Lead"}
                        </div>
                        <div className="mt-2 text-sm text-slate-600">
                          Source: {lead.source_channel || "\u2014"} &bull; City: {lead.city || "\u2014"} &bull; Score: {lead.score ?? 0}
                        </div>
                        <div className="mt-1 text-sm text-slate-600">
                          Est. Value: {m(lead.estimated_value)} &bull; Created: {formatDateTime(lead.created_at)}
                        </div>
                      </div>
                      <Badge value={lead.lead_status} />
                    </div>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="Open Opportunities">
              <div className="space-y-3">
                {opportunities.filter((x) => (x.state || "").toLowerCase() === "open").slice(0, 10).map((op) => (
                  <div key={op.id} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                      <div>
                        <div className="font-bold text-slate-900">{op.opportunity_number}</div>
                        <div className="mt-2 text-sm text-slate-600">
                          Stage: {op.stage} &bull; Probability: {op.probability_percent ?? 0}% &bull; Close: {formatDate(op.expected_close_date)}
                        </div>
                        <div className="mt-1 text-sm text-slate-600">
                          Value: {m(op.opportunity_value)} &bull; Lead #{op.lead_id || "\u2014"} &bull; Customer #{op.customer_id || "\u2014"}
                        </div>
                      </div>
                      <Badge value={op.stage} />
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        )}

        {tab === "leads" && (
          <Panel title="Lead Pipeline">
            <div className="space-y-3">
              {leads.map((lead) => (
                <div key={lead.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                    <div>
                      <div className="font-bold text-slate-900">
                        {lead.lead_number} &bull; {lead.full_name || lead.company_name || "Unnamed Lead"}
                      </div>
                      <div className="mt-2 text-sm text-slate-600">
                        Email: {lead.email || "\u2014"} &bull; Phone: {lead.phone || "\u2014"} &bull; City: {lead.city || "\u2014"}
                      </div>
                      <div className="mt-1 text-sm text-slate-600">
                        Score: {lead.score ?? 0} &bull; Est. Value: {m(lead.estimated_value)} &bull; Created: {formatDateTime(lead.created_at)}
                      </div>
                    </div>
                    <Badge value={lead.lead_status} />
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        )}

        {tab === "opportunities" && (
          <Panel title="Opportunity Grid">
            <div className="space-y-3">
              {opportunities.map((op) => (
                <div key={op.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                    <div>
                      <div className="font-bold text-slate-900">{op.opportunity_number}</div>
                      <div className="mt-2 text-sm text-slate-600">
                        Stage: {op.stage} &bull; Probability: {op.probability_percent ?? 0}% &bull; Close: {formatDate(op.expected_close_date)}
                      </div>
                      <div className="mt-1 text-sm text-slate-600">
                        Value: {m(op.opportunity_value)} &bull; Lead #{op.lead_id || "\u2014"} &bull; Customer #{op.customer_id || "\u2014"}
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 items-end">
                      <Badge value={op.stage} />
                      <Badge value={op.state} />
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
          <MetricCard title="Focus" value={(summary.open_opportunities ?? 0) > 0 ? "Pipeline Closing" : "Lead Intake"} />
          <MetricCard title="Refresh" value="60s" />
        </div>
      </div>
    </div>
  );
}
