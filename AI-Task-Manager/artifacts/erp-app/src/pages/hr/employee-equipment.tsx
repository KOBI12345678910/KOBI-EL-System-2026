import { useState } from "react";
import {
  Laptop, Smartphone, Car, CreditCard, HardHat, Wrench, ShieldCheck,
  Package, Users, Clock, DollarSign, RotateCcw, ArrowRightLeft, AlertTriangle
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

const fmtCur = (v: number) => "₪" + v.toLocaleString("he-IL");

const statusMap: Record<string, { label: string; color: string }> = {
  active:   { label: "פעיל",   color: "bg-green-100 text-green-800" },
  returned: { label: "הוחזר", color: "bg-blue-100 text-blue-800" },
  lost:     { label: "אבד",   color: "bg-red-100 text-red-800" },
  damaged:  { label: "ניזוק", color: "bg-orange-100 text-orange-800" },
};

const assignments = [
  { id: 1,  employee: "יוסי כהן",     item: "מחשב נייד",     assetId: "AST-101", date: "2025-01-15", status: "active",   value: 4500 },
  { id: 2,  employee: "יוסי כהן",     item: "טלפון",         assetId: "AST-102", date: "2025-01-15", status: "active",   value: 3200 },
  { id: 3,  employee: "רונית לוי",    item: "מחשב נייד",     assetId: "AST-103", date: "2024-09-01", status: "active",   value: 5200 },
  { id: 4,  employee: "רונית לוי",    item: "כרטיס כניסה",   assetId: "AST-104", date: "2024-09-01", status: "active",   value: 50 },
  { id: 5,  employee: "דני אברהם",    item: "רכב",           assetId: "AST-105", date: "2024-06-10", status: "active",   value: 45000 },
  { id: 6,  employee: "דני אברהם",    item: "טלפון",         assetId: "AST-106", date: "2024-06-10", status: "active",   value: 2800 },
  { id: 7,  employee: "מירב שמש",     item: "ציוד בטיחות",   assetId: "AST-107", date: "2025-03-01", status: "active",   value: 1200 },
  { id: 8,  employee: "מירב שמש",     item: "ביגוד עבודה",   assetId: "AST-108", date: "2025-03-01", status: "active",   value: 600 },
  { id: 9,  employee: "עמית ברק",     item: "מחשב נייד",     assetId: "AST-109", date: "2023-11-20", status: "returned", value: 4200 },
  { id: 10, employee: "עמית ברק",     item: "כלי עבודה",     assetId: "AST-110", date: "2023-11-20", status: "active",   value: 3500 },
  { id: 11, employee: "שירה גולן",    item: "מחשב נייד",     assetId: "AST-111", date: "2025-02-10", status: "active",   value: 5800 },
  { id: 12, employee: "אלון מזרחי",   item: "ציוד בטיחות",   assetId: "AST-112", date: "2024-04-05", status: "lost",     value: 950 },
  { id: 13, employee: "אלון מזרחי",   item: "כרטיס כניסה",   assetId: "AST-113", date: "2024-04-05", status: "active",   value: 50 },
  { id: 14, employee: "נועה פרידמן",  item: "טלפון",         assetId: "AST-114", date: "2024-12-01", status: "damaged",  value: 2900 },
  { id: 15, employee: "תומר חדד",     item: "ביגוד עבודה",   assetId: "AST-115", date: "2025-01-20", status: "active",   value: 550 },
];

const pendingReturns = [
  { employee: "עמית ברק",    item: "כלי עבודה",   assetId: "AST-110", reason: "סיום העסקה",  dueDate: "2026-04-15" },
  { employee: "אלון מזרחי",  item: "כרטיס כניסה", assetId: "AST-113", reason: "העברה לסניף", dueDate: "2026-04-20" },
  { employee: "נועה פרידמן", item: "טלפון",       assetId: "AST-114", reason: "החלפה עקב נזק", dueDate: "2026-04-12" },
  { employee: "שירה גולן",   item: "מחשב נייד",   assetId: "AST-111", reason: "שדרוג ציוד",  dueDate: "2026-04-25" },
];

const equipmentTypes = [
  { type: "מחשב נייד",     icon: Laptop,      count: 22, totalValue: 42000 },
  { type: "טלפון",         icon: Smartphone,  count: 18, totalValue: 28800 },
  { type: "רכב",           icon: Car,         count: 5,  totalValue: 225000 },
  { type: "כרטיס כניסה",   icon: CreditCard,  count: 15, totalValue: 750 },
  { type: "ביגוד עבודה",   icon: HardHat,     count: 10, totalValue: 5500 },
  { type: "כלי עבודה",     icon: Wrench,      count: 8,  totalValue: 18000 },
  { type: "ציוד בטיחות",   icon: ShieldCheck, count: 5,  totalValue: 4200 },
  { type: "ציוד משרדי",    icon: Package,     count: 2,  totalValue: 750 },
];

const kpis = [
  { label: "פריטים מוקצים", value: "85",       icon: Package,    color: "text-blue-600" },
  { label: "עובדים עם ציוד", value: "32",      icon: Users,      color: "text-green-600" },
  { label: "ממתינים להחזרה", value: "4",       icon: RotateCcw,  color: "text-orange-600" },
  { label: "ערך כולל",       value: fmtCur(125000), icon: DollarSign, color: "text-purple-600" },
];

function groupByEmployee() {
  const grouped: Record<string, typeof assignments> = {};
  for (const a of assignments) {
    if (!grouped[a.employee]) grouped[a.employee] = [];
    grouped[a.employee].push(a);
  }
  return Object.entries(grouped);
}

export default function EmployeeEquipmentPage() {
  const [activeTab, setActiveTab] = useState("assignments");

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-blue-100">
          <Laptop className="h-6 w-6 text-blue-700" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">ציוד ונכסים לעובדים</h1>
          <p className="text-sm text-muted-foreground">טכנו-כל עוזי — ניהול הקצאת ציוד ונכסים</p>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardContent className="flex items-center gap-3 p-4">
              <k.icon className={`h-8 w-8 ${k.color}`} />
              <div>
                <p className="text-2xl font-bold">{k.value}</p>
                <p className="text-xs text-muted-foreground">{k.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="assignments">הקצאות</TabsTrigger>
          <TabsTrigger value="by-employee">לפי עובד</TabsTrigger>
          <TabsTrigger value="returns">החזרות</TabsTrigger>
          <TabsTrigger value="types">סוגי ציוד</TabsTrigger>
        </TabsList>

        {/* Tab 1: Assignment Table */}
        <TabsContent value="assignments">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ArrowRightLeft className="h-5 w-5" />
                טבלת הקצאות — {assignments.length} רשומות
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">עובד</TableHead>
                    <TableHead className="text-right">פריט</TableHead>
                    <TableHead className="text-right">מזהה נכס</TableHead>
                    <TableHead className="text-right">תאריך הקצאה</TableHead>
                    <TableHead className="text-right">מצב</TableHead>
                    <TableHead className="text-right">ערך</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assignments.map((a) => {
                    const st = statusMap[a.status];
                    return (
                      <TableRow key={a.id}>
                        <TableCell className="font-medium">{a.employee}</TableCell>
                        <TableCell>{a.item}</TableCell>
                        <TableCell className="font-mono text-xs">{a.assetId}</TableCell>
                        <TableCell>{a.date}</TableCell>
                        <TableCell>
                          <Badge className={st.color}>{st.label}</Badge>
                        </TableCell>
                        <TableCell>{fmtCur(a.value)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: By Employee */}
        <TabsContent value="by-employee">
          <div className="space-y-4">
            {groupByEmployee().map(([name, items]) => {
              const totalValue = items.reduce((s, i) => s + i.value, 0);
              return (
                <Card key={name}>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center justify-between text-base">
                      <span className="flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        {name}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {items.length} פריטים — {fmtCur(totalValue)}
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-right">פריט</TableHead>
                          <TableHead className="text-right">מזהה</TableHead>
                          <TableHead className="text-right">תאריך</TableHead>
                          <TableHead className="text-right">מצב</TableHead>
                          <TableHead className="text-right">ערך</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {items.map((i) => {
                          const st = statusMap[i.status];
                          return (
                            <TableRow key={i.id}>
                              <TableCell>{i.item}</TableCell>
                              <TableCell className="font-mono text-xs">{i.assetId}</TableCell>
                              <TableCell>{i.date}</TableCell>
                              <TableCell>
                                <Badge className={st.color}>{st.label}</Badge>
                              </TableCell>
                              <TableCell>{fmtCur(i.value)}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* Tab 3: Pending Returns */}
        <TabsContent value="returns">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-orange-500" />
                ממתינים להחזרה — {pendingReturns.length} פריטים
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">עובד</TableHead>
                    <TableHead className="text-right">פריט</TableHead>
                    <TableHead className="text-right">מזהה נכס</TableHead>
                    <TableHead className="text-right">סיבה</TableHead>
                    <TableHead className="text-right">תאריך יעד</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingReturns.map((r, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium">{r.employee}</TableCell>
                      <TableCell>{r.item}</TableCell>
                      <TableCell className="font-mono text-xs">{r.assetId}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{r.reason}</Badge>
                      </TableCell>
                      <TableCell>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                          {r.dueDate}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 4: Equipment Types */}
        <TabsContent value="types">
          <Card className="mb-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">סיכום כללי — סוגי ציוד</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-2xl font-bold">{equipmentTypes.length}</p>
                  <p className="text-xs text-muted-foreground">קטגוריות</p>
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {equipmentTypes.reduce((s, e) => s + e.count, 0)}
                  </p>
                  <p className="text-xs text-muted-foreground">סה״כ יחידות</p>
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {fmtCur(equipmentTypes.reduce((s, e) => s + e.totalValue, 0))}
                  </p>
                  <p className="text-xs text-muted-foreground">ערך כולל</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {equipmentTypes.map((eq) => {
              const maxCount = Math.max(...equipmentTypes.map((e) => e.count));
              const pct = Math.round((eq.count / maxCount) * 100);
              return (
                <Card key={eq.type}>
                  <CardContent className="flex items-center gap-4 p-4">
                    <div className="p-2 rounded-lg bg-muted">
                      <eq.icon className="h-6 w-6 text-foreground" />
                    </div>
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{eq.type}</span>
                        <span className="text-sm text-muted-foreground">{eq.count} יחידות</span>
                      </div>
                      <Progress value={pct} className="h-2" />
                      <p className="text-xs text-muted-foreground">ערך כולל: {fmtCur(eq.totalValue)}</p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
