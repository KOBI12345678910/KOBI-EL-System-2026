import { useState, useCallback, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { useConfirmDialog } from "@/components/confirm-dialog";
import { hebrewApiError } from "@/lib/error-utils";

interface ApiActionOptions {
  successMessage?: string;
  errorMessage?: string;
  onSuccess?: (data: any) => void;
  onError?: (error: string) => void;
  confirm?: string;
  itemName?: string;
  entityType?: string;
}

interface UseApiActionReturn {
  loading: boolean;
  loadingId: number | string | null;
  execute: (fn: (() => Promise<Response>) | string, options?: ApiActionOptions | string, p3?: string | (() => void), p4?: () => void) => Promise<boolean>;
  executeDelete: (fn: (() => Promise<Response>) | string, options?: ApiActionOptions | string, p3?: () => void) => Promise<boolean>;
  executeSave: (fn: (() => Promise<Response>) | string, isEditOrMethod?: boolean | string, optionsOrBody?: ApiActionOptions | any, p4?: string, p5?: () => void) => Promise<boolean>;
  isLoading: (id?: number | string) => boolean;
}

export function useApiAction(): UseApiActionReturn {
  const [loading, setLoading] = useState(false);
  const [loadingId, setLoadingId] = useState<number | string | null>(null);
  const { toast } = useToast();
  const { confirm } = useConfirmDialog();
  const abortRef = useRef(false);

  const getAuthHeaders = () => {
    const token = localStorage.getItem("token") || "";
    return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  };

  const execute = useCallback(async (
    fnOrUrl: (() => Promise<Response>) | string,
    optionsOrConfirm?: ApiActionOptions | string,
    p3?: string | (() => void),
    p4?: () => void
  ): Promise<boolean> => {
    let fn: () => Promise<Response>;
    let options: ApiActionOptions = {};
    if (typeof fnOrUrl === "string") {
      const confirmMsg = typeof optionsOrConfirm === "string" ? optionsOrConfirm : undefined;
      const successMsg = typeof p3 === "string" ? p3 : undefined;
      const onSuccess = typeof p3 === "function" ? p3 : p4;
      fn = () => fetch(fnOrUrl, { method: "POST", headers: getAuthHeaders() });
      options = { confirm: confirmMsg, successMessage: successMsg, onSuccess: onSuccess as any };
    } else {
      fn = fnOrUrl;
      options = (typeof optionsOrConfirm === "object" ? optionsOrConfirm : {}) as ApiActionOptions;
    }

    if (options.confirm) {
      const ok = await confirm({
        message: options.confirm,
        variant: "warning",
      });
      if (!ok) return false;
    }

    setLoading(true);
    try {
      const res = await fn();
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const fallback = err.error || err.message || options.errorMessage || "שגיאה בביצוע הפעולה";
        const msg = hebrewApiError(res.status, fallback);
        toast({ title: "שגיאה", description: msg, variant: "destructive" });
        options.onError?.(msg);
        return false;
      }
      const data = await res.json().catch(() => ({}));
      if (options.successMessage) {
        toast({ title: "הצלחה", description: options.successMessage });
      }
      options.onSuccess?.(data);
      return true;
    } catch (err: any) {
      const msg = err?.message || options.errorMessage || "שגיאת רשת";
      toast({ title: "שגיאה", description: msg, variant: "destructive" });
      options.onError?.(msg);
      return false;
    } finally {
      setLoading(false);
      setLoadingId(null);
    }
  }, [toast, confirm]);

  const executeDelete = useCallback(async (
    fnOrUrl: (() => Promise<Response>) | string,
    optionsOrConfirm?: ApiActionOptions | string,
    p3?: () => void
  ): Promise<boolean> => {
    let fn: () => Promise<Response>;
    let options: ApiActionOptions = {};
    if (typeof fnOrUrl === "string") {
      const confirmMsg = typeof optionsOrConfirm === "string" ? optionsOrConfirm : "למחוק רשומה?";
      fn = () => fetch(fnOrUrl, { method: "DELETE", headers: getAuthHeaders() });
      options = { confirm: confirmMsg, onSuccess: p3 as any };
    } else {
      fn = fnOrUrl;
      options = (typeof optionsOrConfirm === "object" ? optionsOrConfirm : {}) as ApiActionOptions;
    }

    const deleteMessage = options.confirm || "האם אתה בטוח שברצונך למחוק? פעולה זו אינה ניתנת לביטול.";
    const ok = await confirm({
      title: "אישור מחיקה",
      message: deleteMessage,
      confirmText: "מחק",
      cancelText: "ביטול",
      variant: "danger",
      itemName: options.itemName,
      entityType: options.entityType,
      requireTypedConfirm: true,
    });
    if (!ok) return false;

    setLoading(true);
    try {
      const res = await fn();
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const fallback = err.error || err.message || options.errorMessage || "שגיאה במחיקה";
        const msg = hebrewApiError(res.status, fallback);
        toast({ title: "שגיאה", description: msg, variant: "destructive" });
        options.onError?.(msg);
        return false;
      }
      const data = await res.json().catch(() => ({}));
      toast({ title: "הצלחה", description: options.successMessage || "נמחק בהצלחה" });
      options.onSuccess?.(data);
      return true;
    } catch (err: any) {
      const msg = err?.message || options.errorMessage || "שגיאת רשת";
      toast({ title: "שגיאה", description: msg, variant: "destructive" });
      options.onError?.(msg);
      return false;
    } finally {
      setLoading(false);
      setLoadingId(null);
    }
  }, [toast, confirm]);

  const executeSave = useCallback(async (
    fnOrUrl: (() => Promise<Response>) | string,
    isEditOrMethod?: boolean | string,
    optionsOrBody?: ApiActionOptions | any,
    p4?: string,
    p5?: () => void
  ): Promise<boolean> => {
    let fn: () => Promise<Response>;
    let isEdit: boolean;
    let options: ApiActionOptions = {};
    if (typeof fnOrUrl === "string" && typeof isEditOrMethod === "string") {
      const method = isEditOrMethod;
      const body = optionsOrBody;
      const successMsg = typeof p4 === "string" ? p4 : undefined;
      const onSuccess = p5;
      fn = () => fetch(fnOrUrl, { method, headers: getAuthHeaders(), body: JSON.stringify(body) });
      isEdit = method === "PUT" || method === "PATCH";
      options = { successMessage: successMsg, onSuccess: onSuccess as any };
    } else {
      fn = fnOrUrl as () => Promise<Response>;
      isEdit = isEditOrMethod as boolean;
      options = (optionsOrBody || {}) as ApiActionOptions;
    }
    return execute(fn, {
      successMessage: options.successMessage || (isEdit ? "עודכן בהצלחה" : "נוצר בהצלחה"),
      errorMessage: options.errorMessage || "שגיאה בשמירה",
      ...options,
    });
  }, [execute]);

  const isLoading = useCallback((id?: number | string) => {
    if (id !== undefined) return loadingId === id;
    return loading;
  }, [loading, loadingId]);

  return { loading, loadingId, execute, executeDelete, executeSave, isLoading };
}

export function LoadingOverlay({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div className="absolute inset-0 bg-background/50 backdrop-blur-[1px] flex items-center justify-center z-10 rounded-lg">
      <div className="flex items-center gap-2 bg-background border rounded-lg px-4 py-2 shadow-lg">
        <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-muted-foreground">טוען...</span>
      </div>
    </div>
  );
}

export function ActionButton({ 
  onClick, 
  loading, 
  children, 
  className = "",
  variant = "primary",
  size = "sm",
  disabled = false,
}: { 
  onClick: () => void; 
  loading?: boolean; 
  children: React.ReactNode; 
  className?: string;
  variant?: "primary" | "danger" | "ghost" | "outline";
  size?: "xs" | "sm" | "md";
  disabled?: boolean;
}) {
  const variantClasses = {
    primary: "bg-primary text-primary-foreground hover:bg-primary/90",
    danger: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
    ghost: "hover:bg-accent",
    outline: "border hover:bg-accent",
  };
  const sizeClasses = { xs: "px-2 py-1 text-xs", sm: "px-3 py-1.5 text-sm", md: "px-4 py-2 text-sm" };

  return (
    <button
      onClick={onClick}
      disabled={loading || disabled}
      className={`inline-flex items-center gap-1.5 rounded-lg font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
    >
      {loading && <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />}
      {children}
    </button>
  );
}
