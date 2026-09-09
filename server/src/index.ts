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

app.use(helmet());
app.use(cors({
  origin: frontendUrl === '*' ? 'http://localhost:5173' : frontendUrl,
  credentials: true,
}));
app.use(compression());
app.use(morgan('dev'));
app.use(express.json({ limit: '100kb' }));
// Correct client IPs when behind Render/Vercel proxies (rate limiting).
app.set('trust proxy', 1);

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
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Status-aware error handler so route `next(err with status)` isn't flattened to 500.
app.use((err: Error & { status?: number }, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Error:', err);
  const status = typeof err.status === 'number' && err.status >= 400 && err.status < 600 ? err.status : 500;
  res.status(status).json({ error: status === 500 ? 'Internal server error' : err.message });
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
