/**
 * Enhanced Audit Trail Service - TechnoKoluzi ERP
 * Captures before/after JSON snapshots for full entity lifecycle tracking.
 * Based on BASH44 Enterprise Starter patterns.
 */

import { Pool } from '@neondatabase/serverless';
import { pool } from '@workspace/db';
import { randomUUID } from 'crypto';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AuditEntry {
  id?: number;
  actorId?: string;
  actorEmail?: string;
  module: string;
  entityType: string;
  entityId: string | number;
  action: string;
  beforeJson?: unknown;
  afterJson?: unknown;
  metadataJson?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
  correlationId?: string;
  createdAt?: Date;
}

export interface SnapshotDiff {
  field: string;
  before: unknown;
  after: unknown;
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class AuditTrailService {
  private pool: Pool;
  private tableReady = false;

  constructor(dbPool: Pool) {
    this.pool = dbPool;
  }

  // ── Schema ───────────────────────────────────────────────────────────────

  async ensureTable(): Promise<void> {
    if (this.tableReady) return;

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS audit_trail_v2 (
        id              SERIAL PRIMARY KEY,
        actor_id        VARCHAR(255),
        actor_email     VARCHAR(255),
        module          VARCHAR(100) NOT NULL,
        entity_type     VARCHAR(100) NOT NULL,
        entity_id       VARCHAR(255) NOT NULL,
        action          VARCHAR(100) NOT NULL,
        before_json     JSONB,
        after_json      JSONB,
        metadata_json   JSONB,
        ip              VARCHAR(45),
        user_agent      TEXT,
        correlation_id  VARCHAR(255),
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_audit_v2_entity
        ON audit_trail_v2 (entity_type, entity_id);

      CREATE INDEX IF NOT EXISTS idx_audit_v2_module
        ON audit_trail_v2 (module);

      CREATE INDEX IF NOT EXISTS idx_audit_v2_created
        ON audit_trail_v2 (created_at);

      CREATE INDEX IF NOT EXISTS idx_audit_v2_correlation
        ON audit_trail_v2 (correlation_id);

      CREATE INDEX IF NOT EXISTS idx_audit_v2_actor
        ON audit_trail_v2 (actor_id);
    `);

    this.tableReady = true;
  }

  // ── Core logging ─────────────────────────────────────────────────────────

  async log(entry: AuditEntry): Promise<void> {
    await this.ensureTable();

    const correlationId = entry.correlationId || randomUUID();

    await this.pool.query(
      `INSERT INTO audit_trail_v2
        (actor_id, actor_email, module, entity_type, entity_id, action,
         before_json, after_json, metadata_json, ip, user_agent, correlation_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        entry.actorId || null,
        entry.actorEmail || null,
        entry.module,
        entry.entityType,
        String(entry.entityId),
        entry.action,
        entry.beforeJson ? JSON.stringify(entry.beforeJson) : null,
        entry.afterJson ? JSON.stringify(entry.afterJson) : null,
        entry.metadataJson ? JSON.stringify(entry.metadataJson) : null,
        entry.ip || null,
        entry.userAgent || null,
        correlationId,
      ]
    );
  }

  // ── Convenience methods ──────────────────────────────────────────────────

  async logCreate(
    module: string,
    entityType: string,
    entityId: string | number,
    afterData: unknown,
    actor?: { id: string; email: string }
  ): Promise<void> {
    await this.log({
      module,
      entityType,
      entityId,
      action: 'CREATE',
      afterJson: afterData,
      actorId: actor?.id,
      actorEmail: actor?.email,
    });
  }

  async logUpdate(
    module: string,
    entityType: string,
    entityId: string | number,
    beforeData: unknown,
    afterData: unknown,
    actor?: { id: string; email: string }
  ): Promise<void> {
    await this.log({
      module,
      entityType,
      entityId,
      action: 'UPDATE',
      beforeJson: beforeData,
      afterJson: afterData,
      actorId: actor?.id,
      actorEmail: actor?.email,
    });
  }

  async logDelete(
    module: string,
    entityType: string,
    entityId: string | number,
    beforeData: unknown,
    actor?: { id: string; email: string }
  ): Promise<void> {
    await this.log({
      module,
      entityType,
      entityId,
      action: 'DELETE',
      beforeJson: beforeData,
      actorId: actor?.id,
      actorEmail: actor?.email,
    });
  }

  async logStatusChange(
    module: string,
    entityType: string,
    entityId: string | number,
    fromStatus: string,
    toStatus: string,
    action: string,
    actor?: { id: string; email: string }
  ): Promise<void> {
    await this.log({
      module,
      entityType,
      entityId,
      action,
      beforeJson: { status: fromStatus },
      afterJson: { status: toStatus },
      metadataJson: {
        transitionType: 'status_change',
        fromStatus,
        toStatus,
      },
      actorId: actor?.id,
      actorEmail: actor?.email,
    });
  }

  // ── Query methods ────────────────────────────────────────────────────────

  async getHistory(
    entityType: string,
    entityId: string | number,
    limit = 50
  ): Promise<AuditEntry[]> {
    await this.ensureTable();

    const { rows } = await this.pool.query(
      `SELECT id, actor_id, actor_email, module, entity_type, entity_id,
              action, before_json, after_json, metadata_json,
              ip, user_agent, correlation_id, created_at
       FROM audit_trail_v2
       WHERE entity_type = $1 AND entity_id = $2
       ORDER BY created_at DESC
       LIMIT $3`,
      [entityType, String(entityId), limit]
    );

    return rows.map(this.mapRow);
  }

  async getModuleActivity(
    module: string,
    since?: Date,
    limit = 100
  ): Promise<AuditEntry[]> {
    await this.ensureTable();

    const sinceDate = since || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // default 7 days

    const { rows } = await this.pool.query(
      `SELECT id, actor_id, actor_email, module, entity_type, entity_id,
              action, before_json, after_json, metadata_json,
              ip, user_agent, correlation_id, created_at
       FROM audit_trail_v2
       WHERE module = $1 AND created_at >= $2
       ORDER BY created_at DESC
       LIMIT $3`,
      [module, sinceDate.toISOString(), limit]
    );

    return rows.map(this.mapRow);
  }

  async compareSnapshots(
    entityType: string,
    entityId: string | number,
    entryId1: number,
    entryId2: number
  ): Promise<SnapshotDiff[]> {
    await this.ensureTable();

    const { rows } = await this.pool.query(
      `SELECT id, before_json, after_json
       FROM audit_trail_v2
       WHERE entity_type = $1 AND entity_id = $2 AND id IN ($3, $4)
       ORDER BY id ASC`,
      [entityType, String(entityId), entryId1, entryId2]
    );

    if (rows.length < 2) return [];

    const snapshot1 = (rows[0].after_json || rows[0].before_json || {}) as Record<string, unknown>;
    const snapshot2 = (rows[1].after_json || rows[1].before_json || {}) as Record<string, unknown>;

    const allKeys = new Set([...Object.keys(snapshot1), ...Object.keys(snapshot2)]);
    const diffs: SnapshotDiff[] = [];

    for (const field of allKeys) {
      const val1 = snapshot1[field];
      const val2 = snapshot2[field];
      if (JSON.stringify(val1) !== JSON.stringify(val2)) {
        diffs.push({ field, before: val1, after: val2 });
      }
    }

    return diffs;
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private mapRow(row: any): AuditEntry {
    return {
      id: row.id,
      actorId: row.actor_id,
      actorEmail: row.actor_email,
      module: row.module,
      entityType: row.entity_type,
      entityId: row.entity_id,
      action: row.action,
      beforeJson: row.before_json,
      afterJson: row.after_json,
      metadataJson: row.metadata_json,
      ip: row.ip,
      userAgent: row.user_agent,
      correlationId: row.correlation_id,
      createdAt: row.created_at,
    };
  }
}

// ─── Singleton ───────────────────────────────────────────────────────────────

export const auditTrailService = new AuditTrailService(pool);
