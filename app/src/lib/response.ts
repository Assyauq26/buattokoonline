import { HttpError } from "./http-error";
export { HttpError } from "./http-error";
import { logServerFailure } from "./server-error-log";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function ok<T>(data: T, init?: number) {
  return NextResponse.json({ success: true, data }, { status: init ?? 200 });
}

export function fail(message: string, status = 400, extra?: unknown) {
  return NextResponse.json(
    { success: false, error: { message, details: extra ?? null } },
    { status },
  );
}

/** Wrap a route handler with consistent error handling. */
export function handle(
  fn: () => Promise<Response>,
): Promise<Response> {
  return fn().catch((err) => {
    if (err instanceof ZodError) {
      return fail("Validasi gagal", 422, err.flatten());
    }
    if (err instanceof HttpError) {
      return fail(err.message, err.status);
    }
    logServerFailure("api-error", err);
    return fail("Terjadi kesalahan pada server", 500);
  });
}
