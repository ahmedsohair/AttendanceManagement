export const API_ERROR_CODES = {
  unauthenticated: "UNAUTHENTICATED",
  forbidden: "FORBIDDEN",
  malformedRequest: "MALFORMED_REQUEST",
  payloadTooLarge: "PAYLOAD_TOO_LARGE",
  validationError: "VALIDATION_ERROR",
  notFound: "NOT_FOUND",
  conflict: "CONFLICT",
  rateLimited: "RATE_LIMITED",
  timeout: "TIMEOUT",
  offline: "OFFLINE",
  internalError: "INTERNAL_ERROR",
  serviceUnavailable: "SERVICE_UNAVAILABLE"
} as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES];

const REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getDefaultCode(status: number): ApiErrorCode {
  if (status === 401) return API_ERROR_CODES.unauthenticated;
  if (status === 403) return API_ERROR_CODES.forbidden;
  if (status === 404) return API_ERROR_CODES.notFound;
  if (status === 409) return API_ERROR_CODES.conflict;
  if (status === 413) return API_ERROR_CODES.payloadTooLarge;
  if (status === 422) return API_ERROR_CODES.validationError;
  if (status === 429) return API_ERROR_CODES.rateLimited;
  if (status === 503) return API_ERROR_CODES.serviceUnavailable;
  if (status >= 500) return API_ERROR_CODES.internalError;
  return API_ERROR_CODES.malformedRequest;
}

const NOT_FOUND_MESSAGES = new Set([
  "Exam session not found.",
  "Email job not found.",
  "Invigilator not found.",
  "Room not found.",
  "Session not found."
]);

const CONFLICT_MESSAGES = new Set([
  "A pending access code is required.",
  "An invigilator with this email already exists.",
  "Another user already has this email address.",
  "Only active exams can be closed.",
  "Only draft exams can be published.",
  "Pending access code does not match.",
  "Active access code does not match.",
  "Idempotency key is already used for a different email job.",
  "No selected failed email deliveries can be retried.",
  "The assignment page is missing its concurrency snapshot. Refresh and try again."
]);

function getKnownDomainStatus(error: unknown) {
  if (!(error instanceof Error)) return undefined;
  if (NOT_FOUND_MESSAGES.has(error.message)) return 404;
  if (error.message === "Requesting administrator not found.") return 403;
  if (
    CONFLICT_MESSAGES.has(error.message) ||
    error.message.startsWith("Closed exams are read-only.") ||
    error.message.startsWith("Exams with attendance or incident history")
  ) return 409;
  if (
    error.message.startsWith("Assignment payload ") ||
    error.message.startsWith("Allocate students before publishing.") ||
    error.message.startsWith("Assign invigilators before publishing.") ||
    error.message.startsWith("Import verification metadata is missing.") ||
    error.message.startsWith("Imported roster verification failed:") ||
    error.message.startsWith("No valid room assignments") ||
    error.message.startsWith("No assigned invigilators were found") ||
    error.message.startsWith("Select at least one failed email delivery") ||
    error.message.startsWith("Student allocations reference rooms outside") ||
    error.message.startsWith("This exam has no rooms")
  ) return 422;
  return undefined;
}

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;

  constructor(
    message: string,
    status: number,
    code: ApiErrorCode = getDefaultCode(status)
  ) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = code;
  }
}

export function getRequestId(request: Request) {
  const supplied = request.headers.get("x-request-id")?.trim();
  return supplied && REQUEST_ID_PATTERN.test(supplied) ? supplied : crypto.randomUUID();
}

export function getApiErrorStatus(error: unknown, fallbackStatus = 500) {
  if (error instanceof ApiRequestError) {
    return error.status;
  }

  if (error instanceof SyntaxError) {
    return 400;
  }

  if (error instanceof Error && error.name === "ZodError") return 422;

  const domainStatus = getKnownDomainStatus(error);
  if (domainStatus) return domainStatus;

  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (
    message.includes("exam session is not active") ||
    message.includes("only active exams") ||
    message.includes("exam is closed")
  ) {
    return 409;
  }

  return fallbackStatus;
}

export function getApiErrorCode(error: unknown, fallbackStatus = 500): ApiErrorCode {
  if (error instanceof ApiRequestError) return error.code;
  if (error instanceof SyntaxError) return API_ERROR_CODES.malformedRequest;
  if (error instanceof Error && error.name === "ZodError") return API_ERROR_CODES.validationError;
  return getDefaultCode(getApiErrorStatus(error, fallbackStatus));
}

export function getApiClientMessage(error: unknown, status: number) {
  if (error instanceof ApiRequestError) return error.message;
  if (error instanceof SyntaxError) return "Request body must be valid JSON.";
  if (error instanceof Error && error.name === "ZodError") return "Request validation failed.";
  if (getKnownDomainStatus(error) && error instanceof Error) return error.message;
  if (status === 409 && error instanceof Error) return error.message;
  if (status === 503) return "The service is temporarily unavailable. Please try again.";
  if (status >= 500) return "An unexpected error occurred. Please try again.";
  return "The request could not be processed.";
}
