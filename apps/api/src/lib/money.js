/**
 * Exact decimal arithmetic for currency.
 *
 * VLT amounts were stored as `Float` (IEEE-754 double). Binary floating point
 * cannot represent most decimal fractions exactly, so repeated credits and
 * debits accumulate error — the classic `0.1 + 0.2 !== 0.3`. The codebase
 * papered over this with `Math.round(x * 100) / 100` at various points, which
 * hides drift rather than preventing it.
 *
 * The database columns are now `Decimal(18,4)` and every calculation goes
 * through `Prisma.Decimal`, which is exact for decimal values.
 *
 * API responses still emit plain JSON numbers so the frontend contract is
 * unchanged — conversion happens only at the serialisation boundary.
 */

import { Prisma } from '@prisma/client';

/** Scale stored in the database. Four places leaves room for fractional rewards. */
export const MONEY_SCALE = 4;

/**
 * Builds a Decimal from anything the database or a calculation hands us.
 * Nullish becomes zero so callers never have to null-check a balance.
 *
 * @param {Prisma.Decimal | number | string | null | undefined} value
 * @returns {Prisma.Decimal}
 */
export function money(value) {
  if (value instanceof Prisma.Decimal) return value;
  if (value === null || value === undefined) return new Prisma.Decimal(0);

  // Reject NaN/Infinity explicitly: `new Decimal(NaN)` succeeds and would
  // silently poison a balance.
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new TypeError(`Cannot convert non-finite number to money: ${value}`);
  }

  return new Prisma.Decimal(value);
}

/**
 * Rounds to the stored scale using half-up, the convention players expect.
 *
 * Uses `toFixed` rather than `toDecimalPlaces` because `toFixed` is present in
 * every build of the bundled decimal library.
 *
 * @param {Prisma.Decimal | number | string} value
 * @returns {Prisma.Decimal}
 */
export function roundMoney(value) {
  return new Prisma.Decimal(money(value).toFixed(MONEY_SCALE));
}

/**
 * Converts to a JSON-safe number for API responses.
 *
 * Values are bounded by `Decimal(18,4)`, far inside the range where a double
 * represents four decimal places exactly, so this conversion is lossless in
 * practice. Keeping it in one place makes that assumption reviewable.
 *
 * @param {Prisma.Decimal | number | null | undefined} value
 * @returns {number}
 */
export function moneyToNumber(value) {
  return roundMoney(value).toNumber();
}

/**
 * Multiplies a unit price by an integer quantity.
 *
 * @param {Prisma.Decimal | number | string} unitPrice
 * @param {number} quantity integer
 * @returns {Prisma.Decimal}
 */
export function multiplyMoney(unitPrice, quantity) {
  return roundMoney(money(unitPrice).mul(quantity));
}

/**
 * How many whole units the balance affords. Used for the "maxAffordable" hint
 * on a failed purchase.
 *
 * @param {Prisma.Decimal | number} balance
 * @param {Prisma.Decimal | number} unitPrice
 * @returns {number}
 */
export function affordableUnits(balance, unitPrice) {
  const price = money(unitPrice);
  if (price.lessThanOrEqualTo(0)) return 0;
  return Math.floor(money(balance).div(price).toNumber());
}

/** True when `balance` covers `cost`. Explicit helper to avoid `<` on Decimals. */
export function canAfford(balance, cost) {
  return money(balance).greaterThanOrEqualTo(money(cost));
}

export { Prisma };
