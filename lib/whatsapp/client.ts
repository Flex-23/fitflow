import { mkdir, readFile, rm } from "node:fs/promises";
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
  /** Set while a close is deliberate, so it is not undone by a reconnect. */
  stopped: boolean;
  /**
   * Bumped for every socket we open, and whenever we abandon one.
   *
   * Baileys keeps delivering events from a socket after it has been replaced,
   * and those events used to be applied to the live connection: an old
   * socket's "close" would clear `sock` while `status` still said connected
   * from the new one. Nothing could send after that, and nothing reconnected,
   * because by every status check the link was fine. A socket now ignores its
   * own events once it is no longer the current generation.
   */
  generation: number;
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
    stopped: false,
    generation: 0,
  });

/**
 * Ready to send: a socket we still own, on an open connection.
 *
 * Both halves, always together. Asking only about `status` is what let the
 * worker sit in a loop reporting "socket down" on every message while
 * believing it was connected.
 */
function ready(): boolean {
  return state.sock !== null && state.status === "connected";
}

function authDir(): string {
  return process.env.WHATSAPP_AUTH_DIR || "./storage/whatsapp-auth";
}

/**
 * True when there is a stored identity worth reconnecting with.
 *
 * Not "creds.json exists": Baileys writes that file the moment a socket
 * opens, long before anyone scans anything, so its presence says only that
 * we have tried. What it fills in on a successful scan is `me` — the number
 * WhatsApp assigned this device.
 *
 * Deliberately not `registered`, which reads like the obvious answer and is
 * the wrong one: Baileys sets that flag only when pairing by typed code, so
 * a number linked by QR — the way this gym links one — leaves it false for
 * ever. Trusting it left the worker idle beside a queue it could have sent.
 */
export async function hasCredentials(): Promise<boolean> {
  try {
    const raw = await readFile(path.join(authDir(), "creds.json"), "utf8");
    return typeof JSON.parse(raw)?.me?.id === "string";
  } catch {
    // Missing, unreadable or half-written — either way, nothing to resume.
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
  // `ready()`, not the status word: a state that claims to be connected with
  // no socket behind it must be allowed to reconnect, or it stays that way
  // for the life of the process.
  if (ready() || state.status === "qr") return;
  if (state.starting) return state.starting;

  state.starting = (async () => {
    // Everything opened before this moment is now history, whatever it still
    // has to say for itself.
    const generation = ++state.generation;
    const isCurrent = () => state.generation === generation;

    try {
      state.status = "connecting";
      state.lastError = null;
      state.stopped = false;

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
        // A socket we have already replaced or abandoned; its news is stale
        // and applying it would corrupt the live connection's state.
        if (!isCurrent()) return;

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
          } else if (state.stopped) {
            // We closed it ourselves — a pairing window that ran out.
            state.status = "disconnected";
            state.lastError = null;
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
  if (ready()) return true;
  if (status() === "disconnected" && !(await hasCredentials())) return false;
  void connect();
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    if (ready()) return true;
    // Pairing needs a person with the phone; do not hold the caller for that.
    if (status() === "qr") return false;
    await new Promise((r) => setTimeout(r, 250));
  }
  return ready();
}

/**
 * Close a socket that is showing a QR code, without touching credentials.
 *
 * A pairing code is a key to the account, so it exists only while someone is
 * standing there with the phone. When that window closes the socket goes with
 * it, otherwise Baileys keeps minting fresh codes at nobody.
 *
 * Only ever a code nobody scanned: once a scan lands the socket leaves the
 * "qr" state, and closing it then would abandon the pairing half-way.
 */
export async function stopPairing(): Promise<void> {
  if (state.status !== "qr") return;
  // Retire this socket: whatever it says from here on is not about the
  // connection we will open next.
  state.generation++;
  state.stopped = true;
  try {
    state.sock?.end(undefined);
  } catch {
    // Already gone; the state below is what matters.
  }
  state.sock = null;
  state.qr = null;
  state.status = "disconnected";
}

/**
 * Throw away an unfinished pairing so the next one starts clean.
 *
 * A scan that was interrupted before it completed leaves an identity on disk
 * that WhatsApp will not accept again: every later attempt tries to resume it
 * and fails, which looks exactly like a QR code that does nothing. Called
 * once when a fresh pairing window opens — never while one is in progress,
 * and never when the number is properly linked.
 */
export async function resetPairing(): Promise<void> {
  // Retire this socket: whatever it says from here on is not about the
  // connection we will open next.
  state.generation++;
  state.stopped = true;
  try {
    state.sock?.end(undefined);
  } catch {
    // Already gone.
  }
  state.sock = null;
  state.qr = null;
  state.me = null;
  state.status = "disconnected";
  await rm(authDir(), { recursive: true, force: true }).catch(() => {});
}

/** Unlink this device and forget the stored credentials. */
export async function disconnect() {
  // Retire this socket: whatever it says from here on is not about the
  // connection we will open next.
  state.generation++;
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
  if (!ready()) return { sent: false, reason: "not_connected" };
  const sock = state.sock!;

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
  if (!ready()) return { sent: false, reason: "not_connected" };
  const sock = state.sock!;

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
