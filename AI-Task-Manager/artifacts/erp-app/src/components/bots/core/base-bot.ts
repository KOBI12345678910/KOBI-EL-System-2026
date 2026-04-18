/**
 * core/base-bot.ts
 * =========================================================
 * Base class for all AI bots.
 * Includes: logging, statistics, step-based execution,
 * report saving, and adapter connection.
 * =========================================================
 */

import * as fs from "fs";
import * as path from "path";
import { BashFixer } from "../utils/bash-fixer";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface LogEntry {
  time: string;
  bot: string;
  level: string;
  msg: string;
  meta: unknown | null;
}

interface BotConfig {
  name?: string;
  role?: string;
  authority?: string;
  verbose?: boolean;
  projectRoot?: string;
  reportsDir?: string;
  base44BaseUrl?: string;
  base44ApiKey?: string;
  llmClient?: { complete(prompt: string): Promise<string> } | null;
  allowDelete?: boolean;
  requireApprovalForProd?: boolean;
  environment?: string;
}

interface BotStats {
  startedAt: string;
  actions: number;
  successes: number;
  failures: number;
  steps: { name: string; at: string }[];
  finishedAt?: string;
}

/* ------------------------------------------------------------------ */
/*  Logger                                                             */
/* ------------------------------------------------------------------ */

export class Logger {
  botName: string;
  verbose: boolean;
  entries: LogEntry[];

  constructor({ botName, verbose = true }: { botName?: string; verbose?: boolean } = {}) {
    this.botName = botName || "Bot";
    this.verbose = verbose;
    this.entries = [];
  }

  private _push(level: string, msg: string, meta?: unknown) {
    const entry: LogEntry = {
      time: new Date().toISOString(),
      bot: this.botName,
      level,
      msg,
      meta: meta || null,
    };
    this.entries.push(entry);

    if (this.verbose) {
      const icons: Record<string, string> = {
        INFO: "i",
        OK: "v",
        WARN: "!",
        ERROR: "x",
        STEP: "#",
        TEST: "T",
        FIX: "F",
        SEC: "S",
        DATA: "D",
      };
      console.log(`[${this.botName}] ${icons[level] || ">"} ${msg}`);
      if (meta) console.log(`   > meta:`, meta);
    }
  }

  info(msg: string, meta?: unknown) { this._push("INFO", msg, meta); }
  ok(msg: string, meta?: unknown) { this._push("OK", msg, meta); }
  warn(msg: string, meta?: unknown) { this._push("WARN", msg, meta); }
  error(msg: string, meta?: unknown) { this._push("ERROR", msg, meta); }
  step(msg: string, meta?: unknown) { this._push("STEP", msg, meta); }
  test(msg: string, meta?: unknown) { this._push("TEST", msg, meta); }
  fix(msg: string, meta?: unknown) { this._push("FIX", msg, meta); }
  sec(msg: string, meta?: unknown) { this._push("SEC", msg, meta); }
  data(msg: string, meta?: unknown) { this._push("DATA", msg, meta); }
}

/* ------------------------------------------------------------------ */
/*  Base44 Adapter (stub)                                              */
/* ------------------------------------------------------------------ */

export class Base44Adapter {
  baseUrl: string | null;
  apiKey: string | null;
  logger: Logger | undefined;

  constructor({ baseUrl, apiKey, logger }: { baseUrl?: string; apiKey?: string; logger?: Logger } = {}) {
    this.baseUrl = baseUrl || null;
    this.apiKey = apiKey || null;
    this.logger = logger;
  }

  async health() {
    return { ok: true, source: "stub", ts: Date.now() };
  }

  async createRecord({ table, data }: { table: string; data: unknown }) {
    this.logger?.data(`(stub) createRecord -> ${table}`, { data });
    return { ok: true, id: `stub_${Math.random().toString(16).slice(2)}`, data };
  }

  async updateRecord({ table, id, patch }: { table: string; id: string; patch: unknown }) {
    this.logger?.data(`(stub) updateRecord -> ${table}/${id}`, { patch });
    return { ok: true, id, patch };
  }

  async query({ table, filter }: { table: string; filter: unknown }) {
    this.logger?.data(`(stub) query -> ${table}`, { filter });
    return { ok: true, rows: [] };
  }
}

/* ------------------------------------------------------------------ */
/*  BaseBot                                                            */
/* ------------------------------------------------------------------ */

export class BaseBot {
  name: string;
  role: string;
  authority: string;
  verbose: boolean;
  projectRoot: string;
  reportsDir: string;
  logger: Logger;
  stats: BotStats;
  base44: Base44Adapter;
  bashFixer: BashFixer;
  policy: { allowDelete: boolean; requireApprovalForProd: boolean; environment: string };

  constructor(config: BotConfig = {}) {
    this.name = config.name || "Bot";
    this.role = config.role || "Unknown";
    this.authority = config.authority || "L0";
    this.verbose = config.verbose !== false;

    this.projectRoot = config.projectRoot || process.cwd();
    this.reportsDir = config.reportsDir || path.join(this.projectRoot, "bot-reports");

    this.logger = new Logger({ botName: this.name, verbose: this.verbose });

    this.stats = {
      startedAt: new Date().toISOString(),
      actions: 0,
      successes: 0,
      failures: 0,
      steps: [],
    };

    this.base44 = new Base44Adapter({
      baseUrl: config.base44BaseUrl,
      apiKey: config.base44ApiKey,
      logger: this.logger,
    });

    this.bashFixer = new BashFixer({
      logger: this.logger,
      llmClient: config.llmClient || null,
    });

    this.policy = {
      allowDelete: !!config.allowDelete,
      requireApprovalForProd: config.requireApprovalForProd !== false,
      environment: config.environment || "dev",
    };
  }

  step(name: string) {
    this.stats.steps.push({ name, at: new Date().toISOString() });
    this.logger.step(name);
  }

  actionOk() { this.stats.actions++; this.stats.successes++; }
  actionFail() { this.stats.actions++; this.stats.failures++; }

  ensureReportsDir() {
    if (!fs.existsSync(this.reportsDir)) fs.mkdirSync(this.reportsDir, { recursive: true });
  }

  writeReport(extra: Record<string, unknown> = {}) {
    this.ensureReportsDir();
    const finishedAt = new Date().toISOString();
    const report = {
      bot: { name: this.name, role: this.role, authority: this.authority },
      env: this.policy.environment,
      stats: { ...this.stats, finishedAt },
      log: this.logger.entries,
      extra,
    };

    const safeName = this.name.replace(/[^a-z0-9_-]/gi, "_");
    const file = path.join(this.reportsDir, `${safeName}_${Date.now()}.json`);
    fs.writeFileSync(file, JSON.stringify(report, null, 2), "utf-8");
    this.logger.ok(`Report saved -> ${file}`);
    return { file, report };
  }

  // ---- Hooks that subclasses implement ----
  async plan(): Promise<{ ok: boolean; notes?: string }> { return { ok: true, notes: "No plan" }; }
  async execute(): Promise<{ ok: boolean; notes?: string }> { return { ok: true, notes: "No execute" }; }
  async verify(): Promise<{ ok: boolean; notes?: string }> { return { ok: true, notes: "No verify" }; }

  // ---- Run Template ----
  async run() {
    this.logger.info(`Starting (${this.role}) | env=${this.policy.environment}`);

    try {
      this.step("Health check");
      const health = await this.base44.health();
      this.actionOk();
      if (!health.ok) throw new Error("Base44 health failed");

      this.step("Plan");
      const planRes = await this.plan();
      this.actionOk();
      if (!planRes?.ok) throw new Error("Plan failed");

      this.step("Execute");
      const execRes = await this.execute();
      this.actionOk();
      if (!execRes?.ok) throw new Error("Execute failed");

      this.step("Verify");
      const verRes = await this.verify();
      this.actionOk();
      if (!verRes?.ok) throw new Error("Verify failed");

      return this.writeReport({ health, planRes, execRes, verRes });
    } catch (err: unknown) {
      this.actionFail();
      const message = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      this.logger.error(`Run failed: ${message}`);
      return this.writeReport({ error: { message, stack } });
    }
  }
}
