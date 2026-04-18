import { pool } from "@workspace/db";

export interface AuditEntry {
  provider: string;
  model: string;
  taskType?: string;
  inputSummary?: string;
  outputSummary?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  latencyMs?: number;
  statusCode?: number;
  errorMessage?: string;
  actionTaken?: string;
  fallbackUsed?: boolean;
  originalProvider?: string;
  userId?: string;
  sessionId?: string;
}

export async function writeAuditLog(entry: AuditEntry): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO ai_audit_logs
        (provider, model, task_type, input_summary, output_summary,
         input_tokens, output_tokens, total_tokens, latency_ms,
         status_code, error_message, action_taken,
         fallback_used, original_provider, user_id, session_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [
        entry.provider,
        entry.model,
        entry.taskType || "general",
        entry.inputSummary ? entry.inputSummary.slice(0, 500) : null,
        entry.outputSummary ? entry.outputSummary.slice(0, 500) : null,
        entry.inputTokens || null,
        entry.outputTokens || null,
        entry.totalTokens || (entry.inputTokens && entry.outputTokens ? entry.inputTokens + entry.outputTokens : null),
        entry.latencyMs || null,
        entry.statusCode || 200,
        entry.errorMessage ? entry.errorMessage.slice(0, 1000) : null,
        entry.actionTaken || null,
        entry.fallbackUsed || false,
        entry.originalProvider || null,
        entry.userId || null,
        entry.sessionId || null,
      ]
    );
  } catch (err) {
    console.error("[ai-audit] Failed to write audit log:", err);
  }
}
