import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DollarSign, TrendingUp, TrendingDown, FileText, CreditCard,
  Users, Truck, Receipt, Plus, Upload, RefreshCw, Building2,
  AlertCircle, Clock, ArrowRight
} from "lucide-react";
import { useLocation } from "wouter";

export default function FinDashboard() {
  const [, navigate] = useLocation();

  const { data: stats } = useQuery({
    queryKey: ["/api/fin/documents/stats/summary"],
  });

  const { data: statuses } = useQuery({
    queryKey: ["/api/fin/statuses"],
  });

  const { data: recentActivity } = useQuery({
    queryKey: ["/api/fin/activity-logs", { limit: 10 }],
  });

  const quickActions = [
    { label: "לקוח חדש", icon: Users, route: "/customers/create", color: "bg-blue-500" },
    { label: "ספק חדש", icon: Truck, route: "/suppliers/create", color: "bg-purple-500" },
    { label: "מסמך הכנסה", icon: TrendingUp, route: "/fin/income/create", color: "bg-green-500" },
    { label: "העלאת הוצאה", icon: Upload, route: "/fin/expenses/create", color: "bg-red-500" },
    { label: "חשבונית/קבלה", icon: Receipt, route: "/fin/invoice-receipt/create", color: "bg-indigo-500" },
    { label: "מסמך מחזורי", icon: RefreshCw, route: "/fin/recurring/create", color: "bg-amber-500" },
    { label: "הוראת קבע", icon: Building2, route: "/fin/standing-orders/create", color: "bg-teal-500" },
    { label: "סליקת אשראי", icon: CreditCard, route: "/fin/credit/create", color: "bg-pink-500" },
  ];

  const moduleCards = [
    { label: "לקוחות", icon: Users, route: "/customers", count: 0, color: "text-blue-600" },
    { label: "הכנסות", icon: TrendingUp, route: "/fin/income", count: stats?.income?.totalDocuments || 0, color: "text-green-600" },
    { label: "ספקים", icon: Truck, route: "/suppliers", count: 0, color: "text-purple-600" },
    { label: "הוצאות", icon: TrendingDown, route: "/fin/expenses", count: stats?.expenses?.totalDocuments || 0, color: "text-red-600" },
    { label: "חשבונאות", icon: FileText, route: "/fin/accounting", count: 0, color: "text-indigo-600" },
    { label: "סליקה", icon: CreditCard, route: "/fin/credit", count: 0, color: "text-pink-600" },
    { label: "הוראות קבע", icon: RefreshCw, route: "/fin/standing-orders", count: 0, color: "text-amber-600" },
    { label: "דוחות", icon: FileText, route: "/reports/financial", count: 0, color: "text-gray-600" },
  ];

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">דשבורד פיננסי</h1>
        <Badge variant="outline" className="text-sm">
          {new Date().toLocaleDateString("he-IL")}
        </Badge>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">פעולות מהירות</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
            {quickActions.map((action) => (
              <Button
                key={action.label}
                variant="outline"
                className="flex flex-col items-center gap-2 h-auto py-4 hover:bg-accent"
                onClick={() => navigate(action.route)}
              >
                <div className={`p-2 rounded-lg ${action.color} text-white`}>
                  <action.icon className="h-5 w-5" />
                </div>
                <span className="text-xs text-center">{action.label}</span>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Summary Widgets */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card className="border-green-200 bg-green-50">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-green-700">הכנסות פתוחות</p>
                <p className="text-2xl font-bold text-green-900">
                  ₪{Number(stats?.income?.totalBalance || 0).toLocaleString()}
                </p>
              </div>
              <TrendingUp className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-red-700">הוצאות פתוחות</p>
                <p className="text-2xl font-bold text-red-900">
                  ₪{Number(stats?.expenses?.totalBalance || 0).toLocaleString()}
                </p>
              </div>
              <TrendingDown className="h-8 w-8 text-red-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-blue-700">יתרה לגבייה</p>
                <p className="text-2xl font-bold text-blue-900">
                  ₪{Number(stats?.income?.totalBalance || 0).toLocaleString()}
                </p>
              </div>
              <DollarSign className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-purple-200 bg-purple-50">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-purple-700">תשלומים אחרונים</p>
                <p className="text-2xl font-bold text-purple-900">
                  ₪{Number(stats?.income?.totalPaid || 0).toLocaleString()}
                </p>
              </div>
              <CreditCard className="h-8 w-8 text-purple-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-amber-700">רווח נקי</p>
                <p className="text-2xl font-bold text-amber-900">
                  ₪{Number(stats?.netProfit || 0).toLocaleString()}
                </p>
              </div>
              <TrendingUp className="h-8 w-8 text-amber-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Modules Grid */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">מודולים</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {moduleCards.map((module) => (
              <Card
                key={module.label}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => navigate(module.route)}
              >
                <CardContent className="pt-6 text-center">
                  <module.icon className={`h-8 w-8 mx-auto mb-2 ${module.color}`} />
                  <p className="font-medium">{module.label}</p>
                  {module.count > 0 && (
                    <Badge variant="secondary" className="mt-1">{module.count}</Badge>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Recent Activity */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">פעילות אחרונה</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => navigate("/fin/activity")}>
            הכל <ArrowRight className="h-4 w-4 mr-1" />
          </Button>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {(recentActivity || []).slice(0, 5).map((log: any) => (
              <div key={log.id} className="flex items-center gap-3 text-sm border-b pb-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">
                  {new Date(log.createdAt).toLocaleString("he-IL")}
                </span>
                <span>{log.description || `${log.actionType} - ${log.entityType} #${log.entityId}`}</span>
                <span className="text-muted-foreground mr-auto">{log.actor}</span>
              </div>
            ))}
            {(!recentActivity || recentActivity.length === 0) && (
              <p className="text-center text-muted-foreground py-8">אין פעילות אחרונה</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
