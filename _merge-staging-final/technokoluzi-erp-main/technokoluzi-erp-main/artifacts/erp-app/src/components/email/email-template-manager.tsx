import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Trash2, Plus, Save, Loader } from 'lucide-react';
import { entityCreate, entityDelete, entityList } from "@/lib/entity-api";

export default function EmailTemplateManager() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ name: '', subject: '', body: '', category: 'custom' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      setLoading(true);
      const data = await entityList<any>("email-templates");
      setTemplates(data);
    } catch (error) {
      console.error('Error loading templates:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!formData.name || !formData.subject || !formData.body) return;

    try {
      setSaving(true);
      await entityCreate<any>("email-templates", {
        name: formData.name,
        subject: formData.subject,
        body: formData.body,
        category: formData.category,
        is_active: true
      });
      
      loadTemplates();
      setShowForm(false);
      setFormData({ name: '', subject: '', body: '', category: 'custom' });
    } catch (error) {
      console.error('Error saving template:', error);
    } finally {
      setSaving(false);
    }
  };

  const deleteTemplate = async (id) => {
    if (!window.confirm('Delete this template?')) return;
    try {
      await entityDelete("email-templates", id);
      loadTemplates();
    } catch (error) {
      console.error('Error deleting template:', error);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-900">Email Templates</h2>
        <Button onClick={() => setShowForm(!showForm)} className="bg-blue-600 hover:bg-blue-700">
          <Plus className="w-4 h-4 mr-2" />
          New Template
        </Button>
      </div>

      {showForm && (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-6 space-y-4">
            <Input
              placeholder="Template name"
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
            />
            <Input
              placeholder="Subject line"
              value={formData.subject}
              onChange={(e) => setFormData({...formData, subject: e.target.value})}
            />
            <Select value={formData.category} onValueChange={(v) => setFormData({...formData, category: v})}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {['greeting', 'follow_up', 'proposal', 'negotiation', 'closing', 'custom'].map(cat => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Textarea
              placeholder="Email body (use {{firstName}}, {{email}}, {{companyName}})"
              value={formData.body}
              onChange={(e) => setFormData({...formData, body: e.target.value})}
              rows={8}
            />
            <div className="flex gap-2">
              <Button onClick={handleSave} disabled={saving} className="flex-1 bg-green-600 hover:bg-green-700">
                {saving ? <Loader className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                Save Template
              </Button>
              <Button onClick={() => setShowForm(false)} variant="outline">Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <Card className="border-0 shadow-sm bg-slate-50">
          <CardContent className="p-8 text-center">
            <p className="text-slate-600">Loading templates...</p>
          </CardContent>
        </Card>
      ) : templates.length === 0 ? (
        <Card className="border-0 shadow-sm bg-slate-50">
          <CardContent className="p-8 text-center">
            <p className="text-slate-600">No templates. Create one to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {templates.map(template => (
            <Card key={template.id} className="border-0 shadow-sm">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-semibold text-slate-900">{template.name}</h3>
                    <p className="text-sm text-slate-600 mt-1">Subject: {template.subject}</p>
                    <p className="text-sm text-slate-600 mt-1 line-clamp-2">{template.body}</p>
                    <div className="mt-3">
                      <Badge variant="outline">{template.category}</Badge>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteTemplate(template.id)}
                    className="text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}