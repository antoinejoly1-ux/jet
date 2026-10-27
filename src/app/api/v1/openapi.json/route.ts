import { NextResponse } from "next/server";
import { openApiDocument } from "@/lib/api/openapi";
import { env } from "@/lib/env";

/** The API description, public so tools like Zapier, Make or Postman can import it. */
export function GET() {
  return NextResponse.json(openApiDocument(env.BETTER_AUTH_URL));
}
