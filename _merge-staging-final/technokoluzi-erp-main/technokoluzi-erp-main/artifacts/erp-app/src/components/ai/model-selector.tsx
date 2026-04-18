import { useQuery } from "@tanstack/react-query";
import { entityFilter } from "@/lib/entity-api";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Zap, DollarSign } from "lucide-react";

interface AIModel {
  id: string;
  name: string;
  provider: string;
  max_tokens: number;
  cost_per_1k_tokens: number;
  use_case?: string;
  is_active?: boolean;
}

interface ModelSelectorProps {
  value?: string;
  onChange?: (value: string) => void;
  useCase?: string;
}

export default function ModelSelector({
  value,
  onChange,
  useCase = "general",
}: ModelSelectorProps) {
  const { data: models = [] } = useQuery<AIModel[]>({
    queryKey: ["ai_models", useCase],
    queryFn: () =>
      entityFilter<AIModel>("ai-model-configs", {
        use_case: useCase,
        is_active: true,
      }),
  });

  const selectedModel = models.find((m) => m.id === value);

  return (
    <div className="space-y-2">
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder="בחר מודל AI" />
        </SelectTrigger>
        <SelectContent>
          {models.map((model) => (
            <SelectItem key={model.id} value={model.id}>
              <div className="flex items-center gap-2">
                <span>{model.name}</span>
                <Badge variant="outline" className="text-xs">
                  {model.provider}
                </Badge>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {selectedModel && (
        <div className="flex items-center gap-3 text-xs text-slate-600">
          <div className="flex items-center gap-1">
            <Zap className="w-3 h-3" />
            {selectedModel.max_tokens} tokens
          </div>
          <div className="flex items-center gap-1">
            <DollarSign className="w-3 h-3" />
            \u20AA{selectedModel.cost_per_1k_tokens}/1k
          </div>
        </div>
      )}
    </div>
  );
}
