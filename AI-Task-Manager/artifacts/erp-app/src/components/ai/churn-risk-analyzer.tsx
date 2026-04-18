import { useMemo } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Heart } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface CustomerData {
  id: number;
  name: string;
  engagement_trend: number;
  support_tickets: number;
  last_purchase_days: number;
  lifetime_value: number;
}

interface AnalyzedCustomer extends CustomerData {
  churn_risk: number;
  risk_level: string;
  retention_actions: string[];
}

interface ChurnRiskAnalyzerProps {
  customers?: CustomerData[];
}

export default function ChurnRiskAnalyzer({ customers = [] }: ChurnRiskAnalyzerProps) {
  const mockCustomers: CustomerData[] =
    customers.length === 0
      ? [
          { id: 1, name: "Customer A", engagement_trend: 80, support_tickets: 2, last_purchase_days: 45, lifetime_value: 50000 },
          { id: 2, name: "Customer B", engagement_trend: 30, support_tickets: 8, last_purchase_days: 120, lifetime_value: 35000 },
          { id: 3, name: "Customer C", engagement_trend: 65, support_tickets: 1, last_purchase_days: 30, lifetime_value: 80000 },
          { id: 4, name: "Customer D", engagement_trend: 15, support_tickets: 5, last_purchase_days: 180, lifetime_value: 20000 },
          { id: 5, name: "Customer E", engagement_trend: 70, support_tickets: 0, last_purchase_days: 10, lifetime_value: 100000 },
        ]
      : customers;

  const analyzedCustomers = useMemo<AnalyzedCustomer[]>(() => {
    return mockCustomers
      .map((customer) => {
        let churnRisk = 50;

        if (customer.engagement_trend < 40) churnRisk += 30;
        else if (customer.engagement_trend < 60) churnRisk += 15;
        else churnRisk -= 10;

        if (customer.support_tickets > 5) churnRisk += 20;
        else if (customer.support_tickets > 3) churnRisk += 10;

        if (customer.last_purchase_days > 180) churnRisk += 35;
        else if (customer.last_purchase_days > 90) churnRisk += 15;
        else churnRisk -= 15;

        churnRisk = Math.max(0, Math.min(100, churnRisk));

        return {
          ...customer,
          churn_risk: churnRisk,
          risk_level:
            churnRisk >= 70 ? "Critical" : churnRisk >= 50 ? "High" : churnRisk >= 30 ? "Medium" : "Low",
          retention_actions:
            churnRisk >= 70
              ? ["Call urgently", "Special offer", "Account review"]
              : churnRisk >= 50
              ? ["Send win-back email", "Offer discount"]
              : ["Regular check-in", "Cross-sell opportunity"],
        };
      })
      .sort((a, b) => b.churn_risk - a.churn_risk);
  }, [mockCustomers]);

  const engagementTrend = [
    { month: "Jan", value: 75 },
    { month: "Feb", value: 72 },
    { month: "Mar", value: 68 },
    { month: "Apr", value: 65 },
    { month: "May", value: 60 },
  ];

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Heart className="w-5 h-5 text-red-600" />
          AI Churn Risk Analyzer
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Trend Chart */}
        <div className="w-full h-48">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={engagementTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="value"
                stroke="#ef4444"
                strokeWidth={2}
                dot={{ fill: "#ef4444" }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Risk Summary */}
        <div className="grid grid-cols-4 gap-2">
          <div className="p-2 bg-red-50 rounded-lg text-center">
            <p className="text-xs text-red-600 font-semibold">Critical</p>
            <p className="text-lg font-bold text-red-700">
              {analyzedCustomers.filter((c) => c.risk_level === "Critical").length}
            </p>
          </div>
          <div className="p-2 bg-orange-50 rounded-lg text-center">
            <p className="text-xs text-orange-600 font-semibold">High</p>
            <p className="text-lg font-bold text-orange-700">
              {analyzedCustomers.filter((c) => c.risk_level === "High").length}
            </p>
          </div>
          <div className="p-2 bg-amber-50 rounded-lg text-center">
            <p className="text-xs text-amber-600 font-semibold">Medium</p>
            <p className="text-lg font-bold text-amber-700">
              {analyzedCustomers.filter((c) => c.risk_level === "Medium").length}
            </p>
          </div>
          <div className="p-2 bg-emerald-50 rounded-lg text-center">
            <p className="text-xs text-emerald-600 font-semibold">Low</p>
            <p className="text-lg font-bold text-emerald-700">
              {analyzedCustomers.filter((c) => c.risk_level === "Low").length}
            </p>
          </div>
        </div>

        {/* At-Risk Customers */}
        <div className="space-y-2">
          {analyzedCustomers
            .filter((c) => c.risk_level === "Critical" || c.risk_level === "High")
            .map((customer) => (
              <div key={customer.id} className="p-3 border border-red-200 bg-red-50 rounded-lg">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-semibold text-slate-900">{customer.name}</p>
                    <p className="text-xs text-slate-600">
                      LTV: \u20AA{customer.lifetime_value.toLocaleString()}
                    </p>
                  </div>
                  <Badge
                    className={
                      customer.risk_level === "Critical"
                        ? "bg-red-600 text-white"
                        : "bg-orange-600 text-white"
                    }
                  >
                    {customer.risk_level}
                  </Badge>
                </div>
                <Progress value={customer.churn_risk} className="h-2 mb-2" />
                <p className="text-xs font-bold text-red-700 mb-1">
                  {customer.churn_risk}% Churn Risk
                </p>
                <div className="flex flex-wrap gap-1">
                  {customer.retention_actions.map((action, idx) => (
                    <Badge key={idx} variant="outline" className="text-xs bg-white">
                      {action}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
        </div>

        {/* AI Recommendation */}
        <div className="p-3 bg-red-50 border border-red-300 rounded-lg">
          <p className="text-xs text-red-700">
            <strong>Critical Alert:</strong>{" "}
            {analyzedCustomers.filter((c) => c.risk_level === "Critical").length} customer(s) at
            critical churn risk representing \u20AA
            {analyzedCustomers
              .filter((c) => c.risk_level === "Critical")
              .reduce((sum, c) => sum + c.lifetime_value, 0)
              .toLocaleString()}{" "}
            in potential revenue loss.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
