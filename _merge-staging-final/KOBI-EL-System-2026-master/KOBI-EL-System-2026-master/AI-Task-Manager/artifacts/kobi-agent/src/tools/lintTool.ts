import { runCommand } from "./terminalTool";
import { writeFile, readFile } from "./fileTool";
import { installPackage } from "./packageTool";
import * as fs from "fs";
import * as path from "path";

const WORKSPACE_DIR = process.env.WORKSPACE_DIR || process.env.WORKSPACE_ROOT || "/home/runner/workspace";

export interface LintResult {
  success: boolean;
  errors: number;
  warnings: number;
  fixable: number;
  issues: Array<{
    file: string;
    line: number;
    column: number;
    severity: "error" | "warning";
    message: string;
    rule: string;
  }>;
  output: string;
}

function parseEslintOutput(output: string): LintResult {
  const result: LintResult = {
    success: true,
    errors: 0,
    warnings: 0,
    fixable: 0,
    issues: [],
    output,
  };

  try {
    const data = JSON.parse(output);
    if (Array.isArray(data)) {
      for (const file of data) {
        for (const msg of file.messages || []) {
          result.issues.push({
            file: file.filePath,
            line: msg.line,
            column: msg.column,
            severity: msg.severity === 2 ? "error" : "warning",
            message: msg.message,
            rule: msg.ruleId || "",
          });
          if (msg.severity === 2) result.errors++;
          else result.warnings++;
          if (msg.fix) result.fixable++;
        }
      }
      result.success = result.errors === 0;
      return result;
    }
  } catch {}

  const summaryMatch = output.match(/(\d+)\s+errors?\s+and\s+(\d+)\s+warnings?/);
  if (summaryMatch) {
    result.errors = parseInt(summaryMatch[1]);
    result.warnings = parseInt(summaryMatch[2]);
  }
  result.success = result.errors === 0;
  return result;
}

export async function setupEslint(params: {
  typescript?: boolean;
  react?: boolean;
  prettier?: boolean;
} = {}): Promise<{ success: boolean; output: string }> {
  const packages = ["eslint"];
  if (params.typescript !== false) packages.push("@typescript-eslint/parser", "@typescript-eslint/eslint-plugin");
  if (params.react) packages.push("eslint-plugin-react", "eslint-plugin-react-hooks");
  if (params.prettier) packages.push("prettier", "eslint-config-prettier", "eslint-plugin-prettier");

  await installPackage({ packages, dev: true });

  const config: any = {
    root: true,
    env: { browser: true, es2022: true, node: true },
    extends: ["eslint:recommended"],
    parserOptions: { ecmaVersion: "latest", sourceType: "module" },
    rules: { "no-unused-vars": "warn", "no-console": "warn", "prefer-const": "error", "no-var": "error", eqeqeq: ["error", "always"] },
  };

  if (params.typescript !== false) {
    config.parser = "@typescript-eslint/parser";
    config.extends.push("plugin:@typescript-eslint/recommended");
    config.plugins = ["@typescript-eslint"];
    config.rules["@typescript-eslint/no-unused-vars"] = "warn";
    config.rules["@typescript-eslint/no-explicit-any"] = "warn";
  }
  if (params.react) {
    config.extends.push("plugin:react/recommended", "plugin:react-hooks/recommended");
    config.settings = { react: { version: "detect" } };
  }
  if (params.prettier) {
    config.extends.push("prettier");
    await writeFile({ path: ".prettierrc", content: JSON.stringify({ semi: true, trailingComma: "es5", singleQuote: true, printWidth: 100, tabWidth: 2, useTabs: false }, null, 2) });
  }

  await writeFile({ path: ".eslintrc.json", content: JSON.stringify(config, null, 2) });
  await writeFile({ path: ".eslintignore", content: "node_modules/\ndist/\nbuild/\n.next/\ncoverage/\n*.min.js\n" });

  return { success: true, output: "ESLint configured" };
}

export async function lint(params: {
  files?: string;
  fix?: boolean;
} = {}): Promise<LintResult> {
  const files = params.files || "src/**/*.{ts,tsx,js,jsx}";
  const fixFlag = params.fix ? " --fix" : "";

  const result = await runCommand({ command: `npx eslint ${files}${fixFlag} -f json`, timeout: 60000 });
  return parseEslintOutput(result.stdout + "\n" + result.stderr);
}

export async function format(params: {
  files?: string;
  check?: boolean;
} = {}): Promise<{ success: boolean; output: string; filesChanged?: number }> {
  const files = params.files || "src/**/*.{ts,tsx,js,jsx,json,css,md}";
  const flag = params.check ? " --check" : " --write";

  const result = await runCommand({ command: `npx prettier${flag} "${files}"`, timeout: 60000 });
  const changedMatch = result.stdout.match(/(\d+)\s+files?\s+(?:changed|reformatted)/);
  return {
    success: result.success || !params.check,
    output: result.stdout,
    filesChanged: changedMatch ? parseInt(changedMatch[1]) : 0,
  };
}

export async function typeCheck(): Promise<{ success: boolean; output: string; errors?: Array<{ file: string; line: number; message: string }> }> {
  const result = await runCommand({ command: "npx tsc --noEmit", timeout: 60000 });
  const errors: Array<{ file: string; line: number; message: string }> = [];

  const errorRegex = /(.+)\((\d+),\d+\): error TS\d+: (.+)/g;
  let match;
  const combined = result.stdout + result.stderr;
  while ((match = errorRegex.exec(combined)) !== null) {
    errors.push({ file: match[1], line: parseInt(match[2]), message: match[3] });
  }

  return { success: result.success, errors, output: combined };
}

export async function setupHusky(): Promise<{ success: boolean; output: string }> {
  await installPackage({ packages: ["husky", "lint-staged"], dev: true });
  await runCommand({ command: "npx husky init", timeout: 10000 });
  await writeFile({ path: ".husky/pre-commit", content: `#!/usr/bin/env sh\n. "$(dirname -- "$0")/_/husky.sh"\nnpx lint-staged\n` });

  try {
    const pkgPath = path.join(WORKSPACE_DIR, "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    pkg["lint-staged"] = {
      "*.{ts,tsx,js,jsx}": ["eslint --fix", "prettier --write"],
      "*.{json,css,md}": ["prettier --write"],
    };
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
  } catch {}

  return { success: true, output: "Husky + lint-staged configured" };
}

export const LINT_TOOLS = [
  {
    name: "setup_eslint",
    description: "Setup ESLint with optional TypeScript, React, and Prettier support",
    input_schema: {
      type: "object" as const,
      properties: {
        typescript: { type: "boolean", description: "Enable TypeScript support (default: true)" },
        react: { type: "boolean", description: "Enable React support" },
        prettier: { type: "boolean", description: "Enable Prettier integration" },
      },
      required: [] as string[],
    },
  },
  {
    name: "lint",
    description: "Run ESLint on source files, optionally with auto-fix",
    input_schema: {
      type: "object" as const,
      properties: {
        files: { type: "string", description: "Glob pattern for files (default: src/**/*.{ts,tsx,js,jsx})" },
        fix: { type: "boolean", description: "Auto-fix fixable issues" },
      },
      required: [] as string[],
    },
  },
  {
    name: "format",
    description: "Format code with Prettier",
    input_schema: {
      type: "object" as const,
      properties: {
        files: { type: "string", description: "Glob pattern for files" },
        check: { type: "boolean", description: "Check only without writing" },
      },
      required: [] as string[],
    },
  },
  {
    name: "type_check",
    description: "Run TypeScript type checking without emitting files",
    input_schema: { type: "object" as const, properties: {}, required: [] as string[] },
  },
  {
    name: "setup_husky",
    description: "Setup Husky pre-commit hooks with lint-staged",
    input_schema: { type: "object" as const, properties: {}, required: [] as string[] },
  },
];