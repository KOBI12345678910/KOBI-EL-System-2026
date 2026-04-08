import { useState } from "react";
import {
  MapPin, Truck, Clock, AlertTriangle, CheckCircle2, Ship,
  Plane, Package, Globe, ArrowLeftRight, Timer, BarChart3
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

const statusMap: Record<string, { label: string; color: string; icon: any }> = {
  dispatched:  { label: "נשלח",     color: "bg-blue-500/20 text-blue-400 border-blue-500/30",    icon: Package },
  in_transit:  { label: "במעבר",    color: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",    icon: Truck },
  customs:     { label: "מכס",      color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30", icon: Globe },
  arrived:     { label: "הגיע",     color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30", icon: CheckCircle2 },
  delayed:     { label: "מעוכב",    color: "bg-red-500/20 text-red-400 border-red-500/30",       icon: AlertTriangle },
};

const shipments = [
  { id: "SHP-401", supplier: "אלומטל טורקיה", origin: "טורקיה", items: "פרופילי אלומיניום 6063", dispatch: "2026-03-28", eta: "2026-04-12", carrier: "צים שילוח", status: "in_transit" },
  { id: "SHP-402", supplier: "גואנגז'ו מטלס", origin: "סין", items: "לוחות זכוכית מחוסמת", dispatch: "2026-03-15", eta: "2026-04-08", carrier: "צים שילוח", status: "arrived" },
  { id: "SHP-403", supplier: "שטאל-ורק גרמניה", origin: "גרמניה", items: "פלדת נירוסטה 304", dispatch: "2026-04-01", eta: "2026-04-10", carrier: "UPS ישראל", status: "customs" },
  { id: "SHP-404", supplier: "מטל-פרו ישראל", origin: "ישראל", items: "ברזל בניין 12 מ\"מ", dispatch: "2026-04-05", eta: "2026-04-07", carrier: "דן אקספרס", status: "dispatched" },
  { id: "SHP-405", supplier: "ויטרו איטליה", origin: "איטליה", items: "זכוכית שטוחה 10 מ\"מ", dispatch: "2026-03-20", eta: "2026-04-05", carrier: "צים שילוח", status: "delayed" },
  { id: "SHP-406", supplier: "אנודייז בע\"מ", origin: "ישראל", items: "אנודייז אלומיניום", dispatch: "2026-04-06", eta: "2026-04-08", carrier: "דן אקספרס", status: "in_transit" },
  { id: "SHP-407", supplier: "בייג'ינג סטיל", origin: "סין", items: "צינורות פלדה מגולוונים", dispatch: "2026-03-10", eta: "2026-04-08", carrier: "צים שילוח", status: "arrived" },
  { id: "SHP-408", supplier: "אלופרופיל טורקיה", origin: "טורקיה", items: "פרופיל תרמי אלומיניום", dispatch: "2026-04-02", eta: "2026-04-14", carrier: "UPS ישראל", status: "in_transit" },
];

const customsItems = [
  { id: "SHP-403", supplier: "שטאל-ורק גרמניה", items: "פלדת נירוסטה 304", declared: "₪87,400", duty: "12%", status: "בבדיקה", expected: "2026-04-10", broker: "מילגם מכס" },
  { id: "SHP-411", supplier: "אלומטל טורקיה", items: "פרופילי אלומיניום T5", declared: "₪124,000", duty: "8%", status: "ממתין לאישור", expected: "2026-04-11", broker: "שגב סחר בינ\"ל" },
  { id: "SHP-412", supplier: "גואנגז'ו מטלס", items: "אביזרי אלומיניום", declared: "₪45,200", duty: "14%", status: "אושר - ממתין לשחרור", expected: "2026-04-09", broker: "מילגם מכס" },
  { id: "SHP-413", supplier: "ויטרו איטליה", items: "זכוכית למינציה", declared: "₪68,900", duty: "6%", status: "בבדיקה", expected: "2026-04-13", broker: "שגב סחר בינ\"ל" },
  { id: "SHP-414", supplier: "בייג'ינג סטיל", items: "פלדת קונסטרוקציה", declared: "₪156,300", duty: "10%", status: "מסמכים חסרים", expected: "2026-04-15", broker: "מילגם מכס" },
  { id: "SHP-415", supplier: "שטאל-ורק גרמניה", items: "ברגים תעשייתיים", declared: "₪22,100", duty: "5%", status: "אושר - ממתין לשחרור", expected: "2026-04-09", broker: "שגב סחר בינ\"ל" },
];

const history = [
  { id: "SHP-380", supplier: "אלומטל טורקיה", origin: "טורקיה", items: "פרופילי אלומיניום", arrived: "2026-03-25", days: 14, carrier: "צים שילוח", onTime: true },
  { id: "SHP-381", supplier: "מטל-פרו ישראל", origin: "ישראל", items: "ברזל בניין", arrived: "2026-03-22", days: 2, carrier: "דן אקספרס", onTime: true },
  { id: "SHP-382", supplier: "גואנגז'ו מטלס", origin: "סין", items: "זכוכית מחוסמת", arrived: "2026-03-18", days: 28, carrier: "צים שילוח", onTime: false },
  { id: "SHP-383", supplier: "שטאל-ורק גרמניה", origin: "גרמניה", items: "פלדת נירוסטה", arrived: "2026-03-15", days: 10, carrier: "UPS ישראל", onTime: true },
  { id: "SHP-384", supplier: "ויטרו איטליה", origin: "איטליה", items: "זכוכית שטוחה", arrived: "2026-03-10", days: 16, carrier: "צים שילוח", onTime: true },
  { id: "SHP-385", supplier: "אנודייז בע\"מ", origin: "ישראל", items: "אנודייז אלומיניום", arrived: "2026-03-08", days: 1, carrier: "דן אקספרס", onTime: true },
  { id: "SHP-386", supplier: "בייג'ינג סטיל", origin: "סין", items: "צינורות פלדה", arrived: "2026-03-05", days: 30, carrier: "צים שילוח", onTime: false },
];

const carriers = [
  { name: "צים שילוח", shipments: 42, onTime: 88, avgDays: 18, rating: 4.2, type: "ימי" },
  { name: "דן אקספרס", shipments: 31, onTime: 96, avgDays: 1.5, rating: 4.7, type: "יבשתי" },
  { name: "UPS ישראל", shipments: 18, onTime: 92, avgDays: 8, rating: 4.4, type: "אווירי" },
  { name: "DHL אקספרס", shipments: 12, onTime: 94, avgDays: 5, rating: 4.5, type: "אווירי" },
  { name: "FedEx ישראל", shipments: 8, onTime: 90, avgDays: 6, rating: 4.1, type: "אווירי" },
  { name: "קשרי תעופה", shipments: 6, onTime: 83, avgDays: 12, rating: 3.8, type: "אווירי/ימי" },
];

const customsStatusColor = (s: string) => {
  if (s.includes("אושר")) return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
  if (s.includes("חסרים")) return "bg-red-500/20 text-red-400 border-red-500/30";
  return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
};

const kpis = [
  { label: "משלוחים במעבר", value: "5", icon: Truck, color: "text-cyan-400" },
  { label: "הגיעו היום", value: "2", icon: CheckCircle2, color: "text-emerald-400" },
  { label: "מעוכבים", value: "1", icon: AlertTriangle, color: "text-red-400" },
  { label: "אחוז בזמן", value: "91%", icon: Timer, color: "text-blue-400" },
  { label: "ממוצע ימי מעבר", value: "11.2", icon: Clock, color: "text-purple-400" },
  { label: "משלוחים בינ\"ל", value: "6", icon: Globe, color: "text-orange-400" },
];

export default function LogisticsTracking() {
  const [tab, setTab] = useState("active");

  return (
    <div dir="rtl" className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-blue-500/20">
          <MapPin className="w-6 h-6 text-blue-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">מעקב לוגיסטי ושילוח</h1>
          <p className="text-sm text-muted-foreground">טכנו-כל עוזי — מעקב משלוחים, מכס וביצועי ספקי שילוח</p>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpis.map((k) => (
          <Card key={k.label} className="bg-card border-border">
            <CardContent className="p-4 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{k.label}</span>
                <k.icon className={`w-4 h-4 ${k.color}`} />
              </div>
              <span className="text-2xl font-bold text-foreground">{k.value}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-muted/50">
          <TabsTrigger value="active">משלוחים פעילים</TabsTrigger>
          <TabsTrigger value="customs">מכס</TabsTrigger>
          <TabsTrigger value="history">היסטוריה</TabsTrigger>
          <TabsTrigger value="performance">ביצועי שילוח</TabsTrigger>
        </TabsList>

        {/* Active Shipments */}
        <TabsContent value="active">
          <Card className="bg-card border-border">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">מס׳ מעקב</TableHead>
                    <TableHead className="text-right">ספק</TableHead>
                    <TableHead className="text-right">מוצא</TableHead>
                    <TableHead className="text-right">פריטים</TableHead>
                    <TableHead className="text-right">תאריך שליחה</TableHead>
                    <TableHead className="text-right">ETA</TableHead>
                    <TableHead className="text-right">מוביל</TableHead>
                    <TableHead className="text-right">סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shipments.map((s) => {
                    const st = statusMap[s.status];
                    const Icon = st.icon;
                    return (
                      <TableRow key={s.id}>
                        <TableCell className="font-mono font-medium text-blue-400">{s.id}</TableCell>
                        <TableCell>{s.supplier}</TableCell>
                        <TableCell>{s.origin}</TableCell>
                        <TableCell className="max-w-[180px] truncate">{s.items}</TableCell>
                        <TableCell className="text-muted-foreground">{s.dispatch}</TableCell>
                        <TableCell className="text-muted-foreground">{s.eta}</TableCell>
                        <TableCell>{s.carrier}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={st.color}>
                            <Icon className="w-3 h-3 ml-1" />
                            {st.label}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Customs */}
        <TabsContent value="customs">
          <Card className="bg-card border-border">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">מס׳ משלוח</TableHead>
                    <TableHead className="text-right">ספק</TableHead>
                    <TableHead className="text-right">פריטים</TableHead>
                    <TableHead className="text-right">ערך מוצהר</TableHead>
                    <TableHead className="text-right">מכס</TableHead>
                    <TableHead className="text-right">סטטוס שחרור</TableHead>
                    <TableHead className="text-right">צפי שחרור</TableHead>
                    <TableHead className="text-right">עמיל מכס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customsItems.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono font-medium text-blue-400">{c.id}</TableCell>
                      <TableCell>{c.supplier}</TableCell>
                      <TableCell className="max-w-[160px] truncate">{c.items}</TableCell>
                      <TableCell className="font-medium">{c.declared}</TableCell>
                      <TableCell>{c.duty}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={customsStatusColor(c.status)}>{c.status}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{c.expected}</TableCell>
                      <TableCell>{c.broker}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* History */}
        <TabsContent value="history">
          <Card className="bg-card border-border">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">מס׳ משלוח</TableHead>
                    <TableHead className="text-right">ספק</TableHead>
                    <TableHead className="text-right">מוצא</TableHead>
                    <TableHead className="text-right">פריטים</TableHead>
                    <TableHead className="text-right">תאריך הגעה</TableHead>
                    <TableHead className="text-right">ימי מעבר</TableHead>
                    <TableHead className="text-right">מוביל</TableHead>
                    <TableHead className="text-right">בזמן</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((h) => (
                    <TableRow key={h.id}>
                      <TableCell className="font-mono font-medium text-blue-400">{h.id}</TableCell>
                      <TableCell>{h.supplier}</TableCell>
                      <TableCell>{h.origin}</TableCell>
                      <TableCell className="max-w-[160px] truncate">{h.items}</TableCell>
                      <TableCell className="text-muted-foreground">{h.arrived}</TableCell>
                      <TableCell>{h.days}</TableCell>
                      <TableCell>{h.carrier}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={h.onTime
                          ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                          : "bg-red-500/20 text-red-400 border-red-500/30"
                        }>
                          {h.onTime ? "בזמן" : "באיחור"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Carrier Performance */}
        <TabsContent value="performance">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {carriers.map((c) => (
              <Card key={c.name} className="bg-card border-border">
                <CardContent className="p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {c.type === "ימי" ? <Ship className="w-5 h-5 text-blue-400" /> :
                       c.type === "יבשתי" ? <Truck className="w-5 h-5 text-green-400" /> :
                       <Plane className="w-5 h-5 text-purple-400" />}
                      <span className="font-semibold text-foreground">{c.name}</span>
                    </div>
                    <Badge variant="outline" className="text-xs">{c.type}</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-muted-foreground">משלוחים</span>
                      <p className="font-bold text-foreground">{c.shipments}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">ממוצע ימים</span>
                      <p className="font-bold text-foreground">{c.avgDays}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">דירוג</span>
                      <p className="font-bold text-yellow-400">{c.rating} / 5</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">בזמן</span>
                      <p className="font-bold text-foreground">{c.onTime}%</p>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted-foreground">אחוז הגעה בזמן</span>
                      <span className="text-foreground font-medium">{c.onTime}%</span>
                    </div>
                    <Progress value={c.onTime} className="h-2" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
