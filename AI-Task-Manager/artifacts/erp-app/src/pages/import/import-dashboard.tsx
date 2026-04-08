import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Ship, FileText, DollarSign, Clock, AlertTriangle, CheckCircle, MapPin, Globe } from "lucide-react";
import { useLocation } from "wouter";

export default function ImportDashboard() {
  const [, navigate] = useLocation();

  const activeImports = [
    { id: 1, po: "PO-IM-001", supplier: "Foshan Glass Co.", origin: "סין", port: "אשדוד", eta: "2026-04-20", status: "in_transit", value: 45000, currency: "USD" },
    { id: 2, po: "PO-IM-002", supplier: "Schüco International", origin: "גרמניה", port: "חיפה", eta: "2026-04-25", status: "customs", value: 120000, currency: "EUR" },
    { id: 3, po: "PO-IM-003", supplier: "Alumil SA", origin: "יוון", port: "אשדוד", eta: "2026-05-01", status: "ordered", value: 78000, currency: "EUR" },
    { id: 4, po: "PO-IM-004", supplier: "Technal India", origin: "הודו", port: "חיפה", eta: "2026-04-15", status: "arrived", value: 32000, currency: "USD" },
  ];

  const statusBadge = (status: string) => {
    switch (status) {
      case "ordered": return <Badge className="bg-gray-500/20 text-gray-600">הוזמן</Badge>;
      case "in_transit": return <Badge className="bg-blue-500/20 text-blue-600">בדרך</Badge>;
      case "customs": return <Badge className="bg-amber-500/20 text-amber-600">מכס</Badge>;
      case "arrived": return <Badge className="bg-green-500/20 text-green-600">הגיע</Badge>;
      default: return null;
    }
  };

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Ship className="h-7 w-7" /> ניהול יבוא
        </h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate("/import/import-cost-calculator")}>מחשבון עלויות</Button>
          <Button variant="outline" onClick={() => navigate("/import/import-insurance")}>ביטוח</Button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <Card className="border-blue-200">
          <CardContent className="pt-6 text-center">
            <Ship className="h-6 w-6 mx-auto text-blue-500 mb-1" />
            <p className="text-sm text-muted-foreground">משלוחים בדרך</p>
            <p className="text-3xl font-bold text-blue-600">{activeImports.filter(i => i.status === "in_transit").length}</p>
          </CardContent>
        </Card>
        <Card className="border-amber-200">
          <CardContent className="pt-6 text-center">
            <AlertTriangle className="h-6 w-6 mx-auto text-amber-500 mb-1" />
            <p className="text-sm text-muted-foreground">במכס</p>
            <p className="text-3xl font-bold text-amber-600">{activeImports.filter(i => i.status === "customs").length}</p>
          </CardContent>
        </Card>
        <Card className="border-green-200">
          <CardContent className="pt-6 text-center">
            <CheckCircle className="h-6 w-6 mx-auto text-green-500 mb-1" />
            <p className="text-sm text-muted-foreground">הגיעו</p>
            <p className="text-3xl font-bold text-green-600">{activeImports.filter(i => i.status === "arrived").length}</p>
          </CardContent>
        </Card>
        <Card className="border-purple-200">
          <CardContent className="pt-6 text-center">
            <DollarSign className="h-6 w-6 mx-auto text-purple-500 mb-1" />
            <p className="text-sm text-muted-foreground">שווי כולל</p>
            <p className="text-2xl font-bold text-purple-600">${activeImports.reduce((s, i) => s + i.value, 0).toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>משלוחים פעילים</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">הזמנה</TableHead>
                <TableHead className="text-right">ספק</TableHead>
                <TableHead className="text-right">מקור</TableHead>
                <TableHead className="text-right">נמל יעד</TableHead>
                <TableHead className="text-right">ETA</TableHead>
                <TableHead className="text-right">שווי</TableHead>
                <TableHead className="text-right">סטטוס</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activeImports.map(imp => (
                <TableRow key={imp.id} className="cursor-pointer hover:bg-accent">
                  <TableCell className="font-medium font-mono">{imp.po}</TableCell>
                  <TableCell>{imp.supplier}</TableCell>
                  <TableCell className="flex items-center gap-1"><Globe className="h-3 w-3" />{imp.origin}</TableCell>
                  <TableCell className="flex items-center gap-1"><MapPin className="h-3 w-3" />{imp.port}</TableCell>
                  <TableCell>{imp.eta}</TableCell>
                  <TableCell className="font-medium">{imp.currency} {imp.value.toLocaleString()}</TableCell>
                  <TableCell>{statusBadge(imp.status)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
