export const API_ERROR_CODES = {
  unauthenticated: "UNAUTHENTICATED",
  forbidden: "FORBIDDEN",
  malformedRequest: "MALFORMED_REQUEST",
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
  if (status === 422) return API_ERROR_CODES.validationError;
  if (status === 429) return API_ERROR_CODES.rateLimited;
  if (status === 503) return API_ERROR_CODES.serviceUnavailable;
  if (status >= 500) return API_ERROR_CODES.internalError;
  return API_ERROR_CODES.malformedRequest;
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
