import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Monitor, Smartphone, Globe, Clock, Trash2, LogOut,
  Shield, Users, AlertCircle, CheckCircle, X, Loader2,
  RefreshCw, MapPin, Activity, Settings, Lock
} from "lucide-react";

interface Session {
  id: number;
  userId?: number;
  ipAddress: string | null;
  userAgent: string | null;
  deviceName: string | null;
  location: string | null;
  fingerprint: string | null;
  isActive: boolean;
  isMfaVerified: boolean;
  expiresAt: string;
  lastActivityAt: string;
  createdAt: string;
  userName?: string;
  userEmail?: string;
  username?: string;
}

interface SessionConfig {
  idleTimeoutMinutes: number;
  absoluteTimeoutHours: number;
  concurrentSessionLimit: number;
  fingerprintEnabled: boolean;
}

function DeviceIcon({ deviceName }: { deviceName: string | null }) {
  const name = deviceName?.toLowerCase() || "";
  if (name.includes("iphone") || name.includes("android") || name.includes("ipad")) {
    return <Smartphone className="h-4 w-4 text-blue-400" />;
  }
  return <Monitor className="h-4 w-4 text-slate-400" />;
}

function timeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (seconds < 60) return "עכשיו";
  if (seconds < 3600) return `לפני ${Math.floor(seconds / 60)} דקות`;
  if (seconds < 86400) return `לפני ${Math.floor(seconds / 3600)} שעות`;
  return `לפני ${Math.floor(seconds / 86400)} ימים`;
}

export default function SessionManagementSection() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"my-sessions" | "all-sessions" | "config">("my-sessions");
  const [configForm, setConfigForm] = useState<SessionConfig | null>(null);

  const user = JSON.parse(localStorage.getItem("user") || "null");
  const isAdmin = user?.isSuperAdmin;

  const { data: mySessions = [], isLoading: myLoading, refetch: refetchMy } = useQuery<Session[]>({
    queryKey: ["my-sessions"],
    queryFn: async () => {
      const r = await authFetch(`/api/sessions/admin/user/${user?.id}`);
      if (!r.ok) return [];
      const data = await r.json();
      return data.sessions || [];
    },
    enabled: !!user?.id,
  });

  const { data: allSessions = [], isLoading: allLoading, refetch: refetchAll } = useQuery<Session[]>({
    queryKey: ["all-sessions-admin"],
    queryFn: async () => {
      const r = await authFetch("/api/sessions/admin/all");
      if (!r.ok) return [];
      const data = await r.json();
      return data.sessions || [];
    },
    enabled: isAdmin && activeTab === "all-sessions",
  });

  const { data: sessionConfig, isLoading: configLoading } = useQuery<SessionConfig>({
    queryKey: ["session-config"],
    queryFn: async () => {
      const r = await authFetch("/api/sessions/config");
      if (!r.ok) throw new Error("Failed to load config");
      return r.json();
    },
    enabled: isAdmin && activeTab === "config",
    onSuccess: (data) => setConfigForm(data),
  });

  const revokeSession = useMutation({
    mutationFn: async (sessionId: number) => {
      const r = await authFetch(`/api/sessions/admin/${sessionId}`, { method: "DELETE" });
      if (!r.ok) throw new Error("Failed to revoke session");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["all-sessions-admin"] });
      setSuccess("חיבור בוטל בהצלחה");
    },
    onError: (e: Error) => setError(e.message),
  });

  const revokeUserSessions = useMutation({
    mutationFn: async (userId: number) => {
      const r = await authFetch(`/api/sessions/admin/user/${userId}/all`, { method: "DELETE" });
      if (!r.ok) throw new Error("Failed to revoke sessions");
      return r.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["all-sessions-admin"] });
      setSuccess(`${data.count} חיבורים בוטלו`);
    },
    onError: (e: Error) => setError(e.message),
  });

  const saveConfig = useMutation({
    mutationFn: async (config: SessionConfig) => {
      const r = await authFetch("/api/sessions/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (!r.ok) throw new Error("Failed to save config");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["session-config"] });
      setSuccess("הגדרות session עודכנו");
    },
    onError: (e: Error) => setError(e.message),
  });

  const sessionsByUser = allSessions.reduce((acc: Record<string, Session[]>, s) => {
    const key = `${s.userId}:${s.userName || s.username}`;
    if (!acc[key]) acc[key] = [];
    acc[key]!.push(s);
    return acc;
  }, {});

  const displaySessions = activeTab === "all-sessions" ? allSessions : mySessions;
  const isLoading = activeTab === "all-sessions" ? allLoading : myLoading;

  return (
    <div className="p-4 md:p-6 space-y-6" dir="rtl">
      {error && (
        <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span className="text-sm">{error}</span>
          <button onClick={() => setError(null)} className="mr-auto"><X className="h-4 w-4" /></button>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/30 rounded-lg p-3 text-green-400">
          <CheckCircle className="h-4 w-4 flex-shrink-0" />
          <span className="text-sm">{success}</span>
          <button onClick={() => setSuccess(null)} className="mr-auto"><X className="h-4 w-4" /></button>
        </div>
      )}

      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
          <Activity className="h-5 w-5 text-purple-400" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-foreground">ניהול חיבורים פעילים</h2>
          <p className="text-sm text-slate-400">צפה ושלוט בחיבורים הפעילים למערכת</p>
        </div>
      </div>

      <div className="flex gap-2 border-b border-border pb-0">
        <button
          onClick={() => setActiveTab("my-sessions")}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${activeTab === "my-sessions" ? "border-purple-400 text-purple-400" : "border-transparent text-slate-400 hover:text-foreground"}`}
        >
          החיבורים שלי
        </button>
        {isAdmin && (
          <>
            <button
              onClick={() => setActiveTab("all-sessions")}
              className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${activeTab === "all-sessions" ? "border-purple-400 text-purple-400" : "border-transparent text-slate-400 hover:text-foreground"}`}
            >
              כל החיבורים
            </button>
            <button
              onClick={() => setActiveTab("config")}
              className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${activeTab === "config" ? "border-purple-400 text-purple-400" : "border-transparent text-slate-400 hover:text-foreground"}`}
            >
              הגדרות
            </button>
          </>
        )}
      </div>

      {activeTab === "config" && isAdmin && (
        <div className="space-y-4">
          {configLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-purple-400" /></div>
          ) : (
            <Card className="bg-card border-border">
              <CardContent className="p-5 space-y-4">
                <h3 className="text-foreground font-semibold flex items-center gap-2">
                  <Settings className="h-4 w-4 text-purple-400" />
                  הגדרות session
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-slate-300 text-xs">פסק זמן עצלות (דקות)</Label>
                    <Input
                      type="number"
                      value={configForm?.idleTimeoutMinutes ?? sessionConfig?.idleTimeoutMinutes ?? 30}
                      onChange={e => setConfigForm(p => ({ ...p!, idleTimeoutMinutes: parseInt(e.target.value) }))}
                      className="bg-input border-border text-foreground"
                      min="5" max="1440"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-slate-300 text-xs">פסק זמן מוחלט (שעות)</Label>
                    <Input
                      type="number"
                      value={configForm?.absoluteTimeoutHours ?? sessionConfig?.absoluteTimeoutHours ?? 72}
                      onChange={e => setConfigForm(p => ({ ...p!, absoluteTimeoutHours: parseInt(e.target.value) }))}
                      className="bg-input border-border text-foreground"
                      min="1" max="720"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-slate-300 text-xs">מקסימום חיבורים בו-זמניים</Label>
                    <Input
                      type="number"
                      value={configForm?.concurrentSessionLimit ?? sessionConfig?.concurrentSessionLimit ?? 5}
                      onChange={e => setConfigForm(p => ({ ...p!, concurrentSessionLimit: parseInt(e.target.value) }))}
                      className="bg-input border-border text-foreground"
                      min="1" max="50"
                    />
                  </div>
                  <div className="flex items-end">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setConfigForm(p => ({ ...p!, fingerprintEnabled: !(p?.fingerprintEnabled ?? sessionConfig?.fingerprintEnabled ?? true) }))}
                        className={`w-11 h-6 rounded-full transition-colors relative ${(configForm?.fingerprintEnabled ?? sessionConfig?.fingerprintEnabled ?? true) ? "bg-purple-500" : "bg-muted"}`}
                      >
                        <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-all ${(configForm?.fingerprintEnabled ?? sessionConfig?.fingerprintEnabled ?? true) ? "right-0.5" : "right-[22px]"}`} />
                      </button>
                      <div>
                        <span className="text-sm text-slate-300">הגנת טביעת אצבע</span>
                        <p className="text-xs text-slate-500">IP + User-Agent binding</p>
                      </div>
                    </div>
                  </div>
                </div>
                <Button
                  onClick={() => configForm && saveConfig.mutate(configForm)}
                  disabled={saveConfig.isPending}
                  className="bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 border border-purple-500/30"
                  variant="outline"
                >
                  {saveConfig.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "שמור הגדרות"}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {activeTab !== "config" && (
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <p className="text-sm text-slate-400">
              {displaySessions.length} חיבורים פעילים
            </p>
            <button
              onClick={() => activeTab === "all-sessions" ? refetchAll() : refetchMy()}
              className="text-slate-400 hover:text-foreground"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-purple-400" /></div>
          ) : displaySessions.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <Activity className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>אין חיבורים פעילים</p>
            </div>
          ) : (
            activeTab === "all-sessions" ? (
              Object.entries(sessionsByUser).map(([userKey, sessions]) => {
                const firstSession = sessions[0]!;
                const userId = firstSession.userId!;
                return (
                  <Card key={userKey} className="bg-card border-border">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 bg-purple-500/20 rounded-full flex items-center justify-center">
                            <Users className="h-3.5 w-3.5 text-purple-400" />
                          </div>
                          <div>
                            <p className="text-foreground text-sm font-medium">{firstSession.userName || firstSession.username || `User #${userId}`}</p>
                            <p className="text-xs text-slate-400">{firstSession.userEmail}</p>
                          </div>
                          <Badge className="bg-purple-500/20 text-purple-400 text-xs">{sessions.length} חיבורים</Badge>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-red-500/30 text-red-400 hover:bg-red-500/10 text-xs"
                          onClick={() => revokeUserSessions.mutate(userId)}
                          disabled={revokeUserSessions.isPending}
                        >
                          <LogOut className="h-3 w-3 ml-1" />
                          נתק הכל
                        </Button>
                      </div>
                      <div className="space-y-2">
                        {sessions.map(session => (
                          <SessionRow
                            key={session.id}
                            session={session}
                            onRevoke={() => revokeSession.mutate(session.id)}
                            isPending={revokeSession.isPending}
                            currentUserId={user?.id}
                          />
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            ) : (
              mySessions.map(session => (
                <Card key={session.id} className="bg-card border-border">
                  <CardContent className="p-4">
                    <SessionRow
                      session={session}
                      onRevoke={() => revokeSession.mutate(session.id)}
                      isPending={revokeSession.isPending}
                      currentUserId={user?.id}
                    />
                  </CardContent>
                </Card>
              ))
            )
          )}
        </div>
      )}
    </div>
  );
}

function SessionRow({
  session,
  onRevoke,
  isPending,
  currentUserId,
}: {
  session: Session;
  onRevoke: () => void;
  isPending: boolean;
  currentUserId: number;
}) {
  return (
    <div className="flex items-center justify-between bg-input rounded-lg px-3 py-2.5">
      <div className="flex items-center gap-3">
        <DeviceIcon deviceName={session.deviceName} />
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm text-foreground">{session.deviceName || "Unknown Device"}</p>
            {session.isMfaVerified && (
              <Badge className="text-xs bg-green-500/20 text-green-400 px-1 py-0">MFA</Badge>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5">
            {session.ipAddress && (
              <span className="flex items-center gap-1">
                <Globe className="h-3 w-3" />
                {session.ipAddress}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {timeAgo(session.lastActivityAt)}
            </span>
          </div>
        </div>
      </div>
      <button
        onClick={onRevoke}
        disabled={isPending}
        className="p-1.5 text-slate-500 hover:text-red-400 transition-colors"
        title="בטל חיבור"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
