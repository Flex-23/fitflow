/**
 * Extra realistic demo data on top of `prisma/seed.ts`.
 * Run with: npm run db:seed:demo
 *
 * Idempotent: members are keyed by phone, users by username, videos by
 * hiddenToken, meal suggestions by text. Re-running does not duplicate rows.
 */
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../lib/auth/password";

const prisma = new PrismaClient();
const DAY = 24 * 60 * 60 * 1000;
const daysFromNow = (d: number) => new Date(Date.now() + d * DAY);

type PlanKey = "plan_1m" | "plan_2m" | "plan_3m" | "plan_6m" | "plan_12m";

type DemoMember = {
  name: string;
  phone: string;
  gender: "MALE" | "FEMALE";
  age: number;
  height: number;
  weight: number;
  /** chest / waist / hips / glutes / arm — female members only. */
  m?: [number, number, number, number, number];
  plan: PlanKey;
  endInDays: number;
  status: "ACTIVE" | "EXPIRED" | "FROZEN" | "CANCELLED";
  method: "CASH" | "DEFERRED";
  received?: number;
  freezeDays?: number;
  /** Add an older, already-expired subscription before the current one. */
  history?: boolean;
};

const members: DemoMember[] = [
  // ── Active, cash ──
  { name: "محمد عبدالله", phone: "07811111001", gender: "MALE", age: 23, height: 176, weight: 74, plan: "plan_3m", endInDays: 61, status: "ACTIVE", method: "CASH", history: true },
  { name: "فاطمة حسن", phone: "07811111002", gender: "FEMALE", age: 28, height: 162, weight: 58, m: [88, 68, 94, 98, 26], plan: "plan_1m", endInDays: 18, status: "ACTIVE", method: "CASH" },
  { name: "كريم مصطفى", phone: "07811111003", gender: "MALE", age: 34, height: 181, weight: 92, plan: "plan_6m", endInDays: 120, status: "ACTIVE", method: "CASH", history: true },
  { name: "نور الهدى", phone: "07811111004", gender: "FEMALE", age: 25, height: 167, weight: 63, m: [90, 70, 96, 100, 27], plan: "plan_12m", endInDays: 300, status: "ACTIVE", method: "CASH" },
  { name: "Khaled Nasser", phone: "07811111005", gender: "MALE", age: 41, height: 174, weight: 85, plan: "plan_2m", endInDays: 33, status: "ACTIVE", method: "CASH" },
  { name: "Dina Farouk", phone: "07811111006", gender: "FEMALE", age: 30, height: 165, weight: 60, m: [87, 67, 93, 97, 26], plan: "plan_1m", endInDays: 9, status: "ACTIVE", method: "CASH" },

  // ── Expiring today / very soon ──
  { name: "أحمد سامي", phone: "07811111007", gender: "MALE", age: 27, height: 179, weight: 78, plan: "plan_1m", endInDays: 0, status: "ACTIVE", method: "CASH" },
  { name: "ريم عادل", phone: "07811111008", gender: "FEMALE", age: 22, height: 160, weight: 55, m: [84, 64, 90, 94, 25], plan: "plan_2m", endInDays: 1, status: "ACTIVE", method: "CASH" },
  { name: "Hassan Ali", phone: "07811111009", gender: "MALE", age: 36, height: 183, weight: 95, plan: "plan_3m", endInDays: 3, status: "ACTIVE", method: "CASH" },

  // ── Deferred with balance ──
  { name: "ياسمين محمود", phone: "07811111010", gender: "FEMALE", age: 29, height: 168, weight: 64, m: [91, 71, 97, 101, 27.5], plan: "plan_3m", endInDays: 70, status: "ACTIVE", method: "DEFERRED", received: 25_000 },
  { name: "عمر خالد", phone: "07811111011", gender: "MALE", age: 31, height: 177, weight: 82, plan: "plan_6m", endInDays: 140, status: "ACTIVE", method: "DEFERRED", received: 0 },
  { name: "Mariam Said", phone: "07811111012", gender: "FEMALE", age: 26, height: 163, weight: 57, m: [86, 66, 92, 96, 25.5], plan: "plan_12m", endInDays: 250, status: "ACTIVE", method: "DEFERRED", received: 100_000 },
  { name: "طارق فؤاد", phone: "07811111013", gender: "MALE", age: 38, height: 180, weight: 88, plan: "plan_1m", endInDays: -4, status: "EXPIRED", method: "DEFERRED", received: 10_000 },

  // ── Deferred fully paid (should NOT show as outstanding) ──
  { name: "Salma Ibrahim", phone: "07811111014", gender: "FEMALE", age: 24, height: 166, weight: 61, m: [89, 69, 95, 99, 26.5], plan: "plan_2m", endInDays: 45, status: "ACTIVE", method: "DEFERRED", received: 45_000 },

  // ── Frozen ──
  { name: "مصطفى رضا", phone: "07811111015", gender: "MALE", age: 33, height: 175, weight: 80, plan: "plan_6m", endInDays: 100, status: "FROZEN", method: "CASH", freezeDays: 10 },
  { name: "Heba Tamer", phone: "07811111016", gender: "FEMALE", age: 27, height: 164, weight: 59, m: [87, 67, 93, 97, 26], plan: "plan_3m", endInDays: 50, status: "FROZEN", method: "CASH", freezeDays: 5 },

  // ── Expired ──
  { name: "علي حسين", phone: "07811111017", gender: "MALE", age: 40, height: 172, weight: 90, plan: "plan_1m", endInDays: -12, status: "EXPIRED", method: "CASH", history: true },
  { name: "منى إبراهيم", phone: "07811111018", gender: "FEMALE", age: 35, height: 161, weight: 66, m: [93, 74, 99, 103, 28.5], plan: "plan_3m", endInDays: -30, status: "EXPIRED", method: "CASH" },
  { name: "Adam Youssef", phone: "07811111019", gender: "MALE", age: 21, height: 185, weight: 76, plan: "plan_2m", endInDays: -2, status: "EXPIRED", method: "CASH" },
  { name: "Rana Sherif", phone: "07811111020", gender: "FEMALE", age: 32, height: 169, weight: 62, m: [90, 70, 96, 100, 27], plan: "plan_1m", endInDays: -45, status: "EXPIRED", method: "CASH" },

  // ── Cancelled ──
  { name: "سيف الدين", phone: "07811111021", gender: "MALE", age: 29, height: 178, weight: 84, plan: "plan_6m", endInDays: 90, status: "CANCELLED", method: "CASH" },

  // ── Recently joined ──
  { name: "Nada Hany", phone: "07811111022", gender: "FEMALE", age: 24, height: 165, weight: 58, m: [86, 66, 92, 96, 26], plan: "plan_1m", endInDays: 25, status: "ACTIVE", method: "CASH" },
];

const videos = [
  { token: "demo_bench_press_0001xxxx", name: "Bench Press — بنش برس" },
  { token: "demo_squat_00000002xxxx", name: "Barbell Squat — سكوات" },
  { token: "demo_deadlift_0000003xxx", name: "Deadlift — ديدلفت" },
  { token: "demo_lat_pulldown_004xxx", name: "Lat Pulldown — سحب أمامي" },
  { token: "demo_shoulder_press005xx", name: "Shoulder Press — كتف أمامي" },
  { token: "demo_bicep_curl_00006xxx", name: "Bicep Curl — باي" },
  { token: "demo_tricep_pushdn007xxx", name: "Tricep Pushdown — تراي" },
  { token: "demo_leg_press_00008xxxx", name: "Leg Press — ضغط رجل" },
  { token: "demo_plank_000000009xxxx", name: "Plank — بلانك" },
  { token: "demo_cable_row_00010xxxx", name: "Seated Cable Row — سحب كابل" },
];

const meals = [
  "3 بيض مسلوق + شريحة توست أسمر",
  "شوفان بالحليب + موز",
  "صدر دجاج مشوي 150 جم + أرز بني",
  "سمك مشوي + سلطة خضراء",
  "زبادي يوناني + حفنة مكسرات",
  "تونة + خبز بلدي",
  "لحم بقري مشوي 120 جم + بطاطا مسلوقة",
  "عصير بروتين (Whey) بعد التمرين",
  "تفاحة + ملعقة زبدة فول سوداني",
  "جبنة قريش + خيار وطماطم",
  "Grilled chicken salad",
  "Oatmeal with berries",
];

async function seedStaff(managerId: string) {
  const extra = [
    { username: "reception2", password: "Reception123!", displayName: "سارة — استقبال مسائي", role: "RECEPTION" as const, canAddVideos: false },
    { username: "captain2", password: "Captain123!", displayName: "Coach Mahmoud", role: "CAPTAIN" as const, canAddVideos: false },
    { username: "captain3", password: "Captain123!", displayName: "كابتن هدى", role: "CAPTAIN" as const, canAddVideos: true },
  ];
  const ids: Record<string, string> = {};
  for (const u of extra) {
    const row = await prisma.user.upsert({
      where: { username: u.username },
      update: { displayName: u.displayName, role: u.role, canAddVideos: u.canAddVideos },
      create: {
        username: u.username,
        displayName: u.displayName,
        role: u.role,
        canAddVideos: u.canAddVideos,
        hashedPassword: await hashPassword(u.password),
        createdById: managerId,
      },
    });
    ids[u.username] = row.id;
  }
  // One disabled account for the accounts page.
  const disabled = await prisma.user.upsert({
    where: { username: "old_reception" },
    update: { isActive: false },
    create: {
      username: "old_reception",
      displayName: "موظف سابق",
      role: "RECEPTION",
      isActive: false,
      hashedPassword: await hashPassword("Disabled123!"),
      createdById: managerId,
    },
  });
  ids[disabled.username] = disabled.id;
  console.log(`✔ ${extra.length + 1} extra staff accounts ready`);
  return ids;
}

async function seedMembers(receptionId: string) {
  const plans = await prisma.subscriptionPlan.findMany();
  const byId = Object.fromEntries(plans.map((p) => [p.id, p]));
  const memberIds: Record<string, string> = {};

  for (const d of members) {
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
    memberIds[d.phone] = member.id;

    const existing = await prisma.subscription.count({ where: { memberId: member.id } });
    if (existing > 0) continue;

    const plan = byId[d.plan];
    if (!plan) throw new Error(`Plan ${d.plan} missing — run npm run db:seed first`);

    // Optional older subscription (already expired) for renewal history.
    if (d.history) {
      const oldPlan = byId["plan_1m"];
      const oldEnd = daysFromNow(d.endInDays - plan.durationDays - 3);
      const old = await prisma.subscription.create({
        data: {
          memberId: member.id,
          planId: oldPlan.id,
          planName: oldPlan.name,
          durationDays: oldPlan.durationDays,
          price: oldPlan.price,
          method: "CASH",
          status: "EXPIRED",
          startDate: new Date(oldEnd.getTime() - oldPlan.durationDays * DAY),
          endDate: oldEnd,
          createdById: receptionId,
        },
      });
      await prisma.payment.create({
        data: {
          subscriptionId: old.id,
          amount: oldPlan.price,
          createdById: receptionId,
          note: "دورة سابقة",
          createdAt: new Date(oldEnd.getTime() - oldPlan.durationDays * DAY),
        },
      });
    }

    const endDate = daysFromNow(d.endInDays);
    const startDate = new Date(endDate.getTime() - plan.durationDays * DAY);
    const frozen = d.status === "FROZEN";

    const sub = await prisma.subscription.create({
      data: {
        memberId: member.id,
        planId: plan.id,
        planName: plan.name,
        durationDays: plan.durationDays,
        price: plan.price,
        method: d.method,
        status: d.status,
        startDate,
        endDate,
        freezeUntil: frozen ? daysFromNow(d.freezeDays ?? 7) : null,
        frozenDaysTotal: frozen ? d.freezeDays ?? 0 : 0,
        createdById: receptionId,
      },
    });

    const price = Number(plan.price);
    // Money is dated when it was actually taken — at the start of the
    // subscription — so daily and monthly reports reflect real history
    // instead of piling every payment onto the day the seed ran.
    if (d.method === "CASH") {
      await prisma.payment.create({
        data: {
          subscriptionId: sub.id,
          amount: price,
          createdById: receptionId,
          createdAt: startDate,
        },
      });
    } else {
      const received = d.received ?? 0;
      if (received > 0) {
        // Split into two installments when large enough to make history realistic.
        const first = received >= 20_000 ? Math.round(received / 2) : received;
        await prisma.payment.create({
          data: {
            subscriptionId: sub.id,
            amount: first,
            createdById: receptionId,
            note: "دفعة أولى",
            createdAt: startDate,
          },
        });
        if (received - first > 0) {
          await prisma.payment.create({
            data: {
              subscriptionId: sub.id,
              amount: received - first,
              createdById: receptionId,
              note: "دفعة ثانية",
              // Second installment lands a couple of weeks later.
              createdAt: new Date(Math.min(Date.now(), startDate.getTime() + 14 * DAY)),
            },
          });
        }
      }
    }

    if (frozen) {
      await prisma.freezeRecord.create({
        data: {
          subscriptionId: sub.id,
          days: d.freezeDays ?? 7,
          reason: "سفر / ظرف صحي (بيانات تجريبية)",
          endsAt: daysFromNow(d.freezeDays ?? 7),
          createdById: receptionId,
        },
      });
    }
  }
  console.log(`✔ ${members.length} extra demo members ready`);
  return memberIds;
}

async function seedVideos(managerId: string, captainId: string) {
  const ids: string[] = [];
  for (const [i, v] of videos.entries()) {
    const row = await prisma.video.upsert({
      where: { hiddenToken: v.token },
      update: { exerciseName: v.name },
      create: {
        exerciseName: v.name,
        // Placeholder file — no real file on disk, so preview/stream returns 404
        // until you upload a real video from the Videos page.
        storedFilename: `${v.token}.mp4`,
        originalName: `${v.name.split(" — ")[0].toLowerCase().replace(/\s+/g, "-")}.mp4`,
        mimeType: "video/mp4",
        sizeBytes: 5_000_000 + i * 750_000,
        hiddenToken: v.token,
        addedById: i % 3 === 0 ? captainId : managerId,
      },
    });
    ids.push(row.id);
  }
  console.log(`✔ ${videos.length} demo videos ready (metadata only)`);
  return ids;
}

async function seedMeals() {
  for (const [i, text] of meals.entries()) {
    await prisma.mealSuggestion.upsert({
      where: { text },
      update: {},
      create: { text, usageCount: meals.length - i },
    });
  }
  console.log(`✔ ${meals.length} meal suggestions ready`);
}

async function seedCourses(captainId: string, memberIds: Record<string, string>) {
  const vids = await prisma.video.findMany({
    where: { hiddenToken: { startsWith: "demo_" } },
    orderBy: { exerciseName: "asc" },
  });
  const v = (idx: number) => vids[idx % vids.length];

  // ── Training templates ──
  const templates = [
    {
      title: "Push / Pull / Legs — مبتدئ",
      days: [
        { label: "Push — صدر وكتف وتراي", ex: [[v(0), "4×10"], [v(4), "3×12"], [v(6), "3×15"]] },
        { label: "Pull — ظهر وباي", ex: [[v(3), "4×10"], [v(9), "3×12"], [v(5), "3×15"]] },
        { label: "Legs — رجل", ex: [[v(1), "4×8"], [v(7), "3×12"], [v(8), "3×60s"]] },
      ],
    },
    {
      title: "Full Body 4 Days",
      days: [
        { label: "Day A", ex: [[v(1), "5×5"], [v(0), "5×5"], [v(9), "3×10"]] },
        { label: "Day B", ex: [[v(2), "5×5"], [v(4), "4×8"], [v(3), "3×10"]] },
        { label: "Day C", ex: [[v(7), "4×12"], [v(5), "3×12"], [v(6), "3×12"]] },
        { label: "Day D", ex: [[v(8), "4×45s"], [v(9), "3×15"], [v(1), "3×10"]] },
      ],
    },
  ];

  const existingTemplates = await prisma.trainingCourse.count({ where: { isTemplate: true } });
  if (existingTemplates === 0) {
    for (const t of templates) {
      await prisma.trainingCourse.create({
        data: {
          title: t.title,
          isTemplate: true,
          createdById: captainId,
          days: {
            create: t.days.map((d, i) => ({
              label: d.label,
              order: i,
              exercises: {
                create: d.ex.map(([video, reps], j) => ({
                  name: (video as (typeof vids)[number]).exerciseName,
                  reps: reps as string,
                  order: j,
                  videoId: (video as (typeof vids)[number]).id,
                  videoToken: (video as (typeof vids)[number]).hiddenToken,
                  // Make the 2nd and 3rd exercise a superset on the first day.
                  supersetGroup: i === 0 && j >= 1 ? 1 : null,
                })),
              },
            })),
          },
        },
      });
    }
    console.log(`✔ ${templates.length} training templates ready`);
  }

  // ── Member training + nutrition courses ──
  const targets = ["01011111001", "01011111003", "01011111010"];
  for (const phone of targets) {
    const memberId = memberIds[phone];
    if (!memberId) continue;

    const hasTraining = await prisma.trainingCourse.count({ where: { memberId } });
    if (hasTraining === 0) {
      await prisma.trainingCourse.create({
        data: {
          memberId,
          isTemplate: false,
          createdById: captainId,
          expiresAt: daysFromNow(60),
          days: {
            create: [
              {
                label: "صدر + تراي",
                order: 0,
                exercises: {
                  create: [
                    { name: v(0).exerciseName, reps: "4×10", order: 0, videoId: v(0).id, videoToken: v(0).hiddenToken },
                    { name: v(6).exerciseName, reps: "3×12", order: 1, videoId: v(6).id, videoToken: v(6).hiddenToken, supersetGroup: 1 },
                    { name: v(8).exerciseName, reps: "3×45s", order: 2, videoId: v(8).id, videoToken: v(8).hiddenToken, supersetGroup: 1 },
                  ],
                },
              },
              {
                label: "ظهر + باي",
                order: 1,
                exercises: {
                  create: [
                    { name: v(3).exerciseName, reps: "4×10", order: 0, videoId: v(3).id, videoToken: v(3).hiddenToken },
                    { name: v(9).exerciseName, reps: "3×12", order: 1, videoId: v(9).id, videoToken: v(9).hiddenToken },
                    { name: v(5).exerciseName, reps: "3×15", order: 2, videoId: v(5).id, videoToken: v(5).hiddenToken },
                  ],
                },
              },
              {
                label: "رجل",
                order: 2,
                exercises: {
                  create: [
                    { name: v(1).exerciseName, reps: "4×8", order: 0, videoId: v(1).id, videoToken: v(1).hiddenToken },
                    { name: v(7).exerciseName, reps: "3×12", order: 1, videoId: v(7).id, videoToken: v(7).hiddenToken },
                    { name: "Walking Lunges", reps: "3×20", order: 2 },
                  ],
                },
              },
            ],
          },
        },
      });
    }

    const hasNutrition = await prisma.nutritionCourse.count({ where: { memberId } });
    if (hasNutrition === 0) {
      await prisma.nutritionCourse.create({
        data: {
          memberId,
          createdById: captainId,
          expiresAt: daysFromNow(60),
          days: {
            create: Array.from({ length: 5 }, (_, i) => ({
              label: `يوم ${i + 1}`,
              order: i,
              meals: {
                create: [
                  meals[(i + 0) % meals.length],
                  meals[(i + 1) % meals.length],
                  meals[(i + 2) % meals.length],
                  meals[(i + 3) % meals.length],
                  meals[(i + 4) % meals.length],
                ].map((text, j) => ({ order: j, text })),
              },
            })),
          },
        },
      });
    }
  }
  console.log(`✔ Training + nutrition courses ready for ${targets.length} members`);
}

async function seedActivity(userIds: Record<string, string>, memberIds: Record<string, string>) {
  const existing = await prisma.activityLog.count();
  if (existing > 0) return;

  const reception = userIds.reception;
  const captain = userIds.captain;
  const manager = userIds.manager;

  const rows = [
    { userId: reception, action: "REGISTER_MEMBER", details: "محمد عبدالله • 3 أشهر • CASH", targetType: "Member", targetId: memberIds["01011111001"], ago: 20 },
    { userId: reception, action: "REGISTER_MEMBER", details: "ياسمين محمود • 3 أشهر • DEFERRED", targetType: "Member", targetId: memberIds["01011111010"], ago: 18 },
    { userId: reception, action: "RECEIVE_PAYMENT", details: "ياسمين محمود • +10000 • remaining 30000", targetType: "Subscription", ago: 15 },
    { userId: reception, action: "FREEZE_SUBSCRIPTION", details: "10 days • سفر", targetType: "Subscription", ago: 12 },
    { userId: reception, action: "RENEW_SUBSCRIPTION", details: "كريم مصطفى • 6 أشهر • CASH", targetType: "Subscription", ago: 10 },
    { userId: reception, action: "CANCEL_SUBSCRIPTION", details: "طلب العضو", targetType: "Subscription", ago: 9 },
    { userId: reception, action: "CREATE_PLAN", details: "شهر واحد • 25000", targetType: "SubscriptionPlan", ago: 30 },
    { userId: reception, action: "UPDATE_PLAN", details: "3 أشهر • 65000", targetType: "SubscriptionPlan", ago: 8 },
    { userId: captain, action: "ADD_VIDEO", details: "Bench Press — بنش برس", targetType: "Video", ago: 25 },
    { userId: captain, action: "ADD_VIDEO", details: "Barbell Squat — سكوات", targetType: "Video", ago: 24 },
    { userId: captain, action: "SAVE_TEMPLATE", details: "Push / Pull / Legs — مبتدئ", targetType: "TrainingCourse", ago: 14 },
    { userId: captain, action: "CREATE_TRAINING_COURSE", details: undefined, targetType: "TrainingCourse", ago: 6 },
    { userId: captain, action: "CREATE_NUTRITION_COURSE", details: undefined, targetType: "NutritionCourse", ago: 5 },
    { userId: manager, action: "CREATE_USER", details: "Coach Mahmoud (CAPTAIN)", targetType: "User", targetId: userIds.captain2, ago: 28 },
    { userId: manager, action: "TOGGLE_VIDEO_PERMISSION", details: "كابتن هدى: on", targetType: "User", targetId: userIds.captain3, ago: 7 },
    { userId: manager, action: "UPDATE_USER", details: "موظف سابق", targetType: "User", targetId: userIds.old_reception, ago: 3 },
    { userId: reception, action: "UPDATE_MEMBER", details: "Dina Farouk", targetType: "Member", targetId: memberIds["01011111006"], ago: 1 },
    { userId: reception, action: "RECEIVE_PAYMENT", details: "Mariam Said • +50000 • remaining 120000", targetType: "Subscription", ago: 0.2 },
  ] as const;

  for (const r of rows) {
    await prisma.activityLog.create({
      data: {
        userId: r.userId,
        action: r.action,
        details: r.details ?? null,
        targetType: r.targetType,
        targetId: "targetId" in r ? r.targetId ?? null : null,
        createdAt: daysFromNow(-r.ago),
      },
    });
  }
  console.log(`✔ ${rows.length} activity log entries ready`);
}

async function seedFinance(managerId: string) {
  if ((await prisma.expense.count()) === 0) {
    type Cat = "RENT" | "SALARY" | "EQUIPMENT" | "MAINTENANCE" | "UTILITIES" | "SUPPLIES" | "OTHER";
    // Running costs of a small gym, repeated for the last few months so the
    // monthly report has something to compare against.
    // Sized against what ~28 members actually bring in, so a normal month
    // shows a profit and a slow month shows a loss.
    const monthly: { title: string; amount: number; category: Cat; dayOfMonth: number }[] = [
      { title: "إيجار الصالة", amount: 150_000, category: "RENT", dayOfMonth: 1 },
      { title: "رواتب المدربين", amount: 200_000, category: "SALARY", dayOfMonth: 1 },
      { title: "فاتورة الكهرباء", amount: 45_000, category: "UTILITIES", dayOfMonth: 5 },
      { title: "فاتورة الإنترنت", amount: 20_000, category: "UTILITIES", dayOfMonth: 5 },
      { title: "مواد تنظيف ومناشف", amount: 20_000, category: "SUPPLIES", dayOfMonth: 12 },
      { title: "مياه ومشروبات", amount: 15_000, category: "SUPPLIES", dayOfMonth: 18 },
    ];
    // One-off purchases, dated relative to today.
    const oneOff: { title: string; amount: number; category: Cat; ago: number }[] = [
      { title: "صيانة جهاز المشي", amount: 60_000, category: "MAINTENANCE", ago: 46 },
      { title: "أوزان حديدية جديدة", amount: 120_000, category: "EQUIPMENT", ago: 38 },
      { title: "تصليح مكيف", amount: 40_000, category: "MAINTENANCE", ago: 9 },
      { title: "مستلزمات مكتبية", amount: 15_000, category: "OTHER", ago: 2 },
    ];

    const now = new Date();
    let count = 0;
    for (let back = 2; back >= 0; back--) {
      const month = new Date(now.getFullYear(), now.getMonth() - back, 1);
      for (const e of monthly) {
        const spentAt = new Date(month.getFullYear(), month.getMonth(), e.dayOfMonth, 10);
        // Never book a cost in the future.
        if (spentAt > now) continue;
        await prisma.expense.create({
          data: {
            title: e.title,
            amount: e.amount,
            category: e.category,
            spentAt,
            createdById: managerId,
          },
        });
        count++;
      }
    }
    for (const e of oneOff) {
      await prisma.expense.create({
        data: {
          title: e.title,
          amount: e.amount,
          category: e.category,
          spentAt: daysFromNow(-e.ago),
          createdById: managerId,
        },
      });
      count++;
    }
    console.log(`✔ ${count} demo expenses ready (3 months)`);
  }

  if ((await prisma.debt.count()) === 0) {
    const debts: {
      personName: string;
      phone: string;
      amount: number;
      paid?: number;
      note?: string;
      ago: number;
    }[] = [
      { personName: "حسام الجبوري", phone: "07901112233", amount: 150_000, paid: 50_000, note: "بروتين وملحقات", ago: 15 },
      { personName: "زيد العامري", phone: "07711223344", amount: 80_000, paid: 80_000, note: "سُدّد بالكامل", ago: 12 },
      { personName: "مروان سالم", phone: "07801334455", amount: 200_000, ago: 8 },
      { personName: "ليث قاسم", phone: "07901445566", amount: 60_000, paid: 15_000, ago: 4 },
      { personName: "عبدالله ناصر", phone: "07711556677", amount: 120_000, paid: 60_000, note: "دفع النصف", ago: 1 },
    ];
    for (const d of debts) {
      await prisma.debt.create({
        data: {
          personName: d.personName,
          phone: d.phone,
          amount: d.amount,
          note: d.note ?? null,
          createdAt: daysFromNow(-d.ago),
          createdById: managerId,
          payments: d.paid
            ? { create: [{ amount: d.paid, createdById: managerId, createdAt: daysFromNow(-d.ago + 1) }] }
            : undefined,
        },
      });
    }
    console.log(`✔ ${debts.length} demo debts ready`);
  }
}

async function main() {
  const base = await prisma.user.findMany({
    where: { username: { in: ["manager", "reception", "captain"] } },
    select: { id: true, username: true },
  });
  const userIds: Record<string, string> = Object.fromEntries(base.map((u) => [u.username, u.id]));
  if (!userIds.manager || !userIds.reception || !userIds.captain) {
    throw new Error("Base accounts missing — run `npm run db:seed` first.");
  }

  Object.assign(userIds, await seedStaff(userIds.manager));
  const memberIds = await seedMembers(userIds.reception);
  await seedVideos(userIds.manager, userIds.captain);
  await seedMeals();
  await seedCourses(userIds.captain, memberIds);
  await seedFinance(userIds.manager);
  await seedActivity(userIds, memberIds);
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
