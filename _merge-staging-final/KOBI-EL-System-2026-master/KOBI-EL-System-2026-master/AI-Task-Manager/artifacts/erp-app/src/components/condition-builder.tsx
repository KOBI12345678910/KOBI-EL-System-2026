import { useState } from "react";
import { Plus, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export interface ConditionRule {
  field: string;
  operator: string;
  value: string;
}

export interface ConditionGroup {
  logic: "AND" | "OR";
  rules: ConditionRule[];
  groups: ConditionGroup[];
}

const OPERATORS = [
  { value: "equals", label: "שווה ל" },
  { value: "not_equals", label: "לא שווה ל" },
  { value: "contains", label: "מכיל" },
  { value: "not_contains", label: "לא מכיל" },
  { value: "gt", label: "גדול מ" },
  { value: "lt", label: "קטן מ" },
  { value: "gte", label: "גדול או שווה" },
  { value: "lte", label: "קטן או שווה" },
  { value: "is_empty", label: "ריק" },
  { value: "is_not_empty", label: "לא ריק" },
  { value: "is_true", label: "אמת" },
  { value: "is_false", label: "שקר" },
  { value: "in", label: "אחד מ" },
  { value: "regex", label: "Regex" },
];

const NO_VALUE_OPERATORS = ["is_empty", "is_not_empty", "is_true", "is_false"];

interface ConditionBuilderProps {
  value: ConditionGroup;
  onChange: (group: ConditionGroup) => void;
  fieldSuggestions?: string[];
  depth?: number;
}

export function createEmptyGroup(): ConditionGroup {
  return { logic: "AND", rules: [], groups: [] };
}

export function createEmptyRule(): ConditionRule {
  return { field: "", operator: "equals", value: "" };
}

function RuleRow({
  rule,
  onChange,
  onDelete,
  fieldSuggestions,
}: {
  rule: ConditionRule;
  onChange: (r: ConditionRule) => void;
  onDelete: () => void;
  fieldSuggestions?: string[];
}) {
  const noValue = NO_VALUE_OPERATORS.includes(rule.operator);

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="relative flex-1 min-w-[120px]">
        <input
          value={rule.field}
          onChange={e => onChange({ ...rule, field: e.target.value })}
          placeholder="שדה"
          list="field-suggestions"
          className="w-full px-2 py-1.5 bg-background border border-border rounded-lg text-xs focus:ring-1 focus:ring-primary/50 focus:outline-none"
        />
        {fieldSuggestions && fieldSuggestions.length > 0 && (
          <datalist id="field-suggestions">
            {fieldSuggestions.map(f => <option key={f} value={f} />)}
          </datalist>
        )}
      </div>
      <select
        value={rule.operator}
        onChange={e => onChange({ ...rule, operator: e.target.value })}
        className="px-2 py-1.5 bg-background border border-border rounded-lg text-xs focus:ring-1 focus:ring-primary/50 focus:outline-none"
      >
        {OPERATORS.map(op => (
          <option key={op.value} value={op.value}>{op.label}</option>
        ))}
      </select>
      {!noValue && (
        <input
          value={rule.value}
          onChange={e => onChange({ ...rule, value: e.target.value })}
          placeholder="ערך"
          className="flex-1 min-w-[80px] px-2 py-1.5 bg-background border border-border rounded-lg text-xs focus:ring-1 focus:ring-primary/50 focus:outline-none"
        />
      )}
      <button onClick={onDelete} className="p-1 hover:bg-destructive/10 rounded transition-colors flex-shrink-0">
        <Trash2 className="w-3.5 h-3.5 text-destructive" />
      </button>
    </div>
  );
}

function GroupBlock({
  group,
  onChange,
  onDelete,
  fieldSuggestions,
  depth = 0,
}: {
  group: ConditionGroup;
  onChange: (g: ConditionGroup) => void;
  onDelete?: () => void;
  fieldSuggestions?: string[];
  depth?: number;
}) {
  const [collapsed, setCollapsed] = useState(false);

  const addRule = () => onChange({ ...group, rules: [...group.rules, createEmptyRule()] });
  const addGroup = () => onChange({ ...group, groups: [...group.groups, createEmptyGroup()] });

  const updateRule = (i: number, rule: ConditionRule) => {
    const newRules = [...group.rules];
    newRules[i] = rule;
    onChange({ ...group, rules: newRules });
  };

  const deleteRule = (i: number) => {
    onChange({ ...group, rules: group.rules.filter((_, idx) => idx !== i) });
  };

  const updateSubGroup = (i: number, g: ConditionGroup) => {
    const newGroups = [...group.groups];
    newGroups[i] = g;
    onChange({ ...group, groups: newGroups });
  };

  const deleteSubGroup = (i: number) => {
    onChange({ ...group, groups: group.groups.filter((_, idx) => idx !== i) });
  };

  const borderColor = depth === 0 ? "border-primary/30" : depth === 1 ? "border-orange-500/30" : "border-purple-500/30";
  const bgColor = depth === 0 ? "bg-primary/5" : depth === 1 ? "bg-orange-500/5" : "bg-purple-500/5";

  return (
    <div className={`border ${borderColor} ${bgColor} rounded-xl p-3 space-y-2`}>
      <div className="flex items-center gap-2">
        <div className="flex bg-muted rounded-lg p-0.5 text-xs">
          <button
            onClick={() => onChange({ ...group, logic: "AND" })}
            className={`px-2 py-1 rounded transition-colors font-medium ${group.logic === "AND" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"}`}
          >
            AND (כולם)
          </button>
          <button
            onClick={() => onChange({ ...group, logic: "OR" })}
            className={`px-2 py-1 rounded transition-colors font-medium ${group.logic === "OR" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"}`}
          >
            OR (אחד מ)
          </button>
        </div>
        <span className="text-xs text-muted-foreground">
          {group.rules.length + group.groups.length} תנאים
        </span>
        <div className="mr-auto flex gap-1">
          <button onClick={() => setCollapsed(!collapsed)} className="p-1 hover:bg-muted rounded text-muted-foreground">
            {collapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          </button>
          {onDelete && (
            <button onClick={onDelete} className="p-1 hover:bg-destructive/10 rounded">
              <Trash2 className="w-3.5 h-3.5 text-destructive" />
            </button>
          )}
        </div>
      </div>

      <AnimatePresence>
        {!collapsed && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
            className="space-y-2">
            {group.rules.map((rule, i) => (
              <div key={i} className="flex items-center gap-1.5">
                {i > 0 && (
                  <span className={`text-[10px] font-bold ${group.logic === "AND" ? "text-primary" : "text-orange-400"} flex-shrink-0 w-8 text-center`}>
                    {group.logic}
                  </span>
                )}
                <div className={`flex-1 ${i > 0 ? "" : ""}`}>
                  <RuleRow
                    rule={rule}
                    onChange={(r) => updateRule(i, r)}
                    onDelete={() => deleteRule(i)}
                    fieldSuggestions={fieldSuggestions}
                  />
                </div>
              </div>
            ))}

            {group.groups.map((subGroup, i) => (
              <div key={i} className="flex gap-1.5">
                {(group.rules.length > 0 || i > 0) && (
                  <span className={`text-[10px] font-bold ${group.logic === "AND" ? "text-primary" : "text-orange-400"} flex-shrink-0 w-8 text-center mt-3`}>
                    {group.logic}
                  </span>
                )}
                <div className="flex-1">
                  <GroupBlock
                    group={subGroup}
                    onChange={(g) => updateSubGroup(i, g)}
                    onDelete={depth < 2 ? () => deleteSubGroup(i) : undefined}
                    fieldSuggestions={fieldSuggestions}
                    depth={depth + 1}
                  />
                </div>
              </div>
            ))}

            <div className="flex gap-2 pt-1">
              <button onClick={addRule}
                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-card border border-border rounded-lg text-xs hover:border-primary/50 transition-colors">
                <Plus className="w-3 h-3" />
                הוסף תנאי
              </button>
              {depth < 2 && (
                <button onClick={addGroup}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 bg-card border border-border rounded-lg text-xs hover:border-primary/50 transition-colors text-muted-foreground">
                  <Plus className="w-3 h-3" />
                  הוסף קבוצה
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function ConditionBuilder({ value, onChange, fieldSuggestions, depth = 0 }: ConditionBuilderProps) {
  return (
    <GroupBlock
      group={value}
      onChange={onChange}
      fieldSuggestions={fieldSuggestions}
      depth={depth}
    />
  );
}
