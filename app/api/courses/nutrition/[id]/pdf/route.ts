import { getCurrentUser } from "@/lib/auth/dal";
import { getLocale } from "@/lib/i18n/get-locale";
import { renderNutritionPdf, pdfResponse } from "@/lib/pdf/render-course";

/** Staff preview of a nutrition course PDF. Members use /p/{shareToken}. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user || (user.role !== "CAPTAIN" && user.role !== "MANAGER")) {
    return new Response("Forbidden", { status: 403 });
  }

  const { id } = await params;
  const locale = await getLocale();

  const bytes = await renderNutritionPdf(id, locale);
  if (!bytes) return new Response("Not found", { status: 404 });
  return pdfResponse(bytes, `nutrition-${id}`);
}
