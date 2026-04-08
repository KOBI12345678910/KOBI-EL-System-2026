import { Router, Request, Response } from "express";
import { graphql, subscribe, parse, validate } from "graphql";
import { erpGraphQLSchema } from "../lib/graphql-schema";
import { eventBus, RecordEvent } from "../lib/event-bus";
import { heavyEndpointRateLimit } from "../lib/api-gateway";
import { addSSEClient } from "../lib/sse-manager";

const router = Router();

router.post("/graphql", heavyEndpointRateLimit, async (req: Request, res: Response) => {
  try {
    const { query, variables, operationName } = req.body;
    if (!query) {
      res.status(400).json({ errors: [{ message: "Query is required" }] });
      return;
    }

    const document = parse(query);
    const validationErrors = validate(erpGraphQLSchema, document);
    if (validationErrors.length > 0) {
      res.json({ errors: validationErrors });
      return;
    }

    const isSubscription = document.definitions.some(
      (def) => def.kind === "OperationDefinition" && def.operation === "subscription"
    );

    if (isSubscription) {
      const contextValue = { userId: req.userId, permissions: req.permissions };
      const subscriptionResult = await subscribe({
        schema: erpGraphQLSchema,
        document,
        variableValues: variables,
        operationName,
        contextValue,
      });

      if (Symbol.asyncIterator in (subscriptionResult as object)) {
        const iterator = subscriptionResult as AsyncIterableIterator<{ data?: unknown; errors?: unknown[] }>;
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          "Connection": "keep-alive",
          "X-Accel-Buffering": "no",
        });
        res.write(`data: ${JSON.stringify({ type: "subscription_started" })}\n\n`);

        let active = true;
        const keepAlive = setInterval(() => {
          if (res.writableEnded) { clearInterval(keepAlive); return; }
          res.write(": ping\n\n");
        }, 25000);

        const cleanup = () => {
          active = false;
          clearInterval(keepAlive);
          iterator.return?.();
        };

        res.on("close", cleanup);

        (async () => {
          try {
            for await (const payload of iterator) {
              if (!active || res.writableEnded) break;
              res.write(`data: ${JSON.stringify(payload)}\n\n`);
            }
          } catch {
            /* client disconnected */
          } finally {
            cleanup();
            if (!res.writableEnded) res.end();
          }
        })();
        return;
      }

      res.json(subscriptionResult);
      return;
    }

    const result = await graphql({
      schema: erpGraphQLSchema,
      source: query,
      variableValues: variables,
      operationName,
      contextValue: {
        userId: req.userId,
        permissions: req.permissions,
      },
    });

    res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ errors: [{ message: msg }] });
  }
});

router.get("/graphql/subscribe", (req: Request, res: Response) => {
  if (!req.userId) {
    res.status(401).json({ error: "נדרש אימות — Authentication required" });
    return;
  }

  const entities = (req.query.entities as string || "").split(",").filter(Boolean);
  const events = (req.query.events as string || "record.created,record.updated,record.deleted").split(",");

  addSSEClient(req.userId, res, ["graphql-subscriptions"]);

  const handler = (event: RecordEvent) => {
    if (entities.length > 0 && !entities.includes(String(event.entityId))) {
      return;
    }
    try {
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({
          type: event.type,
          entityId: event.entityId,
          recordId: event.recordId,
          data: event.data,
          status: event.status,
          oldStatus: event.oldStatus,
          timestamp: event.timestamp.toISOString(),
        })}\n\n`);
      }
    } catch {
      cleanup();
    }
  };

  const cleanup = () => {
    for (const evt of events) {
      eventBus.removeListener(evt, handler);
    }
  };

  for (const evt of events) {
    eventBus.on(evt, handler);
  }

  res.on("close", cleanup);
});

export default router;
