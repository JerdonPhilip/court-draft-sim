import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import draftRoutes from './routes/draft.js';
import simulationRoutes from './routes/simulation.js';
import playersRoutes from './routes/players.js';
import { SERVER_VERSION } from './version.js';

dotenv.config();

export const app = express();

function parsePort(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  if (raw === undefined || raw === '') return fallback;
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    console.warn(`Invalid PORT "${raw}", falling back to ${fallback}`);
    return fallback;
  }
  return n;
}

const PORT = parsePort(process.env.PORT, 3001);

const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
if (frontendUrl === '*') {
  console.warn('FRONTEND_URL=* with credentials:true is invalid; falling back to http://localhost:5173');
}

// Support a comma-separated allowlist: FRONTEND_URL="https://a,https://b".
const allowedOrigins = frontendUrl === '*'
  ? ['http://localhost:5173']
  : frontendUrl.split(',').map(s => s.trim()).filter(Boolean);

app.use(helmet());
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // same-origin / curl
    if (allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error('CORS blocked'));
  },
  credentials: true,
}));
app.use(compression());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '100kb' }));
// Only trust one proxy hop when explicitly behind a proxy (Render/Vercel).
// Unconditional trust lets clients spoof X-Forwarded-For and bypass limits.
if (process.env.TRUST_PROXY === '1' || process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

const generalLimiter = rateLimit({
  windowMs: 60_000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', generalLimiter);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: SERVER_VERSION, timestamp: new Date().toISOString() });
});

app.use('/api/draft', draftRoutes);
app.use('/api/simulation', simulationRoutes);
app.use('/api/players', playersRoutes);

// Single-command local/offline play: serve the built client (client/dist)
// when present. API routes above take precedence; everything else falls
// through to the SPA. Skipped when dist hasn't been built (API-only mode).
const serverDir = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(serverDir, '..', '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist, { maxAge: '1d', index: false }));
  // Express 4 wildcard; keep '/api/' guard so API never serves index.html.
  // On Express 5 this must become '/*splat'.
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Status-aware error handler so route `next(err with status)` isn't flattened to 500.
// Never echo raw parser messages for 4xx (may leak internals); sanitize newlines.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error & { status?: number }, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const safe = String(err?.message ?? '').replace(/[\r\n]+/g, ' ').slice(0, 300);
  console.error('Error:', { path: req.path, status: (err as { status?: number }).status, message: safe });
  const status = typeof err.status === 'number' && err.status >= 400 && err.status < 600 ? err.status : 500;
  res.status(status).json({ error: status === 500 ? 'Internal server error' : safe || 'Bad request' });
});

const isMain = process.argv[1]?.endsWith('index.js') || process.argv[1]?.endsWith('index.ts');
if (isMain) {
  app.listen(PORT, () => {
    console.log(`Server v${SERVER_VERSION} running on http://localhost:${PORT}`);
    if (fs.existsSync(clientDist)) {
      console.log(`Serving client from ${clientDist} (full game at http://localhost:${PORT}/)`);
    } else {
      console.log('Client dist not found — API-only mode. Run `npm run build:client` from the repo root for single-port play.');
    }
  });
}

export default app;
