import { callLLM } from "../llm/client";
import { extractJSON, extractTextContent } from "../llm/parser";
import { writeFile } from "./fileTool";
import { designSystem, generateSchemaFromDesign, generateAPIFromDesign, generateDiagram, type SystemDesign } from "./aiArchitectTool";

async function generateCode(system: string, prompt: string): Promise<string> {
  const response = await callLLM({ system, messages: [{ role: "user", content: prompt }], maxTokens: 8192 });
  return extractTextContent(response.content).replace(/^```\w*\n/, "").replace(/\n```$/, "").trim();
}

export async function generateFullCRUD(params: {
  name: string;
  fields: Array<{ name: string; type: string; required?: boolean; unique?: boolean }>;
  relations?: Array<{ entity: string; type: "one-to-one" | "one-to-many" | "many-to-many" }>;
}): Promise<{ success: boolean; output: string; files?: string[] }> {
  const entityName = params.name;
  const entityLower = entityName.toLowerCase();
  const entityPlural = entityLower + "s";
  const files: string[] = [];

  const schema = await generateCode(
    "Generate Drizzle ORM schema. Respond with ONLY TypeScript code.",
    `Generate Drizzle schema for entity "${entityName}" with fields: ${JSON.stringify(params.fields)} and relations: ${JSON.stringify(params.relations || [])}. Include pgTable, proper types, timestamps, indexes.`
  );
  await writeFile({ path: `src/db/schema/${entityLower}.ts`, content: schema });
  files.push(`src/db/schema/${entityLower}.ts`);

  const zod = await generateCode(
    "Generate Zod validation schemas. Respond with ONLY TypeScript code.",
    `Generate Zod schemas for "${entityName}" with fields: ${JSON.stringify(params.fields)}. Create: create${entityName}Schema, update${entityName}Schema, query${entityName}Schema (with pagination, filters, sorting). Export TypeScript types from schemas.`
  );
  await writeFile({ path: `src/validators/${entityLower}.ts`, content: zod });
  files.push(`src/validators/${entityLower}.ts`);

  const service = await generateCode(
    "Generate a service layer with full CRUD + pagination + filtering. Respond with ONLY TypeScript code.",
    `Generate service for "${entityName}" using Drizzle ORM. Methods: getAll (paginated, filtered, sorted), getById, create, update, delete, search. Include proper error handling, transaction support, and types. Schema import from ../db/schema/${entityLower}. Validator import from ../validators/${entityLower}.`
  );
  await writeFile({ path: `src/services/${entityLower}Service.ts`, content: service });
  files.push(`src/services/${entityLower}Service.ts`);

  const routes = await generateCode(
    "Generate Express.js API routes. Respond with ONLY TypeScript code.",
    `Generate Express routes for "${entityName}" CRUD: GET /${entityPlural} (list with pagination/filter/sort query params), GET /${entityPlural}/:id, POST /${entityPlural}, PUT /${entityPlural}/:id, DELETE /${entityPlural}/:id, GET /${entityPlural}/search?q=. Use service from ../services/${entityLower}Service. Use validation middleware with schemas from ../validators/${entityLower}. Include proper error handling, auth middleware placeholder.`
  );
  await writeFile({ path: `src/routes/${entityLower}.ts`, content: routes });
  files.push(`src/routes/${entityLower}.ts`);

  const components = await generateCode(
    "Generate React components with TypeScript and Tailwind CSS. Respond with ONLY TypeScript/TSX code.",
    `Generate complete React components for "${entityName}" CRUD: 1. ${entityName}List - table view with pagination, sorting, filtering, search, delete button. 2. ${entityName}Form - create/edit form with validation. 3. ${entityName}Detail - detail view with edit/delete actions. 4. use${entityName} - custom hook for API calls. Fields: ${JSON.stringify(params.fields)}. Use Tailwind CSS. Include loading states, error handling, empty states. Put all in one file with proper exports.`
  );
  await writeFile({ path: `src/components/${entityName}/index.tsx`, content: components });
  files.push(`src/components/${entityName}/index.tsx`);

  const tests = await generateCode(
    "Generate comprehensive tests using Vitest. Respond with ONLY TypeScript code.",
    `Generate tests for "${entityName}" service: CRUD operations, Validation (invalid data, missing fields), Pagination and filtering, Error handling, Edge cases. Import from ../services/${entityLower}Service`
  );
  await writeFile({ path: `src/__tests__/${entityLower}.test.ts`, content: tests });
  files.push(`src/__tests__/${entityLower}.test.ts`);

  return { success: true, output: `Generated ${files.length} files for ${entityName} CRUD:\n${files.join("\n")}`, files };
}

export async function generateAuthSystem(params: {
  type: "jwt" | "session" | "oauth";
  providers?: string[];
  roles?: string[];
  mfa?: boolean;
}): Promise<{ success: boolean; output: string; files?: string[] }> {
  const providers = params.providers || ["email"];
  const roles = params.roles || ["user", "admin"];
  const files: string[] = [];

  const response = await callLLM({
    system: `You are a security expert. Generate a complete, production-ready authentication system. Respond with JSON: { "files": { "path": "content" } }`,
    messages: [{ role: "user", content: `Generate complete auth system:\nType: ${params.type}\nProviders: ${JSON.stringify(providers)}\nRoles: ${JSON.stringify(roles)}\nMFA: ${params.mfa ? "yes" : "no"}\n\nGenerate these files:\n- src/auth/config.ts\n- src/auth/middleware.ts\n- src/auth/service.ts\n- src/auth/routes.ts\n- src/auth/types.ts\n- src/auth/utils.ts\n${params.mfa ? "- src/auth/mfa.ts" : ""}\n${providers.includes("google") ? "- src/auth/providers/google.ts" : ""}\n${providers.includes("github") ? "- src/auth/providers/github.ts" : ""}\n- src/db/schema/users.ts\n- src/components/Auth/LoginForm.tsx\n- src/components/Auth/RegisterForm.tsx\n- src/components/Auth/AuthProvider.tsx\n\nAll code must be production-ready with proper error handling, input validation, and security best practices.` }],
    maxTokens: 8192,
  });

  const parsed = extractJSON(extractTextContent(response.content));
  if (parsed?.files) {
    for (const [filePath, content] of Object.entries(parsed.files)) {
      await writeFile({ path: filePath, content: content as string });
      files.push(filePath);
    }
  }

  return { success: true, output: `Generated ${files.length} auth files (${params.type}):\n${files.join("\n")}`, files };
}

export async function generateFromDescription(params: { description: string }): Promise<{ success: boolean; output: string; files?: string[] }> {
  const designResult = await designSystem({ requirements: params.description });
  if (!designResult.success || !designResult.design) return { success: false, output: "Failed to design system" };
  const design = designResult.design;
  const files: string[] = [];

  if (design.dataModel?.length > 0) {
    await generateSchemaFromDesign({ design, orm: "drizzle" });
    files.push("src/db/schema.ts");
  }

  if (design.apiDesign?.length > 0) {
    const apiResult = await generateAPIFromDesign({ design });
    if (apiResult.files) files.push(...apiResult.files);
  }

  for (const entity of design.dataModel || []) {
    const crudResult = await generateFullCRUD({
      name: entity.entity,
      fields: entity.fields.map(f => ({
        name: f.name,
        type: f.type,
        required: f.constraints?.includes("required") || f.constraints?.includes("NOT NULL"),
        unique: f.constraints?.includes("unique"),
      })),
      relations: entity.relations?.map(r => {
        const parts = r.split(" ");
        return { entity: parts[parts.length - 1], type: "one-to-many" as const };
      }),
    });
    if (crudResult.files) files.push(...crudResult.files);
  }

  await generateDiagram({ design, type: "architecture" });
  await generateDiagram({ design, type: "erd" });

  return { success: true, output: `Generated ${files.length} files from description:\n${design.overview}\n\nFiles:\n${files.join("\n")}`, files };
}

export const FULLSTACK_GENERATOR_TOOLS = [
  { name: "generate_full_crud", description: "Generate complete CRUD stack for an entity: Drizzle schema, Zod validators, service layer, Express routes, React components, tests", input_schema: { type: "object" as const, properties: { name: { type: "string", description: "Entity name (PascalCase)" }, fields: { type: "array", items: { type: "object", properties: { name: { type: "string" }, type: { type: "string" }, required: { type: "boolean" }, unique: { type: "boolean" } } } }, relations: { type: "array", items: { type: "object", properties: { entity: { type: "string" }, type: { type: "string", enum: ["one-to-one", "one-to-many", "many-to-many"] } } } } }, required: ["name", "fields"] as string[] } },
  { name: "generate_auth_system", description: "Generate complete authentication system: config, middleware, service, routes, UI components", input_schema: { type: "object" as const, properties: { type: { type: "string", enum: ["jwt", "session", "oauth"] }, providers: { type: "array", items: { type: "string" } }, roles: { type: "array", items: { type: "string" } }, mfa: { type: "boolean" } }, required: ["type"] as string[] } },
  { name: "generate_from_description", description: "Generate a complete full-stack application from a natural language description — designs architecture, generates schema, API, CRUD, and diagrams", input_schema: { type: "object" as const, properties: { description: { type: "string", description: "Natural language description of the application to build" } }, required: ["description"] as string[] } },
];