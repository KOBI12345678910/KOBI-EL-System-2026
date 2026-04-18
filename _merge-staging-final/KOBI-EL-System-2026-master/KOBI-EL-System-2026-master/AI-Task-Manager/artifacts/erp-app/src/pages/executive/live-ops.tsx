import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { authFetch } from "@/lib/utils";
import {
  Activity, Factory, ShoppingCart, Package, DollarSign, Users,
  AlertTriangle, AlertCircle, Info, CheckCircle2, RefreshCw,
  Clock, Wifi, WifiOff, Volume2, VolumeX, Filter, Bell,
  TrendingUp, Gauge, Zap, BarChart3
} from "lucide-react";

type LiveOpsCategory = "production" | "sales" | "inventory" | "finance" | "alerts" | "users";
type Severity = "critical" | "warning" | "info";

interface LiveEvent {
  id: string;
  category: LiveOpsCategory;
  severity: Severity;
  title: string;
  description: string;
  module?: string;
  timestamp: string;
  isNew?: boolean;
}

interface SnapshotData {
  production: {
    total: number; completed: number; inProgress: number; planned: number; overdue: number; efficiency: number;
  };
  sales: Array<{ id: number; orderNumber: string; customer: string; amount: number; status: string; time: string }>;
  finance: Array<{ id: number; description: string; amount: number; category: string; time: string }>;
  inventory: Array<{ id: number; name: string; current: number; minimum: number; severity: string }>;
  users: { activeCount: number; recentActions: Array<{ id: number; action: string; entityType: string; details: string; time: string; userId: number }> };
  alerts: Array<{ id: string; severity: string; title: string; description: string; category: string }>;
  connectedClients: number;
  history: LiveEvent[];
}

const CATEGORY_CONFIG: Record<LiveOpsCategory, { label: string; icon: any; color: string; bg: string }> = {
  production: { label: "ייצור", icon: Factory, color: "text-amber-400", bg: "bg-amber-500/15" },
  sales: { label: "מכירות", icon: ShoppingCart, color: "text-blue-400", bg: "bg-blue-500/15" },
  inventory: { label: "מלאי", icon: Package, color: "text-orange-400", bg: "bg-orange-500/15" },
  finance: { label: "פיננסי", icon: DollarSign, color: "text-emerald-400", bg: "bg-emerald-500/15" },
  alerts: { label: "התראות", icon: AlertTriangle, color: "text-red-400", bg: "bg-red-500/15" },
  users: { label: "משתמשים", icon: Users, color: "text-purple-400", bg: "bg-purple-500/15" },
};

function SeverityBadge({ severity }: { severity: Severity }) {
  const config: Record<Severity, { label: string; className: string; icon: any }> = {
    critical: { label: "קריטי", className: "bg-red-500/20 text-red-400 border-red-500/30", icon: AlertCircle },
    warning: { label: "אזהרה", className: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30", icon: AlertTriangle },
    info: { label: "מידע", className: "bg-blue-500/20 text-blue-400 border-blue-500/30", icon: Info },
  };
  const c = config[severity] || config.info;
  return (
    <Badge className={`${c.className} border text-[10px] gap-1`}>
      <c.icon className="h-2.5 w-2.5" />
      {c.label}
    </Badge>
  );
}

function fmtTime(t: string) {
  try {
    return new Date(t).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch { return ""; }
}

function fmtCurrency(v: number) {
  if (Math.abs(v) >= 1_000_000) return `₪${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `₪${(v / 1_000).toFixed(0)}K`;
  return `₪${v.toLocaleString("he-IL")}`;
}

export default function LiveOpsPage() {
  const [snapshot, setSnapshot] = useState<SnapshotData | null>(null);
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<LiveOpsCategory | "all">("all");
  const [selectedSeverity, setSelectedSeverity] = useState<Severity | "all">("all");
  const [newCount, setNewCount] = useState(0);
  const eventSourceRef = useRef<EventSource | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sseRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchSnapshot = useCallback(async () => {
    try {
      const res = await authFetch("/api/live-ops/snapshot");
      if (res.ok) {
        const data: SnapshotData = await res.json();
        setSnapshot(data);
        if (data.history && data.history.length > 0) {
          setEvents(prev => {
            const existingIds = new Set(prev.map(e => e.id));
            const newEvents = data.history.filter(h => !existingIds.has(h.id));
            return [...newEvents, ...prev].slice(0, 200);
          });
        }
      }
    } catch (e) { console.error("Snapshot fetch error:", e); }
  }, []);

  const triggerSSERefresh = useCallback(() => {
    if (sseRefreshTimerRef.current) clearTimeout(sseRefreshTimerRef.current);
    sseRefreshTimerRef.current = setTimeout(() => {
      fetchSnapshot();
    }, 2000);
  }, [fetchSnapshot]);

  useEffect(() => {
    fetchSnapshot();
    let running = false;
    const interval = setInterval(async () => {
      if (running || document.hidden) return;
      running = true;
      try { await fetchSnapshot(); } finally { running = false; }
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchSnapshot]);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;

    const baseUrl = window.location.origin;
    const es = new EventSource(`${baseUrl}/api/live-ops/stream?token=${token}`);
    eventSourceRef.current = es;

    es.onopen = () => setConnected(true);

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === "connected") {
          setConnected(true);
          return;
        }
        if (data.eventType === "live-ops") {
          const event: LiveEvent = {
            id: data.id,
            category: data.category,
            severity: data.severity,
            title: data.title,
            description: data.description,
            module: data.module,
            timestamp: data.timestamp,
            isNew: true,
          };
          setEvents(prev => [event, ...prev].slice(0, 200));
          setNewCount(prev => prev + 1);

          if (data.severity === "critical" && audioRef.current && soundEnabled) {
            audioRef.current.play().catch(() => {});
          }

          triggerSSERefresh();

          setTimeout(() => {
            setEvents(prev => prev.map(ev => ev.id === event.id ? { ...ev, isNew: false } : ev));
          }, 3000);
        }
      } catch {}
    };

    es.onerror = () => {
      setConnected(false);
      setTimeout(() => {
        if (eventSourceRef.current) {
          eventSourceRef.current.close();
        }
      }, 5000);
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
      if (sseRefreshTimerRef.current) clearTimeout(sseRefreshTimerRef.current);
    };
  }, [soundEnabled, triggerSSERefresh]);

  const filteredEvents = events.filter(e => {
    if (selectedCategory !== "all" && e.category !== selectedCategory) return false;
    if (selectedSeverity !== "all" && e.severity !== selectedSeverity) return false;
    return true;
  });

  const categoryCounts = events.reduce((acc, e) => {
    acc[e.category] = (acc[e.category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const severityCounts = events.reduce((acc, e) => {
    acc[e.severity] = (acc[e.severity] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0a1a] via-[#111128] to-[#0a0a1a] p-4 md:p-6 space-y-4" dir="rtl">
      <audio ref={audioRef} preload="auto">
        <source src="data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdH+Jj4eFe3B0fIaRkY2Hf3d1e4OKjYyJhH56eHyDi46NiYR/enh8goqOjYqFf3p4fIOKjo2KhX96eHx/" type="audio/wav" />
      </audio>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-gradient-to-br from-red-600 to-orange-600 rounded-xl shadow-lg shadow-red-500/20 relative">
            <Activity className="w-6 h-6 text-foreground" />
            {connected && (
              <span className="absolute -top-1 -left-1 w-3 h-3 bg-emerald-500 rounded-full border-2 border-border animate-pulse" />
            )}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">מרכז פעילות חי</h1>
            <p className="text-sm text-muted-foreground">TECHNO-KOL UZI — Live Operations Center</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${connected ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"}`}>
            {connected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {connected ? "מחובר" : "מנותק"}
          </div>
          {snapshot && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Users className="w-3 h-3" />
              {snapshot.connectedClients} צופים
            </span>
          )}
          <Button
            variant="outline" size="sm"
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="border-border text-gray-300 gap-1"
          >
            {soundEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
          </Button>
          <Button variant="outline" size="sm" onClick={() => { fetchSnapshot(); setNewCount(0); }} className="border-border text-gray-300 gap-1">
            <RefreshCw className="h-3.5 w-3.5" />
            רענון
          </Button>
        </div>
      </div>

      {snapshot && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <Card className="bg-card/80 border-border">
            <CardContent className="p-3 text-center">
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center mx-auto mb-1.5">
                <Factory className="h-4 w-4 text-amber-400" />
              </div>
              <p className="text-lg font-bold font-mono text-amber-400">{snapshot.production.efficiency}%</p>
              <p className="text-[10px] text-muted-foreground">יעילות ייצור</p>
              <p className="text-[9px] text-muted-foreground">{snapshot.production.inProgress} בביצוע</p>
            </CardContent>
          </Card>
          <Card className="bg-card/80 border-border">
            <CardContent className="p-3 text-center">
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center mx-auto mb-1.5">
                <ShoppingCart className="h-4 w-4 text-blue-400" />
              </div>
              <p className="text-lg font-bold font-mono text-blue-400">{snapshot.sales.length}</p>
              <p className="text-[10px] text-muted-foreground">מכירות 24 שעות</p>
            </CardContent>
          </Card>
          <Card className="bg-card/80 border-border">
            <CardContent className="p-3 text-center">
              <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center mx-auto mb-1.5">
                <Package className="h-4 w-4 text-orange-400" />
              </div>
              <p className="text-lg font-bold font-mono text-orange-400">{snapshot.inventory.length}</p>
              <p className="text-[10px] text-muted-foreground">התראות מלאי</p>
            </CardContent>
          </Card>
          <Card className="bg-card/80 border-border">
            <CardContent className="p-3 text-center">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center mx-auto mb-1.5">
                <DollarSign className="h-4 w-4 text-emerald-400" />
              </div>
              <p className="text-lg font-bold font-mono text-emerald-400">{snapshot.finance.length}</p>
              <p className="text-[10px] text-muted-foreground">תנועות פיננסיות</p>
            </CardContent>
          </Card>
          <Card className="bg-card/80 border-border">
            <CardContent className="p-3 text-center">
              <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center mx-auto mb-1.5">
                <AlertTriangle className="h-4 w-4 text-red-400" />
              </div>
              <p className="text-lg font-bold font-mono text-red-400">{snapshot.alerts.length}</p>
              <p className="text-[10px] text-muted-foreground">התראות פעילות</p>
            </CardContent>
          </Card>
          <Card className="bg-card/80 border-border">
            <CardContent className="p-3 text-center">
              <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center mx-auto mb-1.5">
                <Users className="h-4 w-4 text-purple-400" />
              </div>
              <p className="text-lg font-bold font-mono text-purple-400">{snapshot.users.activeCount}</p>
              <p className="text-[10px] text-muted-foreground">משתמשים פעילים</p>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-8">
          <Card className="bg-card/80 border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Bell className="h-4 w-4 text-red-400" />
                  <h3 className="text-sm font-semibold text-foreground">זרם אירועים חי</h3>
                  {newCount > 0 && (
                    <Badge className="bg-red-500/20 text-red-400 border-0 text-[10px]">{newCount} חדשים</Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    <Filter className="h-3 w-3 text-muted-foreground" />
                    <select
                      value={selectedCategory}
                      onChange={(e) => setSelectedCategory(e.target.value as any)}
                      className="bg-muted text-xs text-gray-300 border-0 rounded px-2 py-1 outline-none"
                    >
                      <option value="all">כל המודולים</option>
                      {Object.entries(CATEGORY_CONFIG).map(([key, cfg]) => (
                        <option key={key} value={key}>{cfg.label} ({categoryCounts[key] || 0})</option>
                      ))}
                    </select>
                  </div>
                  <select
                    value={selectedSeverity}
                    onChange={(e) => setSelectedSeverity(e.target.value as any)}
                    className="bg-muted text-xs text-gray-300 border-0 rounded px-2 py-1 outline-none"
                  >
                    <option value="all">כל החומרות</option>
                    <option value="critical">קריטי ({severityCounts.critical || 0})</option>
                    <option value="warning">אזהרה ({severityCounts.warning || 0})</option>
                    <option value="info">מידע ({severityCounts.info || 0})</option>
                  </select>
                  <Button variant="ghost" size="sm" onClick={() => setNewCount(0)} className="text-xs text-muted-foreground">
                    סמן כנקראו
                  </Button>
                </div>
              </div>

              <div className="space-y-1.5 max-h-[500px] overflow-y-auto custom-scrollbar">
                {filteredEvents.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12">
                    <CheckCircle2 className="h-10 w-10 text-emerald-400/50 mb-3" />
                    <p className="text-sm text-muted-foreground">אין אירועים להצגה</p>
                    <p className="text-xs text-muted-foreground/70">אירועים חדשים יופיעו כאן בזמן אמת</p>
                  </div>
                ) : filteredEvents.map((event) => {
                  const catCfg = CATEGORY_CONFIG[event.category] || CATEGORY_CONFIG.alerts;
                  const CatIcon = catCfg.icon;
                  return (
                    <div
                      key={event.id}
                      className={`flex items-start gap-3 p-2.5 rounded-lg border transition-all duration-500 ${
                        event.isNew
                          ? "bg-blue-500/10 border-blue-500/30 animate-pulse"
                          : event.severity === "critical"
                            ? "bg-red-500/5 border-red-500/20"
                            : event.severity === "warning"
                              ? "bg-yellow-500/5 border-yellow-500/20"
                              : "bg-muted/30 border-border"
                      }`}
                    >
                      <div className={`p-1.5 rounded-lg ${catCfg.bg} flex-shrink-0 mt-0.5`}>
                        <CatIcon className={`h-3.5 w-3.5 ${catCfg.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-xs font-medium text-foreground truncate">{event.title}</span>
                          <SeverityBadge severity={event.severity} />
                        </div>
                        <p className="text-[11px] text-muted-foreground truncate">{event.description}</p>
                      </div>
                      <span className="text-[10px] text-muted-foreground/60 flex-shrink-0 font-mono">{fmtTime(event.timestamp)}</span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="col-span-12 lg:col-span-4 space-y-4">
          {snapshot && (
            <>
              <Card className="bg-card/80 border-border">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Factory className="h-4 w-4 text-amber-400" />
                    <h3 className="text-sm font-semibold text-foreground">סטטוס ייצור</h3>
                  </div>
                  <div className="space-y-2.5">
                    {[
                      { label: "בביצוע", value: snapshot.production.inProgress, color: "bg-amber-500", total: snapshot.production.total },
                      { label: "מתוכנן", value: snapshot.production.planned, color: "bg-blue-500", total: snapshot.production.total },
                      { label: "הושלם", value: snapshot.production.completed, color: "bg-emerald-500", total: snapshot.production.total },
                    ].map((item, i) => (
                      <div key={i}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-muted-foreground">{item.label}</span>
                          <span className="text-foreground font-mono">{item.value}</span>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className={`h-full ${item.color} rounded-full transition-all duration-700`}
                            style={{ width: `${item.total > 0 ? (item.value / item.total) * 100 : 0}%` }} />
                        </div>
                      </div>
                    ))}
                    {snapshot.production.overdue > 0 && (
                      <div className="flex items-center gap-2 p-2 rounded-lg bg-red-500/10 border border-red-500/20 mt-2">
                        <AlertCircle className="h-3.5 w-3.5 text-red-400" />
                        <span className="text-xs text-red-400">{snapshot.production.overdue} פקודות באיחור</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-card/80 border-border">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <ShoppingCart className="h-4 w-4 text-blue-400" />
                    <h3 className="text-sm font-semibold text-foreground">מכירות אחרונות</h3>
                  </div>
                  <div className="space-y-2 max-h-[160px] overflow-y-auto custom-scrollbar">
                    {snapshot.sales.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-3">אין מכירות ב-24 שעות אחרונות</p>
                    ) : snapshot.sales.slice(0, 5).map((sale) => (
                      <div key={sale.id} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-muted-foreground truncate">{sale.customer || sale.orderNumber}</span>
                        </div>
                        <span className="text-foreground font-mono flex-shrink-0">{fmtCurrency(sale.amount)}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-card/80 border-border">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <DollarSign className="h-4 w-4 text-emerald-400" />
                    <h3 className="text-sm font-semibold text-foreground">אירועים פיננסיים</h3>
                    {snapshot.finance.length > 0 && (
                      <Badge className="bg-emerald-500/20 text-emerald-400 border-0 text-[10px]">{snapshot.finance.length}</Badge>
                    )}
                  </div>
                  <div className="space-y-2 max-h-[160px] overflow-y-auto custom-scrollbar">
                    {snapshot.finance.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-3">אין תנועות פיננסיות ב-24 שעות</p>
                    ) : snapshot.finance.slice(0, 6).map((item) => (
                      <div key={item.id} className="flex items-center justify-between text-xs p-1.5 rounded bg-emerald-500/5">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-muted-foreground truncate">{item.description || item.category}</span>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-emerald-400 font-mono">{fmtCurrency(item.amount)}</span>
                          <span className="text-muted-foreground/50 font-mono text-[10px]">{fmtTime(item.time)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-card/80 border-border">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Package className="h-4 w-4 text-orange-400" />
                    <h3 className="text-sm font-semibold text-foreground">התראות מלאי</h3>
                    {snapshot.inventory.length > 0 && (
                      <Badge className="bg-orange-500/20 text-orange-400 border-0 text-[10px]">{snapshot.inventory.length}</Badge>
                    )}
                  </div>
                  <div className="space-y-2 max-h-[160px] overflow-y-auto custom-scrollbar">
                    {snapshot.inventory.length === 0 ? (
                      <div className="text-center py-3">
                        <CheckCircle2 className="h-6 w-6 text-emerald-400/50 mx-auto mb-1" />
                        <p className="text-xs text-muted-foreground">כל המלאי תקין</p>
                      </div>
                    ) : snapshot.inventory.map((item) => (
                      <div key={item.id} className={`flex items-center justify-between text-xs p-1.5 rounded ${item.severity === "critical" ? "bg-red-500/10" : "bg-yellow-500/10"}`}>
                        <span className="text-muted-foreground truncate">{item.name}</span>
                        <span className={`font-mono ${item.severity === "critical" ? "text-red-400" : "text-yellow-400"}`}>
                          {item.current}/{item.minimum}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-card/80 border-border">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Users className="h-4 w-4 text-purple-400" />
                    <h3 className="text-sm font-semibold text-foreground">פעילות משתמשים</h3>
                    <Badge className="bg-purple-500/20 text-purple-400 border-0 text-[10px]">{snapshot.users.activeCount} פעילים</Badge>
                  </div>
                  <div className="space-y-1.5 max-h-[140px] overflow-y-auto custom-scrollbar">
                    {snapshot.users.recentActions.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-3">אין פעילות אחרונה</p>
                    ) : snapshot.users.recentActions.slice(0, 6).map((action) => (
                      <div key={action.id} className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground truncate">{action.action} — {action.entityType}</span>
                        <span className="text-muted-foreground/60 font-mono flex-shrink-0 text-[10px]">{fmtTime(action.time)}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>

      {snapshot && snapshot.alerts.length > 0 && (
        <Card className="bg-gradient-to-r from-red-500/10 via-orange-500/10 to-yellow-500/10 border-red-500/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="h-4 w-4 text-red-400" />
              <h3 className="text-sm font-semibold text-foreground">התראות מערכת פעילות</h3>
              <Badge className="bg-red-500/20 text-red-400 border-0 text-[10px]">{snapshot.alerts.length}</Badge>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {snapshot.alerts.map((alert) => (
                <div key={alert.id} className={`p-3 rounded-lg border ${
                  alert.severity === "critical" ? "bg-red-500/10 border-red-500/30" : "bg-yellow-500/10 border-yellow-500/30"
                }`}>
                  <div className="flex items-start gap-2">
                    {alert.severity === "critical" ? <AlertCircle className="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5" /> : <AlertTriangle className="h-4 w-4 text-yellow-400 flex-shrink-0 mt-0.5" />}
                    <div>
                      <p className="text-xs font-medium text-foreground">{alert.title}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{alert.description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
