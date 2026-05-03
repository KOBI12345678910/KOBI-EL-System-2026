import { useState, useCallback, useMemo, useRef, useEffect, useId } from "react";

type ValidationRule = {
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: RegExp;
  custom?: (value: any, formData: any) => string | null;
  message?: string;
};

type ValidationSchema<T> = Partial<Record<keyof T, ValidationRule>>;

type ValidationErrors<T> = Partial<Record<keyof T, string>>;

/**
 * The `inputProps` slot is the only piece safe to spread onto a native
 * `<input>` / `<select>` / `<textarea>`. The other fields (`error`, `errorId`,
 * `className`) are explicit so they never leak as DOM attributes.
 */
type FieldA11yProps = {
  inputProps: {
    id: string;
    name: string;
    "aria-invalid": boolean;
    "aria-describedby"?: string;
    "aria-required"?: boolean;
    ref: (el: HTMLElement | null) => void;
  };
  id: string;
  errorId: string;
  error?: string;
  className: string;
};

interface UseFormValidationReturn<T> {
  errors: ValidationErrors<T>;
  validate: (data: T) => boolean;
  /** Alias of `validate` — kept for legacy callers using `validateAll`. */
  validateAll: (data: T) => boolean;
  validateField: (field: keyof T, value: any, formData?: T) => string | null;
  clearErrors: () => void;
  /** Alias of `clearErrors` — kept for legacy callers using `reset`. */
  reset: () => void;
  clearFieldError: (field: keyof T) => void;
  /** Alias of `clearFieldError` — kept for legacy callers using `clearField`. */
  clearField: (field: keyof T) => void;
  setFieldError: (field: keyof T, message: string) => void;
  hasErrors: boolean;
  /** Spread onto an `<input>`/`<select>`/`<textarea>` for full ARIA + focus wiring. */
  getFieldProps: (field: keyof T) => FieldA11yProps;
  /** Stable id prefix for label+input pairing (use `${idPrefix}-${field}`). */
  idPrefix: string;
}

export function useFormValidation<T extends Record<string, any>>(schema: ValidationSchema<T>): UseFormValidationReturn<T> {
  const [errors, setErrors] = useState<ValidationErrors<T>>({});
  const idPrefix = useId();
  const fieldRefs = useRef<Record<string, HTMLElement | null>>({});
  const firstErrorFieldRef = useRef<string | null>(null);

  const validateField = useCallback((field: keyof T, value: any, formData?: T): string | null => {
    const rule = schema[field];
    if (!rule) return null;

    if (rule.required && (value === undefined || value === null || value === "" || (typeof value === "string" && !value.trim()))) {
      return rule.message || "שדה חובה";
    }
    if (rule.minLength && typeof value === "string" && value.length < rule.minLength) {
      return rule.message || `מינימום ${rule.minLength} תווים`;
    }
    if (rule.maxLength && typeof value === "string" && value.length > rule.maxLength) {
      return rule.message || `מקסימום ${rule.maxLength} תווים`;
    }
    if (rule.min !== undefined && typeof value === "number" && value < rule.min) {
      return rule.message || `ערך מינימלי: ${rule.min}`;
    }
    if (rule.max !== undefined && typeof value === "number" && value > rule.max) {
      return rule.message || `ערך מקסימלי: ${rule.max}`;
    }
    if (rule.pattern && typeof value === "string" && !rule.pattern.test(value)) {
      return rule.message || "ערך לא תקין";
    }
    if (rule.custom && formData) {
      return rule.custom(value, formData);
    }
    return null;
  }, [schema]);

  const validate = useCallback((data: T): boolean => {
    const newErrors: ValidationErrors<T> = {};
    let isValid = true;
    let firstBad: string | null = null;
    for (const field of Object.keys(schema) as (keyof T)[]) {
      const error = validateField(field, data[field], data);
      if (error) {
        newErrors[field] = error;
        if (!firstBad) firstBad = String(field);
        isValid = false;
      }
    }
    setErrors(newErrors);
    firstErrorFieldRef.current = firstBad;
    return isValid;
  }, [schema, validateField]);

  const clearErrors = useCallback(() => {
    setErrors({});
    firstErrorFieldRef.current = null;
  }, []);
  const clearFieldError = useCallback((field: keyof T) => setErrors(prev => { const next = { ...prev }; delete next[field]; return next; }), []);
  const setFieldError = useCallback((field: keyof T, message: string) => setErrors(prev => ({ ...prev, [field]: message })), []);

  const hasErrors = useMemo(() => Object.keys(errors).length > 0, [errors]);

  // Auto-focus first invalid field after a failed validate() call.
  useEffect(() => {
    const fld = firstErrorFieldRef.current;
    if (!fld || !errors[fld as keyof T]) return;
    const el = fieldRefs.current[fld];
    if (el && typeof (el as HTMLElement).focus === "function") {
      // microtask to ensure dialog/portal mounted children are focusable
      queueMicrotask(() => el.focus());
    }
    firstErrorFieldRef.current = null;
  }, [errors]);

  const getFieldProps = useCallback((field: keyof T): FieldA11yProps => {
    const error = errors[field];
    const fieldKey = String(field);
    const id = `${idPrefix}-${fieldKey}`;
    const errorId = `${id}-error`;
    const required = !!schema[field]?.required;
    return {
      inputProps: {
        id,
        name: fieldKey,
        "aria-invalid": !!error,
        "aria-describedby": error ? errorId : undefined,
        "aria-required": required || undefined,
        ref: (el: HTMLElement | null) => { fieldRefs.current[fieldKey] = el; },
      },
      id,
      errorId,
      error: error as string | undefined,
      className: error ? "border-red-500 focus:ring-red-500" : "",
    };
  }, [errors, idPrefix, schema]);

  return {
    errors,
    validate,
    validateAll: validate,
    validateField,
    clearErrors,
    reset: clearErrors,
    clearFieldError,
    clearField: clearFieldError,
    setFieldError,
    hasErrors,
    getFieldProps,
    idPrefix,
  };
}

/**
 * Renders an inline form error.
 * - `id` is used by `aria-describedby` on the matching input.
 * - `role="alert"` + `aria-live="polite"` make screen readers announce the message
 *   when it appears or changes.
 */
export function FormFieldError({ error, id }: { error?: string; id?: string }) {
  if (!error) return null;
  return (
    <p id={id} role="alert" aria-live="polite" className="text-xs text-red-400 mt-1">
      {error}
    </p>
  );
}

export function RequiredMark() {
  // Visual-only — pair with `aria-required` on the matching input via `getFieldProps`.
  return <span aria-hidden="true" className="text-red-400 mr-0.5">*</span>;
}
