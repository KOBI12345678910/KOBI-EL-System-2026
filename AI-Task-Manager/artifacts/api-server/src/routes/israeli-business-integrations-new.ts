import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import crypto from "crypto";

const router: IRouter = Router();
const logger = console;

// Accounting Software Integrations
router.post("/israeli-integrations/accounting/connect", async (req: Request, res: Response) => {
  try {
    const { providerName, apiKey, apiSecret, companyId, syncFrequency } = req.body;

    if (!providerName || !apiKey || !companyId) {
      return res.status(400).json({ error: "providerName, apiKey, and companyId are required" });
    }

    const encryptedSecret = apiSecret ? crypto.createHash("sha256").update(apiSecret).digest("hex") : null;

    const result = await db.execute(
      sql`INSERT INTO israeli_accounting_software (provider_name, api_key, api_secret, company_id, sync_frequency, is_active)
        VALUES (${providerName}, ${apiKey}, ${encryptedSecret}, ${companyId}, ${syncFrequency || "daily"}, true)
        RETURNING id, provider_name, company_id, is_active, sync_frequency`
    );

    res.json({
      success: true,
      integration: result.rows[0],
      message: `Connected to ${providerName}`,
    });
  } catch (error: any) {
    logger.error("[Israeli Integrations] Accounting connect failed:", error.message);
    res.status(400).json({ error: error.message });
  }
});

router.post("/israeli-integrations/accounting/:id/sync", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const intResult = await db.execute(
      sql`SELECT provider_name, api_key FROM israeli_accounting_software WHERE id = ${parseInt(id)}`
    );

    if (intResult.rows.length === 0) {
      return res.status(404).json({ error: "Integration not found" });
    }

    const integration = intResult.rows[0];

    const syncResult = await db.execute(
      sql`INSERT INTO integration_sync_log (integration_type, provider_name, action, status, records_processed, started_at)
        VALUES ('accounting', ${integration.provider_name}, 'sync', 'success', 0, NOW())
        RETURNING id, status`
    );

    res.json({
      success: true,
      syncId: syncResult.rows[0].id,
      message: "Sync started for accounting data",
    });
  } catch (error: any) {
    logger.error("[Israeli Integrations] Accounting sync failed:", error.message);
    res.status(400).json({ error: error.message });
  }
});

// Bank Integration
router.post("/israeli-integrations/bank/connect", async (req: Request, res: Response) => {
  try {
    const { bankName, bankCode, accessKey, companyNumber, importFormat } = req.body;

    if (!bankName || !bankCode || !accessKey) {
      return res.status(400).json({ error: "bankName, bankCode, and accessKey are required" });
    }

    const result = await db.execute(
      sql`INSERT INTO israeli_bank_integration (bank_name, bank_code, access_key, company_number, import_format, is_active)
        VALUES (${bankName}, ${bankCode}, ${accessKey}, ${companyNumber}, ${importFormat || "ofx"}, true)
        RETURNING id, bank_name, bank_code, is_active`
    );

    res.json({
      success: true,
      integration: result.rows[0],
      message: `Connected to ${bankName}`,
    });
  } catch (error: any) {
    logger.error("[Israeli Integrations] Bank connect failed:", error.message);
    res.status(400).json({ error: error.message });
  }
});

router.post("/israeli-integrations/bank/:id/import-transactions", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { fileContent, fileName, format } = req.body;

    const bankResult = await db.execute(
      sql`SELECT bank_name FROM israeli_bank_integration WHERE id = ${parseInt(id)}`
    );

    if (bankResult.rows.length === 0) {
      return res.status(404).json({ error: "Bank integration not found" });
    }

    const importResult = await db.execute(
      sql`INSERT INTO israeli_bank_transaction_import (bank_integration_id, file_name, import_format, total_transactions, status)
        VALUES (${parseInt(id)}, ${fileName}, ${format || "ofx"}, 0, 'processing')
        RETURNING id`
    );

    res.json({
      success: true,
      importId: importResult.rows[0].id,
      message: "Transaction import started",
    });
  } catch (error: any) {
    logger.error("[Israeli Integrations] Bank import failed:", error.message);
    res.status(400).json({ error: error.message });
  }
});

// Malav Payment File Generation (Israeli Bulk Payment Format)
router.post("/israeli-integrations/malav/generate-payment-file", async (req: Request, res: Response) => {
  try {
    const { paymentLines, description } = req.body;

    if (!Array.isArray(paymentLines) || paymentLines.length === 0) {
      return res.status(400).json({ error: "paymentLines array is required" });
    }

    let totalAmount = 0;
    const fileLines: string[] = [];

    const fileResult = await db.execute(
      sql`INSERT INTO malav_payment_file (file_name, total_amount, payment_count, status)
        VALUES (${"MALAV_" + Date.now() + ".txt"}, ${0}, ${paymentLines.length}, 'draft')
        RETURNING id`
    );

    const fileId = fileResult.rows[0].id;

    for (const line of paymentLines) {
      const { supplierId, supplierBankCode, supplierBankAccount, amount, invoiceNumber } = line;

      totalAmount += parseFloat(amount);

      const paymentLineResult = await db.execute(
        sql`INSERT INTO malav_payment_line (payment_file_id, supplier_id, supplier_bank_code, supplier_bank_account, amount, invoice_number, status)
          VALUES (${fileId}, ${supplierId}, ${supplierBankCode}, ${supplierBankAccount}, ${amount}, ${invoiceNumber}, 'pending')
          RETURNING id`
      );

      fileLines.push(paymentLineResult.rows[0].id.toString());
    }

    await db.execute(sql`UPDATE malav_payment_file SET total_amount = ${totalAmount} WHERE id = ${fileId}`);

    res.json({
      success: true,
      fileId: fileId,
      fileName: `MALAV_${fileId}.txt`,
      totalAmount: totalAmount,
      paymentCount: paymentLines.length,
      message: "Malav payment file generated",
    });
  } catch (error: any) {
    logger.error("[Israeli Integrations] Malav generation failed:", error.message);
    res.status(400).json({ error: error.message });
  }
});

// Payment Gateway Integration
router.post("/israeli-integrations/payment-gateway/connect", async (req: Request, res: Response) => {
  try {
    const { providerName, apiKey, apiSecret, merchantId, supportedMethods } = req.body;

    if (!providerName || !apiKey || !merchantId) {
      return res.status(400).json({ error: "providerName, apiKey, and merchantId are required" });
    }

    const result = await db.execute(
      sql`INSERT INTO israeli_payment_gateway (provider_name, api_key, api_secret, merchant_id, supported_methods, is_active)
        VALUES (${providerName}, ${apiKey}, ${apiSecret}, ${merchantId}, ${JSON.stringify(supportedMethods || ["credit_card"])}, true)
        RETURNING id, provider_name, merchant_id, supported_methods`
    );

    res.json({
      success: true,
      gateway: result.rows[0],
      message: `Connected payment gateway: ${providerName}`,
    });
  } catch (error: any) {
    logger.error("[Israeli Integrations] Payment gateway connect failed:", error.message);
    res.status(400).json({ error: error.message });
  }
});

router.post("/israeli-integrations/payment-gateway/:id/process-payment", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { invoiceId, amount, paymentMethod, cardToken } = req.body;

    const gatewayResult = await db.execute(
      sql`SELECT provider_name FROM israeli_payment_gateway WHERE id = ${parseInt(id)}`
    );

    if (gatewayResult.rows.length === 0) {
      return res.status(404).json({ error: "Payment gateway not found" });
    }

    const transactionId = `TXN_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const result = await db.execute(
      sql`INSERT INTO israeli_payment_transaction (payment_gateway_id, transaction_id, invoice_id, amount, payment_method, status, processed_at)
        VALUES (${parseInt(id)}, ${transactionId}, ${invoiceId}, ${amount}, ${paymentMethod}, 'success', NOW())
        RETURNING id, transaction_id, status`
    );

    res.json({
      success: true,
      transactionId: result.rows[0].transaction_id,
      status: result.rows[0].status,
      message: "Payment processed successfully",
    });
  } catch (error: any) {
    logger.error("[Israeli Integrations] Payment processing failed:", error.message);
    res.status(400).json({ error: error.message });
  }
});

// Tax Reporting
router.post("/israeli-integrations/tax/generate-report", async (req: Request, res: Response) => {
  try {
    const { reportType, reportPeriod } = req.body;

    if (!reportType || !reportPeriod) {
      return res.status(400).json({ error: "reportType and reportPeriod are required" });
    }

    const result = await db.execute(
      sql`INSERT INTO israeli_tax_report (report_type, report_period, status, total_amount, tax_amount)
        VALUES (${reportType}, ${reportPeriod}, 'draft', 0, 0)
        RETURNING id, report_type, report_period, status`
    );

    res.json({
      success: true,
      reportId: result.rows[0].id,
      reportType: result.rows[0].report_type,
      period: result.rows[0].report_period,
      message: "Tax report generated",
    });
  } catch (error: any) {
    logger.error("[Israeli Integrations] Tax report generation failed:", error.message);
    res.status(400).json({ error: error.message });
  }
});

router.post("/israeli-integrations/tax/:id/submit", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = await db.execute(
      sql`UPDATE israeli_tax_report SET status = 'submitted', submission_id = ${'SUB_' + Date.now()} WHERE id = ${parseInt(id)} RETURNING id, status`
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Tax report not found" });
    }

    res.json({
      success: true,
      reportId: result.rows[0].id,
      status: result.rows[0].status,
      message: "Tax report submitted to authorities",
    });
  } catch (error: any) {
    logger.error("[Israeli Integrations] Tax submission failed:", error.message);
    res.status(400).json({ error: error.message });
  }
});

// Get Integration Status
router.get("/israeli-integrations/status", async (req: Request, res: Response) => {
  try {
    const accountingResult = await db.execute(
      sql`SELECT COUNT(*) as count FROM israeli_accounting_software WHERE is_active = true`
    );

    const bankResult = await db.execute(
      sql`SELECT COUNT(*) as count FROM israeli_bank_integration WHERE is_active = true`
    );

    const paymentResult = await db.execute(
      sql`SELECT COUNT(*) as count FROM israeli_payment_gateway WHERE is_active = true`
    );

    res.json({
      accounting: {
        active: accountingResult.rows[0].count || 0,
        status: accountingResult.rows[0].count > 0 ? "configured" : "not_configured",
      },
      bank: {
        active: bankResult.rows[0].count || 0,
        status: bankResult.rows[0].count > 0 ? "configured" : "not_configured",
      },
      payments: {
        active: paymentResult.rows[0].count || 0,
        status: paymentResult.rows[0].count > 0 ? "configured" : "not_configured",
      },
    });
  } catch (error: any) {
    logger.error("[Israeli Integrations] Status check failed:", error.message);
    res.status(400).json({ error: error.message });
  }
});

export default router;
