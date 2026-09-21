/**
 * Client-safe WhatsApp helpers (number formatting, message text, chat links).
 *
 * The socket that actually delivers documents lives in `./client`, which is
 * server-only — import it directly from server code, never from here.
 */
export * from "./links";
