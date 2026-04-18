import { callLLM } from "../llm/client";
import { extractJSON, extractTextContent } from "../llm/parser";
import { writeFile } from "./fileTool";

export interface ArchitectureDecision {
  area: string;
  decision: string;
  rationale: string;
  alternatives: string[];
  tradeoffs: string;
}

export interface SystemDesign {
  overview: string;
  architecture: ArchitectureDecision[];
  components: Array<{
    name: string;
    type: string;
    responsibility: string;
    dependencies: string[];
    interfaces: string[];
  }>;
  dataModel: Array<{
    entity: string;
    fields: Array<{ name: string; type: string; constraints: string }>;
    relations: string[];
  }>;
  apiDesign: Array<{
    method: string;
    path: string;
    description: string;
    auth: boolean;
    request?: string;
    response?: string;
  }>;
  infrastructure: {
    hosting: string;
    database: string;
    cache: string;
    cdn: string;
    monitoring: string;
  };
  securityPlan: string[];
  scalingStrategy: string;
  estimatedCost: string;
}

export async function designSystem(params: { requirements: string }): Promise<{ success: boolean; output: string; design?: SystemDesign }> {
  const response = await callLLM({
    system: `You are a world-class software architect with 20+ years experience.
Design complete systems from requirements. Consider: scalability, security, maintainability, cost, developer experience.

Always respond with a complete JSON SystemDesign object:
{
  "overview": "2-3 sentence summary",
  "architecture": [{ "area": "", "decision": "", "rationale": "", "alternatives": [], "tradeoffs": "" }],
  "components": [{ "name": "", "type": "service|module|library|ui", "responsibility": "", "dependencies": [], "interfaces": [] }],
  "dataModel": [{ "entity": "", "fields": [{ "name": "", "type": "", "constraints": "" }], "relations": [] }],
  "apiDesign": [{ "method": "GET|POST|PUT|DELETE", "path": "", "description": "", "auth": true, "request": "", "response": "" }],
  "infrastructure": { "hosting": "", "database": "", "cache": "", "cdn": "", "monitoring": "" },
  "securityPlan": [],
  "scalingStrategy": "",
  "estimatedCost": ""
}`,
    messages: [{ role: "user", content: `Design a complete system for:\n\n${params.requirements}` }],
    maxTokens: 8192,
  });

  const text = extractTextContent(response.content);
  const design = extractJSON(text) as SystemDesign;
  if (!design) return { success: false, output: "Failed to generate system design" };
  return { success: true, output: `System designed: ${design.overview}\n\nComponents: ${design.components?.length || 0}\nEntities: ${design.dataModel?.length || 0}\nEndpoints: ${design.apiDesign?.length || 0}`, design };
}

export async function generateSchemaFromDesign(params: { design: SystemDesign; orm: "prisma" | "drizzle" | "typeorm" }): Promise<{ success: boolean; output: string }> {
  const response = await callLLM({
    system: `You are a database expert. Generate a complete ${params.orm} schema from the data model.
Include: all entities, fields, relations, indexes, constraints, enums.
Respond with ONLY the schema code, no explanation.`,
    messages: [{ role: "user", content: `Generate ${params.orm} schema for:\n\n${JSON.stringify(params.design.dataModel, null, 2)}\n\nRelations and constraints should be complete and production-ready.` }],
    maxTokens: 8192,
  });

  let schema = extractTextContent(response.content);
  schema = schema.replace(/^```\w*\n/, "").replace(/\n```$/, "").trim();

  const ext = params.orm === "prisma" ? "prisma" : "ts";
  const filename = params.orm === "prisma" ? "prisma/schema.prisma" : `src/db/schema.${ext}`;
  await writeFile({ path: filename, content: schema });
  return { success: true, output: `Schema generated at ${filename} (${schema.split("\n").length} lines)` };
}

export async function generateAPIFromDesign(params: { design: SystemDesign }): Promise<{ success: boolean; output: string; files?: string[] }> {
  const files: string[] = [];
  const resources = new Map<string, typeof params.design.apiDesign>();

  for (const endpoint of params.design.apiDesign || []) {
    const resource = endpoint.path.split("/")[2] || "root";
    if (!resources.has(resource)) resources.set(resource, []);
    resources.get(resource)!.push(endpoint);
  }

  for (const [resource, endpoints] of resources) {
    const response = await callLLM({
      system: `You are an expert API developer. Generate a complete Express.js TypeScript route file.
Include: proper validation (zod), error handling, authentication middleware, pagination, TypeScript types.
Respond with ONLY the code.`,
      messages: [{ role: "user", content: `Generate route file for resource "${resource}" with endpoints:\n${JSON.stringify(endpoints, null, 2)}` }],
    });

    let code = extractTextContent(response.content);
    code = code.replace(/^```\w*\n/, "").replace(/\n```$/, "").trim();

    const filename = `src/routes/${resource}.ts`;
    await writeFile({ path: filename, content: code });
    files.push(filename);
  }

  return { success: true, output: `Generated ${files.length} route files: ${files.join(", ")}`, files };
}

export async function reviewArchitecture(params: { projectContext: string }): Promise<{ success: boolean; output: string; review?: any }> {
  const response = await callLLM({
    system: `You are a senior architecture reviewer. Review the project for:
1. Architecture patterns and anti-patterns
2. Scalability concerns
3. Security vulnerabilities
4. Performance bottlenecks
5. Maintainability
6. Testing strategy
7. Error handling
8. Separation of concerns

Respond with JSON:
{
  "score": 0-100,
  "strengths": [],
  "weaknesses": [],
  "recommendations": [{ "priority": "critical|high|medium|low", "area": "", "issue": "", "recommendation": "" }]
}`,
    messages: [{ role: "user", content: `Review this architecture:\n\n${params.projectContext}` }],
  });

  const review = extractJSON(extractTextContent(response.content));
  if (!review) return { success: false, output: "Failed to review architecture" };
  return { success: true, output: `Architecture Score: ${review.score}/100\nStrengths: ${review.strengths?.length || 0}\nWeaknesses: ${review.weaknesses?.length || 0}\nRecommendations: ${review.recommendations?.length || 0}`, review };
}

export async function generateDiagram(params: { design: SystemDesign; type: "architecture" | "erd" | "sequence" | "flow" }): Promise<{ success: boolean; output: string }> {
  const response = await callLLM({
    system: `Generate a Mermaid diagram. Respond with ONLY the mermaid code (no code blocks).`,
    messages: [{ role: "user", content: `Generate a ${params.type} diagram for:\n${JSON.stringify(params.type === "erd" ? params.design.dataModel : params.type === "architecture" ? params.design.components : params.design.apiDesign, null, 2)}` }],
  });

  let diagram = extractTextContent(response.content);
  diagram = diagram.replace(/^```\w*\n/, "").replace(/\n```$/, "").trim();
  await writeFile({ path: `docs/diagrams/${params.type}.mmd`, content: diagram });
  return { success: true, output: `Mermaid ${params.type} diagram generated at docs/diagrams/${params.type}.mmd\n\n${diagram}` };
}

export const AI_ARCHITECT_TOOLS = [
  { name: "design_system", description: "AI architect designs a complete system from requirements — architecture, data model, API, infrastructure, security", input_schema: { type: "object" as const, properties: { requirements: { type: "string", description: "System requirements in natural language" } }, required: ["requirements"] as string[] } },
  { name: "generate_schema_from_design", description: "Generate ORM schema (Prisma/Drizzle/TypeORM) from a system design's data model", input_schema: { type: "object" as const, properties: { design: { type: "object", description: "SystemDesign object from design_system" }, orm: { type: "string", enum: ["prisma", "drizzle", "typeorm"] } }, required: ["design", "orm"] as string[] } },
  { name: "generate_api_from_design", description: "Generate Express.js route files from a system design's API specification", input_schema: { type: "object" as const, properties: { design: { type: "object", description: "SystemDesign object from design_system" } }, required: ["design"] as string[] } },
  { name: "review_architecture", description: "AI reviews project architecture — score, strengths, weaknesses, recommendations by priority", input_schema: { type: "object" as const, properties: { projectContext: { type: "string", description: "Project structure, tech stack, and code samples to review" } }, required: ["projectContext"] as string[] } },
  { name: "generate_diagram", description: "Generate Mermaid diagrams (architecture, ERD, sequence, flow) from system design", input_schema: { type: "object" as const, properties: { design: { type: "object", description: "SystemDesign object" }, type: { type: "string", enum: ["architecture", "erd", "sequence", "flow"] } }, required: ["design", "type"] as string[] } },
];