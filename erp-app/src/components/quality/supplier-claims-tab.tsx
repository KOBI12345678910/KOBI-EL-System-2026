import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import DataTable from '../common/DataTable';
import StatusBadge from '../common/StatusBadge';
import { Button } from "@/components/ui/button";
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Pencil, Send } from 'lucide-react';
import { entityList, entityUpdate } from "@/lib/entity-api";

export default function SupplierClaimsTab() {
    const queryClient = useQueryClient();

    const { data: claims = [], isLoading } = useQuery({
        queryKey: ['supplier_quality_claims'],
        queryFn: () => entityList<any>("supplier-quality-claims", '-created_date')
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, data }) => entityUpdate<any>("supplier-quality-claims", id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['supplier_quality_claims'] });
            toast.success('תביעה עודכנה');
        }
    });

    const handleSubmit = (claim) => {
        updateMutation.mutate({
            id: claim.id,
            data: { ...claim, status: 'submitted' }
        });
        toast.success('תביעה נשלחה לספק');
    };

    const columns = [
        { key: 'claim_number', label: 'מספר', render: (v) => <span className="font-mono">{v}</span> },
        { key: 'supplier_name', label: 'ספק' },
        { key: 'type', label: 'סוג', render: (v) => v?.replace(/_/g, ' ') },
        { key: 'status', label: 'סטטוס', render: (v) => <StatusBadge status={v} /> },
        { key: 'financial_impact', label: 'השפעה כספית', render: (v) => `₪${v?.toLocaleString() || 0}` },
        { key: 'claim_date', label: 'תאריך', render: (v) => v ? format(new Date(v), 'dd/MM/yy') : '-' }
    ];

    const actions = [
        { label: 'שלח', icon: Send, onClick: handleSubmit, show: (d) => d.status === 'open' }
    ];

    return (
        <>
            <div className="mb-4">
                <Button onClick={() => toast.info('ממשק יצירת תביעה יתווסף בקרוב')}>
                    תביעה חדשה
                </Button>
            </div>

            <DataTable
                data={claims}
                columns={columns}
                actions={actions}
                searchPlaceholder="חיפוש תביעות..."
                isLoading={isLoading}
            />
        </>
    );
}