import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Headphones, MessageSquare, Clock, Star, TrendingUp, AlertTriangle, CheckCircle, Users } from "lucide-react";
import { useLocation } from "wouter";

export default function ServiceDashboard() {
  const [, navigate] = useLocation();

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Headphones className="h-7 w-7" /> שירות לקוחות
        </h1>
        <Button onClick={() => navigate("/customer-service/complaints")}>תלונות</Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6 text-center">
            <MessageSquare className="h-6 w-6 mx-auto text-blue-500 mb-2" />
            <p className="text-sm text-muted-foreground">פניות פתוחות</p>
            <p className="text-3xl font-bold">18</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <Clock className="h-6 w-6 mx-auto text-amber-500 mb-2" />
            <p className="text-sm text-muted-foreground">זמן תגובה</p>
            <p className="text-3xl font-bold">1.8h</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <Star className="h-6 w-6 mx-auto text-yellow-500 mb-2" />
            <p className="text-sm text-muted-foreground">שביעות רצון</p>
            <p className="text-3xl font-bold text-green-600">4.6/5</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <TrendingUp className="h-6 w-6 mx-auto text-green-500 mb-2" />
            <p className="text-sm text-muted-foreground">נפתרו השבוע</p>
            <p className="text-3xl font-bold text-green-600">42</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="cursor-pointer hover:shadow-md" onClick={() => navigate("/customer-service/complaints")}>
          <CardContent className="pt-6 flex items-center gap-4">
            <AlertTriangle className="h-10 w-10 text-red-500" />
            <div>
              <p className="font-bold text-lg">תלונות</p>
              <p className="text-sm text-muted-foreground">ניהול תלונות לקוח</p>
              <Badge variant="outline" className="mt-1">5 פתוחות</Badge>
            </div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md" onClick={() => navigate("/customer-service/rma")}>
          <CardContent className="pt-6 flex items-center gap-4">
            <CheckCircle className="h-10 w-10 text-blue-500" />
            <div>
              <p className="font-bold text-lg">RMA</p>
              <p className="text-sm text-muted-foreground">החזרות והחלפות</p>
              <Badge variant="outline" className="mt-1">3 בתהליך</Badge>
            </div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md" onClick={() => navigate("/customer-service/warranty-management")}>
          <CardContent className="pt-6 flex items-center gap-4">
            <Users className="h-10 w-10 text-purple-500" />
            <div>
              <p className="font-bold text-lg">אחריות</p>
              <p className="text-sm text-muted-foreground">ניהול תעודות אחריות</p>
              <Badge variant="outline" className="mt-1">120 פעילות</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>ביצועי צוות</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {[
            { name: "דנה כהן", resolved: 15, avgTime: "1.2h", satisfaction: 96 },
            { name: "יוסי לוי", resolved: 12, avgTime: "2.1h", satisfaction: 92 },
            { name: "מיכל אברהם", resolved: 10, avgTime: "1.5h", satisfaction: 98 },
          ].map((agent, i) => (
            <div key={i} className="flex items-center gap-4">
              <span className="font-medium w-32">{agent.name}</span>
              <div className="flex-1">
                <div className="flex items-center justify-between text-sm mb-1">
                  <span>{agent.resolved} נפתרו</span>
                  <span>{agent.avgTime} ממוצע</span>
                  <span>{agent.satisfaction}% שביעות רצון</span>
                </div>
                <Progress value={agent.satisfaction} className="h-2" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
