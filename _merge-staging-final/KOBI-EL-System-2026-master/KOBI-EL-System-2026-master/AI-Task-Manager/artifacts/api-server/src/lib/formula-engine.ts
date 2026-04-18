export interface FormulaContext {
  data: Record<string, any>;
  fields: Array<{ slug: string; fieldType: string; name: string }>;
}

export interface FormulaError {
  type: "parse" | "reference" | "runtime" | "circular";
  message: string;
  expression?: string;
}

export interface FormulaResult {
  value: any;
  error: FormulaError | null;
}

interface Token {
  type: "number" | "string" | "field_ref" | "ident" | "op" | "paren" | "comma" | "comparison";
  value?: any;
}

function tokenize(expression: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < expression.length) {
    const ch = expression[i];

    if (/\s/.test(ch)) { i++; continue; }

    if (ch === "{") {
      const end = expression.indexOf("}", i);
      if (end === -1) throw new ParseError("Unclosed field reference '{'");
      tokens.push({ type: "field_ref", value: expression.slice(i + 1, end) });
      i = end + 1;
      continue;
    }

    if (ch === '"' || ch === "'") {
      const quote = ch;
      let str = "";
      i++;
      while (i < expression.length && expression[i] !== quote) { str += expression[i]; i++; }
      if (i >= expression.length) throw new ParseError("Unclosed string literal");
      i++;
      tokens.push({ type: "string", value: str });
      continue;
    }

    if (ch === ">" || ch === "<" || ch === "!" || ch === "=") {
      let op = ch;
      if (i + 1 < expression.length && expression[i + 1] === "=") { op += "="; i++; }
      tokens.push({ type: "comparison", value: op });
      i++;
      continue;
    }

    if (/[+\-*/%^]/.test(ch)) { tokens.push({ type: "op", value: ch }); i++; continue; }
    if (ch === "(") { tokens.push({ type: "paren", value: "(" }); i++; continue; }
    if (ch === ")") { tokens.push({ type: "paren", value: ")" }); i++; continue; }
    if (ch === ",") { tokens.push({ type: "comma" }); i++; continue; }

    if (/[0-9.]/.test(ch)) {
      let num = "";
      while (i < expression.length && /[0-9.]/.test(expression[i])) { num += expression[i]; i++; }
      tokens.push({ type: "number", value: parseFloat(num) });
      continue;
    }

    if (/[a-zA-Z_\u0590-\u05FF]/.test(ch)) {
      let ident = "";
      while (i < expression.length && /[a-zA-Z0-9_\u0590-\u05FF.]/.test(expression[i])) { ident += expression[i]; i++; }
      tokens.push({ type: "ident", value: ident });
      continue;
    }

    throw new ParseError(`Unexpected character: '${ch}'`);
  }
  return tokens;
}

class ParseError extends Error {
  constructor(message: string) { super(message); this.name = "ParseError"; }
}

class RuntimeError extends Error {
  constructor(message: string) { super(message); this.name = "RuntimeError"; }
}

type ASTNode =
  | { kind: "number"; value: number }
  | { kind: "string"; value: string }
  | { kind: "field_ref"; slug: string }
  | { kind: "binary"; op: string; left: ASTNode; right: ASTNode }
  | { kind: "unary"; op: string; operand: ASTNode }
  | { kind: "call"; name: string; args: ASTNode[] }
  | { kind: "ident"; value: string };

class Parser {
  private tokens: Token[];
  private pos = 0;

  constructor(tokens: Token[]) { this.tokens = tokens; }

  private peek(): Token | null {
    return this.pos < this.tokens.length ? this.tokens[this.pos] : null;
  }

  private consume(): Token {
    if (this.pos >= this.tokens.length) throw new ParseError("Unexpected end of expression");
    return this.tokens[this.pos++];
  }

  parse(): ASTNode {
    const node = this.parseExpression();
    if (this.pos < this.tokens.length) {
      throw new ParseError(`Unexpected token: ${JSON.stringify(this.tokens[this.pos])}`);
    }
    return node;
  }

  private parseExpression(): ASTNode { return this.parseComparison(); }

  private parseComparison(): ASTNode {
    let left = this.parseAddSub();
    while (this.peek()?.type === "comparison") {
      const op = this.consume().value as string;
      const right = this.parseAddSub();
      left = { kind: "binary", op, left, right };
    }
    return left;
  }

  private parseAddSub(): ASTNode {
    let left = this.parseMulDiv();
    while (this.peek()?.type === "op" && (this.peek()!.value === "+" || this.peek()!.value === "-")) {
      const op = this.consume().value as string;
      const right = this.parseMulDiv();
      left = { kind: "binary", op, left, right };
    }
    return left;
  }

  private parseMulDiv(): ASTNode {
    let left = this.parsePower();
    while (this.peek()?.type === "op" && (this.peek()!.value === "*" || this.peek()!.value === "/" || this.peek()!.value === "%")) {
      const op = this.consume().value as string;
      const right = this.parsePower();
      left = { kind: "binary", op, left, right };
    }
    return left;
  }

  private parsePower(): ASTNode {
    let left = this.parseUnary();
    while (this.peek()?.type === "op" && this.peek()!.value === "^") {
      this.consume();
      const right = this.parseUnary();
      left = { kind: "binary", op: "^", left, right };
    }
    return left;
  }

  private parseUnary(): ASTNode {
    if (this.peek()?.type === "op" && this.peek()!.value === "-") {
      this.consume();
      const operand = this.parsePrimary();
      return { kind: "unary", op: "-", operand };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): ASTNode {
    const token = this.peek();
    if (!token) throw new ParseError("Unexpected end of expression");

    if (token.type === "number") { this.consume(); return { kind: "number", value: token.value }; }
    if (token.type === "string") { this.consume(); return { kind: "string", value: token.value }; }
    if (token.type === "field_ref") { this.consume(); return { kind: "field_ref", slug: token.value }; }

    if (token.type === "ident") {
      this.consume();
      const name = token.value;
      if (this.peek()?.type === "paren" && this.peek()!.value === "(") {
        this.consume();
        const args: ASTNode[] = [];
        if (this.peek()?.type !== "paren" || this.peek()!.value !== ")") {
          args.push(this.parseExpression());
          while (this.peek()?.type === "comma") { this.consume(); args.push(this.parseExpression()); }
        }
        const closeParen = this.consume();
        if (closeParen.type !== "paren" || closeParen.value !== ")") throw new ParseError("Expected ')'");
        return { kind: "call", name: name.toUpperCase(), args };
      }
      return { kind: "ident", value: name };
    }

    if (token.type === "paren" && token.value === "(") {
      this.consume();
      const expr = this.parseExpression();
      const closeParen = this.consume();
      if (closeParen.type !== "paren" || closeParen.value !== ")") throw new ParseError("Expected ')'");
      return expr;
    }

    throw new ParseError(`Unexpected token: ${JSON.stringify(token)}`);
  }
}

function evaluateAST(node: ASTNode, data: Record<string, any>): any {
  switch (node.kind) {
    case "number": return node.value;
    case "string": return node.value;

    case "field_ref": {
      const val = data[node.slug];
      if (val === undefined || val === null || val === "") return 0;
      const num = Number(val);
      return isNaN(num) ? val : num;
    }

    case "ident": {
      const val = data[node.value];
      if (val === undefined || val === null || val === "") return 0;
      const num = Number(val);
      return isNaN(num) ? val : num;
    }

    case "unary": {
      const operand = evaluateAST(node.operand, data);
      if (node.op === "-") return -toNumber(operand);
      return operand;
    }

    case "binary": {
      const left = evaluateAST(node.left, data);
      const right = evaluateAST(node.right, data);
      switch (node.op) {
        case "+":
          if (typeof left === "string" || typeof right === "string") return String(left) + String(right);
          return toNumber(left) + toNumber(right);
        case "-": return toNumber(left) - toNumber(right);
        case "*": return toNumber(left) * toNumber(right);
        case "/": { const d = toNumber(right); if (d === 0) throw new RuntimeError("Division by zero"); return toNumber(left) / d; }
        case "%": { const m = toNumber(right); if (m === 0) throw new RuntimeError("Modulo by zero"); return toNumber(left) % m; }
        case "^": return Math.pow(toNumber(left), toNumber(right));
        case ">": return toNumber(left) > toNumber(right) ? 1 : 0;
        case "<": return toNumber(left) < toNumber(right) ? 1 : 0;
        case ">=": return toNumber(left) >= toNumber(right) ? 1 : 0;
        case "<=": return toNumber(left) <= toNumber(right) ? 1 : 0;
        case "==": case "=": return left == right ? 1 : 0;
        case "!=": return left != right ? 1 : 0;
        default: throw new RuntimeError(`Unknown operator: ${node.op}`);
      }
    }

    case "call": {
      const args = node.args.map(a => evaluateAST(a, data));
      switch (node.name) {
        case "SUM": return args.reduce((s, v) => s + toNumber(v), 0);
        case "AVG": return args.length === 0 ? 0 : args.reduce((s, v) => s + toNumber(v), 0) / args.length;
        case "MIN": return Math.min(...args.map(toNumber));
        case "MAX": return Math.max(...args.map(toNumber));
        case "IF": {
          if (args.length < 2) throw new RuntimeError("IF requires at least 2 arguments: IF(condition, trueValue, [falseValue])");
          const isTruthy = typeof args[0] === "number" ? args[0] !== 0 : !!args[0];
          return isTruthy ? args[1] : (args.length > 2 ? args[2] : 0);
        }
        case "ROUND": {
          const val = toNumber(args[0]);
          const dec = args.length > 1 ? toNumber(args[1]) : 0;
          const factor = Math.pow(10, dec);
          return Math.round(val * factor) / factor;
        }
        case "ABS": return Math.abs(toNumber(args[0]));
        case "CEIL": return Math.ceil(toNumber(args[0]));
        case "FLOOR": return Math.floor(toNumber(args[0]));
        case "SQRT": return Math.sqrt(toNumber(args[0]));
        case "POW": return Math.pow(toNumber(args[0]), toNumber(args[1] ?? 2));
        case "CONCAT": return args.map(a => String(a)).join("");
        case "UPPER": return String(args[0]).toUpperCase();
        case "LOWER": return String(args[0]).toLowerCase();
        default: {
          const subTableResult = evaluateSubTableFunction(node.name, node.args, data);
          if (subTableResult !== undefined) return subTableResult;
          throw new RuntimeError(`Unknown function: ${node.name}`);
        }
      }
    }

    default:
      throw new RuntimeError("Unknown node kind");
  }
}

function evaluateSubTableFunction(funcName: string, argNodes: ASTNode[], data: Record<string, any>): number | undefined {
  if (argNodes.length !== 1) return undefined;
  const arg = argNodes[0];
  if (arg.kind !== "ident" || !arg.value.includes(".")) return undefined;

  const [tableSlug, fieldSlug] = arg.value.split(".", 2);
  const subTableData = data[tableSlug];
  if (!Array.isArray(subTableData)) return 0;

  const values = subTableData.map((row: any) => Number(row[fieldSlug] ?? 0)).filter((n: number) => !isNaN(n));

  const aggFunctions: Record<string, (arr: number[]) => number> = {
    SUM: (arr) => arr.reduce((a, b) => a + b, 0),
    AVG: (arr) => arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length,
    COUNT: (arr) => arr.length,
    MIN: (arr) => arr.length === 0 ? 0 : Math.min(...arr),
    MAX: (arr) => arr.length === 0 ? 0 : Math.max(...arr),
  };

  const fn = aggFunctions[funcName];
  if (!fn) return undefined;
  return fn(values);
}

function toNumber(val: any): number {
  if (typeof val === "number") return isNaN(val) ? 0 : val;
  if (typeof val === "boolean") return val ? 1 : 0;
  if (typeof val === "string") { const n = Number(val); return isNaN(n) ? 0 : n; }
  return 0;
}

function collectAllRefs(node: ASTNode): Set<string> {
  const refs = new Set<string>();
  function walk(n: ASTNode) {
    if (n.kind === "field_ref") refs.add(n.slug);
    if (n.kind === "ident" && !n.value.includes(".")) refs.add(n.value);
    if (n.kind === "binary") { walk(n.left); walk(n.right); }
    if (n.kind === "unary") walk(n.operand);
    if (n.kind === "call") n.args.forEach(walk);
  }
  walk(node);
  return refs;
}

function parseExpression(expression: string): ASTNode {
  const tokens = tokenize(expression);
  return new Parser(tokens).parse();
}

export function evaluateFormula(expression: string, context: FormulaContext): any {
  if (!expression || !expression.trim()) return null;
  const result = evaluateFormulaWithError(expression, context);
  return result.error ? null : result.value;
}

export function evaluateFormulaWithError(expression: string, context: FormulaContext): FormulaResult {
  if (!expression || !expression.trim()) {
    return { value: null, error: { type: "parse", message: "Empty expression" } };
  }

  try {
    const ast = parseExpression(expression);
    const result = evaluateAST(ast, context.data);

    if (typeof result === "number") {
      if (!isFinite(result)) {
        return { value: null, error: { type: "runtime", message: "Result is infinite", expression } };
      }
      return { value: Math.round(result * 1e10) / 1e10, error: null };
    }

    return { value: result, error: null };
  } catch (err: any) {
    const errorType = err instanceof RuntimeError ? "runtime" : "parse";
    return { value: null, error: { type: errorType, message: err.message || "Invalid expression", expression } };
  }
}

export function validateFormulaExpression(
  expression: string,
  availableFields: Array<{ slug: string; fieldType: string }>,
  currentFieldSlug?: string
): FormulaError | null {
  if (!expression || !expression.trim()) {
    return { type: "parse", message: "Expression cannot be empty" };
  }

  try {
    const ast = parseExpression(expression);
    const referencedSlugs = collectAllRefs(ast);
    const availableSlugs = new Set(availableFields.map(f => f.slug));

    if (currentFieldSlug && referencedSlugs.has(currentFieldSlug)) {
      return { type: "circular", message: `Formula cannot reference itself (${currentFieldSlug})` };
    }

    for (const slug of referencedSlugs) {
      if (!availableSlugs.has(slug)) {
        return { type: "reference", message: `Unknown field: {${slug}}` };
      }
    }

    const testData: Record<string, any> = {};
    availableFields.forEach(f => { testData[f.slug] = 1; });
    evaluateAST(ast, testData);

    return null;
  } catch (err: any) {
    const errorType = err instanceof RuntimeError ? "runtime" : "parse";
    return { type: errorType, message: err.message || "Invalid expression" };
  }
}

export function computeFormulaFields(
  data: Record<string, any>,
  fields: Array<{ slug: string; fieldType: string; formulaExpression?: string | null; isCalculated?: boolean }>
): Record<string, any> {
  const result = { ...data };
  const formulaFields = fields.filter(
    (f) => (f.fieldType === "formula" || f.fieldType === "computed" || f.isCalculated) && f.formulaExpression
  );

  if (formulaFields.length === 0) return result;

  const formulaSlugs = new Set(formulaFields.map(f => f.slug));
  const depGraph = new Map<string, Set<string>>();
  const astMap = new Map<string, ASTNode>();

  for (const field of formulaFields) {
    try {
      const ast = parseExpression(field.formulaExpression!);
      astMap.set(field.slug, ast);
      const refs = collectAllRefs(ast);
      const deps = new Set<string>();
      for (const ref of refs) {
        if (formulaSlugs.has(ref)) deps.add(ref);
      }
      depGraph.set(field.slug, deps);
    } catch (err: any) {
      result[`__formula_error_${field.slug}`] = err.message || "Parse error";
    }
  }

  const sorted: string[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const inCycle = new Set<string>();

  function visit(slug: string) {
    if (visited.has(slug)) return;
    if (visiting.has(slug)) {
      inCycle.add(slug);
      return;
    }
    visiting.add(slug);
    const deps = depGraph.get(slug);
    if (deps) {
      for (const dep of deps) {
        visit(dep);
        if (inCycle.has(dep)) inCycle.add(slug);
      }
    }
    visiting.delete(slug);
    visited.add(slug);
    sorted.push(slug);
  }

  for (const field of formulaFields) {
    if (astMap.has(field.slug)) visit(field.slug);
  }

  for (const slug of sorted) {
    if (inCycle.has(slug)) {
      result[`__formula_error_${slug}`] = "Circular reference detected";
      continue;
    }

    const ast = astMap.get(slug);
    if (!ast) continue;

    try {
      const val = evaluateAST(ast, result);
      if (typeof val === "number") {
        if (!isFinite(val)) {
          result[`__formula_error_${slug}`] = "Result is infinite";
          continue;
        }
        result[slug] = Math.round(val * 1e10) / 1e10;
      } else {
        result[slug] = val;
      }
    } catch (err: any) {
      result[`__formula_error_${slug}`] = err.message || "Calculation error";
    }
  }

  return result;
}

export function computeSubTableAggregates(
  data: Record<string, any>,
  fields: Array<{ slug: string; fieldType: string; formulaExpression?: string | null; settings?: any }>
): Record<string, any> {
  return computeFormulaFields(data, fields);
}
