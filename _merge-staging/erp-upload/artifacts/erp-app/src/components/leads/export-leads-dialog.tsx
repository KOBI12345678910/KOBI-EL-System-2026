import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FileSpreadsheet, FileText, FileJson, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface Lead {
  full_name?: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  email?: string;
  company_name?: string;
  source?: string;
  status?: string;
  deal_value?: number;
  created_date?: string;
}

interface ExportLeadsDialogProps {
  open: boolean;
  onClose: () => void;
  leads: Lead[];
}

export default function ExportLeadsDialog({ open, onClose, leads }: ExportLeadsDialogProps) {
  const [exporting, setExporting] = useState(false);

  const handleExport = async (format: string) => {
    setExporting(true);
    try {
      toast.loading('Exporting data...');

      if (format === 'csv') {
        const csvContent = [
          ['Full Name', 'First Name', 'Last Name', 'Phone', 'Email', 'Company', 'Source', 'Status', 'Deal Value', 'Created Date'].join(','),
          ...leads.map(lead => [
            lead.full_name || `${lead.first_name || ''} ${lead.last_name || ''}`,
            lead.first_name || '', lead.last_name || '', lead.phone || '', lead.email || '',
            lead.company_name || '', lead.source || '', lead.status || '', lead.deal_value || 0, lead.created_date || ''
          ].join(','))
        ].join('\n');

        const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `leads_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
        toast.success('CSV exported successfully!');
      } else if (format === 'json') {
        const jsonContent = JSON.stringify(leads, null, 2);
        const blob = new Blob([jsonContent], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `leads_${new Date().toISOString().split('T')[0]}.json`;
        link.click();
        toast.success('JSON exported successfully!');
      } else if (format === 'excel') {
        const csvContent = [
          ['Full Name', 'First Name', 'Last Name', 'Phone', 'Email', 'Company', 'Source', 'Status', 'Deal Value', 'Created Date'].join('\t'),
          ...leads.map(lead => [
            lead.full_name || `${lead.first_name || ''} ${lead.last_name || ''}`,
            lead.first_name || '', lead.last_name || '', lead.phone || '', lead.email || '',
            lead.company_name || '', lead.source || '', lead.status || '', lead.deal_value || 0, lead.created_date || ''
          ].join('\t'))
        ].join('\n');

        const blob = new Blob(['\uFEFF' + csvContent], { type: 'application/vnd.ms-excel' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `leads_${new Date().toISOString().split('T')[0]}.xls`;
        link.click();
        toast.success('Excel exported successfully!');
      }

      onClose();
    } catch (error: any) {
      toast.error('Export error: ' + error.message);
    } finally {
      setExporting(false);
    }
  };

  const exportOptions = [
    { format: 'csv', icon: FileText, title: 'CSV', color: 'from-green-500 to-emerald-600' },
    { format: 'excel', icon: FileSpreadsheet, title: 'Excel', color: 'from-blue-500 to-cyan-600' },
    { format: 'json', icon: FileJson, title: 'JSON', color: 'from-purple-500 to-indigo-600' }
  ];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-2xl">Export Leads</DialogTitle>
          <p className="text-sm text-slate-500">Choose format to export {leads.length} leads</p>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-4 py-4">
          {exportOptions.map(option => (
            <Card key={option.format} className="cursor-pointer hover:shadow-lg transition-all group" onClick={() => handleExport(option.format)}>
              <CardContent className="p-6 text-center">
                <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${option.color} flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform`}>
                  <option.icon className="w-7 h-7 text-white" />
                </div>
                <h3 className="font-semibold text-slate-900">{option.title}</h3>
              </CardContent>
            </Card>
          ))}
        </div>

        {exporting && (
          <div className="text-center py-4">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-blue-600" />
            <p className="text-sm text-slate-600 mt-2">Exporting data...</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
