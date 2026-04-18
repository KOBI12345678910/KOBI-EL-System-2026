import { ShoppingCart } from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ProductsInterestBlockProps {
  block: Record<string, unknown>;
  leadId: string;
  canEdit: boolean;
}

interface Product {
  name: string;
  quantity: number;
  unit: string;
  status: string;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function ProductsInterestBlock({
  block,
  leadId,
  canEdit,
}: ProductsInterestBlockProps) {
  const products: Product[] = [
    { name: "\u05DE\u05E2\u05E7\u05D4 \u05D1\u05E8\u05D6\u05DC \u05DE\u05E2\u05D5\u05E6\u05D1", quantity: 15, unit: "\u05DE\u05D8\u05E8", status: "\u05DE\u05E2\u05D5\u05E0\u05D9\u05D9\u05DF" },
    { name: "\u05E9\u05E2\u05E8 \u05DB\u05E0\u05D9\u05E1\u05D4 \u05D7\u05E9\u05DE\u05DC\u05D9", quantity: 1, unit: "\u05D9\u05D7\u05D9\u05D3\u05D4", status: "\u05DE\u05D7\u05DB\u05D4 \u05DC\u05D4\u05E6\u05E2\u05D4" },
    { name: "\u05D2\u05D3\u05E8 \u05D0\u05DC\u05D5\u05DE\u05D9\u05E0\u05D9\u05D5\u05DD", quantity: 30, unit: "\u05DE\u05D8\u05E8", status: "\u05D1\u05E9\u05D9\u05E7\u05D5\u05DC" },
  ];

  const statusColors: Record<string, string> = {
    "\u05DE\u05E2\u05D5\u05E0\u05D9\u05D9\u05DF": "bg-green-100 text-green-800",
    "\u05DE\u05D7\u05DB\u05D4 \u05DC\u05D4\u05E6\u05E2\u05D4": "bg-orange-100 text-orange-800",
    "\u05D1\u05E9\u05D9\u05E7\u05D5\u05DC": "bg-blue-100 text-blue-800",
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <ShoppingCart className="w-5 h-5 text-indigo-600" />
        <span className="font-medium text-slate-900">\u05DE\u05D5\u05E6\u05E8\u05D9\u05DD \u05DE\u05EA\u05E2\u05E0\u05D9\u05D9\u05E0\u05D9\u05DD</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200">
            <tr className="text-right">
              <th className="pb-2 font-medium text-slate-700">\u05DE\u05D5\u05E6\u05E8</th>
              <th className="pb-2 font-medium text-slate-700">\u05DB\u05DE\u05D5\u05EA</th>
              <th className="pb-2 font-medium text-slate-700">\u05E1\u05D8\u05D8\u05D5\u05E1</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {products.map((product, idx) => (
              <tr key={idx}>
                <td className="py-2 text-slate-900">{product.name}</td>
                <td className="py-2 text-slate-600">
                  {product.quantity} {product.unit}
                </td>
                <td className="py-2">
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-medium ${
                      statusColors[product.status] || ""
                    }`}
                  >
                    {product.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
