export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

export function getApiErrorStatus(error: unknown, fallbackStatus = 500) {
  if (error instanceof ApiRequestError) {
    return error.status;
  }

  if (error instanceof SyntaxError || (error instanceof Error && error.name === "ZodError")) {
    return 400;
  }

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
