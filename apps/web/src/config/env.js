/**
 * Frontend environment validation.
 *
 * Vite inlines `import.meta.env.*` at build time, so a missing variable does
 * not throw — it becomes `undefined` and surfaces much later as an opaque
 * Firebase error (`auth/invalid-api-key`) on the first login attempt.
 * Validating here converts that into an explicit, actionable message.
 *
 * Note: the Firebase web API key is *not* a secret. It identifies the project
 * and is designed to ship in client bundles; access control comes from
 * Firebase Auth rules and our own backend token verification.
 */

const REQUIRED_KEYS = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_APP_ID',
];

// Needed only by features we do not use yet (Storage, FCM). Absence is fine,
// so they are read but never enforced.
const OPTIONAL_KEYS = ['VITE_FIREBASE_STORAGE_BUCKET', 'VITE_FIREBASE_MESSAGING_SENDER_ID'];

function read(key) {
  const value = import.meta.env[key];
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

const missing = REQUIRED_KEYS.filter((key) => read(key) === null);

/**
 * True when configuration is incomplete. The app renders a diagnostic screen
 * instead of crashing, because a white page with a console error is the worst
 * possible experience for whoever is setting the project up.
 */
export const isConfigured = missing.length === 0;

/** Human-readable list of what is missing, rendered by the config error screen. */
export const missingKeys = missing;

export const firebaseConfig = Object.freeze({
  apiKey: read('VITE_FIREBASE_API_KEY'),
  authDomain: read('VITE_FIREBASE_AUTH_DOMAIN'),
  projectId: read('VITE_FIREBASE_PROJECT_ID'),
  storageBucket: read('VITE_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: read('VITE_FIREBASE_MESSAGING_SENDER_ID'),
  appId: read('VITE_FIREBASE_APP_ID'),
});

/**
 * API base URL, normalised without a trailing slash so callers can safely
 * concatenate paths that start with `/`.
 */
export const API_URL = (read('VITE_API_URL') || 'http://localhost:3001').replace(/\/+$/, '');

if (!isConfigured) {
  console.error(
    `[config] Missing required environment variables: ${missing.join(', ')}\n` +
      'Copy apps/web/.env.example to apps/web/.env and fill in the Firebase web app config.'
  );
}

export default { firebaseConfig, API_URL, isConfigured, missingKeys, OPTIONAL_KEYS };
