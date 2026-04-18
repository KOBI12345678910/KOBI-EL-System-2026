import { useState, useCallback, useMemo } from "react";

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

interface UseFormValidationReturn<T> {
  errors: ValidationErrors<T>;
  validate: (data: T) => boolean;
  validateField: (field: keyof T, value: any, formData?: T) => string | null;
  clearErrors: () => void;
  clearFieldError: (field: keyof T) => void;
  setFieldError: (field: keyof T, message: string) => void;
  hasErrors: boolean;
  getFieldProps: (field: keyof T) => { error?: string; className?: string };
}

export function useFormValidation<T extends Record<string, any>>(schema: ValidationSchema<T>): UseFormValidationReturn<T> {
  const [errors, setErrors] = useState<ValidationErrors<T>>({});

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
    for (const field of Object.keys(schema) as (keyof T)[]) {
      const error = validateField(field, data[field], data);
      if (error) {
        newErrors[field] = error;
        isValid = false;
      }
    }
    setErrors(newErrors);
    return isValid;
  }, [schema, validateField]);

  const clearErrors = useCallback(() => setErrors({}), []);
  const clearFieldError = useCallback((field: keyof T) => setErrors(prev => { const next = { ...prev }; delete next[field]; return next; }), []);
  const setFieldError = useCallback((field: keyof T, message: string) => setErrors(prev => ({ ...prev, [field]: message })), []);

  const hasErrors = useMemo(() => Object.keys(errors).length > 0, [errors]);

  const getFieldProps = useCallback((field: keyof T) => {
    const error = errors[field];
    return {
      error: error as string | undefined,
      className: error ? "border-red-500 focus:ring-red-500" : "",
    };
  }, [errors]);

  return { errors, validate, validateField, clearErrors, clearFieldError, setFieldError, hasErrors, getFieldProps };
}

export function FormFieldError({ error }: { error?: string }) {
  if (!error) return null;
  return <p className="text-xs text-red-400 mt-1">{error}</p>;
}

export function RequiredMark() {
  return <span className="text-red-400 mr-0.5">*</span>;
}
