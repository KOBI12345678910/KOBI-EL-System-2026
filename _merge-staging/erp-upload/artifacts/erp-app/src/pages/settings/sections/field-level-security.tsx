import { useState, useEffect } from "react";
import { Button, Card } from "@/components/ui-components";
import {
  Shield, Lock, Eye, EyeOff, Edit2, Trash2, Plus, Search, CheckCircle2,
  XCircle, Sliders, X, ChevronDown, type LucideIcon
} from "lucide-react";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";

const ROLES = ["מנהל מערכת", "מנהל כספים", "מכירות", "רכש", "ייצור", "HR", "צפייה בלבד"];
const MODULES_FIELDS: Record<string, string[]> = {
  "לקוחות":   ["שם לקוח", "טלפון", "אימייל", "כתובת", "אשראי", "סכום חוב", "מגבלת אשראי", "הערות פנימיות"],
  "הזמנות":   ["מספר הזמנה", "תאריך", "סכום", "מע\"מ", "הנחה", "הערות", "עלות ייצור", "רווח גולמי"],
  "חשבוניות": ["מספר חשבונית", "סכום", "מע\"מ", "תאריך", "פרטי בנק", "תנאי תשלום", "סטטוס"],
  "ספקים":    ["שם ספק", "טלפון", "אימייל", "מחיר", "תנאי אשראי", "דירוג", "היסטוריית מחירים"],
  "עובדים":   ["שם מלא", "ת.ז", "שכר", "תאריך לידה", "כתובת", "חשבון בנק", "ביקורת נוכחות"],
  "ייצור":    ["הוראות ייצור", "עלות חומרים", "שעות עבודה", "איכות", "פחת", "תשואה"],
  "מוצרים":   ["שם מוצר", "קוד מוצר", "מחיר", "מלאי", "תיאור"],
};

type PermissionLevel = "allowed" | "blocked" | "readonly" | "hidden" | "custom";

interface FieldPermission {
  id: number;
  role: string;
  module: string;
  field: string;
  level: PermissionLevel;
  updatedAt: string;
}

const LEVEL_CONFIG: Record<PermissionLevel, { label: string; icon: LucideIcon; color: string; bg: string; border: string }> = {
  allowed:  { label: "מותרת",         icon: CheckCircle2, color: "text-green-400",  bg: "bg-green-500/10",  border: "border-green-500/20" },
  blocked:  { label: "חסומה",         icon: XCircle,      color: "text-red-400",    bg: "bg-red-500/10",    border: "border-red-500/20" },
  readonly: { label: "קריאה בלבד",    icon: Eye,          color: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/20" },
  hidden:   { label: "מוסתרת",        icon: EyeOff,       color: "text-purple-400", bg: "bg-purple-500/10", border: "border-purple-500/20" },
  custom:   { label: "מותאמת אישית",  icon: Sliders,      color: "text-blue-400",   bg: "bg-blue-500/10",   border: "border-blue-500/20" },
};

const INITIAL_PERMISSIONS: FieldPermission[] = [
  { id: 1, role: "מנהל מערכת",  module: "חשבוניות", field: "פרטי בנק",         level: "allowed",  updatedAt: "17/03/2026 09:15" },
  { id: 2, role: "מכירות",      module: "לקוחות",   field: "סכום חוב",         level: "readonly", updatedAt: "17/03/2026 10:00" },
  { id: 3, role: "צפייה בלבד",  module: "הזמנות",   field: "הנחה",             level: "hidden",   updatedAt: "16/03/2026 14:30" },
  { id: 4, role: "רכש",         module: "ספקים",    field: "תנאי אשראי",       level: "blocked",  updatedAt: "15/03/2026 11:45" },
  { id: 5, role: "מנהל כספים",  module: "חשבוניות", field: "מע\"מ",            level: "custom",   updatedAt: "14/03/2026 16:00" },
  { id: 6, role: "מכירות",      module: "מוצרים",   field: "מחיר",             level: "readonly", updatedAt: "13/03/2026 09:30" },
  { id: 7, role: "צפייה בלבד",  module: "לקוחות",   field: "הערות פנימיות",    level: "hidden",   updatedAt: "12/03/2026 08:00" },
  { id: 8, role: "HR",           module: "עובדים",   field: "שכר",              level: "blocked",  updatedAt: "11/03/2026 11:00" },
  { id: 9, role: "ייצור",        module: "ייצור",    field: "עלות חומרים",      level: "readonly", updatedAt: "10/03/2026 14:00" },
];

function parseUpdatedAt(dateStr: string): Date {
  const [datePart, timePart] = dateStr.split(" ");
  const [day, month, year] = datePart.split("/").map(Number);
  const [hours, minutes] = (timePart || "00:00").split(":").map(Number);
  return new Date(year, month - 1, day, hours, minutes);
}

function getLatestUpdatedAt(perms: FieldPermission[]): Date {
  if (perms.length === 0) return new Date();
  return perms.reduce<Date>((latest, p) => {
    const d = parseUpdatedAt(p.updatedAt);
    return d > latest ? d : latest;
  }, parseUpdatedAt(perms[0].updatedAt));
}

export default function FieldLevelSecuritySection() {
  const [permissions, setPermissions] = useState<FieldPermission[]>(INITIAL_PERMISSIONS);
  const [search, setSearch] = useState("");
  const [filterLevel, setFilterLevel] = useState<PermissionLevel | "all">("all");
  const [showDialog, setShowDialog] = useState(false);
  const [editPerm, setEditPerm] = useState<FieldPermission | null>(null);
  const [lastUpdated, setLastUpdated] = useState(() => getLatestUpdatedAt(INITIAL_PERMISSIONS));
  const [pulse, setPulse] = useState(true);

  const [formRole, setFormRole] = useState(ROLES[0]);
  const [formModule, setFormModule] = useState(Object.keys(MODULES_FIELDS)[0]);
  const [formField, setFormField] = useState(MODULES_FIELDS[Object.keys(MODULES_FIELDS)[0]][0]);
  const [formLevel, setFormLevel] = useState<PermissionLevel>("allowed");

  useEffect(() => {
    const interval = setInterval(() => {
      setPulse(p => !p);
    }, 1500);
    return () => clearInterval(interval);
  }, []);

  const counts = {
    allowed:  permissions.filter(p => p.level === "allowed").length,
    blocked:  permissions.filter(p => p.level === "blocked").length,
    readonly: permissions.filter(p => p.level === "readonly").length,
    hidden:   permissions.filter(p => p.level === "hidden").length,
    custom:   permissions.filter(p => p.level === "custom").length,
  };

  const filtered = permissions.filter(p => {
    if (filterLevel !== "all" && p.level !== filterLevel) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        p.role.toLowerCase().includes(q) ||
        p.module.toLowerCase().includes(q) ||
        p.field.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const openNew = () => {
    setEditPerm(null);
    setFormRole(ROLES[0]);
    setFormModule(Object.keys(MODULES_FIELDS)[0]);
    setFormField(MODULES_FIELDS[Object.keys(MODULES_FIELDS)[0]][0]);
    setFormLevel("allowed");
    setShowDialog(true);
  };

  const openEdit = (perm: FieldPermission) => {
    setEditPerm(perm);
    setFormRole(perm.role);
    setFormModule(perm.module);
    setFormField(perm.field);
    setFormLevel(perm.level);
    setShowDialog(true);
  };

  const handleModuleChange = (module: string) => {
    setFormModule(module);
    setFormField(MODULES_FIELDS[module][0]);
  };

  const handleSave = () => {
    const now = new Date();
    const dateStr = `${now.getDate().toString().padStart(2,"0")}/${(now.getMonth()+1).toString().padStart(2,"0")}/${now.getFullYear()} ${now.getHours().toString().padStart(2,"0")}:${now.getMinutes().toString().padStart(2,"0")}`;

    if (editPerm) {
      setPermissions(prev =>
        prev.map(p => p.id === editPerm.id ? { ...p, role: formRole, module: formModule, field: formField, level: formLevel, updatedAt: dateStr } : p)
      );
    } else {
      setPermissions(prev => {
        const maxId = prev.reduce((m, p) => Math.max(m, p.id), 0);
        return [
          { id: maxId + 1, role: formRole, module: formModule, field: formField, level: formLevel, updatedAt: dateStr },
          ...prev,
        ];
      });
    }
    setLastUpdated(now);
    setShowDialog(false);
  };

  const handleDelete = (id: number) => {
    setPermissions(prev => prev.filter(p => p.id !== id));
    setLastUpdated(new Date());
  };

  const formatTimestamp = (d: Date) =>
    `${d.getDate().toString().padStart(2,"0")}/${(d.getMonth()+1).toString().padStart(2,"0")}/${d.getFullYear()} ${d.getHours().toString().padStart(2,"0")}:${d.getMinutes().toString().padStart(2,"0")}`;

  const STAT_CARDS = [
    { key: "allowed"  as PermissionLevel, label: "מותרות",         color: "text-green-400",  bg: "bg-green-500/10",  border: "border-green-500/20" },
    { key: "blocked"  as PermissionLevel, label: "חסומות",         color: "text-red-400",    bg: "bg-red-500/10",    border: "border-red-500/20" },
    { key: "readonly" as PermissionLevel, label: "קריאה בלבד",     color: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/20" },
    { key: "hidden"   as PermissionLevel, label: "מוסתרות",        color: "text-purple-400", bg: "bg-purple-500/10", border: "border-purple-500/20" },
    { key: "custom"   as PermissionLevel, label: "מותאמות אישית",  color: "text-blue-400",   bg: "bg-blue-500/10",   border: "border-blue-500/20" },
  ];

  return (
    <div className="p-6 max-w-5xl mx-auto" dir="rtl">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500/20 to-rose-500/20 flex items-center justify-center">
            <Shield className="w-5 h-5 text-red-500" />
          </div>
          <div>
            <h1 className="text-lg sm:text-2xl font-bold">Field Level Security</h1>
            <p className="text-sm text-muted-foreground">ניהול הרשאות שדה לפי תפקיד — מי רואה מה</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span
              className="w-2 h-2 rounded-full bg-green-400"
              style={{ opacity: pulse ? 1 : 0.3, transition: "opacity 0.6s ease" }}
            />
            עודכן: {formatTimestamp(lastUpdated)}
          </div>
          <Button onClick={openNew} className="gap-2">
            <Plus className="w-4 h-4" />
            הרשאה חדשה +
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-3 my-6">
        {STAT_CARDS.map(stat => {
          const cfg = LEVEL_CONFIG[stat.key];
          const Icon = cfg.icon;
          const isActive = filterLevel === stat.key;
          return (
            <button
              key={stat.key}
              onClick={() => setFilterLevel(isActive ? "all" : stat.key)}
              className={`rounded-xl p-4 text-right border transition-all hover:opacity-90 ${stat.bg} ${stat.border} ${isActive ? "ring-2 ring-offset-1 ring-offset-background ring-current" : ""}`}
            >
              <div className="flex items-center gap-2 mb-1">
                <Icon className={`w-4 h-4 ${stat.color}`} />
                <span className={`text-lg sm:text-2xl font-bold ${stat.color}`}>{counts[stat.key]}</span>
              </div>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-3 mb-4">
        <div className="flex items-center gap-2 bg-muted/30 rounded-lg px-3 py-2 flex-1 max-w-sm">
          <Search className="w-4 h-4 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="חפש לפי תפקיד, מודול או שדה..."
            className="bg-transparent text-sm outline-none flex-1"
          />
          {search && (
            <button onClick={() => setSearch("")} className="text-muted-foreground hover:text-foreground">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        {filterLevel !== "all" && (
          <button
            onClick={() => setFilterLevel("all")}
            className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-muted/30 text-muted-foreground hover:bg-muted/50 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
            נקה סינון
          </button>
        )}
        <p className="text-xs text-muted-foreground mr-auto">{filtered.length} הרשאות פעילות</p>
      </div>

      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-muted/20 flex items-center gap-2">
          <Lock className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">הרשאות שדה פעילות</span>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/10">
              <th className="text-right p-3 font-medium text-xs text-muted-foreground">תפקיד</th>
              <th className="text-right p-3 font-medium text-xs text-muted-foreground">מודול</th>
              <th className="text-right p-3 font-medium text-xs text-muted-foreground">שדה</th>
              <th className="text-right p-3 font-medium text-xs text-muted-foreground">רמת הרשאה</th>
              <th className="text-right p-3 font-medium text-xs text-muted-foreground">עדכון אחרון</th>
              <th className="p-3 w-20" />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-muted-foreground text-sm">
                  לא נמצאו הרשאות תואמות
                </td>
              </tr>
            ) : (
              filtered.map(perm => {
                const cfg = LEVEL_CONFIG[perm.level];
                const Icon = cfg.icon;
                return (
                  <tr key={perm.id} className="border-b border-border hover:bg-muted/10 transition-colors">
                    <td className="p-3 font-medium">{perm.role}</td>
                    <td className="p-3 text-muted-foreground">{perm.module}</td>
                    <td className="p-3">{perm.field}</td>
                    <td className="p-3">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${cfg.bg} ${cfg.color} ${cfg.border}`}>
                        <Icon className="w-3.5 h-3.5" />
                        {cfg.label}
                      </span>
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">{perm.updatedAt}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={() => openEdit(perm)}
                          className="p-1.5 rounded-lg hover:bg-muted/40 text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(perm.id)}
                          className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </Card>

      {showDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" dir="rtl">
          <div className="bg-background border border-border rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center">
                  <Shield className="w-4 h-4 text-red-500" />
                </div>
                <h2 className="text-lg font-semibold">
                  {editPerm ? "עריכת הרשאה" : "הרשאה חדשה"}
                </h2>
              </div>
              <button
                onClick={() => setShowDialog(false)}
                className="p-1.5 rounded-lg hover:bg-muted/40 text-muted-foreground transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">תפקיד</label>
                <div className="relative">
                  <select
                    value={formRole}
                    onChange={e => setFormRole(e.target.value)}
                    className="w-full bg-muted/20 border border-border rounded-lg px-3 py-2 text-sm appearance-none outline-none focus:border-primary/50"
                  >
                    {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <ChevronDown className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">מודול</label>
                <div className="relative">
                  <select
                    value={formModule}
                    onChange={e => handleModuleChange(e.target.value)}
                    className="w-full bg-muted/20 border border-border rounded-lg px-3 py-2 text-sm appearance-none outline-none focus:border-primary/50"
                  >
                    {Object.keys(MODULES_FIELDS).map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <ChevronDown className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">שדה</label>
                <div className="relative">
                  <select
                    value={formField}
                    onChange={e => setFormField(e.target.value)}
                    className="w-full bg-muted/20 border border-border rounded-lg px-3 py-2 text-sm appearance-none outline-none focus:border-primary/50"
                  >
                    {(MODULES_FIELDS[formModule] || []).map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                  <ChevronDown className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">רמת הרשאה</label>
                <div className="grid grid-cols-1 gap-2">
                  {(Object.entries(LEVEL_CONFIG) as [PermissionLevel, typeof LEVEL_CONFIG[PermissionLevel]][]).map(([key, cfg]) => {
                    const Icon = cfg.icon;
                    const isSelected = formLevel === key;
                    return (
                      <button
                        key={key}
                        onClick={() => setFormLevel(key)}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border text-sm transition-all text-right ${
                          isSelected
                            ? `${cfg.bg} ${cfg.border} ${cfg.color} border`
                            : "border-border hover:bg-muted/20 text-muted-foreground"
                        }`}
                      >
                        <Icon className="w-4 h-4 shrink-0" />
                        <span className="font-medium">{cfg.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <Button onClick={handleSave} className="flex-1">
                {editPerm ? "שמור שינויים" : "צור הרשאה"}
              </Button>
              <Button variant="outline" onClick={() => setShowDialog(false)} className="flex-1">
                ביטול
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <ActivityLog entityType="field-security" />
        <RelatedRecords entityType="field-security" />
      </div>
    </div>
  );
}
