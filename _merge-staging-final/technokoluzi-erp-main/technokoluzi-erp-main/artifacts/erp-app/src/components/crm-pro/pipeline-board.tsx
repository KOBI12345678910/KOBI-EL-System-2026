import { useQuery } from "@tanstack/react-query";
import { entityList } from "@/lib/entity-api";
import { Card } from "@/components/ui/card";

interface Deal {
  id: number;
  name?: string;
  stage?: string;
  deal_value?: number;
  created_date?: string;
}

interface PipelineStage {
  id: string;
  label: string;
  color: string;
}

const PIPELINE_STAGES: PipelineStage[] = [
  { id: "new", label: "חדש", color: "bg-slate-100" },
  { id: "contacted", label: "צור קשר", color: "bg-blue-100" },
  { id: "qualified", label: "מעוניין", color: "bg-yellow-100" },
  { id: "proposal", label: "הצעה", color: "bg-orange-100" },
  { id: "negotiation", label: "משא ומתן", color: "bg-purple-100" },
  { id: "won", label: "שיגור", color: "bg-green-100" },
  { id: "lost", label: "הפסדנו", color: "bg-red-100" },
];

export default function PipelineBoard() {
  const { data: deals = [], isLoading } = useQuery({
    queryKey: ["deals"],
    queryFn: () => entityList<Deal>("deals"),
  });

  if (isLoading) return <div className="p-8 text-center text-slate-600">טוען...</div>;

  const stageStats = PIPELINE_STAGES.map((stage) => ({
    ...stage,
    count: deals.filter((d) => d.stage === stage.id).length,
    value: deals
      .filter((d) => d.stage === stage.id)
      .reduce((sum, d) => sum + (d.deal_value || 0), 0),
  }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-7 gap-3">
        {stageStats.map((stage) => (
          <div
            key={stage.id}
            className={`p-4 rounded-lg border-2 border-slate-200 ${stage.color}`}
          >
            <h3 className="font-semibold text-sm text-slate-900">{stage.label}</h3>
            <div className="mt-2">
              <p className="text-2xl font-bold text-slate-900">{stage.count}</p>
              <p className="text-xs text-slate-600 mt-1">
                {stage.value.toLocaleString("he-IL")}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-3">
        {PIPELINE_STAGES.map((stage) => (
          <div key={stage.id} className="space-y-2">
            <h4 className="font-semibold text-sm">{stage.label}</h4>
            <div className="space-y-2">
              {deals
                .filter((d) => d.stage === stage.id)
                .map((deal) => (
                  <Card
                    key={deal.id}
                    className="p-3 bg-white border cursor-pointer hover:shadow-md"
                  >
                    <p className="font-medium text-sm">{deal.name}</p>
                    <p className="text-xs text-slate-600 mt-1">
                      {deal.deal_value?.toLocaleString("he-IL") || "0"}
                    </p>
                  </Card>
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
