import { useState, useCallback, createContext, useContext, useRef, useEffect } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { AlertTriangle, Trash2, Info } from "lucide-react";

type ConfirmVariant = "danger" | "warning" | "info";

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: ConfirmVariant;
}

interface ConfirmContextType {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextType | null>(null);

let globalConfirmFn: ((options: ConfirmOptions) => Promise<boolean>) | null = null;

export function useConfirmDialog() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirmDialog must be inside ConfirmDialogProvider");
  return ctx;
}

export async function globalConfirm(message: string): Promise<boolean> {
  if (globalConfirmFn) {
    return globalConfirmFn({ message, variant: "danger", title: "אישור מחיקה", confirmText: "מחק", cancelText: "ביטול" });
  }
  return false;
}

const variantConfig: Record<ConfirmVariant, { icon: typeof Trash2; iconBg: string; iconColor: string; actionClass: string }> = {
  danger: {
    icon: Trash2,
    iconBg: "bg-red-500/20",
    iconColor: "text-red-400",
    actionClass: "bg-red-600 text-white hover:bg-red-700 focus:ring-red-500",
  },
  warning: {
    icon: AlertTriangle,
    iconBg: "bg-amber-500/20",
    iconColor: "text-amber-400",
    actionClass: "bg-amber-600 text-white hover:bg-amber-700 focus:ring-amber-500",
  },
  info: {
    icon: Info,
    iconBg: "bg-blue-500/20",
    iconColor: "text-blue-400",
    actionClass: "bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500",
  },
};

export function ConfirmDialogProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions>({
    message: "",
    variant: "danger",
  });
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    setOptions(opts);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  useEffect(() => {
    globalConfirmFn = confirm;
    return () => { globalConfirmFn = null; };
  }, [confirm]);

  const handleConfirm = () => {
    setOpen(false);
    resolveRef.current?.(true);
    resolveRef.current = null;
  };

  const handleCancel = () => {
    setOpen(false);
    resolveRef.current?.(false);
    resolveRef.current = null;
  };

  const variant = options.variant || "danger";
  const cfg = variantConfig[variant];
  const Icon = cfg.icon;

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      <AlertDialog open={open} onOpenChange={(v) => { if (!v) handleCancel(); }}>
        <AlertDialogContent dir="rtl" className="max-w-md">
          <AlertDialogHeader>
            <div className="flex items-start gap-4">
              <div className={`flex-shrink-0 w-12 h-12 rounded-full ${cfg.iconBg} flex items-center justify-center`}>
                <Icon className={cfg.iconColor} size={24} />
              </div>
              <div className="flex-1 pt-1">
                <AlertDialogTitle className="text-lg font-bold">
                  {options.title || (variant === "danger" ? "אישור מחיקה" : variant === "warning" ? "אזהרה" : "אישור")}
                </AlertDialogTitle>
                <AlertDialogDescription className="mt-2 text-sm text-muted-foreground leading-relaxed">
                  {options.message}
                </AlertDialogDescription>
              </div>
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2 sm:flex-row-reverse mt-2">
            <AlertDialogAction
              onClick={handleConfirm}
              className={`px-5 py-2.5 rounded-lg font-medium text-sm transition-all ${cfg.actionClass}`}
            >
              {options.confirmText || (variant === "danger" ? "מחק" : "אישור")}
            </AlertDialogAction>
            <AlertDialogCancel
              onClick={handleCancel}
              className="px-5 py-2.5 rounded-lg font-medium text-sm bg-card border border-border text-foreground hover:bg-muted/30"
            >
              {options.cancelText || "ביטול"}
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  );
}
