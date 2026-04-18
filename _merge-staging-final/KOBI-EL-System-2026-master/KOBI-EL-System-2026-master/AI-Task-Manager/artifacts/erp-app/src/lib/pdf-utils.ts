import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { formatAgorot } from "./utils";

export interface PDFDocumentData {
  type: "invoice" | "quote" | "work-order";
  number: string;
  date: string;
  customer?: {
    name: string;
    phone?: string;
    email?: string;
    address?: string;
  };
  items: Array<{
    description: string;
    quantity: number;
    unit_price: number;
    total: number;
  }>;
  subtotal: number;
  vat_amount: number;
  total: number;
}

export function generatePDF(data: PDFDocumentData): void {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  doc.setFont("times");
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const typeLabels = {
    invoice: "חשבונית",
    quote: "הצעת מחיר",
    "work-order": "הזמנת עבודה",
  };

  let yPos = 20;

  doc.setFontSize(20);
  doc.setFont("times", "bold");
  doc.text(typeLabels[data.type], pageWidth - 20, yPos, { align: "right" });

  yPos += 15;
  doc.setFontSize(10);
  doc.setFont("times", "normal");

  const headerLines = [
    `מספר: ${data.number}`,
    `תאריך: ${data.date}`,
  ];

  headerLines.forEach((line) => {
    doc.text(line, pageWidth - 20, yPos, { align: "right" });
    yPos += 7;
  });

  yPos += 10;

  if (data.customer) {
    doc.setFont("times", "bold");
    doc.text("פרטי הלקוח:", pageWidth - 20, yPos, { align: "right" });
    yPos += 7;

    doc.setFont("times", "normal");
    const customerLines = [
      `שם: ${data.customer.name}`,
      data.customer.phone ? `טלפון: ${data.customer.phone}` : null,
      data.customer.email ? `אימייל: ${data.customer.email}` : null,
      data.customer.address ? `כתובת: ${data.customer.address}` : null,
    ].filter(Boolean) as string[];

    customerLines.forEach((line) => {
      doc.text(line, pageWidth - 20, yPos, { align: "right" });
      yPos += 5;
    });
  }

  yPos += 10;

  const tableData = data.items.map((item) => [
    item.description,
    item.quantity.toString(),
    formatAgorot(item.unit_price),
    formatAgorot(item.total),
  ]);

  autoTable(doc, {
    head: [["תיאור", "כמות", "מחיר יחידה", "סך הכל"]],
    body: tableData,
    startY: yPos,
    margin: { left: 20, right: 20 },
    styles: { font: "times", halign: "right", valign: "middle" },
    headStyles: { fillColor: [100, 100, 100], textColor: [255, 255, 255] },
    columnStyles: {
      1: { halign: "center" },
      2: { halign: "right" },
      3: { halign: "right" },
    },
  });

  yPos = (doc as any).lastAutoTable.finalY + 10;

  doc.setFont("times", "bold");
  const summaryLines = [
    { label: "סכום ללא מע״מ:", value: formatAgorot(data.subtotal) },
    { label: "מע״מ (17%):", value: formatAgorot(data.vat_amount) },
    { label: "סכום כולל:", value: formatAgorot(data.total) },
  ];

  summaryLines.forEach((line) => {
    doc.text(line.label, pageWidth - 20, yPos, { align: "right" });
    doc.text(line.value, pageWidth - 50, yPos, { align: "right" });
    yPos += 8;
  });

  const filename = `${typeLabels[data.type]}_${data.number}.pdf`;
  doc.save(filename);
}
