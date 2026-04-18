import ExcelJS from "exceljs";
import { exportTableToPDF } from "./pdf-export";

export type ExportFormat = "csv" | "excel" | "pdf";

export { exportTableToPDF };

export function exportToCSV(data: Record<string, any>[], headers: Record<string, string>, filename: string) {
  if (data.length === 0) {
    alert("אין נתונים לייצוא");
    return;
  }

  const headerKeys = Object.keys(headers);
  const headerLabels = Object.values(headers);

  const BOM = "\uFEFF";
  let csv = BOM;
  csv += headerLabels.join(",") + "\n";

  data.forEach(row => {
    const values = headerKeys.map(key => {
      let val = row[key];
      if (val === null || val === undefined) val = "";
      val = String(val).replace(/"/g, '""');
      if (val.includes(",") || val.includes('"') || val.includes("\n")) {
        val = `"${val}"`;
      }
      return val;
    });
    csv += values.join(",") + "\n";
  });

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename}_${new Date().toISOString().split("T")[0]}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export async function exportToExcel(data: Record<string, any>[], headers: Record<string, string>, filename: string, options?: { rtl?: boolean }) {
  if (data.length === 0) {
    alert("אין נתונים לייצוא");
    return;
  }

  const headerKeys = Object.keys(headers);
  const headerLabels = Object.values(headers);
  const dateStr = new Date().toISOString().split("T")[0];
  const dateHe = new Date().toLocaleDateString("he-IL");
  const colCount = headerLabels.length;

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("נתונים");

  ws.views = [{ rightToLeft: options?.rtl !== false }];

  ws.addRow(headerLabels.map((_, i) => i === 0 ? "טכנו-כל עוזי | TECHNO-KOL UZI" : ""));
  ws.addRow(headerLabels.map((_, i) => i === 0 ? `ח.פ 054227129 | ${filename} | ${dateHe} | סה"כ: ${data.length} רשומות` : ""));
  ws.addRow(headerLabels.map(() => ""));
  ws.addRow(headerLabels);
  data.forEach(row => {
    ws.addRow(headerKeys.map(key => row[key] ?? ""));
  });

  if (colCount > 1) {
    ws.mergeCells(1, 1, 1, colCount);
    ws.mergeCells(2, 1, 2, colCount);
  }

  const headerRow = ws.getRow(4);
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E40AF" } };
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };

  const companyRow = ws.getRow(1);
  companyRow.font = { bold: true, size: 13 };

  headerLabels.forEach((label, i) => {
    ws.getColumn(i + 1).width = Math.max(label.length * 2, 14);
  });

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename}_${dateStr}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportToPDF(data: Record<string, any>[], headers: Record<string, string>, filename: string) {
  if (data.length === 0) {
    alert("אין נתונים לייצוא");
    return;
  }
  import("./pdf-export").then(({ exportTableToPDF }) => {
    exportTableToPDF({ title: filename, data, headers, filename });
  });
}

export function exportData(
  format: ExportFormat,
  data: Record<string, any>[],
  headers: Record<string, string>,
  filename: string
) {
  if (format === "excel") return exportToExcel(data, headers, filename);
  if (format === "pdf") return exportToPDF(data, headers, filename);
  return exportToCSV(data, headers, filename);
}

export function importFromCSV(file: File): Promise<Record<string, any>[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const csv = e.target?.result as string;
        const lines = csv.split('\n').filter(l => l.trim());
        if (lines.length < 2) {
          reject(new Error("קובץ CSV ריק או בעל שורה אחת בלבד"));
          return;
        }

        const headers = lines[0].split(',').map(h => h.trim());
        const data = lines.slice(1).map(line => {
          const values = line.split(',').map(v => v.trim());
          const row: Record<string, any> = {};
          headers.forEach((header, i) => {
            row[header] = values[i] ?? "";
          });
          return row;
        });
        resolve(data);
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = () => reject(new Error("שגיאה בקריאת הקובץ"));
    reader.readAsText(file);
  });
}
