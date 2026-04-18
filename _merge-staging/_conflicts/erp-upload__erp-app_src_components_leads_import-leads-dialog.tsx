import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { FileSpreadsheet, Globe, Upload, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { authFetch } from '@/lib/utils';

interface ImportLeadsDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function ImportLeadsDialog({ open, onClose, onSuccess }: ImportLeadsDialogProps) {
  const [importMethod, setImportMethod] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [googleSheetsUrl, setGoogleSheetsUrl] = useState('');
  const [facebookPageId, setFacebookPageId] = useState('');

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    try {
      toast.loading('Uploading file...');
      const formData = new FormData();
      formData.append('file', file);
      const uploadRes = await authFetch("/api/upload", { method: "POST", body: formData });
      const { file_url } = await uploadRes.json();

      toast.loading('Processing data...');
      const extractRes = await authFetch("/api/ai/extract-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file_url })
      });
      const result = await extractRes.json();

      if (result.status === 'success' && result.output) {
        toast.loading('Saving leads...');
        // Bulk create via API
        await authFetch("/api/entities/leads/bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: Array.isArray(result.output) ? result.output : [result.output] })
        });
        toast.success(`Leads imported successfully!`);
        onSuccess?.();
        onClose();
      } else {
        toast.error('Error processing file');
      }
    } catch (error: any) {
      toast.error('Import error: ' + error.message);
    } finally {
      setImporting(false);
    }
  };

  const handleGoogleSheetsImport = async () => {
    if (!googleSheetsUrl.trim()) {
      toast.error('Please enter a Google Sheets URL');
      return;
    }
    setImporting(true);
    try {
      toast.loading('Connecting to Google Sheets...');
      const match = googleSheetsUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
      if (!match) {
        toast.error('Invalid Google Sheets URL');
        return;
      }
      toast.success('Google Sheets import is not yet implemented in this environment');
      onClose();
    } catch (error: any) {
      toast.error('Import error: ' + error.message);
    } finally {
      setImporting(false);
    }
  };

  const handleFacebookImport = async () => {
    if (!facebookPageId.trim()) {
      toast.error('Please enter a Facebook page ID');
      return;
    }
    setImporting(true);
    try {
      toast.loading('Connecting to Facebook...');
      toast.success('Facebook import is not yet implemented in this environment');
      onClose();
    } catch (error: any) {
      toast.error('Import error: ' + error.message);
    } finally {
      setImporting(false);
    }
  };

  const importOptions = [
    { id: 'file', title: 'File (CSV, Excel, JSON)', icon: FileSpreadsheet, color: 'from-green-500 to-emerald-600', description: 'Upload a CSV, Excel or JSON file' },
    { id: 'google_sheets', title: 'Google Sheets', icon: FileSpreadsheet, color: 'from-blue-500 to-cyan-600', description: 'Import directly from Google Sheets' },
    { id: 'facebook', title: 'Facebook Leads', icon: Globe, color: 'from-blue-600 to-indigo-700', description: 'Import leads from Facebook' },
    { id: 'linkedin', title: 'LinkedIn', icon: Globe, color: 'from-indigo-500 to-blue-600', description: 'Import leads from LinkedIn' }
  ];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">Import Leads</DialogTitle>
          <p className="text-sm text-slate-500">Choose a source to import leads</p>
        </DialogHeader>

        {!importMethod ? (
          <div className="grid grid-cols-2 gap-4 py-4">
            {importOptions.map(option => (
              <Card key={option.id} className="cursor-pointer hover:shadow-lg transition-all group" onClick={() => setImportMethod(option.id)}>
                <CardContent className="p-6 text-center">
                  <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${option.color} flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform`}>
                    <option.icon className="w-8 h-8 text-white" />
                  </div>
                  <h3 className="font-semibold text-slate-900 mb-2">{option.title}</h3>
                  <p className="text-xs text-slate-500">{option.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="py-4 space-y-4">
            <Button variant="outline" onClick={() => setImportMethod(null)}>Back to source selection</Button>

            {importMethod === 'file' && (
              <Card>
                <CardContent className="p-6">
                  <div className="space-y-4">
                    <div>
                      <Label>Upload File</Label>
                      <Input type="file" accept=".csv,.xlsx,.xls,.json" onChange={handleFileImport} disabled={importing} className="mt-2" />
                    </div>
                    <div className="text-xs text-slate-500 bg-blue-50 p-3 rounded-lg">
                      <strong>Supported formats:</strong> CSV, Excel, JSON. Required fields: name, phone. Optional: email, company, source, budget.
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {importMethod === 'google_sheets' && (
              <Card>
                <CardContent className="p-6">
                  <div className="space-y-4">
                    <div>
                      <Label>Google Sheets URL</Label>
                      <Input value={googleSheetsUrl} onChange={(e) => setGoogleSheetsUrl(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/..." className="mt-2" disabled={importing} />
                    </div>
                    <Button onClick={handleGoogleSheetsImport} disabled={importing || !googleSheetsUrl.trim()} className="w-full">
                      {importing ? (<><Loader2 className="w-4 h-4 ml-2 animate-spin" />Importing...</>) : (<><FileSpreadsheet className="w-4 h-4 ml-2" />Import from Google Sheets</>)}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {importMethod === 'facebook' && (
              <Card>
                <CardContent className="p-6">
                  <div className="space-y-4">
                    <div>
                      <Label>Facebook Page URL or ID</Label>
                      <Input value={facebookPageId} onChange={(e) => setFacebookPageId(e.target.value)} placeholder="https://facebook.com/yourpage or Page ID" className="mt-2" disabled={importing} />
                    </div>
                    <Button onClick={handleFacebookImport} disabled={importing || !facebookPageId.trim()} className="w-full">
                      {importing ? (<><Loader2 className="w-4 h-4 ml-2 animate-spin" />Importing...</>) : (<><Globe className="w-4 h-4 ml-2" />Import from Facebook</>)}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {importMethod === 'linkedin' && (
              <Card>
                <CardContent className="p-6">
                  <div className="space-y-4">
                    <div className="text-sm text-slate-600 bg-indigo-50 p-4 rounded-lg">
                      <p className="font-semibold mb-2">Import from LinkedIn</p>
                      <p className="text-xs">1. Export your contacts from LinkedIn (Settings - Data Privacy - Get a copy of your data)</p>
                      <p className="text-xs">2. Download the CSV file of contacts</p>
                      <p className="text-xs">3. Upload here or go back and select "File" as import source</p>
                    </div>
                    <Button variant="outline" onClick={() => setImportMethod('file')} className="w-full">
                      <Upload className="w-4 h-4 ml-2" />Upload LinkedIn file
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
