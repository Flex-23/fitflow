/**
 * Create or reset the master account.
 *
 *   npm run master -- <username> <password>
 *
 * There is exactly one master, and no screen anywhere in the app creates it:
 * an account that can see everything should not be one click away from a
 * manager's roster. It is made here, on the gym computer, by whoever has the
 * database.
 *
 * Run again with the same username to change its password. Run with a
 * different one to rename it — the master can also do both from its own
 * screen once it is in.
 */
import { workerPrisma } from "../lib/worker-db";
import { hashPassword } from "../lib/auth/password";
import { masterGate } from "../lib/auth/master-gate";

const prisma = workerPrisma();

async function main() {
  const [username, password] = process.argv.slice(2);

  if (!username || !password) {
    console.error("Usage: npm run master -- <username> <password>");
    process.exit(1);
  }
  if (username.length < 3 || !/^[a-zA-Z0-9_.-]+$/.test(username)) {
    console.error("The username must be at least 3 characters: letters, digits, . _ -");
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("The password must be at least 8 characters.");
    process.exit(1);
  }

  const existing = await prisma.user.findFirst({ where: { role: "MASTER" } });
  const clash = await prisma.user.findUnique({ where: { username } });
  if (clash && clash.id !== existing?.id) {
    console.error(`The username "${username}" already belongs to another account.`);
    process.exit(1);
  }

  const hashedPassword = await hashPassword(password);

  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: { username, hashedPassword, isActive: true },
    });
    console.log(`Master updated: ${username}`);
  } else {
    await prisma.user.create({
      data: {
        username,
        displayName: "Master",
        role: "MASTER",
        hashedPassword,
        // Sections are meaningless for a master; it holds everything.
        sections: [],
      },
    });
    console.log(`Master created: ${username}`);
  }

  const gate = masterGate();
  console.log(
    gate
      ? `Sign in at /access/${gate}`
      : "\nMASTER_GATE is not set (or is shorter than 12 characters), so the\n" +
          "sign-in page will not open. Put a long random value in .env, e.g.\n" +
          `  MASTER_GATE="${randomGate()}"`
  );
}

function randomGate(): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
  return Array.from(
    { length: 24 },
    () => alphabet[Math.floor(Math.random() * alphabet.length)]
  ).join("");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
