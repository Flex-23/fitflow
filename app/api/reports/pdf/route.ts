import { getCurrentUser } from "@/lib/auth/dal";
import { getLocale } from "@/lib/i18n/get-locale";
import { getDictionary } from "@/lib/i18n";
import {
  getReport,
  getOutstanding,
  getMovements,
  startOfDay,
  endOfDay,
  monthRange,
  previousRange,
} from "@/lib/reports";
import { buildReportPdf } from "@/lib/pdf/report-pdf";
import { pdfResponse } from "@/lib/pdf/render-course";

/** Same period resolution as the reports page, so the file matches the screen. */
function resolveRange(mode: string, day?: string | null, month?: string | null) {
  const now = new Date();
  if (mode === "monthly") {
    const m = /^(\d{4})-(\d{2})$/.exec(month ?? "");
    return monthRange(m ? Number(m[1]) : now.getFullYear(), m ? Number(m[2]) : now.getMonth() + 1);
  }
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day ?? "");
  const picked = d ? new Date(Number(d[1]), Number(d[2]) - 1, Number(d[3])) : now;
  return { from: startOfDay(picked), to: endOfDay(picked) };
}

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "MANAGER") return new Response("Forbidden", { status: 403 });

  const url = new URL(req.url);
  const mode = url.searchParams.get("mode") === "monthly" ? "monthly" : "daily";
  const { from, to } = resolveRange(mode, url.searchParams.get("day"), url.searchParams.get("month"));
  const prev = previousRange(from, to, mode);

  const locale = await getLocale();
  const [dict, report, previous, outstanding, movements] = await Promise.all([
    getDictionary(locale),
    getReport(from, to),
    getReport(prev.from, prev.to),
    getOutstanding(),
    mode === "daily" ? getMovements(from, to) : Promise.resolve([]),
  ]);

  const bytes = await buildReportPdf({ mode, report, previous, outstanding, movements, dict, locale });
  const stamp = mode === "daily" ? from.toISOString().slice(0, 10) : from.toISOString().slice(0, 7);
  return pdfResponse(bytes, `report-${mode}-${stamp}`);
}
