export function printPage(title: string) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    alert("חסימת חלון קופץ זוהתה. אנא אפשר חלונות קופצים עבור אתר זה ונסה שנית.");
    return;
  }
  
  const content = document.querySelector("[dir='rtl']");
  if (!content) return;

  printWindow.document.write(`
    <!DOCTYPE html>
    <html dir="rtl" lang="he">
    <head>
      <meta charset="UTF-8">
      <title>${title} - טכנו-כל עוזי</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Tahoma, sans-serif; direction: rtl; padding: 20px; color: #1e293b; }
        @media print {
          button, .no-print { display: none !important; }
          .shadow-sm, .shadow-md, .shadow-lg, .shadow-2xl { box-shadow: none !important; }
        }
        h1 { font-size: 24px; margin-bottom: 8px; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; }
        th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: right; font-size: 12px; }
        th { background: #f1f5f9; font-weight: 600; }
        .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #334155; padding-bottom: 12px; }
        .header h1 { color: #1e293b; }
        .header p { color: #64748b; font-size: 14px; }
        .print-date { color: #94a3b8; font-size: 11px; margin-top: 4px; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>טכנו-כל עוזי 2026</h1>
        <p>${title}</p>
        <div class="print-date">הודפס: ${new Date().toLocaleDateString("he-IL")} ${new Date().toLocaleTimeString("he-IL")}</div>
      </div>
      ${content.innerHTML}
    </body>
    </html>
  `);
  printWindow.document.close();
  setTimeout(() => { printWindow.print(); }, 500);
}

export function exportToWord(title: string, data: Record<string, unknown>[], headers: Record<string, string>, filename: string) {
  if (data.length === 0) {
    alert("אין נתונים לייצוא. אנא ודא שקיימות רשומות ברשימה.");
    return;
  }

  const headerKeys = Object.keys(headers);
  const headerLabels = Object.values(headers);

  const tableRows = data.map(row =>
    `<tr>${headerKeys.map(k => `<td>${row[k] ?? ""}</td>`).join("")}</tr>`
  ).join("");

  const wordHtml = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office"
          xmlns:w="urn:schemas-microsoft-com:office:word"
          xmlns="http://www.w3.org/TR/REC-html40">
    <head>
      <meta charset="UTF-8">
      <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
      <meta name="ProgId" content="Word.Document">
      <meta name="Generator" content="Microsoft Word 15">
      <title>${title} - טכנו-כל עוזי</title>
      <xml>
        <w:WordDocument>
          <w:View>Print</w:View>
          <w:Zoom>90</w:Zoom>
          <w:DoNotOptimizeForBrowser/>
          <w:BiDi/>
        </w:WordDocument>
      </xml>
      <style>
        body { font-family: 'David', 'Arial', sans-serif; direction: rtl; font-size: 11pt; }
        h1 { font-size: 16pt; text-align: center; }
        p { font-size: 10pt; color: #64748b; text-align: center; }
        table { border-collapse: collapse; width: 100%; margin-top: 12pt; direction: rtl; }
        th { background: #e2e8f0; font-weight: bold; border: 1pt solid #94a3b8; padding: 4pt 6pt; text-align: right; font-size: 10pt; }
        td { border: 1pt solid #cbd5e1; padding: 3pt 6pt; text-align: right; font-size: 9pt; }
        tr:nth-child(even) { background: #f8fafc; }
        .footer { margin-top: 16pt; font-size: 9pt; color: #94a3b8; text-align: center; }
      </style>
    </head>
    <body dir="rtl">
      <h1>${title} - טכנו-כל עוזי</h1>
      <p>תאריך: ${new Date().toLocaleDateString("he-IL")} | סה"כ: ${data.length} רשומות</p>
      <table>
        <thead><tr>${headerLabels.map(h => `<th>${h}</th>`).join("")}</tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
      <div class="footer">טכנו-כל עוזי 2026 | מערכת ניהול מתכת/ברזל/אלומיניום/זכוכית</div>
    </body>
    </html>
  `;

  const blob = new Blob(["\uFEFF" + wordHtml], { type: "application/msword;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.doc`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function sendByEmail(subject: string, body: string) {
  const mailtoUrl = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  const win = window.open(mailtoUrl, "_blank");
  if (win === null) {
    alert("חסימת חלון קופץ זוהתה. אנא אפשר חלונות קופצים עבור אתר זה ונסה שנית.");
  }
}

export function generateEmailBody(title: string, data: Record<string, unknown>[], headers: Record<string, string>): string {
  const headerKeys = Object.keys(headers);
  const headerLabels = Object.values(headers);

  const MAX_RECORDS = 10;
  
  let body = `${title} - טכנו-כל עוזי 2026\n`;
  body += `תאריך: ${new Date().toLocaleDateString("he-IL")}\n`;
  body += `סה"כ רשומות: ${data.length}\n\n`;
  
  data.slice(0, MAX_RECORDS).forEach((row, i) => {
    body += `--- רשומה ${i + 1} ---\n`;
    headerKeys.forEach((key, idx) => {
      const val = row[key];
      if (val !== null && val !== undefined && val !== "") {
        body += `${headerLabels[idx]}: ${val}\n`;
      }
    });
    body += "\n";
  });
  
  if (data.length > MAX_RECORDS) {
    body += `... ועוד ${data.length - MAX_RECORDS} רשומות\n`;
  }
  
  return body;
}

export function shareViaWhatsApp(title: string, data: Record<string, unknown>[], formatRow: (row: Record<string, unknown>) => string) {
  if (data.length === 0) {
    alert("אין נתונים לשיתוף. אנא ודא שקיימות רשומות ברשימה.");
    return;
  }

  const rows = data.slice(0, 10).map(formatRow).join("\n");
  const suffix = data.length > 10 ? `\n... ועוד ${data.length - 10} רשומות` : "";
  const msg = `${title}\n${rows}${suffix}`;
  const win = window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
  if (win === null) {
    alert("חסימת חלון קופץ זוהתה. אנא אפשר חלונות קופצים עבור אתר זה ונסה שנית.");
  }
}
