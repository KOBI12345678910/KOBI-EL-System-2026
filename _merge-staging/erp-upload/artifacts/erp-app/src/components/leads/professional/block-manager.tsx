import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { entityFilter, entityCreate, entityDelete, entityUpdate } from "@/lib/entity-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Eye, EyeOff, GripVertical } from "lucide-react";
import { toast } from "sonner";
import KPIBlock from "./blocks/kpi-block";
import AIAnalysisBlock from "./blocks/ai-analysis-block";
import ProductsInterestBlock from "./blocks/products-interest-block";
import MeasurementHistoryBlock from "./blocks/measurement-history-block";
import DrawingFilesBlock from "./blocks/drawing-files-block";
import CustomFieldBlock from "./blocks/custom-field-block";
import FinancialNotesBlock from "./blocks/financial-notes-block";
import CompetitorsLogBlock from "./blocks/competitors-log-block";
import ProfitabilityCalcBlock from "./blocks/profitability-calc-block";
import type { LeadPermissions } from "./use-lead-permissions";
import type { ComponentType } from "react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface BlockRecord {
  id: string;
  lead_id: string;
  block_type: string;
  block_name: string;
  order: number;
  is_visible: boolean;
  permissions: {
    view_roles: string[];
    edit_roles: string[];
  };
}

interface BlockComponentProps {
  block: BlockRecord;
  leadId: string;
  canEdit: boolean;
  permissions: LeadPermissions;
}

interface BlockManagerProps {
  leadId: string;
  permissions: LeadPermissions;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const BLOCK_TYPES = [
  { value: "kpi", label: "\uD83D\uDCCA \u05D1\u05DC\u05D5\u05E7 KPI", icon: "\uD83D\uDCCA" },
  { value: "ai_analysis", label: "\uD83E\uDD16 \u05E0\u05D9\u05EA\u05D5\u05D7 AI", icon: "\uD83E\uDD16" },
  { value: "products_interest", label: "\uD83D\uDED2 \u05DE\u05D5\u05E6\u05E8\u05D9\u05DD \u05DE\u05EA\u05E2\u05E0\u05D9\u05D9\u05E0\u05D9\u05DD", icon: "\uD83D\uDED2" },
  { value: "measurement_history", label: "\uD83D\uDCCF \u05D4\u05D9\u05E1\u05D8\u05D5\u05E8\u05D9\u05D9\u05EA \u05DE\u05D3\u05D9\u05D3\u05D5\u05EA", icon: "\uD83D\uDCCF" },
  { value: "drawing_files", label: "\uD83D\uDCD0 \u05E9\u05E8\u05D8\u05D5\u05D8\u05D9\u05DD", icon: "\uD83D\uDCD0" },
  { value: "custom_field", label: "\u2699\uFE0F \u05E9\u05D3\u05D4 \u05DE\u05D5\u05EA\u05D0\u05DD", icon: "\u2699\uFE0F" },
  { value: "financial_notes", label: "\uD83D\uDCB0 \u05D4\u05E2\u05E8\u05D5\u05EA \u05DB\u05E1\u05E4\u05D9\u05DD", icon: "\uD83D\uDCB0" },
  { value: "competitors_log", label: "\uD83C\uDFC6 \u05DE\u05EA\u05D7\u05E8\u05D9\u05DD", icon: "\uD83C\uDFC6" },
  { value: "profitability_calc", label: "\uD83D\uDCC8 \u05D7\u05D9\u05E9\u05D5\u05D1 \u05E8\u05D5\u05D5\u05D7\u05D9\u05D5\u05EA", icon: "\uD83D\uDCC8" },
];

const BLOCK_COMPONENTS: Record<string, ComponentType<BlockComponentProps>> = {
  kpi: KPIBlock as any,
  ai_analysis: AIAnalysisBlock as any,
  products_interest: ProductsInterestBlock as any,
  measurement_history: MeasurementHistoryBlock as any,
  drawing_files: DrawingFilesBlock as any,
  custom_field: CustomFieldBlock as any,
  financial_notes: FinancialNotesBlock as any,
  competitors_log: CompetitorsLogBlock as any,
  profitability_calc: ProfitabilityCalcBlock as any,
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function BlockManager({ leadId, permissions }: BlockManagerProps) {
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newBlock, setNewBlock] = useState({ block_type: "", block_name: "" });
  const queryClient = useQueryClient();

  const { data: blocks = [], isLoading } = useQuery<BlockRecord[]>({
    queryKey: ["leadCardBlocks", leadId],
    queryFn: () =>
      entityFilter<BlockRecord>("lead-card-blocks", { lead_id: leadId }).then((b) =>
        b.sort((a, b2) => a.order - b2.order)
      ),
    enabled: !!leadId,
  });

  const createBlockMutation = useMutation({
    mutationFn: (blockData: Omit<BlockRecord, "id">) =>
      entityCreate<BlockRecord>("lead-card-blocks", blockData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leadCardBlocks", leadId] });
      toast.success("\u05D1\u05DC\u05D5\u05E7 \u05E0\u05D5\u05E1\u05E3 \u05D1\u05D4\u05E6\u05DC\u05D7\u05D4");
      setAddDialogOpen(false);
      setNewBlock({ block_type: "", block_name: "" });
    },
  });

  const deleteBlockMutation = useMutation({
    mutationFn: (blockId: string) => entityDelete("lead-card-blocks", blockId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leadCardBlocks", leadId] });
      toast.success("\u05D1\u05DC\u05D5\u05E7 \u05D4\u05D5\u05E1\u05E8");
    },
  });

  const toggleVisibilityMutation = useMutation({
    mutationFn: ({ blockId, isVisible }: { blockId: string; isVisible: boolean }) =>
      entityUpdate<BlockRecord>("lead-card-blocks", blockId, { is_visible: isVisible }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["leadCardBlocks", leadId] }),
  });

  const handleAddBlock = () => {
    const blockConfig = BLOCK_TYPES.find((t) => t.value === newBlock.block_type);
    if (!blockConfig || !newBlock.block_name) {
      toast.error("\u05D9\u05E9 \u05DC\u05DE\u05DC\u05D0 \u05D0\u05EA \u05DB\u05DC \u05D4\u05E9\u05D3\u05D5\u05EA");
      return;
    }

    createBlockMutation.mutate({
      lead_id: leadId,
      block_type: newBlock.block_type,
      block_name: newBlock.block_name,
      order: blocks.length,
      is_visible: true,
      permissions: {
        view_roles: ["sales_rep", "manager", "admin"],
        edit_roles: ["manager", "admin"],
      },
    });
  };

  const canViewBlock = (block: BlockRecord): boolean => {
    if (!permissions.userRole) return false;
    return block.permissions?.view_roles?.includes(permissions.userRole) ?? true;
  };

  const canEditBlock = (block: BlockRecord): boolean => {
    return block.permissions?.edit_roles?.includes(permissions.userRole!) ?? permissions.isManager;
  };

  if (isLoading) {
    return <div className="text-center py-8 text-slate-500">\u05D8\u05D5\u05E2\u05DF \u05D1\u05DC\u05D5\u05E7\u05D9\u05DD...</div>;
  }

  return (
    <div className="space-y-4">
      {permissions.canAddModules && (
        <div className="flex justify-end">
          <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2">
                <Plus className="w-4 h-4" />
                \u05D4\u05D5\u05E1\u05E3 \u05D1\u05DC\u05D5\u05E7
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>\u05D4\u05D5\u05E1\u05E4\u05EA \u05D1\u05DC\u05D5\u05E7 \u05D7\u05D3\u05E9</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div>
                  <Label>\u05E1\u05D5\u05D2 \u05D4\u05D1\u05DC\u05D5\u05E7</Label>
                  <Select
                    value={newBlock.block_type}
                    onValueChange={(v) => setNewBlock({ ...newBlock, block_type: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="\u05D1\u05D7\u05E8 \u05E1\u05D5\u05D2 \u05D1\u05DC\u05D5\u05E7" />
                    </SelectTrigger>
                    <SelectContent>
                      {BLOCK_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>\u05E9\u05DD \u05D4\u05D1\u05DC\u05D5\u05E7</Label>
                  <Input
                    value={newBlock.block_name}
                    onChange={(e) => setNewBlock({ ...newBlock, block_name: e.target.value })}
                    placeholder="\u05DC\u05D3\u05D5\u05D2\u05DE\u05D4: KPI \u05DE\u05DB\u05D9\u05E8\u05D5\u05EA"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
                    \u05D1\u05D9\u05D8\u05D5\u05DC
                  </Button>
                  <Button onClick={handleAddBlock} disabled={createBlockMutation.isPending}>
                    \u05D4\u05D5\u05E1\u05E3 \u05D1\u05DC\u05D5\u05E7
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      )}

      {blocks.filter(canViewBlock).map((block) => {
        const BlockComponent = BLOCK_COMPONENTS[block.block_type];
        if (!BlockComponent) return null;

        return (
          <Card key={block.id} className={!block.is_visible ? "opacity-50" : ""}>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base font-medium flex items-center gap-2">
                <GripVertical className="w-4 h-4 text-slate-400" />
                {BLOCK_TYPES.find((t) => t.value === block.block_type)?.icon} {block.block_name}
              </CardTitle>
              {permissions.canAddModules && (
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() =>
                      toggleVisibilityMutation.mutate({
                        blockId: block.id,
                        isVisible: !block.is_visible,
                      })
                    }
                  >
                    {block.is_visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-red-600"
                    onClick={() => deleteBlockMutation.mutate(block.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </CardHeader>
            {block.is_visible && (
              <CardContent>
                <BlockComponent
                  block={block}
                  leadId={leadId}
                  canEdit={canEditBlock(block)}
                  permissions={permissions}
                />
              </CardContent>
            )}
          </Card>
        );
      })}

      {blocks.length === 0 && (
        <div className="text-center py-12 text-slate-400">
          <p>\u05D0\u05D9\u05DF \u05D1\u05DC\u05D5\u05E7\u05D9\u05DD \u05DE\u05D5\u05EA\u05D0\u05DE\u05D9\u05DD \u05E2\u05D3\u05D9\u05D9\u05DF</p>
          {permissions.canAddModules && (
            <p className="text-sm mt-2">\u05DC\u05D7\u05E5 \u05E2\u05DC &quot;\u05D4\u05D5\u05E1\u05E3 \u05D1\u05DC\u05D5\u05E7&quot; \u05DB\u05D3\u05D9 \u05DC\u05D4\u05EA\u05D7\u05D9\u05DC</p>
          )}
        </div>
      )}
    </div>
  );
}
