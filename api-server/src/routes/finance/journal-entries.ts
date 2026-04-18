/**
 * Journal Entries API — SAP-like posting
 *
 * Rules:
 * 1. Every journal must be balanced (debit = credit)
 * 2. Posted journals are immutable
 * 3. Reversal creates a mirror entry
 * 4. Every posting creates an audit trail
 * 5. No hard delete on posted entries
 */
import { Router, Request, Response } from "express";
import { db } from "@db";
import { journalEntriesTable, journalEntryLinesTable } from "@db/schema";
import { eq, desc, and, sql, between, like, or } from "drizzle-orm";

const router = Router();

// ═══════════════════════════════════════════════════════════════
// LIST — Get all journal entries with filters
// ═══════════════════════════════════════════════════════════════
router.get("/", async (req: Request, res: Response) => {
  try {
    const { status, sourceType, dateFrom, dateTo, search, page = "1", limit = "50" } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let query = db.select().from(journalEntriesTable);
    const conditions: any[] = [];

    if (status) conditions.push(eq(journalEntriesTable.status, String(status)));
    if (sourceType) conditions.push(eq(journalEntriesTable.sourceType, String(sourceType)));
    if (dateFrom && dateTo) {
      conditions.push(between(journalEntriesTable.postingDate, String(dateFrom), String(dateTo)));
    }
    if (search) {
      conditions.push(or(
        like(journalEntriesTable.journalNo, `%${search}%`),
        like(journalEntriesTable.memo, `%${search}%`)
      ));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    const entries = await (query as any)
      .orderBy(desc(journalEntriesTable.createdAt))
      .limit(Number(limit))
      .offset(offset);

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(journalEntriesTable);

    res.json({
      data: entries,
      total: countResult[0]?.count || 0,
      page: Number(page),
      limit: Number(limit),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET BY ID — with lines
// ═══════════════════════════════════════════════════════════════
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const [entry] = await db
      .select()
      .from(journalEntriesTable)
      .where(eq(journalEntriesTable.id, Number(id)));

    if (!entry) {
      return res.status(404).json({ error: "Journal entry not found" });
    }

    const lines = await db
      .select()
      .from(journalEntryLinesTable)
      .where(eq(journalEntryLinesTable.journalEntryId, Number(id)));

    res.json({ ...entry, lines });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// CREATE — Draft journal entry with lines
// ═══════════════════════════════════════════════════════════════
router.post("/", async (req: Request, res: Response) => {
  try {
    const { journalNo, postingDate, sourceType, sourceId, memo, lines } = req.body;

    if (!lines || lines.length === 0) {
      return res.status(400).json({ error: "Journal entry must have at least one line" });
    }

    // Validate balance
    const totalDebit = lines.reduce((sum: number, l: any) => sum + Number(l.debit || 0), 0);
    const totalCredit = lines.reduce((sum: number, l: any) => sum + Number(l.credit || 0), 0);
    const difference = Math.abs(totalDebit - totalCredit);

    if (difference >= 0.01) {
      return res.status(400).json({
        error: `Journal entry not balanced: debit=${totalDebit.toFixed(2)}, credit=${totalCredit.toFixed(2)}, difference=${difference.toFixed(2)}`,
      });
    }

    // Create header
    const [entry] = await db
      .insert(journalEntriesTable)
      .values({
        journalNo: journalNo || `JE-${Date.now()}`,
        postingDate: postingDate || new Date().toISOString().slice(0, 10),
        sourceType: sourceType || "MANUAL",
        sourceId: sourceId || null,
        memo,
        status: "DRAFT",
        totalDebit: totalDebit.toFixed(2),
        totalCredit: totalCredit.toFixed(2),
      })
      .returning();

    // Create lines
    const insertedLines = [];
    for (const line of lines) {
      const [inserted] = await db
        .insert(journalEntryLinesTable)
        .values({
          journalEntryId: entry.id,
          glAccountNo: line.glAccountNo,
          debit: String(Number(line.debit || 0).toFixed(2)),
          credit: String(Number(line.credit || 0).toFixed(2)),
          description: line.description,
          costCenter: line.costCenter,
          projectId: line.projectId,
        })
        .returning();
      insertedLines.push(inserted);
    }

    res.status(201).json({ ...entry, lines: insertedLines });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// POST (status transition) — Post a draft journal entry
// ═══════════════════════════════════════════════════════════════
router.post("/:id/post", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const [entry] = await db
      .select()
      .from(journalEntriesTable)
      .where(eq(journalEntriesTable.id, Number(id)));

    if (!entry) {
      return res.status(404).json({ error: "Journal entry not found" });
    }

    if (entry.status !== "DRAFT") {
      return res.status(400).json({ error: `Cannot post: current status is ${entry.status}. Only DRAFT entries can be posted.` });
    }

    // Re-validate balance
    const lines = await db
      .select()
      .from(journalEntryLinesTable)
      .where(eq(journalEntryLinesTable.journalEntryId, Number(id)));

    const totalDebit = lines.reduce((sum, l) => sum + Number(l.debit || 0), 0);
    const totalCredit = lines.reduce((sum, l) => sum + Number(l.credit || 0), 0);

    if (Math.abs(totalDebit - totalCredit) >= 0.01) {
      return res.status(400).json({ error: "Cannot post: journal entry is not balanced" });
    }

    const [updated] = await db
      .update(journalEntriesTable)
      .set({ status: "POSTED", postedAt: new Date() })
      .where(eq(journalEntriesTable.id, Number(id)))
      .returning();

    res.json({ ...updated, message: "Journal entry posted successfully" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// REVERSE — Create reversal entry for posted journal
// ═══════════════════════════════════════════════════════════════
router.post("/:id/reverse", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const [entry] = await db
      .select()
      .from(journalEntriesTable)
      .where(eq(journalEntriesTable.id, Number(id)));

    if (!entry) {
      return res.status(404).json({ error: "Journal entry not found" });
    }

    if (entry.status !== "POSTED") {
      return res.status(400).json({ error: `Cannot reverse: current status is ${entry.status}. Only POSTED entries can be reversed.` });
    }

    // Get original lines
    const lines = await db
      .select()
      .from(journalEntryLinesTable)
      .where(eq(journalEntryLinesTable.journalEntryId, Number(id)));

    // Create reversal header
    const [reversal] = await db
      .insert(journalEntriesTable)
      .values({
        journalNo: `${entry.journalNo}-REV`,
        postingDate: new Date().toISOString().slice(0, 10),
        sourceType: "REVERSAL",
        sourceId: entry.id,
        memo: `סטורנו: ${entry.memo || entry.journalNo}${reason ? ` — ${reason}` : ""}`,
        status: "POSTED",
        totalDebit: entry.totalCredit,
        totalCredit: entry.totalDebit,
        postedAt: new Date(),
      })
      .returning();

    // Create reversed lines (swap debit/credit)
    for (const line of lines) {
      await db.insert(journalEntryLinesTable).values({
        journalEntryId: reversal.id,
        glAccountNo: line.glAccountNo,
        debit: line.credit,
        credit: line.debit,
        description: `סטורנו: ${line.description || ""}`,
        costCenter: line.costCenter,
        projectId: line.projectId,
      });
    }

    // Mark original as reversed
    await db
      .update(journalEntriesTable)
      .set({ status: "REVERSED" })
      .where(eq(journalEntriesTable.id, Number(id)));

    res.json({ original: { ...entry, status: "REVERSED" }, reversal, message: "Journal entry reversed successfully" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// UPDATE — Only draft entries can be updated
// ═══════════════════════════════════════════════════════════════
router.put("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const [entry] = await db
      .select()
      .from(journalEntriesTable)
      .where(eq(journalEntriesTable.id, Number(id)));

    if (!entry) {
      return res.status(404).json({ error: "Journal entry not found" });
    }

    if (entry.status !== "DRAFT") {
      return res.status(400).json({ error: "Cannot edit: only DRAFT entries can be modified. Posted entries are immutable." });
    }

    const { memo, postingDate, lines } = req.body;

    // Update header
    const [updated] = await db
      .update(journalEntriesTable)
      .set({
        memo: memo ?? entry.memo,
        postingDate: postingDate ?? entry.postingDate,
      })
      .where(eq(journalEntriesTable.id, Number(id)))
      .returning();

    // Replace lines if provided
    if (lines && lines.length > 0) {
      const totalDebit = lines.reduce((sum: number, l: any) => sum + Number(l.debit || 0), 0);
      const totalCredit = lines.reduce((sum: number, l: any) => sum + Number(l.credit || 0), 0);

      if (Math.abs(totalDebit - totalCredit) >= 0.01) {
        return res.status(400).json({ error: "Lines are not balanced" });
      }

      // Delete old lines
      await db
        .delete(journalEntryLinesTable)
        .where(eq(journalEntryLinesTable.journalEntryId, Number(id)));

      // Insert new lines
      for (const line of lines) {
        await db.insert(journalEntryLinesTable).values({
          journalEntryId: Number(id),
          glAccountNo: line.glAccountNo,
          debit: String(Number(line.debit || 0).toFixed(2)),
          credit: String(Number(line.credit || 0).toFixed(2)),
          description: line.description,
          costCenter: line.costCenter,
          projectId: line.projectId,
        });
      }

      await db
        .update(journalEntriesTable)
        .set({ totalDebit: totalDebit.toFixed(2), totalCredit: totalCredit.toFixed(2) })
        .where(eq(journalEntriesTable.id, Number(id)));
    }

    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// SUMMARY — Trial balance / account totals
// ═══════════════════════════════════════════════════════════════
router.get("/summary/trial-balance", async (req: Request, res: Response) => {
  try {
    const { dateFrom, dateTo } = req.query;

    const result = await db.execute(sql`
      SELECT
        jl.gl_account_no,
        COALESCE(SUM(CAST(jl.debit AS NUMERIC)), 0) as total_debit,
        COALESCE(SUM(CAST(jl.credit AS NUMERIC)), 0) as total_credit,
        COALESCE(SUM(CAST(jl.debit AS NUMERIC)), 0) - COALESCE(SUM(CAST(jl.credit AS NUMERIC)), 0) as balance
      FROM journal_entry_lines jl
      INNER JOIN journal_entries je ON jl.journal_entry_id = je.id
      WHERE je.status = 'POSTED'
      ${dateFrom ? sql`AND je.posting_date >= ${String(dateFrom)}` : sql``}
      ${dateTo ? sql`AND je.posting_date <= ${String(dateTo)}` : sql``}
      GROUP BY jl.gl_account_no
      ORDER BY jl.gl_account_no
    `);

    res.json({ data: result.rows || result });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
