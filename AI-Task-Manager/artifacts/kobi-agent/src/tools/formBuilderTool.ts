import { callLLM } from "../llm/client";
import { extractTextContent } from "../llm/parser";
import { writeFile } from "./fileTool";

export async function generateFormFromSchema(params: { schema: Record<string, any>; name: string; framework?: string }): Promise<{ success: boolean; output: string }> {
  const fw = params.framework || "react";
  const response = await callLLM({
    system: `Generate a ${fw} form component from the JSON schema. Requirements:
- TypeScript, proper validation (zod/yup), error messages in Hebrew
- RTL support, dark theme (bg-gray-800/900, text-white)
- React Hook Form or native form handling
- Submit handler with loading state
- Tailwind CSS styling
Respond with ONLY the component code.`,
    messages: [{ role: "user", content: `Form "${params.name}" from schema:\n${JSON.stringify(params.schema, null, 2)}` }],
    maxTokens: 4096,
  });
  let code = extractTextContent(response.content).replace(/^```\w*\n/, "").replace(/\n```$/, "").trim();
  const filePath = `src/components/forms/${params.name}Form.tsx`;
  await writeFile({ path: filePath, content: code });
  return { success: true, output: `Form generated → ${filePath}\nFields: ${Object.keys(params.schema.properties || params.schema).join(", ")}` };
}

export async function generateCRUDForms(params: { tableName: string; fields: Array<{ name: string; type: string; required?: boolean; label?: string }> }): Promise<{ success: boolean; output: string }> {
  const schema = { type: "object", properties: Object.fromEntries(params.fields.map(f => [f.name, { type: f.type, label: f.label || f.name }])), required: params.fields.filter(f => f.required).map(f => f.name) };
  const createResult = await generateFormFromSchema({ schema, name: `Create${params.tableName}` });
  const editResult = await generateFormFromSchema({ schema, name: `Edit${params.tableName}` });
  return { success: true, output: `CRUD forms generated for "${params.tableName}":\n  ${createResult.output}\n  ${editResult.output}` };
}

export async function generateFormValidation(params: { fields: Array<{ name: string; type: string; required?: boolean; min?: number; max?: number; pattern?: string }> }): Promise<{ success: boolean; output: string }> {
  const response = await callLLM({
    system: "Generate a Zod validation schema for the given fields. Include proper error messages in Hebrew. Return ONLY TypeScript code with the schema export.",
    messages: [{ role: "user", content: `Fields:\n${JSON.stringify(params.fields, null, 2)}` }],
    maxTokens: 2000,
  });
  let code = extractTextContent(response.content).replace(/^```\w*\n/, "").replace(/\n```$/, "").trim();
  await writeFile({ path: "src/validations/formSchema.ts", content: code });
  return { success: true, output: `Validation schema generated → src/validations/formSchema.ts` };
}

export const FORM_BUILDER_TOOLS = [
  { name: "generate_form_from_schema", description: "Generate a React form component from a JSON schema with validation and Hebrew labels", input_schema: { type: "object" as const, properties: { schema: { type: "object", description: "JSON schema with field types" }, name: { type: "string" }, framework: { type: "string", enum: ["react", "vue"] } }, required: ["schema", "name"] as string[] } },
  { name: "generate_crud_forms", description: "Generate Create and Edit forms for a database table", input_schema: { type: "object" as const, properties: { tableName: { type: "string" }, fields: { type: "array", items: { type: "object", properties: { name: { type: "string" }, type: { type: "string" }, required: { type: "boolean" }, label: { type: "string" } } } } }, required: ["tableName", "fields"] as string[] } },
  { name: "generate_form_validation", description: "Generate Zod validation schema with Hebrew error messages", input_schema: { type: "object" as const, properties: { fields: { type: "array", items: { type: "object" } } }, required: ["fields"] as string[] } },
];