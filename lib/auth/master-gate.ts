/**
 * The master's door, and where it is.
 *
 * The address is a secret, not a design: `/access/<MASTER_GATE>`. Anything
 * else under /access answers exactly like a page that was never built, so
 * there is nothing to find by guessing and nothing in the app that hints the
 * door exists — no link, no menu entry, no mention on the ordinary sign-in
 * page.
 *
 * Kept in the environment rather than the code so it can be changed without a
 * new release, and so it is not sitting in the repository for anyone with
 * read access to the source.
 */
export function masterGate(): string | null {
  const value = process.env.MASTER_GATE?.trim();
  // A short value would be guessable, and an unset one must not open a door
  // that matches the empty string.
  return value && value.length >= 12 ? value : null;
}

/** Whether this path segment is the master's door. */
export function isMasterGate(segment: string): boolean {
  const gate = masterGate();
  if (!gate) return false;
  // Length first, then a comparison that does not stop at the first wrong
  // character: timing should not narrow a secret down.
  if (segment.length !== gate.length) return false;
  let diff = 0;
  for (let i = 0; i < gate.length; i++) diff |= segment.charCodeAt(i) ^ gate.charCodeAt(i);
  return diff === 0;
}
