/**
 * Referral programme rules.
 *
 * Modelled on RollerCoin's, which pays the referrer a percentage of what their
 * referrals *earn* — between 10% and 25% depending on the referrer's progress —
 * rather than a flat bounty per signup.
 * See https://rollercoin.com/blog/referral-program-guide-tips/ and
 * https://rollercoin.com/blog/introducing-referral-program-2-0
 *
 * ## Why a share of earnings and not a signup bounty
 *
 * A bounty paid on registration is farmable with throwaway accounts: 100
 * registrations is 100 payouts for zero real play. A share of earnings only
 * pays when the referred player actually builds a farm and mines, so a fake
 * account costs more to make productive than the commission it returns.
 *
 * ## Why this deliberately breaks budget conservation
 *
 * `computeNetworkShares` splits a fixed 50 VLT per cycle so the budget is
 * conserved — that fixed a bug where a 50 VLT budget paid out 250. Commission
 * is paid *on top* of that budget, so total VLT issued per cycle exceeds 50
 * once referrals exist.
 *
 * That is intentional, not a regression: the commission does not come out of
 * the referred player's reward (taking it from them would punish accepting an
 * invite), so it has to be newly issued. It is marketing spend, bounded by the
 * number of qualified referrals and their share of the network. Please do not
 * "fix" it by subtracting it from the referred player's payout.
 *
 * VLT is internal to the game and not traded anywhere, so this is a balance
 * decision, not a financial one.
 */

/**
 * Commission tiers. `pointsRequired` is the number of qualified referrals
 * needed to reach the level; `commissionRate` is the fraction of each
 * referral's mining payout credited to the referrer.
 *
 * Must stay sorted by `pointsRequired` ascending — `levelFor` relies on it.
 */
export const REFERRAL_LEVELS = Object.freeze([
  Object.freeze({ level: 1, pointsRequired: 0, commissionRate: 0.1 }),
  Object.freeze({ level: 2, pointsRequired: 3, commissionRate: 0.13 }),
  Object.freeze({ level: 3, pointsRequired: 10, commissionRate: 0.16 }),
  Object.freeze({ level: 4, pointsRequired: 25, commissionRate: 0.2 }),
  Object.freeze({ level: 5, pointsRequired: 60, commissionRate: 0.25 }),
]);

/**
 * One-off VLT credited to a player who joins through an invite.
 *
 * Paid to the person joining, never to the referrer — that asymmetry is what
 * makes self-referral pointless. Someone who registers 50 accounts through
 * their own link gets 50 accounts each holding a little extra VLT, and no way
 * to move it anywhere, because the game has no transfers between players.
 */
export const SIGNUP_BONUS_VLT = 25;

/**
 * Installed output a referral must reach before their referrer earns anything.
 *
 * A panel produces 1 W/s (`PANEL_BASE_W`), and a new account starts with 50 VLT
 * — enough for two mount-and-panel pairs, so 2 W/s. Reaching 10 W/s therefore
 * needs roughly 250 VLT of investment, which can only come from actually mining
 * across several payout cycles.
 *
 * This is the anti-fraud gate: it puts real play between a fake account and the
 * first commission. RollerCoin does the same thing by requiring referrals to
 * reach a minimum miner level before they count.
 */
export const QUALIFYING_POWER_RATE = 10;

/** Length of a generated invite code. */
export const CODE_LENGTH = 8;

/**
 * Alphabet for invite codes: uppercase Crockford base32.
 *
 * Excludes I, L, O and U — the first three are misread as 1 and 0 when a code
 * is copied by hand or read aloud, and dropping U keeps generated codes from
 * spelling anything unfortunate. 32 symbols over 8 places is 2^40 combinations,
 * far too sparse to enumerate.
 */
export const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * Tier for a given point total.
 *
 * @param {number} points
 * @returns {{ level: number, commissionRate: number, pointsRequired: number,
 *   next: { level: number, pointsRequired: number, commissionRate: number } | null }}
 */
export function levelFor(points) {
  const safePoints = Number.isFinite(points) && points > 0 ? Math.floor(points) : 0;

  let current = REFERRAL_LEVELS[0];
  let next = null;

  for (let i = 0; i < REFERRAL_LEVELS.length; i += 1) {
    if (safePoints >= REFERRAL_LEVELS[i].pointsRequired) {
      current = REFERRAL_LEVELS[i];
      next = REFERRAL_LEVELS[i + 1] ?? null;
    } else {
      break;
    }
  }

  return { ...current, next: next ? { ...next } : null };
}

/** Public view of the rules, so the UI never hardcodes a second copy. */
export function publicConfig() {
  return {
    levels: REFERRAL_LEVELS.map((tier) => ({ ...tier })),
    signupBonus: SIGNUP_BONUS_VLT,
    qualifyingPowerRate: QUALIFYING_POWER_RATE,
  };
}

export default { REFERRAL_LEVELS, SIGNUP_BONUS_VLT, QUALIFYING_POWER_RATE, levelFor };
