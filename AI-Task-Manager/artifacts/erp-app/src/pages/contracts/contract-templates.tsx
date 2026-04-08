import React, { useState, useEffect } from "react";
import { Plus, Edit, Trash2, Eye, Copy, FileText, Signature } from "lucide-react";
import { translateStatus } from "@/lib/status-labels";

interface Template {
  id: number;
  name: string;
  description?: string;
  category?: string;
  current_version: number;
  is_active: boolean;
  created_at: string;
}

interface SignatureWorkflow {
  id: number;
  workflow_name: string;
  status: string;
  signers: Array<{ id: number; signee_name: string; signee_email: string; status: string; signed_at?: string }>;
}

export default function ContractTemplates() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [workflows, setWorkflows] = useState<SignatureWorkflow[]>([]);
  const [activeTab, setActiveTab] = useState<"templates" | "e-signature" | "create">("templates");
  const [categories, setCategories] = useState<string[]>([]);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    category: "",
    templateContent: "",
    signatureFields: [] as Array<{ name: string; label: string }>,
  });
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);

  useEffect(() => {
    fetchTemplates();
    fetchCategories();
  }, []);

  const fetchTemplates = async () => {
    try {
      const response = await fetch("/api/contract-templates", {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      const data = await response.json();
      setTemplates(data.templates || []);
    } catch (error) {
      console.error("Error fetching templates:", error);
    }
  };

  const fetchCategories = async () => {
    try {
      const response = await fetch("/api/contract-templates/categories/list", {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      const data = await response.json();
      setCategories(data.categories || []);
    } catch (error) {
      console.error("Error fetching categories:", error);
    }
  };

  const handleCreateTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch("/api/contract-templates", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify(formData),
      });
      
      if (response.ok) {
        setFormData({
          name: "",
          description: "",
          category: "",
          templateContent: "",
          signatureFields: [],
        });
        setActiveTab("templates");
        fetchTemplates();
      }
    } catch (error) {
      console.error("Error creating template:", error);
    }
  };

  const addSignatureField = () => {
    setFormData({
      ...formData,
      signatureFields: [...formData.signatureFields, { name: "", label: "" }],
    });
  };

  const removeSignatureField = (index: number) => {
    setFormData({
      ...formData,
      signatureFields: formData.signatureFields.filter((_, i) => i !== index),
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-background p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-foreground">Contract Templates & E-Signature</h1>
          <button
            onClick={() => setActiveTab("create")}
            className="flex items-center gap-2 bg-blue-600 text-foreground px-4 py-2 rounded-lg hover:bg-blue-700"
          >
            <Plus className="w-5 h-5" />
            New Template
          </button>
        </div>

        <div className="flex gap-4 mb-8 border-b border-gray-200 dark:border-border">
          {["templates", "e-signature", "create"].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={`px-4 py-2 font-medium border-b-2 transition ${
                activeTab === tab
                  ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
                  : "border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-foreground"
              }`}
            >
              {tab === "templates" && "Templates"}
              {tab === "e-signature" && "E-Signature"}
              {tab === "create" && "Create"}
            </button>
          ))}
        </div>

        {/* Templates Tab */}
        {activeTab === "templates" && (
          <div className="bg-white dark:bg-muted rounded-lg shadow">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-muted border-b border-gray-200 dark:border-border">
                  <tr>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900 dark:text-foreground">Template Name</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900 dark:text-foreground">Category</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900 dark:text-foreground">Version</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900 dark:text-foreground">Status</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900 dark:text-foreground">Created</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900 dark:text-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {templates.map((template) => (
                    <tr key={template.id} className="hover:bg-gray-50 dark:hover:bg-muted">
                      <td className="px-6 py-4 text-sm text-gray-900 dark:text-foreground flex items-center gap-2">
                        <FileText className="w-4 h-4 text-blue-600" />
                        {template.name}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">{template.category || "-"}</td>
                      <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">v{template.current_version}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${template.is_active ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" : "bg-gray-100 text-gray-800 dark:bg-background dark:text-foreground"}`}>
                          {template.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">{new Date(template.created_at).toLocaleDateString()}</td>
                      <td className="px-6 py-4 text-sm flex gap-2">
                        <button className="text-blue-600 hover:text-blue-800 dark:text-blue-400">
                          <Eye className="w-4 h-4" />
                        </button>
                        <button className="text-green-600 hover:text-green-800 dark:text-green-400">
                          <Edit className="w-4 h-4" />
                        </button>
                        <button className="text-purple-600 hover:text-purple-800 dark:text-purple-400">
                          <Copy className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* E-Signature Tab */}
        {activeTab === "e-signature" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-6">
              {workflows.length > 0 ? (
                workflows.map((workflow) => (
                  <div key={workflow.id} className="bg-white dark:bg-muted rounded-lg shadow p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-foreground flex items-center gap-2">
                        <Signature className="w-5 h-5 text-blue-600" />
                        {workflow.workflow_name}
                      </h3>
                      <span className={`px-3 py-1 rounded-full text-sm font-medium ${workflow.status === "completed" ? "bg-green-100 text-green-800 dark:bg-green-900" : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900"}`}>
                        {translateStatus(workflow.status)}
                      </span>
                    </div>
                    
                    <div className="space-y-3">
                      {workflow.signers.map((signer, index) => (
                        <div key={signer.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-muted rounded">
                          <div className="flex items-center gap-3">
                            <div className="flex-shrink-0">
                              {signer.status === "signed" ? (
                                <span className="inline-block w-6 h-6 bg-green-100 text-green-800 rounded-full flex items-center justify-center text-sm font-bold">✓</span>
                              ) : (
                                <span className="inline-block w-6 h-6 bg-gray-300 rounded-full flex items-center justify-center text-sm font-bold">{index + 1}</span>
                              )}
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-900 dark:text-foreground">{signer.signee_name}</p>
                              <p className="text-xs text-gray-500 dark:text-gray-400">{signer.signee_email}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">{signer.status.toUpperCase()}</p>
                            {signer.signed_at && <p className="text-xs text-gray-500">{new Date(signer.signed_at).toLocaleDateString()}</p>}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-4 pt-4 border-t border-gray-200 dark:border-border">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600 dark:text-gray-400">Progress</span>
                        <span className="font-semibold text-gray-900 dark:text-foreground">
                          {Math.round((workflow.signers.filter(s => s.status === "signed").length / workflow.signers.length) * 100)}%
                        </span>
                      </div>
                      <div className="mt-2 bg-gray-200 dark:bg-muted rounded-full h-2">
                        <div
                          className="bg-green-500 h-2 rounded-full transition-all"
                          style={{
                            width: `${(workflow.signers.filter(s => s.status === "signed").length / workflow.signers.length) * 100}%`,
                          }}
                        ></div>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-12">
                  <p className="text-gray-500 dark:text-gray-400">No active signature workflows</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Create Template Tab */}
        {activeTab === "create" && (
          <div className="bg-white dark:bg-muted rounded-lg shadow p-8">
            <form onSubmit={handleCreateTemplate} className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Template Name</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-border rounded-lg dark:bg-muted dark:text-foreground"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Category</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-border rounded-lg dark:bg-muted dark:text-foreground"
                  >
                    <option value="">Select or type category</option>
                    {categories.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-border rounded-lg dark:bg-muted dark:text-foreground"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Template Content</label>
                <textarea
                  value={formData.templateContent}
                  onChange={(e) => setFormData({ ...formData, templateContent: e.target.value })}
                  rows={10}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-border rounded-lg dark:bg-muted dark:text-foreground font-mono text-sm"
                  placeholder="Use {VARIABLE_NAME} for placeholders"
                  required
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-4">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Signature Fields</label>
                  <button
                    type="button"
                    onClick={addSignatureField}
                    className="text-blue-600 hover:text-blue-800 dark:text-blue-400 text-sm font-medium"
                  >
                    + Add Field
                  </button>
                </div>
                
                <div className="space-y-3">
                  {formData.signatureFields.map((field, index) => (
                    <div key={index} className="flex gap-2 items-end">
                      <input
                        type="text"
                        placeholder="Field name (e.g., authorizedSignature)"
                        value={field.name}
                        onChange={(e) => {
                          const newFields = [...formData.signatureFields];
                          newFields[index].name = e.target.value;
                          setFormData({ ...formData, signatureFields: newFields });
                        }}
                        className="flex-1 px-4 py-2 border border-gray-300 dark:border-border rounded-lg dark:bg-muted dark:text-foreground text-sm"
                      />
                      <input
                        type="text"
                        placeholder="Label (e.g., Authorized Signature)"
                        value={field.label}
                        onChange={(e) => {
                          const newFields = [...formData.signatureFields];
                          newFields[index].label = e.target.value;
                          setFormData({ ...formData, signatureFields: newFields });
                        }}
                        className="flex-1 px-4 py-2 border border-gray-300 dark:border-border rounded-lg dark:bg-muted dark:text-foreground text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => removeSignatureField(index)}
                        className="px-3 py-2 text-red-600 hover:text-red-800 dark:text-red-400"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <button type="submit" className="w-full bg-blue-600 text-foreground py-2 rounded-lg hover:bg-blue-700 font-medium">
                Create Template
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
