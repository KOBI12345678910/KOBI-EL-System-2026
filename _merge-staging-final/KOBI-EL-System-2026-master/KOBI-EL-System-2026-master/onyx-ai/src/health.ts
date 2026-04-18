/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  ONYX AI — Health & Readiness Routes
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Adds two cheap, unauthenticated probes that a load balancer / k8s /
 *  uptime monitor can poll to decide whether the process is alive and
 *  whether it is ready to accept traffic.
 *
 *  GET /health  — liveness probe. 200 whenever the process is up.
 *                 Body: { status: 'ok', uptime, version, policies, budget }
 *
 *  GET /ready   — readiness probe. 200 only when the event store has been
 *                 initialised; 503 otherwise.
 *
 *  Designed to be wired into the existing `APIServer` or (preferred) any
 *  Express-compatible `app`. This module intentionally does NOT import from
 *  `./index` or `./onyx-platform` — the caller injects the live platform
 *  reference so that this file stays a leaf and is safe to unit-test in
 *  isolation.
 *
 *  See INSTRUCTIONS_TO_WIRE.md for the snippet that connects this into
 *  src/index.ts without editing the existing bootstrap code.
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ─────────────────────────────────────────────────────────────────────────
// Minimal structural types so that this file has zero dependencies on
// other modules in the repo. Anything that walks like a duck will work.
// ─────────────────────────────────────────────────────────────────────────

export interface HealthPlatformLike {
  /** Optional: exposes compliance info (policy count, budget utilisation). */
  governor?: {
    getPolicies?: () => Array<unknown>;
    getComplianceReport?: () => {
      totalPolicies: number;
      activePolicies: number;
      killSwitchActive: boolean;
      budgetUtilization: Record<string, { spent: number; limit: number; percent: number }>;
      rateLimitUtilization?: Record<string, { available: number }>;
    };
  };
  /** Optional: event store. `ready` checks its presence. */
  eventStore?: {
    size?: number;
    lastSequence?: number;
  };
}

/** Minimal express-like surface so we don't hard-depend on @types/express here. */
export interface ExpressLikeApp {
  get: (path: string, handler: (req: unknown, res: ExpressLikeResponse) => void) => void;
}

export interface ExpressLikeResponse {
  status: (code: number) => ExpressLikeResponse;
  json: (body: unknown) => void;
}

export interface RegisterHealthRoutesOptions {
  /** Live platform reference — used to populate health payloads. */
  platform?: HealthPlatformLike;
  /** Override version string (defaults to package.json or '0.0.0'). */
  version?: string;
  /** Timestamp (ms) used as the process start — defaults to now() on load. */
  startedAtMs?: number;
}

// ─────────────────────────────────────────────────────────────────────────
// Module-scoped start timestamp. The first import captures "process up".
// Consumers that want precise uptime can override via `options.startedAtMs`.
// ─────────────────────────────────────────────────────────────────────────

const MODULE_START_MS = Date.now();

/** Resolve a version string without hard-coding it. */
function resolveVersion(override?: string): string {
  if (override && override.trim().length > 0) return override;
  try {
    // Best-effort — avoids a hard require so this still compiles when
    // package.json is not on the runtime path (e.g., ncc bundles).
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pkg = require('../package.json');
    if (pkg && typeof pkg.version === 'string') return pkg.version;
  } catch {
    /* ignore — fall through */
  }
  return process.env.ONYX_AI_VERSION || '0.0.0';
}

/** Shape returned from GET /health. */
export interface HealthPayload {
  status: 'ok';
  uptime: number;       // seconds
  version: string;
  policies: number;     // total policies registered
  budget: {
    killSwitchActive: boolean;
    totalPolicies: number;
    activePolicies: number;
    utilization: Record<string, { spent: number; limit: number; percent: number }>;
  } | null;
  timestamp: number;
  pid: number;
  node: string;
}

/** Shape returned from GET /ready. */
export interface ReadyPayload {
  ready: boolean;
  reason?: string;
  eventStoreSize?: number;
  timestamp: number;
}

/**
 * Build the /health response body. Exported separately so it can be
 * unit-tested and reused by non-Express transports.
 */
export function buildHealthPayload(
  platform?: HealthPlatformLike,
  version?: string,
  startedAtMs: number = MODULE_START_MS,
): HealthPayload {
  const uptime = Math.max(0, (Date.now() - startedAtMs) / 1000);

  let policyCount = 0;
  let budget: HealthPayload['budget'] = null;

  try {
    const g = platform?.governor;
    if (g?.getPolicies) {
      const list = g.getPolicies();
      policyCount = Array.isArray(list) ? list.length : 0;
    }
    if (g?.getComplianceReport) {
      const report = g.getComplianceReport();
      policyCount = report.totalPolicies ?? policyCount;
      budget = {
        killSwitchActive: !!report.killSwitchActive,
        totalPolicies: report.totalPolicies ?? 0,
        activePolicies: report.activePolicies ?? 0,
        utilization: report.budgetUtilization ?? {},
      };
    }
  } catch {
    // Health must never throw — degrade gracefully.
    budget = null;
  }

  return {
    status: 'ok',
    uptime,
    version: resolveVersion(version),
    policies: policyCount,
    budget,
    timestamp: Date.now(),
    pid: process.pid,
    node: process.version,
  };
}

/**
 * Build the /ready response body. Ready iff the event store has been
 * initialised (size is a number, even zero counts as initialised — what
 * matters is that the store object exists).
 */
export function buildReadyPayload(platform?: HealthPlatformLike): ReadyPayload {
  const store = platform?.eventStore;
  if (!store) {
    return {
      ready: false,
      reason: 'event store not initialized',
      timestamp: Date.now(),
    };
  }
  // Accept either a numeric .size getter or undefined-but-present store.
  const size = typeof store.size === 'number' ? store.size : undefined;
  return {
    ready: true,
    eventStoreSize: size,
    timestamp: Date.now(),
  };
}

/**
 * registerHealthRoutes(app, options?)
 *
 * Adds GET /health and GET /ready to an Express-like app. Will also work
 * with any object that exposes `app.get(path, handler)` where `handler`
 * receives a `res` with `.status(code).json(body)` — that covers Express,
 * Fastify (adapter), and most test doubles.
 *
 * The function is intentionally pure side-effect: it attaches the routes
 * and returns. Call it once, after constructing the platform.
 */
export function registerHealthRoutes(
  app: ExpressLikeApp,
  options: RegisterHealthRoutesOptions = {},
): void {
  if (!app || typeof app.get !== 'function') {
    throw new Error('registerHealthRoutes: app must expose a .get(path, handler) method');
  }

  const { platform, version, startedAtMs } = options;

  app.get('/health', (_req, res) => {
    try {
      const body = buildHealthPayload(platform, version, startedAtMs);
      res.status(200).json(body);
    } catch (err) {
      // Absolute last-resort fallback so /health cannot 500 under any
      // circumstance — orchestrators rely on this probe being dead-simple.
      res.status(200).json({
        status: 'ok',
        uptime: Math.max(0, (Date.now() - (startedAtMs ?? MODULE_START_MS)) / 1000),
        version: resolveVersion(version),
        policies: 0,
        budget: null,
        timestamp: Date.now(),
        pid: process.pid,
        node: process.version,
        degraded: true,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  app.get('/ready', (_req, res) => {
    try {
      const body = buildReadyPayload(platform);
      res.status(body.ready ? 200 : 503).json(body);
    } catch (err) {
      res.status(503).json({
        ready: false,
        reason: err instanceof Error ? err.message : String(err),
        timestamp: Date.now(),
      });
    }
  });
}

/**
 * Adapter for the existing node:http-based `APIServer` inside src/index.ts.
 *
 * The platform's built-in APIServer does NOT use Express — it uses a raw
 * http.Server where routes are matched inside a `route(method, path, body)`
 * method. This helper returns the two health responses so that code can be
 * inserted into that switch WITHOUT editing this file again.
 *
 * Usage (suggested — see INSTRUCTIONS_TO_WIRE.md):
 *
 *   import { handleRawHealthRoute } from './health';
 *   // inside APIServer.route(method, path, ...):
 *   const hit = handleRawHealthRoute(method, path, onyxPlatform);
 *   if (hit) return hit;
 */
export function handleRawHealthRoute(
  method: string,
  path: string,
  platform?: HealthPlatformLike,
  options: Omit<RegisterHealthRoutesOptions, 'platform'> = {},
): { status: number; body: Record<string, unknown> } | null {
  if (method !== 'GET') return null;
  if (path === '/health') {
    return {
      status: 200,
      body: buildHealthPayload(platform, options.version, options.startedAtMs) as unknown as Record<string, unknown>,
    };
  }
  if (path === '/ready') {
    const body = buildReadyPayload(platform);
    return {
      status: body.ready ? 200 : 503,
      body: body as unknown as Record<string, unknown>,
    };
  }
  return null;
}
