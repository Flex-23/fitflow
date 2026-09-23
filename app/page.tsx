import { redirect } from "next/navigation";

/**
 * There is no public landing page: the only way in is signing in.
 *
 * Members never come here — they reach their course PDF and its exercise
 * videos through the private links sent to them on WhatsApp, which need no
 * account at all.
 *
 * Anyone already signed in is sent on to their own home by the proxy, which
 * sees the session cookie on /login.
 */
export default function Home() {
  redirect("/login");
}
