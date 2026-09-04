import { ApiRequestError } from "./api-errors.ts";

export function observeApiHandler<R extends Request, A extends unknown[], T extends Response>(
  handler: (request: R, ...args: A) => Promise<T>,
  log: (request: Request, started: number, status: number, code: string) => void
) {
  return async (request: R, ...args: A): Promise<T> => {
    const started = performance.now();
    const emit = (status: number) => {
      try { log(request, started, status, status < 400 ? "OK" : new ApiRequestError("", status).code); }
      catch { /* Observation must not change a response, stream, cookie, or thrown error. */ }
    };
    try { const response = await handler(request, ...args); emit(response.status); return response; }
    catch (error) { emit(500); throw error; }
  };
}
