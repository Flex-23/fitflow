import net from "node:net";

/**
 * Minimal client for ZKTeco C3 / inBio access panels — pure Node, no PULL SDK.
 *
 * Wire format (TCP, default port 4370):
 *   AA | 01 | cmd | lenL lenH | [sidL sidH seqL seqH] | data… | crcL crcH | 55
 * CRC-16/ARC (poly 0xA001 reflected, init 0) over everything between AA and
 * the CRC. Reply cmd 0xC8 = OK, 0xC9 = error (signed code in the last byte).
 *
 * The gym's C3-200 (firmware AC 4.3.4) rejects session mode (0x76, error -13),
 * so this speaks the session-less dialect: no session id / sequence bytes.
 * The panel accepts a single TCP client at a time.
 *
 * Reference: github.com/vwout/zkaccess-c3-py. Node-only — never import from
 * a component.
 */

const CMD = {
  CONNECT_SESSION_LESS: 0x01,
  DISCONNECT: 0x02,
  GETPARAM: 0x04,
  CONTROL: 0x05,
  RTLOG_BINARY: 0x0b,
} as const;
const REPLY_OK = 0xc8;
const REPLY_ERROR = 0xc9;

/** Event types worth naming; anything else is shown by number. */
export const EVENT_NAMES: Record<number, string> = {
  0: "Normal punch open",
  8: "Remote opening",
  9: "Remote closing",
  20: "Too short punch interval",
  21: "Door inactive time zone",
  23: "Access denied",
  27: "Unregistered card",
  28: "Opening timeout",
  29: "Card expired",
  200: "Door opened",
  201: "Door closed",
  202: "Exit button",
  206: "Device start",
  255: "Door/alarm status",
};

/** Realtime-log events that carry a card the bridge should judge. */
export const CARD_EVENTS = new Set([0, 27, 29]);

export type RtEvent = {
  kind: "event";
  time: string;
  card: number;
  pin: number;
  verify: number;
  door: number;
  type: number;
  typeName: string;
  /** 1 = entry reader, 2 = exit reader. */
  inOut: number;
};
export type RtStatus = { kind: "status"; time: string; doorSensor: number[]; alarm: number };
export type RtRecord = RtEvent | RtStatus;

function crc16(bytes: Uint8Array): number {
  let crc = 0;
  for (const b of bytes) {
    crc ^= b;
    for (let i = 0; i < 8; i++) crc = crc & 1 ? (crc >>> 1) ^ 0xa001 : crc >>> 1;
  }
  return crc & 0xffff;
}

function frame(cmd: number, data: Buffer = Buffer.alloc(0)): Buffer {
  const len = data.length;
  const inner = Buffer.concat([Buffer.from([0x01, cmd, len & 0xff, (len >> 8) & 0xff]), data]);
  const crc = crc16(inner);
  return Buffer.concat([Buffer.from([0xaa]), inner, Buffer.from([crc & 0xff, (crc >> 8) & 0xff, 0x55])]);
}

/** Panel timestamps are packed as (((y-2000)*12+m-1)*31+d-1)*86400 + h*3600 + m*60 + s. */
function panelTime(v: number): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const year = Math.floor(v / 32140800) + 2000;
  const month = (Math.floor(v / 2678400) % 12) + 1;
  const day = (Math.floor(v / 86400) % 31) + 1;
  return `${year}-${p(month)}-${p(day)} ${p(Math.floor(v / 3600) % 24)}:${p(Math.floor(v / 60) % 60)}:${p(v % 60)}`;
}

type Reply = { cmd: number; data: Buffer; okCrc: boolean } | { closed: true; reason: string };

export class C3Panel {
  private sock: net.Socket | null = null;
  private buf = Buffer.alloc(0);
  private waiters: ((r: Reply) => void)[] = [];
  private lastError: Error | null = null;
  /** Called whenever the panel drops the link, with the reason. */
  onClose: ((reason: string) => void) | null = null;

  constructor(
    readonly host: string,
    readonly port = 4370,
    private readonly password = ""
  ) {}

  get connected(): boolean {
    return this.sock !== null && !this.sock.destroyed;
  }

  /** Open the socket and perform the protocol handshake. */
  async connect(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const s = net.createConnection({ host: this.host, port: this.port });
      s.setTimeout(4000);
      s.setNoDelay(true);
      s.once("connect", () => {
        s.setTimeout(0);
        this.sock = s;
        this.buf = Buffer.alloc(0);
        resolve();
      });
      s.once("timeout", () => {
        s.destroy();
        reject(new Error("TCP connect timeout"));
      });
      s.once("error", (e) => {
        this.lastError = e;
        reject(e);
      });
      s.on("data", (chunk) => this.onData(chunk));
      // Fail pending requests immediately on a drop so the caller can
      // reconnect instead of sitting through a timeout.
      s.on("close", (hadError) => {
        if (this.sock === s) this.sock = null;
        const reason = hadError && this.lastError ? this.lastError.message : "closed by peer";
        const pending = this.waiters;
        this.waiters = [];
        for (const w of pending) w({ closed: true, reason });
        this.onClose?.(reason);
      });
    });

    const r = await this.exchange(CMD.CONNECT_SESSION_LESS, Buffer.from(this.password, "ascii"));
    if ("closed" in r || r.cmd !== REPLY_OK) throw new Error("panel refused the connection");
  }

  private onData(chunk: Buffer) {
    this.buf = Buffer.concat([this.buf, chunk]);
    while (this.buf.length >= 5) {
      if (this.buf[0] !== 0xaa) {
        this.buf = this.buf.subarray(1);
        continue;
      }
      const len = this.buf[3] | (this.buf[4] << 8);
      const total = 5 + len + 3;
      if (this.buf.length < total) return;
      const f = this.buf.subarray(0, total);
      this.buf = this.buf.subarray(total);
      const gotCrc = f[total - 3] | (f[total - 2] << 8);
      const w = this.waiters.shift();
      w?.({ cmd: f[2], data: f.subarray(5, 5 + len), okCrc: crc16(f.subarray(1, total - 3)) === gotCrc });
    }
  }

  private exchange(cmd: number, data?: Buffer): Promise<Reply> {
    return new Promise((resolve, reject) => {
      if (!this.connected) return reject(new Error("not connected"));
      const onReply = (r: Reply) => {
        clearTimeout(t);
        resolve(r);
      };
      const t = setTimeout(() => {
        this.waiters = this.waiters.filter((x) => x !== onReply);
        reject(new Error(`timeout waiting for reply to 0x${cmd.toString(16)}`));
      }, 5000);
      this.waiters.push(onReply);
      this.sock!.write(frame(cmd, data));
    });
  }

  private async request(cmd: number, data?: Buffer): Promise<Buffer> {
    const r = await this.exchange(cmd, data);
    if ("closed" in r) throw new Error(`connection lost (${r.reason})`);
    if (!r.okCrc) throw new Error("reply CRC mismatch");
    if (r.cmd === REPLY_ERROR) {
      const code = r.data.length ? (r.data[r.data.length - 1] << 24) >> 24 : 0;
      throw new Error(`panel error ${code} on 0x${cmd.toString(16)}`);
    }
    if (r.cmd !== REPLY_OK) throw new Error(`unexpected reply 0x${r.cmd.toString(16)}`);
    return r.data;
  }

  /** Read named parameters, e.g. ["~SerialNumber", "LockCount", "FirmVer"]. */
  async getParams(names: string[]): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    const text = (await this.request(CMD.GETPARAM, Buffer.from(names.join(","), "ascii"))).toString("latin1");
    for (const m of text.matchAll(/([\w~]+)=([^,\t\x00]+)/g)) out[m[1]] = m[2];
    return out;
  }

  /** Drain the realtime log: card reads plus a door-status record. */
  async realtimeLog(): Promise<RtRecord[]> {
    const data = await this.request(CMD.RTLOG_BINARY);
    const recs: RtRecord[] = [];
    for (let i = 0; i + 16 <= data.length; i += 16) {
      const r = data.subarray(i, i + 16);
      const type = r[10];
      const time = panelTime(r.readUInt32LE(12));
      if (type === 255) {
        recs.push({ kind: "status", time, doorSensor: [r[4], r[5], r[6], r[7]], alarm: r.readUInt32LE(0) });
      } else {
        recs.push({
          kind: "event",
          time,
          card: r.readUInt32LE(0),
          pin: r.readUInt32LE(4),
          verify: r[8],
          door: r[9],
          type,
          typeName: EVENT_NAMES[type] ?? `event ${type}`,
          inOut: r[11],
        });
      }
    }
    return recs;
  }

  /** Pulse a door relay: 1–254 s open, 0 = close now, 255 = hold open. */
  async openDoor(door: number, seconds: number): Promise<void> {
    // ControlDevice: operation 1 (output), param1 door, param2 1 (door relay,
    // 2 would be an aux output), param3 duration, param4 reserved.
    await this.request(CMD.CONTROL, Buffer.from([1, door, 1, seconds, 0]));
  }

  async close(): Promise<void> {
    try {
      if (this.connected) await this.request(CMD.DISCONNECT);
    } catch {
      // Already gone.
    }
    this.sock?.destroy();
    this.sock = null;
  }
}
