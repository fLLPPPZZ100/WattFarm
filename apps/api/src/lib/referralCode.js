/**
 * Invite code generation, parsing and display helpers.
 *
 * Deliberately dependency-free — no Prisma, no config beyond the alphabet — so
 * the parsing rules can be exercised without a database. `normaliseCode` is the
 * boundary where untrusted user input becomes a database lookup key, which is
 * exactly the kind of function that should be trivially testable.
 */

import { randomInt } from 'node:crypto';

import { CODE_ALPHABET, CODE_LENGTH } from '../config/referral.js';

/**
 * Generates a code.
 *
 * Uses `randomInt` rather than `Math.random()` for two reasons. A code is a
 * guessable identifier that credits a stranger with your signup, so it should
 * not come from a predictable PRNG. And `randomInt` is rejection-sampled, so
 * every character is equally likely — `Math.floor(Math.random() * 32)` would be
 * fine for 32 symbols but silently skews the moment the alphabet size stops
 * being a power of two, which is the sort of thing nobody notices.
 */
export function generateCode() {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

/**
 * Turns user-supplied input into a canonical code, or null.
 *
 * Accepts what people actually paste: lowercase, stray whitespace, or an entire
 * invite URL such as `https://wattfarm.app/?ref=ABCD1234`. Characters outside
 * the alphabet are dropped rather than rejected, so a hyphenated or spaced-out
 * code still works.
 *
 * Returns null when nothing of the right length survives, giving callers one
 * unambiguous "invalid" signal instead of several failure shapes.
 *
 * @param {unknown} raw
 * @returns {string | null}
 */
/** Query parameters an invite link may carry, matching the client's list. */
const PARAM_PATTERN = /(?:^|[?&])(?:ref|referral|r)=([^&#]*)/i;

/**
 * Strips everything outside the alphabet and upper-cases the rest.
 * Returns null unless exactly one code's worth of characters survives.
 */
function cleanCandidate(candidate) {
  let cleaned = '';
  for (const char of candidate.toUpperCase()) {
    if (CODE_ALPHABET.includes(char)) cleaned += char;
  }
  return cleaned.length === CODE_LENGTH ? cleaned : null;
}

export function normaliseCode(raw) {
  if (typeof raw !== 'string') return null;

  // Guard before any per-character work: an enormous string should cost nothing.
  if (raw.length > 512) return null;

  const trimmed = raw.trim();
  if (!trimmed) return null;

  /**
   * Prefer the named query parameter when there is one. An earlier version just
   * took the last `/?=&`-delimited piece, which broke on `?ref=CODE#top` — the
   * fragment became the candidate and the code was silently discarded. Reading
   * the parameter by name also avoids a host or path segment that happens to
   * clean up to the right length being mistaken for the code.
   */
  const param = PARAM_PATTERN.exec(trimmed);
  if (param) {
    const fromParam = cleanCandidate(param[1]);
    if (fromParam) return fromParam;
  }

  // Bare code, possibly spaced or hyphenated.
  const whole = cleanCandidate(trimmed);
  if (whole) return whole;

  /**
   * Last resort: a URL with no recognised parameter. Try each delimited piece
   * and take the first that yields a code, so a trailing fragment or extra path
   * segment does not defeat the parse.
   */
  for (const piece of trimmed.split(/[/?=&#\s]/)) {
    if (!piece) continue;
    const fromPiece = cleanCandidate(piece);
    if (fromPiece) return fromPiece;
  }

  return null;
}

/**
 * Partially hides an email for display on the referral list.
 *
 * A referrer has a legitimate reason to recognise who accepted their invite, but
 * no reason to be handed a harvestable list of full addresses. The mask length
 * is padded to at least three characters so a two-letter local part does not
 * reveal its own length.
 *
 * @param {unknown} email
 * @returns {string | null}
 */
export function maskEmail(email) {
  if (typeof email !== 'string') return null;

  const at = email.lastIndexOf('@');
  if (at <= 0 || at === email.length - 1) return null;

  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const head = local.slice(0, 2);

  return `${head}${'*'.repeat(Math.max(3, local.length - 2))}@${domain}`;
}

export default { generateCode, normaliseCode, maskEmail };
