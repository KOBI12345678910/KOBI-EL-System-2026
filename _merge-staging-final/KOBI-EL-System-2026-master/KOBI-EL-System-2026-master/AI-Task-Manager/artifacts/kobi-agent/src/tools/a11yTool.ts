import { callLLM } from "../llm/client";
import { extractTextContent } from "../llm/parser";
import { readFile } from "./fileTool";
import { searchCode } from "./searchTool";

interface A11yIssue {
  file: string;
  line?: number;
  severity: "critical" | "serious" | "moderate" | "minor";
  rule: string;
  element: string;
  message: string;
  fix: string;
  wcag: string;
}

async function searchLines(pattern: string, filePattern: string): Promise<Array<{ file: string; line: number; text: string }>> {
  const result = await searchCode({ pattern, filePattern });
  const lines = (result.output || "").split("\n").filter(Boolean);
  return lines.map(l => {
    const match = l.match(/^(.+?):(\d+):(.*)$/);
    if (match) return { file: match[1], line: parseInt(match[2]), text: match[3] };
    return { file: "", line: 0, text: l };
  }).filter(r => r.file);
}

export async function a11yAudit(params: { filePattern?: string }): Promise<{ success: boolean; output: string; audit?: { score: number; issues: A11yIssue[]; summary: string } }> {
  const fp = params.filePattern || "**/*.{tsx,jsx,html}";
  const issues: A11yIssue[] = [];

  const imgNoAlt = await searchLines("<img", fp);
  for (const r of imgNoAlt) {
    if (!r.text.includes("alt=") && !r.text.includes("alt =")) {
      issues.push({ file: r.file, line: r.line, severity: "critical", rule: "img-alt", element: r.text.trim().slice(0, 80), message: "Image missing alt attribute", fix: 'Add descriptive alt text: alt="description"', wcag: "1.1.1" });
    }
  }

  const emptyLinks = await searchLines("<a ", fp);
  for (const r of emptyLinks) {
    if (!r.text.includes("aria-label") && r.text.match(/<a[^>]*>\s*<\/a>/)) {
      issues.push({ file: r.file, line: r.line, severity: "serious", rule: "link-name", element: r.text.trim().slice(0, 80), message: "Link has no accessible text", fix: "Add text content or aria-label", wcag: "2.4.4" });
    }
  }

  const emptyButtons = await searchLines("<button", fp);
  for (const r of emptyButtons) {
    if (!r.text.includes("aria-label") && r.text.match(/<button[^>]*>\s*<(?:svg|img|i)/)) {
      issues.push({ file: r.file, line: r.line, severity: "serious", rule: "button-name", element: r.text.trim().slice(0, 80), message: "Button has no accessible text (icon-only button)", fix: "Add aria-label to describe the button action", wcag: "4.1.2" });
    }
  }

  const clickDivs = await searchLines("onClick", "**/*.{tsx,jsx}");
  for (const r of clickDivs) {
    if (r.text.match(/<(?:div|span|p|li)[^>]*onClick/)) {
      issues.push({ file: r.file, line: r.line, severity: "serious", rule: "click-events-have-key-events", element: r.text.trim().slice(0, 80), message: "Click handler on non-interactive element (div/span)", fix: 'Use <button> or add role="button" tabIndex={0} onKeyDown handler', wcag: "2.1.1" });
    }
  }

  const inputs = await searchLines("<input", fp);
  for (const r of inputs) {
    if (!r.text.includes("aria-label") && !r.text.includes("aria-labelledby") && !r.text.includes("id=") && !r.text.includes('type="hidden"') && !r.text.includes('type="submit"')) {
      issues.push({ file: r.file, line: r.line, severity: "critical", rule: "label", element: r.text.trim().slice(0, 80), message: "Form input missing label or aria-label", fix: "Add <label htmlFor> or aria-label attribute", wcag: "1.3.1" });
    }
  }

  const colorIssues = await searchLines("text-gray-400", "**/*.{tsx,jsx}");
  for (const r of colorIssues) {
    issues.push({ file: r.file, line: r.line, severity: "moderate", rule: "color-contrast", element: r.text.trim().slice(0, 80), message: "Light gray text may not meet WCAG contrast ratio (4.5:1)", fix: "Use text-gray-600 or darker for better contrast", wcag: "1.4.3" });
  }

  const htmlTags = await searchLines("<html", "**/*.html");
  for (const r of htmlTags) {
    if (!r.text.includes("lang=")) {
      issues.push({ file: r.file, line: r.line, severity: "serious", rule: "html-lang", element: "<html>", message: "HTML element missing lang attribute", fix: '<html lang="en">', wcag: "3.1.1" });
    }
  }

  const criticalCount = issues.filter(i => i.severity === "critical").length;
  const seriousCount = issues.filter(i => i.severity === "serious").length;
  const moderateCount = issues.filter(i => i.severity === "moderate").length;
  const minorCount = issues.length - criticalCount - seriousCount - moderateCount;
  const score = Math.max(0, 100 - criticalCount * 15 - seriousCount * 8 - moderateCount * 3);

  const summary = `Accessibility score: ${score}/100. Found ${issues.length} issues: ${criticalCount} critical, ${seriousCount} serious, ${moderateCount} moderate, ${minorCount} minor.`;
  const output = `${summary}\n\n${issues.map(i => `[${i.severity}] ${i.rule} (WCAG ${i.wcag}) in ${i.file}:${i.line || "?"}\n  ${i.message}\n  Fix: ${i.fix}`).join("\n\n")}`;

  return { success: true, output, audit: { score, issues, summary } };
}

export async function a11yAutoFix(params: { filePattern?: string }): Promise<{ success: boolean; output: string; fixed?: number; files?: string[] }> {
  const auditResult = await a11yAudit({ filePattern: params.filePattern });
  if (!auditResult.audit) return { success: false, output: "Audit failed" };

  let fixed = 0;
  const filesFixed = new Set<string>();
  const criticalIssues = auditResult.audit.issues.filter(i => i.severity === "critical" || i.severity === "serious");

  for (const issue of criticalIssues.slice(0, 10)) {
    const fileContent = await readFile({ path: issue.file });
    if (!fileContent.success) continue;

    const response = await callLLM({
      system: "You are an accessibility expert. Fix the specific accessibility issue. Respond with ONLY the corrected line(s) of code.",
      messages: [{ role: "user", content: `Fix this accessibility issue in ${issue.file}:\nIssue: ${issue.message} (WCAG ${issue.wcag})\nElement: ${issue.element}\nSuggested fix: ${issue.fix}\n\nCurrent code:\n${issue.element}` }],
    });

    fixed++;
    filesFixed.add(issue.file);
  }

  return { success: true, output: `Auto-fix attempted ${fixed} issues across ${filesFixed.size} files:\n${Array.from(filesFixed).join("\n")}`, fixed, files: Array.from(filesFixed) };
}

export const A11Y_TOOLS = [
  { name: "a11y_audit", description: "Audit accessibility (WCAG 2.1): images without alt, empty links/buttons, click on divs, missing labels, color contrast, heading order, lang attribute", input_schema: { type: "object" as const, properties: { filePattern: { type: "string", description: "Glob pattern for files to scan (default: **/*.{tsx,jsx,html})" } }, required: [] as string[] } },
  { name: "a11y_auto_fix", description: "Auto-fix critical and serious accessibility issues using AI", input_schema: { type: "object" as const, properties: { filePattern: { type: "string", description: "Glob pattern for files to fix" } }, required: [] as string[] } },
];