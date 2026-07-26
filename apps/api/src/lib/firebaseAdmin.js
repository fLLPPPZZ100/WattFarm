/**
 * Firebase Admin bootstrap.
 *
 * Initialisation is explicit and validated: by the time this module finishes
 * loading, either the SDK is usable or the process has exited. This removes
 * the previous failure mode where the server booted successfully but every
 * authenticated request failed at runtime.
 */

import fs from 'node:fs';
import { initializeApp, cert, applicationDefault, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import env from '../config/env.js';

function fail(reason, hint) {
  console.error(
    [
      '',
      '════════════════════════════════════════════════════════════',
      ' WattFarm API — Firebase Admin initialisation failed',
      '════════════════════════════════════════════════════════════',
      `  ${reason}`,
      hint ? `\n  Hint: ${hint}` : '',
      '════════════════════════════════════════════════════════════',
      '',
    ].join('\n')
  );
  process.exit(1);
}

function parseServiceAccount(json, source) {
  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    fail(
      `${source} does not contain valid JSON: ${err.message}`,
      'When using an inline value, make sure newlines inside private_key are escaped as \\n.'
    );
  }

  // Validate the fields the SDK actually needs, so a truncated or wrong-shaped
  // credential is reported here rather than on the first login attempt.
  const missing = ['project_id', 'client_email', 'private_key'].filter((key) => !parsed[key]);
  if (missing.length > 0) {
    fail(
      `${source} is missing required field(s): ${missing.join(', ')}`,
      'Download a fresh service account key from Firebase Console → Project Settings → Service accounts.'
    );
  }

  return parsed;
}

function resolveCredential() {
  if (env.GOOGLE_APPLICATION_CREDENTIALS) {
    const path = env.GOOGLE_APPLICATION_CREDENTIALS;
    if (!fs.existsSync(path)) {
      fail(
        `GOOGLE_APPLICATION_CREDENTIALS points to "${path}", which does not exist.`,
        'Use an absolute path, or switch to FIREBASE_SERVICE_ACCOUNT_JSON for hosted environments.'
      );
    }

    let contents;
    try {
      contents = fs.readFileSync(path, 'utf-8');
    } catch (err) {
      fail(`Could not read the service account file at "${path}": ${err.message}`);
    }

    const serviceAccount = parseServiceAccount(contents, `The file at ${path}`);
    return {
      credential: cert(serviceAccount),
      projectId: serviceAccount.project_id,
      source: `service account file (${path})`,
    };
  }

  if (env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    const serviceAccount = parseServiceAccount(
      env.FIREBASE_SERVICE_ACCOUNT_JSON,
      'FIREBASE_SERVICE_ACCOUNT_JSON'
    );
    return {
      credential: cert(serviceAccount),
      projectId: serviceAccount.project_id,
      source: 'inline service account JSON',
    };
  }

  // Only reachable when explicitly opted in — env.js rejects the empty case.
  return {
    credential: applicationDefault(),
    projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || null,
    source: 'application default credentials',
  };
}

if (getApps().length === 0) {
  const { credential, projectId, source } = resolveCredential();

  try {
    initializeApp({ credential, projectId: projectId || undefined });
  } catch (err) {
    fail(`initializeApp() threw: ${err.message}`);
  }

  console.log(
    `[firebase-admin] initialised using ${source}${projectId ? ` (project: ${projectId})` : ''}`
  );
}

export const adminAuth = getAuth();

/**
 * Confirms the credential can actually talk to the Firebase Auth backend.
 *
 * `initializeApp` is lazy — it does not validate the key. Without this probe a
 * bad-but-well-formed credential only surfaces when the first user logs in.
 * Called from index.js before the server starts listening.
 *
 * @returns {Promise<void>} resolves when reachable; exits the process otherwise
 */
export async function verifyAdminCredential() {
  try {
    // Cheapest authenticated call available. A single non-existent uid is
    // expected to reject with `auth/user-not-found`, which still proves the
    // credential was accepted.
    await adminAuth.getUser('__wattfarm_credential_probe__');
  } catch (err) {
    const code = err?.errorInfo?.code || err?.code || '';

    // The probe user genuinely does not exist — credential works.
    if (code === 'auth/user-not-found') return;

    if (code === 'auth/invalid-credential' || code === 'auth/invalid-argument') {
      fail(
        `Firebase rejected the configured credential (${code}).`,
        'Verify the service account belongs to the same project as the frontend Firebase config.'
      );
    }

    // Network / DNS / clock-skew issues, etc.
    fail(
      `Could not reach Firebase Auth to validate the credential: ${err.message}`,
      'Check outbound network access and the server clock (token verification is time sensitive).'
    );
  }
}

export default adminAuth;
