function m(n){const t=window.open("","_blank");if(!t)return;const e=document.querySelector("[dir='rtl']");e&&(t.document.write(`
    <!DOCTYPE html>
    <html dir="rtl" lang="he">
    <head>
      <meta charset="UTF-8">
      <title>${n} - טכנו-כל עוזי</title>
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
        <p>${n}</p>
        <div class="print-date">הודפס: ${new Date().toLocaleDateString("he-IL")} ${new Date().toLocaleTimeString("he-IL")}</div>
      </div>
      ${e.innerHTML}
    </body>
    </html>
  `),t.document.close(),setTimeout(()=>{t.print()},500))}function b(n,t,e,r){const d=Object.keys(e),a=Object.values(e),l=t.map(p=>`<tr>${d.map(h=>`<td>${p[h]??""}</td>`).join("")}</tr>`).join(""),c=`
    <html xmlns:o="urn:schemas-microsoft-com:office:office"
          xmlns:w="urn:schemas-microsoft-com:office:word"
          xmlns="http://www.w3.org/TR/REC-html40">
    <head>
      <meta charset="UTF-8">
      <meta name="ProgId" content="Word.Document">
      <meta name="Generator" content="Microsoft Word 15">
      <title>${n} - טכנו-כל עוזי</title>
      <style>
        body { font-family: 'David', 'Arial', sans-serif; direction: rtl; font-size: 11pt; }
        h1 { font-size: 16pt; text-align: center; }
        p { font-size: 10pt; color: #64748b; text-align: center; }
        table { border-collapse: collapse; width: 100%; margin-top: 12pt; }
        th { background: #e2e8f0; font-weight: bold; border: 1pt solid #94a3b8; padding: 4pt 6pt; text-align: right; font-size: 10pt; }
        td { border: 1pt solid #cbd5e1; padding: 3pt 6pt; text-align: right; font-size: 9pt; }
        tr:nth-child(even) { background: #f8fafc; }
        .footer { margin-top: 16pt; font-size: 9pt; color: #94a3b8; text-align: center; }
      </style>
    </head>
    <body>
      <h1>${n} - טכנו-כל עוזי</h1>
      <p>תאריך: ${new Date().toLocaleDateString("he-IL")} | סה"כ: ${t.length} רשומות</p>
      <table>
        <thead><tr>${a.map(p=>`<th>${p}</th>`).join("")}</tr></thead>
        <tbody>${l}</tbody>
      </table>
      <div class="footer">טכנו-כל עוזי 2026 | מערכת ניהול מתכת/ברזל/אלומיניום/זכוכית</div>
    </body>
    </html>
  `,s=new Blob(["\uFEFF"+c],{type:"application/msword;charset=utf-8"}),i=URL.createObjectURL(s),o=document.createElement("a");o.href=i,o.download=`${r}.doc`,document.body.appendChild(o),o.click(),document.body.removeChild(o),URL.revokeObjectURL(i)}function f(n,t){const e=`mailto:?subject=${encodeURIComponent(n)}&body=${encodeURIComponent(t)}`;window.open(e,"_blank")}function g(n,t,e){const r=Object.keys(e),d=Object.values(e);let a=`${n} - טכנו-כל עוזי 2026
`;return a+=`תאריך: ${new Date().toLocaleDateString("he-IL")}
`,a+=`סה"כ רשומות: ${t.length}

`,t.slice(0,20).forEach((l,c)=>{a+=`--- רשומה ${c+1} ---
`,r.forEach((s,i)=>{const o=l[s];o!=null&&o!==""&&(a+=`${d[i]}: ${o}
`)}),a+=`
`}),t.length>20&&(a+=`... ועוד ${t.length-20} רשומות
`),a}export{b as e,g,m as p,f as s};
