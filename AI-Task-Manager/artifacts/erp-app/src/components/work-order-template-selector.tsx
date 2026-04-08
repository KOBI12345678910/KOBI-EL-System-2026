import { useState } from "react";
import { WORK_ORDER_TEMPLATES, applyTemplate } from "@/lib/work-order-templates";
import { Zap, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface TemplateSelectorProps {
  onSelect: (template: any) => void;
  onClose: () => void;
}

export default function WorkOrderTemplateSelector({ onSelect, onClose }: TemplateSelectorProps) {
  const [selected, setSelected] = useState<string | null>(null);

  const handleSelect = (templateId: string) => {
    const template = WORK_ORDER_TEMPLATES.find(t => t.id === templateId);
    if (template) {
      onSelect(applyTemplate(template));
      onClose();
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9 }}
        animate={{ scale: 1 }}
        exit={{ scale: 0.9 }}
        className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Zap size={20} className="text-yellow-500" />
            בחר תבנית עבודה
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-muted/50 rounded"><X size={20} /></button>
        </div>

        <p className="text-sm text-muted-foreground mb-4">
          בחר תבנית לקבל הגדרות מוכנות מראש ושמור זמן בהוראה חדשה
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-96 overflow-y-auto">
          {WORK_ORDER_TEMPLATES.map(template => (
            <button
              key={template.id}
              onClick={() => setSelected(template.id)}
              className={`text-right p-4 rounded-lg border-2 transition-all ${
                selected === template.id
                  ? "border-blue-500 bg-blue-50 dark:bg-blue-950"
                  : "border-border hover:border-blue-300"
              }`}
            >
              <div className="font-bold text-sm mb-1">{template.name}</div>
              <div className="text-xs text-muted-foreground mb-2">{template.description}</div>
              <div className="flex flex-wrap gap-1">
                {template.fields.orderType && (
                  <span className="bg-muted text-xs px-2 py-0.5 rounded">
                    {template.fields.orderType}
                  </span>
                )}
                {template.fields.estimatedHours && (
                  <span className="bg-muted text-xs px-2 py-0.5 rounded">
                    {template.fields.estimatedHours}h
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>

        <div className="flex gap-2 mt-6 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-border hover:bg-muted"
          >
            ביטול
          </button>
          <button
            onClick={() => selected && handleSelect(selected)}
            disabled={!selected}
            className="px-4 py-2 rounded-lg bg-blue-500 text-foreground hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            החל תבנית
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
