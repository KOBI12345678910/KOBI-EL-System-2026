import { Router, Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { validateSession } from "../lib/auth";

const router = Router();

async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.substring(7) : null;
  if (!token) { res.status(401).json({ error: "נדרשת התחברות" }); return; }
  const result = await validateSession(token);
  if (result.error || !result.user) { res.status(401).json({ error: "הסשן פג תוקף" }); return; }
  (req as any).user = result.user;
  next();
}

router.use("/bi/export", requireAuth as any);

async function getReportData(reportId: number): Promise<{ columns: any[]; rows: any[]; reportName: string }> {
  const result = await db.execute(sql`SELECT * FROM report_definitions WHERE id = ${reportId}`);
  const report = result.rows[0] as any;
  if (!report) throw new Error("דוח לא נמצא");

  if (!report.entity_id) return { columns: [], rows: [], reportName: report.name };

  const entityResult = await db.execute(sql`SELECT * FROM module_entities WHERE id = ${report.entity_id}`);
  const entity = entityResult.rows[0] as any;
  if (!entity) return { columns: [], rows: [], reportName: report.name };

  const columns: any[] = Array.isArray(report.columns) ? report.columns : [];
  if (columns.length === 0) return { columns: [], rows: [], reportName: report.name };

  const tableName = entity.slug?.replace(/-/g, "_") || entity.name?.toLowerCase().replace(/\s+/g, "_");
  const columnSlugs = columns.map((c: any) => c.fieldSlug).filter(Boolean);
  const selectCols = columnSlugs.map((s: string) => `"${s}"`).join(", ");

  try {
    const dataResult = await db.execute(sql.raw(`SELECT ${selectCols} FROM "${tableName}" LIMIT 10000`));
    const rows = (dataResult.rows || []).map((row: any) => {
      const mapped: any = {};
      columns.forEach((col: any) => {
        mapped[col.fieldSlug] = row[col.fieldSlug] ?? "";
      });
      return mapped;
    });
    return { columns, rows, reportName: report.name };
  } catch {
    return { columns, rows: [], reportName: report.name };
  }
}

router.post("/bi/export/report/:id", async (req: Request, res: Response) => {
  try {
    const reportId = parseInt(req.params.id);
    const format = (req.body.format || "csv").toLowerCase();
    const { columns, rows, reportName } = await getReportData(reportId);

    if (format === "json") {
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", `attachment; filename="report-${reportId}.json"`);
      res.json({ reportName, columns, rows, exportedAt: new Date().toISOString() });
      return;
    }

    if (format === "csv") {
      const header = columns.map((c: any) => `"${(c.label || c.fieldSlug).replace(/"/g, '""')}"`).join(",");
      const csvRows = rows.map((row: any) =>
        columns.map((c: any) => {
          const val = row[c.fieldSlug] ?? "";
          return `"${String(val).replace(/"/g, '""')}"`;
        }).join(",")
      );
      const csv = [header, ...csvRows].join("\n");
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="report-${reportId}.csv"`);
      res.send("\uFEFF" + csv);
      return;
    }

    if (format === "excel") {
      const header = columns.map((c: any) => c.label || c.fieldSlug).join("\t");
      const xlsRows = rows.map((row: any) =>
        columns.map((c: any) => row[c.fieldSlug] ?? "").join("\t")
      );
      const tsv = [header, ...xlsRows].join("\n");
      res.setHeader("Content-Type", "application/vnd.ms-excel; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="report-${reportId}.xls"`);
      res.send("\uFEFF" + tsv);
      return;
    }

    if (format === "pdf") {
      const header = columns.map((c: any) => c.label || c.fieldSlug).join(" | ");
      const pdfRows = rows.map((row: any) =>
        columns.map((c: any) => row[c.fieldSlug] ?? "").join(" | ")
      );
      const text = [reportName, "=".repeat(60), header, "-".repeat(60), ...pdfRows].join("\n");
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="report-${reportId}.txt"`);
      res.send(text);
      return;
    }

    res.status(400).json({ error: "פורמט לא נתמך" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
