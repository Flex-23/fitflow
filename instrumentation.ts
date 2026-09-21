/**
 * Runs once per server start. Brings the gym's WhatsApp number back online
 * when it was paired before, so course sending works after a restart without
 * anyone opening Settings. Only in the Node.js runtime — Baileys cannot run
 * on the edge — and only when sending is switched on.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.WHATSAPP_ENABLED !== "true") return;

  try {
    const wa = await import("@/lib/whatsapp/client");
    if (await wa.hasCredentials()) {
      console.info("[whatsapp] paired number found — reconnecting");
      // Not awaited: the server must not wait on WhatsApp to accept requests.
      void wa.connect();
    }
  } catch (e) {
    console.error("[whatsapp] auto-connect failed", e);
  }
}
