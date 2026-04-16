export function getCorrelationId(req: Request): string {
  return (
    req.headers.get("x-correlation-id") ??
    req.headers.get("x-request-id") ??
    crypto.randomUUID()
  );
}
