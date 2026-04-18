import { v4 as uuidv4 } from "uuid";
import { callLLM } from "../llm/client";
import { extractJSON, extractTextContent } from "../llm/parser";
import { AgentMemory } from "./memory";

export interface SpecialistAgent {
  id: string;
  role: string;
  expertise: string[];
  systemPrompt: string;
  status: "idle" | "working" | "done" | "error";
  currentTask?: string;
  result?: string;
}

export interface AgentMessage {
  from: string;
  to: string;
  type: "task" | "result" | "question" | "review" | "approve" | "reject";
  content: string;
  timestamp: string;
}

const agents: Map<string, SpecialistAgent> = new Map();
const messageLog: AgentMessage[] = [];

function initializeAgents() {
  if (agents.size > 0) return;

  const specs: Omit<SpecialistAgent, "id" | "status">[] = [
    {
      role: "architect",
      expertise: ["system design", "architecture", "patterns", "scalability", "databases"],
      systemPrompt: `You are a senior software architect. You design systems with:
- Clean architecture (layers, boundaries, dependency inversion)
- Scalability patterns (CQRS, event sourcing, microservices vs monolith)
- Database design (normalization, indexing, caching strategies)
- API design (REST, GraphQL, WebSocket, gRPC)
- Security architecture (auth, encryption, OWASP)
You provide architectural decisions as structured JSON with rationale.`,
    },
    {
      role: "frontend",
      expertise: ["react", "css", "ui/ux", "accessibility", "animations", "responsive"],
      systemPrompt: `You are a senior frontend engineer specializing in:
- React/Next.js with TypeScript (hooks, context, server components)
- CSS/Tailwind (responsive, animations, dark mode)
- Component architecture (atomic design, composition patterns)
- Performance (lazy loading, code splitting, memoization, virtual lists)
- Accessibility (ARIA, keyboard nav, screen readers, WCAG 2.1 AA)
- State management (zustand, jotai, react-query, server state)
You write pixel-perfect, performant, accessible UI code.`,
    },
    {
      role: "backend",
      expertise: ["api", "database", "auth", "performance", "security", "caching"],
      systemPrompt: `You are a senior backend engineer specializing in:
- Node.js/Express/Fastify with TypeScript
- Database design (PostgreSQL, Redis, migrations, queries)
- Authentication (JWT, OAuth2, sessions, RBAC, multi-tenancy)
- API design (validation, error handling, pagination, rate limiting)
- Performance (caching, connection pooling, query optimization, indexing)
- Security (input sanitization, CORS, CSRF, SQL injection prevention)
- Background jobs, queues, WebSockets, SSE
You write robust, secure, production-ready backend code.`,
    },
    {
      role: "devops",
      expertise: ["docker", "ci/cd", "monitoring", "deployment", "infrastructure"],
      systemPrompt: `You are a senior DevOps engineer specializing in:
- Docker (multi-stage builds, compose, optimization)
- CI/CD (GitHub Actions, GitLab CI, automated testing)
- Cloud deployment (AWS, GCP, Vercel, Railway, Fly.io)
- Monitoring (health checks, logging, alerting, metrics)
- Infrastructure as code, SSL, domains, DNS
- Performance tuning, load balancing, auto-scaling
You create production-ready deployment configurations.`,
    },
    {
      role: "qa",
      expertise: ["testing", "quality", "security", "performance", "code review"],
      systemPrompt: `You are a senior QA engineer and code reviewer specializing in:
- Test strategies (unit, integration, e2e, contract, load)
- Test frameworks (Vitest, Jest, Playwright, Cypress)
- Security testing (OWASP, penetration, vulnerability scanning)
- Performance testing (load, stress, endurance)
- Code quality (complexity, maintainability, test coverage)
- Bug detection, edge cases, race conditions, error handling
You find bugs that others miss and ensure production quality.`,
    },
    {
      role: "data",
      expertise: ["database", "schema", "migration", "optimization", "etl"],
      systemPrompt: `You are a senior data engineer specializing in:
- Database schema design (PostgreSQL, MySQL, MongoDB, Redis)
- ORM configuration (Prisma, Drizzle, TypeORM, Sequelize)
- Query optimization (indexes, explain plans, denormalization)
- Data migrations (zero-downtime, rollback strategies)
- ETL pipelines, data validation, seeding
- Caching strategies (Redis, in-memory, CDN)
You design efficient, scalable data architectures.`,
    },
  ];

  for (const spec of specs) {
    const id = `agent_${spec.role}`;
    agents.set(id, { ...spec, id, status: "idle" });
  }
}

function topologicalSort(tasks: any[]): any[][] {
  const levels: any[][] = [];
  const completed = new Set<string>();
  let remaining = [...tasks];
  let safety = 0;

  while (remaining.length > 0 && safety < 20) {
    safety++;
    const currentLevel = remaining.filter(t => {
      const deps = t.dependsOn || [];
      return deps.every((d: string) => completed.has(d));
    });
    if (currentLevel.length === 0) { levels.push(remaining); break; }
    levels.push(currentLevel);
    for (const t of currentLevel) completed.add(t.agent);
    remaining = remaining.filter(t => !completed.has(t.agent));
  }
  return levels;
}

async function consultAgent(agentId: string, task: string): Promise<string> {
  const agent = agents.get(agentId);
  if (!agent) throw new Error(`Agent not found: ${agentId}`);

  const response = await callLLM({
    system: agent.systemPrompt,
    messages: [{ role: "user", content: task }],
    maxTokens: 8192,
  });

  const result = extractTextContent(response.content);

  messageLog.push({ from: "orchestrator", to: agentId, type: "task", content: task.slice(0, 200), timestamp: new Date().toISOString() });
  messageLog.push({ from: agentId, to: "orchestrator", type: "result", content: result.slice(0, 200), timestamp: new Date().toISOString() });

  return result;
}

export async function orchestrate(params: { task: string; onLog?: (msg: string) => void }): Promise<{ success: boolean; output: string; plan?: any; results?: Record<string, string> }> {
  initializeAgents();
  const log = params.onLog || console.log;

  log("🧠 Multi-Agent Orchestrator activated");
  log("📐 Architect analyzing task...");

  const memory = new AgentMemory(process.env.WORKSPACE_DIR || "./workspace");
  const projectContext = memory.getProjectContext();

  const architectPlan = await consultAgent("agent_architect", `
Analyze this task and create a multi-agent execution plan.
Task: ${params.task}

Project context:
${projectContext}

Respond with JSON:
{
  "architecture": { "type": "monolith|microservice|serverless|static", "framework": "next|express|fastapi|etc", "database": "postgres|mysql|sqlite|mongodb|none", "auth": "jwt|session|oauth|none", "features": ["list of features"] },
  "agentTasks": [{ "agent": "frontend|backend|devops|qa|data", "task": "specific task description", "dependsOn": [], "priority": 1 }],
  "executionOrder": ["agent_backend", "agent_frontend"],
  "estimatedComplexity": "low|medium|high|extreme"
}`);

  const plan = extractJSON(architectPlan);
  if (!plan) return { success: false, output: "Architect failed to create plan" };

  log(`📋 Plan: ${plan.architecture?.type} with ${plan.agentTasks?.length || 0} tasks`);

  const results: Record<string, string> = {};
  const agentTasks = plan.agentTasks || [];
  const levels = topologicalSort(agentTasks);

  for (const level of levels) {
    log(`⚡ Executing level with ${level.length} parallel tasks`);

    await Promise.all(
      level.map(async (agentTask: any) => {
        const agentId = `agent_${agentTask.agent}`;
        const agent = agents.get(agentId);
        if (!agent) return;

        let context = `Task: ${agentTask.task}\n\nMain objective: ${params.task}\n`;
        for (const dep of agentTask.dependsOn || []) {
          const depResult = results[`agent_${dep}`];
          if (depResult) context += `\nResult from ${dep} agent:\n${depResult.slice(0, 2000)}\n`;
        }

        log(`  🤖 ${agent.role}: ${agentTask.task.slice(0, 80)}...`);
        agent.status = "working";
        agent.currentTask = agentTask.task;

        try {
          const result = await consultAgent(agentId, context);
          agent.status = "done";
          agent.result = result;
          results[agentId] = result;
          log(`  ✅ ${agent.role}: Done`);
        } catch (err: any) {
          agent.status = "error";
          log(`  ❌ ${agent.role}: ${err.message}`);
        }
      })
    );
  }

  log("🔍 QA reviewing all outputs...");
  const allResults = Object.entries(results).map(([id, r]) => `[${id}]:\n${r.slice(0, 1500)}`).join("\n\n---\n\n");

  const qaReview = await consultAgent("agent_qa", `
Review all agent outputs for quality, consistency, and issues:
Original task: ${params.task}
${allResults}
Provide: 1. Issues found 2. Suggestions 3. Quality score (1-10) 4. Whether complete`);

  results["agent_qa"] = qaReview;

  const output = `## Multi-Agent Execution Complete\n\n### Architecture\n${JSON.stringify(plan.architecture, null, 2)}\n\n### Results\n${Object.entries(results).map(([id, r]) => `#### ${id}\n${r.slice(0, 1000)}`).join("\n\n")}\n\n### QA Review\n${qaReview.slice(0, 500)}`;

  log("✅ Multi-agent orchestration complete");
  return { success: true, output, plan, results };
}

export async function agentDiscussion(params: { topic: string; agents: string[] }): Promise<{ success: boolean; output: string; messages?: AgentMessage[] }> {
  initializeAgents();
  const discussion: AgentMessage[] = [];
  let context = `Topic: ${params.topic}\n\n`;

  for (let round = 0; round < 3; round++) {
    for (const agentRole of params.agents) {
      const agentId = `agent_${agentRole}`;
      const agent = agents.get(agentId);
      if (!agent) continue;

      const response = await callLLM({
        system: `${agent.systemPrompt}\n\nYou are in a technical discussion with other engineers. Be concise, specific, and constructive. Build on others' ideas.`,
        messages: [{ role: "user", content: `${context}\n\nRound ${round + 1}: Share your perspective as ${agent.role}. Reference specific points from others if applicable. Be concise (max 200 words).` }],
      });

      const reply = extractTextContent(response.content);
      const msg: AgentMessage = { from: agentId, to: "all", type: "review", content: reply, timestamp: new Date().toISOString() };
      discussion.push(msg);
      context += `\n[${agent.role}]: ${reply}\n`;
    }
  }

  const output = discussion.map(m => `[${m.from}]: ${m.content}`).join("\n\n");
  return { success: true, output, messages: discussion };
}

export async function listAgents(): Promise<{ success: boolean; output: string; agents?: SpecialistAgent[] }> {
  initializeAgents();
  const list = Array.from(agents.values());
  const output = list.map(a => `${a.id} (${a.role}): ${a.status} | ${a.expertise.join(", ")}`).join("\n");
  return { success: true, output, agents: list };
}

export async function getOrchestratorLog(): Promise<{ success: boolean; output: string; messages?: AgentMessage[] }> {
  return { success: true, output: messageLog.map(m => `[${m.timestamp}] ${m.from} → ${m.to}: ${m.content}`).join("\n") || "No messages", messages: messageLog };
}

export interface ParallelTask {
  id: string;
  task: string;
  agent?: string;
  status: "pending" | "running" | "completed" | "failed";
  result?: string;
  error?: string;
  startedAt?: string;
  completedAt?: string;
  duration?: number;
}

const parallelSessions: Map<string, {
  id: string;
  tasks: ParallelTask[];
  status: "running" | "completed" | "partial" | "failed";
  maxConcurrency: number;
  startedAt: string;
  completedAt?: string;
}> = new Map();

export async function spawnParallelAgents(params: {
  tasks: Array<{ task: string; agent?: string }>;
  maxConcurrency?: number;
  onLog?: (msg: string) => void;
}): Promise<{ success: boolean; output: string; sessionId?: string; results?: ParallelTask[] }> {
  initializeAgents();
  const log = params.onLog || console.log;
  const maxConcurrency = Math.min(params.maxConcurrency || 10, 10);
  const sessionId = `parallel_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  if (!params.tasks || params.tasks.length === 0) {
    return { success: false, output: "No tasks provided" };
  }

  if (params.tasks.length > 20) {
    return { success: false, output: "Maximum 20 parallel tasks allowed" };
  }

  const parallelTasks: ParallelTask[] = params.tasks.map((t, i) => ({
    id: `task_${i + 1}`,
    task: t.task,
    agent: t.agent,
    status: "pending" as const,
  }));

  const session: {
    id: string;
    tasks: ParallelTask[];
    status: "running" | "completed" | "partial" | "failed";
    maxConcurrency: number;
    startedAt: string;
    completedAt?: string;
  } = {
    id: sessionId,
    tasks: parallelTasks,
    status: "running",
    maxConcurrency,
    startedAt: new Date().toISOString(),
  };
  parallelSessions.set(sessionId, session);

  log(`🚀 Spawning ${parallelTasks.length} parallel agents (max concurrency: ${maxConcurrency})`);
  log(`📋 Session: ${sessionId}`);

  const semaphore = { current: 0 };
  const queue = [...parallelTasks];
  const running: Promise<void>[] = [];

  async function runTask(pt: ParallelTask) {
    pt.status = "running";
    pt.startedAt = new Date().toISOString();
    const startTime = Date.now();

    const agentId = pt.agent ? `agent_${pt.agent}` : "agent_backend";
    const agent = agents.get(agentId) || agents.get("agent_backend")!;

    log(`  🤖 [${pt.id}] ${agent.role}: ${pt.task.slice(0, 80)}...`);

    try {
      const result = await consultAgent(agentId, `
Task: ${pt.task}

Execute this task independently. Provide a complete, actionable result.
Include any code, commands, or configurations needed.
Be thorough and specific.`);

      pt.status = "completed";
      pt.result = result;
      pt.completedAt = new Date().toISOString();
      pt.duration = Date.now() - startTime;
      log(`  ✅ [${pt.id}] ${agent.role}: Done (${(pt.duration / 1000).toFixed(1)}s)`);
    } catch (err: any) {
      pt.status = "failed";
      pt.error = err.message;
      pt.completedAt = new Date().toISOString();
      pt.duration = Date.now() - startTime;
      log(`  ❌ [${pt.id}] ${agent.role}: ${err.message}`);
    } finally {
      semaphore.current--;
    }
  }

  async function processQueue() {
    while (queue.length > 0) {
      if (semaphore.current >= maxConcurrency) {
        await new Promise(resolve => setTimeout(resolve, 100));
        continue;
      }
      const task = queue.shift();
      if (!task) break;
      semaphore.current++;
      running.push(runTask(task));
    }
    await Promise.all(running);
  }

  await processQueue();

  const completed = parallelTasks.filter(t => t.status === "completed").length;
  const failed = parallelTasks.filter(t => t.status === "failed").length;

  session.status = failed === 0 ? "completed" : completed === 0 ? "failed" : "partial";
  session.completedAt = new Date().toISOString();

  const summary = parallelTasks.map(t => {
    const statusIcon = t.status === "completed" ? "✅" : "❌";
    const duration = t.duration ? ` (${(t.duration / 1000).toFixed(1)}s)` : "";
    return `${statusIcon} [${t.id}] ${t.task.slice(0, 60)}${duration}\n${t.result?.slice(0, 500) || t.error || ""}`;
  }).join("\n\n---\n\n");

  log(`\n📊 Parallel execution complete: ${completed}/${parallelTasks.length} succeeded, ${failed} failed`);

  return {
    success: failed === 0,
    output: `## Parallel Execution Results\n\nSession: ${sessionId}\nCompleted: ${completed}/${parallelTasks.length}\nFailed: ${failed}\n\n${summary}`,
    sessionId,
    results: parallelTasks,
  };
}

export async function getParallelStatus(params: { sessionId?: string }): Promise<{ success: boolean; output: string }> {
  if (params.sessionId) {
    const session = parallelSessions.get(params.sessionId);
    if (!session) return { success: false, output: `Session ${params.sessionId} not found` };
    const tasks = session.tasks.map(t => {
      const icon = t.status === "completed" ? "✅" : t.status === "running" ? "🔄" : t.status === "failed" ? "❌" : "⏳";
      return `${icon} [${t.id}] ${t.task.slice(0, 60)} — ${t.status}${t.duration ? ` (${(t.duration / 1000).toFixed(1)}s)` : ""}`;
    }).join("\n");
    return { success: true, output: `Session: ${session.id}\nStatus: ${session.status}\nStarted: ${session.startedAt}\n\n${tasks}` };
  }

  if (parallelSessions.size === 0) return { success: true, output: "No parallel sessions" };
  const sessions = Array.from(parallelSessions.values()).slice(-10);
  const output = sessions.map(s => {
    const completed = s.tasks.filter(t => t.status === "completed").length;
    return `${s.id}: ${s.status} (${completed}/${s.tasks.length} tasks) — ${s.startedAt}`;
  }).join("\n");
  return { success: true, output };
}

export async function cancelParallelSession(params: { sessionId: string }): Promise<{ success: boolean; output: string }> {
  const session = parallelSessions.get(params.sessionId);
  if (!session) return { success: false, output: `Session ${params.sessionId} not found` };
  for (const task of session.tasks) {
    if (task.status === "pending" || task.status === "running") task.status = "failed";
  }
  session.status = "failed";
  return { success: true, output: `Session ${params.sessionId} cancelled` };
}

export const ORCHESTRATOR_TOOLS = [
  { name: "orchestrate", description: "Run multi-agent orchestration: architect plans, specialists execute in parallel, QA reviews", input_schema: { type: "object" as const, properties: { task: { type: "string" } }, required: ["task"] as string[] } },
  { name: "agent_discussion", description: "Start a multi-round discussion between specialist agents on a topic", input_schema: { type: "object" as const, properties: { topic: { type: "string" }, agents: { type: "array", items: { type: "string" }, description: "Agent roles: architect, frontend, backend, devops, qa, data" } }, required: ["topic", "agents"] as string[] } },
  { name: "list_agents", description: "List all specialist agents and their status", input_schema: { type: "object" as const, properties: {}, required: [] as string[] } },
  { name: "get_orchestrator_log", description: "Get the message log from multi-agent orchestration", input_schema: { type: "object" as const, properties: {}, required: [] as string[] } },
  { name: "spawn_parallel_agents", description: "הרצת מספר סוכנים במקביל — כל אחד מבצע משימה עצמאית. עד 20 משימות, עד 10 במקביל. כל סוכן מקבל תפקיד (architect/frontend/backend/devops/qa/data)", input_schema: { type: "object" as const, properties: { tasks: { type: "array", items: { type: "object", properties: { task: { type: "string", description: "Task description" }, agent: { type: "string", description: "Agent role: architect, frontend, backend, devops, qa, data" } }, required: ["task"] }, description: "List of tasks to execute in parallel" }, maxConcurrency: { type: "number", description: "Max agents running at the same time (default 10, max 10)" } }, required: ["tasks"] as string[] } },
  { name: "get_parallel_status", description: "בדוק סטטוס של הרצה מקבילית — כל המשימות או לפי session", input_schema: { type: "object" as const, properties: { sessionId: { type: "string", description: "Session ID (optional — shows all if empty)" } }, required: [] as string[] } },
  { name: "cancel_parallel_session", description: "ביטול הרצה מקבילית", input_schema: { type: "object" as const, properties: { sessionId: { type: "string" } }, required: ["sessionId"] as string[] } },
];