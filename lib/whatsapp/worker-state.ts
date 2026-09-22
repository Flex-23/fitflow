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

/** How long after its last heartbeat the worker counts as offline. */
export const WORKER_STALE_MS = 90_000;
