import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Package, Globe, BarChart3, AlertTriangle, Truck, RotateCcw, Clock, MapPin, PenLine, Navigation, ArrowLeft, TrendingUp, AlertCircle, CheckCircle2 } from "lucide-react";
import { Link } from "wouter";
import { authFetch } from "@/lib/utils";

const API = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;

interface DashboardKPIs {
  packing: { total: string; confirmed: string; avg_utilization: string; };
  freight: { total: string; total_cost: string; carriers: string; };
  customs: { total: string; approved: string; drafts: string; };
  audit: { total: string; flagged: string; total_savings: string; };
}

interface FabricationKPIs {
  packing: { total: string; active: string; pending: string; };
  transport: { total: string; active: string; pending: string; };
  installation: { total: string; active: string; pending: string; };
  service: { total: string; active: string; urgent: string; };
}

interface TrackingKPIs {
  activeDeliveries: number;
  pendingRmas: number;
  onTimeDeliveryRate: number;
  deliveriesToday: number;
}

const DEFAULT_TRACKING: TrackingKPIs = { activeDeliveries: 0, pendingRmas: 0, onTimeDeliveryRate: 100, deliveriesToday: 0 };

const NAV_CARDS = [
  { path: "/logistics/tracking", icon: Truck, title: "מעקב משלוחים חי", desc: "עקוב אחר כלי רכב ומשלוחים בזמן אמת", color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20" },
  { path: "/logistics/proof-of-delivery", icon: PenLine, title: "הוכחת מסירה (POD)", desc: "חתימה דיגיטלית, תמונות ו-GPS", color: "text-green-400", bg: "bg-green-500/10 border-green-500/20" },
  { path: "/logistics/returns", icon: RotateCcw, title: "לוגיסטיקה הפוכה (RMA)", desc: "ניהול החזרות ואישורי החזרה", color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/20" },
  { path: "/logistics/fleet", icon: Navigation, title: "ניהול צי", desc: "ניהול כלי רכב ונהגים", color: "text-purple-400", bg: "bg-purple-500/10 border-purple-500/20" },
  { path: "/logistics/routes", icon: MapPin, title: "תכנון מסלולים", desc: "אופטימיזציה ותכנון מסלולי חלוקה", color: "text-cyan-400", bg: "bg-cyan-500/10 border-cyan-500/20" },
  { path: "/logistics/delivery-scheduling", icon: Clock, title: "תזמון משלוחים", desc: "ניהול לוח זמנים ומשימות", color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/20" },
  { path: "/logistics/loading-dock", icon: Package, title: "ניהול רציף", desc: "תזמון רציפי טעינה ופריקה", color: "text-pink-400", bg: "bg-pink-500/10 border-pink-500/20" },
  { path: "/logistics/barcode-rfid", icon: CheckCircle2, title: "ברקוד / RFID", desc: "מעקב ברקודים ותגי RFID", color: "text-indigo-400", bg: "bg-indigo-500/10 border-indigo-500/20" },
];

export default function LogisticsDashboard() {
  const queryClient = useQueryClient();

  const { data: shippingKpis, isLoading: loadingShipping } = useQuery<DashboardKPIs | null>({
    queryKey: ["logistics-shipping-dashboard"],
    queryFn: async () => {
      const r = await authFetch(`${API}/shipping-freight/dashboard`);
      if (!r.ok) return null;
      return r.json();
    },
    staleTime: 60_000,
  });

  const { data: fabKpis, isLoading: loadingFab } = useQuery<FabricationKPIs | null>({
    queryKey: ["logistics-fabrication-dashboard"],
    queryFn: async () => {
      const r = await authFetch(`${API}/fabrication-logistics/dashboard`);
      if (!r.ok) return null;
      return r.json();
    },
    staleTime: 60_000,
  });

  const { data: trackingKpis = DEFAULT_TRACKING, isLoading: loadingTracking } = useQuery<TrackingKPIs>({
    queryKey: ["logistics-kpis"],
    queryFn: async () => {
      const r = await authFetch(`${API}/logistics-kpis`);
      if (!r.ok) return DEFAULT_TRACKING;
      return r.json();
    },
    staleTime: 60_000,
  });

  const loading = loadingShipping || loadingFab || loadingTracking;

  function refreshAll() {
    queryClient.invalidateQueries({ queryKey: ["logistics-shipping-dashboard"] });
    queryClient.invalidateQueries({ queryKey: ["logistics-fabrication-dashboard"] });
    queryClient.invalidateQueries({ queryKey: ["logistics-kpis"] });
  }

  const kpiCards = [
    { icon: Truck, label: "משלוחים פעילים", value: trackingKpis.activeDeliveries, color: "text-blue-400", sub: "כרגע בדרך" },
    { icon: TrendingUp, label: "אחוז זמן אמת", value: `${trackingKpis.onTimeDeliveryRate}%`, color: "text-green-400", sub: "מסירות בזמן" },
    { icon: RotateCcw, label: "החזרות פתוחות", value: trackingKpis.pendingRmas, color: "text-orange-400", sub: "RMA ממתין" },
    { icon: Package, label: "משלוחים היום", value: trackingKpis.deliveriesToday, color: "text-purple-400", sub: "נוצרו היום" },
  ];

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">דשבורד לוגיסטיקה</h1>
          <p className="text-sm text-muted-foreground mt-1">ניהול לוגיסטיקה, מעקב משלוחים ולוגיסטיקה הפוכה</p>
        </div>
        <Button variant="outline" size="sm" onClick={refreshAll} disabled={loading}>
          <RefreshCw className={`w-4 h-4 ml-1 ${loading ? "animate-spin" : ""}`} />רענן
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpiCards.map((k, i) => {
          const Icon = k.icon;
          return (
            <Card key={i} className="bg-card/50 border-border/50">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <Icon className={`w-5 h-5 ${k.color}`} />
                </div>
                <div className={`text-2xl font-bold ${k.color}`}>
                  {loading ? <span className="animate-pulse">—</span> : k.value}
                </div>
                <div className="text-xs font-medium text-foreground mt-1">{k.label}</div>
                <div className="text-xs text-muted-foreground">{k.sub}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {shippingKpis && (
        <div>
          <h2 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wider">שילוח ומטענים</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="bg-card/50 border-border/50">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <Package className="w-5 h-5 text-blue-400" />
                  <Badge className="bg-blue-500/20 text-blue-300 text-xs">{shippingKpis.packing.confirmed || 0} מאושר</Badge>
                </div>
                <div className="text-2xl font-bold text-foreground">{shippingKpis.packing.total || 0}</div>
                <div className="text-xs text-muted-foreground mt-1">רשימות אריזה</div>
                <div className="text-xs text-blue-300 mt-1">ניצולת ממוצעת: {Number(shippingKpis.packing.avg_utilization || 0).toFixed(0)}%</div>
              </CardContent>
            </Card>

            <Card className="bg-card/50 border-border/50">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <Truck className="w-5 h-5 text-cyan-400" />
                  <Badge className="bg-cyan-500/20 text-cyan-300 text-xs">{shippingKpis.freight.carriers || 0} מובילים</Badge>
                </div>
                <div className="text-2xl font-bold text-foreground">{shippingKpis.freight.total || 0}</div>
                <div className="text-xs text-muted-foreground mt-1">חישובי מטען</div>
                <div className="text-xs text-cyan-300 mt-1">עלות: ${Number(shippingKpis.freight.total_cost || 0).toLocaleString()}</div>
              </CardContent>
            </Card>

            <Card className="bg-card/50 border-border/50">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <Globe className="w-5 h-5 text-purple-400" />
                  <Badge className="bg-purple-500/20 text-purple-300 text-xs">{shippingKpis.customs.approved || 0} מאושר</Badge>
                </div>
                <div className="text-2xl font-bold text-foreground">{shippingKpis.customs.total || 0}</div>
                <div className="text-xs text-muted-foreground mt-1">מסמכי מכס</div>
                <div className="text-xs text-purple-300 mt-1">טיוטות: {shippingKpis.customs.drafts || 0}</div>
              </CardContent>
            </Card>

            <Card className="bg-card/50 border-border/50">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <BarChart3 className="w-5 h-5 text-orange-400" />
                  {Number(shippingKpis.audit.flagged || 0) > 0 && (
                    <Badge className="bg-red-500/20 text-red-300 text-xs">
                      <AlertTriangle className="w-3 h-3 ml-1" />{shippingKpis.audit.flagged} סטיות
                    </Badge>
                  )}
                </div>
                <div className="text-2xl font-bold text-foreground">{shippingKpis.audit.total || 0}</div>
                <div className="text-xs text-muted-foreground mt-1">ביקורות חשבוניות</div>
                <div className="text-xs text-emerald-400 mt-1">חיסכון: ${Number(shippingKpis.audit.total_savings || 0).toLocaleString()}</div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {fabKpis && (
        <div>
          <h2 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wider">לוגיסטיקה פנימית</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "אריזות", data: fabKpis.packing, color: "text-blue-400", activeLabel: "בתהליך", pendingLabel: "ממתין" },
              { label: "הובלות", data: fabKpis.transport, color: "text-green-400", activeLabel: "בדרך", pendingLabel: "מתוזמן" },
              { label: "התקנות", data: fabKpis.installation, color: "text-yellow-400", activeLabel: "פעיל", pendingLabel: "מתוזמן" },
              { label: "שירות", data: fabKpis.service, color: "text-red-400", activeLabel: "פתוח", pendingLabel: "דחוף" },
            ].map(({ label, data, color, activeLabel, pendingLabel }) => (
              <Card key={label} className="bg-card/50 border-border/50">
                <CardContent className="p-4">
                  <div className="text-sm font-medium text-muted-foreground mb-2">{label}</div>
                  <div className="text-2xl font-bold text-foreground">{data.total}</div>
                  <div className="flex gap-2 mt-2">
                    <span className={`text-xs ${color}`}>{activeLabel}: {data.active}</span>
                    <span className="text-xs text-muted-foreground">{pendingLabel}: {"pending" in data ? data.pending : data.urgent}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <div>
        <h2 className="text-lg font-semibold text-foreground mb-4">מודולי לוגיסטיקה</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {NAV_CARDS.map(card => {
            const Icon = card.icon;
            return (
              <Link key={card.path} href={card.path}>
                <Card className={`${card.bg} border cursor-pointer hover:scale-[1.02] transition-transform`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${card.bg}`}>
                        <Icon className={`w-5 h-5 ${card.color}`} />
                      </div>
                      <ArrowLeft className="w-4 h-4 text-muted-foreground/50" />
                    </div>
                    <div className="font-medium text-foreground text-sm mb-1">{card.title}</div>
                    <div className="text-xs text-muted-foreground">{card.desc}</div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Truck className="w-4 h-4 text-blue-400" />
              <h3 className="text-sm font-medium text-foreground">פעולות מהירות</h3>
            </div>
            <div className="space-y-2">
              <Link href="/logistics/tracking">
                <Button variant="outline" size="sm" className="w-full justify-start">
                  <Truck className="w-4 h-4 ml-2 text-blue-400" />צפה במשלוחים פעילים
                </Button>
              </Link>
              <Link href="/logistics/proof-of-delivery">
                <Button variant="outline" size="sm" className="w-full justify-start">
                  <PenLine className="w-4 h-4 ml-2 text-green-400" />קלוט הוכחת מסירה
                </Button>
              </Link>
              <Link href="/logistics/returns">
                <Button variant="outline" size="sm" className="w-full justify-start">
                  <RotateCcw className="w-4 h-4 ml-2 text-orange-400" />פתח בקשת החזרה (RMA)
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertCircle className="w-4 h-4 text-yellow-400" />
              <h3 className="text-sm font-medium text-foreground">סיכום סטטוס</h3>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">משלוחים פעילים</span>
                <Badge className="bg-blue-500/20 text-blue-300">{trackingKpis.activeDeliveries}</Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">אחוז מסירות בזמן</span>
                <Badge className={trackingKpis.onTimeDeliveryRate >= 90 ? "bg-green-500/20 text-green-300" : "bg-red-500/20 text-red-300"}>
                  {trackingKpis.onTimeDeliveryRate}%
                </Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">RMA פתוח</span>
                <Badge className={trackingKpis.pendingRmas === 0 ? "bg-green-500/20 text-green-300" : "bg-orange-500/20 text-orange-300"}>
                  {trackingKpis.pendingRmas}
                </Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">משלוחים היום</span>
                <Badge className="bg-purple-500/20 text-purple-300">{trackingKpis.deliveriesToday}</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
