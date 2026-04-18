import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, TrendingUp } from "lucide-react";
import { entityList, entityFilter } from "@/lib/entity-api";
import type { Lead, Customer } from "@/types/base44-entities";

export default function LeadIntakeWidget() {
  const { data: leads = [] } = useQuery({
    queryKey: ["leads"],
    queryFn: () => entityList<Lead>("leads", "-created_date", 50),
    refetchInterval: 5000,
  });

  const { data: queue = [] } = useQuery({
    queryKey: ["queue"],
    queryFn: () => entityFilter<Record<string, unknown>>("lead-assignments", { status: "pending_approval" }),
    refetchInterval: 5000,
  });

  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: () => entityList<Customer>("customers"),
    refetchInterval: 5000,
  });

  const stats = {
    new: leads.filter((l) => l.stage === "new").length,
    queue: queue.length,
    pipeline: leads.filter((l) => ["contacted", "qualified", "proposal"].includes(l.stage || "")).length,
    customers: customers.length,
    conversionRate: leads.length > 0 ? ((customers.length / leads.length) * 100).toFixed(1) : "0",
  };

  return (
    <Card className="border-0 shadow-lg bg-gradient-to-br from-slate-50 to-slate-100">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5" />
          Lead Intake Pipeline
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          {[
            { label: "New Leads", value: stats.new, color: "blue" },
            { label: "In Queue", value: stats.queue, color: "amber" },
            { label: "In Pipeline", value: stats.pipeline, color: "purple" },
            { label: "Customers", value: stats.customers, color: "green" },
          ].map((item, idx) => (
            <div key={item.label} className="flex items-center gap-2">
              {idx > 0 && <ArrowRight className="w-5 h-5 text-slate-400" />}
              <div className="flex flex-col items-center">
                <div className={`w-16 h-16 rounded-lg bg-${item.color}-100 flex items-center justify-center border-2 border-${item.color}-500 mb-2`}>
                  <span className={`text-2xl font-bold text-${item.color}-900`}>{item.value}</span>
                </div>
                <p className="text-xs text-center text-slate-600">{item.label}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="p-4 bg-white rounded-lg border-2 border-indigo-200">
          <p className="text-sm text-slate-600 mb-2">Overall Conversion Rate</p>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-indigo-600">{stats.conversionRate}%</span>
            <span className="text-sm text-slate-600">({stats.customers} of {leads.length})</span>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-bold text-slate-900">Recent Activity</p>
          <div className="space-y-2 max-h-32 overflow-y-auto">
            {leads.slice(0, 3).map((lead) => (
              <div key={lead.id} className="p-2 bg-white rounded border border-slate-200 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-900">{(lead as Record<string, unknown>).full_name as string || "ליד"}</span>
                  <Badge className={`text-xs ${
                    lead.stage === "new" ? "bg-blue-100 text-blue-900" :
                    lead.stage === "qualified" ? "bg-green-100 text-green-900" :
                    "bg-slate-100 text-slate-900"
                  }`}>
                    {(lead.stage || "").toUpperCase()}
                  </Badge>
                </div>
                <p className="text-xs text-slate-500 mt-1">{(lead as Record<string, unknown>).source as string || ""}</p>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
