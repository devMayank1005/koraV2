import { NextResponse } from "next/server";

/**
 * Error responses.
 *
 * Ported from api/_errors.js, whose rule still holds: the client gets a
 * message we wrote, never one the database wrote. Driver text leaks table
 * names, constraint names and occasionally connection details, and several
 * endpoints in the old app forwarded it (`detail: err.message`) despite the
 * helper existing.
 *
 * Unexpected errors return a short correlation id instead, which is enough to
 * find the real stack in the logs without publishing it.
 */

export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const badRequest = (m: string, extra?: Record<string, unknown>) =>
  new AppError(400, m, extra);
export const unauthorized = (m = "Not signed in", extra?: Record<string, unknown>) =>
  new AppError(401, m, extra);
export const forbidden = (m = "You do not have access to this") =>
  new AppError(403, m);
export const notFound = (m = "Not found") => new AppError(404, m);
export const conflict = (m: string, extra?: Record<string, unknown>) =>
  new AppError(409, m, extra);
export const tooManyRequests = (m: string) => new AppError(429, m);

function corrId(): string {
  return Math.random().toString(36).slice(2, 8);
}

/** Postgres error codes worth translating into something a person can act on. */
function fromPgCode(err: unknown): AppError | null {
  const code = (err as { code?: string })?.code;
  const constraint = (err as { constraint_name?: string })?.constraint_name;

  if (code === "23505") {
    if (constraint?.includes("name_ci")) {
      return conflict("A client with that name already exists.");
    }
    if (constraint?.includes("username_ci")) {
      return conflict("That username is already taken.");
    }
    if (constraint?.includes("phasename")) {
      return conflict("That phase already exists on this module.");
    }
    return conflict("That already exists.");
  }
  if (code === "23503") {
    return conflict("That record is still referenced by something else.");
  }
  if (code === "23502") {
    return badRequest("A required field is missing.");
  }
  return null;
}

export function errorResponse(err: unknown, context: string): NextResponse {
  if (err instanceof AppError) {
    return NextResponse.json(
      { error: err.message, ...err.extra },
      { status: err.statusCode },
    );
  }

  const mapped = fromPgCode(err);
  if (mapped) {
    return NextResponse.json(
      { error: mapped.message, ...mapped.extra },
      { status: mapped.statusCode },
    );
  }

  const id = corrId();
  // Stack only — never the request body. The old app's no-payload-logging
  // policy is deliberate: it is why the prior data-loss incident could not be
  // reconstructed from logs, and it is still the right trade for client data.
  console.error(
    `[${id}] ${context}:`,
    err instanceof Error ? err.stack : String(err),
  );

  return NextResponse.json(
    { error: "Something went wrong. Please try again.", ref: id },
    { status: 500 },
  );
}
