interface CallRecord {
  id: string;
  ts: number;
  durationMs: number;
  ok: boolean;
  errorType?: string;
  tokens?: number;
  model: string;
}

export class KimiMonitor {
  private calls: CallRecord[] = [];
  private maxHistory = 500;
  private alertCallbacks: Array<(alert: KimiAlert) => void> = [];

  private errorRateThreshold = 0.3;
  private latencyP95Threshold = 10000;
  private minSampleSize = 10;

  record(record: CallRecord) {
    this.calls.push(record);
    if (this.calls.length > this.maxHistory) this.calls.shift();
    this.analyze();
  }

  onAlert(cb: (alert: KimiAlert) => void) {
    this.alertCallbacks.push(cb);
  }

  private emit(alert: KimiAlert) {
    this.alertCallbacks.forEach((cb) => cb(alert));
    console.warn(`[KimiMonitor ALERT] ${alert.type}: ${alert.message}`);
  }

  private analyze() {
    const recent = this.calls.slice(-50);
    if (recent.length < this.minSampleSize) return;

    const errorRate = recent.filter((c) => !c.ok).length / recent.length;
    const durations = recent
      .filter((c) => c.ok)
      .map((c) => c.durationMs)
      .sort((a, b) => a - b);
    const p95 = durations[Math.floor(durations.length * 0.95)] ?? 0;

    if (errorRate > this.errorRateThreshold) {
      this.emit({
        type: "HIGH_ERROR_RATE",
        message: `שיעור שגיאות: ${Math.round(errorRate * 100)}%`,
        value: errorRate,
      });
    }
    if (p95 > this.latencyP95Threshold) {
      this.emit({
        type: "HIGH_LATENCY",
        message: `P95 השהיה: ${p95}ms`,
        value: p95,
      });
    }
  }

  stats(windowMs = 60_000) {
    const now = Date.now();
    const window = this.calls.filter((c) => now - c.ts < windowMs);
    const ok = window.filter((c) => c.ok);
    const durations = ok.map((c) => c.durationMs).sort((a, b) => a - b);

    const p50 = durations[Math.floor(durations.length * 0.5)] ?? 0;
    const p95 = durations[Math.floor(durations.length * 0.95)] ?? 0;
    const p99 = durations[Math.floor(durations.length * 0.99)] ?? 0;

    const errorsByType: Record<string, number> = {};
    window
      .filter((c) => !c.ok)
      .forEach((c) => {
        errorsByType[c.errorType ?? "unknown"] =
          (errorsByType[c.errorType ?? "unknown"] ?? 0) + 1;
      });

    return {
      period_ms: windowMs,
      total_calls: window.length,
      successful: ok.length,
      failed: window.length - ok.length,
      error_rate: window.length
        ? `${Math.round((1 - ok.length / window.length) * 100)}%`
        : "0%",
      latency_p50: `${p50}ms`,
      latency_p95: `${p95}ms`,
      latency_p99: `${p99}ms`,
      total_tokens: ok.reduce((s, c) => s + (c.tokens ?? 0), 0),
      errors_by_type: errorsByType,
    };
  }
}

export interface KimiAlert {
  type: "HIGH_ERROR_RATE" | "HIGH_LATENCY" | "CIRCUIT_OPEN" | "QUOTA_WARNING";
  message: string;
  value?: number;
}

export const globalMonitor = new KimiMonitor();
