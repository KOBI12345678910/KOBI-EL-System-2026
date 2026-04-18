import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  CheckSquare, Plus, Trash2, Edit2, ArrowLeft, Shield,
  DollarSign, FileText, ShoppingCart, CreditCard, Receipt,
  ChevronLeft, AlertTriangle, Target, Layers, TrendingUp,
  Building2, BarChart3, Info, Banknote
} from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────────

type EntityType = "purchase_order" | "project_budget" | "payment" | "invoice" | "sales_order";

interface ApprovalTier {
  id: string;
  minAmount: number;
  maxAmount: number | null;
  requiredRole: string;
  requiredRoleHe: string;
  escalationRole: string | null;
  escalationRoleHe: string | null;
  description: string;
}

interface ApprovalPolicy {
  entityType: EntityType;
  label: string;
  icon: any;
  color: string;
  bg: string;
  tiers: ApprovalTier[];
}

// ─── Mock Data (from APPROVAL_POLICIES in posting-engine.ts) ───────────────────

const fmtCurrency = (n: number) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(n);

// Helper component to avoid FolderKanban import collision
function FolderKanbanIcon(props: any) {
  return <Layers {...props} />;
}

const FALLBACK_MOCK_POLICIES: ApprovalPolicy[] = [
  {
    entityType: "purchase_order",
    label: "הזמנת רכש",
    icon: ShoppingCart,
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    tiers: [
      { id: "PO-T1", minAmount: 0, maxAmount: 10000, requiredRole: "PROCUREMENT_MANAGER", requiredRoleHe: "מנהל רכש", escalationRole: null, escalationRoleHe: null, description: "הזמנות רכש עד ₪10,000 — אישור מנהל רכש בלבד" },
      { id: "PO-T2", minAmount: 10000, maxAmount: 50000, requiredRole: "PROCUREMENT_MANAGER", requiredRoleHe: "מנהל רכש", escalationRole: "FINANCE_MANAGER", escalationRoleHe: "מנהל כספים", description: "הזמנות ₪10K-₪50K — אישור מנהל רכש + מנהל כספים" },
      { id: "PO-T3", minAmount: 50000, maxAmount: null, requiredRole: "PROCUREMENT_MANAGER", requiredRoleHe: "מנהל רכש", escalationRole: "CEO", escalationRoleHe: "מנכ\"ל", description: "הזמנות מעל ₪50,000 — אישור מנהל רכש + מנהל כספים + מנכ\"ל" },
    ],
  },
  {
    entityType: "project_budget",
    label: "תקציב פרויקט",
    icon: FolderKanbanIcon,
    color: "text-cyan-400",
    bg: "bg-cyan-500/10",
    tiers: [
      { id: "PRJ-T1", minAmount: 0, maxAmount: 100000, requiredRole: "PROJECT_MANAGER", requiredRoleHe: "מנהל פרויקט", escalationRole: null, escalationRoleHe: null, description: "תקציב פרויקט עד ₪100K — אישור מנהל פרויקט" },
      { id: "PRJ-T2", minAmount: 100000, maxAmount: 500000, requiredRole: "PROJECT_MANAGER", requiredRoleHe: "מנהל פרויקט", escalationRole: "FINANCE_MANAGER", escalationRoleHe: "מנהל כספים", description: "תקציב ₪100K-₪500K — אישור מנהל פרויקט + מנהל כספים" },
      { id: "PRJ-T3", minAmount: 500000, maxAmount: null, requiredRole: "PROJECT_MANAGER", requiredRoleHe: "מנהל פרויקט", escalationRole: "CEO", escalationRoleHe: "מנכ\"ל", description: "תקציב מעל ₪500K — אישור מנהל פרויקט + כספים + מנכ\"ל" },
    ],
  },
  {
    entityType: "payment",
    label: "תשלום",
    icon: CreditCard,
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    tiers: [
      { id: "PAY-T1", minAmount: 0, maxAmount: 5000, requiredRole: "FINANCE_CLERK", requiredRoleHe: "פקיד כספים", escalationRole: null, escalationRoleHe: null, description: "תשלומים עד ₪5,000 — אישור פקיד כספים" },
      { id: "PAY-T2", minAmount: 5000, maxAmount: 25000, requiredRole: "FINANCE_MANAGER", requiredRoleHe: "מנהל כספים", escalationRole: null, escalationRoleHe: null, description: "תשלומים ₪5K-₪25K — אישור מנהל כספים" },
      { id: "PAY-T3", minAmount: 25000, maxAmount: null, requiredRole: "FINANCE_MANAGER", requiredRoleHe: "מנהל כספים", escalationRole: "CEO", escalationRoleHe: "מנכ\"ל", description: "תשלומים מעל ₪25K — אישור מנהל כספים + מנכ\"ל" },
    ],
  },
  {
    entityType: "invoice",
    label: "חשבונית",
    icon: Receipt,
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    tiers: [
      { id: "INV-T1", minAmount: 0, maxAmount: 15000, requiredRole: "FINANCE_CLERK", requiredRoleHe: "פקיד כספים", escalationRole: null, escalationRoleHe: null, description: "חשבוניות עד ₪15,000 — אישור פקיד כספים" },
      { id: "INV-T2", minAmount: 15000, maxAmount: 75000, requiredRole: "FINANCE_MANAGER", requiredRoleHe: "מנהל כספים", escalationRole: null, escalationRoleHe: null, description: "חשבוניות ₪15K-₪75K — אישור מנהל כספים" },
      { id: "INV-T3", minAmount: 75000, maxAmount: null, requiredRole: "FINANCE_MANAGER", requiredRoleHe: "מנהל כספים", escalationRole: "CFO", escalationRoleHe: "סמנכ\"ל כספים", description: "חשבוניות מעל ₪75K — אישור מנהל כספים + סמנכ\"ל כספים" },
    ],
  },
  {
    entityType: "sales_order",
    label: "הזמנת מכירה",
    icon: FileText,
    color: "text-purple-400",
    bg: "bg-purple-500/10",
    tiers: [
      { id: "SO-T1", minAmount: 0, maxAmount: 20000, requiredRole: "SALES_REP", requiredRoleHe: "נציג מכירות", escalationRole: null, escalationRoleHe: null, description: "הזמנות מכירה עד ₪20K — אישור נציג מכירות" },
      { id: "SO-T2", minAmount: 20000, maxAmount: 100000, requiredRole: "SALES_MANAGER", requiredRoleHe: "מנהל מכירות", escalationRole: null, escalationRoleHe: null, description: "הזמנות ₪20K-₪100K — אישור מנהל מכירות" },
      { id: "SO-T3", minAmount: 100000, maxAmount: 500000, requiredRole: "SALES_MANAGER", requiredRoleHe: "מנהל מכירות", escalationRole: "FINANCE_MANAGER", escalationRoleHe: "מנהל כספים", description: "הזמנות ₪100K-₪500K — אישור מנהל מכירות + מנהל כספים" },
      { id: "SO-T4", minAmount: 500000, maxAmount: null, requiredRole: "SALES_MANAGER", requiredRoleHe: "מנהל מכירות", escalationRole: "CEO", escalationRoleHe: "מנכ\"ל", description: "הזמנות מעל ₪500K — מנהל מכירות + כספים + מנכ\"ל" },
    ],
  },
];

// ─── Component ─────────────────────────────────────────────────────────────────

export default function ApprovalPolicyManagement() {
  const { data: approvalpolicymanagementData } = useQuery({
    queryKey: ["approval-policy-management"],
    queryFn: () => authFetch("/api/system/approval_policy_management"),
    staleTime: 5 * 60 * 1000,
  });

  const MOCK_POLICIES = approvalpolicymanagementData ?? FALLBACK_MOCK_POLICIES;

  const [policies, setPolicies] = useState<ApprovalPolicy[]>(MOCK_POLICIES);
  const [activeTab, setActiveTab] = useState<EntityType>("purchase_order");
  const [showAddTier, setShowAddTier] = useState(false);

  // Add tier form
  const [newMin, setNewMin] = useState("");
  const [newMax, setNewMax] = useState("");
  const [newRole, setNewRole] = useState("");
  const [newRoleHe, setNewRoleHe] = useState("");
  const [newEscRole, setNewEscRole] = useState("");
  const [newEscRoleHe, setNewEscRoleHe] = useState("");
  const [newDesc, setNewDesc] = useState("");

  const currentPolicy = policies.find((p) => p.entityType === activeTab)!;

  // Global stats
  const totalPolicies = policies.reduce((acc, p) => acc + p.tiers.length, 0);
  const entityTypesCovered = policies.length;
  const maxLevel = Math.max(...policies.map((p) => p.tiers.length));

  const handleAddTier = () => {
    if (!newRole || !newDesc) return;
    const newTier: ApprovalTier = {
      id: `TIER-${Date.now()}`,
      minAmount: Number(newMin) || 0,
      maxAmount: newMax ? Number(newMax) : null,
      requiredRole: newRole,
      requiredRoleHe: newRoleHe || newRole,
      escalationRole: newEscRole || null,
      escalationRoleHe: newEscRoleHe || null,
      description: newDesc,
    };
    setPolicies((prev) =>
      prev.map((p) =>
        p.entityType === activeTab ? { ...p, tiers: [...p.tiers, newTier].sort((a, b) => a.minAmount - b.minAmount) } : p,
      ),
    );
    setShowAddTier(false);
    setNewMin(""); setNewMax(""); setNewRole(""); setNewRoleHe(""); setNewEscRole(""); setNewEscRoleHe(""); setNewDesc("");
  };

  const handleRemoveTier = (tierId: string) => {
    setPolicies((prev) =>
      prev.map((p) =>
        p.entityType === activeTab ? { ...p, tiers: p.tiers.filter((t) => t.id !== tierId) } : p,
      ),
    );
  };

  const tabs: { type: EntityType; label: string; icon: any }[] = [
    { type: "purchase_order", label: "הזמנת רכש", icon: ShoppingCart },
    { type: "project_budget", label: "תקציב פרויקט", icon: Layers },
    { type: "payment", label: "תשלום", icon: CreditCard },
    { type: "invoice", label: "חשבונית", icon: Receipt },
    { type: "sales_order", label: "הזמנת מכירה", icon: FileText },
  ];

  // Role color mapping
  const roleColors: Record<string, string> = {
    PROCUREMENT_MANAGER: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    FINANCE_MANAGER: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    FINANCE_CLERK: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    PROJECT_MANAGER: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
    CEO: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    CFO: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
    SALES_REP: "bg-amber-500/20 text-amber-300 border-amber-500/30",
    SALES_MANAGER: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  };

  const getRoleColor = (role: string) => roleColors[role] || "bg-gray-500/20 text-gray-400 border-gray-500/30";

  return (
    <div className="min-h-screen bg-[#0a0e1a] text-white p-6 space-y-5" dir="rtl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <CheckSquare className="h-7 w-7 text-emerald-400" />
          ניהול מדיניות אישורים
        </h1>
        <p className="text-sm text-gray-400 mt-1">
          הגדרת שרשרת אישורים לפי סוג ישות וסכום — מי מאשר מה ומתי דרוש אישור נוסף
        </p>
      </div>

      {/* Global Stats */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "סה\"כ שלבי אישור", value: totalPolicies, icon: Layers, color: "text-blue-400", bg: "bg-blue-500/10" },
          { label: "סוגי ישויות מכוסים", value: entityTypesCovered, icon: FileText, color: "text-emerald-400", bg: "bg-emerald-500/10" },
          { label: "רמת אישור מקסימלית", value: maxLevel, icon: TrendingUp, color: "text-amber-400", bg: "bg-amber-500/10" },
          { label: "תפקידים מעורבים", value: 8, icon: Shield, color: "text-purple-400", bg: "bg-purple-500/10" },
        ].map((s, i) => (
          <Card key={i} className="bg-[#111827] border-gray-800">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg ${s.bg} flex items-center justify-center`}>
                <s.icon className={`w-5 h-5 ${s.color}`} />
              </div>
              <div>
                <p className="text-xs text-gray-400">{s.label}</p>
                <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Entity Type Tabs */}
      <div className="flex gap-2">
        {tabs.map((t) => {
          const isActive = activeTab === t.type;
          const policy = policies.find((p) => p.entityType === t.type)!;
          return (
            <button
              key={t.type}
              onClick={() => { setActiveTab(t.type); setShowAddTier(false); }}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition border ${
                isActive
                  ? "bg-[#1a2035] border-blue-500/50 text-white"
                  : "bg-[#111827] border-gray-800 text-gray-400 hover:text-gray-200 hover:border-gray-600"
              }`}
            >
              <t.icon className="w-4 h-4" />
              {t.label}
              <Badge className="bg-gray-500/15 text-gray-400 border-gray-600 border text-[10px] px-1.5">
                {policy.tiers.length}
              </Badge>
            </button>
          );
        })}
      </div>

      {/* Tiers Table */}
      <Card className="bg-[#111827] border-gray-800">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <currentPolicy.icon className={`w-4 h-4 ${currentPolicy.color}`} />
              שלבי אישור — {currentPolicy.label}
            </CardTitle>
            <button
              onClick={() => setShowAddTier(!showAddTier)}
              className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium transition"
            >
              <Plus className="w-4 h-4" /> הוסף שלב
            </button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-xs border-b border-gray-800">
                  <th className="text-right py-2.5 pr-2 w-8">שלב</th>
                  <th className="text-right py-2.5">סכום מינימלי</th>
                  <th className="text-right py-2.5">סכום מקסימלי</th>
                  <th className="text-right py-2.5">תפקיד מאשר</th>
                  <th className="text-right py-2.5">תפקיד אסקלציה</th>
                  <th className="text-right py-2.5">תיאור</th>
                  <th className="text-center py-2.5">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {currentPolicy.tiers.map((tier, idx) => (
                  <tr key={tier.id} className="border-b border-gray-800/50 hover:bg-[#1a2035]">
                    <td className="py-4 pr-2 text-center">
                      <div className={`w-7 h-7 rounded-full ${currentPolicy.bg} flex items-center justify-center`}>
                        <span className={`text-xs font-bold ${currentPolicy.color}`}>{idx + 1}</span>
                      </div>
                    </td>
                    <td className="py-4">
                      <span className="text-sm font-medium text-white flex items-center gap-1">
                        <Banknote className="w-3.5 h-3.5 text-gray-600" />
                        {fmtCurrency(tier.minAmount)}
                      </span>
                    </td>
                    <td className="py-4">
                      <span className="text-sm font-medium text-white">
                        {tier.maxAmount !== null ? fmtCurrency(tier.maxAmount) : (
                          <span className="text-gray-400">ללא הגבלה</span>
                        )}
                      </span>
                    </td>
                    <td className="py-4">
                      <Badge className={`border text-xs ${getRoleColor(tier.requiredRole)}`}>
                        {tier.requiredRoleHe}
                      </Badge>
                      <span className="text-[10px] text-gray-600 mr-1 font-mono">{tier.requiredRole}</span>
                    </td>
                    <td className="py-4">
                      {tier.escalationRole ? (
                        <div className="flex items-center gap-1">
                          <ArrowLeft className="w-3 h-3 text-gray-600" />
                          <Badge className={`border text-xs ${getRoleColor(tier.escalationRole)}`}>
                            {tier.escalationRoleHe}
                          </Badge>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-600">—</span>
                      )}
                    </td>
                    <td className="py-4 text-gray-400 text-xs max-w-[250px]">{tier.description}</td>
                    <td className="py-4 text-center">
                      <button
                        onClick={() => handleRemoveTier(tier.id)}
                        className="p-1.5 rounded-lg hover:bg-red-500/10 text-gray-500 hover:text-red-400 transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Add Tier Form */}
          {showAddTier && (
            <div className="mt-4 p-4 bg-[#0d1321] rounded-lg border border-gray-700 space-y-3">
              <p className="text-sm font-medium text-blue-400 flex items-center gap-2">
                <Plus className="w-4 h-4" /> הוספת שלב אישור חדש
              </p>
              <div className="grid grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">סכום מינימלי (₪)</label>
                  <input type="number" className="w-full bg-[#111827] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white" value={newMin} onChange={(e) => setNewMin(e.target.value)} placeholder="0" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">סכום מקסימלי (₪)</label>
                  <input type="number" className="w-full bg-[#111827] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white" value={newMax} onChange={(e) => setNewMax(e.target.value)} placeholder="ללא הגבלה" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">תפקיד מאשר (EN)</label>
                  <input className="w-full bg-[#111827] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white" value={newRole} onChange={(e) => setNewRole(e.target.value)} placeholder="ROLE_CODE" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">תפקיד מאשר (HE)</label>
                  <input className="w-full bg-[#111827] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white" value={newRoleHe} onChange={(e) => setNewRoleHe(e.target.value)} placeholder="שם בעברית" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">תפקיד אסקלציה (EN)</label>
                  <input className="w-full bg-[#111827] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white" value={newEscRole} onChange={(e) => setNewEscRole(e.target.value)} placeholder="אופציונלי" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">תפקיד אסקלציה (HE)</label>
                  <input className="w-full bg-[#111827] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white" value={newEscRoleHe} onChange={(e) => setNewEscRoleHe(e.target.value)} placeholder="אופציונלי" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">תיאור</label>
                  <input className="w-full bg-[#111827] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="תיאור השלב" />
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={handleAddTier} disabled={!newRole || !newDesc} className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg text-sm font-medium transition">שמור</button>
                <button onClick={() => setShowAddTier(false)} className="px-5 py-2 bg-[#111827] border border-gray-700 rounded-lg text-sm text-gray-400 hover:text-white transition">ביטול</button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Visual Flow Diagram */}
      <Card className="bg-[#111827] border-gray-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="w-4 h-4 text-amber-400" />
            שרשרת אישורים — {currentPolicy.label}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex items-center gap-0 overflow-x-auto py-4">
            {currentPolicy.tiers.map((tier, idx) => (
              <div key={tier.id} className="flex items-center flex-shrink-0">
                {/* Tier Box */}
                <div className={`relative border rounded-xl p-4 min-w-[220px] ${currentPolicy.bg} border-gray-700`}>
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`w-6 h-6 rounded-full bg-[#111827] flex items-center justify-center`}>
                      <span className={`text-[10px] font-bold ${currentPolicy.color}`}>{idx + 1}</span>
                    </div>
                    <span className="text-xs text-gray-300 font-medium">
                      {tier.minAmount === 0 ? "עד" : `${fmtCurrency(tier.minAmount)} —`}{" "}
                      {tier.maxAmount !== null ? fmtCurrency(tier.maxAmount) : "ללא הגבלה"}
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    <Badge className={`border text-xs ${getRoleColor(tier.requiredRole)}`}>
                      {tier.requiredRoleHe}
                    </Badge>
                    {tier.escalationRole && (
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-gray-500">+</span>
                        <Badge className={`border text-xs ${getRoleColor(tier.escalationRole)}`}>
                          {tier.escalationRoleHe}
                        </Badge>
                      </div>
                    )}
                  </div>
                </div>
                {/* Arrow */}
                {idx < currentPolicy.tiers.length - 1 && (
                  <div className="flex items-center px-2 flex-shrink-0">
                    <div className="w-8 h-0.5 bg-gray-700"></div>
                    <ArrowLeft className="w-4 h-4 text-gray-600 -mr-1" />
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-start gap-2 text-xs text-gray-500 bg-[#0d1321] rounded-lg p-3">
            <Info className="w-4 h-4 text-gray-600 flex-shrink-0 mt-0.5" />
            <span>
              שרשרת האישורים מופעלת אוטומטית לפי סכום הישות. כאשר הסכום חוצה את הסף, נדרש אישור
              מהתפקיד הבא בשרשרת. תפקיד אסקלציה מתווסף לתפקיד המאשר הראשי.
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Summary across all entity types */}
      <Card className="bg-[#111827] border-gray-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-blue-400" />
            סיכום מדיניות לפי סוג ישות
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-5 gap-3">
            {policies.map((p) => (
              <div key={p.entityType} className={`p-3 rounded-lg border border-gray-800 ${p.bg}`}>
                <div className="flex items-center gap-2 mb-2">
                  <p.icon className={`w-4 h-4 ${p.color}`} />
                  <span className="text-xs font-medium text-white">{p.label}</span>
                </div>
                <div className="space-y-1">
                  <p className="text-[11px] text-gray-400">
                    {p.tiers.length} שלבי אישור
                  </p>
                  <p className="text-[11px] text-gray-400">
                    סף עליון: {p.tiers[p.tiers.length - 1]?.minAmount
                      ? fmtCurrency(p.tiers[p.tiers.length - 1].minAmount) + "+"
                      : "—"}
                  </p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {[...new Set(p.tiers.flatMap((t) => [t.requiredRole, t.escalationRole].filter(Boolean)))].map((r) => (
                      <Badge key={r} className={`text-[9px] px-1 py-0 border ${getRoleColor(r!)}`}>
                        {r}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
