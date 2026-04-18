type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

export class CircuitBreaker {
  private state: CircuitState = "CLOSED";
  private failures = 0;
  private lastFailureTime = 0;
  private onStateChange?: (from: CircuitState, to: CircuitState) => void;

  constructor(
    private maxFailures: number = 5,
    private resetTimeoutMs: number = 60_000,
    private halfOpenMaxAttempts: number = 2,
    onStateChange?: (from: CircuitState, to: CircuitState) => void
  ) {
    this.onStateChange = onStateChange;
  }

  private transition(to: CircuitState) {
    if (this.state === to) return;
    const from = this.state;
    this.state = to;
    this.onStateChange?.(from, to);
  }

  async call<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === "OPEN") {
      if (Date.now() - this.lastFailureTime >= this.resetTimeoutMs) {
        this.transition("HALF_OPEN");
      } else {
        throw new Error("Circuit breaker פתוח — Kimi לא זמין זמנית");
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  private onSuccess() {
    this.failures = 0;
    if (this.state === "HALF_OPEN") {
      this.transition("CLOSED");
    }
  }

  private onFailure() {
    this.failures++;
    this.lastFailureTime = Date.now();
    if (this.failures >= this.maxFailures) {
      this.transition("OPEN");
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  getFailures(): number {
    return this.failures;
  }

  isAvailable(): boolean {
    if (this.state === "CLOSED") return true;
    if (this.state === "OPEN") {
      return Date.now() - this.lastFailureTime >= this.resetTimeoutMs;
    }
    return true;
  }

  reset() {
    this.failures = 0;
    this.transition("CLOSED");
  }
}
