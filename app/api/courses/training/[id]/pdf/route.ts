import { getCurrentUser } from "@/lib/auth/dal";
import { getLocale } from "@/lib/i18n/get-locale";
import { renderTrainingPdf, pdfResponse } from "@/lib/pdf/render-course";

/** Staff preview of a training course PDF. Members use /p/{shareToken}. */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user || (user.role !== "CAPTAIN" && user.role !== "MANAGER")) {
    return new Response("Forbidden", { status: 403 });
  }

  const { id } = await params;
  const locale = await getLocale();
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;

  const bytes = await renderTrainingPdf(id, locale, baseUrl);
  if (!bytes) return new Response("Not found", { status: 404 });
  return pdfResponse(bytes, `training-${id}`);
}
