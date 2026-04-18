import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

interface Invoice {
  created_date?: string;
  total?: number;
}

interface RevenueChartProps {
  invoices?: Invoice[];
}

export default function RevenueChart({ invoices = [] }: RevenueChartProps) {
  const monthlyData = invoices
    .reduce<{ month: string; revenue: number; count: number }[]>((acc, inv) => {
      if (!inv.created_date) return acc;
      const month = new Date(inv.created_date).toLocaleDateString("he-IL", { month: "short" });
      const existing = acc.find((d) => d.month === month);
      if (existing) {
        existing.revenue += inv.total || 0;
        existing.count += 1;
      } else {
        acc.push({ month, revenue: inv.total || 0, count: 1 });
      }
      return acc;
    }, [])
    .slice(-6);

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-semibold text-slate-900">הכנסות</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={monthlyData}>
              <defs>
                <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 12 }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 12 }} tickFormatter={(value) => `₪${(value / 1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{ background: "white", border: "none", borderRadius: "12px", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}
                formatter={(value: number) => [`₪${value.toLocaleString()}`, "הכנסות"]}
              />
              <Area type="monotone" dataKey="revenue" stroke="#6366f1" strokeWidth={2} fill="url(#colorRevenue)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
