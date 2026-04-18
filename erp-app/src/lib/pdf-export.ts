import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const COMPANY = {
  nameHe: "טכנו-כל עוזי",
  nameEn: "TECHNO-KOL UZI",
  tagline: "Metal / Iron / Aluminum / Glass Frames Factory",
  taxId: "054227129",
  phone: "",
  email: "",
};

const COLORS = {
  primary: [30, 64, 175] as [number, number, number],
  primaryLight: [59, 130, 246] as [number, number, number],
  dark: [15, 23, 42] as [number, number, number],
  gray: [100, 116, 139] as [number, number, number],
  lightGray: [241, 245, 249] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
};

function drawLogo(doc: jsPDF, x: number, y: number, size: number) {
  doc.setFillColor(...COLORS.primary);
  doc.roundedRect(x, y, size, size, 2, 2, "F");

  doc.setFillColor(...COLORS.primaryLight);
  const barW = size * 0.15;
  const barGap = size * 0.08;
  const barBottom = y + size - 3;
  const heights = [size * 0.3, size * 0.5, size * 0.65, size * 0.4];
  const startX = x + (size - (heights.length * barW + (heights.length - 1) * barGap)) / 2;

  heights.forEach((h, i) => {
    const bx = startX + i * (barW + barGap);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(bx, barBottom - h, barW, h, 0.5, 0.5, "F");
  });
}

function reverseHebrew(text: string): string {
  const parts: string[] = [];
  let current = "";
  let isHeb = false;

  for (const ch of text) {
    const hebChar = /[\u0590-\u05FF]/.test(ch);
    if (hebChar !== isHeb && current) {
      parts.push(current);
      current = "";
    }
    isHeb = hebChar;
    current += ch;
  }
  if (current) parts.push(current);

  return parts.map(p => /[\u0590-\u05FF]/.test(p[0]) ? p.split("").reverse().join("") : p).reverse().join("");
}

interface ExportPDFOptions {
  title: string;
  data: Record<string, any>[];
  headers: Record<string, string>;
  filename?: string;
  orientation?: "portrait" | "landscape";
  subtitle?: string;
  footerNote?: string;
}

export function exportTableToPDF({
  title,
  data,
  headers,
  filename,
  orientation = "landscape",
  subtitle,
  footerNote,
}: ExportPDFOptions) {
  if (data.length === 0) {
    alert("אין נתונים לייצוא");
    return;
  }

  const doc = new jsPDF({ orientation, unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  const headerKeys = Object.keys(headers);
  const headerLabels = Object.values(headers);

  drawHeader(doc, pageW, title, subtitle);

  const rows = data.map(row =>
    headerKeys.map(key => {
      const val = row[key];
      if (val === null || val === undefined) return "";
      if (typeof val === "number") return val.toLocaleString("he-IL");
      return String(val);
    })
  );

  const processedHeaders = headerLabels.map(label => {
    if (/[\u0590-\u05FF]/.test(label)) return reverseHebrew(label);
    return label;
  });

  const processedRows = rows.map(row =>
    row.map(cell => {
      if (/[\u0590-\u05FF]/.test(cell)) return reverseHebrew(cell);
      return cell;
    })
  );

  autoTable(doc, {
    head: [processedHeaders],
    body: processedRows,
    startY: 42,
    styles: {
      fontSize: 8,
      cellPadding: 2.5,
      overflow: "linebreak",
      halign: "right",
      font: "helvetica",
    },
    headStyles: {
      fillColor: COLORS.primary,
      textColor: 255,
      fontStyle: "bold",
      halign: "center",
      fontSize: 8.5,
    },
    alternateRowStyles: { fillColor: COLORS.lightGray },
    bodyStyles: { textColor: COLORS.dark },
    margin: { left: 10, right: 10, bottom: 25 },
    tableLineColor: [200, 200, 200],
    tableLineWidth: 0.1,
    didDrawPage: (hookData: any) => {
      drawFooter(doc, pageW, pageH, hookData.pageNumber, footerNote);
    },
  });

  const dateStr = new Date().toISOString().split("T")[0];
  const safeName = (filename || title.replace(/[^a-zA-Z0-9\u0590-\u05FF ]/g, "")).replace(/ /g, "_");
  doc.save(`${safeName}_${dateStr}.pdf`);
}

function drawHeader(doc: jsPDF, pageW: number, title: string, subtitle?: string) {
  doc.setFillColor(...COLORS.dark);
  doc.rect(0, 0, pageW, 38, "F");

  drawLogo(doc, pageW - 22, 4, 14);

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(COMPANY.nameEn, pageW - 40, 12, { align: "right" });

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(180, 200, 230);
  doc.text(COMPANY.tagline, pageW - 40, 17, { align: "right" });

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");

  const processedTitle = /[\u0590-\u05FF]/.test(title) ? reverseHebrew(title) : title;
  doc.text(processedTitle, 14, 12);

  if (subtitle) {
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(180, 200, 230);
    const processedSub = /[\u0590-\u05FF]/.test(subtitle) ? reverseHebrew(subtitle) : subtitle;
    doc.text(processedSub, 14, 17);
  }

  doc.setFontSize(8);
  doc.setTextColor(150, 170, 200);
  const dateStr = new Date().toLocaleDateString("he-IL");
  const timeStr = new Date().toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
  doc.text(`${dateStr} | ${timeStr}`, 14, 24);

  doc.setTextColor(150, 170, 200);
  doc.text(`Tax ID: ${COMPANY.taxId}`, pageW - 14, 24, { align: "right" });

  doc.setDrawColor(59, 130, 246);
  doc.setLineWidth(0.8);
  doc.line(10, 33, pageW - 10, 33);

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.1);
  doc.setFillColor(59, 130, 246);
  doc.rect(10, 34, 30, 3, "F");
}

function drawFooter(doc: jsPDF, pageW: number, pageH: number, pageNum: number, footerNote?: string) {
  const y = pageH - 12;

  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.line(10, y, pageW - 10, y);

  doc.setFontSize(7);
  doc.setTextColor(...COLORS.gray);
  doc.setFont("helvetica", "normal");

  doc.text(`${COMPANY.nameEn} | ERP System`, 14, y + 5);

  if (footerNote) {
    const pNote = /[\u0590-\u05FF]/.test(footerNote) ? reverseHebrew(footerNote) : footerNote;
    doc.text(pNote, pageW / 2, y + 5, { align: "center" });
  }

  doc.text(`Page ${pageNum}`, pageW - 14, y + 5, { align: "right" });

  doc.setFontSize(6);
  doc.text(`Generated: ${new Date().toISOString()}`, 14, y + 8);
}

export function exportScreenToPDF(elementId: string, title: string) {
  const element = document.getElementById(elementId);
  if (!element) return;

  const printWindow = window.open("", "_blank");
  if (!printWindow) return;

  printWindow.document.write(`
    <!DOCTYPE html>
    <html dir="rtl" lang="he">
    <head>
      <meta charset="utf-8">
      <title>${title}</title>
      <style>
        @page { size: A4 landscape; margin: 15mm; }
        body { font-family: Arial, sans-serif; direction: rtl; color: #1e293b; }
        .pdf-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #1e40af; padding-bottom: 10px; margin-bottom: 20px; }
        .pdf-logo { display: flex; align-items: center; gap: 12px; }
        .pdf-logo-icon { width: 40px; height: 40px; background: #1e40af; border-radius: 6px; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 14px; }
        .pdf-company { font-size: 18px; font-weight: bold; color: #1e40af; }
        .pdf-company-sub { font-size: 10px; color: #64748b; }
        .pdf-title { font-size: 16px; font-weight: bold; }
        .pdf-date { font-size: 10px; color: #64748b; }
        .pdf-footer { margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 8px; font-size: 9px; color: #94a3b8; display: flex; justify-content: space-between; }
        table { width: 100%; border-collapse: collapse; font-size: 11px; }
        th { background: #1e40af; color: white; padding: 6px 8px; text-align: right; font-size: 10px; }
        td { padding: 5px 8px; border-bottom: 1px solid #e2e8f0; text-align: right; }
        tr:nth-child(even) { background: #f8fafc; }
        @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
      </style>
    </head>
    <body>
      <div class="pdf-header">
        <div>
          <div class="pdf-title">${title}</div>
          <div class="pdf-date">${new Date().toLocaleDateString("he-IL")} | ${new Date().toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}</div>
        </div>
        <div class="pdf-logo">
          <div>
            <div class="pdf-company">טכנו-כל עוזי</div>
            <div class="pdf-company-sub">TECHNO-KOL UZI | ח.פ ${COMPANY.taxId}</div>
          </div>
          <div class="pdf-logo-icon">TK</div>
        </div>
      </div>
      ${element.innerHTML}
      <div class="pdf-footer">
        <span>TECHNO-KOL UZI | ERP System</span>
        <span>${new Date().toISOString()}</span>
      </div>
    </body>
    </html>
  `);
  printWindow.document.close();
  setTimeout(() => {
    printWindow.print();
  }, 500);
}
