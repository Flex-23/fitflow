import type { Metadata } from "next";
import { requireSection } from "@/lib/auth/dal";
import { getLocale } from "@/lib/i18n/get-locale";
import { getDictionary } from "@/lib/i18n";
import {
  getReport,
  getOutstanding,
  startOfDay,
  endOfDay,
  monthRange,
  previousRange,
} from "@/lib/reports";
import { PageHeader } from "@/components/layout/page-header";
import { ReportsView } from "@/components/manager/reports-view";

export const metadata: Metadata = { title: "Reports" };

/** Parse ?day=YYYY-MM-DD / ?month=YYYY-MM, falling back to today. */
function resolveRange(mode: string, day?: string, month?: string) {
  const now = new Date();
  if (mode === "monthly") {
    const m = /^(\d{4})-(\d{2})$/.exec(month ?? "");
    const year = m ? Number(m[1]) : now.getFullYear();
    const mon = m ? Number(m[2]) : now.getMonth() + 1;
    return monthRange(year, mon);
  }
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day ?? "");
  const picked = d ? new Date(Number(d[1]), Number(d[2]) - 1, Number(d[3])) : now;
  return { from: startOfDay(picked), to: endOfDay(picked) };
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; day?: string; month?: string }>;
}) {
  await requireSection("FINANCE");
  const { mode = "daily", day, month } = await searchParams;
  const locale = await getLocale();
  const dict = await getDictionary(locale);

  const view = mode === "monthly" ? "monthly" : "daily";
  const { from, to } = resolveRange(view, day, month);

  const prev = previousRange(from, to, view);
  const [report, previous, outstanding] = await Promise.all([
    getReport(from, to),
    getReport(prev.from, prev.to),
    getOutstanding(),
  ]);

  const pad = (n: number) => String(n).padStart(2, "0");
  const selectedDay = `${from.getFullYear()}-${pad(from.getMonth() + 1)}-${pad(from.getDate())}`;
  const selectedMonth = `${from.getFullYear()}-${pad(from.getMonth() + 1)}`;

  return (
    <div>
      <PageHeader
        title={dict.finance.reportsTitle}
        description={dict.finance.reportsSubtitle}
      />
      <ReportsView
        report={report}
        previous={previous}
        outstanding={outstanding}
        mode={view}
        selectedDay={selectedDay}
        selectedMonth={selectedMonth}
        dict={dict}
        locale={locale}
      />
    </div>
  );
}
