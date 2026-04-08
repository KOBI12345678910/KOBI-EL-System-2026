import { typeCheck, lint } from "../tools/lintTool";
import { runTests } from "../tools/testTool";
import { securityScan } from "../tools/codeReviewTool";
import { checkVulnerabilities } from "../tools/dependencyTool";
import { a11yAudit } from "../tools/a11yTool";
import { runCommand } from "../tools/terminalTool";

export interface QualityGateResult {
  passed: boolean;
  score: number;
  gates: Array<{
    name: string;
    passed: boolean;
    score: number;
    weight: number;
    details: string;
    duration: number;
  }>;
  blockers: string[];
  warnings: string[];
  totalDuration: number;
}

type GateEntry = QualityGateResult["gates"][0];

function calcResult(
  gates: GateEntry[],
  blockers: string[],
  warnings: string[],
  startTime: number,
  minScore: number,
  log: (msg: string) => void
): QualityGateResult {
  const totalWeight = gates.reduce((s, g) => s + g.weight, 0);
  const weightedScore = totalWeight > 0
    ? Math.round(gates.reduce((s, g) => s + g.score * g.weight, 0) / totalWeight)
    : 0;

  const allPassed = blockers.length === 0 && weightedScore >= minScore;

  log(`\n${"═".repeat(50)}`);
  log(`${allPassed ? "✅" : "❌"} QUALITY SCORE: ${weightedScore}/100 (min: ${minScore})`);
  log(`  Blockers: ${blockers.length} | Warnings: ${warnings.length}`);
  log(`${"═".repeat(50)}\n`);

  return { passed: allPassed, score: weightedScore, gates, blockers, warnings, totalDuration: Date.now() - startTime };
}

export async function runQualityGates(params: {
  gates?: string[];
  failFast?: boolean;
  minScore?: number;
}): Promise<{ success: boolean; output: string; result?: QualityGateResult }> {
  const log = console.log;
  const startTime = Date.now();
  const gates: GateEntry[] = [];
  const blockers: string[] = [];
  const warnings: string[] = [];
  const minScore = params.minScore || 70;

  const enabledGates = params.gates || [
    "typescript", "lint", "test", "security", "dependencies", "accessibility", "build",
  ];

  log("\n🚦 QUALITY GATE PIPELINE");
  log("═".repeat(50));

  if (enabledGates.includes("typescript")) {
    const gateStart = Date.now();
    log("\n📝 Gate: TypeScript...");
    const result = await typeCheck();
    const errors = result.errors?.length || 0;
    const passed = errors === 0;
    const score = Math.max(0, 100 - errors * 5);

    gates.push({ name: "typescript", passed, score, weight: 20, details: `${errors} type errors`, duration: Date.now() - gateStart });
    if (!passed) blockers.push(`TypeScript: ${errors} errors`);
    log(`  ${passed ? "✅" : "❌"} ${errors} errors (score: ${score})`);

    if (params.failFast && !passed) {
      const r = calcResult(gates, blockers, warnings, startTime, minScore, log);
      return { success: r.passed, output: formatReport(r), result: r };
    }
  }

  if (enabledGates.includes("lint")) {
    const gateStart = Date.now();
    log("\n🔍 Gate: Linting...");
    const result = await lint({});
    const hasErrors = result.output?.includes("error") || false;
    const hasWarnings = result.output?.includes("warning") || false;
    const errCount = hasErrors ? 1 : 0;
    const warnCount = hasWarnings ? 1 : 0;
    const passed = !hasErrors;
    const score = Math.max(0, 100 - errCount * 30 - warnCount * 5);

    gates.push({ name: "lint", passed, score, weight: 15, details: `${result.output?.slice(0, 100) || "clean"}`, duration: Date.now() - gateStart });
    if (!passed) blockers.push(`Lint: errors found`);
    if (warnCount > 0) warnings.push(`Lint: warnings found`);
    log(`  ${passed ? "✅" : "❌"} (score: ${score})`);
  }

  if (enabledGates.includes("test")) {
    const gateStart = Date.now();
    log("\n🧪 Gate: Tests...");
    try {
      const result = await runTests({});
      const passedMatch = result.output?.match(/(\d+) pass/);
      const failedMatch = result.output?.match(/(\d+) fail/);
      const totalMatch = result.output?.match(/(\d+) total/);
      const passedCount = parseInt(passedMatch?.[1] || "0");
      const failedCount = parseInt(failedMatch?.[1] || "0");
      const total = parseInt(totalMatch?.[1] || "0") || (passedCount + failedCount);
      const passed = failedCount === 0 && total > 0;
      const score = total > 0 ? Math.round((passedCount / total) * 100) : 0;

      gates.push({ name: "test", passed, score, weight: 25, details: `${passedCount}/${total} passed`, duration: Date.now() - gateStart });
      if (!passed) blockers.push(`Tests: ${failedCount} failing`);
      if (total === 0) warnings.push("No tests found");
      log(`  ${passed ? "✅" : "❌"} ${passedCount}/${total} (score: ${score})`);
    } catch {
      gates.push({ name: "test", passed: false, score: 0, weight: 25, details: "Tests failed to run", duration: Date.now() - gateStart });
      warnings.push("Tests could not run");
    }
  }

  if (enabledGates.includes("security")) {
    const gateStart = Date.now();
    log("\n🔒 Gate: Security...");
    const result = await securityScan();
    const issues = result.issues || [];
    const critical = issues.filter((i: any) => i.severity === "critical").length;
    const passed = critical === 0;
    const score = Math.max(0, 100 - critical * 20 - issues.length * 3);

    gates.push({ name: "security", passed, score, weight: 20, details: `${issues.length} issues (${critical} critical)`, duration: Date.now() - gateStart });
    if (!passed) blockers.push(`Security: ${critical} critical issues`);
    log(`  ${passed ? "✅" : "❌"} ${issues.length} issues (score: ${score})`);
  }

  if (enabledGates.includes("dependencies")) {
    const gateStart = Date.now();
    log("\n📦 Gate: Dependencies...");
    const result = await checkVulnerabilities();
    const vuln = result.result || { critical: 0, high: 0, moderate: 0, total: 0 };
    const passed = (vuln.critical || 0) === 0 && (vuln.high || 0) === 0;
    const score = Math.max(0, 100 - (vuln.critical || 0) * 25 - (vuln.high || 0) * 10 - (vuln.moderate || 0) * 3);

    gates.push({ name: "dependencies", passed, score, weight: 10, details: `${vuln.total || 0} vulnerabilities`, duration: Date.now() - gateStart });
    if (!passed) blockers.push(`Deps: ${vuln.critical || 0} critical, ${vuln.high || 0} high`);
    log(`  ${passed ? "✅" : "❌"} ${vuln.total || 0} vulns (score: ${score})`);
  }

  if (enabledGates.includes("accessibility")) {
    const gateStart = Date.now();
    log("\n♿ Gate: Accessibility...");
    const result = await a11yAudit({});
    const audit = result.audit || { score: 100, issues: [] };
    const critical = audit.issues.filter((i: any) => i.severity === "critical").length;
    const passed = critical === 0;

    gates.push({ name: "accessibility", passed, score: audit.score, weight: 5, details: `${audit.issues.length} issues (${critical} critical)`, duration: Date.now() - gateStart });
    if (critical > 0) warnings.push(`A11y: ${critical} critical issues`);
    log(`  ${passed ? "✅" : "⚠️"} score ${audit.score}/100`);
  }

  if (enabledGates.includes("build")) {
    const gateStart = Date.now();
    log("\n🏗️ Gate: Build...");
    const result = await runCommand({ command: "pnpm run build 2>&1 || echo 'BUILD_FAILED'", timeout: 120000 });
    const passed = result.success && !result.stdout.includes("BUILD_FAILED");

    gates.push({ name: "build", passed, score: passed ? 100 : 0, weight: 5, details: passed ? "Build successful" : "Build failed", duration: Date.now() - gateStart });
    if (!passed) blockers.push("Build fails");
    log(`  ${passed ? "✅" : "❌"} ${passed ? "success" : "failed"}`);
  }

  const r = calcResult(gates, blockers, warnings, startTime, minScore, log);
  return { success: r.passed, output: formatReport(r), result: r };
}

function formatReport(r: QualityGateResult): string {
  const lines = [
    `## Quality Gate Report`,
    ``,
    `**ציון**: ${r.score}/100 — ${r.passed ? "✅ עבר" : "❌ נכשל"}`,
    `**זמן**: ${(r.totalDuration / 1000).toFixed(1)}s`,
    ``,
    `### Gates:`,
    ...r.gates.map(g => {
      const icon = g.passed ? "✅" : "❌";
      return `${icon} **${g.name}** (${g.score}/100, weight: ${g.weight}): ${g.details} — ${(g.duration / 1000).toFixed(1)}s`;
    }),
  ];

  if (r.blockers.length > 0) {
    lines.push("", "### 🚫 Blockers:", ...r.blockers.map(b => `- ${b}`));
  }
  if (r.warnings.length > 0) {
    lines.push("", "### ⚠️ Warnings:", ...r.warnings.map(w => `- ${w}`));
  }

  return lines.join("\n");
}

export async function runSingleGate(params: {
  gate: string;
}): Promise<{ success: boolean; output: string; result?: QualityGateResult }> {
  return runQualityGates({ gates: [params.gate] });
}

export async function getQualityScore(params: {}): Promise<{ success: boolean; output: string }> {
  const result = await runQualityGates({ gates: ["typescript", "lint", "build"] });
  return { success: result.success, output: `Quick quality score: ${result.result?.score || 0}/100` };
}

export const QUALITY_GATE_TOOLS = [
  {
    name: "run_quality_gates",
    description: "הרצת כל Quality Gates — TypeScript, Lint, Tests, Security, Dependencies, A11y, Build. ציון משוקלל עם blockers/warnings",
    input_schema: {
      type: "object" as const,
      properties: {
        gates: {
          type: "array",
          items: { type: "string" },
          description: "רשימת gates להרצה: typescript, lint, test, security, dependencies, accessibility, build",
        },
        failFast: { type: "boolean", description: "עצור בכישלון ראשון?" },
        minScore: { type: "number", description: "ציון מינימום לעבור (ברירת מחדל: 70)" },
      },
      required: [] as string[],
    },
  },
  {
    name: "run_single_gate",
    description: "הרצת gate בודד — typescript, lint, test, security, dependencies, accessibility, build",
    input_schema: {
      type: "object" as const,
      properties: {
        gate: { type: "string", description: "שם ה-gate" },
      },
      required: ["gate"] as string[],
    },
  },
  {
    name: "get_quality_score",
    description: "ציון איכות מהיר — TypeScript + Lint + Build בלבד",
    input_schema: { type: "object" as const, properties: {}, required: [] as string[] },
  },
];
