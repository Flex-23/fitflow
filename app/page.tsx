import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/dal";
import { homeFor } from "@/lib/auth/rbac";
import { getMemberSession } from "@/lib/member-session";

/**
 * The switchboard, and the installed app's start URL.
 *
 * There is no public landing page. One icon on a home screen has to work for
 * everyone, so this route reads whichever session the device holds and sends
 * it on: staff to their own work screen, a member to their page, anyone else
 * to the sign-in form.
 *
 * Staff is checked first — a manager who once opened a member's link on the
 * same phone should still land on their own screen.
 */
export default async function Home() {
  const staff = await getCurrentUser();
  if (staff) redirect(homeFor(staff));

  const member = await getMemberSession();
  if (member) redirect("/me");

  redirect("/login");
}
