import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/dal";
import { homeFor } from "@/lib/auth/rbac";

/**
 * The front door, and the staff app's start URL.
 *
 * There is no public landing page: staff go to their own work screen, and
 * everyone else goes to the sign-in form.
 *
 * A member is deliberately not sent on from here. Their app opens `/me`
 * directly — that is its start URL — so this address does not have to serve
 * two audiences at once. It used to, and the result was that anyone who had
 * ever opened a member's link on this browser got the member's page instead
 * of the sign-in form, for good, with no way back that they could see.
 */
export default async function Home() {
  const staff = await getCurrentUser();
  if (staff) redirect(homeFor(staff));

  redirect("/login");
}
