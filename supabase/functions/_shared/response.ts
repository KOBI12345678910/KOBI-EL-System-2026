const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-correlation-id, x-request-id, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

export function optionsResponse(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export function ok(data: unknown, correlationId?: string): Response {
  return new Response(
    JSON.stringify({ data, correlation_id: correlationId }),
    { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
  );
}

export function failFromAppError(
  err: { status?: number; code?: string; message?: string; details?: unknown },
  correlationId?: string,
): Response {
  const status = err.status ?? 500;
  return new Response(
    JSON.stringify({
      error: { code: err.code ?? "INTERNAL_ERROR", message: err.message ?? "An unexpected error occurred", details: err.details ?? null },
      correlation_id: correlationId,
    }),
    { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
  );
}
