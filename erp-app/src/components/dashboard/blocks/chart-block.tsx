import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

interface ChartBlockProps {
  config: Record<string, unknown>;
  onUpdate: (config: Record<string, unknown>) => void;
}

const SAMPLE_DATA: Record<string, { month?: string; name?: string; value: number }[]> = {
  sales_monthly: [
    { month: "ינואר", value: 45000 },
    { month: "פברואר", value: 52000 },
    { month: "מרץ", value: 48000 },
    { month: "אפריל", value: 61000 },
    { month: "מאי", value: 55000 },
    { month: "יוני", value: 67000 },
  ],
  production_stages: [
    { name: "מדידה", value: 15 },
    { name: "הנדסה", value: 22 },
    { name: "חיתוך", value: 18 },
    { name: "ריתוך", value: 25 },
  ],
  collection_status: [
    { name: "משולמות", value: 65 },
    { name: "חלקיות", value: 20 },
    { name: "ממתינות", value: 15 },
  ],
};

const COLORS = ["#4f46e5", "#06b6d4", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

export default function ChartBlock({ config, onUpdate }: ChartBlockProps) {
  const [chartType, setChartType] = useState<string>((config.chartType as string) || "line");
  const [dataSource, setDataSource] = useState<string>((config.dataSource as string) || "sales_monthly");

  const data = SAMPLE_DATA[dataSource] || SAMPLE_DATA.sales_monthly;

  const handleChange = (key: string, value: string) => {
    onUpdate({ ...config, [key]: value });
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <div className="space-y-3">
          <CardTitle className="text-sm">הגדרות תרשים</CardTitle>
          <Select value={chartType} onValueChange={(val) => { setChartType(val); handleChange("chartType", val); }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="line">גרף קו</SelectItem>
              <SelectItem value="bar">תרשים עמודות</SelectItem>
              <SelectItem value="pie">תרשים עוגה</SelectItem>
            </SelectContent>
          </Select>
          <Select value={dataSource} onValueChange={(val) => { setDataSource(val); handleChange("dataSource", val); }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="sales_monthly">מכירות חודשיות</SelectItem>
              <SelectItem value="production_stages">שלבי ייצור</SelectItem>
              <SelectItem value="collection_status">סטטוס גביה</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-64 mt-4">
          <ResponsiveContainer width="100%" height="100%">
            {chartType === "line" ? (
              <LineChart data={data}>
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="value" stroke="#4f46e5" strokeWidth={2} />
              </LineChart>
            ) : chartType === "bar" ? (
              <BarChart data={data}>
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="#4f46e5" />
              </BarChart>
            ) : (
              <PieChart>
                <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                  {data.map((_entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            )}
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
