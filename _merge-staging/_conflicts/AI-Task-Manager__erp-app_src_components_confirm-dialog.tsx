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
  itemName?: string;
  entityType?: string;
  requireTypedConfirm?: boolean;
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

export async function globalConfirm(message: string, options?: Partial<ConfirmOptions>): Promise<boolean> {
  if (globalConfirmFn) {
    return globalConfirmFn({
      message,
      variant: "danger",
      title: "אישור מחיקה",
      confirmText: "מחק",
      cancelText: "ביטול",
      requireTypedConfirm: true,
      ...options,
    });
  }
  return false;
}

const variantConfig: Record<ConfirmVariant, { icon: typeof Trash2; iconBg: string; iconColor: string; actionClass: string }> = {
  danger: {
    icon: Trash2,
    iconBg: "bg-red-500/20",
    iconColor: "text-red-400",
    actionClass: "bg-red-600 text-foreground hover:bg-red-700 focus:ring-red-500",
  },
  warning: {
    icon: AlertTriangle,
    iconBg: "bg-amber-500/20",
    iconColor: "text-amber-400",
    actionClass: "bg-amber-600 text-foreground hover:bg-amber-700 focus:ring-amber-500",
  },
  info: {
    icon: Info,
    iconBg: "bg-blue-500/20",
    iconColor: "text-blue-400",
    actionClass: "bg-blue-600 text-foreground hover:bg-blue-700 focus:ring-blue-500",
  },
};

const CONFIRM_WORD = "מחק";

export function ConfirmDialogProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions>({
    message: "",
    variant: "danger",
  });
  const [typedValue, setTypedValue] = useState("");
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    setOptions(opts);
    setTypedValue("");
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
    if (options.requireTypedConfirm && typedValue !== CONFIRM_WORD) return;
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
  const canConfirm = !options.requireTypedConfirm || typedValue === CONFIRM_WORD;

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      <AlertDialog open={open} onOpenChange={(v) => { if (!v) handleCancel(); }}>
        <AlertDialogContent className="max-w-md">
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
                {options.itemName && (
                  <div className="mt-2 px-3 py-2 bg-muted/50 rounded-lg border border-border/50">
                    <span className="text-xs text-muted-foreground">פריט: </span>
                    <span className="text-sm font-semibold text-foreground">{options.itemName}</span>
                    {options.entityType && (
                      <span className="text-xs text-muted-foreground mr-2">({options.entityType})</span>
                    )}
                  </div>
                )}
                {options.requireTypedConfirm && (
                  <div className="mt-3">
                    <p className="text-xs text-muted-foreground mb-1.5">
                      להמשך, הקלד <strong className="text-red-400 font-bold">{CONFIRM_WORD}</strong> בשדה הבא:
                    </p>
                    <input
                      type="text"
                      value={typedValue}
                      onChange={(e) => setTypedValue(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && canConfirm) handleConfirm(); }}
                      placeholder={CONFIRM_WORD}
                      dir="rtl"
                      autoFocus
                      className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500"
                    />
                  </div>
                )}
              </div>
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2 sm:flex-row-reverse mt-2">
            <AlertDialogAction
              onClick={handleConfirm}
              disabled={!canConfirm}
              className={`px-5 py-2.5 rounded-lg font-medium text-sm transition-all ${cfg.actionClass} disabled:opacity-40 disabled:cursor-not-allowed`}
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
