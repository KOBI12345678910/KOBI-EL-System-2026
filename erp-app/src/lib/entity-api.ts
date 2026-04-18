/**
 * Entity API Service Layer
 *
 * Provides a typed interface for CRUD operations on entities,
 * compatible with Base44's entity access pattern.
 * Wraps TechnoKoluzi's authFetch/authJson for seamless migration.
 */
import { authFetch, authJson } from "./utils";

/** List entities with optional sorting and limit */
export async function entityList<T = Record<string, unknown>>(
  entity: string,
  sort?: string,
  limit?: number
): Promise<T[]> {
  const params = new URLSearchParams();
  if (sort) params.set("sort", sort);
  if (limit) params.set("limit", String(limit));
  const qs = params.toString();
  return authJson(`/api/${entity}${qs ? `?${qs}` : ""}`);
}

/** Create a new entity record */
export async function entityCreate<T = Record<string, unknown>>(
  entity: string,
  data: Partial<T>
): Promise<T> {
  return authJson(`/api/${entity}`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/** Update an existing entity record */
export async function entityUpdate<T = Record<string, unknown>>(
  entity: string,
  id: number | string,
  data: Partial<T>
): Promise<T> {
  return authJson(`/api/${entity}/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

/** Delete an entity record */
export async function entityDelete(
  entity: string,
  id: number | string
): Promise<void> {
  await authFetch(`/api/${entity}/${id}`, { method: "DELETE" });
}

/** Filter entities with query parameters */
export async function entityFilter<T = Record<string, unknown>>(
  entity: string,
  filters: Record<string, unknown>
): Promise<T[]> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== null) {
      params.set(key, String(value));
    }
  }
  const qs = params.toString();
  return authJson(`/api/${entity}${qs ? `?${qs}` : ""}`);
}

/** Get a single entity by ID */
export async function entityGet<T = Record<string, unknown>>(
  entity: string,
  id: number | string
): Promise<T> {
  return authJson(`/api/${entity}/${id}`);
}

/** Bulk update multiple entities */
export async function entityBulkUpdate<T = Record<string, unknown>>(
  entity: string,
  ids: (number | string)[],
  data: Partial<T>
): Promise<T[]> {
  return authJson(`/api/${entity}/bulk-update`, {
    method: "PATCH",
    body: JSON.stringify({ ids, ...data }),
  });
}

/** Count entities with optional filters */
export async function entityCount(
  entity: string,
  filters?: Record<string, unknown>
): Promise<number> {
  const params = new URLSearchParams();
  if (filters) {
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== null) {
        params.set(key, String(value));
      }
    }
  }
  const qs = params.toString();
  const data = await authJson(`/api/${entity}/count${qs ? `?${qs}` : ""}`);
  return data.count ?? 0;
}
