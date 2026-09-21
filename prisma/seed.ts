import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../lib/auth/password";

const prisma = new PrismaClient();

const DAY = 24 * 60 * 60 * 1000;

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * DAY);
}

async function upsertUser(opts: {
  username: string;
  password: string;
  displayName: string;
  role: "MANAGER" | "RECEPTION" | "CAPTAIN";
  canAddVideos?: boolean;
}) {
  const hashed = await hashPassword(opts.password);
  return prisma.user.upsert({
    where: { username: opts.username },
    update: {
      displayName: opts.displayName,
      role: opts.role,
      canAddVideos: opts.canAddVideos ?? false,
    },
    create: {
      username: opts.username,
      displayName: opts.displayName,
      role: opts.role,
      hashedPassword: hashed,
      canAddVideos: opts.canAddVideos ?? false,
    },
  });
}

async function main() {
  // ── Settings ──
  await prisma.setting.upsert({
    where: { key: "expiringSoonThresholdDays" },
    update: {},
    create: { key: "expiringSoonThresholdDays", value: "3" },
  });

  // ── Accounts ──
  const managerUsername = process.env.SEED_MANAGER_USERNAME || "manager";
  const managerPassword = process.env.SEED_MANAGER_PASSWORD || "ChangeMe123!";

  const manager = await upsertUser({
    username: managerUsername,
    password: managerPassword,
    displayName: "Gym Manager",
    role: "MANAGER",
    canAddVideos: true,
  });

  await upsertUser({
    username: "reception",
    password: "Reception123!",
    displayName: "Front Desk",
    role: "RECEPTION",
  });

  const captain = await upsertUser({
    username: "captain",
    password: "Captain123!",
    displayName: "Coach Ali",
    role: "CAPTAIN",
    canAddVideos: true,
  });

  console.log(`✔ Accounts ready (manager=${manager.username}, captain=${captain.username})`);

  // ── Subscription plans ──
  // Prices in Iraqi dinar (IQD).
  const plans: {
    id: string;
    name: string;
    durationDays: number;
    price: number;
  }[] = [
    { id: "plan_1m", name: "شهر واحد", durationDays: 30, price: 25_000 },
    { id: "plan_2m", name: "شهران", durationDays: 60, price: 45_000 },
    { id: "plan_3m", name: "3 أشهر", durationDays: 90, price: 65_000 },
    { id: "plan_6m", name: "6 أشهر", durationDays: 180, price: 120_000 },
    { id: "plan_12m", name: "سنة كاملة", durationDays: 365, price: 220_000 },
  ];
  for (const p of plans) {
    await prisma.subscriptionPlan.upsert({
      where: { id: p.id },
      update: { name: p.name, durationDays: p.durationDays, price: p.price },
      create: p,
    });
  }
  console.log(`✔ ${plans.length} subscription plans ready`);

  // ── Demo members (one per subscription state) ──
  type Demo = {
    name: string;
    phone: string;
    gender: "MALE" | "FEMALE";
    age: number;
    height: number;
    weight: number;
    /** chest / waist / hips / glutes / arm — female members only. */
    m?: [number, number, number, number, number];
    plan: (typeof plans)[number];
    endInDays: number;
    status: "ACTIVE" | "EXPIRED" | "FROZEN";
    method: "CASH" | "DEFERRED";
    received?: number; // for deferred
    freezeDays?: number; // for frozen
  };

  const demos: Demo[] = [
    { name: "أحمد حسن", phone: "07700000001", gender: "MALE", age: 26, height: 178, weight: 80, plan: plans[0], endInDays: 22, status: "ACTIVE", method: "CASH" },
    { name: "منى عادل", phone: "07700000002", gender: "FEMALE", age: 31, height: 165, weight: 62, m: [90, 70, 96, 100, 27], plan: plans[2], endInDays: 2, status: "ACTIVE", method: "CASH" },
    { name: "يوسف سمير", phone: "07700000003", gender: "MALE", age: 24, height: 182, weight: 88, plan: plans[0], endInDays: 0, status: "ACTIVE", method: "CASH" },
    { name: "سارة كمال", phone: "07700000004", gender: "FEMALE", age: 29, height: 170, weight: 66, m: [92, 72, 98, 102, 28], plan: plans[1], endInDays: -6, status: "EXPIRED", method: "CASH" },
    { name: "عمر طارق", phone: "07700000005", gender: "MALE", age: 35, height: 175, weight: 90, plan: plans[3], endInDays: 150, status: "ACTIVE", method: "DEFERRED", received: 50_000 },
    { name: "ليلى نبيل", phone: "07700000006", gender: "FEMALE", age: 27, height: 168, weight: 58, m: [86, 66, 93, 96, 26], plan: plans[2], endInDays: 40, status: "FROZEN", method: "CASH", freezeDays: 12 },
  ];

  for (const d of demos) {
    const [chest, waist, hips, glutes, arm] = d.m ?? [null, null, null, null, null];
    const profile = {
      name: d.name,
      gender: d.gender,
      age: d.age,
      height: d.height,
      weight: d.weight,
      chest,
      waist,
      hips,
      glutes,
      arm,
    };
    const member = await prisma.member.upsert({
      where: { phone: d.phone },
      update: profile,
      create: { ...profile, phone: d.phone },
    });

    const existing = await prisma.subscription.count({
      where: { memberId: member.id },
    });
    if (existing > 0) continue;

    const endDate = daysFromNow(d.endInDays);
    const startDate = new Date(endDate.getTime() - d.plan.durationDays * DAY);

    const sub = await prisma.subscription.create({
      data: {
        memberId: member.id,
        planId: d.plan.id,
        planName: d.plan.name,
        durationDays: d.plan.durationDays,
        price: d.plan.price,
        method: d.method,
        status: d.status,
        startDate,
        endDate,
        freezeUntil: d.status === "FROZEN" ? daysFromNow(d.freezeDays ?? 7) : null,
        frozenDaysTotal: d.status === "FROZEN" ? d.freezeDays ?? 0 : 0,
        createdById: manager.id,
      },
    });

    // Payment(s)
    const paid = d.method === "DEFERRED" ? d.received ?? 0 : d.plan.price;
    if (paid > 0) {
      await prisma.payment.create({
        data: {
          subscriptionId: sub.id,
          amount: paid,
          createdById: manager.id,
          note: "Seed payment",
        },
      });
    }

    if (d.method === "DEFERRED") {
      const remaining = Number(d.plan.price) - paid;
      await prisma.notification.upsert({
        where: { dedupeKey: `registered_deferred_${sub.id}` },
        update: {},
        create: {
          type: "MEMBER_REGISTERED_DEFERRED",
          title: `${d.name} registered with a deferred balance`,
          body: `Remaining balance: ${remaining} IQD`,
          memberId: member.id,
          subscriptionId: sub.id,
          dedupeKey: `registered_deferred_${sub.id}`,
        },
      });
    }

    if (d.status === "FROZEN") {
      await prisma.freezeRecord.create({
        data: {
          subscriptionId: sub.id,
          days: d.freezeDays ?? 7,
          reason: "Travel (seed data)",
          endsAt: daysFromNow(d.freezeDays ?? 7),
          createdById: manager.id,
        },
      });
    }
  }
  console.log(`✔ ${demos.length} demo members ready`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
