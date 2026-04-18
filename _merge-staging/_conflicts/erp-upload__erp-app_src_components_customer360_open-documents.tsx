import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, Download, Eye, Share2, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';

export default function OpenDocuments({ documents }) {
  const getFileIcon = (type) => {
    if (type.includes('pdf')) return '📄';
    if (type.includes('doc')) return '📝';
    if (type.includes('sheet')) return '📊';
    if (type.includes('image')) return '🖼️';
    return '📎';
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-indigo-600" />
          Open Documents ({documents.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {documents.length === 0 ? (
          <p className="text-slate-500 text-sm text-center py-4">No documents</p>
        ) : (
          documents.map(doc => (
            <div key={doc.id} className="p-3 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3 flex-1">
                  <span className="text-xl">{getFileIcon(doc.type)}</span>
                  <div className="flex-1">
                    <p className="font-medium text-slate-900 text-sm">{doc.name}</p>
                    <div className="flex gap-2 mt-1">
                      <Badge variant="outline" className="text-xs">{doc.type}</Badge>
                      <span className="text-xs text-slate-500">
                        {format(new Date(doc.created_date), 'dd MMM yyyy', { locale: he })}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <Eye className="w-4 h-4 text-slate-600" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <Download className="w-4 h-4 text-slate-600" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <Share2 className="w-4 h-4 text-slate-600" />
                  </Button>
                </div>
              </div>
              {doc.status && (
                <Badge className={doc.status === 'pending' ? 'bg-amber-100 text-amber-700 mt-2' : 'bg-emerald-100 text-emerald-700 mt-2'} className="text-xs mt-2">
                  {doc.status}
                </Badge>
              )}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}