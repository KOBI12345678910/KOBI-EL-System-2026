interface Opportunity {
  stage?: string;
  amount?: number;
  [key: string]: unknown;
}

interface PipelineStagesProps {
  opportunities: Opportunity[];
}

const stages = [
  { label: "Prospecting", color: "bg-slate-100 text-slate-700" },
  { label: "Qualification", color: "bg-blue-100 text-blue-700" },
  { label: "Proposal", color: "bg-purple-100 text-purple-700" },
  { label: "Negotiation", color: "bg-amber-100 text-amber-700" },
  { label: "Closed Won", color: "bg-emerald-100 text-emerald-700" },
];

export default function PipelineStages({ opportunities }: PipelineStagesProps) {
  const byStage = stages.map((stage) => ({
    ...stage,
    count: opportunities.filter((o) => o.stage === stage.label).length,
    value: opportunities
      .filter((o) => o.stage === stage.label)
      .reduce((sum, o) => sum + (o.amount || 0), 0),
  }));

  return (
    <div className="space-y-3">
      {byStage.map((stage, idx) => (
        <div key={idx} className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{stage.label}</span>
            <span className="text-sm text-slate-500">
              {stage.count} - {(stage.value / 1000).toFixed(0)}K
            </span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full ${stage.color} transition-all`}
              style={{
                width: `${Math.max(stage.count / Math.max(...byStage.map((s) => s.count), 1)) * 100}%`,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
