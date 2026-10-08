/**
 * Demo mode — a reversible switch that lets anyone into the staff app without
 * signing in, as the master, so the system can be shown without handing out
 * credentials.
 *
 * Off unless DEMO_MODE is "true". No server-only import, so the Edge proxy can
 * read it too.
 *
 * WARNING: while on, anyone who can reach the site can open AND change the
 * gym's data. Turn it off (remove the env var) once the demo is done.
 */
export function demoMode(): boolean {
  return process.env.DEMO_MODE === "true";
}
