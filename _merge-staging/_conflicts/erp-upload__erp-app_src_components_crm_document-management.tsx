import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, Download, Upload, Eye } from "lucide-react";

interface Doc {
  id: number;
  name: string;
  size: string;
  uploaded: string;
  shared: boolean;
}

export default function DocumentManagement() {
  const [docs] = useState<Doc[]>([
    { id: 1, name: "הצעת מחיר - 50K.pdf", size: "2.4 MB", uploaded: "5 ימים", shared: true },
    { id: 2, name: "חוזה - 2026.docx", size: "450 KB", uploaded: "3 ימים", shared: false },
    { id: 3, name: "TOC - דרישות.xlsx", size: "1.2 MB", uploaded: "אתמול", shared: true },
  ]);

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-amber-600" />
          Document Management
        </CardTitle>
        <Button size="sm" className="bg-amber-600">
          <Upload className="w-4 h-4 ml-1" />
          Upload
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {docs.map((doc) => (
          <div
            key={doc.id}
            className="p-3 border border-slate-200 rounded-lg flex items-center justify-between hover:bg-slate-50"
          >
            <div className="flex items-center gap-3 flex-1">
              <FileText className="w-5 h-5 text-amber-600" />
              <div>
                <p className="font-medium text-slate-900 text-sm">{doc.name}</p>
                <p className="text-xs text-slate-500">
                  {doc.size} - {doc.uploaded}
                </p>
              </div>
            </div>
            <div className="flex gap-1">
              {doc.shared && (
                <Badge className="bg-blue-100 text-blue-700 text-xs">shared</Badge>
              )}
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <Eye className="w-4 h-4 text-slate-600" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <Download className="w-4 h-4 text-slate-600" />
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
