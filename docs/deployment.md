# Deploying FitFlow

> **بالعربي باختصار:** الموقع يعمل على Vercel وقاعدة البيانات على Supabase. لكن
> **برنامجان يبقيان على كمبيوتر الصالة**: جسر البوابة (`npm run gate`) وعامل
> واتساب (`npm run whatsapp`) — لأن الأول يحتاج شبكة الصالة المحلية والثاني يحتاج
> اتصالاً دائماً بواتساب، وكلاهما مستحيل على Vercel. الاثنان يتصلان **خارجاً** إلى
> Supabase، فلا حاجة لعنوان IP عام ولا فتح بورتات في الراوتر.

## Where each piece runs

```
            ┌──────────────── Vercel (serverless) ────────────────┐
 Browser ──►│  Next.js app: reception, finance, courses, reports  │
            └────────────────────────┬───────────────────────────┘
                                     │
                          ┌──────────▼───────────┐
                          │ Supabase (Frankfurt) │
                          │  Postgres + Storage  │
                          └──────────▲───────────┘
                                     │  outbound only
            ┌────────────────────────┴───────────────────────────┐
            │            Gym computer (must be on)               │
            │  npm run gate      → ZKTeco C3 panel on the LAN    │
            │  npm run whatsapp  → sends course PDFs             │
            └────────────────────────────────────────────────────┘
```

**Why the two workers cannot move to Vercel.** A hosted function is created
per request, has a read-only disk and is torn down straight after. The gate
bridge needs a socket held open to a device on the gym's private network;
WhatsApp needs a socket held open to WhatsApp and a writable folder for its
pairing credentials. Neither survives that model.

## What changed when moving off the local MySQL setup

| Before (local) | Now (hosted) |
|---|---|
| MySQL via XAMPP | Supabase Postgres, through the pgbouncer pooler |
| Videos written to `storage/videos` | Private Supabase bucket `videos`; the browser uploads straight to it with a signed URL |
| Course PDFs written to `storage/courses` | Rendered per request — nothing stored |
| Backups written to `storage/backups` | Private Supabase bucket `backups` |
| WhatsApp socket inside the web app | Outbox table + worker on the gym computer |
| Login throttle in process memory | `RateLimit` table (serverless has no shared memory) |
| Search case-insensitive by MySQL collation | Explicit `mode: "insensitive"` — Postgres is case-sensitive by default |

## First-time setup

### 1. Supabase

1. Create the project **in a region near the gym**. Latency is paid on every
   page load and every card tap: measured from Iraq, Frankfurt answers in
   ~90 ms and Tokyo in ~400 ms.
2. Project settings → Database → copy the **transaction pooler** URI (port
   6543) into `DATABASE_URL`, and the **session pooler** URI (port 5432) into
   `DIRECT_URL`. Append `?pgbouncer=true&connection_limit=1` to the first.
3. Create two **private** buckets: `videos` (50 MB per-object limit on the free
   plan) and `backups`.
4. Apply the schema from a machine that has the repo:
   ```bash
   npx prisma migrate deploy
   ```

### 2. Move the existing data (once)

With XAMPP MySQL running and `.env` pointing at Supabase:

```bash
npm run migrate-mysql
```

Ids are preserved, so course share links, video tokens and logins keep
working. The script refuses to run against a non-empty target unless given
`--force`. Videos themselves are not copied — re-upload them from `/videos`,
or move the files into the `videos` bucket under the same names.

### 3. Vercel

1. Import the GitHub repository.
2. Add the environment variables from the **"Hosted app"** section of
   `.env.example`. Use a **new** `SESSION_SECRET`, not the development one.
3. Set `NEXT_PUBLIC_APP_URL` to the real domain — the WhatsApp worker fetches
   course PDFs from it and the links inside PDFs point at it.
4. Deploy. `postinstall` runs `prisma generate`; migrations are not run
   automatically, on purpose — a deploy should never alter the database on its
   own. Run `npx prisma migrate deploy` yourself when the schema changes.

### 4. The gym computer

Copy the repo there, `npm install`, and create a `.env` with `DATABASE_URL`,
`DIRECT_URL`, `SESSION_SECRET`, `NEXT_PUBLIC_APP_URL` plus the worker sections.
Then:

```bash
npm run whatsapp   # scan the QR code once with the gym phone
npm run gate       # needs the C3 panel reachable on the LAN
```

Both reconnect on their own and are safe to restart. For unattended running,
start them at login (Task Scheduler) so a power cut does not leave the gate
dead — see the offline note below.

## Two connection strings, on purpose

`DATABASE_URL` (transaction pooler, 6543) and `DIRECT_URL` (session mode,
5432) are not interchangeable, and the split is not only about migrations.

Measured against a Supabase project one continent away, the same `SELECT 1`
cost **~1.5 s through the pooler** and **~0.45 s direct** — transaction mode
adds round trips, and distance multiplies each one.

- The **hosted app** must use the pooler. Many short-lived serverless
  instances would otherwise exhaust Postgres' direct connection slots.
- The **gym workers** use `DIRECT_URL` (`lib/worker-db.ts`). They are two
  long-lived processes, so they cannot exhaust anything, and the gate spends
  one query per card tap where the saving is felt.

`connection_limit` also matters: at 1, the parallel queries a single page
makes queue behind each other and time out. 5 is a sane default for both.

## Operational notes

- **Gate latency.** Each tap now costs one round trip to Supabase instead of a
  local query. Measured end to end: ~310 ms to Tokyo over the direct
  connection, and proportionally less from a nearer region.
- **Gate offline behaviour.** Today the panel holds no cards, so if the gym
  computer or the internet is down, nobody gets in. `docs/gate-hybrid-mode.md`
  specifies pushing active cards into the panel's own memory so it keeps
  working offline; that is the next step after this deployment.
- **WhatsApp.** Queued courses wait in `WhatsAppOutbox` until the worker runs;
  nothing is lost while the computer is off. Failures are visible on
  `/settings` with retry and clear buttons.
- **Video playback** redirects to a signed URL valid for two minutes. Unlike
  the old local-disk route this cannot also block a deliberate download — the
  expiry is what limits a copied link.
- **Backups** still run once a day on the first manager page load, now into the
  `backups` bucket. A restore rewrites every table in one transaction and
  demands the manager's password again.
- **Free-plan pausing.** Supabase pauses a free project after a week with no
  activity; the gym computer's workers poll constantly, so this will not
  trigger while they run.

## Rolling back to local MySQL

`prisma/migrations-mysql-archive/` keeps the original MySQL migration history,
and `.env.mysql-backup` (if still present on the old machine) holds the old
connection string. The application code, however, now assumes Postgres,
Supabase Storage and the worker split — a rollback means reverting the commit,
not just swapping the URL.
