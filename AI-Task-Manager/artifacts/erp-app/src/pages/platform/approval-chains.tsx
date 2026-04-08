import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { authFetch } from "@/lib/utils";
import {
  Plus, Trash2, Settings, ChevronDown, ChevronUp, X,
  UserCheck, GitBranch, AlarmClock, ArrowDown, Users,
  Copy, Edit2, CheckCircle, Circle, MoreVertical, Filter,
  Calendar, Link2, ShieldCheck, AlertTriangle
} from "lucide-react";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";

const API = "/api";

interface ApprovalChain {
  id: number;
  name: string;
  description: string | null;
  is_template: boolean;
  is_active: boolean;
  parallel_mode: string;
  level_count: number;
  created_at: string;
}

interface ChainLevel {
  id?: number;
  level_order: number;
  name: string;
  approver_type: string;
  approver_role: string | null;
  approver_emails: string[];
  approver_user_ids: number[];
  parallel_mode: string;
  min_approvals: number;
  timeout_hours: number | null;
  escalation_role: string | null;
  conditions: any[];
}

interface RoutingRule {
  id: number;
  name: string;
  entity_type: string | null;
  department: string | null;
  conditions: any[];
  chain_id: number | null;
  chain_name: string | null;
  priority: number;
  is_active: boolean;
}

interface Delegation {
  id: number;
  delegator_email: string;
  delegate_email: string;
  start_date: string;
  end_date: string;
  reason: string | null;
  is_active: boolean;
}

const PARALLEL_MODES = [
  { value: "all", label: "כולם חייבים לאשר" },
  { value: "any", label: "מספיק אחד מאשר" },
  { value: "majority", label: "רוב מאשרים" },
  { value: "first", label: "ראשון שמאשר" },
];

const APPROVER_TYPES = [
  { value: "role", label: "תפקיד" },
  { value: "email", label: "אימייל ספציפי" },
  { value: "department_head", label: "ראש מחלקה" },
  { value: "manager", label: "מנהל ישיר" },
];

export default function ApprovalChains() {
  const queryClient = useQueryClient();
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [activeTab, setActiveTab] = useState<"chains" | "routing" | "delegation">("chains");
  const [editingChain, setEditingChain] = useState<any | null>(null);
  const [showCreateChain, setShowCreateChain] = useState(false);
  const [showCreateRule, setShowCreateRule] = useState(false);
  const [showCreateDelegation, setShowCreateDelegation] = useState(false);
  const [filterTemplate, setFilterTemplate] = useState<boolean | undefined>(undefined);

  const { data: chains = [] } = useQuery<ApprovalChain[]>({
    queryKey: ["approval-chains", filterTemplate],
    queryFn: async () => {
      const params = filterTemplate !== undefined ? `?isTemplate=${filterTemplate}` : "";
      const r = await authFetch(`${API}/platform/approval-chains${params}`);
      if (!r.ok) return [];
      return r.json();
    },
  });

  const { data: routingRules = [] } = useQuery<RoutingRule[]>({
    queryKey: ["approval-routing-rules"],
    queryFn: async () => {
      const r = await authFetch(`${API}/platform/approval-routing-rules`);
      if (!r.ok) return [];
      return r.json();
    },
    enabled: activeTab === "routing",
  });

  const { data: delegations = [] } = useQuery<Delegation[]>({
    queryKey: ["approval-delegations"],
    queryFn: async () => {
      const r = await authFetch(`${API}/platform/approval-delegations`);
      if (!r.ok) return [];
      return r.json();
    },
    enabled: activeTab === "delegation",
  });

  const deleteChain = useMutation({
    mutationFn: async (id: number) => {
      await authFetch(`${API}/platform/approval-chains/${id}`, { method: "DELETE" });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["approval-chains"] }),
  });

  const deleteRule = useMutation({
    mutationFn: async (id: number) => {
      await authFetch(`${API}/platform/approval-routing-rules/${id}`, { method: "DELETE" });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["approval-routing-rules"] }),
  });

  const deleteDelegation = useMutation({
    mutationFn: async (id: number) => {
      await authFetch(`${API}/platform/approval-delegations/${id}`, { method: "DELETE" });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["approval-delegations"] }),
  });

  if (editingChain) {
    return (
      <ChainEditor
        chain={editingChain}
        onBack={() => { setEditingChain(null); queryClient.invalidateQueries({ queryKey: ["approval-chains"] }); }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">שרשרות אישור</h1>
          <p className="text-muted-foreground mt-1">הגדר תהליכי אישור מרובי שלבים עם ניתוב וניהול סמכויות</p>
        </div>
        <div className="flex gap-2">
          {activeTab === "chains" && (
            <button onClick={() => setShowCreateChain(true)} className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-colors">
              <Plus className="w-4 h-4" />
              שרשרת חדשה
            </button>
          )}
          {activeTab === "routing" && (
            <button onClick={() => setShowCreateRule(true)} className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-colors">
              <Plus className="w-4 h-4" />
              כלל ניתוב חדש
            </button>
          )}
          {activeTab === "delegation" && (
            <button onClick={() => setShowCreateDelegation(true)} className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-colors">
              <Plus className="w-4 h-4" />
              הוסף מינוי מחליף
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-1 bg-muted rounded-xl p-1 w-fit">
        {[
          { key: "chains", label: "שרשרות אישור", icon: GitBranch },
          { key: "routing", label: "כללי ניתוב", icon: Filter },
          { key: "delegation", label: "מינוי מחליף", icon: UserCheck },
        ].map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setActiveTab(key as any)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === key ? "bg-card shadow-sm" : "text-muted-foreground"}`}>
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {activeTab === "chains" && (
        <>
          <div className="flex gap-2">
            {[
              { label: "הכל", value: undefined },
              { label: "תבניות", value: true },
              { label: "שרשרות פעילות", value: false },
            ].map(({ label, value }) => (
              <button key={label} onClick={() => setFilterTemplate(value)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${filterTemplate === value ? "bg-primary/10 border-primary text-primary" : "border-border text-muted-foreground hover:border-primary/30"}`}>
                {label}
              </button>
            ))}
          </div>
          <div className="space-y-3">
            {chains.length === 0 ? (
              <div className="bg-card border border-border/50 rounded-2xl p-12 text-center">
                <GitBranch className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                <h3 className="text-xl font-semibold mb-2">אין שרשרות אישור</h3>
                <p className="text-muted-foreground mb-6">צור שרשרת אישור ראשונה עם מספר שלבים וקריטריוני אישור</p>
                <button onClick={() => setShowCreateChain(true)} className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-xl font-medium">
                  <Plus className="w-5 h-5" />
                  צור שרשרת ראשונה
                </button>
              </div>
            ) : chains.map((chain, i) => (
              <motion.div key={chain.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                className="bg-card border border-border rounded-2xl p-5 hover:border-primary/30 transition-all">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                      <GitBranch className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{chain.name}</h3>
                        {chain.is_template && (
                          <span className="px-2 py-0.5 text-xs bg-blue-500/10 text-blue-400 rounded-full font-medium">תבנית</span>
                        )}
                        {chain.is_active ? (
                          <span className="px-2 py-0.5 text-xs bg-green-500/10 text-green-400 rounded-full font-medium">פעיל</span>
                        ) : (
                          <span className="px-2 py-0.5 text-xs bg-muted text-muted-foreground rounded-full font-medium">לא פעיל</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span>{Number(chain.level_count)} שלבים</span>
                        {chain.description && <span>·</span>}
                        {chain.description && <span>{chain.description}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setEditingChain(chain)} className="p-2 hover:bg-muted rounded-lg transition-colors">
                      <Edit2 className="w-4 h-4 text-muted-foreground" />
                    </button>
                    <button onClick={async () => {
                      if (await globalConfirm("למחוק שרשרת?")) deleteChain.mutate(chain.id);
                    }} className="p-2 hover:bg-destructive/10 rounded-lg transition-colors">
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </>
      )}

      {activeTab === "routing" && (
        <div className="space-y-3">
          {routingRules.length === 0 ? (
            <div className="bg-card border border-border/50 rounded-2xl p-12 text-center">
              <Filter className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">אין כללי ניתוב</h3>
              <p className="text-muted-foreground mb-6">הגדר כללים שקובעים איזו שרשרת אישור תופעל בהתאם לסוג הרשומה, סכום, מחלקה וכו'</p>
            </div>
          ) : routingRules.map((rule, i) => (
            <motion.div key={rule.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
              className="bg-card border border-border rounded-2xl p-5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{rule.name}</h3>
                    <span className="px-2 py-0.5 text-xs bg-muted text-muted-foreground rounded-full">עדיפות {rule.priority}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    {rule.entity_type && <span>סוג: {rule.entity_type}</span>}
                    {rule.department && <span>מחלקה: {rule.department}</span>}
                    {rule.chain_name && <span>→ שרשרת: {rule.chain_name}</span>}
                    <span>{(rule.conditions as any[]).length} תנאים</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={async () => {
                    if (await globalConfirm("למחוק כלל?")) deleteRule.mutate(rule.id);
                  }} className="p-2 hover:bg-destructive/10 rounded-lg transition-colors">
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {activeTab === "delegation" && (
        <div className="space-y-3">
          {delegations.length === 0 ? (
            <div className="bg-card border border-border/50 rounded-2xl p-12 text-center">
              <UserCheck className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">אין מינויי מחלף</h3>
              <p className="text-muted-foreground mb-6">הגדר מחליפים שיטפלו באישורים כשמאשרים נעדרים</p>
            </div>
          ) : delegations.map((d, i) => (
            <motion.div key={d.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
              className="bg-card border border-border rounded-2xl p-5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <UserCheck className="w-5 h-5 text-muted-foreground" />
                    <span className="font-medium">{d.delegator_email}</span>
                    <ArrowDown className="w-4 h-4 text-muted-foreground rotate-[-90deg]" />
                    <span className="font-medium text-primary">{d.delegate_email}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground mr-8">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>{new Date(d.start_date).toLocaleDateString("he-IL")} — {new Date(d.end_date).toLocaleDateString("he-IL")}</span>
                    {d.reason && <span>· {d.reason}</span>}
                  </div>
                </div>
                <button onClick={async () => {
                  if (await globalConfirm("לבטל מינוי מחלף?")) deleteDelegation.mutate(d.id);
                }} className="p-2 hover:bg-destructive/10 rounded-lg transition-colors">
                  <Trash2 className="w-4 h-4 text-destructive" />
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {showCreateChain && (
          <CreateChainModal
            onClose={() => setShowCreateChain(false)}
            onSuccess={(chain) => { setShowCreateChain(false); setEditingChain(chain); queryClient.invalidateQueries({ queryKey: ["approval-chains"] }); }}
          />
        )}
        {showCreateRule && (
          <CreateRoutingRuleModal
            chains={chains}
            onClose={() => setShowCreateRule(false)}
            onSuccess={() => { setShowCreateRule(false); queryClient.invalidateQueries({ queryKey: ["approval-routing-rules"] }); }}
          />
        )}
        {showCreateDelegation && (
          <CreateDelegationModal
            onClose={() => setShowCreateDelegation(false)}
            onSuccess={() => { setShowCreateDelegation(false); queryClient.invalidateQueries({ queryKey: ["approval-delegations"] }); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function ChainEditor({ chain, onBack }: { chain: any; onBack: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(chain.name);
  const [description, setDescription] = useState(chain.description || "");
  const [isTemplate, setIsTemplate] = useState(chain.is_template);
  const [levels, setLevels] = useState<ChainLevel[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [expandedLevel, setExpandedLevel] = useState<number | null>(null);

  const { data: fullChain } = useQuery({
    queryKey: ["approval-chain-detail", chain.id],
    queryFn: async () => {
      const r = await authFetch(`${API}/platform/approval-chains/${chain.id}`);
      if (!r.ok) return null;
      return r.json();
    },
    onSuccess: (data: any) => {
      if (data?.levels) {
        setLevels(data.levels.map((l: any) => ({
          ...l,
          approver_emails: l.approver_emails || [],
          approver_user_ids: l.approver_user_ids || [],
          conditions: l.conditions || [],
        })));
      }
    },
  } as any);

  const addLevel = () => {
    const newLevel: ChainLevel = {
      level_order: levels.length,
      name: `שלב ${levels.length + 1}`,
      approver_type: "role",
      approver_role: "",
      approver_emails: [],
      approver_user_ids: [],
      parallel_mode: "all",
      min_approvals: 1,
      timeout_hours: null,
      escalation_role: null,
      conditions: [],
    };
    setLevels([...levels, newLevel]);
    setExpandedLevel(levels.length);
  };

  const removeLevel = (index: number) => {
    setLevels(levels.filter((_, i) => i !== index).map((l, i) => ({ ...l, level_order: i })));
    setExpandedLevel(null);
  };

  const moveLevel = (index: number, direction: "up" | "down") => {
    const newLevels = [...levels];
    const swapIdx = direction === "up" ? index - 1 : index + 1;
    if (swapIdx < 0 || swapIdx >= newLevels.length) return;
    [newLevels[index], newLevels[swapIdx]] = [newLevels[swapIdx], newLevels[index]];
    setLevels(newLevels.map((l, i) => ({ ...l, level_order: i })));
  };

  const updateLevel = (index: number, updates: Partial<ChainLevel>) => {
    setLevels(levels.map((l, i) => i === index ? { ...l, ...updates } : l));
  };

  const save = async () => {
    setIsSaving(true);
    try {
      await authFetch(`${API}/platform/approval-chains/${chain.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description,
          isTemplate,
          levels: levels.map(l => ({
            name: l.name,
            approverType: l.approver_type,
            approverRole: l.approver_role,
            approverEmails: l.approver_emails,
            approverUserIds: l.approver_user_ids,
            parallelMode: l.parallel_mode,
            minApprovals: l.min_approvals,
            timeoutHours: l.timeout_hours,
            escalationRole: l.escalation_role,
            conditions: l.conditions,
          })),
        }),
      });
      queryClient.invalidateQueries({ queryKey: ["approval-chains"] });
      onBack();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 hover:bg-muted rounded-lg transition-colors">
          <X className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-xl font-bold">{name}</h1>
          <p className="text-sm text-muted-foreground">עורך שרשרת אישור</p>
        </div>
        <div className="mr-auto flex gap-2">
          <button onClick={save} disabled={isSaving} className="px-4 py-2 bg-primary text-primary-foreground rounded-xl font-medium disabled:opacity-50">
            {isSaving ? "שומר..." : "שמור"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
          <h2 className="font-semibold">הגדרות כלליות</h2>
          <div>
            <label className="block text-sm font-medium mb-1.5">שם השרשרת</label>
            <input value={name} onChange={e => setName(e.target.value)}
              className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">תיאור</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
              className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none" />
          </div>
          <label className="flex items-center gap-3 cursor-pointer">
            <div onClick={() => setIsTemplate(!isTemplate)}
              className={`w-11 h-6 rounded-full transition-colors ${isTemplate ? "bg-primary" : "bg-muted"}`}>
              <div className={`w-5 h-5 bg-white rounded-full mt-0.5 transition-transform ${isTemplate ? "translate-x-5 mr-0.5" : "translate-x-0.5"}`} />
            </div>
            <span className="text-sm font-medium">שמור כתבנית לשימוש חוזר</span>
          </label>
        </div>

        <div className="bg-card border border-border rounded-2xl p-5">
          <h2 className="font-semibold mb-3">מבנה השרשרת</h2>
          <div className="text-sm text-muted-foreground">
            <p>שרשרת רציפה (Sequential) — כל שלב מופעל לאחר אישור הקודם.</p>
            <p className="mt-1">שלבים מקבילים (Parallel) — כל הרמות יכולות לאשר בו-זמנית.</p>
          </div>
          <div className="mt-3 p-3 bg-muted/50 rounded-xl text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <GitBranch className="w-4 h-4" />
              <span>{levels.length} שלבים מוגדרים</span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">שלבי אישור</h2>
          <button onClick={addLevel} className="flex items-center gap-2 px-3 py-2 bg-primary/10 text-primary rounded-lg text-sm font-medium hover:bg-primary/20 transition-colors">
            <Plus className="w-4 h-4" />
            הוסף שלב
          </button>
        </div>

        {levels.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <UserCheck className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p>הוסף שלב אישור ראשון</p>
          </div>
        ) : (
          <div className="space-y-3">
            {levels.map((level, index) => (
              <div key={index} className="border border-border rounded-xl overflow-hidden">
                <div className="flex items-center gap-3 p-3 bg-muted/30 cursor-pointer"
                  onClick={() => setExpandedLevel(expandedLevel === index ? null : index)}>
                  <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                    {index + 1}
                  </div>
                  <span className="font-medium flex-1">{level.name}</span>
                  <div className="flex items-center gap-1">
                    {level.timeout_hours && (
                      <span className="px-2 py-0.5 text-xs bg-yellow-500/10 text-yellow-500 rounded-full">
                        <AlarmClock className="w-3 h-3 inline mr-1" />{level.timeout_hours}ש'
                      </span>
                    )}
                    {level.approver_role && (
                      <span className="px-2 py-0.5 text-xs bg-blue-500/10 text-blue-400 rounded-full">{level.approver_role}</span>
                    )}
                    <button onClick={e => { e.stopPropagation(); moveLevel(index, "up"); }} disabled={index === 0}
                      className="p-1 hover:bg-muted rounded disabled:opacity-30">
                      <ChevronUp className="w-4 h-4" />
                    </button>
                    <button onClick={e => { e.stopPropagation(); moveLevel(index, "down"); }} disabled={index === levels.length - 1}
                      className="p-1 hover:bg-muted rounded disabled:opacity-30">
                      <ChevronDown className="w-4 h-4" />
                    </button>
                    <button onClick={e => { e.stopPropagation(); removeLevel(index); }}
                      className="p-1 hover:bg-destructive/10 text-destructive rounded">
                      <Trash2 className="w-4 h-4" />
                    </button>
                    {expandedLevel === index ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                  </div>
                </div>
                {expandedLevel === index && (
                  <div className="p-4 space-y-4 border-t border-border">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1.5">שם השלב</label>
                        <input value={level.name} onChange={e => updateLevel(index, { name: e.target.value })}
                          className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">סוג מאשר</label>
                        <select value={level.approver_type} onChange={e => updateLevel(index, { approver_type: e.target.value })}
                          className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                          {APPROVER_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                      </div>
                      {level.approver_type === "role" && (
                        <div>
                          <label className="block text-sm font-medium mb-1.5">תפקיד מאשר</label>
                          <input value={level.approver_role || ""} onChange={e => updateLevel(index, { approver_role: e.target.value })}
                            placeholder="למשל: מנהל, CFO, VP..."
                            className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                        </div>
                      )}
                      {level.approver_type === "email" && (
                        <div>
                          <label className="block text-sm font-medium mb-1.5">אימייל מאשר</label>
                          <input value={(level.approver_emails || []).join(", ")} onChange={e => updateLevel(index, { approver_emails: e.target.value.split(",").map(s => s.trim()).filter(Boolean) })}
                            placeholder="example@company.com, another@company.com"
                            className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                        </div>
                      )}
                      <div>
                        <label className="block text-sm font-medium mb-1.5">מצב אישור מקבילי</label>
                        <select value={level.parallel_mode} onChange={e => updateLevel(index, { parallel_mode: e.target.value })}
                          className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                          {PARALLEL_MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                        </select>
                      </div>
                      {["all", "majority"].includes(level.parallel_mode) && (
                        <div>
                          <label className="block text-sm font-medium mb-1.5">מינימום אישורים</label>
                          <input type="number" min={1} value={level.min_approvals}
                            onChange={e => updateLevel(index, { min_approvals: Number(e.target.value) })}
                            className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                        </div>
                      )}
                      <div>
                        <label className="block text-sm font-medium mb-1.5">פסק זמן (שעות)</label>
                        <input type="number" min={0} value={level.timeout_hours || ""}
                          onChange={e => updateLevel(index, { timeout_hours: e.target.value ? Number(e.target.value) : null })}
                          placeholder="לא מוגדר"
                          className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">תפקיד הסלמה</label>
                        <input value={level.escalation_role || ""} onChange={e => updateLevel(index, { escalation_role: e.target.value || null })}
                          placeholder="תפקיד שיקבל הסלמה אוטומטית..."
                          className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CreateChainModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: (chain: any) => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isTemplate, setIsTemplate] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const create = async () => {
    if (!name) return;
    setIsLoading(true);
    try {
      const r = await authFetch(`${API}/platform/approval-chains`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, isTemplate }),
      });
      const chain = await r.json();
      onSuccess(chain);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
        className="bg-card border border-border rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <h2 className="text-xl font-bold mb-6">שרשרת אישור חדשה</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">שם</label>
            <input value={name} onChange={e => setName(e.target.value)} autoFocus placeholder="למשל: שרשרת אישור הזמנה..."
              className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">תיאור</label>
            <input value={description} onChange={e => setDescription(e.target.value)} placeholder="תיאור קצר..."
              className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={isTemplate} onChange={e => setIsTemplate(e.target.checked)} className="w-4 h-4" />
            <span className="text-sm">שמור כתבנית לשימוש חוזר</span>
          </label>
        </div>
        <div className="flex gap-3 mt-6 pt-4 border-t border-border">
          <button onClick={create} disabled={!name || isLoading}
            className="flex-1 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium disabled:opacity-50">
            {isLoading ? "יוצר..." : "צור ועבור לעריכה"}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 bg-muted rounded-xl font-medium">ביטול</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function CreateRoutingRuleModal({ chains, onClose, onSuccess }: { chains: ApprovalChain[]; onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({ name: "", entityType: "", department: "", chainId: "", priority: 0 });
  const [conditions, setConditions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const create = async () => {
    if (!form.name) return;
    setIsLoading(true);
    try {
      await authFetch(`${API}/platform/approval-routing-rules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, chainId: form.chainId ? Number(form.chainId) : null, conditions }),
      });
      onSuccess();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
        className="bg-card border border-border rounded-2xl p-6 w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <h2 className="text-xl font-bold mb-6">כלל ניתוב חדש</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">שם הכלל</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} autoFocus
              className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1.5">סוג ישות</label>
              <input value={form.entityType} onChange={e => setForm(f => ({ ...f, entityType: e.target.value }))} placeholder="הזמנה, חוזה..."
                className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">מחלקה</label>
              <input value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))} placeholder="רכש, כספים..."
                className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">שרשרת אישור</label>
            <select value={form.chainId} onChange={e => setForm(f => ({ ...f, chainId: e.target.value }))}
              className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
              <option value="">בחר שרשרת...</option>
              {chains.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">עדיפות</label>
            <input type="number" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: Number(e.target.value) }))}
              className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium">תנאים</label>
              <button onClick={() => setConditions([...conditions, { field: "", operator: "equals", value: "" }])}
                className="text-xs text-primary hover:underline">+ הוסף תנאי</button>
            </div>
            {conditions.map((cond, i) => (
              <div key={i} className="flex gap-2 mb-2">
                <input value={cond.field} onChange={e => setConditions(c => c.map((x, j) => j === i ? { ...x, field: e.target.value } : x))}
                  placeholder="שדה" className="flex-1 px-2 py-1.5 bg-background border border-border rounded-lg text-sm" />
                <select value={cond.operator} onChange={e => setConditions(c => c.map((x, j) => j === i ? { ...x, operator: e.target.value } : x))}
                  className="px-2 py-1.5 bg-background border border-border rounded-lg text-sm">
                  <option value="equals">שווה</option>
                  <option value="gt">גדול מ</option>
                  <option value="lt">קטן מ</option>
                  <option value="gte">גדול שווה</option>
                </select>
                <input value={cond.value} onChange={e => setConditions(c => c.map((x, j) => j === i ? { ...x, value: e.target.value } : x))}
                  placeholder="ערך" className="flex-1 px-2 py-1.5 bg-background border border-border rounded-lg text-sm" />
                <button onClick={() => setConditions(c => c.filter((_, j) => j !== i))} className="p-1 text-destructive">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
        <div className="flex gap-3 mt-6 pt-4 border-t border-border">
          <button onClick={create} disabled={!form.name || isLoading}
            className="flex-1 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium disabled:opacity-50">
            {isLoading ? "שומר..." : "צור כלל"}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 bg-muted rounded-xl font-medium">ביטול</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function CreateDelegationModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({ delegatorEmail: "", delegateEmail: "", startDate: "", endDate: "", reason: "" });
  const [isLoading, setIsLoading] = useState(false);

  const create = async () => {
    if (!form.delegatorEmail || !form.delegateEmail || !form.startDate || !form.endDate) return;
    setIsLoading(true);
    try {
      await authFetch(`${API}/platform/approval-delegations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          delegatorEmail: form.delegatorEmail,
          delegateEmail: form.delegateEmail,
          startDate: form.startDate,
          endDate: form.endDate,
          reason: form.reason,
        }),
      });
      onSuccess();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
        className="bg-card border border-border rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <h2 className="text-xl font-bold mb-6">מינוי מחליף</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">מאשר מקורי (אימייל)</label>
            <input value={form.delegatorEmail} onChange={e => setForm(f => ({ ...f, delegatorEmail: e.target.value }))} type="email"
              placeholder="manager@company.com"
              className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">מחליף (אימייל)</label>
            <input value={form.delegateEmail} onChange={e => setForm(f => ({ ...f, delegateEmail: e.target.value }))} type="email"
              placeholder="deputy@company.com"
              className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1.5">מתאריך</label>
              <input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">עד תאריך</label>
              <input type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
                className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">סיבה</label>
            <input value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} placeholder="חופשה, מחלה..."
              className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>
        </div>
        <div className="flex gap-3 mt-6 pt-4 border-t border-border">
          <button onClick={create} disabled={!form.delegatorEmail || !form.delegateEmail || !form.startDate || !form.endDate || isLoading}
            className="flex-1 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium disabled:opacity-50">
            {isLoading ? "שומר..." : "הוסף מינוי"}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 bg-muted rounded-xl font-medium">ביטול</button>
        </div>
      </motion.div>
    </motion.div>
  );
}
