import { type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Plus, Download, Upload, Filter, RefreshCw } from "lucide-react";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  onAdd?: () => void;
  addLabel?: string;
  onExport?: () => void;
  onImport?: () => void;
  onFilter?: () => void;
  onRefresh?: () => void;
  actions?: ReactNode;
}

export default function PageHeader({
  title,
  subtitle,
  onAdd,
  addLabel = "הוסף חדש",
  onExport,
  onImport,
  onFilter,
  onRefresh,
  actions,
}: PageHeaderProps) {
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">{title}</h1>
        {subtitle && <p className="text-slate-500 mt-1">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        {onRefresh && (
          <Button variant="outline" onClick={onRefresh} size="icon">
            <RefreshCw className="w-4 h-4" />
          </Button>
        )}
        {onFilter && (
          <Button variant="outline" onClick={onFilter} className="gap-2">
            <Filter className="w-4 h-4" />
            סינון
          </Button>
        )}
        {onExport && (
          <Button variant="outline" onClick={onExport} className="gap-2">
            <Download className="w-4 h-4" />
            ייצוא
          </Button>
        )}
        {onImport && (
          <Button variant="outline" onClick={onImport} className="gap-2">
            <Upload className="w-4 h-4" />
            ייבוא
          </Button>
        )}
        {actions}
        {onAdd && (
          <Button onClick={onAdd} className="gap-2 bg-indigo-600 hover:bg-indigo-700">
            <Plus className="w-4 h-4" />
            {addLabel}
          </Button>
        )}
      </div>
    </div>
  );
}
