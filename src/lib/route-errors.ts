import "server-only";
import { ForbiddenError } from "@/lib/auth/policy";
import { NotFoundError } from "@/lib/services/errors";

/** Downloads answer "not found" for anything the reader may not see, so they can't probe for ids. */
export async function orNotFound(make: () => Promise<Response>): Promise<Response> {
  try {
    return await make();
  } catch (err) {
    if (err instanceof ForbiddenError || err instanceof NotFoundError) return new Response(null, { status: 404 });
    throw err;
  }
}

export const yearParam = (value: string | null) => {
  const y = Number(value);
  return Number.isInteger(y) && y >= 2000 && y <= 2100 ? y : new Date().getFullYear();
};
