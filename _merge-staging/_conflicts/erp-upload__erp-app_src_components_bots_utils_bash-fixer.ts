/**
 * utils/bash-fixer.ts
 * =========================================================
 * Bash Script Fixer - Node.js version of BashFixerAgent
 * Fixes bash scripts that don't work in Bash 4.4
 * =========================================================
 */

import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import * as os from "os";
import type { Logger } from "../core/base-bot";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

interface LLMClient {
  complete(prompt: string): Promise<string>;
}

interface BashFixerConfig {
  logger?: Logger | null;
  llmClient?: LLMClient | null;
}

/* ------------------------------------------------------------------ */
/*  BashFixer                                                          */
/* ------------------------------------------------------------------ */

export class BashFixer {
  logger: Logger | null;
  llmClient: LLMClient | null;

  constructor({ logger = null, llmClient = null }: BashFixerConfig = {}) {
    this.logger = logger;
    this.llmClient = llmClient;
  }

  /** Run a bash script and return { code, stdout, stderr } */
  runScript(scriptText: string): RunResult {
    const tmpFile = path.join(
      os.tmpdir(),
      `bash_${Date.now()}_${Math.random().toString(16).slice(2)}.sh`,
    );

    try {
      fs.writeFileSync(tmpFile, scriptText, "utf-8");

      try {
        const stdout = execSync(`bash --noprofile --norc "${tmpFile}"`, {
          encoding: "utf-8",
          stdio: ["pipe", "pipe", "pipe"],
        });
        return { code: 0, stdout, stderr: "" };
      } catch (err: unknown) {
        const e = err as { status?: number; stdout?: string; stderr?: string; message?: string };
        return {
          code: e.status || 1,
          stdout: e.stdout || "",
          stderr: e.stderr || e.message || "",
        };
      }
    } finally {
      try {
        fs.unlinkSync(tmpFile);
      } catch {
        // ignore
      }
    }
  }

  /** Return the bash version string */
  getBashVersion(): string {
    try {
      const version = execSync("bash --version", { encoding: "utf-8" });
      return version.split("\n")[0];
    } catch {
      return "unknown";
    }
  }

  /** Ask LLM to fix a script; returns null if no LLM client */
  async callLLMFix(scriptText: string, result: RunResult, bashVer: string): Promise<string | null> {
    if (!this.llmClient) {
      this.logger?.warn("No LLM client available; cannot fix script automatically");
      return null;
    }

    const prompt = `You are a bash expert. Fix this script so it runs in Bash 4.4 specifically.
Avoid Bash 5+ features. Output ONLY the corrected script text, no markdown, no explanations.

Bash version:
${bashVer}

Original script:
${scriptText}

Execution result:
exit_code=${result.code}

stdout:
${result.stdout}

stderr:
${result.stderr}

Task: Return a corrected version of the script that works in Bash 4.4.`;

    try {
      const response = await this.llmClient.complete(prompt);
      return this.stripMarkdown(response);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger?.error("LLM call failed", { error: message });
      return null;
    }
  }

  /** Remove markdown fences if present */
  stripMarkdown(text: string): string {
    const match = text.match(/```(?:bash|sh)?\s*(.*?)```/s);
    return match ? match[1].trim() : text.trim();
  }

  /** Fix loop: run, if failed -> fix via LLM */
  async fixLoop(initialScript: string, maxIters = 3): Promise<string> {
    let script = initialScript;
    const bashVer = this.getBashVersion();
    this.logger?.info(`Bash version: ${bashVer}`);

    for (let i = 1; i <= maxIters; i++) {
      this.logger?.step(`Fix iteration ${i}/${maxIters}`);

      const res = this.runScript(script);

      if (res.code === 0) {
        this.logger?.ok("Script passed!");
        return script;
      }

      this.logger?.warn(`Iteration ${i} failed (code=${res.code})`);
      this.logger?.data("Error details", { stdout: res.stdout, stderr: res.stderr });

      const fixed = await this.callLLMFix(script, res, bashVer);

      if (!fixed) {
        throw new Error(
          `Could not fix script (iteration ${i}, no LLM response).\n` +
            `Last error:\n${res.stderr}`,
        );
      }

      if (fixed.trim() === script.trim()) {
        throw new Error(
          `LLM did not change script on iteration ${i}.\n` +
            `Last error:\n${res.stderr}`,
        );
      }

      script = fixed;
    }

    const finalRes = this.runScript(script);
    throw new Error(
      `Failed to fix script after ${maxIters} iterations.\n` +
        `exit_code=${finalRes.code}\n` +
        `stderr:\n${finalRes.stderr}`,
    );
  }
}
