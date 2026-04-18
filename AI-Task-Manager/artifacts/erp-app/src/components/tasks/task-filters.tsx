import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Filter, X } from 'lucide-react';

export default function TaskFilters({ filters, onFilterChange, onClear }) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Filter className="w-4 h-4 text-slate-600" />
        <h3 className="font-medium text-slate-900">Filters</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Status</label>
          <Select value={filters.status} onValueChange={(v) => onFilterChange({...filters, status: v})}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={null}>All Status</SelectItem>
              {['open', 'in_progress', 'completed', 'cancelled'].map(s => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Priority</label>
          <Select value={filters.priority} onValueChange={(v) => onFilterChange({...filters, priority: v})}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={null}>All Priority</SelectItem>
              {['low', 'medium', 'high', 'critical'].map(p => (
                <SelectItem key={p} value={p}>{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Assigned To</label>
          <Select value={filters.assigned_to} onValueChange={(v) => onFilterChange({...filters, assigned_to: v})}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={null}>All Users</SelectItem>
              <SelectItem value="me">Assigned to Me</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {(filters.status || filters.priority || filters.assigned_to) && (
        <Button onClick={onClear} variant="outline" size="sm">
          <X className="w-4 h-4 mr-1" />
          Clear Filters
        </Button>
      )}
    </div>
  );
}