import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Package, ClipboardList, Truck, Clock, ShieldAlert, Timer, Search, Plus, Eye,
  Box, Weight, Ruler, MapPin, Calendar, Phone, CheckCircle2, AlertTriangle, ArrowUpDown
} from "lucide-react";

const statusMap: Record<string, { label: string; color: string }> = {
  draft: { label: "טיוטה", color: "bg-slate-500/20 text-slate-300 border-slate-500/30" },
  packing: { label: "באריזה", color: "bg-blue-500/20 text-blue-300 border-blue-500/30" },
  ready: { label: "מוכנה למשלוח", color: "bg-green-500/20 text-green-300 border-green-500/30" },
  shipped: { label: "נשלחה", color: "bg-purple-500/20 text-purple-300 border-purple-500/30" },
};

const packingLists = [
  { id: "PL-4801", orderRef: "ORD-1190", items: 24, weight: 1480, dims: "240x120x90", vehicle: "משאית 12 טון", dest: "תל אביב - מגדלי הים", status: "shipped" },
  { id: "PL-4802", orderRef: "ORD-1192", items: 18, weight: 920, dims: "200x100x80", vehicle: "משאית 8 טון", dest: "חיפה - מרכז הכרמל", status: "ready" },
  { id: "PL-4803", orderRef: "ORD-1195", items: 36, weight: 2150, dims: "300x140x110", vehicle: "טריילר", dest: "באר שבע - פארק הייטק", status: "packing" },
  { id: "PL-4804", orderRef: "ORD-1198", items: 12, weight: 680, dims: "180x90x70", vehicle: "משאית 5 טון", dest: "נתניה - מגדל השרון", status: "draft" },
  { id: "PL-4805", orderRef: "ORD-1200", items: 42, weight: 2800, dims: "320x160x120", vehicle: "טריילר", dest: "ירושלים - מתחם ממילא", status: "ready" },
  { id: "PL-4806", orderRef: "ORD-1203", items: 8, weight: 450, dims: "150x80x60", vehicle: "משאית 5 טון", dest: "הרצליה פיתוח", status: "shipped" },
  { id: "PL-4807", orderRef: "ORD-1205", items: 30, weight: 1750, dims: "260x130x100", vehicle: "משאית 12 טון", dest: "ראשון לציון - קניון הזהב", status: "packing" },
  { id: "PL-4808", orderRef: "ORD-1208", items: 15, weight: 890, dims: "200x110x85", vehicle: "משאית 8 טון", dest: "אשדוד - מרינה", status: "draft" },
  { id: "PL-4809", orderRef: "ORD-1210", items: 22, weight: 1320, dims: "220x120x95", vehicle: "משאית 12 טון", dest: "פתח תקווה - מרכז עסקים", status: "ready" },
  { id: "PL-4810", orderRef: "ORD-1212", items: 28, weight: 1600, dims: "250x130x100", vehicle: "טריילר", dest: "רמת גן - בורסה", status: "packing" },
];

const loadingVehicles = [
  { id: "V-01", type: "טריילר", capacity: 3200, loaded: 2800, axles: 3, zones: [
    { zone: "קדמי", weight: 950, pct: 34, items: "חלונות גדולים PL-4805" },
    { zone: "אמצעי", weight: 1100, pct: 39, items: "דלתות + מסגרות PL-4805" },
    { zone: "אחורי", weight: 750, pct: 27, items: "אביזרים + זכוכית PL-4805" },
  ]},
  { id: "V-02", type: "משאית 12 טון", capacity: 1800, loaded: 1480, axles: 2, zones: [
    { zone: "קדמי", weight: 620, pct: 42, items: "פרופילים PL-4801" },
    { zone: "אמצעי", weight: 510, pct: 34, items: "זכוכית מחוסמת PL-4801" },
    { zone: "אחורי", weight: 350, pct: 24, items: "אביזרים PL-4801" },
  ]},
];

const protectionMaterials = [
  { name: "קצף EPE", stock: 240, unit: "גליל", usage: 18, low: false, desc: "הגנה על פרופילים ומסגרות" },
  { name: "ניילון נצמד (שרינק)", stock: 85, unit: "גליל", usage: 12, low: false, desc: "עטיפה חיצונית למשטחים" },
  { name: "מגני פינות L", stock: 520, unit: "יח'", usage: 65, low: false, desc: "הגנת פינות חלונות ודלתות" },
  { name: "מפרידי זכוכית", stock: 180, unit: "יח'", usage: 30, low: true, desc: "הפרדה בין לוחות זכוכית" },
  { name: "מעמדי A (זכוכית)", stock: 32, unit: "יח'", usage: 4, low: false, desc: "סטנדים לזכוכית בהובלה" },
  { name: "מעמדי L (חלונות)", stock: 28, unit: "יח'", usage: 5, low: false, desc: "מעמדים מוטים לחלונות" },
  { name: "רצועות קשירה", stock: 150, unit: "יח'", usage: 22, low: false, desc: "קשירה לרצפת המשאית" },
  { name: "כריות אוויר", stock: 45, unit: "שק", usage: 8, low: true, desc: "מילוי חללים במשטח" },
];

const shippingSchedule = [
  { time: "07:00", listId: "PL-4805", carrier: "שילוח ברק", driver: "מוחמד חסן", dest: "ירושלים", status: "בדרך", eta: "09:30" },
  { time: "08:30", listId: "PL-4802", carrier: "הובלות הצפון", driver: "יוסי לוי", dest: "חיפה", status: "ממתין לטעינה", eta: "12:00" },
  { time: "09:00", listId: "PL-4809", carrier: "שילוח ברק", driver: "אבי כהן", dest: "פתח תקווה", status: "ממתין לטעינה", eta: "10:30" },
  { time: "10:30", listId: "PL-4801", carrier: "לוגיסטיק פרו", driver: "דניאל שמעוני", dest: "תל אביב", status: "נמסר", eta: "---" },
  { time: "13:00", listId: "PL-4807", carrier: "הובלות הדרום", driver: "חיים מזרחי", dest: "ראשון לציון", status: "מתוכנן", eta: "14:30" },
  { time: "14:30", listId: "PL-4810", carrier: "לוגיסטיק פרו", driver: "ערן גולן", dest: "רמת גן", status: "מתוכנן", eta: "16:00" },
];

const schedStatusColor: Record<string, string> = {
  "בדרך": "bg-blue-500/20 text-blue-300", "ממתין לטעינה": "bg-yellow-500/20 text-yellow-300",
  "נמסר": "bg-green-500/20 text-green-300", "מתוכנן": "bg-slate-500/20 text-slate-300",
};

const kpis = [
  { label: "רשימות פעילות", value: "8", icon: ClipboardList, color: "text-blue-400", bg: "bg-blue-500/10" },
  { label: "יחידות נארזו היום", value: "164", icon: Package, color: "text-emerald-400", bg: "bg-emerald-500/10" },
  { label: "מוכנים למשלוח", value: "3", icon: Truck, color: "text-green-400", bg: "bg-green-500/10" },
  { label: "זמן אריזה ממוצע", value: "42 דק'", icon: Clock, color: "text-amber-400", bg: "bg-amber-500/10" },
  { label: "אחוז נזק", value: "0.3%", icon: ShieldAlert, color: "text-red-400", bg: "bg-red-500/10" },
  { label: "ממתינים לאיסוף", value: "4", icon: Timer, color: "text-purple-400", bg: "bg-purple-500/10" },
];

export default function FabPackingLists() {
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("lists");
  const filteredLists = packingLists.filter(l => l.id.includes(search) || l.orderRef.includes(search) || l.dest.includes(search));

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">רשימות אריזה ומשלוח</h1>
          <p className="text-sm text-muted-foreground mt-1">ניהול אריזה, הגנה, טעינה ותזמון משלוחים</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm"><ArrowUpDown className="w-4 h-4 ml-1" />יצוא</Button>
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700"><Plus className="w-4 h-4 ml-1" />רשימה חדשה</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpis.map((k) => (
          <Card key={k.label} className="bg-[#0d1117] border-white/10">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${k.bg}`}><k.icon className={`w-5 h-5 ${k.color}`} /></div>
                <div>
                  <div className="text-2xl font-bold text-white">{k.value}</div>
                  <div className="text-xs text-muted-foreground">{k.label}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-[#161b22] border border-white/10">
          <TabsTrigger value="lists">רשימות אריזה</TabsTrigger>
          <TabsTrigger value="loading">תכנון טעינה</TabsTrigger>
          <TabsTrigger value="protection">חומרי הגנה</TabsTrigger>
          <TabsTrigger value="schedule">לוח משלוחים</TabsTrigger>
        </TabsList>

        {/* Tab 1: Packing Lists */}
        <TabsContent value="lists" className="space-y-4">
          <Card className="bg-[#0d1117] border-white/10">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg text-white">רשימות אריזה</CardTitle>
                <div className="relative w-64">
                  <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="חיפוש רשימה, הזמנה, יעד..." value={search} onChange={(e) => setSearch(e.target.value)} className="pr-9 bg-[#161b22] border-white/10" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10">
                      {["מס' רשימה","הזמנה","פריטים","משקל (ק\"ג)","מידות (ס\"מ)","רכב","יעד","סטטוס","פעולות"].map(h => (
                        <th key={h} className="p-3 text-muted-foreground font-medium text-right">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLists.map((row) => (
                      <tr key={row.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                        <td className="p-3 text-white font-mono font-semibold">{row.id}</td>
                        <td className="p-3 text-blue-400 font-mono">{row.orderRef}</td>
                        <td className="p-3 text-center text-white">{row.items}</td>
                        <td className="p-3 text-center text-white">{row.weight.toLocaleString()}</td>
                        <td className="p-3 text-center text-muted-foreground font-mono text-xs">{row.dims}</td>
                        <td className="p-3 text-white">{row.vehicle}</td>
                        <td className="p-3 text-white text-xs">{row.dest}</td>
                        <td className="p-3 text-center">
                          <Badge className={`${statusMap[row.status].color} border`}>{statusMap[row.status].label}</Badge>
                        </td>
                        <td className="p-3 text-center"><Button variant="ghost" size="sm"><Eye className="w-4 h-4" /></Button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Loading Plan */}
        <TabsContent value="loading" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {loadingVehicles.map((v) => (
              <Card key={v.id} className="bg-[#0d1117] border-white/10">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base text-white flex items-center gap-2">
                      <Truck className="w-5 h-5 text-blue-400" />{v.type} ({v.id})
                    </CardTitle>
                    <Badge className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">{v.axles} סרנים</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">ניצול קיבולת</span>
                    <span className="text-white font-bold">{v.loaded.toLocaleString()} / {v.capacity.toLocaleString()} ק"ג</span>
                  </div>
                  <Progress value={(v.loaded / v.capacity) * 100} className="h-2" />
                  <div className="space-y-2">
                    <div className="text-xs font-medium text-muted-foreground mb-1">פיזור משקל לפי אזורים</div>
                    {v.zones.map((z) => (
                      <div key={z.zone} className="bg-[#161b22] rounded-lg p-3 border border-white/5">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm text-white font-medium">{z.zone}</span>
                          <span className="text-sm text-white font-bold">{z.weight} ק"ג ({z.pct}%)</span>
                        </div>
                        <Progress value={z.pct} className="h-1.5 mb-1" />
                        <span className="text-xs text-muted-foreground">{z.items}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-green-500/10 border border-green-500/20">
                    <CheckCircle2 className="w-4 h-4 text-green-400" />
                    <span className="text-xs text-green-300">פיזור משקל תקין - עומד בתקן הובלה</span>
                  </div>
                </CardContent>
              </Card>
            ))}
            <Card className="bg-[#0d1117] border-white/10">
              <CardHeader><CardTitle className="text-base text-white">הנחיות טעינה</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {[
                  { icon: Weight, text: "משקל כבד בקדמת הרכב (60% קדמי, 40% אחורי)", color: "text-blue-400" },
                  { icon: Box, text: "זכוכית תמיד במאונך על מעמדי A או L", color: "text-amber-400" },
                  { icon: Ruler, text: "מרווח מינימלי 5 ס\"מ בין פריטים", color: "text-green-400" },
                  { icon: ShieldAlert, text: "רצועות קשירה כל 80 ס\"מ לאורך המטען", color: "text-red-400" },
                  { icon: AlertTriangle, text: "חומרים שבירים - סימון אדום בולט", color: "text-orange-400" },
                  { icon: MapPin, text: "סדר טעינה הפוך ליעדים - האחרון נכנס ראשון", color: "text-purple-400" },
                ].map((tip, i) => (
                  <div key={i} className="flex items-start gap-3 p-2 rounded bg-white/5">
                    <tip.icon className={`w-4 h-4 mt-0.5 ${tip.color}`} />
                    <span className="text-sm text-muted-foreground">{tip.text}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Tab 3: Protection Materials */}
        <TabsContent value="protection" className="space-y-4">
          <Card className="bg-[#0d1117] border-white/10">
            <CardHeader><CardTitle className="text-lg text-white">חומרי אריזה והגנה</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {protectionMaterials.map((m) => (
                  <div key={m.name} className={`p-4 rounded-xl border ${m.low ? "bg-red-500/5 border-red-500/30" : "bg-[#161b22] border-white/10"}`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-semibold text-white">{m.name}</span>
                      <Badge className={m.low ? "bg-red-500/20 text-red-300 border border-red-500/30" : "bg-green-500/20 text-green-300 border border-green-500/30"}>
                        {m.low ? "נמוך" : "תקין"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mb-3">{m.desc}</p>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">מלאי:</span>
                      <span className="text-white font-bold">{m.stock} {m.unit}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs mt-1">
                      <span className="text-muted-foreground">צריכה יומית:</span>
                      <span className="text-white">{m.usage} {m.unit}</span>
                    </div>
                    <div className="mt-2">
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-muted-foreground">מספיק ל:</span>
                        <span className="text-white">{Math.floor(m.stock / m.usage)} ימים</span>
                      </div>
                      <Progress value={Math.min(100, (m.stock / (m.usage * 14)) * 100)} className="h-1.5" />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 4: Shipping Schedule */}
        <TabsContent value="schedule" className="space-y-4">
          <Card className="bg-[#0d1117] border-white/10">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg text-white flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-blue-400" />לוח משלוחים - היום
                </CardTitle>
                <div className="flex gap-2">
                  {Object.entries(schedStatusColor).map(([label, color]) => (
                    <Badge key={label} className={`${color} border border-white/10 text-xs`}>{label}</Badge>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {shippingSchedule.map((s) => (
                  <div key={s.listId} className="flex items-center gap-4 p-4 rounded-xl bg-[#161b22] border border-white/5 hover:border-white/15 transition-colors">
                    <div className="text-center min-w-[60px]">
                      <div className="text-lg font-bold text-white">{s.time}</div>
                    </div>
                    <div className="h-10 w-px bg-white/10" />
                    <div className="flex-1 grid grid-cols-2 md:grid-cols-5 gap-3">
                      <div>
                        <div className="text-xs text-muted-foreground">רשימה</div>
                        <div className="text-sm text-white font-mono">{s.listId}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">מוביל</div>
                        <div className="text-sm text-white">{s.carrier}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">נהג</div>
                        <div className="text-sm text-white flex items-center gap-1">{s.driver}<Phone className="w-3 h-3 text-muted-foreground" /></div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">יעד</div>
                        <div className="text-sm text-white flex items-center gap-1"><MapPin className="w-3 h-3 text-muted-foreground" />{s.dest}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">הגעה משוערת</div>
                        <div className="text-sm text-white">{s.eta}</div>
                      </div>
                    </div>
                    <Badge className={`${schedStatusColor[s.status]} border border-white/10 min-w-[100px] justify-center`}>{s.status}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
