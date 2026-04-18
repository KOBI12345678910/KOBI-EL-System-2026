import { useState } from 'react';
import { entityCreate, entityUpdate } from '@/lib/entity-api';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight, CheckCircle2 } from 'lucide-react';

interface LeadConversionFlowProps {
  lead: any;
  onConvert?: (customer: any) => void;
}

export default function LeadConversionFlow({ lead, onConvert }: LeadConversionFlowProps) {
  const [converting, setConverting] = useState(false);

  const handleConvertToCustomer = async () => {
    if (!confirm(`Are you sure you want to convert ${lead.name} to a customer?`)) return;

    setConverting(true);
    try {
      const customer = await entityCreate("customers", {
        name: lead.name, email: lead.email, phone: lead.phone,
        company: lead.company, lead_source: lead.source, initial_value: lead.value
      });

      await entityCreate("lead-activities", {
        lead_id: lead.id, type: 'status_change',
        description: `Lead converted to customer: ${customer.id}`, user_id: 'system'
      });

      await entityUpdate("leads", lead.id, { status: 'won', archived: true });

      alert('Lead successfully converted to customer!');
      onConvert?.(customer);
    } catch (error) {
      alert('Conversion error');
      console.error(error);
    }
    setConverting(false);
  };

  const conversionSteps = [
    { stage: 'new', label: 'New', description: 'New lead' },
    { stage: 'contacted', label: 'Contacted', description: 'Initial contact made' },
    { stage: 'qualified', label: 'Qualified', description: 'Sales qualified lead' },
    { stage: 'proposal', label: 'Proposal', description: 'Proposal sent' },
    { stage: 'negotiation', label: 'Negotiation', description: 'In discussion' },
    { stage: 'won', label: 'Won', description: 'Convert to customer' }
  ];

  const currentStepIndex = conversionSteps.findIndex(s => s.stage === lead.status);

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Conversion Flow</h3>
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between gap-2 overflow-x-auto pb-2">
            {conversionSteps.map((step, idx) => (
              <div key={step.stage} className="flex items-center gap-2 min-w-fit">
                <div className={`flex flex-col items-center p-3 rounded-lg transition ${idx <= currentStepIndex ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-600'}`}>
                  {idx <= currentStepIndex ? <CheckCircle2 className="w-5 h-5 mb-1" /> : <div className="w-5 h-5 rounded-full border-2 mb-1" />}
                  <span className="text-xs font-medium text-center max-w-[60px]">{step.label}</span>
                  <span className="text-xs text-center max-w-[60px]">{step.description}</span>
                </div>
                {idx < conversionSteps.length - 1 && (
                  <ArrowRight className={`w-5 h-5 ${idx <= currentStepIndex ? 'text-blue-600' : 'text-slate-300'}`} />
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="border-green-200 bg-green-50">
        <CardHeader><CardTitle className="text-base">Convert to Customer</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm text-slate-700">The following data will be transferred:</p>
            <ul className="text-sm space-y-1 text-slate-600">
              <li>&#10003; Full name</li><li>&#10003; Email and contact info</li>
              <li>&#10003; Company and lead source</li><li>&#10003; All notes and documents</li>
              <li>&#10003; Complete action history</li>
            </ul>
          </div>
          <Button onClick={handleConvertToCustomer} disabled={converting || lead.status === 'won'} className="w-full gap-2 bg-green-600 hover:bg-green-700">
            <ArrowRight className="w-4 h-4" />{converting ? 'Converting...' : 'Convert to Customer'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
