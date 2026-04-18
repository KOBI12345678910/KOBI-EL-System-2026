import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

interface Lead {
  status?: string;
  estimated_value?: number;
}

interface SalesPipelineProps {
  leads?: Lead[];
}

const stageColors: Record<string, string> = {
  new: "bg-blue-500",
  contacted: "bg-cyan-500",
  qualified: "bg-yellow-500",
  proposal: "bg-orange-500",
  negotiation: "bg-purple-500",
  won: "bg-emerald-500",
  lost: "bg-red-500",
};

const stageLabels: Record<string, string> = {
  new: "חדש",
  contacted: "נוצר קשר",
  qualified: "מוסמך",
  proposal: "הצעה",
  negotiation: "משא ומתן",
  won: "זכייה",
  lost: "הפסד",
};

export default function SalesPipeline({ leads = [] }: SalesPipelineProps) {
  const stages = ["new", "contacted", "qualified", "proposal", "negotiation", "won"];

  const stageData = stages.map((stage) => {
    const stageLeads = leads.filter((l) => l.status === stage);
    const value = stageLeads.reduce((sum, l) => sum + (l.estimated_value || 0), 0);
    return { stage, count: stageLeads.length, value };
  });

  const maxValue = Math.max(...stageData.map((s) => s.value), 1);

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-semibold text-slate-900">משפך מכירות</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {stageData.map(({ stage, count, value }) => (
          <div key={stage} className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-slate-700">{stageLabels[stage]}</span>
              <div className="flex items-center gap-3">
                <span className="text-slate-400">{count} לידים</span>
                <span className="font-semibold text-slate-900">₪{value.toLocaleString()}</span>
              </div>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full ${stageColors[stage]} rounded-full transition-all duration-500`}
                style={{ width: `${(value / maxValue) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
