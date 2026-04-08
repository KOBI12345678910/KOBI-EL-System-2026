import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronDown, Check, AlertCircle, Save, CheckCircle2, ChevronRight, ChevronLeft } from "lucide-react";
import { runValidations } from "./validation-builder";
import { InlineChildGrid } from "./inline-child-grid";
import { RichTextField, SignatureField, BarcodeDisplay, QRDisplay, JsonEditor } from "./form-field-components";
import { STATUS_COLORS } from "./field-type-registry.ts";
import AIFormFill from "@/components/ai/ai-form-fill";
import { authFetch } from "@/lib/utils";

const API = "/api";

function isFieldVisible(field: any, formData: Record<string, any>): boolean {
  const rules = field.displayRules;
  if (!rules || !rules.conditionField) return true;
  const conditionValue = formData[rules.conditionField];
  const targetValue = rules.conditionValue;
  const operator = rules.conditionOperator || "equals";
  switch (operator) {
    case "equals": return String(conditionValue) === String(targetValue);
    case "not_equals": return String(conditionValue) !== String(targetValue);
    case "contains": return String(conditionValue || "").includes(String(targetValue || ""));
    case "not_empty": return conditionValue !== undefined && conditionValue !== null && conditionValue !== "";
    case "is_empty": return conditionValue === undefined || conditionValue === null || conditionValue === "";
    case "in_list": {
      const list = Array.isArray(targetValue) ? targetValue : String(targetValue || "").split(",").map(s => s.trim());
      return list.includes(String(conditionValue));
    }
    case "gt": return Number(conditionValue) > Number(targetValue);
    case "lt": return Number(conditionValue) < Number(targetValue);
    default: return true;
  }
}

interface ClientToken { type: string; value?: any; }
type ClientASTNode =
  | { kind: "number"; value: number }
  | { kind: "string"; value: string }
  | { kind: "field_ref"; slug: string }
  | { kind: "binary"; op: string; left: ClientASTNode; right: ClientASTNode }
  | { kind: "unary"; op: string; operand: ClientASTNode }
  | { kind: "call"; name: string; args: ClientASTNode[] }
  | { kind: "ident"; value: string };

function clientTokenize(expression: string): ClientToken[] {
  const tokens: ClientToken[] = [];
  let i = 0;
  while (i < expression.length) {
    const ch = expression[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (ch === "{") {
      const end = expression.indexOf("}", i);
      if (end === -1) throw new Error("Unclosed {");
      tokens.push({ type: "field_ref", value: expression.slice(i + 1, end) });
      i = end + 1; continue;
    }
    if (ch === '"' || ch === "'") {
      const q = ch; let s = ""; i++;
      while (i < expression.length && expression[i] !== q) { s += expression[i]; i++; }
      if (i < expression.length) i++;
      tokens.push({ type: "string", value: s }); continue;
    }
    if (ch === ">" || ch === "<" || ch === "!" || ch === "=") {
      let op = ch;
      if (i + 1 < expression.length && expression[i + 1] === "=") { op += "="; i++; }
      tokens.push({ type: "comparison", value: op }); i++; continue;
    }
    if (/[+\-*/%^]/.test(ch)) { tokens.push({ type: "op", value: ch }); i++; continue; }
    if (ch === "(") { tokens.push({ type: "paren", value: "(" }); i++; continue; }
    if (ch === ")") { tokens.push({ type: "paren", value: ")" }); i++; continue; }
    if (ch === ",") { tokens.push({ type: "comma" }); i++; continue; }
    if (/[0-9.]/.test(ch)) {
      let n = "";
      while (i < expression.length && /[0-9.]/.test(expression[i])) { n += expression[i]; i++; }
      tokens.push({ type: "number", value: parseFloat(n) }); continue;
    }
    if (/[a-zA-Z_\u0590-\u05FF]/.test(ch)) {
      let id = "";
      while (i < expression.length && /[a-zA-Z0-9_\u0590-\u05FF.]/.test(expression[i])) { id += expression[i]; i++; }
      tokens.push({ type: "ident", value: id }); continue;
    }
    i++;
  }
  return tokens;
}

function clientParse(tokens: ClientToken[]): ClientASTNode {
  let pos = 0;
  function peek() { return pos < tokens.length ? tokens[pos] : null; }
  function consume() { return tokens[pos++]; }
  function parseExpr(): ClientASTNode { return parseComparison(); }
  function parseComparison(): ClientASTNode {
    let left = parseAddSub();
    while (peek()?.type === "comparison") { const op = consume().value; left = { kind: "binary", op, left, right: parseAddSub() }; }
    return left;
  }
  function parseAddSub(): ClientASTNode {
    let left = parseMulDiv();
    while (peek()?.type === "op" && (peek()!.value === "+" || peek()!.value === "-")) { const op = consume().value; left = { kind: "binary", op, left, right: parseMulDiv() }; }
    return left;
  }
  function parseMulDiv(): ClientASTNode {
    let left = parsePow();
    while (peek()?.type === "op" && (peek()!.value === "*" || peek()!.value === "/" || peek()!.value === "%")) { const op = consume().value; left = { kind: "binary", op, left, right: parsePow() }; }
    return left;
  }
  function parsePow(): ClientASTNode {
    let left = parseUnary();
    while (peek()?.type === "op" && peek()!.value === "^") { consume(); left = { kind: "binary", op: "^", left, right: parseUnary() }; }
    return left;
  }
  function parseUnary(): ClientASTNode {
    if (peek()?.type === "op" && peek()!.value === "-") { consume(); return { kind: "unary", op: "-", operand: parsePrimary() }; }
    return parsePrimary();
  }
  function parsePrimary(): ClientASTNode {
    const t = peek();
    if (!t) throw new Error("Unexpected end");
    if (t.type === "number") { consume(); return { kind: "number", value: t.value }; }
    if (t.type === "string") { consume(); return { kind: "string", value: t.value }; }
    if (t.type === "field_ref") { consume(); return { kind: "field_ref", slug: t.value }; }
    if (t.type === "ident") {
      consume();
      if (peek()?.type === "paren" && peek()!.value === "(") {
        consume();
        const args: ClientASTNode[] = [];
        if (peek()?.type !== "paren" || peek()!.value !== ")") {
          args.push(parseExpr());
          while (peek()?.type === "comma") { consume(); args.push(parseExpr()); }
        }
        consume();
        return { kind: "call", name: (t.value as string).toUpperCase(), args };
      }
      return { kind: "ident", value: t.value };
    }
    if (t.type === "paren" && t.value === "(") { consume(); const e = parseExpr(); consume(); return e; }
    throw new Error("Unexpected token");
  }
  return parseExpr();
}

function clientToNum(val: any): number {
  if (typeof val === "number") return isNaN(val) ? 0 : val;
  if (typeof val === "boolean") return val ? 1 : 0;
  if (typeof val === "string") { const n = Number(val); return isNaN(n) ? 0 : n; }
  return 0;
}

function clientEval(node: ClientASTNode, data: Record<string, any>): any {
  switch (node.kind) {
    case "number": return node.value;
    case "string": return node.value;
    case "field_ref": { const v = data[node.slug]; if (v == null || v === "") return 0; const n = Number(v); return isNaN(n) ? v : n; }
    case "ident": { const v = data[node.value]; if (v == null || v === "") return 0; const n = Number(v); return isNaN(n) ? v : n; }
    case "unary": return node.op === "-" ? -clientToNum(clientEval(node.operand, data)) : clientEval(node.operand, data);
    case "binary": {
      const l = clientEval(node.left, data), r = clientEval(node.right, data);
      switch (node.op) {
        case "+": return (typeof l === "string" || typeof r === "string") ? String(l) + String(r) : clientToNum(l) + clientToNum(r);
        case "-": return clientToNum(l) - clientToNum(r);
        case "*": return clientToNum(l) * clientToNum(r);
        case "/": { const d = clientToNum(r); if (d === 0) throw new Error("Division by zero"); return clientToNum(l) / d; }
        case "%": { const m = clientToNum(r); if (m === 0) throw new Error("Modulo by zero"); return clientToNum(l) % m; }
        case "^": return Math.pow(clientToNum(l), clientToNum(r));
        case ">": return clientToNum(l) > clientToNum(r) ? 1 : 0;
        case "<": return clientToNum(l) < clientToNum(r) ? 1 : 0;
        case ">=": return clientToNum(l) >= clientToNum(r) ? 1 : 0;
        case "<=": return clientToNum(l) <= clientToNum(r) ? 1 : 0;
        case "==": case "=": return l == r ? 1 : 0;
        case "!=": return l != r ? 1 : 0;
        default: return 0;
      }
    }
    case "call": {
      const args = node.args.map(a => clientEval(a, data));
      switch (node.name) {
        case "SUM": return args.reduce((s, v) => s + clientToNum(v), 0);
        case "AVG": return args.length === 0 ? 0 : args.reduce((s, v) => s + clientToNum(v), 0) / args.length;
        case "MIN": return Math.min(...args.map(clientToNum));
        case "MAX": return Math.max(...args.map(clientToNum));
        case "IF": return args.length < 2 ? 0 : (typeof args[0] === "number" ? args[0] !== 0 : !!args[0]) ? args[1] : (args[2] ?? 0);
        case "ROUND": { const v = clientToNum(args[0]); const d = args.length > 1 ? clientToNum(args[1]) : 0; const f = Math.pow(10, d); return Math.round(v * f) / f; }
        case "ABS": return Math.abs(clientToNum(args[0]));
        case "CEIL": return Math.ceil(clientToNum(args[0]));
        case "FLOOR": return Math.floor(clientToNum(args[0]));
        case "CONCAT": return args.map(String).join("");
        default: return 0;
      }
    }
    default: return 0;
  }
}

function computeFormulaFieldsClient(data: Record<string, any>, allFields: any[]): Record<string, any> {
  const result = { ...data };
  const formulaFields = allFields.filter((f: any) => (f.fieldType === "formula" || f.fieldType === "computed" || f.isCalculated) && f.formulaExpression);
  if (formulaFields.length === 0) return result;
  const formulaSlugs = new Set(formulaFields.map((f: any) => f.slug));
  const astMap = new Map<string, ClientASTNode>();
  const depGraph = new Map<string, Set<string>>();
  for (const field of formulaFields) {
    try {
      const tokens = clientTokenize(field.formulaExpression);
      const ast = clientParse(tokens);
      astMap.set(field.slug, ast);
      const deps = new Set<string>();
      function collectRefs(n: ClientASTNode) {
        if (n.kind === "field_ref" && formulaSlugs.has(n.slug)) deps.add(n.slug);
        if (n.kind === "ident" && formulaSlugs.has(n.value)) deps.add(n.value);
        if (n.kind === "binary") { collectRefs(n.left); collectRefs(n.right); }
        if (n.kind === "unary") collectRefs(n.operand);
        if (n.kind === "call") n.args.forEach(collectRefs);
      }
      collectRefs(ast);
      depGraph.set(field.slug, deps);
    } catch { /* skip parse errors */ }
  }
  const sorted: string[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();
  function visit(slug: string) {
    if (visited.has(slug)) return;
    if (visiting.has(slug)) return;
    visiting.add(slug);
    const deps = depGraph.get(slug);
    if (deps) for (const d of deps) visit(d);
    visiting.delete(slug);
    visited.add(slug);
    sorted.push(slug);
  }
  for (const f of formulaFields) if (astMap.has(f.slug)) visit(f.slug);
  for (const slug of sorted) {
    const ast = astMap.get(slug);
    if (!ast) continue;
    try {
      const val = clientEval(ast, result);
      if (typeof val === "number" && isFinite(val)) {
        result[slug] = Math.round(val * 1e10) / 1e10;
      } else {
        result[slug] = val;
      }
    } catch { /* skip eval errors */ }
  }
  return result;
}

interface DynamicFormRendererProps {
  fields: any[];
  allFields?: any[];
  statuses?: any[];
  record?: any;
  entityName: string;
  entityId?: number;
  formDefinition?: any;
  validationRules?: any[];
  transitions?: any[];
  relations?: any[];
  onClose: () => void;
  onSubmit: (data: any) => void;
  onAutoSave?: (data: { data: Record<string, any>; status?: string }) => Promise<void>;
  isLoading: boolean;
  mode?: "modal" | "page" | "inline";
}

export default function DynamicFormRenderer({
  fields, allFields = [], statuses = [], record, entityName, entityId,
  formDefinition, validationRules = [], transitions = [], relations = [],
  onClose, onSubmit, onAutoSave, isLoading, mode = "modal"
}: DynamicFormRendererProps) {
  const existingData = record?.data || {};
  const [formData, setFormData] = useState<Record<string, any>>(() => {
    const initial: Record<string, any> = {};
    fields.forEach(f => {
      initial[f.slug] = existingData[f.slug] ?? f.defaultValue ?? (f.fieldType === "boolean" || f.fieldType === "checkbox" ? false : "");
    });
    return initial;
  });
  const [status, setStatus] = useState(record?.status || (statuses.find((s: any) => s.isDefault)?.slug || ""));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [activeSection, setActiveSection] = useState(0);
  const [autoSaveStatus, setAutoSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestFormDataRef = useRef(formData);
  const latestStatusRef = useRef(status);

  const computedData = useMemo(() => computeFormulaFieldsClient(formData, allFields), [formData, allFields]);

  const hasSections = formDefinition?.sections && Array.isArray(formDefinition.sections) && formDefinition.sections.length > 0;
  const sections = hasSections ? formDefinition.sections : [];
  const isMultiStep = hasSections && sections.length > 1 && (mode === "page" || mode === "modal");

  const triggerAutoSave = async (data: Record<string, any>, currentStatus: string) => {
    if (!record || !onAutoSave) return;
    setAutoSaveStatus("saving");
    try {
      await onAutoSave({ data, status: currentStatus || undefined });
      setAutoSaveStatus("saved");
      setTimeout(() => setAutoSaveStatus("idle"), 2000);
    } catch {
      setAutoSaveStatus("error");
      setTimeout(() => setAutoSaveStatus("idle"), 3000);
    }
  };

  const setValue = (slug: string, val: any) => {
    setFormData(d => {
      const next = { ...d, [slug]: val };
      latestFormDataRef.current = next;
      return next;
    });
    if (errors[slug]) setErrors(e => { const next = { ...e }; delete next[slug]; return next; });
    if (record && onAutoSave) {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      setAutoSaveStatus("saving");
      autoSaveTimerRef.current = setTimeout(() => {
        triggerAutoSave(latestFormDataRef.current, latestStatusRef.current);
      }, 1500);
    }
  };

  useEffect(() => { latestStatusRef.current = status; }, [status]);

  useEffect(() => {
    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
  }, []);

  const validateSection = (sectionIdx: number) => {
    const sectionFieldSlugs = sections[sectionIdx]?.fields || [];
    const sectionErrors: Record<string, string> = {};
    fields.forEach(f => {
      if (!sectionFieldSlugs.includes(f.slug)) return;
      if (f.isRequired && !f.isReadOnly && f.fieldType !== "auto_number" && f.fieldType !== "formula" && f.fieldType !== "computed") {
        const val = formData[f.slug];
        if (val === undefined || val === null || val === "" || (Array.isArray(val) && val.length === 0)) {
          sectionErrors[f.slug] = `${f.name} הוא שדה חובה`;
        }
      }
    });
    return sectionErrors;
  };

  const handleNextSection = () => {
    if (hasSections && sections.length > 1) {
      const sectionErrors = validateSection(activeSection);
      if (Object.keys(sectionErrors).length > 0) {
        setErrors(prev => ({ ...prev, ...sectionErrors }));
        return;
      }
    }
    setActiveSection(s => Math.min(s + 1, sections.length - 1));
  };

  const handlePrevSection = () => {
    setActiveSection(s => Math.max(s - 1, 0));
  };

  const handleSubmit = () => {
    const validationErrors = runValidations(validationRules, formData, allFields);
    const requiredErrors: Record<string, string> = {};
    fields.forEach(f => {
      if (f.isRequired && !f.isReadOnly && f.fieldType !== "auto_number" && f.fieldType !== "formula" && f.fieldType !== "computed") {
        const val = formData[f.slug];
        if (val === undefined || val === null || val === "" || (Array.isArray(val) && val.length === 0)) {
          requiredErrors[f.slug] = `${f.name} הוא שדה חובה`;
        }
      }
    });
    const allErrors = { ...requiredErrors, ...validationErrors };
    if (Object.keys(allErrors).length > 0) {
      setErrors(allErrors);
      if (hasSections && sections.length > 1) {
        const firstErrorSection = sections.findIndex((s: any) =>
          (s.fields || []).some((slug: string) => allErrors[slug])
        );
        if (firstErrorSection !== -1) setActiveSection(firstErrorSection);
      }
      return;
    }
    if (record && transitions.length > 0 && status !== record.status) {
      const currentStatusDef = statuses.find((s: any) => s.slug === record.status);
      if (currentStatusDef) {
        const validTransition = transitions.find((t: any) =>
          (t.fromStatusId === null || t.fromStatusId === currentStatusDef.id) &&
          t.toStatusId === statuses.find((s: any) => s.slug === status)?.id
        );
        if (!validTransition) { setErrors({ _status: "מעבר סטטוס לא חוקי" }); return; }
      }
    }
    setErrors({});
    onSubmit({ data: formData, status: status || undefined });
  };

  const widthClass: Record<string, string> = { full: "col-span-2", half: "col-span-1", third: "col-span-1", quarter: "col-span-1" };

  const getFieldValueForRender = (field: any) => {
    if (field.fieldType === "formula" || field.fieldType === "computed" || field.isCalculated) return computedData[field.slug];
    return formData[field.slug];
  };

  const renderField = (field: any) => {
    if (!isFieldVisible(field, formData)) return null;
    const hasError = !!errors[field.slug];
    return (
      <div key={field.slug} className={widthClass[field.fieldWidth] || "col-span-2"}>
        <label className="block text-sm font-medium mb-1.5">
          {field.name}
          {field.isRequired && <span className="text-destructive mr-1">*</span>}
        </label>
        {field.helpText && <p className="text-xs text-muted-foreground mb-1">{field.helpText}</p>}
        <div className={hasError ? "ring-1 ring-destructive rounded-xl" : ""}>
          {renderFormField(field, getFieldValueForRender(field), (val) => setValue(field.slug, val))}
        </div>
        <AnimatePresence>
          {hasError && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="text-xs text-destructive mt-1 flex items-center gap-1"
            >
              <AlertCircle className="w-3 h-3 flex-shrink-0" />
              {errors[field.slug]}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    );
  };

  const ProgressStepper = () => {
    if (!isMultiStep) return null;
    return (
      <div className="flex items-center gap-0 mb-6 overflow-x-auto pb-1">
        {sections.map((section: any, idx: number) => {
          const isCompleted = idx < activeSection;
          const isCurrent = idx === activeSection;
          const hasError = (section.fields || []).some((slug: string) => errors[slug]);
          return (
            <div key={idx} className="flex items-center flex-shrink-0">
              <button
                type="button"
                onClick={() => setActiveSection(idx)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all text-xs font-medium ${
                  isCurrent ? "bg-primary text-primary-foreground" :
                  isCompleted ? "text-emerald-400" :
                  hasError ? "text-destructive" :
                  "text-muted-foreground hover:text-foreground"
                }`}
              >
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                  isCurrent ? "bg-card/20" :
                  isCompleted ? "bg-emerald-500/20" :
                  hasError ? "bg-destructive/20" :
                  "bg-muted"
                }`}>
                  {isCompleted ? <Check className="w-3 h-3" /> : hasError ? <AlertCircle className="w-3 h-3" /> : idx + 1}
                </div>
                <span className="whitespace-nowrap">{section.name || `שלב ${idx + 1}`}</span>
              </button>
              {idx < sections.length - 1 && (
                <div className={`h-px w-6 flex-shrink-0 ${idx < activeSection ? "bg-emerald-500/50" : "bg-border"}`} />
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const AutoSaveIndicator = () => {
    if (!record || !onAutoSave) return null;
    return (
      <AnimatePresence>
        {autoSaveStatus !== "idle" && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={`flex items-center gap-1.5 text-xs ${
              autoSaveStatus === "saved" ? "text-emerald-400" :
              autoSaveStatus === "error" ? "text-destructive" :
              "text-muted-foreground"
            }`}
          >
            {autoSaveStatus === "saving" && <><Save className="w-3.5 h-3.5 animate-pulse" /> שומר...</>}
            {autoSaveStatus === "saved" && <><CheckCircle2 className="w-3.5 h-3.5" /> נשמר</>}
            {autoSaveStatus === "error" && <><AlertCircle className="w-3.5 h-3.5" /> שגיאה בשמירה</>}
          </motion.div>
        )}
      </AnimatePresence>
    );
  };

  const formContent = (
    <div className="space-y-4 sm:space-y-6">
      {errors._record && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="px-3 py-2 bg-destructive/10 border border-destructive/20 rounded-xl text-sm text-destructive flex items-center gap-2"
        >
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {errors._record}
        </motion.div>
      )}

      <ProgressStepper />

      {isMultiStep ? (
        <AnimatePresence mode="wait">
          <motion.div
            key={activeSection}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.15 }}
            className="grid grid-cols-1 sm:grid-cols-2 gap-4"
          >
            {(sections[activeSection]?.fields || []).map((slug: string) => {
              const field = fields.find((f: any) => f.slug === slug);
              if (!field) return null;
              return renderField(field);
            })}
          </motion.div>
        </AnimatePresence>
      ) : hasSections ? (
        sections.map((section: any, sIdx: number) => (
          <div key={sIdx}>
            {sections.length > 1 && (
              <h3 className="text-sm font-semibold text-muted-foreground mb-3 pb-2 border-b border-border">
                {section.name}
              </h3>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {(Array.isArray(section.fields) ? section.fields : []).map((slug: string) => {
                const field = fields.find((f: any) => f.slug === slug);
                if (!field) return null;
                return renderField(field);
              })}
            </div>
          </div>
        ))
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {fields.filter(field => isFieldVisible(field, formData)).map(field => renderField(field))}
        </div>
      )}

      {statuses.length > 0 && (
        <div>
          <label className="block text-sm font-medium mb-1.5">סטטוס</label>
          <div className="flex gap-2 flex-wrap">
            {statuses.map((s: any) => {
              const colorDef = STATUS_COLORS.find(c => c.key === s.color);
              return (
                <button key={s.slug} type="button" onClick={() => { setStatus(s.slug); if (errors._status) setErrors(e => { const next = { ...e }; delete next._status; return next; }); }}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${status === s.slug ? "border-white" : "border-border hover:border-primary/30"}`}
                  style={{ backgroundColor: status === s.slug ? `${colorDef?.hex}30` : "transparent", color: colorDef?.hex }}>
                  {s.name}
                </button>
              );
            })}
          </div>
          {errors._status && <p className="text-xs text-destructive mt-1">{errors._status}</p>}
        </div>
      )}

      {record && entityId && relations.filter((r: any) => r.relationType === "inline_child" && r.sourceEntityId === entityId).map((rel: any) => (
        <div key={rel.id}>
          <InlineChildGrid parentRecordId={record.id} childEntityId={rel.targetEntityId} relation={rel} />
        </div>
      ))}
    </div>
  );

  const MultiStepFooter = () => {
    if (!isMultiStep) return null;
    const isLastSection = activeSection === sections.length - 1;
    return (
      <div className="flex items-center justify-between mt-6 pt-4 border-t border-border">
        <button
          type="button"
          onClick={handlePrevSection}
          disabled={activeSection === 0}
          className="flex items-center gap-1.5 px-4 py-2.5 bg-muted rounded-xl font-medium hover:bg-muted/80 transition-colors disabled:opacity-40 disabled:pointer-events-none text-sm"
        >
          <ChevronRight className="w-4 h-4" />
          הקודם
        </button>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <AutoSaveIndicator />
          <span>{activeSection + 1} / {sections.length}</span>
        </div>
        {isLastSection ? (
          <button onClick={handleSubmit} disabled={isLoading}
            className="flex items-center gap-1.5 px-6 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 text-sm">
            {isLoading ? "שומר..." : <><Check className="w-4 h-4" />{record ? "עדכן" : "צור"}</>}
          </button>
        ) : (
          <button type="button" onClick={handleNextSection}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-colors text-sm">
            הבא
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
      </div>
    );
  };

  if (mode === "inline") {
    return (
      <div>
        {formContent}
        <div className="flex items-center gap-3 mt-6 pt-4 border-t border-border">
          <button onClick={handleSubmit} disabled={isLoading}
            className="flex-1 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-colors disabled:opacity-50">
            {isLoading ? "שומר..." : record ? "עדכן" : "צור"}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 bg-muted rounded-xl font-medium hover:bg-muted/80 transition-colors">ביטול</button>
        </div>
      </div>
    );
  }

  if (mode === "page") {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-card border border-border rounded-2xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold">{record ? `עריכת ${entityName}` : `${entityName} חדש`}</h2>
            <div className="flex items-center gap-2">
              <AutoSaveIndicator />
              <AIFormFill
                fields={fields}
                formData={formData}
                entityName={entityName}
                onApplySuggestions={(suggestions) => {
                  Object.entries(suggestions).forEach(([slug, val]) => setValue(slug, val));
                }}
              />
              <button onClick={onClose} className="p-1.5 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
            </div>
          </div>
          {formContent}
          {isMultiStep ? (
            <MultiStepFooter />
          ) : (
            <div className="flex items-center gap-3 mt-6 pt-4 border-t border-border">
              <button onClick={handleSubmit} disabled={isLoading}
                className="px-6 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-colors disabled:opacity-50">
                {isLoading ? "שומר..." : record ? "עדכן" : "צור"}
              </button>
              <button onClick={onClose} className="px-4 py-2.5 bg-muted rounded-xl font-medium hover:bg-muted/80 transition-colors">ביטול</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        className="bg-card border border-border rounded-2xl p-6 w-full max-w-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold">{record ? `עריכת ${entityName}` : `${entityName} חדש`}</h2>
          <div className="flex items-center gap-2">
            <AutoSaveIndicator />
            <AIFormFill
              fields={fields}
              formData={formData}
              entityName={entityName}
              onApplySuggestions={(suggestions) => {
                Object.entries(suggestions).forEach(([slug, val]) => setValue(slug, val));
              }}
            />
            <button onClick={onClose} className="p-1.5 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
          </div>
        </div>
        {formContent}
        {isMultiStep ? (
          <MultiStepFooter />
        ) : (
          <div className="flex items-center gap-3 mt-6 pt-4 border-t border-border">
            <button onClick={handleSubmit} disabled={isLoading}
              className="flex-1 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-colors disabled:opacity-50">
              {isLoading ? "שומר..." : record ? "עדכן" : "צור"}
            </button>
            <button onClick={onClose} className="px-4 py-2.5 bg-muted rounded-xl font-medium hover:bg-muted/80 transition-colors">ביטול</button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

function RelationPicker({ field, value, onChange }: { field: any; value: any; onChange: (val: any) => void }) {
  const cls = "w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50";
  const settings = field.settings || {};
  const relatedEntityId = settings.relatedEntityId || field.relatedEntityId;
  const isMulti = field.fieldType === "relation_list";
  const [searchText, setSearchText] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const selectedIds: number[] = isMulti
    ? (Array.isArray(value) ? value.map(Number).filter(n => !isNaN(n)) : (value ? [Number(value)].filter(n => !isNaN(n)) : []))
    : (value ? [Number(value)].filter(n => !isNaN(n)) : []);
  const { data: relatedRecords = [] } = useQuery({
    queryKey: ["relation-picker", relatedEntityId, searchText],
    queryFn: async () => {
      if (!relatedEntityId) return [];
      const params = new URLSearchParams({ limit: "20" });
      if (searchText) params.set("search", searchText);
      const r = await authFetch(`${API}/platform/entities/${relatedEntityId}/records?${params}`);
      const data = await r.json();
      return data.records || [];
    },
    enabled: !!relatedEntityId && isOpen,
  });
  const { data: selectedRecords = [] } = useQuery({
    queryKey: ["relation-selected-multi", relatedEntityId, JSON.stringify(selectedIds)],
    queryFn: async () => {
      if (!relatedEntityId || selectedIds.length === 0) return [];
      const results = await Promise.all(selectedIds.map(async (id) => {
        try { const r = await authFetch(`${API}/platform/entities/${relatedEntityId}/records/${id}`); if (!r.ok) return null; return r.json(); } catch { return null; }
      }));
      return results.filter(Boolean);
    },
    enabled: !!relatedEntityId && selectedIds.length > 0,
  });
  const getRecordLabel = (rec: any) => { const d = rec?.data || {}; return d[Object.keys(d)[0]] || `#${rec?.id}`; };
  if (!relatedEntityId) return <div className={`${cls} text-muted-foreground`}>לא הוגדרה ישות קשורה</div>;
  const handleSelect = (recId: number) => {
    if (isMulti) { onChange(selectedIds.includes(recId) ? selectedIds.filter(id => id !== recId) : [...selectedIds, recId]); }
    else { onChange(recId); setIsOpen(false); setSearchText(""); }
  };
  const handleRemove = (recId: number) => { if (isMulti) onChange(selectedIds.filter(id => id !== recId)); else onChange(""); };
  return (
    <div className="relative">
      {isMulti && selectedIds.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {selectedRecords.map((rec: any) => (
            <span key={rec.id} className="flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary rounded-md text-xs">
              {getRecordLabel(rec)}
              <button type="button" onClick={() => handleRemove(rec.id)}><X className="w-3 h-3" /></button>
            </span>
          ))}
        </div>
      )}
      <div className={`${cls} cursor-pointer flex items-center justify-between`} onClick={() => setIsOpen(!isOpen)}>
        <span className={!isMulti && selectedIds.length > 0 ? "" : "text-muted-foreground"}>
          {isMulti ? (selectedIds.length > 0 ? `${selectedIds.length} נבחרו` : "בחר רשומות...") : (selectedRecords.length > 0 ? getRecordLabel(selectedRecords[0]) : "בחר רשומה...")}
        </span>
        <ChevronDown className="w-4 h-4 text-muted-foreground" />
      </div>
      {isOpen && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-lg max-h-60 overflow-hidden">
          <div className="p-2 border-b border-border">
            <input type="text" value={searchText} onChange={e => setSearchText(e.target.value)} placeholder="חיפוש..." autoFocus
              className="w-full px-2 py-1.5 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary/50" />
          </div>
          <div className="max-h-44 overflow-y-auto">
            {relatedRecords.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-3">לא נמצאו רשומות</p>
            ) : relatedRecords.map((rec: any) => {
              const isSelected = selectedIds.includes(rec.id);
              return (
                <button key={rec.id} type="button" onClick={() => handleSelect(rec.id)}
                  className={`w-full text-right px-3 py-2 text-sm hover:bg-muted/50 flex items-center gap-2 ${isSelected ? "bg-primary/10" : ""}`}>
                  {isMulti && <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${isSelected ? "bg-primary border-primary" : "border-border"}`}>
                    {isSelected && <Check className="w-3 h-3 text-primary-foreground" />}
                  </span>}
                  <span className="text-muted-foreground text-xs">#{rec.id}</span>
                  <span className="truncate">{getRecordLabel(rec)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function UserReferencePicker({ value, onChange, placeholder }: { value: any; onChange: (val: any) => void; placeholder?: string }) {
  const [search, setSearch] = useState(typeof value === "object" ? (value?.name || value?.email || "") : (value || ""));
  const [open, setOpen] = useState(false);
  const { data: users } = useQuery({
    queryKey: ["platform-users-search", search],
    queryFn: () => authFetch(`/api/platform/users?search=${encodeURIComponent(search)}&limit=10`).then(r => r.ok ? r.json() : []),
    enabled: open && search.length >= 1,
  });
  return (
    <div className="relative">
      <input type="text" value={search} onChange={e => { setSearch(e.target.value); setOpen(true); onChange(e.target.value); }}
        onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 200)}
        placeholder={placeholder} className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
      {open && Array.isArray(users) && users.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-lg max-h-40 overflow-y-auto">
          {users.map((u: any) => (
            <button key={u.id} type="button" className="w-full text-right px-3 py-2 hover:bg-muted text-sm" onClick={() => {
              setSearch(u.name || u.email || u.id); onChange({ id: u.id, name: u.name, email: u.email }); setOpen(false);
            }}>
              <span className="font-medium">{u.name || u.email}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function FileUploadField({ field, value, onChange }: { field: any; value: any; onChange: (val: any) => void }) {
  const cls = "w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm";
  const isImage = field.fieldType === "image";
  const currentFiles = Array.isArray(value) ? value : (value ? [value] : []);
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    const reader = new FileReader();
    reader.onload = () => {
      const fileData = { name: file.name, size: file.size, type: file.type, dataUrl: reader.result as string, uploadedAt: new Date().toISOString() };
      if (isImage) onChange(fileData); else onChange([...currentFiles, fileData]);
    };
    reader.readAsDataURL(file);
  };
  return (
    <div className="space-y-2">
      {isImage && value?.dataUrl && (
        <div className="relative w-24 h-24 rounded-xl border border-border overflow-hidden bg-muted">
          <img src={value.dataUrl} alt="" className="w-full h-full object-cover" />
          <button type="button" onClick={() => onChange(null)} className="absolute top-1 right-1 p-0.5 bg-black/60 rounded-full"><X className="w-3 h-3 text-foreground" /></button>
        </div>
      )}
      <label className={`${cls} cursor-pointer flex items-center gap-2 justify-center border-dashed hover:border-primary/50 transition-colors`}>
        <input type="file" className="hidden" accept={isImage ? "image/*" : undefined} onChange={handleFileSelect} />
        <span className="text-muted-foreground">{isImage ? "העלה תמונה" : "העלה קובץ"}</span>
      </label>
    </div>
  );
}

export function renderFormField(field: any, value: any, onChange: (val: any) => void): React.ReactNode {
  const cls = "w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50";
  const type = field.fieldType;

  if (type === "long_text" || type === "textarea") return <textarea value={value || ""} onChange={e => onChange(e.target.value)} rows={3} placeholder={field.placeholder} className={`${cls} resize-none`} />;
  if (type === "rich_text") return <RichTextField value={value} onChange={onChange} placeholder={field.placeholder || "טקסט מעוצב..."} />;
  if (type === "number" || type === "decimal" || type === "currency" || type === "percent") {
    return (
      <div className="relative">
        <input type="number" value={value ?? ""} onChange={e => onChange(e.target.value ? Number(e.target.value) : "")}
          placeholder={field.placeholder} step={type === "decimal" || type === "currency" ? "0.01" : "1"} dir="ltr"
          className={`${cls} ${type === "currency" ? "pr-8" : ""}`} />
        {type === "currency" && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">₪</span>}
        {type === "percent" && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>}
      </div>
    );
  }
  if (type === "date") return <input type="date" value={value || ""} onChange={e => onChange(e.target.value)} className={cls} dir="ltr" />;
  if (type === "datetime") return <input type="datetime-local" value={value || ""} onChange={e => onChange(e.target.value)} className={cls} dir="ltr" />;
  if (type === "time") return <input type="time" value={value || ""} onChange={e => onChange(e.target.value)} className={cls} dir="ltr" />;
  if (type === "boolean" || type === "checkbox") {
    return (
      <label className="flex items-center gap-2 cursor-pointer py-2">
        <input type="checkbox" checked={!!value} onChange={e => onChange(e.target.checked)} className="w-5 h-5 rounded border-border text-primary focus:ring-primary" />
        <span className="text-sm">{value ? "כן" : "לא"}</span>
      </label>
    );
  }
  if (type === "radio") {
    const options = Array.isArray(field.options) ? field.options : [];
    return (
      <div className="flex flex-wrap gap-2 py-1">
        {options.map((opt: any) => {
          const optValue = typeof opt === "string" ? opt : opt.value;
          const optLabel = typeof opt === "string" ? opt : opt.label;
          return (
            <label key={optValue} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border cursor-pointer text-sm transition-colors ${value === optValue ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/30"}`}>
              <input type="radio" name={field.slug} value={optValue} checked={value === optValue} onChange={() => onChange(optValue)} className="hidden" />
              {optLabel}
            </label>
          );
        })}
      </div>
    );
  }
  if (type === "single_select" || type === "status" || type === "category") {
    const options = Array.isArray(field.options) ? field.options : [];
    return (
      <select value={value || ""} onChange={e => onChange(e.target.value)} className={cls}>
        <option value="">בחר...</option>
        {options.map((opt: any) => {
          const optValue = typeof opt === "string" ? opt : opt.value;
          const optLabel = typeof opt === "string" ? opt : opt.label;
          return <option key={optValue} value={optValue}>{optLabel}</option>;
        })}
      </select>
    );
  }
  if (type === "multi_select" || type === "tags") {
    const options = Array.isArray(field.options) ? field.options : [];
    const selected = Array.isArray(value) ? value : [];
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap gap-1.5 min-h-[28px]">
          {selected.map((v: string, i: number) => (
            <span key={i} className="flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary rounded-md text-xs">
              {v}
              <button type="button" onClick={() => onChange(selected.filter((_: any, j: number) => j !== i))}><X className="w-3 h-3" /></button>
            </span>
          ))}
        </div>
        {type === "tags" ? (
          <input type="text" placeholder="הקלד תגית..." className={cls}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); const v = (e.target as HTMLInputElement).value.trim(); if (v && !selected.includes(v)) { onChange([...selected, v]); (e.target as HTMLInputElement).value = ""; } } }} />
        ) : (
          <select onChange={e => { if (e.target.value && !selected.includes(e.target.value)) onChange([...selected, e.target.value]); e.target.value = ""; }} className={cls}>
            <option value="">הוסף...</option>
            {options.filter((opt: any) => !selected.includes(typeof opt === "string" ? opt : opt.value)).map((opt: any) => {
              const optValue = typeof opt === "string" ? opt : opt.value;
              const optLabel = typeof opt === "string" ? opt : (opt.label || opt.value);
              return <option key={optValue} value={optValue}>{optLabel}</option>;
            })}
          </select>
        )}
      </div>
    );
  }
  if (type === "relation" || type === "relation_list") return <RelationPicker field={field} value={value} onChange={onChange} />;
  if (type === "file" || type === "image") return <FileUploadField field={field} value={value} onChange={onChange} />;
  if (type === "email") return <input type="email" value={value || ""} onChange={e => onChange(e.target.value)} placeholder={field.placeholder || "email@example.com"} dir="ltr" className={cls} />;
  if (type === "phone") return <input type="tel" value={value || ""} onChange={e => onChange(e.target.value)} placeholder={field.placeholder || "050-000-0000"} dir="ltr" className={cls} />;
  if (type === "url") return <input type="url" value={value || ""} onChange={e => onChange(e.target.value)} placeholder={field.placeholder || "https://"} dir="ltr" className={cls} />;
  if (type === "address") {
    const addr = typeof value === "object" && value ? value : { street: "", city: "", zip: "", country: "" };
    return (
      <div className="space-y-2">
        <input type="text" value={addr.street || ""} onChange={e => onChange({ ...addr, street: e.target.value })} placeholder="רחוב" className={cls} />
        <div className="grid grid-cols-2 gap-2">
          <input type="text" value={addr.city || ""} onChange={e => onChange({ ...addr, city: e.target.value })} placeholder="עיר" className={cls} />
          <input type="text" value={addr.zip || ""} onChange={e => onChange({ ...addr, zip: e.target.value })} placeholder="מיקוד" dir="ltr" className={cls} />
        </div>
      </div>
    );
  }
  if (type === "json") return <JsonEditor value={value} onChange={onChange} />;
  if (type === "signature") return <SignatureField value={value} onChange={onChange} />;
  if (type === "barcode") return (
    <div className="space-y-2">
      <input type="text" value={value || ""} onChange={e => onChange(e.target.value)} placeholder={field.placeholder || "ברקוד"} dir="ltr" className={cls} />
      {value && <BarcodeDisplay value={value} />}
    </div>
  );
  if (type === "qr") return (
    <div className="space-y-2">
      <input type="text" value={value || ""} onChange={e => onChange(e.target.value)} placeholder={field.placeholder || "QR"} dir="ltr" className={cls} />
      {value && <QRDisplay value={value} />}
    </div>
  );
  if (type === "color") return (
    <div className="flex items-center gap-2">
      <input type="color" value={value || "#000000"} onChange={e => onChange(e.target.value)} className="w-10 h-10 rounded-lg border border-border cursor-pointer" />
      <input type="text" value={value || ""} onChange={e => onChange(e.target.value)} placeholder="#000000" dir="ltr" className={cls} />
    </div>
  );
  if (type === "duration") {
    const mins = Number(value) || 0;
    const hours = Math.floor(mins / 60);
    const minutes = mins % 60;
    return (
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1">
          <input type="number" min={0} value={hours} onChange={e => { const h = parseInt(e.target.value) || 0; onChange(h * 60 + minutes); }} className={`w-20 ${cls}`} dir="ltr" />
          <span className="text-xs text-muted-foreground">שעות</span>
        </div>
        <div className="flex items-center gap-1">
          <input type="number" min={0} max={59} value={minutes} onChange={e => { const m = Math.min(59, parseInt(e.target.value) || 0); onChange(hours * 60 + m); }} className={`w-20 ${cls}`} dir="ltr" />
          <span className="text-xs text-muted-foreground">דקות</span>
        </div>
      </div>
    );
  }
  if (type === "user_reference") return <UserReferencePicker value={value} onChange={onChange} placeholder={field.placeholder || "בחר משתמש..."} />;
  if (type === "auto_number") return (
    <div className="px-3 py-2.5 bg-muted/50 border border-border rounded-xl text-sm text-muted-foreground">
      {value !== undefined && value !== null && value !== "" ? <span className="font-mono">{String(value)}</span> : <span>ייווצר אוטומטית</span>}
    </div>
  );
  if (type === "formula" || type === "computed") return (
    <div className="px-3 py-2.5 bg-purple-500/5 border border-purple-500/20 rounded-xl text-sm">
      {value !== undefined && value !== null && value !== "" ? (
        <span className="font-mono font-medium text-purple-400">{typeof value === "number" ? value.toLocaleString() : String(value)}</span>
      ) : <span className="text-muted-foreground">יחושב אוטומטית</span>}
    </div>
  );
  return <input type="text" value={value || ""} onChange={e => onChange(e.target.value)} placeholder={field.placeholder} className={cls} />;
}

export { isFieldVisible, computeFormulaFieldsClient };
