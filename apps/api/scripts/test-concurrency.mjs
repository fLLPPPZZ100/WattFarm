#!/usr/bin/env node
/**
 * Concurrency probe for the economy endpoints.
 *
 * Verifies that the row lock added in lib/userLock.js actually closes the
 * race conditions it was written for. Before that change, firing N parallel
 * purchases with only enough balance for one bought N items and drove the
 * balance negative; N parallel minigame plays collected N rewards inside a
 * single cooldown.
 *
 * Read-only apart from the actions it deliberately triggers, but it DOES spend
 * the test account's currency — point it at a throwaway account.
 *
 * Usage (from the repository root):
 *
 *   node apps/api/scripts/test-concurrency.mjs --email you@example.com --password secret
 *
 * Options:
 *   --email      account to sign in as              (required)
 *   --password   its password                       (required)
 *   --api        API base URL                       (default http://localhost:3001)
 *   --key        Firebase web API key              (default: read from apps/web/.env)
 *   --parallel   number of simultaneous requests    (default 10)
 *   --type       asset type to buy                  (default solar)
 *   --skip-buy   only run the minigame probe
 *   --skip-game  only run the purchase probe
 *
 * Requires Node 18+ (uses the built-in fetch).
 */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../../..');

/* ── CLI parsing ─────────────────────────────────────────────────── */

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      args[key] = next;
      i += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

const args = parseArgs(process.argv);

/* ── Config ──────────────────────────────────────────────────────── */

/** Minimal .env reader — avoids adding a dependency just for this script. */
function readEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    // Strip surrounding quotes if present.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const webEnv = readEnvFile(join(REPO_ROOT, 'apps/web/.env'));

const API_URL = (args.api || webEnv.VITE_API_URL || 'http://localhost:3001').replace(/\/+$/, '');
const WEB_API_KEY = args.key || webEnv.VITE_FIREBASE_API_KEY;
const EMAIL = args.email;
const PASSWORD = args.password;
const PARALLEL = Number.parseInt(args.parallel || '10', 10);
const ASSET_TYPE = args.type || 'solar';

/* ── Output helpers ──────────────────────────────────────────────── */

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

const log = (msg = '') => console.log(msg);
const heading = (msg) => log(`\n${c.bold}${c.cyan}${msg}${c.reset}`);
const pass = (msg) => log(`  ${c.green}PASS${c.reset}  ${msg}`);
const fail = (msg) => log(`  ${c.red}FAIL${c.reset}  ${msg}`);
const info = (msg) => log(`  ${c.dim}${msg}${c.reset}`);
const warn = (msg) => log(`  ${c.yellow}WARN${c.reset}  ${msg}`);

let failures = 0;
function assert(condition, description, detail) {
  if (condition) {
    pass(description);
  } else {
    failures += 1;
    fail(description);
    if (detail) info(detail);
  }
}

function usage(message) {
  log(`${c.red}${message}${c.reset}\n`);
  log('Usage:');
  log('  node apps/api/scripts/test-concurrency.mjs --email <email> --password <password>');
  log('');
  log('Optional: --api <url> --key <firebaseWebApiKey> --parallel <n> --type <assetType>');
  log('          --skip-buy --skip-game');
  process.exit(1);
}

if (!EMAIL || typeof EMAIL !== 'string') usage('Missing --email');
if (!PASSWORD || typeof PASSWORD !== 'string') usage('Missing --password');
if (!WEB_API_KEY) {
  usage('Could not determine the Firebase web API key. Pass --key, or ensure apps/web/.env has VITE_FIREBASE_API_KEY.');
}
if (!Number.isInteger(PARALLEL) || PARALLEL < 2) usage('--parallel must be an integer >= 2');

/* ── Auth ────────────────────────────────────────────────────────── */

/**
 * Exchanges email/password for an ID token via the Firebase Auth REST API,
 * so the script needs no browser and no Admin credentials.
 */
async function signIn() {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${WEB_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD, returnSecureToken: true }),
    }
  );

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    const reason = body?.error?.message || `HTTP ${response.status}`;
    throw new Error(
      `Firebase sign-in failed: ${reason}\n` +
        '  Check the email/password, and that Email/Password sign-in is enabled in the Firebase console.'
    );
  }

  return { idToken: body.idToken, localId: body.localId };
}

/* ── API helpers ─────────────────────────────────────────────────── */

function authHeaders(token) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function call(token, path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    method: options.method || 'GET',
    headers: authHeaders(token),
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }

  return { status: response.status, body: json };
}

async function getState(token) {
  const { status, body } = await call(token, '/api/assets/mine');
  if (status !== 200) {
    throw new Error(`GET /api/assets/mine returned ${status}: ${JSON.stringify(body)}`);
  }

  const quantities = {};
  for (const asset of body.assets || []) quantities[asset.type] = asset.quantity;

  return { balance: body.vltBalance, quantities };
}

/* ── Probe 1: concurrent purchases ───────────────────────────────── */

async function probePurchases(token) {
  heading(`1. Concurrent purchases  (${PARALLEL} simultaneous requests)`);

  const catalogResult = await call(token, '/api/assets/catalog');
  if (catalogResult.status !== 200) {
    fail(`Could not load the catalog (HTTP ${catalogResult.status})`);
    failures += 1;
    return;
  }

  const entry = (catalogResult.body.catalog || []).find((item) => item.type === ASSET_TYPE);
  if (!entry) {
    fail(`Asset type "${ASSET_TYPE}" is not in the catalog`);
    failures += 1;
    return;
  }

  const unitPrice = entry.basePrice;
  const before = await getState(token);

  info(`unit price: ${unitPrice} VLT`);
  info(`balance before: ${before.balance} VLT`);
  info(`owned before: ${before.quantities[ASSET_TYPE] || 0}`);

  const affordable = Math.floor(before.balance / unitPrice);
  if (affordable < 1) {
    warn(`Balance too low to buy even one unit — top the account up and rerun.`);
    return;
  }
  if (affordable >= PARALLEL) {
    warn(
      `Balance affords ${affordable} units, which is >= --parallel (${PARALLEL}). ` +
        `The race would not be visible. Spend down to under ${PARALLEL} units' worth, ` +
        `or rerun with --parallel ${affordable + 1}.`
    );
  }

  // All requests are created before any is awaited, so they hit the server
  // together — this is what defeats a check performed outside the transaction.
  const responses = await Promise.all(
    Array.from({ length: PARALLEL }, () =>
      call(token, '/api/assets/buy', {
        method: 'POST',
        body: { type: ASSET_TYPE, quantity: 1 },
      })
    )
  );

  const succeeded = responses.filter((r) => r.status === 200).length;
  const insufficient = responses.filter(
    (r) => r.status === 400 && /insufficient/i.test(r.body?.error || '')
  ).length;
  const rateLimited = responses.filter((r) => r.status === 429).length;
  const other = responses.filter(
    (r) => r.status !== 200 && r.status !== 429 && !(r.status === 400 && /insufficient/i.test(r.body?.error || ''))
  );

  const after = await getState(token);

  log('');
  info(`succeeded: ${succeeded}   insufficient: ${insufficient}   rate-limited: ${rateLimited}   other: ${other.length}`);
  info(`balance after: ${after.balance} VLT`);
  info(`owned after: ${after.quantities[ASSET_TYPE] || 0}`);

  if (other.length > 0) {
    info(`unexpected responses: ${JSON.stringify(other.slice(0, 3), null, 2)}`);
  }

  log('');

  // The decisive check: an over-spend is the bug this lock was added to fix.
  assert(
    after.balance >= 0,
    'Balance never goes negative',
    `balance is ${after.balance} — the balance check is still racing`
  );

  const spent = Number((before.balance - after.balance).toFixed(4));
  const bought = (after.quantities[ASSET_TYPE] || 0) - (before.quantities[ASSET_TYPE] || 0);

  assert(
    succeeded <= affordable,
    `No more purchases succeeded than the balance allowed (${succeeded} <= ${affordable})`,
    `${succeeded} succeeded but only ${affordable} were affordable`
  );

  assert(
    bought === succeeded,
    `Items granted match successful purchases (${bought} == ${succeeded})`,
    `granted ${bought} items for ${succeeded} successful responses`
  );

  const expectedSpend = Number((succeeded * unitPrice).toFixed(4));
  assert(
    Math.abs(spent - expectedSpend) < 0.0001,
    `Amount debited matches items granted (${spent} == ${expectedSpend})`,
    `debited ${spent} but expected ${expectedSpend}`
  );
}

/* ── Probe 2: concurrent minigame plays ──────────────────────────── */

async function probeMinigame(token) {
  heading(`2. Concurrent minigame plays  (${PARALLEL} simultaneous requests)`);

  const statusResult = await call(token, '/api/minigames/status');
  if (statusResult.status !== 200) {
    fail(`Could not load minigame status (HTTP ${statusResult.status})`);
    failures += 1;
    return;
  }

  const ready = (statusResult.body.games || []).find((g) => g.cooldownRemainingMs <= 0);
  if (!ready) {
    const soonest = (statusResult.body.games || []).reduce(
      (min, g) => Math.min(min, g.cooldownRemainingMs),
      Infinity
    );
    warn(`Every game is on cooldown (soonest in ${Math.ceil(soonest / 1000)}s). Skipping.`);
    return;
  }

  info(`game: ${ready.game}   plays today: ${ready.playCountToday}`);

  const before = await getState(token);
  info(`balance before: ${before.balance} VLT`);

  const responses = await Promise.all(
    Array.from({ length: PARALLEL }, () =>
      call(token, `/api/minigames/${ready.game}/play`, { method: 'POST' })
    )
  );

  const succeeded = responses.filter((r) => r.status === 200);
  const onCooldown = responses.filter((r) => r.status === 429 && r.body?.cooldownRemainingMs !== undefined);
  const rateLimited = responses.filter((r) => r.status === 429 && r.body?.code === 'rate-limit/exceeded');

  const after = await getState(token);

  log('');
  info(`succeeded: ${succeeded.length}   on cooldown: ${onCooldown.length}   rate-limited: ${rateLimited.length}`);
  info(`balance after: ${after.balance} VLT`);
  log('');

  // Exactly one play may pass; the rest must be rejected by the cooldown.
  assert(
    succeeded.length <= 1,
    `At most one play is accepted per cooldown window (got ${succeeded.length})`,
    `${succeeded.length} plays were rewarded simultaneously — the cooldown check is still racing`
  );

  const rewarded = succeeded.reduce((sum, r) => sum + (r.body?.vltEarned || 0), 0);
  const gained = Number((after.balance - before.balance).toFixed(4));

  assert(
    Math.abs(gained - rewarded) < 0.0001,
    `Credited amount matches the rewards reported (${gained} == ${rewarded})`,
    `balance moved ${gained} but responses reported ${rewarded}`
  );
}

/* ── Probe 3: decimal precision ──────────────────────────────────── */

async function probePrecision(token) {
  heading('3. Balance is emitted as a JSON number');

  const { body } = await call(token, '/api/assets/mine');

  assert(
    typeof body.vltBalance === 'number',
    `vltBalance is a number (got ${typeof body.vltBalance})`,
    'A Decimal column serialises as a string unless converted at the boundary; ' +
      'the frontend calls .toFixed() on this value.'
  );

  const history = await call(token, '/api/mining/history');
  const firstPayout = (history.body?.payouts || [])[0];

  if (!firstPayout) {
    info('No payouts recorded yet — skipping the payout amount check.');
  } else {
    assert(
      typeof firstPayout.amount === 'number',
      `payout amount is a number (got ${typeof firstPayout.amount})`,
      'Wallet.jsx calls p.amount.toFixed(2) on this value.'
    );
  }
}

/* ── Main ────────────────────────────────────────────────────────── */

async function main() {
  log(`${c.bold}WattFarm — economy concurrency probe${c.reset}`);
  info(`API: ${API_URL}`);
  info(`account: ${EMAIL}`);

  let session;
  try {
    session = await signIn();
  } catch (err) {
    log(`\n${c.red}${err.message}${c.reset}`);
    // Return rather than process.exit(): sockets from the failed request may
    // still be closing, and forcing exit trips a libuv assertion on Windows.
    process.exitCode = 1;
    return;
  }

  info(`uid: ${session.localId}`);

  // Fail fast with a clear message if the API is not reachable.
  try {
    const health = await fetch(`${API_URL}/health`);
    if (!health.ok) throw new Error(`HTTP ${health.status}`);
  } catch (err) {
    log(`\n${c.red}Could not reach ${API_URL}/health — is the API running? (${err.message})${c.reset}`);
    process.exitCode = 1;
    return;
  }

  if (!args['skip-buy']) await probePurchases(session.idToken);
  if (!args['skip-game']) await probeMinigame(session.idToken);
  await probePrecision(session.idToken);

  heading('Result');
  if (failures === 0) {
    log(`  ${c.green}All checks passed.${c.reset}`);
  } else {
    log(`  ${c.red}${failures} check(s) failed.${c.reset}`);
  }
  log('');

  /**
   * Sets the code and lets the event loop drain instead of calling
   * `process.exit()`. Forcing exit while fetch's sockets are still closing
   * aborts libuv mid-teardown, which on Windows surfaces as
   * "Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)".
   */
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((err) => {
  log(`\n${c.red}Unexpected error: ${err.stack || err.message}${c.reset}`);
  process.exitCode = 1;
});
