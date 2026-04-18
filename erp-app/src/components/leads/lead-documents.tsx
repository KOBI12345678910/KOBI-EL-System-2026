import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { entityFilter, entityCreate, entityDelete } from '@/lib/entity-api';
import { authJson, authFetch } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, FileText, Download, Trash2, Image, File } from 'lucide-react';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';

interface LeadDocumentsProps {
  leadId: string;
}

export default function LeadDocuments({ leadId }: LeadDocumentsProps) {
  const [file, setFile] = useState<File | null>(null);
  const [tag, setTag] = useState('other');
  const [uploading, setUploading] = useState(false);
  const queryClient = useQueryClient();

  const { data: documents = [], isLoading } = useQuery({
    queryKey: ['lead-documents', leadId],
    queryFn: () => entityFilter<any>("lead-documents", { lead_id: leadId })
  });

  const deleteDocMutation = useMutation({
    mutationFn: (id: string) => entityDelete("lead-documents", id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead-documents', leadId] });
    }
  });

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setUploading(true);
    try {
      const user = await authJson("/api/auth/me");

      // Upload file
      const formDataUpload = new FormData();
      formDataUpload.append("file", file);
      const uploadResult = await authFetch("/api/upload", {
        method: "POST",
        body: formDataUpload,
      });
      const { file_url } = await uploadResult.json();

      // Create document record
      await entityCreate("lead-documents", {
        lead_id: leadId,
        file_url,
        file_name: file.name,
        file_type: file.type,
        tag,
        source: 'manual',
        uploaded_by: user?.email
      });

      // Create activity
      await entityCreate("lead-activities", {
        lead_id: leadId,
        type: 'document_upload',
        description: `Document uploaded: ${file.name}`
      });

      queryClient.invalidateQueries({ queryKey: ['lead-documents', leadId] });
      queryClient.invalidateQueries({ queryKey: ['lead-activities', leadId] });

      setFile(null);
      setTag('other');
    } catch (error) {
      console.error('Upload failed:', error);
    } finally {
      setUploading(false);
    }
  };

  const tagColors: Record<string, string> = {
    'quote': 'bg-blue-100 text-blue-800',
    'contract': 'bg-green-100 text-green-800',
    'plan': 'bg-purple-100 text-purple-800',
    'image': 'bg-pink-100 text-pink-800',
    'invoice': 'bg-yellow-100 text-yellow-800',
    'other': 'bg-slate-100 text-slate-800'
  };

  const sourceIcons: Record<string, any> = {
    manual: Upload,
    gmail: FileText,
    whatsapp: FileText,
    system: FileText
  };

  const getFileIcon = (fileType?: string) => {
    if (fileType?.startsWith('image/')) return Image;
    return File;
  };

  // Group by tag
  const groupedDocs = documents.reduce((acc: Record<string, any[]>, doc: any) => {
    const docTag = doc.tag || 'other';
    if (!acc[docTag]) acc[docTag] = [];
    acc[docTag].push(doc);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {/* Upload Form */}
      <Card>
        <CardHeader>
          <CardTitle>Upload New Document</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleUpload} className="space-y-4">
            <div>
              <Label>Document Type</Label>
              <Select value={tag} onValueChange={setTag}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="quote">Quote</SelectItem>
                  <SelectItem value="contract">Contract</SelectItem>
                  <SelectItem value="plan">Plan</SelectItem>
                  <SelectItem value="image">Image</SelectItem>
                  <SelectItem value="invoice">Invoice</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Select File</Label>
              <Input
                type="file"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                required
                data-test="upload-button"
              />
            </div>
            <Button type="submit" disabled={!file || uploading}>
              <Upload className="w-4 h-4 mr-2" />
              {uploading ? 'Uploading...' : 'Upload Document'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Documents List */}
      <div className="space-y-6">
        {Object.entries(groupedDocs).map(([docTag, docs]) => (
          <div key={docTag}>
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <Badge className={tagColors[docTag] || tagColors['other']}>
                {docTag} ({(docs as any[]).length})
              </Badge>
            </h3>
            <div className="grid gap-3">
              {(docs as any[]).map((doc: any) => {
                const FileIcon = getFileIcon(doc.file_type);
                const SourceIcon = sourceIcons[doc.source] || Upload;

                return (
                  <Card key={doc.id}>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-slate-100 rounded-lg">
                          <FileIcon className="w-5 h-5 text-slate-600" />
                        </div>

                        <div className="flex-1">
                          <div className="font-medium text-slate-900">{doc.file_name}</div>
                          <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                            <span className="flex items-center gap-1">
                              <SourceIcon className="w-3 h-3" />
                              {doc.source}
                            </span>
                            <span>
                              {format(new Date(doc.created_date), 'dd/MM/yyyy HH:mm', { locale: he })}
                            </span>
                            <span>{doc.uploaded_by}</span>
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="icon"
                            asChild
                          >
                            <a href={doc.file_url} target="_blank" rel="noopener noreferrer">
                              <Download className="w-4 h-4" />
                            </a>
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => deleteDocMutation.mutate(doc.id)}
                            className="text-red-600"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {documents.length === 0 && !isLoading && (
        <Card>
          <CardContent className="p-8 text-center text-slate-500">
            No documents yet
          </CardContent>
        </Card>
      )}
    </div>
  );
}
