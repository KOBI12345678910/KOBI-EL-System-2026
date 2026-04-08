import { useState, useMemo, useEffect, useCallback } from "react";
import { authFetch } from "@/lib/utils";
import {
  GitBranch, Users, BarChart3, Zap, Plus, Edit, Trash2, CheckCircle, XCircle,
  ArrowRight, Activity, Clock, Star, MapPin, Briefcase, RefreshCw, List, Settings, X
} from "lucide-react";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import RelatedRecords from "@/components/related-records";
import AttachmentsSection from "@/components/attachments-section";
import ActivityLog from "@/components/activity-log";
import { useFormValidation, FormFieldError, RequiredMark } from "@/hooks/use-form-validation";

type RoutingRule = {
  id: number;
  name: string;
  description: string;
  strategy: "round_robin" | "load_balance" | "expertise" | "geography" | "priority";
  leadType: string;
  conditions: string[];
  agents: string[];
  active: boolean;
  routed: number;
};

type AgentLoad = {
  id: number;
  name: string;
  team: string;
  activeLeads: number;
  capacity: number;
  expertise: string[];
  region: string;
  available: boolean;
  avgResponseTime: number;
  conversionRate: number;
};

type RoutingLog = {
  id: number;
  leadName: string;
  company: string;
  source: string;
  assignedTo: string;
  rule: string;
  reason: string;
  timestamp: string;
  priority: string;
};

const STRATEGY_LABELS: Record<string, string> = {
  round_robin: "Round Robin",
  load_balance: "איזון עומסים",
  expertise: "לפי מומחיות",
  geography: "לפי גיאוגרפיה",
  priority: "לפי עדיפות",
};
const STRATEGY_COLORS: Record<string, string> = {
  round_robin: "bg-blue-500/20 text-blue-400",
  load_balance: "bg-green-500/20 text-green-400",
  expertise: "bg-purple-500/20 text-purple-400",
  geography: "bg-amber-500/20 text-amber-400",
  priority: "bg-red-500/20 text-red-400",
};

const INITIAL_RULES: RoutingRule[] = [
  { id: 1, name: "לידים ממנייהאטן — גיאוגרפיה", description: "חלוקת לידים לנציגי אזור לפי מיקום הלקוח", strategy: "geography", leadType: "ליד רגיל", conditions: ["מיקום: תל אביב", "ירושלים"], agents: ["דנה כהן", "ישראל לוי"], active: true, routed: 142 },
  { id: 2, name: "לידים VIP — מומחיות", description: "לידים בעלי ערך גבוה לנציגים בכירים", strategy: "expertise", leadType: "VIP", conditions: ["ערך ליד > 50,000₪", "עדיפות: דחוף/גבוה"], agents: ["מנהל מכירות", "נציג בכיר"], active: true, routed: 87 },
  { id: 3, name: "Round Robin — כללי", description: "חלוקה שווה בין כל הנציגים הזמינים", strategy: "round_robin", leadType: "ליד רגיל", conditions: ["ברירת מחדל"], agents: ["כל הנציגים"], active: true, routed: 315 },
  { id: 4, name: "איזון עומסים — גל שיא", description: "חלוקה לנציגים עם הכי פחות לידים פתוחים", strategy: "load_balance", leadType: "כל הסוגים", conditions: ["שעות עסקים"], agents: ["צוות מכירות A", "צוות מכירות B"], active: true, routed: 201 },
  { id: 5, name: "לידים טכניים — מומחיות", description: "לידים עם עניין טכני לנציגים טכניים", strategy: "expertise", leadType: "טכני", conditions: ["תחום: טכנולוגיה", "עניין: מוצר טכני"], agents: ["נציג טכני 1", "נציג טכני 2"], active: false, routed: 43 },
];

const INITIAL_AGENTS: AgentLoad[] = [
  { id: 1, name: "דנה כהן", team: "צוות A", activeLeads: 12, capacity: 20, expertise: ["B2B", "SaaS", "Enterprise"], region: "תל אביב", available: true, avgResponseTime: 1.2, conversionRate: 28 },
  { id: 2, name: "ישראל לוי", team: "צוות A", activeLeads: 18, capacity: 20, expertise: ["B2C", "קמעונאות"], region: "ירושלים", available: true, avgResponseTime: 2.1, conversionRate: 22 },
  { id: 3, name: "שרה מזרחי", team: "צוות B", activeLeads: 8, capacity: 15, expertise: ["SMB", "שירותים"], region: "חיפה", available: true, avgResponseTime: 0.8, conversionRate: 31 },
  { id: 4, name: "יוסי אברהם", team: "צוות B", activeLeads: 14, capacity: 15, expertise: ["Enterprise", "פיננסים"], region: "תל אביב", available: false, avgResponseTime: 1.5, conversionRate: 25 },
  { id: 5, name: "רחל כהן", team: "צוות C", activeLeads: 5, capacity: 20, expertise: ["SaaS", "B2B", "Enterprise"], region: "ראשון לציון", available: true, avgResponseTime: 0.9, conversionRate: 35 },
  { id: 6, name: "אמיר לוי", team: "צוות C", activeLeads: 19, capacity: 20, expertise: ["B2C", "מסחר אלקטרוני"], region: "פתח תקווה", available: true, avgResponseTime: 1.8, conversionRate: 19 },
];

const INITIAL_LOG: RoutingLog[] = [
  { id: 1, leadName: "אבי ישראלי", company: "טכנולוגיות XYZ", source: "אתר", assignedTo: "רחל כהן", rule: "לידים VIP — מומחיות", reason: "ערך ליד: ₪85,000 — נציגה מומחית ב-Enterprise", timestamp: "2026-03-17 14:23", priority: "urgent" },
  { id: 2, leadName: "שירה בן דוד", company: "בגדי חן", source: "פייסבוק", assignedTo: "דנה כהן", rule: "לידים ממנהאטן — גיאוגרפיה", reason: "אזור: תל אביב", timestamp: "2026-03-17 13:45", priority: "medium" },
  { id: 3, leadName: "נתי גולן", company: "תוכנת עתיד", source: "גוגל", assignedTo: "שרה מזרחי", rule: "Round Robin — כללי", reason: "תורה הבאה בתור", timestamp: "2026-03-17 12:30", priority: "high" },
  { id: 4, leadName: "מיכל אדר", company: "חברת מדיה", source: "לינקדאין", assignedTo: "יוסי אברהם", rule: "לידים VIP — מומחיות", reason: "מומחיות בפיננסים", timestamp: "2026-03-17 11:15", priority: "high" },
  { id: 5, leadName: "בני שפירא", company: "קייטרינג ספיר", source: "הפניה", assignedTo: "דנה כהן", rule: "איזון עומסים — גל שיא", reason: "הנציגה עם הכי פחות עומס", timestamp: "2026-03-17 10:00", priority: "low" },
  { id: 6, leadName: "לאה הרצוג", company: "נדל\"ן פרמיום", source: "טלפון", assignedTo: "רחל כהן", rule: "לידים VIP — מומחיות", reason: "ערך ליד: ₪120,000", timestamp: "2026-03-17 09:30", priority: "urgent" },
];

const LEAD_TYPES = ["ליד רגיל", "VIP", "טכני", "כל הסוגים"];
const STRATEGIES: Array<{ value: RoutingRule["strategy"]; label: string }> = [
  { value: "round_robin", label: "Round Robin" },
  { value: "load_balance", label: "איזון עומסים" },
  { value: "expertise", label: "לפי מומחיות" },
  { value: "geography", label: "לפי גיאוגרפיה" },
  { value: "priority", label: "לפי עדיפות" },
];

export default function SmartRouting() {
  const API = "/api";
  const token = () => document.cookie.match(/token=([^;]+)/)?.[1] || localStorage.getItem("erp_token") || "";
  const hdrs = { "Content-Type": "application/json", Authorization: `Bearer ${token()}` };

  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [rules, setRules] = useState<RoutingRule[]>(INITIAL_RULES);
  const [agents] = useState<AgentLoad[]>(INITIAL_AGENTS);
  const [log, setLog] = useState<RoutingLog[]>(INITIAL_LOG);
  const [activeTab, setActiveTab] = useState<"overview" | "rules" | "agents" | "log">("overview");
  const [showForm, setShowForm] = useState(false);
  const [editingRule, setEditingRule] = useState<RoutingRule | null>(null);
  const [form, setForm] = useState<Partial<RoutingRule>>({});
  const { selectedIds, setSelectedIds, toggle, toggleAll, isSelected } = useBulkSelection();
  const routingValidation = useFormValidation({ name: { required: true } });
  const [detailTab, setDetailTab] = useState("details");
  const [viewDetailLog, setViewDetailLog] = useState<RoutingLog | null>(null);

  const loadData = useCallback(() => {
    authFetch(`${API}/routing-rules`, { headers: hdrs }).then(r => r.json()).then((d: unknown) => {
      if (Array.isArray(d) && d.length > 0) {
        setRules((d as Record<string, unknown>[]).map(x => ({
          id: Number(x.id), name: String(x.name || ""), description: String(x.description || ""),
          strategy: (x.strategy as RoutingRule["strategy"]) || "round_robin",
          leadType: String(x.lead_type || "ליד רגיל"),
          conditions: Array.isArray(x.conditions) ? x.conditions.map(String) : [],
          agents: Array.isArray(x.agents) ? x.agents.map(String) : [],
          active: Boolean(x.active), routed: Number(x.routed || 0),
        })));
      }
    }).catch(() => null);
    authFetch(`${API}/routing-log`, { headers: hdrs }).then(r => r.json()).then((d: unknown) => {
      if (Array.isArray(d) && d.length > 0) {
        setLog((d as Record<string, unknown>[]).map(x => ({
          id: Number(x.id), leadName: String(x.lead_name || ""), company: String(x.company || ""),
          source: String(x.source || ""), assignedTo: String(x.assigned_to || ""),
          rule: String(x.rule_name || ""), reason: String(x.reason || ""),
          timestamp: String(x.created_at || ""), priority: String(x.priority || "medium"),
        })));
      }
    }).catch(() => null);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadData(); }, [loadData]);

  const totalRouted = rules.reduce((s, r) => s + r.routed, 0);
  const activeRules = rules.filter(r => r.active).length;
  const availableAgents = agents.filter(a => a.available).length;
  const avgCapacity = Math.round(agents.reduce((s, a) => s + (a.activeLeads / a.capacity * 100), 0) / agents.length);

  const openCreate = () => {
    setEditingRule(null);
    setForm({ strategy: "round_robin", leadType: "ליד רגיל", conditions: [], agents: [], active: true });
    setShowForm(true);
  };
  const openEdit = (rule: RoutingRule) => {
    setEditingRule(rule);
    setForm({ ...rule });
    setShowForm(true);
  };
  const saveRule = async () => {
    if (!routingValidation.validate(form)) return;
    if (editingRule) {
      await authFetch(`${API}/routing-rules/${editingRule.id}`, { method: "PUT", headers: hdrs, body: JSON.stringify({
        name: form.name, description: form.description, strategy: form.strategy,
        leadType: form.leadType, conditions: form.conditions || [], agents: form.agents || [], active: form.active,
      }) }).catch(() => null);
      setRules(r => r.map(x => x.id === editingRule.id ? { ...editingRule, ...form } : x));
    } else {
      const res = await authFetch(`${API}/routing-rules`, { method: "POST", headers: hdrs, body: JSON.stringify({
        name: form.name || "כלל ניתוב חדש", description: form.description || "",
        strategy: form.strategy || "round_robin", leadType: form.leadType || "ליד רגיל",
        conditions: form.conditions || [], agents: form.agents || [], active: form.active !== false,
      }) }).then(r => r.json()).catch(() => null);
      if (res?.id) {
        loadData();
      } else {
        const newId = Math.max(...rules.map(r => r.id), 0) + 1;
        const newRule: RoutingRule = {
          id: newId, name: form.name || "כלל ניתוב חדש", description: form.description || "",
          strategy: form.strategy || "round_robin", leadType: form.leadType || "ליד רגיל",
          conditions: form.conditions || [], agents: form.agents || [], active: form.active ?? true, routed: 0,
        };
        setRules(r => [...r, newRule]);
      }
    }
    setShowForm(false);
  };
  const deleteRule = async (id: number) => {
    if (await globalConfirm("למחוק כלל ניתוב?")) {
      await authFetch(`${API}/routing-rules/${id}`, { method: "DELETE", headers: hdrs }).catch(() => null);
      setRules(r => r.filter(x => x.id !== id));
    }
  };
  const toggleRule = async (id: number) => {
    await authFetch(`${API}/routing-rules/${id}/toggle`, { method: "PATCH", headers: hdrs }).catch(() => null);
    setRules(r => r.map(x => x.id === id ? { ...x, active: !x.active } : x));
  };

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold flex items-center gap-2"><GitBranch className="w-7 h-7 text-primary" />ניתוב חכם</h1>
          <p className="text-sm text-muted-foreground">כללי ניתוב אוטומטיים — חלוקת לידים לנציגים לפי עומס, מומחיות וזמינות</p>
        </div>
        {activeTab === "rules" && (
          <button onClick={openCreate} className="btn btn-primary btn-sm flex items-center gap-1"><Plus className="w-4 h-4" />כלל ניתוב חדש</button>
        )}
      </div>

      <div className="flex gap-1 border-b border-border overflow-x-auto pb-0">
        {(
          [
            { id: "overview", label: "סקירה", icon: BarChart3 },
            { id: "rules", label: "כללי ניתוב", icon: GitBranch },
            { id: "agents", label: "עומס נציגים", icon: Users },
            { id: "log", label: "לוג ניתובים", icon: List },
          ] as const
        ).map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === tab.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            <tab.icon className="w-4 h-4" />{tab.label}
          </button>
        ))}
      </div>

      {activeTab === "overview" && (
        <div className="space-y-4 sm:space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "לידים נותבו", value: totalRouted, icon: ArrowRight, color: "text-blue-400", bg: "bg-blue-500/10" },
              { label: "כללים פעילים", value: activeRules, icon: CheckCircle, color: "text-green-400", bg: "bg-green-500/10" },
              { label: "נציגים זמינים", value: `${availableAgents}/${agents.length}`, icon: Users, color: "text-cyan-400", bg: "bg-cyan-500/10" },
              { label: "ניצולת ממוצעת", value: `${avgCapacity}%`, icon: Activity, color: "text-purple-400", bg: "bg-purple-500/10" },
            ].map((k, i) => (
              <div key={i} className="bg-card border rounded-xl p-4">
                <div className={`w-10 h-10 rounded-lg ${k.bg} flex items-center justify-center mb-3`}>
                  <k.icon className={`w-5 h-5 ${k.color}`} />
                </div>
                <div className={`text-lg sm:text-2xl font-bold ${k.color}`}>{k.value}</div>
                <div className="text-xs text-muted-foreground mt-1">{k.label}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-card border rounded-xl p-5">
              <h3 className="font-semibold mb-4">כללי ניתוב פעילים</h3>
              <div className="space-y-2">
                {rules.filter(r => r.active).map(rule => (
                  <div key={rule.id} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                    <div>
                      <div className="text-sm font-medium">{rule.name}</div>
                      <span className={`px-1.5 py-0.5 rounded text-xs ${STRATEGY_COLORS[rule.strategy]}`}>{STRATEGY_LABELS[rule.strategy]}</span>
                    </div>
                    <div className="text-sm font-bold text-muted-foreground">{rule.routed} ניתובים</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-card border rounded-xl p-5">
              <h3 className="font-semibold mb-4">עומס נציגים</h3>
              <div className="space-y-3">
                {agents.slice(0, 5).map(agent => {
                  const pct = Math.round(agent.activeLeads / agent.capacity * 100);
                  const color = pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-green-500";
                  return (
                    <div key={agent.id}>
                      <div className="flex justify-between text-sm mb-1">
                        <div className="flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${agent.available ? "bg-green-500" : "bg-gray-400"}`} />
                          <span>{agent.name}</span>
                        </div>
                        <span className="text-xs text-muted-foreground">{agent.activeLeads}/{agent.capacity} לידים</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="bg-card border rounded-xl p-5">
            <h3 className="font-semibold mb-4">ניתובים אחרונים</h3>
            <div className="space-y-2">
              {log.slice(0, 5).map(entry => (
                <div key={entry.id} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0 text-sm">
                  <div>
                    <span className="font-medium">{entry.leadName}</span>
                    <span className="text-muted-foreground mr-1">— {entry.company}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <ArrowRight className="w-3 h-3 text-muted-foreground" />
                    <span className="font-medium">{entry.assignedTo}</span>
                    <span className="text-muted-foreground">{entry.timestamp.split(" ")[1]}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === "rules" && (
        <div className="space-y-3">
          {rules.map(rule => (
            <div key={rule.id} className={`bg-card border rounded-xl p-4 ${!rule.active ? "opacity-60" : ""}`}>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold">{rule.name}</span>
                    <span className={`px-2 py-0.5 rounded text-xs ${STRATEGY_COLORS[rule.strategy]}`}>{STRATEGY_LABELS[rule.strategy]}</span>
                    <span className="px-2 py-0.5 rounded text-xs bg-blue-500/20 text-blue-400">{rule.leadType}</span>
                    {!rule.active && <span className="px-2 py-0.5 rounded text-xs bg-muted/20 text-muted-foreground">לא פעיל</span>}
                  </div>
                  <div className="text-sm text-muted-foreground mb-2">{rule.description}</div>
                  <div className="flex flex-wrap gap-2">
                    {rule.conditions.map((c, i) => (
                      <span key={i} className="px-2 py-0.5 rounded text-xs bg-muted border">{c}</span>
                    ))}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <span className="text-xs text-muted-foreground">נציגים:</span>
                    {rule.agents.map((a, i) => (
                      <span key={i} className="px-2 py-0.5 rounded text-xs bg-primary/10 text-primary">{a}</span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-1 mr-4">
                  <span className="text-xs text-muted-foreground">{rule.routed} ניתובים</span>
                  <button onClick={() => toggleRule(rule.id)} className={`btn btn-ghost btn-xs ${rule.active ? "text-green-400" : "text-muted-foreground"}`}>
                    {rule.active ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                  </button>
                  <button onClick={() => openEdit(rule)} className="btn btn-ghost btn-xs"><Edit className="w-4 h-4" /></button>
                  <button onClick={() => deleteRule(rule.id)} className="btn btn-ghost btn-xs text-red-400"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === "agents" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {agents.map(agent => {
              const pct = Math.round(agent.activeLeads / agent.capacity * 100);
              const barColor = pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-green-500";
              const border = pct >= 90 ? "border-red-500/30" : pct >= 70 ? "border-amber-500/30" : "border-border";
              return (
                <div key={agent.id} className={`bg-card border ${border} rounded-xl p-4`}>
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${agent.available ? "bg-green-500" : "bg-gray-400"}`} />
                        <span className="font-semibold">{agent.name}</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">{agent.team} · {agent.region}</div>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded ${agent.available ? "bg-green-500/20 text-green-400" : "bg-muted/20 text-muted-foreground"}`}>
                      {agent.available ? "זמין" : "לא זמין"}
                    </span>
                  </div>
                  <div className="mb-3">
                    <div className="flex justify-between text-sm mb-1">
                      <span>עומס לידים</span>
                      <span className="font-bold">{agent.activeLeads}/{agent.capacity}</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div className={`h-full ${barColor} rounded-full`} style={{ width: `${pct}%` }} />
                    </div>
                    <div className="text-right text-xs text-muted-foreground mt-0.5">{pct}%</div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <div className="text-center">
                      <Clock className="w-3.5 h-3.5 mx-auto mb-0.5 text-blue-400" />
                      <div className="text-sm font-bold">{agent.avgResponseTime}ש'</div>
                      <div className="text-xs text-muted-foreground">תגובה ממוצעת</div>
                    </div>
                    <div className="text-center">
                      <Star className="w-3.5 h-3.5 mx-auto mb-0.5 text-amber-400" />
                      <div className="text-sm font-bold">{agent.conversionRate}%</div>
                      <div className="text-xs text-muted-foreground">המרה</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {agent.expertise.slice(0, 3).map((e, i) => (
                      <span key={i} className="px-1.5 py-0.5 rounded text-xs bg-primary/10 text-primary">{e}</span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === "log" && (
        <div className="space-y-3">
          <BulkActions items={log} selectedIds={selectedIds} onSelectionChange={setSelectedIds} actions={[
            defaultBulkActions.export(async (ids) => { const rows = log.filter(e => ids.has(e.id)); const csv = ["ליד,חברה,שובץ ל,כלל,שעה", ...rows.map(e => `${e.leadName},${e.company},${e.assignedTo},${e.rule},${e.timestamp}`)].join("\n"); const b = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "routing_log.csv"; a.click(); }),
          ]} />
          <div className="border rounded-xl overflow-auto">
            <table className="table table-sm w-full">
              <thead><tr className="bg-muted/50">
                <th className="w-10"><BulkCheckbox items={log} selectedIds={selectedIds} onToggleAll={toggleAll} mode="all" /></th>
                <th>ליד</th><th>חברה</th><th>מקור</th><th>שובץ ל</th><th>כלל</th><th>סיבה</th><th>שעה</th>
              </tr></thead>
              <tbody>
                {log.map(entry => (
                  <tr key={entry.id} className={`hover:bg-muted/30 ${isSelected(entry.id) ? "bg-primary/5" : ""}`}>
                    <td><BulkCheckbox id={entry.id} selectedIds={selectedIds} onToggle={toggle} mode="single" /></td>
                    <td className="font-medium text-sm cursor-pointer hover:text-primary" onClick={() => setViewDetailLog(entry)}>{entry.leadName}</td>
                    <td className="text-sm">{entry.company}</td>
                    <td className="text-xs">{entry.source}</td>
                    <td className="font-medium text-sm text-primary">{entry.assignedTo}</td>
                    <td className="text-xs text-muted-foreground">{entry.rule}</td>
                    <td className="text-xs max-w-xs truncate">{entry.reason}</td>
                    <td className="text-xs text-muted-foreground">{entry.timestamp}</td>
                  </tr>
                ))}
                {log.length === 0 && <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">אין ניתובים להצגה</td></tr>}
              </tbody>
            </table>
          </div>

          {viewDetailLog && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => { setViewDetailLog(null); setDetailTab("details"); }}>
              <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
                <div className="p-5 border-b border-border flex justify-between items-center">
                  <h2 className="text-lg font-bold text-foreground">{viewDetailLog.leadName} — {viewDetailLog.company}</h2>
                  <button onClick={() => { setViewDetailLog(null); setDetailTab("details"); }} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
                </div>
                <div className="flex border-b border-border/50">
                  {[{key:"details",label:"פרטים"},{key:"related",label:"רשומות קשורות"},{key:"docs",label:"מסמכים"},{key:"history",label:"היסטוריה"}].map(t => (
                    <button key={t.key} onClick={() => setDetailTab(t.key)} className={`px-4 py-2.5 text-sm font-medium border-b-2 ${detailTab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t.label}</button>
                  ))}
                </div>
                {detailTab === "details" && (
                  <div className="p-5 grid grid-cols-2 gap-4 text-sm">
                    <div><span className="text-xs text-muted-foreground block">ליד</span><span className="font-medium">{viewDetailLog.leadName}</span></div>
                    <div><span className="text-xs text-muted-foreground block">חברה</span><span>{viewDetailLog.company}</span></div>
                    <div><span className="text-xs text-muted-foreground block">מקור</span><span>{viewDetailLog.source}</span></div>
                    <div><span className="text-xs text-muted-foreground block">שובץ ל</span><span className="text-primary font-medium">{viewDetailLog.assignedTo}</span></div>
                    <div><span className="text-xs text-muted-foreground block">כלל</span><span>{viewDetailLog.rule}</span></div>
                    <div><span className="text-xs text-muted-foreground block">שעה</span><span>{viewDetailLog.timestamp}</span></div>
                    <div className="col-span-2"><span className="text-xs text-muted-foreground block">סיבה</span><span>{viewDetailLog.reason}</span></div>
                  </div>
                )}
                {detailTab === "related" && (
                  <div className="p-5"><RelatedRecords tabs={[{key:"agents",label:"נציגים",endpoint:`${API}/routing-log/${viewDetailLog.id}/agents`,columns:[{key:"name",label:"שם"},{key:"team",label:"צוות"},{key:"capacity",label:"קיבולת"}]},{key:"tickets",label:"פניות",endpoint:`${API}/routing-log/${viewDetailLog.id}/tickets`,columns:[{key:"ticket_number",label:"מספר"},{key:"subject",label:"נושא"},{key:"status",label:"סטטוס"}]}]} /></div>
                )}
                {detailTab === "docs" && (
                  <div className="p-5"><AttachmentsSection entityType="routing-log" entityId={viewDetailLog.id} /></div>
                )}
                {detailTab === "history" && (
                  <div className="p-5"><ActivityLog entityType="routing-log" entityId={viewDetailLog.id} /></div>
                )}
                <div className="p-5 border-t border-border flex justify-end"><button onClick={() => { setViewDetailLog(null); setDetailTab("details"); }} className="btn btn-outline btn-sm">סגור</button></div>
              </div>
            </div>
          )}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
          <div className="bg-card border rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto space-y-4" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold">{editingRule ? "עריכת כלל ניתוב" : "כלל ניתוב חדש"}</h2>
            <div className="space-y-3">
              <div><label className="text-sm font-medium">שם הכלל <RequiredMark /></label>
                <input className="input input-bordered w-full h-9 text-sm mt-1" value={form.name || ""} onChange={e => setForm({ ...form, name: e.target.value })} /><FormFieldError error={routingValidation.errors.name} /></div>
              <div><label className="text-sm font-medium">תיאור</label>
                <input className="input input-bordered w-full h-9 text-sm mt-1" value={form.description || ""} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className="text-sm font-medium">אסטרטגיה</label>
                  <select className="select select-bordered w-full select-sm mt-1" value={form.strategy || "round_robin"} onChange={e => setForm({ ...form, strategy: e.target.value as RoutingRule["strategy"] })}>
                    {STRATEGIES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select></div>
                <div><label className="text-sm font-medium">סוג ליד</label>
                  <select className="select select-bordered w-full select-sm mt-1" value={form.leadType || ""} onChange={e => setForm({ ...form, leadType: e.target.value })}>
                    {LEAD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select></div>
              </div>
              <div><label className="text-sm font-medium">תנאים (מופרדים בפסיק)</label>
                <input className="input input-bordered w-full h-9 text-sm mt-1"
                  value={Array.isArray(form.conditions) ? form.conditions.join(", ") : ""}
                  onChange={e => setForm({ ...form, conditions: e.target.value.split(",").map(s => s.trim()).filter(Boolean) })} /></div>
              <div><label className="text-sm font-medium">נציגים (מופרדים בפסיק)</label>
                <input className="input input-bordered w-full h-9 text-sm mt-1"
                  value={Array.isArray(form.agents) ? form.agents.join(", ") : ""}
                  onChange={e => setForm({ ...form, agents: e.target.value.split(",").map(s => s.trim()).filter(Boolean) })} /></div>
              <div className="flex items-center gap-2">
                <input type="checkbox" className="checkbox checkbox-sm" checked={form.active !== false} onChange={e => setForm({ ...form, active: e.target.checked })} />
                <span className="text-sm">כלל פעיל</span>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowForm(false)} className="btn btn-outline btn-sm">ביטול</button>
              <button onClick={saveRule} className="btn btn-primary btn-sm">שמירה</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
