import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { SkeletonPage } from "@/components/ui/skeleton-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { authFetch } from "@/lib/utils";
import { VAT_RATE } from "@/utils/money";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend,
} from "recharts";
import {
  Ship, Package, Globe, DollarSign, Clock, CheckCircle2, AlertTriangle,
  Anchor, Container, Plus, Calculator, TrendingUp, TrendingDown,
  ArrowLeft, ArrowRight, MapPin,
} from "lucide-react";

const API = "/api";

/* ── Types ─────────────────────────────────────────────── */
interface Shipment {
  id: number;
  shipmentNumber: string;
  supplier: string;
  country: string;
  container: string;
  status: "ordered" | "in_transit" | "at_port" | "customs" | "cleared" | "delivered";
  eta: string;
  totalValue: number;
  costs: {
    goods: number;
    freight: number;
    insurance: number;
    customs: number;
    vat: number;
    broker: number;
    handling: number;
    inland: number;
  };
  items: { name: string; quantity: number; unitPrice: number; landedCost: number }[];
  timeline: { date: string; event: string; completed: boolean }[];
}

interface CurrencyRate {
  currency: string;
  rate: number;
  change: number;
  impact: number;
}

/* ── Helpers ───────────────────────────────────────────── */
const fmt = (v: number) =>
  new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(v);

const fmtUsd = (v: number) =>
  new Intl.NumberFormat("he-IL", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);

const statusLabels: Record<string, string> = {
  ordered: "הוזמן",
  in_transit: "במשלוח",
  at_port: "בנמל",
  customs: "מכס",
  cleared: "שוחרר",
  delivered: "נמסר",
};

const statusColors: Record<string, string> = {
  ordered: "bg-muted text-muted-foreground",
  in_transit: "bg-blue-500 text-foreground",
  at_port: "bg-amber-500 text-foreground",
  customs: "bg-orange-500 text-foreground",
  cleared: "bg-green-500 text-foreground",
  delivered: "bg-emerald-600 text-foreground",
};

/* ── Mock data ─────────────────────────────────────────── */
function generateShipments(): Shipment[] {
  const suppliers = ["Shenzhen Tech Co.", "Hamburg Industrial GmbH", "Milano Parts S.r.l.", "Tokyo Precision Ltd.", "Mumbai Steel Corp.", "Istanbul Trade A.S."];
  const countries = ["סין", "גרמניה", "איטליה", "יפן", "הודו", "טורקיה"];
  const statuses: Shipment["status"][] = ["ordered", "in_transit", "at_port", "customs", "cleared", "delivered"];
  const containers = ["40HC", "20GP", "40GP", "20HC", "LCL"];

  return suppliers.map((supplier, i) => {
    const goods = Math.floor(Math.random() * 300000) + 50000;
    const freight = Math.floor(goods * 0.08);
    const insurance = Math.floor(goods * 0.015);
    const customs = Math.floor(goods * 0.06);
    const vat = Math.floor((goods + freight + insurance + customs) * VAT_RATE);
    const broker = 3500;
    const handling = 2200;
    const inland = 1800;
    const total = goods + freight + insurance + customs + vat + broker + handling + inland;

    return {
      id: i + 1,
      shipmentNumber: `IMP-2026-${String(i + 101).padStart(4, "0")}`,
      supplier,
      country: countries[i],
      container: containers[i % containers.length],
      status: statuses[i % statuses.length],
      eta: new Date(Date.now() + (i - 2) * 7 * 86400000).toISOString().slice(0, 10),
      totalValue: total,
      costs: { goods, freight, insurance, customs, vat, broker, handling, inland },
      items: [
        { name: `פריט ${i * 3 + 1}`, quantity: Math.floor(Math.random() * 500) + 50, unitPrice: Math.floor(Math.random() * 200) + 20, landedCost: 0 },
        { name: `פריט ${i * 3 + 2}`, quantity: Math.floor(Math.random() * 300) + 30, unitPrice: Math.floor(Math.random() * 150) + 15, landedCost: 0 },
        { name: `פריט ${i * 3 + 3}`, quantity: Math.floor(Math.random() * 200) + 20, unitPrice: Math.floor(Math.random() * 100) + 10, landedCost: 0 },
      ].map((item) => ({ ...item, landedCost: Math.round(item.unitPrice * 1.32) })),
      timeline: [
        { date: new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10), event: "הזמנה נשלחה", completed: true },
        { date: new Date(Date.now() - 22 * 86400000).toISOString().slice(0, 10), event: "אישור ספק", completed: true },
        { date: new Date(Date.now() - 15 * 86400000).toISOString().slice(0, 10), event: "יצא מנמל מוצא", completed: i >= 1 },
        { date: new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10), event: "הגיע לנמל חיפה", completed: i >= 2 },
        { date: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10), event: "שחרור מכס", completed: i >= 4 },
        { date: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10), event: "הגיע למחסן", completed: i >= 5 },
      ],
    };
  });
}

function generateCurrencyRates(): CurrencyRate[] {
  return [
    { currency: "USD", rate: 3.62, change: -0.8, impact: -12400 },
    { currency: "EUR", rate: 3.95, change: 1.2, impact: 8200 },
    { currency: "CNY", rate: 0.50, change: -0.3, impact: -3100 },
    { currency: "JPY", rate: 0.024, change: -1.5, impact: -1800 },
    { currency: "GBP", rate: 4.58, change: 0.5, impact: 2400 },
    { currency: "TRY", rate: 0.10, change: -2.1, impact: -900 },
  ];
}

/* ── Component ─────────────────────────────────────────── */
export default function ImportManagementPage() {
  const [activeTab, setActiveTab] = useState("shipments");
  const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newShipment, setNewShipment] = useState({ supplier: "", country: "", container: "40HC" });
  const queryClient = useQueryClient();

  const { data: shipmentsRaw, isLoading: shipmentsLoading } = useQuery({
    queryKey: ["import-shipments"],
    queryFn: async () => {
      try {
        const res = await authFetch(`${API}/import-shipments`);
        if (!res.ok) throw new Error();
        return await res.json();
      } catch {
        return null;
      }
    },
  });

  const shipments: Shipment[] = useMemo(() => shipmentsRaw ?? generateShipments(), [shipmentsRaw]);
  const currencies = useMemo(() => generateCurrencyRates(), []);

  const createMutation = useMutation({
    mutationFn: async (data: typeof newShipment) => {
      await authFetch(`${API}/import-shipments`, {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["import-shipments"] });
      setShowCreate(false);
    },
  });

  /* KPI calcs */
  const inTransit = shipments.filter((s) => s.status === "in_transit").length;
  const atPort = shipments.filter((s) => ["at_port", "customs"].includes(s.status)).length;
  const cleared = shipments.filter((s) => ["cleared", "delivered"].includes(s.status)).length;
  const totalValue = shipments.reduce((s, x) => s + x.totalValue, 0);

  const costBreakdownData = selectedShipment
    ? [
        { name: "סחורה", value: selectedShipment.costs.goods, fill: "#3b82f6" },
        { name: "הובלה ימית", value: selectedShipment.costs.freight, fill: "#22c55e" },
        { name: "ביטוח", value: selectedShipment.costs.insurance, fill: "#f59e0b" },
        { name: "מכס", value: selectedShipment.costs.customs, fill: "#ef4444" },
        { name: 'מע"מ', value: selectedShipment.costs.vat, fill: "#8b5cf6" },
        { name: "עמיל מכס", value: selectedShipment.costs.broker, fill: "#ec4899" },
        { name: "טיפול נמל", value: selectedShipment.costs.handling, fill: "#06b6d4" },
        { name: "הובלה פנימית", value: selectedShipment.costs.inland, fill: "#84cc16" },
      ]
    : [];

  const currencyTrendData = [
    { month: "ינו", USD: 3.58, EUR: 3.88, CNY: 0.49 },
    { month: "פבר", USD: 3.61, EUR: 3.91, CNY: 0.50 },
    { month: "מרץ", USD: 3.62, EUR: 3.95, CNY: 0.50 },
  ];

  if (shipmentsLoading) return <SkeletonPage />;

  return (
    <div className="min-h-screen bg-background p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">ניהול יבוא ומכס</h1>
          <p className="text-muted-foreground mt-1">מעקב משלוחים, עלויות נחיתה והשפעת מט"ח</p>
        </div>
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 ml-2" /> משלוח חדש</Button>
          </DialogTrigger>
          <DialogContent dir="rtl">
            <DialogHeader><DialogTitle>יצירת משלוח חדש</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">ספק</label>
                <Input value={newShipment.supplier} onChange={(e) => setNewShipment((p) => ({ ...p, supplier: e.target.value }))} placeholder="שם הספק" />
              </div>
              <div>
                <label className="text-sm font-medium">מדינת מוצא</label>
                <Input value={newShipment.country} onChange={(e) => setNewShipment((p) => ({ ...p, country: e.target.value }))} placeholder="מדינה" />
              </div>
              <div>
                <label className="text-sm font-medium">סוג מטען</label>
                <Select value={newShipment.container} onValueChange={(v) => setNewShipment((p) => ({ ...p, container: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="40HC">40HC</SelectItem>
                    <SelectItem value="40GP">40GP</SelectItem>
                    <SelectItem value="20GP">20GP</SelectItem>
                    <SelectItem value="20HC">20HC</SelectItem>
                    <SelectItem value="LCL">LCL</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreate(false)}>ביטול</Button>
              <Button onClick={() => createMutation.mutate(newShipment)} disabled={createMutation.isPending}>
                {createMutation.isPending ? "שומר..." : "צור משלוח"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-blue-500/10"><Ship className="h-6 w-6 text-blue-500" /></div>
            <div>
              <p className="text-sm text-muted-foreground">במשלוח</p>
              <p className="text-2xl font-bold text-blue-500">{inTransit}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-amber-500/10"><Anchor className="h-6 w-6 text-amber-500" /></div>
            <div>
              <p className="text-sm text-muted-foreground">בנמל / מכס</p>
              <p className="text-2xl font-bold text-amber-500">{atPort}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-green-500/10"><CheckCircle2 className="h-6 w-6 text-green-500" /></div>
            <div>
              <p className="text-sm text-muted-foreground">שוחרר / נמסר</p>
              <p className="text-2xl font-bold text-green-500">{cleared}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-purple-500/10"><DollarSign className="h-6 w-6 text-purple-500" /></div>
            <div>
              <p className="text-sm text-muted-foreground">שווי כולל</p>
              <p className="text-2xl font-bold">{fmt(totalValue)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="shipments">משלוחים</TabsTrigger>
          <TabsTrigger value="landed">עלות נחיתה</TabsTrigger>
          <TabsTrigger value="currency">השפעת מט"ח</TabsTrigger>
        </TabsList>

        {/* ── Shipments Tab ──────────────────────────── */}
        <TabsContent value="shipments" className="space-y-4">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">מספר משלוח</TableHead>
                    <TableHead className="text-right">ספק</TableHead>
                    <TableHead className="text-right">מדינה</TableHead>
                    <TableHead className="text-center">מטען</TableHead>
                    <TableHead className="text-center">סטטוס</TableHead>
                    <TableHead className="text-center">ETA</TableHead>
                    <TableHead className="text-center">שווי</TableHead>
                    <TableHead className="text-center">פרטים</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shipments.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-mono font-medium">{s.shipmentNumber}</TableCell>
                      <TableCell>{s.supplier}</TableCell>
                      <TableCell>{s.country}</TableCell>
                      <TableCell className="text-center"><Badge variant="outline">{s.container}</Badge></TableCell>
                      <TableCell className="text-center">
                        <Badge className={statusColors[s.status]}>
                          {statusLabels[s.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center font-mono">{s.eta}</TableCell>
                      <TableCell className="text-center font-mono">{fmt(s.totalValue)}</TableCell>
                      <TableCell className="text-center">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button variant="outline" size="sm" onClick={() => setSelectedShipment(s)}>
                              פרטים
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto" dir="rtl">
                            <DialogHeader>
                              <DialogTitle>משלוח {s.shipmentNumber}</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-6">
                              {/* Cost Breakdown */}
                              <div>
                                <h3 className="font-semibold mb-3">פירוט עלויות</h3>
                                <div className="h-64">
                                  <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={costBreakdownData} layout="vertical">
                                      <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                                      <XAxis type="number" tickFormatter={(v) => fmt(v)} />
                                      <YAxis type="category" dataKey="name" width={90} />
                                      <Tooltip formatter={(v: number) => fmt(v)} />
                                      <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                                        {costBreakdownData.map((d, i) => (
                                          <rect key={i} fill={d.fill} />
                                        ))}
                                      </Bar>
                                    </BarChart>
                                  </ResponsiveContainer>
                                </div>
                                <div className="grid grid-cols-2 gap-2 mt-3">
                                  {costBreakdownData.map((c) => (
                                    <div key={c.name} className="flex justify-between text-sm bg-muted/50 p-2 rounded">
                                      <span>{c.name}</span>
                                      <span className="font-mono">{fmt(c.value)}</span>
                                    </div>
                                  ))}
                                  <div className="col-span-2 flex justify-between font-bold text-sm bg-primary/10 p-2 rounded border border-primary/20">
                                    <span>סה"כ עלות נחיתה</span>
                                    <span className="font-mono">{fmt(s.totalValue)}</span>
                                  </div>
                                </div>
                              </div>

                              {/* Timeline */}
                              <div>
                                <h3 className="font-semibold mb-3">ציר זמן משלוח</h3>
                                <div className="relative pr-6">
                                  {s.timeline.map((t, i) => (
                                    <div key={i} className="flex items-start gap-4 pb-4 last:pb-0">
                                      <div className="relative flex flex-col items-center">
                                        <div className={`w-4 h-4 rounded-full border-2 ${t.completed ? "bg-green-500 border-green-500" : "bg-background border-muted-foreground"}`} />
                                        {i < s.timeline.length - 1 && (
                                          <div className={`w-0.5 h-8 ${t.completed ? "bg-green-500" : "bg-muted"}`} />
                                        )}
                                      </div>
                                      <div>
                                        <p className={`text-sm font-medium ${t.completed ? "text-foreground" : "text-muted-foreground"}`}>
                                          {t.event}
                                        </p>
                                        <p className="text-xs text-muted-foreground">{t.date}</p>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              {/* Items */}
                              <div>
                                <h3 className="font-semibold mb-3">פריטים</h3>
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead className="text-right">פריט</TableHead>
                                      <TableHead className="text-center">כמות</TableHead>
                                      <TableHead className="text-center">מחיר יחידה</TableHead>
                                      <TableHead className="text-center">עלות נחיתה</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {s.items.map((item, idx) => (
                                      <TableRow key={idx}>
                                        <TableCell>{item.name}</TableCell>
                                        <TableCell className="text-center">{item.quantity}</TableCell>
                                        <TableCell className="text-center font-mono">{fmt(item.unitPrice)}</TableCell>
                                        <TableCell className="text-center font-mono font-bold">{fmt(item.landedCost)}</TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </div>
                            </div>
                          </DialogContent>
                        </Dialog>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Landed Cost Tab ────────────────────────── */}
        <TabsContent value="landed" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Calculator className="h-5 w-5" /> מחשבון עלות נחיתה</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h3 className="font-semibold">הזן נתוני פריט</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-sm text-muted-foreground">מחיר FOB ($)</label>
                      <Input type="number" placeholder="0" defaultValue="1000" />
                    </div>
                    <div>
                      <label className="text-sm text-muted-foreground">כמות</label>
                      <Input type="number" placeholder="0" defaultValue="100" />
                    </div>
                    <div>
                      <label className="text-sm text-muted-foreground">הובלה (%)</label>
                      <Input type="number" placeholder="8" defaultValue="8" />
                    </div>
                    <div>
                      <label className="text-sm text-muted-foreground">ביטוח (%)</label>
                      <Input type="number" placeholder="1.5" defaultValue="1.5" />
                    </div>
                    <div>
                      <label className="text-sm text-muted-foreground">מכס (%)</label>
                      <Input type="number" placeholder="6" defaultValue="6" />
                    </div>
                    <div>
                      <label className="text-sm text-muted-foreground">מע"מ (%)</label>
                      <Input type="number" placeholder="17" defaultValue="17" />
                    </div>
                  </div>
                  <Button className="w-full"><Calculator className="h-4 w-4 ml-2" /> חשב עלות נחיתה</Button>
                </div>
                <div className="bg-muted/30 rounded-xl p-6 space-y-3">
                  <h3 className="font-semibold text-lg">תוצאות</h3>
                  <div className="space-y-2">
                    {[
                      { label: "מחיר FOB", value: "$100,000" },
                      { label: "הובלה (8%)", value: "$8,000" },
                      { label: "ביטוח (1.5%)", value: "$1,500" },
                      { label: "CIF", value: "$109,500", bold: true },
                      { label: "מכס (6%)", value: "$6,570" },
                      { label: 'מע"מ (17%)', value: "$19,732" },
                      { label: "עמיל + טיפול", value: "$1,575" },
                    ].map((r) => (
                      <div key={r.label} className={`flex justify-between text-sm ${r.bold ? "font-bold border-t border-b py-2" : ""}`}>
                        <span>{r.label}</span>
                        <span className="font-mono">{r.value}</span>
                      </div>
                    ))}
                    <div className="flex justify-between text-lg font-bold border-t-2 pt-3 text-primary">
                      <span>עלות נחיתה כוללת</span>
                      <span className="font-mono">$138,538</span>
                    </div>
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>עלות ליחידה</span>
                      <span className="font-mono">$1,385.38</span>
                    </div>
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>מקדם נחיתה</span>
                      <span className="font-mono font-bold">x1.374</span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Currency Impact Tab ────────────────────── */}
        <TabsContent value="currency" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>שערי מטבע והשפעה</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">מטבע</TableHead>
                      <TableHead className="text-center">שער</TableHead>
                      <TableHead className="text-center">שינוי</TableHead>
                      <TableHead className="text-center">השפעה</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {currencies.map((c) => (
                      <TableRow key={c.currency}>
                        <TableCell className="font-bold">{c.currency}</TableCell>
                        <TableCell className="text-center font-mono">{c.rate.toFixed(3)}</TableCell>
                        <TableCell className="text-center">
                          <span className={`flex items-center justify-center gap-1 ${c.change >= 0 ? "text-green-500" : "text-red-500"}`}>
                            {c.change >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                            {c.change > 0 ? "+" : ""}{c.change}%
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className={`font-mono ${c.impact >= 0 ? "text-green-500" : "text-red-500"}`}>
                            {c.impact >= 0 ? "+" : ""}{fmt(c.impact)}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>מגמת שערים (3 חודשים)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={currencyTrendData}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                      <XAxis dataKey="month" />
                      <YAxis domain={["auto", "auto"]} />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="USD" stroke="#3b82f6" strokeWidth={2} name="דולר" />
                      <Line type="monotone" dataKey="EUR" stroke="#22c55e" strokeWidth={2} name="אירו" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="p-5">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5" />
                <div>
                  <h4 className="font-semibold">התראת מט"ח</h4>
                  <p className="text-sm text-muted-foreground mt-1">
                    היחלשות הדולר ב-0.8% בחודש האחרון מוזילה את עלויות היבוא מארה"ב ב-{fmt(12400)} לחודש.
                    מומלץ לשקול הגדלת הזמנות מספקים דולריים בתקופה זו.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
