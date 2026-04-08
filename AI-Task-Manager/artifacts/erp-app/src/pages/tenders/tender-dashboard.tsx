import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, FileText, Clock, CheckCircle, XCircle, DollarSign, Calendar, Building2 } from "lucide-react";
import { useLocation } from "wouter";

export default function TenderDashboard() {
  const [, navigate] = useLocation();

  const tenders = [
    { id: 1, number: "TND-001", title: "אספקת חומרי גלם Q3", client: "משרד הביטחון", deadline: "2026-04-30", budget: 2500000, bids: 5, status: "open" },
    { id: 2, number: "TND-002", title: "שירותי תחזוקה שנתי", client: "עיריית תל אביב", deadline: "2026-05-15", budget: 800000, bids: 3, status: "open" },
    { id: 3, number: "TND-003", title: "פרויקט בנייה - שלב א'", client: "חברת נדל\"ן", deadline: "2026-03-31", budget: 5000000, bids: 7, status: "evaluation" },
    { id: 4, number: "TND-004", title: "ציוד IT למשרדים", client: "בנק לאומי", deadline: "2026-03-15", budget: 350000, bids: 4, status: "awarded" },
    { id: 5, number: "TND-005", title: "ליסינג רכבים", client: "רשות המים", deadline: "2026-02-28", budget: 1200000, bids: 2, status: "closed" },
  ];

  const statusBadge = (status: string) => {
    switch (status) {
      case "open": return <Badge className="bg-green-500/20 text-green-600">פתוח</Badge>;
      case "evaluation": return <Badge className="bg-blue-500/20 text-blue-600">בהערכה</Badge>;
      case "awarded": return <Badge className="bg-purple-500/20 text-purple-600">נבחר זוכה</Badge>;
      case "closed": return <Badge className="bg-gray-500/20 text-gray-600">סגור</Badge>;
      default: return null;
    }
  };

  const stats = {
    open: tenders.filter(t => t.status === "open").length,
    evaluation: tenders.filter(t => t.status === "evaluation").length,
    awarded: tenders.filter(t => t.status === "awarded").length,
    totalValue: tenders.reduce((s, t) => s + t.budget, 0),
  };

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FileText className="h-7 w-7" /> ניהול מכרזים
        </h1>
        <Button><Plus className="h-4 w-4 ml-2" /> מכרז חדש</Button>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <Card className="border-green-200">
          <CardContent className="pt-6 text-center">
            <Clock className="h-6 w-6 mx-auto text-green-500 mb-1" />
            <p className="text-sm text-muted-foreground">פתוחים</p>
            <p className="text-3xl font-bold text-green-600">{stats.open}</p>
          </CardContent>
        </Card>
        <Card className="border-blue-200">
          <CardContent className="pt-6 text-center">
            <FileText className="h-6 w-6 mx-auto text-blue-500 mb-1" />
            <p className="text-sm text-muted-foreground">בהערכה</p>
            <p className="text-3xl font-bold text-blue-600">{stats.evaluation}</p>
          </CardContent>
        </Card>
        <Card className="border-purple-200">
          <CardContent className="pt-6 text-center">
            <CheckCircle className="h-6 w-6 mx-auto text-purple-500 mb-1" />
            <p className="text-sm text-muted-foreground">נבחר זוכה</p>
            <p className="text-3xl font-bold text-purple-600">{stats.awarded}</p>
          </CardContent>
        </Card>
        <Card className="border-amber-200">
          <CardContent className="pt-6 text-center">
            <DollarSign className="h-6 w-6 mx-auto text-amber-500 mb-1" />
            <p className="text-sm text-muted-foreground">שווי כולל</p>
            <p className="text-2xl font-bold text-amber-600">₪{(stats.totalValue / 1000000).toFixed(1)}M</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">מספר</TableHead>
                <TableHead className="text-right">כותרת</TableHead>
                <TableHead className="text-right">לקוח</TableHead>
                <TableHead className="text-right">מועד אחרון</TableHead>
                <TableHead className="text-right">תקציב</TableHead>
                <TableHead className="text-right">הצעות</TableHead>
                <TableHead className="text-right">סטטוס</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tenders.map(t => (
                <TableRow key={t.id} className="cursor-pointer hover:bg-accent" onClick={() => navigate(`/tenders/${t.id}`)}>
                  <TableCell className="font-medium font-mono">{t.number}</TableCell>
                  <TableCell>{t.title}</TableCell>
                  <TableCell className="flex items-center gap-1"><Building2 className="h-3 w-3" />{t.client}</TableCell>
                  <TableCell className="flex items-center gap-1"><Calendar className="h-3 w-3" />{t.deadline}</TableCell>
                  <TableCell className="font-medium">₪{t.budget.toLocaleString()}</TableCell>
                  <TableCell><Badge variant="outline">{t.bids}</Badge></TableCell>
                  <TableCell>{statusBadge(t.status)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
