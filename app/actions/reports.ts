"use server";

import { requireSection } from "@/lib/auth/dal";
import { getMovements, startOfDay, endOfDay, type Movement } from "@/lib/reports";
import { iraqInstant } from "@/lib/tz";

export type DayDetail = {
  date: string;
  movements: Movement[];
  income: number;
  expenses: number;
  net: number;
};

/** Everything that moved on one calendar day, for the report drill-down. */
export async function getDayDetail(date: string): Promise<DayDetail> {
  await requireSection("FINANCE");

  const [y, m, d] = date.split("-").map(Number);
  const day = iraqInstant(y!, m ?? 1, d ?? 1, 12);
  const movements = await getMovements(startOfDay(day), endOfDay(day));

  const income = movements
    .filter((v) => v.kind !== "expense")
    .reduce((a, v) => a + v.amount, 0);
  const expenses = movements
    .filter((v) => v.kind === "expense")
    .reduce((a, v) => a + v.amount, 0);

  return { date, movements, income, expenses, net: income - expenses };
}
