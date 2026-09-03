import { NextResponse } from "next/server";
import {
  ApiRequestError,
  getApiErrorCode,
  getApiErrorStatus,
  getRequestId,
  type ApiErrorCode
} from "./api-errors";

type ErrorResponseOptions = {
  headers?: HeadersInit;
  status?: number;
};

export function apiErrorResponse(
  request: Request,
  code: ApiErrorCode,
  message: string,
  options: ErrorResponseOptions = {}
) {
  const requestId = getRequestId(request);
  const headers = new Headers(options.headers);
  headers.set("x-request-id", requestId);

  return NextResponse.json(
    { code, message, requestId },
    { headers, status: options.status ?? 500 }
  );
}

export function handleApiError(
  request: Request,
  error: unknown,
  context: string,
  fallbackStatus = 500
) {
  const status = getApiErrorStatus(error, fallbackStatus);
  const code = getApiErrorCode(error, fallbackStatus);
  const requestId = getRequestId(request);
  const isSafeError = error instanceof ApiRequestError || status < 500;
  const message = isSafeError && error instanceof Error
    ? error.message
    : "An unexpected error occurred. Please try again.";

  if (status >= 500) {
    console.error(context, { requestId, error });
  }

  return NextResponse.json(
    { code, message, requestId },
    { headers: { "x-request-id": requestId }, status }
  );
}
