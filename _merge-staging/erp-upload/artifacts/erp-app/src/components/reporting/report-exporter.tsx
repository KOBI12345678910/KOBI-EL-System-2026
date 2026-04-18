import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Loader, FileJson, File } from 'lucide-react';

export default function ReportExporter({ data, reportName }) {
  const [exporting, setExporting] = useState(null);

  const exportCSV = () => {
    try {
      setExporting('csv');
      if (!data || data.length === 0) return;

      const headers = Object.keys(data[0]);
      const csv = [
        headers.join(','),
        ...data.map(row =>
          headers.map(h => {
            const val = row[h];
            return typeof val === 'string' && val.includes(',') ? `"${val}"` : val;
          }).join(',')
        )
      ].join('\n');

      const blob = new Blob([csv], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${reportName || 'report'}-${Date.now()}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    } finally {
      setExporting(null);
    }
  };

  const exportJSON = () => {
    try {
      setExporting('json');
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${reportName || 'report'}-${Date.now()}.json`;
      a.click();
      window.URL.revokeObjectURL(url);
    } finally {
      setExporting(null);
    }
  };

  const exportPDF = async () => {
    try {
      setExporting('pdf');
      const { jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');

      const doc = new jsPDF();
      doc.text(reportName || 'Report', 14, 15);

      if (data && data.length > 0) {
        const headers = Object.keys(data[0]);
        const rows = data.map(item => headers.map(h => item[h]));

        autoTable(doc, {
          head: [headers],
          body: rows,
          startY: 25,
          theme: 'grid',
          margin: 10
        });
      }

      doc.save(`${reportName || 'report'}-${Date.now()}.pdf`);
    } catch (error) {
      console.error('Error exporting PDF:', error);
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="flex gap-2">
      <Button
        onClick={exportCSV}
        disabled={exporting !== null}
        variant="outline"
        size="sm"
        className="text-xs"
      >
        {exporting === 'csv' ? <Loader className="w-3 h-3 animate-spin mr-1" /> : <Download className="w-3 h-3 mr-1" />}
        CSV
      </Button>
      <Button
        onClick={exportJSON}
        disabled={exporting !== null}
        variant="outline"
        size="sm"
        className="text-xs"
      >
        {exporting === 'json' ? <Loader className="w-3 h-3 animate-spin mr-1" /> : <FileJson className="w-3 h-3 mr-1" />}
        JSON
      </Button>
      <Button
        onClick={exportPDF}
        disabled={exporting !== null}
        variant="outline"
        size="sm"
        className="text-xs"
      >
        {exporting === 'pdf' ? <Loader className="w-3 h-3 animate-spin mr-1" /> : <File className="w-3 h-3 mr-1" />}
        PDF
      </Button>
    </div>
  );
}