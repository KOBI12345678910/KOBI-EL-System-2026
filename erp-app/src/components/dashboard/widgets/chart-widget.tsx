import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface ChartWidgetProps {
  config: {
    chartType?: string;
    data?: { name: string; value: number }[];
  };
}

export default function ChartWidget({ config }: ChartWidgetProps) {
  const sampleData = config.data && config.data.length > 0 ? config.data : [
    { name: "ינואר", value: 4000 },
    { name: "פברואר", value: 3000 },
    { name: "מרץ", value: 5000 },
    { name: "אפריל", value: 4500 },
  ];

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={sampleData}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="name" />
        <YAxis />
        <Tooltip />
        <Bar dataKey="value" fill="#6366f1" />
      </BarChart>
    </ResponsiveContainer>
  );
}
