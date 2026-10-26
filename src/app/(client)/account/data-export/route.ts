import { requireViewer } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { exportMyData } from "@/lib/services/privacy";

/** Law 25 portability: everything the portal holds about the signed-in person, as JSON. */
export async function GET() {
  const viewer = await requireViewer();
  // Staff viewing as an owner get their own data, never the owner's.
  const data = await exportMyData(db, viewer);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="my-data-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "private, no-store",
    },
  });
}
