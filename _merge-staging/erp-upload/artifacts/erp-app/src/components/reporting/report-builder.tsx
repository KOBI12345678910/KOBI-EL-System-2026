import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader, Save } from 'lucide-react';
import ReportFilters from './ReportFilters';
import ReportVisualizer from './ReportVisualizer';
import ReportExporter from './ReportExporter';
import { entityCreate, entityFilter, entityList } from "@/lib/entity-api";

export default function ReportBuilder() {
  const [entityType, setEntityType] = useState('Lead');
  const [fields, setFields] = useState([]);
  const [selectedFields, setSelectedFields] = useState([]);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [reportName, setReportName] = useState('');
  const [filters, setFilters] = useState({});
  const [sortBy, setSortBy] = useState('');
  const [sortOrder, setSortOrder] = useState('desc');
  const [groupBy, setGroupBy] = useState('');
  const [visualization, setVisualization] = useState('table');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadFields();
  }, [entityType]);

  const loadFields = async () => {
    try {
      setFields([]);
      setSelectedFields([]);

      // Get standard fields from entity schema
      const schema = await fetch(`/api/entities/${entityType}/schema`).then(r => r.json());
      const standardFields = Object.entries(schema.properties || {}).map(([key, val]) => ({
        key,
        label: key.charAt(0).toUpperCase() + key.slice(1),
        field_type: val.type === 'number' ? 'number' : 'text'
      }));

      // Get custom fields
      const customFields = await entityFilter<any>("custom-fields", {
        entity_type: entityType,
        is_active: true
      });

      setFields([...standardFields, ...customFields]);
      setSelectedFields(standardFields.slice(0, 3).map(f => f.key));
    } catch (error) {
      console.error('Error loading fields:', error);
    }
  };

  const runReport = async () => {
    try {
      setLoading(true);
      let results = await entityList<any>(entityType);

      // Apply filters
      Object.values(filters).forEach(filter => {
        if (filter.field && filter.operator) {
          results = results.filter(item => {
            const val = item[filter.field];
            switch (filter.operator) {
              case 'equals':
                return val === filter.value;
              case 'contains':
                return String(val).includes(filter.value);
              case 'greater_than':
                return Number(val) > Number(filter.value);
              case 'less_than':
                return Number(val) < Number(filter.value);
              default:
                return true;
            }
          });
        }
      });

      // Apply sorting
      if (sortBy) {
        results.sort((a, b) => {
          const aVal = a[sortBy];
          const bVal = b[sortBy];
          const order = sortOrder === 'asc' ? 1 : -1;
          return aVal > bVal ? order : -order;
        });
      }

      // Select fields
      const formatted = results.map(item => {
        const obj = {};
        selectedFields.forEach(key => {
          obj[key] = item[key];
        });
        return obj;
      });

      setData(formatted);
    } catch (error) {
      console.error('Error running report:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveReport = async () => {
    if (!reportName.trim()) return;
    try {
      setSaving(true);
      await entityCreate<any>("reports", {
        name: reportName,
        entity_type: entityType,
        fields: selectedFields,
        filters,
        sort_by: sortBy,
        sort_order: sortOrder,
        group_by: groupBy,
        visualization_type: visualization
      });
      alert('Report saved successfully!');
    } catch (error) {
      console.error('Error saving report:', error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Configuration Card */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="bg-gradient-to-r from-indigo-50 to-blue-50">
          <CardTitle className="flex items-center justify-between">
            <span>Report Configuration</span>
            <div className="flex gap-2">
              <Button
                onClick={runReport}
                disabled={loading || selectedFields.length === 0}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {loading ? <Loader className="w-4 h-4 animate-spin mr-2" /> : null}
                Run Report
              </Button>
              <Button
                onClick={saveReport}
                disabled={saving || !reportName.trim()}
                variant="outline"
              >
                {saving ? <Loader className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                Save Report
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Report Name</label>
              <Input
                value={reportName}
                onChange={(e) => setReportName(e.target.value)}
                placeholder="e.g., Q1 Sales Pipeline"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Entity Type</label>
              <Select value={entityType} onValueChange={setEntityType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {['Lead', 'Account', 'Contact', 'Deal', 'Activity'].map(type => (
                    <SelectItem key={type} value={type}>{type}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Visualization</label>
              <Select value={visualization} onValueChange={setVisualization}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {['table', 'bar', 'line', 'pie', 'area'].map(type => (
                    <SelectItem key={type} value={type}>{type}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Sort By</label>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  {fields.map(f => (
                    <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Sort Order</label>
              <Select value={sortOrder} onValueChange={setSortOrder}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="asc">Ascending</SelectItem>
                  <SelectItem value="desc">Descending</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Group By</label>
              <Select value={groupBy} onValueChange={setGroupBy}>
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  {fields.map(f => (
                    <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Fields to Include</label>
            <div className="flex flex-wrap gap-2">
              {fields.map(field => (
                <Button
                  key={field.key}
                  variant={selectedFields.includes(field.key) ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    if (selectedFields.includes(field.key)) {
                      setSelectedFields(selectedFields.filter(f => f !== field.key));
                    } else {
                      setSelectedFields([...selectedFields, field.key]);
                    }
                  }}
                >
                  {field.label}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      {fields.length > 0 && <ReportFilters fields={fields} onFiltersChange={setFilters} />}

      {/* Results */}
      {data.length > 0 && (
        <>
          <ReportVisualizer
            data={data}
            fields={fields}
            visualization={visualization}
            groupBy={groupBy}
          />

          <Card className="border-0 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Export Results</CardTitle>
              <ReportExporter data={data} reportName={reportName} />
            </CardHeader>
          </Card>
        </>
      )}
    </div>
  );
}