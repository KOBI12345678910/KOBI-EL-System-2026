import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3, Mail, MessageSquare, Phone, Send, Bell, CheckCircle2,
  XCircle, Clock, AlertTriangle, Filter, RefreshCw, TrendingUp,
  Smartphone, Monitor
} from "lucide-react";
import { authFetch } from "@/lib/utils";

const API_BASE = "/api";

const CHANNEL_CONFIG: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; color: string; bg: string }> = {
  email: { label: "אימייל", icon: Mail, color: "text-emerald-400", bg: "bg-emerald-500/20" },
  whatsapp: { label: "WhatsApp", icon: MessageSquare, color: "text-green-400", bg: "bg-green-500/20" },
  sms: { label: "SMS", icon: Phone, color: "text-orange-400", bg: "bg-orange-500/20" },
  telegram: { label: "Telegram", icon: Send, color: "text-sky-400", bg: "bg-sky-500/20" },
  slack: { label: "Slack", icon: Bell, color: "text-purple-400", bg: "bg-purple-500/20" },
  browser_push: { label: "דפדפן Push", icon: Monitor, color: "text-blue-400", bg: "bg-blue-500/20" },
  mobile_push: { label: "Mobile Push", icon: Smartphone, color: "text-violet-400", bg: "bg-violet-500/20" },
};

const STATUS_CONFIG: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; color: string; bg: string }> = {
  sent: { label: "נשלח", icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-500/10" },
  failed: { label: "נכשל", icon: XCircle, color: "text-red-400", bg: "bg-red-500/10" },
  skipped: { label: "דולג", icon: AlertTriangle, color: "text-amber-400", bg: "bg-amber-500/10" },
  pending: { label: "ממתין", icon: Clock, color: "text-blue-400", bg: "bg-blue-500/10" },
  delivered: { label: "נמסר", icon: CheckCircle2, color: "text-teal-400", bg: "bg-teal-500/10" },
  opened: { label: "נפתח", icon: CheckCircle2, color: "text-purple-400", bg: "bg-purple-500/10" },
};

interface DeliveryLog {
  id: number;
  notificationId: number;
  channel: string;
  status: string;
  recipientUserId: number | null;
  recipientEmail: string | null;
  recipientPhone: string | null;
  errorMessage: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  openedAt: string | null;
  createdAt: string;
  metadata: Record<string, unknown> | null;
}

interface ChannelStats {
  channel: string;
  total: number;
  sent: number;
  failed: number;
  skipped: number;
  successRate: number;
}

interface DeliveryStats {
  total: number;
  sent: number;
  failed: number;
  skipped: number;
}

export default function DeliveryDashboardPage() {
  const [selectedChannel, setSelectedChannel] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [limit, setLimit] = useState(50);

  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useQuery<DeliveryStats>({
    queryKey: ["notification-delivery-stats"],
    queryFn: async () => {
      const r = await authFetch(`${API_BASE}/notification-delivery-stats`);
      if (!r.ok) return { total: 0, sent: 0, failed: 0, skipped: 0 };
      return r.json();
    },
    staleTime: 30000,
  });

  const { data: logs = [], isLoading: logsLoading, refetch: refetchLogs } = useQuery<DeliveryLog[]>({
    queryKey: ["notification-delivery-log", selectedChannel, selectedStatus, limit],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: String(limit) });
      if (selectedChannel !== "all") params.set("channel", selectedChannel);
      if (selectedStatus !== "all") params.set("status", selectedStatus);
      const r = await authFetch(`${API_BASE}/notification-delivery-log?${params}`);
      if (!r.ok) return [];
      return r.json();
    },
    staleTime: 15000,
  });

  const channelStats: ChannelStats[] = React.useMemo(() => {
    const map: Record<string, ChannelStats> = {};
    for (const log of logs) {
      if (!map[log.channel]) {
        map[log.channel] = { channel: log.channel, total: 0, sent: 0, failed: 0, skipped: 0, successRate: 0 };
      }
      map[log.channel].total++;
      if (log.status === "sent" || log.status === "delivered") map[log.channel].sent++;
      else if (log.status === "failed") map[log.channel].failed++;
      else if (log.status === "skipped") map[log.channel].skipped++;
    }
    return Object.values(map).map(s => ({
      ...s,
      successRate: s.total > 0 ? Math.round((s.sent / s.total) * 100) : 0,
    }));
  }, [logs]);

  const successRate = stats?.total ? Math.round(((stats.sent || 0) / stats.total) * 100) : 0;

  function refresh() {
    refetchStats();
    refetchLogs();
  }

  return (
    <div className="space-y-4 sm:space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center border border-blue-500/20">
            <BarChart3 className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h1 className="text-lg sm:text-2xl font-bold">לוח שליחות התראות</h1>
            <p className="text-sm text-muted-foreground">ניטור סטטוס שליחות בכל ערוצי התקשורת</p>
          </div>
        </div>
        <button
          onClick={refresh}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-card/5 hover:bg-card/10 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          רענן
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "סה״כ שליחות", value: stats?.total || 0, icon: BarChart3, color: "text-blue-400", bg: "bg-blue-500/10" },
          { label: "נשלח", value: stats?.sent || 0, icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-500/10" },
          { label: "נכשל", value: stats?.failed || 0, icon: XCircle, color: "text-red-400", bg: "bg-red-500/10" },
          { label: "אחוז הצלחה", value: `${successRate}%`, icon: TrendingUp, color: "text-purple-400", bg: "bg-purple-500/10" },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="bg-card border border-border/50 rounded-xl p-4">
            <div className="flex items-center gap-2.5">
              <div className={`p-2 rounded-lg ${bg}`}>
                <Icon className={`w-4 h-4 ${color}`} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className={`text-xl font-bold ${color}`}>{value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {channelStats.length > 0 && (
        <div className="bg-card border border-border/50 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-border/30">
            <h2 className="text-sm font-semibold">ביצועים לפי ערוץ</h2>
          </div>
          <div className="divide-y divide-border/20">
            {channelStats.sort((a, b) => b.total - a.total).map(s => {
              const ch = CHANNEL_CONFIG[s.channel];
              const Icon = ch?.icon || Bell;
              return (
                <div key={s.channel} className="flex items-center gap-4 px-5 py-3">
                  <div className={`p-2 rounded-lg ${ch?.bg || "bg-card/5"}`}>
                    <Icon className={`w-4 h-4 ${ch?.color || "text-muted-foreground"}`} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium">{ch?.label || s.channel}</span>
                      <span className="text-xs text-muted-foreground">{s.total} סה״כ</span>
                    </div>
                    <div className="flex gap-2 mb-1">
                      <div className="flex-1 h-2 bg-card/5 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full"
                          style={{ width: `${s.successRate}%` }}
                        />
                      </div>
                      <span className="text-xs font-medium text-emerald-400">{s.successRate}%</span>
                    </div>
                    <div className="flex gap-3 text-[10px] text-muted-foreground">
                      <span className="text-emerald-400">{s.sent} נשלחו</span>
                      {s.failed > 0 && <span className="text-red-400">{s.failed} נכשלו</span>}
                      {s.skipped > 0 && <span className="text-amber-400">{s.skipped} דולגו</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="bg-card border border-border/50 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-border/30 flex items-center justify-between">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted-foreground" />
            יומן שליחות
          </h2>
          <div className="flex items-center gap-2">
            <select
              value={selectedChannel}
              onChange={e => setSelectedChannel(e.target.value)}
              className="px-2 py-1 bg-card/5 border border-border/30 rounded text-xs"
            >
              <option value="all">כל הערוצים</option>
              {Object.entries(CHANNEL_CONFIG).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
            <select
              value={selectedStatus}
              onChange={e => setSelectedStatus(e.target.value)}
              className="px-2 py-1 bg-card/5 border border-border/30 rounded text-xs"
            >
              <option value="all">כל הסטטוסים</option>
              {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>
        </div>

        {logsLoading ? (
          <div className="text-center py-8 text-muted-foreground text-sm">טוען נתונים...</div>
        ) : logs.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            <BarChart3 className="w-10 h-10 mx-auto mb-3 opacity-20" />
            <p className="text-sm">אין נתוני שליחה עבור הפילטר הנבחר</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/20 text-xs text-muted-foreground">
                  <th className="px-4 py-3 text-right font-medium">זמן</th>
                  <th className="px-4 py-3 text-right font-medium">ערוץ</th>
                  <th className="px-4 py-3 text-right font-medium">סטטוס</th>
                  <th className="px-4 py-3 text-right font-medium">נמען</th>
                  <th className="px-4 py-3 text-right font-medium">פרטים</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/10">
                {logs.map(log => {
                  const ch = CHANNEL_CONFIG[log.channel];
                  const st = STATUS_CONFIG[log.status] || { label: log.status, icon: Clock, color: "text-muted-foreground", bg: "bg-card/5" };
                  const ChIcon = ch?.icon || Bell;
                  const StIcon = st.icon;
                  return (
                    <tr key={log.id} className="hover:bg-card/[0.02]">
                      <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString("he-IL", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`flex items-center gap-1.5 text-xs ${ch?.color || "text-muted-foreground"}`}>
                          <ChIcon className="w-3.5 h-3.5" />
                          {ch?.label || log.channel}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${st.bg} ${st.color}`}>
                          <StIcon className="w-3 h-3" />
                          {st.label}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">
                        {log.recipientEmail || log.recipientPhone || (log.recipientUserId ? `משתמש #${log.recipientUserId}` : "—")}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground max-w-xs truncate">
                        {log.errorMessage || (log.sentAt ? `נשלח: ${new Date(log.sentAt).toLocaleTimeString("he-IL")}` : "")}
                        {log.deliveredAt && <span className="text-teal-400 mr-2">נמסר ✓</span>}
                        {log.openedAt && <span className="text-purple-400 mr-2">נפתח ✓</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {logs.length >= limit && (
              <div className="px-5 py-3 border-t border-border/20 text-center">
                <button
                  onClick={() => setLimit(l => l + 50)}
                  className="text-xs text-primary hover:underline"
                >
                  טען עוד...
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
