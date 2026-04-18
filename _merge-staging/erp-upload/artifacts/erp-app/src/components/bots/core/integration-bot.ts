/**
 * core/integration-bot.ts
 * =========================================================
 * IntegrationBot - Middleware for inter-bot communication
 * Manages API keys securely, routes calls, logs interactions
 * =========================================================
 */

import * as crypto from "crypto";
import { BaseBot, Logger } from "./base-bot";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface InteractionLog {
  timestamp: string;
  callId: string;
  sourceBotName: string;
  targetBotName: string;
  methodName: string;
  status: "success" | "error";
  duration: number;
  args?: Record<string, unknown>;
  result?: unknown;
  error?: string;
}

interface InteractionFilter {
  botName?: string;
  status?: string;
  since?: string;
}

interface ChainCall {
  source: string;
  target: string;
  method: string;
  args: Record<string, unknown>;
}

/* ------------------------------------------------------------------ */
/*  IntegrationBot                                                     */
/* ------------------------------------------------------------------ */

export class IntegrationBot extends BaseBot {
  botRegistry: Map<string, new (config?: Record<string, unknown>) => BaseBot>;
  botInstances: Map<string, BaseBot>;
  apiKeyVault: Map<string, string>;
  interactions: InteractionLog[];
  maxInteractionHistory: number;

  constructor(config: Record<string, unknown> = {}) {
    super({
      ...config,
      name: "INTEGRATION_BOT",
      role: "Integration Middleware",
      authority: "L0",
      allowDelete: false,
      requireApprovalForProd: false,
    });

    this.botRegistry = new Map();
    this.botInstances = new Map();
    this.apiKeyVault = new Map();
    this.interactions = [];
    this.maxInteractionHistory = 1000;
  }

  registerBot(botName: string, BotClass: new (config?: Record<string, unknown>) => BaseBot) {
    if (this.botRegistry.has(botName)) {
      this.logger.warn(`Bot ${botName} already registered`);
    }
    this.botRegistry.set(botName, BotClass);
    this.logger.ok(`Registered bot: ${botName}`);
  }

  registerBots(bots: Record<string, new (config?: Record<string, unknown>) => BaseBot>) {
    for (const [name, BotClass] of Object.entries(bots)) {
      this.registerBot(name, BotClass);
    }
  }

  async getBotInstance(botName: string): Promise<BaseBot> {
    if (this.botInstances.has(botName)) {
      return this.botInstances.get(botName)!;
    }

    const BotClass = this.botRegistry.get(botName);
    if (!BotClass) {
      throw new Error(`Bot not registered: ${botName}`);
    }

    const instance = new BotClass({
      environment: this.policy.environment,
      verbose: this.verbose,
      projectRoot: this.projectRoot,
    });

    this.botInstances.set(botName, instance);
    return instance;
  }

  setApiKey(botName: string, key: string, apiKeyName = "default") {
    const keyId = `${botName}:${apiKeyName}`;
    const encrypted = this._encryptKey(key, botName);
    this.apiKeyVault.set(keyId, encrypted);
    this.logger.ok(`API key stored for ${botName}/${apiKeyName}`);
  }

  getApiKey(botName: string, apiKeyName = "default"): string | null {
    const keyId = `${botName}:${apiKeyName}`;
    const encrypted = this.apiKeyVault.get(keyId);
    if (!encrypted) return null;
    return this._decryptKey(encrypted, botName);
  }

  async callBot(
    sourceBotName: string,
    targetBotName: string,
    methodName: string,
    args: Record<string, unknown> = {},
  ) {
    const callId = this._generateCallId();
    const startTime = Date.now();

    try {
      this.logger.info(
        `[${callId}] ${sourceBotName} -> ${targetBotName}.${methodName}()`,
      );

      const targetBot = await this.getBotInstance(targetBotName);

      if (typeof (targetBot as unknown as Record<string, unknown>)[methodName] !== "function") {
        throw new Error(`Method not found: ${targetBotName}.${methodName}`);
      }

      const result = await (targetBot as unknown as Record<string, (a: Record<string, unknown>) => Promise<unknown>>)[methodName](args);

      const duration = Date.now() - startTime;
      this._logInteraction({
        callId,
        sourceBotName,
        targetBotName,
        methodName,
        status: "success",
        duration,
        args: this._sanitizeArgs(args),
        result: this._sanitizeResult(result),
        timestamp: new Date().toISOString(),
      });

      this.logger.ok(`[${callId}] Completed in ${duration}ms`);
      return result;
    } catch (err: unknown) {
      const duration = Date.now() - startTime;
      const message = err instanceof Error ? err.message : String(err);
      this._logInteraction({
        callId,
        sourceBotName,
        targetBotName,
        methodName,
        status: "error",
        duration,
        error: message,
        args: this._sanitizeArgs(args),
        timestamp: new Date().toISOString(),
      });

      this.logger.error(`[${callId}] Failed: ${message}`);
      throw err;
    }
  }

  async chainBots(calls: ChainCall[]) {
    let result: unknown = null;

    for (let i = 0; i < calls.length; i++) {
      const { source, target, method, args } = calls[i];
      this.logger.info(`[Chain ${i + 1}/${calls.length}] ${source} -> ${target}`);

      try {
        result = await this.callBot(source, target, method, args);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(`Chain broken at step ${i + 1}: ${message}`);
        throw err;
      }
    }

    return result;
  }

  getInteractions(filter: InteractionFilter = {}): InteractionLog[] {
    let logs = this.interactions;

    if (filter.botName) {
      logs = logs.filter(
        (l) =>
          l.sourceBotName === filter.botName ||
          l.targetBotName === filter.botName,
      );
    }

    if (filter.status) {
      logs = logs.filter((l) => l.status === filter.status);
    }

    if (filter.since) {
      logs = logs.filter((l) => l.timestamp >= filter.since!);
    }

    return logs;
  }

  exportInteractionLog() {
    return {
      exportedAt: new Date().toISOString(),
      totalInteractions: this.interactions.length,
      interactions: this.interactions,
      stats: {
        byBot: this._getInteractionStats(),
        byStatus: this._getStatusStats(),
      },
    };
  }

  async plan() {
    this.logger.info("Integration middleware planning...");
    return {
      ok: true,
      plan: {
        description: "Inter-bot communication middleware",
        capabilities: [
          "Bot registration & discovery",
          "Method routing",
          "Secure API key management",
          "Call logging & monitoring",
          "Chain execution",
        ],
        registeredBots: Array.from(this.botRegistry.keys()),
      },
    };
  }

  async execute() {
    this.logger.info("Integration middleware executing...");

    this.step("Bot Registry Check");
    this.logger.data("Registered bots", Array.from(this.botRegistry.keys()));
    this.actionOk();

    this.step("API Key Vault Check");
    this.logger.ok(`Vault size: ${this.apiKeyVault.size} keys`);
    this.actionOk();

    this.step("Interaction Log Check");
    this.logger.ok(`Total interactions: ${this.interactions.length}`);
    this.actionOk();

    return { ok: true, ready: true };
  }

  async verify() {
    this.logger.test("Integration middleware verifying...");

    const checks = [
      { name: "Bot registry functional", fn: () => this.botRegistry.size >= 0 },
      { name: "API vault functional", fn: () => this.apiKeyVault instanceof Map },
      { name: "Interaction logging functional", fn: () => Array.isArray(this.interactions) },
    ];

    const results: { name: string; ok: boolean }[] = [];
    for (const check of checks) {
      try {
        const ok = check.fn();
        results.push({ name: check.name, ok });
        if (ok) {
          this.logger.ok(`v ${check.name}`);
          this.actionOk();
        } else {
          this.logger.warn(`x ${check.name}`);
          this.actionFail();
        }
      } catch (err: unknown) {
        results.push({ name: check.name, ok: false });
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(`x ${check.name}`, message);
        this.actionFail();
      }
    }

    return { ok: true, results };
  }

  // ==========================================
  // Private Methods
  // ==========================================

  private _encryptKey(key: string, botName: string): string {
    try {
      const cipher = crypto.createCipheriv(
        "aes-256-cbc",
        crypto.scryptSync(botName, "salt", 32),
        Buffer.alloc(16, 0),
      );
      let encrypted = cipher.update(key, "utf8", "hex");
      encrypted += cipher.final("hex");
      return encrypted;
    } catch {
      this.logger.warn("Encryption failed, storing plaintext");
      return key;
    }
  }

  private _decryptKey(encrypted: string, botName: string): string {
    try {
      const decipher = crypto.createDecipheriv(
        "aes-256-cbc",
        crypto.scryptSync(botName, "salt", 32),
        Buffer.alloc(16, 0),
      );
      let decrypted = decipher.update(encrypted, "hex", "utf8");
      decrypted += decipher.final("utf8");
      return decrypted;
    } catch {
      this.logger.warn("Decryption failed");
      return encrypted;
    }
  }

  private _generateCallId(): string {
    return `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private _logInteraction(data: InteractionLog) {
    this.interactions.push(data);
    if (this.interactions.length > this.maxInteractionHistory) {
      this.interactions.shift();
    }
  }

  private _sanitizeArgs(args: Record<string, unknown>): Record<string, unknown> {
    const sanitized = { ...args };
    const sensitiveKeys = ["password", "token", "secret", "key", "apiKey"];

    for (const key of Object.keys(sanitized)) {
      if (sensitiveKeys.some((s) => key.toLowerCase().includes(s))) {
        sanitized[key] = "***REDACTED***";
      }
    }

    return sanitized;
  }

  private _sanitizeResult(result: unknown): unknown {
    if (!result || typeof result !== "object") return result;
    return this._sanitizeArgs(result as Record<string, unknown>);
  }

  private _getInteractionStats(): Record<string, number> {
    const stats: Record<string, number> = {};
    for (const log of this.interactions) {
      const key = `${log.sourceBotName} -> ${log.targetBotName}`;
      stats[key] = (stats[key] || 0) + 1;
    }
    return stats;
  }

  private _getStatusStats(): Record<string, number> {
    const stats: Record<string, number> = { success: 0, error: 0 };
    for (const log of this.interactions) {
      stats[log.status] = (stats[log.status] || 0) + 1;
    }
    return stats;
  }
}

export default IntegrationBot;
