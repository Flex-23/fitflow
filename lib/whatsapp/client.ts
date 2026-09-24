import { mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import type { WASocket } from "@whiskeysockets/baileys";
import type { ILogger } from "@whiskeysockets/baileys/lib/Utils/logger.js";

/**
 * WhatsApp link for the gym's own number.
 *
 * The staff pairs the gym phone once by scanning a QR code (exactly like
 * WhatsApp Web); the credentials are then kept on disk and the socket
 * reconnects on its own, so course PDFs can be delivered as real document
 * attachments.
 *
 * This drives WhatsApp Web's protocol, which is not an official API — use a
 * dedicated gym number, never a personal one.
 *
 * Runs only in the worker on the gym computer (`npm run whatsapp`): it needs
 * a process that stays alive and a writable folder, neither of which a hosted
 * serverless app has. Nothing in the web app may import this.
 */

export type WhatsAppStatus =
  | "disabled" // turned off by configuration
  | "disconnected" // no session, not connecting
  | "connecting" // socket opening
  | "qr" // waiting for a QR scan
  | "connected"; // paired and ready

type ClientState = {
  sock: WASocket | null;
  status: WhatsAppStatus;
  /** Latest QR payload to render, valid only while status === "qr". */
  qr: string | null;
  /** The linked phone number, once paired. */
  me: string | null;
  lastError: string | null;
  starting: Promise<void> | null;
};

// Survives hot reloads in dev, exactly like the Prisma client.
const globalForWa = globalThis as unknown as { fitflowWa?: ClientState };

const state: ClientState =
  globalForWa.fitflowWa ??
  (globalForWa.fitflowWa = {
    sock: null,
    status: "disconnected",
    qr: null,
    me: null,
    lastError: null,
    starting: null,
  });

function authDir(): string {
  return process.env.WHATSAPP_AUTH_DIR || "./storage/whatsapp-auth";
}

/** True once a QR scan has left credentials on disk. */
export async function hasCredentials(): Promise<boolean> {
  try {
    await stat(path.join(authDir(), "creds.json"));
    return true;
  } catch {
    return false;
  }
}

/** Baileys is chatty; only surface warnings and errors. */
const logger: ILogger = {
  level: "warn",
  child: () => logger,
  trace: () => {},
  debug: () => {},
  info: () => {},
  warn: (o, m) => console.warn("[whatsapp]", m ?? o),
  error: (o, m) => console.error("[whatsapp]", m ?? o),
};

export function getStatus() {
  return {
    status: state.status,
    qr: state.status === "qr" ? state.qr : null,
    me: state.me,
    lastError: state.lastError,
  };
}

/** Called whenever the link comes up or goes down, so the worker can record it. */
export type LinkListener = (me: string | null) => void;
let onLinkChange: LinkListener | null = null;
export function onLink(listener: LinkListener) {
  onLinkChange = listener;
}

/** Called with each new QR payload while pairing. */
let onQr: ((qr: string) => void) | null = null;
export function onQrCode(listener: (qr: string) => void) {
  onQr = listener;
}

/**
 * Open the socket (idempotent). Resolves as soon as the connection attempt is
 * under way — callers poll `getStatus()` for the QR or the connected state.
 */
export async function connect(): Promise<void> {
  if (state.status === "connected" || state.status === "qr") return;
  if (state.starting) return state.starting;

  state.starting = (async () => {
    try {
      state.status = "connecting";
      state.lastError = null;

      const { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } =
        await import("@whiskeysockets/baileys");

      const dir = authDir();
      await mkdir(dir, { recursive: true });
      const { state: auth, saveCreds } = await useMultiFileAuthState(dir);
      const { version } = await fetchLatestBaileysVersion();

      const sock = makeWASocket({
        auth,
        version,
        logger,
        browser: ["FitFlow", "Chrome", "1.0.0"],
        markOnlineOnConnect: false,
        syncFullHistory: false,
      });
      state.sock = sock;

      sock.ev.on("creds.update", saveCreds);

      sock.ev.on("connection.update", (u) => {
        if (u.qr) {
          state.qr = u.qr;
          state.status = "qr";
          onQr?.(u.qr);
        }
        if (u.connection === "open") {
          state.qr = null;
          state.status = "connected";
          state.me = sock.user?.id?.split(":")[0]?.split("@")[0] ?? null;
          console.info("[whatsapp] connected as", state.me);
          onLinkChange?.(state.me);
        }
        if (u.connection === "close") {
          const code = (u.lastDisconnect?.error as { output?: { statusCode?: number } })?.output
            ?.statusCode;
          state.sock = null;
          state.qr = null;

          if (code === DisconnectReason.loggedOut) {
            // The phone unlinked this device: the stored creds are useless.
            state.status = "disconnected";
            state.me = null;
            state.lastError = "logged_out";
            void rm(authDir(), { recursive: true, force: true });
            onLinkChange?.(null);
          } else {
            state.status = "disconnected";
            state.lastError = code ? `close_${code}` : "closed";
            // Transient drop (restart required, network) — come back up.
            setTimeout(() => void connect(), 3_000);
          }
        }
      });
    } catch (e) {
      state.status = "disconnected";
      state.lastError = e instanceof Error ? e.message : "start_failed";
      console.error("[whatsapp] failed to start", e);
    } finally {
      state.starting = null;
    }
  })();

  return state.starting;
}

/**
 * Bring a previously paired number back online without anyone pressing a
 * button. Resolves once connected, or after `waitMs` if it is still not;
 * returns whether the socket is usable.
 */
export async function ensureConnected(waitMs = 20_000): Promise<boolean> {
  // Read through a function: the socket callbacks change `state` while we
  // wait, which TypeScript's narrowing of `state.status` cannot see.
  const status = (): WhatsAppStatus => state.status;
  if (status() === "connected") return true;
  if (status() === "disconnected" && !(await hasCredentials())) return false;
  void connect();
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    if (status() === "connected") return true;
    // Pairing needs a person with the phone; do not hold the caller for that.
    if (status() === "qr") return false;
    await new Promise((r) => setTimeout(r, 250));
  }
  return status() === "connected";
}

/** Unlink this device and forget the stored credentials. */
export async function disconnect() {
  try {
    await state.sock?.logout();
  } catch {
    // Already gone.
  }
  state.sock = null;
  state.status = "disconnected";
  state.qr = null;
  state.me = null;
  await rm(authDir(), { recursive: true, force: true }).catch(() => {});
  onLinkChange?.(null);
}

export type SendResult =
  | { sent: true }
  | { sent: false; reason: "not_connected" | "not_on_whatsapp" | "failed"; detail?: string };

/** Send a plain text message to an international number. */
export async function sendText(opts: { to: string; body: string }): Promise<SendResult> {
  const sock = state.sock;
  if (!sock || state.status !== "connected") return { sent: false, reason: "not_connected" };

  try {
    const [check] = (await sock.onWhatsApp(opts.to)) ?? [];
    if (!check?.exists) return { sent: false, reason: "not_on_whatsapp" };

    await sock.sendMessage(check.jid, { text: opts.body });
    return { sent: true };
  } catch (e) {
    const detail = e instanceof Error ? e.message : undefined;
    console.error("[whatsapp] send failed", e);
    return { sent: false, reason: "failed", detail };
  }
}

/** Send a PDF as a real document attachment to an international number. */
export async function sendDocument(opts: {
  /** Digits only, country code included (e.g. 9647701234567). */
  to: string;
  data: Buffer;
  filename: string;
  mimetype?: string;
  caption?: string;
}): Promise<SendResult> {
  const sock = state.sock;
  if (!sock || state.status !== "connected") return { sent: false, reason: "not_connected" };

  try {
    const [check] = (await sock.onWhatsApp(opts.to)) ?? [];
    if (!check?.exists) return { sent: false, reason: "not_on_whatsapp" };

    await sock.sendMessage(check.jid, {
      document: opts.data,
      mimetype: opts.mimetype ?? "application/pdf",
      fileName: path.basename(opts.filename),
      caption: opts.caption,
    });
    return { sent: true };
  } catch (e) {
    const detail = e instanceof Error ? e.message : undefined;
    console.error("[whatsapp] send failed", e);
    return { sent: false, reason: "failed", detail };
  }
}
