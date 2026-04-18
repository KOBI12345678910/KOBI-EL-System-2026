import { format } from 'date-fns';

export default function QuoteTemplate({ quote, customer, site }) {
    const companyInfo = {
        name: "MetalPro - מתכת ואלומיניום בע״מ",
        address: "רחוב התעשייה 15, אזור תעשייה",
        city: "תל אביב 12345",
        phone: "03-1234567",
        email: "info@metalpro.co.il",
        website: "www.metalpro.co.il",
        license: "ח.פ. 123456789"
    };

    return (
        <div dir="rtl" className="bg-white p-8 max-w-4xl mx-auto" style={{ fontFamily: 'Arial, sans-serif' }}>
            {/* Header */}
            <div className="border-b-4 border-indigo-600 pb-6 mb-6">
                <div className="flex justify-between items-start">
                    <div>
                        <h1 className="text-3xl font-bold text-indigo-600 mb-2">{companyInfo.name}</h1>
                        <p className="text-slate-600">{companyInfo.address}</p>
                        <p className="text-slate-600">{companyInfo.city}</p>
                        <p className="text-slate-600">טל: {companyInfo.phone}</p>
                        <p className="text-slate-600">דוא״ל: {companyInfo.email}</p>
                    </div>
                    <div className="text-left">
                        <div className="bg-indigo-600 text-white px-4 py-2 rounded-lg mb-2">
                            <p className="text-xl font-bold">הצעת מחיר</p>
                        </div>
                        <p className="text-slate-700"><strong>מספר:</strong> {quote.quote_number}</p>
                        <p className="text-slate-700"><strong>תאריך:</strong> {format(new Date(), 'dd/MM/yyyy')}</p>
                        {quote.valid_until && (
                            <p className="text-slate-700"><strong>תוקף:</strong> {format(new Date(quote.valid_until), 'dd/MM/yyyy')}</p>
                        )}
                    </div>
                </div>
            </div>

            {/* Customer Info */}
            <div className="mb-6 bg-slate-50 p-4 rounded-lg">
                <h2 className="text-lg font-bold mb-3 text-slate-800">פרטי לקוח</h2>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <p className="text-slate-700"><strong>שם:</strong> {customer?.name || quote.customer_name}</p>
                        {customer?.company && <p className="text-slate-700"><strong>חברה:</strong> {customer.company}</p>}
                        {customer?.phone && <p className="text-slate-700"><strong>טלפון:</strong> {customer.phone}</p>}
                        {customer?.email && <p className="text-slate-700"><strong>דוא״ל:</strong> {customer.email}</p>}
                    </div>
                    <div>
                        {(site || quote.site_address) && (
                            <>
                                <p className="font-semibold text-slate-800">כתובת אתר:</p>
                                <p className="text-slate-700">{site?.address || quote.site_address}</p>
                                {site?.city && <p className="text-slate-700">{site.city}</p>}
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Items Table */}
            <div className="mb-6">
                <h2 className="text-lg font-bold mb-3 text-slate-800">פירוט הצעה</h2>
                <table className="w-full border-collapse border border-slate-300">
                    <thead className="bg-indigo-600 text-white">
                        <tr>
                            <th className="border border-slate-300 p-2 text-right">#</th>
                            <th className="border border-slate-300 p-2 text-right">תיאור</th>
                            <th className="border border-slate-300 p-2 text-center">כמות</th>
                            <th className="border border-slate-300 p-2 text-left">מחיר יח׳</th>
                            <th className="border border-slate-300 p-2 text-center">הנחה</th>
                            <th className="border border-slate-300 p-2 text-left">סה״כ</th>
                        </tr>
                    </thead>
                    <tbody>
                        {(quote.items || []).map((item, idx) => (
                            <tr key={idx} className="hover:bg-slate-50">
                                <td className="border border-slate-300 p-2 text-right">{idx + 1}</td>
                                <td className="border border-slate-300 p-2 text-right">
                                    <strong>{item.product_name}</strong>
                                    {item.description && <p className="text-sm text-slate-600">{item.description}</p>}
                                </td>
                                <td className="border border-slate-300 p-2 text-center">{item.quantity} {item.unit || 'יח׳'}</td>
                                <td className="border border-slate-300 p-2 text-left">₪{(item.unit_price || 0).toLocaleString('he-IL', { minimumFractionDigits: 2 })}</td>
                                <td className="border border-slate-300 p-2 text-center">{item.discount_percent > 0 ? `${item.discount_percent}%` : '-'}</td>
                                <td className="border border-slate-300 p-2 text-left font-semibold">₪{(item.total || 0).toLocaleString('he-IL', { minimumFractionDigits: 2 })}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Totals */}
            <div className="flex justify-end mb-6">
                <div className="w-80 bg-slate-50 p-4 rounded-lg">
                    <div className="flex justify-between py-2 border-b border-slate-300">
                        <span className="text-slate-700">סכום ביניים:</span>
                        <span className="font-semibold">₪{(quote.subtotal || 0).toLocaleString('he-IL', { minimumFractionDigits: 2 })}</span>
                    </div>
                    {quote.discount_total > 0 && (
                        <div className="flex justify-between py-2 border-b border-slate-300 text-emerald-600">
                            <span>הנחה:</span>
                            <span className="font-semibold">-₪{(quote.discount_total || 0).toLocaleString('he-IL', { minimumFractionDigits: 2 })}</span>
                        </div>
                    )}
                    <div className="flex justify-between py-2 border-b border-slate-300">
                        <span className="text-slate-700">מע״מ (18%):</span>
                        <span className="font-semibold">₪{(quote.tax_total || 0).toLocaleString('he-IL', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between py-3 text-lg">
                        <span className="font-bold">סה״כ לתשלום:</span>
                        <span className="font-bold text-indigo-600">₪{(quote.total || 0).toLocaleString('he-IL', { minimumFractionDigits: 2 })}</span>
                    </div>
                </div>
            </div>

            {/* Terms & Notes */}
            <div className="space-y-4 mb-6">
                {quote.terms && (
                    <div className="bg-slate-50 p-4 rounded-lg">
                        <h3 className="font-bold text-slate-800 mb-2">תנאים:</h3>
                        <p className="text-sm text-slate-700 whitespace-pre-line">{quote.terms}</p>
                    </div>
                )}
                {quote.notes && (
                    <div className="bg-amber-50 border-r-4 border-amber-400 p-4 rounded-lg">
                        <h3 className="font-bold text-slate-800 mb-2">הערות:</h3>
                        <p className="text-sm text-slate-700 whitespace-pre-line">{quote.notes}</p>
                    </div>
                )}
                {quote.payment_terms && (
                    <div className="bg-blue-50 p-4 rounded-lg">
                        <h3 className="font-bold text-slate-800 mb-2">תנאי תשלום:</h3>
                        <p className="text-sm text-slate-700">{quote.payment_terms}</p>
                    </div>
                )}
                {quote.delivery_time && (
                    <div className="bg-green-50 p-4 rounded-lg">
                        <h3 className="font-bold text-slate-800 mb-2">זמן אספקה:</h3>
                        <p className="text-sm text-slate-700">{quote.delivery_time}</p>
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="border-t-2 border-slate-300 pt-4 text-center text-sm text-slate-600">
                <p>{companyInfo.license} | {companyInfo.website}</p>
                <p className="mt-2">תודה על פנייתך! נשמח לעמוד לשירותך</p>
            </div>
        </div>
    );
}