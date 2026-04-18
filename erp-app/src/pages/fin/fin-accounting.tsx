import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  TrendingUp, TrendingDown, Link2, CheckCircle, AlertCircle,
  DollarSign, ArrowLeftRight
} from "lucide-react";
import { useLocation } from "wouter";

export default function FinAccounting() {
  const [, navigate] = useLocation();

  const { data: stats } = useQuery({
    queryKey: ["/api/fin/documents/stats/summary"],
    queryFn: () => fetch("/api/fin/documents/stats/summary").then(r => r.json()),
  });

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <h1 className="text-2xl font-bold">חשבונאות</h1>

      {/* Overview Widgets */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-green-200">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <TrendingUp className="h-8 w-8 text-green-600" />
              <div>
                <p className="text-sm text-muted-foreground">חייבים (Receivables)</p>
                <p className="text-xl font-bold">₪{Number(stats?.income?.totalBalance || 0).toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-red-200">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <TrendingDown className="h-8 w-8 text-red-600" />
              <div>
                <p className="text-sm text-muted-foreground">זכאים (Payables)</p>
                <p className="text-xl font-bold">₪{Number(stats?.expenses?.totalBalance || 0).toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-blue-200">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Link2 className="h-8 w-8 text-blue-600" />
              <div>
                <p className="text-sm text-muted-foreground">קשרי מסמכים</p>
                <p className="text-xl font-bold">—</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-purple-200">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <ArrowLeftRight className="h-8 w-8 text-purple-600" />
              <div>
                <p className="text-sm text-muted-foreground">שינויי סטטוס אחרונים</p>
                <p className="text-xl font-bold">—</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="relations">
        <TabsList>
          <TabsTrigger value="relations">קשרי מסמכים</TabsTrigger>
          <TabsTrigger value="reconciliation">התאמת תשלומים</TabsTrigger>
          <TabsTrigger value="aging">גיול חובות</TabsTrigger>
        </TabsList>

        {/* Document Relations */}
        <TabsContent value="relations">
          <Card>
            <CardHeader>
              <CardTitle>קשרים בין מסמכים</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-center text-muted-foreground py-8">
                בחר מסמך כדי לראות את הקשרים שלו, או צור קשר חדש בין שני מסמכים
              </p>
              <div className="flex justify-center gap-3">
                <Button variant="outline" onClick={() => navigate("/fin/income")}>
                  <TrendingUp className="h-4 w-4 ml-2" /> מסמכי הכנסה
                </Button>
                <Button variant="outline" onClick={() => navigate("/fin/expenses")}>
                  <TrendingDown className="h-4 w-4 ml-2" /> מסמכי הוצאה
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Payment Reconciliation */}
        <TabsContent value="reconciliation">
          <Card>
            <CardHeader>
              <CardTitle>התאמת תשלומים למסמכים</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4 mb-6">
                <Card className="bg-green-50">
                  <CardContent className="pt-4 text-center">
                    <CheckCircle className="h-6 w-6 mx-auto text-green-600 mb-1" />
                    <p className="text-sm text-muted-foreground">מותאמים</p>
                    <p className="text-xl font-bold text-green-700">—</p>
                  </CardContent>
                </Card>
                <Card className="bg-amber-50">
                  <CardContent className="pt-4 text-center">
                    <AlertCircle className="h-6 w-6 mx-auto text-amber-600 mb-1" />
                    <p className="text-sm text-muted-foreground">חלקי</p>
                    <p className="text-xl font-bold text-amber-700">—</p>
                  </CardContent>
                </Card>
                <Card className="bg-red-50">
                  <CardContent className="pt-4 text-center">
                    <DollarSign className="h-6 w-6 mx-auto text-red-600 mb-1" />
                    <p className="text-sm text-muted-foreground">לא מותאמים</p>
                    <p className="text-xl font-bold text-red-700">—</p>
                  </CardContent>
                </Card>
              </div>
              <div className="flex justify-center gap-3">
                <Button>
                  <ArrowLeftRight className="h-4 w-4 ml-2" /> התאם תשלום למסמך
                </Button>
                <Button variant="outline">
                  <CheckCircle className="h-4 w-4 ml-2" /> סמן כשולם
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Aging */}
        <TabsContent value="aging">
          <Card>
            <CardHeader>
              <CardTitle>גיול חובות</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">טווח</TableHead>
                    <TableHead className="text-right">חייבים</TableHead>
                    <TableHead className="text-right">זכאים</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell>שוטף (0-30 ימים)</TableCell>
                    <TableCell className="text-green-600">—</TableCell>
                    <TableCell className="text-red-600">—</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>30-60 ימים</TableCell>
                    <TableCell className="text-amber-600">—</TableCell>
                    <TableCell className="text-red-600">—</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>60-90 ימים</TableCell>
                    <TableCell className="text-orange-600">—</TableCell>
                    <TableCell className="text-red-600">—</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">90+ ימים</TableCell>
                    <TableCell className="text-red-600 font-medium">—</TableCell>
                    <TableCell className="text-red-600 font-medium">—</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
