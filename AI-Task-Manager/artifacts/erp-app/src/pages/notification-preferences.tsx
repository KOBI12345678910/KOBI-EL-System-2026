import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  AlertTriangle,
  ClipboardList,
  ShieldCheck,
  Settings,
  GitBranch,
  Save,
  ArrowRight,
  Mail,
  MessageSquare,
  Smartphone,
  CheckCircle2,
  XCircle,
  Info,
  Monitor,
} from "lucide-react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { usePermissions } from "@/hooks/use-permissions";
import { authFetch } from "@/lib/utils";

const API_BASE = "/api";

const CATEGORIES = [
  { key: "anomaly", label: "חריגות עסקיות", description: "חריגות תקציב, מלאי נמוך, ביצועים חריגים", icon: AlertTriangle, color: "text-amber-400", bg: "bg-amber-500/10" },
  { key: "task", label: "משימות", description: "משימות חדשות, עדכוני משימות, תזכורות", icon: ClipboardList, color: "text-blue-400", bg: "bg-blue-500/10" },
  { key: "approval", label: "אישורים", description: "בקשות אישור, אישורים ממתינים, עדכוני אישורים", icon: ShieldCheck, color: "text-purple-400", bg: "bg-purple-500/10" },
  { key: "system", label: "מערכת", description: "עדכוני מערכת, תחזוקה, שינויי הגדרות", icon: Settings, color: "text-muted-foreground", bg: "bg-muted/10" },
  { key: "workflow", label: "תהליכי עבודה", description: "אירועי תהליכי עבודה, שינויי סטטוס, התראות אוטומטיות", icon: GitBranch, color: "text-emerald-400", bg: "bg-emerald-500/10" },
];

const PRIORITY_OPTIONS = [
  { value: "low", label: "הכל" },
  { value: "normal", label: "רגיל+" },
  { value: "high", label: "גבוה+" },
  { value: "critical", label: "קריטי" },
];

interface RoutingRule {
  id: number;
  notificationType: string;
  category: string;
  channelInApp: boolean;
  channelEmail: boolean;
  channelWhatsapp: boolean;
  minPriorityInApp: string;
  minPriorityEmail: string;
  minPriorityWhatsapp: string;
  isActive: boolean;
  description: string;
}

export default function NotificationPreferencesPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { permissions } = usePermissions();
  const isAdmin = permissions.isSuperAdmin;

  const [rules, setRules] = useState<Record<string, {
    inApp: boolean; email: boolean; whatsapp: boolean;
    browserPush: boolean; mobilePush: boolean;
    minInApp: string; minEmail: string; minWhatsapp: string;
    minBrowserPush: string; minMobilePush: string;
  }>>({});
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const { data: gmailStatus } = useQuery<{ connected: boolean; email?: string }>({
    queryKey: ["gmail-connection-status"],
    queryFn: async () => {
      try {
        const r = await authFetch(`${API_BASE}/integrations/connections`);
        if (!r.ok) return { connected: false };
        const conns = await r.json();
        const gmail = (conns.data || conns).find((c: any) => c.serviceType === "gmail" && c.isActive);
        if (gmail) {
          const config = gmail.authConfig || {};
          return { connected: true, email: config.username || gmail.name };
        }
        return { connected: false };
      } catch {
        return { connected: false };
      }
    },
    staleTime: 60000,
  });

  const { data: routingRules = [] } = useQuery<RoutingRule[]>({
    queryKey: ["notification-routing-rules"],
    queryFn: async () => {
      const r = await authFetch(`${API_BASE}/notification-routing-rules`);
      if (!r.ok) return [];
      const data = await r.json();
      return data.rules || data || [];
    },
  });

  useEffect(() => {
    const map: Record<string, any> = {};
    for (const cat of CATEGORIES) {
      const rule = routingRules.find((r) => r.category === cat.key);
      const fallback = routingRules.find((r) => r.category === "*");
      const src = rule || fallback;
      map[cat.key] = {
        inApp: src?.channelInApp ?? true,
        email: src?.channelEmail ?? false,
        whatsapp: src?.channelWhatsapp ?? false,
        browserPush: (src as any)?.channelBrowserPush ?? false,
        mobilePush: (src as any)?.channelMobilePush ?? false,
        minInApp: src?.minPriorityInApp ?? "low",
        minEmail: src?.minPriorityEmail ?? "high",
        minWhatsapp: src?.minPriorityWhatsapp ?? "critical",
        minBrowserPush: (src as any)?.minPriorityBrowserPush ?? "high",
        minMobilePush: (src as any)?.minPriorityMobilePush ?? "high",
      };
    }
    setRules(map);
  }, [routingRules]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const entries = Object.entries(rules).map(([category, r]) => ({
        category,
        channelInApp: r.inApp,
        channelEmail: r.email,
        channelWhatsapp: r.whatsapp,
        channelBrowserPush: r.browserPush,
        channelMobilePush: r.mobilePush,
        minPriorityInApp: r.minInApp,
        minPriorityEmail: r.minEmail,
        minPriorityWhatsapp: r.minWhatsapp,
        minPriorityBrowserPush: r.minBrowserPush,
        minPriorityMobilePush: r.minMobilePush,
      }));
      const r = await authFetch(`${API_BASE}/notification-routing-rules`, {
        method: "PUT",
        body: JSON.stringify({ rules: entries }),
      });
      if (!r.ok) throw new Error("Failed to save");
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-routing-rules"] });
      setSaved(true);
      setSaveError(null);
      setTimeout(() => setSaved(false), 3000);
    },
    onError: (err: any) => {
      setSaveError(err?.message || "שגיאה בשמירת ההגדרות");
      setTimeout(() => setSaveError(null), 5000);
    },
  });

  const { data: deliveryStats } = useQuery<{ total: number; sent: number; failed: number; skipped: number }>({
    queryKey: ["notification-delivery-stats"],
    queryFn: async () => {
      const r = await authFetch(`${API_BASE}/notification-delivery-stats`);
      if (!r.ok) return { total: 0, sent: 0, failed: 0, skipped: 0 };
      return r.json();
    },
    staleTime: 30000,
  });

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
            <Bell className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h1 className="text-lg sm:text-2xl font-bold">הגדרות התראות</h1>
            <p className="text-sm text-muted-foreground">ניהול ערוצי התראות — באפליקציה, במייל, ובוואטסאפ</p>
          </div>
        </div>
        <Link href="/notifications" className="flex items-center gap-2 px-3 py-2 rounded-lg bg-card/5 hover:bg-card/10 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowRight className="w-4 h-4" />
          חזרה להתראות
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className={`bg-card border rounded-xl p-4 flex items-center gap-3 ${gmailStatus?.connected ? "border-emerald-500/30" : "border-amber-500/30"}`}>
          <div className={`p-2.5 rounded-lg ${gmailStatus?.connected ? "bg-emerald-500/10" : "bg-amber-500/10"}`}>
            <Mail className={`w-5 h-5 ${gmailStatus?.connected ? "text-emerald-400" : "text-amber-400"}`} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium flex items-center gap-1.5">
              חיבור Gmail
              {gmailStatus?.connected ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <XCircle className="w-3.5 h-3.5 text-amber-400" />
              )}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {gmailStatus?.connected ? gmailStatus.email || "מחובר" : "לא מוגדר — הגדר באינטגרציות"}
            </p>
          </div>
        </div>

        <div className="bg-card border border-border/50 rounded-xl p-4 flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-blue-500/10">
            <MessageSquare className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <p className="text-sm font-medium">מיילים שנשלחו</p>
            <p className="text-xs text-muted-foreground">{deliveryStats?.sent ?? 0} נשלחו / {deliveryStats?.failed ?? 0} נכשלו</p>
          </div>
        </div>

        <div className="bg-card border border-border/50 rounded-xl p-4 flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-violet-500/10">
            <Smartphone className="w-5 h-5 text-violet-400" />
          </div>
          <div>
            <p className="text-sm font-medium">WhatsApp</p>
            <p className="text-xs text-muted-foreground">ערוץ נוסף — הגדר באינטגרציות</p>
          </div>
        </div>
      </div>

      <div className="bg-card border border-border/50 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-border/30">
          <h2 className="font-semibold">כללי ניתוב התראות</h2>
          <p className="text-xs text-muted-foreground mt-1">
            לכל קטגוריה בחר את ערוצי ההתראה ורמת העדיפות המינימלית
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/20 text-xs text-muted-foreground">
                <th className="px-6 py-3 text-right font-medium">קטגוריה</th>
                <th className="px-3 py-3 text-center font-medium">
                  <div className="flex flex-col items-center gap-0.5">
                    <Bell className="w-4 h-4" />
                    <span>באפליקציה</span>
                  </div>
                </th>
                <th className="px-3 py-3 text-center font-medium">
                  <div className="flex flex-col items-center gap-0.5">
                    <span className="text-xs">עדיפות מינ׳</span>
                  </div>
                </th>
                <th className="px-3 py-3 text-center font-medium">
                  <div className="flex flex-col items-center gap-0.5">
                    <Mail className="w-4 h-4" />
                    <span>מייל</span>
                  </div>
                </th>
                <th className="px-3 py-3 text-center font-medium">
                  <div className="flex flex-col items-center gap-0.5">
                    <span className="text-xs">עדיפות מינ׳</span>
                  </div>
                </th>
                <th className="px-3 py-3 text-center font-medium">
                  <div className="flex flex-col items-center gap-0.5">
                    <Smartphone className="w-4 h-4" />
                    <span>WhatsApp</span>
                  </div>
                </th>
                <th className="px-3 py-3 text-center font-medium">
                  <div className="flex flex-col items-center gap-0.5">
                    <span className="text-xs">עדיפות מינ׳</span>
                  </div>
                </th>
                <th className="px-3 py-3 text-center font-medium">
                  <div className="flex flex-col items-center gap-0.5">
                    <Monitor className="w-4 h-4" />
                    <span>Browser</span>
                  </div>
                </th>
                <th className="px-3 py-3 text-center font-medium">
                  <div className="flex flex-col items-center gap-0.5">
                    <span className="text-xs">עדיפות מינ׳</span>
                  </div>
                </th>
                <th className="px-3 py-3 text-center font-medium">
                  <div className="flex flex-col items-center gap-0.5">
                    <Smartphone className="w-4 h-4 text-violet-400" />
                    <span>Mobile</span>
                  </div>
                </th>
                <th className="px-3 py-3 text-center font-medium">
                  <div className="flex flex-col items-center gap-0.5">
                    <span className="text-xs">עדיפות מינ׳</span>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              {CATEGORIES.map((cat) => {
                const rule = rules[cat.key] || { inApp: true, email: false, whatsapp: false, browserPush: false, mobilePush: false, minInApp: "low", minEmail: "high", minWhatsapp: "critical", minBrowserPush: "high", minMobilePush: "high" };
                const Icon = cat.icon;

                return (
                  <tr key={cat.key} className="hover:bg-card/[0.02]">
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-3">
                        <div className={`p-1.5 rounded-lg ${cat.bg}`}>
                          <Icon className={`w-4 h-4 ${cat.color}`} />
                        </div>
                        <div>
                          <p className="text-sm font-medium">{cat.label}</p>
                          <p className="text-xs text-muted-foreground">{cat.description}</p>
                        </div>
                      </div>
                    </td>

                    <td className="px-3 py-3 text-center">
                      <ToggleSwitch checked={rule.inApp} onChange={(v) => setRules(prev => ({ ...prev, [cat.key]: { ...prev[cat.key], inApp: v } }))} />
                    </td>
                    <td className="px-3 py-3 text-center">
                      <PrioritySelect value={rule.minInApp} disabled={!rule.inApp} onChange={(v) => setRules(prev => ({ ...prev, [cat.key]: { ...prev[cat.key], minInApp: v } }))} />
                    </td>

                    <td className="px-3 py-3 text-center">
                      <ToggleSwitch checked={rule.email} onChange={(v) => setRules(prev => ({ ...prev, [cat.key]: { ...prev[cat.key], email: v } }))} />
                    </td>
                    <td className="px-3 py-3 text-center">
                      <PrioritySelect value={rule.minEmail} disabled={!rule.email} onChange={(v) => setRules(prev => ({ ...prev, [cat.key]: { ...prev[cat.key], minEmail: v } }))} />
                    </td>

                    <td className="px-3 py-3 text-center">
                      <ToggleSwitch checked={rule.whatsapp} onChange={(v) => setRules(prev => ({ ...prev, [cat.key]: { ...prev[cat.key], whatsapp: v } }))} />
                    </td>
                    <td className="px-3 py-3 text-center">
                      <PrioritySelect value={rule.minWhatsapp} disabled={!rule.whatsapp} onChange={(v) => setRules(prev => ({ ...prev, [cat.key]: { ...prev[cat.key], minWhatsapp: v } }))} />
                    </td>

                    <td className="px-3 py-3 text-center">
                      <ToggleSwitch checked={rule.browserPush ?? false} onChange={(v) => setRules(prev => ({ ...prev, [cat.key]: { ...prev[cat.key], browserPush: v } }))} />
                    </td>
                    <td className="px-3 py-3 text-center">
                      <PrioritySelect value={rule.minBrowserPush ?? "high"} disabled={!(rule.browserPush ?? false)} onChange={(v) => setRules(prev => ({ ...prev, [cat.key]: { ...prev[cat.key], minBrowserPush: v } }))} />
                    </td>

                    <td className="px-3 py-3 text-center">
                      <ToggleSwitch checked={rule.mobilePush ?? false} onChange={(v) => setRules(prev => ({ ...prev, [cat.key]: { ...prev[cat.key], mobilePush: v } }))} />
                    </td>
                    <td className="px-3 py-3 text-center">
                      <PrioritySelect value={rule.minMobilePush ?? "high"} disabled={!(rule.mobilePush ?? false)} onChange={(v) => setRules(prev => ({ ...prev, [cat.key]: { ...prev[cat.key], minMobilePush: v } }))} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {!gmailStatus?.connected && (
        <div className="flex items-start gap-3 p-4 bg-amber-500/5 border border-amber-500/20 rounded-xl">
          <Info className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-200">נדרש חיבור Gmail לשליחת מיילים</p>
            <p className="text-xs text-muted-foreground mt-1">
              כדי לשלוח התראות במייל, הגדר חיבור Gmail בדף{" "}
              <Link href="/integrations" className="text-blue-400 hover:underline">אינטגרציות</Link>
              {" "}→ הוסף חיבור חדש → Gmail (שם משתמש + סיסמת אפליקציה).
            </p>
          </div>
        </div>
      )}

      <div className="flex items-center justify-end gap-3">
        {saveError && (
          <span className="text-sm text-red-400 flex items-center gap-1.5">
            <XCircle className="w-4 h-4" />
            {saveError}
          </span>
        )}
        {saved && (
          <span className="text-sm text-emerald-400 flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4" />
            ההגדרות נשמרו בהצלחה
          </span>
        )}
        {isAdmin ? (
          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 font-medium"
          >
            <Save className="w-4 h-4" />
            {saveMutation.isPending ? "שומר..." : "שמור הגדרות"}
          </button>
        ) : (
          <span className="text-xs text-muted-foreground">צפייה בלבד — רק מנהלים יכולים לשנות הגדרות</span>
        )}
      </div>
    </div>
  );
}

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="relative inline-flex items-center cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="sr-only peer" />
      <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-card after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
    </label>
  );
}

function PrioritySelect({ value, disabled, onChange }: { value: string; disabled: boolean; onChange: (v: string) => void }) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className="px-2 py-1 bg-background border border-border/50 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-30 w-20"
    >
      {PRIORITY_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  );
}
