import { writeFile } from "./fileTool";
import { runCommand } from "./terminalTool";

interface QueueJob {
  id: string;
  queue: string;
  data: any;
  status: "waiting" | "active" | "completed" | "failed" | "delayed";
  createdAt: string;
  processedAt?: string;
  completedAt?: string;
  result?: any;
  error?: string;
  attempts: number;
  maxAttempts: number;
  delay?: number;
  priority: number;
}

const queues = new Map<string, QueueJob[]>();
const processors = new Map<string, (job: QueueJob) => Promise<any>>();
let jobCounter = 0;

export async function createQueue(params: { name: string }): Promise<{ success: boolean; output: string }> {
  if (queues.has(params.name)) return { success: true, output: `Queue "${params.name}" already exists` };
  queues.set(params.name, []);
  return { success: true, output: `Created queue "${params.name}"` };
}

export async function addJob(params: { queue: string; data: any; priority?: number; delay?: number; maxAttempts?: number }): Promise<{ success: boolean; output: string }> {
  if (!queues.has(params.queue)) queues.set(params.queue, []);
  const id = `job_${++jobCounter}`;
  const job: QueueJob = {
    id, queue: params.queue, data: params.data, status: params.delay ? "delayed" : "waiting",
    createdAt: new Date().toISOString(), attempts: 0, maxAttempts: params.maxAttempts || 3,
    delay: params.delay, priority: params.priority || 0,
  };
  queues.get(params.queue)!.push(job);
  if (params.delay) setTimeout(() => { job.status = "waiting"; processNext(params.queue); }, params.delay);
  else processNext(params.queue);
  return { success: true, output: `Added job ${id} to queue "${params.queue}"` };
}

async function processNext(queueName: string) {
  const processor = processors.get(queueName);
  if (!processor) return;
  const jobs = queues.get(queueName) || [];
  const waiting = jobs.filter(j => j.status === "waiting").sort((a, b) => b.priority - a.priority);
  if (!waiting.length) return;

  const job = waiting[0];
  job.status = "active";
  job.processedAt = new Date().toISOString();
  job.attempts++;

  try {
    job.result = await processor(job);
    job.status = "completed";
    job.completedAt = new Date().toISOString();
  } catch (e: any) {
    job.error = e.message;
    if (job.attempts < job.maxAttempts) { job.status = "waiting"; setTimeout(() => processNext(queueName), 1000 * job.attempts); }
    else job.status = "failed";
  }
}

export async function getQueueStatus(params: { queue?: string }): Promise<{ success: boolean; output: string }> {
  if (params.queue) {
    const jobs = queues.get(params.queue) || [];
    const byStatus: Record<string, number> = {};
    for (const j of jobs) byStatus[j.status] = (byStatus[j.status] || 0) + 1;
    return { success: true, output: `Queue "${params.queue}": ${jobs.length} jobs\n${Object.entries(byStatus).map(([k, v]) => `  ${k}: ${v}`).join("\n")}` };
  }
  const lines: string[] = [];
  for (const [name, jobs] of queues) {
    lines.push(`${name}: ${jobs.length} jobs (${jobs.filter(j => j.status === "waiting").length} waiting, ${jobs.filter(j => j.status === "active").length} active)`);
  }
  return { success: true, output: lines.join("\n") || "No queues" };
}

export async function getJobInfo(params: { jobId: string }): Promise<{ success: boolean; output: string }> {
  for (const [, jobs] of queues) {
    const job = jobs.find(j => j.id === params.jobId);
    if (job) return { success: true, output: JSON.stringify(job, null, 2) };
  }
  return { success: false, output: `Job ${params.jobId} not found` };
}

export async function retryJob(params: { jobId: string }): Promise<{ success: boolean; output: string }> {
  for (const [, jobs] of queues) {
    const job = jobs.find(j => j.id === params.jobId);
    if (job && job.status === "failed") { job.status = "waiting"; job.attempts = 0; processNext(job.queue); return { success: true, output: `Retrying job ${params.jobId}` }; }
  }
  return { success: false, output: `Job ${params.jobId} not found or not failed` };
}

export async function clearQueue(params: { queue: string; status?: string }): Promise<{ success: boolean; output: string }> {
  const jobs = queues.get(params.queue);
  if (!jobs) return { success: false, output: `Queue "${params.queue}" not found` };
  if (params.status) {
    const before = jobs.length;
    const filtered = jobs.filter(j => j.status !== params.status);
    queues.set(params.queue, filtered);
    return { success: true, output: `Cleared ${before - filtered.length} ${params.status} jobs from "${params.queue}"` };
  }
  queues.set(params.queue, []);
  return { success: true, output: `Cleared all jobs from "${params.queue}"` };
}

export async function generateBullMQSetup(): Promise<{ success: boolean; output: string }> {
  await runCommand({ command: "npm install bullmq ioredis @bull-board/api @bull-board/express", timeout: 60000 });

  await writeFile({ path: "src/queue/connection.ts", content: `import IORedis from 'ioredis';

export const redisConnection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

export const defaultJobOptions = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 1000 },
  removeOnComplete: { count: 1000 },
  removeOnFail: { count: 5000 },
};
` });

  await writeFile({ path: "src/queue/queues.ts", content: `import { Queue } from 'bullmq';
import { redisConnection, defaultJobOptions } from './connection';

export const emailQueue = new Queue('email', {
  connection: redisConnection,
  defaultJobOptions,
});

export const notificationQueue = new Queue('notification', {
  connection: redisConnection,
  defaultJobOptions,
});

export const processingQueue = new Queue('processing', {
  connection: redisConnection,
  defaultJobOptions,
});

export async function enqueue<T>(queueName: string, jobName: string, data: T, options?: any) {
  const queues: Record<string, Queue> = {
    email: emailQueue,
    notification: notificationQueue,
    processing: processingQueue,
  };
  const queue = queues[queueName];
  if (!queue) throw new Error('Unknown queue: ' + queueName);
  return queue.add(jobName, data, options);
}
` });

  await writeFile({ path: "src/queue/workers.ts", content: `import { Worker, Job } from 'bullmq';
import { redisConnection } from './connection';

const emailWorker = new Worker('email', async (job: Job) => {
  console.log('Processing email job:', job.name, job.data);
  switch (job.name) {
    case 'send':
      break;
    case 'bulk':
      break;
  }
}, { connection: redisConnection, concurrency: 5 });

const notificationWorker = new Worker('notification', async (job: Job) => {
  console.log('Processing notification:', job.name, job.data);
}, { connection: redisConnection, concurrency: 10 });

const processingWorker = new Worker('processing', async (job: Job) => {
  console.log('Processing job:', job.name, job.data);
  for (let i = 0; i <= 100; i += 10) {
    await job.updateProgress(i);
    await new Promise(r => setTimeout(r, 100));
  }
}, { connection: redisConnection, concurrency: 3 });

for (const worker of [emailWorker, notificationWorker, processingWorker]) {
  worker.on('completed', (job) => console.log(\`Job \${job.id} completed\`));
  worker.on('failed', (job, err) => console.error(\`Job \${job?.id} failed:\`, err.message));
  worker.on('error', (err) => console.error('Worker error:', err));
}

export { emailWorker, notificationWorker, processingWorker };
` });

  await writeFile({ path: "src/queue/dashboard.ts", content: `import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { emailQueue, notificationQueue, processingQueue } from './queues';
import { Express } from 'express';

export function setupQueueDashboard(app: Express) {
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath('/admin/queues');

  createBullBoard({
    queues: [
      new BullMQAdapter(emailQueue),
      new BullMQAdapter(notificationQueue),
      new BullMQAdapter(processingQueue),
    ],
    serverAdapter,
  });

  app.use('/admin/queues', serverAdapter.getRouter());
  console.log('Queue dashboard: /admin/queues');
}
` });

  return { success: true, output: `BullMQ full setup generated:\n  → src/queue/connection.ts (Redis connection + defaults)\n  → src/queue/queues.ts (email, notification, processing queues + enqueue helper)\n  → src/queue/workers.ts (3 workers with concurrency & error handling)\n  → src/queue/dashboard.ts (Bull Board UI at /admin/queues)\n  Packages: bullmq, ioredis, @bull-board/api, @bull-board/express` };
}

export async function addScheduledJob(params: { name: string; cron: string }): Promise<{ success: boolean; output: string }> {
  const capitalized = params.name.charAt(0).toUpperCase() + params.name.slice(1);
  const code = `import { Queue } from 'bullmq';
import { redisConnection } from './connection';

const scheduledQueue = new Queue('scheduled', { connection: redisConnection });

export async function schedule${capitalized}() {
  await scheduledQueue.add('${params.name}', {}, {
    repeat: { pattern: '${params.cron}' },
  });
  console.log('Scheduled: ${params.name} (${params.cron})');
}
`;
  await writeFile({ path: `src/queue/scheduled/${params.name}.ts`, content: code });
  return { success: true, output: `Scheduled job created → src/queue/scheduled/${params.name}.ts\nCron: ${params.cron}\nCall schedule${capitalized}() to activate` };
}

export const QUEUE_SYSTEM_TOOLS = [
  { name: "create_queue", description: "Create a named job queue", input_schema: { type: "object" as const, properties: { name: { type: "string" } }, required: ["name"] as string[] } },
  { name: "add_job", description: "Add a job to a queue with priority, delay, and retry settings", input_schema: { type: "object" as const, properties: { queue: { type: "string" }, data: { type: "object" }, priority: { type: "number" }, delay: { type: "number", description: "Delay in ms" }, maxAttempts: { type: "number" } }, required: ["queue", "data"] as string[] } },
  { name: "get_queue_status", description: "Get status of a queue or all queues", input_schema: { type: "object" as const, properties: { queue: { type: "string" } }, required: [] as string[] } },
  { name: "get_job_info", description: "Get detailed info about a specific job", input_schema: { type: "object" as const, properties: { jobId: { type: "string" } }, required: ["jobId"] as string[] } },
  { name: "retry_job", description: "Retry a failed job", input_schema: { type: "object" as const, properties: { jobId: { type: "string" } }, required: ["jobId"] as string[] } },
  { name: "clear_job_queue", description: "Clear jobs from a queue (all or by status)", input_schema: { type: "object" as const, properties: { queue: { type: "string" }, status: { type: "string", enum: ["completed", "failed", "waiting", "delayed"] } }, required: ["queue"] as string[] } },
  { name: "generate_bullmq_setup", description: "Generate full BullMQ infrastructure: connection, queues, workers, dashboard (4 files)", input_schema: { type: "object" as const, properties: {}, required: [] as string[] } },
  { name: "add_scheduled_job", description: "Create a scheduled/cron job with BullMQ repeat pattern", input_schema: { type: "object" as const, properties: { name: { type: "string", description: "Job name" }, cron: { type: "string", description: "Cron pattern e.g. '0 * * * *'" } }, required: ["name", "cron"] as string[] } },
];