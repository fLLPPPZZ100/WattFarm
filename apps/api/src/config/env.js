/**
 * Environment validation — runs once at boot and fails fast.
 *
 * The previous implementation silently fell back to `applicationDefault()`
 * when no Firebase credential was configured, which let the server start
 * in a state where every token verification failed with an opaque error.
 * We now validate everything up front and refuse to start when misconfigured.
 */

const isProduction = process.env.NODE_ENV === 'production';

/** Collects problems so we can report all of them at once instead of one per restart. */
const problems = [];

function required(name) {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    problems.push(`${name} is required but was not set`);
    return null;
  }
  return value.trim();
}

/* ── Database ── */
const DATABASE_URL = required('DATABASE_URL');

/* ── Server ── */
const rawPort = process.env.PORT || '3001';
const PORT = Number.parseInt(rawPort, 10);
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  problems.push(`PORT must be an integer between 1 and 65535 (received "${rawPort}")`);
}

/* ── CORS allowlist ── */
// Comma-separated list of origins allowed to call the API.
// In development we default to the Vite dev server; in production it is mandatory.
const rawOrigins = process.env.CORS_ORIGINS || (isProduction ? '' : 'http://localhost:5173');
const CORS_ORIGINS = rawOrigins
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

if (CORS_ORIGINS.length === 0) {
  problems.push(
    'CORS_ORIGINS is required in production (comma-separated list of allowed frontend origins)'
  );
}

for (const origin of CORS_ORIGINS) {
  try {
    // Throws for malformed values, catching typos like "localhost:5173" (missing scheme).
    new URL(origin);
  } catch {
    problems.push(`CORS_ORIGINS contains an invalid origin: "${origin}"`);
  }
}

/* ── Firebase Admin credential ── */
// Exactly one of these must be provided. We resolve which one here so the
// bootstrap code in lib/firebaseAdmin.js has no branching guesswork left.
const GOOGLE_APPLICATION_CREDENTIALS = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim() || null;
const FIREBASE_SERVICE_ACCOUNT_JSON = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim() || null;
// Opt-in escape hatch for environments with real Application Default Credentials
// (e.g. Cloud Run). Must be explicit so it can never be a silent fallback.
const USE_APPLICATION_DEFAULT_CREDENTIALS =
  process.env.USE_APPLICATION_DEFAULT_CREDENTIALS === 'true';

const credentialSources = [
  GOOGLE_APPLICATION_CREDENTIALS && 'GOOGLE_APPLICATION_CREDENTIALS',
  FIREBASE_SERVICE_ACCOUNT_JSON && 'FIREBASE_SERVICE_ACCOUNT_JSON',
  USE_APPLICATION_DEFAULT_CREDENTIALS && 'USE_APPLICATION_DEFAULT_CREDENTIALS',
].filter(Boolean);

if (credentialSources.length === 0) {
  problems.push(
    'No Firebase Admin credential configured. Set exactly one of: ' +
      'GOOGLE_APPLICATION_CREDENTIALS (path to service account JSON), ' +
      'FIREBASE_SERVICE_ACCOUNT_JSON (inline JSON), or ' +
      'USE_APPLICATION_DEFAULT_CREDENTIALS=true (only where ADC is genuinely available)'
  );
} else if (credentialSources.length > 1) {
  problems.push(
    `Multiple Firebase Admin credentials configured (${credentialSources.join(', ')}). ` +
      'Set exactly one to avoid ambiguity about which identity the server uses.'
  );
}

/* ── Proxy trust ── */
/**
 * Number of reverse proxies in front of the API.
 *
 * This directly controls whether `req.ip` can be forged. Express derives the
 * client address from `X-Forwarded-For` when proxies are trusted, and a client
 * can put anything in that header. A previous revision hard-coded a value of 1,
 * which meant that running the API without a proxy in front of it (local
 * development, or a direct deployment) let anyone reset their own rate-limit
 * counter by rotating the header.
 *
 * 0 — trust nobody; use the socket address. Correct when the API is exposed
 *     directly. This is the default.
 * n — trust exactly n hops. Set this to match the hosting platform
 *     (Railway/Render/Fly typically terminate TLS at one proxy, so n = 1).
 */
const rawTrustProxy = process.env.TRUST_PROXY_HOPS ?? '0';
const TRUST_PROXY_HOPS = Number.parseInt(rawTrustProxy, 10);
if (!Number.isInteger(TRUST_PROXY_HOPS) || TRUST_PROXY_HOPS < 0 || TRUST_PROXY_HOPS > 10) {
  problems.push(
    `TRUST_PROXY_HOPS must be an integer between 0 and 10 (received "${rawTrustProxy}")`
  );
}

/* ── Security toggles ── */
// When true, state-changing routes ask Firebase whether the token was revoked.
// Adds a network round trip, so it is applied per route via verifyAuthStrict
// rather than globally.
const CHECK_REVOKED_TOKENS = process.env.CHECK_REVOKED_TOKENS !== 'false';

/**
 * Whether routes that earn or spend VLT demand a verified email address.
 *
 * Secure by default: enabled unless explicitly switched off. This previously
 * defaulted to `isProduction`, which meant a deployment that forgot to set
 * NODE_ENV silently ran with the check disabled. Security defaults should not
 * depend on a variable that is easy to omit.
 *
 * Local development typically wants REQUIRE_VERIFIED_EMAIL=false.
 */
const REQUIRE_VERIFIED_EMAIL = process.env.REQUIRE_VERIFIED_EMAIL !== 'false';

// Loudly flag the insecure combination rather than letting it pass unnoticed.
if (isProduction && !REQUIRE_VERIFIED_EMAIL) {
  console.warn(
    '[config] WARNING: REQUIRE_VERIFIED_EMAIL=false in production. ' +
      'Anyone can register with someone else’s address and move currency.'
  );
}

/* ── Economy ── */
/**
 * Synthetic network power, in W/s, standing in for "everyone else mining".
 *
 * The payout splits a fixed budget by power share. With a single real player a
 * plain proportional split always awards the entire budget, so building more
 * changed nothing — the observed symptom was 5,745 W and 17,784 W both paying
 * exactly 50 VLT. This baseline makes the share meaningful from the first
 * panel, with naturally diminishing returns:
 *
 *   share = rate / (rate + baseline) x budget
 *
 * It is the difficulty knob: higher means slower progression. Simulated, with
 * the starting grant and a 50 VLT budget per cycle:
 *
 *   baseline   5 panels   20 panels   full grid   income at full grid
 *         10       1.5h        4.0h        7.8h   85% of budget
 *         40       4.2h       10.3h       16.8h   58% of budget
 *         60       6.0h       14.7h       23.0h   48% of budget
 *
 * 40 is the default: a full grid takes a couple of evenings rather than an
 * afternoon, and it still leaves 42% of the budget unclaimed so future tiers
 * and grid expansions have somewhere to go.
 */
const rawBaseline = process.env.NETWORK_POWER_BASELINE ?? '40';
const NETWORK_POWER_BASELINE = Number.parseFloat(rawBaseline);
if (!Number.isFinite(NETWORK_POWER_BASELINE) || NETWORK_POWER_BASELINE < 0) {
  problems.push(
    `NETWORK_POWER_BASELINE must be a non-negative number (received "${rawBaseline}")`
  );
}

/* ── Referrals ── */
/**
 * Reads a commission rate expressed as a percentage and returns a fraction.
 *
 * Rates are capped at 100%: a rate above that would mint more currency than the
 * activity it rewards, which is a runaway money printer rather than a
 * configuration choice. A rate of 0 disables that commission kind.
 */
function commissionRate(name, fallback) {
  const raw = process.env[name] ?? fallback;
  const percent = Number.parseFloat(raw);

  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    problems.push(
      `${name} must be a number between 0 and 100, as a percentage (received "${raw}")`
    );
    return 0;
  }

  return percent / 100;
}

/**
 * Share of a referred player's mining payouts credited to their referrer.
 *
 * This is newly minted VLT, not a deduction: the referred player keeps their
 * full payout. It therefore raises the total amount of currency the economy
 * creates per cycle by this fraction for every referred player.
 */
const REFERRAL_MINING_RATE = commissionRate('REFERRAL_MINING_RATE', '25');

/**
 * Share of a referred player's *spending* credited to their referrer.
 *
 * Worth understanding before changing: in the game this mechanic is modelled on,
 * the equivalent commission is paid on real-money purchases, so it costs the
 * operator revenue and removes nothing from the game economy. Here, purchases
 * are the economy's main VLT sink, so paying a commission on them both mints new
 * currency *and* weakens the sink. Set to 0 to switch this off and keep the
 * commission purely income-based.
 */
const REFERRAL_PURCHASE_RATE = commissionRate('REFERRAL_PURCHASE_RATE', '15');

/* ── Report and abort ── */
if (problems.length > 0) {
  const message = [
    '',
    '════════════════════════════════════════════════════════════',
    ' WattFarm API — invalid configuration, refusing to start',
    '════════════════════════════════════════════════════════════',
    ...problems.map((p) => `  • ${p}`),
    '',
    ' See apps/api/.env.example for the full list of variables.',
    '════════════════════════════════════════════════════════════',
    '',
  ].join('\n');

  // Print rather than throw so the operator sees a readable block instead of
  // a stack trace, then exit non-zero so orchestrators treat it as a failure.
  console.error(message);
  process.exit(1);
}

export const env = Object.freeze({
  isProduction,
  DATABASE_URL,
  PORT,
  CORS_ORIGINS,
  TRUST_PROXY_HOPS,
  GOOGLE_APPLICATION_CREDENTIALS,
  FIREBASE_SERVICE_ACCOUNT_JSON,
  USE_APPLICATION_DEFAULT_CREDENTIALS,
  CHECK_REVOKED_TOKENS,
  REQUIRE_VERIFIED_EMAIL,
  NETWORK_POWER_BASELINE,
  REFERRAL_MINING_RATE,
  REFERRAL_PURCHASE_RATE,
});

export default env;
