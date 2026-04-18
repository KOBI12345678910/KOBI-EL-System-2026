import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight } from "lucide-react";

export default function LeadIntakeDiagram({ leads, customers }) {
  const stats = {
    website: leads.filter((l) => l.source === "website").length,
    facebook: leads.filter((l) => l.source === "facebook").length,
    whatsapp: leads.filter((l) => l.source === "whatsapp").length,
    phone: leads.filter((l) => l.source === "phone").length,
    import: leads.filter((l) => l.source === "import").length,
    gmail: leads.filter((l) => l.source === "gmail").length,
    total: leads.length,
    managerQueue: leads.filter((l) => l.stage === "new").length,
    assigned: leads.filter((l) => l.owner_id).length,
    contacted: leads.filter((l) => l.stage === "contacted").length,
    qualified: leads.filter((l) => l.stage === "qualified").length,
    converted: customers.length,
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-lg border-2 border-slate-200">
        <h3 className="font-bold text-lg mb-4">📥 Lead Sources</h3>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          {[
            { name: "Website", icon: "🌐", count: stats.website },
            { name: "Facebook", icon: "👍", count: stats.facebook },
            { name: "WhatsApp", icon: "💬", count: stats.whatsapp },
            { name: "Phone", icon: "☎️", count: stats.phone },
            { name: "Import", icon: "📤", count: stats.import },
            { name: "Gmail", icon: "📧", count: stats.gmail },
          ].map((source) => (
            <div
              key={source.name}
              className="p-3 bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg border-2 border-blue-300 text-center"
            >
              <div className="text-2xl mb-1">{source.icon}</div>
              <p className="text-xs text-slate-600">{source.name}</p>
              <p className="text-lg font-bold text-blue-900">{source.count}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <div className="flex-1 p-4 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg font-bold text-center">
            📋 Lead Created
          </div>
          <ArrowRight className="w-6 h-6 text-slate-400" />
          <div className="flex-1 p-4 bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-lg font-bold text-center">
            🔍 Duplicate Check
          </div>
          <ArrowRight className="w-6 h-6 text-slate-400" />
          <div className="flex-1 p-4 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg font-bold text-center">
            ✅ Merge/Link
          </div>
        </div>

        <div className="p-6 bg-white rounded-lg border-2 border-amber-300">
          <h3 className="font-bold text-lg mb-3">📋 Manager Queue</h3>
          <div className="flex items-center justify-between">
            <div className="flex-1 p-3 bg-amber-50 rounded-lg border border-amber-300 text-center">
              <p className="text-sm text-slate-600">In Queue</p>
              <p className="text-2xl font-bold text-amber-900">{stats.managerQueue}</p>
            </div>
            <ArrowRight className="w-6 h-6 text-slate-400 mx-4" />
            <div className="flex-1 p-3 bg-green-50 rounded-lg border border-green-300 text-center">
              <p className="text-sm text-slate-600">Assigned</p>
              <p className="text-2xl font-bold text-green-900">{stats.assigned}</p>
            </div>
          </div>
        </div>

        <div className="p-6 bg-white rounded-lg border-2 border-blue-300">
          <h3 className="font-bold text-lg mb-3">📊 Lead Pipeline</h3>
          <div className="grid grid-cols-4 gap-3">
            {[
              { name: "Contacted", count: stats.contacted, color: "blue" },
              { name: "Qualified", count: stats.qualified, color: "green" },
              { name: "Proposal", count: 0, color: "purple" },
              { name: "Won", count: 0, color: "amber" },
            ].map((stage) => (
              <div key={stage.name} className="p-3 bg-slate-50 rounded-lg border border-slate-300 text-center">
                <p className="text-sm text-slate-600">{stage.name}</p>
                <p className="text-2xl font-bold text-slate-900">{stage.count}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="p-6 bg-white rounded-lg border-2 border-green-300">
          <h3 className="font-bold text-lg mb-3">🔄 Convert to Customer</h3>
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 bg-amber-50 rounded-lg border border-amber-300 text-center">
              <p className="text-sm text-slate-600">Qualified</p>
              <p className="text-2xl font-bold text-amber-900">{stats.qualified}</p>
            </div>
            <div className="flex items-center justify-center">
              <ArrowRight className="w-6 h-6 text-slate-400" />
            </div>
            <div className="p-3 bg-green-50 rounded-lg border border-green-300 text-center">
              <p className="text-sm text-slate-600">Customers</p>
              <p className="text-2xl font-bold text-green-900">{stats.converted}</p>
            </div>
          </div>
        </div>
      </div>

      <Card className="border-0 shadow-lg bg-gradient-to-r from-slate-50 to-slate-100">
        <CardContent className="p-6">
          <h3 className="font-bold text-lg mb-4">📊 Summary</h3>
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: "Total Leads", value: stats.total },
              { label: "In Pipeline", value: stats.assigned },
              { label: "Conversion", value: `${((stats.converted / stats.total) * 100 || 0).toFixed(1)}%` },
              { label: "Customers", value: stats.converted },
            ].map((item, idx) => (
              <div key={idx} className="text-center">
                <p className="text-sm text-slate-600">{item.label}</p>
                <p className="text-3xl font-bold text-slate-900">{item.value}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}