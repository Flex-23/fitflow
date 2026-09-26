import "server-only";
import { getSetting } from "@/lib/settings";

/**
 * Whether this gym has a turnstile at all.
 *
 * Plenty do not, and for them the gate page is an empty log and the card
 * number on the registration form is a box nobody can fill — both of which
 * make the system look broken rather than unused. The master turns it on
 * once, and until then neither exists.
 *
 * A setting rather than an environment variable: the person who knows
 * whether a gate was installed is the owner, not whoever deploys the site.
 */
export const GATE_ENABLED_KEY = "gate.enabled";

export async function isGateEnabled(): Promise<boolean> {
  return (await getSetting(GATE_ENABLED_KEY, "")) === "true";
}
