import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle, XCircle } from 'lucide-react';

export default function DiscountApproval({ quote, onApprove, onReject }) {
    const discountPercent = quote.subtotal > 0 ? ((quote.discount_total / quote.subtotal) * 100).toFixed(1) : 0;
    const requiresApproval = discountPercent > 15; // Threshold for approval

    if (!requiresApproval && quote.status !== 'pending_approval') {
        return null;
    }

    return (
        <Card className="border-amber-200 bg-amber-50">
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-amber-800">
                    <AlertCircle className="w-5 h-5" />
                    דורש אישור הנחה
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-sm text-slate-600">אחוז הנחה כולל:</p>
                        <p className="text-2xl font-bold text-amber-600">{discountPercent}%</p>
                    </div>
                    <div>
                        <p className="text-sm text-slate-600">סכום הנחה:</p>
                        <p className="text-2xl font-bold text-amber-600">₪{(quote.discount_total || 0).toLocaleString()}</p>
                    </div>
                </div>

                {quote.status === 'pending_approval' ? (
                    <div className="flex gap-3">
                        <Button 
                            onClick={onApprove}
                            className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                        >
                            <CheckCircle className="w-4 h-4 ml-2" />
                            אשר הנחה
                        </Button>
                        <Button 
                            onClick={onReject}
                            variant="outline"
                            className="flex-1 border-red-300 text-red-600 hover:bg-red-50"
                        >
                            <XCircle className="w-4 h-4 ml-2" />
                            דחה
                        </Button>
                    </div>
                ) : quote.discount_approved_by ? (
                    <div className="bg-emerald-50 p-3 rounded-lg flex items-center gap-2">
                        <CheckCircle className="w-5 h-5 text-emerald-600" />
                        <div className="flex-1">
                            <p className="text-sm font-medium text-emerald-800">אושר על ידי</p>
                            <p className="text-xs text-emerald-600">{quote.discount_approved_by}</p>
                        </div>
                    </div>
                ) : (
                    <Badge variant="outline" className="w-full justify-center py-2">
                        ממתין לאישור
                    </Badge>
                )}
            </CardContent>
        </Card>
    );
}