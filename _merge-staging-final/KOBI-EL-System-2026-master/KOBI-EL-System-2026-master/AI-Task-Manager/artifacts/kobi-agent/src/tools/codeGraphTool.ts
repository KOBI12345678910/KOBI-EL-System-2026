import { readFile, listFiles } from "./fileTool";
import { searchCode } from "./searchTool";

const WORKSPACE = process.env.WORKSPACE_DIR || "./workspace";

interface FileNode {
  path: string;
  imports: string[];
  exports: string[];
  functions: string[];
  classes: string[];
  lineCount: number;
  complexity: "low" | "medium" | "high";
}

interface DependencyEdge {
  from: string;
  to: string;
  type: "import" | "re-export";
}

let graph: Map<string, FileNode> = new Map();
let edges: DependencyEdge[] = [];

function parseImports(content: string): string[] {
  const imports: string[] = [];
  const importRegex = /(?:import|require)\s*\(?['"](\.\.?\/[^'"]+)['"]\)?/g;
  let match;
  while ((match = importRegex.exec(content)) !== null) {
    imports.push(match[1]);
  }
  return imports;
}

function parseExports(content: string): string[] {
  const exports: string[] = [];
  const exportRegex = /export\s+(?:async\s+)?(?:function|const|class|interface|type|enum)\s+(\w+)/g;
  let match;
  while ((match = exportRegex.exec(content)) !== null) {
    exports.push(match[1]);
  }
  return exports;
}

function parseFunctions(content: string): string[] {
  const fns: string[] = [];
  const fnRegex = /(?:async\s+)?function\s+(\w+)|(?:const|let)\s+(\w+)\s*=\s*(?:async\s+)?\(/g;
  let match;
  while ((match = fnRegex.exec(content)) !== null) {
    fns.push(match[1] || match[2]);
  }
  return fns;
}

function calcComplexity(content: string): "low" | "medium" | "high" {
  const lines = content.split("\n").length;
  const ifs = (content.match(/\bif\s*\(/g) || []).length;
  const loops = (content.match(/\b(for|while|do)\s*[({]/g) || []).length;
  const score = ifs + loops * 2;
  if (lines > 500 || score > 20) return "high";
  if (lines > 200 || score > 10) return "medium";
  return "low";
}

export async function buildCodeGraph(params: {
  path?: string;
}): Promise<{ success: boolean; output: string }> {
  console.log("\n🕸️ בונה גרף קוד...");
  const basePath = params.path || `${WORKSPACE}/src`;

  graph.clear();
  edges = [];

  const fileList = await listFiles({ path: basePath, recursive: true });
  if (!fileList.success || !fileList.output) return { success: false, output: "לא ניתן לסרוק קבצים" };

  const files = fileList.output.split("\n").filter(f =>
    (f.endsWith(".ts") || f.endsWith(".tsx")) && !f.includes("node_modules")
  );

  for (const file of files) {
    const content = await readFile({ path: file });
    if (!content.success || !content.output) continue;

    const imports = parseImports(content.output);
    const exports = parseExports(content.output);
    const functions = parseFunctions(content.output);

    const node: FileNode = {
      path: file,
      imports,
      exports,
      functions,
      classes: [],
      lineCount: content.output.split("\n").length,
      complexity: calcComplexity(content.output),
    };

    graph.set(file, node);

    for (const imp of imports) {
      edges.push({ from: file, to: imp, type: "import" });
    }
  }

  const highComplexity = Array.from(graph.values()).filter(n => n.complexity === "high");

  return {
    success: true,
    output: `🕸️ גרף קוד נבנה:\n  ${graph.size} קבצים, ${edges.length} תלויות\n  מורכבות גבוהה: ${highComplexity.length} קבצים${highComplexity.length > 0 ? "\n  " + highComplexity.map(n => `⚠️ ${n.path} (${n.lineCount} שורות)`).join("\n  ") : ""}`,
  };
}

export async function findDependents(params: {
  filePath: string;
}): Promise<{ success: boolean; output: string; dependents: string[] }> {
  if (graph.size === 0) await buildCodeGraph({});

  const dependents = edges
    .filter(e => e.to.includes(params.filePath.replace(/\.tsx?$/, "")))
    .map(e => e.from);

  return {
    success: true,
    output: dependents.length > 0
      ? `📌 ${params.filePath} — ${dependents.length} קבצים תלויים:\n${dependents.map(d => `  ← ${d}`).join("\n")}`
      : `${params.filePath} — אין קבצים תלויים`,
    dependents,
  };
}

export async function findDeadCode(params: {}): Promise<{ success: boolean; output: string; deadFiles: string[] }> {
  if (graph.size === 0) await buildCodeGraph({});

  const imported = new Set<string>();
  for (const e of edges) {
    imported.add(e.to);
  }

  const deadFiles: string[] = [];
  for (const [path, node] of graph) {
    if (path.includes("index.") || path.includes("main.") || path.includes("app.")) continue;
    const normalized = path.replace(/\.tsx?$/, "");
    const isImported = Array.from(imported).some(i => normalized.includes(i) || i.includes(normalized.split("/").pop()!.replace(/\.tsx?$/, "")));
    if (!isImported && node.exports.length > 0) {
      deadFiles.push(path);
    }
  }

  return {
    success: true,
    output: deadFiles.length > 0
      ? `🗑️ קוד מת — ${deadFiles.length} קבצים לא מיובאים:\n${deadFiles.map(f => `  💀 ${f}`).join("\n")}`
      : "לא נמצא קוד מת ✅",
    deadFiles,
  };
}

export async function getFileInfo(params: {
  filePath: string;
}): Promise<{ success: boolean; output: string }> {
  if (graph.size === 0) await buildCodeGraph({});

  const node = graph.get(params.filePath);
  if (!node) return { success: false, output: `קובץ לא נמצא בגרף: ${params.filePath}` };

  const dependents = edges.filter(e => e.to.includes(params.filePath.replace(/\.tsx?$/, ""))).map(e => e.from);
  const dependencies = edges.filter(e => e.from === params.filePath).map(e => e.to);

  const lines = [
    `📄 ${params.filePath}`,
    `שורות: ${node.lineCount} | מורכבות: ${node.complexity}`,
    `\nExports (${node.exports.length}): ${node.exports.join(", ")}`,
    `Functions (${node.functions.length}): ${node.functions.join(", ")}`,
    `\nתלוי ב (${dependencies.length}): ${dependencies.join(", ") || "אין"}`,
    `תלויים בו (${dependents.length}): ${dependents.join(", ") || "אין"}`,
  ];

  return { success: true, output: lines.join("\n") };
}

export async function getGraphStats(params: {}): Promise<{ success: boolean; output: string }> {
  if (graph.size === 0) return { success: true, output: "גרף ריק — הרץ build_code_graph קודם" };

  const totalLines = Array.from(graph.values()).reduce((s, n) => s + n.lineCount, 0);
  const complexity = { low: 0, medium: 0, high: 0 };
  for (const n of graph.values()) complexity[n.complexity]++;

  const totalExports = Array.from(graph.values()).reduce((s, n) => s + n.exports.length, 0);
  const totalFunctions = Array.from(graph.values()).reduce((s, n) => s + n.functions.length, 0);

  return {
    success: true,
    output: `🕸️ גרף קוד:\n  קבצים: ${graph.size}\n  שורות: ${totalLines.toLocaleString()}\n  תלויות: ${edges.length}\n  exports: ${totalExports}\n  functions: ${totalFunctions}\n  מורכבות: ${complexity.high} גבוהה, ${complexity.medium} בינונית, ${complexity.low} נמוכה`,
  };
}

export const CODE_GRAPH_TOOLS = [
  {
    name: "build_code_graph",
    description: "בניית גרף תלויות קוד — imports, exports, functions, מורכבות",
    input_schema: {
      type: "object" as const,
      properties: { path: { type: "string", description: "נתיב לסריקה (ברירת מחדל: src/)" } },
      required: [] as string[],
    },
  },
  {
    name: "find_dependents",
    description: "מציאת קבצים שתלויים בקובץ מסוים — impact analysis",
    input_schema: {
      type: "object" as const,
      properties: { filePath: { type: "string", description: "נתיב הקובץ" } },
      required: ["filePath"] as string[],
    },
  },
  {
    name: "find_dead_code",
    description: "זיהוי קוד מת — קבצים שלא מיובאים מאף מקום",
    input_schema: { type: "object" as const, properties: {}, required: [] as string[] },
  },
  {
    name: "get_file_info",
    description: "מידע מפורט על קובץ — exports, functions, תלויות, מורכבות",
    input_schema: {
      type: "object" as const,
      properties: { filePath: { type: "string" } },
      required: ["filePath"] as string[],
    },
  },
  {
    name: "get_graph_stats",
    description: "סטטיסטיקות גרף קוד — קבצים, שורות, תלויות, מורכבות",
    input_schema: { type: "object" as const, properties: {}, required: [] as string[] },
  },
];
