import { z } from "zod";
export * from "zod";

export const HealthCheckResponse = z.object({
  status: z.enum(["ok", "degraded", "error"]),
});

export const CreateAiApiKeyBody = z.object({ name: z.string(), provider_id: z.number().optional(), key: z.string().optional() }).passthrough();
export const UpdateAiApiKeyBody = z.object({ name: z.string().optional(), key: z.string().optional() }).passthrough();
export const GetAiApiKeyParams = z.object({ id: z.string() });
export const DeleteAiApiKeyParams = z.object({ id: z.string() });

export const CreateAiModelBody = z.object({ name: z.string(), provider_id: z.number().optional() }).passthrough();
export const UpdateAiModelBody = z.object({ name: z.string().optional() }).passthrough();
export const GetAiModelParams = z.object({ id: z.string() });
export const DeleteAiModelParams = z.object({ id: z.string() });

export const CreateAiPermissionBody = z.object({ role_id: z.number().optional(), resource: z.string().optional() }).passthrough();
export const UpdateAiPermissionBody = z.object({ resource: z.string().optional() }).passthrough();
export const UpdateAiPermissionParams = z.object({ id: z.string() });
export const DeleteAiPermissionParams = z.object({ id: z.string() });

export const CreateAiProviderBody = z.object({ name: z.string() }).passthrough();
export const UpdateAiProviderBody = z.object({ name: z.string().optional() }).passthrough();
export const GetAiProviderParams = z.object({ id: z.string() });
export const DeleteAiProviderParams = z.object({ id: z.string() });

export const ListAiPromptTemplatesQueryParams = z.object({ page: z.string().optional(), limit: z.string().optional() }).passthrough();
export const CreateAiPromptTemplateBody = z.object({ name: z.string(), template: z.string() }).passthrough();
export const UpdateAiPromptTemplateBody = z.object({ name: z.string().optional(), template: z.string().optional() }).passthrough();
export const GetAiPromptTemplateParams = z.object({ id: z.string() });
export const DeleteAiPromptTemplateParams = z.object({ id: z.string() });

export const ListAiQueriesQueryParams = z.object({ page: z.string().optional(), limit: z.string().optional() }).passthrough();
export const CreateAiQueryBody = z.object({ query: z.string() }).passthrough();
export const GetAiQueryParams = z.object({ id: z.string() });

export const ListAiRecommendationsQueryParams = z.object({ page: z.string().optional(), limit: z.string().optional() }).passthrough();
export const CreateAiRecommendationBody = z.object({ type: z.string().optional() }).passthrough();
export const UpdateAiRecommendationBody = z.object({ status: z.string().optional() }).passthrough();
export const UpdateAiRecommendationParams = z.object({ id: z.string() });

export const ListAiResponsesQueryParams = z.object({ page: z.string().optional(), limit: z.string().optional() }).passthrough();
export const CreateAiResponseBody = z.object({ query_id: z.number().optional(), response: z.string().optional() }).passthrough();

export const ListAiUsageLogsQueryParams = z.object({ page: z.string().optional(), limit: z.string().optional() }).passthrough();
export const CreateAiUsageLogBody = z.object({ model_id: z.number().optional(), tokens: z.number().optional() }).passthrough();
