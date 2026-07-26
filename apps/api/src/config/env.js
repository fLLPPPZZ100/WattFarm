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

/* ── Security toggles ── */
// When true, every authenticated request asks Firebase whether the token was
// revoked. Correct but adds a network round trip, so it is opt-in per route
// via `verifyAuth.strict` rather than applied globally.
const CHECK_REVOKED_TOKENS = process.env.CHECK_REVOKED_TOKENS !== 'false';

// Whether spending/earning routes demand a verified email address.
// Defaults to enabled in production, disabled in development so local testing
// does not require a working mail flow.
const REQUIRE_VERIFIED_EMAIL = process.env.REQUIRE_VERIFIED_EMAIL
  ? process.env.REQUIRE_VERIFIED_EMAIL === 'true'
  : isProduction;

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
  GOOGLE_APPLICATION_CREDENTIALS,
  FIREBASE_SERVICE_ACCOUNT_JSON,
  USE_APPLICATION_DEFAULT_CREDENTIALS,
  CHECK_REVOKED_TOKENS,
  REQUIRE_VERIFIED_EMAIL,
});

export default env;
