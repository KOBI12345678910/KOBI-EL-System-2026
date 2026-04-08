import * as fs from "fs";
import * as path from "path";
import { runCommand } from "./terminalTool";

const ROOT = process.env.WORKSPACE_DIR || process.env.WORKSPACE_ROOT || "/home/runner/workspace";

function detectPackageManager(): "npm" | "yarn" | "pnpm" | "bun" | "pip" | "cargo" {
  if (fs.existsSync(path.join(ROOT, "bun.lockb"))) return "bun";
  if (fs.existsSync(path.join(ROOT, "pnpm-lock.yaml"))) return "pnpm";
  if (fs.existsSync(path.join(ROOT, "yarn.lock"))) return "yarn";
  if (fs.existsSync(path.join(ROOT, "requirements.txt"))) return "pip";
  if (fs.existsSync(path.join(ROOT, "Cargo.toml"))) return "cargo";
  return "npm";
}

export async function installPackage(params: {
  packages: string[];
  filter?: string;
  dev?: boolean;
}): Promise<{ success: boolean; output?: string; error?: string }> {
  const pm = detectPackageManager();
  let command: string;

  switch (pm) {
    case "pnpm":
      command = params.filter ? `pnpm --filter ${params.filter} add` : "pnpm add";
      if (params.dev) command += " -D";
      command += ` ${params.packages.join(" ")}`;
      break;
    case "npm":
      command = `npm install ${params.dev ? "-D" : ""} ${params.packages.join(" ")}`;
      break;
    case "yarn":
      command = `yarn add ${params.dev ? "-D" : ""} ${params.packages.join(" ")}`;
      break;
    case "bun":
      command = `bun add ${params.dev ? "-d" : ""} ${params.packages.join(" ")}`;
      break;
    case "pip":
      command = `pip install ${params.packages.join(" ")}`;
      break;
    case "cargo":
      command = params.packages.map((p) => `cargo add ${p}`).join(" && ");
      break;
  }

  const result = await runCommand({ command, timeout: 120000 });
  return {
    success: result.success,
    output: result.stdout,
    error: result.stderr || undefined,
  };
}

export async function removePackage(params: {
  packages: string[];
  filter?: string;
}): Promise<{ success: boolean; output?: string; error?: string }> {
  const pm = detectPackageManager();
  let command: string;

  switch (pm) {
    case "pnpm":
      command = params.filter ? `pnpm --filter ${params.filter} remove` : "pnpm remove";
      command += ` ${params.packages.join(" ")}`;
      break;
    case "npm": command = `npm uninstall ${params.packages.join(" ")}`; break;
    case "yarn": command = `yarn remove ${params.packages.join(" ")}`; break;
    case "bun": command = `bun remove ${params.packages.join(" ")}`; break;
    case "pip": command = `pip uninstall -y ${params.packages.join(" ")}`; break;
    case "cargo": command = params.packages.map((p) => `cargo remove ${p}`).join(" && "); break;
  }

  const result = await runCommand({ command, timeout: 60000 });
  return {
    success: result.success,
    output: result.stdout,
    error: result.stderr || undefined,
  };
}

export async function listPackages(params: {
  filter?: string;
}): Promise<{ success: boolean; output?: string; error?: string }> {
  const pm = detectPackageManager();
  let command: string;

  switch (pm) {
    case "pnpm":
      command = params.filter ? `pnpm --filter ${params.filter} list --depth 0` : "pnpm list --depth 0";
      break;
    case "npm": command = "npm list --depth 0"; break;
    case "yarn": command = "yarn list --depth=0"; break;
    case "bun": command = "bun pm ls"; break;
    case "pip": command = "pip list"; break;
    case "cargo": command = "cargo tree --depth 1"; break;
  }

  const result = await runCommand({ command, timeout: 15000 });
  return {
    success: result.success,
    output: result.stdout,
    error: result.stderr || undefined,
  };
}

export async function installAll(): Promise<{ success: boolean; output?: string; error?: string }> {
  const pm = detectPackageManager();
  const commands: Record<string, string> = {
    npm: "npm install",
    yarn: "yarn install",
    pnpm: "pnpm install",
    bun: "bun install",
    pip: "pip install -r requirements.txt",
    cargo: "cargo build",
  };
  const result = await runCommand({ command: commands[pm], timeout: 180000 });
  return {
    success: result.success,
    output: result.stdout,
    error: result.stderr || undefined,
  };
}

export const PACKAGE_TOOLS = [
  {
    name: "install_package",
    description: "Install package(s). Auto-detects package manager (pnpm/npm/yarn/bun/pip/cargo).",
    input_schema: {
      type: "object" as const,
      properties: {
        packages: { type: "array", items: { type: "string" }, description: "Package names" },
        filter: { type: "string", description: "Workspace filter (e.g., @workspace/erp-app)" },
        dev: { type: "boolean", description: "Install as devDependency" },
      },
      required: ["packages"],
    },
  },
  {
    name: "remove_package",
    description: "Remove/uninstall package(s).",
    input_schema: {
      type: "object" as const,
      properties: {
        packages: { type: "array", items: { type: "string" }, description: "Package names" },
        filter: { type: "string", description: "Workspace filter" },
      },
      required: ["packages"],
    },
  },
  {
    name: "list_packages",
    description: "List installed packages.",
    input_schema: {
      type: "object" as const,
      properties: {
        filter: { type: "string", description: "Workspace filter" },
      },
    },
  },
  {
    name: "install_all",
    description: "Install all dependencies (pnpm install / npm install / etc).",
    input_schema: {
      type: "object" as const,
      properties: {},
    },
  },
];