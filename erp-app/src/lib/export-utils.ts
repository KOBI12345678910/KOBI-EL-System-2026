import * as XLSX from "xlsx";
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

export function exportToExcel(data: Record<string, any>[], headers: Record<string, string>, filename: string) {
  if (data.length === 0) {
    alert("אין נתונים לייצוא");
    return;
  }

  const headerKeys = Object.keys(headers);
  const headerLabels = Object.values(headers);
  const dateStr = new Date().toISOString().split("T")[0];
  const dateHe = new Date().toLocaleDateString("he-IL");
  const colCount = headerLabels.length;

  const companyRow: Record<string, any> = {};
  headerLabels.forEach((label, i) => { companyRow[label] = i === 0 ? "טכנו-כל עוזי | TECHNO-KOL UZI" : ""; });

  const metaRow: Record<string, any> = {};
  headerLabels.forEach((label, i) => { metaRow[label] = i === 0 ? `ח.פ 054227129 | ${filename} | ${dateHe} | סה"כ: ${data.length} רשומות` : ""; });

  const emptyRow: Record<string, any> = {};
  headerLabels.forEach(label => { emptyRow[label] = ""; });

  const dataRows = data.map(row =>
    headerKeys.reduce<Record<string, any>>((acc, key, i) => {
      acc[headerLabels[i]] = row[key] ?? "";
      return acc;
    }, {})
  );

  const allRows = [companyRow, metaRow, emptyRow, ...dataRows];

  const worksheet = XLSX.utils.json_to_sheet(allRows, { header: headerLabels, skipHeader: false });

  if (colCount > 0) {
    const merge = [
      { s: { r: 1, c: 0 }, e: { r: 1, c: colCount - 1 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: colCount - 1 } },
    ];
    worksheet["!merges"] = merge;
  }

  const colWidths = headerLabels.map(label => ({ wch: Math.max(label.length * 2, 12) }));
  worksheet["!cols"] = colWidths;

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "נתונים");
  XLSX.writeFile(workbook, `${filename}_${dateStr}.xlsx`);
}

export function exportToPDF(data: Record<string, any>[], headers: Record<string, string>, filename: string) {
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
