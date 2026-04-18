import { runCommand } from "./terminalTool";

const ROOT = process.env.WORKSPACE_DIR || process.env.WORKSPACE_ROOT || "/home/runner/workspace";

async function git(cmd: string): Promise<{ success: boolean; output: string; error?: string }> {
  const result = await runCommand({ command: `git ${cmd}`, cwd: ROOT, timeout: 15000 });
  return { success: result.success, output: result.stdout, error: result.stderr || undefined };
}

export async function gitInit(): Promise<{ success: boolean; output?: string; error?: string }> {
  const r = await git("init");
  return r;
}

export async function gitStatus(): Promise<{ success: boolean; output?: string; error?: string }> {
  try {
    const status = await git("status --porcelain");
    const branch = await git("branch --show-current");
    const lastCommit = await git("log --oneline -1");
    return {
      success: true,
      output: `Branch: ${branch.output}\nLast commit: ${lastCommit.output}\n\nChanges:\n${status.output || "(no changes)"}`,
    };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function gitAdd(params: { files?: string | string[] }): Promise<{ success: boolean; output?: string; error?: string }> {
  const target = params.files
    ? (Array.isArray(params.files) ? params.files.join(" ") : params.files)
    : ".";
  const r = await git(`add ${target}`);
  return r;
}

export async function gitCommit(params: { message: string; files?: string[] }): Promise<{ success: boolean; output?: string; error?: string }> {
  try {
    if (params.files && params.files.length > 0) {
      for (const f of params.files) await git(`add '${f}'`);
    } else {
      await git("add -A");
    }
    const r = await git(`commit -m "${params.message.replace(/"/g, '\\"')}"`);
    return r;
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function gitLog(params: { count?: number }): Promise<{ success: boolean; output?: string; error?: string }> {
  const n = params.count || 10;
  const r = await git(`log --oneline -n ${n}`);
  return r;
}

export async function gitDiff(params: { file?: string; staged?: boolean }): Promise<{ success: boolean; output?: string; error?: string }> {
  let cmd = "diff";
  if (params.staged) cmd += " --staged";
  if (params.file) cmd += ` ${params.file}`;
  const r = await git(cmd);
  return { success: true, output: r.output || "(no changes)" };
}

export async function gitBranch(params: { name?: string }): Promise<{ success: boolean; output?: string; error?: string }> {
  if (params.name) {
    return await git(`checkout -b ${params.name}`);
  }
  return await git("branch -a");
}

export async function gitCheckout(params: { branch: string }): Promise<{ success: boolean; output?: string; error?: string }> {
  return await git(`checkout ${params.branch}`);
}

export async function gitStash(params: { pop?: boolean }): Promise<{ success: boolean; output?: string; error?: string }> {
  return await git(params.pop ? "stash pop" : "stash");
}

export async function gitReset(params: { hard?: boolean; target?: string }): Promise<{ success: boolean; output?: string; error?: string }> {
  return await git(`reset ${params.hard ? "--hard" : ""} ${params.target || "HEAD"}`);
}

export async function gitPush(params: { remote?: string; branch?: string }): Promise<{ success: boolean; output?: string; error?: string }> {
  return await git(`push ${params.remote || "origin"} ${params.branch || "main"}`);
}

export async function gitPull(params: { remote?: string; branch?: string }): Promise<{ success: boolean; output?: string; error?: string }> {
  return await git(`pull ${params.remote || "origin"} ${params.branch || "main"}`);
}

export const GIT_TOOLS = [
  {
    name: "git_status",
    description: "Git status — branch, changes, last commit.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "git_diff",
    description: "Show changes (diff).",
    input_schema: {
      type: "object" as const,
      properties: {
        file: { type: "string", description: "Specific file" },
        staged: { type: "boolean", description: "Only staged changes" },
      },
    },
  },
  {
    name: "git_log",
    description: "Commit history.",
    input_schema: {
      type: "object" as const,
      properties: {
        count: { type: "number", description: "Number of commits to show" },
      },
    },
  },
  {
    name: "git_commit",
    description: "Create a new commit.",
    input_schema: {
      type: "object" as const,
      properties: {
        message: { type: "string", description: "Commit message" },
        files: { type: "array", items: { type: "string" }, description: "Specific files (default: all)" },
      },
      required: ["message"],
    },
  },
  {
    name: "git_branch",
    description: "List branches or create a new branch.",
    input_schema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "New branch name (omit to list)" },
      },
    },
  },
  {
    name: "git_checkout",
    description: "Switch to a branch.",
    input_schema: {
      type: "object" as const,
      properties: {
        branch: { type: "string", description: "Branch name" },
      },
      required: ["branch"],
    },
  },
  {
    name: "git_stash",
    description: "Stash or pop stashed changes.",
    input_schema: {
      type: "object" as const,
      properties: {
        pop: { type: "boolean", description: "Pop stash (default: stash)" },
      },
    },
  },
  {
    name: "git_reset",
    description: "Reset to a commit.",
    input_schema: {
      type: "object" as const,
      properties: {
        hard: { type: "boolean", description: "Hard reset" },
        target: { type: "string", description: "Target commit (default: HEAD)" },
      },
    },
  },
];