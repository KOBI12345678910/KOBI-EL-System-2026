import { TrendingUp, TrendingDown } from "lucide-react";

interface KPIWidgetProps {
  config: {
    title?: string;
    value?: number;
    change?: number;
    format?: "number" | "currency";
  };
}

export default function KPIWidget({ config }: KPIWidgetProps) {
  const { value = 0, change = 0, format = "number" } = config;
  const isPositive = change >= 0;
  const formattedValue = format === "currency" ? `₪${value.toLocaleString()}` : value.toLocaleString();

  return (
    <div className="space-y-2">
      <div className="text-2xl font-bold text-slate-900">{formattedValue}</div>
      {change !== 0 && (
        <div className={`flex items-center gap-1 text-sm ${isPositive ? "text-green-600" : "text-red-600"}`}>
          {isPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
          <span>{Math.abs(change)}%</span>
        </div>
      )}
    </div>
  );
}
