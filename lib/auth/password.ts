import bcrypt from "bcryptjs";

const SALT_ROUNDS = 10;

/**
 * A real bcrypt hash of an unguessable string, compared against when the
 * username does not exist so that login takes the same time either way.
 */
export const DUMMY_HASH =
  "$2b$10$CwTycUXWue0Thq9StjUM0uJ8e2Xk9Jw1t0hQqfVQJ1t2Zz8Q2Xq6e";

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
