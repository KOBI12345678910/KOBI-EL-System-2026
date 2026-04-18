import { exec } from "node:child_process";
import os from "node:os";
import { promisify } from "node:util";
import { backgroundPool, pool } from "@workspace/db";
import { logger } from "../lib/logger";
import { createNotificationForRole } from "../lib/notification-service";
import { runServerHealthEscalation } from "../lib/escalation-engine";

const execAsync = promisify(exec);

export type HealthStatus = "healthy" | "warning" | "critical";

export interface CheckResult {
  checkType: string;
  status: HealthStatus;
  value: number | null;
  threshold: number | null;
  details: Record<string, unknown>;
  responseTimeMs: number | null;
}

interface CheckState {
  consecutiveFailures: number;
  lastStatus: HealthStatus;
  escalated: boolean;
}

const CHECK_TYPES = ["http", "database", "memory", "cpu", "disk", "response_time"] as const;
type CheckType = (typeof CHECK_TYPES)[number];

const THRESHOLDS = {
  memory_percent: 85,
  cpu_percent: 90,
  disk_percent: 90,
  response_time_ms: 5000,
};

const ESCALATION_FAILURE_COUNT = 3;
const DEFAULT_INTERVAL_MS = 120_000;
const CPU_SAMPLE_DELAY_MS = 500;
const ADMIN_ROLE = "Super Admin";

function sampleCpuTimes(): { idle: number; total: number } {
  const cpus = os.cpus();
  let totalIdle = 0;
  let totalTick = 0;
  for (const cpu of cpus) {
    for (const type of Object.keys(cpu.times) as Array<keyof typeof cpu.times>) {
      totalTick += cpu.times[type];
    }
    totalIdle += cpu.times.idle;
  }
  return { idle: totalIdle, total: totalTick };
}

const NOTIFICATION_ERROR_COOLDOWN_MS = 60 * 60 * 1000;

export class ServerHealthMonitorService {
  private static _instance: ServerHealthMonitorService | null = null;

  private intervalMs: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private checkStates: Map<CheckType, CheckState> = new Map();
  private baseUrl: string;
  private lastNotificationErrorLogMs: number = 0;

  private constructor(opts?: { intervalMs?: number; baseUrl?: string }) {
    this.intervalMs = opts?.intervalMs ?? DEFAULT_INTERVAL_MS;
    this.baseUrl = opts?.baseUrl ?? `http://localhost:${process.env["PORT"] ?? "3000"}`;
    for (const checkType of CHECK_TYPES) {
      this.checkStates.set(checkType, {
        consecutiveFailures: 0,
        lastStatus: "healthy",
        escalated: false,
      });
    }
  }

  static getInstance(opts?: { intervalMs?: number; baseUrl?: string }): ServerHealthMonitorService {
    if (!ServerHealthMonitorService._instance) {
      ServerHealthMonitorService._instance = new ServerHealthMonitorService(opts);
    }
    return ServerHealthMonitorService._instance;
  }

  start(): void {
    if (this.timer) return;
    logger.info("server_health_monitor_starting", { intervalMs: this.intervalMs });
    this.timer = setInterval(() => {
      this.runAllChecks().catch((err) => {
        logger.error("server_health_monitor_run_error", {
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }, this.intervalMs);
    this.timer.unref?.();
    this.runAllChecks().catch((err) => {
      logger.error("server_health_monitor_initial_run_error", {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      logger.info("server_health_monitor_stopped");
    }
  }

  private async runAllChecks(): Promise<void> {
    const httpCheck = await this.checkHttpAndResponseTime().catch((err): null => {
      logger.error("server_health_monitor_http_check_error", {
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    });

    const [dbResult, memResult, cpuResult, diskResult] = await Promise.allSettled([
      this.checkDatabase(),
      this.checkMemory(),
      this.checkCpu(),
      this.checkDisk(),
    ]);

    const checks: CheckResult[] = [];
    if (httpCheck) {
      checks.push(httpCheck.httpCheck);
      checks.push(httpCheck.responseTimeCheck);
    }
    if (dbResult.status === "fulfilled") checks.push(dbResult.value);
    if (memResult.status === "fulfilled") checks.push(memResult.value);
    if (cpuResult.status === "fulfilled") checks.push(cpuResult.value);
    if (diskResult.status === "fulfilled") checks.push(diskResult.value);

    await this.persistChecks(checks);
    await this.processNotifications(checks);
  }

  private async checkHttpAndResponseTime(): Promise<{
    httpCheck: CheckResult;
    responseTimeCheck: CheckResult;
  }> {
    const start = Date.now();
    try {
      const url = `${this.baseUrl}/api/healthz`;
      const response = await fetch(url, {
        signal: AbortSignal.timeout(10_000),
        headers: { "Cache-Control": "no-store" },
      });
      const responseTimeMs = Date.now() - start;
      const isOk = response.status === 200;

      const rtThreshold = THRESHOLDS.response_time_ms;
      const rtStatus: HealthStatus =
        responseTimeMs >= rtThreshold
          ? "critical"
          : responseTimeMs >= rtThreshold * 0.8
            ? "warning"
            : "healthy";

      return {
        httpCheck: {
          checkType: "http",
          status: isOk ? "healthy" : "critical",
          value: response.status,
          threshold: 200,
          details: { url, statusCode: response.status, responseTimeMs },
          responseTimeMs,
        },
        responseTimeCheck: {
          checkType: "response_time",
          status: isOk ? rtStatus : "critical",
          value: responseTimeMs,
          threshold: rtThreshold,
          details: { url, responseTimeMs },
          responseTimeMs,
        },
      };
    } catch (err) {
      const responseTimeMs = Date.now() - start;
      const errMsg = err instanceof Error ? err.message : String(err);
      return {
        httpCheck: {
          checkType: "http",
          status: "critical",
          value: null,
          threshold: 200,
          details: { error: errMsg },
          responseTimeMs,
        },
        responseTimeCheck: {
          checkType: "response_time",
          status: "critical",
          value: responseTimeMs,
          threshold: THRESHOLDS.response_time_ms,
          details: { error: errMsg, responseTimeMs },
          responseTimeMs,
        },
      };
    }
  }

  private async checkDatabase(): Promise<CheckResult> {
    const start = Date.now();
    let client: import("pg").PoolClient | undefined;
    try {
      client = await backgroundPool.connect();
      await client.query("SELECT 1");
      const responseTimeMs = Date.now() - start;
      return {
        checkType: "database",
        status: "healthy",
        value: 1,
        threshold: null,
        details: { responseTimeMs },
        responseTimeMs,
      };
    } catch (err) {
      const responseTimeMs = Date.now() - start;
      return {
        checkType: "database",
        status: "critical",
        value: 0,
        threshold: null,
        details: { error: err instanceof Error ? err.message : String(err) },
        responseTimeMs,
      };
    } finally {
      client?.release();
    }
  }

  private async checkMemory(): Promise<CheckResult> {
    const mem = process.memoryUsage();
    const totalMem = os.totalmem();
    const usedPercent = totalMem > 0 ? (mem.rss / totalMem) * 100 : 0;
    const threshold = THRESHOLDS.memory_percent;
    const status: HealthStatus =
      usedPercent >= threshold
        ? "critical"
        : usedPercent >= threshold * 0.9
          ? "warning"
          : "healthy";
    return {
      checkType: "memory",
      status,
      value: parseFloat(usedPercent.toFixed(2)),
      threshold,
      details: {
        rssMb: Math.round(mem.rss / 1024 / 1024),
        heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
        totalMb: Math.round(totalMem / 1024 / 1024),
        usedPercent: parseFloat(usedPercent.toFixed(2)),
      },
      responseTimeMs: null,
    };
  }

  private async checkCpu(): Promise<CheckResult> {
    const sample1 = sampleCpuTimes();
    await new Promise<void>((resolve) => setTimeout(resolve, CPU_SAMPLE_DELAY_MS));
    const sample2 = sampleCpuTimes();

    const idleDelta = sample2.idle - sample1.idle;
    const totalDelta = sample2.total - sample1.total;
    const usedPercent = totalDelta > 0 ? ((totalDelta - idleDelta) / totalDelta) * 100 : 0;

    const threshold = THRESHOLDS.cpu_percent;
    const status: HealthStatus =
      usedPercent >= threshold
        ? "critical"
        : usedPercent >= threshold * 0.9
          ? "warning"
          : "healthy";
    return {
      checkType: "cpu",
      status,
      value: parseFloat(usedPercent.toFixed(2)),
      threshold,
      details: {
        cores: os.cpus().length,
        usedPercent: parseFloat(usedPercent.toFixed(2)),
        loadAvg: os.loadavg(),
        sampleWindowMs: CPU_SAMPLE_DELAY_MS,
      },
      responseTimeMs: null,
    };
  }

  private async checkDisk(): Promise<CheckResult> {
    try {
      const { stdout } = await execAsync("df -P / | awk 'NR==2 {print $5}' | tr -d '%'");
      const usedPercent = parseFloat(stdout.trim());
      const threshold = THRESHOLDS.disk_percent;
      const status: HealthStatus =
        usedPercent >= threshold
          ? "critical"
          : usedPercent >= threshold * 0.9
            ? "warning"
            : "healthy";
      return {
        checkType: "disk",
        status,
        value: usedPercent,
        threshold,
        details: { usedPercent, mountPoint: "/" },
        responseTimeMs: null,
      };
    } catch (err) {
      return {
        checkType: "disk",
        status: "warning",
        value: null,
        threshold: THRESHOLDS.disk_percent,
        details: { error: err instanceof Error ? err.message : String(err) },
        responseTimeMs: null,
      };
    }
  }

  private logPoolMetrics(): void {
    logger.info("pool_metrics", {
      main: {
        total: pool.totalCount,
        idle: pool.idleCount,
        waiting: pool.waitingCount,
      },
      background: {
        total: backgroundPool.totalCount,
        idle: backgroundPool.idleCount,
        waiting: backgroundPool.waitingCount,
      },
    });
  }

  private async persistChecks(checks: CheckResult[]): Promise<void> {
    if (checks.length === 0) return;
    this.logPoolMetrics();
    let client: import("pg").PoolClient | undefined;
    try {
      client = await backgroundPool.connect();
      for (const c of checks) {
        await client.query(
          `INSERT INTO server_health_logs (check_type, status, value, threshold, details, response_time_ms, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
          [
            c.checkType,
            c.status,
            c.value !== null ? String(c.value) : null,
            c.threshold !== null ? String(c.threshold) : null,
            JSON.stringify(c.details),
            c.responseTimeMs,
          ]
        );
      }
    } catch (err) {
      logger.warn("server_health_monitor_persist_error", {
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      client?.release();
    }
  }

  private async persistTransitionEvent(
    checkType: string,
    fromStatus: HealthStatus,
    toStatus: HealthStatus,
    meta: Record<string, unknown>
  ): Promise<void> {
    let client: import("pg").PoolClient | undefined;
    try {
      client = await backgroundPool.connect();
      await client.query(
        `INSERT INTO server_health_logs (check_type, status, value, threshold, details, response_time_ms, created_at)
         VALUES ($1, $2, NULL, NULL, $3, NULL, NOW())`,
        [checkType, toStatus, JSON.stringify({ transition: true, fromStatus, toStatus, ...meta })]
      );
    } catch (err) {
      logger.warn("server_health_monitor_transition_persist_error", {
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      client?.release();
    }
  }

  private async processNotifications(checks: CheckResult[]): Promise<void> {
    for (const check of checks) {
      const checkType = check.checkType as CheckType;
      const state = this.checkStates.get(checkType);
      if (!state) continue;

      const wasHealthy = state.lastStatus === "healthy";
      const isNowUnhealthy = check.status !== "healthy";
      const wasUnhealthy = state.lastStatus !== "healthy";
      const isNowHealthy = check.status === "healthy";

      if (isNowUnhealthy) {
        state.consecutiveFailures++;

        if (wasHealthy) {
          await this.persistTransitionEvent(check.checkType, "healthy", check.status, {
            consecutiveFailures: state.consecutiveFailures,
          });
          await this.sendAlertNotification(check);
          state.escalated = false;
        }

        if (state.consecutiveFailures >= ESCALATION_FAILURE_COUNT && !state.escalated) {
          await this.persistTransitionEvent(check.checkType, check.status, check.status, {
            escalation: true,
            consecutiveFailures: state.consecutiveFailures,
          });
          await this.sendEscalationNotification(check, state.consecutiveFailures);
          state.escalated = true;
        }
      } else if (wasUnhealthy && isNowHealthy) {
        await this.persistTransitionEvent(check.checkType, state.lastStatus, "healthy", {
          previousConsecutiveFailures: state.consecutiveFailures,
        });
        await this.sendRecoveryNotification(check, state.consecutiveFailures);
        state.consecutiveFailures = 0;
        state.escalated = false;
      }

      state.lastStatus = check.status;
    }
  }

  private async sendAlertNotification(check: CheckResult): Promise<void> {
    try {
      const hourBucket = Math.floor(Date.now() / (60 * 60 * 1000));
      const dedupeKey = `server_health_alert_${check.checkType}_${hourBucket}`;
      await createNotificationForRole(ADMIN_ROLE, {
        type: "server_health_alert",
        title: `Server Health Alert: ${check.checkType} check failed`,
        message: this.buildAlertMessage(check),
        priority: "critical",
        category: "system",
        dedupeKey,
        metadata: {
          checkType: check.checkType,
          status: check.status,
          value: check.value,
          threshold: check.threshold,
          details: check.details,
          responseTimeMs: check.responseTimeMs,
        },
      });
      this.lastNotificationErrorLogMs = 0;
    } catch (err) {
      const now = Date.now();
      if (now - this.lastNotificationErrorLogMs > NOTIFICATION_ERROR_COOLDOWN_MS) {
        this.lastNotificationErrorLogMs = now;
        logger.warn("server_health_monitor_notification_unavailable", {
          checkType: check.checkType,
          error: err instanceof Error ? err.message : String(err),
          suppressedUntil: new Date(now + NOTIFICATION_ERROR_COOLDOWN_MS).toISOString(),
        });
      }
    }
  }

  private async sendEscalationNotification(check: CheckResult, consecutiveFailures: number): Promise<void> {
    try {
      const alertMessage = `${this.buildAlertMessage(check)}\n\nThis check has failed ${consecutiveFailures} consecutive times and requires immediate attention.`;
      await runServerHealthEscalation({
        checkType: check.checkType,
        status: check.status,
        consecutiveFailures,
        alertMessage,
        details: {
          value: check.value,
          threshold: check.threshold,
          responseTimeMs: check.responseTimeMs,
          checkDetails: check.details,
        },
      });
    } catch (err) {
      logger.error("server_health_monitor_escalation_error", {
        checkType: check.checkType,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async sendRecoveryNotification(check: CheckResult, previousFailures: number): Promise<void> {
    try {
      const hourBucket = Math.floor(Date.now() / (60 * 60 * 1000));
      const dedupeKey = `server_health_recovery_${check.checkType}_${hourBucket}`;
      await createNotificationForRole(ADMIN_ROLE, {
        type: "server_health_recovery",
        title: `Server Health Recovered: ${check.checkType} is now healthy`,
        message: `The ${check.checkType} health check has recovered after ${previousFailures} consecutive failure(s). System is back to normal.`,
        priority: "high",
        category: "system",
        dedupeKey,
        metadata: {
          checkType: check.checkType,
          previousFailures,
          value: check.value,
          details: check.details,
        },
      });
      this.lastNotificationErrorLogMs = 0;
    } catch (err) {
      const now = Date.now();
      if (now - this.lastNotificationErrorLogMs > NOTIFICATION_ERROR_COOLDOWN_MS) {
        this.lastNotificationErrorLogMs = now;
        logger.warn("server_health_monitor_notification_unavailable", {
          checkType: check.checkType,
          error: err instanceof Error ? err.message : String(err),
          suppressedUntil: new Date(now + NOTIFICATION_ERROR_COOLDOWN_MS).toISOString(),
        });
      }
    }
  }

  private buildAlertMessage(check: CheckResult): string {
    const parts: string[] = [`Check: ${check.checkType}`, `Status: ${check.status}`];
    if (check.value !== null && check.threshold !== null) {
      parts.push(`Value: ${check.value} (threshold: ${check.threshold})`);
    }
    if (check.responseTimeMs !== null) {
      parts.push(`Response time: ${check.responseTimeMs}ms`);
    }
    if (check.details && typeof check.details === "object") {
      const detailStr = Object.entries(check.details)
        .filter(([k]) => k !== "url")
        .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
        .join(", ");
      if (detailStr) parts.push(detailStr);
    }
    return parts.join(" | ");
  }
}
