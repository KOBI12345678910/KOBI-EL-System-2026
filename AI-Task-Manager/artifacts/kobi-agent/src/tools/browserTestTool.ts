import { runCommand } from "./terminalTool";
import { writeFile } from "./fileTool";
import { callLLM } from "../llm/client";
import { extractJSON, extractTextContent } from "../llm/parser";

export interface BrowserTestResult {
  url: string;
  passed: number;
  failed: number;
  issues: Array<{
    type: "broken_link" | "js_error" | "form_error" | "visual_bug" | "a11y" | "performance" | "api_error" | "missing_element";
    severity: "critical" | "high" | "medium" | "low";
    description: string;
    element?: string;
  }>;
  pages: Array<{
    url: string;
    status: number;
    loadTime: number;
    jsErrors: string[];
  }>;
  summary: string;
  duration: number;
}

async function ensurePlaywright(): Promise<boolean> {
  const check = await runCommand({ command: "npx playwright --version 2>/dev/null", timeout: 5000 });
  if (!check.success) {
    console.log("  Installing Playwright...");
    await runCommand({ command: "pnpm add -D @playwright/test && npx playwright install chromium", timeout: 180000 });
  }
  return true;
}

function buildTestScript(baseUrl: string, options: {
  depth?: number;
  testForms?: boolean;
  testLinks?: boolean;
  screenshots?: boolean;
}): string {
  const depth = options.depth || 2;
  const lines: string[] = [];

  lines.push(`const { chromium } = require('@playwright/test');`);
  lines.push(``);
  lines.push(`(async () => {`);
  lines.push(`  const browser = await chromium.launch({ headless: true });`);
  lines.push(`  const context = await browser.newContext({`);
  lines.push(`    viewport: { width: 1280, height: 720 },`);
  lines.push(`    userAgent: 'KobiAgent-BrowserTest/1.0'`);
  lines.push(`  });`);
  lines.push(`  const page = await context.newPage();`);
  lines.push(``);
  lines.push(`  const results = {`);
  lines.push(`    pages: [],`);
  lines.push(`    jsErrors: [],`);
  lines.push(`    consoleLogs: [],`);
  lines.push(`    networkErrors: [],`);
  lines.push(`    elements: { buttons: 0, links: 0, forms: 0, images: 0, inputs: 0 }`);
  lines.push(`  };`);
  lines.push(``);
  lines.push(`  page.on('console', msg => {`);
  lines.push(`    if (msg.type() === 'error') results.jsErrors.push(msg.text());`);
  lines.push(`    results.consoleLogs.push('[' + msg.type() + '] ' + msg.text());`);
  lines.push(`  });`);
  lines.push(``);
  lines.push(`  page.on('requestfailed', req => {`);
  lines.push(`    results.networkErrors.push(req.url() + ' - ' + (req.failure()?.errorText || 'unknown'));`);
  lines.push(`  });`);
  lines.push(``);
  lines.push(`  const visited = new Set();`);
  lines.push(`  const toVisit = ['${baseUrl}'];`);
  lines.push(`  let currentDepth = 0;`);
  lines.push(`  const maxDepth = ${depth};`);
  lines.push(`  const maxPages = 10;`);
  lines.push(``);
  lines.push(`  while (toVisit.length > 0 && visited.size < maxPages && currentDepth < maxDepth) {`);
  lines.push(`    const url = toVisit.shift();`);
  lines.push(`    if (!url || visited.has(url)) continue;`);
  lines.push(`    visited.add(url);`);
  lines.push(``);
  lines.push(`    try {`);
  lines.push(`      const startNav = Date.now();`);
  lines.push(`      const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });`);
  lines.push(`      const loadTime = Date.now() - startNav;`);
  lines.push(`      const status = response?.status() || 0;`);
  lines.push(`      results.pages.push({ url, status, loadTime, jsErrors: [...results.jsErrors] });`);
  lines.push(`      results.jsErrors = [];`);
  lines.push(``);
  lines.push(`      results.elements.buttons += await page.locator('button').count();`);
  lines.push(`      results.elements.links += await page.locator('a[href]').count();`);
  lines.push(`      results.elements.forms += await page.locator('form').count();`);
  lines.push(`      results.elements.images += await page.locator('img').count();`);
  lines.push(`      results.elements.inputs += await page.locator('input, select, textarea').count();`);

  if (options.screenshots) {
    lines.push(`      await page.screenshot({ path: '/tmp/test-screenshot-' + visited.size + '.png', fullPage: true });`);
  }

  lines.push(``);
  lines.push(`      const links = await page.locator('a[href]').all();`);
  lines.push(`      for (const link of links) {`);
  lines.push(`        const href = await link.getAttribute('href');`);
  lines.push(`        if (href && href.startsWith('/') && !href.startsWith('//')) {`);
  lines.push(`          toVisit.push('${baseUrl}' + href);`);
  lines.push(`        }`);
  lines.push(`      }`);

  if (options.testForms) {
    lines.push(``);
    lines.push(`      const forms = await page.locator('form').all();`);
    lines.push(`      for (const form of forms) {`);
    lines.push(`        const inputs = await form.locator('input:not([type=hidden]):not([type=submit])').all();`);
    lines.push(`        for (const input of inputs) {`);
    lines.push(`          const type = await input.getAttribute('type') || 'text';`);
    lines.push(`          try {`);
    lines.push(`            if (type === 'email') await input.fill('test@example.com');`);
    lines.push(`            else if (type === 'password') await input.fill('TestPass123!');`);
    lines.push(`            else if (type === 'number') await input.fill('42');`);
    lines.push(`            else await input.fill('Test input');`);
    lines.push(`          } catch {}`);
    lines.push(`        }`);
    lines.push(`        const submitBtn = await form.locator('button[type=submit], input[type=submit]').first();`);
    lines.push(`        if (submitBtn) { try { await submitBtn.click({ timeout: 3000 }); } catch {} }`);
    lines.push(`      }`);
  }

  if (options.testLinks) {
    lines.push(``);
    lines.push(`      const allLinks = await page.locator('a[href]').all();`);
    lines.push(`      for (const link of allLinks.slice(0, 20)) {`);
    lines.push(`        const href = await link.getAttribute('href');`);
    lines.push(`        if (href && (href.startsWith('http') || href.startsWith('/'))) {`);
    lines.push(`          try {`);
    lines.push(`            const fullUrl = href.startsWith('/') ? '${baseUrl}' + href : href;`);
    lines.push(`            const resp = await page.request.head(fullUrl, { timeout: 5000 });`);
    lines.push(`            if (resp.status() >= 400) {`);
    lines.push(`              results.networkErrors.push('Broken link: ' + fullUrl + ' (' + resp.status() + ')');`);
    lines.push(`            }`);
    lines.push(`          } catch {}`);
    lines.push(`        }`);
    lines.push(`      }`);
  }

  lines.push(``);
  lines.push(`      const buttons = await page.locator('button:visible').all();`);
  lines.push(`      for (const btn of buttons.slice(0, 5)) {`);
  lines.push(`        try {`);
  lines.push(`          const text = await btn.textContent();`);
  lines.push(`          if (text && !text.toLowerCase().includes('delete') && !text.toLowerCase().includes('logout')) {`);
  lines.push(`            await btn.click({ timeout: 2000 });`);
  lines.push(`            await page.waitForTimeout(500);`);
  lines.push(`          }`);
  lines.push(`        } catch {}`);
  lines.push(`      }`);
  lines.push(``);
  lines.push(`    } catch (err) {`);
  lines.push(`      results.pages.push({ url, status: 0, loadTime: 0, jsErrors: [err.message] });`);
  lines.push(`    }`);
  lines.push(`    currentDepth++;`);
  lines.push(`  }`);
  lines.push(``);
  lines.push(`  await browser.close();`);
  lines.push(`  console.log(JSON.stringify(results));`);
  lines.push(`})();`);

  return lines.join("\n");
}

export async function testApp(params: {
  baseUrl: string;
  depth?: number;
  testForms?: boolean;
  testLinks?: boolean;
  testAPI?: boolean;
  screenshots?: boolean;
}): Promise<{ success: boolean; output: string; result?: BrowserTestResult }> {
  const startTime = Date.now();
  await ensurePlaywright();

  console.log(`\n🌐 Browser testing: ${params.baseUrl}`);

  const result: BrowserTestResult = {
    url: params.baseUrl,
    passed: 0,
    failed: 0,
    issues: [],
    pages: [],
    summary: "",
    duration: 0,
  };

  const testScript = buildTestScript(params.baseUrl, {
    depth: params.depth || 2,
    testForms: params.testForms,
    testLinks: params.testLinks,
    screenshots: params.screenshots,
  });

  const scriptPath = "/tmp/browser-test.js";
  await writeFile({ path: scriptPath, content: testScript });

  const testExec = await runCommand({ command: `node ${scriptPath}`, timeout: 120000 });

  try {
    const data = JSON.parse(testExec.stdout.trim());
    result.pages = data.pages || [];

    for (const page of data.pages) {
      if (page.status >= 400) {
        result.issues.push({
          type: "broken_link",
          severity: page.status >= 500 ? "critical" : "high",
          description: `Page ${page.url} returned ${page.status}`,
        });
        result.failed++;
      } else {
        result.passed++;
      }

      for (const err of page.jsErrors || []) {
        result.issues.push({ type: "js_error", severity: "high", description: err });
      }

      if (page.loadTime > 5000) {
        result.issues.push({
          type: "performance",
          severity: "medium",
          description: `Page ${page.url} loaded in ${page.loadTime}ms (slow)`,
        });
      }
    }

    for (const netErr of data.networkErrors || []) {
      result.issues.push({ type: "broken_link", severity: "medium", description: netErr });
    }
  } catch {
    result.issues.push({
      type: "js_error",
      severity: "critical",
      description: `Test execution failed: ${(testExec.stderr || testExec.stdout).slice(0, 300)}`,
    });
  }

  if (result.issues.length > 0) {
    console.log(`  Found ${result.issues.length} issues, analyzing...`);

    const analysisResponse = await callLLM({
      system: "Analyze browser test results and provide fix recommendations. Be specific. Respond with JSON: { suggestions: [{ issue, fix, file, priority }] }",
      messages: [{
        role: "user",
        content: `Test results for ${params.baseUrl}:\n${JSON.stringify(result.issues.slice(0, 20), null, 2)}`,
      }],
    });

    const analysis = extractJSON(extractTextContent(analysisResponse.content));
    if (analysis?.suggestions) {
      result.summary = `Found ${result.issues.length} issues. Top fixes:\n` +
        analysis.suggestions.slice(0, 5).map((s: any) => `- ${s.fix}`).join("\n");
    }
  }

  result.duration = Date.now() - startTime;
  result.summary = result.summary || `Tested ${result.pages.length} pages: ${result.passed} passed, ${result.failed} failed, ${result.issues.length} issues`;

  console.log(`  ${result.summary}`);

  const lines = [
    `## Browser Test Report`,
    ``,
    `**URL**: ${params.baseUrl}`,
    `**דפים**: ${result.pages.length} | **עברו**: ${result.passed} | **נכשלו**: ${result.failed}`,
    `**בעיות**: ${result.issues.length}`,
    `**זמן**: ${(result.duration / 1000).toFixed(1)}s`,
    ``,
    result.issues.length > 0 ? `### בעיות:\n${result.issues.map(i => `- [${i.severity}] ${i.type}: ${i.description}`).join("\n")}` : "",
    ``,
    result.summary,
  ].filter(Boolean);

  return { success: result.failed === 0 && result.issues.filter(i => i.severity === "critical").length === 0, output: lines.join("\n"), result };
}

export async function testPageLoad(params: {
  url: string;
}): Promise<{ success: boolean; output: string }> {
  const check = await runCommand({
    command: `curl -s -o /dev/null -w '{"status":%{http_code},"time":%{time_total},"size":%{size_download}}' "${params.url}"`,
    timeout: 15000,
  });

  try {
    const data = JSON.parse(check.stdout);
    const passed = data.status >= 200 && data.status < 400;
    return {
      success: passed,
      output: `HTTP ${data.status} — ${(data.time * 1000).toFixed(0)}ms — ${(data.size / 1024).toFixed(1)}KB`,
    };
  } catch {
    return { success: false, output: `Failed to load ${params.url}: ${check.stderr}` };
  }
}

let periodicHandle: ReturnType<typeof setInterval> | null = null;

export async function startPeriodicTesting(params: {
  baseUrl: string;
  intervalSeconds?: number;
}): Promise<{ success: boolean; output: string }> {
  if (periodicHandle) {
    clearInterval(periodicHandle);
  }

  const interval = (params.intervalSeconds || 60) * 1000;
  periodicHandle = setInterval(async () => {
    try {
      await testApp({ baseUrl: params.baseUrl, depth: 1, testForms: true, testLinks: true });
    } catch (err: any) {
      console.log(`  Browser test error: ${err.message}`);
    }
  }, interval);

  return { success: true, output: `Periodic testing started for ${params.baseUrl} every ${params.intervalSeconds || 60}s` };
}

export async function stopPeriodicTesting(params: {}): Promise<{ success: boolean; output: string }> {
  if (periodicHandle) {
    clearInterval(periodicHandle);
    periodicHandle = null;
    return { success: true, output: "Periodic testing stopped" };
  }
  return { success: true, output: "No periodic testing was running" };
}

export const BROWSER_TEST_TOOLS = [
  {
    name: "browser_test_app",
    description: "בדיקת אפליקציה בדפדפן — Playwright: ניווט, לחיצות, טפסים, לינקים שבורים, JS errors, ביצועים. כולל ניתוח AI",
    input_schema: {
      type: "object" as const,
      properties: {
        baseUrl: { type: "string", description: "URL בסיס לבדיקה" },
        depth: { type: "number", description: "עומק ניווט (ברירת מחדל: 2)" },
        testForms: { type: "boolean", description: "בדיקת טפסים?" },
        testLinks: { type: "boolean", description: "בדיקת לינקים שבורים?" },
        testAPI: { type: "boolean", description: "בדיקת API?" },
        screenshots: { type: "boolean", description: "צילומי מסך?" },
      },
      required: ["baseUrl"] as string[],
    },
  },
  {
    name: "test_page_load",
    description: "בדיקת טעינת דף — HTTP status, זמן, גודל",
    input_schema: {
      type: "object" as const,
      properties: {
        url: { type: "string", description: "URL לבדיקה" },
      },
      required: ["url"] as string[],
    },
  },
  {
    name: "start_periodic_browser_test",
    description: "התחלת בדיקות דפדפן תקופתיות — monitoring רציף",
    input_schema: {
      type: "object" as const,
      properties: {
        baseUrl: { type: "string", description: "URL בסיס" },
        intervalSeconds: { type: "number", description: "מרווח בשניות (ברירת מחדל: 60)" },
      },
      required: ["baseUrl"] as string[],
    },
  },
  {
    name: "stop_periodic_browser_test",
    description: "עצירת בדיקות דפדפן תקופתיות",
    input_schema: { type: "object" as const, properties: {}, required: [] as string[] },
  },
];
