import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Filter, Save } from "lucide-react";

interface SearchResult {
  type: string;
  name: string;
  company: string;
  value: string;
  score: number;
}

export default function AdvancedSearch() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filters, setFilters] = useState({
    status: "all",
    value: "all",
    stage: "all",
  });

  const searchResults: SearchResult[] = [
    { type: "Lead", name: "משה כהן", company: "Tech Solutions", value: "50K", score: 95 },
    { type: "Contact", name: "דינה רוזנברג", company: "ABC Corp", value: "120K", score: 88 },
    { type: "Deal", name: "Enterprise Package", company: "XYZ Inc", value: "300K", score: 92 },
  ];

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Search className="w-5 h-5 text-cyan-600" />
          Advanced Search & Filters
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <div className="flex-1">
            <Input
              placeholder="Search leads, deals, contacts... (uses AI NLP)"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full"
            />
          </div>
          <Button className="bg-cyan-600">
            <Search className="w-4 h-4" />
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <select className="text-xs border rounded px-2 py-1">
            <option>Status: All</option>
            <option>Active</option>
            <option>Inactive</option>
          </select>
          <select className="text-xs border rounded px-2 py-1">
            <option>Value: All</option>
            <option>&lt;50K</option>
            <option>50K-200K</option>
            <option>&gt;200K</option>
          </select>
          <select className="text-xs border rounded px-2 py-1">
            <option>Stage: All</option>
            <option>Prospecting</option>
            <option>Negotiation</option>
          </select>
        </div>

        <div className="space-y-2">
          {searchResults.map((result, idx) => (
            <div key={idx} className="p-3 border border-slate-200 rounded-lg hover:bg-slate-50">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <Badge className="text-xs mb-1">{result.type}</Badge>
                  <p className="font-medium text-slate-900 text-sm">{result.name}</p>
                  <p className="text-xs text-slate-500">{result.company} - {result.value}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-bold text-cyan-600">{result.score}%</p>
                  <p className="text-xs text-slate-500">match</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <Button variant="outline" className="w-full" size="sm">
          <Save className="w-4 h-4 ml-1" />
          Save This Search
        </Button>
      </CardContent>
    </Card>
  );
}
