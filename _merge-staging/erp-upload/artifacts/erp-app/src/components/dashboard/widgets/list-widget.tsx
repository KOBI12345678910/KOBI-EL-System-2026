import { Badge } from "@/components/ui/badge";

interface ListWidgetProps {
  config: {
    items?: { label: string; value: string; status: string }[];
  };
}

export default function ListWidget({ config }: ListWidgetProps) {
  const items = config.items && config.items.length > 0 ? config.items : [
    { label: "פריט 1", value: "100", status: "active" },
    { label: "פריט 2", value: "200", status: "pending" },
    { label: "פריט 3", value: "150", status: "active" },
  ];

  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg">
          <span className="text-sm font-medium">{item.label}</span>
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-600">{item.value}</span>
            <Badge variant="outline" className="text-xs">{item.status}</Badge>
          </div>
        </div>
      ))}
    </div>
  );
}
