import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Link2, Package, Truck, AlertTriangle, TrendingUp, Globe, BarChart3, Shield } from "lucide-react";
import { useLocation } from "wouter";

export default function SupplyChainDashboard() {
  const [, navigate] = useLocation();

  const metrics = [
    { label: "אמינות אספקה", value: 92, target: 95, unit: "%", icon: Shield, color: "text-blue-600" },
    { label: "Lead Time ממוצע", value: 8.5, target: 7, unit: "ימים", icon: Truck, color: "text-amber-600" },
    { label: "שיעור מילוי הזמנות", value: 97, target: 98, unit: "%", icon: Package, color: "text-green-600" },
    { label: "סיכוני שרשרת", value: 3, target: 0, unit: "פריטים", icon: AlertTriangle, color: "text-red-600" },
  ];

  const risks = [
    { supplier: "Foshan Glass Co.", risk: "עיכוב נמל בסין", severity: "high", impact: "3 הזמנות מושפעות", mitigation: "ספק חלופי זמין" },
    { supplier: "Schüco International", risk: "עלייה ב-15% מחירי אלומיניום", severity: "medium", impact: "תקציב Q3", mitigation: "חוזה מחיר קבוע עד 06/2026" },
    { supplier: "קבוצת אלומיל", risk: "תקלה בקו ייצור", severity: "low", impact: "עיכוב 5 ימים", mitigation: "הזמנה חלופית הוגשה" },
  ];

  const severityBadge = (severity: string) => {
    switch (severity) {
      case "high": return <Badge className="bg-red-500/20 text-red-600">גבוה</Badge>;
      case "medium": return <Badge className="bg-amber-500/20 text-amber-600">בינוני</Badge>;
      case "low": return <Badge className="bg-green-500/20 text-green-600">נמוך</Badge>;
      default: return null;
    }
  };

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Link2 className="h-7 w-7" /> שרשרת אספקה
        </h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate("/supply-chain/edi-dashboard")}>EDI</Button>
          <Button variant="outline" onClick={() => navigate("/supply-chain/edi-admin")}>הגדרות EDI</Button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {metrics.map((m, i) => (
          <Card key={i}>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <m.icon className={`h-8 w-8 ${m.color}`} />
                <div className="flex-1">
                  <p className="text-sm text-muted-foreground">{m.label}</p>
                  <p className="text-2xl font-bold">{m.value}{m.unit === "%" ? "%" : ` ${m.unit}`}</p>
                  <p className="text-xs text-muted-foreground">יעד: {m.target}{m.unit === "%" ? "%" : ` ${m.unit}`}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-500" /> סיכונים פעילים
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">ספק</TableHead>
                <TableHead className="text-right">סיכון</TableHead>
                <TableHead className="text-right">חומרה</TableHead>
                <TableHead className="text-right">השפעה</TableHead>
                <TableHead className="text-right">מענה</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {risks.map((r, i) => (
                <TableRow key={i}>
                  <TableCell className="font-medium">{r.supplier}</TableCell>
                  <TableCell>{r.risk}</TableCell>
                  <TableCell>{severityBadge(r.severity)}</TableCell>
                  <TableCell>{r.impact}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.mitigation}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
