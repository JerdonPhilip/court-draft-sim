import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';

import draftRoutes from './routes/draft.js';
import simulationRoutes from './routes/simulation.js';
import playersRoutes from './routes/players.js';

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

const generalLimiter = rateLimit({
  windowMs: 60_000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', generalLimiter);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/draft', draftRoutes);
app.use('/api/simulation', simulationRoutes);
app.use('/api/players', playersRoutes);

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
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

export default app;
