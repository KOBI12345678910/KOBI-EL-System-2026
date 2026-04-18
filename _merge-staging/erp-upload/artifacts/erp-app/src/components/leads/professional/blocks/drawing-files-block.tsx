import { FileText, Download } from "lucide-react";
import { Button } from "@/components/ui/button";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface DrawingFilesBlockProps {
  block: Record<string, unknown>;
  leadId: string;
  canEdit: boolean;
}

interface DrawingFile {
  name: string;
  size: string;
  uploadedAt: string;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function DrawingFilesBlock({ block, leadId, canEdit }: DrawingFilesBlockProps) {
  const files: DrawingFile[] = [
    { name: "\u05E9\u05E8\u05D8\u05D5\u05D8-\u05DE\u05E2\u05E7\u05D4-\u05E8\u05D0\u05E9\u05D9.pdf", size: "2.4 MB", uploadedAt: "2026-02-05" },
    { name: "\u05EA\u05DB\u05E0\u05D9\u05EA-\u05E9\u05E2\u05E8-\u05DB\u05E0\u05D9\u05E1\u05D4.dwg", size: "1.1 MB", uploadedAt: "2026-02-07" },
  ];

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <FileText className="w-5 h-5 text-indigo-600" />
        <span className="font-medium text-slate-900">\u05E7\u05D1\u05E6\u05D9 \u05E9\u05E8\u05D8\u05D5\u05D8</span>
      </div>

      <div className="space-y-2">
        {files.map((file, idx) => (
          <div
            key={idx}
            className="flex items-center justify-between bg-slate-50 rounded-lg p-3 border border-slate-200"
          >
            <div className="flex items-center gap-3">
              <FileText className="w-5 h-5 text-slate-400" />
              <div>
                <p className="text-sm font-medium text-slate-900">{file.name}</p>
                <p className="text-xs text-slate-500">
                  {file.size} &bull; {file.uploadedAt}
                </p>
              </div>
            </div>
            <Button variant="ghost" size="sm" className="gap-2">
              <Download className="w-4 h-4" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
