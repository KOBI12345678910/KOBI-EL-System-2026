from __future__ import annotations


class PlatformError(Exception):
    """Base class for every domain error in the platform."""
    default_message = "platform_error"
    status_code = 500

    def __init__(self, message: str | None = None):
        super().__init__(message or self.default_message)


class NotFoundError(PlatformError):
    default_message = "resource_not_found"
    status_code = 404


class ValidationError(PlatformError):
    default_message = "validation_failed"
    status_code = 422


class PermissionDenied(PlatformError):
    default_message = "permission_denied"
    status_code = 403


class CrossTenantAccessDenied(PermissionDenied):
    default_message = "cross_tenant_access_denied"


class ConflictError(PlatformError):
    default_message = "conflict"
    status_code = 409


class WorkflowError(PlatformError):
    default_message = "workflow_error"
    status_code = 400


class ActionPolicyViolation(PlatformError):
    default_message = "action_policy_violation"
    status_code = 403


class RateLimitExceeded(PlatformError):
    default_message = "rate_limit_exceeded"
    status_code = 429
