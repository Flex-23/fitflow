/**
 * Access-card numbers.
 *
 * Two readers see the same card differently:
 * - The desk (USB) reader types the full number, e.g. "0117369627".
 * - The turnstile reader talks Wiegand-26 to the C3 panel, which only carries
 *   the low 24 bits: 117369627 → 16706331.
 *
 * We store what the desk reader typed (for display and uniqueness) plus the
 * derived 24-bit value the panel will report (for the gate lookup).
 * Client-safe — no server-only imports.
 */

// BigInt (not a literal — tsconfig targets ES2017) because desk readers can
// type numbers past 2^53.
const WIEGAND26_MASK = BigInt(0xffffff);

/** Digits only, leading zeros dropped ("0117369627" → "117369627"). */
export function normalizeCard(input: string): string | null {
  const digits = input.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  return digits.length >= 4 && digits.length <= 20 ? digits : null;
}

/** The number a Wiegand-26 reader reports for this card (low 24 bits). */
export function wiegand26(card: string): number {
  return Number(BigInt(card) & WIEGAND26_MASK);
}

/** Columns to persist for a card typed at the desk (or null to clear it). */
export function cardData(input: string | undefined | null): {
  cardNumber: string | null;
  cardWiegand: number | null;
} {
  const card = input ? normalizeCard(input) : null;
  return card
    ? { cardNumber: card, cardWiegand: wiegand26(card) }
    : { cardNumber: null, cardWiegand: null };
}
