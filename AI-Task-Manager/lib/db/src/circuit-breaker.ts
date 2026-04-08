const FAILURE_THRESHOLD = 3;
const RECOVERY_TIMEOUT_MS = 10000;
const HALF_OPEN_PROBE_LIMIT = 1;

type CircuitState = "closed" | "open" | "half-open";

interface CircuitBreakerState {
  state: CircuitState;
  failureCount: number;
  lastFailureAt: number;
  halfOpenProbes: number;
}

const breakers = new Map<string, CircuitBreakerState>();

function getBreaker(name: string): CircuitBreakerState {
  if (!breakers.has(name)) {
    breakers.set(name, {
      state: "closed",
      failureCount: 0,
      lastFailureAt: 0,
      halfOpenProbes: 0,
    });
  }
  return breakers.get(name)!;
}

function recordSuccess(breaker: CircuitBreakerState): void {
  breaker.failureCount = 0;
  breaker.state = "closed";
  breaker.halfOpenProbes = 0;
}

function recordFailure(breaker: CircuitBreakerState): void {
  breaker.failureCount += 1;
  breaker.lastFailureAt = Date.now();
  if (breaker.failureCount >= FAILURE_THRESHOLD) {
    breaker.state = "open";
    breaker.halfOpenProbes = 0;
  }
}

function isAvailable(breaker: CircuitBreakerState): boolean {
  if (breaker.state === "closed") return true;
  if (breaker.state === "open") {
    const elapsed = Date.now() - breaker.lastFailureAt;
    if (elapsed >= RECOVERY_TIMEOUT_MS) {
      breaker.state = "half-open";
      breaker.halfOpenProbes = 0;
      return true;
    }
    return false;
  }
  if (breaker.state === "half-open") {
    if (breaker.halfOpenProbes < HALF_OPEN_PROBE_LIMIT) {
      breaker.halfOpenProbes += 1;
      return true;
    }
    return false;
  }
  return false;
}

export class CircuitOpenError extends Error {
  constructor(name: string) {
    super(`Circuit breaker open for: ${name}`);
    this.name = "CircuitOpenError";
  }
}

const DEFAULT_TIMEOUT_MS = 3000;

export async function withCircuitBreaker<T>(
  name: string,
  fn: () => Promise<T>,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<T> {
  const breaker = getBreaker(name);
  if (!isAvailable(breaker)) {
    throw new CircuitOpenError(name);
  }
  try {
    const result = await Promise.race([
      fn(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Circuit breaker timeout (${name}): ${timeoutMs}ms`)), timeoutMs)
      ),
    ]);
    recordSuccess(breaker);
    return result;
  } catch (err) {
    recordFailure(breaker);
    throw err;
  }
}
