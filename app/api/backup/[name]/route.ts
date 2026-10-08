import { getCurrentUser } from "@/lib/auth/dal";
import { readBackupRaw } from "@/lib/backup";

/** Download a snapshot to keep off-site. Manager only. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const user = await getCurrentUser();
  if (!user || user.role !== "MANAGER") return new Response("Forbidden", { status: 403 });

  const { name } = await params;
  const buf = await readBackupRaw(name);
  if (!buf) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
