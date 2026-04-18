import { pgTable, serial, text, boolean, timestamp, jsonb, numeric } from "drizzle-orm/pg-core";

export const israeliAccountingSoftwareTable = pgTable("israeli_accounting_software", {
  id: serial("id").primaryKey(),
  providerName: text("provider_name").notNull(), // Hashavshevet, Rivhit, Heshbonit Mas, Cheshbon
  apiKey: text("api_key"),
  apiSecret: text("api_secret"),
  companyId: text("company_id"),
  isActive: boolean("is_active").default(true),
  lastSyncAt: timestamp("last_sync_at"),
  syncFrequency: text("sync_frequency").default("daily"), // hourly, daily, weekly
  fieldMappings: jsonb("field_mappings").default({}), // chart of accounts mapping
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const israeliBankIntegrationTable = pgTable("israeli_bank_integration", {
  id: serial("id").primaryKey(),
  bankName: text("bank_name").notNull(), // Bank Hapoalim, Bank Leumi, etc.
  bankCode: text("bank_code"),
  accessKey: text("access_key"),
  encryptedPassword: text("encrypted_password"),
  companyNumber: text("company_number"),
  isActive: boolean("is_active").default(true),
  lastImportAt: timestamp("last_import_at"),
  importFormat: text("import_format").default("ofx"), // ofx, csv, mt940
  bankAccountMappings: jsonb("bank_account_mappings").default({}), // map bank accounts to ERP accounts
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const israeliBankTransactionImportTable = pgTable("israeli_bank_transaction_import", {
  id: serial("id").primaryKey(),
  bankIntegrationId: serial("bank_integration_id"),
  importDate: timestamp("import_date").notNull().defaultNow(),
  fileFormat: text("file_format"), // ofx, csv, mt940
  fileName: text("file_name"),
  totalTransactions: serial("total_transactions"),
  processedTransactions: serial("processed_transactions"),
  matchedToInvoices: serial("matched_to_invoices"),
  status: text("status").default("pending"), // pending, processing, completed, failed
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const malavPaymentFileTable = pgTable("malav_payment_file", {
  id: serial("id").primaryKey(),
  fileName: text("file_name").notNull(),
  totalAmount: numeric("total_amount", { precision: 15, scale: 2 }),
  paymentCount: serial("payment_count"),
  status: text("status").default("draft"), // draft, submitted, confirmed, rejected
  submittedAt: timestamp("submitted_at"),
  responseCode: text("response_code"),
  responseMessage: text("response_message"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const malavPaymentLineTable = pgTable("malav_payment_line", {
  id: serial("id").primaryKey(),
  paymentFileId: serial("payment_file_id"),
  supplierId: serial("supplier_id"),
  supplierName: text("supplier_name"),
  supplierBankCode: text("supplier_bank_code"),
  supplierBankAccount: text("supplier_bank_account"),
  supplierIdentity: text("supplier_identity"), // ID number
  amount: numeric("amount", { precision: 15, scale: 2 }),
  invoiceNumber: text("invoice_number"),
  paymentDescription: text("payment_description"),
  status: text("status").default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const israeliPaymentGatewayTable = pgTable("israeli_payment_gateway", {
  id: serial("id").primaryKey(),
  providerName: text("provider_name").notNull(), // Tranzila, CardCom, PayPal
  apiKey: text("api_key"),
  apiSecret: text("api_secret"),
  merchantId: text("merchant_id"),
  merchantPassword: text("merchant_password"),
  isActive: boolean("is_active").default(true),
  supportedMethods: jsonb("supported_methods").default(["credit_card"]), // credit_card, direct_debit, bank_transfer
  lastTestAt: timestamp("last_test_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const israeliPaymentTransactionTable = pgTable("israeli_payment_transaction", {
  id: serial("id").primaryKey(),
  paymentGatewayId: serial("payment_gateway_id"),
  transactionId: text("transaction_id").notNull(), // unique from provider
  invoiceId: serial("invoice_id"),
  amount: numeric("amount", { precision: 15, scale: 2 }),
  currency: text("currency").default("ILS"),
  paymentMethod: text("payment_method"), // credit_card, direct_debit, bank_transfer
  tokenization: text("tokenization"), // for recurring payments
  status: text("status").default("pending"), // pending, success, failed, refunded
  errorCode: text("error_code"),
  errorMessage: text("error_message"),
  processedAt: timestamp("processed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const israeliTaxReportTable = pgTable("israeli_tax_report", {
  id: serial("id").primaryKey(),
  reportType: text("report_type").notNull(), // vat, withholding_tax, income_tax
  reportPeriod: text("report_period"), // YYYY-MM
  status: text("status").default("draft"), // draft, submitted, approved, rejected
  totalAmount: numeric("total_amount", { precision: 15, scale: 2 }),
  taxAmount: numeric("tax_amount", { precision: 15, scale: 2 }),
  fileContent: text("file_content"), // XML or text format for tax authority
  submissionId: text("submission_id"), // from tax authority
  responseMessage: text("response_message"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const integrationSyncLogTable = pgTable("integration_sync_log", {
  id: serial("id").primaryKey(),
  integrationType: text("integration_type").notNull(), // accounting, bank, payment, tax
  providerName: text("provider_name"),
  action: text("action"), // sync, import, export, submit
  status: text("status").notNull(), // success, failed, partial
  recordsProcessed: serial("records_processed"),
  recordsFailed: serial("records_failed"),
  errorMessage: text("error_message"),
  syncDetails: jsonb("sync_details").default({}),
  startedAt: timestamp("started_at").notNull(),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
