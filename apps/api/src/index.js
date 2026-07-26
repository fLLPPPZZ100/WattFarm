import express from 'express';
import cors from 'cors';
import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import fs from 'fs';
import authRoutes from './routes/auth.js';
import assetsRoutes from './routes/assets.js';
import minigamesRoutes from './routes/minigames.js';
import miningRoutes from './routes/mining.js';
import usersRoutes from './routes/users.js';
import { startMiningPayoutCron } from './services/miningPayout.js';

// Initialize Firebase Admin SDK
const saPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (saPath && fs.existsSync(saPath)) {
  const serviceAccount = JSON.parse(fs.readFileSync(saPath, 'utf-8'));
  initializeApp({
    credential: cert(serviceAccount),
  });
} else if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  initializeApp({
    credential: cert(serviceAccount),
  });
} else {
  // Falls back to application default (works in Railway with ADC)
  initializeApp({
    credential: applicationDefault(),
  });
}

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Auth routes
app.use('/api/auth', authRoutes);

// Asset routes
app.use('/api/assets', assetsRoutes);

// Minigame routes
app.use('/api/minigames', minigamesRoutes);

// Mining routes
app.use('/api/mining', miningRoutes);

// User routes
app.use('/api/users', usersRoutes);

// Start mining payout cron job (every 10 minutes)
startMiningPayoutCron();

app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});