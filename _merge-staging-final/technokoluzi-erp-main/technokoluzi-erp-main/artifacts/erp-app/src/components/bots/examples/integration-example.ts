/**
 * examples/integration-example.ts
 * =========================================================
 * Example: Using IntegrationBot for inter-bot communication
 * =========================================================
 */

import { IntegrationBot } from "../core";

async function example() {
  console.log("Integration Bot Example\n");

  // 1. Create integration bot (middleware)
  const integration = new IntegrationBot({
    environment: "dev",
    verbose: true,
    projectRoot: process.cwd(),
  });

  // 2. Register bots
  console.log("Registering bots...");
  // In production, import actual bot classes:
  // import DevOpsBot from "../roles/DEVOPS.bot";
  // import PythonFixerBot from "../roles/PYTHON_FIXER.bot";
  // integration.registerBots({ DEVOPS: DevOpsBot, PYTHON_FIXER: PythonFixerBot });
  console.log("");

  // 3. Store API keys securely
  console.log("Storing API keys...");
  integration.setApiKey("PYTHON_FIXER", process.env.OPENAI_API_KEY || "demo-key", "openai");
  console.log("");

  // 4. View interaction log
  console.log("Interaction Log:");
  const logs = integration.getInteractions();
  for (const log of logs) {
    console.log(
      `  [${log.status.toUpperCase()}] ${log.sourceBotName} -> ${log.targetBotName}.${log.methodName}() (${log.duration}ms)`,
    );
  }
  console.log("");

  // 5. Export logs
  console.log("Exporting interaction log...");
  const exported = integration.exportInteractionLog();
  console.log(`  Total interactions: ${exported.totalInteractions}`);
  console.log(`  Stats:`, exported.stats);
}

// Run
example().catch(console.error);
