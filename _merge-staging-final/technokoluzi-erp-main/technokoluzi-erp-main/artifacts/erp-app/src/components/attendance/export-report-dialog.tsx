import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Download, FileText, Sheet } from 'lucide-react';
import { format } from 'date-fns';
import jsPDF from 'jspdf';

export default function ExportReportDialog({ attendance = [], users = [] }) {
    const [selectedFormat, setSelectedFormat] = useState(null);
    const [reportType, setReportType] = useState('daily');
    const [isLoading, setIsLoading] = useState(false);

    const generateCSV = () => {
        setIsLoading(true);
        try {
            const headers = ['שם', 'אימייל', 'תאריך', 'כניסה', 'יציאה', 'שעות עבודה', 'סטטוס'];
            const rows = attendance.map(record => [
                record.user_name,
                record.user_email,
                record.attendance_date,
                record.check_in_time || '-',
                record.check_out_time || '-',
                record.hours_worked || 0,
                getStatus(record)
            ]);

            const csv = [
                headers.join(','),
                ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
            ].join('\n');

            downloadFile(csv, `attendance-${format(new Date(), 'yyyy-MM-dd')}.csv`, 'text/csv');
        } finally {
            setIsLoading(false);
        }
    };

    const generatePDF = () => {
        setIsLoading(true);
        try {
            const doc = new jsPDF({
                orientation: 'p',
                unit: 'mm',
                format: 'a4'
            });

            doc.setFont('Arial', 'bold');
            doc.text('דוח נוכחות', 10, 15);
            doc.setFontSize(10);
            doc.text(`תאריך: ${format(new Date(), 'dd/MM/yyyy')}`, 10, 22);
            doc.text(`סוג דוח: ${reportType === 'daily' ? 'יומי' : 'חודשי'}`, 10, 28);

            const headers = ['שם', 'כניסה', 'יציאה', 'שעות', 'סטטוס'];
            const rows = attendance.map(record => [
                record.user_name,
                record.check_in_time || '-',
                record.check_out_time || '-',
                record.hours_worked || 0,
                getStatus(record)
            ]);

            let yPos = 35;
            const pageHeight = doc.internal.pageSize.getHeight();
            const rowHeight = 7;

            // Headers
            doc.setFont('Arial', 'bold');
            doc.setFontSize(9);
            const xPositions = [170, 130, 100, 70, 10];
            headers.forEach((header, i) => {
                doc.text(header, xPositions[i], yPos);
            });

            yPos += 5;
            doc.setDrawColor(0);
            doc.line(10, yPos, 190, yPos);
            yPos += 2;

            // Rows
            doc.setFont('Arial', 'normal');
            rows.forEach(row => {
                if (yPos > pageHeight - 10) {
                    doc.addPage();
                    yPos = 10;
                }
                row.forEach((cell, i) => {
                    doc.text(String(cell), xPositions[i], yPos);
                });
                yPos += rowHeight;
            });

            doc.save(`attendance-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
        } finally {
            setIsLoading(false);
        }
    };

    const downloadFile = (content, filename, type) => {
        const element = document.createElement('a');
        element.setAttribute('href', `data:${type};charset=utf-8,${encodeURIComponent(content)}`);
        element.setAttribute('download', filename);
        element.style.display = 'none';
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
    };

    const getStatus = (record) => {
        const [hour] = record.check_in_time?.split(':').map(Number) || [0];
        if (hour > 8) return 'מאחר';
        if (!record.check_out_time) return 'בעבודה';
        return 'הגיע';
    };

    const handleExport = (format) => {
        if (format === 'csv') {
            generateCSV();
        } else if (format === 'pdf') {
            generatePDF();
        }
        setSelectedFormat(null);
    };

    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button className="gap-2 bg-blue-600 hover:bg-blue-700">
                    <Download className="w-4 h-4" />
                    ייצוא דוח
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>ייצוא דוח נוכחות</DialogTitle>
                </DialogHeader>

                <div className="space-y-6">
                    {/* Report Type */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">סוג דוח</label>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setReportType('daily')}
                                className={`flex-1 p-3 rounded-lg border-2 transition-colors ${
                                    reportType === 'daily'
                                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                                        : 'border-slate-200 bg-white text-slate-700'
                                }`}
                            >
                                יומי
                            </button>
                            <button
                                onClick={() => setReportType('monthly')}
                                className={`flex-1 p-3 rounded-lg border-2 transition-colors ${
                                    reportType === 'monthly'
                                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                                        : 'border-slate-200 bg-white text-slate-700'
                                }`}
                            >
                                חודשי
                            </button>
                        </div>
                    </div>

                    {/* Format Selection */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">פורמט</label>
                        <div className="space-y-2">
                            <button
                                onClick={() => handleExport('csv')}
                                disabled={isLoading}
                                className="w-full flex items-center gap-3 p-4 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
                            >
                                <Sheet className="w-5 h-5 text-green-600" />
                                <div className="text-left">
                                    <p className="font-medium">CSV</p>
                                    <p className="text-sm text-slate-500">תאימות עם Excel וGoogleSheets</p>
                                </div>
                            </button>
                            <button
                                onClick={() => handleExport('pdf')}
                                disabled={isLoading}
                                className="w-full flex items-center gap-3 p-4 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
                            >
                                <FileText className="w-5 h-5 text-red-600" />
                                <div className="text-left">
                                    <p className="font-medium">PDF</p>
                                    <p className="text-sm text-slate-500">דוח מעוצב וקל להדפסה</p>
                                </div>
                            </button>
                        </div>
                    </div>

                    {/* Stats */}
                    <div className="bg-slate-50 p-4 rounded-lg space-y-2">
                        <div className="flex justify-between text-sm">
                            <span className="text-slate-600">כמות רשומות:</span>
                            <span className="font-bold">{attendance.length}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-slate-600">עובדים:</span>
                            <span className="font-bold">{new Set(attendance.map(a => a.user_email)).size}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-slate-600">סה"כ שעות:</span>
                            <span className="font-bold">
                                {Math.round(attendance.reduce((sum, a) => sum + (a.hours_worked || 0), 0) * 100) / 100}h
                            </span>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}