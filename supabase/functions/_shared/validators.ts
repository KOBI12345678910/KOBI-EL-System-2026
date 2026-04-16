// ============================================================
// FILE: supabase/functions/_shared/validators.ts
// ============================================================

import { ValidationError } from "./errors.ts";

export function requireString(value: unknown, field: string, minLength = 1): string {
  if (typeof value !== "string") {
    throw new ValidationError(`${field} must be a string`, { field });
  }

  const normalized = value.trim();

  if (normalized.length < minLength) {
    throw new ValidationError(`${field} is required`, { field });
  }

  return normalized;
}

export function optionalString(value: unknown): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    throw new ValidationError("Invalid optional string");
  }

  return value.trim();
}

export function optionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);

  if (Number.isNaN(parsed)) {
    throw new ValidationError("Invalid number");
  }

  return parsed;
}

export function requirePositiveNumber(value: unknown, field: string): number {
  const parsed = Number(value);

  if (Number.isNaN(parsed) || parsed <= 0) {
    throw new ValidationError(`${field} must be a positive number`, { field });
  }

  return parsed;
}

export function requireDateString(value: unknown, field: string): string {
  const s = requireString(value, field);
  const d = new Date(s);

  if (Number.isNaN(d.getTime())) {
    throw new ValidationError(`${field} must be a valid date`, { field });
  }

  return s;
}
