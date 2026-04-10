class PlatformError(Exception):
    """Base class for platform domain errors."""
    status_code = 500


class NotFoundError(PlatformError):
    status_code = 404


class ValidationError(PlatformError):
    status_code = 422


class PermissionDenied(PlatformError):
    status_code = 403


class CrossTenantAccessDenied(PermissionDenied):
    pass


class ConflictError(PlatformError):
    status_code = 409


class WorkflowError(PlatformError):
    status_code = 400
