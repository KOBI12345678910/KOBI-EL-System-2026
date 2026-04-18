import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

interface Lead {
  status?: string;
  [key: string]: unknown;
}

interface Opportunity {
  [key: string]: unknown;
}

interface Customer {
  [key: string]: unknown;
}

interface LeadFunnelProps {
  leads: Lead[];
  opportunities: Opportunity[];
  customers: Customer[];
}

export default function LeadFunnel({ leads, opportunities, customers }: LeadFunnelProps) {
  const totalLeads = leads.length;
  const qualifiedLeads = leads.filter((l) => l.status === "qualified").length;
  const opportunitiesCount = opportunities.length;
  const convertedCustomers = customers.length;

  const funnelData = [
    {
      stage: "לידים",
      count: totalLeads,
      percentage: 100,
      color: "#3b82f6",
    },
    {
      stage: "מוסמכים",
      count: qualifiedLeads,
      percentage: totalLeads > 0 ? Number(((qualifiedLeads / totalLeads) * 100).toFixed(1)) : 0,
      color: "#8b5cf6",
    },
    {
      stage: "הזדמנויות",
      count: opportunitiesCount,
      percentage:
        qualifiedLeads > 0
          ? Number(((opportunitiesCount / qualifiedLeads) * 100).toFixed(1))
          : 0,
      color: "#ec4899",
    },
    {
      stage: "לקוחות",
      count: convertedCustomers,
      percentage:
        opportunitiesCount > 0
          ? Number(((convertedCustomers / opportunitiesCount) * 100).toFixed(1))
          : 0,
      color: "#10b981",
    },
  ];

  return (
    <div className="w-full h-80">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={funnelData} layout="vertical">
          <XAxis
            type="number"
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#94a3b8", fontSize: 12 }}
          />
          <YAxis
            dataKey="stage"
            type="category"
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#64748b", fontSize: 12 }}
            width={70}
          />
          <Tooltip
            formatter={(value: number) => [`${value}`, "כמות"]}
            contentStyle={{
              borderRadius: "8px",
              border: "none",
              boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
            }}
          />
          <Bar dataKey="count" fill="#3b82f6" radius={[0, 4, 4, 0]}>
            {funnelData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
