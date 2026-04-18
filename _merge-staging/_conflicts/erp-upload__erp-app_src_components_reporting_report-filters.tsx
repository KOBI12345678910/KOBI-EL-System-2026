import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { X, Plus, Filter } from 'lucide-react';

const FILTER_OPERATORS = {
  text: ['equals', 'contains', 'starts_with', 'ends_with'],
  number: ['equals', 'greater_than', 'less_than', 'between'],
  date: ['equals', 'after', 'before', 'between'],
  select: ['equals', 'in'],
};

export default function ReportFilters({ fields, onFiltersChange, initialFilters = {} }) {
  const [filters, setFilters] = useState(initialFilters);
  const [activeFilter, setActiveFilter] = useState(null);

  const handleAddFilter = () => {
    const newId = Date.now();
    setFilters({...filters, [newId]: { field: '', operator: '', value: '' }});
    setActiveFilter(newId);
  };

  const handleRemoveFilter = (id) => {
    const newFilters = {...filters};
    delete newFilters[id];
    setFilters(newFilters);
    onFiltersChange(newFilters);
  };

  const handleFilterChange = (id, key, value) => {
    const updated = {...filters, [id]: {...filters[id], [key]: value}};
    setFilters(updated);
  };

  const handleApply = () => {
    onFiltersChange(filters);
  };

  const activeFilterCount = Object.keys(filters).filter(id => filters[id].field).length;

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="bg-gradient-to-r from-slate-50 to-slate-100">
        <CardTitle className="flex items-center justify-between text-base">
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-slate-600" />
            <span>Filters</span>
            {activeFilterCount > 0 && <Badge className="ml-2">{activeFilterCount}</Badge>}
          </div>
          <Button size="sm" variant="outline" onClick={handleAddFilter}>
            <Plus className="w-4 h-4 mr-1" />
            Add Filter
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-3">
        {Object.entries(filters).map(([id, filter]) => (
          <div key={id} className="flex gap-2 items-end p-3 bg-slate-50 rounded-lg">
            <Select value={filter.field} onValueChange={(v) => handleFilterChange(id, 'field', v)}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Select field" />
              </SelectTrigger>
              <SelectContent>
                {fields.map(f => (
                  <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {filter.field && (
              <>
                <Select value={filter.operator} onValueChange={(v) => handleFilterChange(id, 'operator', v)}>
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder="Operator" />
                  </SelectTrigger>
                  <SelectContent>
                    {FILTER_OPERATORS.text.map(op => (
                      <SelectItem key={op} value={op}>{op}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Input
                  placeholder="Value"
                  value={filter.value}
                  onChange={(e) => handleFilterChange(id, 'value', e.target.value)}
                  className="flex-1"
                />
              </>
            )}

            <Button size="sm" variant="ghost" onClick={() => handleRemoveFilter(id)}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        ))}

        <Button onClick={handleApply} className="w-full bg-blue-600 hover:bg-blue-700">
          Apply Filters
        </Button>
      </CardContent>
    </Card>
  );
}