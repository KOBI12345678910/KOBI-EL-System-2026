import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { entityFilter, entityCreate } from '@/lib/entity-api';
import { authFetch } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Upload, ExternalLink, FolderOpen } from 'lucide-react';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';

/* ─── Types ─── */

interface LeadDocument {
  id: number | string;
  lead_id: number | string;
  file_url: string;
  file_name: string;
  file_type: string;
  tag?: string;
  source?: string;
  uploaded_by?: string;
  created_date: string;
}

interface LeadDocumentsTabProps {
  leadId: number | string;
  documents?: LeadDocument[];
}

type DocTag = 'הצעת_מחיר' | 'חוזה' | 'תוכנית' | 'תמונה' | 'חשבונית' | 'אחר';

export default function LeadDocumentsTab({ leadId, documents }: LeadDocumentsTabProps) {
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [tag, setTag] = useState<DocTag>('אחר');
  const queryClient = useQueryClient();

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ['documents', leadId],
    queryFn: () => entityFilter<LeadDocument>("lead-documents", { lead_id: leadId }),
    initialData: documents || []
  });

  const uploadMutation = useMutation({
    mutationFn: async (data: { file: File; tag: string }) => {
      // Upload file via FormData
      const formData = new FormData();
      formData.append('file', data.file);
      const uploadRes = await authFetch("/api/upload", { method: "POST", body: formData });
      const { file_url } = await uploadRes.json() as { file_url: string };

      return entityCreate<LeadDocument>("lead-documents", {
        lead_id: leadId,
        file_url,
        file_name: data.file.name,
        file_type: data.file.type,
        tag: data.tag,
        source: 'manual'
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents', leadId] });
      setFile(null);
      setTag('אחר');
    }
  });

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    try {
      await uploadMutation.mutateAsync({ file, tag });
    } finally {
      setUploading(false);
    }
  };

  const tagColors: Record<string, string> = {
    'הצעת_מחיר': 'bg-blue-100 text-blue-800 border-blue-200',
    'חוזה': 'bg-green-100 text-green-800 border-green-200',
    'תוכנית': 'bg-purple-100 text-purple-800 border-purple-200',
    'תמונה': 'bg-pink-100 text-pink-800 border-pink-200',
    'חשבונית': 'bg-orange-100 text-orange-800 border-orange-200',
    'אחר': 'bg-slate-100 text-slate-800 border-slate-200'
  };

  const sourceLabels: Record<string, string> = {
    manual: 'הועלה ידנית',
    gmail: 'מ-Gmail',
    whatsapp: 'מ-WhatsApp',
    system: 'מערכת'
  };

  if (isLoading) return <div className="p-6">טוען מסמכים...</div>;

  return (
    <div className="space-y-6">
      {/* Upload Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Upload className="w-5 h-5" />
            העלאת מסמך חדש
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>בחר קובץ</Label>
              <Input
                type="file"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>
            <div>
              <Label>סוג מסמך</Label>
              <Select value={tag} onValueChange={(v) => setTag(v as DocTag)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="הצעת_מחיר">הצעת מחיר</SelectItem>
                  <SelectItem value="חוזה">חוזה</SelectItem>
                  <SelectItem value="תוכנית">תוכנית</SelectItem>
                  <SelectItem value="תמונה">תמונה</SelectItem>
                  <SelectItem value="חשבונית">חשבונית</SelectItem>
                  <SelectItem value="אחר">אחר</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button
            onClick={handleUpload}
            disabled={!file || uploading}
            className="w-full"
          >
            <Upload className="w-4 h-4 mr-2" />
            {uploading ? 'מעלה...' : 'העלה מסמך'}
          </Button>
        </CardContent>
      </Card>

      {/* Documents List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <FolderOpen className="w-5 h-5" />
            מסמכים ({docs.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {docs.length === 0 ? (
            <div className="py-12 text-center text-slate-500">
              אין מסמכים עדיין
            </div>
          ) : (
            <div className="space-y-3">
              {docs.map(doc => (
                <div key={doc.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0">
                      <FileText className="w-6 h-6 text-indigo-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-medium truncate">{doc.file_name}</p>
                        {doc.tag && (
                          <Badge className={`${tagColors[doc.tag] ?? ''} border text-xs`}>
                            {doc.tag.replace('_', ' ')}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-500">
                        <span>{format(new Date(doc.created_date), 'dd/MM/yyyy HH:mm', {locale: he})}</span>
                        <span>&#x2022;</span>
                        <span>{sourceLabels[doc.source ?? ''] || doc.source}</span>
                        {doc.uploaded_by && (
                          <>
                            <span>&#x2022;</span>
                            <span>{doc.uploaded_by}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    asChild
                  >
                    <a href={doc.file_url} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
