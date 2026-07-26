/**
 * Cheap pre-flight check for migration drift — no database required.
 *
 * ## Why this exists
 *
 * `schema.prisma` and `prisma/migrations/` silently fell out of sync: two whole
 * tables (`PlacedMount`, `LedgerEntry`) and every `Decimal(18,4)` money column
 * existed only in the schema, because development ran against a database shaped
 * by `prisma db push`. Local dev looked correct while any database built from
 * the migration history was missing the placement feature entirely and stored
 * currency as floats.
 *
 * `prisma migrate diff` is the authoritative check, but it needs a reachable
 * shadow database, so it only runs where one is configured. This script parses
 * both files and reports outright omissions, which is enough to catch the class
 * of mistake above, and it runs anywhere — including in CI before any database
 * exists.
 *
 * ## What it does NOT check
 *
 * Column types beyond the money columns, nullability, defaults, foreign key
 * actions, or statement ordering. A clean result here means "nothing is
 * missing", not "the schemas match". Run `npm run prisma:drift` for that.
 *
 * Exits non-zero when something is missing, so it can gate a build.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const prismaDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'prisma');

const schema = readFileSync(join(prismaDir, 'schema.prisma'), 'utf8');

const migrationsDir = join(prismaDir, 'migrations');
const sql = readdirSync(migrationsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  // Migration directories are timestamp-prefixed, so lexical order is apply order.
  .sort()
  .map((name) => readFileSync(join(migrationsDir, name, 'migration.sql'), 'utf8'))
  .join('\n');

// Strip SQL comments, otherwise a table named only in an explanatory comment
// would count as created.
const sqlCode = sql.replace(/^\s*--.*$/gm, '');

/** Model names, so relation fields (which have no column) can be skipped. */
const models = new Set();
for (const match of schema.matchAll(/^model\s+(\w+)\s*\{/gm)) models.add(match[1]);

const problems = [];
let checkedCount = 0;

/** Strips a trailing `//` comment without touching `///` doc lines. */
function stripComment(line) {
  return line.replace(/\/\/.*$/, '');
}

for (const [, model, body] of schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
  if (!new RegExp(`CREATE TABLE "${model}"`).test(sqlCode)) {
    problems.push(`table ${model}: never created by any migration`);
    continue;
  }

  const lines = body.split('\n');

  for (const rawLine of lines) {
    const line = stripComment(rawLine).trim();
    if (!line || line.startsWith('///') || line.startsWith('@@')) continue;

    const parsed = line.match(/^(\w+)\s+(\w+)/);
    if (!parsed) continue;
    const [, field, type] = parsed;

    if (models.has(type)) continue; // relation field, no column of its own

    checkedCount += 1;
    if (!new RegExp(`"${field}"`).test(sqlCode)) {
      problems.push(`column ${model}.${field}: no migration mentions it`);
    }
  }

  // Composite indexes and uniques declared with @@index / @@unique.
  for (const match of body.matchAll(/@@(index|unique)\(\[([^\]]+)\]\)/g)) {
    const columns = match[2].split(',').map((column) => column.trim());
    const suffix = match[1] === 'unique' ? 'key' : 'idx';
    const name = `${model}_${columns.join('_')}_${suffix}`;

    checkedCount += 1;
    if (!sqlCode.includes(`"${name}"`)) {
      problems.push(`index ${name}: not created by any migration`);
    }
  }

  // Field-level @unique gets its own index.
  for (const rawLine of lines) {
    const line = stripComment(rawLine);
    if (!/@unique/.test(line) || /@@/.test(line)) continue;

    const field = line.trim().match(/^(\w+)/)?.[1];
    if (!field) continue;

    const name = `${model}_${field}_key`;
    checkedCount += 1;
    if (!sqlCode.includes(`"${name}"`)) {
      problems.push(`unique index ${name}: not created by any migration`);
    }
  }

  // Currency must not still be a float in the final state. This is the check
  // that would have caught the original drift, so it is worth having even
  // though the script is otherwise type-agnostic.
  for (const rawLine of lines) {
    if (!/@db\.Decimal\(18, ?4\)/.test(rawLine)) continue;

    const field = rawLine.trim().match(/^(\w+)/)?.[1];
    const becomesDecimal = new RegExp(
      `ALTER COLUMN "${field}" SET DATA TYPE DECIMAL\\(18,4\\)|"${field}" DECIMAL\\(18,4\\)`
    ).test(sqlCode);

    checkedCount += 1;
    if (!becomesDecimal) {
      problems.push(`money column ${model}.${field}: never becomes DECIMAL(18,4)`);
    }
  }
}

console.log(`[drift] checked ${checkedCount} schema objects against the migration history`);

if (problems.length === 0) {
  console.log('[drift] OK — nothing declared in schema.prisma is missing from migrations');
  console.log('[drift] note: types, nullability and defaults are NOT verified here.');
  console.log('[drift] run `npm run prisma:drift` against a shadow database for that.');
} else {
  console.error(`\n[drift] ${problems.length} problem(s) found:\n`);
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error('\n[drift] generate the missing migration with `npm run prisma:migrate`.');
  process.exitCode = 1;
}
