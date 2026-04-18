import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Plus, Search, Filter, Download, Link2, CreditCard,
  FileText, ChevronRight, Paperclip, MoreHorizontal
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { useLocation } from "wouter";

interface FinDocumentsListProps {
  direction: "income" | "expense";
}

export default function FinDocumentsList({ direction }: FinDocumentsListProps) {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [page, setPage] = useState(0);
  const pageSize = 25;

  const isIncome = direction === "income";
  const title = isIncome ? "מסמכי הכנסה" : "מסמכי הוצאה";

  const { data: statuses } = useQuery({ queryKey: ["/api/fin/statuses"] });
  const { data: docTypes } = useQuery({ queryKey: ["/api/fin/document-types"] });

  const queryParams = new URLSearchParams({
    direction,
    limit: String(pageSize),
    offset: String(page * pageSize),
    ...(search && { search }),
    ...(statusFilter !== "all" && { statusId: statusFilter }),
    ...(typeFilter !== "all" && { documentTypeId: typeFilter }),
  });

  const { data: result, isLoading } = useQuery({
    queryKey: ["/api/fin/documents", direction, search, statusFilter, typeFilter, page],
    queryFn: () => fetch(`/api/fin/documents?${queryParams}`).then(r => r.json()),
  });

  const documents = result?.data || [];
  const total = result?.total || 0;

  const filteredDocTypes = (docTypes || []).filter((dt: any) =>
    dt.direction === direction || dt.direction === "both"
  );

  const getStatusBadge = (statusId: number) => {
    const status = (statuses || []).find((s: any) => s.id === statusId);
    if (!status) return null;
    return (
      <Badge style={{ backgroundColor: status.color, color: "white" }}>
        {status.labelHe}
      </Badge>
    );
  };

  const getDocTypeName = (typeId: number) => {
    const dt = (docTypes || []).find((d: any) => d.id === typeId);
    return dt?.labelHe || "";
  };

  return (
    <div className="p-6 space-y-4" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="text-muted-foreground">{total} מסמכים</p>
        </div>
        <Button onClick={() => navigate(`/fin/${direction}/create`)}>
          <Plus className="h-4 w-4 ml-2" />
          {isIncome ? "מסמך הכנסה חדש" : "מסמך הוצאה חדש"}
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="חיפוש..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pr-10"
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="סוג מסמך" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">כל הסוגים</SelectItem>
                {filteredDocTypes.map((dt: any) => (
                  <SelectItem key={dt.id} value={String(dt.id)}>{dt.labelHe}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="סטטוס" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">כל הסטטוסים</SelectItem>
                {(statuses || []).map((s: any) => (
                  <SelectItem key={s.id} value={String(s.id)}>{s.labelHe}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon">
              <Download className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">מספר מסמך</TableHead>
                <TableHead className="text-right">תאריך</TableHead>
                <TableHead className="text-right">{isIncome ? "לקוח" : "ספק"}</TableHead>
                <TableHead className="text-right">סוג</TableHead>
                <TableHead className="text-right">סכום</TableHead>
                <TableHead className="text-right">שולם</TableHead>
                <TableHead className="text-right">יתרה</TableHead>
                <TableHead className="text-right">סטטוס</TableHead>
                <TableHead className="text-right">פעולות</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8">טוען...</TableCell>
                </TableRow>
              ) : documents.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                    אין מסמכים
                  </TableCell>
                </TableRow>
              ) : (
                documents.map((doc: any) => (
                  <TableRow
                    key={doc.id}
                    className="cursor-pointer hover:bg-accent"
                    onClick={() => navigate(`/fin/${direction}/${doc.id}`)}
                  >
                    <TableCell className="font-medium">{doc.documentNumber}</TableCell>
                    <TableCell>{doc.issueDate}</TableCell>
                    <TableCell>{doc.customerId || doc.supplierId || "—"}</TableCell>
                    <TableCell>{getDocTypeName(doc.documentTypeId)}</TableCell>
                    <TableCell className="font-medium">₪{Number(doc.totalAmount).toLocaleString()}</TableCell>
                    <TableCell className="text-green-600">₪{Number(doc.paidAmount).toLocaleString()}</TableCell>
                    <TableCell className="text-red-600">₪{Number(doc.balanceDue).toLocaleString()}</TableCell>
                    <TableCell>{getStatusBadge(doc.statusId)}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" onClick={(e) => e.stopPropagation()}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => navigate(`/fin/${direction}/${doc.id}`)}>
                            <FileText className="h-4 w-4 ml-2" /> פתח
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <CreditCard className="h-4 w-4 ml-2" /> רשום תשלום
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <Link2 className="h-4 w-4 ml-2" /> קשר מסמך
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <Paperclip className="h-4 w-4 ml-2" /> צרף קובץ
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination */}
      {total > pageSize && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            מציג {page * pageSize + 1}-{Math.min((page + 1) * pageSize, total)} מתוך {total}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
              הקודם
            </Button>
            <Button variant="outline" size="sm" disabled={(page + 1) * pageSize >= total} onClick={() => setPage(p => p + 1)}>
              הבא
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
