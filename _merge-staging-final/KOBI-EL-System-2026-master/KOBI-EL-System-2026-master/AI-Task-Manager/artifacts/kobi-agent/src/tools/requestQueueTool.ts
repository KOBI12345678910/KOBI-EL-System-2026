import { v4 as uuidv4 } from "uuid";

export interface QueuedRequest {
  id: string;
  message: string;
  priority: "low" | "normal" | "high" | "critical";
  status: "queued" | "processing" | "completed" | "failed" | "cancelled";
  context?: Record<string, any>;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  result?: any;
  error?: string;
}

const queue: QueuedRequest[] = [];
let currentRequest: QueuedRequest | null = null;
let processing = false;
let totalProcessed = 0;
let totalFailed = 0;

let executeHandler: ((message: string, context?: Record<string, any>) => Promise<any>) | null = null;
let notifyHandler: ((req: QueuedRequest) => void) | null = null;

export function initRequestQueue(
  handler: (message: string, context?: Record<string, any>) => Promise<any>,
  notify?: (req: QueuedRequest) => void
): void {
  executeHandler = handler;
  notifyHandler = notify || (() => {});
}

export async function enqueueRequest(params: {
  message: string;
  priority?: string;
  context?: Record<string, any>;
}): Promise<{ success: boolean; output: string; request?: QueuedRequest }> {
  const request: QueuedRequest = {
    id: uuidv4(),
    message: params.message,
    priority: (params.priority as QueuedRequest["priority"]) || "normal",
    status: "queued",
    context: params.context,
    createdAt: new Date(),
  };

  const priorityOrder = { critical: 0, high: 1, normal: 2, low: 3 };
  const insertIdx = queue.findIndex(
    (q) => priorityOrder[q.priority] > priorityOrder[request.priority]
  );
  if (insertIdx === -1) queue.push(request);
  else queue.splice(insertIdx, 0, request);

  if (notifyHandler) notifyHandler(request);
  processQueue();

  return {
    success: true,
    output: `📋 בקשה ${request.id.slice(0, 8)} נוספה לתור (${request.priority}) | מיקום: ${queue.indexOf(request) + 1}/${queue.length}`,
    request,
  };
}

async function processQueue(): Promise<void> {
  if (processing || queue.length === 0 || !executeHandler) return;

  processing = true;
  const request = queue.shift()!;
  currentRequest = request;
  request.status = "processing";
  request.startedAt = new Date();

  if (notifyHandler) notifyHandler(request);

  try {
    request.result = await executeHandler(request.message, request.context);
    request.status = "completed";
    totalProcessed++;
  } catch (err: any) {
    request.status = "failed";
    request.error = err.message || String(err);
    totalFailed++;
  } finally {
    request.completedAt = new Date();
    currentRequest = null;
    processing = false;
    if (notifyHandler) notifyHandler(request);
    processQueue();
  }
}

export async function getQueueStatus(params: {}): Promise<{ success: boolean; output: string }> {
  const lines = [
    `📋 תור בקשות:`,
    `  בתור: ${queue.length}`,
    `  מעבד: ${currentRequest ? currentRequest.message.slice(0, 60) : "—"}`,
    `  הושלמו: ${totalProcessed}`,
    `  נכשלו: ${totalFailed}`,
  ];
  if (queue.length > 0) {
    lines.push(`  הבאים:`);
    queue.slice(0, 5).forEach((q, i) => {
      lines.push(`    ${i + 1}. [${q.priority}] ${q.message.slice(0, 50)}`);
    });
  }
  return { success: true, output: lines.join("\n") };
}

export async function cancelQueuedRequest(params: { id: string }): Promise<{ success: boolean; output: string }> {
  const idx = queue.findIndex((q) => q.id === params.id);
  if (idx === -1) return { success: false, output: `❌ בקשה ${params.id} לא נמצאה בתור` };
  const removed = queue.splice(idx, 1)[0];
  removed.status = "cancelled";
  return { success: true, output: `✅ בקשה ${params.id.slice(0, 8)} בוטלה` };
}

export function getQueue(): QueuedRequest[] { return queue; }
export function getCurrent(): QueuedRequest | null { return currentRequest; }
export function getQueueStats() {
  return { queued: queue.length, processing: !!currentRequest, totalProcessed, totalFailed };
}

export const REQUEST_QUEUE_TOOLS_EXT = [
  {
    name: "enqueue_request",
    description: "הוספת בקשה לתור — עם עדיפות (low/normal/high/critical)",
    input_schema: {
      type: "object" as const,
      properties: {
        message: { type: "string" as const, description: "הבקשה" },
        priority: { type: "string" as const, enum: ["low", "normal", "high", "critical"], description: "עדיפות" },
        context: { type: "object" as const, description: "הקשר נוסף" },
      },
      required: ["message"] as string[],
    },
  },
  {
    name: "get_queue_status",
    description: "סטטוס תור הבקשות — כמה בתור, מה מעובד, סטטיסטיקות",
    input_schema: { type: "object" as const, properties: {}, required: [] as string[] },
  },
  {
    name: "cancel_queued_request",
    description: "ביטול בקשה מהתור לפי ID",
    input_schema: {
      type: "object" as const,
      properties: { id: { type: "string" as const, description: "ID הבקשה" } },
      required: ["id"] as string[],
    },
  },
];
