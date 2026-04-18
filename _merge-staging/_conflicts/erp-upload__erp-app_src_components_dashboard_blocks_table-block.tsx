import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface TableBlockProps {
  config: Record<string, unknown>;
  onUpdate: (config: Record<string, unknown>) => void;
}

const TABLE_DATA: Record<string, Record<string, string | number>[]> = {
  orders: [
    { id: 1, customer: "חברת א'", amount: "₪15,000", status: "בביצוע", date: "11/02/2026" },
    { id: 2, customer: "חברת ב'", amount: "₪8,500", status: "משולם", date: "10/02/2026" },
    { id: 3, customer: "חברת ג'", amount: "₪22,000", status: "ממתין", date: "09/02/2026" },
  ],
  invoices: [
    { id: 1, number: "חשבונית-001", customer: "חברת א'", amount: "₪5,000", status: "משולמת", date: "11/02/2026" },
    { id: 2, number: "חשבונית-002", customer: "חברת ב'", amount: "₪3,200", status: "באיחור", date: "08/02/2026" },
    { id: 3, number: "חשבונית-003", customer: "חברת ג'", amount: "₪7,800", status: "משולמת", date: "10/02/2026" },
  ],
  tasks: [
    { id: 1, title: "השלמת ייצור", assigned: "דוד", priority: "גבוהה", due: "12/02/2026" },
    { id: 2, title: "בדיקה איכות", assigned: "מרים", priority: "בינונית", due: "13/02/2026" },
    { id: 3, title: "משלוח", assigned: "יוסי", priority: "נמוכה", due: "15/02/2026" },
  ],
};

const COL_LABELS: Record<string, string> = {
  customer: "לקוח", amount: "סכום", status: "סטטוס", date: "תאריך",
  number: "מספר", title: "משימה", assigned: "הוקצה ל", priority: "עדיפות", due: "עד תאריך",
};

export default function TableBlock({ config, onUpdate }: TableBlockProps) {
  const [dataType, setDataType] = useState<string>((config.dataType as string) || "orders");
  const data = TABLE_DATA[dataType] || [];
  const columns = data.length > 0 ? Object.keys(data[0]) : [];

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <div className="space-y-3">
          <CardTitle className="text-sm">הגדרות טבלה</CardTitle>
          <Select value={dataType} onValueChange={(val) => { setDataType(val); onUpdate({ ...config, dataType: val }); }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="orders">הזמנות</SelectItem>
              <SelectItem value="invoices">חשבוניות</SelectItem>
              <SelectItem value="tasks">משימות</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 border-b">
              <tr>
                {columns.map((col) => (
                  <th key={col} className="p-3 text-right font-semibold text-slate-700">
                    {COL_LABELS[col] || col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row, idx) => (
                <tr key={idx} className="border-b hover:bg-slate-50">
                  {columns.map((col) => (
                    <td key={col} className="p-3 text-slate-700">{row[col]}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
