import { Navigate, Outlet } from 'react-router-dom';

import { useAuth } from '../../context/AuthContext.jsx';
import { friendlyAuthError } from '../../lib/authErrors.js';
import PixelSky from './PixelSky.jsx';
import { PixelPanel, PixelHeading, PixelButton, PixelAlert } from '../ui/pixel.jsx';
import { missingKeys } from '../../config/env.js';

/** Shared full-screen shell for the various pre-app states. */
function GateScreen({ title, children }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <PixelSky />
      <main className="relative w-full max-w-[440px] animate-pixel-in">
        <PixelPanel scanlines>
          <div className="p-6 sm:p-7">
            <PixelHeading className="mb-4">{title}</PixelHeading>
            {children}
          </div>
        </PixelPanel>
      </main>
    </div>
  );
}

/**
 * Boot splash.
 *
 * Shown while Firebase restores the session from storage and while the backend
 * account is being provisioned. Without this the app rendered its logged-out
 * layout for a frame on every reload, then snapped to the logged-in one.
 */
export function SessionLoading({ label = 'Syncing' }) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden">
      <PixelSky />

      <div className="relative flex flex-col items-center gap-5">
        <p
          className="font-display text-2xl text-accent-watt"
          style={{ textShadow: '3px 3px 0 #060D15' }}
        >
          WATTFARM
        </p>

        {/* Chunky loading bar with a sweeping pip */}
        <div className="pixel-panel-inset relative h-4 w-52 overflow-hidden">
          <span className="absolute inset-y-0 left-0 w-6 animate-bar-sweep bg-accent-watt" />
        </div>

        <p className="font-display text-[10px] uppercase tracking-widest text-text-muted">
          {label}
          <span className="ml-1 inline-block h-3 w-2 bg-accent-watt align-middle animate-blink" />
        </p>
      </div>
    </div>
  );
}

/**
 * Rendered when the Firebase account exists but our backend row could not be
 * created. The user is authenticated yet cannot transact, so we surface it
 * instead of letting every later request fail with a confusing 404.
 */
export function ProvisionFailed() {
  const { provisionError, retryProvisioning, logout } = useAuth();

  return (
    <GateScreen title="Account unavailable">
      <PixelAlert className="mb-5">
        {provisionError ? friendlyAuthError(provisionError) : 'Could not prepare your account.'}
      </PixelAlert>

      <p className="mb-5 text-[11px] leading-relaxed text-text-muted">
        Your sign-in worked, but we could not load your game data. This is usually temporary — the
        server may still be starting up.
      </p>

      <div className="flex flex-col gap-2">
        <PixelButton className="w-full" onClick={retryProvisioning}>
          Try again
        </PixelButton>
        <PixelButton variant="ghost" className="w-full" onClick={logout}>
          Sign out
        </PixelButton>
      </div>
    </GateScreen>
  );
}

/**
 * Diagnostic screen for missing Firebase configuration.
 *
 * A misconfigured `.env` previously produced a blank page plus a console
 * error, which is the least helpful outcome for whoever is setting the project
 * up locally.
 */
export function ConfigError() {
  return (
    <GateScreen title="Configuration missing">
      <p className="mb-4 text-[11px] leading-relaxed text-text-muted">
        The Firebase environment variables were not found. Copy
        <span className="mx-1 font-mono text-accent-watt">apps/web/.env.example</span>
        to
        <span className="mx-1 font-mono text-accent-watt">apps/web/.env</span>
        and fill in the values from your project.
      </p>

      <div className="pixel-panel-inset p-3">
        <p className="mb-2 font-display text-[9px] uppercase tracking-widest text-text-muted">
          Missing
        </p>
        <ul className="space-y-1">
          {missingKeys.map((key) => (
            <li key={key} className="font-mono text-[11px] text-danger-crt">
              {key}
            </li>
          ))}
        </ul>
      </div>

      <p className="mt-4 text-[10px] leading-relaxed text-text-muted">
        After editing the file, restart the dev server — Vite only reads
        <span className="mx-1 font-mono">.env</span>
        at startup.
      </p>
    </GateScreen>
  );
}

/**
 * Route guard for authenticated areas.
 *
 * Replaces the previous pattern where `AppShell` rendered `<Outlet />`
 * unconditionally and each page re-implemented its own `if (!user)` fallback —
 * easy to forget on a new page, and inconsistent where it existed.
 */
export function RequireAuth() {
  const { initialising, isProvisioning, isAuthenticated, provisionFailed } = useAuth();

  if (initialising) return <SessionLoading label="Starting" />;
  if (isProvisioning) return <SessionLoading label="Syncing" />;
  if (provisionFailed) return <ProvisionFailed />;

  if (!isAuthenticated) {
    /**
     * No `state.from` is recorded. This used to hand the blocked location to the
     * login page so a deep link resumed after signing in, but signing in now
     * always lands on the farm — the game view is where a session is meant to
     * start, and being dropped straight into /wallet or /storage on login is
     * disorienting.
     */
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}

export default RequireAuth;
