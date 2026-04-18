import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, Target, DollarSign } from "lucide-react";

interface Lead {
  id: number | string;
  [key: string]: unknown;
}

interface Opportunity {
  amount?: number;
  stage?: string;
  [key: string]: unknown;
}

interface Customer {
  id: number | string;
  [key: string]: unknown;
}

interface Invoice {
  status?: string;
  total?: number;
  [key: string]: unknown;
}

interface ConversionMetricsProps {
  leads: Lead[];
  opportunities: Opportunity[];
  customers: Customer[];
  invoices: Invoice[];
}

export default function ConversionMetrics({
  leads,
  opportunities,
  customers,
  invoices,
}: ConversionMetricsProps) {
  const conversionRate =
    leads.length > 0 ? ((customers.length / leads.length) * 100).toFixed(1) : "0";
  const avgDealValue =
    opportunities.length > 0
      ? (
          opportunities.reduce((sum, o) => sum + (o.amount || 0), 0) / opportunities.length
        ).toFixed(0)
      : "0";
  const closedValue = invoices
    .filter((i) => i.status === "paid")
    .reduce((sum, i) => sum + (i.total || 0), 0);
  const opportunitiesWon = opportunities.filter((o) => o.stage === "closed_won").length;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-indigo-600" />
            </div>
            <div className="text-right flex-1">
              <p className="text-xs text-slate-500">שיעור המרה</p>
              <p className="text-lg font-bold">{conversionRate}%</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
              <DollarSign className="w-4 h-4 text-purple-600" />
            </div>
            <div className="text-right flex-1">
              <p className="text-xs text-slate-500">עסקה ממוצעת</p>
              <p className="text-lg font-bold">{(Number(avgDealValue) / 1000).toFixed(0)}K</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
              <Target className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-right flex-1">
              <p className="text-xs text-slate-500">עסקאות סגורות</p>
              <p className="text-lg font-bold">{opportunitiesWon}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
              <DollarSign className="w-4 h-4 text-amber-600" />
            </div>
            <div className="text-right flex-1">
              <p className="text-xs text-slate-500">סגור החודש</p>
              <p className="text-lg font-bold">{(closedValue / 1000).toFixed(0)}K</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
