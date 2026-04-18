import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { authFetch } from "@/lib/utils";
import {
  Plus, Trash2, Edit2, ShieldCheck, AlertTriangle, X, CheckCircle
} from "lucide-react";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";

const API = "/api";

const RULE_TYPE_LABELS: Record<string, string> = {
  required: "שדה חובה",
  min_length: "אורך מינימלי",
  max_length: "אורך מקסימלי",
  min_value: "ערך מינימלי",
  max_value: "ערך מקסימלי",
  regex: "ביטוי רגולרי",
  email: "פורמט אימייל",
  url: "פורמט URL",
  numeric_range: "טווח מספרי",
  custom: "תנאי מותאם",
  cross_field: "תנאי בין-שדות",
};

const OPERATOR_LABELS: Record<string, string> = {
  equals: "שווה ל",
  not_equals: "לא שווה ל",
  greater_than: "גדול מ",
  less_than: "קטן מ",
  greater_or_equal: "גדול או שווה ל",
  less_or_equal: "קטן או שווה ל",
  contains: "מכיל",
  not_contains: "לא מכיל",
  starts_with: "מתחיל ב",
  ends_with: "מסתיים ב",
  matches: "תואם ביטוי",
  is_empty: "ריק",
  is_not_empty: "לא ריק",
  between: "בטווח",
  in_list: "ברשימה",
};

interface ValidationRule {
  id: number;
  entityId: number;
  name: string;
  ruleType: string;
  fieldSlug: string | null;
  operator: string;
  value: string | null;
  errorMessage: string;
  errorMessageHe: string | null;
  sortOrder: number;
  isActive: boolean;
  conditions: any;
}

export function ValidationTab({ entityId, fields }: { entityId: number; fields: any[] }) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingRule, setEditingRule] = useState<ValidationRule | null>(null);
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;

  const { data: rules = [] } = useQuery<ValidationRule[]>({
    queryKey: ["entity-validations", entityId],
    queryFn: () => authFetch(`${API}/platform/entities/${entityId}/validations`).then(r => r.json()),
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const r = await authFetch(`${API}/platform/entities/${entityId}/validations`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error("Failed to create validation rule");
      return r.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["entity-validations", entityId] }); setShowForm(false); },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: any) => {
      const r = await authFetch(`${API}/platform/validations/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error("Failed to update validation rule");
      return r.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["entity-validations", entityId] }); setEditingRule(null); },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await authFetch(`${API}/platform/validations/${id}`, { method: "DELETE" });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["entity-validations", entityId] }),
  });

  const fieldRules = rules.filter(r => r.fieldSlug);
  const recordRules = rules.filter(r => !r.fieldSlug);

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">כללי ולידציה ({rules.length})</h2>
        <button onClick={() => { setEditingRule(null); setShowForm(true); }} className="flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors">
          <Plus className="w-4 h-4" />
          כלל חדש
        </button>
      </div>

      {rules.length === 0 ? (
        <div className="bg-card border border-border/50 rounded-2xl p-8 text-center">
          <ShieldCheck className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground mb-4">אין כללי ולידציה — הוסף כללים כדי לאכוף נתונים תקינים</p>
          <button onClick={() => setShowForm(true)} className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium"><Plus className="w-4 h-4" />הוסף כלל</button>
        </div>
      ) : (
        <div className="space-y-4">
          {fieldRules.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-2">כללי שדה ({fieldRules.length})</h3>
              <div className="space-y-2">
                {fieldRules.map(rule => {
                  const field = fields.find(f => f.slug === rule.fieldSlug);
                  return (
                    <div key={rule.id} className={`flex items-center gap-3 px-4 py-3 bg-card border rounded-xl ${rule.isActive ? "border-border" : "border-border/50 opacity-60"}`}>
                      <div className="w-8 h-8 rounded-lg bg-yellow-500/10 flex items-center justify-center">
                        <AlertTriangle className="w-4 h-4 text-yellow-500" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium">{rule.name}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                          <span className="px-1.5 py-0.5 bg-blue-500/10 text-blue-400 rounded-md">{field?.name || rule.fieldSlug}</span>
                          <span className="px-1.5 py-0.5 bg-purple-500/10 text-purple-400 rounded-md">{RULE_TYPE_LABELS[rule.ruleType] || rule.ruleType}</span>
                          {rule.value && <span>{OPERATOR_LABELS[rule.operator] || rule.operator}: {rule.value}</span>}
                        </div>
                        <p className="text-xs text-destructive/80 mt-0.5">{rule.errorMessageHe || rule.errorMessage}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => setEditingRule(rule)} className="p-1.5 hover:bg-muted rounded-lg"><Edit2 className="w-3.5 h-3.5 text-muted-foreground" /></button>
                        {isSuperAdmin && (
                          <button onClick={async () => { const ok = await globalConfirm("מחיקת כלל", { itemName: rule.name, entityType: "כלל אימות" }); if (ok) deleteMutation.mutate(rule.id); }} className="p-1.5 hover:bg-destructive/10 rounded-lg"><Trash2 className="w-3.5 h-3.5 text-destructive" /></button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {recordRules.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-2">כללי רשומה ({recordRules.length})</h3>
              <div className="space-y-2">
                {recordRules.map(rule => (
                  <div key={rule.id} className={`flex items-center gap-3 px-4 py-3 bg-card border rounded-xl ${rule.isActive ? "border-border" : "border-border/50 opacity-60"}`}>
                    <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center">
                      <ShieldCheck className="w-4 h-4 text-orange-500" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{rule.name}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                        <span className="px-1.5 py-0.5 bg-orange-500/10 text-orange-400 rounded-md">{RULE_TYPE_LABELS[rule.ruleType] || rule.ruleType}</span>
                        <span>{OPERATOR_LABELS[rule.operator] || rule.operator}</span>
                      </div>
                      <p className="text-xs text-destructive/80 mt-0.5">{rule.errorMessageHe || rule.errorMessage}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => setEditingRule(rule)} className="p-1.5 hover:bg-muted rounded-lg"><Edit2 className="w-3.5 h-3.5 text-muted-foreground" /></button>
                      {isSuperAdmin && (
                        <button onClick={async () => { const ok = await globalConfirm("מחיקת כלל", { itemName: rule.name, entityType: "כלל אימות" }); if (ok) deleteMutation.mutate(rule.id); }} className="p-1.5 hover:bg-destructive/10 rounded-lg"><Trash2 className="w-3.5 h-3.5 text-destructive" /></button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {(showForm || editingRule) && (
        <ValidationFormModal
          rule={editingRule}
          fields={fields}
          onClose={() => { setShowForm(false); setEditingRule(null); }}
          onSubmit={(data) => {
            if (editingRule) {
              updateMutation.mutate({ id: editingRule.id, ...data });
            } else {
              createMutation.mutate(data);
            }
          }}
          isLoading={createMutation.isPending || updateMutation.isPending}
        />
      )}
    </div>
  );
}

function ValidationFormModal({ rule, fields, onClose, onSubmit, isLoading }: {
  rule: ValidationRule | null; fields: any[]; onClose: () => void; onSubmit: (data: any) => void; isLoading: boolean;
}) {
  const [form, setForm] = useState({
    name: rule?.name || "",
    ruleType: rule?.ruleType || "required",
    fieldSlug: rule?.fieldSlug || "",
    operator: rule?.operator || "is_not_empty",
    value: rule?.value || "",
    errorMessage: rule?.errorMessage || "",
    errorMessageHe: rule?.errorMessageHe || "",
    isActive: rule?.isActive ?? true,
  });

  const ruleTypeOperators: Record<string, string[]> = {
    required: ["is_not_empty"],
    min_length: ["greater_or_equal"],
    max_length: ["less_or_equal"],
    min_value: ["greater_or_equal"],
    max_value: ["less_or_equal"],
    regex: ["matches"],
    email: ["matches"],
    url: ["matches"],
    numeric_range: ["between"],
    custom: Object.keys(OPERATOR_LABELS),
    cross_field: Object.keys(OPERATOR_LABELS),
  };

  const availableOperators = ruleTypeOperators[form.ruleType] || Object.keys(OPERATOR_LABELS);
  const needsValue = !["is_empty", "is_not_empty"].includes(form.operator);
  const isFieldLevel = form.ruleType !== "cross_field";

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        className="bg-card border border-border rounded-2xl p-6 w-full max-w-lg max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h2 className="text-xl font-bold mb-6">{rule ? "עריכת כלל ולידציה" : "כלל ולידציה חדש"}</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">שם הכלל *</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="למשל: אימייל תקין" className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">סוג כלל *</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 max-h-[160px] overflow-y-auto">
              {Object.entries(RULE_TYPE_LABELS).map(([key, label]) => (
                <button key={key} type="button" onClick={() => {
                  const ops = ruleTypeOperators[key] || [];
                  setForm(f => ({ ...f, ruleType: key, operator: ops[0] || f.operator }));
                }}
                  className={`px-2 py-1.5 rounded-xl text-xs font-medium transition-colors ${form.ruleType === key ? "bg-primary text-primary-foreground" : "bg-background border border-border hover:border-primary/30"}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {isFieldLevel && (
            <div>
              <label className="block text-sm font-medium mb-1.5">שדה *</label>
              <select value={form.fieldSlug} onChange={e => setForm(f => ({ ...f, fieldSlug: e.target.value }))}
                className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                <option value="">בחר שדה...</option>
                {fields.map(f => <option key={f.slug} value={f.slug}>{f.name} ({f.slug})</option>)}
              </select>
            </div>
          )}

          {availableOperators.length > 1 && (
            <div>
              <label className="block text-sm font-medium mb-1.5">אופרטור</label>
              <select value={form.operator} onChange={e => setForm(f => ({ ...f, operator: e.target.value }))}
                className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                {availableOperators.map(op => <option key={op} value={op}>{OPERATOR_LABELS[op] || op}</option>)}
              </select>
            </div>
          )}

          {needsValue && (
            <div>
              <label className="block text-sm font-medium mb-1.5">ערך</label>
              <input value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))}
                placeholder={form.ruleType === "regex" ? "^[a-zA-Z]+$" : "ערך"}
                dir="ltr" className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1.5">הודעת שגיאה (אנגלית) *</label>
            <input value={form.errorMessage} onChange={e => setForm(f => ({ ...f, errorMessage: e.target.value }))}
              placeholder="This field is required" dir="ltr" className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">הודעת שגיאה (עברית)</label>
            <input value={form.errorMessageHe} onChange={e => setForm(f => ({ ...f, errorMessageHe: e.target.value }))}
              placeholder="שדה זה הוא חובה" className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))}
              className="w-4 h-4 rounded border-border text-primary focus:ring-primary" />
            <span className="text-sm">פעיל</span>
          </label>
        </div>
        <div className="flex items-center gap-3 mt-6 pt-4 border-t border-border">
          <button onClick={() => onSubmit({ ...form, fieldSlug: form.fieldSlug || null, value: form.value || null })}
            disabled={!form.name || !form.errorMessage || (isFieldLevel && !form.fieldSlug) || isLoading}
            className="flex-1 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-colors disabled:opacity-50">
            {isLoading ? "שומר..." : rule ? "עדכן" : "הוסף כלל"}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 bg-muted rounded-xl font-medium hover:bg-muted/80 transition-colors">ביטול</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

export function runValidations(rules: ValidationRule[], formData: Record<string, any>, fields: any[]): Record<string, string> {
  const errors: Record<string, string> = {};

  for (const rule of rules) {
    if (!rule.isActive) continue;

    if (rule.fieldSlug) {
      const value = formData[rule.fieldSlug];
      const field = fields.find(f => f.slug === rule.fieldSlug);
      let isInvalid = false;

      switch (rule.ruleType) {
        case "required":
          isInvalid = value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);
          break;
        case "min_length":
          isInvalid = typeof value === "string" && value.length > 0 && value.length < Number(rule.value);
          break;
        case "max_length":
          isInvalid = typeof value === "string" && value.length > Number(rule.value);
          break;
        case "min_value":
          isInvalid = value !== "" && value !== null && value !== undefined && Number(value) < Number(rule.value);
          break;
        case "max_value":
          isInvalid = value !== "" && value !== null && value !== undefined && Number(value) > Number(rule.value);
          break;
        case "regex":
          if (value && typeof value === "string" && rule.value) {
            try {
              isInvalid = !new RegExp(rule.value).test(value);
            } catch { isInvalid = false; }
          }
          break;
        case "email":
          if (value && typeof value === "string") {
            isInvalid = !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
          }
          break;
        case "url":
          if (value && typeof value === "string") {
            try { new URL(value); } catch { isInvalid = true; }
          }
          break;
        case "numeric_range":
          if (value !== "" && value !== null && value !== undefined && rule.value) {
            const [min, max] = rule.value.split(",").map(Number);
            const num = Number(value);
            isInvalid = num < min || num > max;
          }
          break;
        case "custom":
          isInvalid = evaluateCustomOperator(rule.operator, value, rule.value);
          break;
      }

      if (isInvalid && !errors[rule.fieldSlug]) {
        errors[rule.fieldSlug] = rule.errorMessageHe || rule.errorMessage;
      }
    } else if (rule.ruleType === "cross_field" && rule.conditions) {
      const cond = rule.conditions as any;
      if (cond.field1 && cond.field2) {
        const v1 = formData[cond.field1];
        const v2 = formData[cond.field2];
        if (evaluateCustomOperator(rule.operator, v1, String(v2))) {
          errors["_record"] = rule.errorMessageHe || rule.errorMessage;
        }
      }
    }
  }

  return errors;
}

function evaluateCustomOperator(operator: string, value: any, compareValue: string | null): boolean {
  switch (operator) {
    case "equals": return String(value) !== compareValue;
    case "not_equals": return String(value) === compareValue;
    case "greater_than": return !(Number(value) > Number(compareValue));
    case "less_than": return !(Number(value) < Number(compareValue));
    case "contains": return typeof value === "string" && !value.includes(compareValue || "");
    case "not_contains": return typeof value === "string" && value.includes(compareValue || "");
    case "starts_with": return typeof value === "string" && !value.startsWith(compareValue || "");
    case "ends_with": return typeof value === "string" && !value.endsWith(compareValue || "");
    case "is_empty": return !(value === undefined || value === null || value === "");
    case "is_not_empty": return value === undefined || value === null || value === "";
    default: return false;
  }
}
