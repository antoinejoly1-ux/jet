/**
 * The frame every /api/v1 route runs in: API-key authentication and rate
 * limiting, then the handler, then errors turned into consistent JSON:
 * { "error": { "code": "…", "message": "…", "fields"?: {…} } }.
 */
import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ForbiddenError, type Actor } from "@/lib/auth/policy";
import { db } from "@/lib/db";
import { authenticateApiKey } from "@/lib/services/api-keys";
import { ConflictError, NotFoundError } from "@/lib/services/errors";

export type ApiContext = { actor: Actor; request: NextRequest; params: Record<string, string> };

export const apiError = (status: number, code: string, message: string, fields?: Record<string, string>) =>
  NextResponse.json({ error: { code, message, ...(fields ? { fields } : {}) } }, { status });

export function api(handler: (ctx: ApiContext) => Promise<unknown>) {
  return async (request: NextRequest, route: { params: Promise<Record<string, string>> }) => {
    const auth = await authenticateApiKey(db, request.headers.get("authorization"));
    if (!auth.ok)
      return apiError(
        auth.status,
        auth.code,
        auth.code === "rate_limited"
          ? "Too many requests; slow down."
          : "Send a valid API key as 'Authorization: Bearer jet_…'.",
      );
    try {
      const result = await handler({ actor: auth.actor, request, params: await route.params });
      return result instanceof Response ? result : NextResponse.json({ data: result });
    } catch (err) {
      if (err instanceof z.ZodError) {
        const fields: Record<string, string> = {};
        for (const issue of err.issues) fields[issue.path.join(".") || "body"] ??= issue.message;
        return apiError(400, "invalid", "Some fields are invalid.", fields);
      }
      if (err instanceof ForbiddenError) return apiError(403, "forbidden", "This key's scopes don't allow that.");
      if (err instanceof NotFoundError) return apiError(404, "not_found", `${err.entity} not found.`);
      if (err instanceof ConflictError) return apiError(409, err.code, err.code.replaceAll("_", " "));
      if (err instanceof SyntaxError) return apiError(400, "invalid_json", "The body isn't valid JSON.");
      throw err;
    }
  };
}

export async function jsonBody(request: NextRequest): Promise<unknown> {
  return request.json();
}

export const query = (request: NextRequest, name: string) => request.nextUrl.searchParams.get(name) ?? undefined;
