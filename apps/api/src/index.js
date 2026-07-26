import 'dotenv/config';

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

import env from './config/env.js';
import { verifyAdminCredential } from './lib/firebaseAdmin.js';
import { globalLimiter, limitersEnabled } from './middleware/rateLimit.js';

import authRoutes from './routes/auth.js';
import assetsRoutes from './routes/assets.js';
import minigamesRoutes from './routes/minigames.js';
import miningRoutes from './routes/mining.js';
import usersRoutes from './routes/users.js';
import { startMiningPayoutCron } from './services/miningPayout.js';

const app = express();

/**
 * Hosting platforms (Railway, Fly, Render) terminate TLS at a proxy, so the
 * client IP arrives in X-Forwarded-For. Trusting exactly one hop lets the rate
 * limiter see real IPs without letting clients spoof the header themselves.
 */
app.set('trust proxy', 1);

// Do not advertise the framework.
app.disable('x-powered-by');

/* ── Security headers ── */
app.use(
  helmet({
    // The API serves JSON only; a restrictive CSP costs nothing here and
    // hardens error pages that might otherwise render HTML.
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    // Prevents the API being embedded, mitigating clickjacking on any
    // HTML that slips through.
    frameguard: { action: 'deny' },
    // Only meaningful over HTTPS; harmless locally.
    hsts: env.isProduction ? { maxAge: 15552000, includeSubDomains: true } : false,
    referrerPolicy: { policy: 'no-referrer' },
    crossOriginResourcePolicy: { policy: 'same-site' },
  })
);

/* ── CORS ── */
/**
 * Replaces the previous wide-open `cors()`. Requests carry bearer tokens rather
 * than cookies, so an open policy was not directly exploitable, but an
 * allowlist removes the API as a convenient proxy for other origins and keeps
 * browser preflights honest.
 */
const corsOptions = {
  origin(origin, callback) {
    // Same-origin and non-browser clients (curl, server-to-server, health
    // probes) send no Origin header — allow them; they are not subject to
    // the browser security model this list protects.
    if (!origin) return callback(null, true);

    if (env.CORS_ORIGINS.includes(origin)) return callback(null, true);

    // Returning an error (rather than `false`) makes the rejection explicit
    // in logs instead of silently omitting CORS headers.
    return callback(new Error(`Origin not allowed by CORS: ${origin}`));
  },
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  // No cookies are used; keeping this false avoids the credentialed-CORS rules.
  credentials: false,
  maxAge: 86400, // cache preflights for a day
};

app.use(cors(corsOptions));

/* ── Body parsing ── */
// Express already defaults to 100kb; stating it makes the bound intentional
// and reviewable. No route legitimately needs more than a few hundred bytes.
app.use(express.json({ limit: '32kb' }));

/* ── Rate limiting ── */
if (limitersEnabled) {
  app.use(globalLimiter);
}

/* ── Health check ── */
// Deliberately before auth and unauthenticated so platform probes work.
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: Math.floor(process.uptime()) });
});

/* ── Routes ── */
app.use('/api/auth', authRoutes);
app.use('/api/assets', assetsRoutes);
app.use('/api/minigames', minigamesRoutes);
app.use('/api/mining', miningRoutes);
app.use('/api/users', usersRoutes);

/* ── 404 ── */
app.use((req, res) => {
  res.status(404).json({ error: `No route for ${req.method} ${req.path}`, code: 'not-found' });
});

/* ── Central error handler ── */
/**
 * Guarantees every failure leaves as JSON. Without this, a thrown error in a
 * handler produces Express's default HTML stack trace page — noisy for the
 * frontend and a potential information leak in production.
 */
// eslint-disable-next-line no-unused-vars -- Express identifies error handlers by arity
app.use((err, req, res, _next) => {
  // CORS rejections surface here.
  if (err?.message?.startsWith('Origin not allowed by CORS')) {
    console.warn(`[cors] ${err.message}`);
    return res.status(403).json({ error: 'Origin not allowed.', code: 'cors/forbidden' });
  }

  // Malformed JSON bodies.
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Request body is not valid JSON.', code: 'bad-request' });
  }

  // Body exceeded the configured limit.
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body too large.', code: 'payload-too-large' });
  }

  console.error('[unhandled]', err);
  return res.status(500).json({
    error: 'Internal server error.',
    code: 'internal',
    // Never expose stack traces or messages in production.
    ...(env.isProduction ? {} : { detail: err?.message }),
  });
});

/* ── Boot ── */
async function start() {
  // Confirms the Firebase credential actually works before accepting traffic,
  // so misconfiguration surfaces at deploy time rather than at first login.
  await verifyAdminCredential();

  startMiningPayoutCron();

  app.listen(env.PORT, () => {
    console.log(`[api] listening on http://localhost:${env.PORT}`);
    console.log(`[api] CORS allowlist: ${env.CORS_ORIGINS.join(', ') || '(none)'}`);
    console.log(
      `[api] email verification required for economy routes: ${env.REQUIRE_VERIFIED_EMAIL}`
    );
  });
}

/**
 * A rejected promise during boot would otherwise be swallowed, leaving a
 * process that is alive but not listening.
 */
start().catch((err) => {
  console.error('[api] failed to start:', err);
  process.exit(1);
});

export default app;
