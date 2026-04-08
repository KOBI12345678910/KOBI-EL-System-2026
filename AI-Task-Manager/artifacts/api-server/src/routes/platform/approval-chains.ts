import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import { usersTable, userSessionsTable } from "@workspace/db/schema";
import { eq, and, gt } from "drizzle-orm";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

// ─── Auth middleware ───────────────────────────────────────────────────────────

async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.substring(7) : (req.query.token as string) || null;
  if (!token) { res.status(401).json({ error: "Authentication required" }); return; }

  const [session] = await db.select().from(userSessionsTable)
    .where(and(eq(userSessionsTable.token, token), eq(userSessionsTable.isActive, true), gt(userSessionsTable.expiresAt, new Date())));
  if (!session) { res.status(401).json({ error: "Invalid or expired session" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, session.userId));
  if (!user || !user.isActive) { res.status(401).json({ error: "User inactive" }); return; }

  const { passwordHash: _, ...safeUser } = user;
  (req as any).user = safeUser;
  next();
}

// Admin guard: only super-admins or role=admin/manager can manage platform config
async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).user;
  if (!user) { res.status(401).json({ error: "Authentication required" }); return; }
  const isAdmin = user.isSuperAdmin || user.role === "admin" || user.role === "manager";
  if (!isAdmin) { res.status(403).json({ error: "Admin access required" }); return; }
  next();
}

// ─── Helper: extract rows ─────────────────────────────────────────────────────

function rows(result: any): any[] {
  return Array.isArray(result) ? result : ((result as any).rows || []);
}

// ─── Helper: evaluate routing rules against a request context ─────────────────

export async function evaluateRoutingRules(context: {
  entityType: string;
  department?: string;
  amount?: number;
  requestType?: string;
}): Promise<{ chainId: number; chainName: string } | null> {
  // Fetch all active routing rules ordered by priority descending
  const rulesResult = await db.execute(sql`
    SELECT arr.*, ac.name as chain_name
    FROM approval_routing_rules arr
    JOIN approval_chains ac ON ac.id = arr.chain_id
    WHERE arr.is_active = true AND ac.is_active = true
    ORDER BY arr.priority DESC, arr.created_at DESC
  `);
  const rulesList = rows(rulesResult);

  for (const rule of rulesList) {
    // Check entity_type match (null = matches all)
    if (rule.entity_type && rule.entity_type !== context.entityType) continue;
    // Check department match (null = matches all)
    if (rule.department && rule.department !== context.department) continue;

    // Evaluate JSONB conditions array
    const conditions: Array<{ field: string; operator: string; value: string | number }> = rule.conditions || [];
    let conditionsMet = true;
    for (const cond of conditions) {
      const val = context[cond.field as keyof typeof context];
      const numVal = typeof val === "number" ? val : parseFloat(String(val ?? "NaN"));
      const condVal = typeof cond.value === "number" ? cond.value : parseFloat(String(cond.value));

      if (cond.operator === ">" && !(numVal > condVal)) { conditionsMet = false; break; }
      if (cond.operator === ">=" && !(numVal >= condVal)) { conditionsMet = false; break; }
      if (cond.operator === "<" && !(numVal < condVal)) { conditionsMet = false; break; }
      if (cond.operator === "<=" && !(numVal <= condVal)) { conditionsMet = false; break; }
      if (cond.operator === "==" && String(val) !== String(cond.value)) { conditionsMet = false; break; }
      if (cond.operator === "!=" && String(val) === String(cond.value)) { conditionsMet = false; break; }
      if (cond.operator === "contains" && !String(val ?? "").toLowerCase().includes(String(cond.value).toLowerCase())) { conditionsMet = false; break; }
    }
    if (conditionsMet) {
      return { chainId: rule.chain_id, chainName: rule.chain_name };
    }
  }
  return null;
}

// ─── Helper: start a chain instance ──────────────────────────────────────────

export async function startChainInstance(params: {
  chainId: number;
  entityType: string;
  recordId?: number;
  recordLabel?: string;
  department?: string;
  requestorEmail?: string;
  requestorUserId?: number;
  metadata?: Record<string, unknown>;
}): Promise<{ instanceId: number }> {
  const result = await db.execute(sql`
    INSERT INTO approval_chain_instances
      (chain_id, entity_type, record_id, record_label, department, requestor_email, requestor_user_id, metadata, started_at, updated_at)
    VALUES (
      ${params.chainId}, ${params.entityType},
      ${params.recordId ?? null}, ${params.recordLabel ?? null},
      ${params.department ?? null}, ${params.requestorEmail ?? null},
      ${params.requestorUserId ?? null},
      ${JSON.stringify(params.metadata ?? {})}::jsonb,
      NOW(), NOW()
    )
    RETURNING id
  `);
  const instanceId = rows(result)[0]?.id;
  return { instanceId };
}

// ─── Helper: resolve level voting semantics ───────────────────────────────────
// Returns true if the current level's quorum is satisfied for an approval

async function isLevelApproved(instanceId: number, levelId: number, levelRow: any): Promise<boolean> {
  const mode = levelRow.parallel_mode || "all"; // all | any | first
  const minApprovals = Number(levelRow.min_approvals || 1);

  const approvedResult = await db.execute(sql`
    SELECT COUNT(*) as cnt
    FROM approval_level_votes
    WHERE instance_id = ${instanceId} AND level_id = ${levelId} AND decision = 'approved'
  `);
  const approvedCount = Number(rows(approvedResult)[0]?.cnt || 0);

  if (mode === "first") {
    // First responder wins — any single approval is enough
    return approvedCount >= 1;
  }
  if (mode === "any") {
    // Need min_approvals approvals (1-of-M or N-of-M)
    return approvedCount >= minApprovals;
  }
  // mode === "all": need approvals from all expected approvers
  // approver_user_ids or approver_emails determine the expected set
  const expectedEmails: string[] = levelRow.approver_emails || [];
  const expectedUserIds: number[] = levelRow.approver_user_ids || [];
  const expectedTotal = Math.max(expectedEmails.length, expectedUserIds.length, minApprovals);
  return approvedCount >= expectedTotal;
}

// ─── Routes: Approval Chains (read = auth, write = admin) ─────────────────────

router.get("/platform/approval-chains", requireAuth as any, async (req: any, res) => {
  try {
    const isTemplate = req.query.isTemplate === "true" ? true : req.query.isTemplate === "false" ? false : undefined;

    const result = await db.execute(
      isTemplate !== undefined
        ? sql`SELECT ac.*, (SELECT COUNT(*) FROM approval_chain_levels acl WHERE acl.chain_id = ac.id) as level_count
              FROM approval_chains ac WHERE ac.is_template = ${isTemplate} ORDER BY ac.created_at DESC`
        : sql`SELECT ac.*, (SELECT COUNT(*) FROM approval_chain_levels acl WHERE acl.chain_id = ac.id) as level_count
              FROM approval_chains ac ORDER BY ac.created_at DESC`
    );
    res.json(rows(result));
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/platform/approval-chains/:id", requireAuth as any, async (req: any, res) => {
  try {
    const id = Number(req.params.id);
    const chainResult = await db.execute(sql`SELECT * FROM approval_chains WHERE id = ${id}`);
    const chain = rows(chainResult)[0];
    if (!chain) return res.status(404).json({ message: "Chain not found" });

    const levelsResult = await db.execute(sql`
      SELECT * FROM approval_chain_levels WHERE chain_id = ${id} ORDER BY level_order ASC
    `);
    res.json({ ...chain, levels: rows(levelsResult) });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/approval-chains", requireAuth as any, requireAdmin as any, async (req: any, res) => {
  try {
    const { name, description, isTemplate, parallelMode, levels } = req.body;
    if (!name) return res.status(400).json({ message: "Name is required" });

    const result = await db.execute(sql`
      INSERT INTO approval_chains (name, description, is_template, parallel_mode, created_by, created_at, updated_at)
      VALUES (${name}, ${description ?? null}, ${!!isTemplate}, ${parallelMode || "sequential"}, ${req.user.id}, NOW(), NOW())
      RETURNING *
    `);
    const chain = rows(result)[0];

    if (Array.isArray(levels) && levels.length > 0) {
      for (let i = 0; i < levels.length; i++) {
        const lvl = levels[i];
        await db.execute(sql`
          INSERT INTO approval_chain_levels
            (chain_id, level_order, name, approver_type, approver_role, approver_emails, approver_user_ids,
             parallel_mode, min_approvals, timeout_hours, escalation_role, conditions)
          VALUES (
            ${chain.id}, ${i},
            ${lvl.name || `רמה ${i + 1}`},
            ${lvl.approverType || "role"},
            ${lvl.approverRole ?? null},
            ${JSON.stringify(lvl.approverEmails || [])}::jsonb,
            ${JSON.stringify(lvl.approverUserIds || [])}::jsonb,
            ${lvl.parallelMode || "all"},
            ${lvl.minApprovals || 1},
            ${lvl.timeoutHours ?? null},
            ${lvl.escalationRole ?? null},
            ${JSON.stringify(lvl.conditions || [])}::jsonb
          )
        `);
      }
    }

    const levelsResult = await db.execute(sql`SELECT * FROM approval_chain_levels WHERE chain_id = ${chain.id} ORDER BY level_order ASC`);
    res.status(201).json({ ...chain, levels: rows(levelsResult) });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.put("/platform/approval-chains/:id", requireAuth as any, requireAdmin as any, async (req: any, res) => {
  try {
    const id = Number(req.params.id);
    const { name, description, isTemplate, parallelMode, isActive, levels } = req.body;

    await db.execute(sql`
      UPDATE approval_chains SET
        name = COALESCE(${name ?? null}, name),
        description = CASE WHEN ${description !== undefined} THEN ${description ?? null} ELSE description END,
        is_template = COALESCE(${isTemplate !== undefined ? !!isTemplate : null}, is_template),
        parallel_mode = COALESCE(${parallelMode ?? null}, parallel_mode),
        is_active = COALESCE(${isActive !== undefined ? !!isActive : null}, is_active),
        updated_at = NOW()
      WHERE id = ${id}
    `);

    if (Array.isArray(levels)) {
      await db.execute(sql`DELETE FROM approval_chain_levels WHERE chain_id = ${id}`);
      for (let i = 0; i < levels.length; i++) {
        const lvl = levels[i];
        await db.execute(sql`
          INSERT INTO approval_chain_levels
            (chain_id, level_order, name, approver_type, approver_role, approver_emails, approver_user_ids,
             parallel_mode, min_approvals, timeout_hours, escalation_role, conditions)
          VALUES (
            ${id}, ${i},
            ${lvl.name || `רמה ${i + 1}`},
            ${lvl.approverType || "role"},
            ${lvl.approverRole ?? null},
            ${JSON.stringify(lvl.approverEmails || [])}::jsonb,
            ${JSON.stringify(lvl.approverUserIds || [])}::jsonb,
            ${lvl.parallelMode || "all"},
            ${lvl.minApprovals || 1},
            ${lvl.timeoutHours ?? null},
            ${lvl.escalationRole ?? null},
            ${JSON.stringify(lvl.conditions || [])}::jsonb
          )
        `);
      }
    }

    const chainResult = await db.execute(sql`SELECT * FROM approval_chains WHERE id = ${id}`);
    const levelsResult = await db.execute(sql`SELECT * FROM approval_chain_levels WHERE chain_id = ${id} ORDER BY level_order ASC`);
    res.json({ ...rows(chainResult)[0], levels: rows(levelsResult) });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.delete("/platform/approval-chains/:id", requireAuth as any, requireAdmin as any, async (req: any, res) => {
  try {
    const id = Number(req.params.id);
    await db.execute(sql`DELETE FROM approval_chain_levels WHERE chain_id = ${id}`);
    await db.execute(sql`DELETE FROM approval_chains WHERE id = ${id}`);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// ─── Routes: Evaluate routing for a request ───────────────────────────────────

router.post("/platform/approval-chains/evaluate-routing", requireAuth as any, async (req: any, res) => {
  try {
    const { entityType, department, amount, requestType } = req.body;
    if (!entityType) return res.status(400).json({ message: "entityType is required" });

    const match = await evaluateRoutingRules({ entityType, department, amount, requestType });
    if (!match) return res.json({ chainId: null, chainName: null, matched: false });

    const levelsResult = await db.execute(sql`
      SELECT * FROM approval_chain_levels WHERE chain_id = ${match.chainId} ORDER BY level_order ASC
    `);
    res.json({ ...match, matched: true, levels: rows(levelsResult) });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// ─── Routes: Start a chain instance ──────────────────────────────────────────

router.post("/platform/approval-chain-instances", requireAuth as any, async (req: any, res) => {
  try {
    const { chainId, entityType, recordId, recordLabel, department, metadata } = req.body;
    if (!chainId || !entityType) return res.status(400).json({ message: "chainId and entityType are required" });

    const { instanceId } = await startChainInstance({
      chainId: Number(chainId),
      entityType,
      recordId: recordId ? Number(recordId) : undefined,
      recordLabel,
      department,
      requestorEmail: req.user.email || req.user.username,
      requestorUserId: req.user.id,
      metadata,
    });

    const instanceResult = await db.execute(sql`SELECT * FROM approval_chain_instances WHERE id = ${instanceId}`);
    const levelsResult = await db.execute(sql`SELECT * FROM approval_chain_levels WHERE chain_id = ${chainId} ORDER BY level_order ASC`);
    res.status(201).json({ ...rows(instanceResult)[0], levels: rows(levelsResult) });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/platform/approval-chain-instances", requireAuth as any, async (req: any, res) => {
  try {
    const { status, chainId, entityType } = req.query;

    const result = await db.execute(sql`
      SELECT aci.*, ac.name as chain_name,
        (SELECT COUNT(*) FROM approval_level_votes alv WHERE alv.instance_id = aci.id) as vote_count
      FROM approval_chain_instances aci
      LEFT JOIN approval_chains ac ON ac.id = aci.chain_id
      WHERE (${status ?? null}::text IS NULL OR aci.status = ${status ?? null})
        AND (${chainId ?? null}::int IS NULL OR aci.chain_id = ${chainId ? Number(chainId) : null})
        AND (${entityType ?? null}::text IS NULL OR aci.entity_type = ${entityType ?? null})
      ORDER BY aci.started_at DESC
      LIMIT 100
    `);
    res.json(rows(result));
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/platform/approval-chain-instances/:id", requireAuth as any, async (req: any, res) => {
  try {
    const id = Number(req.params.id);
    const instanceResult = await db.execute(sql`
      SELECT aci.*, ac.name as chain_name, ac.parallel_mode as chain_parallel_mode
      FROM approval_chain_instances aci
      LEFT JOIN approval_chains ac ON ac.id = aci.chain_id
      WHERE aci.id = ${id}
    `);
    const instance = rows(instanceResult)[0];
    if (!instance) return res.status(404).json({ message: "Instance not found" });

    const levelsResult = await db.execute(sql`
      SELECT * FROM approval_chain_levels WHERE chain_id = ${instance.chain_id} ORDER BY level_order ASC
    `);
    const votesResult = await db.execute(sql`
      SELECT alv.*, acl.name as level_name, acl.level_order
      FROM approval_level_votes alv
      LEFT JOIN approval_chain_levels acl ON acl.id = alv.level_id
      WHERE alv.instance_id = ${id}
      ORDER BY alv.voted_at DESC
    `);

    res.json({ ...instance, levels: rows(levelsResult), votes: rows(votesResult) });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/platform/approval-chain-instances/:id/votes", requireAuth as any, async (req: any, res) => {
  try {
    const id = Number(req.params.id);
    const result = await db.execute(sql`
      SELECT alv.*, acl.name as level_name, acl.level_order
      FROM approval_level_votes alv
      LEFT JOIN approval_chain_levels acl ON acl.id = alv.level_id
      WHERE alv.instance_id = ${id}
      ORDER BY alv.voted_at DESC
    `);
    res.json(rows(result));
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// ─── Routes: Cast a vote on a chain instance ──────────────────────────────────

router.post("/platform/approval-chain-instances/:id/vote", requireAuth as any, async (req: any, res) => {
  try {
    const instanceId = Number(req.params.id);
    const { decision, comments, levelId } = req.body;
    const user = req.user;

    if (!decision || !["approved", "rejected", "abstained"].includes(decision)) {
      return res.status(400).json({ message: "Invalid decision; must be approved, rejected, or abstained" });
    }

    // Load instance
    const instanceResult = await db.execute(sql`
      SELECT aci.*, ac.parallel_mode as chain_parallel_mode
      FROM approval_chain_instances aci
      JOIN approval_chains ac ON ac.id = aci.chain_id
      WHERE aci.id = ${instanceId} AND aci.status = 'pending'
    `);
    const instance = rows(instanceResult)[0];
    if (!instance) return res.status(404).json({ message: "Instance not found or already resolved" });

    const approverEmail = String(user.email || user.username || "");

    // Check for active delegations — this user may be voting as a delegate
    const delegResult = await db.execute(sql`
      SELECT * FROM approval_delegations
      WHERE delegate_email = ${approverEmail}
        AND is_active = true
        AND start_date <= CURRENT_DATE
        AND end_date >= CURRENT_DATE
      LIMIT 1
    `);
    const delegation = rows(delegResult)[0];
    const isDelegated = !!delegation;
    const originalApproverEmail: string | null = isDelegated ? (delegation.delegator_email ?? null) : null;

    // Determine the current level for this vote
    const effectiveLevelId: number = levelId ? Number(levelId) : 0;
    const levelResult = await db.execute(
      effectiveLevelId
        ? sql`SELECT * FROM approval_chain_levels WHERE id = ${effectiveLevelId} AND chain_id = ${instance.chain_id}`
        : sql`SELECT * FROM approval_chain_levels WHERE chain_id = ${instance.chain_id} AND level_order = ${instance.current_level}`
    );
    const level = rows(levelResult)[0];

    // Guard: prevent duplicate votes on same level from same voter
    const existingVote = await db.execute(sql`
      SELECT id FROM approval_level_votes
      WHERE instance_id = ${instanceId}
        AND level_id = ${level?.id ?? 0}
        AND approver_email = ${approverEmail}
    `);
    if (rows(existingVote).length > 0) {
      return res.status(409).json({ message: "You have already voted on this level" });
    }

    // Record the vote
    await db.execute(sql`
      INSERT INTO approval_level_votes
        (instance_id, level_id, approver_email, approver_user_id, decision, comments, is_delegated, original_approver_email, voted_at)
      VALUES (
        ${instanceId}, ${level?.id ?? null}, ${approverEmail}, ${user.id},
        ${decision}, ${comments ?? null},
        ${isDelegated}, ${originalApproverEmail},
        NOW()
      )
    `);

    // Determine outcome
    let newStatus = "pending";
    let newLevel = Number(instance.current_level);

    if (decision === "rejected") {
      // Any rejection immediately rejects the whole chain
      newStatus = "rejected";
    } else if (level && decision === "approved") {
      const levelApproved = await isLevelApproved(instanceId, level.id, level);

      if (levelApproved) {
        // Try to advance to the next level
        const nextLevelResult = await db.execute(sql`
          SELECT * FROM approval_chain_levels
          WHERE chain_id = ${instance.chain_id} AND level_order = ${Number(instance.current_level) + 1}
        `);
        const nextLevel = rows(nextLevelResult)[0];

        if (nextLevel) {
          newLevel = Number(instance.current_level) + 1;
        } else {
          // No more levels — fully approved
          newStatus = "approved";
        }
      }
      // else: still pending, waiting for more votes at this level
    }

    // Update compliance_pct on SLA tracking when resolved
    if (newStatus !== "pending") {
      await db.execute(sql`
        UPDATE approval_chain_instances
        SET current_level = ${newLevel}, status = ${newStatus},
            completed_at = NOW(), updated_at = NOW()
        WHERE id = ${instanceId}
      `);

      // Sync back to approval_requests if linked
      await db.execute(sql`
        UPDATE approval_requests
        SET status = ${newStatus}, approved_by = ${approverEmail}, resolved_at = NOW()
        WHERE chain_instance_id = ${instanceId} AND status = 'pending'
      `);

      // Compute compliance_pct on any linked SLA tracking record
      await db.execute(sql`
        UPDATE sla_tracking
        SET status = 'resolved',
            resolved_at = NOW(),
            compliance_pct = CASE
              WHEN deadline_at >= NOW() THEN 100
              ELSE ROUND((EXTRACT(EPOCH FROM (deadline_at - started_at)) / NULLIF(EXTRACT(EPOCH FROM (NOW() - started_at)), 0) * 100)::numeric, 2)
            END,
            updated_at = NOW()
        WHERE record_id = ${instance.record_id ?? null}
          AND entity_type = ${instance.entity_type}
          AND status = 'active'
      `);
    } else {
      await db.execute(sql`
        UPDATE approval_chain_instances
        SET current_level = ${newLevel}, updated_at = NOW()
        WHERE id = ${instanceId}
      `);
    }

    res.json({ success: true, newStatus, newLevel, isDelegated, originalApproverEmail });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// ─── Routes: Routing Rules (read = auth, write = admin) ───────────────────────

router.get("/platform/approval-routing-rules", requireAuth as any, async (req: any, res) => {
  try {
    const result = await db.execute(sql`
      SELECT arr.*, ac.name as chain_name
      FROM approval_routing_rules arr
      LEFT JOIN approval_chains ac ON ac.id = arr.chain_id
      ORDER BY arr.priority DESC, arr.created_at DESC
    `);
    res.json(rows(result));
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/approval-routing-rules", requireAuth as any, requireAdmin as any, async (req: any, res) => {
  try {
    const { name, entityType, department, conditions, chainId, priority } = req.body;
    if (!name) return res.status(400).json({ message: "Name is required" });

    const result = await db.execute(sql`
      INSERT INTO approval_routing_rules (name, entity_type, department, conditions, chain_id, priority, created_at, updated_at)
      VALUES (
        ${name},
        ${entityType ?? null}, ${department ?? null},
        ${JSON.stringify(conditions || [])}::jsonb,
        ${chainId ?? null}, ${priority ?? 0},
        NOW(), NOW()
      )
      RETURNING *
    `);
    res.status(201).json(rows(result)[0]);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.put("/platform/approval-routing-rules/:id", requireAuth as any, requireAdmin as any, async (req: any, res) => {
  try {
    const id = Number(req.params.id);
    const { name, entityType, department, conditions, chainId, priority, isActive } = req.body;

    await db.execute(sql`
      UPDATE approval_routing_rules SET
        name = COALESCE(${name ?? null}, name),
        entity_type = CASE WHEN ${entityType !== undefined} THEN ${entityType ?? null} ELSE entity_type END,
        department = CASE WHEN ${department !== undefined} THEN ${department ?? null} ELSE department END,
        conditions = CASE WHEN ${conditions !== undefined} THEN ${JSON.stringify(conditions ?? [])}::jsonb ELSE conditions END,
        chain_id = CASE WHEN ${chainId !== undefined} THEN ${chainId ?? null} ELSE chain_id END,
        priority = COALESCE(${priority ?? null}, priority),
        is_active = COALESCE(${isActive !== undefined ? !!isActive : null}, is_active),
        updated_at = NOW()
      WHERE id = ${id}
    `);

    const result = await db.execute(sql`SELECT * FROM approval_routing_rules WHERE id = ${id}`);
    res.json(rows(result)[0]);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.delete("/platform/approval-routing-rules/:id", requireAuth as any, requireAdmin as any, async (req: any, res) => {
  try {
    const id = Number(req.params.id);
    await db.execute(sql`DELETE FROM approval_routing_rules WHERE id = ${id}`);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// ─── Routes: Delegations (read = auth, manage = own or admin) ─────────────────

router.get("/platform/approval-delegations", requireAuth as any, async (req: any, res) => {
  try {
    const result = await db.execute(sql`
      SELECT * FROM approval_delegations WHERE is_active = true ORDER BY created_at DESC
    `);
    res.json(rows(result));
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/approval-delegations", requireAuth as any, async (req: any, res) => {
  try {
    const { delegatorUserId, delegatorEmail, delegateUserId, delegateEmail, startDate, endDate, reason } = req.body;
    if (!delegatorEmail || !delegateEmail || !startDate || !endDate) {
      return res.status(400).json({ message: "delegatorEmail, delegateEmail, startDate, endDate are required" });
    }

    // Only admins can create delegations on behalf of others; regular users can only delegate themselves
    const user = req.user;
    const isAdmin = user.isSuperAdmin || user.role === "admin" || user.role === "manager";
    const targetEmail = delegatorEmail;
    const userEmail = String(user.email || user.username || "");
    if (!isAdmin && targetEmail !== userEmail) {
      return res.status(403).json({ message: "You can only create delegations for yourself" });
    }

    const result = await db.execute(sql`
      INSERT INTO approval_delegations
        (delegator_user_id, delegator_email, delegate_user_id, delegate_email, start_date, end_date, reason, created_at, updated_at)
      VALUES (
        ${delegatorUserId ?? user.id}, ${delegatorEmail},
        ${delegateUserId ?? null}, ${delegateEmail},
        ${startDate}::date, ${endDate}::date,
        ${reason ?? null},
        NOW(), NOW()
      )
      RETURNING *
    `);
    res.status(201).json(rows(result)[0]);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.delete("/platform/approval-delegations/:id", requireAuth as any, async (req: any, res) => {
  try {
    const id = Number(req.params.id);
    const user = req.user;
    const isAdmin = user.isSuperAdmin || user.role === "admin" || user.role === "manager";

    if (!isAdmin) {
      // Verify ownership
      const deleg = await db.execute(sql`SELECT delegator_user_id FROM approval_delegations WHERE id = ${id}`);
      const row = rows(deleg)[0];
      if (!row || Number(row.delegator_user_id) !== Number(user.id)) {
        return res.status(403).json({ message: "You can only revoke your own delegations" });
      }
    }

    await db.execute(sql`UPDATE approval_delegations SET is_active = false, updated_at = NOW() WHERE id = ${id}`);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// ─── Routes: SLA Definitions (read = auth, write = admin) ─────────────────────

router.get("/platform/sla-definitions", requireAuth as any, async (req: any, res) => {
  try {
    const result = await db.execute(sql`
      SELECT sd.*, ac.name as escalation_chain_name,
        (SELECT COUNT(*) FROM sla_tracking st WHERE st.sla_id = sd.id AND st.status = 'active') as active_count,
        (SELECT COUNT(*) FROM sla_tracking st WHERE st.sla_id = sd.id AND st.status = 'breached') as breach_count
      FROM sla_definitions sd
      LEFT JOIN approval_chains ac ON ac.id = sd.escalation_chain_id
      ORDER BY sd.created_at DESC
    `);
    res.json(rows(result));
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/platform/sla-definitions/:id", requireAuth as any, async (req: any, res) => {
  try {
    const id = Number(req.params.id);
    const result = await db.execute(sql`SELECT * FROM sla_definitions WHERE id = ${id}`);
    const row = rows(result)[0];
    if (!row) return res.status(404).json({ message: "SLA not found" });
    res.json(row);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/sla-definitions", requireAuth as any, requireAdmin as any, async (req: any, res) => {
  try {
    const { name, description, slaType, entityType, department, metricUnit, targetValue, warningThresholdPct, breachThresholdPct, businessHoursOnly, businessHoursStart, businessHoursEnd, escalationChainId } = req.body;
    if (!name) return res.status(400).json({ message: "Name is required" });

    const result = await db.execute(sql`
      INSERT INTO sla_definitions
        (name, description, sla_type, entity_type, department, metric_unit, target_value,
         warning_threshold_pct, breach_threshold_pct, business_hours_only,
         business_hours_start, business_hours_end, escalation_chain_id, created_by, created_at, updated_at)
      VALUES (
        ${name}, ${description ?? null},
        ${slaType || "response"},
        ${entityType ?? null}, ${department ?? null},
        ${metricUnit || "hours"},
        ${targetValue ?? 24},
        ${warningThresholdPct ?? 80}, ${breachThresholdPct ?? 100},
        ${!!businessHoursOnly},
        ${businessHoursStart ?? 8}, ${businessHoursEnd ?? 17},
        ${escalationChainId ?? null},
        ${req.user.id}, NOW(), NOW()
      )
      RETURNING *
    `);
    res.status(201).json(rows(result)[0]);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.put("/platform/sla-definitions/:id", requireAuth as any, requireAdmin as any, async (req: any, res) => {
  try {
    const id = Number(req.params.id);
    const { name, description, slaType, entityType, department, metricUnit, targetValue, warningThresholdPct, breachThresholdPct, businessHoursOnly, businessHoursStart, businessHoursEnd, escalationChainId, isActive } = req.body;

    await db.execute(sql`
      UPDATE sla_definitions SET
        name = COALESCE(${name ?? null}, name),
        description = CASE WHEN ${description !== undefined} THEN ${description ?? null} ELSE description END,
        sla_type = COALESCE(${slaType ?? null}, sla_type),
        entity_type = CASE WHEN ${entityType !== undefined} THEN ${entityType ?? null} ELSE entity_type END,
        department = CASE WHEN ${department !== undefined} THEN ${department ?? null} ELSE department END,
        metric_unit = COALESCE(${metricUnit ?? null}, metric_unit),
        target_value = COALESCE(${targetValue ?? null}, target_value),
        warning_threshold_pct = COALESCE(${warningThresholdPct ?? null}, warning_threshold_pct),
        breach_threshold_pct = COALESCE(${breachThresholdPct ?? null}, breach_threshold_pct),
        business_hours_only = COALESCE(${businessHoursOnly !== undefined ? !!businessHoursOnly : null}, business_hours_only),
        business_hours_start = COALESCE(${businessHoursStart ?? null}, business_hours_start),
        business_hours_end = COALESCE(${businessHoursEnd ?? null}, business_hours_end),
        escalation_chain_id = CASE WHEN ${escalationChainId !== undefined} THEN ${escalationChainId ?? null} ELSE escalation_chain_id END,
        is_active = COALESCE(${isActive !== undefined ? !!isActive : null}, is_active),
        updated_at = NOW()
      WHERE id = ${id}
    `);

    const result = await db.execute(sql`SELECT * FROM sla_definitions WHERE id = ${id}`);
    res.json(rows(result)[0]);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.delete("/platform/sla-definitions/:id", requireAuth as any, requireAdmin as any, async (req: any, res) => {
  try {
    const id = Number(req.params.id);
    await db.execute(sql`DELETE FROM sla_definitions WHERE id = ${id}`);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// ─── Routes: SLA Tracking ────────────────────────────────────────────────────

router.get("/platform/sla-tracking", requireAuth as any, async (req: any, res) => {
  try {
    const { status, slaId, entityType, department } = req.query;

    const result = await db.execute(sql`
      SELECT st.*, sd.name as sla_name, sd.target_value, sd.metric_unit, sd.sla_type,
        sd.warning_threshold_pct, sd.breach_threshold_pct,
        EXTRACT(EPOCH FROM (NOW() - st.started_at)) / 3600 as elapsed_hours_now,
        EXTRACT(EPOCH FROM (st.deadline_at - NOW())) / 3600 as hours_remaining,
        CASE
          WHEN st.resolved_at IS NOT NULL THEN
            ROUND((EXTRACT(EPOCH FROM (st.deadline_at - st.started_at)) / NULLIF(EXTRACT(EPOCH FROM (st.resolved_at - st.started_at)), 0) * 100)::numeric, 2)
          ELSE
            ROUND((EXTRACT(EPOCH FROM (st.deadline_at - NOW())) / NULLIF(EXTRACT(EPOCH FROM (st.deadline_at - st.started_at)), 0) * 100)::numeric, 2)
        END as remaining_pct
      FROM sla_tracking st
      JOIN sla_definitions sd ON sd.id = st.sla_id
      WHERE (${status ?? null}::text IS NULL OR st.status = ${status ?? null})
        AND (${slaId ?? null}::int IS NULL OR st.sla_id = ${slaId ? Number(slaId) : null})
        AND (${entityType ?? null}::text IS NULL OR st.entity_type = ${entityType ?? null})
        AND (${department ?? null}::text IS NULL OR st.department = ${department ?? null})
      ORDER BY st.deadline_at ASC
      LIMIT 200
    `);
    res.json(rows(result));
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/sla-tracking", requireAuth as any, async (req: any, res) => {
  try {
    const { slaId, entityType, recordId, recordLabel, department, metadata } = req.body;
    if (!slaId || !entityType) return res.status(400).json({ message: "slaId and entityType are required" });

    const slaResult = await db.execute(sql`SELECT * FROM sla_definitions WHERE id = ${Number(slaId)}`);
    const sla = rows(slaResult)[0];
    if (!sla) return res.status(404).json({ message: "SLA definition not found" });

    const targetHours = Number(sla.target_value || 24);

    const result = await db.execute(sql`
      INSERT INTO sla_tracking
        (sla_id, entity_type, record_id, record_label, department, deadline_at, metadata, created_at, updated_at)
      VALUES (
        ${Number(slaId)}, ${entityType},
        ${recordId ? Number(recordId) : null}, ${recordLabel ?? null},
        ${department ?? null},
        NOW() + (${targetHours} || ' hours')::interval,
        ${JSON.stringify(metadata || {})}::jsonb,
        NOW(), NOW()
      )
      RETURNING *
    `);
    res.status(201).json(rows(result)[0]);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/sla-tracking/:id/resolve", requireAuth as any, async (req: any, res) => {
  try {
    const id = Number(req.params.id);

    // Compute compliance: if resolved before deadline → 100%, else proportional
    const result = await db.execute(sql`
      UPDATE sla_tracking
      SET status = 'resolved',
          resolved_at = NOW(),
          compliance_pct = CASE
            WHEN deadline_at >= NOW() THEN 100
            ELSE ROUND((EXTRACT(EPOCH FROM (deadline_at - started_at)) / NULLIF(EXTRACT(EPOCH FROM (NOW() - started_at)), 0) * 100)::numeric, 2)
          END,
          updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `);
    res.json(rows(result)[0]);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// ─── Routes: SLA Dashboard ────────────────────────────────────────────────────

router.get("/platform/sla-dashboard", requireAuth as any, async (req: any, res) => {
  try {
    const [statsResult, byTypeResult, recentBreachesResult, approachingResult, trendResult] = await Promise.all([
      db.execute(sql`
        SELECT
          COUNT(*) FILTER (WHERE status = 'active') as active_count,
          COUNT(*) FILTER (WHERE status = 'breached') as breached_count,
          COUNT(*) FILTER (WHERE status = 'resolved') as resolved_count,
          COUNT(*) FILTER (WHERE status = 'active' AND deadline_at < NOW() + INTERVAL '2 hours') as approaching_breach_count,
          ROUND(AVG(CASE WHEN status = 'resolved' AND compliance_pct IS NOT NULL THEN compliance_pct END)::numeric, 2) as avg_compliance_pct
        FROM sla_tracking
      `),
      db.execute(sql`
        SELECT sd.sla_type, sd.name,
          COUNT(*) FILTER (WHERE st.status = 'active') as active,
          COUNT(*) FILTER (WHERE st.status = 'breached') as breached,
          COUNT(*) FILTER (WHERE st.status = 'resolved') as resolved,
          ROUND(AVG(CASE WHEN st.status = 'resolved' AND st.compliance_pct IS NOT NULL THEN st.compliance_pct END)::numeric, 2) as avg_compliance
        FROM sla_tracking st
        JOIN sla_definitions sd ON sd.id = st.sla_id
        GROUP BY sd.sla_type, sd.name
        ORDER BY sd.name
      `),
      db.execute(sql`
        SELECT st.*, sd.name as sla_name, sd.sla_type
        FROM sla_tracking st
        JOIN sla_definitions sd ON sd.id = st.sla_id
        WHERE st.status = 'breached'
        ORDER BY st.updated_at DESC
        LIMIT 10
      `),
      db.execute(sql`
        SELECT st.*, sd.name as sla_name, sd.sla_type, sd.warning_threshold_pct,
          ROUND(EXTRACT(EPOCH FROM (st.deadline_at - NOW())) / 3600, 2) as hours_remaining
        FROM sla_tracking st
        JOIN sla_definitions sd ON sd.id = st.sla_id
        WHERE st.status = 'active' AND st.deadline_at < NOW() + INTERVAL '4 hours'
        ORDER BY st.deadline_at ASC
        LIMIT 20
      `),
      db.execute(sql`
        SELECT
          DATE_TRUNC('day', created_at) as day,
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status = 'resolved') as resolved,
          COUNT(*) FILTER (WHERE status = 'breached') as breached,
          ROUND(AVG(CASE WHEN status = 'resolved' AND compliance_pct IS NOT NULL THEN compliance_pct END)::numeric, 2) as avg_compliance
        FROM sla_tracking
        WHERE created_at > NOW() - INTERVAL '30 days'
        GROUP BY DATE_TRUNC('day', created_at)
        ORDER BY day ASC
      `),
    ]);

    res.json({
      summary: rows(statsResult)[0] || {},
      byType: rows(byTypeResult),
      recentBreaches: rows(recentBreachesResult),
      approaching: rows(approachingResult),
      trendData: rows(trendResult),
    });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
