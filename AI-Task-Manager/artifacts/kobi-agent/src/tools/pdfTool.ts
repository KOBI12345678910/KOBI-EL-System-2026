import { callLLM } from "../llm/client";
import { extractTextContent } from "../llm/parser";
import { writeFile } from "./fileTool";
import { runCommand } from "./terminalTool";

export async function generatePDFTemplate(params: { name: string; type: string; fields?: string[]; rtl?: boolean }): Promise<{ success: boolean; output: string }> {
  const response = await callLLM({
    system: `Generate a PDF template using pdfkit or puppeteer. Requirements:
- ${params.rtl ? "RTL Hebrew support" : "LTR"}
- Professional design with headers, footers, page numbers
- Table support for data
- Company logo placeholder
- TypeScript, export as function that returns Buffer
Respond with ONLY TypeScript code.`,
    messages: [{ role: "user", content: `PDF template "${params.name}" (${params.type})\nFields: ${(params.fields || ["title", "date", "content"]).join(", ")}` }],
    maxTokens: 4096,
  });
  let code = extractTextContent(response.content).replace(/^```\w*\n/, "").replace(/\n```$/, "").trim();
  const filePath = `src/pdf/${params.name.replace(/\s+/g, "-").toLowerCase()}.ts`;
  await writeFile({ path: filePath, content: code });
  return { success: true, output: `PDF template generated → ${filePath}` };
}

export async function generateInvoicePDF(params: { templateName?: string }): Promise<{ success: boolean; output: string }> {
  const code = `import PDFDocument from 'pdfkit';

export function generateInvoice(data: {
  invoiceNumber: string; date: string; customerName: string; customerAddress: string;
  items: Array<{ description: string; quantity: number; unitPrice: number; total: number }>;
  subtotal: number; vat: number; total: number; companyName: string;
}): Buffer {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  const buffers: Buffer[] = [];
  doc.on('data', (b: Buffer) => buffers.push(b));

  doc.fontSize(20).text(data.companyName, 50, 50, { align: 'right' });
  doc.fontSize(14).text('חשבונית מס', 50, 80, { align: 'right' });
  doc.fontSize(10).text('מספר: ' + data.invoiceNumber, 50, 110, { align: 'right' });
  doc.text('תאריך: ' + data.date, 50, 125, { align: 'right' });

  doc.moveDown(2);
  doc.text('לכבוד: ' + data.customerName, { align: 'right' });
  doc.text(data.customerAddress, { align: 'right' });

  let y = 220;
  doc.fontSize(10);
  ['תיאור', 'כמות', 'מחיר יחידה', 'סה"כ'].forEach((h, i) => doc.text(h, 50 + i * 130, y, { width: 120, align: 'right' }));
  y += 20;

  for (const item of data.items) {
    doc.text(item.description, 50, y, { width: 120, align: 'right' });
    doc.text(String(item.quantity), 180, y, { width: 120, align: 'right' });
    doc.text(String(item.unitPrice), 310, y, { width: 120, align: 'right' });
    doc.text(String(item.total), 440, y, { width: 120, align: 'right' });
    y += 20;
  }

  y += 20;
  doc.text('סה"כ לפני מע"מ: ' + data.subtotal, 350, y, { align: 'right' });
  doc.text('מע"מ (17%): ' + data.vat, 350, y + 15, { align: 'right' });
  doc.fontSize(12).text('סה"כ לתשלום: ' + data.total, 350, y + 35, { align: 'right' });

  doc.end();
  return Buffer.concat(buffers);
}
`;
  await writeFile({ path: "src/pdf/invoice.ts", content: code });
  return { success: true, output: "Invoice PDF generator → src/pdf/invoice.ts (Hebrew RTL, VAT 17%)" };
}

export async function generateReportPDF(): Promise<{ success: boolean; output: string }> {
  return generatePDFTemplate({ name: "report", type: "report", fields: ["title", "date", "sections", "charts", "summary"], rtl: true });
}

export const PDF_TOOLS = [
  { name: "generate_pdf_template", description: "Generate a PDF template using pdfkit with Hebrew RTL support", input_schema: { type: "object" as const, properties: { name: { type: "string" }, type: { type: "string", enum: ["invoice", "report", "receipt", "certificate", "letter", "custom"] }, fields: { type: "array", items: { type: "string" } }, rtl: { type: "boolean" } }, required: ["name", "type"] as string[] } },
  { name: "generate_invoice_pdf", description: "Generate a Hebrew invoice PDF generator (VAT 17%, אגורות)", input_schema: { type: "object" as const, properties: { templateName: { type: "string" } }, required: [] as string[] } },
  { name: "generate_report_pdf", description: "Generate a report PDF template with sections and charts", input_schema: { type: "object" as const, properties: {}, required: [] as string[] } },
];