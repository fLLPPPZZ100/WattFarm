/**
 * Per-user serialisation for economy operations.
 *
 * ## The problem this solves
 *
 * Purchases, avatar unlocks and minigame plays all followed a read-then-write
 * pattern where the read happened *outside* the transaction:
 *
 *     const user = await prisma.user.findUnique(...)   // read
 *     if (user.vltBalance < price) return 400          // decide on stale data
 *     await prisma.$transaction(...)                   // write
 *
 * Between the read and the write, another request could do the same thing.
 * `{ decrement }` is atomic, but the *authorisation decision* was made against
 * a snapshot, so N concurrent requests each saw the full balance and each was
 * allowed to spend it. Firing ten parallel purchases with 100 VLT bought ten
 * items and left the balance at −900. The same shape let a player collect
 * several minigame rewards inside one cooldown, and unlock (and pay for) the
 * same avatar twice.
 *
 * Rate limiting does not help: the limits permit exactly the burst that
 * triggers the race.
 *
 * ## The fix
 *
 * Take a row-level write lock on the player's `User` row as the first
 * statement of the transaction. Postgres blocks any other transaction that
 * tries to lock the same row until this one commits, so all economy operations
 * for a given player run strictly one after another. Different players never
 * contend with each other.
 *
 * `SELECT … FOR UPDATE` is used rather than `Serializable` isolation because it
 * blocks instead of aborting: no retry loop, no serialisation-failure errors
 * surfacing to the player.
 */

import prisma from './prisma.js';

/** Thrown when the player has no database row, so callers can map it to a 404. */
export class UserNotFoundError extends Error {
  constructor(uid) {
    super(`No user row for uid ${uid}`);
    this.name = 'UserNotFoundError';
    this.uid = uid;
  }
}

/**
 * Runs `handler` with an exclusive lock on the player's row.
 *
 * @template T
 * @param {string} uid Firebase uid
 * @param {(tx: import('@prisma/client').Prisma.TransactionClient, user: any) => Promise<T>} handler
 *   Receives the transaction client and the freshly locked user row. Every read
 *   and write inside must use `tx`, otherwise it escapes the lock's protection.
 * @param {object} [options]
 * @param {number} [options.timeout] ms to wait for the transaction (default 10s)
 * @returns {Promise<T>}
 * @throws {UserNotFoundError} when the uid has no row
 */
export async function withUserLock(uid, handler, { timeout = 10_000 } = {}) {
  return prisma.$transaction(
    async (tx) => {
      /**
       * The lock and the read are one statement, so the returned row is
       * guaranteed current for the rest of the transaction.
       *
       * `$queryRaw` with a tagged template is parameterised by Prisma — the uid
       * is bound, not interpolated.
       */
      const rows = await tx.$queryRaw`
        SELECT id, email, "vltBalance", "avatarId", "unlockedAvatars", "createdAt"
        FROM "User"
        WHERE id = ${uid}
        FOR UPDATE
      `;

      if (!Array.isArray(rows) || rows.length === 0) {
        throw new UserNotFoundError(uid);
      }

      return handler(tx, rows[0]);
    },
    {
      timeout,
      // Waiting on the row lock counts towards this budget; 10s is generous for
      // the short critical sections here while still failing rather than hanging.
      maxWait: 5_000,
    }
  );
}

export default withUserLock;
