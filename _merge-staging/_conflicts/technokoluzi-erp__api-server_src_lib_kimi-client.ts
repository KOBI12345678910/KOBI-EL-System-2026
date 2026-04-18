import { getPrimaryProvider, resolveModel } from "./ai-provider";

export interface KimiMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface KimiRequest {
  messages: KimiMessage[];
  model?: string;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

export interface KimiResponse {
  id: string;
  choices: Array<{
    message: KimiMessage;
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface KimiClientConfig {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  maxTokens?: number;
  temperature?: number;
  debug?: boolean;
}

export type KimiError =
  | { type: "timeout"; message: string }
  | { type: "rate_limit"; message: string; retryAfter?: number }
  | { type: "auth"; message: string }
  | { type: "quota"; message: string }
  | { type: "server"; message: string; status: number }
  | { type: "network"; message: string }
  | { type: "parse"; message: string }
  | { type: "empty"; message: string };

class Logger {
  constructor(private debug: boolean) {}

  log(level: "INFO" | "WARN" | "ERROR", msg: string, data?: unknown) {
    const ts = new Date().toISOString();
    const prefix = `[Kimi ${level}] ${ts}`;
    if (level === "ERROR" || this.debug) {
      console[level === "ERROR" ? "error" : level === "WARN" ? "warn" : "log"](
        `${prefix} ${msg}`,
        data !== undefined ? data : ""
      );
    }
  }
}

class RateLimiter {
  private queue: Array<() => void> = [];
  private running = 0;
  private lastCallTime = 0;

  constructor(
    private maxConcurrent: number = 3,
    private minIntervalMs: number = 200
  ) {}

  async throttle<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        const now = Date.now();
        const wait = Math.max(0, this.minIntervalMs - (now - this.lastCallTime));
        if (wait > 0) await sleep(wait);
        this.lastCallTime = Date.now();
        try {
          resolve(await fn());
        } catch (e) {
          reject(e);
        } finally {
          this.running--;
          this.processQueue();
        }
      });
      this.processQueue();
    });
  }

  private processQueue() {
    while (this.running < this.maxConcurrent && this.queue.length > 0) {
      this.running++;
      this.queue.shift()!();
    }
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function classifyError(status: number, body: string): KimiError {
  if (status === 401 || status === 403)
    return {
      type: "auth",
      message: `אימות נכשל (${status}). יש לבדוק את KIMI_API_KEY.`,
    };
  if (status === 429)
    return {
      type: "rate_limit",
      message: "חריגה ממגבלת קצב. מנסה שוב עם השהיה.",
      retryAfter: 5,
    };
  if (status === 402 || body.includes("quota") || body.includes("billing"))
    return { type: "quota", message: "חריגה ממכסת API או בעיית חיוב." };
  if (status >= 500)
    return {
      type: "server",
      message: `שגיאת שרת Kimi (${status}). מנסה שוב.`,
      status,
    };
  return {
    type: "server",
    message: `סטטוס לא צפוי ${status}: ${body}`,
    status,
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("__TIMEOUT__")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function getKimiTemperature(model: string, userTemp?: number): number {
  if (model.startsWith("kimi-k2")) return 1;
  return userTemp ?? 0.4;
}

export class KimiClient {
  private config: Required<KimiClientConfig>;
  private logger: Logger;
  private limiter: RateLimiter;

  constructor(config: KimiClientConfig) {
    if (!config.apiKey || config.apiKey.trim() === "") {
      throw new Error(
        "KimiClient: apiKey נדרש. יש להגדיר KIMI_API_KEY."
      );
    }

    this.config = {
      apiKey: config.apiKey,
      model: config.model ?? "kimi-k2.5",
      baseUrl: config.baseUrl ?? "https://api.moonshot.ai/v1",
      timeoutMs: config.timeoutMs ?? 30_000,
      maxRetries: config.maxRetries ?? 3,
      retryDelayMs: config.retryDelayMs ?? 1_000,
      maxTokens: config.maxTokens ?? 16384,
      temperature: config.temperature ?? 1,
      debug: config.debug ?? false,
    };

    this.logger = new Logger(this.config.debug);
    this.limiter = new RateLimiter(3, 200);
  }

  async chat(request: KimiRequest): Promise<string> {
    return this.limiter.throttle(() => this._chatWithRetry(request));
  }

  private async _chatWithRetry(request: KimiRequest): Promise<string> {
    const actualModel = resolveModel(
      request.model ?? this.config.model,
      { type: "kimi", apiKey: this.config.apiKey, baseUrl: this.config.baseUrl }
    );
    const temperature = getKimiTemperature(
      actualModel,
      request.temperature ?? this.config.temperature
    );

    const body = JSON.stringify({
      model: actualModel,
      temperature,
      max_tokens: request.max_tokens ?? this.config.maxTokens,
      messages: request.messages,
      stream: false,
    });

    let lastError: KimiError | null = null;

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      this.logger.log("INFO", `ניסיון ${attempt}/${this.config.maxRetries}`);

      try {
        const raw = await withTimeout(
          fetch(`${this.config.baseUrl}/chat/completions`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${this.config.apiKey}`,
            },
            body,
          }),
          this.config.timeoutMs
        );

        if (!raw.ok) {
          const text = await raw.text().catch(() => "");
          const err = classifyError(raw.status, text);
          this.logger.log("WARN", `שגיאת API בניסיון ${attempt}`, err);
          lastError = err;

          if (err.type === "auth" || err.type === "quota") throw err;

          const delay =
            err.type === "rate_limit"
              ? (err.retryAfter ?? 5) * 1000
              : this.config.retryDelayMs * Math.pow(2, attempt - 1);

          if (attempt < this.config.maxRetries) {
            this.logger.log("INFO", `מנסה שוב בעוד ${delay}ms...`);
            await sleep(delay);
          }
          continue;
        }

        const json = (await raw.json()) as KimiResponse;
        const content = json?.choices?.[0]?.message?.content;

        if (!content || content.trim() === "") {
          lastError = { type: "empty", message: "Kimi החזיר תשובה ריקה." };
          this.logger.log("WARN", "תשובה ריקה", json);
          if (attempt < this.config.maxRetries) {
            await sleep(this.config.retryDelayMs);
            continue;
          }
          throw lastError;
        }

        this.logger.log(
          "INFO",
          `OK — טוקנים: ${json.usage?.total_tokens ?? "?"}`
        );
        return content.trim();
      } catch (err: unknown) {
        if (err instanceof Error && err.message === "__TIMEOUT__") {
          lastError = {
            type: "timeout",
            message: `הבקשה חרגה מזמן מקסימלי ${this.config.timeoutMs}ms`,
          };
          this.logger.log("WARN", `Timeout בניסיון ${attempt}`);
          if (attempt < this.config.maxRetries) {
            await sleep(this.config.retryDelayMs * attempt);
            continue;
          }
          throw lastError;
        }
        if (err instanceof Error && !("type" in err)) {
          lastError = {
            type: "network",
            message: `שגיאת רשת: ${err.message}`,
          };
          this.logger.log(
            "WARN",
            `שגיאת רשת בניסיון ${attempt}`,
            err.message
          );
          if (attempt < this.config.maxRetries) {
            await sleep(this.config.retryDelayMs * attempt);
            continue;
          }
          throw lastError;
        }
        throw err;
      }
    }

    throw lastError ?? { type: "server", message: "כל הניסיונות נכשלו", status: 0 };
  }

  async ask(prompt: string, systemPrompt?: string): Promise<string> {
    const messages: KimiMessage[] = [];
    if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
    messages.push({ role: "user", content: prompt });
    return this.chat({ messages });
  }

  async runTask(task: {
    systemPrompt: string;
    userMessage: string;
    onSuccess?: (result: string) => Promise<void>;
    onError?: (err: KimiError) => void;
  }): Promise<string | null> {
    try {
      const result = await this.ask(task.userMessage, task.systemPrompt);
      if (task.onSuccess) await task.onSuccess(result);
      return result;
    } catch (err) {
      const kimiErr = err as KimiError;
      this.logger.log("ERROR", `משימה נכשלה: ${kimiErr.message}`, kimiErr);
      if (task.onError) task.onError(kimiErr);
      return null;
    }
  }

  async healthCheck(): Promise<{
    ok: boolean;
    latencyMs: number;
    error?: string;
  }> {
    const start = Date.now();
    try {
      await this.ask("Say OK", "You are a health check. Reply with just OK.");
      return { ok: true, latencyMs: Date.now() - start };
    } catch (e) {
      const err = e as KimiError;
      return { ok: false, latencyMs: Date.now() - start, error: err.message };
    }
  }
}

let _instance: KimiClient | null = null;

export function getKimiClient(
  config?: Partial<KimiClientConfig>
): KimiClient {
  if (!_instance) {
    const provider = getPrimaryProvider();
    const apiKey = config?.apiKey ?? provider?.apiKey ?? process.env.KIMI_API_KEY ?? "";
    const baseUrl = config?.baseUrl ?? provider?.baseUrl ?? "https://api.moonshot.ai/v1";
    _instance = new KimiClient({ apiKey, baseUrl, ...config });
  }
  return _instance;
}

export function resetKimiClient() {
  _instance = null;
}
