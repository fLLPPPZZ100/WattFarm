/**
 * Referral codes.
 *
 * ## Why the code is random and not derived
 *
 * A code built from the uid, the email or a counter is enumerable: anyone could
 * walk the space and discover which accounts exist, and — worse — attribute
 * their own signups to a stranger's code to inflate that stranger's numbers, or
 * work out that account #4181 exists. The code is therefore drawn from a
 * cryptographic RNG and carries no information about its owner.
 *
 * 8 characters over a 32-symbol alphabet is 32^8 ≈ 1.1 x 10^12 possibilities.
 * Guessing a valid code is pointless anyway — the only thing a code buys is
 * attributing a *new* account to someone else, which grants the guesser nothing
 * — but a large space also keeps the collision retry in `generateReferralCode`
 * effectively never needed.
 */

import { randomInt } from 'node:crypto';

/**
 * Alphabet for generated codes.
 *
 * Excludes 0/O and 1/I/L, which are the pairs people transcribe wrongly when a
 * code is read aloud or copied from a screenshot.
 */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Length of newly generated codes. */
const CODE_LENGTH = 8;

/**
 * What we accept when a code arrives from a client.
 *
 * Deliberately wider than the generation alphabet: the migration that
 * introduced this column backfilled existing accounts with uppercase hex, which
 * contains 0 and 1. Rejecting those would lock early players out of their own
 * invite links. Length is bounded so a pathological input cannot reach the
 * database as a query argument.
 */
const CODE_PATTERN = /^[A-Z0-9]{6,12}$/;

/**
 * A cryptographically random code.
 *
 * `randomInt` is used rather than `randomBytes` with a modulo, because modulo on
 * 256 values over a 31-symbol alphabet is biased — `randomInt` rejects and
 * resamples internally to stay uniform.
 *
 * @returns {string}
 */
export function generateReferralCode() {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

/**
 * Normalises a client-supplied code, or returns null when it is unusable.
 *
 * Trimming and upper-casing means a code pasted with stray whitespace or in the
 * wrong case still works, which is most of the support burden for invite links.
 * Anything that is not a plausible code returns null so callers can ignore it
 * instead of querying for it.
 *
 * @param {unknown} raw
 * @returns {string | null}
 */
export function normaliseReferralCode(raw) {
  if (typeof raw !== 'string') return null;

  const code = raw.trim().toUpperCase();
  if (!CODE_PATTERN.test(code)) return null;

  return code;
}

export { CODE_ALPHABET, CODE_LENGTH, CODE_PATTERN };
