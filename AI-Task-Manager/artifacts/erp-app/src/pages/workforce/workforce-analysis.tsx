import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { authFetch } from "@/lib/utils";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import {
  Users, Briefcase, Factory, Wrench, TrendingUp, TrendingDown,
  Plus, Edit2, Trash2, X, ChevronDown, ChevronUp, DollarSign,
  Target, AlertTriangle, CheckCircle2, BarChart3, ArrowUpRight,
  ArrowDownRight, Star, Clock, Percent, Package, User
} from "lucide-react";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";

const API = "/api";

function n(v: any): number { return Number(v) || 0; }
function fmt(v: any): string { return "₪" + Math.round(n(v)).toLocaleString(); }
function pct(v: any): string { return n(v).toFixed(1) + "%"; }

type WorkerCategory = "salaried" | "sales" | "production" | "installers";

const CATEGORIES: { key: WorkerCategory; label: string; icon: any; emoji: string; subtitle: string; color: string }[] = [
  { key: "salaried", label: "שכירים", icon: Briefcase, emoji: "👔", subtitle: "כל המחלקות", color: "#3B82F6" },
  { key: "sales", label: "סוכני מכירות", icon: TrendingUp, emoji: "💼", subtitle: "קבלן משנה", color: "#8B5CF6" },
  { key: "production", label: "עובדי ייצור", icon: Factory, emoji: "🏭", subtitle: "קבלן משנה · מפעל", color: "#F59E0B" },
  { key: "installers", label: "מתקינים", icon: Wrench, emoji: "🔧", subtitle: "קבלן משנה · שטח", color: "#10B981" },
];

export default function WorkforceAnalysisPage() {
  const { token } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [activeTab, setActiveTab] = useState<WorkerCategory>("salaried");
  const [selectedPerson, setSelectedPerson] = useState<any>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingPerson, setEditingPerson] = useState<any>(null);

  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const { data: summary } = useQuery({
    queryKey: ["workforce-summary"],
    queryFn: async () => {
      const res = await authFetch(`${API}/workforce/summary`, { headers });
      return res.ok ? res.json() : { salaried: 0, salesAgents: 0, production: 0, installers: 0 };
    },
    enabled: !!token,
  });

  const apiPath = activeTab === "sales" ? "sales-agents" : activeTab;
  const { data: people = [] } = useQuery<any[]>({
    queryKey: ["workforce", activeTab],
    queryFn: async () => {
      const res = await authFetch(`${API}/workforce/${apiPath}`, { headers });
      if (!res.ok) return [];
      const d = await res.json();
      return Array.isArray(d) ? d : [];
    },
    enabled: !!token,
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const isEdit = !!editingPerson;
      const url = isEdit ? `${API}/workforce/${apiPath}/${editingPerson.id}` : `${API}/workforce/${apiPath}`;
      const res = await authFetch(url, { method: isEdit ? "PUT" : "POST", headers, body: JSON.stringify(data) });
      if (!res.ok) throw new Error("שגיאה");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workforce"] });
      queryClient.invalidateQueries({ queryKey: ["workforce-summary"] });
      toast({ title: editingPerson ? "עודכן" : "נוצר", description: "בהצלחה" });
      setShowForm(false);
      setEditingPerson(null);
    },
    onError: () => toast({ title: "שגיאה", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await authFetch(`${API}/workforce/${apiPath}/${id}`, { method: "DELETE", headers });
      if (!res.ok) throw new Error("שגיאה");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workforce"] });
      queryClient.invalidateQueries({ queryKey: ["workforce-summary"] });
      setSelectedPerson(null);
      toast({ title: "נמחק" });
    },
  });

  function getCounts(key: WorkerCategory): number {
    if (!summary) return 0;
    const map: Record<string, string> = { salaried: "salaried", sales: "salesAgents", production: "production", installers: "installers" };
    return n(summary[map[key]]);
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto" dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold flex items-center gap-2">
            <Users className="w-7 h-7 text-blue-500" />
            ניתוח כדאיות כוח אדם
          </h1>
          <p className="text-sm text-muted-foreground mt-1">4 סוגי כוח אדם — מודל נתונים שונה לכל סוג</p>
        </div>
        <button
          onClick={() => { setEditingPerson(null); setShowForm(true); }}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-foreground rounded-lg text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          הוסף {CATEGORIES.find(c => c.key === activeTab)?.label}
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {CATEGORIES.map(cat => (
          <button
            key={cat.key}
            onClick={() => { setActiveTab(cat.key); setSelectedPerson(null); }}
            className={`p-4 rounded-xl border-2 transition-all text-right ${
              activeTab === cat.key
                ? "border-current shadow-lg scale-[1.02]"
                : "border-transparent bg-card hover:border-muted-foreground/20"
            }`}
            style={activeTab === cat.key ? { borderColor: cat.color, backgroundColor: `${cat.color}08` } : {}}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-2xl">{cat.emoji}</span>
              <span className="text-lg sm:text-2xl font-bold" style={{ color: cat.color }}>{getCounts(cat.key)}</span>
            </div>
            <div className="font-semibold text-sm">{cat.label}</div>
            <div className="text-xs text-muted-foreground">{cat.subtitle}</div>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-1">
          <div className="bg-card border rounded-xl overflow-hidden">
            <div className="p-3 border-b bg-muted/30">
              <h3 className="font-semibold text-sm">
                {CATEGORIES.find(c => c.key === activeTab)?.emoji} {CATEGORIES.find(c => c.key === activeTab)?.label}
              </h3>
            </div>
            <div className="divide-y max-h-[600px] overflow-y-auto">
              {people.length === 0 && (
                <div className="p-8 text-center text-muted-foreground text-sm">
                  <User className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  אין רשומות עדיין
                </div>
              )}
              {people.map((p: any) => {
                const roi = calcROI(p, activeTab);
                return (
                  <button
                    key={p.id}
                    onClick={() => setSelectedPerson(p)}
                    className={`w-full text-right p-3 hover:bg-muted/50 transition-colors ${selectedPerson?.id === p.id ? "bg-muted/70" : ""}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-foreground text-xs font-bold">
                          {p.fullName?.charAt(0) || "?"}
                        </div>
                        <div>
                          <div className="font-medium text-sm">{p.fullName}</div>
                          <div className="text-xs text-muted-foreground">
                            {activeTab === "salaried" ? (p.title || p.department || "") : (p.type || p.specialization || "")}
                          </div>
                        </div>
                      </div>
                      <div className="text-left">
                        <div className={`text-xs font-bold ${roi >= 0 ? "text-green-600" : "text-red-500"}`}>
                          {roi >= 0 ? "+" : ""}{roi.toFixed(0)}%
                        </div>
                        <div className="text-[10px] text-muted-foreground">ROI</div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="lg:col-span-2">
          {selectedPerson ? (
            <PersonDetail
              person={selectedPerson}
              category={activeTab}
              token={token}
              onEdit={() => { setEditingPerson(selectedPerson); setShowForm(true); }}
              onDelete={async () => { if (await globalConfirm("למחוק רשומה זו?")) deleteMutation.mutate(selectedPerson.id); }}
            />
          ) : (
            <div className="bg-card border rounded-xl p-12 text-center text-muted-foreground">
              <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>בחר עובד מהרשימה לצפייה בפרטים</p>
            </div>
          )}
        </div>
      </div>

      <RelatedRecords tabs={[
        { key: "employees", label: "עובדים", endpoint: "/api/hr/employees?limit=10", columns: [{ key: "first_name", label: "שם" }, { key: "department", label: "מחלקה" }, { key: "position", label: "תפקיד" }] },
      ]} />

      <ActivityLog entityType="workforce-analysis" compact />

      {showForm && (
        <PersonFormModal
          category={activeTab}
          person={editingPerson}
          onSave={(data) => createMutation.mutate(data)}
          onClose={() => { setShowForm(false); setEditingPerson(null); }}
          saving={createMutation.isPending}
        />
      )}
    </div>
  );
}

function calcROI(p: any, category: WorkerCategory): number {
  if (category === "salaried") {
    const totalCost = n(p.baseSalary) + n(p.bonus) + n(p.pensionCost) + n(p.healthInsurance) + n(p.mealAllowance) + n(p.vehicleCost) + n(p.licensesCost) + n(p.cloudCost) + n(p.coachingCost) + n(p.recruitmentCost);
    const totalValue = n(p.directValue) + n(p.indirectValue);
    return totalCost > 0 ? ((totalValue - totalCost) / totalCost) * 100 : 0;
  }
  return 0;
}

function PersonDetail({ person: p, category, token, onEdit, onDelete }: { person: any; category: WorkerCategory; token: string | null; onEdit: () => void; onDelete: () => void }) {
  const [activeDetailTab, setActiveDetailTab] = useState("overview");
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const subApiPath = category === "sales" ? "sales-agents" : category;

  const { data: tasks = [] } = useQuery<any[]>({
    queryKey: ["workforce-tasks", p.id, category],
    queryFn: async () => {
      if (category !== "salaried") return [];
      const res = await authFetch(`${API}/workforce/salaried/${p.id}/tasks`, { headers });
      return res.ok ? await res.json() : [];
    },
    enabled: !!token && category === "salaried",
  });

  const { data: kpis = [] } = useQuery<any[]>({
    queryKey: ["workforce-kpis", p.id, category],
    queryFn: async () => {
      if (category !== "salaried") return [];
      const res = await authFetch(`${API}/workforce/salaried/${p.id}/kpis`, { headers });
      return res.ok ? await res.json() : [];
    },
    enabled: !!token && category === "salaried",
  });

  const { data: deals = [] } = useQuery<any[]>({
    queryKey: ["workforce-deals", p.id, category],
    queryFn: async () => {
      if (category !== "sales") return [];
      const res = await authFetch(`${API}/workforce/sales-agents/${p.id}/deals`, { headers });
      return res.ok ? await res.json() : [];
    },
    enabled: !!token && category === "sales",
  });

  const { data: monthly = [] } = useQuery<any[]>({
    queryKey: ["workforce-monthly", p.id, category],
    queryFn: async () => {
      if (category !== "production" && category !== "installers") return [];
      const path = category === "production" ? `production/${p.id}/monthly` : `installers/${p.id}/monthly`;
      const res = await authFetch(`${API}/workforce/${path}`, { headers });
      return res.ok ? await res.json() : [];
    },
    enabled: !!token && (category === "production" || category === "installers"),
  });

  const addSubMutation = useMutation({
    mutationFn: async ({ path, data }: { path: string; data: any }) => {
      const res = await authFetch(`${API}/workforce/${path}`, { method: "POST", headers, body: JSON.stringify(data) });
      if (!res.ok) throw new Error("שגיאה");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workforce-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["workforce-kpis"] });
      queryClient.invalidateQueries({ queryKey: ["workforce-deals"] });
      queryClient.invalidateQueries({ queryKey: ["workforce-monthly"] });
      toast({ title: "נוסף בהצלחה" });
    },
  });

  const deleteSubMutation = useMutation({
    mutationFn: async (path: string) => {
      const res = await authFetch(`${API}/workforce/${path}`, { method: "DELETE", headers });
      if (!res.ok) throw new Error("שגיאה");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workforce-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["workforce-kpis"] });
      queryClient.invalidateQueries({ queryKey: ["workforce-deals"] });
      queryClient.invalidateQueries({ queryKey: ["workforce-monthly"] });
    },
  });

  if (category === "salaried") return <SalariedDetail p={p} tasks={tasks} kpis={kpis} onEdit={onEdit} onDelete={onDelete} addSub={addSubMutation} deleteSub={deleteSubMutation} activeDetailTab={activeDetailTab} setActiveDetailTab={setActiveDetailTab} />;
  if (category === "sales") return <SalesDetail p={p} deals={deals} onEdit={onEdit} onDelete={onDelete} addSub={addSubMutation} deleteSub={deleteSubMutation} activeDetailTab={activeDetailTab} setActiveDetailTab={setActiveDetailTab} />;
  if (category === "production") return <ProductionDetail p={p} monthly={monthly} onEdit={onEdit} onDelete={onDelete} addSub={addSubMutation} deleteSub={deleteSubMutation} activeDetailTab={activeDetailTab} setActiveDetailTab={setActiveDetailTab} />;
  if (category === "installers") return <InstallerDetail p={p} monthly={monthly} onEdit={onEdit} onDelete={onDelete} addSub={addSubMutation} deleteSub={deleteSubMutation} activeDetailTab={activeDetailTab} setActiveDetailTab={setActiveDetailTab} />;
  return null;
}

function DetailHeader({ p, category, roi, totalCost, totalValue, netValue, onEdit, onDelete }: any) {
  return (
    <div className="p-4 border-b">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-foreground text-xl font-bold">
            {p.fullName?.charAt(0) || "?"}
          </div>
          <div>
            <h2 className="text-xl font-bold">{p.fullName}</h2>
            <div className="text-sm text-muted-foreground">
              {p.title && <span>{p.title}</span>}
              {p.department && <span> · מחלקה: {p.department}</span>}
              {p.manager && <span> · מנהל: {p.manager}</span>}
              {p.startDate && <span> · החל: {new Date(p.startDate).toLocaleDateString("he-IL", { month: "short", year: "numeric" })}</span>}
              {p.type && <span>{p.type}</span>}
              {p.specialization && <span> · {p.specialization}</span>}
            </div>
            {n(p.attritionRisk) > 0 && (
              <div className="flex items-center gap-1 mt-1">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-xs text-amber-600">סיכון עזיבה {pct(p.attritionRisk)}</span>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className={`px-3 py-1 rounded-full text-sm font-bold ${roi >= 0 ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"}`}>
            ROI {roi >= 0 ? "+" : ""}{roi.toFixed(0)}%
          </div>
          <button onClick={onEdit} className="p-1.5 hover:bg-muted rounded-lg"><Edit2 className="w-4 h-4" /></button>
          <button onClick={onDelete} className="p-1.5 hover:bg-red-500/10 rounded-lg"><Trash2 className="w-4 h-4 text-red-400" /></button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-4">
        {[
          { label: "עלות כוללת", value: fmt(totalCost), color: "text-red-500" },
          { label: "ערך ישיר", value: fmt(category === "salaried" ? p.directValue : totalValue), color: "text-blue-500" },
          { label: "ערך עקיף", value: fmt(category === "salaried" ? p.indirectValue : 0), color: "text-cyan-500" },
          { label: "ערך נטו", value: (netValue >= 0 ? "+" : "") + fmt(netValue), color: netValue >= 0 ? "text-green-600" : "text-red-500" },
          { label: "ROI", value: (roi >= 0 ? "+" : "") + roi.toFixed(0) + "%", color: roi >= 0 ? "text-green-600" : "text-red-500" },
        ].map((item, i) => (
          <div key={i} className="bg-muted/30 rounded-lg p-3 text-center">
            <div className="text-xs text-muted-foreground mb-1">{item.label}</div>
            <div className={`text-lg font-bold ${item.color}`}>{item.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TabBar({ tabs, active, onChange }: { tabs: { key: string; label: string }[]; active: string; onChange: (k: string) => void }) {
  return (
    <div className="flex border-b px-4 overflow-x-auto">
      {tabs.map(t => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            active === t.key ? "border-blue-500 text-blue-600" : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ==================== SALARIED DETAIL ====================

function SalariedDetail({ p, tasks, kpis, onEdit, onDelete, addSub, deleteSub, activeDetailTab, setActiveDetailTab }: any) {
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [showKpiForm, setShowKpiForm] = useState(false);
  const [taskForm, setTaskForm] = useState({ taskName: "", qualityScore: "", dueDate: "" });
  const [kpiForm, setKpiForm] = useState({ kpiName: "", actualValue: "", benchmarkValue: "", unit: "", period: "" });

  const totalCost = n(p.baseSalary) + n(p.bonus) + n(p.pensionCost) + n(p.healthInsurance) + n(p.mealAllowance) + n(p.vehicleCost) + n(p.licensesCost) + n(p.cloudCost) + n(p.coachingCost) + n(p.recruitmentCost);
  const totalValue = n(p.directValue) + n(p.indirectValue);
  const netValue = totalValue - totalCost;
  const roi = totalCost > 0 ? ((totalValue - totalCost) / totalCost) * 100 : 0;

  const costBreakdown = [
    { label: "שכר (כולל בונוס)", value: n(p.baseSalary) + n(p.bonus) },
    { label: "הטבות סוציאליות", value: n(p.pensionCost) + n(p.healthInsurance) },
    { label: "תשתית ורישיונות", value: n(p.licensesCost) + n(p.cloudCost) },
    { label: "הדרכה ופיתוח", value: n(p.coachingCost) },
    { label: "גיוס + Onboarding", value: n(p.recruitmentCost) },
    { label: "אוכל + רכב", value: n(p.mealAllowance) + n(p.vehicleCost) },
  ];

  return (
    <div className="bg-card border rounded-xl overflow-hidden">
      <DetailHeader p={p} category="salaried" roi={roi} totalCost={totalCost} totalValue={totalValue} netValue={netValue} onEdit={onEdit} onDelete={onDelete} />
      <TabBar
        tabs={[
          { key: "overview", label: "סקירה" },
          { key: "financial", label: "פיננסי" },
          { key: "tasks", label: "משימות" },
          { key: "kpis", label: "KPIs" },
          { key: "risk", label: "סיכון" },
        ]}
        active={activeDetailTab}
        onChange={setActiveDetailTab}
      />
      <div className="p-4">
        {activeDetailTab === "overview" && (
          <div className="space-y-3">
            <h3 className="font-semibold text-sm mb-2">עלות מול ערך — פירוט</h3>
            <div className="space-y-2">
              {costBreakdown.filter(c => c.value > 0).map((c, i) => (
                <div key={i} className="flex items-center justify-between py-1.5 border-b border-dashed last:border-0">
                  <span className="text-sm">{c.label}</span>
                  <span className="text-sm font-medium">{fmt(c.value)}</span>
                </div>
              ))}
              <div className="flex items-center justify-between py-1.5 font-bold text-red-500 border-t-2">
                <span>סה״כ עלות</span>
                <span>{fmt(totalCost)}</span>
              </div>
              <div className="flex items-center justify-between py-1.5">
                <span className="text-sm">ערך ישיר (תרומה למחלקה)</span>
                <span className="text-sm font-medium text-blue-600">{fmt(p.directValue)}</span>
              </div>
              <div className="flex items-center justify-between py-1.5">
                <span className="text-sm">ערך עקיף (ידע, ניחות)</span>
                <span className="text-sm font-medium text-cyan-600">{fmt(p.indirectValue)}</span>
              </div>
              <div className="flex items-center justify-between py-1.5 font-bold text-blue-600 border-t">
                <span>סה״כ ערך</span>
                <span>{fmt(totalValue)}</span>
              </div>
              <div className={`flex items-center justify-between py-2 font-bold text-lg border-t-2 ${netValue >= 0 ? "text-green-600" : "text-red-500"}`}>
                <span>ערך נטו לחברה</span>
                <span>{netValue >= 0 ? "+" : ""}{fmt(netValue)}</span>
              </div>
              <div className={`flex items-center justify-between py-1 font-bold ${roi >= 0 ? "text-green-600" : "text-red-500"}`}>
                <span>ROI</span>
                <span>{roi >= 0 ? "+" : ""}{roi.toFixed(0)}%</span>
              </div>
            </div>
          </div>
        )}

        {activeDetailTab === "financial" && (
          <div>
            <h3 className="font-semibold mb-3">פירוט עלויות שנתי</h3>
            <div className="space-y-2">
              {[
                { label: "שכר בסיס", val: p.baseSalary },
                { label: "בונוס", val: p.bonus },
                { label: "פנסיה", val: p.pensionCost },
                { label: "ביטוח בריאות", val: p.healthInsurance },
                { label: "ארוחות", val: p.mealAllowance },
                { label: "רכב", val: p.vehicleCost },
                { label: "רישיונות", val: p.licensesCost },
                { label: "ענן", val: p.cloudCost },
                { label: "קואצ׳ינג / הדרכה", val: p.coachingCost },
                { label: "גיוס", val: p.recruitmentCost },
              ].map((item, i) => {
                const v = n(item.val);
                const pctOfTotal = totalCost > 0 ? (v / totalCost) * 100 : 0;
                return (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-sm w-36 shrink-0">{item.label}</span>
                    <div className="flex-1 bg-muted rounded-full h-4 overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${pctOfTotal}%` }} />
                    </div>
                    <span className="text-sm font-medium w-24 text-left">{fmt(v)}</span>
                    <span className="text-xs text-muted-foreground w-12 text-left">{pctOfTotal.toFixed(0)}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeDetailTab === "tasks" && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">משימות</h3>
              <button onClick={() => setShowTaskForm(!showTaskForm)} className="text-xs px-3 py-1.5 bg-blue-600 text-foreground rounded-lg">
                <Plus className="w-3 h-3 inline ml-1" />הוסף משימה
              </button>
            </div>
            {showTaskForm && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3 p-3 bg-muted/30 rounded-lg">
                <input value={taskForm.taskName} onChange={e => setTaskForm(f => ({ ...f, taskName: e.target.value }))} placeholder="שם משימה" className="border rounded px-2 py-1.5 text-sm bg-background" />
                <input type="number" value={taskForm.qualityScore} onChange={e => setTaskForm(f => ({ ...f, qualityScore: e.target.value }))} placeholder="ציון איכות (0-100)" className="border rounded px-2 py-1.5 text-sm bg-background" />
                <div className="flex gap-1">
                  <input type="date" value={taskForm.dueDate} onChange={e => setTaskForm(f => ({ ...f, dueDate: e.target.value }))} className="border rounded px-2 py-1.5 text-sm bg-background flex-1" />
                  <button
                    onClick={() => { if (taskForm.taskName) { addSub.mutate({ path: `salaried/${p.id}/tasks`, data: taskForm }); setTaskForm({ taskName: "", qualityScore: "", dueDate: "" }); setShowTaskForm(false); } }}
                    className="px-3 py-1.5 bg-green-600 text-foreground rounded text-sm"
                  >שמור</button>
                </div>
              </div>
            )}
            <div className="space-y-1">
              {(Array.isArray(tasks) ? tasks : []).map((t: any) => (
                <div key={t.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/30">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className={`w-4 h-4 ${t.status === "completed" ? "text-green-500" : "text-muted-foreground"}`} />
                    <span className="text-sm">{t.taskName}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {t.qualityScore && <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">{n(t.qualityScore).toFixed(0)}%</span>}
                    <button onClick={() => deleteSub.mutate(`salaried-tasks/${t.id}`)} className="p-1 hover:bg-red-500/10 rounded">
                      <Trash2 className="w-3.5 h-3.5 text-red-400" />
                    </button>
                  </div>
                </div>
              ))}
              {(!tasks || tasks.length === 0) && <p className="text-sm text-muted-foreground text-center py-4">אין משימות</p>}
            </div>
          </div>
        )}

        {activeDetailTab === "kpis" && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">KPIs מול Benchmark</h3>
              <button onClick={() => setShowKpiForm(!showKpiForm)} className="text-xs px-3 py-1.5 bg-blue-600 text-foreground rounded-lg">
                <Plus className="w-3 h-3 inline ml-1" />הוסף KPI
              </button>
            </div>
            {showKpiForm && (
              <div className="grid grid-cols-5 gap-2 mb-3 p-3 bg-muted/30 rounded-lg">
                <input value={kpiForm.kpiName} onChange={e => setKpiForm(f => ({ ...f, kpiName: e.target.value }))} placeholder="שם KPI" className="border rounded px-2 py-1.5 text-sm bg-background" />
                <input type="number" value={kpiForm.actualValue} onChange={e => setKpiForm(f => ({ ...f, actualValue: e.target.value }))} placeholder="ערך בפועל" className="border rounded px-2 py-1.5 text-sm bg-background" />
                <input type="number" value={kpiForm.benchmarkValue} onChange={e => setKpiForm(f => ({ ...f, benchmarkValue: e.target.value }))} placeholder="Benchmark" className="border rounded px-2 py-1.5 text-sm bg-background" />
                <input value={kpiForm.unit} onChange={e => setKpiForm(f => ({ ...f, unit: e.target.value }))} placeholder="יחידה" className="border rounded px-2 py-1.5 text-sm bg-background" />
                <button
                  onClick={() => { if (kpiForm.kpiName) { addSub.mutate({ path: `salaried/${p.id}/kpis`, data: kpiForm }); setKpiForm({ kpiName: "", actualValue: "", benchmarkValue: "", unit: "", period: "" }); setShowKpiForm(false); } }}
                  className="px-3 py-1.5 bg-green-600 text-foreground rounded text-sm"
                >שמור</button>
              </div>
            )}
            <div className="space-y-2">
              {(Array.isArray(kpis) ? kpis : []).map((k: any) => {
                const actual = n(k.actualValue);
                const bench = n(k.benchmarkValue);
                const pctVal = bench > 0 ? (actual / bench) * 100 : 0;
                const isGood = actual >= bench;
                return (
                  <div key={k.id} className="p-3 rounded-lg bg-muted/20">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium">{k.kpiName}</span>
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-bold ${isGood ? "text-green-600" : "text-red-500"}`}>
                          {actual.toFixed(0)} {k.unit || ""}
                        </span>
                        <span className="text-xs text-muted-foreground">/ {bench.toFixed(0)} {k.unit || ""}</span>
                        <button onClick={() => deleteSub.mutate(`salaried-kpis/${k.id}`)} className="p-1 hover:bg-red-500/10 rounded">
                          <Trash2 className="w-3 h-3 text-red-400" />
                        </button>
                      </div>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                      <div className={`h-full rounded-full ${isGood ? "bg-green-500" : "bg-red-500"}`} style={{ width: `${Math.min(pctVal, 100)}%` }} />
                    </div>
                  </div>
                );
              })}
              {(!kpis || kpis.length === 0) && <p className="text-sm text-muted-foreground text-center py-4">אין KPIs</p>}
            </div>
          </div>
        )}

        {activeDetailTab === "risk" && (
          <div className="space-y-4">
            <h3 className="font-semibold">ניתוח סיכון עזיבה</h3>
            <div className="flex items-center gap-4">
              <div className="w-24 h-24 rounded-full border-4 flex items-center justify-center" style={{ borderColor: n(p.attritionRisk) > 30 ? "#EF4444" : n(p.attritionRisk) > 15 ? "#F59E0B" : "#22C55E" }}>
                <span className="text-lg sm:text-2xl font-bold">{n(p.attritionRisk).toFixed(0)}%</span>
              </div>
              <div>
                <div className="font-medium">
                  {n(p.attritionRisk) > 30 ? "סיכון גבוה" : n(p.attritionRisk) > 15 ? "סיכון בינוני" : "סיכון נמוך"}
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {n(p.attritionRisk) > 30 ? "נדרשת תשומת לב מיידית — שימור והעלאת שכר" : n(p.attritionRisk) > 15 ? "כדאי לבצע שיחת שימור ולבדוק שביעות רצון" : "העובד מרוצה — המשך מעקב שוטף"}
                </p>
              </div>
            </div>
            {p.notes && (
              <div className="p-3 bg-muted/30 rounded-lg">
                <div className="text-xs font-semibold text-muted-foreground mb-1">הערות</div>
                <p className="text-sm">{p.notes}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ==================== SALES DETAIL ====================

function SalesDetail({ p, deals, onEdit, onDelete, addSub, deleteSub, activeDetailTab, setActiveDetailTab }: any) {
  const [showDealForm, setShowDealForm] = useState(false);
  const [dealForm, setDealForm] = useState({ dealName: "", contractValue: "", commissionPct: "", actualCommission: "", status: "pipeline" });

  const safeDeals = Array.isArray(deals) ? deals : [];
  const closedDeals = safeDeals.filter((d: any) => d.status === "closed" || d.status === "סגור");
  const pipelineDeals = safeDeals.filter((d: any) => d.status === "pipeline" || d.status === "Pipeline");
  const riskDeals = safeDeals.filter((d: any) => d.status === "risk" || d.status === "בסיכון");

  const totalRevenue = closedDeals.reduce((s: number, d: any) => s + n(d.contractValue), 0);
  const totalCommissions = safeDeals.reduce((s: number, d: any) => s + n(d.actualCommission), 0);
  const totalRetainer = n(p.retainerFee) * 12;
  const totalCost = totalCommissions + totalRetainer;
  const roi = totalCost > 0 ? ((totalRevenue - totalCost) / totalCost) * 100 : 0;
  const pipelineValue = pipelineDeals.reduce((s: number, d: any) => s + n(d.contractValue), 0);
  const coverageRatio = totalRevenue > 0 ? pipelineValue / totalRevenue : 0;

  return (
    <div className="bg-card border rounded-xl overflow-hidden">
      <DetailHeader p={p} category="sales" roi={roi} totalCost={totalCost} totalValue={totalRevenue} netValue={totalRevenue - totalCost} onEdit={onEdit} onDelete={onDelete} />
      <TabBar
        tabs={[
          { key: "overview", label: "סקירה" },
          { key: "deals", label: "עסקאות" },
          { key: "commission", label: "מבנה עמלות" },
        ]}
        active={activeDetailTab}
        onChange={setActiveDetailTab}
      />
      <div className="p-4">
        {activeDetailTab === "overview" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 text-center">
                <div className="text-xs text-muted-foreground">עסקאות סגורות</div>
                <div className="text-xl font-bold text-green-600">{closedDeals.length}</div>
                <div className="text-xs font-medium">{fmt(totalRevenue)}</div>
              </div>
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 text-center">
                <div className="text-xs text-muted-foreground">Pipeline</div>
                <div className="text-xl font-bold text-blue-600">{pipelineDeals.length}</div>
                <div className="text-xs font-medium">{fmt(pipelineValue)}</div>
              </div>
              <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3 text-center">
                <div className="text-xs text-muted-foreground">בסיכון</div>
                <div className="text-xl font-bold text-red-600">{riskDeals.length}</div>
                <div className="text-xs font-medium">{fmt(riskDeals.reduce((s: number, d: any) => s + n(d.contractValue), 0))}</div>
              </div>
            </div>
            <div className="bg-muted/30 rounded-lg p-3">
              <div className="text-xs text-muted-foreground mb-1">יחס כיסוי Pipeline</div>
              <div className="text-lg font-bold">{coverageRatio.toFixed(1)}x</div>
              <div className="text-xs text-muted-foreground">{coverageRatio >= 3 ? "מצוין" : coverageRatio >= 2 ? "טוב" : "נמוך — נדרשת הגדלת Pipeline"}</div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between py-1 border-b"><span className="text-sm">הכנסות שנוצרו (סגורות)</span><span className="font-medium text-sm">{fmt(totalRevenue)}</span></div>
              <div className="flex justify-between py-1 border-b"><span className="text-sm">סה״כ עמלות</span><span className="font-medium text-sm text-red-500">{fmt(totalCommissions)}</span></div>
              <div className="flex justify-between py-1 border-b"><span className="text-sm">Retainer שנתי</span><span className="font-medium text-sm text-red-500">{fmt(totalRetainer)}</span></div>
              <div className={`flex justify-between py-1 font-bold ${roi >= 0 ? "text-green-600" : "text-red-500"}`}>
                <span>ROI = הכנסות ÷ עמלות</span>
                <span>{roi >= 0 ? "+" : ""}{roi.toFixed(0)}%</span>
              </div>
            </div>
          </div>
        )}

        {activeDetailTab === "deals" && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">עסקאות</h3>
              <button onClick={() => setShowDealForm(!showDealForm)} className="text-xs px-3 py-1.5 bg-blue-600 text-foreground rounded-lg">
                <Plus className="w-3 h-3 inline ml-1" />הוסף עסקה
              </button>
            </div>
            {showDealForm && (
              <div className="grid grid-cols-5 gap-2 mb-3 p-3 bg-muted/30 rounded-lg">
                <input value={dealForm.dealName} onChange={e => setDealForm(f => ({ ...f, dealName: e.target.value }))} placeholder="שם עסקה" className="border rounded px-2 py-1.5 text-sm bg-background" />
                <input type="number" value={dealForm.contractValue} onChange={e => setDealForm(f => ({ ...f, contractValue: e.target.value }))} placeholder="ערך חוזה" className="border rounded px-2 py-1.5 text-sm bg-background" />
                <input type="number" value={dealForm.commissionPct} onChange={e => setDealForm(f => ({ ...f, commissionPct: e.target.value }))} placeholder="% עמלה" className="border rounded px-2 py-1.5 text-sm bg-background" />
                <select value={dealForm.status} onChange={e => setDealForm(f => ({ ...f, status: e.target.value }))} className="border rounded px-2 py-1.5 text-sm bg-background">
                  <option value="pipeline">Pipeline</option>
                  <option value="closed">סגור</option>
                  <option value="risk">בסיכון</option>
                </select>
                <button
                  onClick={() => { if (dealForm.dealName) { addSub.mutate({ path: `sales-agents/${p.id}/deals`, data: dealForm }); setDealForm({ dealName: "", contractValue: "", commissionPct: "", actualCommission: "", status: "pipeline" }); setShowDealForm(false); } }}
                  className="px-3 py-1.5 bg-green-600 text-foreground rounded text-sm"
                >שמור</button>
              </div>
            )}
            <div className="space-y-1">
              {safeDeals.map((d: any) => (
                <div key={d.id} className="flex items-center justify-between p-2.5 rounded-lg hover:bg-muted/30 border-r-4" style={{ borderColor: d.status === "closed" || d.status === "סגור" ? "#22C55E" : d.status === "risk" || d.status === "בסיכון" ? "#EF4444" : "#3B82F6" }}>
                  <div>
                    <div className="text-sm font-medium">{d.dealName}</div>
                    <div className="text-xs text-muted-foreground">
                      {fmt(d.contractValue)} · {n(d.commissionPct)}% · עמלה: {fmt(d.actualCommission)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${d.status === "closed" || d.status === "סגור" ? "bg-green-100 text-green-700" : d.status === "risk" || d.status === "בסיכון" ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"}`}>
                      {d.status === "closed" ? "סגור" : d.status === "risk" ? "בסיכון" : d.status === "pipeline" ? "Pipeline" : d.status}
                    </span>
                    <button onClick={() => deleteSub.mutate(`sales-deals/${d.id}`)} className="p-1 hover:bg-red-500/10 rounded">
                      <Trash2 className="w-3.5 h-3.5 text-red-400" />
                    </button>
                  </div>
                </div>
              ))}
              {safeDeals.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">אין עסקאות</p>}
            </div>
          </div>
        )}

        {activeDetailTab === "commission" && (
          <div className="space-y-3">
            <h3 className="font-semibold">מבנה עמלות</h3>
            {[
              { label: "Retainer חודשי", value: fmt(p.retainerFee) },
              { label: "% סגירה", value: pct(p.closingCommissionPct) },
              { label: "% Upsell", value: pct(p.upsellCommissionPct) },
              { label: "בונוס יעד", value: fmt(p.targetBonusAmount) },
              { label: "סף בונוס", value: fmt(p.targetBonusThreshold) },
            ].map((item, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b last:border-0">
                <span className="text-sm">{item.label}</span>
                <span className="text-sm font-medium">{item.value}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ==================== PRODUCTION DETAIL ====================

function ProductionDetail({ p, monthly, onEdit, onDelete, addSub, deleteSub, activeDetailTab, setActiveDetailTab }: any) {
  const [showMonthForm, setShowMonthForm] = useState(false);
  const [monthForm, setMonthForm] = useState({ month: "", unitsProduced: "", targetUnits: "", hoursWorked: "", defectRate: "", reworkRate: "", totalPay: "", productionValue: "" });

  const safeMonthly = Array.isArray(monthly) ? monthly : [];
  const totalPay = safeMonthly.reduce((s: number, m: any) => s + n(m.totalPay), 0);
  const totalProdValue = safeMonthly.reduce((s: number, m: any) => s + n(m.productionValue), 0);
  const totalCost = totalPay + n(p.overheadCost) + n(p.materialWasteCost);
  const roi = totalCost > 0 ? ((totalProdValue - totalCost) / totalCost) * 100 : 0;
  const avgDefect = safeMonthly.length > 0 ? safeMonthly.reduce((s: number, m: any) => s + n(m.defectRate), 0) / safeMonthly.length : 0;

  return (
    <div className="bg-card border rounded-xl overflow-hidden">
      <DetailHeader p={p} category="production" roi={roi} totalCost={totalCost} totalValue={totalProdValue} netValue={totalProdValue - totalCost} onEdit={onEdit} onDelete={onDelete} />
      <TabBar
        tabs={[
          { key: "overview", label: "סקירה" },
          { key: "monthly", label: "חודשי" },
          { key: "quality", label: "איכות" },
        ]}
        active={activeDetailTab}
        onChange={setActiveDetailTab}
      />
      <div className="p-4">
        {activeDetailTab === "overview" && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-muted/30 rounded-lg p-3">
                <div className="text-xs text-muted-foreground">מודל תשלום</div>
                <div className="font-bold">{p.payModel === "per_unit" ? "ליחידה" : "לשעה"}</div>
                <div className="text-sm">{p.payModel === "per_unit" ? `${fmt(p.ratePerUnit)} ליחידה` : `${fmt(p.ratePerHour)} לשעה`}</div>
              </div>
              <div className="bg-muted/30 rounded-lg p-3">
                <div className="text-xs text-muted-foreground">שיעור פגמים ממוצע</div>
                <div className={`font-bold ${avgDefect > 5 ? "text-red-500" : "text-green-600"}`}>{avgDefect.toFixed(1)}%</div>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between py-1 border-b"><span className="text-sm">תשלום שנתי</span><span className="font-medium text-sm">{fmt(totalPay)}</span></div>
              <div className="flex justify-between py-1 border-b"><span className="text-sm">תקורה</span><span className="font-medium text-sm">{fmt(p.overheadCost)}</span></div>
              <div className="flex justify-between py-1 border-b"><span className="text-sm">בזבוז חומרים</span><span className="font-medium text-sm">{fmt(p.materialWasteCost)}</span></div>
              <div className="flex justify-between py-1 border-b font-bold text-red-500"><span>סה״כ עלות</span><span>{fmt(totalCost)}</span></div>
              <div className="flex justify-between py-1 border-b font-bold text-blue-600"><span>ערך ייצור</span><span>{fmt(totalProdValue)}</span></div>
              <div className={`flex justify-between py-1 font-bold ${roi >= 0 ? "text-green-600" : "text-red-500"}`}>
                <span>ROI = ערך ÷ עלות</span><span>{roi >= 0 ? "+" : ""}{roi.toFixed(0)}%</span>
              </div>
            </div>
          </div>
        )}

        {activeDetailTab === "monthly" && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">נתונים חודשיים</h3>
              <button onClick={() => setShowMonthForm(!showMonthForm)} className="text-xs px-3 py-1.5 bg-blue-600 text-foreground rounded-lg">
                <Plus className="w-3 h-3 inline ml-1" />הוסף חודש
              </button>
            </div>
            {showMonthForm && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3 p-3 bg-muted/30 rounded-lg text-sm">
                <input value={monthForm.month} onChange={e => setMonthForm(f => ({ ...f, month: e.target.value }))} placeholder="YYYY-MM" className="border rounded px-2 py-1.5 bg-background" />
                <input type="number" value={monthForm.unitsProduced} onChange={e => setMonthForm(f => ({ ...f, unitsProduced: e.target.value }))} placeholder="יחידות" className="border rounded px-2 py-1.5 bg-background" />
                <input type="number" value={monthForm.targetUnits} onChange={e => setMonthForm(f => ({ ...f, targetUnits: e.target.value }))} placeholder="יעד" className="border rounded px-2 py-1.5 bg-background" />
                <input type="number" value={monthForm.totalPay} onChange={e => setMonthForm(f => ({ ...f, totalPay: e.target.value }))} placeholder="תשלום" className="border rounded px-2 py-1.5 bg-background" />
                <input type="number" value={monthForm.productionValue} onChange={e => setMonthForm(f => ({ ...f, productionValue: e.target.value }))} placeholder="ערך ייצור" className="border rounded px-2 py-1.5 bg-background" />
                <input type="number" value={monthForm.defectRate} onChange={e => setMonthForm(f => ({ ...f, defectRate: e.target.value }))} placeholder="% פגמים" className="border rounded px-2 py-1.5 bg-background" />
                <input type="number" value={monthForm.reworkRate} onChange={e => setMonthForm(f => ({ ...f, reworkRate: e.target.value }))} placeholder="% Rework" className="border rounded px-2 py-1.5 bg-background" />
                <button
                  onClick={() => { if (monthForm.month) { addSub.mutate({ path: `production/${p.id}/monthly`, data: monthForm }); setMonthForm({ month: "", unitsProduced: "", targetUnits: "", hoursWorked: "", defectRate: "", reworkRate: "", totalPay: "", productionValue: "" }); setShowMonthForm(false); } }}
                  className="px-3 py-1.5 bg-green-600 text-foreground rounded"
                >שמור</button>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-right py-2 px-1">חודש</th>
                    <th className="text-right py-2 px-1">יחידות</th>
                    <th className="text-right py-2 px-1">יעד</th>
                    <th className="text-right py-2 px-1">% השגה</th>
                    <th className="text-right py-2 px-1">תשלום</th>
                    <th className="text-right py-2 px-1">ערך</th>
                    <th className="py-2 px-1"></th>
                  </tr>
                </thead>
                <tbody>
                  {safeMonthly.map((m: any) => {
                    const achievement = n(m.targetUnits) > 0 ? (n(m.unitsProduced) / n(m.targetUnits)) * 100 : 0;
                    return (
                      <tr key={m.id} className="border-b hover:bg-muted/20">
                        <td className="py-2 px-1">{m.month}</td>
                        <td className="py-2 px-1">{m.unitsProduced}</td>
                        <td className="py-2 px-1">{m.targetUnits}</td>
                        <td className="py-2 px-1"><span className={achievement >= 100 ? "text-green-600 font-bold" : "text-amber-600"}>{achievement.toFixed(0)}%</span></td>
                        <td className="py-2 px-1">{fmt(m.totalPay)}</td>
                        <td className="py-2 px-1">{fmt(m.productionValue)}</td>
                        <td className="py-2 px-1">
                          <button onClick={() => deleteSub.mutate(`production-monthly/${m.id}`)} className="p-1 hover:bg-red-500/10 rounded">
                            <Trash2 className="w-3 h-3 text-red-400" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {safeMonthly.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">אין נתונים חודשיים</p>}
            </div>
          </div>
        )}

        {activeDetailTab === "quality" && (
          <div className="space-y-4">
            <h3 className="font-semibold">פגמים ו-Rework — 12 חודשים</h3>
            <div className="space-y-2">
              {safeMonthly.map((m: any) => (
                <div key={m.id} className="flex items-center gap-3">
                  <span className="text-xs w-16 shrink-0">{m.month}</span>
                  <div className="flex-1 flex gap-1">
                    <div className="flex-1">
                      <div className="flex items-center justify-between text-[10px] mb-0.5">
                        <span>פגמים</span><span>{pct(m.defectRate)}</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2">
                        <div className="h-full bg-red-500 rounded-full" style={{ width: `${Math.min(n(m.defectRate) * 5, 100)}%` }} />
                      </div>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between text-[10px] mb-0.5">
                        <span>Rework</span><span>{pct(m.reworkRate)}</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2">
                        <div className="h-full bg-amber-500 rounded-full" style={{ width: `${Math.min(n(m.reworkRate) * 5, 100)}%` }} />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {safeMonthly.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">אין נתוני איכות</p>}
          </div>
        )}
      </div>
    </div>
  );
}

// ==================== INSTALLER DETAIL ====================

function InstallerDetail({ p, monthly, onEdit, onDelete, addSub, deleteSub, activeDetailTab, setActiveDetailTab }: any) {
  const [showMonthForm, setShowMonthForm] = useState(false);
  const [monthForm, setMonthForm] = useState({ month: "", regularJobs: "", complexJobs: "", serviceJobs: "", totalRevenue: "", totalCost: "", customerSatisfaction: "", callbackRate: "" });

  const safeMonthly = Array.isArray(monthly) ? monthly : [];
  const totalRevenue = safeMonthly.reduce((s: number, m: any) => s + n(m.totalRevenue), 0);
  const totalMonthlyCost = safeMonthly.reduce((s: number, m: any) => s + n(m.totalCost), 0);
  const fixedCosts = n(p.fuelCost) + n(p.vehicleDepreciation) + n(p.toolsCost);
  const totalCost = totalMonthlyCost + fixedCosts;
  const roi = totalCost > 0 ? ((totalRevenue - totalCost) / totalCost) * 100 : 0;
  const avgSat = safeMonthly.length > 0 ? safeMonthly.reduce((s: number, m: any) => s + n(m.customerSatisfaction), 0) / safeMonthly.length : 0;
  const avgCallback = safeMonthly.length > 0 ? safeMonthly.reduce((s: number, m: any) => s + n(m.callbackRate), 0) / safeMonthly.length : 0;

  return (
    <div className="bg-card border rounded-xl overflow-hidden">
      <DetailHeader p={p} category="installers" roi={roi} totalCost={totalCost} totalValue={totalRevenue} netValue={totalRevenue - totalCost} onEdit={onEdit} onDelete={onDelete} />
      <TabBar
        tabs={[
          { key: "overview", label: "סקירה" },
          { key: "monthly", label: "חודשי" },
          { key: "satisfaction", label: "שביעות רצון" },
        ]}
        active={activeDetailTab}
        onChange={setActiveDetailTab}
      />
      <div className="p-4">
        {activeDetailTab === "overview" && (
          <div className="space-y-3">
            <h3 className="font-semibold text-sm">תעריפים לפי סוג התקנה</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { label: "רגילה", value: p.regularRate, color: "#22C55E" },
                { label: "מורכבת", value: p.complexRate, color: "#F59E0B" },
                { label: "שירות", value: p.serviceRate, color: "#3B82F6" },
              ].map((item, i) => (
                <div key={i} className="bg-muted/30 rounded-lg p-3 text-center" style={{ borderTop: `3px solid ${item.color}` }}>
                  <div className="text-xs text-muted-foreground">{item.label}</div>
                  <div className="font-bold">{fmt(item.value)}</div>
                </div>
              ))}
            </div>
            <h3 className="font-semibold text-sm mt-4">עלויות קבועות</h3>
            <div className="space-y-2">
              <div className="flex justify-between py-1 border-b"><span className="text-sm">דלק</span><span className="text-sm">{fmt(p.fuelCost)}</span></div>
              <div className="flex justify-between py-1 border-b"><span className="text-sm">פחת רכב</span><span className="text-sm">{fmt(p.vehicleDepreciation)}</span></div>
              <div className="flex justify-between py-1 border-b"><span className="text-sm">כלים</span><span className="text-sm">{fmt(p.toolsCost)}</span></div>
              <div className="flex justify-between py-1 font-bold"><span>סה״כ קבוע</span><span>{fmt(fixedCosts)}</span></div>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 text-center">
                <div className="text-xs text-muted-foreground">שביעות רצון ממוצעת</div>
                <div className="text-xl font-bold text-green-600">{avgSat.toFixed(1)}</div>
              </div>
              <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3 text-center">
                <div className="text-xs text-muted-foreground">Callback Rate ממוצע</div>
                <div className="text-xl font-bold text-amber-600">{avgCallback.toFixed(1)}%</div>
              </div>
            </div>
          </div>
        )}

        {activeDetailTab === "monthly" && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">נתונים חודשיים</h3>
              <button onClick={() => setShowMonthForm(!showMonthForm)} className="text-xs px-3 py-1.5 bg-blue-600 text-foreground rounded-lg">
                <Plus className="w-3 h-3 inline ml-1" />הוסף חודש
              </button>
            </div>
            {showMonthForm && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3 p-3 bg-muted/30 rounded-lg text-sm">
                <input value={monthForm.month} onChange={e => setMonthForm(f => ({ ...f, month: e.target.value }))} placeholder="YYYY-MM" className="border rounded px-2 py-1.5 bg-background" />
                <input type="number" value={monthForm.regularJobs} onChange={e => setMonthForm(f => ({ ...f, regularJobs: e.target.value }))} placeholder="עבודות רגילות" className="border rounded px-2 py-1.5 bg-background" />
                <input type="number" value={monthForm.complexJobs} onChange={e => setMonthForm(f => ({ ...f, complexJobs: e.target.value }))} placeholder="עבודות מורכבות" className="border rounded px-2 py-1.5 bg-background" />
                <input type="number" value={monthForm.serviceJobs} onChange={e => setMonthForm(f => ({ ...f, serviceJobs: e.target.value }))} placeholder="שירות" className="border rounded px-2 py-1.5 bg-background" />
                <input type="number" value={monthForm.totalRevenue} onChange={e => setMonthForm(f => ({ ...f, totalRevenue: e.target.value }))} placeholder="הכנסה" className="border rounded px-2 py-1.5 bg-background" />
                <input type="number" value={monthForm.totalCost} onChange={e => setMonthForm(f => ({ ...f, totalCost: e.target.value }))} placeholder="עלות" className="border rounded px-2 py-1.5 bg-background" />
                <input type="number" value={monthForm.customerSatisfaction} onChange={e => setMonthForm(f => ({ ...f, customerSatisfaction: e.target.value }))} placeholder="שביעות רצון (1-5)" className="border rounded px-2 py-1.5 bg-background" />
                <button
                  onClick={() => { if (monthForm.month) { addSub.mutate({ path: `installers/${p.id}/monthly`, data: monthForm }); setMonthForm({ month: "", regularJobs: "", complexJobs: "", serviceJobs: "", totalRevenue: "", totalCost: "", customerSatisfaction: "", callbackRate: "" }); setShowMonthForm(false); } }}
                  className="px-3 py-1.5 bg-green-600 text-foreground rounded"
                >שמור</button>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-right py-2 px-1">חודש</th>
                    <th className="text-right py-2 px-1">רגילות</th>
                    <th className="text-right py-2 px-1">מורכבות</th>
                    <th className="text-right py-2 px-1">שירות</th>
                    <th className="text-right py-2 px-1">הכנסה</th>
                    <th className="text-right py-2 px-1">עלות</th>
                    <th className="text-right py-2 px-1">שבע״ר</th>
                    <th className="py-2 px-1"></th>
                  </tr>
                </thead>
                <tbody>
                  {safeMonthly.map((m: any) => (
                    <tr key={m.id} className="border-b hover:bg-muted/20">
                      <td className="py-2 px-1">{m.month}</td>
                      <td className="py-2 px-1">{m.regularJobs}</td>
                      <td className="py-2 px-1">{m.complexJobs}</td>
                      <td className="py-2 px-1">{m.serviceJobs}</td>
                      <td className="py-2 px-1 text-green-600">{fmt(m.totalRevenue)}</td>
                      <td className="py-2 px-1 text-red-500">{fmt(m.totalCost)}</td>
                      <td className="py-2 px-1">{n(m.customerSatisfaction).toFixed(1)}</td>
                      <td className="py-2 px-1">
                        <button onClick={() => deleteSub.mutate(`installer-monthly/${m.id}`)} className="p-1 hover:bg-red-500/10 rounded">
                          <Trash2 className="w-3 h-3 text-red-400" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {safeMonthly.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">אין נתונים חודשיים</p>}
            </div>
          </div>
        )}

        {activeDetailTab === "satisfaction" && (
          <div className="space-y-4">
            <h3 className="font-semibold">שביעות רצון לקוח + Callback Rate</h3>
            <div className="space-y-3">
              {safeMonthly.map((m: any) => (
                <div key={m.id} className="flex items-center gap-3">
                  <span className="text-xs w-16 shrink-0">{m.month}</span>
                  <div className="flex-1 flex gap-2">
                    <div className="flex-1">
                      <div className="flex items-center justify-between text-[10px] mb-0.5">
                        <span>שביעות רצון</span><span>{n(m.customerSatisfaction).toFixed(1)}/5</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2.5">
                        <div className="h-full bg-green-500 rounded-full" style={{ width: `${(n(m.customerSatisfaction) / 5) * 100}%` }} />
                      </div>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between text-[10px] mb-0.5">
                        <span>Callback</span><span>{pct(m.callbackRate)}</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2.5">
                        <div className="h-full bg-amber-500 rounded-full" style={{ width: `${Math.min(n(m.callbackRate) * 5, 100)}%` }} />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {safeMonthly.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">אין נתונים</p>}
          </div>
        )}
      </div>
    </div>
  );
}

// ==================== FORM MODAL ====================

function PersonFormModal({ category, person, onSave, onClose, saving }: { category: WorkerCategory; person: any; onSave: (data: any) => void; onClose: () => void; saving: boolean }) {
  const getInitial = () => {
    if (person) return { ...person };
    if (category === "salaried") return { fullName: "", title: "", department: "", manager: "", startDate: "", attritionRisk: 0, baseSalary: 0, bonus: 0, pensionCost: 0, healthInsurance: 0, mealAllowance: 0, vehicleCost: 0, licensesCost: 0, cloudCost: 0, coachingCost: 0, recruitmentCost: 0, directValue: 0, indirectValue: 0, notes: "" };
    if (category === "sales") return { fullName: "", type: "קבלן משנה", retainerFee: 0, closingCommissionPct: 0, upsellCommissionPct: 0, targetBonusAmount: 0, targetBonusThreshold: 0, notes: "" };
    if (category === "production") return { fullName: "", type: "קבלן משנה", specialization: "", payModel: "per_unit", ratePerUnit: 0, ratePerHour: 0, overheadCost: 0, materialWasteCost: 0, notes: "" };
    return { fullName: "", type: "קבלן משנה", regularRate: 0, complexRate: 0, serviceRate: 0, fuelCost: 0, vehicleDepreciation: 0, toolsCost: 0, notes: "" };
  };

  const [form, setForm] = useState<any>(getInitial());

  function set(key: string, val: any) { setForm((f: any) => ({ ...f, [key]: val })); }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.fullName?.trim()) return;
    onSave(form);
  }

  const fieldClass = "w-full border rounded-lg px-3 py-2 text-sm bg-background";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-card border rounded-xl shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto" dir="rtl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">{person ? "עריכה" : "הוספת"} {CATEGORIES.find(c => c.key === category)?.label}</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="text-sm font-medium block mb-1">שם מלא *</label>
            <input value={form.fullName || ""} onChange={e => set("fullName", e.target.value)} className={fieldClass} required autoFocus />
          </div>

          {category === "salaried" && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className="text-sm font-medium block mb-1">תפקיד</label><input value={form.title || ""} onChange={e => set("title", e.target.value)} className={fieldClass} /></div>
                <div><label className="text-sm font-medium block mb-1">מחלקה</label><input value={form.department || ""} onChange={e => set("department", e.target.value)} className={fieldClass} /></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className="text-sm font-medium block mb-1">מנהל</label><input value={form.manager || ""} onChange={e => set("manager", e.target.value)} className={fieldClass} /></div>
                <div><label className="text-sm font-medium block mb-1">תאריך התחלה</label><input type="date" value={form.startDate || ""} onChange={e => set("startDate", e.target.value)} className={fieldClass} /></div>
              </div>
              <div><label className="text-sm font-medium block mb-1">סיכון עזיבה (%)</label><input type="number" value={form.attritionRisk || ""} onChange={e => set("attritionRisk", e.target.value)} className={fieldClass} /></div>
              <h3 className="font-semibold text-sm border-t pt-3">עלויות שנתיות</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { key: "baseSalary", label: "שכר בסיס" }, { key: "bonus", label: "בונוס" },
                  { key: "pensionCost", label: "פנסיה" }, { key: "healthInsurance", label: "ביטוח בריאות" },
                  { key: "mealAllowance", label: "ארוחות" }, { key: "vehicleCost", label: "רכב" },
                  { key: "licensesCost", label: "רישיונות" }, { key: "cloudCost", label: "ענן" },
                  { key: "coachingCost", label: "קואצ׳ינג" }, { key: "recruitmentCost", label: "גיוס" },
                ].map(f => (
                  <div key={f.key}><label className="text-sm font-medium block mb-1">{f.label}</label><input type="number" value={form[f.key] || ""} onChange={e => set(f.key, e.target.value)} className={fieldClass} /></div>
                ))}
              </div>
              <h3 className="font-semibold text-sm border-t pt-3">ערך לחברה</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className="text-sm font-medium block mb-1">ערך ישיר</label><input type="number" value={form.directValue || ""} onChange={e => set("directValue", e.target.value)} className={fieldClass} /></div>
                <div><label className="text-sm font-medium block mb-1">ערך עקיף</label><input type="number" value={form.indirectValue || ""} onChange={e => set("indirectValue", e.target.value)} className={fieldClass} /></div>
              </div>
            </>
          )}

          {category === "sales" && (
            <>
              <div><label className="text-sm font-medium block mb-1">סוג</label><input value={form.type || ""} onChange={e => set("type", e.target.value)} className={fieldClass} /></div>
              <h3 className="font-semibold text-sm border-t pt-3">מבנה עמלות</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className="text-sm font-medium block mb-1">Retainer חודשי</label><input type="number" value={form.retainerFee || ""} onChange={e => set("retainerFee", e.target.value)} className={fieldClass} /></div>
                <div><label className="text-sm font-medium block mb-1">% סגירה</label><input type="number" step="0.1" value={form.closingCommissionPct || ""} onChange={e => set("closingCommissionPct", e.target.value)} className={fieldClass} /></div>
                <div><label className="text-sm font-medium block mb-1">% Upsell</label><input type="number" step="0.1" value={form.upsellCommissionPct || ""} onChange={e => set("upsellCommissionPct", e.target.value)} className={fieldClass} /></div>
                <div><label className="text-sm font-medium block mb-1">בונוס יעד</label><input type="number" value={form.targetBonusAmount || ""} onChange={e => set("targetBonusAmount", e.target.value)} className={fieldClass} /></div>
                <div><label className="text-sm font-medium block mb-1">סף בונוס</label><input type="number" value={form.targetBonusThreshold || ""} onChange={e => set("targetBonusThreshold", e.target.value)} className={fieldClass} /></div>
              </div>
            </>
          )}

          {category === "production" && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className="text-sm font-medium block mb-1">סוג</label><input value={form.type || ""} onChange={e => set("type", e.target.value)} className={fieldClass} /></div>
                <div><label className="text-sm font-medium block mb-1">התמחות</label><input value={form.specialization || ""} onChange={e => set("specialization", e.target.value)} className={fieldClass} /></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-sm font-medium block mb-1">מודל תשלום</label>
                  <select value={form.payModel || "per_unit"} onChange={e => set("payModel", e.target.value)} className={fieldClass}>
                    <option value="per_unit">ליחידה</option>
                    <option value="per_hour">לשעה</option>
                  </select>
                </div>
                <div><label className="text-sm font-medium block mb-1">תעריף ליחידה</label><input type="number" value={form.ratePerUnit || ""} onChange={e => set("ratePerUnit", e.target.value)} className={fieldClass} /></div>
                <div><label className="text-sm font-medium block mb-1">תעריף לשעה</label><input type="number" value={form.ratePerHour || ""} onChange={e => set("ratePerHour", e.target.value)} className={fieldClass} /></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className="text-sm font-medium block mb-1">תקורה שנתית</label><input type="number" value={form.overheadCost || ""} onChange={e => set("overheadCost", e.target.value)} className={fieldClass} /></div>
                <div><label className="text-sm font-medium block mb-1">בזבוז חומרים שנתי</label><input type="number" value={form.materialWasteCost || ""} onChange={e => set("materialWasteCost", e.target.value)} className={fieldClass} /></div>
              </div>
            </>
          )}

          {category === "installers" && (
            <>
              <div><label className="text-sm font-medium block mb-1">סוג</label><input value={form.type || ""} onChange={e => set("type", e.target.value)} className={fieldClass} /></div>
              <h3 className="font-semibold text-sm border-t pt-3">תעריפים</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div><label className="text-sm font-medium block mb-1">התקנה רגילה</label><input type="number" value={form.regularRate || ""} onChange={e => set("regularRate", e.target.value)} className={fieldClass} /></div>
                <div><label className="text-sm font-medium block mb-1">התקנה מורכבת</label><input type="number" value={form.complexRate || ""} onChange={e => set("complexRate", e.target.value)} className={fieldClass} /></div>
                <div><label className="text-sm font-medium block mb-1">שירות</label><input type="number" value={form.serviceRate || ""} onChange={e => set("serviceRate", e.target.value)} className={fieldClass} /></div>
              </div>
              <h3 className="font-semibold text-sm border-t pt-3">עלויות קבועות</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div><label className="text-sm font-medium block mb-1">דלק</label><input type="number" value={form.fuelCost || ""} onChange={e => set("fuelCost", e.target.value)} className={fieldClass} /></div>
                <div><label className="text-sm font-medium block mb-1">פחת רכב</label><input type="number" value={form.vehicleDepreciation || ""} onChange={e => set("vehicleDepreciation", e.target.value)} className={fieldClass} /></div>
                <div><label className="text-sm font-medium block mb-1">כלים</label><input type="number" value={form.toolsCost || ""} onChange={e => set("toolsCost", e.target.value)} className={fieldClass} /></div>
              </div>
            </>
          )}

          <div>
            <label className="text-sm font-medium block mb-1">הערות</label>
            <textarea value={form.notes || ""} onChange={e => set("notes", e.target.value)} className={fieldClass + " resize-none"} rows={2} />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm border rounded-lg hover:bg-muted">ביטול</button>
            <button type="submit" disabled={saving || !form.fullName?.trim()} className="px-6 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-foreground rounded-lg disabled:opacity-50 font-medium">
              {saving ? "שומר..." : person ? "עדכן" : "צור"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
