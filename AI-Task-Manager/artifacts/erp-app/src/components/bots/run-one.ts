/**
 * run-one.ts
 * Usage: npx ts-node run-one.ts CEO
 */

import * as path from "path";

const role = (process.argv[2] || "").toUpperCase();
if (!role) {
  console.error("Usage: npx ts-node run-one.ts <ROLE>");
  console.error("Example: npx ts-node run-one.ts CEO");
  process.exit(1);
}

type BotLoader = () => { new (config?: Record<string, unknown>): { run(): Promise<{ file: string; report: { stats: { finishedAt: string; successes: number; failures: number } } }> } };

const bots: Record<string, BotLoader> = {
  // Level 1 - CEO
  CEO: () => require("./roles/CEO.bot"),

  // Level 2 - C-Level
  CTO: () => require("./roles/CTO.bot"),
  COO: () => require("./roles/COO.bot"),
  CPO: () => require("./roles/CPO.bot"),
  CFO: () => require("./roles/CFO.bot"),
  CMO: () => require("./roles/CMO.bot"),
  CISO: () => require("./roles/CISO.bot"),

  // Level 3 - Delivery & Tech
  ARCHITECT: () => require("./roles/ARCHITECT.bot"),
  DEVOPS: () => require("./roles/DEVOPS.bot"),
  PYTHON_FIXER: () => require("./roles/PYTHON_FIXER.bot"),
  BACKEND: () => require("./roles/BACKEND.bot"),
  FRONTEND: () => require("./roles/FRONTEND.bot"),
  FULLSTACK: () => require("./roles/FULLSTACK.bot"),
  QA: () => require("./roles/QA.bot"),
  AUTOMATION: () => require("./roles/AUTOMATION.bot"),
  CLOUD: () => require("./roles/CLOUD.bot"),

  // Level 4 - Ops / Support / Data
  PM: () => require("./roles/PM.bot"),
  DESIGN: () => require("./roles/DESIGN.bot"),
  DATA: () => require("./roles/DATA.bot"),
  ANALYTICS: () => require("./roles/ANALYTICS.bot"),
  ML: () => require("./roles/ML.bot"),
  SUPPORT_L1: () => require("./roles/SUPPORT_L1.bot"),
  SUPPORT_L2: () => require("./roles/SUPPORT_L2.bot"),
  CS: () => require("./roles/CS.bot"),
  SALES: () => require("./roles/SALES.bot"),
  MARKETING: () => require("./roles/MARKETING.bot"),
  HR: () => require("./roles/HR.bot"),
};

if (!bots[role]) {
  console.error(`\nx Unknown bot: ${role}\n`);
  console.error("Available bots:");
  console.error("\n  Level 1 - CEO:");
  console.error("   CEO");
  console.error("\n  Level 2 - C-Level:");
  console.error("   CTO, COO, CPO, CFO, CMO, CISO");
  console.error("\n  Level 3 - Delivery & Tech:");
  console.error("   ARCHITECT, DEVOPS, PYTHON_FIXER, BACKEND, FRONTEND, FULLSTACK, QA, AUTOMATION, CLOUD");
  console.error("\n  Level 4 - Ops / Support / Data:");
  console.error("   PM, DESIGN, DATA, ANALYTICS, ML, SUPPORT_L1, SUPPORT_L2, CS, SALES, MARKETING, HR");
  console.error("");
  process.exit(1);
}

(async () => {
  console.log("\n Starting Bot Execution...\n");

  const BotClass = bots[role]();

  const bot = new BotClass({
    environment: process.env.ENV || "dev",
    verbose: true,
    projectRoot: process.cwd(),
  });

  const result = await bot.run();

  console.log("\n DONE!");
  console.log(`Report saved: ${result.file}`);
  console.log(`Duration: ${result.report.stats.finishedAt}`);
  console.log(`Successes: ${result.report.stats.successes}`);
  console.log(`Failures: ${result.report.stats.failures}`);
  console.log("");
})();
