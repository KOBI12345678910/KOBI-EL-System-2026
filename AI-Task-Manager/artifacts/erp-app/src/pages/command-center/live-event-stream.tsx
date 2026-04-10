/**
 * Live Event Stream — the unified event bus feed, filterable and live.
 *
 * Every significant change across CRM, Sales, Quotes, Orders, Projects,
 * Procurement, Suppliers, Inventory, Production, QC, Logistics, Installations,
 * Service, Billing, Payments, Cashflow, HR, AI flows through this stream.
 */

import { useMemo, useState, useEffect } from "react";
import { useLiveEvents, useEventStream, type LiveEvent } from "@/hooks/useRealtime";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Activity, Filter, Search, Wifi, WifiOff, Pause, Play,
  Users, TrendingUp, FileText, ClipboardCheck, Building2,
  Package, Truck, Factory, ShieldAlert, HardHat, Wrench,
  Receipt, CreditCard, DollarSign, Bell, Bot, AlertTriangle, CheckCircle2
} from "lucide-react";

const MODULE_CONFIG: Record<string, { label: string; icon: any; color: string }> = {
  crm: { label: "CRM", icon: Users, color: "text-blue-400" },
  sales: { label: "מכירות", icon: TrendingUp, color: "text-green-400" },
  quotes: { label: "הצעות", icon: FileText, color: "text-cyan-400" },
  orders: { label: "הזמנות", icon: ClipboardCheck, color: "text-teal-400" },
  projects: { label: "פרויקטים", icon: Building2, color: "text-indigo-400" },
  procurement: { label: "רכש", icon: Package, color: "text-yellow-400" },
  suppliers: { label: "ספקים", icon: Truck, color: "text-orange-400" },
  inventory: { label: "מלאי", icon: Package, color: "text-amber-400" },
  production: { label: "ייצור", icon: Factory, color: "text-red-400" },
  qc: { label: "איכות", icon: ShieldAlert, color: "text-pink-400" },
  logistics: { label: "לוגיסטיקה", icon: Truck, color: "text-sky-400" },
  installations: { label: "התקנות", icon: HardHat, color: "text-emerald-400" },
  service: { label: "שירות", icon: Wrench, color: "text-violet-400" },
  billing: { label: "חיוב", icon: Receipt, color: "text-rose-400" },
  payments: { label: "תשלומים", icon: CreditCard, color: "text-fuchsia-400" },
  cashflow: { label: "תזרים", icon: DollarSign, color: "text-green-500" },
  hr: { label: "כ״א", icon: Users, color: "text-purple-400" },
  alerts: { label: "התראות", icon: Bell, color: "text-red-500" },
  ai: { label: "AI", icon: Bot, color: "text-cyan-500" },
};

const SEVERITY_CONFIG: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  info: { bg: "bg-blue-500/5", border: "border-blue-500/20", text: "text-blue-300", dot: "bg-blue-500" },
  success: { bg: "bg-green-500/5", border: "border-green-500/20", text: "text-green-300", dot: "bg-green-500" },
  warning: { bg: "bg-yellow-500/5", border: "border-yellow-500/20", text: "text-yellow-300", dot: "bg-yellow-500" },
  critical: { bg: "bg-red-500/10", border: "border-red-500/30", text: "text-red-300", dot: "bg-red-500" },
  blocker: { bg: "bg-red-600/15", border: "border-red-600/50", text: "text-red-200", dot: "bg-red-600" },
};

export default function LiveEventStreamPage() {
  const [paused, setPaused] = useState(false);
  const [moduleFilter, setModuleFilter] = useState<string>("");
  const [severityFilter, setSeverityFilter] = useState<string>("");
  const [searchText, setSearchText] = useState("");
  const [liveEvents, setLiveEvents] = useState<LiveEvent[]>([]);
  const { data: fetchedEvents = [] } = useLiveEvents({ limit: 200, module: moduleFilter || undefined, severity: severityFilter || undefined });
  const { connected } = useEventStream((event) => {
    if (paused) return;
    setLiveEvents((prev) => [event, ...prev].slice(0, 300));
  });

  useEffect(() => {
    if (liveEvents.length === 0 && fetchedEvents.length > 0) {
      setLiveEvents(fetchedEvents);
    }
  }, [fetchedEvents, liveEvents.length]);

  const filteredEvents = useMemo(() => {
    let events = liveEvents.length > 0 ? liveEvents : fetchedEvents;
    if (moduleFilter) events = events.filter(e => e.sourceModule === moduleFilter);
    if (severityFilter) events = events.filter(e => e.severity === severityFilter);
    if (searchText.trim()) {
      const q = searchText.toLowerCase();
      events = events.filter(e =>
        e.eventType.toLowerCase().includes(q) ||
        e.entityId.toLowerCase().includes(q) ||
        (e.entityLabel ?? "").toLowerCase().includes(q)
      );
    }
    return events;
  }, [liveEvents, fetchedEvents, moduleFilter, severityFilter, searchText]);

  const byModule = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of filteredEvents) {
      counts[e.sourceModule] = (counts[e.sourceModule] ?? 0) + 1;
    }
    return counts;
  }, [filteredEvents]);

  const bySeverity = useMemo(() => {
    const counts: Record<string, number> = { info: 0, success: 0, warning: 0, critical: 0, blocker: 0 };
    for (const e of filteredEvents) {
      counts[e.severity ?? "info"] = (counts[e.severity ?? "info"] ?? 0) + 1;
    }
    return counts;
  }, [filteredEvents]);

  return (
    <div dir="rtl" className="min-h-screen bg-[#0a0e1a] text-white p-4 md:p-6 space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-3">
            <Activity className="w-7 h-7 text-cyan-400" />
            זרם אירועים חי
          </h1>
          <p className="text-white/60 text-sm mt-1">
            כל השינויים בארגון — CRM, מכירות, ייצור, רכש, מלאי, פרויקטים, גבייה, AI — בזרם אחד מאוחד.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className={`border-white/20 ${connected ? "text-green-400" : "text-gray-400"}`}>
            {connected ? <><Wifi className="w-3 h-3 ml-1" /> מחובר</> : <><WifiOff className="w-3 h-3 ml-1" /> מנותק</>}
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPaused(!paused)}
            className={paused ? "border-yellow-500/40 text-yellow-300" : "border-green-500/40 text-green-300"}
          >
            {paused ? <><Play className="w-3 h-3 ml-1" /> המשך</> : <><Pause className="w-3 h-3 ml-1" /> עצור</>}
          </Button>
        </div>
      </div>

      {/* Severity Breakdown */}
      <div className="grid grid-cols-5 gap-3">
        {(["info", "success", "warning", "critical", "blocker"] as const).map((sev) => {
          const cfg = SEVERITY_CONFIG[sev]!;
          return (
            <button
              key={sev}
              onClick={() => setSeverityFilter(severityFilter === sev ? "" : sev)}
              className={`p-3 rounded-lg border transition-all text-left ${cfg.bg} ${cfg.border} ${severityFilter === sev ? "ring-2 ring-white/30" : ""}`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                <span className={`text-xs font-semibold uppercase ${cfg.text}`}>{sev}</span>
              </div>
              <div className={`text-2xl font-bold ${cfg.text}`}>{bySeverity[sev] ?? 0}</div>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <Card className="bg-[#0f1420] border-white/10">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-white/40" />
              <Input
                placeholder="חיפוש באירועים..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className="bg-[#0a0e1a] border-white/10 text-white pr-10"
              />
            </div>
            <Filter className="w-4 h-4 text-white/40" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant={moduleFilter === "" ? "default" : "outline"}
              size="sm"
              onClick={() => setModuleFilter("")}
              className="text-xs h-7"
            >
              כל המודולים ({filteredEvents.length})
            </Button>
            {Object.entries(MODULE_CONFIG).map(([key, cfg]) => {
              const count = byModule[key] ?? 0;
              if (count === 0 && moduleFilter !== key) return null;
              const Icon = cfg.icon;
              return (
                <Button
                  key={key}
                  variant={moduleFilter === key ? "default" : "outline"}
                  size="sm"
                  onClick={() => setModuleFilter(moduleFilter === key ? "" : key)}
                  className="text-xs h-7"
                >
                  <Icon className={`w-3 h-3 ml-1 ${cfg.color}`} />
                  {cfg.label} {count > 0 && <span className="opacity-60 mr-1">{count}</span>}
                </Button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Event Feed */}
      <Card className="bg-[#0f1420] border-white/10">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-cyan-400" />
              {filteredEvents.length} אירועים
            </span>
            {paused && (
              <Badge variant="outline" className="border-yellow-500/40 text-yellow-300">
                <Pause className="w-3 h-3 ml-1" /> מושהה
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1 max-h-[calc(100vh-450px)] overflow-y-auto pr-2">
            {filteredEvents.length === 0 ? (
              <div className="text-center py-16 text-white/40">
                <Activity className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>אין אירועים להצגה</p>
              </div>
            ) : (
              filteredEvents.map((e, i) => {
                const mCfg = MODULE_CONFIG[e.sourceModule] ?? { label: e.sourceModule, icon: Activity, color: "text-gray-400" };
                const sCfg = SEVERITY_CONFIG[e.severity ?? "info"] ?? SEVERITY_CONFIG.info!;
                const Icon = mCfg.icon;
                return (
                  <div
                    key={`${e.id ?? i}-${e.eventType}-${i}`}
                    className={`flex items-start gap-3 p-3 rounded-lg border ${sCfg.bg} ${sCfg.border} hover:bg-white/5 transition-colors`}
                  >
                    <div className={`w-2 h-2 rounded-full ${sCfg.dot} mt-2 shrink-0 ${e.severity === "critical" ? "animate-pulse" : ""}`} />
                    <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${mCfg.color}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{e.eventType}</span>
                        <Badge variant="outline" className="text-[10px] h-4 px-1">{mCfg.label}</Badge>
                        {e.severity && e.severity !== "info" && (
                          <Badge variant="outline" className={`text-[10px] h-4 px-1 ${sCfg.text} border-current`}>
                            {e.severity}
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-white/70 mt-0.5 truncate">
                        <span className="opacity-60">{e.entityType}:</span> {e.entityLabel ?? e.entityId}
                      </div>
                      {e.financialImpact != null && (
                        <div className="text-[10px] mt-1 text-green-400">
                          השפעה פיננסית: ₪{e.financialImpact.toLocaleString("he-IL")}
                        </div>
                      )}
                    </div>
                    <div className="text-[10px] text-white/40 shrink-0 text-left">
                      {e.occurredAt ? new Date(e.occurredAt).toLocaleTimeString("he-IL") : "—"}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
