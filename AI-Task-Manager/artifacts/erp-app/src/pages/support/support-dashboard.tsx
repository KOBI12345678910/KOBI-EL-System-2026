import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Headphones, TicketCheck, Clock, AlertTriangle, TrendingUp,
  Users, BarChart3, MessageSquare
} from "lucide-react";
import { useLocation } from "wouter";

export default function SupportDashboard() {
  const [, navigate] = useLocation();

  const stats = {
    openTickets: 24,
    inProgress: 12,
    waitingCustomer: 8,
    closedToday: 15,
    avgResponseTime: "2.4 שעות",
    satisfaction: "94%",
    slaCompliance: "87%",
    urgentTickets: 3,
  };

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Headphones className="h-7 w-7" /> מרכז תמיכה
        </h1>
        <Button onClick={() => navigate("/support/tickets")}>
          כל הטיקטים
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="cursor-pointer hover:shadow-md" onClick={() => navigate("/support/tickets?status=open")}>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">טיקטים פתוחים</p>
                <p className="text-3xl font-bold">{stats.openTickets}</p>
              </div>
              <TicketCheck className="h-8 w-8 text-yellow-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">בטיפול</p>
                <p className="text-3xl font-bold text-blue-600">{stats.inProgress}</p>
              </div>
              <Clock className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md" onClick={() => navigate("/support/tickets?priority=urgent")}>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">דחופים</p>
                <p className="text-3xl font-bold text-red-600">{stats.urgentTickets}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-red-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">נסגרו היום</p>
                <p className="text-3xl font-bold text-green-600">{stats.closedToday}</p>
              </div>
              <TrendingUp className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Performance Metrics */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6 text-center">
            <Clock className="h-6 w-6 mx-auto text-blue-500 mb-2" />
            <p className="text-sm text-muted-foreground">זמן תגובה ממוצע</p>
            <p className="text-2xl font-bold">{stats.avgResponseTime}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <Users className="h-6 w-6 mx-auto text-green-500 mb-2" />
            <p className="text-sm text-muted-foreground">שביעות רצון</p>
            <p className="text-2xl font-bold text-green-600">{stats.satisfaction}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <BarChart3 className="h-6 w-6 mx-auto text-purple-500 mb-2" />
            <p className="text-sm text-muted-foreground">עמידה ב-SLA</p>
            <p className="text-2xl font-bold text-purple-600">{stats.slaCompliance}</p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Navigation */}
      <Card>
        <CardHeader><CardTitle>ניווט מהיר</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Button variant="outline" className="h-auto py-4 flex flex-col gap-2" onClick={() => navigate("/support/tickets")}>
              <TicketCheck className="h-5 w-5" />
              <span>כל הטיקטים</span>
            </Button>
            <Button variant="outline" className="h-auto py-4 flex flex-col gap-2" onClick={() => navigate("/support/knowledge")}>
              <MessageSquare className="h-5 w-5" />
              <span>בסיס ידע</span>
            </Button>
            <Button variant="outline" className="h-auto py-4 flex flex-col gap-2" onClick={() => navigate("/customer-service/complaints")}>
              <AlertTriangle className="h-5 w-5" />
              <span>תלונות</span>
            </Button>
            <Button variant="outline" className="h-auto py-4 flex flex-col gap-2" onClick={() => navigate("/customer-service/rma")}>
              <Headphones className="h-5 w-5" />
              <span>RMA</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
