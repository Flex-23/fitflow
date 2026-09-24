/**
 * Setting keys the WhatsApp worker on the gym computer writes and the hosted
 * app reads. Kept in their own module because both sides import them and the
 * worker must not pull in anything server-only from Next.js.
 */

/** Paired number, digits only (e.g. 9647701234567). Empty when unlinked. */
export const WA_NUMBER_KEY = "whatsapp.number";
/** ISO timestamp of the pairing. */
export const WA_LINKED_AT_KEY = "whatsapp.linkedAt";
/** ISO timestamp the worker refreshes while it is running. */
export const WA_HEARTBEAT_KEY = "whatsapp.heartbeat";

/**
 * The pairing QR code, so it can be scanned from the Settings page instead of
 * from the gym computer's screen. The worker writes the raw payload here and
 * the app renders it; both are cleared the moment the number is linked,
 * because a live QR is a key to the WhatsApp account.
 */
export const WA_QR_KEY = "whatsapp.qr";
/** ISO timestamp of that QR, used to ignore one that has already rotated. */
export const WA_QR_AT_KEY = "whatsapp.qrAt";

/** How long after its last heartbeat the worker counts as offline. */
export const WORKER_STALE_MS = 90_000;
/** WhatsApp rotates the pairing code every 20s or so; older is not scannable. */
export const QR_STALE_MS = 60_000;
