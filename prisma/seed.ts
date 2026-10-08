/**
 * Bootstrap seed — creates the one manager account needed to sign in for the
 * first time, and nothing else.
 *
 * No members, plans or demo records: a real gym enters its own data through
 * the app. Safe to re-run; it never overwrites an existing password.
 *
 *   npm run db:seed
 */
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../lib/auth/password";

const prisma = new PrismaClient();

async function main() {
  const username = process.env.SEED_MANAGER_USERNAME || "manager";
  const password = process.env.SEED_MANAGER_PASSWORD || "ChangeMe123!";
  const displayName = process.env.SEED_MANAGER_NAME || "Gym Manager";

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    console.log(`✔ Manager "${username}" already exists — nothing to do.`);
    return;
  }

  await prisma.user.create({
    data: {
      username,
      displayName,
      role: "MANAGER",
      hashedPassword: await hashPassword(password),
      // The manager may also upload to the exercise-video library.
      canAddVideos: true,
    },
  });

  console.log(`✔ Manager account created: ${username}`);
  if (!process.env.SEED_MANAGER_PASSWORD) {
    console.log(
      "\n⚠  Using the default password. Sign in and change it straight away\n" +
        "   (sidebar → My account → Change password), or set SEED_MANAGER_PASSWORD\n" +
        "   before seeding.\n"
    );
  }
  console.log("Everything else — staff accounts, plans, members — is added in the app.");
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
