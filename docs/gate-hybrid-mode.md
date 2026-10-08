# Gate — Hybrid mode (panel-side authorization) — implementation spec

> **الهدف بالعربي:** حالياً البوابة تعمل فقط عندما يكون كمبيوتر الصالة شغّالاً وسكربت الجسر (`npm run gate`) يعمل، لأن ذاكرة اللوحة فارغة والقرار كله عند FitFlow. هذا المستند يصف كيف نجعل FitFlow **يدفع البطاقات الفعّالة إلى ذاكرة اللوحة مع تاريخ انتهاء الاشتراك**، فتفتح اللوحة بنفسها حتى لو الكمبيوتر مطفأ، بينما يبقى الجسر مسؤولاً عن التسجيل والمزامنة والحالات الاستثنائية. كل التفاصيل التقنية أدناه بالإنجليزية لتُعطى مباشرة لمن يبني الميزة (AI أو مطوّر).

**Status:** implemented 2026-09-28, pending validation on the real panel.
Everything in §4–§5 is written: `lib/gate/c3.ts` gained
`getTableConfig`/`getData`/`setData`/`deleteData`/`setDateTime`;
`lib/gate/sync.ts` (new) has `desiredPanelState`, `knownCards`, `reconcile`,
`wipePanel`; `scripts/gate-bridge.ts` has the full event table, the dirty
flag, the wipe flag, heartbeat + panel-user count, and clock sync; the web
app writes `markGateDirty()` from every call site in §4.3, and `/settings`
has the resync/wipe card. The encoding and the `DATATABLE_CFG` parser were
checked byte-for-byte against this document's own §5.1/§5.3 worked examples,
and `desiredPanelState` was run against the real database — everything that
does **not** need the physical panel. What still needs the panel itself:
the §7 test plan below, in particular whether `SETDATA` truly upserts in
place (§5.3) and the real RTLog event types on an actual tap.

**Validated live on the real panel, 2026-09-28** (see §5.5 for the one
finding): `SETDATA`/`GETDATA`/`DELETEDATA` all work as designed — a member
was correctly synced with the exact `StartTime`/`EndTime` from the database,
read back byte-for-byte, and a foreign leftover row was correctly left alone
without `GATE_PANEL_TAKEOVER`. The door opened for a synced card with the
network cable to the panel physically unplugged — hybrid mode's core claim,
confirmed.

---

## 1. Why

Today FitFlow is the only place that knows who may enter. The C3-200 panel
holds **no cards**; every tap is refused by the panel, reported to the bridge,
judged against the database and, if allowed, the bridge fires the door relay.

That gives instant effect for renew / freeze / cancel, but it has one hard
dependency: **if the gym PC is off, or `npm run gate` is not running, nobody
gets in.**

Hybrid mode removes that dependency:

- FitFlow keeps a mirror of "who is allowed" **inside the panel's own user
  table**, with the subscription end date as the card's validity. The panel
  then opens on its own, offline, exactly like ZKTeco's ZKAccess software
  would.
- The bridge keeps running when the PC is on: it syncs the mirror, logs every
  tap into `GateLog`, and still handles the cases the panel cannot (a card
  assigned seconds ago, a renewal not yet pushed, panel memory wiped).

FitFlow stays the single source of truth. The panel is a cache.

## 2. What exists now (read this before changing anything)

| Piece | Where | Notes |
|---|---|---|
| Card on member | `prisma/schema.prisma` → `Member.cardNumber` (as typed by the USB desk reader, digits, leading zeros dropped, unique) and `Member.cardWiegand` (low 24 bits — what the turnstile reader reports) | helpers in `lib/gate/card.ts` |
| Tap log | `GateLog` model (`memberId?`, `card`, `door`, `allowed`, `reason`, `createdAt`) | written only by the bridge; in backup `TABLES` and `reset-data.ts` |
| Panel client | `lib/gate/c3.ts` (`C3Panel`) — pure Node, no PULL SDK | commands implemented: connect (session-less 0x01), GETPARAM 0x04, RTLOG 0x0B, CONTROL 0x05, DISCONNECT 0x02 |
| Entry rule | `lib/gate/decide.ts` (`decideEntry`) | mirrors `app/actions/watch.ts`: ACTIVE subscription whose dates cover now; FROZEN / EXPIRED / CANCELLED refused |
| Bridge | `scripts/gate-bridge.ts` → `npm run gate` | poll RTLog every `GATE_POLL_MS`, decide, `openDoor`, write `GateLog`; auto-reconnect |
| UI | card field on registration + member edit (`components/reception/card-number-input.tsx` swallows the reader's Enter), card in details, members search by card, `/gate` page (`components/reception/gate-log.tsx`) | `/gate` auto-refreshes today's list every 5 s |
| Config | `.env` → `GATE_ENABLED`, `GATE_PANEL_HOST` (192.168.1.201), `GATE_PANEL_PORT` (4370), `GATE_PANEL_PASSWORD` (empty), `GATE_DOOR` (2), `GATE_OPEN_SECONDS` (3), `GATE_POLL_MS` (300) | documented in `.env.example` |

**Rules that must survive:**
- None of `lib/gate/*` or `scripts/gate-bridge.ts` may import `server-only`
  (they run under `tsx`, outside Next.js, where that package throws).
- **The panel accepts exactly one TCP client at a time.** Only the bridge
  process may talk to the panel. The web app must never open its own socket —
  it communicates with the bridge through the database (see §4.3).

## 3. Panel facts (verified on the real hardware, 2026-09-21)

- Model **ZKTeco C3-200**, SN `AJNV213160002`, firmware `AC Ver 4.3.4 Jan 5 2019`,
  MAC `00:17:61:CD:D6:9E`, static IP `192.168.1.201/24`, TCP 4370, empty password.
- `LockCount=2`, `ReaderCount=4` (in/out per door), `AuxInCount=2`, `AuxOutCount=2`,
  `Door1Drivertime=5`, `Door2Drivertime=5`, no door sensors.
- Only the **door-2 entry reader** works (reader 3). The door-1 reader is
  physically broken. Taps arrive as `door=2, inOut=1`.
- Session mode (0x76) is refused with error `-13` → use **session-less** (0x01).
  In session-less mode frames carry no session id / sequence bytes.
- Test card: desk reader types `0117369627` → stored `117369627` →
  panel reports `16706331` (= `117369627 & 0xFFFFFF`). Bytes little-endian:
  `1B EB FE`.
- Panel clock drifts (was ~1 min behind after an afternoon). Hybrid mode makes
  validity **date-based on the panel**, so the bridge must set the panel clock
  (see §5.5).
- Power: the panel browned out / rebooted several times during testing after
  the relay fired repeatedly (12 V supply suspected). Physical fix pending;
  the bridge already reconnects. Panel memory survives reboots (it has an RTC
  battery and flash), but a factory reset (DIP switch 7 toggled 3× within
  10 s + restart) wipes users → reconciliation (§4.3) must rebuild it.

## 4. Design

### 4.1 What goes into the panel

One `user` row + one `userauthorize` row per member who:

- has `cardWiegand != null`, **and**
- has at least one subscription with `status = ACTIVE` whose `endDate >= today`
  (running now, or queued to start later — early renewals chain subscriptions).

| Panel field | Value | Why |
|---|---|---|
| `user.CardNo` | `Member.cardWiegand` | what the turnstile reader reports |
| `user.Pin` | `Member.cardWiegand` | must be a unique number; reusing the card avoids adding a numeric id to `Member`. Max 16,777,215 (8 digits) — fine. |
| `user.Password` | empty | only the empty form is validated on the wire (see §5.3) |
| `user.Group` | `0` | unused |
| `user.StartTime` | `min(startDate)` of the qualifying subscriptions, as `YYYYMMDD` int | panel refuses before this date |
| `user.EndTime` | `max(endDate)` of the qualifying subscriptions, as `YYYYMMDD` int (**inclusive** day) | panel refuses after this date → this is the whole point |
| `user.SuperAuthorize` | `0` | |
| `userauthorize.Pin` | same Pin | |
| `userauthorize.AuthorizeTimezoneId` | `1` | panel's factory time zone 1 = 24 h × 7 (verify once with `GETDATA timezone`) |
| `userauthorize.AuthorizeDoorId` | bitmask of entry doors: door 1 → `1`, door 2 → `2`, both → `3` | derive from `GATE_DOOR` (`1 << (door - 1)`); when the door-1 reader is repaired set both |

Members that stop qualifying (frozen, cancelled, expired, card removed,
member deleted) are **deleted from the panel**. Do not try to express "frozen"
with dates — delete and re-add on unfreeze; it is simpler and the freeze
extends `endDate` anyway.

Deferred balances do **not** block entry (same as today and as the video
links).

### 4.2 Event handling in the bridge (changes to `scripts/gate-bridge.ts`)

With cards in the panel, a valid tap produces RTLog event **type 0 "Normal
punch open"** — the panel has *already* opened the door. The bridge must
**not** call `openDoor` again (double pulse). Full table:

| RTLog event | Meaning | Bridge action |
|---|---|---|
| `0` Normal punch open | panel opened by itself | log `allowed=true`, `source=panel`; do **not** open |
| `27` Unregistered card | card not in panel | run `decideEntry` (today's path). If allowed: `openDoor` + log `source=bridge` + **mark member dirty** so the reconcile pushes the card. If refused: log with reason. |
| `29` Card expired | panel says validity over | re-check with `decideEntry` (a renewal may not be pushed yet). If DB says allowed: `openDoor`, log `source=bridge`, mark dirty. Else log refused `expired`. |
| `21` Door inactive time zone / `23` Access denied | authorization row missing/wrong | treat like 27 (decide + open if allowed + mark dirty); also log a warning — it means the mirror is inconsistent |
| `20` Too short punch interval | panel-side debounce | ignore (already) |
| `206` Device start | panel rebooted | force a full reconcile |
| anything else with `card=0` | door/aux/status | ignore |

Add `source` to `GateLog` (`"panel" | "bridge"`) and show it on `/gate`.

### 4.3 Sync strategy: reconcile, don't stream

Because only the bridge may talk to the panel, the web app cannot push
changes itself. And because the panel can lose its memory (reset, power) or
miss an update (bridge down while reception renews), a **reconciliation loop**
is more robust than an event queue:

1. **Desired state** = the set described in §4.1, computed from the DB with
   one query (`member.findMany({ where: { cardWiegand: { not: null }, subscriptions: { some: { status: "ACTIVE", endDate: { gte: startOfToday } } } }, include: { subscriptions: {...} } })`).
2. **Actual state** = `GETDATA user` (fields `CardNo, Pin, StartTime, EndTime`)
   and `GETDATA userauthorize` (`Pin, AuthorizeTimezoneId, AuthorizeDoorId`).
3. Diff by `CardNo`/`Pin`:
   - missing on panel → `SETDATA user` + `SETDATA userauthorize`
   - present with different `StartTime`/`EndTime`/doors → `SETDATA` again (upsert semantics: the panel replaces the row with the same Pin/CardNo — verify once; if it appends duplicates, `DELETEDATA` first)
   - present on panel but not desired → `DELETEDATA user` by CardNo (and `userauthorize` by Pin — check whether deleting the user cascades; if not, delete both)
   - rows on the panel whose CardNo matches **no** member at all (leftovers from the old ZKAccess install) → delete. **First run: log what would be deleted and require `GATE_PANEL_TAKEOVER=true` before wiping foreign rows.**
4. Run the reconcile: on connect, on `206 Device start`, every
   `GATE_SYNC_INTERVAL_MS` (default 60 000), and **immediately when the
   dirty flag is set** (below). Never run it concurrently with itself; the
   RTLog poll keeps running between reconcile steps (interleave — the panel
   answers one request at a time, so just await each command).

**Dirty flag (app → bridge):** a `Setting` row `gate.dirtyAt` (ISO timestamp).
The web app writes it (helper `markGateDirty()` in `lib/gate/dirty.ts`,
server-only is fine there) from every action that changes who may enter:

- `registerMember`, `updateMember` (card or phone changed), `deleteMember`, `deleteMembers`
- `renewSubscription`, `freezeSubscription`, `unfreezeSubscription`, `cancelSubscription`
- `restoreBackup`
- (not needed: payments, plans, courses)

The bridge reads `gate.dirtyAt` on every poll cycle (one tiny indexed query
every 300 ms is fine) and reconciles when it is newer than the last reconcile.
Alternative if that query is unwanted: a `GateSync` outbox table — but the
diff-based reconcile is still needed for self-healing, so keep the flag.

**Heartbeat (bridge → app):** the bridge writes `Setting gate.heartbeat`
(ISO) every ~10 s plus `gate.panelUsers` (count) after each reconcile, so
`/settings` can show "bridge online / last seen / N cards on panel".

### 4.4 Web app changes

- `lib/gate/dirty.ts` — `markGateDirty()`; call sites listed above.
- Schema: `GateLog.source String @default("bridge")`; optionally
  `Member.gateSyncedAt DateTime?` for display (set by the bridge after a
  successful upsert). Migration written by hand + `prisma migrate deploy`
  (see memory: `migrate dev` refuses because an old migration's checksum
  changed).
- `/settings` → new "البوابة / Gate" card: bridge status from heartbeat, panel
  user count, buttons **"إعادة مزامنة الآن"** (sets dirty) and, manager-only,
  **"تفريغ ذاكرة اللوحة"** (sets `Setting gate.wipeRequested`; bridge deletes
  all users then reconciles). Show a warning when the heartbeat is older than
  30 s ("the bridge is not running — the panel is working from its last sync").
- `/gate` page: add the `source` column (badge: "اللوحة" / "الجسر").
- Backup: nothing new unless a `GateSync` table is added (then add it to
  `TABLES` in `lib/backup.ts` and to `prisma/reset-data.ts`).
- Dictionaries: add keys to `lib/i18n/dictionaries/en.ts` first (it defines
  the `Dictionary` type), then `ar.ts`.

### 4.5 Bridge changes (`scripts/gate-bridge.ts`, `lib/gate/c3.ts`)

- `lib/gate/c3.ts`: add `getTableConfig()`, `getData(table, fields)`,
  `setData(table, record)`, `deleteData(table, keyField, keyValue)`,
  `setDateTime(date)` (§5).
- `lib/gate/sync.ts`: `desiredPanelState(prisma, now)`, `diff(desired, actual)`,
  `reconcile(panel, prisma)` returning counts `{ added, updated, removed, foreign }`.
- `scripts/gate-bridge.ts`: event table from §4.2, dirty-flag check, heartbeat,
  clock sync, `GATE_SYNC_INTERVAL_MS`, `GATE_PANEL_TAKEOVER`.
- Console output should stay one line per event (the operator reads it).

## 5. Protocol reference for the new commands

Framing, CRC and the session-less rule are already implemented in
`lib/gate/c3.ts` (`frame()`, `crc16()`, `request()`). Reply `0xC8` = OK,
`0xC9` = error with a signed error code in the last data byte.
Reference implementations: `github.com/vwout/zkaccess-c3-py` (reads) and the
fork `github.com/xub/zkaccess-c3-py` (**writes, validated on a live C3**).

### 5.1 `DATATABLE_CFG` = `0x06` — discover tables and field indexes

Request: no payload. Reply: text, one table per line (`\n`), each line
`key=value` pairs separated by `,`:

```
user=1,CardNo=i1,Pin=i2,Password=s3,Group=i4,StartTime=i5,EndTime=i6,SuperAuthorize=i7
userauthorize=2,Pin=i1,AuthorizeTimezoneId=i2,AuthorizeDoorId=i3
timezone=…
transaction=…
```

First pair = table name → table index; then `field=<type><index>` where type
`i` = integer, `s` = string. **Always read this once after connect and use
the returned indexes** instead of hard-coding `user=1` / fields 1..7 (that is
what the fork observed on its panel; ours is probably identical but verify).

### 5.2 `GETDATA` = `0x08` — read a table

Payload (bytes): `[tableIndex, fieldCount, ...fieldIndexes(sorted), 0, 0]`.

Reply (bytes): `[tableIndex, fieldCount, ...fieldIndexes, records…]` where each
record is the requested fields in order, each as `<size:1 byte><value>`;
integers little-endian of `size` bytes, strings ASCII of `size` bytes.
Records repeat until the data is exhausted. A large `user` table may exceed
one frame — the fork just parses what comes back in one reply; test with a
few hundred rows and, if truncated, look at how PullSDK pages (the trailing
`0, 0` bytes are suspected to be a page/offset).

### 5.3 `SETDATA` = `0x07` — add / update a `user` row (validated by the fork)

```
header  = [tableIndex, fieldCount, f1, f2, …]        e.g. [1, 7, 1,2,3,4,5,6,7]
record  = for each field in that order: <size:1><value little-endian, minimal bytes>
          0 is encoded as one 0x00 byte; empty string as size 0x00
payload = header + record
```

Example for our test card, valid 2026-09-21 → 2026-10-21, no password:

```
CardNo        16706331 → 03 1B EB FE
Pin           16706331 → 03 1B EB FE
Password      ""       → 00
Group         0        → 01 00
StartTime     20260921 → 04 39 28 35 01     (0x01352839 little-endian)
EndTime       20261021 → 04 9D 28 35 01     (0x0135289D little-endian)
SuperAuthorize 0       → 01 00
```

`StartTime`/`EndTime` are **`YYYYMMDD` integers** (pyzkaccess `date_to_zkdate`);
`0` = no limit. Only an empty `Password` was validated on the wire.

The same command with `userauthorize`'s table index and fields
`[Pin, AuthorizeTimezoneId, AuthorizeDoorId]` is expected to work (same
encoding) — **validate on the real panel first**: after writing, `GETDATA
userauthorize` must show the row, and a tap must produce event type `0`.

Whether `SETDATA` on an existing Pin updates in place or appends must also be
checked once (`GETDATA user` before/after). If it appends, `DELETEDATA` before
re-adding.

### 5.4 `DELETEDATA` = `0x09` — delete rows by key (validated by the fork)

```
header  = [tableIndex, 1, keyFieldIndex]              e.g. [1, 1, 1] = user by CardNo
key     = <size:1><value little-endian, minimal bytes>
payload = header + key
```

"The panel silently ignores malformed records" — a wrong size prefix deletes
nothing and returns OK, so always confirm with `GETDATA` in tests.

### 5.5 `DATETIME` = `0x03` — set the panel clock

Payload: ASCII `DateTime=<n>` where

```
n = ((year-2000)*12*31 + (month-1)*31 + (day-1)) * 86400 + hour*3600 + minute*60 + second
```

(the same packing `lib/gate/c3.ts` already decodes in `panelTime()` — write
the inverse). Call it after every connect and once a day; log the drift.

**⚠️ Tested live on the real panel (2026-09-28) and found broken as
specified:** sending this command makes the panel drop the TCP connection
outright — no `0xC9` error reply, just a close — taking down whatever else
was about to run on that connection with it. `lib/gate/c3.ts`'s
`setDateTime()` implements the formula above exactly (verified byte-for-byte
against §5.3-style worked examples in isolation) and the bug reproduces the
same way every time, so the encoding itself is not obviously wrong — more
likely this panel/firmware wants a different payload shape for `0x03`, or a
different command entirely, for a *set*. `scripts/gate-bridge.ts` now calls
it only behind `GATE_CLOCK_SYNC=true` (default off) precisely because of
this. **Still open:** find the right way to set this panel's clock, or
confirm it truly cannot be set over this protocol and drop §5.5 in favour of
reading the panel's drift and warning about it instead.

### 5.6 Useful `GETPARAM` keys

`~SerialNumber, ~DeviceName, FirmVer, LockCount, ReaderCount, ~MaxUserCount,
IPAddress, NetMask, GATEIPAddress, MAC, Door1VerifyType, Door2VerifyType,
Door1Drivertime, Door2Drivertime`. Verify types on this panel read `0`; taps
still work as card-only, so leave them unless a tap with a synced card is
refused with `23` — then look at `SETPARAM` (not implemented, PullSDK
`SetDeviceParam`).

## 6. Safety and failure modes

| Situation | Behaviour |
|---|---|
| PC off / bridge down | panel opens for synced cards until their `EndTime`; taps are not logged (optional later: backfill `GateLog` from `GETDATA transaction` on reconnect) |
| Panel wiped (reset / replaced) | next reconcile rebuilds it from the DB |
| DB unreachable while bridge runs | keep polling the panel; log; skip reconcile; the panel keeps deciding |
| Card assigned at the desk, member taps 2 s later | panel says `27` → bridge decides from DB → opens → marks dirty → card pushed |
| Renewal at the desk after panel `EndTime` passed | panel says `29` → bridge re-checks DB → opens → marks dirty |
| Freeze / cancel | dirty → reconcile deletes the row within seconds (while the bridge runs); if the bridge is down the panel keeps admitting until `EndTime` — acceptable, document it for the manager |
| Two members with the same low 24 bits | `Member.cardNumber` is unique but `cardWiegand` is not; reject at registration when another member already has the same `cardWiegand` (add the check to `cardTaken()` in `app/actions/members.ts`) |
| Foreign rows on the panel | never deleted unless `GATE_PANEL_TAKEOVER=true` |
| Relay double-fire | never `openDoor` on event type `0` |

## 7. Test plan (real panel, one card)

1. Connect, `DATATABLE_CFG` → print table/field indexes; compare with §5.1.
2. `GETDATA user` → expect empty (or leftovers → note them).
3. `SETDATA user` for the test card with `EndTime` = today; `GETDATA user` → row present.
4. `SETDATA userauthorize` (tz 1, doors bitmask 2); `GETDATA userauthorize` → row present.
5. Tap → RTLog type `0`, door opens by itself; bridge logs `source=panel` and does **not** open again.
6. Set `EndTime` = yesterday (via `SETDATA` again) → tap → type `29`; bridge re-checks DB.
7. `DELETEDATA` → `GETDATA user` empty → tap → type `27` → bridge path as today.
8. Stop the bridge, tap a synced card → door opens (offline proof). Start the bridge → heartbeat resumes.
9. Freeze the member in the UI → within `GATE_SYNC_INTERVAL_MS` the row is gone; unfreeze → back.
10. Reboot the panel (power) → `206` → reconcile runs, counts logged.
11. Restore a backup → dirty → reconcile.

Acceptance: all of the above pass, `npx tsc --noEmit` and `npx eslint` clean,
`/gate` shows `source`, `/settings` shows heartbeat and panel count.

## 8. Config additions (`.env.example`)

```
GATE_SYNC_INTERVAL_MS="60000"   # full reconcile cadence while the bridge runs
GATE_PANEL_TAKEOVER="false"     # true = delete panel users that FitFlow does not know
GATE_TIMEZONE_ID="1"            # panel time zone used for authorization (1 = 24h)
```

## 9. Open decisions for the gym

- Which doors to authorize once the door-1 reader is repaired (entry only vs.
  entry + exit; exit could be free — a push button — or card-controlled for
  anti-passback later).
- Whether reception may trigger "resync now" or manager only.
- Whether to backfill taps that happened while the PC was off (needs
  `GETDATA transaction` parsing; nice-to-have).
- Fix the panel's 12 V supply before relying on offline mode — the panel
  rebooting mid-tap is worse than any software issue.
