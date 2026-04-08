import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { authFetch } from "@/lib/utils";
import {
  Upload, Download, CheckCircle2, XCircle, AlertTriangle, Clock,
  Users, ShoppingCart, Package, History,
} from "lucide-react";

const API = "/api";

type Entity = "employees" | "customers" | "inventory";

const ENTITY_LABELS: Record<Entity, string> = {
  employees: "עובדים",
  customers: "לקוחות",
  inventory: "מלאי",
};

const ENTITY_ICONS: Record<Entity, React.FC<{ className?: string }>> = {
  employees: Users,
  customers: ShoppingCart,
  inventory: Package,
};

interface PreviewResult {
  total: number;
  errors: string[];
  sample: Record<string, string>[];
  unknownHeaders: string[];
  canImport: boolean;
}

interface ImportResult {
  imported: number;
  skipped: number;
  total: number;
}

interface HistoryRow {
  id: number;
  entity_type: string;
  imported_count: number;
  skipped_count: number;
  imported_by: string;
  created_at: string;
}

function downloadTemplate(entity: Entity) {
  const a = document.createElement("a");
  a.href = `${API}/data-migration/template/${entity}`;
  a.download = `${entity}_template.xlsx`;
  a.click();
}

function EntityImportPanel({ entity }: { entity: Entity }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const Icon = ENTITY_ICONS[entity];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setPreview(null);
    setImportResult(null);
  };

  const handlePreview = async () => {
    if (!file) return;
    setIsPreviewing(true);
    setPreview(null);
    setImportResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await authFetch(`${API}/data-migration/preview/${entity}`, { method: "POST", body: fd });
      const data = await res.json() as PreviewResult;
      setPreview(data);
    } catch (e) {
      setPreview({ total: 0, errors: [`שגיאה: ${String(e)}`], sample: [], unknownHeaders: [], canImport: false });
    } finally {
      setIsPreviewing(false);
    }
  };

  const handleImport = async () => {
    if (!file || !preview?.canImport) return;
    setIsImporting(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await authFetch(`${API}/data-migration/import/${entity}`, { method: "POST", body: fd });
      const data = await res.json() as ImportResult;
      setImportResult(data);
      setPreview(null);
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
    } catch (e) {
      setImportResult(null);
    } finally {
      setIsImporting(false);
    }
  };

  const sampleHeaders = preview?.sample?.[0] ? Object.keys(preview.sample[0]) : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Icon className="w-6 h-6 text-blue-600" />
        <h3 className="text-lg font-semibold">ייבוא {ENTITY_LABELS[entity]}</h3>
      </div>

      <Button variant="outline" size="sm" onClick={() => downloadTemplate(entity)}>
        <Download className="w-4 h-4 ml-2" />
        הורד תבנית Excel
      </Button>

      <div className="border-2 border-dashed border-gray-200 rounded-lg p-6 text-center">
        <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
        <p className="text-sm text-gray-600 mb-3">בחר קובץ Excel עם נתוני {ENTITY_LABELS[entity]}</p>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls"
          onChange={handleFileChange}
          className="hidden"
          id={`file-${entity}`}
        />
        <label htmlFor={`file-${entity}`}>
          <Button variant="outline" size="sm" asChild>
            <span className="cursor-pointer">בחר קובץ</span>
          </Button>
        </label>
        {file && <p className="mt-2 text-sm font-medium text-gray-800">{file.name}</p>}
      </div>

      {file && (
        <Button onClick={handlePreview} disabled={isPreviewing} className="w-full">
          {isPreviewing ? "מנתח קובץ..." : "נתח ותצוגה מקדימה"}
        </Button>
      )}

      {preview && (
        <div className="space-y-4">
          <div className="flex gap-4">
            <div className="flex-1 bg-blue-50 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-blue-700">{preview.total}</p>
              <p className="text-sm text-blue-600">שורות בקובץ</p>
            </div>
            <div className="flex-1 bg-red-50 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-red-700">{preview.errors.length}</p>
              <p className="text-sm text-red-600">שגיאות</p>
            </div>
          </div>

          {preview.errors.length > 0 && (
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertDescription>
                <p className="font-semibold mb-2">נמצאו {preview.errors.length} שגיאות – יש לתקן לפני הייבוא:</p>
                <ul className="space-y-1 text-sm">
                  {preview.errors.map((err, i) => (
                    <li key={i} className="font-mono">{err}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {preview.unknownHeaders.length > 0 && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                עמודות לא מוכרות (יידלגו): {preview.unknownHeaders.join(", ")}
              </AlertDescription>
            </Alert>
          )}

          {preview.canImport && (
            <Alert className="border-green-200 bg-green-50">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
                הקובץ תקין ומוכן לייבוא – {preview.total} רשומות
              </AlertDescription>
            </Alert>
          )}

          {preview.sample.length > 0 && (
            <div>
              <p className="text-sm font-medium mb-2">תצוגה מקדימה (עד 10 שורות):</p>
              <div className="overflow-x-auto border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {sampleHeaders.map((h) => (
                        <TableHead key={h} className="text-xs">{h}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.sample.map((row, i) => (
                      <TableRow key={i}>
                        {sampleHeaders.map((h) => (
                          <TableCell key={h} className="text-xs">{row[h] ?? ""}</TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {preview.canImport && (
            <Button
              onClick={handleImport}
              disabled={isImporting}
              className="w-full bg-green-600 hover:bg-green-700 text-foreground"
            >
              {isImporting ? "מייבא נתונים..." : `אשר וייבא ${preview.total} רשומות`}
            </Button>
          )}
        </div>
      )}

      {importResult && (
        <Alert className="border-green-200 bg-green-50">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">
            <p className="font-semibold">ייבוא הושלם בהצלחה!</p>
            <p>יובאו: {importResult.imported} רשומות | דולגו: {importResult.skipped} שורות</p>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

export default function DataMigrationPage() {
  const { data: history = [] } = useQuery<HistoryRow[]>({
    queryKey: ["data-migration-history"],
    queryFn: async () => {
      const res = await authFetch(`${API}/data-migration/history`);
      if (!res.ok) return [];
      return res.json();
    },
    refetchInterval: 30000,
  });

  const entityLabel: Record<string, string> = {
    employees: "עובדים",
    customers: "לקוחות",
    inventory: "מלאי",
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">ייבוא נתונים – Go-Live Migration</h1>
        <p className="text-gray-500 mt-1">ייבוא עובדים, לקוחות ומלאי מקבצי Excel עם כותרות בעברית</p>
      </div>

      <Tabs defaultValue="employees">
        <TabsList className="mb-4">
          <TabsTrigger value="employees">
            <Users className="w-4 h-4 ml-1" /> עובדים
          </TabsTrigger>
          <TabsTrigger value="customers">
            <ShoppingCart className="w-4 h-4 ml-1" /> לקוחות
          </TabsTrigger>
          <TabsTrigger value="inventory">
            <Package className="w-4 h-4 ml-1" /> מלאי
          </TabsTrigger>
          <TabsTrigger value="history">
            <History className="w-4 h-4 ml-1" /> היסטוריה
          </TabsTrigger>
        </TabsList>

        {(["employees", "customers", "inventory"] as Entity[]).map((entity) => (
          <TabsContent key={entity} value={entity}>
            <Card>
              <CardContent className="pt-6">
                <EntityImportPanel entity={entity} />
              </CardContent>
            </Card>
          </TabsContent>
        ))}

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="w-5 h-5" />
                היסטוריית ייבואים
              </CardTitle>
            </CardHeader>
            <CardContent>
              {history.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <Clock className="w-10 h-10 mx-auto mb-2 opacity-40" />
                  <p>טרם בוצע ייבוא</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>סוג נתונים</TableHead>
                      <TableHead>יובאו</TableHead>
                      <TableHead>דולגו</TableHead>
                      <TableHead>בוצע על ידי</TableHead>
                      <TableHead>תאריך</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>
                          <Badge variant="outline">
                            {entityLabel[row.entity_type] ?? row.entity_type}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-green-700 font-semibold">{row.imported_count}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-orange-600">{row.skipped_count}</span>
                        </TableCell>
                        <TableCell>{row.imported_by}</TableCell>
                        <TableCell className="text-sm text-gray-500">
                          {new Date(row.created_at).toLocaleString("he-IL")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
