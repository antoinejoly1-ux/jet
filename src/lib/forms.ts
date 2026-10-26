/**
 * The result every form action returns, and the one place that turns service
 * errors into it. Pages show `fields` next to inputs and `code` in an alert.
 */
import { z } from "zod";
import { ForbiddenError } from "@/lib/auth/policy";
import { ConflictError, NotFoundError } from "@/lib/services/errors";

export type FormState =
  | { status: "idle" }
  | { status: "error"; code?: string; fields?: Record<string, string>; values?: Record<string, string> }
  | { status: "success"; message?: string };

export const idle: FormState = { status: "idle" };

/**
 * Maps an error thrown by a service to a FormState, or rethrows anything
 * unexpected. Pass the submitted values: React resets a form after its action
 * runs, and forms read them back so the user never loses what they typed.
 */
export function formError(err: unknown, values?: Record<string, string>): FormState {
  const state = toErrorState(err);
  return values ? { ...state, values } : state;
}

function toErrorState(err: unknown): FormState & { status: "error" } {
  if (err instanceof z.ZodError) {
    const fields: Record<string, string> = {};
    for (const issue of err.issues) {
      const key = String(issue.path[0] ?? "form");
      fields[key] ??= "invalid";
    }
    return { status: "error", code: "invalid", fields };
  }
  if (err instanceof ConflictError) return { status: "error", code: err.code };
  if (err instanceof ForbiddenError) return { status: "error", code: "forbidden" };
  if (err instanceof NotFoundError) return { status: "error", code: "not_found" };
  throw err;
}

/** What a field should show: what the user just submitted, else the saved value. */
export function submitted(state: FormState, field: string, fallback?: string | null): string {
  return (state.status === "error" ? state.values?.[field] : undefined) ?? fallback ?? "";
}

/** FormData to a plain object of strings (checkboxes and multi-values aren't used here). */
export function formValues(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of formData.entries())
    if (typeof value === "string" && !key.startsWith("$")) out[key] = value;
  return out;
}
