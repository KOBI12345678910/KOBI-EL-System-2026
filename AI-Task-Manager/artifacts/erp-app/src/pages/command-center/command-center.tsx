/**
 * BASH44 Command Center — The Unified Live Company Picture
 *
 * This is THE top-level screen. It shows everything that matters right now:
 *  - Overall company health score (live)
 *  - All 22 modules at a glance with health + alerts
 *  - Critical KPIs that update in real time
 *  - Entities needing attention sorted by risk
 *  - Live event feed with SSE
 *  - Causal hotspots (what's affecting downstream)
 *  - AI Brain situation analysis
 *  - Forward view (what's likely to happen)
 *  - Pending decisions awaiting action
 */

import { useEffect, useState } from "react";
import {
  useCompanySnapshot,
  useEventStream,
  useDecisions,
  useAIBrainSituation,
  useAIBrainForecast,
  useEntitiesNeedingAttention,
  useDecisionActions,
  useProfitSummary,
  type LiveEvent,
  type CompanySnapshot,
} from "@/hooks/useRealtime";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Activity, AlertTriangle, CheckCircle2, Zap, TrendingUp, TrendingDown,
  Brain, Clock, Target, Flame, Wifi, WifiOff, Gauge,
  ArrowRight, Sparkles, ShieldAlert, DollarSign,
  Users, Factory, Package, Truck, Receipt, CreditCard,
  HardHat, Wrench, ClipboardCheck, Building2, FileText, Bell,
  Bot, ArrowUpRight, ArrowDownRight, Minus, Eye, CheckCheck, X,
  Lightbulb
} from "lucide-react";

const MODULE_LABELS: Record<string, { label: string; icon: any; color: string }> = {
  crm: { label: "CRM", icon: Users, color: "text-blue-400" },
  sales: { label: "מכירות", icon: TrendingUp, color: "text-green-400" },
  quotes: { label: "הצעות מחיר", icon: FileText, color: "text-cyan-400" },
  orders: { label: "הזמנות", icon: ClipboardCheck, color: "text-teal-400" },
  projects: { label: "פרויקטים", icon: Building2, color: "text-indigo-400" },
  procurement: { label: "רכש", icon: Package, color: "text-yellow-400" },
  suppliers: { label: "ספקים", icon: Truck, color: "text-orange-400" },
  inventory: { label: "מלאי", icon: Package, color: "text-amber-400" },
  warehouse: { label: "מחסן", icon: Building2, color: "text-lime-400" },
  production: { label: "ייצור", icon: Factory, color: "text-red-400" },
  qc: { label: "בקרת איכות", icon: ShieldAlert, color: "text-pink-400" },
  logistics: { label: "לוגיסטיקה", icon: Truck, color: "text-sky-400" },
  installations: { label: "התקנות", icon: HardHat, color: "text-emerald-400" },
  service: { label: "שירות", icon: Wrench, color: "text-violet-400" },
  billing: { label: "חיוב", icon: Receipt, color: "text-rose-400" },
  payments: { label: "תשלומים", icon: CreditCard, color: "text-fuchsia-400" },
  cashflow: { label: "תזרים", icon: DollarSign, color: "text-green-500" },
  hr: { label: "כ״א", icon: Users, color: "text-purple-400" },
  docs: { label: "מסמכים", icon: FileText, color: "text-slate-400" },
  alerts: { label: "התראות", icon: Bell, color: "text-red-500" },
  ai: { label: "AI", icon: Bot, color: "text-cyan-500" },
  external: { label: "חיצוני", icon: Activity, color: "text-gray-400" },
};

const SEVERITY_COLORS: Record<string, string> = {
  info: "bg-blue-500/10 border-blue-500/30 text-blue-300",
  success: "bg-green-500/10 border-green-500/30 text-green-300",
  warning: "bg-yellow-500/10 border-yellow-500/30 text-yellow-300",
  critical: "bg-red-500/10 border-red-500/30 text-red-300",
  blocker: "bg-red-600/20 border-red-600/50 text-red-200",
};

export default function CommandCenter() {
  const { data: snapshot } = useCompanySnapshot(5000);
  const { data: pendingDecisions = [] } = useDecisions({ pending: true });
  const { data: aiBrain } = useAIBrainSituation();
  const { data: forecast = [] } = useAIBrainForecast();
  const { data: attentionEntities = [] } = useEntitiesNeedingAttention();
  const { data: profitSummary } = useProfitSummary();
  const { approve, reject } = useDecisionActions();

  const [liveEvents, setLiveEvents] = useState<LiveEvent[]>([]);
  const [liveSnapshot, setLiveSnapshot] = useState<CompanySnapshot | null>(null);

  const { connected } = useEventStream(
    (event) => {
      setLiveEvents((prev) => [event, ...prev].slice(0, 50));
    },
    (snap) => {
      setLiveSnapshot(snap);
    }
  );

  const effectiveSnapshot = liveSnapshot ?? snapshot;

  const healthColor = (h: number) =>
    h >= 85 ? "text-green-400" : h >= 65 ? "text-yellow-400" : h >= 45 ? "text-orange-400" : "text-red-400";

  const healthBg = (h: number) =>
    h >= 85 ? "from-green-500/20 to-emerald-500/10" :
    h >= 65 ? "from-yellow-500/20 to-amber-500/10" :
    h >= 45 ? "from-orange-500/20 to-red-500/10" :
    "from-red-600/30 to-red-800/10";

  const overallHealth = effectiveSnapshot?.overallHealth ?? 0;
  const modules = effectiveSnapshot?.modules ?? {};
  const kpis = effectiveSnapshot?.kpis ?? [];
  const causalHotspots = effectiveSnapshot?.causalHotspots ?? [];

  const topKpis = kpis.slice(0, 6);

  return (
    <div dir="rtl" className="min-h-screen bg-[#0a0e1a] text-white p-4 md:p-6 space-y-6">
      {/* HEADER — Overall Health Banner */}
      <div className={`rounded-2xl bg-gradient-to-br ${healthBg(overallHealth)} border border-white/10 p-6 shadow-2xl`}>
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="w-20 h-20 rounded-full bg-[#0a0e1a]/60 border-4 border-white/20 flex items-center justify-center">
                <Gauge className={`w-10 h-10 ${healthColor(overallHealth)}`} />
              </div>
              {connected ? (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-green-500 animate-pulse border-2 border-[#0a0e1a]" />
              ) : (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-gray-500 border-2 border-[#0a0e1a]" />
              )}
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-bold">מרכז שליטה — BASH44</h1>
              <p className="text-white/70 mt-1 flex items-center gap-2">
                {connected ? <><Wifi className="w-4 h-4 text-green-400" /> מחובר בזמן אמת</> : <><WifiOff className="w-4 h-4 text-gray-400" /> מנותק</>}
                <span className="opacity-50">•</span>
                <span>{effectiveSnapshot?.eventsPerMinute ?? 0} אירועים/דקה</span>
                <span className="opacity-50">•</span>
                <span>{effectiveSnapshot?.entitiesChangedLast5Min ?? 0} שינויים ב-5 דק'</span>
              </p>
            </div>
          </div>

          <div className="text-center md:text-left">
            <div className={`text-6xl md:text-7xl font-extrabold ${healthColor(overallHealth)} tabular-nums`}>
              {overallHealth.toFixed(0)}<span className="text-3xl opacity-60">/100</span>
            </div>
            <div className="text-white/60 text-sm mt-1">בריאות תפעולית כוללת</div>
          </div>

          <div className="grid grid-cols-2 gap-3 min-w-[280px]">
            <StatTile
              label="החלטות ממתינות"
              value={pendingDecisions.length}
              icon={Target}
              accent="text-yellow-400"
            />
            <StatTile
              label="ישויות בסיכון"
              value={attentionEntities.length}
              icon={AlertTriangle}
              accent="text-red-400"
            />
            <StatTile
              label="התראות קריטיות"
              value={effectiveSnapshot?.openCriticalAlerts?.length ?? 0}
              icon={Flame}
              accent="text-orange-400"
            />
            <StatTile
              label="רווח מ-AI"
              value={profitSummary?.profitImpact ? `₪${(profitSummary.profitImpact / 1000).toFixed(0)}K` : "—"}
              icon={Sparkles}
              accent="text-green-400"
            />
          </div>
        </div>
      </div>

      {/* AI BRAIN SITUATION */}
      {aiBrain && aiBrain.situation && (
        <Card className="bg-gradient-to-br from-cyan-900/20 to-blue-900/10 border-cyan-500/30">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-cyan-300">
              <Brain className="w-5 h-5" />
              ניתוח AI של המצב כרגע
              <Badge variant="outline" className="ml-auto text-xs border-cyan-500/40 text-cyan-300">
                ביטחון {(aiBrain.confidence * 100).toFixed(0)}%
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-white/90 text-base leading-relaxed">{aiBrain.situation}</p>
            {aiBrain.topConcerns.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs uppercase text-cyan-400/80 font-semibold">נקודות לתשומת לב</div>
                {aiBrain.topConcerns.slice(0, 5).map((c, i) => (
                  <div key={i} className={`flex items-start gap-3 p-3 rounded-lg border ${SEVERITY_COLORS[c.severity] ?? SEVERITY_COLORS.info}`}>
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <div className="font-semibold">{c.topic}</div>
                      <div className="text-sm opacity-80">{c.reasoning}</div>
                      {c.suggestedAction && (
                        <div className="text-xs mt-1 opacity-70 flex items-center gap-1">
                          <ArrowRight className="w-3 h-3" />
                          {c.suggestedAction}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {aiBrain.opportunities.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs uppercase text-green-400/80 font-semibold">הזדמנויות</div>
                {aiBrain.opportunities.slice(0, 3).map((o, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-green-500/10 border border-green-500/30">
                    <Lightbulb className="w-4 h-4 shrink-0 mt-0.5 text-green-400" />
                    <div className="flex-1">
                      <div className="font-semibold text-green-300">{o.topic}</div>
                      <div className="text-sm text-green-200/80">{o.reasoning}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* MODULE GRID — all 22 modules at a glance */}
      <div>
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
          <Activity className="w-5 h-5 text-cyan-400" />
          כל המודולים בזמן אמת
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-11 gap-3">
          {Object.entries(modules).map(([key, data]) => {
            const cfg = MODULE_LABELS[key] ?? { label: key, icon: Activity, color: "text-gray-400" };
            const Icon = cfg.icon;
            return (
              <div
                key={key}
                className="bg-[#0f1420]/80 border border-white/10 rounded-xl p-3 hover:border-cyan-500/40 transition-colors cursor-pointer"
              >
                <div className="flex items-center justify-between mb-2">
                  <Icon className={`w-4 h-4 ${cfg.color}`} />
                  <span className={`text-xs font-bold tabular-nums ${healthColor(data.health)}`}>
                    {data.health.toFixed(0)}
                  </span>
                </div>
                <div className="text-xs text-white/80 font-semibold mb-1 truncate">{cfg.label}</div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[10px] text-white/50">
                    <span>ישויות</span>
                    <span>{data.entitiesTotal}</span>
                  </div>
                  {data.entitiesAtRisk > 0 && (
                    <div className="flex items-center justify-between text-[10px] text-red-400">
                      <span>בסיכון</span>
                      <span>{data.entitiesAtRisk}</span>
                    </div>
                  )}
                  {data.openAlerts > 0 && (
                    <div className="flex items-center justify-between text-[10px] text-orange-400">
                      <span>התראות</span>
                      <span>{data.openAlerts}</span>
                    </div>
                  )}
                </div>
                <div className="mt-2 h-1 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className={`h-full ${data.health >= 85 ? "bg-green-500" : data.health >= 65 ? "bg-yellow-500" : data.health >= 45 ? "bg-orange-500" : "bg-red-500"}`}
                    style={{ width: `${data.health}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* KPIs */}
      {topKpis.length > 0 && (
        <div>
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <Target className="w-5 h-5 text-yellow-400" />
            KPI בזמן אמת
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {topKpis.map((kpi) => (
              <Card key={kpi.kpiKey} className="bg-[#0f1420] border-white/10">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs text-white/60 truncate">{kpi.kpiLabel}</div>
                    {kpi.trend === "up" && <ArrowUpRight className="w-4 h-4 text-green-400" />}
                    {kpi.trend === "down" && <ArrowDownRight className="w-4 h-4 text-red-400" />}
                    {kpi.trend === "flat" && <Minus className="w-4 h-4 text-gray-400" />}
                  </div>
                  <div className="text-2xl font-bold tabular-nums">
                    {formatKpi(kpi.currentValue, kpi.unit)}
                  </div>
                  {kpi.deltaPercent != null && Math.abs(kpi.deltaPercent) > 0.1 && (
                    <div className={`text-xs mt-1 ${kpi.deltaPercent > 0 ? "text-green-400" : "text-red-400"}`}>
                      {kpi.deltaPercent > 0 ? "+" : ""}{kpi.deltaPercent.toFixed(1)}%
                    </div>
                  )}
                  {kpi.status && (
                    <Badge
                      variant="outline"
                      className={`mt-2 text-[10px] ${
                        kpi.status === "critical" ? "border-red-500/40 text-red-300" :
                        kpi.status === "warning" ? "border-yellow-500/40 text-yellow-300" :
                        kpi.status === "exceeding" ? "border-green-500/40 text-green-300" :
                        "border-blue-500/40 text-blue-300"
                      }`}
                    >
                      {kpi.status}
                    </Badge>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* 3-COLUMN: Decisions | Events | Attention */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Pending Decisions */}
        <Card className="bg-[#0f1420] border-yellow-500/20">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-yellow-300">
              <Target className="w-5 h-5" />
              החלטות ממתינות
              <Badge variant="outline" className="ml-auto border-yellow-500/40 text-yellow-300">
                {pendingDecisions.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[420px] pr-2">
              {pendingDecisions.length === 0 ? (
                <div className="text-center py-8 text-white/40">
                  <CheckCircle2 className="w-10 h-10 mx-auto mb-2 opacity-50" />
                  אין החלטות ממתינות
                </div>
              ) : (
                <div className="space-y-2">
                  {pendingDecisions.map((d) => (
                    <div
                      key={d.id}
                      className={`p-3 rounded-lg border ${
                        d.priority === "critical" ? "bg-red-500/10 border-red-500/30" :
                        d.priority === "high" ? "bg-orange-500/10 border-orange-500/30" :
                        d.priority === "medium" ? "bg-yellow-500/10 border-yellow-500/30" :
                        "bg-blue-500/10 border-blue-500/30"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-sm truncate">{d.title}</div>
                          <div className="text-xs text-white/60 truncate">{d.summary}</div>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="outline" className="text-[10px]">{d.category}</Badge>
                            <Badge variant="outline" className="text-[10px]">ציון {d.score.toFixed(0)}</Badge>
                            {d.estimatedProfitImpact != null && (
                              <span className={`text-[10px] font-semibold ${d.estimatedProfitImpact >= 0 ? "text-green-400" : "text-red-400"}`}>
                                ₪{(d.estimatedProfitImpact / 1000).toFixed(1)}K
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      {d.status === "awaiting_approval" && (
                        <div className="flex gap-2 mt-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 h-7 text-xs border-green-500/40 text-green-400 hover:bg-green-500/10"
                            onClick={() => approve(d.id)}
                          >
                            <CheckCheck className="w-3 h-3 ml-1" />
                            אשר ובצע
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs border-red-500/40 text-red-400 hover:bg-red-500/10"
                            onClick={() => reject(d.id)}
                          >
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                      )}
                      {d.status === "auto_approved" && (
                        <Badge variant="outline" className="mt-2 text-[10px] border-cyan-500/40 text-cyan-300">
                          <Zap className="w-3 h-3 ml-1" />
                          אישור אוטומטי
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Live Event Stream */}
        <Card className="bg-[#0f1420] border-cyan-500/20">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-cyan-300">
              <Activity className="w-5 h-5" />
              זרם אירועים חי
              <span className="ml-auto flex items-center gap-1 text-xs">
                {connected ? (
                  <><span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" /> חי</>
                ) : (
                  <><span className="w-2 h-2 rounded-full bg-gray-500" /> מנותק</>
                )}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[420px] pr-2">
              {liveEvents.length === 0 ? (
                <div className="text-center py-8 text-white/40">
                  <Clock className="w-10 h-10 mx-auto mb-2 opacity-50" />
                  ממתין לאירועים...
                </div>
              ) : (
                <div className="space-y-1">
                  {liveEvents.map((e, i) => {
                    const cfg = MODULE_LABELS[e.sourceModule] ?? { label: e.sourceModule, icon: Activity, color: "text-gray-400" };
                    const Icon = cfg.icon;
                    return (
                      <div
                        key={`${e.id ?? i}-${e.eventType}`}
                        className={`flex items-center gap-2 p-2 rounded text-xs border ${SEVERITY_COLORS[e.severity ?? "info"]}`}
                      >
                        <Icon className={`w-3 h-3 shrink-0 ${cfg.color}`} />
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold truncate">{e.eventType}</div>
                          <div className="opacity-70 truncate text-[10px]">{e.entityLabel ?? e.entityId}</div>
                        </div>
                        <div className="text-[10px] opacity-50">
                          {e.occurredAt ? new Date(e.occurredAt).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—"}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Entities Needing Attention */}
        <Card className="bg-[#0f1420] border-red-500/20">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-red-300">
              <AlertTriangle className="w-5 h-5" />
              ישויות בדרישת תשומת לב
              <Badge variant="outline" className="ml-auto border-red-500/40 text-red-300">
                {attentionEntities.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[420px] pr-2">
              {attentionEntities.length === 0 ? (
                <div className="text-center py-8 text-white/40">
                  <CheckCircle2 className="w-10 h-10 mx-auto mb-2 opacity-50 text-green-500" />
                  הכל תחת שליטה
                </div>
              ) : (
                <div className="space-y-2">
                  {attentionEntities.map((ent) => {
                    const cfg = MODULE_LABELS[ent.module] ?? { label: ent.module, icon: Activity, color: "text-gray-400" };
                    const Icon = cfg.icon;
                    return (
                      <div key={`${ent.entityType}-${ent.entityId}`} className={`p-3 rounded-lg border ${
                        ent.riskLevel === "critical" ? "bg-red-500/10 border-red-500/30" :
                        ent.riskLevel === "high" ? "bg-orange-500/10 border-orange-500/30" :
                        "bg-yellow-500/10 border-yellow-500/30"
                      }`}>
                        <div className="flex items-start gap-2">
                          <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${cfg.color}`} />
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-sm truncate">{ent.entityLabel ?? ent.entityId}</div>
                            <div className="text-xs text-white/60 truncate">
                              {cfg.label} · {ent.currentStatus}
                            </div>
                            {ent.downstreamCount != null && ent.downstreamCount > 0 && (
                              <div className="text-[10px] text-orange-300 mt-1">
                                משפיע על {ent.downstreamCount} ישויות
                              </div>
                            )}
                            {ent.progress != null && (
                              <Progress value={ent.progress} className="h-1 mt-2" />
                            )}
                          </div>
                          <Badge variant="outline" className={`text-[10px] shrink-0 ${
                            ent.riskLevel === "critical" ? "border-red-500/40 text-red-300" :
                            ent.riskLevel === "high" ? "border-orange-500/40 text-orange-300" :
                            "border-yellow-500/40 text-yellow-300"
                          }`}>
                            {ent.riskLevel}
                          </Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Causal Hotspots + Forward View */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {causalHotspots.length > 0 && (
          <Card className="bg-[#0f1420] border-orange-500/20">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-orange-300">
                <Flame className="w-5 h-5" />
                מוקדי השפעה (Causal Hotspots)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {causalHotspots.slice(0, 6).map((h, i) => (
                <div key={`${h.entityType}-${h.entityId}-${i}`} className="flex items-center gap-3 p-3 rounded-lg bg-orange-500/10 border border-orange-500/30">
                  <Flame className="w-4 h-4 text-orange-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm truncate">{h.entityLabel}</div>
                    <div className="text-xs text-white/60">משפיע על {h.downstreamCount} ישויות במורד הזרם</div>
                  </div>
                  <Badge variant="outline" className={`${
                    h.severity === "critical" ? "border-red-500/40 text-red-300" : "border-yellow-500/40 text-yellow-300"
                  }`}>
                    {h.severity}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {forecast.length > 0 && (
          <Card className="bg-[#0f1420] border-purple-500/20">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-purple-300">
                <Eye className="w-5 h-5" />
                מבט קדימה — מה צפוי לקרות
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {forecast.map((f, i) => (
                <div key={i} className={`p-3 rounded-lg border ${SEVERITY_COLORS[f.impact] ?? SEVERITY_COLORS.info}`}>
                  <div className="flex items-start gap-2">
                    <Clock className="w-4 h-4 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <div className="font-semibold text-sm">{f.prediction}</div>
                      <div className="flex items-center gap-2 mt-1 text-xs opacity-70">
                        <span>{f.timeframe}</span>
                        <span>•</span>
                        <span>סבירות {(f.likelihood * 100).toFixed(0)}%</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Forward View Stats */}
      {effectiveSnapshot?.forwardView && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatTile
            label="פרויקטים בסיכון"
            value={effectiveSnapshot.forwardView.projectsAtRisk}
            icon={Building2}
            accent="text-orange-400"
          />
          <StatTile
            label="חוסרי מלאי צפויים"
            value={effectiveSnapshot.forwardView.stockoutsImminent}
            icon={Package}
            accent="text-red-400"
          />
          <StatTile
            label="תשלומים מתקרבים"
            value={effectiveSnapshot.forwardView.paymentsDueSoon}
            icon={CreditCard}
            accent="text-yellow-400"
          />
          <StatTile
            label="התראות תזרים"
            value={effectiveSnapshot.forwardView.cashflowAlerts}
            icon={DollarSign}
            accent="text-cyan-400"
          />
        </div>
      )}
    </div>
  );
}

function StatTile({ label, value, icon: Icon, accent }: { label: string; value: string | number; icon: any; accent: string }) {
  return (
    <div className="bg-[#0a0e1a]/60 rounded-lg p-3 border border-white/10">
      <div className="flex items-center gap-2 text-xs text-white/60">
        <Icon className={`w-3 h-3 ${accent}`} />
        {label}
      </div>
      <div className={`text-2xl font-bold mt-1 ${accent}`}>{value}</div>
    </div>
  );
}

function formatKpi(v: number, unit?: string): string {
  if (unit === "currency") {
    if (Math.abs(v) >= 1_000_000) return `₪${(v / 1_000_000).toFixed(1)}M`;
    if (Math.abs(v) >= 1_000) return `₪${(v / 1_000).toFixed(0)}K`;
    return `₪${v.toFixed(0)}`;
  }
  if (unit === "percent") return `${v.toFixed(0)}%`;
  if (unit === "days") return `${v.toFixed(0)} ימים`;
  return v.toLocaleString("he-IL");
}
