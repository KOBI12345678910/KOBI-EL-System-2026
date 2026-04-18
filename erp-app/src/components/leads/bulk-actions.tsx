import { useState } from 'react';
import { entityUpdate, entityDelete } from '@/lib/entity-api';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Trash2, Edit2 } from 'lucide-react';

interface BulkActionsProps {
  selectedLeads: string[];
  onUpdate?: () => void;
}

export default function BulkActions({ selectedLeads, onUpdate }: BulkActionsProps) {
  const [loading, setLoading] = useState(false);

  if (selectedLeads.length === 0) return null;

  const updateStatus = async (newStatus: string) => {
    setLoading(true);
    try {
      await Promise.all(
        selectedLeads.map(id =>
          entityUpdate("leads", id, { status: newStatus })
        )
      );
      onUpdate?.();
    } finally {
      setLoading(false);
    }
  };

  const deleteLeads = async () => {
    if (window.confirm(`Delete ${selectedLeads.length} leads?`)) {
      setLoading(true);
      try {
        await Promise.all(
          selectedLeads.map(id => entityDelete("leads", id))
        );
        onUpdate?.();
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <Card className="bg-slate-50 border-slate-200">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-slate-900">
            {selectedLeads.length} selected
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={loading} onClick={() => updateStatus('contacted')}>
              <Edit2 className="w-4 h-4 mr-1" />Mark Contacted
            </Button>
            <Button size="sm" variant="outline" disabled={loading} onClick={() => updateStatus('qualified')}>
              Mark Qualified
            </Button>
            <Button size="sm" variant="destructive" disabled={loading} onClick={deleteLeads}>
              <Trash2 className="w-4 h-4 mr-1" />Delete
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
