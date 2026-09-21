/**
 * Wipe every table (schema stays intact) so the seeds can start clean.
 * Run with: npm run db:reset   (wipes, then re-seeds base + demo data)
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Children first; FK cascades would handle most of it but explicit order is
  // clearer and avoids relying on cascade semantics.
  await prisma.activityLog.deleteMany();
  await prisma.gateLog.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.debtPayment.deleteMany();
  await prisma.debt.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.freezeRecord.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.exercise.deleteMany();
  await prisma.courseDay.deleteMany();
  await prisma.trainingCourse.deleteMany();
  await prisma.nutritionMeal.deleteMany();
  await prisma.nutritionDay.deleteMany();
  await prisma.nutritionCourse.deleteMany();
  await prisma.video.deleteMany();
  await prisma.mealSuggestion.deleteMany();
  await prisma.member.deleteMany();
  await prisma.subscriptionPlan.deleteMany();
  await prisma.user.deleteMany();
  await prisma.setting.deleteMany();
  console.log("✔ All tables emptied");
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
