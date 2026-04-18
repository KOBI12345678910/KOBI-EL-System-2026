import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Settings, Plus, Trash2, Check, X, Mail, MessageSquare, Bell, Edit2,
  AlertTriangle, ChevronDown, ChevronUp, Info, Phone, Send, Monitor, Smartphone,
} from "lucide-react";
import { authFetch } from "@/lib/utils";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";

const API_BASE = "/api";

const NOTIFICATION_TYPES = [
  { value: "*", label: "כל סוגי ההתראות" },
  { value: "budget_exceeded", label: "חריגת תקציב" },
  { value: "low_inventory", label: "מלאי נמוך" },
  { value: "overdue_approval", label: "אישור מאוחר" },
  { value: "overdue_task", label: "משימה מאוחרת" },
  { value: "overdue_purchase_order", label: "הזמנת רכש מאוחרת" },
  { value: "overdue_work_order", label: "פקודת עבודה מאוחרת" },
  { value: "overdue_shipment", label: "משלוח מאוחר" },
  { value: "open_ncr", label: "אי-התאמות איכות פתוחות" },
];

const CATEGORIES = [
  { value: "anomaly", label: "חריגה" },
  { value: "task", label: "משימה" },
  { value: "approval", label: "אישור" },
  { value: "system", label: "מערכת" },
  { value: "workflow", label: "Workflow" },
];

const PRIORITIES = [
  { value: "low", label: "נמוך" },
  { value: "normal", label: "רגיל" },
  { value: "medium", label: "בינוני" },
  { value: "high", label: "גבוה" },
  { value: "critical", label: "קריטי" },
];

interface RoutingRule {
  id: number;
  notificationType: string;
  category: string;
  roleName: string | null;
  userId: number | null;
  channelInApp: boolean;
  channelEmail: boolean;
  channelWhatsapp: boolean;
  channelSms: boolean;
  channelTelegram: boolean;
  channelBrowserPush: boolean;
  channelMobilePush: boolean;
  minPriorityInApp: string;
  minPriorityEmail: string;
  minPriorityWhatsapp: string;
  minPrioritySms: string;
  minPriorityTelegram: string;
  minPriorityBrowserPush: string;
  minPriorityMobilePush: string;
  quietHoursEnabled: boolean;
  quietHoursFrom: string;
  quietHoursTo: string;
  quietHoursBypassPriority: string;
  isActive: boolean;
  description: string | null;
  createdAt: string;
}

interface RuleFormState {
  notificationType: string;
  category: string;
  roleName: string;
  channelInApp: boolean;
  channelEmail: boolean;
  channelWhatsapp: boolean;
  channelSms: boolean;
  channelTelegram: boolean;
  channelBrowserPush: boolean;
  channelMobilePush: boolean;
  minPriorityInApp: string;
  minPriorityEmail: string;
  minPriorityWhatsapp: string;
  minPrioritySms: string;
  minPriorityTelegram: string;
  minPriorityBrowserPush: string;
  minPriorityMobilePush: string;
  quietHoursEnabled: boolean;
  quietHoursFrom: string;
  quietHoursTo: string;
  quietHoursBypassPriority: string;
  description: string;
}

const DEFAULT_FORM: RuleFormState = {
  notificationType: "*",
  category: "anomaly",
  roleName: "",
  channelInApp: true,
  channelEmail: false,
  channelWhatsapp: false,
  channelSms: false,
  channelTelegram: false,
  channelBrowserPush: false,
  channelMobilePush: false,
  minPriorityInApp: "low",
  minPriorityEmail: "high",
  minPriorityWhatsapp: "critical",
  minPrioritySms: "critical",
  minPriorityTelegram: "high",
  minPriorityBrowserPush: "high",
  minPriorityMobilePush: "high",
  quietHoursEnabled: false,
  quietHoursFrom: "22:00",
  quietHoursTo: "08:00",
  quietHoursBypassPriority: "critical",
  description: "",
};

function getLabelForType(type: string) {
  return NOTIFICATION_TYPES.find(t => t.value === type)?.label || type;
}

function getLabelForPriority(p: string) {
  return PRIORITIES.find(x => x.value === p)?.label || p;
}

function ChannelCard({
  icon: Icon,
  iconColor,
  label,
  checked,
  onToggle,
  priority,
  onPriorityChange,
}: {
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  label: string;
  checked: boolean;
  onToggle: (v: boolean) => void;
  priority: string;
  onPriorityChange: (v: string) => void;
}) {
  return (
    <div className="bg-card/[0.03] rounded-xl p-4 border border-border/30">
      <div className="flex items-center gap-2 mb-3">
        <Icon className={`w-4 h-4 ${iconColor}`} />
        <span className="text-sm font-medium">{label}</span>
        <label className="mr-auto flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={checked}
            onChange={e => onToggle(e.target.checked)}
            className="rounded"
          />
          <span className="text-xs text-muted-foreground">פעיל</span>
        </label>
      </div>
      <div>
        <label className="block text-xs text-muted-foreground mb-1">עדיפות מינימלית</label>
        <select
          value={priority}
          onChange={e => onPriorityChange(e.target.value)}
          disabled={!checked}
          className="w-full px-2 py-1.5 bg-card/5 border border-border/50 rounded-lg text-xs focus:outline-none disabled:opacity-40"
        >
          {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
      </div>
    </div>
  );
}

export default function NotificationRoutingPage() {
  const queryClient = useQueryClient();
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<RuleFormState>(DEFAULT_FORM);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data: rules = [], isLoading } = useQuery<RoutingRule[]>({
    queryKey: ["notification-routing-rules"],
    queryFn: async () => {
      const r = await authFetch(`${API_BASE}/notification-routing-rules`);
      if (!r.ok) throw new Error("Failed to fetch");
      return r.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: RuleFormState) => {
      const r = await authFetch(`${API_BASE}/notification-routing-rules`, {
        method: "POST",
        body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error("Failed to create");
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-routing-rules"] });
      setShowForm(false);
      setForm(DEFAULT_FORM);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<RuleFormState & { isActive: boolean }> }) => {
      const r = await authFetch(`${API_BASE}/notification-routing-rules/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error("Failed to update");
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-routing-rules"] });
      setEditingId(null);
      setShowForm(false);
      setForm(DEFAULT_FORM);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await authFetch(`${API_BASE}/notification-routing-rules/${id}`, { method: "DELETE" });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notification-routing-rules"] }),
  });

  function startEdit(rule: RoutingRule) {
    setEditingId(rule.id);
    setForm({
      notificationType: rule.notificationType,
      category: rule.category,
      roleName: rule.roleName || "",
      channelInApp: rule.channelInApp,
      channelEmail: rule.channelEmail,
      channelWhatsapp: rule.channelWhatsapp,
      channelSms: rule.channelSms ?? false,
      channelTelegram: rule.channelTelegram ?? false,
      channelBrowserPush: (rule as any).channelBrowserPush ?? false,
      channelMobilePush: (rule as any).channelMobilePush ?? false,
      minPriorityInApp: rule.minPriorityInApp,
      minPriorityEmail: rule.minPriorityEmail,
      minPriorityWhatsapp: rule.minPriorityWhatsapp,
      minPrioritySms: rule.minPrioritySms ?? "critical",
      minPriorityTelegram: rule.minPriorityTelegram ?? "high",
      minPriorityBrowserPush: (rule as any).minPriorityBrowserPush ?? "high",
      minPriorityMobilePush: (rule as any).minPriorityMobilePush ?? "high",
      quietHoursEnabled: rule.quietHoursEnabled ?? false,
      quietHoursFrom: rule.quietHoursFrom || "22:00",
      quietHoursTo: rule.quietHoursTo || "08:00",
      quietHoursBypassPriority: rule.quietHoursBypassPriority || "critical",
      description: rule.description || "",
    });
    setShowForm(true);
  }

  function cancelForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(DEFAULT_FORM);
  }

  function handleSubmit() {
    if (editingId !== null) {
      updateMutation.mutate({ id: editingId, data: form });
    } else {
      createMutation.mutate(form);
    }
  }

  return (
    <div className="space-y-4 sm:space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center border border-purple-500/20">
            <Settings className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h1 className="text-lg sm:text-2xl font-bold">הגדרות ניתוב התראות</h1>
            <p className="text-sm text-muted-foreground">הגדר לכל סוג התראה את ערוצי השליחה ורמת העדיפות המינימלית</p>
          </div>
        </div>
        <button
          onClick={() => { cancelForm(); setShowForm(!showForm); }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          כלל חדש
        </button>
      </div>

      <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-4 flex items-start gap-3">
        <Info className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
        <div className="text-sm text-blue-300/80">
          <strong className="text-blue-300">איך עובד ניתוב התראות:</strong> כאשר נוצרת התראה, המערכת בודקת אם יש כלל ניתוב תואם לסוג ההתראה. אם הכלל מוגדר לשלוח בערוץ מסוים והתראה עומדת בסף העדיפות, היא תשלח אוטומטית לבעלי התפקיד המוגדר.
        </div>
      </div>

      {showForm && (
        <div className="bg-card border border-border/50 rounded-xl p-5">
          <h2 className="text-sm font-semibold mb-4">{editingId ? "עריכת כלל" : "כלל ניתוב חדש"}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5">סוג התראה</label>
              <select
                value={form.notificationType}
                onChange={e => setForm(f => ({ ...f, notificationType: e.target.value }))}
                className="w-full px-3 py-2 bg-card/5 border border-border/50 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {NOTIFICATION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5">קטגוריה</label>
              <select
                value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                className="w-full px-3 py-2 bg-card/5 border border-border/50 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5">תפקיד (אופציונלי)</label>
              <input
                type="text"
                placeholder="למשל: manager, admin..."
                value={form.roleName}
                onChange={e => setForm(f => ({ ...f, roleName: e.target.value }))}
                className="w-full px-3 py-2 bg-card/5 border border-border/50 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5">תיאור</label>
              <input
                type="text"
                placeholder="תיאור הכלל..."
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                className="w-full px-3 py-2 bg-card/5 border border-border/50 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <ChannelCard
              icon={Bell}
              iconColor="text-blue-400"
              label="In-App"
              checked={form.channelInApp}
              onToggle={v => setForm(f => ({ ...f, channelInApp: v }))}
              priority={form.minPriorityInApp}
              onPriorityChange={v => setForm(f => ({ ...f, minPriorityInApp: v }))}
            />
            <ChannelCard
              icon={Mail}
              iconColor="text-emerald-400"
              label="אימייל"
              checked={form.channelEmail}
              onToggle={v => setForm(f => ({ ...f, channelEmail: v }))}
              priority={form.minPriorityEmail}
              onPriorityChange={v => setForm(f => ({ ...f, minPriorityEmail: v }))}
            />
            <ChannelCard
              icon={MessageSquare}
              iconColor="text-green-400"
              label="WhatsApp"
              checked={form.channelWhatsapp}
              onToggle={v => setForm(f => ({ ...f, channelWhatsapp: v }))}
              priority={form.minPriorityWhatsapp}
              onPriorityChange={v => setForm(f => ({ ...f, minPriorityWhatsapp: v }))}
            />
            <ChannelCard
              icon={Phone}
              iconColor="text-orange-400"
              label="SMS"
              checked={form.channelSms}
              onToggle={v => setForm(f => ({ ...f, channelSms: v }))}
              priority={form.minPrioritySms}
              onPriorityChange={v => setForm(f => ({ ...f, minPrioritySms: v }))}
            />
            <ChannelCard
              icon={Send}
              iconColor="text-sky-400"
              label="Telegram"
              checked={form.channelTelegram}
              onToggle={v => setForm(f => ({ ...f, channelTelegram: v }))}
              priority={form.minPriorityTelegram}
              onPriorityChange={v => setForm(f => ({ ...f, minPriorityTelegram: v }))}
            />
            <ChannelCard
              icon={Monitor}
              iconColor="text-blue-300"
              label="Browser Push"
              checked={form.channelBrowserPush}
              onToggle={v => setForm(f => ({ ...f, channelBrowserPush: v }))}
              priority={form.minPriorityBrowserPush}
              onPriorityChange={v => setForm(f => ({ ...f, minPriorityBrowserPush: v }))}
            />
            <ChannelCard
              icon={Smartphone}
              iconColor="text-violet-400"
              label="Mobile Push"
              checked={form.channelMobilePush}
              onToggle={v => setForm(f => ({ ...f, channelMobilePush: v }))}
              priority={form.minPriorityMobilePush}
              onPriorityChange={v => setForm(f => ({ ...f, minPriorityMobilePush: v }))}
            />
          </div>

          <div className="mt-4 bg-card/[0.03] rounded-xl p-4 border border-border/30">
            <div className="flex items-center gap-3 mb-3">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <div
                  onClick={() => setForm(f => ({ ...f, quietHoursEnabled: !f.quietHoursEnabled }))}
                  className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer ${form.quietHoursEnabled ? "bg-purple-500" : "bg-muted"}`}
                >
                  <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${form.quietHoursEnabled ? "right-0.5" : "right-5"}`} />
                </div>
                <span className="text-sm font-medium">שעות שקטות</span>
              </label>
              <span className="text-xs text-muted-foreground">מנע שליחה בשעות מסוימות (למעט הודעות קריטיות)</span>
            </div>
            {form.quietHoursEnabled && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-2">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">משעה</label>
                  <input type="time" value={form.quietHoursFrom}
                    onChange={e => setForm(f => ({ ...f, quietHoursFrom: e.target.value }))}
                    className="w-full px-3 py-2 bg-card/5 border border-border/50 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">עד שעה</label>
                  <input type="time" value={form.quietHoursTo}
                    onChange={e => setForm(f => ({ ...f, quietHoursTo: e.target.value }))}
                    className="w-full px-3 py-2 bg-card/5 border border-border/50 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">עדיפות לעקיפה</label>
                  <select value={form.quietHoursBypassPriority}
                    onChange={e => setForm(f => ({ ...f, quietHoursBypassPriority: e.target.value }))}
                    className="w-full px-3 py-2 bg-card/5 border border-border/50 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary">
                    {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label} ומעלה — ישלח תמיד</option>)}
                  </select>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 mt-4">
            <button onClick={cancelForm} className="px-4 py-2 text-sm rounded-lg bg-card/5 hover:bg-card/10 text-muted-foreground transition-colors">
              ביטול
            </button>
            <button
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 transition-colors"
            >
              <Check className="w-4 h-4" />
              {editingId ? "עדכן כלל" : "צור כלל"}
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground text-sm">טוען כללים...</div>
        ) : rules.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Settings className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p className="text-lg font-medium mb-1">אין כללי ניתוב</p>
            <p className="text-sm">לחץ על "כלל חדש" כדי להגדיר ניתוב התראות</p>
          </div>
        ) : (
          rules.map(rule => {
            const isExpanded = expandedId === rule.id;
            return (
              <div key={rule.id} className={`bg-card border rounded-xl overflow-hidden ${rule.isActive ? "border-border/50" : "border-border/20 opacity-60"}`}>
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${rule.isActive ? "bg-emerald-500" : "bg-muted"}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{getLabelForType(rule.notificationType)}</span>
                      {rule.roleName && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400 border border-purple-500/30">
                          תפקיד: {rule.roleName}
                        </span>
                      )}
                    </div>
                    {rule.description && <p className="text-xs text-muted-foreground mt-0.5">{rule.description}</p>}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <div className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] ${rule.channelInApp ? "bg-blue-500/20 text-blue-400" : "bg-card/5 text-muted-foreground opacity-40"}`} title="In-App">
                      <Bell className="w-3 h-3" />
                    </div>
                    <div className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] ${rule.channelEmail ? "bg-emerald-500/20 text-emerald-400" : "bg-card/5 text-muted-foreground opacity-40"}`} title="אימייל">
                      <Mail className="w-3 h-3" />
                    </div>
                    <div className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] ${rule.channelWhatsapp ? "bg-green-500/20 text-green-400" : "bg-card/5 text-muted-foreground opacity-40"}`} title="WhatsApp">
                      <MessageSquare className="w-3 h-3" />
                    </div>
                    <div className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] ${rule.channelSms ? "bg-orange-500/20 text-orange-400" : "bg-card/5 text-muted-foreground opacity-40"}`} title="SMS">
                      <Phone className="w-3 h-3" />
                    </div>
                    <div className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] ${rule.channelTelegram ? "bg-sky-500/20 text-sky-400" : "bg-card/5 text-muted-foreground opacity-40"}`} title="Telegram">
                      <Send className="w-3 h-3" />
                    </div>
                    <div className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] ${(rule as any).channelBrowserPush ? "bg-blue-500/20 text-blue-300" : "bg-card/5 text-muted-foreground opacity-40"}`} title="Browser Push">
                      <Monitor className="w-3 h-3" />
                    </div>
                    <div className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] ${(rule as any).channelMobilePush ? "bg-violet-500/20 text-violet-400" : "bg-card/5 text-muted-foreground opacity-40"}`} title="Mobile Push">
                      <Smartphone className="w-3 h-3" />
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => setExpandedId(isExpanded ? null : rule.id)} className="p-1.5 rounded-lg hover:bg-card/5 text-muted-foreground transition-colors">
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                    <button onClick={() => startEdit(rule)} className="p-1.5 rounded-lg hover:bg-card/5 text-muted-foreground hover:text-foreground transition-colors">
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => updateMutation.mutate({ id: rule.id, data: { isActive: !rule.isActive } })}
                      className={`p-1.5 rounded-lg transition-colors ${rule.isActive ? "hover:bg-yellow-500/10 text-muted-foreground hover:text-yellow-400" : "hover:bg-emerald-500/10 text-muted-foreground hover:text-emerald-400"}`}
                      title={rule.isActive ? "השבת" : "הפעל"}
                    >
                      {rule.isActive ? <X className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      onClick={async () => { if (window.globalConfirm("למחוק כלל זה?")) deleteMutation.mutate(rule.id); }}
                      className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="px-4 pb-3 border-t border-border/20 bg-card/[0.01]">
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-3">
                      <div className="text-xs">
                        <div className="flex items-center gap-1.5 mb-1 text-muted-foreground">
                          <Bell className="w-3 h-3" /> In-App
                        </div>
                        <div className={rule.channelInApp ? "text-blue-400" : "text-muted-foreground"}>
                          {rule.channelInApp ? `מינ': ${getLabelForPriority(rule.minPriorityInApp)}` : "מושבת"}
                        </div>
                      </div>
                      <div className="text-xs">
                        <div className="flex items-center gap-1.5 mb-1 text-muted-foreground">
                          <Mail className="w-3 h-3" /> אימייל
                        </div>
                        <div className={rule.channelEmail ? "text-emerald-400" : "text-muted-foreground"}>
                          {rule.channelEmail ? `מינ': ${getLabelForPriority(rule.minPriorityEmail)}` : "מושבת"}
                        </div>
                      </div>
                      <div className="text-xs">
                        <div className="flex items-center gap-1.5 mb-1 text-muted-foreground">
                          <MessageSquare className="w-3 h-3" /> WhatsApp
                        </div>
                        <div className={rule.channelWhatsapp ? "text-green-400" : "text-muted-foreground"}>
                          {rule.channelWhatsapp ? `מינ': ${getLabelForPriority(rule.minPriorityWhatsapp)}` : "מושבת"}
                        </div>
                      </div>
                      <div className="text-xs">
                        <div className="flex items-center gap-1.5 mb-1 text-muted-foreground">
                          <Phone className="w-3 h-3" /> SMS
                        </div>
                        <div className={rule.channelSms ? "text-orange-400" : "text-muted-foreground"}>
                          {rule.channelSms ? `מינ': ${getLabelForPriority(rule.minPrioritySms ?? "critical")}` : "מושבת"}
                        </div>
                      </div>
                      <div className="text-xs">
                        <div className="flex items-center gap-1.5 mb-1 text-muted-foreground">
                          <Send className="w-3 h-3" /> Telegram
                        </div>
                        <div className={rule.channelTelegram ? "text-sky-400" : "text-muted-foreground"}>
                          {rule.channelTelegram ? `מינ': ${getLabelForPriority(rule.minPriorityTelegram ?? "high")}` : "מושבת"}
                        </div>
                      </div>
                      <div className="text-xs">
                        <div className="flex items-center gap-1.5 mb-1 text-muted-foreground">
                          <Monitor className="w-3 h-3" /> Browser Push
                        </div>
                        <div className={(rule as any).channelBrowserPush ? "text-blue-300" : "text-muted-foreground"}>
                          {(rule as any).channelBrowserPush ? `מינ': ${getLabelForPriority((rule as any).minPriorityBrowserPush ?? "high")}` : "מושבת"}
                        </div>
                      </div>
                      <div className="text-xs">
                        <div className="flex items-center gap-1.5 mb-1 text-muted-foreground">
                          <Smartphone className="w-3 h-3" /> Mobile Push
                        </div>
                        <div className={(rule as any).channelMobilePush ? "text-violet-400" : "text-muted-foreground"}>
                          {(rule as any).channelMobilePush ? `מינ': ${getLabelForPriority((rule as any).minPriorityMobilePush ?? "high")}` : "מושבת"}
                        </div>
                      </div>
                    </div>
                    {rule.roleName && (
                      <p className="text-xs text-muted-foreground mt-2">תפקיד מקבל: <span className="text-foreground">{rule.roleName}</span></p>
                    )}
                    <p className="text-[10px] text-muted-foreground/60 mt-2">נוצר: {new Date(rule.createdAt).toLocaleDateString("he-IL")}</p>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
