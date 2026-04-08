import { runCommand } from "./terminalTool";
import { readFile, writeFile } from "./fileTool";
import { installPackage } from "./packageTool";
import { callLLM } from "../llm/client";
import { extractTextContent } from "../llm/parser";
import * as fs from "fs";
import * as path from "path";

const WORKSPACE_DIR = process.env.WORKSPACE_DIR || process.env.WORKSPACE_ROOT || "/home/runner/workspace";

export interface TestResult {
  success: boolean;
  passed: number;
  failed: number;
  skipped: number;
  total: number;
  duration: number;
  details: Array<{
    name: string;
    status: "pass" | "fail" | "skip";
    error?: string;
    duration: number;
  }>;
  output: string;
}

function detectTestFramework(): { framework: string; command: string } {
  const hasFile = (f: string) => fs.existsSync(path.join(WORKSPACE_DIR, f));

  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(WORKSPACE_DIR, "package.json"), "utf-8"));
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

    if (allDeps.vitest) return { framework: "vitest", command: "npx vitest run --reporter=json" };
    if (allDeps.jest) return { framework: "jest", command: "npx jest --json --forceExit" };
    if (allDeps.mocha) return { framework: "mocha", command: "npx mocha --reporter json" };
    if (allDeps.playwright || allDeps["@playwright/test"])
      return { framework: "playwright", command: "npx playwright test --reporter=json" };
    if (allDeps.cypress)
      return { framework: "cypress", command: "npx cypress run --reporter json" };
  } catch {}

  if (hasFile("pytest.ini") || hasFile("conftest.py") || hasFile("setup.cfg"))
    return { framework: "pytest", command: "python -m pytest --tb=short -v" };
  if (hasFile("requirements.txt")) {
    try {
      const req = fs.readFileSync(path.join(WORKSPACE_DIR, "requirements.txt"), "utf-8");
      if (req.includes("pytest")) return { framework: "pytest", command: "python -m pytest --tb=short -v" };
    } catch {}
  }

  if (hasFile("go.mod")) return { framework: "go-test", command: "go test ./... -v -json" };
  if (hasFile("Cargo.toml")) return { framework: "cargo-test", command: "cargo test -- --format=json" };

  return { framework: "jest", command: "npx jest --json --forceExit" };
}

function parseTestOutput(framework: string, output: string, duration: number): TestResult {
  const result: TestResult = {
    success: false,
    passed: 0,
    failed: 0,
    skipped: 0,
    total: 0,
    duration,
    details: [],
    output,
  };

  try {
    if (framework === "jest" || framework === "vitest") {
      const jsonMatch = output.match(/\{[\s\S]*"numPassedTests"[\s\S]*\}/);
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[0]);
        result.passed = data.numPassedTests || 0;
        result.failed = data.numFailedTests || 0;
        result.skipped = data.numPendingTests || 0;
        result.total = data.numTotalTests || 0;
        result.success = result.failed === 0;

        if (data.testResults) {
          for (const suite of data.testResults) {
            for (const test of suite.assertionResults || []) {
              result.details.push({
                name: test.fullName || test.title,
                status: test.status === "passed" ? "pass" : test.status === "failed" ? "fail" : "skip",
                error: test.failureMessages?.join("\n"),
                duration: test.duration || 0,
              });
            }
          }
        }
        return result;
      }
    }
  } catch {}

  const passMatch = output.match(/(\d+)\s+pass/i);
  const failMatch = output.match(/(\d+)\s+fail/i);
  const skipMatch = output.match(/(\d+)\s+skip/i);

  result.passed = passMatch ? parseInt(passMatch[1]) : 0;
  result.failed = failMatch ? parseInt(failMatch[1]) : 0;
  result.skipped = skipMatch ? parseInt(skipMatch[1]) : 0;
  result.total = result.passed + result.failed + result.skipped;
  result.success = result.failed === 0 && result.total > 0;

  return result;
}

export async function runTests(params: {
  pattern?: string;
  coverage?: boolean;
} = {}): Promise<TestResult> {
  const detected = detectTestFramework();
  let command = detected.command;

  if (params.pattern) {
    switch (detected.framework) {
      case "vitest": command += ` ${params.pattern}`; break;
      case "jest": command += ` --testPathPattern="${params.pattern}"`; break;
      case "pytest": command += ` -k "${params.pattern}"`; break;
      case "go-test": command = `go test ./${params.pattern}/... -v -json`; break;
    }
  }

  if (params.coverage) {
    if (detected.framework === "vitest" || detected.framework === "jest") command += " --coverage";
    if (detected.framework === "pytest") command += " --cov";
  }

  const startTime = Date.now();
  const result = await runCommand({ command, timeout: 120000 });
  return parseTestOutput(detected.framework, result.stdout + "\n" + result.stderr, Date.now() - startTime);
}

export async function runSingleTest(params: { file: string }): Promise<TestResult> {
  const detected = detectTestFramework();
  let command: string;

  switch (detected.framework) {
    case "vitest": command = `npx vitest run ${params.file} --reporter=json`; break;
    case "jest": command = `npx jest ${params.file} --json --forceExit`; break;
    case "pytest": command = `python -m pytest ${params.file} -v`; break;
    case "go-test": command = `go test -run ${params.file} -v -json`; break;
    default: command = `npx jest ${params.file} --json --forceExit`; break;
  }

  const startTime = Date.now();
  const result = await runCommand({ command, timeout: 60000 });
  return parseTestOutput(detected.framework, result.stdout + "\n" + result.stderr, Date.now() - startTime);
}

export async function generateTests(params: { sourceFile: string }): Promise<{ success: boolean; output: string; testFile?: string }> {
  const content = await readFile({ path: params.sourceFile });
  if (!content.success) return { success: false, output: `Cannot read: ${params.sourceFile}` };

  const ext = path.extname(params.sourceFile);
  const testFile = params.sourceFile.replace(ext, `.test${ext}`);
  const detected = detectTestFramework();

  const response = await callLLM({
    system: `You are an expert test engineer. Generate comprehensive tests using ${detected.framework}.
Write tests that cover:
- Happy path for all exported functions/methods
- Edge cases and error handling
- Input validation
- Return value assertions
Respond with ONLY the test file code, no explanation.`,
    messages: [{
      role: "user",
      content: `Generate tests for this file (${params.sourceFile}):\n\n\`\`\`\n${content.output}\n\`\`\``,
    }],
  });

  let testCode = extractTextContent(response.content);
  testCode = testCode.replace(/^```\w*\n/, "").replace(/\n```$/, "").trim();

  const result = await writeFile({ path: testFile, content: testCode });
  return { success: result.success, output: `Generated test file: ${testFile}`, testFile };
}

export async function setupTestFramework(params: { framework: "vitest" | "jest" | "playwright" | "pytest" }): Promise<{ success: boolean; output: string }> {
  switch (params.framework) {
    case "vitest": {
      await installPackage({ packages: ["vitest", "@vitest/coverage-v8"], dev: true });
      await writeFile({ path: "vitest.config.ts", content: `import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      reporter: ['text', 'json', 'html'],
    },
  },
});` });
      return { success: true, output: "Vitest configured" };
    }
    case "jest": {
      await installPackage({ packages: ["jest", "ts-jest", "@types/jest"], dev: true });
      await writeFile({ path: "jest.config.js", content: `module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.[jt]s', '**/?(*.)+(spec|test).[jt]s'],
  collectCoverageFrom: ['src/**/*.{js,ts}', '!src/**/*.d.ts'],
};` });
      return { success: true, output: "Jest configured" };
    }
    case "playwright": {
      await installPackage({ packages: ["@playwright/test"], dev: true });
      await runCommand({ command: "npx playwright install", timeout: 180000 });
      await writeFile({ path: "playwright.config.ts", content: `import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  retries: 2,
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm run dev',
    port: 3000,
    reuseExistingServer: true,
  },
});` });
      return { success: true, output: "Playwright configured" };
    }
    case "pytest": {
      await runCommand({ command: "pip install pytest pytest-cov pytest-asyncio", timeout: 60000 });
      await writeFile({ path: "pytest.ini", content: `[pytest]
testpaths = tests
python_files = test_*.py
python_classes = Test*
python_functions = test_*
addopts = -v --tb=short` });
      return { success: true, output: "Pytest configured" };
    }
  }
}

export const TEST_TOOLS = [
  {
    name: "run_tests",
    description: "Run all tests using the detected test framework (vitest/jest/pytest/go test)",
    input_schema: {
      type: "object" as const,
      properties: {
        pattern: { type: "string", description: "Test name pattern to filter" },
        coverage: { type: "boolean", description: "Include coverage report" },
      },
      required: [] as string[],
    },
  },
  {
    name: "run_single_test",
    description: "Run tests in a single file",
    input_schema: {
      type: "object" as const,
      properties: { file: { type: "string", description: "Test file path" } },
      required: ["file"] as string[],
    },
  },
  {
    name: "generate_tests",
    description: "Generate test file for a source file using LLM",
    input_schema: {
      type: "object" as const,
      properties: { sourceFile: { type: "string", description: "Source file to generate tests for" } },
      required: ["sourceFile"] as string[],
    },
  },
  {
    name: "setup_test_framework",
    description: "Install and configure a test framework (vitest/jest/playwright/pytest)",
    input_schema: {
      type: "object" as const,
      properties: { framework: { type: "string", enum: ["vitest", "jest", "playwright", "pytest"] } },
      required: ["framework"] as string[],
    },
  },
];