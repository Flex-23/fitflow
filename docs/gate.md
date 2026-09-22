# The gate — how the turnstile is wired into FitFlow

> **بالعربي باختصار:** البوابة الدوّارة تُفتح بقرار من FitFlow وليس من اللوحة.
> اللوحة (ZKTeco C3-200) لا تحتوي أي بطاقة في ذاكرتها — فهي ترفض كل تمريرة
> وتكتبها في سجلها، وبرنامج «الجسر» على كمبيوتر الصالة يقرأ السجل، يبحث عن
> صاحب البطاقة في قاعدة البيانات، ويتحقق من اشتراكه، ثم يأمر اللوحة بالفتح إن
> كان فعّالاً. هذا يعني أن التجديد والتجميد والإلغاء تُطبَّق على الباب فوراً
> بلا أي مزامنة. الثمن: إن أُطفئ الكمبيوتر أو انقطع الإنترنت لا تفتح البوابة
> لأحد — وحلّ ذلك موصوف في `gate-hybrid-mode.md`.

---

## 1. What happens when a card is tapped

```
 ① member taps the card
        │
        ▼
 ┌──────────────┐  Wiegand-26   ┌────────────────────┐
 │    reader    │──────────────►│  ZKTeco C3-200     │  ② panel does not know
 │ (door 2, in) │   26 bits     │  192.168.1.201     │     the card → refuses,
 └──────────────┘               │  no cards stored   │     logs "event 27"
                                └─────────┬──────────┘
                            LAN, TCP 4370 │  ▲
                          ③ bridge polls  │  │ ⑥ "open door 2 for 3s"
                             every 300 ms ▼  │
                          ┌─────────────────────────┐
                          │   npm run gate          │
                          │   (gym computer)        │
                          └─────────┬───────────────┘
                     ④ look up card  │  ▲ ⑤ ACTIVE subscription?
                        over internet▼  │
                          ┌─────────────────────────┐
                          │ Supabase Postgres (fra) │
                          └─────────────────────────┘
```

Total measured time from tap to the relay firing: **~360 ms**, of which ~80 ms
is the database round trip and the rest is the poll interval and the panel.

**Why the panel holds no cards.** If cards lived in the panel, every renewal,
freeze and cancellation would have to be pushed to it, and the two copies
would drift. Keeping FitFlow as the only source of truth removes that entire
class of bug. The cost is the dependency described in §9.

---

## 2. The hardware

| | |
|---|---|
| Panel | **ZKTeco C3-200**, 2 doors, 4 readers (in + out per door) |
| Serial | `AJNV213160002` |
| MAC | `00:17:61:CD:D6:9E` |
| Firmware | `AC Ver 4.3.4 Jan 5 2019` |
| Capacity | 30 000 cards, 100 000 events (unused — we store none) |
| Relay | dry contact per door, `Door2Drivertime = 5 s` by default |
| Door sensors | none fitted (normal for a turnstile) |

**Readers.** The C3-200 exposes four reader ports: door 1 in/out and door 2
in/out. At this gym **only the door-2 entry reader works** — the door-1 reader
is physically damaged. That is why `GATE_DOOR=2`. A tap arrives as
`door=2, inOut=1`.

**Power.** The panel and the turnstile motor share a 12 V supply. During early
testing the panel browned out and rebooted whenever the relay fired several
times in a row; the symptom was the Ethernet link dropping to `Disconnected`
for ~10 s. ZKTeco recommend feeding the lock/motor from a separate supply. See
§9 if this returns.

---

## 3. Network

The panel holds a **fixed** address and speaks only IPv4:

```
IP       192.168.1.201
Netmask  255.255.255.0
Gateway  0.0.0.0   (none — it never needs to leave the LAN)
Port     4370/TCP
Password (empty)
```

**The computer must be on the same subnet**, which is the single most common
reason "the gate does nothing":

- **Straight cable to the laptop** — give that Ethernet port a static
  `192.168.1.50/24`. If the laptop's Wi-Fi is also on `192.168.1.x`, add a
  host route so traffic for the panel takes the cable:
  ```powershell
  New-NetIPAddress -InterfaceAlias Ethernet -IPAddress 192.168.1.50 -PrefixLength 24
  New-NetRoute -DestinationPrefix "192.168.1.201/32" -InterfaceIndex <ethIndex> -NextHop 0.0.0.0 -RouteMetric 1
  ```
- **Into the gym router** — the router must hand out `192.168.1.x`, or the
  panel's own address must be changed to match the router's range. A panel on
  `192.168.1.201` is invisible from a `192.168.68.x` network, however healthy
  it is.

**Only one TCP client at a time.** The panel accepts a single connection. Close
ZKAccess (or any second copy of the bridge) before running this one, or they
will take turns knocking each other off.

---

## 4. Card numbers — the two forms

This bit is not obvious and caused real confusion.

| | value |
|---|---|
| The desk (USB) reader types | `0117369627` |
| Stored in `Member.cardNumber` | `117369627` (digits, leading zeros dropped) |
| The turnstile reader reports | `16706331` |
| Stored in `Member.cardWiegand` | `16706331` |

The turnstile reader talks **Wiegand-26**, which carries only the low 24 bits
of the card number:

```
117369627 = 0x06FEEB1B
 16706331 =   0xFEEB1B     ← the top byte is cut off
```

So `cardWiegand = cardNumber & 0xFFFFFF`. Both are stored: the full number for
display and uniqueness, the truncated one for the gate lookup, which is
indexed. The conversion lives in [`lib/gate/card.ts`](../lib/gate/card.ts):

```ts
export function wiegand26(card: string): number {
  return Number(BigInt(card) & WIEGAND26_MASK);   // 0xFFFFFF
}
```

`BigInt` rather than a plain number because desk readers can emit values past
2⁵³.

**Consequence to watch:** two different cards can share the low 24 bits. The
registration form rejects a duplicate `cardNumber`; a duplicate `cardWiegand`
is still possible in theory and would let one member open the gate with the
other's card. With a single box of cards this will not happen, but it is worth
a check if cards are ever bought from a second supplier.

---

## 5. The protocol

No ZKTeco SDK is used — the panel is spoken to directly over TCP. The SDK
(`plcommpro.dll`) is 32-bit Windows-only, and this had to run inside Node.

### Frame layout

```
AA | 01  | cmd | lenL lenH | [sidL sidH seqL seqH] | data… | crcL crcH | 55
│    │     │     │           └── session mode only (not used here)
│    │     │     └── payload length, little-endian
│    │     └── command byte
│    └── protocol version
└── start byte                                              end byte ──┘
```

- **CRC-16/ARC** over everything between `AA` and the CRC: polynomial `0xA001`
  reflected, initial value `0`.
- Reply command `0xC8` = OK, `0xC9` = error with a **signed** error code in the
  last data byte.

### Session-less mode

The documented handshake is `CONNECT_SESSION` (`0x76`), which returns a session
id that must then ride in every frame. **This firmware answers it with error
`-13`** (command not available). So the bridge uses `CONNECT_SESSION_LESS`
(`0x01`) instead and omits the session/sequence bytes entirely. Anything
written against the official SDK docs will fail here until this is accounted
for.

### Commands used

| Command | Byte | Purpose |
|---|---|---|
| `CONNECT_SESSION_LESS` | `0x01` | handshake (payload = password, empty here) |
| `DISCONNECT` | `0x02` | polite close |
| `GETPARAM` | `0x04` | read settings — payload is a comma-separated name list |
| `CONTROL` | `0x05` | open a door |
| `RTLOG_BINARY` | `0x0B` | drain the realtime log |

`GETPARAM` replies with `key=value,key=value` text. Useful keys:
`~DeviceName`, `~SerialNumber`, `FirmVer`, `LockCount`, `ReaderCount`,
`IPAddress`, `NetMask`, `MAC`, `Door1Drivertime`, `Door2Drivertime`.

### Realtime log records (16 bytes each)

| Offset | Size | Meaning |
|---|---|---|
| 0 | 4 | card number, little-endian (the Wiegand-26 form) |
| 4 | 4 | PIN, little-endian |
| 8 | 1 | verify mode (4 = card) |
| 9 | 1 | door number |
| 10 | 1 | **event type** |
| 11 | 1 | in/out (1 = entry, 2 = exit) |
| 12 | 4 | timestamp, little-endian |

Event type `255` means the record is a door/alarm status snapshot rather than a
card read, and is parsed differently.

**Timestamp encoding** — not a Unix epoch:

```
value = (((year-2000)*12 + month-1)*31 + day-1) * 86400
        + hour*3600 + minute*60 + second
```

Every month is treated as 31 days. Decoded in `panelTime()`.

### Event types that matter

| Type | Meaning | Bridge response |
|---|---|---|
| `0` | Normal punch open (panel opened it itself) | would log only — cannot happen while the panel holds no cards |
| `20` | Too short punch interval | ignored (the panel's own debounce) |
| `21` | Door inactive time zone | ignored |
| `23` | Access denied | ignored |
| **`27`** | **Unregistered card** | **the normal path — decide and open** |
| `29` | Card expired (on the panel) | decide and open |
| `200/201` | Door opened / closed | ignored |
| `202` | Exit button | ignored |
| `206` | Device start (panel rebooted) | ignored |
| `255` | Door/alarm status | ignored |

Only `0`, `27` and `29` carry a card worth judging — `CARD_EVENTS` in
[`lib/gate/c3.ts`](../lib/gate/c3.ts).

### Opening a door

```ts
// operation 1 = output, param1 = door, param2 = 1 (door relay, 2 = aux),
// param3 = seconds (0 closes now, 255 holds open), param4 unused
await this.request(CMD.CONTROL, Buffer.from([1, door, 1, seconds, 0]));
```

---

## 6. The code

| File | Role |
|---|---|
| [`lib/gate/c3.ts`](../lib/gate/c3.ts) | the protocol: framing, CRC, `connect`, `getParams`, `realtimeLog`, `openDoor`, auto-fail of pending requests when the socket drops |
| [`lib/gate/card.ts`](../lib/gate/card.ts) | card number normalisation and the Wiegand-26 conversion (client-safe — the registration form imports it) |
| [`lib/gate/decide.ts`](../lib/gate/decide.ts) | the entry rule, shared so the door and the app can never disagree |
| [`lib/worker-db.ts`](../lib/worker-db.ts) | Prisma client for the workers, using `DIRECT_URL` (see §8) |
| [`scripts/gate-bridge.ts`](../scripts/gate-bridge.ts) | the loop that runs at the gym |
| [`scripts/gate-check.ts`](../scripts/gate-check.ts) | the self-test |
| [`app/(app)/gate/page.tsx`](<../app/(app)/gate/page.tsx>) | the log reception sees |

### The entry rule

```ts
const running = subs.find(
  (s) => s.status === "ACTIVE" && s.startDate <= now && s.endDate >= now
);
```

Dates are compared directly rather than trusting the status flag alone,
because the app only flips `ACTIVE → EXPIRED` lazily when a staff page loads —
a subscription that ran out overnight would otherwise still read `ACTIVE`.

Refusal reasons: `unknown_card`, `no_subscription`, `expired`, `frozen`,
`cancelled`. A **frozen** subscription is refused; an unpaid **deferred**
balance is *not* — that matches the video links and was a deliberate choice.

### The bridge loop

1. Connect to the panel, retrying with a growing delay (1 s → 15 s). The panel
   refuses new connections for a while after dropping one, so hammering it
   keeps it busy refusing.
2. Every `GATE_POLL_MS` (300 ms) call `realtimeLog()`.
3. For each card event: ignore anything not in `CARD_EVENTS`, then apply a
   3-second same-card debounce on top of the panel's own.
4. `decideEntry()` → on allow, `openDoor(GATE_DOOR, GATE_OPEN_SECONDS)`.
5. Write a `GateLog` row **without awaiting it** — a slow or failed log write
   must never delay or block the door.

---

## 7. Database

```prisma
model Member {
  cardNumber  String? @unique   // as the desk reader types it
  cardWiegand Int?              // low 24 bits — what the panel reports
  @@index([cardWiegand])
}

model GateLog {
  memberId  String?   // null when the card matched nobody
  card      String    // as the panel reported it
  door      Int
  allowed   Boolean
  reason    String?   // unknown_card | no_subscription | expired | frozen | cancelled
  createdAt DateTime @default(now())
}
```

`GateLog` is written only by the bridge and read only by `/gate`, which groups
it by gym day (03:00 → 02:59) and refreshes itself every 5 seconds.

---

## 8. Configuration

```bash
GATE_ENABLED="true"            # the bridge refuses to start otherwise
GATE_PANEL_HOST="192.168.1.201"
GATE_PANEL_PORT="4370"
GATE_PANEL_PASSWORD=""         # comm password, empty at factory settings
GATE_DOOR="2"                  # the working entry reader here
GATE_OPEN_SECONDS="3"          # 1–254; 0 closes, 255 holds open
GATE_POLL_MS="300"
```

The bridge also needs `DATABASE_URL` **and `DIRECT_URL`**. It connects through
`DIRECT_URL` on purpose: measured from Iraq, the same query cost ~430 ms
through Supabase's transaction pooler and ~95 ms over the session port, and
the gate spends one query per tap. The hosted app must keep using the pooler —
see `deployment.md`.

---

## 9. Running it, and what goes wrong

```bash
npm run gate:check            # prove the whole chain, open nothing
npm run gate:check -- --open  # also pulse the relay — the gate will turn
npm run gate                  # run it in this terminal (dies with the window)
```

### Starting with Windows

On the gym computer the bridge runs as a scheduled task so the turnstile is
never waiting on a person. From an **Administrator** PowerShell in the project
folder:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\install-worker-task.ps1 -Worker gate
powershell -ExecutionPolicy Bypass -File scripts\install-worker-task.ps1 -Worker gate -Uninstall
```

This registers `\FitFlow\FitFlow gate`:

- **Trigger:** at boot, 30 seconds late so the network is up first.
- **Account:** `SYSTEM`. It therefore runs **before anyone logs into Windows**,
  which is the point — members are admitted whether or not reception or the
  manager has signed in, or opened the website at all. The bridge only needs
  the panel and the database; the app is not in the path of a card tap.
- **Supervision:** `scripts/run-worker.ps1` restarts the worker 10 seconds
  after any exit and rotates its log at 5 MB, keeping one previous file.
- **Log:** `storage/logs/gate.log`, UTF-8 so Arabic member names stay readable.

Check it:

```powershell
Get-ScheduledTask -TaskPath "\FitFlow\"                 # State should be Running
Get-Content storage\logs\gate.log -Tail 20 -Encoding UTF8
```

The same script installs the WhatsApp worker with `-Worker whatsapp`.

A healthy self-test:

```
Database
  OK    connected — 1146ms to open
  OK    query latency — median 80ms
  OK    members with an access card — 1 of 1
  OK    decision round-trip — 358ms for باقر → ALLOW
Panel at 192.168.1.201:4370
  OK    reachable — 6ms
  OK    protocol handshake
        device  C3-200  SN AJNV213160002  AC Ver 4.3.4 Jan  5 2019
  OK    realtime log readable
```

| Symptom | Cause | Fix |
|---|---|---|
| Nothing happens on a tap | **the bridge is not running** — by far the most common | check the task is `Running`, or `npm run gate` |
| `panel unreachable`, ping also fails, link `Disconnected` | power or cable | separate supply for the motor; reseat the RJ45 |
| Ping works, port 4370 refuses | another client holds the single slot, **or** the panel is recovering from a drop | close ZKAccess and any second bridge; otherwise wait — the backoff handles it |
| Ping works, nothing else does | computer and panel on different subnets | §3 |
| `DENY unknown_card` | the card is not on any member, or only the full number was saved | check `cardWiegand` is set — re-save the member |
| `DENY expired` on a renewed member | the renewal queued *after* the current one; that is correct | check the dates on the member page |
| Gate hesitates ~1 s | using the pooler instead of `DIRECT_URL`, or a far Supabase region | §8 |

**The panel dropping and returning is normal here and is handled.** In one
observed stretch the bridge logged 33 failed attempts across about a minute
before the panel accepted again and then stayed up — and no tap was lost,
because a tap sits in the panel's log until the bridge reads it.

---

## 10. Verified working

Live, against Supabase Frankfurt, on 2026-09-22:

```
2026-09-22T16:25:27Z  card=16706331 door=2  ALLOW  باقر
2026-09-22T16:26:45Z  card=16706331 door=2  ALLOW  باقر
2026-09-22T16:27:58Z  card=16703077 door=2  ALLOW  محمد
```

Two members, three entries, the turnstile turning each time, every decision
made by the hosted database.

---

## 11. Known limitations

1. **The gate depends on the gym computer and the internet.** The panel holds
   no cards, so if either is down nobody gets in.
   [`gate-hybrid-mode.md`](gate-hybrid-mode.md) specifies pushing active cards
   into the panel's own memory with their expiry dates, so it keeps working
   offline while the bridge keeps logging. That is the next step.
2. **Only one reader works** (door 2, entry). Exit is uncontrolled until the
   door-1 reader is repaired.
3. **No anti-passback** — one card can be passed back and used again.
4. **The panel clock drifts** and is not corrected. It does not matter today,
   because timestamps come from the database, but hybrid mode will need it.
5. **The panel drops its connection from time to time** (see §9). The bridge
   rides it out and no tap is lost, but the root cause is likely the 12 V
   supply shared with the turnstile motor and deserves an electrician.
