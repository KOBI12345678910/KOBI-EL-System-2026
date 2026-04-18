export default function ExportButtons({ csvUrl, pdfUrl, label = 'ייצוא' }) {
  function downloadCSV() {
    window.open(csvUrl, '_blank');
  }

  function openPDF() {
    const win = window.open(pdfUrl, '_blank');
    // Auto-trigger print dialog for PDF save
    if (win) {
      win.addEventListener('load', () => {
        setTimeout(() => win.print(), 500);
      });
    }
  }

  return (
    <div className="flex gap-2">
      {csvUrl && (
        <button onClick={downloadCSV} className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 text-xs font-medium border border-green-200">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          CSV
        </button>
      )}
      {pdfUrl && (
        <button onClick={openPDF} className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 text-xs font-medium border border-red-200">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
          PDF
        </button>
      )}
    </div>
  );
}
