// ============================================================
// FILE: supabase/functions/_shared/logger.ts
// ============================================================

type LogLevel = "info" | "warn" | "error";

function emit(level: LogLevel, event: string, payload?: Record<string, unknown>) {
  const record = {
    ts: new Date().toISOString(),
    level,
    event,
    ...payload,
  };

  console.log(JSON.stringify(record));
}

export function logInfo(event: string, payload?: Record<string, unknown>) {
  emit("info", event, payload);
}

export function logWarn(event: string, payload?: Record<string, unknown>) {
  emit("warn", event, payload);
}

export function logError(event: string, payload?: Record<string, unknown>) {
  emit("error", event, payload);
}
