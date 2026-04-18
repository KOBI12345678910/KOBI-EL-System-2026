import { callLLM } from "../llm/client";
import { extractTextContent } from "../llm/parser";
import { writeFile, readFile } from "./fileTool";
import { runCommand } from "./terminalTool";
import * as fs from "fs";
import * as path from "path";

const WORKSPACE_DIR = path.resolve(process.env.WORKSPACE_DIR || "./workspace");

export async function generateEmailTemplate(params: { name: string; type: string; variables?: string[]; rtl?: boolean; brandColor?: string; companyName?: string }): Promise<{ success: boolean; output: string }> {
  const vars = params.variables || ["name", "company"];
  const brandColor = params.brandColor || "#6c5ce7";
  const companyName = params.companyName || "App";
  const response = await callLLM({
    system: `Generate a professional, responsive HTML email template. Requirements:
- Use tables for layout (email client compatibility)
- Inline all CSS styles, max width 600px, centered
- ${params.rtl ? "RTL direction for Hebrew" : "LTR"}
- Dark mode support with @media (prefers-color-scheme: dark)
- Mobile responsive
- Variables as {{variableName}} placeholders
- Brand color: ${brandColor}, Company: ${companyName}
- Include: preheader text, header, body, footer with unsubscribe link
${params.type === "welcome" ? "Include: greeting, feature highlights, CTA button, social links" : ""}
${params.type === "reset_password" ? "Include: reset link button, security notice, expiry warning" : ""}
${params.type === "invoice" ? "Include: invoice number, line items table, total, payment link" : ""}
${params.type === "notification" ? "Include: notification title, message body, action button" : ""}
Respond with ONLY the HTML.`,
    messages: [{ role: "user", content: `Template: "${params.name}" (${params.type})\nVariables: ${vars.join(", ")}` }],
    maxTokens: 4096,
  });

  let html = extractTextContent(response.content);
  html = html.replace(/^```\w*\n/, "").replace(/\n```$/, "").trim();
  const filePath = `src/emails/templates/${params.name.replace(/\s+/g, "-").toLowerCase()}.html`;
  await writeFile({ path: filePath, content: html });

  const renderFunc = `export function render${params.name.charAt(0).toUpperCase() + params.name.slice(1).replace(/[-_](.)/g, (_, c) => c.toUpperCase())}(data: Record<string, string>): string {
  let html = require('fs').readFileSync(__dirname + '/templates/${params.name.replace(/\s+/g, "-").toLowerCase()}.html', 'utf-8');
  for (const [key, value] of Object.entries(data)) {
    html = html.replace(new RegExp('\\\\{\\\\{' + key + '\\\\}\\\\}', 'g'), value);
  }
  return html;
}\n`;

  const indexPath = "src/emails/index.ts";
  const existing = await readFile({ path: indexPath });
  const content = existing.success ? (existing.output || "") + "\n" + renderFunc : renderFunc;
  await writeFile({ path: indexPath, content });

  return { success: true, output: `Email template generated → ${filePath}\nRender function added to src/emails/index.ts\nType: ${params.type}\nVariables: ${vars.join(", ")}` };
}

export async function setupEmailService(params: { provider?: string }): Promise<{ success: boolean; output: string }> {
  const provider = params.provider || "nodemailer";

  const packages: Record<string, string> = {
    nodemailer: "nodemailer @types/nodemailer",
    resend: "resend",
    sendgrid: "@sendgrid/mail",
  };

  await runCommand({ command: `npm install ${packages[provider] || packages.nodemailer}`, timeout: 30000 });

  const serviceCode: Record<string, string> = {
    nodemailer: `import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

export async function sendEmail(params: {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
  attachments?: Array<{ filename: string; content: Buffer | string }>;
}) {
  return transporter.sendMail({
    from: params.from || process.env.EMAIL_FROM || 'noreply@app.com',
    to: Array.isArray(params.to) ? params.to.join(', ') : params.to,
    subject: params.subject,
    html: params.html,
    text: params.text,
    replyTo: params.replyTo,
    attachments: params.attachments,
  });
}`,

    resend: `import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendEmail(params: {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
}) {
  return resend.emails.send({
    from: params.from || process.env.EMAIL_FROM || 'noreply@app.com',
    to: params.to,
    subject: params.subject,
    html: params.html,
  });
}`,

    sendgrid: `import sgMail from '@sendgrid/mail';

sgMail.setApiKey(process.env.SENDGRID_API_KEY!);

export async function sendEmail(params: {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
}) {
  return sgMail.send({
    from: params.from || process.env.EMAIL_FROM || 'noreply@app.com',
    to: params.to,
    subject: params.subject,
    html: params.html,
  });
}`,
  };

  await writeFile({ path: "src/services/email.ts", content: serviceCode[provider] || serviceCode.nodemailer });
  return { success: true, output: `Email service setup → src/services/email.ts (${provider})\nPackage installed: ${packages[provider] || packages.nodemailer}` };
}

export async function generateEmailService(): Promise<{ success: boolean; output: string }> {
  return setupEmailService({ provider: "nodemailer" });
}

export async function previewEmailTemplate(params: { templatePath: string; data?: Record<string, string> }): Promise<{ success: boolean; output: string }> {
  const fullPath = path.isAbsolute(params.templatePath) ? params.templatePath : path.join(WORKSPACE_DIR, params.templatePath);
  if (!fs.existsSync(fullPath)) return { success: false, output: `Template not found: ${params.templatePath}` };

  let html = fs.readFileSync(fullPath, "utf-8");
  if (params.data) {
    for (const [key, value] of Object.entries(params.data)) {
      html = html.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
    }
  }

  const previewPath = path.join(WORKSPACE_DIR, "tmp/email-preview.html");
  const previewDir = path.dirname(previewPath);
  if (!fs.existsSync(previewDir)) fs.mkdirSync(previewDir, { recursive: true });
  fs.writeFileSync(previewPath, html);
  return { success: true, output: `Email preview → tmp/email-preview.html\nOpen in browser to preview the rendered template.` };
}

export async function listEmailTemplates(): Promise<{ success: boolean; output: string }> {
  const result = await runCommand({ command: "find src/emails -name '*.html' 2>/dev/null || echo 'No templates'", timeout: 3000 });
  return { success: true, output: result.stdout || "No email templates found" };
}

export const EMAIL_TEMPLATE_TOOLS = [
  { name: "generate_email_template", description: "Generate a responsive HTML email template with variables, dark mode, and render function", input_schema: { type: "object" as const, properties: { name: { type: "string", description: "Template name" }, type: { type: "string", enum: ["welcome", "invoice", "notification", "reset_password", "confirmation", "newsletter", "custom"], description: "Template type" }, variables: { type: "array", items: { type: "string" }, description: "Variable names" }, rtl: { type: "boolean", description: "RTL for Hebrew" }, brandColor: { type: "string", description: "Brand color hex" }, companyName: { type: "string" } }, required: ["name", "type"] as string[] } },
  { name: "setup_email_service", description: "Setup email sending service (nodemailer/resend/sendgrid) with package installation", input_schema: { type: "object" as const, properties: { provider: { type: "string", enum: ["nodemailer", "resend", "sendgrid"], description: "Email provider (default: nodemailer)" } }, required: [] as string[] } },
  { name: "generate_email_service", description: "Generate a nodemailer email service (shortcut for setup_email_service)", input_schema: { type: "object" as const, properties: {}, required: [] as string[] } },
  { name: "preview_email_template", description: "Preview an email template with sample data substituted", input_schema: { type: "object" as const, properties: { templatePath: { type: "string" }, data: { type: "object", description: "Key-value pairs to replace {{variables}}" } }, required: ["templatePath"] as string[] } },
  { name: "list_email_templates", description: "List all email templates in the project", input_schema: { type: "object" as const, properties: {}, required: [] as string[] } },
];