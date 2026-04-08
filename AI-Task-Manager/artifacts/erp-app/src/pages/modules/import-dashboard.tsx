import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useState } from "react";
import {
  Ship, Globe, FileCheck, Calculator, FileText, CreditCard, Shield, Package,
  ArrowLeft, Plus, AlertTriangle, Clock, CheckCircle2, XCircle, DollarSign,
  MapPin, Anchor, TrendingUp, BarChart3, Calendar, Activity, Zap,
  Truck, Boxes, Timer, Target, Flag, Navigation, Compass
} from "lucide-react";
import { authFetch } from "@/lib/utils";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
const API = "/api";

function safeArray(data: any): any[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    if (Array.isArray(data.data)) return data.data;
    if (Array.isArray(data.records)) return data.records;
  }
  return [];
}

function fetchEntityRecords(entityId: number) {
  return async () => {
    try {
      const r = await authFetch(`${API}/platform/entities/${entityId}/records?limit=200`);
      if (!r.ok) return [];
      const d = await r.json();
      return safeArray(d.records || d.data || d);
    } catch { return []; }
  };
}

export default function ImportDashboardPage() {
  const [, navigate] = useLocation();

  const { data: importOrders = [] } = useQuery<any[]>({ queryKey: ["import-orders"], queryFn: fetchEntityRecords(45) });
  const { data: foreignSuppliers = [] } = useQuery<any[]>({ queryKey: ["foreign-suppliers"], queryFn: fetchEntityRecords(46) });
  const { data: shipments = [] } = useQuery<any[]>({ queryKey: ["shipment-tracking"], queryFn: fetchEntityRecords(47) });
  const { data: customsClearances = [] } = useQuery<any[]>({ queryKey: ["customs-clearances"], queryFn: fetchEntityRecords(48) });
  const { data: landedCosts = [] } = useQuery<any[]>({ queryKey: ["landed-costs"], queryFn: fetchEntityRecords(56) });
  const { data: importDocs = [] } = useQuery<any[]>({ queryKey: ["import-docs"], queryFn: fetchEntityRecords(57) });
  const { data: lettersOfCredit = [] } = useQuery<any[]>({ queryKey: ["letters-of-credit"], queryFn: fetchEntityRecords(58) });
  const { data: importInsurance = [] } = useQuery<any[]>({ queryKey: ["import-insurance"], queryFn: fetchEntityRecords(59) });

  const getVal = (record: any, key: string) => record?.data?.[key] || record?.[key] || "";
  const getStatus = (record: any) => record?.status || getVal(record, "status") || "חדש";

  const activeOrders = importOrders.filter((o: any) => !["הושלם", "בוטל"].includes(getStatus(o)));
  const inTransit = shipments.filter((s: any) => ["בדרך", "בנמל", "בטרנזיט"].includes(getStatus(s)));
  const pendingCustoms = customsClearances.filter((c: any) => !["מאושר", "הושלם", "שוחרר"].includes(getStatus(c)));
  const activeLCs = lettersOfCredit.filter((lc: any) => !["סגור", "בוטל"].includes(getStatus(lc)));

  const topKPIs = [
    { label: "הזמנות יבוא פעילות", value: activeOrders.length, subtext: `מתוך ${importOrders.length} סה״כ`, icon: Ship, color: "text-blue-400", bg: "from-blue-500/20 to-blue-600/5" },
    { label: "משלוחים בדרך", value: inTransit.length, subtext: `${shipments.length} סה״כ משלוחים`, icon: Navigation, color: "text-cyan-400", bg: "from-cyan-500/20 to-cyan-600/5" },
    { label: "ממתינים לשחרור מכס", value: pendingCustoms.length, subtext: `${customsClearances.length} תיקי מכס`, icon: FileCheck, color: "text-amber-400", bg: "from-amber-500/20 to-amber-600/5" },
    { label: "אשראי דוקומנטרי פעיל", value: activeLCs.length, subtext: `${lettersOfCredit.length} סה״כ L/C`, icon: CreditCard, color: "text-emerald-400", bg: "from-emerald-500/20 to-emerald-600/5" },
  ];

  const quickActions = [
    { label: "הזמנת יבוא חדשה", icon: Ship, href: "/builder/data/45", color: "bg-blue-600 hover:bg-blue-500" },
    { label: "ספק חו\"ל חדש", icon: Globe, href: "/builder/data/46", color: "bg-indigo-600 hover:bg-indigo-500" },
    { label: "מעקב משלוח", icon: Navigation, href: "/builder/data/47", color: "bg-cyan-600 hover:bg-cyan-500" },
    { label: "שחרור מכס", icon: FileCheck, href: "/builder/data/48", color: "bg-amber-600 hover:bg-amber-500" },
    { label: "עלויות נחיתה", icon: Calculator, href: "/builder/data/56", color: "bg-emerald-600 hover:bg-emerald-500" },
    { label: "מסמכי יבוא", icon: FileText, href: "/builder/data/57", color: "bg-violet-600 hover:bg-violet-500" },
    { label: "אשראי דוקומנטרי", icon: CreditCard, href: "/builder/data/58", color: "bg-pink-600 hover:bg-pink-500" },
    { label: "ביטוח משלוח", icon: Shield, href: "/builder/data/59", color: "bg-teal-600 hover:bg-teal-500" },
  ];

  const processFlow = [
    { step: 1, label: "הזמנת יבוא", count: importOrders.length, icon: Ship, color: "border-blue-500", bg: "bg-blue-500/10" },
    { step: 2, label: "פתיחת L/C", count: lettersOfCredit.length, icon: CreditCard, color: "border-indigo-500", bg: "bg-indigo-500/10" },
    { step: 3, label: "ביטוח משלוח", count: importInsurance.length, icon: Shield, color: "border-purple-500", bg: "bg-purple-500/10" },
    { step: 4, label: "מעקב משלוח", count: shipments.length, icon: Navigation, color: "border-cyan-500", bg: "bg-cyan-500/10" },
    { step: 5, label: "שחרור מכס", count: customsClearances.length, icon: FileCheck, color: "border-amber-500", bg: "bg-amber-500/10" },
    { step: 6, label: "עלויות נחיתה", count: landedCosts.length, icon: Calculator, color: "border-emerald-500", bg: "bg-emerald-500/10" },
  ];

  const entityCards = [
    { label: "הזמנות יבוא", value: importOrders.length, icon: Ship, color: "text-blue-400", bg: "bg-blue-500/10", href: "/builder/data/45" },
    { label: "ספקי חו\"ל", value: foreignSuppliers.length, icon: Globe, color: "text-indigo-400", bg: "bg-indigo-500/10", href: "/builder/data/46" },
    { label: "מעקב משלוחים", value: shipments.length, icon: Navigation, color: "text-cyan-400", bg: "bg-cyan-500/10", href: "/builder/data/47" },
    { label: "שחרור מכס", value: customsClearances.length, icon: FileCheck, color: "text-amber-400", bg: "bg-amber-500/10", href: "/builder/data/48" },
    { label: "עלויות נחיתה", value: landedCosts.length, icon: Calculator, color: "text-emerald-400", bg: "bg-emerald-500/10", href: "/builder/data/56" },
    { label: "מסמכי יבוא", value: importDocs.length, icon: FileText, color: "text-violet-400", bg: "bg-violet-500/10", href: "/builder/data/57" },
    { label: "אשראי דוקומנטרי (L/C)", value: lettersOfCredit.length, icon: CreditCard, color: "text-pink-400", bg: "bg-pink-500/10", href: "/builder/data/58" },
    { label: "ביטוח משלוחי יבוא", value: importInsurance.length, icon: Shield, color: "text-teal-400", bg: "bg-teal-500/10", href: "/builder/data/59" },
  ];

  return (
    <div className="min-h-screen" dir="rtl">
      <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl sm:text-3xl font-bold text-foreground flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center">
                <Ship className="w-6 h-6 text-foreground" />
              </div>
              דשבורד יבוא בינלאומי
            </h1>
            <p className="text-muted-foreground mt-1">מרכז פיקוד ליבוא, לוגיסטיקה, מכס ואשראי דוקומנטרי</p>
          </div>
          <button onClick={() => navigate("/builder/data/45")} className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-foreground rounded-xl font-medium transition-colors">
            <Plus className="w-5 h-5" />
            הזמנת יבוא חדשה
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {topKPIs.map((kpi, i) => (
            <div key={i} className={`bg-gradient-to-br ${kpi.bg} border border-border rounded-2xl p-5 relative overflow-hidden`}>
              <div className="absolute top-3 left-3 opacity-10"><kpi.icon className="w-16 h-16" /></div>
              <div className="relative z-10">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-black/20 flex items-center justify-center">
                    <kpi.icon className={`w-4 h-4 ${kpi.color}`} />
                  </div>
                  <span className="text-muted-foreground text-sm">{kpi.label}</span>
                </div>
                <p className={`text-xl sm:text-3xl font-bold ${kpi.color}`}>{kpi.value}</p>
                <p className="text-muted-foreground text-xs mt-1">{kpi.subtext}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="bg-card border border-border rounded-2xl p-6">
          <h2 className="text-lg font-semibold text-foreground mb-5 flex items-center gap-2">
            <Activity className="w-5 h-5 text-blue-400" />
            תהליך יבוא — זרימת עבודה
          </h2>
          <div className="flex items-center justify-between gap-2 overflow-x-auto pb-2">
            {processFlow.map((step, i) => (
              <div key={i} className="flex items-center gap-2 flex-1 min-w-[120px]">
                <div className={`flex-1 ${step.bg} border-2 ${step.color} rounded-xl p-4 text-center`}>
                  <step.icon className="w-6 h-6 mx-auto mb-2 text-gray-300" />
                  <p className="text-xs text-muted-foreground">שלב {step.step}</p>
                  <p className="text-sm font-semibold text-foreground mt-1">{step.label}</p>
                  <p className="text-xl font-bold text-gray-300 mt-2">{step.count}</p>
                </div>
                {i < processFlow.length - 1 && (
                  <ArrowLeft className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-5">
          <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <Zap className="w-5 h-5 text-blue-400" />
            פעולות מהירות
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
            {quickActions.map(a => (
              <button key={a.label} onClick={() => navigate(a.href)}
                className={`flex flex-col items-center gap-2 p-4 ${a.color} text-foreground rounded-xl text-sm font-medium transition-all hover:scale-[1.02] hover:shadow-lg`}>
                <a.icon className="w-6 h-6" />
                <span className="text-center leading-tight text-xs">{a.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {entityCards.map(card => (
            <button key={card.label} onClick={() => navigate(card.href)}
              className="bg-card border border-border rounded-xl p-5 flex items-center gap-4 hover:border-border transition-all hover:shadow-lg text-right w-full group">
              <div className={`w-12 h-12 rounded-xl ${card.bg} flex items-center justify-center group-hover:scale-110 transition-transform`}>
                <card.icon className={`w-6 h-6 ${card.color}`} />
              </div>
              <div className="flex-1">
                <p className="text-muted-foreground text-sm">{card.label}</p>
                <p className={`text-lg sm:text-2xl font-bold ${card.color}`}>{card.value}</p>
              </div>
              <ArrowLeft className="w-4 h-4 text-muted-foreground group-hover:text-muted-foreground transition-colors" />
            </button>
          ))}
        </div>

        <div className="bg-card border border-border rounded-2xl p-5">
          <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-violet-400" />
            סיכום ביצועי יבוא
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-input rounded-xl p-4 text-center">
              <p className="text-muted-foreground text-xs mb-1">ספקי חו"ל פעילים</p>
              <p className="text-lg sm:text-2xl font-bold text-indigo-400">{foreignSuppliers.length}</p>
              <p className="text-muted-foreground text-xs">ספקים בינלאומיים</p>
            </div>
            <div className="bg-input rounded-xl p-4 text-center">
              <p className="text-muted-foreground text-xs mb-1">מסמכים נדרשים</p>
              <p className="text-lg sm:text-2xl font-bold text-violet-400">{importDocs.length}</p>
              <p className="text-muted-foreground text-xs">תיעוד יבוא</p>
            </div>
            <div className="bg-input rounded-xl p-4 text-center">
              <p className="text-muted-foreground text-xs mb-1">פוליסות ביטוח</p>
              <p className="text-lg sm:text-2xl font-bold text-teal-400">{importInsurance.length}</p>
              <p className="text-muted-foreground text-xs">כיסוי משלוחים</p>
            </div>
            <div className="bg-input rounded-xl p-4 text-center">
              <p className="text-muted-foreground text-xs mb-1">חישובי עלות נחיתה</p>
              <p className="text-lg sm:text-2xl font-bold text-emerald-400">{landedCosts.length}</p>
              <p className="text-muted-foreground text-xs">ניתוח עלויות</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-card border border-border rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <Ship className="w-5 h-5 text-blue-400" />
                הזמנות יבוא אחרונות
              </h2>
              <button onClick={() => navigate("/builder/data/45")} className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1">
                הצג הכל <ArrowLeft className="w-3 h-3" />
              </button>
            </div>
            {importOrders.length === 0 ? (
              <div className="text-center py-8">
                <Ship className="w-12 h-12 text-foreground mx-auto mb-3" />
                <p className="text-muted-foreground mb-3">אין הזמנות יבוא עדיין</p>
                <button onClick={() => navigate("/builder/data/45")} className="flex items-center gap-2 mx-auto px-4 py-2 bg-blue-600 hover:bg-blue-500 text-foreground rounded-lg text-sm">
                  <Plus className="w-4 h-4" />הזמנת יבוא חדשה
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {importOrders.slice(0, 5).map((o: any, i: number) => (
                  <div key={o.id || i} className="flex items-center justify-between bg-input rounded-xl p-3">
                    <div className="flex items-center gap-3">
                      <Ship className="w-4 h-4 text-blue-400" />
                      <span className="text-foreground text-sm">{getVal(o, "order_number") || getVal(o, "orderNumber") || `הזמנה #${o.id}`}</span>
                    </div>
                    <span className="text-xs px-2 py-1 rounded-lg bg-blue-500/20 text-blue-400">{getStatus(o)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-card border border-border rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <Navigation className="w-5 h-5 text-cyan-400" />
                משלוחים פעילים
              </h2>
              <button onClick={() => navigate("/builder/data/47")} className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1">
                הצג הכל <ArrowLeft className="w-3 h-3" />
              </button>
            </div>
            {shipments.length === 0 ? (
              <div className="text-center py-8">
                <Navigation className="w-12 h-12 text-foreground mx-auto mb-3" />
                <p className="text-muted-foreground mb-3">אין משלוחים פעילים</p>
                <button onClick={() => navigate("/builder/data/47")} className="flex items-center gap-2 mx-auto px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-foreground rounded-lg text-sm">
                  <Plus className="w-4 h-4" />מעקב משלוח חדש
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {shipments.slice(0, 5).map((s: any, i: number) => (
                  <div key={s.id || i} className="flex items-center justify-between bg-input rounded-xl p-3">
                    <div className="flex items-center gap-3">
                      <Navigation className="w-4 h-4 text-cyan-400" />
                      <span className="text-foreground text-sm">{getVal(s, "tracking_number") || getVal(s, "trackingNumber") || `משלוח #${s.id}`}</span>
                    </div>
                    <span className="text-xs px-2 py-1 rounded-lg bg-cyan-500/20 text-cyan-400">{getStatus(s)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <RelatedRecords
          tabs={[
            {
              key: "orders",
              label: "הזמנות יבוא",
              endpoint: `${API}/platform/entities/45/records?limit=10`,
              columns: [
                { key: "id", label: "#" },
                { key: "status", label: "סטטוס" },
              ],
            },
            {
              key: "suppliers",
              label: "ספקים בינלאומיים",
              endpoint: `${API}/platform/entities/46/records?limit=10`,
              columns: [
                { key: "id", label: "#" },
                { key: "status", label: "סטטוס" },
              ],
            },
          ]}
        />

        <ActivityLog entityType="import-orders" />
      </div>
    </div>
  );
}
