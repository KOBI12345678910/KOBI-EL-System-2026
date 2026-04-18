import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

export default function ConversionFunnel({ leads, customers }) {
  const stages = {
    new: leads.filter((l) => l.stage === "new").length,
    contacted: leads.filter((l) => l.stage === "contacted").length,
    qualified: leads.filter((l) => l.stage === "qualified").length,
    proposal: leads.filter((l) => l.stage === "proposal").length,
    won: leads.filter((l) => l.stage === "won").length,
    customers: customers.length,
  };

  const total = leads.length;

  const chartData = [
    { stage: "New", leads: stages.new, percentage: ((stages.new / total) * 100).toFixed(1) },
    { stage: "Contacted", leads: stages.contacted, percentage: ((stages.contacted / total) * 100).toFixed(1) },
    { stage: "Qualified", leads: stages.qualified, percentage: ((stages.qualified / total) * 100).toFixed(1) },
    { stage: "Proposal", leads: stages.proposal, percentage: ((stages.proposal / total) * 100).toFixed(1) },
    { stage: "Won", leads: stages.won, percentage: ((stages.won / total) * 100).toFixed(1) },
    { stage: "Customers", leads: stages.customers, percentage: ((stages.customers / total) * 100).toFixed(1) },
  ];

  return (
    <div className="space-y-6">
      <Card className="border-0 shadow-lg">
        <CardHeader>
          <CardTitle>Lead Conversion Funnel</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="stage" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="leads" fill="#6366f1" name="Count" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-lg">
        <CardHeader>
          <CardTitle>Stage-to-Stage Conversion Rates</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[
              { from: "New", to: "Contacted", rate: ((stages.contacted / stages.new) * 100).toFixed(1) || 0 },
              { from: "Contacted", to: "Qualified", rate: ((stages.qualified / stages.contacted) * 100).toFixed(1) || 0 },
              { from: "Qualified", to: "Proposal", rate: ((stages.proposal / stages.qualified) * 100).toFixed(1) || 0 },
              { from: "Proposal", to: "Won", rate: ((stages.won / stages.proposal) * 100).toFixed(1) || 0 },
              { from: "Won", to: "Customer", rate: ((stages.customers / stages.won) * 100).toFixed(1) || 0 },
            ].map((item, idx) => (
              <div key={idx} className="flex items-center gap-4">
                <div className="w-32 text-sm font-bold">{item.from} → {item.to}</div>
                <div className="flex-1 bg-slate-200 rounded-full h-6 overflow-hidden">
                  <div
                    className={`h-full flex items-center justify-end pr-2 text-xs font-bold text-white ${
                      item.rate > 50 ? "bg-green-500" : item.rate > 25 ? "bg-amber-500" : "bg-red-500"
                    }`}
                    style={{ width: `${Math.min(item.rate, 100)}%` }}
                  >
                    {item.rate}%
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-3 gap-4">
        {chartData.map((item, idx) => (
          <Card key={idx} className="border-0 shadow-md">
            <CardContent className="p-4">
              <p className="text-sm text-slate-600">{item.stage}</p>
              <div className="flex items-baseline gap-2 mt-2">
                <p className="text-2xl font-bold">{item.leads}</p>
                <p className="text-sm text-slate-600">({item.percentage}%)</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}