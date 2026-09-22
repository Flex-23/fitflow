import { prisma } from "@/lib/prisma";
import { getLocale } from "@/lib/i18n/get-locale";
import { renderTrainingPdf, renderNutritionPdf, pdfResponse } from "@/lib/pdf/render-course";
import { appUrl } from "@/lib/app-url";

/**
 * Public course PDF, reached through the private share link a captain sends
 * over WhatsApp. The token (nanoid) is the credential — the same model the
 * exercise video links use — so the member needs no account to open their own
 * program. Short path because the link travels inside a chat message.
 *
 * The file is rendered per request, so it always matches the course as it
 * stands and disappears with it.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  if (!token) return new Response("Not found", { status: 404 });

  const [training, nutrition] = await Promise.all([
    prisma.trainingCourse.findUnique({
      where: { shareToken: token },
      select: { id: true },
    }),
    prisma.nutritionCourse.findUnique({
      where: { shareToken: token },
      select: { id: true },
    }),
  ]);
  if (!training && !nutrition) return new Response("Not found", { status: 404 });

  const locale = await getLocale();
  const baseUrl = appUrl();

  const bytes = training
    ? await renderTrainingPdf(training.id, locale, baseUrl)
    : await renderNutritionPdf(nutrition!.id, locale);
  if (!bytes) return new Response("Not found", { status: 404 });

  return pdfResponse(bytes, `course-${token.slice(0, 8)}`);
}
