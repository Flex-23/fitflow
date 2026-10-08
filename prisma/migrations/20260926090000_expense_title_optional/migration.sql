-- An expense's category is its description; only "other" needs words, and
-- those now live in the note. Existing titles are kept as they are.
ALTER TABLE "Expense" ALTER COLUMN "title" DROP NOT NULL;

-- Correcting a spend that was already recorded.
ALTER TYPE "ActivityAction" ADD VALUE 'UPDATE_EXPENSE';

-- Turning the turnstile on or off for this gym.
ALTER TYPE "ActivityAction" ADD VALUE 'UPDATE_SETTINGS';
