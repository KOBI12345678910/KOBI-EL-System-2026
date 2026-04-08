export * from "./ai-providers";
export * from "./ai-models";
export * from "./ai-api-keys";
export * from "./ai-usage-logs";
export * from "./ai-queries";
export * from "./ai-responses";
export * from "./ai-recommendations";
export * from "./ai-permissions";
export * from "./ai-prompt-templates";
export * from "./notifications";
export * from "./notification-preferences";
export * from "./platform-modules";
export * from "./module-entities";
export * from "./entity-fields";
export * from "./entity-relations";
export * from "./entity-records";
export * from "./entity-statuses";
export * from "./view-definitions";
export * from "./form-definitions";
export * from "./action-definitions";
export * from "./record-audit-log";
export * from "./platform-widgets";
export * from "./platform-workflows";
export * from "./entity-categories";
export * from "./category-definitions";
export * from "./category-items";
export * from "./validation-rules";
export * from "./scaffolding-tables";
export * from "./claude-connection-tests";
export * from "./claude-audit-logs";
export * from "./claude-sessions";
export * from "./detail-definitions";
export * from "./platform-roles";
export * from "./record-versions";
export * from "./platform-automations";
export * from "./report-definitions";
export * from "./document-templates";
export * from "./integration-connections";
export * from "./ai-builder-configs";
export * from "./claude-governance";
export * from "./claude-chat";
export * from "./suppliers";
export * from "./supplier-contacts";
export * from "./contacts";
export * from "./leads";
export * from "./supplier-documents";
export * from "./supplier-notes";
export * from "./supplier-performance";
export * from "./raw-materials";
export * from "./purchase-requests";
export * from "./purchase-orders";
export * from "./goods-receipts";
export * from "./price-history";
export * from "./price-quotes";
export * from "./auto-number-counters";
export * from "./users";
export * from "./approval-requests";
export * from "./data-scope-rules";
export * from "./button-definitions";
export * from "./detail-page-definitions";
export * from "./platform-tools";
export * from "./platform-contexts";
export * from "./project-analyses";
export * from "./business-analytics";
export * from "./template-definitions";
export * from "./report-snapshots";
export * from "./workflow-steps";
export * from "./platform-settings";
export * from "./menu-definitions";
export * from "./role-permissions";
export * from "./module-versions";
export * from "./supplier-evaluations";
export * from "./purchase-returns";
export * from "./supplier-contracts";
export * from "./budgets";
export * from "./import-orders";
export * from "./customs-clearances";
export * from "./shipment-tracking";
export * from "./foreign-suppliers";
export * from "./letters-of-credit";
export * from "./import-cost-calculations";
export * from "./compliance-certificates";
export * from "./exchange-rates";
export * from "./integration-messages";
export * from "./chat";
export * from "./finance-accounts";
export * from "./journal-entries";
export * from "./accounts-payable";
export * from "./accounts-receivable";
export * from "./bank-reconciliation";
export * from "./cash-flow";
export * from "./tax-records";
export * from "./general-ledger";
export * from "./expense-reports";
export * from "./fixed-assets";
export * from "./marketing";
export * from "./product-development";
export * from "./production-enterprise";
export * from "./pricing-enterprise";
export * from "./projects";
export * from "./server-health-logs";
export * from "./project-tasks";
export * from "./project-task-dependencies";
export * from "./project-milestones";
export * from "./project-resources";
export * from "./project-budget-lines";
export * from "./project-risks";
export * from "./timesheet-entries";
export * from "./strategic-goals";
export * from "./swot-items";
export * from "./bsc-objectives";
export * from "./competitive-analyses";
export * from "./business-plan-sections";
export * from "./external-portal";
export * from "./production-bom";
export * from "./production-work-orders";
export * from "./production-plans";
export * from "./qc-inspections";
export * from "./machines";
export * from "./roadmap-items";
export * from "./qa-testing";
export * from "./supplier-communications";
export * from "./product-catalog";
export * from "./calendar";
export * from "./workforce-analysis";
export * from "./documents";
export * from "./inventory-alerts";
export * from "./kimi-agents";
export * from "./notification-routing";
export * from "./email-templates";
export * from "./push-subscriptions";

export * from "./fabrication-profiles";
export * from "./fabrication-workflow";

// TASKS 1-6: Newly added tables for enhanced ERP functionality
export { customersTable } from "./customers";
export { salesCustomersTable } from "./sales-customers";
export { salesOrdersTable, salesOrderItemsTable } from "./sales-orders";

// TASK 223: Warehouse Intelligence & VMI
export * from "./warehouse-intelligence";

export * from "./edi";
export * from "./ai-orchestration";
export * from "./project-change-orders";
export * from "./project-documents";
export * from "./project-templates";

// TASK 249: Security - Auth & Access Control (RBAC, MFA, SSO, Sessions)
export * from "./security";
export * from "./shipping-freight";

export * from "./business-rules";

// TASK 263: BI — Report Builder & Dashboard Designer
export * from "./bi-tables";
export * from "./webhooks-scheduled-tasks";

// TASK 265: BI — Scheduled Reports, Ad-hoc Query & Comparative Analytics
export * from "./bi-scheduled-reports";

// TASK 257: Contract Templates & E-Signature
export * from "./contract-templates";
export * from "./contracts";

// New Core Tables (Departments, Shifts, Attendance, etc.)
export * from "./departments";
export * from "./shifts";
export * from "./attendance";
export * from "./invoices";
export * from "./inventory";
export * from "./work-order-assignments";
export * from "./work-order-notes";
export * from "./work-order-photos";
export * from "./work-order-templates";
export * from "./work-order-qr-codes";
export * from "./inventory-movements";
export * from "./ip-allowlist";
export * from "./payment-reminders";
export * from "./whatsapp-messages";
export * from "./onboarding-checklists";
export * from "./performance-reviews";
export * from "./payroll-records";

// Financial Module - New Architecture
export * from "./fin-statuses";
export * from "./fin-document-types";
export * from "./fin-payment-methods";
export * from "./fin-categories";
export * from "./fin-documents";
export * from "./fin-document-links";
export * from "./fin-attachments";
export * from "./fin-payments";
export * from "./fin-recurring-documents";
export * from "./fin-standing-orders";
export * from "./fin-credit-transactions";
export * from "./fin-activity-logs";

// Institutional Finance - Ratios, Risk, Monte Carlo, Statements, Treasury
export * from "./fin-ratios";
export * from "./fin-risk";
export * from "./fin-monte-carlo";
export * from "./fin-statements";
