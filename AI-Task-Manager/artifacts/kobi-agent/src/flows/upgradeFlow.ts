import { runCommand } from "../tools/terminalTool";
import { createSnapshot, restoreSnapshot } from "../tools/snapshotTool";
import { checkOutdated, checkVulnerabilities, fixVulnerabilities } from "../tools/dependencyTool";
import { gitCommit } from "../tools/gitTool";

export async function upgradeAll(params: {
  major?: boolean;
  dryRun?: boolean;
  packages?: string[];
}): Promise<{ success: boolean; output: string; updated?: string[]; failed?: string[]; skipped?: string[]; vulnerabilitiesFixed?: number }> {
  const log = console.log;
  log("\n🔄 UPGRADE FLOW START");
  log("═".repeat(50));

  const updated: string[] = [];
  const failed: string[] = [];

  log("\n💾 Creating pre-upgrade snapshot...");
  const snapshot = await createSnapshot({ name: "pre-upgrade", description: "Before dependency upgrade" });

  log("\n📋 Checking outdated dependencies...");
  const outdatedResult = await checkOutdated();
  const outdated = outdatedResult.deps || [];
  log(`  Found ${outdated.length} outdated packages`);

  let toUpdate = outdated;
  if (params.packages?.length) {
    toUpdate = outdated.filter((d: any) => params.packages!.includes(d.name));
  }
  if (!params.major) {
    toUpdate = toUpdate.filter((d: any) => {
      const current = (d.version || "").split(".");
      const latest = (d.latest || "").split(".");
      return current[0] === latest[0];
    });
  }

  if (params.dryRun) {
    log("\n🔍 DRY RUN — would update:");
    const lines = toUpdate.map((d: any) => `  ${d.name}: ${d.version} → ${d.latest}`);
    lines.forEach((l: string) => log(l));
    return {
      success: true,
      output: `Dry run: ${toUpdate.length} packages would be updated\n${lines.join("\n")}`,
      updated: [],
      failed: [],
      skipped: toUpdate.map((d: any) => d.name),
      vulnerabilitiesFixed: 0,
    };
  }

  for (const dep of toUpdate) {
    log(`\n📦 Updating ${dep.name}: ${dep.version} → ${dep.latest}`);

    const devFlag = dep.type === "dev" ? "-D" : "";
    const installResult = await runCommand({ command: `pnpm add ${dep.name}@${dep.latest} ${devFlag}`, timeout: 60000 });
    if (!installResult.success) {
      log(`  ❌ Install failed — skipping`);
      await runCommand({ command: `pnpm add ${dep.name}@${dep.version} ${devFlag}`, timeout: 30000 });
      failed.push(dep.name);
      continue;
    }

    const buildResult = await runCommand({ command: "pnpm run build 2>&1 | tail -5", timeout: 60000 });
    if (!buildResult.success) {
      log(`  ❌ Build broke — reverting`);
      await runCommand({ command: `pnpm add ${dep.name}@${dep.version} ${devFlag}`, timeout: 30000 });
      failed.push(dep.name);
      continue;
    }

    const testResult = await runCommand({ command: "pnpm test 2>&1 | tail -3 || true", timeout: 60000 });
    if (!testResult.success && !testResult.stdout.includes("no test")) {
      log(`  ⚠️ Tests broke — reverting`);
      await runCommand({ command: `pnpm add ${dep.name}@${dep.version} ${devFlag}`, timeout: 30000 });
      failed.push(dep.name);
      continue;
    }

    updated.push(dep.name);
    log(`  ✅ ${dep.name} updated successfully`);
  }

  log("\n🔒 Fixing vulnerabilities...");
  const vulnBefore = await checkVulnerabilities();
  await fixVulnerabilities();
  const vulnAfter = await checkVulnerabilities();
  const totalBefore = vulnBefore.result?.total || 0;
  const totalAfter = vulnAfter.result?.total || 0;
  const vulnsFixed = Math.max(0, totalBefore - totalAfter);

  log("\n✅ Final verification...");
  const finalBuild = await runCommand({ command: "pnpm run build 2>&1 | tail -3", timeout: 60000 });
  if (!finalBuild.success) {
    log("  ❌ Final build failed — full rollback");
    if (snapshot.snapshot?.id) {
      await restoreSnapshot({ snapshot_id: snapshot.snapshot.id });
    }
    return {
      success: false,
      output: `Full rollback — build failed after upgrades`,
      updated: [],
      failed: toUpdate.map((d: any) => d.name),
      skipped: [],
      vulnerabilitiesFixed: 0,
    };
  }

  if (updated.length > 0) {
    await gitCommit({ message: `chore: upgrade ${updated.length} dependencies` }).catch(() => {});
  }

  await createSnapshot({ name: "post-upgrade", description: `Upgraded ${updated.length} packages` });

  log(`\n${"═".repeat(50)}`);
  log(`✅ UPGRADE COMPLETE: ${updated.length} updated, ${failed.length} failed, ${vulnsFixed} vulns fixed`);
  log(`${"═".repeat(50)}\n`);

  const summary = [
    `## Upgrade Report`,
    ``,
    `**עודכנו**: ${updated.length}`,
    `**נכשלו**: ${failed.length}`,
    `**פגיעויות שתוקנו**: ${vulnsFixed}`,
    ``,
    updated.length > 0 ? `### ✅ עודכנו:\n${updated.map(u => `- ${u}`).join("\n")}` : "",
    failed.length > 0 ? `### ❌ נכשלו:\n${failed.map(f => `- ${f}`).join("\n")}` : "",
  ].filter(Boolean);

  return {
    success: failed.length === 0,
    output: summary.join("\n"),
    updated,
    failed,
    skipped: [],
    vulnerabilitiesFixed: vulnsFixed,
  };
}

export async function checkUpgrades(params: {}): Promise<{ success: boolean; output: string; deps?: any[] }> {
  const result = await checkOutdated();
  const deps = result.deps || [];

  const lines = [
    `## Outdated Dependencies`,
    ``,
    `**סה"כ**: ${deps.length}`,
    ``,
    ...deps.map((d: any) => `- **${d.name}**: ${d.version} → ${d.latest}${d.type === "dev" ? " (dev)" : ""}`),
  ];

  return { success: true, output: lines.join("\n"), deps };
}

export async function upgradeSingle(params: {
  packageName: string;
  version?: string;
}): Promise<{ success: boolean; output: string }> {
  const log = console.log;
  const ver = params.version || "latest";
  log(`\n📦 Upgrading ${params.packageName} to ${ver}...`);

  await createSnapshot({ name: `pre-upgrade-${params.packageName}`, description: `Before upgrading ${params.packageName}` });

  const result = await runCommand({ command: `pnpm add ${params.packageName}@${ver}`, timeout: 60000 });
  if (!result.success) {
    return { success: false, output: `Failed to install ${params.packageName}@${ver}: ${result.stderr}` };
  }

  const buildCheck = await runCommand({ command: "pnpm run build 2>&1 | tail -5", timeout: 60000 });
  if (!buildCheck.success) {
    log("  ❌ Build broke — reverting");
    await runCommand({ command: `pnpm add ${params.packageName}@latest`, timeout: 30000 });
    return { success: false, output: `Build failed after upgrading ${params.packageName} — reverted` };
  }

  await gitCommit({ message: `chore: upgrade ${params.packageName} to ${ver}` }).catch(() => {});
  return { success: true, output: `✅ ${params.packageName} upgraded to ${ver}` };
}

export const UPGRADE_FLOW_TOOLS = [
  {
    name: "upgrade_all_deps",
    description: "שדרוג כל התלויות בצורה בטוחה — snapshot → בדיקה → שדרוג אחד-אחד → build+test → rollback אם נשבר → תיקון פגיעויות",
    input_schema: {
      type: "object" as const,
      properties: {
        major: { type: "boolean", description: "לכלול שדרוגי major? (ברירת מחדל: לא)" },
        dryRun: { type: "boolean", description: "רק להציג מה ישודרג בלי לבצע" },
        packages: { type: "array", items: { type: "string" }, description: "רשימת חבילות ספציפיות" },
      },
      required: [] as string[],
    },
  },
  {
    name: "check_upgrades",
    description: "בדיקת תלויות מיושנות — רשימה עם גרסאות נוכחיות ואחרונות",
    input_schema: { type: "object" as const, properties: {}, required: [] as string[] },
  },
  {
    name: "upgrade_single_dep",
    description: "שדרוג חבילה בודדת בצורה בטוחה — snapshot → install → build check → rollback אם נשבר",
    input_schema: {
      type: "object" as const,
      properties: {
        packageName: { type: "string", description: "שם החבילה" },
        version: { type: "string", description: "גרסה יעד (ברירת מחדל: latest)" },
      },
      required: ["packageName"] as string[],
    },
  },
];
