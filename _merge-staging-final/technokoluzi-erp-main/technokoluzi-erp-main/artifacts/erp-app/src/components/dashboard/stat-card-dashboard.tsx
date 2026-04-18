import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface StatCardDashboardProps {
  title: string;
  value: string | number;
  icon?: LucideIcon;
  trend?: "up" | "down";
  trendValue?: string;
  color?: "blue" | "green" | "purple" | "orange" | "red" | "indigo";
  subtitle?: string;
}

const colorClasses: Record<string, string> = {
  blue: "bg-blue-50 text-blue-600",
  green: "bg-emerald-50 text-emerald-600",
  purple: "bg-purple-50 text-purple-600",
  orange: "bg-orange-50 text-orange-600",
  red: "bg-red-50 text-red-600",
  indigo: "bg-indigo-50 text-indigo-600",
};

export default function StatCardDashboard({ title, value, icon: Icon, trend, trendValue, color = "blue", subtitle }: StatCardDashboardProps) {
  return (
    <Card className="p-6 bg-white border-0 shadow-sm hover:shadow-md transition-all duration-300">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <p className="text-3xl font-bold text-slate-900 tracking-tight">{value}</p>
          {subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}
          {trend && (
            <div className={cn("flex items-center gap-1 text-sm font-medium", trend === "up" ? "text-emerald-600" : "text-red-500")}>
              <span>{trend === "up" ? "↑" : "↓"}</span>
              <span>{trendValue}</span>
            </div>
          )}
        </div>
        {Icon && (
          <div className={cn("p-3 rounded-xl", colorClasses[color])}>
            <Icon className="w-6 h-6" />
          </div>
        )}
      </div>
    </Card>
  );
}
