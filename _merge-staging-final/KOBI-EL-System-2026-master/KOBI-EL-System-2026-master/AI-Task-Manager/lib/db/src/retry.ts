const TRANSIENT_ERROR_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ENOTFOUND",
  "ETIMEDOUT",
  "EPIPE",
  "57P01",
  "08006",
  "08001",
  "08004",
]);

interface NodeError {
  code?: string;
  message?: string;
}

function toNodeError(err: unknown): NodeError {
  if (err !== null && typeof err === "object") {
    return err as NodeError;
  }
  return {};
}

function isTransientError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const { code, message } = toNodeError(err);
  if (code && TRANSIENT_ERROR_CODES.has(code)) return true;
  if (
    message &&
    (message.includes("Connection terminated") ||
      message.includes("connection timeout") ||
      message.includes("Connection refused") ||
      message.includes("timeout exceeded when trying to connect") ||
      message.includes("remaining connection slots are reserved") ||
      message.includes("sorry, too many clients already"))
  ) {
    return true;
  }
  return false;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { maxAttempts?: number; baseDelayMs?: number; label?: string } = {}
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 3;
  const baseDelayMs = opts.baseDelayMs ?? 200;
  const label = opts.label ?? "DB query";

  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isTransientError(err) || attempt === maxAttempts) {
        throw err;
      }
      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      const errMsg = toNodeError(err).message ?? String(err);
      console.warn(
        `[DB Retry] ${label} attempt ${attempt}/${maxAttempts} failed (${errMsg}), retrying in ${delay}ms`
      );
      await new Promise<void>((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastErr;
}
