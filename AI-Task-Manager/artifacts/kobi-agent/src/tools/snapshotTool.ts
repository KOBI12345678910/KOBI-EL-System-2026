import * as fs from "fs";
import * as path from "path";
import { runCommand } from "./terminalTool";

const WORKSPACE_DIR = process.env.WORKSPACE_DIR || process.env.WORKSPACE_ROOT || "/home/runner/workspace";
const SNAPSHOT_DIR = path.join(WORKSPACE_DIR, ".snapshots");

if (!fs.existsSync(SNAPSHOT_DIR)) {
  fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
}

export interface Snapshot {
  id: string;
  name: string;
  timestamp: string;
  description: string;
  files: number;
  size: number;
}

export async function createSnapshot(params: { name: string; description?: string }): Promise<{ success: boolean; output: string; snapshot?: Snapshot }> {
  const id = `snap_${Date.now()}`;
  const snapPath = path.join(SNAPSHOT_DIR, id);

  await runCommand({
    command: `mkdir -p "${snapPath}" && tar -czf "${snapPath}/files.tar.gz" --exclude='node_modules' --exclude='.git' --exclude='dist' --exclude='build' --exclude='.snapshots' --exclude='__pycache__' --exclude='.next' -C "${WORKSPACE_DIR}" .`,
    timeout: 30000,
  });

  const statResult = await runCommand({ command: `du -sb "${snapPath}" | cut -f1` });
  const size = parseInt(statResult.stdout.trim()) || 0;

  const countResult = await runCommand({ command: `tar -tzf "${snapPath}/files.tar.gz" | wc -l` });
  const files = parseInt(countResult.stdout.trim()) || 0;

  const snapshot: Snapshot = { id, name: params.name, timestamp: new Date().toISOString(), description: params.description || "", files, size };
  fs.writeFileSync(path.join(snapPath, "meta.json"), JSON.stringify(snapshot, null, 2));

  return { success: true, output: `Snapshot created: ${id} (${files} files, ${(size / 1024).toFixed(1)}KB)`, snapshot };
}

export async function restoreSnapshot(params: { snapshot_id: string }): Promise<{ success: boolean; output: string }> {
  const snapPath = path.join(SNAPSHOT_DIR, params.snapshot_id);
  const tarFile = path.join(snapPath, "files.tar.gz");

  if (!fs.existsSync(tarFile)) return { success: false, output: `Snapshot not found: ${params.snapshot_id}` };

  await createSnapshot({ name: "auto-backup-before-restore", description: `Auto backup before restoring ${params.snapshot_id}` });

  await runCommand({
    command: `find "${WORKSPACE_DIR}" -maxdepth 1 -not -name '.snapshots' -not -name 'node_modules' -not -name '.' -exec rm -rf {} +`,
    timeout: 15000,
  });

  const result = await runCommand({ command: `tar -xzf "${tarFile}" -C "${WORKSPACE_DIR}"`, timeout: 30000 });
  return { success: result.success, output: result.success ? `Restored snapshot: ${params.snapshot_id}` : result.stderr };
}

export async function listSnapshots(): Promise<{ success: boolean; output: string; snapshots?: Snapshot[] }> {
  if (!fs.existsSync(SNAPSHOT_DIR)) return { success: true, output: "No snapshots", snapshots: [] };

  const snapshots: Snapshot[] = [];
  const dirs = fs.readdirSync(SNAPSHOT_DIR, { withFileTypes: true });

  for (const dir of dirs) {
    if (!dir.isDirectory()) continue;
    const metaPath = path.join(SNAPSHOT_DIR, dir.name, "meta.json");
    if (fs.existsSync(metaPath)) {
      try { snapshots.push(JSON.parse(fs.readFileSync(metaPath, "utf-8"))); } catch {}
    }
  }

  snapshots.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  const output = snapshots.map(s => `${s.id}: ${s.name} (${s.files} files, ${new Date(s.timestamp).toLocaleString()})`).join("\n");
  return { success: true, output: output || "No snapshots", snapshots };
}

export async function deleteSnapshot(params: { snapshot_id: string }): Promise<{ success: boolean; output: string }> {
  const snapPath = path.join(SNAPSHOT_DIR, params.snapshot_id);
  if (!fs.existsSync(snapPath)) return { success: false, output: `Snapshot not found: ${params.snapshot_id}` };
  const result = await runCommand({ command: `rm -rf "${snapPath}"` });
  return { success: result.success, output: `Deleted snapshot: ${params.snapshot_id}` };
}

export async function diffSnapshot(params: { snapshot_id: string }): Promise<{ success: boolean; output: string }> {
  const snapPath = path.join(SNAPSHOT_DIR, params.snapshot_id);
  const tmpDir = path.join(SNAPSHOT_DIR, "_tmp_diff");

  if (!fs.existsSync(path.join(snapPath, "files.tar.gz"))) return { success: false, output: `Snapshot not found: ${params.snapshot_id}` };

  await runCommand({ command: `rm -rf "${tmpDir}" && mkdir -p "${tmpDir}"` });
  await runCommand({ command: `tar -xzf "${snapPath}/files.tar.gz" -C "${tmpDir}"` });

  const result = await runCommand({
    command: `diff -rq "${tmpDir}" "${WORKSPACE_DIR}" --exclude=node_modules --exclude=.git --exclude=.snapshots --exclude=dist --exclude=.next`,
    timeout: 15000,
  });

  await runCommand({ command: `rm -rf "${tmpDir}"` });
  return { success: true, output: result.stdout || "No differences found" };
}

export async function cleanOldSnapshots(params: { keep?: number } = {}): Promise<{ success: boolean; output: string }> {
  const keepCount = params.keep || 10;
  const result = await listSnapshots();
  const snapshots = result.snapshots || [];
  let removed = 0;

  if (snapshots.length > keepCount) {
    const toRemove = snapshots.slice(keepCount);
    for (const snap of toRemove) {
      await deleteSnapshot({ snapshot_id: snap.id });
      removed++;
    }
  }

  return { success: true, output: `Cleaned ${removed} old snapshots, kept ${keepCount}` };
}

export const SNAPSHOT_TOOLS = [
  { name: "create_snapshot", description: "Create a snapshot (backup) of the current workspace", input_schema: { type: "object" as const, properties: { name: { type: "string" }, description: { type: "string" } }, required: ["name"] as string[] } },
  { name: "restore_snapshot", description: "Restore workspace from a snapshot (creates auto-backup first)", input_schema: { type: "object" as const, properties: { snapshot_id: { type: "string" } }, required: ["snapshot_id"] as string[] } },
  { name: "list_snapshots", description: "List all workspace snapshots", input_schema: { type: "object" as const, properties: {}, required: [] as string[] } },
  { name: "delete_snapshot", description: "Delete a snapshot", input_schema: { type: "object" as const, properties: { snapshot_id: { type: "string" } }, required: ["snapshot_id"] as string[] } },
  { name: "diff_snapshot", description: "Compare current workspace with a snapshot", input_schema: { type: "object" as const, properties: { snapshot_id: { type: "string" } }, required: ["snapshot_id"] as string[] } },
  { name: "clean_old_snapshots", description: "Remove old snapshots, keep the most recent N (default 10)", input_schema: { type: "object" as const, properties: { keep: { type: "number" } }, required: [] as string[] } },
];