import { createSnapshot, restoreSnapshot, listSnapshots, deleteSnapshot, diffSnapshot } from "./snapshotTool";
import type { Snapshot } from "./snapshotTool";

let autoTimer: ReturnType<typeof setInterval> | undefined;
const checkpoints: Snapshot[] = [];
const MAX_CHECKPOINTS = 50;

export async function createCheckpoint(params: {
  trigger: string;
  description?: string;
}): Promise<{ success: boolean; output: string; snapshot?: Snapshot }> {
  const trigger = params.trigger || "manual";
  const name = `${trigger}-${new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-")}`;
  const result = await createSnapshot({ name, description: params.description || `${trigger} checkpoint` });

  if (result.success && result.snapshot) {
    checkpoints.push(result.snapshot);
    if (checkpoints.length > MAX_CHECKPOINTS) {
      const toRemove = checkpoints.splice(0, checkpoints.length - MAX_CHECKPOINTS);
      for (const old of toRemove) {
        await deleteSnapshot({ snapshot_id: old.id });
      }
    }
  }

  return result;
}

export async function startAutoCheckpoints(params: {
  intervalMinutes?: number;
}): Promise<{ success: boolean; output: string }> {
  stopAutoCheckpointsInternal();
  const interval = params.intervalMinutes || 5;

  autoTimer = setInterval(async () => {
    await createCheckpoint({ trigger: "auto" });
  }, interval * 60 * 1000);

  return { success: true, output: `צ'קפוינטים אוטומטיים כל ${interval} דקות ⏱️` };
}

function stopAutoCheckpointsInternal() {
  if (autoTimer) { clearInterval(autoTimer); autoTimer = undefined; }
}

export async function stopAutoCheckpoints(params: {}): Promise<{ success: boolean; output: string }> {
  stopAutoCheckpointsInternal();
  return { success: true, output: "צ'קפוינטים אוטומטיים הופסקו ⏹️" };
}

export async function getTimeline(params: {}): Promise<{ success: boolean; output: string }> {
  const result = await listSnapshots();
  if (!result.success || !result.snapshots?.length) return { success: true, output: "אין צ'קפוינטים בהיסטוריה" };

  const lines = result.snapshots.map((s, i) => {
    const time = new Date(s.timestamp).toLocaleString("he-IL");
    const current = i === 0 ? " ← נוכחי" : "";
    return `${s.id} | ${s.name} | ${time} | ${s.description}${current}`;
  });

  return { success: true, output: `ציר זמן (${result.snapshots.length} צ'קפוינטים):\n${lines.join("\n")}` };
}

export async function timeTravelTo(params: {
  checkpointId: string;
}): Promise<{ success: boolean; output: string }> {
  await createCheckpoint({ trigger: "pre-travel", description: "לפני מסע בזמן" });
  console.log(`⏪ מסע בזמן ל-${params.checkpointId}...`);
  return restoreSnapshot({ snapshot_id: params.checkpointId });
}

export async function compareToCheckpoint(params: {
  checkpointId: string;
}): Promise<{ success: boolean; output: string }> {
  return diffSnapshot({ snapshot_id: params.checkpointId });
}

export async function getCheckpointPreview(params: {
  checkpointId: string;
}): Promise<{ success: boolean; output: string }> {
  const diff = await diffSnapshot({ snapshot_id: params.checkpointId });
  if (!diff.success) return diff;

  const changedFiles = diff.output.split("\n").filter(l => l.startsWith("Only") || l.startsWith("Files") || l.startsWith("diff"));
  return {
    success: true,
    output: `תצוגה מקדימה של ${params.checkpointId}:\nקבצים שהשתנו (${changedFiles.length}):\n${changedFiles.join("\n")}\n\nDiff מלא:\n${diff.output}`,
  };
}

export const CHECKPOINT_TOOLS = [
  {
    name: "create_checkpoint",
    description: "יצירת צ'קפוינט — שמירת מצב הפרויקט (auto/manual/pre-task/post-task/pre-fix)",
    input_schema: {
      type: "object" as const,
      properties: {
        trigger: { type: "string", description: "auto, manual, pre-task, post-task, pre-fix" },
        description: { type: "string", description: "תיאור הצ'קפוינט" },
      },
      required: ["trigger"] as string[],
    },
  },
  {
    name: "start_auto_checkpoints",
    description: "הפעלת צ'קפוינטים אוטומטיים כל X דקות",
    input_schema: {
      type: "object" as const,
      properties: {
        intervalMinutes: { type: "number", description: "מרווח בדקות (ברירת מחדל: 5)" },
      },
      required: [] as string[],
    },
  },
  {
    name: "stop_auto_checkpoints",
    description: "הפסקת צ'קפוינטים אוטומטיים",
    input_schema: { type: "object" as const, properties: {}, required: [] as string[] },
  },
  {
    name: "get_checkpoint_timeline",
    description: "הצגת ציר זמן — כל הצ'קפוינטים בהיסטוריה",
    input_schema: { type: "object" as const, properties: {}, required: [] as string[] },
  },
  {
    name: "time_travel_to",
    description: "מסע בזמן — חזרה לצ'קפוינט קודם (יוצר צ'קפוינט בטיחות לפני)",
    input_schema: {
      type: "object" as const,
      properties: {
        checkpointId: { type: "string", description: "מזהה הצ'קפוינט" },
      },
      required: ["checkpointId"] as string[],
    },
  },
  {
    name: "compare_to_checkpoint",
    description: "השוואת מצב נוכחי לצ'קפוינט — diff",
    input_schema: {
      type: "object" as const,
      properties: {
        checkpointId: { type: "string", description: "מזהה הצ'קפוינט להשוואה" },
      },
      required: ["checkpointId"] as string[],
    },
  },
  {
    name: "preview_checkpoint",
    description: "תצוגה מקדימה של צ'קפוינט — קבצים שהשתנו + diff",
    input_schema: {
      type: "object" as const,
      properties: {
        checkpointId: { type: "string", description: "מזהה הצ'קפוינט" },
      },
      required: ["checkpointId"] as string[],
    },
  },
];
