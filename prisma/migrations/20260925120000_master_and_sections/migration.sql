-- A master account above the managers, and a set of sections each manager
-- may be given.

-- Postgres will not let a new enum value be used in the same transaction that
-- adds it; nothing here uses MASTER, so this is safe.
ALTER TYPE "Role" ADD VALUE 'MASTER' BEFORE 'MANAGER';

CREATE TYPE "Section" AS ENUM (
  'RECEPTION',
  'COACHING',
  'LIBRARY',
  'FINANCE',
  'MANAGEMENT',
  'STAFF'
);

ALTER TABLE "User" ADD COLUMN "sections" "Section"[] DEFAULT ARRAY[]::"Section"[];

-- Managers who exist today had the run of the system, and a migration must
-- not quietly take that away. New managers start with whatever the master
-- gives them.
UPDATE "User"
SET "sections" = ARRAY[
  'RECEPTION', 'COACHING', 'LIBRARY', 'FINANCE', 'MANAGEMENT', 'STAFF'
]::"Section"[]
WHERE "role" = 'MANAGER';

-- The master granting or removing a manager's sections.
ALTER TYPE "ActivityAction" ADD VALUE 'SET_PERMISSIONS';
