import{ao as N,j as e,au as P,B as w,r as i}from"./index-Nxfjvncj.js";import{S as x,a as m,b as h,c as b,d as p}from"./select-CCeoYsg4.js";import{I as y}from"./input-4iT6XKy3.js";import{P as k}from"./printer-Bo0o0xNE.js";/**
 * @license lucide-react v0.474.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const D=[["path",{d:"M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z",key:"1rqfz7"}],["path",{d:"M14 2v4a2 2 0 0 0 2 2h4",key:"tnqrlb"}],["path",{d:"M12 18v-6",key:"17g6i2"}],["path",{d:"m9 15 3 3 3-3",key:"1npd3o"}]],I=N("FileDown",D),z=[{value:"day",label:"יומי"},{value:"week",label:"שבועי"},{value:"month",label:"חודשי"},{value:"quarter",label:"רבעוני"},{value:"year",label:"שנתי"},{value:"custom",label:"טווח מותאם"}],O=[{value:"1",label:"ינואר"},{value:"2",label:"פברואר"},{value:"3",label:"מרץ"},{value:"4",label:"אפריל"},{value:"5",label:"מאי"},{value:"6",label:"יוני"},{value:"7",label:"יולי"},{value:"8",label:"אוגוסט"},{value:"9",label:"ספטמבר"},{value:"10",label:"אוקטובר"},{value:"11",label:"נובמבר"},{value:"12",label:"דצמבר"}];function T(){const s=new Date,[a,l]=i.useState("year"),[c,g]=i.useState(String(s.getFullYear())),[d,v]=i.useState(String(s.getMonth()+1)),[r,f]=i.useState(String(Math.ceil((s.getMonth()+1)/3))),[n,j]=i.useState(s.toISOString().slice(0,10)),[o,S]=i.useState(s.toISOString().slice(0,10));function u(){const t=new URLSearchParams;return a==="custom"?(t.set("startDate",n),t.set("endDate",o)):(t.set("period",a),t.set("year",c),a==="month"&&t.set("month",d),a==="quarter"&&t.set("quarter",r)),t.toString()}return{period:a,setPeriod:l,year:c,setYear:g,month:d,setMonth:v,quarter:r,setQuarter:f,customStart:n,setCustomStart:j,customEnd:o,setCustomEnd:S,buildQueryParams:u,queryKey:[a,c,d,r,n,o]}}function V(s){const a=window.open("","_blank");if(!a)return;const l=document.querySelector("[data-report-content]");l&&(a.document.write(`
    <!DOCTYPE html>
    <html dir="rtl" lang="he">
    <head>
      <meta charset="utf-8">
      <title>${s}</title>
      <style>
        body { font-family: Arial, sans-serif; direction: rtl; padding: 20px; color: #000; background: #fff; }
        h1 { font-size: 20px; margin-bottom: 16px; border-bottom: 2px solid #333; padding-bottom: 8px; }
        table { width: 100%; border-collapse: collapse; margin: 12px 0; }
        th, td { padding: 8px 12px; border: 1px solid #ddd; text-align: right; font-size: 12px; }
        th { background: #f5f5f5; font-weight: bold; }
        .stat-card { display: inline-block; padding: 12px 20px; margin: 4px; border: 1px solid #ddd; border-radius: 8px; min-width: 120px; text-align: center; }
        .stat-value { font-size: 18px; font-weight: bold; }
        .stat-label { font-size: 11px; color: #666; }
        .section-title { font-size: 16px; font-weight: bold; margin: 20px 0 8px; color: #333; }
        @media print { body { padding: 0; } }
      </style>
    </head>
    <body>
      <h1>${s}</h1>
      <p style="color: #666; font-size: 12px;">הופק בתאריך: ${new Date().toLocaleDateString("he-IL")}</p>
      ${l.innerHTML.replace(/bg-[^ "']+/g,"").replace(/text-[^ "']+/g,"").replace(/border-[^ "']+/g,"")}
    </body>
    </html>
  `),a.document.close(),setTimeout(()=>{a.print()},500))}function E({onExportCSV:s,onExportPDF:a,period:l,onPeriodChange:c,year:g,onYearChange:d,month:v,onMonthChange:r,quarter:f,onQuarterChange:n,customStart:j,onCustomStartChange:o,customEnd:S,onCustomEndChange:u}){return e.jsxs("div",{className:"flex flex-wrap gap-2 items-center",children:[e.jsxs("div",{className:"flex items-center gap-1 text-xs text-muted-foreground",children:[e.jsx(P,{className:"w-3.5 h-3.5"}),e.jsx("span",{children:"תקופה:"})]}),e.jsxs(x,{value:l,onValueChange:t=>c(t),children:[e.jsx(m,{className:"w-28 h-8 text-xs bg-slate-800 border-slate-700",children:e.jsx(h,{})}),e.jsx(b,{className:"bg-slate-800 border-slate-700",children:z.map(t=>e.jsx(p,{value:t.value,children:t.label},t.value))})]}),(l==="year"||l==="month"||l==="quarter")&&e.jsxs(x,{value:g,onValueChange:d,children:[e.jsx(m,{className:"w-20 h-8 text-xs bg-slate-800 border-slate-700",children:e.jsx(h,{})}),e.jsx(b,{className:"bg-slate-800 border-slate-700",children:[2024,2025,2026].map(t=>e.jsx(p,{value:String(t),children:t},t))})]}),l==="month"&&r&&e.jsxs(x,{value:v||"1",onValueChange:r,children:[e.jsx(m,{className:"w-24 h-8 text-xs bg-slate-800 border-slate-700",children:e.jsx(h,{})}),e.jsx(b,{className:"bg-slate-800 border-slate-700",children:O.map(t=>e.jsx(p,{value:t.value,children:t.label},t.value))})]}),l==="quarter"&&n&&e.jsxs(x,{value:f||"1",onValueChange:n,children:[e.jsx(m,{className:"w-20 h-8 text-xs bg-slate-800 border-slate-700",children:e.jsx(h,{})}),e.jsx(b,{className:"bg-slate-800 border-slate-700",children:[1,2,3,4].map(t=>e.jsxs(p,{value:String(t),children:["Q",t]},t))})]}),l==="custom"&&o&&u&&e.jsxs(e.Fragment,{children:[e.jsx(y,{type:"date",value:j,onChange:t=>o(t.target.value),className:"w-36 h-8 text-xs bg-slate-800 border-slate-700"}),e.jsx("span",{className:"text-xs text-muted-foreground",children:"עד"}),e.jsx(y,{type:"date",value:S,onChange:t=>u(t.target.value),className:"w-36 h-8 text-xs bg-slate-800 border-slate-700"})]}),e.jsxs("div",{className:"flex gap-1 mr-auto",children:[e.jsxs(w,{variant:"outline",size:"sm",className:"h-8 text-xs border-slate-600",onClick:s,children:[e.jsx(I,{className:"w-3.5 h-3.5 ml-1"})," CSV"]}),e.jsxs(w,{variant:"outline",size:"sm",className:"h-8 text-xs border-slate-600",onClick:a,children:[e.jsx(k,{className:"w-3.5 h-3.5 ml-1"})," PDF"]})]})]})}export{E as P,V as e,T as u};
