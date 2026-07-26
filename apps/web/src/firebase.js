import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  browserLocalPersistence,
  setPersistence,
} from 'firebase/auth';
import { firebaseConfig, isConfigured } from './config/env.js';

/**
 * Firebase is only initialised when configuration is complete. `App.jsx`
 * renders a diagnostic screen in the unconfigured case, so nothing downstream
 * ever touches these exports without config present.
 */
const app = isConfigured ? initializeApp(firebaseConfig) : null;

export const auth = app ? getAuth(app) : null;

/**
 * Persist sessions in localStorage so a reload or new tab keeps the user
 * logged in. This is Firebase's default for web, but stating it explicitly
 * documents the intent and guards against the default changing.
 *
 * The promise is exported so the auth bootstrap can await it: reading
 * `auth.currentUser` before persistence resolves can briefly report null.
 */
export const persistenceReady = auth
  ? setPersistence(auth, browserLocalPersistence).catch((err) => {
      // Private browsing modes can block storage. Auth still works for the
      // lifetime of the tab, so this is a degradation rather than a failure.
      console.warn('[firebase] could not enable local persistence:', err?.code || err?.message);
    })
  : Promise.resolve();

export const googleProvider = new GoogleAuthProvider();

// Always show the account chooser. Without this, users with several Google
// accounts get silently signed into whichever one the browser picked last,
// with no way to switch.
googleProvider.setCustomParameters({ prompt: 'select_account' });

export default app;
