import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Banknote,
  AlertTriangle,
  CheckCircle2,
  Clock,
  TrendingUp,
  ShieldAlert,
  Search,
  Phone,
  Mail,
  FileText,
  Scale,
  Users,
  CalendarDays,
} from "lucide-react";

const accounts = [
  { id: 1, name: 'חברת בנייה א.ב. בע"מ', balance: 125000, overdue: 45000, lastPayment: "2026-03-15", daysOverdue: 22, risk: "בינוני" },
  { id: 2, name: "קבלנות הצפון", balance: 89000, overdue: 0, lastPayment: "2026-04-01", daysOverdue: 0, risk: "נמוך" },
  { id: 3, name: "אדריכלים מאוחדים", balance: 67000, overdue: 67000, lastPayment: "2026-01-20", daysOverdue: 78, risk: "גבוה" },
  { id: 4, name: "פרויקט מגדלי הים", balance: 234000, overdue: 85000, lastPayment: "2026-02-28", daysOverdue: 39, risk: "בינוני" },
  { id: 5, name: "שיפוצי הדרום", balance: 45000, overdue: 0, lastPayment: "2026-04-05", daysOverdue: 0, risk: "נמוך" },
  { id: 6, name: 'בניין וגמר בע"מ', balance: 178000, overdue: 120000, lastPayment: "2025-12-10", daysOverdue: 119, risk: "גבוה" },
  { id: 7, name: "מרכז מסחרי חיפה", balance: 312000, overdue: 56000, lastPayment: "2026-03-20", daysOverdue: 18, risk: "נמוך" },
  { id: 8, name: "דירות יוקרה ת\"א", balance: 156000, overdue: 156000, lastPayment: "2025-11-30", daysOverdue: 129, risk: "גבוה" },
  { id: 9, name: "קבוצת השקעות כרמל", balance: 98000, overdue: 32000, lastPayment: "2026-03-01", daysOverdue: 38, risk: "בינוני" },
  { id: 10, name: "פיתוח נדל\"ן גליל", balance: 72000, overdue: 0, lastPayment: "2026-04-03", daysOverdue: 0, risk: "נמוך" },
  { id: 11, name: "בונים חדש", balance: 210000, overdue: 95000, lastPayment: "2026-02-15", daysOverdue: 52, risk: "גבוה" },
  { id: 12, name: "אלומיניום פרויקטים", balance: 54000, overdue: 12000, lastPayment: "2026-03-25", daysOverdue: 14, risk: "נמוך" },
];

const agingBuckets = [
  { range: "שוטף (0-30 ימים)", amount: 485000, count: 5, color: "bg-green-100 text-green-800" },
  { range: "30-60 ימים", amount: 217000, count: 3, color: "bg-yellow-100 text-yellow-800" },
  { range: "60-90 ימים", amount: 162000, count: 2, color: "bg-orange-100 text-orange-800" },
  { range: "90-120 ימים", amount: 120000, count: 1, color: "bg-red-100 text-red-800" },
  { range: "120+ ימים", amount: 156000, count: 1, color: "bg-red-200 text-red-900" },
];

const collectionActions = [
  { id: 1, customer: "אדריכלים מאוחדים", action: "שיחת טלפון", date: "2026-04-08", status: "מתוכנן", amount: 67000, type: "phone" },
  { id: 2, customer: 'בניין וגמר בע"מ', action: "מכתב התראה שני", date: "2026-04-07", status: "נשלח", amount: 120000, type: "letter" },
  { id: 3, customer: "דירות יוקרה ת\"א", action: "העברה לגבייה משפטית", date: "2026-04-06", status: "בטיפול", amount: 156000, type: "legal" },
  { id: 4, customer: "בונים חדש", action: "שיחת טלפון מנהל", date: "2026-04-09", status: "מתוכנן", amount: 95000, type: "phone" },
  { id: 5, customer: "פרויקט מגדלי הים", action: "מכתב תזכורת", date: "2026-04-05", status: "נשלח", amount: 85000, type: "letter" },
  { id: 6, customer: "קבוצת השקעות כרמל", action: "שיחת טלפון", date: "2026-04-10", status: "מתוכנן", amount: 32000, type: "phone" },
  { id: 7, customer: 'חברת בנייה א.ב. בע"מ', action: "מכתב תזכורת", date: "2026-04-04", status: "נשלח", amount: 45000, type: "letter" },
];

const riskColor = (risk: string) => {
  switch (risk) {
    case "נמוך": return "bg-green-100 text-green-800";
    case "בינוני": return "bg-yellow-100 text-yellow-800";
    case "גבוה": return "bg-red-100 text-red-800";
    default: return "bg-gray-100 text-gray-800";
  }
};

const actionIcon = (type: string) => {
  switch (type) {
    case "phone": return <Phone className="h-4 w-4 text-blue-600" />;
    case "letter": return <Mail className="h-4 w-4 text-orange-600" />;
    case "legal": return <Scale className="h-4 w-4 text-red-600" />;
    default: return <FileText className="h-4 w-4" />;
  }
};

export default function CollectionsManager() {
  const [search, setSearch] = useState("");

  const totalReceivables = accounts.reduce((s, a) => s + a.balance, 0);
  const totalOverdue = accounts.reduce((s, a) => s + a.overdue, 0);
  const collectedThisMonth = 287000;
  const dso = 42;
  const collectionRate = 78.5;
  const atRiskAccounts = accounts.filter((a) => a.risk === "גבוה").length;

  const kpis = [
    { label: 'סה"כ חובות', value: `₪${totalReceivables.toLocaleString()}`, icon: Banknote, color: "text-blue-600" },
    { label: "באיחור", value: `₪${totalOverdue.toLocaleString()}`, icon: AlertTriangle, color: "text-red-600" },
    { label: "נגבה החודש", value: `₪${collectedThisMonth.toLocaleString()}`, icon: CheckCircle2, color: "text-green-600" },
    { label: "DSO (ימים)", value: dso, icon: Clock, color: "text-orange-600" },
    { label: "שיעור גבייה", value: `${collectionRate}%`, icon: TrendingUp, color: "text-purple-600" },
    { label: "חשבונות בסיכון", value: atRiskAccounts, icon: ShieldAlert, color: "text-red-700" },
  ];

  const filtered = accounts.filter((a) => a.name.includes(search));

  return (
    <div dir="rtl" className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">ניהול גביות</h1>
          <p className="text-muted-foreground mt-1">טכנו-כל עוזי - מעקב חובות ותשלומים</p>
        </div>
        <Button><FileText className="h-4 w-4 ml-2" />דוח גבייה</Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="p-4 text-center">
              <kpi.icon className={`h-8 w-8 mx-auto mb-2 ${kpi.color}`} />
              <div className="text-2xl font-bold">{kpi.value}</div>
              <div className="text-xs text-muted-foreground">{kpi.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="accounts" className="space-y-4">
        <TabsList>
          <TabsTrigger value="accounts">חשבונות</TabsTrigger>
          <TabsTrigger value="aging">גיול חובות</TabsTrigger>
          <TabsTrigger value="actions">פעולות גבייה</TabsTrigger>
        </TabsList>

        <TabsContent value="accounts" className="space-y-4">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="חיפוש לקוח..." value={search} onChange={(e) => setSearch(e.target.value)} className="pr-10" />
          </div>
          <div className="space-y-3">
            {filtered.map((a) => (
              <Card key={a.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <Users className="h-5 w-5 text-gray-500" />
                      <div>
                        <div className="font-semibold">{a.name}</div>
                        <div className="text-sm text-muted-foreground">תשלום אחרון: {a.lastPayment}</div>
                      </div>
                    </div>
                    <Badge className={riskColor(a.risk)}>סיכון {a.risk}</Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div className="text-center p-2 bg-gray-50 rounded">
                      <div className="font-bold">₪{a.balance.toLocaleString()}</div>
                      <div className="text-xs text-muted-foreground">יתרה</div>
                    </div>
                    <div className={`text-center p-2 rounded ${a.overdue > 0 ? "bg-red-50" : "bg-green-50"}`}>
                      <div className={`font-bold ${a.overdue > 0 ? "text-red-700" : "text-green-700"}`}>
                        ₪{a.overdue.toLocaleString()}
                      </div>
                      <div className="text-xs text-muted-foreground">באיחור</div>
                    </div>
                    <div className="text-center p-2 bg-gray-50 rounded">
                      <div className="font-bold">{a.daysOverdue > 0 ? `${a.daysOverdue} ימים` : "בזמן"}</div>
                      <div className="text-xs text-muted-foreground">ימי איחור</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="aging" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>גיול חובות - Aging</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {agingBuckets.map((bucket) => (
                <div key={bucket.range} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Badge className={bucket.color}>{bucket.range}</Badge>
                      <span className="text-sm text-muted-foreground">{bucket.count} חשבונות</span>
                    </div>
                    <span className="font-bold text-lg">₪{bucket.amount.toLocaleString()}</span>
                  </div>
                  <Progress value={(bucket.amount / totalReceivables) * 100} className="h-3" />
                  <div className="text-xs text-muted-foreground text-left">{((bucket.amount / totalReceivables) * 100).toFixed(1)}% מסה"כ</div>
                </div>
              ))}
            </CardContent>
          </Card>
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardContent className="p-4 text-center">
                <CalendarDays className="h-8 w-8 mx-auto mb-2 text-blue-600" />
                <div className="text-2xl font-bold">{dso} ימים</div>
                <div className="text-sm text-muted-foreground">ממוצע ימי גבייה (DSO)</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <TrendingUp className="h-8 w-8 mx-auto mb-2 text-green-600" />
                <div className="text-2xl font-bold">{collectionRate}%</div>
                <div className="text-sm text-muted-foreground">שיעור גבייה</div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="actions" className="space-y-3">
          {collectionActions.map((action) => (
            <Card key={action.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="bg-gray-50 p-2 rounded">{actionIcon(action.type)}</div>
                    <div>
                      <div className="font-semibold">{action.customer}</div>
                      <div className="text-sm text-muted-foreground">{action.action}</div>
                      <div className="text-xs text-muted-foreground">{action.date}</div>
                    </div>
                  </div>
                  <div className="text-left">
                    <div className="font-bold">₪{action.amount.toLocaleString()}</div>
                    <Badge variant="outline" className={
                      action.status === "מתוכנן" ? "border-blue-300 text-blue-700" :
                      action.status === "נשלח" ? "border-green-300 text-green-700" :
                      "border-orange-300 text-orange-700"
                    }>{action.status}</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
