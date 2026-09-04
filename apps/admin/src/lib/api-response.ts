import { NextResponse } from "next/server";
import {
  getApiClientMessage,
  getApiErrorCode,
  getApiErrorStatus,
  getRequestId,
  type ApiErrorCode
} from "./api-errors";
import { buildApiTelemetry } from "./telemetry";

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
  _context: string,
  fallbackStatus = 500
) {
  const status = getApiErrorStatus(error, fallbackStatus);
  const code = getApiErrorCode(error, fallbackStatus);
  const requestId = getRequestId(request);
  const message = getApiClientMessage(error, status);

  if (status >= 500) {
    console.error(JSON.stringify(buildApiTelemetry({
      event: "api.error", requestId, url: request.url, method: request.method,
      status, code, region: process.env.VERCEL_REGION
    })));
  }

  return NextResponse.json(
    { code, message, requestId },
    { headers: { "x-request-id": requestId }, status }
  );
}
