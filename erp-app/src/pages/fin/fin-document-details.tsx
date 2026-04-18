import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import {
  ArrowRight, Edit, CreditCard, Link2, Paperclip, Copy,
  XCircle, FileText, Clock, Download, User, Building2
} from "lucide-react";
import { useLocation, useParams } from "wouter";

interface FinDocumentDetailsProps {
  direction: "income" | "expense";
}

export default function FinDocumentDetails({ direction }: FinDocumentDetailsProps) {
  const [, navigate] = useLocation();
  const params = useParams<{ id: string }>();
  const isIncome = direction === "income";

  const { data: document, isLoading } = useQuery({
    queryKey: ["/api/fin/documents", params.id],
    queryFn: () => fetch(`/api/fin/documents/${params.id}`).then(r => r.json()),
  });

  const { data: links } = useQuery({
    queryKey: ["/api/fin/document-links", params.id],
    queryFn: () => fetch(`/api/fin/document-links/${params.id}`).then(r => r.json()),
    enabled: !!params.id,
  });

  const { data: attachments } = useQuery({
    queryKey: ["/api/fin/attachments", params.id],
    queryFn: () => fetch(`/api/fin/attachments/${params.id}`).then(r => r.json()),
    enabled: !!params.id,
  });

  const { data: payments } = useQuery({
    queryKey: ["/api/fin/payments", { documentId: params.id }],
    queryFn: () => fetch(`/api/fin/payments?documentId=${params.id}`).then(r => r.json()),
    enabled: !!params.id,
  });

  const { data: activityLogs } = useQuery({
    queryKey: ["/api/fin/activity-logs", { entityType: "document", entityId: params.id }],
    queryFn: () => fetch(`/api/fin/activity-logs?entityType=document&entityId=${params.id}`).then(r => r.json()),
    enabled: !!params.id,
  });

  if (isLoading) return <div className="p-6 text-center">טוען...</div>;
  if (!document) return <div className="p-6 text-center">מסמך לא נמצא</div>;

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={() => navigate(`/fin/${direction}`)}>
            <ArrowRight className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{document.documentNumber}</h1>
            <p className="text-muted-foreground">{document.title}</p>
          </div>
          {document.status && (
            <Badge style={{ backgroundColor: document.status.color, color: "white" }}>
              {document.status.labelHe}
            </Badge>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate(`/fin/${direction}/${params.id}/edit`)}>
            <Edit className="h-4 w-4 ml-1" /> ערוך
          </Button>
          <Button variant="outline">
            <CreditCard className="h-4 w-4 ml-1" /> רשום תשלום
          </Button>
          <Button variant="outline">
            <Link2 className="h-4 w-4 ml-1" /> קשר מסמך
          </Button>
          <Button variant="outline">
            <Paperclip className="h-4 w-4 ml-1" /> צרף קובץ
          </Button>
          <Button variant="outline">
            <Copy className="h-4 w-4 ml-1" /> שכפל
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="info">
        <TabsList>
          <TabsTrigger value="info">פרטי מסמך</TabsTrigger>
          <TabsTrigger value="items">שורות מסמך</TabsTrigger>
          <TabsTrigger value="links">מסמכים מקושרים ({(links || []).length})</TabsTrigger>
          <TabsTrigger value="attachments">קבצים ({(attachments || []).length})</TabsTrigger>
          <TabsTrigger value="payments">תשלומים ({(payments?.data || []).length})</TabsTrigger>
          <TabsTrigger value="activity">לוג פעילות</TabsTrigger>
        </TabsList>

        {/* General Info Tab */}
        <TabsContent value="info">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader><CardTitle>פרטים כלליים</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <InfoRow label="מספר מסמך" value={document.documentNumber} />
                <InfoRow label="סוג מסמך" value={document.documentType?.labelHe} />
                <InfoRow label="כיוון" value={isIncome ? "הכנסה" : "הוצאה"} />
                <InfoRow label="תאריך הפקה" value={document.issueDate} />
                <InfoRow label="תאריך תשלום" value={document.dueDate || "—"} />
                <InfoRow label="אסמכתא" value={document.referenceNumber || "—"} />
                <InfoRow label="מטבע" value={document.currency} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>{isIncome ? "לקוח" : "ספק"}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {document.customer ? (
                  <>
                    <div className="flex items-center gap-2">
                      <User className="h-5 w-5 text-muted-foreground" />
                      <Button
                        variant="link"
                        className="p-0 h-auto"
                        onClick={() => navigate(`/customers/${document.customer.id}`)}
                      >
                        {document.customer.customerName}
                      </Button>
                    </div>
                    <InfoRow label="טלפון" value={document.customer.phone || "—"} />
                    <InfoRow label="אימייל" value={document.customer.email || "—"} />
                  </>
                ) : document.supplier ? (
                  <>
                    <div className="flex items-center gap-2">
                      <Building2 className="h-5 w-5 text-muted-foreground" />
                      <Button
                        variant="link"
                        className="p-0 h-auto"
                        onClick={() => navigate(`/suppliers/${document.supplier.id}`)}
                      >
                        {document.supplier.supplierName}
                      </Button>
                    </div>
                    <InfoRow label="טלפון" value={document.supplier.phone || "—"} />
                    <InfoRow label="אימייל" value={document.supplier.email || "—"} />
                  </>
                ) : (
                  <p className="text-muted-foreground">לא משויך</p>
                )}
              </CardContent>
            </Card>

            <Card className="md:col-span-2">
              <CardHeader><CardTitle>סיכום כספי</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-5 gap-4 text-center">
                  <div>
                    <p className="text-sm text-muted-foreground">סכום לפני מע"מ</p>
                    <p className="text-xl font-bold">₪{Number(document.subtotalAmount).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">מע"מ</p>
                    <p className="text-xl font-bold">₪{Number(document.taxAmount).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">סה"כ</p>
                    <p className="text-xl font-bold">₪{Number(document.totalAmount).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">שולם</p>
                    <p className="text-xl font-bold text-green-600">₪{Number(document.paidAmount).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">יתרה</p>
                    <p className="text-xl font-bold text-red-600">₪{Number(document.balanceDue).toLocaleString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Line Items Tab */}
        <TabsContent value="items">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">#</TableHead>
                    <TableHead className="text-right">תיאור</TableHead>
                    <TableHead className="text-right">כמות</TableHead>
                    <TableHead className="text-right">מחיר</TableHead>
                    <TableHead className="text-right">הנחה</TableHead>
                    <TableHead className="text-right">מע"מ</TableHead>
                    <TableHead className="text-right">סה"כ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(document.items || []).map((item: any, i: number) => (
                    <TableRow key={item.id}>
                      <TableCell>{i + 1}</TableCell>
                      <TableCell>{item.description}</TableCell>
                      <TableCell>{item.quantity} {item.unit}</TableCell>
                      <TableCell>₪{Number(item.unitPrice).toLocaleString()}</TableCell>
                      <TableCell>{item.discountPercent}%</TableCell>
                      <TableCell>{item.taxRate}%</TableCell>
                      <TableCell className="font-medium">₪{Number(item.lineTotal).toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Linked Documents Tab */}
        <TabsContent value="links">
          <Card>
            <CardContent className="pt-6">
              {(links || []).length === 0 ? (
                <p className="text-center text-muted-foreground py-8">אין מסמכים מקושרים</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">מסמך מקור</TableHead>
                      <TableHead className="text-right">מסמך יעד</TableHead>
                      <TableHead className="text-right">סוג קשר</TableHead>
                      <TableHead className="text-right">תאריך</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(links || []).map((link: any) => (
                      <TableRow key={link.id}>
                        <TableCell>{link.sourceDocumentId}</TableCell>
                        <TableCell>{link.targetDocumentId}</TableCell>
                        <TableCell><Badge variant="outline">{link.linkType}</Badge></TableCell>
                        <TableCell>{new Date(link.createdAt).toLocaleDateString("he-IL")}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Attachments Tab */}
        <TabsContent value="attachments">
          <Card>
            <CardContent className="pt-6">
              {(attachments || []).length === 0 ? (
                <p className="text-center text-muted-foreground py-8">אין קבצים מצורפים</p>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {(attachments || []).map((att: any) => (
                    <Card key={att.id} className="cursor-pointer hover:shadow-md">
                      <CardContent className="pt-6 text-center">
                        <FileText className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                        <p className="text-sm font-medium truncate">{att.fileName}</p>
                        <p className="text-xs text-muted-foreground">{att.fileType}</p>
                        <Button variant="ghost" size="sm" className="mt-2">
                          <Download className="h-3 w-3 ml-1" /> הורדה
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Payments Tab */}
        <TabsContent value="payments">
          <Card>
            <CardContent className="pt-6">
              {(payments?.data || []).length === 0 ? (
                <p className="text-center text-muted-foreground py-8">אין תשלומים</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">תאריך</TableHead>
                      <TableHead className="text-right">סכום</TableHead>
                      <TableHead className="text-right">אמצעי תשלום</TableHead>
                      <TableHead className="text-right">אסמכתא</TableHead>
                      <TableHead className="text-right">סטטוס</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(payments?.data || []).map((pmt: any) => (
                      <TableRow key={pmt.id}>
                        <TableCell>{pmt.paymentDate}</TableCell>
                        <TableCell className="font-medium text-green-600">₪{Number(pmt.amount).toLocaleString()}</TableCell>
                        <TableCell>{pmt.paymentMethodId}</TableCell>
                        <TableCell>{pmt.referenceNumber || "—"}</TableCell>
                        <TableCell>{pmt.statusId}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Activity Log Tab */}
        <TabsContent value="activity">
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-3">
                {(activityLogs || []).map((log: any) => (
                  <div key={log.id} className="flex items-start gap-3 border-b pb-3">
                    <Clock className="h-4 w-4 mt-1 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{log.actionType}</p>
                      <p className="text-xs text-muted-foreground">
                        {log.actor} · {new Date(log.createdAt).toLocaleString("he-IL")}
                      </p>
                      {log.description && <p className="text-sm mt-1">{log.description}</p>}
                    </div>
                  </div>
                ))}
                {(!activityLogs || activityLogs.length === 0) && (
                  <p className="text-center text-muted-foreground py-8">אין פעילות</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
