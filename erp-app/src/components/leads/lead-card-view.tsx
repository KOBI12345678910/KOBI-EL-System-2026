import { useState } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader, User, Settings } from 'lucide-react';

interface LeadCardViewProps {
  leadId: string;
}

export default function LeadCardView({ leadId }: LeadCardViewProps) {
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [editMode, setEditMode] = useState(false);

  // Placeholder - would use a real hook
  const data: any = null;
  const loading = false;
  const error: string | null = null;

  if (loading) {
    return (
      <Card className="border-0 shadow-sm">
        <CardContent className="p-8 flex items-center justify-center">
          <Loader className="w-5 h-5 animate-spin text-slate-600 mr-2" />
          <span className="text-slate-600">Loading lead information...</span>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-0 shadow-sm bg-red-50">
        <CardContent className="p-6"><p className="text-red-700">Error: {error}</p></CardContent>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card className="border-0 shadow-sm bg-slate-50">
        <CardContent className="p-6 text-center"><p className="text-slate-600">No lead data available</p></CardContent>
      </Card>
    );
  }

  const lead = data.lead;

  return (
    <div className="space-y-4">
      <Card className="border-0 shadow-md bg-gradient-to-r from-blue-50 to-indigo-50">
        <CardContent className="p-6">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 rounded-lg bg-gradient-to-br from-indigo-400 to-blue-500 flex items-center justify-center flex-shrink-0">
                <User className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-slate-900">{lead.name}</h1>
                <p className="text-slate-600">{lead.email}</p>
                <div className="flex gap-2 mt-2">
                  <Badge className="bg-blue-100 text-blue-700">{lead.status}</Badge>
                  {lead.lead_source && <Badge variant="outline">{lead.lead_source}</Badge>}
                  {lead.lead_score && <Badge className="bg-amber-100 text-amber-700">Score: {lead.lead_score}/100</Badge>}
                </div>
              </div>
            </div>
            <Button onClick={() => setEditMode(!editMode)} variant={editMode ? "default" : "outline"} className={editMode ? "bg-indigo-600 hover:bg-indigo-700" : ""}>
              <Settings className="w-4 h-4 mr-2" />{editMode ? 'Done Editing' : 'Edit'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="details" className="w-full">
        <TabsList className="grid w-full grid-cols-4 gap-2">
          <TabsTrigger value="details">Lead Details</TabsTrigger>
          <TabsTrigger value="custom">Custom Fields</TabsTrigger>
          <TabsTrigger value="ai">AI Assistant</TabsTrigger>
          <TabsTrigger value="actions">Suggested Actions</TabsTrigger>
        </TabsList>
        <TabsContent value="details">
          <Card><CardContent className="p-6"><p className="text-slate-500">Lead details view</p></CardContent></Card>
        </TabsContent>
        <TabsContent value="custom">
          <Card><CardContent className="p-6"><p className="text-slate-500">Custom fields view</p></CardContent></Card>
        </TabsContent>
        <TabsContent value="ai">
          <Card><CardContent className="p-6"><p className="text-slate-500">AI Assistant view</p></CardContent></Card>
        </TabsContent>
        <TabsContent value="actions">
          <Card><CardContent className="p-6"><p className="text-slate-500">Suggested actions view</p></CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
